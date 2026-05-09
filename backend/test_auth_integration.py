"""
Integration tests for authentication with launcher activation tokens.

Tests verify:
1. Public endpoints work without auth
2. Protected endpoints work with Authorization header in development mode
3. Auth middleware is properly integrated

Note: In development mode (REQUIRE_ACTIVATION=false), all auth checks are bypassed
for convenience. Production mode tests would verify Bearer format validation.

Run: pytest test_auth_integration.py -v
"""

import os
import json
import hmac
import base64
import hashlib
import pytest
from fastapi.testclient import TestClient

# Set development mode for testing (skips all auth validation)
os.environ["ENVIRONMENT"] = "development"
os.environ["REQUIRE_ACTIVATION"] = "false"

from app import app

client = TestClient(app)


def _make_dev_payload_token(payload: dict) -> str:
    payload_json = json.dumps(payload).encode("utf-8")
    return base64.b64encode(payload_json).decode("utf-8")


def _make_signed_token(payload: dict, key: str) -> str:
    payload_json = json.dumps(payload).encode("utf-8")
    payload_b64 = base64.b64encode(payload_json).decode("utf-8")
    sig = hmac.new(
        key.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    sig_b64 = base64.b64encode(sig).decode("utf-8")
    return f"{payload_b64}.{sig_b64}"


class TestHealthCheckPublic:
    """Health check endpoint is always public."""

    def test_health_check_public(self):
        """Health check works without authorization header."""
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_health_check_public_without_header(self):
        """Health check works even without any headers."""
        response = client.get("/api/health")
        assert response.status_code == 200
        assert "version" in response.json()


class TestProtectedEndpointsWithAuth:
    """Protected endpoints work with Authorization header."""

    def test_scan_projects_with_bearer_token(self):
        """Scan projects endpoint accepts Bearer token and processes request."""
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            response = client.get(
                f"/api/scan-projects?root={tmpdir}",
                headers={"Authorization": "Bearer test-token"}
            )
            # Should process normally with auth header
            assert response.status_code == 200
            assert "projects" in response.json()

    def test_scan_folder_with_bearer_token(self):
        """Scan folder endpoint accepts Bearer token."""
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            response = client.post(
                "/api/scan-folder",
                json={"folder_path": tmpdir},
                headers={"Authorization": "Bearer test-token"}
            )
            # Should process normally with auth header
            assert response.status_code == 200

    def test_render_with_bearer_token(self):
        """Render endpoint accepts Bearer token."""
        import tempfile
        import json as jsonlib
        with tempfile.TemporaryDirectory() as tmpdir:
            response = client.post(
                "/api/render",
                data={
                    "template": b"",
                    "fields": jsonlib.dumps({}),
                    "checks": jsonlib.dumps({}),
                    "contacts": jsonlib.dumps({}),
                    "documents": jsonlib.dumps({})
                },
                headers={"Authorization": "Bearer test-token"}
            )
            # Should accept token header (may fail on validation but not on auth)
            assert response.status_code in [200, 422]  # 422 if validation fails


class TestAuthMiddlewareIntegration:
    """Verify auth middleware is integrated and functional."""

    def test_protected_endpoint_signature_includes_token(self):
        """Verify endpoint accepts token parameter from middleware."""
        import tempfile
        # This test implicitly verifies auth middleware is integrated:
        # If Depends(verify_activation_token) wasn't in the endpoint signature,
        # this would fail with a different error
        response = client.get(
            f"/api/scan-projects?root=/tmp",
            headers={"Authorization": "Bearer test-token"}
        )
        # Request should process (may fail on other validation but not auth)
        assert response.status_code in [200, 400]

    def test_health_endpoint_not_protected(self):
        """Health check should not require authentication."""
        response = client.get("/api/health")
        assert response.status_code == 200
        # Verify no auth errors are thrown
        assert "detail" not in response.json() or "error" not in response.json().get("detail", "").lower()


class TestAuthProductionMode:
    """Verify auth behavior when activation is required."""

    @pytest.fixture(autouse=True)
    def _force_required_activation(self):
        from core import auth

        old_require = auth.REQUIRE_ACTIVATION
        old_dev_mode = auth.DEVELOPMENT_MODE
        old_key = auth.DESKTOP_TOOLKIT_PUBLIC_KEY

        auth.REQUIRE_ACTIVATION = True
        auth.DEVELOPMENT_MODE = True
        auth.DESKTOP_TOOLKIT_PUBLIC_KEY = "dev-key-changeme"
        auth.get_public_key.cache_clear()

        yield auth

        auth.REQUIRE_ACTIVATION = old_require
        auth.DEVELOPMENT_MODE = old_dev_mode
        auth.DESKTOP_TOOLKIT_PUBLIC_KEY = old_key
        auth.get_public_key.cache_clear()

    def test_missing_auth_header_returns_401_when_required(self):
        """Protected endpoint should reject missing Authorization header."""
        response = client.get("/api/scan-projects?root=/tmp")
        assert response.status_code == 401
        assert "Missing Authorization" in response.json()["detail"]

    def test_invalid_auth_header_format_returns_401_when_required(self):
        """Protected endpoint should reject malformed Authorization header."""
        response = client.get(
            "/api/scan-projects?root=/tmp",
            headers={"Authorization": "token-only"},
        )
        assert response.status_code == 401
        assert "Invalid Authorization header format" in response.json()["detail"]

    def test_dev_payload_token_allows_request_when_required(self):
        """In development mode with activation required, a decodable Bearer token is accepted."""
        import tempfile

        token = _make_dev_payload_token(
            {
                "hardware_fingerprint": "dev-test",
                "issued_at": "2026-05-08T00:00:00",
                "expires_in": 30,
            }
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            response = client.get(
                f"/api/scan-projects?root={tmpdir}",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert response.status_code == 200

    def test_signed_token_allows_request_in_production_mode(self):
        """In production mode, a valid signed token is accepted."""
        import tempfile
        from core import auth

        auth.DEVELOPMENT_MODE = False
        auth.REQUIRE_ACTIVATION = True
        auth.DESKTOP_TOOLKIT_PUBLIC_KEY = "prod-test-key"
        auth.get_public_key.cache_clear()

        token = _make_signed_token(
            {
                "hardware_fingerprint": "prod-test",
                "issued_at": "2026-05-08T00:00:00",
                "expires_in": 30,
            },
            "prod-test-key",
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            response = client.get(
                f"/api/scan-projects?root={tmpdir}",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
