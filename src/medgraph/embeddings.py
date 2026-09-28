"""
Embeddings factory for MedGraph — optional semantic memory retrieval.

Mirrors ``llm.py``'s provider-detection strategy, but unlike ``get_llm()`` this is
allowed to come back empty: embeddings are an enhancement over the keyword-overlap
retrieval already used throughout ``db/memory_manager.py``, never a hard requirement.
Callers must treat ``None`` as "fall back to keyword scoring", not as an error.

Strategy:
  1. ``EMBEDDING_PROVIDER=ollama`` or "auto" and the configured embedding model is
     present in Ollama → ``OllamaEmbeddings``.
  2. Ollama unavailable/not requested and ``OPENAI_API_KEY`` set → ``OpenAIEmbeddings``.
  3. ``EMBEDDING_PROVIDER=none`` or neither is configured → ``None``.
"""

from __future__ import annotations

import logging
from functools import cache

from medgraph.config import get_settings

logger = logging.getLogger(__name__)


@cache
def _ollama_embedding_model_available() -> bool:
    """Cached check for whether the configured Ollama embedding model is pulled."""
    cfg = get_settings()
    try:
        import httpx

        resp = httpx.get(f"{cfg.ollama_base_url}/api/tags", timeout=3.0)
        if resp.status_code != 200:
            return False
        tags = {m["name"].split(":")[0] for m in resp.json().get("models", [])}
        return cfg.embedding_model.split(":")[0] in tags
    except Exception as exc:
        logger.debug("Ollama embedding model probe failed: %s", exc)
        return False


@cache
def get_embeddings():
    """
    Return an embeddings client if one can be configured, else ``None``.

    Cached — the availability probe only runs once per process, matching the
    caching strategy already used for the chat-model Ollama probe in ``llm.py``.
    """
    cfg = get_settings()

    if cfg.embedding_provider == "none":
        return None

    use_ollama = cfg.embedding_provider == "ollama" or (
        cfg.embedding_provider == "auto" and _ollama_embedding_model_available()
    )
    if use_ollama:
        try:
            from langchain_ollama import OllamaEmbeddings

            logger.info("Embeddings → Ollama/%s", cfg.embedding_model)
            return OllamaEmbeddings(base_url=cfg.ollama_base_url, model=cfg.embedding_model)
        except Exception as exc:
            logger.warning("Failed to initialise Ollama embeddings: %s", exc)

    if cfg.embedding_provider in ("auto", "openai") and cfg.openai_api_key:
        try:
            from langchain_openai import OpenAIEmbeddings

            logger.info("Embeddings → OpenAI/text-embedding-3-small")
            return OpenAIEmbeddings(api_key=cfg.openai_api_key, model="text-embedding-3-small")
        except Exception as exc:
            logger.warning("Failed to initialise OpenAI embeddings: %s", exc)

    logger.debug("No embedding provider available — memory retrieval will use keyword scoring.")
    return None


async def embed_text(text: str) -> list[float] | None:
    """Embed a single string, or return ``None`` if no provider is configured/fails."""
    client = get_embeddings()
    if client is None or not text.strip():
        return None
    try:
        return await client.aembed_query(text)
    except Exception as exc:
        logger.warning("Embedding computation failed (falling back to keyword scoring): %s", exc)
        return None
