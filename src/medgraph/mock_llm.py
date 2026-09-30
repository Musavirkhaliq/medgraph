"""
Mock chat model — lets the full MedGraph pipeline run end-to-end with no LLM
provider configured (no Ollama, no OpenAI key), e.g. for CI, demos, or
sandboxed environments with no model access.

Returns deterministic, schema-shaped JSON per task type so every node's
``parse_llm_json`` succeeds and the graph reaches completion. This is purely a
wiring test double — it performs no real clinical reasoning and must never be
used as a stand-in for actual review of MedGraph's behavior.
"""

from __future__ import annotations

import json
import re
from typing import Any, List, Optional

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult

_CONDITION_KEYWORDS: list[tuple[str, str, str, str]] = [
    # (matched keyword, display name, icd_code, medical domain — the domain
    # feeds the mock triage/case-builder output so guideline_retrieval_node's
    # keyword-overlap query (built from suspected_domains/case_summary) still
    # surfaces the right corpus chunk even though the mock's intake/case
    # summary text is otherwise generic.
    ("asthma", "Acute Asthma Exacerbation", "J45.909", "pulmonology"),
    ("wheez", "Acute Asthma Exacerbation", "J45.909", "pulmonology"),
    ("copd", "COPD Exacerbation", "J44.1", "pulmonology"),
    ("pneumonia", "Community-Acquired Pneumonia", "J18.9", "pulmonology"),
    ("hypertension", "Essential Hypertension", "I10", "cardiology"),
    ("diabet", "Type 2 Diabetes Mellitus", "E11.9", "endocrinology"),
    ("urinary", "Urinary Tract Infection", "N39.0", "urology"),
    ("migraine", "Migraine", "G43.909", "neurology"),
    ("gastroenteritis", "Acute Gastroenteritis", "A09", "gastroenterology"),
    ("rhinitis", "Allergic Rhinitis", "J30.9", "allergy/immunology"),
    ("reflux", "Gastroesophageal Reflux Disease", "K21.9", "gastroenterology"),
    ("back pain", "Acute Low Back Pain", "M54.50", "orthopedics"),
    ("cellulitis", "Cellulitis", "L03.90", "dermatology"),
]


def _extract_citations(text: str) -> list[str]:
    """Pull ``source_citation: ...`` values out of a RAG-augmented prompt.

    ``build_context_prompt`` wraps each one as ``(source_citation: ...)``, so
    the match is trimmed at the closing paren rather than the end of line.
    """
    return list(dict.fromkeys(re.findall(r"source_citation:\s*([^)]+)\)", text)))


def _detect_condition(text: str) -> tuple[str, str, str]:
    text_l = text.lower()
    for kw, name, icd, domain in _CONDITION_KEYWORDS:
        if kw in text_l:
            return name, icd, domain
    return "Acute Viral Upper Respiratory Infection", "J06.9", "internal_medicine"


def _mock_response(task_type: str, prompt_text: str) -> str:
    citations = _extract_citations(prompt_text)
    condition, icd, domain = _detect_condition(prompt_text)
    note = "(mock LLM — no Ollama/OpenAI provider configured)"

    payloads: dict[str, dict[str, Any]] = {
        "intake": {
            "demographics": {"age": 45, "gender": "unknown", "weight_kg": None, "height_cm": None, "occupation": None, "ethnicity": None},
            "symptoms": [{"description": f"presenting complaint consistent with {condition.lower()}", "severity": "moderate", "onset": "recent", "duration": "few days", "location": None, "character": None, "aggravating": None, "relieving": None}],
            "history": [],
        },
        "triage": {
            "triage_level": "urgent",
            "suspected_domains": [domain],
            "reasoning": f"Mock triage {note} — presentation is suggestive of {condition.lower()}.",
            "red_flags": [],
            "time_to_care": "within_hours",
        },
        "questioning": {
            "analysis_of_what_is_missing": f"Mock questioner {note}.",
            "questions_to_ask": [
                "I'm sorry to hear you're experiencing that — when did your symptoms first start, and how severe are they on a scale of 0-10?",
                "Do you have any known drug allergies or current medications?",
                "Do you have any relevant past medical or family history?",
            ],
        },
        "case_builder": {
            "case_summary": f"Mock case summary {note} — clinical picture is most consistent with {condition} ({icd}).",
            "key_findings": [f"Findings consistent with {condition}", "No critical red flags reported"],
            "clinical_correlations": f"Findings are broadly consistent with {condition.lower()} ({domain}).",
            "risk_factors": [],
            "protective_factors": [],
        },
        "investigation": {
            "investigations": [
                {"test_name": "Complete Blood Count (CBC)", "category": "lab", "indication": "Baseline screening", "priority": "routine", "expected_findings": None},
            ],
            "images_requested": [],
            "rationale": f"Mock investigator {note} — baseline workup only.",
        },
        "interpretation": {
            "findings": [{"modality": "unspecified", "finding": f"No acute abnormality {note}", "significance": "normal", "correlation": "Consistent with clinical picture."}],
            "overall_impression": f"Mock interpretation {note}.",
            "urgent_findings": [],
        },
        "diagnosis": {
            "differential_diagnosis": [
                {"condition": condition, "probability": 0.7, "icd_code": icd, "evidence": ["Presenting symptoms", "Clinical context"], "rule_out_tests": []},
            ],
            "primary_diagnosis": condition,
            "diagnosis_confidence": 0.7,
            "reasoning": f"Mock diagnostician {note}.",
            "citations": citations,
        },
        "treatment": {
            "medications": [],
            "procedures": [],
            "lifestyle_modifications": ["Rest and adequate hydration", "Follow up if symptoms worsen"],
            "follow_up": "Follow up with primary care in 7 days or sooner if symptoms worsen.",
            "monitoring": ["Symptom progression"],
            "patient_education": ["Seek urgent care for worsening symptoms."],
            "citations": citations,
        },
        "validation": {
            "is_safe": True,
            "validation_warnings": [],
            "validation_recommendations": [],
            "overall_assessment": f"Mock validator {note} — no safety concerns flagged.",
        },
        "scribe": {
            "subjective": f"Mock SOAP note {note} — reflects transcript content only nominally.",
            "objective": "No objective findings extracted (mock).",
            "assessment": condition,
            "plan": "Follow standard care pathway; mock plan only.",
        },
    }
    payload = payloads.get(task_type, {"message": f"Mock LLM response {note}."})
    return json.dumps(payload)


class MockChatModel(BaseChatModel):
    """Deterministic stand-in for ``ChatOllama``/``ChatOpenAI`` — no network calls."""

    task_type: str = "general"

    @property
    def _llm_type(self) -> str:
        return "mock-medgraph"

    def _generate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        full_text = "\n".join(str(m.content) for m in messages)
        message = AIMessage(content=_mock_response(self.task_type, full_text))
        return ChatResult(generations=[ChatGeneration(message=message)])
