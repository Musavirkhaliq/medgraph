"""
Application settings loaded from environment variables / .env file.

All configuration is centralised here so every module imports from one place.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """MedGraph application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── LLM Provider ─────────────────────────────────────────────────────────
    ollama_base_url: str = "http://localhost:11434"
    medgemma_model: str = "medgemma1.5"
    openai_api_key: str = ""
    openai_fallback_model: str = "gpt-4o-mini"
    llm_provider: Literal["auto", "ollama", "openai", "mock"] = "auto"

    # ── Embeddings (optional — semantic memory retrieval) ───────────────────
    embedding_provider: Literal["auto", "ollama", "openai", "none"] = "auto"
    embedding_model: str = "nomic-embed-text"

    # ── API Server ────────────────────────────────────────────────────────────
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_reload: bool = False

    # ── ASR & Voice Settings ──────────────────────────────────────────────────
    whisper_model: str = "large-v3"
    whisper_device: str = "auto"  # "cuda", "cpu", "auto"
    whisper_compute_type: str = "default"  # "float16", "int8", "default"

    # ── Graph Settings ────────────────────────────────────────────────────────
    max_question_rounds: int = 10
    max_treatment_retries: int = 2

    # ── Database & Supabase ───────────────────────────────────────────────────
    supabase_url: str = ""
    supabase_key: str = ""
    supabase_service_role_key: str = ""

    # ── Storage ───────────────────────────────────────────────────────────────
    checkpoint_db_path: str = ""
    reports_dir: Path = Path("reports")

    # ── EHR / FHIR Integration ───────────────────────────────────────────────
    fhir_server_url: str = ""              # if set, FHIRClient hits a real FHIR R4 server
    fhir_mock_dir: Path = Path("data/fhir_mock")  # local FHIR Bundle fixtures used otherwise

    # ── Guideline RAG ────────────────────────────────────────────────────────
    guideline_corpus_dir: Path = Path("data/guidelines")
    guideline_top_k: int = 3

    # ── Early Warning (NEWS2) ────────────────────────────────────────────────
    news2_alert_threshold: int = 7

    # ── Logging ───────────────────────────────────────────────────────────────
    log_level: str = "INFO"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached singleton settings instance."""
    return Settings()
