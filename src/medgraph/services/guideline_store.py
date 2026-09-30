"""
Guideline corpus storage & retrieval — grounds diagnosis/treatment reasoning in
a small curated clinical-guideline corpus instead of pure LLM parametric recall.

Mirrors ``db/memory_manager.py``'s Supabase-with-in-memory-fallback pattern:
``ingest_guidelines()`` is a one-time seed (run via ``uv run medgraph
ingest-guidelines``), and ``query_guidelines()`` does semantic search via the
``match_guideline_chunks`` RPC when embeddings are available, falling back to
keyword scoring otherwise — the exact same fallback chain already used for
local/global patient memory.
"""

from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path
from typing import Any

from medgraph.config import get_settings
from medgraph.db.client import get_db_client

logger = logging.getLogger(__name__)

# In-memory fallback store (dev/test, or Supabase not configured / not yet migrated).
_guideline_chunks_db: list[dict[str, Any]] = []


def _compute_keyword_score(text: str, query: str) -> float:
    q_words = [w.lower() for w in query.split() if len(w) > 2]
    if not q_words:
        return 0.0
    text_lower = text.lower()
    matches = sum(1 for w in q_words if w in text_lower)
    return matches / len(q_words)


def _parse_guideline_file(path: Path) -> dict[str, str] | None:
    """Parse one guideline markdown file into a single retrievable chunk."""
    text = path.read_text(encoding="utf-8")
    condition_match = re.search(r"^Condition:\s*(.+)$", text, re.MULTILINE)
    source_match = re.search(r"^Source:\s*(.+)$", text, re.MULTILINE)
    if not condition_match:
        logger.warning("[guideline_store] Skipping %s — no 'Condition:' line found.", path)
        return None
    return {
        "condition": condition_match.group(1).strip(),
        "chunk_text": text.strip(),
        "source_citation": source_match.group(1).strip() if source_match else path.stem,
    }


async def ingest_guidelines() -> int:
    """
    Seed the guideline corpus from ``data/guidelines/*.md`` into Supabase
    (embedded) or the in-memory fallback store. Safe to re-run — clears and
    re-inserts rather than accumulating duplicates.

    Returns:
        The number of guideline chunks ingested.
    """
    from medgraph.embeddings import embed_text

    cfg = get_settings()
    corpus_dir = Path(cfg.guideline_corpus_dir)
    if not corpus_dir.exists():
        logger.warning("[guideline_store] Guideline corpus directory %s does not exist.", corpus_dir)
        return 0

    files = sorted(corpus_dir.glob("*.md"))
    chunks: list[dict[str, Any]] = []
    for path in files:
        parsed = _parse_guideline_file(path)
        if parsed:
            chunks.append(parsed)

    db_client = get_db_client()
    _guideline_chunks_db.clear()
    if db_client.is_configured:
        # Clear existing rows first so re-running this (e.g. after editing the
        # corpus) doesn't accumulate duplicates in Supabase.
        await db_client.rest_request("DELETE", "guideline_chunks", params={"id": "not.is.null"})

    for chunk in chunks:
        row: dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "condition": chunk["condition"],
            "chunk_text": chunk["chunk_text"],
            "source_citation": chunk["source_citation"],
        }
        embedding = await embed_text(f"{chunk['condition']}\n{chunk['chunk_text']}")
        if db_client.is_configured:
            # Write regardless of whether an embedding was available (mirrors
            # memory_manager.py) — a null embedding column just means this row
            # won't surface via the vector-search RPC, only the plain REST
            # fallback below; it must not block Supabase persistence entirely.
            await db_client.rest_request(
                "POST", "guideline_chunks", json_data={**row, "embedding": embedding}
            )
        _guideline_chunks_db.append(row)

    logger.info("[guideline_store] Ingested %d guideline chunks from %s.", len(chunks), corpus_dir)
    return len(chunks)


async def query_guidelines(query_text: str, limit: int | None = None) -> list[dict[str, Any]]:
    """
    Retrieve the guideline chunks most relevant to ``query_text``.

    Returns a list of ``{condition, chunk_text, source_citation, score}`` dicts,
    highest relevance first.
    """
    from medgraph.embeddings import embed_text

    cfg = get_settings()
    top_k = limit or cfg.guideline_top_k
    db_client = get_db_client()

    if db_client.is_configured:
        if query_text:
            embedding = await embed_text(query_text)
            if embedding is not None:
                rpc_rows = await db_client.rpc(
                    "match_guideline_chunks", {"query_embedding": embedding, "match_count": top_k}
                )
                if rpc_rows:
                    return [
                        {
                            "condition": r.get("condition"),
                            "chunk_text": r.get("chunk_text"),
                            "source_citation": r.get("source_citation"),
                            "score": None,  # cosine distance not surfaced by the RPC's SELECT list
                        }
                        for r in rpc_rows
                    ]

        # No embedding provider configured (or the RPC came back empty) —
        # fall back to a plain REST fetch rather than dropping straight to the
        # in-memory store, since Supabase may hold rows this process never
        # ingested itself (mirrors memory_manager.query_local_memory). The
        # corpus is small by design, so fetch broadly and score locally
        # rather than limiting the fetch itself to top_k.
        rows = await db_client.rest_request("GET", "guideline_chunks", params={"limit": "200"})
        if rows:
            if not query_text:
                return [{**r, "score": None} for r in rows]
            scored = [
                (_compute_keyword_score(f"{r.get('condition', '')} {r.get('chunk_text', '')}", query_text), r)
                for r in rows
            ]
            scored = [(s, r) for s, r in scored if s > 0]
            scored.sort(key=lambda x: x[0], reverse=True)
            return [{**r, "score": s} for s, r in scored[:top_k]]

    if not _guideline_chunks_db:
        return []

    if not query_text:
        return [
            {**c, "score": None} for c in _guideline_chunks_db[:top_k]
        ]

    scored = [
        (_compute_keyword_score(f"{c['condition']} {c['chunk_text']}", query_text), c)
        for c in _guideline_chunks_db
    ]
    scored = [(s, c) for s, c in scored if s > 0]
    scored.sort(key=lambda x: x[0], reverse=True)
    return [{**c, "score": s} for s, c in scored[:top_k]]
