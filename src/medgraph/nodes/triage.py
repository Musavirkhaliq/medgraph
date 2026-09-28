"""
Triage node — assess urgency and identify suspected medical domains.

Runs immediately after intake.  If the result is ``emergency``, the graph
router short-circuits to the emergency node, bypassing the full workflow.
"""

from __future__ import annotations

import logging
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from medgraph.llm import get_llm
from medgraph.nodes._utils import build_context_prompt, parse_llm_json
from medgraph.prompts import TRIAGE_SYSTEM
from medgraph.safety import detect_emergency
from medgraph.state import MedicalState

logger = logging.getLogger(__name__)


# ── Output schema ─────────────────────────────────────────────────────────────

class TriageResult(BaseModel):
    triage_level: Literal["emergency", "urgent", "routine"] = "routine"
    suspected_domains: list[str] = Field(default_factory=list)
    reasoning: str = ""
    red_flags: list[str] = Field(default_factory=list)
    time_to_care: str = "within_days"


# ── Node function ─────────────────────────────────────────────────────────────

def triage_node(state: MedicalState) -> dict:
    """
    Assess patient urgency and identify relevant medical specialties.

    Performs a fast rule-based emergency scan first, then calls the LLM for
    nuanced triage. This ensures critical patients are never missed even if
    the LLM underestimates urgency.

    Args:
        state: Current graph state.

    Returns:
        Partial state update with ``triage_level``, ``suspected_domains``,
        ``triage_reasoning``, ``is_emergency``, and ``emergency_info``.
    """
    patient_input = state.get("patient_input", "")
    logger.info("[triage] Running triage assessment")

    # ── Step 1: Fast rule-based emergency check ───────────────────────────────
    safety_check = detect_emergency(patient_input)
    if safety_check["level"] == "critical":
        logger.warning("[triage] Critical emergency detected by safety check")
        return {
            "triage_level": "emergency",
            "suspected_domains": ["emergency_medicine"],
            "triage_reasoning": f"Critical emergency: {safety_check['trigger']}",
            "is_emergency": True,
            "emergency_info": safety_check,
        }

    # ── Step 2: LLM-based triage ──────────────────────────────────────────────
    context = build_context_prompt(state)
    llm = get_llm("triage")
    messages = [
        SystemMessage(content=TRIAGE_SYSTEM),
        HumanMessage(
            content=(
                "Assess the urgency and identify suspected medical domains "
                "based on the following patient information.\n\n"
                f"{context}"
            )
        ),
    ]

    try:
        response = llm.invoke(messages)
        result = parse_llm_json(response.content, TriageResult, "triage")

        # Escalate if safety check said urgent but LLM said routine
        if safety_check["level"] == "urgent" and result.triage_level == "routine":
            result.triage_level = "urgent"
            logger.info("[triage] Escalated to urgent based on safety check")

        is_emergency = result.triage_level == "emergency"
        logger.info("[triage] Level=%s, Domains=%s", result.triage_level, result.suspected_domains)

        return {
            "triage_level": result.triage_level,
            "suspected_domains": result.suspected_domains,
            "triage_reasoning": result.reasoning,
            "is_emergency": is_emergency,
            "emergency_info": safety_check if is_emergency else {},
        }

    except Exception as exc:
        logger.error("[triage] Node failed: %s", exc, exc_info=True)
        return {
            "triage_level": "urgent",  # conservative fallback
            "suspected_domains": [],
            "triage_reasoning": "Triage failed — defaulting to urgent for safety.",
            "is_emergency": False,
            "node_errors": [f"triage: {exc}"],
        }


# ── Router function ───────────────────────────────────────────────────────────

def triage_router(state: MedicalState) -> str:
    """
    Conditional edge after triage_node.

    Returns:
        ``"emergency"`` → route to emergency node then END.
        ``"continue"``  → proceed to questioner node.
    """
    if state.get("is_emergency"):
        return "emergency"
    return "continue"
