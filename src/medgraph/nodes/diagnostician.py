"""
Diagnostician node — generate differential diagnosis with probability estimates.

Considers all available information: intake, triage, Q&A, case summary,
investigation results, and image analysis.
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from medgraph.llm import get_llm
from medgraph.nodes._utils import build_context_prompt, parse_llm_json
from medgraph.prompts import DIAGNOSTICIAN_SYSTEM
from medgraph.state import MedicalState

logger = logging.getLogger(__name__)


# ── Output schema ─────────────────────────────────────────────────────────────

class _DiagnosisEntry(BaseModel):
    condition: str = ""
    probability: float = 0.0
    icd_code: str | None = None
    evidence: list[str] = Field(default_factory=list)
    rule_out_tests: list[str] = Field(default_factory=list)


class DiagnosisResult(BaseModel):
    differential_diagnosis: list[_DiagnosisEntry] = Field(default_factory=list)
    primary_diagnosis: str | None = None
    diagnosis_confidence: float = 0.0
    reasoning: str = ""
    citations: list[str] = Field(default_factory=list)


# ── Node function ─────────────────────────────────────────────────────────────

def diagnostician_node(state: MedicalState) -> dict:
    """
    Generate a ranked differential diagnosis.

    Args:
        state: Current graph state.

    Returns:
        Partial state update with ``differential_diagnosis``,
        ``primary_diagnosis``, and ``diagnosis_confidence``.
    """
    logger.info("[diagnostician] Generating differential diagnosis")

    context = build_context_prompt(state)
    llm = get_llm("diagnosis")
    messages = [
        SystemMessage(content=DIAGNOSTICIAN_SYSTEM),
        HumanMessage(
            content=(
                "Generate a ranked differential diagnosis based on all available "
                "patient information.\n\n"
                f"{context}"
            )
        ),
    ]

    try:
        response = llm.invoke(messages)
        result = parse_llm_json(response.content, DiagnosisResult, "diagnostician")

        # Sort by probability descending
        result.differential_diagnosis.sort(key=lambda x: x.probability, reverse=True)

        logger.info(
            "[diagnostician] Primary: %s (confidence=%.2f), %d differentials",
            result.primary_diagnosis,
            result.diagnosis_confidence,
            len(result.differential_diagnosis),
        )

        return {
            "differential_diagnosis": [
                d.model_dump(exclude_none=True) for d in result.differential_diagnosis
            ],
            "primary_diagnosis": result.primary_diagnosis,
            "diagnosis_confidence": result.diagnosis_confidence,
            "diagnosis_citations": result.citations,
        }

    except Exception as exc:
        logger.error("[diagnostician] Node failed: %s", exc, exc_info=True)
        return {
            "differential_diagnosis": [],
            "primary_diagnosis": None,
            "diagnosis_confidence": 0.0,
            "diagnosis_citations": [],
            "node_errors": [f"diagnostician: {exc}"],
        }
