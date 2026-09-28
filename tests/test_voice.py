"""
Tests for Voice & Speech-to-Text (ASR) service and API routes.
"""

import pytest
from fastapi.testclient import TestClient

from medgraph.api.app import app
from medgraph.services.voice import COMFORT_MESSAGES, LANGUAGE_META, WhisperASRManager

client = TestClient(app)


def test_language_meta_and_comfort():
    assert "ur" in COMFORT_MESSAGES
    assert "hi" in COMFORT_MESSAGES
    assert "en" in COMFORT_MESSAGES

    assert LANGUAGE_META["ur"]["name"] == "Urdu"
    assert LANGUAGE_META["ur"]["flag"] == "🇵🇰"
    assert LANGUAGE_META["hi"]["name"] == "Hindi"
    assert LANGUAGE_META["hi"]["flag"] == "🇮🇳"


def test_whisper_manager_singleton_and_status():
    manager = WhisperASRManager.get_instance()
    assert manager is not None

    status = manager.status()
    assert "is_loaded" in status
    assert "model_name" in status
    assert "supported_languages" in status
    assert "ur" in status["supported_languages"]
    assert "hi" in status["supported_languages"]


def test_api_voice_status_endpoint():
    response = client.get("/api/v1/voice/status")
    assert response.status_code == 200
    data = response.json()
    assert "model_name" in data
    assert "device" in data
    assert "supported_languages" in data


def test_clean_text_for_speech():
    from medgraph.services.voice import clean_text_for_speech

    raw_text = "### **Clinical Assessment**\n- Patient has *shortness of breath*.\n[ICD-10:J45.909]"
    cleaned = clean_text_for_speech(raw_text)
    assert "#" not in cleaned
    assert "*" not in cleaned
    assert "Shortness of breath" in cleaned or "shortness of breath" in cleaned


def test_api_voice_synthesize_endpoint():
    response = client.post(
        "/api/v1/voice/synthesize",
        data={"text": "Hello doctor, how are you feeling today?", "language": "en"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert len(response.content) > 100

