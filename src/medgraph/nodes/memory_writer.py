"""
Appointment Memory Writer Node — runs after validator_node to persist session memories.

Generates two LLM summaries from the completed MedicalState:
  1. LOCAL memory  — patient-scoped full clinical summary
     → Stored to Supabase: local_patient_memory table
  2. GLOBAL memory — de-identified cross-patient knowledge
     → Stored to Supabase: global_agent_memory table

Also writes to appointment_summaries table linking both records to the session.
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from medgraph.llm import get_llm
from medgraph.nodes._utils import build_context_prompt, parse_llm_json
from medgraph.prompts import GLOBAL_MEMORY_SUMMARY_SYSTEM, LOCAL_MEMORY_SUMMARY_SYSTEM
from medgraph.state import MedicalState

logger = logging.getLogger(__name__)


# ── Output schemas ─────────────────────────────────────────────────────────────

class _LocalMemoryResult(BaseModel):
    title: str = "Appointment Summary"
    summary: str = ""
    memory_category: str = "episodic_visit"
    key_icd_codes: list[str] = Field(default_factory=list)
    primary_diagnosis: str = ""
    safety_flags: list[str] = Field(default_factory=list)


class _GlobalMemoryResult(BaseModel):
    topic: str = "Clinical Pattern"
    summary: str = ""
    knowledge_type: str = "diagnostic_pattern"
    confidence_score: float = 0.75
    pattern_graph: dict = Field(default_factory=dict)


# ── Node function ──────────────────────────────────────────────────────────────

async def appointment_memory_node(state: MedicalState) -> dict:
    """
    Generate and persist local + global memory summaries for a completed appointment.

    Called automatically after validator_node in the LangGraph pipeline.

    Args:
        state: Completed MedicalState after successful validation.

    Returns:
        Partial state update with local_memory_id and global_memory_id.
    """
    from medgraph.db.memory_manager import get_memory_manager

    session_id = state.get("session_id", "")
    patient_id = state.get("patient_id", "")

    logger.info("[memory_writer] Generating appointment memory for session %s", session_id)

    context = build_context_prompt(state)
    mem_mgr = get_memory_manager()

    try:
        llm = get_llm("general")
    except Exception as exc:
        logger.warning("[memory_writer] LLM unavailable, using structured state fallback for all steps: %s", exc)
        llm = None

    local_memory_id: str | None = None
    global_memory_id: str | None = None
    local_summary = ""
    global_summary = ""

    # ── Step 1: Generate LOCAL patient memory summary ─────────────────────────
    try:
        if llm is None:
            raise RuntimeError("No LLM provider available")
        local_messages = [
            SystemMessage(content=LOCAL_MEMORY_SUMMARY_SYSTEM),
            HumanMessage(
                content=(
                    "Generate a concise LOCAL patient memory summary for this completed "
                    "consultation. Include all clinical details.\n\n"
                    f"{context}"
                )
            ),
        ]
        local_response = llm.invoke(local_messages)
        local_result = parse_llm_json(
            local_response.content, _LocalMemoryResult, "local_memory_summary"
        )
        local_summary = local_result.summary

        valid_cats = {"episodic_visit", "med_intolerance", "chronic_trend", "lab_baseline", "general"}
        cat = local_result.memory_category if local_result.memory_category in valid_cats else "episodic_visit"

        local_mem = await mem_mgr.store_local_memory(
            patient_id=patient_id or "unknown",
            title=local_result.title,
            content=local_result.summary,
            memory_category=cat,
            session_id=session_id,
            note_type="auto",
            metadata={
                "icd_codes": local_result.key_icd_codes,
                "primary_diagnosis": local_result.primary_diagnosis,
                "safety_flags": local_result.safety_flags,
                "source": "appointment_memory_node",
            },
        )
        local_memory_id = local_mem.id
        logger.info("[memory_writer] ✅ Local memory stored: id=%s", local_memory_id)

    except Exception as exc:
        logger.warning("[memory_writer] LLM local memory generation failed, using structured state fallback: %s", exc)
        dx = state.get("primary_diagnosis") or "Clinical Consultation"
        icds = [d.get("icd_code", "") for d in state.get("differential_diagnosis", []) if isinstance(d, dict) and d.get("icd_code")]
        warnings = [w.get("message", "") if isinstance(w, dict) else str(w) for w in state.get("validation_warnings", [])]
        meds_str = ", ".join(m.get("name", "") for m in state.get("medications", []) if isinstance(m, dict))
        summary_text = (
            state.get("case_summary")
            or f"Completed assessment for {dx}. Prescriptions: {meds_str or 'standard management'}."
        )
        try:
            local_mem = await mem_mgr.store_local_memory(
                patient_id=patient_id or "pat-001",
                title=f"Consultation: {dx}",
                content=summary_text,
                memory_category="episodic_visit",
                session_id=session_id,
                note_type="auto",
                metadata={
                    "icd_codes": icds,
                    "primary_diagnosis": dx,
                    "safety_flags": warnings,
                    "source": "appointment_memory_node_fallback",
                },
            )
            local_memory_id = local_mem.id
            local_summary = summary_text
            logger.info("[memory_writer] ✅ Fallback local memory stored: id=%s", local_memory_id)
        except Exception as store_err:
            logger.error("[memory_writer] Fallback local memory storage failed: %s", store_err)

    # ── Step 2: Generate GLOBAL de-identified memory summary ──────────────────
    try:
        if llm is None:
            raise RuntimeError("No LLM provider available")
        global_messages = [
            SystemMessage(content=GLOBAL_MEMORY_SUMMARY_SYSTEM),
            HumanMessage(
                content=(
                    "Extract de-identified cross-patient clinical intelligence from "
                    "this completed consultation. Include NO patient identifiers.\n\n"
                    f"{context}"
                )
            ),
        ]
        global_response = llm.invoke(global_messages)
        global_result = parse_llm_json(
            global_response.content, _GlobalMemoryResult, "global_memory_summary"
        )
        global_summary = global_result.summary

        valid_knowledge_types = {"diagnostic_pattern", "treatment_efficacy", "safety_anomaly", "symptom_cluster"}
        ktype = (
            global_result.knowledge_type
            if global_result.knowledge_type in valid_knowledge_types
            else "diagnostic_pattern"
        )

        global_mem = await mem_mgr.store_global_memory(
            topic=global_result.topic,
            summary=global_result.summary,
            knowledge_type=ktype,
            pattern_graph=global_result.pattern_graph,
            confidence_score=max(0.0, min(1.0, global_result.confidence_score)),
        )
        global_memory_id = global_mem.id
        logger.info("[memory_writer] ✅ Global memory stored: id=%s", global_memory_id)

    except Exception as exc:
        logger.warning("[memory_writer] LLM global memory generation failed, using structured state fallback: %s", exc)
        dx = state.get("primary_diagnosis") or "Clinical Knowledge Pattern"
        meds_str = ", ".join(m.get("name", "") for m in state.get("medications", []) if isinstance(m, dict))
        global_summary_text = (
            f"Clinical pattern observation for {dx}. "
            f"Key findings: {', '.join(str(f) for f in state.get('key_findings', [])) or 'symptom presentation'}. "
            f"Efficacy regimen: {meds_str or 'supportive therapy'}."
        )
        try:
            global_mem = await mem_mgr.store_global_memory(
                topic=f"Diagnostic Pattern: {dx}",
                summary=global_summary_text,
                knowledge_type="diagnostic_pattern",
                pattern_graph={
                    "diagnosis": dx,
                    "findings": state.get("key_findings", []),
                    "triage_level": state.get("triage_level"),
                },
                confidence_score=float(state.get("diagnosis_confidence", 0.85) or 0.85),
            )
            global_memory_id = global_mem.id
            global_summary = global_summary_text
            logger.info("[memory_writer] ✅ Fallback global memory stored: id=%s", global_memory_id)
        except Exception as store_err:
            logger.error("[memory_writer] Fallback global memory storage failed: %s", store_err)


    # ── Step 3: Store appointment summary linking both memory records ──────────
    try:
        await mem_mgr.store_appointment_summary(
            session_id=session_id,
            patient_id=patient_id or None,
            local_memory_id=local_memory_id,
            global_memory_id=global_memory_id,
            local_summary=local_summary or "Summary generation incomplete.",
            global_summary=global_summary or "Global pattern extraction incomplete.",
            primary_diagnosis=state.get("primary_diagnosis"),
            triage_level=state.get("triage_level"),
            medications_prescribed=[
                {"name": m.get("name", ""), "dose": m.get("dose", "")}
                for m in state.get("medications", [])
            ],
            follow_up_plan=state.get("follow_up", ""),
        )
        logger.info("[memory_writer] ✅ Appointment summary stored for session %s", session_id)

    except Exception as exc:
        logger.error("[memory_writer] Appointment summary storage failed: %s", exc, exc_info=True)

    return {
        "local_memory_id": local_memory_id,
        "global_memory_id": global_memory_id,
    }
