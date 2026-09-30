"""
Guideline retrieval node — grounds diagnosis/treatment reasoning in a curated
clinical-guideline corpus instead of pure LLM parametric recall.

Runs after investigation/interpretation, immediately before diagnostician —
deterministic and LLM-free (like memory_recall_node), so it stays fast: it
only queries the guideline corpus and makes the result available to
diagnostician/treatment via ``build_context_prompt``.
"""

from __future__ import annotations

import logging
from typing import Any

from medgraph.state import MedicalState

logger = logging.getLogger(__name__)


def _build_query_text(state: MedicalState) -> str:
    """Build a retrieval query from the case's suspected domains and summary."""
    parts = [
        " ".join(state.get("suspected_domains", []) or []),
        state.get("case_summary", "") or "",
        " ".join(s.get("description", "") for s in (state.get("symptoms") or []) if isinstance(s, dict)),
    ]
    return " ".join(p for p in parts if p).strip()


async def guideline_retrieval_node(state: MedicalState) -> dict:
    """
    Retrieve the guideline chunks most relevant to this case.

    Returns:
        Partial state update with ``retrieved_guidelines``. Never raises — a
        missing/unconfigured corpus must never block the clinical pipeline.
    """
    from medgraph.services.guideline_store import query_guidelines

    query_text = _build_query_text(state)
    retrieved: list[dict[str, Any]] = []

    try:
        retrieved = await query_guidelines(query_text)
    except Exception as exc:
        logger.warning("[guideline_retrieval] Query failed: %s", exc)
        return {"retrieved_guidelines": [], "node_errors": [f"guideline_retrieval: {exc}"]}

    logger.info("[guideline_retrieval] Retrieved %d guideline chunk(s) for query=%r", len(retrieved), query_text[:80])
    return {"retrieved_guidelines": retrieved}
