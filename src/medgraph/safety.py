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


def validate_treatment_safety(treatment: dict[str, Any]) -> list[dict[str, str]]:
    """
    Rule-based pre-flight safety check on a treatment plan.

    This runs *before* the LLM validator node as an additional safety net.

    Args:
        treatment: Treatment plan dict (medications, procedures, follow_up, etc.)

    Returns:
        List of warning dicts with keys ``severity`` and ``message``.
    """
    warnings: list[dict[str, str]] = []
    text = str(treatment).lower()

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
