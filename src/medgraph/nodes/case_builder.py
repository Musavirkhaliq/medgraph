"""
Case builder node — synthesise all collected information into a clinical case.

Runs after the Q&A loop is complete.  Reads all intake, triage, and Q&A data
and produces a structured clinical summary ready for diagnostic reasoning.
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from medgraph.llm import get_llm
from medgraph.nodes._utils import build_context_prompt, parse_llm_json
from medgraph.prompts import CASE_BUILDER_SYSTEM
from medgraph.state import MedicalState

logger = logging.getLogger(__name__)


# ── Output schema ─────────────────────────────────────────────────────────────

class CaseResult(BaseModel):
    case_summary: str = ""
    key_findings: list[str] = Field(default_factory=list)
    clinical_correlations: str = ""
    risk_factors: list[str] = Field(default_factory=list)
    protective_factors: list[str] = Field(default_factory=list)


# ── Node function ─────────────────────────────────────────────────────────────

def case_builder_node(state: MedicalState) -> dict:
    """
    Synthesise all patient information into a structured clinical case.

    Args:
        state: Current graph state.

    Returns:
        Partial state update with ``case_summary``, ``key_findings``,
        and ``clinical_correlations``.
    """
    logger.info("[case_builder] Building clinical case")

    context = build_context_prompt(state)
    llm = get_llm("case_builder")
    messages = [
        SystemMessage(content=CASE_BUILDER_SYSTEM),
        HumanMessage(
            content=(
                "Synthesise all patient information into a comprehensive clinical case.\n\n"
                f"{context}"
            )
        ),
    ]

    try:
        response = llm.invoke(messages)
        result = parse_llm_json(response.content, CaseResult, "case_builder")

        logger.info(
            "[case_builder] Built case with %d key findings",
            len(result.key_findings),
        )

        return {
            "case_summary": result.case_summary,
            "key_findings": result.key_findings,
            "clinical_correlations": result.clinical_correlations,
        }

    except Exception as exc:
        logger.error("[case_builder] Node failed: %s", exc, exc_info=True)
        return {
            "case_summary": "Case building failed — using raw patient information.",
            "key_findings": [],
            "clinical_correlations": "",
            "node_errors": [f"case_builder: {exc}"],
        }
