"""
Deterministic early-warning scoring for longitudinal vitals tracking.

Implements NEWS2 (National Early Warning Score 2, Royal College of Physicians) —
a standard, publicly published bedside deterioration score. Like ``safety.py``,
this is intentionally rule-based with no LLM involved, so it is fast, reliable,
and auditable.
"""

from __future__ import annotations

from typing import Any, TypedDict


class News2Result(TypedDict):
    score: int
    risk_band: str  # low / medium / high
    component_scores: dict[str, int]


def _score_resp_rate(rr: int | None) -> int:
    if rr is None:
        return 0
    if rr <= 8 or rr >= 25:
        return 3
    if 9 <= rr <= 11:
        return 1
    if 21 <= rr <= 24:
        return 2
    return 0  # 12-20


def _score_spo2(spo2: int | None) -> int:
    if spo2 is None:
        return 0
    if spo2 <= 91:
        return 3
    if spo2 <= 93:
        return 2
    if spo2 <= 95:
        return 1
    return 0  # >=96


def _score_oxygen(o2_supplemental: bool) -> int:
    return 2 if o2_supplemental else 0


def _score_systolic_bp(sbp: int | None) -> int:
    if sbp is None:
        return 0
    if sbp <= 90 or sbp >= 220:
        return 3
    if sbp <= 100:
        return 2
    if sbp <= 110:
        return 1
    return 0  # 111-219


def _score_heart_rate(hr: int | None) -> int:
    if hr is None:
        return 0
    if hr <= 40 or hr >= 131:
        return 3
    if hr <= 50:
        return 1
    if hr <= 90:
        return 0
    if hr <= 110:
        return 1
    return 2  # 111-130


def _score_consciousness(level: str | None) -> int:
    # AVPU/CVPU scale: Alert scores 0, anything else (Voice/Pain/Unresponsive/Confusion) scores 3.
    return 0 if (level or "alert").strip().lower() == "alert" else 3


def _score_temperature(temp_c: float | None) -> int:
    if temp_c is None:
        return 0
    if temp_c <= 35.0 or temp_c >= 39.1:
        return 3 if temp_c <= 35.0 else 2
    if temp_c <= 36.0:
        return 1
    if temp_c <= 38.0:
        return 0
    return 1  # 38.1-39.0


def calculate_news2(vitals: dict[str, Any]) -> News2Result:
    """
    Compute the NEWS2 score and risk band for a single vitals reading.

    Args:
        vitals: dict with any of ``resp_rate``, ``spo2``, ``o2_supplemental``,
            ``systolic_bp``, ``heart_rate``, ``consciousness_level``, ``temperature_c``.
            Missing fields score 0 rather than raising, so a partial reading still
            produces a (lower-bound) score.

    Returns:
        ``{"score": int, "risk_band": "low"|"medium"|"high", "component_scores": {...}}``
    """
    component_scores = {
        "resp_rate": _score_resp_rate(vitals.get("resp_rate")),
        "spo2": _score_spo2(vitals.get("spo2")),
        "oxygen": _score_oxygen(bool(vitals.get("o2_supplemental"))),
        "systolic_bp": _score_systolic_bp(vitals.get("systolic_bp")),
        "heart_rate": _score_heart_rate(vitals.get("heart_rate")),
        "consciousness": _score_consciousness(vitals.get("consciousness_level")),
        "temperature": _score_temperature(vitals.get("temperature_c")),
    }
    score = sum(component_scores.values())

    if score >= 7:
        risk_band = "high"
    elif score >= 5 or any(v == 3 for v in component_scores.values()):
        risk_band = "medium"
    else:
        risk_band = "low"

    return {"score": score, "risk_band": risk_band, "component_scores": component_scores}
