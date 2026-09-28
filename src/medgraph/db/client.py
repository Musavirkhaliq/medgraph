"""
Supabase Client & Database Connection Handler.
Supports live Supabase REST API & Local Dev Memory Store Fallback.
"""

import logging
import uuid
from typing import Any

import httpx

from medgraph.config import get_settings

logger = logging.getLogger(__name__)


def to_uuid_safe(val: Any) -> str:
    """Normalize string IDs (e.g. 'pat-001') to valid PostgreSQL UUID format."""
    if not val:
        return "00000000-0000-0000-0000-000000000001"
    val_str = str(val).strip().lower()
    try:
        return str(uuid.UUID(val_str))
    except (ValueError, AttributeError):
        if val_str in ("pat-001", "patient-001", "default", "unknown"):
            return "00000000-0000-0000-0000-000000000001"
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, val_str))


class SupabaseDatabaseClient:
    """Async Client interface for Supabase PostgreSQL REST / Auth API."""

    def __init__(self):
        settings = get_settings()
        self.supabase_url = getattr(settings, "supabase_url", "")
        self.supabase_key = getattr(settings, "supabase_key", "")
        self.is_configured = bool(self.supabase_url and self.supabase_key)
        
        # Headers for Supabase API requests
        self.headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    async def ensure_patient_exists(self, patient_id: str) -> None:
        """Ensure patient UUID exists in Supabase patients table to prevent FK conflicts."""
        if not self.is_configured:
            return
        pid = to_uuid_safe(patient_id)
        patient_row = {
            "id": pid,
            "mrn": f"MRN-{pid[:8].upper()}",
            "full_name": "Default Patient" if pid == "00000000-0000-0000-0000-000000000001" else f"Patient {pid[:8]}",
            "date_of_birth": "1990-01-01",
            "gender": "unknown",
        }
        headers = {**self.headers, "Prefer": "resolution=ignore-duplicates"}
        url = f"{self.supabase_url.rstrip('/')}/rest/v1/patients"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(url, headers=headers, json=patient_row)
        except Exception:
            pass

    async def sign_in_with_password(self, email: str, password: str) -> dict[str, Any] | None:
        """Authenticate against Supabase's GoTrue Auth API (verifies the password).

        Returns the auth response (access_token + user) on success, or None on
        invalid credentials / failure. Callers must not treat a matching email
        in user_profiles as sufficient proof of identity — the password has to
        be checked here, against Supabase's own hashed credential store.
        """
        if not self.is_configured:
            return None

        url = f"{self.supabase_url.rstrip('/')}/auth/v1/token"
        headers = {"apikey": self.supabase_key, "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                res = await client.post(
                    url,
                    headers=headers,
                    params={"grant_type": "password"},
                    json={"email": email, "password": password},
                )
                if res.status_code != 200:
                    return None
                return res.json()
            except Exception as exc:
                logger.error("[Supabase Auth] sign-in request failed: %s", exc)
                return None

    async def rest_request(
        self,
        method: str,
        table: str,
        params: dict[str, Any] | None = None,
        json_data: Any | None = None,
    ) -> list[dict[str, Any]]:
        """Execute HTTP REST request to Supabase PostgREST endpoint."""
        if not self.is_configured:
            return []

        url = f"{self.supabase_url.rstrip('/')}/rest/v1/{table}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                res = await client.request(
                    method=method.upper(),
                    url=url,
                    headers=self.headers,
                    params=params,
                    json=json_data,
                )
                res.raise_for_status()
                data = res.json()
                return data if isinstance(data, list) else [data]
            except Exception as exc:
                logger.error("[Supabase DB] HTTP %s request to %s failed: %s", method, table, exc)
                return []

    async def rpc(self, fn_name: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        """Call a Postgres function via PostgREST's ``/rest/v1/rpc/`` endpoint.

        Used for pgvector cosine-similarity search (``match_local_memory`` /
        ``match_global_memory`` in schema.sql) — PostgREST can't order by vector
        distance directly, so the comparison has to happen inside a SQL function.
        Returns ``[]`` on any failure (unconfigured, function not migrated yet,
        etc.) so callers can fall straight back to keyword scoring.
        """
        if not self.is_configured:
            return []

        url = f"{self.supabase_url.rstrip('/')}/rest/v1/rpc/{fn_name}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                res = await client.post(url, headers=self.headers, json=params)
                res.raise_for_status()
                data = res.json()
                return data if isinstance(data, list) else [data]
            except Exception as exc:
                logger.debug("[Supabase DB] RPC %s failed (falling back to keyword scoring): %s", fn_name, exc)
                return []


# Global singleton instance
_db_client_instance: SupabaseDatabaseClient | None = None


def get_db_client() -> SupabaseDatabaseClient:
    """Retrieve global Supabase database client instance."""
    global _db_client_instance
    if _db_client_instance is None:
        _db_client_instance = SupabaseDatabaseClient()
    return _db_client_instance
