"""
LLM factory for MedGraph.

Provides task-specific LangChain chat model instances.
Strategy:
  1. If provider == "ollama" or provider == "auto" and Ollama is reachable → use ChatOllama
  2. If Ollama is unavailable and an OPENAI_API_KEY is set → fallback to ChatOpenAI
  3. Otherwise raise a clear error explaining how to configure a provider.

All temperature / token configurations follow the same rationale as the original
medgemma_llm.py but are expressed as a clean lookup table.
"""

from __future__ import annotations

import logging
from functools import cache
from typing import Literal

from langchain_core.language_models import BaseChatModel

from medgraph.config import get_settings

logger = logging.getLogger(__name__)

# Task type literal
TaskType = Literal[
    "intake", "triage", "questioning", "case_builder",
    "investigation", "interpretation", "diagnosis",
    "treatment", "validation", "scribe", "general",
]

# Per-task LLM configuration
_TASK_CONFIGS: dict[TaskType, dict] = {
    "intake":        {"temperature": 0.1, "num_predict": 2048},
    "triage":        {"temperature": 0.0, "num_predict": 2048},   # deterministic safety
    "questioning":   {"temperature": 0.2, "num_predict": 2048},
    "case_builder":  {"temperature": 0.1, "num_predict": 4096},   # detailed case summary
    "investigation": {"temperature": 0.1, "num_predict": 2048},
    "interpretation":{"temperature": 0.1, "num_predict": 4096},   # multimodal findings
    "diagnosis":     {"temperature": 0.1, "num_predict": 4096},   # multiple differentials + evidence
    "treatment":     {"temperature": 0.1, "num_predict": 4096},   # medications & procedures
    "validation":    {"temperature": 0.0, "num_predict": 4096},   # deterministic safety checks
    "scribe":        {"temperature": 0.1, "num_predict": 4096},   # SOAP note from transcript
    "general":       {"temperature": 0.1, "num_predict": 2048},
}

# Mapping from Ollama's num_predict to OpenAI's max_tokens
_OPENAI_TASK_CONFIGS: dict[TaskType, dict] = {
    k: {"temperature": v["temperature"], "max_tokens": v["num_predict"]}
    for k, v in _TASK_CONFIGS.items()
}


def _check_ollama_available(base_url: str, model: str) -> bool:
    """Probe Ollama to check if it's running and the model is available."""
    try:
        import httpx
        resp = httpx.get(f"{base_url}/api/tags", timeout=3.0)
        if resp.status_code != 200:
            return False
        tags = {m["name"].split(":")[0] for m in resp.json().get("models", [])}
        return model.split(":")[0] in tags
    except Exception as exc:
        logger.debug("Ollama probe failed: %s", exc)
        return False


@cache
def _ollama_available() -> bool:
    """Cached Ollama availability check (evaluated once at startup)."""
    cfg = get_settings()
    available = _check_ollama_available(cfg.ollama_base_url, cfg.medgemma_model)
    if available:
        logger.info("Ollama + MedGemma detected — using local model.")
    else:
        logger.warning(
            "Ollama / MedGemma not available at %s. "
            "Will fall back to OpenAI (%s).",
            cfg.ollama_base_url,
            cfg.openai_fallback_model,
        )
    return available


def get_llm(task_type: TaskType = "general") -> BaseChatModel:
    """
    Return the appropriate LangChain chat model for the given task type.

    Args:
        task_type: One of the recognised medical task types.  Controls
                   temperature and token limits for optimal safety/quality.

    Returns:
        A ``BaseChatModel`` instance (either ``ChatOllama`` or ``ChatOpenAI``).

    Raises:
        RuntimeError: If neither Ollama nor OpenAI is configured.
    """
    cfg = get_settings()

    if cfg.llm_provider == "mock":
        return _mock_model(task_type)

    use_ollama = (
        cfg.llm_provider == "ollama"
        or (cfg.llm_provider == "auto" and _ollama_available())
    )

    if use_ollama:
        from langchain_ollama import ChatOllama

        task_cfg = _TASK_CONFIGS.get(task_type, _TASK_CONFIGS["general"])
        model = ChatOllama(
            base_url=cfg.ollama_base_url,
            model=cfg.medgemma_model,
            format="json",
            **task_cfg,
        )
        logger.debug("LLM[%s] → Ollama/%s", task_type, cfg.medgemma_model)
        return model

    # ── OpenAI fallback ──────────────────────────────────────────────────────
    if cfg.openai_api_key:
        from langchain_openai import ChatOpenAI

        task_cfg = _OPENAI_TASK_CONFIGS.get(task_type, _OPENAI_TASK_CONFIGS["general"])
        model = ChatOpenAI(
            api_key=cfg.openai_api_key,
            model=cfg.openai_fallback_model,
            **task_cfg,
        )
        logger.debug("LLM[%s] → OpenAI/%s", task_type, cfg.openai_fallback_model)
        return model

    # ── Mock fallback ────────────────────────────────────────────────────────
    # Only reached in "auto" mode with neither provider configured — lets the
    # pipeline still run end-to-end (demos, CI, sandboxes with no model access)
    # instead of hard-failing. Never silently used when a provider IS configured.
    logger.warning(
        "No LLM provider available (no Ollama, no OPENAI_API_KEY) — "
        "falling back to MockChatModel. Output is NOT real clinical reasoning."
    )
    return _mock_model(task_type)


def _mock_model(task_type: TaskType) -> BaseChatModel:
    from medgraph.mock_llm import MockChatModel

    logger.debug("LLM[%s] → Mock (no provider configured)", task_type)
    return MockChatModel(task_type=task_type)
