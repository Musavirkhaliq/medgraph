"""
Unit tests for MedGraph translation service & endpoints.
"""

import pytest
from fastapi.testclient import TestClient

from medgraph.api.app import app
from medgraph.services.translation import normalize_lang_code, translate_from_english, translate_text, translate_to_english

client = TestClient(app)


def test_normalize_lang_code():
    assert normalize_lang_code("ur") == "ur"
    assert normalize_lang_code("Urdu") == "ur"
    assert normalize_lang_code("hi") == "hi"
    assert normalize_lang_code("Hindi") == "hi"
    assert normalize_lang_code("en") == "en"
    assert normalize_lang_code(None) == "en"


def test_translate_text_basic():
    # Same language should return original text instantly
    res = translate_text("Hello doctor", source_lang="en", target_lang="en")
    assert res == "Hello doctor"

    # Simple Urdu -> English translation test
    urdu_text = "مجھے سانس لینے میں تکلیف ہو رہی ہے"
    en_res = translate_to_english(urdu_text, source_lang="ur")
    assert isinstance(en_res, str)
    assert len(en_res) > 0

    # Simple English -> Urdu translation test
    eng_text = "Do you have a fever?"
    ur_res = translate_from_english(eng_text, target_lang="ur")
    assert isinstance(ur_res, str)
    assert len(ur_res) > 0


def test_api_translate_endpoint():
    response = client.post(
        "/api/v1/translate",
        json={
            "text": "بخار اور کھانسی",
            "source_lang": "ur",
            "target_lang": "en"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["original_text"] == "بخار اور کھانسی"
    assert "translated_text" in data
    assert len(data["translated_text"]) > 0
