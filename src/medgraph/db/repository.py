"""
Database Repository for Patients, Doctor Consultations, Follow-ups, and Telemetry.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from medgraph.db.client import get_db_client
from medgraph.db.models import AgentTelemetryItem, PatientFollowup, PatientProfile

logger = logging.getLogger(__name__)

# In-memory local stores for dev fallback
_patients_db: dict[str, dict] = {
    "pat-001": {
        "id": "pat-001",
        "account_id": "pat-001",
        "mrn": "MRN-2026-0891",
        "full_name": "John Doe",
        "date_of_birth": "1976-04-12",
        "gender": "male",
        "phone": "+1-555-0192",
        "email": "patient@medai.ltm",
        "blood_type": "O+",
        "allergies": [
            {"allergen": "Penicillin", "reaction": "Urticaria, Lip Swelling", "severity": "Severe"}
        ],
        "chronic_conditions": [
            {"condition": "Asthma (J45)", "diagnosed_year": 2018, "status": "Active"},
            {"condition": "Mild Essential Hypertension (I10)", "diagnosed_year": 2021, "status": "Controlled"}
        ],
        "current_medications": [
            {"name": "Albuterol HFA", "dosage": "90 mcg", "route": "Inhalation", "frequency": "PRN"},
            {"name": "Lisinopril", "dosage": "10 mg", "route": "Oral", "frequency": "Daily"}
        ],
        "emergency_contact": {"name": "Jane Doe", "relation": "Spouse", "phone": "+1-555-0193"},
        "created_at": "2025-01-01T00:00:00Z"
    }
}

_followups_db: list[dict] = [
    {
        "id": "flw-001",
        "session_id": "sess-prev-01",
        "patient_id": "pat-001",
        "doctor_id": "doc-001",
        "followup_type": "lab_test",
        "title": "Repeat Pulmonary Function Test (PFT)",
        "description": "Evaluate post-treatment FEV1 and peak flow response.",
        "due_date": "2026-08-15",
        "status": "scheduled",
        "reminder_sent": False,
        "notes": "Fast 4 hours prior if bloodwork added.",
        "created_at": "2026-07-28T10:00:00Z"
    }
]


async def get_patient_by_account_id(account_id: str) -> PatientProfile | None:
    """Find patient clinical record by Patient Auth Account ID."""
    from medgraph.db.client import to_uuid_safe
    acc_uuid = to_uuid_safe(account_id)
    client = get_db_client()
    if client.is_configured:
        rows = await client.rest_request("GET", "patients", params={"account_id": f"eq.{acc_uuid}"})
        if rows:
            return PatientProfile(**rows[0])

    for p in _patients_db.values():
        if p.get("account_id") in (account_id, acc_uuid) or p.get("id") in (account_id, acc_uuid):
            return PatientProfile(**p)
    return None


async def get_patient_by_mrn_or_id(query: str) -> PatientProfile | None:
    """Lookup patient profile by MRN, ID, or Email."""
    from medgraph.db.client import to_uuid_safe
    q_clean = query.strip()
    q_uuid = to_uuid_safe(q_clean)
    client = get_db_client()
    if client.is_configured:
        rows = await client.rest_request("GET", "patients", params={"mrn": f"eq.{q_clean}"})
        if not rows:
            rows = await client.rest_request("GET", "patients", params={"id": f"eq.{q_uuid}"})
        if rows:
            return PatientProfile(**rows[0])

    for p in _patients_db.values():
        if p["mrn"] == q_clean or p["id"] in (q_clean, q_uuid) or p.get("email") == q_clean:
            return PatientProfile(**p)
    return None


async def search_patients(search_term: str = "") -> list[PatientProfile]:
    """Search patient profiles for Doctor consultation selector."""
    if not search_term:
        return [PatientProfile(**p) for p in _patients_db.values()]

    st_lower = search_term.lower()
    matches = []
    for p in _patients_db.values():
        if (
            st_lower in p["full_name"].lower()
            or st_lower in p["mrn"].lower()
            or st_lower in (p.get("email") or "").lower()
        ):
            matches.append(PatientProfile(**p))
    return matches


async def create_patient_profile(
    full_name: str,
    date_of_birth: str,
    gender: str,
    mrn: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    account_id: str | None = None,
    allergies: list[Any] | None = None,
    chronic_conditions: list[Any] | None = None,
    current_medications: list[Any] | None = None,
) -> PatientProfile:
    """Create a new patient clinical record."""
    new_id = str(uuid.uuid4())
    mrn_val = mrn or f"MRN-2026-{uuid.uuid4().hex[:4].upper()}"
    p_dict: dict[str, Any] = {
        "id": new_id,
        "account_id": account_id,
        "mrn": mrn_val,
        "full_name": full_name,
        "date_of_birth": date_of_birth,
        "gender": gender,
        "phone": phone,
        "email": email,
        "blood_type": "Unknown",
        "allergies": allergies or [],
        "chronic_conditions": chronic_conditions or [],
        "current_medications": current_medications or [],
        "emergency_contact": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    client = get_db_client()
    if client.is_configured:
        await client.rest_request("POST", "patients", json_data=p_dict)

    _patients_db[new_id] = p_dict
    logger.info("[Repository] Created patient profile %s (%s)", full_name, mrn_val)
    return PatientProfile.model_validate(p_dict)


async def schedule_followup(
    patient_id: str,
    title: str,
    due_date: str,
    followup_type: str = "appointment",
    description: str | None = None,
    doctor_id: str | None = None,
    session_id: str | None = None,
    notes: str | None = None,
) -> PatientFollowup:
    """Schedule a patient follow-up task."""
    from medgraph.db.client import to_uuid_safe
    flw_id = str(uuid.uuid4())
    flw_dict = {
        "id": flw_id,
        "session_id": session_id,
        "patient_id": to_uuid_safe(patient_id),
        "doctor_id": doctor_id,
        "followup_type": followup_type,
        "title": title,
        "description": description,
        "due_date": due_date,
        "status": "scheduled",
        "reminder_sent": False,
        "notes": notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    client = get_db_client()
    if client.is_configured:
        await client.rest_request("POST", "patient_followups", json_data=flw_dict)

    _followups_db.append(flw_dict)
    logger.info("[Repository] Scheduled follow-up '%s' for patient %s", title, patient_id)
    return PatientFollowup.model_validate(flw_dict)


async def list_patient_followups(patient_id: str) -> list[PatientFollowup]:
    """Retrieve all follow-ups for a patient cleanly."""
    from medgraph.db.client import to_uuid_safe
    client = get_db_client()
    pid_uuid = to_uuid_safe(patient_id)
    if client.is_configured:
        rows = await client.rest_request("GET", "patient_followups", params={"patient_id": f"eq.{pid_uuid}"})
        if rows:
            return [PatientFollowup.model_validate(r) for r in rows]

    items = [f for f in _followups_db if f["patient_id"] in (patient_id, pid_uuid)]
    items.sort(key=lambda x: x.get("due_date", ""))
    return [PatientFollowup.model_validate(f) for f in items]


_telemetry_db: list[dict] = []

async def log_agent_telemetry(
    session_id: str,
    agent_name: str,
    status: str = "complete",
    input_data: dict | None = None,
    output_data: dict | None = None,
    execution_time_ms: float | None = None,
) -> AgentTelemetryItem:
    """Persist agent execution telemetry to Supabase / Local store."""
    from medgraph.db.client import to_uuid_safe
    t_id = str(uuid.uuid4())
    sess_uuid = to_uuid_safe(session_id)
    t_dict = {
        "id": t_id,
        "session_id": sess_uuid,
        "agent_name": agent_name,
        "status": status,
        "input_data": input_data or {},
        "output_data": output_data or {},
        "execution_time_ms": execution_time_ms or 0.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    client = get_db_client()
    if client.is_configured:
        await client.rest_request("POST", "agent_telemetry", json_data=t_dict)
    _telemetry_db.append(t_dict)
    return AgentTelemetryItem.model_validate(t_dict)


async def get_session_telemetry(session_id: str) -> list[AgentTelemetryItem]:
    """Retrieve all agent telemetries for a session."""
    from medgraph.db.client import to_uuid_safe
    client = get_db_client()
    sess_uuid = to_uuid_safe(session_id)
    if client.is_configured:
        rows = await client.rest_request("GET", "agent_telemetry", params={"session_id": f"eq.{sess_uuid}"})
        if rows:
            return [AgentTelemetryItem.model_validate(r) for r in rows]

    items = [t for t in _telemetry_db if t["session_id"] in (session_id, sess_uuid)]
    return [AgentTelemetryItem.model_validate(t) for t in items]
