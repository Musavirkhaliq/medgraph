"""
MedGraph FastAPI application entry point.

Initialises the app with CORS, logging, lifespan context manager,
OpenAPI metadata, and registers all API routes.
"""

from __future__ import annotations

import logging
import logging.config
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from medgraph.api.routes import router
from medgraph.config import get_settings

# ── Logging ───────────────────────────────────────────────────────────────────

def _configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    # Quieten noisy libraries
    for noisy in ("httpx", "httpcore", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.
    Pre-warms the compiled graph and LLM availability check on startup.
    """
    settings = get_settings()
    _configure_logging(settings.log_level)
    logger = logging.getLogger(__name__)

    logger.info("MedGraph API starting up …")

    # Pre-warm graph compilation (cached, only runs once)
    from medgraph.graph import get_compiled_graph
    from medgraph.llm import _ollama_available

    get_compiled_graph()
    _ollama_available()  # trigger and cache the probe

    # Ensure reports directory exists
    settings.reports_dir.mkdir(parents=True, exist_ok=True)

    # Auto-seed the guideline RAG corpus when running on the in-memory
    # fallback (no Supabase configured) — that store is per-process, so
    # without this the corpus would silently stay empty for this server
    # unless someone had already run `medgraph ingest-guidelines` in the
    # exact same process. With Supabase configured, ingestion is a one-time
    # `medgraph ingest-guidelines` operation (repeating it here would insert
    # duplicate rows on every restart).
    from medgraph.db.client import get_db_client
    if not get_db_client().is_configured:
        from medgraph.services.guideline_store import ingest_guidelines
        try:
            count = await ingest_guidelines()
            logger.info("Auto-ingested %d guideline chunk(s) into in-memory store.", count)
        except Exception as exc:
            logger.warning("Guideline corpus auto-ingestion failed: %s", exc)

    logger.info("MedGraph API ready ✓")
    yield
    logger.info("MedGraph API shut down.")


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="MedAI by LTM Research Medical Reasoning API",
    description=(
        "AI-powered multi-agent clinical reasoning system built on LangGraph. "
        "Implements a 9-node pipeline: Intake → Triage → Adaptive Q&A → "
        "Case Building → Investigations → Image Analysis → Diagnosis → "
        "Treatment → Safety Validation.\n\n"
        "⚠️ **FOR RESEARCH AND EDUCATIONAL PURPOSES ONLY.** "
        "Not for clinical use."
    ),
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "Sessions", "description": "Patient session management"},
        {"name": "Reports", "description": "Clinical report retrieval"},
        {"name": "System", "description": "Health checks and system info"},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

# Mount the static directory to serve the frontend UI
static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir, exist_ok=True)

app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    """Run the API server (used by ``medgraph-api`` CLI entry point)."""
    settings = get_settings()
    uvicorn.run(
        "medgraph.api.app:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.api_reload,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
