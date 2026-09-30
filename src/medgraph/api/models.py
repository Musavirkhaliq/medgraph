"""
Pydantic request / response models for the MedGraph REST API.

Kept separate from the graph state so the API contract can evolve
independently from internal state schema.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

# ── Request models ─────────────────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    """Start a new medical reasoning session."""
    session_id: str = Field(..., description="Unique session identifier")
    patient_id: str | None = Field(None, description="Optional patient ID to associate memory and records with")
    patient_description: str = Field(
        "",
        description="Free-text patient symptoms and history",
    )
    detected_language: str = Field("en", description="Conversation language code (ur, hi, en)")
    patient_description_original: str | None = Field(None, description="Original untranslated patient description")


class AnswerQuestionRequest(BaseModel):
    """Submit a patient answer to the current clinical question."""
    answer: str = Field("", description="Patient or clinician's answer")
    detected_language: str = Field("en", description="Conversation language code (ur, hi, en)")
    answer_original: str | None = Field(None, description="Original untranslated answer text")


class TranslateRequest(BaseModel):
    """Request text translation between clinical conversation languages."""
    text: str = Field(..., description="Text to translate")
    source_lang: str = Field("auto", description="Source language code (e.g. ur, hi, en, auto)")
    target_lang: str = Field("en", description="Target language code (e.g. en, ur, hi)")


class TranslateResponse(BaseModel):
    """Response containing translated text and language metadata."""
    original_text: str
    translated_text: str
    source_lang: str
    target_lang: str


class AddImagesRequest(BaseModel):
    """Declare image file paths that should be analysed."""
    image_paths: list[str] = Field(
        ...,
        description="Absolute or relative paths to medical image files",
    )


class TestResultsRequest(BaseModel):
    """Submit test results (images or text) or skip."""
    image_paths: list[str] = Field(default_factory=list, description="Uploaded image paths")
    text_results: str = Field("", description="Free-text lab or test results")
    skipped: bool = Field(False, description="True if the patient skipped this step")


# ── Response models ────────────────────────────────────────────────────────────

class SessionStartResponse(BaseModel):
    """Response after starting a new session."""
    session_id: str
    status: str
    message: str
    emergency: bool = False
    emergency_info: dict[str, Any] | None = None
    current_question: str | None = None
    current_question_translated: str | None = None
    detected_language: str = "en"


class SessionStateResponse(BaseModel):
    """Current state of an active session."""
    session_id: str
    status: str                 # running / awaiting_answer / complete / error
    current_phase: str
    triage_level: str = ""
    is_emergency: bool = False
    emergency_info: dict[str, Any] | None = None
    current_question: str | None = None
    current_question_translated: str | None = None
    detected_language: str = "en"
    question_round: int = 0
    question_complete: bool = False
    image_requested_by_qa: bool = False
    completion_percentage: float = 0.0
    message: str = ""
    
    # Detailed data for live UI
    demographics: dict[str, Any] | None = None
    symptoms: list[Any] = Field(default_factory=list)
    history: list[Any] = Field(default_factory=list)
    qa_pairs: list[Any] = Field(default_factory=list)
    case_summary: str | None = None
    clinical_correlations: str | None = None
    investigations: list[Any] = Field(default_factory=list)
    image_analysis: str | None = None
    differential_diagnosis: list[Any] = Field(default_factory=list)
    medications: list[Any] = Field(default_factory=list)
    procedures: list[Any] = Field(default_factory=list)
    triage_reasoning: str | None = None
    red_flags: list[Any] = Field(default_factory=list)
    is_safe: bool | None = None
    validation_warnings: list[Any] = Field(default_factory=list)
    validation_recommendations: list[str] = Field(default_factory=list)
    diagnosis_citations: list[str] = Field(default_factory=list)
    treatment_citations: list[str] = Field(default_factory=list)

    # EHR / vitals context surfaced for transparency
    ehr_synced: bool = False
    news2_score: int | None = None
    news2_risk_band: str | None = None

    # Multi-Agent Telemetry Breakdown for deep inspection
    agent_telemetry: dict[str, Any] | None = None

    # What patient/agent memory informed this session (explainability)
    memory_context: dict[str, Any] | None = None


class QuestionResponse(BaseModel):
    """Response after accepting an answer."""
    session_id: str
    status: str
    message: str
    next_question: str | None = None
    next_question_translated: str | None = None
    detected_language: str = "en"
    question_complete: bool = False


class FinalReport(BaseModel):
    """Complete clinical report returned when the pipeline finishes."""
    session_id: str
    is_emergency: bool
    triage_level: str
    primary_diagnosis: str | None
    differential_diagnosis: list[Any]
    diagnosis_confidence: float
    diagnosis_citations: list[str] = Field(default_factory=list)
    medications: list[Any]
    procedures: list[Any]
    lifestyle_modifications: list[str]
    follow_up: str
    monitoring: list[str]
    treatment_citations: list[str] = Field(default_factory=list)
    is_safe: bool
    validation_warnings: list[Any]
    validation_recommendations: list[str]
    image_analysis: str
    disclaimer: str
    started_at: str | None
    completed_at: str | None
    agent_telemetry: dict[str, Any] | None = None

    # EHR / vitals context surfaced for transparency
    ehr_synced: bool = False
    news2_score: int | None = None
    news2_risk_band: str | None = None

    # Doctor review & sign-off (advisory — see POST /sessions/{id}/review)
    review_status: str | None = None       # pending / approved / rejected
    reviewer_id: str | None = None
    review_notes: str | None = None
    reviewed_at: str | None = None
    doctor_edits: dict[str, Any] | None = None


class ReviewSubmitRequest(BaseModel):
    """Doctor's review decision on a completed report (advisory sign-off)."""
    status: str = Field(..., description="'approved' or 'rejected'")
    reviewer_id: str | None = Field(None, description="Reviewing doctor's user ID")
    notes: str | None = Field(None, description="Free-text review notes")
    edited_report: dict[str, Any] | None = Field(
        None, description="Doctor-edited override fields, e.g. {'primary_diagnosis': ..., 'medications': [...]}"
    )


class VitalsSubmitRequest(BaseModel):
    """A single vitals reading to score and persist."""
    heart_rate: int | None = None
    resp_rate: int | None = None
    systolic_bp: int | None = None
    diastolic_bp: int | None = None
    temperature_c: float | None = None
    spo2: int | None = None
    o2_supplemental: bool = False
    consciousness_level: str = "alert"
    session_id: str | None = None
    recorded_by: str | None = None


class ScribeGenerateRequest(BaseModel):
    """Trigger SOAP note generation from the accumulated transcript."""
    additional_notes: str | None = Field(None, description="Optional free-text doctor notes to include")


class HealthResponse(BaseModel):
    """API health check response."""
    status: str
    version: str
    llm_provider: str
    active_sessions: int
    max_sessions: int = 100


class VoiceTranscribeResponse(BaseModel):
    """Response returned after ASR audio transcription."""
    text: str = Field(..., description="Transcribed full text string")
    language: str = Field(..., description="Detected language ISO code (e.g. ur, hi, en)")
    language_name: str = Field(..., description="Display name of language (e.g. Urdu, Hindi, English)")
    language_flag: str = Field(..., description="Emoji flag for language")
    speech_locale: str = Field(..., description="Locale for TTS synthesis (e.g. ur-PK, hi-IN, en-US)")
    language_probability: float = Field(..., description="Confidence score for language detection 0.0-1.0")
    duration: float = Field(..., description="Audio duration in seconds")
    comfort_message: str = Field(..., description="Multilingual clinical comfort phrase")
    segments: list[dict[str, Any]] = Field(default_factory=list, description="Detailed transcript segments")


class VoiceStatusResponse(BaseModel):
    """Response returned for ASR model status."""
    is_loaded: bool
    model_name: str
    device: str
    compute_type: str
    gpu_available: bool
    gpu_name: str | None = None
    supported_languages: list[str] = Field(default_factory=list)

