"""
Pydantic Data Models for User Auth, Patients, Dual-Tier Memory, and Follow-ups.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

UserRole = Literal["doctor", "patient", "admin"]
FollowupStatus = Literal["scheduled", "completed", "missed", "cancelled"]
MemoryCategory = Literal["episodic_visit", "med_intolerance", "chronic_trend", "lab_baseline", "general"]
KnowledgeType = Literal["diagnostic_pattern", "treatment_efficacy", "safety_anomaly", "symptom_cluster"]


class UserProfile(BaseModel):
    """User Profile for Doctor / Patient Auth."""
    model_config = {"extra": "ignore"}

    id: str
    email: str
    full_name: str
    role: UserRole = "patient"
    license_number: str | None = None
    specialty: str | None = None
    department: str | None = None
    phone: str | None = None
    created_at: datetime | str | None = None


class PatientProfile(BaseModel):
    """Patient Clinical Profile & Account metadata."""
    model_config = {"extra": "ignore"}

    id: str
    account_id: str | None = None
    mrn: str
    full_name: str
    date_of_birth: str
    gender: str
    phone: str | None = None
    email: str | None = None
    blood_type: str | None = None
    allergies: list[Any] = Field(default_factory=list)
    chronic_conditions: list[Any] = Field(default_factory=list)
    current_medications: list[Any] = Field(default_factory=list)
    emergency_contact: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | str | None = None


class LocalPatientMemoryItem(BaseModel):
    """Tier 1: Local Patient Memory (Episodic encounter & semantic memory)."""
    model_config = {"extra": "ignore"}

    id: str | None = None
    patient_id: str
    session_id: str | None = None
    memory_category: MemoryCategory = "episodic_visit"
    title: str
    content: str
    relevance_score: float = 1.0
    embedding: list[float] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | str | None = None


class GlobalAgentMemoryItem(BaseModel):
    """Tier 2: Global Agent Memory (Cross-patient collective clinical intelligence)."""
    model_config = {"extra": "ignore"}

    id: str | None = None
    knowledge_type: KnowledgeType = "diagnostic_pattern"
    topic: str
    summary: str
    case_count: int = 1
    confidence_score: float = 0.5
    embedding: list[float] | None = None
    pattern_graph: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | str | None = None


class PatientFollowup(BaseModel):
    """Scheduled Patient Follow-up item."""
    model_config = {"extra": "ignore"}

    id: str | None = None
    session_id: str | None = None
    patient_id: str
    doctor_id: str | None = None
    followup_type: str = "appointment"
    title: str
    description: str | None = None
    due_date: str
    status: FollowupStatus = "scheduled"
    reminder_sent: bool = False
    notes: str | None = None
    created_at: datetime | str | None = None


class AgentTelemetryItem(BaseModel):
    """Telemetry payload recorded per agent node execution."""
    model_config = {"extra": "ignore"}

    id: str | None = None
    session_id: str
    agent_name: str
    status: str = "pending"
    input_data: dict[str, Any] = Field(default_factory=dict)
    output_data: dict[str, Any] = Field(default_factory=dict)
    output_payload: dict[str, Any] = Field(default_factory=dict)
    execution_time_ms: float = 0.0
    executed_at: datetime | str | None = None
    created_at: datetime | str | None = None


class AppointmentSummary(BaseModel):
    """Full appointment summary linking both local and global memory records."""
    model_config = {"extra": "ignore"}

    id: str | None = None
    session_id: str
    patient_id: str | None = None
    local_memory_id: str | None = None
    global_memory_id: str | None = None
    local_summary: str
    global_summary: str
    primary_diagnosis: str | None = None
    triage_level: str | None = None
    medications_prescribed: list[Any] = Field(default_factory=list)
    follow_up_plan: str | None = None
    created_at: datetime | str | None = None


class InterimNoteCreate(BaseModel):
    """Request model for a doctor-written interim note between appointments."""
    note: str                           # Raw free-text doctor note
    doctor_id: str | None = None    # Doctor's user profile ID
    session_id: str | None = None   # Optional: link to a specific session
    patient_name: str | None = None # For context in LLM summary
