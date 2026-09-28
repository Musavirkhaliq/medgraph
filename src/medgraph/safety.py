"""
Medical safety utilities for MedGraph.

Provides rule-based emergency detection and safety validation as a first line
of defence, before LLM-based validation runs.  These functions are deliberately
deterministic (no LLM calls) so they are fast and reliable.
"""

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# ── Emergency keyword taxonomy ────────────────────────────────────────────────

_CRITICAL_KEYWORDS: list[str] = [
    "chest pain",
    "difficulty breathing",
    "can't breathe",
    "cannot breathe",
    "shortness of breath",
    "unconscious",
    "unresponsive",
    "severe bleeding",
    "vomiting blood",
    "coughing blood",
    "heart attack",
    "myocardial infarction",
    "stroke",
    "facial drooping",
    "arm weakness",
    "speech difficulty",
    "seizure",
    "anaphylaxis",
    "allergic reaction",
    "overdose",
    "suicide",
    "self-harm",
    "severe chest tightness",
]

_URGENT_KEYWORDS: list[str] = [
    "severe pain",
    "high fever",
    "fever above 39",
    "fever above 40",
    "confusion",
    "sudden weakness",
    "sudden vision loss",
    "severe headache",
    "thunderclap headache",
    "palpitations",
    "racing heart",
    "irregular heartbeat",
    "sudden numbness",
]

# ── Allergen → drug-family map (for deterministic allergy cross-checking) ────

_ALLERGY_DRUG_FAMILIES: dict[str, list[str]] = {
    "penicillin": ["penicillin", "amoxicillin", "ampicillin", "augmentin", "piperacillin"],
    "amoxicillin": ["penicillin", "amoxicillin", "ampicillin", "augmentin", "piperacillin"],
    "cephalosporin": ["cephalexin", "ceftriaxone", "cefuroxime", "cefazolin", "cefdinir"],
    "sulfa": ["sulfamethoxazole", "bactrim", "sulfasalazine", "sulfadiazine"],
    "sulfonamide": ["sulfamethoxazole", "bactrim", "sulfasalazine", "sulfadiazine"],
    "nsaid": ["ibuprofen", "naproxen", "aspirin", "diclofenac", "ketorolac", "celecoxib"],
    "aspirin": ["aspirin"],
    "ibuprofen": ["ibuprofen"],
    "latex": [],
    "codeine": ["codeine"],
    "opioid": ["codeine", "morphine", "oxycodone", "tramadol"],
}


def _extract_allergen_names(allergies: list[Any]) -> list[str]:
    """Normalize a patient's stored allergy list into lowercase allergen names.

    Handles both plain strings and ``{"allergen": ...}`` dicts (the shape used
    by the patient repository and admin registration form).
    """
    names: list[str] = []
    for a in allergies or []:
        if isinstance(a, dict):
            name = a.get("allergen") or a.get("name") or ""
        else:
            name = str(a)
        name = name.strip().lower()
        if name:
            names.append(name)
    return names


def check_allergy_contraindications(
    medications: list[dict[str, Any]], known_allergies: list[Any]
) -> list[dict[str, str]]:
    """
    Deterministically cross-check prescribed medications against a patient's
    documented allergies — a hard safety net independent of LLM judgment.

    Args:
        medications: Treatment plan medications (each with a ``name`` field).
        known_allergies: The patient's stored allergy list (strings or dicts).

    Returns:
        List of warning dicts (``severity="critical"``) for any match.
    """
    allergen_names = _extract_allergen_names(known_allergies)
    if not allergen_names:
        return []

    warnings: list[dict[str, str]] = []
    for med in medications:
        if not isinstance(med, dict):
            continue
        med_name = str(med.get("name", "")).lower()
        if not med_name:
            continue
        for allergen in allergen_names:
            family_drugs = _ALLERGY_DRUG_FAMILIES.get(allergen, [allergen])
            if allergen in med_name or any(drug in med_name for drug in family_drugs):
                warnings.append({
                    "severity": "critical",
                    "message": (
                        f"'{med.get('name')}' may be contraindicated — patient has a "
                        f"documented '{allergen}' allergy."
                    ),
                })
                break

    return warnings


# ── Dangerous recommendation patterns ─────────────────────────────────────────

_DANGEROUS_PATTERNS: list[str] = [
    r"stop\s+\w+\s+medication\s+immediately",
    r"ignore\s+the\s+symptoms",
    r"self[\s-]treat\s+serious",
    r"delay\s+emergency\s+care",
    r"avoid\s+hospital",
    r"do\s+not\s+seek\s+medical",
]


def detect_emergency(text: str) -> dict[str, Any]:
    """
    Perform fast keyword-based emergency detection on patient input.

    This is intentionally rule-based and conservative — when in doubt, flag as
    urgent. The LLM triage node will perform a more nuanced assessment.

    Args:
        text: Raw patient input or symptom description.

    Returns:
        A dict with keys: ``is_emergency``, ``level``, ``trigger``,
        ``action_required``, ``recommendation``.
    """
    text_lower = text.lower()

    for keyword in _CRITICAL_KEYWORDS:
        if keyword in text_lower:
            logger.warning("Critical emergency keyword detected: '%s'", keyword)
            return {
                "is_emergency": True,
                "level": "critical",
                "trigger": keyword,
                "action_required": "IMMEDIATE MEDICAL ATTENTION",
                "recommendation": "Call emergency services (911/999/112) immediately",
            }

    for keyword in _URGENT_KEYWORDS:
        if keyword in text_lower:
            logger.warning("Urgent keyword detected: '%s'", keyword)
            return {
                "is_emergency": True,
                "level": "urgent",
                "trigger": keyword,
                "action_required": "URGENT MEDICAL EVALUATION",
                "recommendation": "Seek medical care within hours",
            }

    return {
        "is_emergency": False,
        "level": "routine",
        "trigger": None,
        "action_required": "Standard medical evaluation",
        "recommendation": "Complete the assessment workflow",
    }


def validate_treatment_safety(
    treatment: dict[str, Any], known_allergies: list[Any] | None = None
) -> list[dict[str, str]]:
    """
    Rule-based pre-flight safety check on a treatment plan.

    This runs *before* the LLM validator node as an additional safety net.

    Args:
        treatment: Treatment plan dict (medications, procedures, follow_up, etc.)
        known_allergies: The patient's documented allergies (from patient_context),
            cross-checked deterministically against prescribed medications.

    Returns:
        List of warning dicts with keys ``severity`` and ``message``.
    """
    warnings: list[dict[str, str]] = []
    text = str(treatment).lower()

    if known_allergies:
        warnings.extend(
            check_allergy_contraindications(treatment.get("medications", []), known_allergies)
        )

    for pattern in _DANGEROUS_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            warnings.append(
                {
                    "severity": "high",
                    "message": f"Potentially dangerous recommendation pattern detected: {pattern}",
                }
            )

    # Missing critical sections
    if not treatment.get("follow_up"):
        warnings.append(
            {"severity": "medium", "message": "Treatment plan is missing follow-up instructions."}
        )

    if not treatment.get("monitoring"):
        warnings.append(
            {"severity": "medium", "message": "No monitoring plan specified in treatment."}
        )

    # Insulin without diabetes context
    medications = treatment.get("medications", [])
    for med in medications:
        if isinstance(med, dict) and "insulin" in med.get("name", "").lower():
            if "diabet" not in text:
                warnings.append(
                    {
                        "severity": "high",
                        "message": "Insulin prescribed without diabetes mentioned in clinical context.",
                    }
                )

    return warnings


def add_disclaimer(response: dict[str, Any]) -> dict[str, Any]:
    """Attach the standard medical disclaimer to any response dict."""
    from medgraph.prompts import MEDICAL_DISCLAIMER

    response["disclaimer"] = MEDICAL_DISCLAIMER
    return response
