"""
API endpoint tests for MedGraph.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from medgraph.api.app import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_sessions():
    """Clear active sessions between tests."""
    from medgraph.api.routes import _active_sessions
    _active_sessions.clear()
    yield
    _active_sessions.clear()


class TestHealthEndpoint:
    def test_health_returns_ok(self):
        with patch("medgraph.llm._ollama_available", return_value=False):
            response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data


class TestSessionEndpoints:
    def test_start_session_emergency_detection(self):
        """Emergency keywords should trigger immediate emergency response."""
        response = client.post("/sessions", json={
            "session_id": "test-emergency-001",
            "patient_description": "Patient is having a heart attack and is unconscious",
        })
        assert response.status_code == 200
        data = response.json()
        assert data["emergency"] is True
        assert data["status"] == "emergency"

    def test_get_nonexistent_session_returns_404(self):
        response = client.get("/sessions/nonexistent-session")
        assert response.status_code == 404

    def test_delete_session(self):
        """Deleting a session should return success even if it doesn't exist."""
        response = client.delete("/sessions/some-session-id")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "deleted"

    def test_respond_to_nonexistent_session_returns_404(self):
        response = client.post("/sessions/ghost-session/respond", json={
            "answer": "Some answer"
        })
        assert response.status_code == 404


class TestGraphDiagram:
    def test_graph_diagram_endpoint(self):
        response = client.get("/graph-diagram")
        assert response.status_code == 200
        data = response.json()
        assert "mermaid" in data
        assert "flowchart" in data["mermaid"].lower() or "graph" in data["mermaid"].lower()
