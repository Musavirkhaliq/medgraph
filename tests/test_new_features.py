"""
Tests for the five feature additions: NEWS2 early warning, guideline RAG
retrieval (in-memory fallback), and FHIR-to-patient_context mapping.

No LLM or network access required.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from medgraph.services.early_warning import calculate_news2
from medgraph.ehr.mapper import merge_fhir_into_patient_context
from medgraph.ehr.models import FHIRAllergy, FHIRCondition, FHIRMedication, FHIRPatient, FHIRPatientBundle


class TestNews2Scoring:
    def test_normal_vitals_score_zero_low_risk(self):
        result = calculate_news2({
            "resp_rate": 16, "spo2": 98, "o2_supplemental": False,
            "systolic_bp": 120, "heart_rate": 75, "consciousness_level": "alert",
            "temperature_c": 37.0,
        })
        assert result["score"] == 0
        assert result["risk_band"] == "low"

    def test_critical_vitals_score_high_risk(self):
        result = calculate_news2({
            "resp_rate": 28, "spo2": 88, "o2_supplemental": True,
            "systolic_bp": 85, "heart_rate": 135, "consciousness_level": "unresponsive",
            "temperature_c": 34.5,
        })
        assert result["score"] >= 7
        assert result["risk_band"] == "high"

    def test_missing_fields_default_to_zero_contribution(self):
        result = calculate_news2({"heart_rate": 75})
        assert result["score"] == 0
        assert result["risk_band"] == "low"

    def test_single_severe_component_forces_at_least_medium(self):
        # SpO2 of 88 alone scores 3 points (component max) but total score is
        # below the "medium" band's 5-point threshold — the single-component
        # escalation rule must still apply.
        result = calculate_news2({"spo2": 88})
        assert result["component_scores"]["spo2"] == 3
        assert result["risk_band"] in ("medium", "high")


class TestFHIRMapper:
    def test_merge_adds_ehr_sourced_facts(self):
        bundle = FHIRPatientBundle(
            patient=FHIRPatient(id="pat-001", full_name="John Doe", mrn="MRN-2026-0891"),
            allergies=[FHIRAllergy(substance="Penicillin", reaction="Urticaria", status="active")],
            conditions=[FHIRCondition(name="Asthma", icd_code="J45", status="active")],
            medications=[FHIRMedication(name="Albuterol HFA", status="active")],
        )
        merged = merge_fhir_into_patient_context({}, bundle)
        assert any(a["allergen"] == "Penicillin" for a in merged["allergies"])
        assert any(c["condition"] == "Asthma" for c in merged["chronic_conditions"])
        assert any(m["name"] == "Albuterol HFA" for m in merged["current_medications"])
        assert merged["ehr_mrn"] == "MRN-2026-0891"

    def test_merge_deduplicates_against_existing_context(self):
        existing = {"allergies": [{"allergen": "Penicillin", "source": "local_memory"}]}
        bundle = FHIRPatientBundle(
            patient=FHIRPatient(id="pat-001", full_name="John Doe"),
            allergies=[FHIRAllergy(substance="Penicillin", status="active")],
        )
        merged = merge_fhir_into_patient_context(existing, bundle)
        assert len(merged["allergies"]) == 1

    def test_inactive_allergy_not_merged(self):
        bundle = FHIRPatientBundle(
            patient=FHIRPatient(id="pat-001", full_name="John Doe"),
            allergies=[FHIRAllergy(substance="Sulfa", status="resolved")],
        )
        merged = merge_fhir_into_patient_context({}, bundle)
        assert merged["allergies"] == []


class TestGuidelineStoreFallback:
    @pytest.mark.asyncio
    async def test_query_guidelines_keyword_fallback(self):
        from medgraph.services import guideline_store

        guideline_store._guideline_chunks_db.clear()
        guideline_store._guideline_chunks_db.append({
            "id": "gc-1", "condition": "Asthma",
            "chunk_text": "Recurrent wheeze and dyspnea, treated with albuterol.",
            "source_citation": "test-fixture",
        })
        guideline_store._guideline_chunks_db.append({
            "id": "gc-2", "condition": "Urinary Tract Infection",
            "chunk_text": "Dysuria and frequency, treated with nitrofurantoin.",
            "source_citation": "test-fixture",
        })

        results = await guideline_store.query_guidelines("wheeze and asthma dyspnea", limit=5)
        assert results
        assert results[0]["condition"] == "Asthma"

    @pytest.mark.asyncio
    async def test_query_guidelines_empty_corpus_returns_empty(self):
        from medgraph.services import guideline_store

        guideline_store._guideline_chunks_db.clear()
        results = await guideline_store.query_guidelines("anything", limit=5)
        assert results == []
