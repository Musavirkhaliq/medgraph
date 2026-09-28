"""
Intake node — extract structured patient data from free-text input.

This is the first node in the graph.  It receives the raw ``patient_input``
string and produces a structured breakdown of demographics, symptoms, and
medical history.
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from medgraph.llm import get_llm
from medgraph.nodes._utils import parse_llm_json
from medgraph.prompts import INTAKE_SYSTEM
from medgraph.state import MedicalState

logger = logging.getLogger(__name__)


# ── Output schema ─────────────────────────────────────────────────────────────

class _SymptomItem(BaseModel):
    description: str = ""
    severity: str | None = "unknown"
    onset: str | None = ""
    duration: str | None = ""
    location: str | None = None
    character: str | None = None
    aggravating: str | None = None
    relieving: str | None = None


class _HistoryItem(BaseModel):
    type: str = "condition"
    description: str = ""
    status: str | None = None
    since: str | None = None


class _Demographics(BaseModel):
    age: int | None = None
    gender: str | None = None
    weight_kg: float | None = None
    height_cm: float | None = None
    occupation: str | None = None
    ethnicity: str | None = None


class IntakeResult(BaseModel):
    demographics: _Demographics = Field(default_factory=_Demographics)
    symptoms: list[_SymptomItem] = Field(default_factory=list)
    history: list[_HistoryItem] = Field(default_factory=list)


# ── Node function ─────────────────────────────────────────────────────────────

def intake_node(state: MedicalState) -> dict:
    """
    Extract structured patient information from the free-text ``patient_input``.

    Args:
        state: Current graph state.  Must contain ``patient_input``.

    Returns:
        Partial state update with ``demographics``, ``symptoms``, ``history``.
    """
    patient_input = state.get("patient_input", "")
    logger.info("[intake] Processing patient input (%d chars)", len(patient_input))

    llm = get_llm("intake")
    messages = [
        SystemMessage(content=INTAKE_SYSTEM),
        HumanMessage(
            content=(
                "Extract structured patient information from the following description.\n\n"
                f"{patient_input}"
            )
        ),
    ]

    try:
        response = llm.invoke(messages)
        result = parse_llm_json(response.content, IntakeResult, "intake")

        logger.info(
            "[intake] Extracted %d symptoms, %d history items",
            len(result.symptoms),
            len(result.history),
        )

        return {
            "demographics": result.demographics.model_dump(exclude_none=True),
            "symptoms": [s.model_dump(exclude_none=True) for s in result.symptoms],
            "history": [h.model_dump(exclude_none=True) for h in result.history],
        }

    except Exception as exc:
        logger.error("[intake] Node failed: %s", exc, exc_info=True)
        return {
            "demographics": {},
            "symptoms": [],
            "history": [],
            "node_errors": [f"intake: {exc}"],
        }
