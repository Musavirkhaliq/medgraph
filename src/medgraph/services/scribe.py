"""
Ambient clinical scribe — turns an accumulated conversation transcript into a
structured SOAP note.

Deliberately a plain service function, not a graph node: recording happens
out-of-band during the consult (independent of which pipeline phase the graph
is in), so there is no natural point in the fixed node sequence to run it.
Follows the same LLM-call pattern as ``case_builder_node``.
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel

from medgraph.llm import get_llm
from medgraph.nodes._utils import parse_llm_json
from medgraph.prompts import SCRIBE_SYSTEM

logger = logging.getLogger(__name__)


class SoapNoteResult(BaseModel):
    subjective: str = ""
    objective: str = ""
    assessment: str = ""
    plan: str = ""


def generate_soap_note(transcript_text: str, context: str = "") -> SoapNoteResult:
    """
    Generate a structured SOAP note from a conversation transcript.

    Args:
        transcript_text: The accumulated (timestamp-free) conversation transcript.
        context: Optional clinical context (e.g. ``build_context_prompt(state)``)
            used only to disambiguate the transcript, not as a source of new facts.

    Returns:
        A ``SoapNoteResult`` with subjective/objective/assessment/plan fields.
        Falls back to an empty result on any LLM/parsing failure — never raises.
    """
    if not transcript_text.strip():
        return SoapNoteResult(
            subjective="No transcript recorded.", objective="", assessment="", plan=""
        )

    llm = get_llm("scribe")
    content = f"=== CONVERSATION TRANSCRIPT ===\n{transcript_text}"
    if context:
        content += f"\n\n=== CLINICAL CONTEXT (for disambiguation only) ===\n{context}"

    messages = [
        SystemMessage(content=SCRIBE_SYSTEM),
        HumanMessage(content=f"Generate a SOAP note from this consultation.\n\n{content}"),
    ]

    try:
        response = llm.invoke(messages)
        return parse_llm_json(response.content, SoapNoteResult, "scribe")
    except Exception as exc:
        logger.error("[scribe] SOAP generation failed: %s", exc, exc_info=True)
        return SoapNoteResult(
            subjective="SOAP note generation failed — raw transcript available.",
            objective="", assessment="", plan="",
        )
