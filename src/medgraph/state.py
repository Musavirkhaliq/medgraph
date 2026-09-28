"""
MedicalState — the single source of truth for the clinical reasoning graph.

All graph nodes receive this state and return a partial update (TypedDict subset).
LangGraph merges updates immutably on each step.

Design principles:
- No global objects — state is per-invocation / per thread_id
- Append-only lists use Annotated reducers so nodes can safely append without overwrite
- Every field has a sensible default so nodes can safely access any field
"""

import operator
from datetime import datetime, timezone
from typing import Annotated, Any

from typing_extensions import TypedDict


class DemographicsDict(TypedDict, total=False):
    age: int | None
    gender: str | None
    weight_kg: float | None
    height_cm: float | None
    occupation: str | None
    ethnicity: str | None


class SymptomDict(TypedDict, total=False):
    description: str
    severity: str        # mild / moderate / severe
    onset: str
    duration: str
    location: str | None
    character: str | None  # sharp / dull / burning etc.
    aggravating: str | None
    relieving: str | None


class HistoryItem(TypedDict, total=False):
    type: str            # condition / medication / allergy / surgery / family
    description: str
    status: str | None  # active / resolved / controlled
    since: str | None


class QAPair(TypedDict):
    question: str
    answer: str
    round_number: int


class DiagnosisEntry(TypedDict, total=False):
    condition: str
    probability: float          # 0.0 – 1.0
    icd_code: str | None
    evidence: list[str]
    rule_out_tests: list[str]


class MedicationEntry(TypedDict, total=False):
    name: str
    dose: str
    route: str
    frequency: str
    duration: str
    indication: str
    contraindications: list[str]


class InvestigationEntry(TypedDict, total=False):
    test_name: str
    category: str       # lab / imaging / procedure
    indication: str
    priority: str       # urgent / routine / elective
    expected_findings: str | None


class ValidationWarning(TypedDict):
    severity: str       # low / medium / high / critical
    message: str
    field: str | None


class MedicalState(TypedDict, total=False):
    """
    Complete state passed through every node in the medical reasoning graph.

    Append-only fields use ``Annotated[list, operator.add]`` so multiple nodes
    can add items without overwriting each other.
    """

    # ── Session metadata ────────────────────────────────────────────────────
    session_id: str
    started_at: str                            # ISO-8601 timestamp
    completed_at: str | None

    # ── Raw input ───────────────────────────────────────────────────────────
    patient_input: str                         # free-text patient description
    detected_language: str                     # ur / hi / en / auto detected language code

    # ── Intake output ───────────────────────────────────────────────────────
    demographics: DemographicsDict
    symptoms: list[SymptomDict]
    history: list[HistoryItem]

    # ── Triage output ───────────────────────────────────────────────────────
    triage_level: str                          # emergency / urgent / routine
    suspected_domains: list[str]               # cardiology, neurology, etc.
    triage_reasoning: str

    # ── Emergency (early exit) ──────────────────────────────────────────────
    emergency_info: dict[str, Any]             # populated when triage_level=emergency
    is_emergency: bool

    # ── Adaptive Q&A ────────────────────────────────────────────────────────
    pending_questions: list[str]               # queue of questions to ask
    current_question: str | None            # question being asked right now
    qa_pairs: Annotated[list[QAPair], operator.add]     # accumulated Q&A history
    question_round: int                        # current round (1-indexed)
    question_complete: bool                    # True when questioner is done
    image_requested_by_qa: bool                # True if QA asked for an image

    # ── Case building ────────────────────────────────────────────────────────
    case_summary: str
    key_findings: list[str]
    clinical_correlations: str

    # ── Investigations ───────────────────────────────────────────────────────
    investigations: list[InvestigationEntry]
    images_requested: list[str]               # types of images requested
    waiting_for_tests: bool                   # True when graph is paused waiting for test uploads

    # ── Image interpretation ─────────────────────────────────────────────────
    image_paths: Annotated[list[str], operator.add]   # paths to uploaded image files (append-only)
    image_analysis: str                               # free-text interpretation

    # ── Diagnosis ────────────────────────────────────────────────────────────
    differential_diagnosis: list[DiagnosisEntry]
    primary_diagnosis: str | None
    diagnosis_confidence: float               # 0.0 – 1.0

    # ── Treatment ────────────────────────────────────────────────────────────
    medications: list[MedicationEntry]
    procedures: list[dict[str, Any]]
    lifestyle_modifications: list[str]
    follow_up: str
    monitoring: list[str]
    treatment_retry_count: int                 # tracks validation retries

    # ── Safety validation ────────────────────────────────────────────────────
    is_safe: bool
    # Not append-only: each validator pass re-evaluates the current treatment
    # plan from scratch, so this must be a fresh replacement each time rather
    # than accumulating stale warnings from earlier, now-revised retries.
    validation_warnings: list[ValidationWarning]
    validation_recommendations: list[str]

    # ── Memory recall (set by memory_recall_node, right after intake) ──────────
    patient_context: dict[str, Any]                  # profile facts: allergies, chronic_conditions, current_medications, blood_type
    patient_history_snippets: list[dict[str, Any]]    # relevant past local memories for this patient
    relevant_agent_knowledge: list[dict[str, Any]]    # relevant cross-patient global agent memory

    # ── Memory IDs (set by appointment_memory_node after session completes) ───────────
    patient_id: str | None          # patient UUID for memory association
    local_memory_id: str | None     # Supabase ID of stored local patient memory
    global_memory_id: str | None    # Supabase ID of stored global agent memory

    # ── Error handling ───────────────────────────────────────────────────────
    error: str | None
    node_errors: Annotated[list[str], operator.add]


def initial_state(session_id: str, patient_input: str) -> MedicalState:
    """
    Create a fresh ``MedicalState`` for a new session.

    Args:
        session_id: Unique identifier for this patient session.
        patient_input: Free-text patient description provided by the user.

    Returns:
        A ``MedicalState`` dict with all fields initialised to sensible defaults.
    """
    return MedicalState(
        session_id=session_id,
        started_at=datetime.now(timezone.utc).isoformat(),
        completed_at=None,
        patient_input=patient_input,
        detected_language="en",
        demographics={},
        symptoms=[],
        history=[],
        triage_level="",
        suspected_domains=[],
        triage_reasoning="",
        emergency_info={},
        is_emergency=False,
        pending_questions=[],
        current_question=None,
        qa_pairs=[],
        question_round=0,
        question_complete=False,
        image_requested_by_qa=False,
        case_summary="",
        key_findings=[],
        clinical_correlations="",
        investigations=[],
        images_requested=[],
        waiting_for_tests=False,
        image_paths=[],
        image_analysis="",
        differential_diagnosis=[],
        primary_diagnosis=None,
        diagnosis_confidence=0.0,
        medications=[],
        procedures=[],
        lifestyle_modifications=[],
        follow_up="",
        monitoring=[],
        treatment_retry_count=0,
        is_safe=False,
        validation_warnings=[],
        validation_recommendations=[],
        error=None,
        node_errors=[],
        patient_context={},
        patient_history_snippets=[],
        relevant_agent_knowledge=[],
        patient_id=None,
        local_memory_id=None,
        global_memory_id=None,
    )
