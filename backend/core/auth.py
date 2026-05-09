"""Authorization and activation token validation.

Validates authorization tokens from launcher desktop shell.
Token format: Bearer <token>

Development mode: Accepts any token (for local testing).
Production mode: Verifies token signature and expiration using desktop-toolkit public key.
"""

import os
import json
import hmac
import hashlib
import base64
from datetime import datetime, timedelta
from functools import lru_cache
from fastapi import Header, HTTPException, status

# Configuration
DESKTOP_TOOLKIT_PUBLIC_KEY = os.getenv(
    "DESKTOP_TOOLKIT_PUBLIC_KEY",
    "dev-key-changeme"  # Development placeholder
)

REQUIRE_ACTIVATION = os.getenv("REQUIRE_ACTIVATION", "false").lower() == "true"

DEVELOPMENT_MODE = os.getenv("ENVIRONMENT", "development").lower() == "development"


@lru_cache(maxsize=1)
def get_public_key() -> str:
    """Load desktop-toolkit public key for token verification."""
    return DESKTOP_TOOLKIT_PUBLIC_KEY


async def verify_activation_token(
    authorization: str = Header(None)
) -> dict:
    """
    Verify launcher activation token from Authorization header.

    Expected format: Authorization: Bearer <token>

    Development mode: Accepts any token
    Production mode: Verifies signature and expiration

    Args:
        authorization: Authorization header value

    Returns:
        Decoded token payload with hardware_fingerprint, issued_at, etc.

    Raises:
        HTTPException(401): If token is missing or invalid
    """
    if DEVELOPMENT_MODE and not REQUIRE_ACTIVATION:
        # Development mode: accept any request (no auth required)
        return {
            "mode": "development",
            "hardware_fingerprint": "dev-mode",
            "issued_at": datetime.utcnow().isoformat()
        }

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header"
        )

    # Parse "Bearer <token>"
    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header format. Expected: Bearer <token>"
        )

    token = parts[1]

    try:
        if DEVELOPMENT_MODE:
            # Development: minimal validation (just parse format)
            return parse_token_payload(token)
        else:
            # Production: verify signature and expiration
            return verify_token_signature(token, get_public_key())
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token validation failed"
        )


def parse_token_payload(token: str) -> dict:
    """
    Parse token payload (development mode).

    Token format (development): <payload_base64>.<signature_base64>
    or plain JSON encoded as base64

    Returns:
        Decoded payload dict
    """
    try:
        # Try split format first
        if "." in token:
            payload_b64, _ = token.split(".", 1)
        else:
            payload_b64 = token

        # Decode base64
        payload_json = base64.b64decode(payload_b64).decode("utf-8")
        payload = json.loads(payload_json)

        return payload
    except Exception as e:
        raise ValueError(f"Failed to parse token: {str(e)}")


def verify_token_signature(token: str, public_key: str) -> dict:
    """
    Verify token signature and expiration (production mode).

    Token format: <payload_base64>.<signature_base64>
    where signature = HMAC-SHA256(payload, private_key)

    Token payload must include:
    - hardware_fingerprint: Hardware ID (to prevent token theft)
    - issued_at: ISO timestamp of token creation
    - expires_in: Duration in days (default: 30)

    Args:
        token: Signed token from launcher
        public_key: Desktop-toolkit public key for verification

    Returns:
        Decoded and validated token payload

    Raises:
        ValueError: If signature invalid, token expired, or parsing fails
    """
    try:
        if "." not in token:
            raise ValueError("Invalid token format: missing separator")

        payload_b64, signature_b64 = token.split(".", 1)

        # Verify signature using HMAC-SHA256
        expected_sig = hmac.new(
            public_key.encode("utf-8"),
            payload_b64.encode("utf-8"),
            hashlib.sha256
        ).digest()

        provided_sig = base64.b64decode(signature_b64)

        if not hmac.compare_digest(expected_sig, provided_sig):
            raise ValueError("Signature mismatch")

        # Decode payload
        payload_json = base64.b64decode(payload_b64).decode("utf-8")
        payload = json.loads(payload_json)

        # Validate expiration
        issued_at = datetime.fromisoformat(payload.get("issued_at", "2000-01-01"))
        expires_in_days = payload.get("expires_in", 30)
        expires_at = issued_at + timedelta(days=expires_in_days)

        if datetime.utcnow() > expires_at:
            raise ValueError(f"Token expired at {expires_at.isoformat()}")

        # Validate hardware fingerprint is present
        if "hardware_fingerprint" not in payload:
            raise ValueError("Missing hardware_fingerprint in token")

        return payload

    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Token validation error: {str(e)}")


async def verify_token_optional(
    authorization: str = Header(None)
) -> dict | None:
    """
    Optional token verification (for public endpoints that may accept auth).

    Returns None if no authorization header provided.
    Raises HTTPException if header is present but invalid.

    Args:
        authorization: Authorization header value (optional)

    Returns:
        Token payload dict, or None if no header provided
    """
    if not authorization:
        return None

    return await verify_activation_token(authorization)
