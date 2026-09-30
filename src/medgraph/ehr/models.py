"""
Thin Pydantic models for the subset of FHIR R4 resources MedGraph consumes.

These are deliberately not a full FHIR spec implementation — only the fields
this app actually reads from Patient / AllergyIntolerance / MedicationRequest /
Condition / Observation resources.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class FHIRPatient(BaseModel):
    id: str
    full_name: str = ""
    gender: str | None = None
    birth_date: str | None = None
    mrn: str | None = None


class FHIRAllergy(BaseModel):
    substance: str
    reaction: str | None = None
    severity: str | None = None  # mild / moderate / severe
    status: str = "active"


class FHIRMedication(BaseModel):
    name: str
    dosage: str | None = None
    route: str | None = None
    frequency: str | None = None
    status: str = "active"


class FHIRCondition(BaseModel):
    name: str
    icd_code: str | None = None
    status: str = "active"
    onset: str | None = None


class FHIRObservation(BaseModel):
    code: str
    value: str
    unit: str | None = None
    effective_date: str | None = None


class FHIRPatientBundle(BaseModel):
    """Everything memory_recall_node needs about a patient's external record."""

    patient: FHIRPatient
    allergies: list[FHIRAllergy] = Field(default_factory=list)
    medications: list[FHIRMedication] = Field(default_factory=list)
    conditions: list[FHIRCondition] = Field(default_factory=list)
    observations: list[FHIRObservation] = Field(default_factory=list)
