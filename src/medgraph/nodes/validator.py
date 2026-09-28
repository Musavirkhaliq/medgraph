"""
Validator node — safety and consistency review of clinical recommendations.

Performs two layers of validation:
  1. Rule-based pre-check (``safety.validate_treatment_safety``) — fast, deterministic.
  2. LLM-based review — nuanced clinical reasoning.

The validator router then decides whether the treatment is safe or needs a retry.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from medgraph.config import get_settings
from medgraph.llm import get_llm
from medgraph.nodes._utils import build_context_prompt, parse_llm_json
from medgraph.prompts import VALIDATOR_SYSTEM
from medgraph.safety import validate_treatment_safety
from medgraph.state import MedicalState

logger = logging.getLogger(__name__)


# ── Output schema ─────────────────────────────────────────────────────────────

class _ValidationWarning(BaseModel):
    severity: str = "low"
    message: str = ""
    field: str | None = None


class ValidatorResult(BaseModel):
    is_safe: bool = True
    validation_warnings: list[_ValidationWarning] = Field(default_factory=list)
    validation_recommendations: list[str] = Field(default_factory=list)
    overall_assessment: str = ""


# ── Node function ─────────────────────────────────────────────────────────────

def validator_node(state: MedicalState) -> dict:
    """
    Validate the treatment plan for safety and clinical consistency.

    Args:
        state: Current graph state.

    Returns:
        Partial state update with ``is_safe``, ``validation_warnings``,
        and ``validation_recommendations``.
    """
    logger.info("[validator] Running safety validation")

    # ── Layer 1: Rule-based pre-check ─────────────────────────────────────────
    treatment_dict = {
        "medications": state.get("medications", []),
        "procedures": state.get("procedures", []),
        "follow_up": state.get("follow_up", ""),
        "monitoring": state.get("monitoring", []),
    }
    rule_warnings = validate_treatment_safety(treatment_dict)

    # ── Layer 2: LLM-based review ─────────────────────────────────────────────
    context = build_context_prompt(state)
    llm = get_llm("validation")
    messages = [
        SystemMessage(content=VALIDATOR_SYSTEM),
        HumanMessage(
            content=(
                "Critically evaluate ALL clinical recommendations below for safety, "
                "drug interactions, contraindications, and clinical consistency.\n\n"
                f"{context}"
            )
        ),
    ]

    try:
        response = llm.invoke(messages)
        result = parse_llm_json(response.content, ValidatorResult, "validator")

        # Merge rule-based warnings into LLM warnings
        all_warnings = [
            _ValidationWarning(**w) for w in rule_warnings
        ] + result.validation_warnings

        # Any high/critical warning makes it unsafe
        high_severity = any(
            w.severity in ("high", "critical") for w in all_warnings
        )
        is_safe = result.is_safe and not high_severity

        logger.info(
            "[validator] is_safe=%s, warnings=%d",
            is_safe,
            len(all_warnings),
        )

        return {
            "is_safe": is_safe,
            "validation_warnings": [w.model_dump(exclude_none=True) for w in all_warnings],
            "validation_recommendations": result.validation_recommendations,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        logger.error("[validator] Node failed: %s", exc, exc_info=True)
        return {
            "is_safe": False,
            "validation_warnings": [{"severity": "high", "message": f"Validator error: {exc}"}],
            "validation_recommendations": ["Manual review required due to validation error"],
            "node_errors": [f"validator: {exc}"],
        }


# ── Router function ───────────────────────────────────────────────────────────

def validator_router(state: MedicalState) -> str:
    """
    Conditional edge after validator_node.

    Returns:
        ``"safe"``  → proceed to END.
        ``"retry"`` → loop back to treatment_node (up to MAX_TREATMENT_RETRIES).
        ``"safe"``  → once max retries exceeded, accept as-is with warnings.
    """
    settings = get_settings()
    retry_count = state.get("treatment_retry_count", 0)
    is_safe = state.get("is_safe", False)

    if is_safe:
        return "safe"

    if retry_count < settings.max_treatment_retries:
        logger.warning("[validator] Unsafe treatment — retrying (attempt %d)", retry_count + 1)
        return "retry"

    logger.error(
        "[validator] Treatment still unsafe after %d retries — proceeding with warnings",
        retry_count,
    )
    return "safe"  # proceed with warnings rather than infinite loop
