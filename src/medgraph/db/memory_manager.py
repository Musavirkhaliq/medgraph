"""
Dual-Tier Memory Manager — Local Patient Memory & Global Agent Memory System.
Handles AI-generated appointment summaries and doctor-written interim notes.
Both tiers write to Supabase with in-memory fallback for dev/test.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from medgraph.db.client import get_db_client
from medgraph.db.models import (
    AppointmentSummary,
    GlobalAgentMemoryItem,
    LocalPatientMemoryItem,
)

logger = logging.getLogger(__name__)

# ── In-memory stores for dev/test fallback ────────────────────────────────────
_local_memories_db: list[dict] = [
    {
        "id": "mem-001",
        "patient_id": "pat-001",
        "session_id": "sess-prev-01",
        "memory_category": "med_intolerance",
        "title": "Adverse Reaction to Penicillin",
        "content": "Patient reported severe urticaria and mild lip swelling 30 mins post-ingestion of oral Amoxicillin in 2024.",
        "relevance_score": 1.0,
        "note_type": "auto",
        "doctor_id": None,
        "metadata": {"icd_code": "Z88.0", "allergen": "Penicillin"},
        "created_at": "2025-01-10T10:00:00Z",
    },
    {
        "id": "mem-002",
        "patient_id": "pat-001",
        "session_id": "sess-prev-02",
        "memory_category": "episodic_visit",
        "title": "Acute Asthma Exacerbation Baseline",
        "content": "Patient presented with nocturnal wheezing and dyspnea. Responded well to Albuterol nebulizer and 5-day Prednisone taper.",
        "relevance_score": 0.95,
        "note_type": "auto",
        "doctor_id": None,
        "metadata": {"primary_dx": "Asthma", "fev1": "72%"},
        "created_at": "2025-06-15T14:30:00Z",
    },
]

_global_memories_db: list[dict] = [
    {
        "id": "gmem-001",
        "knowledge_type": "diagnostic_pattern",
        "topic": "Acute Shortness of Breath: Asthma vs Pulmonary Embolism Cues",
        "summary": "Key distinguishing features: Sudden onset dyspnea + pleuritic chest pain + sinus tachycardia strongly points to PE over Asthma. Always order D-Dimer or CTPA if Wells score > 4.",
        "case_count": 14,
        "confidence_score": 0.92,
        "pattern_graph": {"symptoms": ["shortness of breath", "chest pain"], "red_flags": ["tachycardia", "hemoptysis"]},
        "created_at": "2026-01-01T00:00:00Z",
    },
    {
        "id": "gmem-002",
        "knowledge_type": "safety_anomaly",
        "topic": "Non-Selective Beta-Blocker Contraindication in Active Asthma",
        "summary": "Propranolol and Carvedilol induce acute severe bronchospasm in reactive airway disease. Prefer Cardioselective Beta-Blockers (Metoprolol, Bisoprolol) with cautious dosing.",
        "case_count": 28,
        "confidence_score": 0.98,
        "pattern_graph": {"contraindication": "Beta-blockers + Asthma"},
        "created_at": "2026-02-15T00:00:00Z",
    },
]

_appointment_summaries_db: list[dict] = []


def _compute_keyword_score(text: str, query: str) -> float:
    """Keyword matching relevance score (0–1)."""
    q_words = [w.lower() for w in query.split() if len(w) > 2]
    if not q_words:
        return 0.5
    text_lower = text.lower()
    matches = sum(1 for w in q_words if w in text_lower)
    return matches / len(q_words)


def _safe_local_item(d: dict) -> LocalPatientMemoryItem:
    """Build LocalPatientMemoryItem from dict, ignoring unknown extra fields."""
    valid = {k: v for k, v in d.items() if k in LocalPatientMemoryItem.model_fields}
    return LocalPatientMemoryItem(**valid)


def _safe_global_item(d: dict) -> GlobalAgentMemoryItem:
    """Build GlobalAgentMemoryItem from dict, ignoring unknown extra fields."""
    valid = {k: v for k, v in d.items() if k in GlobalAgentMemoryItem.model_fields}
    return GlobalAgentMemoryItem(**valid)


class DualTierMemoryManager:
    """Manager for Local Patient Memory and Global Agent Knowledge Storage."""

    def __init__(self):
        self.db_client = get_db_client()

    # ── LOCAL MEMORY ──────────────────────────────────────────────────────────

    async def store_local_memory(
        self,
        patient_id: str,
        title: str,
        content: str,
        memory_category: str = "episodic_visit",
        session_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        note_type: str = "auto",
        doctor_id: str | None = None,
    ) -> LocalPatientMemoryItem:
        """
        Store a clinical memory item for a specific patient.

        Args:
            patient_id: Patient UUID or legacy ID.
            title: Short descriptive title for the memory.
            content: Full clinical content of the memory.
            memory_category: One of episodic_visit, med_intolerance, chronic_trend, lab_baseline, general.
            session_id: Optional session that produced this memory.
            metadata: Additional structured metadata (ICD codes, safety flags, etc.).
            note_type: 'auto' (AI generated) or 'interim_note' (doctor written).
            doctor_id: Doctor's user ID if note_type == 'interim_note'.
        """
        from medgraph.db.client import to_uuid_safe
        from medgraph.embeddings import embed_text

        mem_id = str(uuid.uuid4())
        item_dict: dict[str, Any] = {
            "id": mem_id,
            "patient_id": to_uuid_safe(patient_id),
            "session_id": session_id,
            "memory_category": memory_category,
            "title": title,
            "content": content,
            "relevance_score": 1.0,
            "note_type": note_type,
            "doctor_id": doctor_id,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        embedding = await embed_text(f"{title}\n{content}")
        if embedding is not None:
            item_dict["embedding"] = embedding

        if self.db_client.is_configured:
            await self.db_client.ensure_patient_exists(patient_id)
            try:
                res = await self.db_client.rest_request(
                    "POST", "local_patient_memory", json_data=item_dict
                )
                if res:
                    logger.info(
                        "[MemoryManager] ✅ Local memory stored in Supabase — patient=%s title=%s",
                        patient_id, title,
                    )
                else:
                    logger.warning(
                        "[MemoryManager] Supabase local write returned empty result (using fallback)"
                    )
            except Exception as exc:
                logger.warning(
                    "[MemoryManager] Supabase local write failed (using fallback): %s", exc
                )

        _local_memories_db.append(item_dict)
        return _safe_local_item(item_dict)

    async def _touch_last_accessed(self, table: str, rows: list[dict[str, Any]]) -> None:
        """Best-effort ``last_accessed_at`` bump for retrieved rows (never raises)."""
        if not self.db_client.is_configured:
            return
        ids = [r["id"] for r in rows if r.get("id")]
        if not ids:
            return
        try:
            await self.db_client.rest_request(
                "PATCH", table,
                params={"id": f"in.({','.join(ids)})"},
                json_data={"last_accessed_at": datetime.now(timezone.utc).isoformat()},
            )
        except Exception as exc:
            logger.debug("[MemoryManager] last_accessed_at bump failed (non-fatal): %s", exc)

    async def query_local_memory(
        self,
        patient_id: str,
        query_text: str = "",
        limit: int = 5,
    ) -> list[LocalPatientMemoryItem]:
        """Query local memories for a patient, ordered by relevance/recency."""
        from medgraph.db.client import to_uuid_safe
        from medgraph.embeddings import embed_text

        pid_uuid = to_uuid_safe(patient_id)

        if self.db_client.is_configured:
            # Prefer real semantic search when an embedding provider is
            # configured; any failure (no provider, RPC not migrated yet)
            # falls straight through to the keyword-scored path below.
            if query_text:
                query_embedding = await embed_text(query_text)
                if query_embedding is not None:
                    rpc_rows = await self.db_client.rpc(
                        "match_local_memory",
                        {
                            "query_embedding": query_embedding,
                            "match_patient_id": pid_uuid,
                            "match_count": limit,
                        },
                    )
                    if rpc_rows:
                        await self._touch_last_accessed("local_patient_memory", rpc_rows)
                        return [_safe_local_item(r) for r in rpc_rows]

            rows = await self.db_client.rest_request(
                "GET", "local_patient_memory",
                params={
                    "patient_id": f"eq.{pid_uuid}",
                    "order": "created_at.desc",
                    "limit": str(limit),
                },
            )
            results = []
            for r in rows:
                try:
                    results.append(_safe_local_item(r))
                except Exception:
                    pass
            if results:
                await self._touch_last_accessed("local_patient_memory", rows)
                return results

        # Fallback: in-memory search
        patient_mems = [
            m for m in _local_memories_db
            if m["patient_id"] in (patient_id, pid_uuid)
        ]
        if not query_text:
            sorted_mems = sorted(
                patient_mems, key=lambda x: x.get("created_at", ""), reverse=True
            )[:limit]
            return [_safe_local_item(m) for m in sorted_mems]

        scored = []
        for m in patient_mems:
            full_txt = f"{m['title']} {m['content']} {str(m.get('metadata', {}))}"
            score = _compute_keyword_score(full_txt, query_text)
            m_copy = dict(m)
            m_copy["relevance_score"] = round(score, 2)
            scored.append((score, m_copy))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [_safe_local_item(item) for _, item in scored[:limit]]

    # ── GLOBAL MEMORY ─────────────────────────────────────────────────────────

    async def _find_similar_global_memory(
        self, topic: str, knowledge_type: str, threshold: float = 0.6
    ) -> dict[str, Any] | None:
        """Find an existing global memory row similar enough to consolidate into."""
        candidates: list[dict[str, Any]] = []
        if self.db_client.is_configured:
            rows = await self.db_client.rest_request(
                "GET", "global_agent_memory",
                params={"knowledge_type": f"eq.{knowledge_type}", "limit": "50"},
            )
            candidates = list(rows)
        if not candidates:
            candidates = [m for m in _global_memories_db if m.get("knowledge_type") == knowledge_type]

        best_score, best_row = 0.0, None
        for row in candidates:
            score = _compute_keyword_score(row.get("topic", ""), topic)
            if score > best_score:
                best_score, best_row = score, row
        return best_row if best_score >= threshold else None

    async def store_global_memory(
        self,
        topic: str,
        summary: str,
        knowledge_type: str = "diagnostic_pattern",
        pattern_graph: dict[str, Any] | None = None,
        confidence_score: float = 0.85,
    ) -> GlobalAgentMemoryItem:
        """
        Store de-identified cross-patient clinical knowledge.

        If an existing memory with the same ``knowledge_type`` and a similar
        ``topic`` is found, it's reinforced (case_count incremented, confidence
        blended) rather than inserted as a new, unbounded duplicate row.
        """
        existing = await self._find_similar_global_memory(topic, knowledge_type)
        if existing:
            return await self._reinforce_global_memory(existing, summary, pattern_graph, confidence_score)

        from medgraph.embeddings import embed_text

        gmem_id = str(uuid.uuid4())
        item_dict = {
            "id": gmem_id,
            "knowledge_type": knowledge_type,
            "topic": topic,
            "summary": summary,
            "case_count": 1,
            "confidence_score": confidence_score,
            "pattern_graph": pattern_graph or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        embedding = await embed_text(f"{topic}\n{summary}")
        if embedding is not None:
            item_dict["embedding"] = embedding

        if self.db_client.is_configured:
            try:
                res = await self.db_client.rest_request(
                    "POST", "global_agent_memory", json_data=item_dict
                )
                if res:
                    logger.info(
                        "[MemoryManager] ✅ Global memory stored in Supabase — topic=%s", topic
                    )
                else:
                    logger.warning(
                        "[MemoryManager] Supabase global write returned empty result (using fallback)"
                    )
            except Exception as exc:
                logger.warning(
                    "[MemoryManager] Supabase global write failed (using fallback): %s", exc
                )

        _global_memories_db.append(item_dict)
        return _safe_global_item(item_dict)

    async def _reinforce_global_memory(
        self,
        existing: dict[str, Any],
        new_summary: str,
        new_pattern_graph: dict[str, Any] | None,
        new_confidence: float,
    ) -> GlobalAgentMemoryItem:
        """Increment case_count and blend confidence into an existing global memory row."""
        old_count = existing.get("case_count", 1)
        old_confidence = existing.get("confidence_score", 0.5)
        new_count = old_count + 1
        # Weighted average favoring the larger, more-established sample.
        blended_confidence = round(
            (old_confidence * old_count + new_confidence) / new_count, 3
        )

        updates: dict[str, Any] = {
            "case_count": new_count,
            "confidence_score": blended_confidence,
        }
        # Only replace the narrative summary if this case is more confident than
        # the consolidated average — keeps the most authoritative wording.
        if new_confidence >= blended_confidence:
            updates["summary"] = new_summary
            if new_pattern_graph:
                updates["pattern_graph"] = new_pattern_graph

        gmem_id = existing.get("id")
        if self.db_client.is_configured and gmem_id:
            try:
                await self.db_client.rest_request(
                    "PATCH", "global_agent_memory",
                    params={"id": f"eq.{gmem_id}"},
                    json_data=updates,
                )
                logger.info(
                    "[MemoryManager] ✅ Reinforced global memory %s (case_count=%d)",
                    gmem_id, new_count,
                )
            except Exception as exc:
                logger.warning("[MemoryManager] Supabase global reinforce failed: %s", exc)

        for row in _global_memories_db:
            if row.get("id") == gmem_id:
                row.update(updates)
                break
        else:
            # Row only existed in Supabase (not in the local fallback list) — merge it in.
            merged = {**existing, **updates}
            _global_memories_db.append(merged)
            existing = merged

        return _safe_global_item({**existing, **updates})

    async def query_global_memory(
        self,
        query_text: str = "",
        limit: int = 5,
    ) -> list[GlobalAgentMemoryItem]:
        """Query global cross-patient agent memory."""
        from medgraph.embeddings import embed_text

        if self.db_client.is_configured:
            if query_text:
                query_embedding = await embed_text(query_text)
                if query_embedding is not None:
                    rpc_rows = await self.db_client.rpc(
                        "match_global_memory",
                        {"query_embedding": query_embedding, "match_count": limit},
                    )
                    if rpc_rows:
                        return [_safe_global_item(r) for r in rpc_rows]

            rows = await self.db_client.rest_request(
                "GET", "global_agent_memory",
                params={"order": "created_at.desc", "limit": str(limit)},
            )
            results = []
            for r in rows:
                try:
                    results.append(_safe_global_item(r))
                except Exception:
                    pass
            if results:
                return results

        if not query_text:
            return [_safe_global_item(m) for m in _global_memories_db[:limit]]

        scored = []
        for m in _global_memories_db:
            full_txt = f"{m['topic']} {m['summary']} {str(m.get('pattern_graph', {}))}"
            score = _compute_keyword_score(full_txt, query_text)
            scored.append((score, m))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [_safe_global_item(item) for _, item in scored[:limit]]

    # ── APPOINTMENT SUMMARY ───────────────────────────────────────────────────

    async def store_appointment_summary(
        self,
        session_id: str,
        local_summary: str,
        global_summary: str,
        patient_id: str | None = None,
        local_memory_id: str | None = None,
        global_memory_id: str | None = None,
        primary_diagnosis: str | None = None,
        triage_level: str | None = None,
        medications_prescribed: list | None = None,
        follow_up_plan: str | None = None,
    ) -> AppointmentSummary:
        """Store appointment summary linking both memory tiers to a session."""
        from medgraph.db.client import to_uuid_safe
        summary_id = str(uuid.uuid4())
        summary_dict = {
            "id": summary_id,
            "session_id": session_id,
            "patient_id": to_uuid_safe(patient_id) if patient_id else None,
            "local_memory_id": local_memory_id,
            "global_memory_id": global_memory_id,
            "local_summary": local_summary,
            "global_summary": global_summary,
            "primary_diagnosis": primary_diagnosis,
            "triage_level": triage_level,
            "medications_prescribed": medications_prescribed or [],
            "follow_up_plan": follow_up_plan,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        if self.db_client.is_configured:
            try:
                res = await self.db_client.rest_request(
                    "POST", "appointment_summaries", json_data=summary_dict
                )
                if res:
                    logger.info(
                        "[MemoryManager] ✅ Appointment summary stored — session=%s", session_id
                    )
                else:
                    logger.warning(
                        "[MemoryManager] Supabase appointment summary write returned empty result"
                    )
            except Exception as exc:
                logger.warning(
                    "[MemoryManager] Supabase appointment summary write failed: %s", exc
                )

        _appointment_summaries_db.append(summary_dict)
        return AppointmentSummary.model_validate(summary_dict)

    # ── DOCTOR INTERIM NOTE ───────────────────────────────────────────────────

    async def store_interim_note(
        self,
        patient_id: str,
        raw_note: str,
        doctor_id: str | None = None,
        session_id: str | None = None,
        patient_name: str | None = None,
    ) -> dict[str, Any]:
        """
        Store a doctor-written interim note as a local memory item.

        Uses the LLM to summarise and categorise the raw note.
        If clinically significant (determined by LLM), also stores a global memory entry.

        Args:
            patient_id: Patient UUID.
            raw_note: Free-text note written by the doctor.
            doctor_id: Doctor's user profile ID.
            session_id: Optional session to link the note to.
            patient_name: Patient name for context (not stored in global memory).

        Returns:
            Dict with: local_memory, global_memory (optional), title, summary, is_globally_significant.
        """
        from langchain_core.messages import HumanMessage, SystemMessage
        from pydantic import BaseModel

        from medgraph.llm import get_llm
        from medgraph.nodes._utils import parse_llm_json
        from medgraph.prompts import INTERIM_NOTE_SUMMARY_SYSTEM

        class _InterimResult(BaseModel):
            title: str = "Interim Clinical Note"
            summary: str = ""
            memory_category: str = "general"
            is_globally_significant: bool = False
            global_topic: str = ""
            global_summary: str = ""
            global_knowledge_type: str = "diagnostic_pattern"
            confidence_score: float = 0.7

        context_parts = ["Doctor's interim patient note:"]
        if patient_name:
            context_parts.append(f"Patient: {patient_name}")
        context_parts.append(f"\n{raw_note}")
        context = "\n".join(context_parts)

        llm = get_llm("general")
        messages = [
            SystemMessage(content=INTERIM_NOTE_SUMMARY_SYSTEM),
            HumanMessage(content=context),
        ]

        try:
            response = llm.invoke(messages)
            result = parse_llm_json(response.content, _InterimResult, "interim_note_summary")
        except Exception as exc:
            logger.error("[MemoryManager] LLM interim note summarization failed: %s", exc)
            result = _InterimResult(
                title="Doctor Interim Note",
                summary=raw_note[:800],
                memory_category="general",
            )

        # Validate category
        valid_categories = {"episodic_visit", "med_intolerance", "chronic_trend", "lab_baseline", "general"}
        cat = result.memory_category if result.memory_category in valid_categories else "general"

        local_mem = await self.store_local_memory(
            patient_id=patient_id,
            title=result.title,
            content=result.summary or raw_note,
            memory_category=cat,
            session_id=session_id,
            note_type="interim_note",
            doctor_id=doctor_id,
            metadata={"raw_note": raw_note[:1000], "source": "doctor_interim_note"},
        )

        global_mem = None
        if result.is_globally_significant and result.global_summary:
            valid_knowledge_types = {"diagnostic_pattern", "treatment_efficacy", "safety_anomaly", "symptom_cluster"}
            ktype = result.global_knowledge_type if result.global_knowledge_type in valid_knowledge_types else "diagnostic_pattern"
            global_mem = await self.store_global_memory(
                topic=result.global_topic or result.title,
                summary=result.global_summary,
                knowledge_type=ktype,
                confidence_score=max(0.0, min(1.0, result.confidence_score)),
                pattern_graph={"source": "doctor_interim_note"},
            )

        logger.info(
            "[MemoryManager] Interim note stored for patient %s (globally_significant=%s)",
            patient_id, result.is_globally_significant,
        )
        return {
            "local_memory": local_mem.model_dump(),
            "global_memory": global_mem.model_dump() if global_mem else None,
            "title": result.title,
            "summary": result.summary,
            "is_globally_significant": result.is_globally_significant,
        }

    # ── MEMORY TIMELINE ───────────────────────────────────────────────────────

    async def get_patient_timeline(
        self,
        patient_id: str,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """
        Return all memory items for a patient sorted newest-first.
        Each item has 'source': 'auto' (AI) or 'doctor' (interim note).
        """
        from medgraph.db.client import to_uuid_safe
        pid_uuid = to_uuid_safe(patient_id)

        if self.db_client.is_configured:
            rows = await self.db_client.rest_request(
                "GET", "local_patient_memory",
                params={
                    "patient_id": f"eq.{pid_uuid}",
                    "order": "created_at.desc",
                    "limit": str(limit),
                },
            )
            items = []
            for r in rows:
                items.append({
                    "id": r.get("id"),
                    "title": r.get("title", ""),
                    "summary": r.get("content", ""),
                    "category": r.get("memory_category", ""),
                    "source": "doctor" if r.get("note_type") == "interim_note" else "auto",
                    "note_type": r.get("note_type", "auto"),
                    "session_id": r.get("session_id"),
                    "created_at": r.get("created_at"),
                })
            if items:
                return items

        # Fallback: in-memory store
        patient_mems = [
            m for m in _local_memories_db
            if m["patient_id"] in (patient_id, pid_uuid)
        ]
        patient_mems.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return [
            {
                "id": m["id"],
                "title": m["title"],
                "summary": m["content"],
                "category": m.get("memory_category", ""),
                "source": "doctor" if m.get("note_type") == "interim_note" else "auto",
                "note_type": m.get("note_type", "auto"),
                "session_id": m.get("session_id"),
                "created_at": m.get("created_at"),
            }
            for m in patient_mems[:limit]
        ]


# ── Singleton instance ────────────────────────────────────────────────────────

_memory_manager_instance: DualTierMemoryManager | None = None


def get_memory_manager() -> DualTierMemoryManager:
    """Retrieve the global DualTierMemoryManager singleton."""
    global _memory_manager_instance
    if _memory_manager_instance is None:
        _memory_manager_instance = DualTierMemoryManager()
    return _memory_manager_instance
