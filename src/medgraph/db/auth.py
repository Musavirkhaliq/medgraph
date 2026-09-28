"""
Doctor & Patient Authentication Service.
Handles Supabase Auth, Doctor/Patient Role-Based Access, and Session Tokens.
"""

import logging
import uuid

from medgraph.db.client import get_db_client
from medgraph.db.models import UserProfile, UserRole

logger = logging.getLogger(__name__)

_local_users_db: dict[str, dict] = {
    "musavir119s@gmail.com": {
        "id": "admin-001",
        "email": "musavir119s@gmail.com",
        "password": "Subeena@musa123",
        "full_name": "Musavir (System Admin)",
        "role": "admin",
        "department": "Executive System Administration",
    },
    "doctor@medai.ltm": {
        "id": "doc-001",
        "email": "doctor@medai.ltm",
        "password": "password123",
        "full_name": "Dr. Sarah Jenkins, MD",
        "role": "doctor",
        "license_number": "MD-90821-CA",
        "specialty": "Pulmonology & Internal Medicine",
        "department": "Department of Respiratory Medicine",
    },
    "patient@medai.ltm": {
        "id": "pat-001",
        "email": "patient@medai.ltm",
        "password": "password123",
        "full_name": "John Doe",
        "role": "patient",
        "phone": "+1-555-0192",
    }
}


async def login_user(email: str, password: str) -> tuple[UserProfile | None, str | None]:
    """
    Authenticate Doctor, Patient, or Admin cleanly.
    Returns (UserProfile, token_or_error_message).
    """
    client = get_db_client()
    email_clean = email.strip().lower()

    # 1. Check local seed accounts first (for immediate admin / doctor / patient dev login)
    if email_clean in _local_users_db:
        user_info = _local_users_db[email_clean]
        if user_info["password"] == password:
            profile = UserProfile(
                id=user_info["id"],
                email=user_info["email"],
                full_name=user_info["full_name"],
                role=user_info["role"],
                license_number=user_info.get("license_number"),
                specialty=user_info.get("specialty"),
                department=user_info.get("department"),
            )
            fake_token = f"medai_token_{user_info['id']}"
            return profile, fake_token
        return None, "Invalid password."

    # 2. Check live Supabase user_profiles table if configured
    if client.is_configured:
        try:
            profiles = await client.rest_request("GET", "user_profiles", params={"email": f"eq.{email_clean}"})
            if profiles and len(profiles) > 0:
                p = profiles[0]
                profile = UserProfile(
                    id=p["id"],
                    email=p["email"],
                    full_name=p["full_name"],
                    role=p.get("role", "patient"),
                    license_number=p.get("license_number"),
                    specialty=p.get("specialty"),
                    department=p.get("department"),
                )
                fake_token = f"medai_token_{p['id']}"
                return profile, fake_token
        except Exception as exc:
            logger.error("[Auth] Live Supabase profile lookup failed: %s", exc)

    return None, "User account not found. Please check your credentials or register an account."


async def signup_user(
    email: str,
    password: str,
    full_name: str,
    role: UserRole = "patient",
    license_number: str | None = None,
    specialty: str | None = None,
) -> tuple[UserProfile | None, str | None]:
    """Register a new Doctor or Patient account."""
    email_clean = email.strip().lower()
    if email_clean in _local_users_db:
        return None, "Account already exists with this email address."

    new_id = str(uuid.uuid4())
    new_user = {
        "id": new_id,
        "email": email_clean,
        "password": password,
        "full_name": full_name,
        "role": role,
        "license_number": license_number,
        "specialty": specialty,
    }
    _local_users_db[email_clean] = new_user

    profile = UserProfile(
        id=new_id,
        email=email_clean,
        full_name=full_name,
        role=role,
        license_number=license_number,
        specialty=specialty,
    )
    fake_token = f"medai_token_{new_id}"
    return profile, fake_token
