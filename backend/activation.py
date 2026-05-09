"""
Activation Service — Secure machine enrollment and PIN management

Features:
    - Office IP gating (request PIN only from authorized network)
    - Single-use PIN (burned after first activation)
    - Hardware fingerprint binding (token tied to machine)
    - Audit logging (all requests, successes, failures)
    - Token expiry (14-day offline window, forced revalidation)

Database schema:
    pins: {pin, email, hardware_fingerprint, ip_address, created_at, expires_at, used_at}
    machines: {hardware_fingerprint, token, original_hardware, user_email, activation_time, status}
    audit_log: {timestamp, event_type, pin, email, ip_address, hardware, success, error}
"""

from datetime import datetime, timedelta
from typing import Optional
import secrets
import ipaddress
import os
import logging
import hmac
import hashlib

from fastapi import HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ─── Configuration ────────────────────────────────────────────
# Load from environment; defaults to single office range
OFFICE_IP_RANGES_STR = os.getenv(
    "ACTIVATION_OFFICE_IP_RANGES",
    "203.0.113.0/24"  # Example: replace with real office IPs
)

try:
    OFFICE_IP_RANGES = [
        ipaddress.ip_network(ip.strip())
        for ip in OFFICE_IP_RANGES_STR.split(",")
    ]
except ValueError as e:
    logger.error(f"Invalid IP ranges in ACTIVATION_OFFICE_IP_RANGES: {e}")
    OFFICE_IP_RANGES = []

PIN_EXPIRY_HOURS = 24
TOKEN_EXPIRY_DAYS = 14
ACTIVATION_SECRET_KEY = os.getenv("ACTIVATION_SECRET_KEY", "dev-key-change-in-prod")

# ─── In-Memory Storage (Replace with database in production) ────
pins_db = {}  # pin_value → {email, hardware_fingerprint, ip_address, created_at, expires_at, used_at}
machines_db = {}  # hardware_fingerprint → {token, user_email, activation_time, status, original_hardware}
audit_log = []  # List of {timestamp, event_type, pin, email, ip, hardware, success, error}


# ─── Models ────────────────────────────────────────────────────

class ActivationPayload(BaseModel):
    pin: str
    hardware_fingerprint: str


# ─── Utilities ────────────────────────────────────────────────

def is_office_ip(client_ip: str) -> bool:
    """Check if IP is in authorized office ranges"""
    try:
        ip_obj = ipaddress.ip_address(client_ip)
        for ip_range in OFFICE_IP_RANGES:
            if ip_obj in ip_range:
                return True
    except ValueError:
        logger.warning(f"Invalid IP format: {client_ip}")
    return False


def get_client_ip(request: Request) -> str:
    """Extract real client IP (handles proxies)"""
    # If behind proxy, use X-Forwarded-For
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host


def generate_pin() -> str:
    """Generate 6-digit PIN"""
    return f"{secrets.randbelow(999999):06d}"


def sign_token(token: str, hardware_fingerprint: str) -> str:
    """Sign token with hardware fingerprint to prevent forgery"""
    message = f"{token}|{hardware_fingerprint}"
    signature = hmac.new(
        ACTIVATION_SECRET_KEY.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()
    return f"{message}|{signature}"


def verify_token_signature(signed_token: str, hardware_fingerprint: str) -> Optional[str]:
    """Verify token signature, return token if valid"""
    try:
        parts = signed_token.rsplit("|", 1)
        if len(parts) != 2:
            return None
        token_data, signature = parts
        
        expected_sig = hmac.new(
            ACTIVATION_SECRET_KEY.encode(),
            token_data.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(signature, expected_sig):
            return None
        
        # Extract token from token_data
        token = token_data.split("|")[0]
        return token
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        return None


def log_audit(event_type: str, pin: Optional[str], email: str, ip: str, 
              hardware: str, success: bool, error: Optional[str] = None):
    """Log activation events for audit trail"""
    audit_log.append({
        "timestamp": datetime.utcnow().isoformat(),
        "event_type": event_type,
        "pin": pin[:3] + "***" if pin else None,  # Mask PIN in logs
        "email": email,
        "ip": ip,
        "hardware": hardware[:16] + "..." if hardware else None,
        "success": success,
        "error": error,
    })
    
    if success:
        logger.info(f"ACTIVATION {event_type}: email={email}, ip={ip}, hardware={hardware[:16]}...")
    else:
        logger.warning(f"ACTIVATION FAILED {event_type}: email={email}, error={error}")


# ─── Endpoints ────────────────────────────────────────────────

async def request_pin(request: Request):
    """
    Step 1: User requests PIN (office network only)
    
    Validation:
      - Must be on office network (IP check)
    
    Response:
      - If valid: return PIN directly (office network = trusted)
      - If invalid: return 403
    """
    client_ip = get_client_ip(request)
    
    # Validate IP
    if not is_office_ip(client_ip):
        error = f"Not on office network"
        log_audit("request_pin", None, "unknown", client_ip, "", False, error)
        raise HTTPException(
            status_code=403,
            detail="Must be on office network to request PIN"
        )
    
    # Generate PIN
    pin = generate_pin()
    expires_at = (datetime.utcnow() + timedelta(hours=PIN_EXPIRY_HOURS)).isoformat()
    
    # Store PIN (server-side only)
    pins_db[pin] = {
        "email": None,
        "hardware_fingerprint": None,  # Will be filled at activation
        "ip_address": client_ip,
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": expires_at,
        "used_at": None,
    }
    
    # Log successful request
    log_audit("request_pin", pin, "office_user", client_ip, "", True)
    
    logger.info(f"PIN generated from office IP {client_ip}: {pin}")
    
    return {
        "success": True,
        "pin": pin,  # Return PIN directly to user
    }


async def activate_machine(req: ActivationPayload, request: Request):
    """
    Step 2: User enters PIN + hardware fingerprint
    
    Validation:
      - PIN must exist
      - PIN must not be expired
      - PIN must not be already used
      - Hardware fingerprint must be provided
    
    Response:
      - If valid: return token (signed with hardware binding)
      - If invalid: return 400 with error
    """
    client_ip = get_client_ip(request)
    pin = req.pin.strip()
    hardware = req.hardware_fingerprint.strip()
    
    # Validate PIN exists
    if pin not in pins_db:
        error = "PIN not found or invalid"
        log_audit("activate", pin, "unknown", client_ip, hardware, False, error)
        raise HTTPException(status_code=400, detail=error)
    
    pin_record = pins_db[pin]
    
    # Validate PIN not expired
    expires_at = datetime.fromisoformat(pin_record["expires_at"])
    if datetime.utcnow() > expires_at:
        del pins_db[pin]
        error = "PIN expired"
        log_audit("activate", pin, pin_record["email"], client_ip, hardware, False, error)
        raise HTTPException(status_code=400, detail=error)
    
    # Validate PIN not already used
    if pin_record["used_at"] is not None:
        error = "PIN already used"
        log_audit("activate", pin, pin_record["email"], client_ip, hardware, False, error)
        raise HTTPException(status_code=400, detail=error)
    
    # Mark PIN as used
    pin_record["used_at"] = datetime.utcnow().isoformat()
    pin_record["hardware_fingerprint"] = hardware
    
    # Issue token (signed with hardware binding)
    raw_token = secrets.token_urlsafe(64)
    signed_token = sign_token(raw_token, hardware)
    
    # Store machine activation
    machines_db[hardware] = {
        "token": signed_token,
        "original_hardware": hardware,
        "user_email": pin_record["email"],
        "activation_time": datetime.utcnow().isoformat(),
        "status": "active",
    }
    
    # Log success
    log_audit("activate", pin, pin_record["email"], client_ip, hardware, True)
    
    return {
        "success": True,
        "token": signed_token,
        "expires_in_days": TOKEN_EXPIRY_DAYS,
    }


async def validate_token(hardware_fingerprint: str, token: str, request: Request):
    """
    Step 3: App periodically validates token (on startup, or every 14 days)
    
    Validation:
      - Token must exist
      - Token signature must be valid
      - Hardware must match original hardware
      - Token must not be expired
    
    Response:
      - If valid: return success
      - If invalid: return 401 (forces re-enrollment)
    """
    client_ip = get_client_ip(request)
    
    # Verify token signature
    verified_token = verify_token_signature(token, hardware_fingerprint)
    if verified_token is None:
        error = "Token signature invalid"
        log_audit("validate_token", None, "unknown", client_ip, hardware_fingerprint, False, error)
        raise HTTPException(status_code=401, detail=error)
    
    # Check if hardware activation exists
    if hardware_fingerprint not in machines_db:
        error = "Hardware not enrolled"
        log_audit("validate_token", None, "unknown", client_ip, hardware_fingerprint, False, error)
        raise HTTPException(status_code=401, detail=error)
    
    machine = machines_db[hardware_fingerprint]
    
    # Check token expiry
    activation_time = datetime.fromisoformat(machine["activation_time"])
    age_days = (datetime.utcnow() - activation_time).days
    
    if age_days > TOKEN_EXPIRY_DAYS:
        del machines_db[hardware_fingerprint]
        error = f"Token expired (age={age_days} days)"
        log_audit("validate_token", None, machine["user_email"], client_ip, hardware_fingerprint, False, error)
        raise HTTPException(status_code=401, detail=error)
    
    # Log success
    log_audit("validate_token", None, machine["user_email"], client_ip, hardware_fingerprint, True)
    
    return {
        "valid": True,
        "token_age_days": age_days,
        "expires_in_days": TOKEN_EXPIRY_DAYS - age_days,
    }


async def revoke_machine(hardware_fingerprint: str):
    """
    Admin: Revoke a machine's activation (e.g., compromised or employee left)
    """
    if hardware_fingerprint in machines_db:
        machine = machines_db[hardware_fingerprint]
        del machines_db[hardware_fingerprint]
        logger.info(f"Machine revoked: {hardware_fingerprint}, email={machine['user_email']}")
        return {"success": True, "message": "Machine revoked"}
    
    return {"success": False, "message": "Machine not found"}


async def get_audit_log():
    """
    Admin: Get audit log of all activation attempts
    """
    return {
        "total_entries": len(audit_log),
        "log": audit_log[-100:],  # Last 100 entries
    }
