"""
Investigator node — recommend diagnostic tests and imaging.

Recommends evidence-based investigations based on the clinical case.
Also determines whether medical images are available/needed, which routes
the graph through the interpreter node if appropriate.
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from medgraph.llm import get_llm
from medgraph.nodes._utils import build_context_prompt, parse_llm_json
from medgraph.prompts import INVESTIGATOR_SYSTEM
from medgraph.state import MedicalState

logger = logging.getLogger(__name__)


# ── Output schema ─────────────────────────────────────────────────────────────

class _InvestigationItem(BaseModel):
    test_name: str = ""
    category: str = "lab"
    indication: str = ""
    priority: str = "routine"
    expected_findings: str | None = None


class InvestigatorResult(BaseModel):
    investigations: list[_InvestigationItem] = Field(default_factory=list)
    images_requested: list[str] = Field(default_factory=list)
    rationale: str = ""


# ── Node function ─────────────────────────────────────────────────────────────

def investigator_node(state: MedicalState) -> dict:
    """
    Recommend appropriate diagnostic investigations.

    Args:
        state: Current graph state.

    Returns:
        Partial state update with ``investigations`` and ``images_requested``.
    """
    logger.info("[investigator] Generating investigation recommendations")

    context = build_context_prompt(state)
    llm = get_llm("investigation")
    messages = [
        SystemMessage(content=INVESTIGATOR_SYSTEM),
        HumanMessage(
            content=(
                "Recommend appropriate diagnostic tests and imaging based on the clinical case.\n\n"
                f"{context}"
            )
        ),
    ]

    try:
        response = llm.invoke(messages)
        result = parse_llm_json(response.content, InvestigatorResult, "investigator")

        logger.info(
            "[investigator] %d tests recommended, %d image types requested",
            len(result.investigations),
            len(result.images_requested),
        )

        return {
            "investigations": [i.model_dump(exclude_none=True) for i in result.investigations],
            "images_requested": result.images_requested,
            # Pause the pipeline if investigations or imaging are recommended so clinician can provide results or skip
            "waiting_for_tests": len(result.investigations) > 0 or len(result.images_requested) > 0,
        }

    except Exception as exc:
        logger.error("[investigator] Node failed: %s", exc, exc_info=True)
        return {
            "investigations": [],
            "images_requested": [],
            "node_errors": [f"investigator: {exc}"],
        }


# ── Router function ───────────────────────────────────────────────────────────

def investigator_router(state: MedicalState) -> str:
    """
    Conditional edge after investigator_node or ask_for_test_results.

    Returns:
        ``"ask_for_test_results"`` if we need to pause for the human to upload tests.
        ``"interpret"`` if image files have been uploaded.
        ``"diagnose"``  otherwise (skip interpreter node).
    """
    if state.get("waiting_for_tests"):
        return "ask_for_test_results"

    image_paths = state.get("image_paths", [])
    if image_paths:
        return "interpret"
    return "diagnose"
