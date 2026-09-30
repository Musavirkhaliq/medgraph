"""
FHIR R4 client.

Same code path either way: in mock mode (default — no ``fhir_server_url``
configured) it reads a local FHIR Bundle JSON fixture per patient; once a real
hospital's FHIR server is available, setting ``fhir_server_url`` switches it to
live ``httpx`` calls against that server with no other code change required.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import httpx

from medgraph.config import get_settings
from medgraph.ehr.models import (
    FHIRAllergy,
    FHIRCondition,
    FHIRMedication,
    FHIRObservation,
    FHIRPatient,
    FHIRPatientBundle,
)

logger = logging.getLogger(__name__)


def _parse_resources(resources: list[dict[str, Any]], patient_id: str) -> FHIRPatientBundle | None:
    """Parse a flat list of FHIR resources (from a Bundle's entries) into a FHIRPatientBundle."""
    patient: FHIRPatient | None = None
    allergies: list[FHIRAllergy] = []
    medications: list[FHIRMedication] = []
    conditions: list[FHIRCondition] = []
    observations: list[FHIRObservation] = []

    for res in resources:
        rtype = res.get("resourceType")
        if rtype == "Patient":
            name_parts = (res.get("name") or [{}])[0]
            full_name = " ".join(
                [*name_parts.get("given", []), name_parts.get("family", "")]
            ).strip()
            patient = FHIRPatient(
                id=res.get("id", patient_id),
                full_name=full_name or res.get("id", patient_id),
                gender=res.get("gender"),
                birth_date=res.get("birthDate"),
                mrn=next(
                    (idf.get("value") for idf in res.get("identifier", []) if idf.get("value")),
                    None,
                ),
            )
        elif rtype == "AllergyIntolerance":
            substance = (
                res.get("code", {}).get("text")
                or (res.get("code", {}).get("coding") or [{}])[0].get("display")
                or "Unknown allergen"
            )
            reaction = None
            reactions = res.get("reaction") or []
            if reactions:
                manifestations = reactions[0].get("manifestation") or []
                if manifestations:
                    reaction = manifestations[0].get("text") or (manifestations[0].get("coding") or [{}])[0].get("display")
            allergies.append(
                FHIRAllergy(
                    substance=substance,
                    reaction=reaction,
                    severity=(res.get("reaction") or [{}])[0].get("severity") if reactions else None,
                    status=(res.get("clinicalStatus", {}).get("coding") or [{}])[0].get("code", "active"),
                )
            )
        elif rtype in ("MedicationRequest", "MedicationStatement"):
            med_code = res.get("medicationCodeableConcept", {})
            name = med_code.get("text") or (med_code.get("coding") or [{}])[0].get("display") or "Unknown medication"
            dosage_instr = (res.get("dosageInstruction") or [{}])[0]
            medications.append(
                FHIRMedication(
                    name=name,
                    dosage=dosage_instr.get("text"),
                    route=(dosage_instr.get("route", {}).get("text")),
                    frequency=(dosage_instr.get("timing", {}).get("code", {}).get("text")),
                    status=res.get("status", "active"),
                )
            )
        elif rtype == "Condition":
            code = res.get("code", {})
            coding = (code.get("coding") or [{}])[0]
            conditions.append(
                FHIRCondition(
                    name=code.get("text") or coding.get("display") or "Unknown condition",
                    icd_code=coding.get("code"),
                    status=(res.get("clinicalStatus", {}).get("coding") or [{}])[0].get("code", "active"),
                    onset=res.get("onsetDateTime"),
                )
            )
        elif rtype == "Observation":
            code = res.get("code", {})
            value_quantity = res.get("valueQuantity", {})
            observations.append(
                FHIRObservation(
                    code=code.get("text") or (code.get("coding") or [{}])[0].get("display", "unknown"),
                    value=str(value_quantity.get("value", res.get("valueString", ""))),
                    unit=value_quantity.get("unit"),
                    effective_date=res.get("effectiveDateTime"),
                )
            )

    if patient is None:
        return None

    return FHIRPatientBundle(
        patient=patient,
        allergies=allergies,
        medications=medications,
        conditions=conditions,
        observations=observations,
    )


class FHIRClient:
    """Reads a patient's FHIR R4 record from a mock fixture or a real server."""

    def __init__(self) -> None:
        settings = get_settings()
        self.fhir_server_url = settings.fhir_server_url
        self.mock_dir = Path(settings.fhir_mock_dir)
        self.is_live = bool(self.fhir_server_url)

    async def _get_patient_bundle_live(self, patient_id: str) -> FHIRPatientBundle | None:
        base = self.fhir_server_url.rstrip("/")
        resources: list[dict[str, Any]] = []
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                patient_res = await client.get(f"{base}/Patient/{patient_id}")
                patient_res.raise_for_status()
                resources.append(patient_res.json())
            except Exception as exc:
                logger.warning("[FHIRClient] Patient/%s lookup failed: %s", patient_id, exc)
                return None

            for resource_type in ("AllergyIntolerance", "MedicationRequest", "Condition", "Observation"):
                try:
                    res = await client.get(f"{base}/{resource_type}", params={"patient": patient_id})
                    res.raise_for_status()
                    bundle = res.json()
                    resources.extend(e.get("resource", {}) for e in bundle.get("entry", []))
                except Exception as exc:
                    logger.debug("[FHIRClient] %s search for patient %s failed: %s", resource_type, patient_id, exc)

        return _parse_resources(resources, patient_id)

    def _get_patient_bundle_mock(self, patient_id: str) -> FHIRPatientBundle | None:
        fixture_path = self.mock_dir / f"{patient_id}.json"
        if not fixture_path.exists():
            return None
        try:
            bundle = json.loads(fixture_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("[FHIRClient] Failed to read mock fixture %s: %s", fixture_path, exc)
            return None

        resources = [e.get("resource", {}) for e in bundle.get("entry", [])]
        return _parse_resources(resources, patient_id)

    async def get_patient_bundle(self, patient_id: str) -> FHIRPatientBundle | None:
        """Fetch a patient's full FHIR record (mock fixture, or live server if configured)."""
        if self.is_live:
            return await self._get_patient_bundle_live(patient_id)
        return self._get_patient_bundle_mock(patient_id)


_fhir_client_instance: FHIRClient | None = None


def get_fhir_client() -> FHIRClient:
    """Retrieve the global FHIRClient singleton."""
    global _fhir_client_instance
    if _fhir_client_instance is None:
        _fhir_client_instance = FHIRClient()
    return _fhir_client_instance
