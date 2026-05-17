"""
Authentication for Transmittal-Builder backend.

Two accepted credentials, tried in order:

1. **Toolkit bearer** -- short-lived HMAC token issued by the
   `@chamber-19/desktop-toolkit` activation flow on a launcher-managed
   machine. Verifies via `chamber19_desktop_toolkit.auth.verify_toolkit_bearer`
   using the shared `ACTIVATION_HMAC_SECRET`. Used by launcher-routed
   traffic from activated desktops.

2. **Google ID token** -- the historical direct-browser path. Verifies via
   `google.oauth2.id_token.verify_oauth2_token` against `GOOGLE_CLIENT_ID`,
   then enforces `ALLOWED_EMAILS`. Used by browser sign-in users.

Both paths return the same user dict shape so the 18 `Depends(require_auth)`
callsites do not need to know which path authenticated the request.

Environment variables
---------------------
ACTIVATION_HMAC_SECRET  Shared secret with the desktop binary's compile-time
                        ACTIVATION_HMAC_SECRET. When set, toolkit bearers
                        are accepted. When unset, only Google auth is tried.
GOOGLE_CLIENT_ID        Google OAuth 2.0 client ID. Required for Google auth.
ALLOWED_EMAILS          Comma-separated allow-list; empty = any verified Google user.
DISABLE_AUTH            Set to "1" to skip all auth checks in local dev.
ACCESS_LOG_PATH         Path for the CSV access log (default: access.log beside app.py)
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

try:
    from chamber19_desktop_toolkit.auth import (
        ToolkitBearerError,
        verify_toolkit_bearer,
    )
    _TOOLKIT_AUTH_AVAILABLE = True
except ImportError:
    _TOOLKIT_AUTH_AVAILABLE = False

_BEARER = HTTPBearer(auto_error=False)

GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
DISABLE_AUTH: bool = os.getenv("DISABLE_AUTH", "0") == "1"
_TOOLKIT_AUTH_ENABLED: bool = bool(os.getenv("ACTIVATION_HMAC_SECRET"))
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


def _try_toolkit_bearer(creds: HTTPAuthorizationCredentials) -> Optional[dict]:
    """Attempt toolkit-bearer verification. Returns user dict on success, None on
    'not a toolkit bearer' (so the caller can fall through to Google). Raises
    HTTPException only when the token IS a toolkit bearer but is otherwise
    invalid (tampered, expired, signature mismatch)."""
    if not _TOOLKIT_AUTH_ENABLED or not _TOOLKIT_AUTH_AVAILABLE:
        return None

    token = creds.credentials
    # Cheap structural check: toolkit bearers are dot-separated "v1.machine.minute.sig".
    # If the token does not have that shape, treat it as a candidate for Google
    # rather than rejecting outright.
    if not token.startswith("v1.") or token.count(".") != 3:
        return None

    try:
        claims = verify_toolkit_bearer(token)
    except ToolkitBearerError as exc:
        # Token IS a toolkit bearer (shape matched) but verification failed.
        # Hard-reject rather than falling through -- a malformed bearer is not
        # a Google token candidate.
        raise HTTPException(401, f"Invalid toolkit bearer: {exc}") from exc

    machine_id = claims["machine_id"]
    # Synthesize a stable user identity from the machine id so access logs
    # and request.state.user reads work uniformly. Use a "launcher" prefix
    # so it is distinguishable from Google-authed users in the access log.
    short = machine_id[:12] if len(machine_id) >= 12 else machine_id
    return {
        "email": f"launcher+{short}@chamber-19.internal",
        "name": f"Launcher ({short})",
        "picture": "",
        "sub": f"toolkit:{machine_id}",
        "auth_method": "toolkit_bearer",
    }


def _verify_google(creds: HTTPAuthorizationCredentials) -> dict:
    """Verify a Google ID token. Raises HTTPException on any failure."""
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
        raise HTTPException(403, f"Access denied -- {email} is not on the allow-list")

    return {
        "email": email,
        "name": idinfo.get("name", ""),
        "picture": idinfo.get("picture", ""),
        "sub": idinfo.get("sub", ""),
        "auth_method": "google",
    }


def require_auth(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Security(_BEARER),
) -> dict:
    """FastAPI dependency. Returns {email, name, picture, sub, auth_method}.

    Tries toolkit bearer first (cheap local HMAC), falls back to Google ID
    token verification. A token that matches the toolkit bearer shape but
    fails verification hard-rejects rather than falling through.
    """
    if DISABLE_AUTH:
        user = {
            "email": "dev@local",
            "name": "Dev User",
            "picture": "",
            "sub": "dev",
            "auth_method": "disabled",
        }
        request.state.user = user
        return user

    if not creds:
        raise HTTPException(401, "Authentication required")

    # Path 1: toolkit bearer (returns None if disabled / not a candidate).
    toolkit_user = _try_toolkit_bearer(creds)
    if toolkit_user is not None:
        request.state.user = toolkit_user
        return toolkit_user

    # Path 2: Google ID token (existing behavior).
    user = _verify_google(creds)
    request.state.user = user
    return user