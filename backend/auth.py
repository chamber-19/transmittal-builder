"""
Google OAuth 2.0 ID-token verification and access-control helpers.

Environment variables
---------------------
GOOGLE_CLIENT_ID   Client ID from Google Cloud Console (required when DISABLE_AUTH != "1")
ALLOWED_EMAILS     Comma-separated allow-list; empty = any verified Google user
DISABLE_AUTH       Set to "1" to skip all auth checks in local dev
ACCESS_LOG_PATH    Path for the CSV access log (default: access.log beside app.py)
"""
from __future__ import annotations

import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, Request, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

try:
    from google.oauth2 import id_token as _gid
    from google.auth.transport import requests as _greq
    _GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    _GOOGLE_AUTH_AVAILABLE = False

_BEARER = HTTPBearer(auto_error=False)

GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
DISABLE_AUTH: bool = os.getenv("DISABLE_AUTH", "0") == "1"
_LOG: Path = Path(os.getenv("ACCESS_LOG_PATH", str(Path(__file__).parent / "access.log")))


def _allowed_emails() -> set[str]:
    emails: set[str] = {
        e.strip().lower()
        for e in os.getenv("ALLOWED_EMAILS", "").split(",")
        if e.strip()
    }
    p = Path(__file__).parent / "allowed_emails.json"
    if p.is_file():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            emails |= {str(e).strip().lower() for e in data if e}
        except Exception:
            pass
    return emails


def log_access(email: str, method: str, path: str, status: int, ip: str = "") -> None:
    row = [datetime.now(timezone.utc).isoformat(), email, method, path, str(status), ip]
    try:
        with _LOG.open("a", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(row)
    except OSError:
        pass


def require_auth(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Security(_BEARER),
) -> dict:
    """FastAPI dependency. Returns {email, name, picture, sub} on success."""
    if DISABLE_AUTH:
        user = {"email": "dev@local", "name": "Dev User", "picture": "", "sub": "dev"}
        request.state.user = user
        return user

    if not creds:
        raise HTTPException(401, "Authentication required")

    if not GOOGLE_CLIENT_ID:
        raise HTTPException(500, "GOOGLE_CLIENT_ID is not configured on the server")

    if not _GOOGLE_AUTH_AVAILABLE:
        raise HTTPException(500, "google-auth package is not installed on the server")

    try:
        idinfo = _gid.verify_oauth2_token(
            creds.credentials,
            _greq.Request(),
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10,
        )
    except Exception as exc:
        raise HTTPException(401, f"Invalid token: {exc}") from exc

    if not idinfo.get("email_verified"):
        raise HTTPException(401, "Google account email is not verified")

    email: str = idinfo["email"].lower()
    allowed = _allowed_emails()
    if allowed and email not in allowed:
        log_access(email, "AUTH", "/auth/check", 403)
        raise HTTPException(403, f"Access denied — {email} is not on the allow-list")

    user = {
        "email": email,
        "name": idinfo.get("name", ""),
        "picture": idinfo.get("picture", ""),
        "sub": idinfo.get("sub", ""),
    }
    request.state.user = user
    return user
