"""
Treatment node — create a comprehensive, evidence-based treatment plan.

Reads the differential diagnosis and patient context to produce medications,
procedures, lifestyle modifications, follow-up, and monitoring instructions.
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from medgraph.llm import get_llm
from medgraph.nodes._utils import build_context_prompt, parse_llm_json
from medgraph.prompts import TREATMENT_SYSTEM
from medgraph.state import MedicalState

logger = logging.getLogger(__name__)


# ── Output schema ─────────────────────────────────────────────────────────────

class _MedicationEntry(BaseModel):
    name: str = ""
    dose: str = ""
    route: str = ""
    frequency: str = ""
    duration: str = ""
    indication: str = ""
    contraindications: list[str] = Field(default_factory=list)


class _ProcedureEntry(BaseModel):
    procedure: str = ""
    indication: str = ""
    urgency: str = "routine"


class TreatmentResult(BaseModel):
    medications: list[_MedicationEntry] = Field(default_factory=list)
    procedures: list[_ProcedureEntry] = Field(default_factory=list)
    lifestyle_modifications: list[str] = Field(default_factory=list)
    follow_up: str = ""
    monitoring: list[str] = Field(default_factory=list)
    patient_education: list[str] = Field(default_factory=list)


# ── Node function ─────────────────────────────────────────────────────────────

def treatment_node(state: MedicalState) -> dict:
    """
    Create a comprehensive treatment plan for the primary diagnosis.

    Args:
        state: Current graph state.

    Returns:
        Partial state update with ``medications``, ``procedures``,
        ``lifestyle_modifications``, ``follow_up``, and ``monitoring``.
    """
    retry_count = state.get("treatment_retry_count", 0)
    logger.info("[treatment] Generating treatment plan (attempt %d)", retry_count + 1)

    context = build_context_prompt(state)
    extra = ""
    if retry_count > 0:
        warnings = state.get("validation_warnings", [])
        warning_text = "\n".join(f"- [{w['severity']}] {w['message']}" for w in warnings)
        extra = (
            f"\n\n=== PREVIOUS VALIDATION WARNINGS (must address) ===\n"
            f"{warning_text}\n"
            "Please revise the treatment plan to resolve all safety warnings above."
        )

    llm = get_llm("treatment")
    messages = [
        SystemMessage(content=TREATMENT_SYSTEM),
        HumanMessage(
            content=(
                "Create a comprehensive, evidence-based treatment plan "
                "for the primary diagnosis.\n\n"
                f"{context}{extra}"
            )
        ),
    ]

    try:
        response = llm.invoke(messages)
        result = parse_llm_json(response.content, TreatmentResult, "treatment")

        logger.info(
            "[treatment] %d medications, %d procedures",
            len(result.medications),
            len(result.procedures),
        )

        meds = [m.model_dump(exclude_none=True) for m in result.medications]
        procs = [p.model_dump() for p in result.procedures]
        lifestyles = result.lifestyle_modifications
        follow = result.follow_up
        monit = result.monitoring

        # Clinical Fallback if LLM output was empty
        dx = (state.get("primary_diagnosis") or "").lower()
        if not meds:
            if "asthma" in dx:
                meds = [
                    {"name": "Albuterol HFA", "dose": "90 mcg/actuation", "route": "Inhalation", "frequency": "1-2 puffs q4-6h PRN", "indication": "Bronchospasm relief"},
                    {"name": "Fluticasone propionate", "dose": "110 mcg", "route": "Inhalation", "frequency": "2 puffs twice daily", "indication": "Maintenance anti-inflammatory control"}
                ]
            elif "copd" in dx:
                meds = [
                    {"name": "Tiotropium bromide", "dose": "18 mcg", "route": "Inhalation", "frequency": "Once daily", "indication": "Long-acting bronchodilation"},
                    {"name": "Albuterol HFA", "dose": "90 mcg", "route": "Inhalation", "frequency": "PRN shortness of breath", "indication": "Rescue relief"}
                ]
            elif "pneumonia" in dx:
                meds = [
                    {"name": "Amoxicillin", "dose": "500 mg", "route": "Oral", "frequency": "TID for 7 days", "indication": "Community-acquired pneumonia empiric therapy"}
                ]
            else:
                meds = [
                    {"name": "Symptomatic supportive therapy", "dose": "As directed", "route": "Oral", "frequency": "PRN", "indication": "Symptom management"}
                ]

        if not lifestyles:
            lifestyles = [
                "Maintain adequate hydration and balanced nutrition",
                "Avoid known respiratory irritants, environmental allergens, and tobacco smoke",
                "Monitor for worsening symptoms including increased shortness of breath or high fever"
            ]

        if not follow:
            follow = "Follow up with primary care physician in 7–14 days or sooner if symptoms progress."

        return {
            "medications": meds,
            "procedures": procs,
            "lifestyle_modifications": lifestyles,
            "follow_up": follow,
            "monitoring": monit or ["Pulse oximetry", "Symptom tracking log"],
        }

    except Exception as exc:
        logger.error("[treatment] Node failed: %s", exc, exc_info=True)
        return {
            "medications": [
                {"name": "Symptomatic supportive care", "dose": "Standard dose", "route": "Oral", "frequency": "PRN", "indication": "Symptom management"}
            ],
            "procedures": [],
            "lifestyle_modifications": ["Rest and fluids", "Seek medical evaluation if symptoms worsen"],
            "follow_up": "Follow up with primary care clinician within 1 week.",
            "monitoring": ["Symptom progression"],
            "node_errors": [f"treatment: {exc}"],
        }
