"""
LangGraph graph builder for the MedGraph clinical reasoning pipeline.

This module assembles the full StateGraph from all node functions and
conditional edges, then compiles it with a MemorySaver checkpointer for
per-session isolation.

Graph layout
------------

    START
      │
      ▼
    [intake]
      │
      ▼
    [memory_recall]  (loads patient profile/history + cross-patient agent knowledge)
      │
      ▼
    [triage] ──emergency──▶ [emergency] ──▶ END
      │
      │ continue
      ▼
    [questioner] ◀─────────────────────────┐
      │                                    │
      ├── ask (human input) ───────────────┘
      │
      └── done
          ▼
        [case_builder]
          │
          ▼
        [investigator]
          │
          ├── interpret ──▶ [interpreter] ──┐
          │                                 │
          └── diagnose ────────────────────▶┘
                                            │
                                            ▼
                                       [diagnostician]
                                            │
                                            ▼
                                       [treatment]
                                            │
                                            ▼
                                       [validator]
                                            │
                                       ├── safe ──▶ [memory_writer] ──▶ END
                                       │
                                       └── retry ──▶ [treatment]
"""

from __future__ import annotations

import logging
from functools import lru_cache

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from medgraph.nodes.case_builder import case_builder_node
from medgraph.nodes.diagnostician import diagnostician_node
from medgraph.nodes.emergency import emergency_node
from medgraph.nodes.intake import intake_node
from medgraph.nodes.interpreter import interpreter_node
from medgraph.nodes.investigator import investigator_node, investigator_router
from medgraph.nodes.memory_recall import memory_recall_node
from medgraph.nodes.memory_writer import appointment_memory_node
from medgraph.nodes.questioner import questioner_node, questioner_router
from medgraph.nodes.treatment import treatment_node
from medgraph.nodes.triage import triage_node, triage_router
from medgraph.nodes.validator import validator_node, validator_router
from medgraph.state import MedicalState

logger = logging.getLogger(__name__)


def _increment_retry(state: MedicalState) -> dict:
    """Helper node that increments the treatment retry counter."""
    return {"treatment_retry_count": state.get("treatment_retry_count", 0) + 1}


def build_graph() -> StateGraph:
    """
    Construct the MedGraph ``StateGraph`` without compiling.

    Returns:
        An uncompiled ``StateGraph`` ready to be compiled with a checkpointer.
    """
    builder = StateGraph(MedicalState)

    # ── Register nodes ─────────────────────────────────────────────────────────
    builder.add_node("intake", intake_node)
    builder.add_node("memory_recall", memory_recall_node)
    builder.add_node("triage", triage_node)
    builder.add_node("emergency", emergency_node)
    builder.add_node("questioner", questioner_node)
    builder.add_node("case_builder", case_builder_node)
    builder.add_node("investigator", investigator_node)
    builder.add_node("interpreter", interpreter_node)
    builder.add_node("diagnostician", diagnostician_node)
    builder.add_node("treatment", treatment_node)
    builder.add_node("increment_retry", _increment_retry)
    builder.add_node("validator", validator_node)
    builder.add_node("memory_writer", appointment_memory_node)

    # ── Entry edge ────────────────────────────────────────────────────────────
    builder.add_edge(START, "intake")
    builder.add_edge("intake", "memory_recall")
    builder.add_edge("memory_recall", "triage")

    # ── Triage router ─────────────────────────────────────────────────────────
    builder.add_conditional_edges(
        "triage",
        triage_router,
        {"emergency": "emergency", "continue": "questioner"},
    )
    builder.add_edge("emergency", END)

    # ── Q&A loop ──────────────────────────────────────────────────────────────
    # The "ask" branch routes to a dummy ask_human node, which we interrupt
    # before executing. This ensures the questioner node actually generates
    # the question before the graph pauses.
    
    def ask_human(state: MedicalState) -> dict:
        return {}
        
    builder.add_node("ask_human", ask_human)
    builder.add_edge("ask_human", "questioner")
    
    builder.add_conditional_edges(
        "questioner",
        questioner_router,
        {"ask": "ask_human", "done": "case_builder"},
    )

    # ── Main pipeline ─────────────────────────────────────────────────────────
    builder.add_edge("case_builder", "investigator")
    
    def ask_for_test_results(state: MedicalState) -> dict:
        return {}
    builder.add_node("ask_for_test_results", ask_for_test_results)
    
    builder.add_conditional_edges(
        "investigator",
        investigator_router,
        {
            "ask_for_test_results": "ask_for_test_results",
            "interpret": "interpreter",
            "diagnose": "diagnostician"
        },
    )

    # Conditionally run interpreter if images are available
    builder.add_conditional_edges(
        "ask_for_test_results",
        investigator_router,
        {
            "ask_for_test_results": "ask_for_test_results", # Should not happen since endpoint sets it to False
            "interpret": "interpreter",
            "diagnose": "diagnostician"
        },
    )
    builder.add_edge("interpreter", "diagnostician")

    builder.add_edge("diagnostician", "treatment")
    builder.add_edge("treatment", "validator")

    # ── Validation retry loop ─────────────────────────────────────────────────
    builder.add_conditional_edges(
        "validator",
        validator_router,
        {"safe": "memory_writer", "retry": "increment_retry"},
    )
    builder.add_edge("increment_retry", "treatment")
    builder.add_edge("memory_writer", END)

    return builder


@lru_cache(maxsize=1)
def get_compiled_graph(use_sqlite: bool = False):
    """
    Build and compile the graph with a checkpointer.

    Results are cached so the compiled graph is only built once per process.

    Args:
        use_sqlite: If True, use SQLite-backed checkpointer for persistence
                    across process restarts.  Default is in-memory.

    Returns:
        A compiled LangGraph ``CompiledStateGraph``.
    """
    from medgraph.config import get_settings

    settings = get_settings()
    builder = build_graph()

    if use_sqlite and settings.checkpoint_db_path:
        try:
            from langgraph.checkpoint.sqlite import SqliteSaver
            checkpointer = SqliteSaver.from_conn_string(settings.checkpoint_db_path)
            logger.info("Using SQLite checkpointer at: %s", settings.checkpoint_db_path)
        except ImportError:
            logger.warning("langgraph-checkpoint-sqlite not installed — falling back to MemorySaver")
            checkpointer = MemorySaver()
    else:
        checkpointer = MemorySaver()
        logger.info("Using in-memory checkpointer")

    graph = builder.compile(
        checkpointer=checkpointer,
        interrupt_before=["ask_human", "ask_for_test_results"],
    )
    logger.info("MedGraph compiled successfully")
    return graph
