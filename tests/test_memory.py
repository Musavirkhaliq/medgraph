"""
Test suite for the Dual-Tier Memory System.

Tests cover:
  1. Local memory store + retrieve (in-memory fallback)
  2. Global memory store + retrieve (in-memory fallback)
  3. Appointment summary storage
  4. Memory timeline retrieval
  5. Global memory PII check
  6. Supabase live roundtrip (skipped if not configured)
  7. Interim note storage (mock LLM)

Run with: cd /home/musa/medgraph && python -m pytest tests/test_memory.py -v
"""

import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from dotenv import load_dotenv

from medgraph.db.memory_manager import DualTierMemoryManager
from medgraph.db.models import AppointmentSummary, GlobalAgentMemoryItem, LocalPatientMemoryItem

# Load .env variables so live Supabase tests execute automatically
load_dotenv()

TEST_PATIENT_ID = "pat-test-memory-001"
TEST_SESSION_ID = f"sess-test-memory-{uuid.uuid4().hex[:8]}"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def mem_mgr():
    """DualTierMemoryManager with Supabase disabled (in-memory only)."""
    mgr = DualTierMemoryManager()
    mgr.db_client.is_configured = False  # Force in-memory mode
    return mgr


@pytest.fixture
def live_mem_mgr():
    """DualTierMemoryManager with real Supabase (reads from env)."""
    from medgraph.db.client import SupabaseDatabaseClient
    mgr = DualTierMemoryManager()
    mgr.db_client = SupabaseDatabaseClient()
    return mgr


# ── 1. LOCAL MEMORY ───────────────────────────────────────────────────────────

class TestLocalMemory:
    """Local patient memory store and retrieve."""

    @pytest.mark.asyncio
    async def test_store_returns_valid_item(self, mem_mgr):
        """Storing a local memory returns a valid LocalPatientMemoryItem."""
        item = await mem_mgr.store_local_memory(
            patient_id=TEST_PATIENT_ID,
            title="Test Visit Summary",
            content="Patient presented with headache and nausea, BP elevated at 160/95.",
            memory_category="episodic_visit",
            session_id=TEST_SESSION_ID,
        )
        assert isinstance(item, LocalPatientMemoryItem)
        assert item.title == "Test Visit Summary"
        assert item.patient_id is not None
        assert item.memory_category == "episodic_visit"

    @pytest.mark.asyncio
    async def test_retrieve_by_patient_id(self, mem_mgr):
        """Stored memory is retrievable by patient_id."""
        unique_title = f"Allergy Record {uuid.uuid4().hex[:6]}"
        await mem_mgr.store_local_memory(
            patient_id=TEST_PATIENT_ID,
            title=unique_title,
            content="Confirmed penicillin allergy — severe urticaria.",
            memory_category="med_intolerance",
        )
        results = await mem_mgr.query_local_memory(patient_id=TEST_PATIENT_ID, limit=20)
        assert any(r.title == unique_title for r in results), f"'{unique_title}' not found in results"

    @pytest.mark.asyncio
    async def test_keyword_search_returns_relevant(self, mem_mgr):
        """Keyword search surfaces relevant memories first."""
        await mem_mgr.store_local_memory(
            patient_id=TEST_PATIENT_ID,
            title="Asthma Follow-up",
            content="FEV1 improved to 82% post-treatment with Salbutamol inhaler.",
            memory_category="chronic_trend",
        )
        results = await mem_mgr.query_local_memory(
            patient_id=TEST_PATIENT_ID,
            query_text="asthma FEV1 salbutamol",
            limit=10,
        )
        assert len(results) > 0
        top = results[0]
        assert any(
            kw in top.title.lower() or kw in top.content.lower()
            for kw in ["asthma", "fev1", "salbutamol"]
        ), f"Expected asthma/FEV1 content in top result, got: title='{top.title}'"

    @pytest.mark.asyncio
    async def test_interim_note_type_stored(self, mem_mgr):
        """Interim notes store with note_type value correctly."""
        item = await mem_mgr.store_local_memory(
            patient_id=TEST_PATIENT_ID,
            title="Doctor Interim Note Test",
            content="Patient called: breathing improved after 3 days of Prednisolone.",
            memory_category="general",
            note_type="interim_note",
            doctor_id="doc-001",
        )
        assert isinstance(item, LocalPatientMemoryItem)
        assert item.title == "Doctor Interim Note Test"

    @pytest.mark.asyncio
    async def test_results_sorted_newest_first(self, mem_mgr):
        """Results are sorted newest-first when no query text."""
        # Store two items with small time difference
        await mem_mgr.store_local_memory(
            patient_id=TEST_PATIENT_ID,
            title="Older Note",
            content="Older content",
        )
        await mem_mgr.store_local_memory(
            patient_id=TEST_PATIENT_ID,
            title="Newer Note",
            content="Newer content",
        )
        results = await mem_mgr.query_local_memory(patient_id=TEST_PATIENT_ID, limit=10)
        if len(results) >= 2:
            dates = [r.created_at for r in results if r.created_at]
            sorted_dates = sorted(dates, reverse=True)
            assert dates == sorted_dates, "Results are not sorted newest-first"


# ── 2. GLOBAL MEMORY ──────────────────────────────────────────────────────────

class TestGlobalMemory:
    """Global cross-patient knowledge store and retrieve."""

    @pytest.mark.asyncio
    async def test_store_returns_valid_item(self, mem_mgr):
        """Storing global memory returns a valid GlobalAgentMemoryItem."""
        item = await mem_mgr.store_global_memory(
            topic="Asthma Exacerbation: Nebulizer vs MDI Efficacy",
            summary="Nebulized Salbutamol shows equivalent bronchodilation to MDI with spacer.",
            knowledge_type="treatment_efficacy",
            confidence_score=0.82,
        )
        assert isinstance(item, GlobalAgentMemoryItem)
        assert item.topic == "Asthma Exacerbation: Nebulizer vs MDI Efficacy"
        assert item.confidence_score == 0.82
        assert item.knowledge_type == "treatment_efficacy"

    @pytest.mark.asyncio
    async def test_keyword_query_returns_relevant(self, mem_mgr):
        """Global memory keyword query returns relevant items."""
        await mem_mgr.store_global_memory(
            topic="Beta-Blocker Contraindication in Active Asthma",
            summary="Non-selective beta-blockers provoke severe bronchospasm in reactive airway disease.",
            knowledge_type="safety_anomaly",
        )
        results = await mem_mgr.query_global_memory("beta-blocker asthma bronchospasm", limit=10)
        assert len(results) > 0
        assert any("beta" in r.topic.lower() or "beta" in r.summary.lower() for r in results)

    @pytest.mark.asyncio
    async def test_no_pii_in_stored_item(self, mem_mgr):
        """Verify global memory does not contain obvious PII."""
        item = await mem_mgr.store_global_memory(
            topic="Hypertension + Diabetes: ACE Inhibitor Renal Protection",
            summary="ACE inhibitors provide renal protection in diabetic nephropathy; preferred first-line in T2DM hypertension.",
            knowledge_type="treatment_efficacy",
        )
        pii_terms = ["John Doe", "1976-04-12", "+1-555-0192", "patient@medai.ltm", "MRN-2026-0891"]
        for term in pii_terms:
            assert term not in item.summary, f"PII term '{term}' found in global memory summary!"
            assert term not in item.topic, f"PII term '{term}' found in global memory topic!"

    @pytest.mark.asyncio
    async def test_similar_topic_consolidates_instead_of_duplicating(self, mem_mgr):
        """A near-duplicate finding reinforces the existing row rather than adding a new one."""
        unique_word = uuid.uuid4().hex[:8]
        first = await mem_mgr.store_global_memory(
            topic=f"NSAID GI Bleeding Risk {unique_word} Elderly Patients",
            summary="NSAIDs raise GI bleeding risk in elderly patients on anticoagulants.",
            knowledge_type="safety_anomaly",
            confidence_score=0.7,
        )
        second = await mem_mgr.store_global_memory(
            topic=f"NSAID GI Bleeding Risk {unique_word} Elderly Patients",
            summary="Confirmed again: NSAIDs raise GI bleeding risk in elderly patients on anticoagulants.",
            knowledge_type="safety_anomaly",
            confidence_score=0.9,
        )
        assert second.id == first.id
        assert second.case_count == 2

    @pytest.mark.asyncio
    async def test_dissimilar_topic_creates_new_row(self, mem_mgr):
        """An unrelated topic is stored as its own row, not merged into anything."""
        unique_word = uuid.uuid4().hex[:8]
        item = await mem_mgr.store_global_memory(
            topic=f"Totally Unrelated Dermatology Finding {unique_word}",
            summary="Contact dermatitis pattern unrelated to any existing entry.",
            knowledge_type="symptom_cluster",
        )
        assert item.case_count == 1


# ── 3. APPOINTMENT SUMMARY ────────────────────────────────────────────────────

class TestAppointmentSummary:
    """Appointment summary storage and retrieval."""

    @pytest.mark.asyncio
    async def test_store_appointment_summary(self, mem_mgr):
        """Appointment summary stores and returns correct fields."""
        summary = await mem_mgr.store_appointment_summary(
            session_id=TEST_SESSION_ID,
            patient_id=TEST_PATIENT_ID,
            local_summary="Patient presented with asthma exacerbation. Treated with nebulizer.",
            global_summary="Acute asthma responds well to Salbutamol nebulization as first-line.",
            primary_diagnosis="Acute Asthma Exacerbation",
            triage_level="urgent",
            medications_prescribed=[{"name": "Albuterol", "dose": "2.5mg"}],
            follow_up_plan="Review in 5 days. Repeat spirometry in 4 weeks.",
        )
        assert isinstance(summary, AppointmentSummary)
        assert summary.session_id == TEST_SESSION_ID
        assert summary.primary_diagnosis == "Acute Asthma Exacerbation"
        assert summary.triage_level == "urgent"
        assert len(summary.medications_prescribed) == 1
        assert summary.follow_up_plan is not None

    @pytest.mark.asyncio
    async def test_appointment_summary_links_memory_ids(self, mem_mgr):
        """Appointment summary correctly stores local and global memory IDs."""
        local_mem = await mem_mgr.store_local_memory(
            patient_id=TEST_PATIENT_ID,
            title="Linked Local Memory",
            content="Local content for link test.",
        )
        global_mem = await mem_mgr.store_global_memory(
            topic="Linked Global Pattern",
            summary="Global pattern for link test.",
        )
        unique_session = f"sess-link-{uuid.uuid4().hex[:8]}"
        summary = await mem_mgr.store_appointment_summary(
            session_id=unique_session,
            local_summary="Test local summary.",
            global_summary="Test global summary.",
            local_memory_id=local_mem.id,
            global_memory_id=global_mem.id,
        )
        assert summary.local_memory_id == local_mem.id
        assert summary.global_memory_id == global_mem.id


# ── 4. MEMORY TIMELINE ────────────────────────────────────────────────────────

class TestMemoryTimeline:
    """Patient memory timeline retrieval."""

    @pytest.mark.asyncio
    async def test_timeline_includes_both_types(self, mem_mgr):
        """Timeline includes both auto and doctor memories."""
        await mem_mgr.store_local_memory(
            patient_id=TEST_PATIENT_ID,
            title="AI Auto Summary Test",
            content="Auto-generated appointment summary.",
            note_type="auto",
        )
        await mem_mgr.store_local_memory(
            patient_id=TEST_PATIENT_ID,
            title="Doctor Interim Note Test",
            content="Doctor's interim note.",
            note_type="interim_note",
        )
        timeline = await mem_mgr.get_patient_timeline(patient_id=TEST_PATIENT_ID, limit=20)
        assert len(timeline) >= 2
        sources = {item["source"] for item in timeline}
        # Both 'auto' and 'doctor' should be present
        assert "auto" in sources
        assert "doctor" in sources

    @pytest.mark.asyncio
    async def test_timeline_structure_is_correct(self, mem_mgr):
        """Each timeline item has required fields."""
        timeline = await mem_mgr.get_patient_timeline(patient_id=TEST_PATIENT_ID, limit=5)
        for item in timeline:
            assert "id" in item
            assert "title" in item
            assert "summary" in item
            assert "source" in item
            assert item["source"] in ("auto", "doctor")
            assert "created_at" in item


# ── 5. SUPABASE LIVE ROUNDTRIP ────────────────────────────────────────────────

class TestSupabaseLiveRoundtrip:
    """Live Supabase roundtrip tests — skipped if SUPABASE_URL not configured."""

    @pytest.mark.asyncio
    async def test_local_memory_supabase_roundtrip(self, live_mem_mgr):
        """Write local memory to Supabase, read it back and verify."""
        if not live_mem_mgr.db_client.is_configured:
            pytest.skip("Supabase not configured — skipping live roundtrip test")

        unique_title = f"Supabase Roundtrip Local {uuid.uuid4().hex[:8]}"
        item = await live_mem_mgr.store_local_memory(
            patient_id=TEST_PATIENT_ID,
            title=unique_title,
            content="Supabase roundtrip test — safe to delete after test run.",
            memory_category="general",
            session_id=TEST_SESSION_ID,
        )
        assert item.id is not None

        # Read back from Supabase
        results = await live_mem_mgr.query_local_memory(patient_id=TEST_PATIENT_ID, limit=10)
        returned_titles = [r.title for r in results]
        assert unique_title in returned_titles, (
            f"Written item '{unique_title}' not found in Supabase readback. Got: {returned_titles}"
        )

    @pytest.mark.asyncio
    async def test_global_memory_supabase_roundtrip(self, live_mem_mgr):
        """Write global memory to Supabase, read it back and verify."""
        if not live_mem_mgr.db_client.is_configured:
            pytest.skip("Supabase not configured — skipping live roundtrip test")

        unique_topic = f"Supabase Global Roundtrip {uuid.uuid4().hex[:8]}"
        item = await live_mem_mgr.store_global_memory(
            topic=unique_topic,
            summary="Global memory roundtrip test — safe to delete after test run.",
            knowledge_type="diagnostic_pattern",
            confidence_score=0.5,
        )
        assert item.id is not None

        results = await live_mem_mgr.query_global_memory(query_text="", limit=10)
        returned_topics = [r.topic for r in results]
        assert unique_topic in returned_topics, (
            f"Written global topic '{unique_topic}' not found in Supabase readback. Got: {returned_topics}"
        )

    @pytest.mark.asyncio
    async def test_appointment_summary_supabase_roundtrip(self, live_mem_mgr):
        """Write appointment summary to Supabase, verify row created."""
        if not live_mem_mgr.db_client.is_configured:
            pytest.skip("Supabase not configured — skipping live roundtrip test")

        unique_session = f"sess-roundtrip-{uuid.uuid4().hex[:8]}"
        summary = await live_mem_mgr.store_appointment_summary(
            session_id=unique_session,
            local_summary="Roundtrip local summary test.",
            global_summary="Roundtrip global summary test.",
            primary_diagnosis="Test Diagnosis",
            triage_level="routine",
        )
        # The summary ID should be returned
        assert summary.id is not None
        assert summary.session_id == unique_session


# ── 6. APPOINTMENT MEMORY NODE PIPELINE ───────────────────────────────────────

class TestAppointmentMemoryNode:
    """Verify that appointment_memory_node executes and generates both memory types."""

    @pytest.mark.asyncio
    async def test_appointment_memory_node_generates_both_tiers(self):
        from medgraph.nodes.memory_writer import appointment_memory_node
        from medgraph.state import initial_state

        test_sess = f"sess-node-{uuid.uuid4().hex[:8]}"
        state = initial_state(test_sess, "Patient with severe dyspnea and wheezing")
        state["patient_id"] = "pat-001"
        state["primary_diagnosis"] = "Acute Bronchial Asthma Exacerbation"
        state["diagnosis_confidence"] = 0.94
        state["triage_level"] = "urgent"
        state["case_summary"] = "Patient presented with acute bronchospasm. Prescribed inhaled albuterol and systemic steroids."
        state["medications"] = [{"name": "Albuterol HFA", "dose": "2 puffs Q4H"}, {"name": "Prednisone", "dose": "40mg daily"}]
        state["validation_warnings"] = []

        result = await appointment_memory_node(state)
        assert "local_memory_id" in result
        assert "global_memory_id" in result
        assert result["local_memory_id"] is not None
        assert result["global_memory_id"] is not None


# ── 7. EMBEDDINGS FALLBACK ────────────────────────────────────────────────────

class TestEmbeddingsFallback:
    """No embedding provider is configured in this test environment — retrieval
    must transparently fall back to keyword scoring rather than erroring."""

    @pytest.mark.asyncio
    async def test_get_embeddings_returns_none_without_provider(self):
        from medgraph.embeddings import get_embeddings

        get_embeddings.cache_clear()
        assert get_embeddings() is None

    @pytest.mark.asyncio
    async def test_embed_text_returns_none_and_keyword_search_still_works(self, mem_mgr):
        from medgraph.embeddings import embed_text

        assert await embed_text("chest pain and dyspnea") is None

        # query_local_memory must still return relevant results via keyword scoring.
        await mem_mgr.store_local_memory(
            patient_id=TEST_PATIENT_ID,
            title="Embeddings Fallback Check",
            content="Patient reports chest pain and dyspnea on exertion.",
        )
        results = await mem_mgr.query_local_memory(
            patient_id=TEST_PATIENT_ID, query_text="chest pain dyspnea", limit=5
        )
        assert any(r.title == "Embeddings Fallback Check" for r in results)

