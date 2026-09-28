"""
Questioner node — adaptive Q&A loop for gathering missing clinical information.

This node runs in a loop (controlled by ``questioner_router``) asking one
high-value question per round until either:
  a) The LLM decides sufficient information exists (next_question=null), or
  b) The maximum round limit (``MAX_QUESTION_ROUNDS``) is reached.

In the API workflow, the graph is interrupted here with an
``interrupt_before=["questioner_node"]`` checkpoint so the human can supply
the answer before the graph resumes.
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from medgraph.config import get_settings
from medgraph.llm import get_llm
from medgraph.nodes._utils import build_context_prompt, parse_llm_json
from medgraph.prompts import QUESTIONER_SYSTEM
from medgraph.state import MedicalState

logger = logging.getLogger(__name__)


# ── Output schema ─────────────────────────────────────────────────────────────

class QuestionResult(BaseModel):
    analysis_of_what_is_missing: str = ""
    questions_to_ask: list[str] = Field(default_factory=list)


# ── Node function ─────────────────────────────────────────────────────────────

def questioner_node(state: MedicalState) -> dict:
    """
    Generate the next high-value clinical question.

    Reads the accumulated Q&A history from ``qa_pairs`` and ``question_round``
    to avoid repetition and determine when questioning is complete.

    Args:
        state: Current graph state.

    Returns:
        Partial state update with ``current_question``, ``question_round``,
        and ``question_complete``.
    """
    settings = get_settings()
    current_round = state.get("question_round", 0)
    pending_questions = state.get("pending_questions", [])

    # ── Check max rounds ──────────────────────────────────────────────────────
    if current_round >= settings.max_question_rounds:
        logger.info("[questioner] Max rounds (%d) reached", settings.max_question_rounds)
        return {
            "question_complete": True,
            "current_question": None,
            "pending_questions": [],
        }

    # ── Generate questions upfront ────────────────────────────────────────────
    if current_round == 0 and not pending_questions:
        logger.info("[questioner] Generating upfront list of questions...")
        context = build_context_prompt(state)
        
        llm = get_llm("questioning")
        messages = [
            SystemMessage(content=QUESTIONER_SYSTEM),
            HumanMessage(
                content=(
                    "Based on the patient information below, generate the complete list "
                    "of questions you need to ask to gather the remaining history.\n\n"
                    f"{context}"
                )
            ),
        ]

        try:
            response = llm.invoke(messages)
            result = parse_llm_json(response.content, QuestionResult, "questioner")

            # Store generated list
            pending_questions = result.questions_to_ask
            logger.info("[questioner] Generated %d questions", len(pending_questions))

        except Exception as exc:
            logger.error("[questioner] Node failed: %s", exc, exc_info=True)
            return {
                "question_complete": True,
                "current_question": None,
                "node_errors": [f"questioner: {exc}"],
            }

    # ── Pop and return next question ──────────────────────────────────────────
    if not pending_questions:
        logger.info("[questioner] No more pending questions. Marking complete.")
        return {
            "question_complete": True,
            "current_question": None,
            "pending_questions": [],
        }

    next_q = pending_questions.pop(0)
    new_round = current_round + 1
    logger.info("[questioner] Round %d: %s", new_round, next_q[:80])
    
    return {
        "current_question": next_q,
        "question_round": new_round,
        "pending_questions": pending_questions,
        "question_complete": False,
    }


# ── Router function ───────────────────────────────────────────────────────────

def questioner_router(state: MedicalState) -> str:
    """
    Conditional edge after questioner_node.

    Returns:
        ``"ask"``  → interrupt and wait for human answer, then loop back.
        ``"done"`` → proceed to case_builder_node.
    """
    if state.get("question_complete"):
        return "done"
    return "ask"
