"""
Tests for the MedGraph clinical reasoning nodes.

These tests mock the LLM to avoid requiring an actual Ollama/OpenAI connection.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from medgraph.nodes._utils import build_context_prompt, parse_llm_json
from medgraph.nodes.intake import IntakeResult, intake_node
from medgraph.nodes.memory_recall import memory_recall_node
from medgraph.nodes.questioner import QuestionResult, questioner_node, questioner_router
from medgraph.nodes.triage import triage_node, triage_router
from medgraph.nodes.validator import validator_node, validator_router
from medgraph.state import initial_state

# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def sample_state():
    return initial_state(
        "test-session-001",
        "45-year-old male with chest pain and shortness of breath for 2 hours. "
        "History of hypertension. Smokes 1 pack/day.",
    )


@pytest.fixture
def post_intake_state(sample_state):
    """State with intake data already populated."""
    return {
        **sample_state,
        "demographics": {"age": 45, "gender": "male"},
        "symptoms": [
            {"description": "chest pain", "severity": "severe", "onset": "sudden"},
            {"description": "shortness of breath", "severity": "moderate", "duration": "2 hours"},
        ],
        "history": [{"type": "condition", "description": "hypertension", "status": "active"}],
    }


@pytest.fixture
def post_triage_state(post_intake_state):
    return {
        **post_intake_state,
        "triage_level": "urgent",
        "suspected_domains": ["cardiology", "emergency_medicine"],
        "triage_reasoning": "Chest pain with shortness of breath in hypertensive smoker",
        "is_emergency": False,
        "emergency_info": {},
    }


# ── Utility tests ─────────────────────────────────────────────────────────────

class TestParseJson:
    def test_clean_json(self):
        raw = '{"age": 45, "gender": "male"}'
        result = parse_llm_json(raw, IntakeResult, "test")
        # Should parse without error; IntakeResult doesn't have age directly
        assert isinstance(result, IntakeResult)

    def test_json_in_markdown_fence(self):
        raw = '```json\n{"questions_to_ask": ["How long have you had this pain?"], "analysis_of_what_is_missing": "need duration"}\n```'
        result = parse_llm_json(raw, QuestionResult, "test")
        assert result.questions_to_ask == ["How long have you had this pain?"]

    def test_invalid_json_returns_default(self):
        raw = "This is not JSON at all!"
        result = parse_llm_json(raw, QuestionResult, "test")
        assert isinstance(result, QuestionResult)
        assert result.questions_to_ask == []


class TestBuildContext:
    def test_empty_state(self):
        ctx = build_context_prompt({})
        assert ctx == ""

    def test_with_patient_input(self, sample_state):
        ctx = build_context_prompt(sample_state)
        assert "PATIENT DESCRIPTION" in ctx
        assert "chest pain" in ctx.lower()

    def test_includes_qa_pairs(self, post_triage_state):
        state = {
            **post_triage_state,
            "qa_pairs": [
                {"question": "Any family history?", "answer": "Father had MI", "round_number": 1}
            ],
        }
        ctx = build_context_prompt(state)
        assert "Q&A HISTORY" in ctx
        assert "Father had MI" in ctx


# ── Intake node tests ─────────────────────────────────────────────────────────

class TestIntakeNode:
    def test_returns_demographics_and_symptoms(self, sample_state):
        mock_response = MagicMock()
        mock_response.content = """{
            "demographics": {"age": 45, "gender": "male"},
            "symptoms": [{"description": "chest pain", "severity": "severe", "onset": "sudden", "duration": "2 hours"}],
            "history": [{"type": "condition", "description": "hypertension", "status": "active"}]
        }"""

        with patch("medgraph.nodes.intake.get_llm") as mock_llm:
            mock_llm.return_value.invoke.return_value = mock_response
            result = intake_node(sample_state)

        assert "demographics" in result
        assert result["demographics"]["age"] == 45
        assert len(result["symptoms"]) == 1
        assert result["symptoms"][0]["description"] == "chest pain"

    def test_handles_llm_error_gracefully(self, sample_state):
        with patch("medgraph.nodes.intake.get_llm") as mock_llm:
            mock_llm.return_value.invoke.side_effect = Exception("LLM unavailable")
            result = intake_node(sample_state)

        assert result["demographics"] == {}
        assert result["symptoms"] == []
        assert len(result["node_errors"]) > 0


# ── Triage node tests ─────────────────────────────────────────────────────────

class TestTriageNode:
    def test_detects_emergency_from_keywords(self, sample_state):
        """Should detect 'chest pain' as requiring at least urgent care."""
        state = {**sample_state, "patient_input": "Patient having a heart attack now"}
        result = triage_node(state)
        assert result["is_emergency"] is True
        assert result["triage_level"] == "emergency"

    def test_routine_case(self):
        state = initial_state("s2", "Patient has mild cold symptoms for 3 days.")
        mock_response = MagicMock()
        mock_response.content = """{
            "triage_level": "routine",
            "suspected_domains": ["general_medicine"],
            "reasoning": "Mild URI symptoms"
        }"""
        with patch("medgraph.nodes.triage.get_llm") as mock_llm:
            mock_llm.return_value.invoke.return_value = mock_response
            result = triage_node(state)

        assert result["triage_level"] == "routine"
        assert result["is_emergency"] is False


class TestTriageRouter:
    def test_routes_emergency(self):
        state = {"is_emergency": True}
        assert triage_router(state) == "emergency"

    def test_routes_continue_for_non_emergency(self):
        state = {"is_emergency": False}
        assert triage_router(state) == "continue"


# ── Questioner node tests ─────────────────────────────────────────────────────

class TestQuestionerNode:
    def test_asks_question_when_info_incomplete(self, post_triage_state):
        mock_response = MagicMock()
        mock_response.content = """{
            "questions_to_ask": ["Do you have any family history of heart disease?"],
            "analysis_of_what_is_missing": "Important for risk stratification"
        }"""
        with patch("medgraph.nodes.questioner.get_llm") as mock_llm:
            mock_llm.return_value.invoke.return_value = mock_response
            result = questioner_node(post_triage_state)

        assert result["current_question"] == "Do you have any family history of heart disease?"
        assert result["question_complete"] is False
        assert result["question_round"] == 1

    def test_stops_when_no_more_questions_needed(self, post_triage_state):
        mock_response = MagicMock()
        mock_response.content = '{"questions_to_ask": [], "analysis_of_what_is_missing": "Sufficient information"}'
        with patch("medgraph.nodes.questioner.get_llm") as mock_llm:
            mock_llm.return_value.invoke.return_value = mock_response
            result = questioner_node(post_triage_state)

        assert result["question_complete"] is True

    def test_stops_at_max_rounds(self, post_triage_state):
        """Should short-circuit without calling LLM when max rounds reached."""
        state = {**post_triage_state, "question_round": 5}  # default max is 5
        result = questioner_node(state)
        assert result["question_complete"] is True


class TestQuestionerRouter:
    def test_routes_ask_when_question_pending(self):
        state = {"question_complete": False, "current_question": "Any allergies?"}
        assert questioner_router(state) == "ask"

    def test_routes_done_when_complete(self):
        state = {"question_complete": True}
        assert questioner_router(state) == "done"


# ── Validator node tests ──────────────────────────────────────────────────────

class TestValidatorNode:
    def test_flags_missing_follow_up(self, post_triage_state):
        state = {
            **post_triage_state,
            "medications": [{"name": "aspirin", "dose": "325mg"}],
            "procedures": [],
            "follow_up": "",   # missing!
            "monitoring": [],
        }
        mock_response = MagicMock()
        mock_response.content = """{
            "is_safe": true,
            "validation_warnings": [],
            "validation_recommendations": ["Add follow-up instructions"],
            "overall_assessment": "Minor issues"
        }"""
        with patch("medgraph.nodes.validator.get_llm") as mock_llm:
            mock_llm.return_value.invoke.return_value = mock_response
            result = validator_node(state)

        # Rule-based check should catch missing follow_up
        warnings = result["validation_warnings"]
        assert any("follow-up" in w.get("message", "").lower() for w in warnings)

    def test_flags_known_allergy_even_if_llm_misses_it(self, post_triage_state):
        """A documented allergy must be caught deterministically, independent of the LLM."""
        state = {
            **post_triage_state,
            "patient_context": {"allergies": [{"allergen": "Penicillin"}]},
            "medications": [{"name": "Amoxicillin", "dose": "500mg"}],
            "procedures": [],
            "follow_up": "Review in 1 week",
            "monitoring": ["Symptom tracking"],
        }
        mock_response = MagicMock()
        mock_response.content = """{
            "is_safe": true,
            "validation_warnings": [],
            "validation_recommendations": [],
            "overall_assessment": "Looks fine"
        }"""
        with patch("medgraph.nodes.validator.get_llm") as mock_llm:
            mock_llm.return_value.invoke.return_value = mock_response
            result = validator_node(state)

        warnings = result["validation_warnings"]
        assert any(w.get("severity") == "critical" for w in warnings)
        assert result["is_safe"] is False


class TestMemoryRecallNode:
    """memory_recall_node loads per-patient and cross-patient memory into the session."""

    @pytest.mark.asyncio
    async def test_loads_profile_and_history_when_patient_id_present(self, post_intake_state):
        state = {**post_intake_state, "patient_id": "pat-001"}

        fake_profile = MagicMock(
            allergies=[{"allergen": "Penicillin"}],
            chronic_conditions=["Asthma"],
            current_medications=["Albuterol"],
            blood_type="O+",
        )
        fake_history_item = MagicMock(
            title="Prior Asthma Visit", content="Responded to nebulizer.",
            memory_category="episodic_visit", created_at="2025-01-01T00:00:00Z",
        )
        fake_knowledge_item = MagicMock(
            topic="Asthma Pattern", summary="Common presentation.",
            knowledge_type="diagnostic_pattern", confidence_score=0.9,
        )

        mock_mgr = MagicMock()
        mock_mgr.query_local_memory = AsyncMock(return_value=[fake_history_item])
        mock_mgr.query_global_memory = AsyncMock(return_value=[fake_knowledge_item])

        with (
            patch("medgraph.db.memory_manager.get_memory_manager", return_value=mock_mgr),
            patch("medgraph.db.repository.get_patient_by_account_id", AsyncMock(return_value=fake_profile)),
        ):
            result = await memory_recall_node(state)

        assert result["patient_context"]["allergies"] == [{"allergen": "Penicillin"}]
        assert result["patient_history_snippets"][0]["title"] == "Prior Asthma Visit"
        assert result["relevant_agent_knowledge"][0]["topic"] == "Asthma Pattern"

    @pytest.mark.asyncio
    async def test_no_patient_id_returns_empty_defaults_without_error(self, post_intake_state):
        state = {**post_intake_state, "patient_id": None}

        mock_mgr = MagicMock()
        mock_mgr.query_local_memory = AsyncMock(return_value=[])
        mock_mgr.query_global_memory = AsyncMock(return_value=[])

        with patch("medgraph.db.memory_manager.get_memory_manager", return_value=mock_mgr):
            result = await memory_recall_node(state)

        assert result["patient_context"] == {}
        assert result["patient_history_snippets"] == []
        mock_mgr.query_local_memory.assert_not_called()
        mock_mgr.query_global_memory.assert_called_once()

    @pytest.mark.asyncio
    async def test_manager_failure_is_non_fatal(self, post_intake_state):
        state = {**post_intake_state, "patient_id": "pat-001"}

        mock_mgr = MagicMock()
        mock_mgr.query_local_memory = AsyncMock(side_effect=RuntimeError("db down"))
        mock_mgr.query_global_memory = AsyncMock(side_effect=RuntimeError("db down"))

        with (
            patch("medgraph.db.memory_manager.get_memory_manager", return_value=mock_mgr),
            patch("medgraph.db.repository.get_patient_by_account_id", AsyncMock(side_effect=RuntimeError("db down"))),
            patch("medgraph.db.repository.get_patient_by_mrn_or_id", AsyncMock(return_value=None)),
        ):
            result = await memory_recall_node(state)  # must not raise

        assert result["patient_history_snippets"] == []
        assert result["relevant_agent_knowledge"] == []
        assert len(result.get("node_errors", [])) > 0


class TestValidatorRouter:
    def test_routes_safe_when_valid(self):
        state = {"is_safe": True, "treatment_retry_count": 0}
        assert validator_router(state) == "safe"

    def test_routes_retry_when_unsafe_and_retries_remain(self):
        state = {"is_safe": False, "treatment_retry_count": 0}
        assert validator_router(state) == "retry"

    def test_routes_safe_when_max_retries_exceeded(self):
        state = {"is_safe": False, "treatment_retry_count": 2}
        assert validator_router(state) == "safe"


# ── Safety module tests ───────────────────────────────────────────────────────

class TestSafety:
    def test_detects_critical_chest_pain(self):
        from medgraph.safety import detect_emergency
        result = detect_emergency("Patient has severe chest pain")
        assert result["is_emergency"] is True
        assert result["level"] == "critical"

    def test_detects_urgent_high_fever(self):
        from medgraph.safety import detect_emergency
        result = detect_emergency("High fever of 40 degrees")
        assert result["is_emergency"] is True
        assert result["level"] == "urgent"

    def test_routine_case_not_flagged(self):
        from medgraph.safety import detect_emergency
        result = detect_emergency("Mild headache for 2 days, no other symptoms")
        assert result["is_emergency"] is False

    def test_drug_interaction_checker(self):
        from medgraph.tools.drug_checker import check_drug_interactions
        result = check_drug_interactions.invoke({"medications": ["warfarin 5mg", "aspirin 325mg"]})
        assert "interaction" in result.lower()

    def test_no_drug_interactions(self):
        from medgraph.tools.drug_checker import check_drug_interactions
        result = check_drug_interactions.invoke({"medications": ["paracetamol", "vitamin D"]})
        assert "no known" in result.lower()
