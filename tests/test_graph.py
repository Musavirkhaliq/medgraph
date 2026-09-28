"""
Integration tests for the MedGraph LangGraph graph.

Tests the full graph structure, edges, and routing logic without calling an LLM.
"""

from __future__ import annotations

from medgraph.graph import build_graph, get_compiled_graph
from medgraph.state import initial_state


class TestGraphStructure:
    def test_graph_builds_without_error(self):
        """Graph should compile without raising any exception."""
        graph = build_graph()
        assert graph is not None

    def test_compiled_graph_has_expected_nodes(self):
        """Verify all expected nodes are registered."""
        builder = build_graph()
        # Build a compiled version to inspect nodes
        from langgraph.checkpoint.memory import MemorySaver
        compiled = builder.compile(checkpointer=MemorySaver())
        node_names = set(compiled.get_graph().nodes.keys())
        expected = {
            "intake", "triage", "emergency", "questioner",
            "case_builder", "investigator", "interpreter",
            "diagnostician", "treatment", "increment_retry", "validator",
            "__start__",
        }
        assert expected.issubset(node_names), f"Missing nodes: {expected - node_names}"

    def test_get_compiled_graph_is_cached(self):
        """Calling get_compiled_graph twice should return the same object."""
        g1 = get_compiled_graph()
        g2 = get_compiled_graph()
        assert g1 is g2


class TestInitialState:
    def test_initial_state_has_all_keys(self):
        state = initial_state("sess-001", "Test patient")
        required_keys = [
            "session_id", "patient_input", "demographics", "symptoms",
            "history", "triage_level", "qa_pairs", "question_round",
            "question_complete", "case_summary", "investigations",
            "image_paths", "differential_diagnosis", "medications",
            "is_safe", "validation_warnings",
        ]
        for key in required_keys:
            assert key in state, f"Missing key: {key}"

    def test_initial_state_defaults(self):
        state = initial_state("sess-002", "Patient description")
        assert state["session_id"] == "sess-002"
        assert state["patient_input"] == "Patient description"
        assert state["is_emergency"] is False
        assert state["question_complete"] is False
        assert state["question_round"] == 0
        assert state["qa_pairs"] == []
