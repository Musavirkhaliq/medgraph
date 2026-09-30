"""
Memory recall node — load per-patient and cross-patient agent memory into the session.

Runs immediately after intake, before triage. Deterministic and LLM-free (like
emergency_node) so it stays fast: it only reads from the dual-tier memory system and
the patient profile repository, then makes both available to every downstream node
via ``build_context_prompt``.

Without this node, ``local_patient_memory`` and ``global_agent_memory`` are write-only
— nothing in the pipeline ever benefits from a patient's history or from prior
cross-patient learnings. This closes that loop.
"""

from __future__ import annotations

import logging
from typing import Any

from medgraph.state import MedicalState

logger = logging.getLogger(__name__)


def _build_query_text(state: MedicalState) -> str:
    """Build a short retrieval query from the patient's presenting complaint."""
    parts = [state.get("patient_input", "")]
    for s in state.get("symptoms", []) or []:
        if isinstance(s, dict) and s.get("description"):
            parts.append(str(s["description"]))
    return " ".join(p for p in parts if p).strip()


def _extract_patient_context(profile: Any) -> dict[str, Any]:
    """Pull the safety-relevant facts out of a PatientProfile."""
    return {
        "allergies": profile.allergies,
        "chronic_conditions": profile.chronic_conditions,
        "current_medications": profile.current_medications,
        "blood_type": profile.blood_type,
    }


async def memory_recall_node(state: MedicalState) -> dict:
    """
    Load per-patient profile/history and relevant cross-patient agent knowledge.

    Args:
        state: Current graph state (runs right after intake_node).

    Returns:
        Partial state update with ``patient_context``, ``patient_history_snippets``,
        and ``relevant_agent_knowledge``. Never raises — a DB failure or unknown
        patient must never block the clinical pipeline.
    """
    from medgraph.db.memory_manager import get_memory_manager
    from medgraph.db.repository import get_patient_by_account_id, get_patient_by_mrn_or_id

    patient_id = state.get("patient_id")
    query_text = _build_query_text(state)

    patient_context: dict[str, Any] = {}
    patient_history_snippets: list[dict[str, Any]] = []
    relevant_agent_knowledge: list[dict[str, Any]] = []
    node_errors: list[str] = []
    ehr_synced = False
    latest_vitals: dict[str, Any] | None = None
    news2_score: int | None = None
    news2_risk_band: str | None = None

    mem_mgr = get_memory_manager()

    if patient_id:
        try:
            profile = await get_patient_by_account_id(patient_id)
            if not profile:
                profile = await get_patient_by_mrn_or_id(patient_id)
            if profile:
                patient_context = _extract_patient_context(profile)
        except Exception as exc:
            logger.warning("[memory_recall] Patient profile lookup failed: %s", exc)
            node_errors.append(f"memory_recall: profile lookup failed: {exc}")

        # EHR (FHIR) enrichment — merges real allergy/medication/condition data
        # from the patient's external record into the same patient_context dict
        # already consumed by every downstream node via build_context_prompt.
        try:
            from medgraph.ehr.client import get_fhir_client
            from medgraph.ehr.mapper import merge_fhir_into_patient_context

            fhir_client = get_fhir_client()
            fhir_bundle = await fhir_client.get_patient_bundle(patient_id)
            if fhir_bundle:
                patient_context = merge_fhir_into_patient_context(patient_context, fhir_bundle)
                ehr_synced = True
        except Exception as exc:
            logger.warning("[memory_recall] FHIR enrichment failed: %s", exc)
            node_errors.append(f"memory_recall: fhir enrichment failed: {exc}")

        # Longitudinal vitals — latest reading + NEWS2 deterioration score.
        try:
            from medgraph.db.repository import get_latest_vitals

            vitals_row = await get_latest_vitals(patient_id)
            if vitals_row:
                latest_vitals = vitals_row
                news2_score = vitals_row.get("news2_score")
                news2_risk_band = vitals_row.get("news2_risk_band")
        except Exception as exc:
            logger.warning("[memory_recall] Vitals lookup failed: %s", exc)
            node_errors.append(f"memory_recall: vitals lookup failed: {exc}")

        try:
            history = await mem_mgr.query_local_memory(patient_id, query_text=query_text, limit=5)
            patient_history_snippets = [
                {
                    "title": h.title,
                    "content": h.content,
                    "category": h.memory_category,
                    "created_at": str(h.created_at) if h.created_at else None,
                }
                for h in history
            ]
        except Exception as exc:
            logger.warning("[memory_recall] Local memory query failed: %s", exc)
            node_errors.append(f"memory_recall: local memory query failed: {exc}")

    # Cross-patient agent knowledge applies even to a first-time / anonymous patient.
    try:
        knowledge = await mem_mgr.query_global_memory(query_text=query_text, limit=5)
        relevant_agent_knowledge = [
            {
                "topic": k.topic,
                "summary": k.summary,
                "knowledge_type": k.knowledge_type,
                "confidence_score": k.confidence_score,
            }
            for k in knowledge
        ]
    except Exception as exc:
        logger.warning("[memory_recall] Global memory query failed: %s", exc)
        node_errors.append(f"memory_recall: global memory query failed: {exc}")

    logger.info(
        "[memory_recall] patient_id=%s profile=%s history=%d knowledge=%d",
        patient_id, bool(patient_context), len(patient_history_snippets), len(relevant_agent_knowledge),
    )

    result: dict[str, Any] = {
        "patient_context": patient_context,
        "patient_history_snippets": patient_history_snippets,
        "relevant_agent_knowledge": relevant_agent_knowledge,
        "ehr_synced": ehr_synced,
        "latest_vitals": latest_vitals,
        "news2_score": news2_score,
        "news2_risk_band": news2_risk_band,
    }
    if node_errors:
        result["node_errors"] = node_errors
    return result
