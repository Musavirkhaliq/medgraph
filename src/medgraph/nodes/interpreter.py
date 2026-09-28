"""
Medical interpreter node — analyse uploaded images and reports.

Only reached if image files were uploaded (routed by ``investigator_router``).
Generates a structured text analysis of findings for downstream diagnosis.

Supports real image analysis via MedGemma's multimodal (vision) capabilities
when using Ollama. Falls back to context-aware text generation when the model
does not support images.
"""

from __future__ import annotations

import base64
import logging
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from medgraph.llm import get_llm
from medgraph.nodes._utils import build_context_prompt, parse_llm_json
from medgraph.prompts import IMAGE_ANALYSIS_PROMPT, INTERPRETER_SYSTEM
from medgraph.state import MedicalState

logger = logging.getLogger(__name__)


# ── Output schema ─────────────────────────────────────────────────────────────

class _FindingItem(BaseModel):
    modality: str = "unknown"
    finding: str = ""
    significance: str = "normal"
    correlation: str = ""


class InterpreterResult(BaseModel):
    findings: list[_FindingItem] = Field(default_factory=list)
    overall_impression: str = ""
    urgent_findings: list[str] = Field(default_factory=list)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _encode_image_base64(path: str) -> tuple[str, str]:
    """
    Read an image file and return (base64_string, mime_type).
    Supports JPEG, PNG, GIF, WEBP, BMP, TIFF.

    Raises:
        FileNotFoundError: if the path does not exist.
        ValueError: if the file exceeds MAX_IMAGE_BYTES or has an unsupported extension.
    """
    MAX_IMAGE_BYTES = 20 * 1024 * 1024  # 20 MB

    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Image file not found: {path}")

    file_size = p.stat().st_size
    if file_size > MAX_IMAGE_BYTES:
        raise ValueError(
            f"Image file too large: {file_size / 1024 / 1024:.1f} MB "
            f"(limit {MAX_IMAGE_BYTES // 1024 // 1024} MB). "
            "Please compress or resize the image before uploading."
        )

    suffix = p.suffix.lower()
    mime_map = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png",  ".gif": "image/gif",
        ".webp": "image/webp", ".bmp": "image/bmp",
        ".tiff": "image/tiff", ".tif": "image/tiff",
    }
    mime = mime_map.get(suffix)
    if mime is None:
        raise ValueError(
            f"Unsupported image format '{suffix}'. "
            "Accepted formats: JPEG, PNG, GIF, WEBP, BMP, TIFF."
        )

    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    return b64, mime



def _build_multimodal_message(image_path: str, clinical_context: str) -> HumanMessage:
    """
    Build a LangChain HumanMessage with image content for multimodal models.
    Uses the OpenAI-compatible image_url content block supported by ChatOllama.
    """
    b64, mime = _encode_image_base64(image_path)
    return HumanMessage(
        content=[
            {
                "type": "text",
                "text": (
                    f"{IMAGE_ANALYSIS_PROMPT}\n\n"
                    f"=== CLINICAL CONTEXT ===\n{clinical_context}\n\n"
                    "Please analyse this medical image carefully and provide your findings."
                ),
            },
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{b64}"},
            },
        ]
    )


# ── Real-time Q&A image analysis (called from API during Q&A) ─────────────────

def analyse_image_now(image_path: str, clinical_context: str) -> dict:
    """
    Immediately analyse a single uploaded image during the Q&A phase.

    This is called synchronously from the API when an image is uploaded
    so the result can be fed back into the next questioner round.

    Returns:
        dict with keys: ``summary`` (str), ``findings`` (list), ``urgent`` (bool)
    """
    logger.info("[interpreter] Real-time analysis of: %s", image_path)

    llm = get_llm("interpretation")

    try:
        msg = _build_multimodal_message(image_path, clinical_context)
        response = llm.invoke([
            SystemMessage(content=INTERPRETER_SYSTEM),
            msg,
        ])

        # Try to parse structured output; fall back to raw text
        result = parse_llm_json(response.content, InterpreterResult, "interpreter_rt")

        findings_text = []
        for f in result.findings:
            findings_text.append(
                f"[{f.modality.upper()}] {f.finding} "
                f"(Significance: {f.significance}) — {f.correlation}"
            )

        summary = result.overall_impression or response.content.strip()
        urgent = bool(result.urgent_findings)

        logger.info(
            "[interpreter] Real-time: %d findings, urgent=%s",
            len(result.findings), urgent,
        )

        return {
            "summary": summary,
            "findings": findings_text,
            "urgent": urgent,
            "urgent_items": result.urgent_findings,
        }

    except Exception as exc:
        logger.error("[interpreter] Real-time analysis failed: %s", exc, exc_info=True)
        # Fall back gracefully if vision fails
        return {
            "summary": f"Image received ({Path(image_path).name}). Analysis will be incorporated into the final diagnosis.",
            "findings": [],
            "urgent": False,
            "urgent_items": [],
            "error": str(exc),
        }


# ── Node function ─────────────────────────────────────────────────────────────

def interpreter_node(state: MedicalState) -> dict:
    """
    Analyse all uploaded medical images and produce a combined clinical interpretation.

    Sends actual image bytes to MedGemma (multimodal), one image at a time,
    then combines all findings into a single ``image_analysis`` string for
    downstream diagnostic nodes.

    Args:
        state: Current graph state.  Must have ``image_paths``.

    Returns:
        Partial state update with ``image_analysis``.
    """
    image_paths = state.get("image_paths", [])
    logger.info("[interpreter] Analysing %d image(s) with multimodal vision", len(image_paths))

    if not image_paths:
        return {"image_analysis": "No images provided."}

    context = build_context_prompt(state)
    llm = get_llm("interpretation")
    combined_analyses: list[str] = []

    # Preserve any real-time analyses already stored from Q&A uploads
    existing_analysis = state.get("image_analysis", "")
    if existing_analysis:
        combined_analyses.append(existing_analysis)

    for path_str in image_paths:
        p = Path(path_str)
        if not p.exists():
            logger.warning("[interpreter] Image not found: %s", path_str)
            combined_analyses.append(f"[{p.name}] File not found — skipping.")
            continue

        try:
            msg = _build_multimodal_message(path_str, context)
            response = llm.invoke([
                SystemMessage(content=INTERPRETER_SYSTEM),
                msg,
            ])

            result = parse_llm_json(response.content, InterpreterResult, "interpreter")

            lines = [f"\n=== {p.name} ==="]
            lines.append(f"Overall impression: {result.overall_impression}")
            for f in result.findings:
                lines.append(
                    f"  [{f.modality.upper()}] {f.finding} "
                    f"(Significance: {f.significance}) — {f.correlation}"
                )
            if result.urgent_findings:
                lines.append("  URGENT: " + "; ".join(result.urgent_findings))

            combined_analyses.append("\n".join(lines))
            logger.info(
                "[interpreter] %s: %d findings, %d urgent",
                p.name, len(result.findings), len(result.urgent_findings),
            )

        except Exception as exc:
            logger.error("[interpreter] Failed on %s: %s", p.name, exc, exc_info=True)
            combined_analyses.append(f"[{p.name}] Analysis error: {exc}")

    image_analysis = "\n".join(combined_analyses) if combined_analyses else "No findings."
    return {"image_analysis": image_analysis}
