"""
Emergency node — handle critical/urgent cases with immediate guidance.

This node is reached via the triage router when triage_level == "emergency".
It does NOT run the full clinical pipeline; instead it returns immediate
safety guidance and terminates the graph.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from medgraph.prompts import EMERGENCY_CRITICAL_RESPONSE, EMERGENCY_URGENT_RESPONSE
from medgraph.state import MedicalState

logger = logging.getLogger(__name__)


def emergency_node(state: MedicalState) -> dict:
    """
    Handle emergency cases with immediate safety guidance.

    Args:
        state: Current graph state.  Must have ``triage_level`` and ``emergency_info``.

    Returns:
        Partial state update marking the session as complete and providing
        emergency response data.
    """
    triage_level = state.get("triage_level", "emergency")
    emergency_info = state.get("emergency_info", {})

    logger.warning(
        "[emergency] Session %s — level=%s, trigger=%s",
        state.get("session_id"),
        triage_level,
        emergency_info.get("trigger"),
    )

    if triage_level == "emergency":
        response_template = EMERGENCY_CRITICAL_RESPONSE
    else:
        response_template = EMERGENCY_URGENT_RESPONSE

    return {
        "emergency_info": {
            **emergency_info,
            **response_template,
            "session_id": state.get("session_id"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "is_emergency": True,
        # Mark validation as safe=False so the final report flags this clearly
        "is_safe": False,
        "validation_recommendations": [
            "SEEK IMMEDIATE EMERGENCY CARE",
            "Do NOT use AI tools for emergency medical decisions",
        ],
    }
