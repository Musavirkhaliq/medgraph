"""
Maps FHIR resources into MedGraph's existing ``patient_context`` shape
(``allergies``/``chronic_conditions``/``current_medications``/``blood_type``,
as already produced by ``memory_recall_node._extract_patient_context``) so
every downstream node needs no changes to consume EHR-sourced data.
"""

from __future__ import annotations

from typing import Any

from medgraph.ehr.models import FHIRPatientBundle


def _dedupe_by_key(items: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for item in items:
        k = str(item.get(key, "")).strip().lower()
        if k and k not in seen:
            seen.add(k)
            out.append(item)
    return out


def merge_fhir_into_patient_context(
    patient_context: dict[str, Any], bundle: FHIRPatientBundle
) -> dict[str, Any]:
    """
    Merge a FHIR patient bundle into an existing ``patient_context`` dict.

    EHR-sourced facts are appended alongside (not overwritten by) whatever the
    app's own memory already knew, then de-duplicated — the EHR is treated as
    an additional source of truth, not the only one.
    """
    merged = dict(patient_context)

    ehr_allergies = [
        {"allergen": a.substance, "reaction": a.reaction, "severity": a.severity, "source": "ehr"}
        for a in bundle.allergies
        if a.status == "active"
    ]
    merged["allergies"] = _dedupe_by_key(
        [*(merged.get("allergies") or []), *ehr_allergies], "allergen"
    )

    ehr_conditions = [
        {"condition": c.name, "icd_code": c.icd_code, "status": c.status, "source": "ehr"}
        for c in bundle.conditions
    ]
    merged["chronic_conditions"] = _dedupe_by_key(
        [*(merged.get("chronic_conditions") or []), *ehr_conditions], "condition"
    )

    ehr_medications = [
        {"name": m.name, "dosage": m.dosage, "route": m.route, "frequency": m.frequency, "source": "ehr"}
        for m in bundle.medications
        if m.status == "active"
    ]
    merged["current_medications"] = _dedupe_by_key(
        [*(merged.get("current_medications") or []), *ehr_medications], "name"
    )

    merged["ehr_patient_name"] = bundle.patient.full_name
    merged["ehr_mrn"] = bundle.patient.mrn

    return merged
