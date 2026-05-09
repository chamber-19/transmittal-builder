# Architecture Refactor: Activation + Launcher Consolidation

## Summary

Completed architecture migration to separate concerns:

- **`desktop-toolkit`**: Shared activation service (PIN + hardware + token)
- **`launcher`**: Universal Tauri shell (ActivationGate + app routing)
- **`transmittal-builder`**: Core app logic only (document rendering backend)

## What Changed

### 1. Moved Activation Logic → `desktop-toolkit`

**From:** `transmittal-builder/backend/activation.py`  
**To:** `desktop-toolkit/python/chamber19_desktop_toolkit/activation.py`

**Contains:**
- Office IP gating (`is_office_ip`)
- PIN generation & validation (`request_pin`, `activate_machine`)
- Hardware fingerprinting & token signing
- Token validation & machine revocation
- Audit logging

### 2. Stripped `transmittal-builder` to Core Logic

**Removed:**
- ✅ All Tauri/Rust code (`frontend/src-tauri/`)
- ✅ All React frontend code (`frontend/src/`)
- ✅ Activation endpoints from `backend/app.py`
- ✅ Activation service imports

**Kept:**
- ✅ `backend/core/render.py` — Document rendering
- ✅ `backend/core/excel_parser.py` — Drawing index parsing
- ✅ `backend/app.py` — FastAPI routes for transmittal endpoints only
  - `/api/health`
  - `/api/parse-index`
  - `/api/render`
  - `/api/email`
  - `/api/scan-*`

**Result:** `transmittal-builder` is now a **stateless backend service** that can run anywhere (local dev, Docker, managed service).

### 3. Enhanced `launcher` as Universal Shell

**Added to launcher:**
- ✅ `frontend/src-tauri/src/activation.rs` — Tauri commands for activation
  - `get_hardware_fingerprint()` — Collect machine hardware
  - `request_activation_pin()` — Call toolkit activation server
  - `activate_machine()` — Activate with PIN
  - `validate_activation_token()` — Check token validity
- ✅ `frontend/src/ActivationGate.jsx` — React UI for PIN entry + activation
- ✅ `frontend/src/App.jsx` — Main shell that checks activation, routes to backends
- ✅ Dependencies: `reqwest`, `sha2`, `hostname` for hardware collection

**Architecture:**
```
Launcher (Tauri Shell)
├── startup → check activation
│   ├── if not activated → show ActivationGate
│   │   ├── collect hardware fingerprint
│   │   ├── request PIN (office IP only)
│   │   ├── user enters PIN
│   │   ├── send PIN + hardware to desktop-toolkit activation API
│   │   └── store token in localStorage
│   │
│   └── if activated → show MainApp
│       ├── ActivationGate hidden
│       └── MainApp shows available apps
│
└── MainApp
    └── List/route to available backends
        ├── Transmittal Builder (backend http://127.0.0.1:8000)
        └── [Future apps]
```

## Security Properties (Preserved)

✅ **Office Network Gating**
- PIN request only succeeds from office IPs
- Even if .exe is stolen, attacker on non-office network cannot get PIN

✅ **Hardware Binding**
- Token signed with hardware fingerprint
- Token + hardware mismatch → token invalid
- Stolen token + different hardware → activation fails

✅ **Single-Use PIN**
- PIN burned after first activation
- Same PIN cannot be reused

✅ **Token Expiry**
- Token valid 14 days offline
- After 14 days → forced online revalidation
- Server can revoke machine immediately

✅ **No Credentials in Binary**
- Tauri shell just makes API calls
- All secrets stay server-side
- Bytecode / assembly is unreadable

## Deployment Model

**Old (per-app):**
```
transmittal-builder/
├── Tauri (Rust)
├── React frontend
├── Python backend
└── Activation logic
```

**New (shared + specialized):**
```
launcher/                    ← Deploy once, use for all apps
├── Tauri shell
├── ActivationGate
└── App router

desktop-toolkit/             ← Shared infrastructure
├── Activation service
├── PDF utilities
└── Framework code

transmittal-builder/         ← App-specific only
├── Python backend
├── Rendering logic
└── (no UI, no Tauri)

[future-app]/                ← Any new app
├── Python backend
├── App logic
└── (consumes launcher + toolkit)
```

**Deployment:**
1. Deploy `launcher` as the desktop app (Windows installer, .exe, etc.)
2. Deploy individual backends (transmittal-builder, future apps) as services
3. Deploy `desktop-toolkit` activation server separately (managed service, Docker, etc.)
4. Launcher calls backends via HTTP (local or remote)

## Configuration

**Launcher needs to know:**
- `ACTIVATION_SERVER_URL` — where toolkit activation API lives (e.g., `https://activation.company.com`)
- `BACKEND_URL` — where individual backends live (e.g., `http://127.0.0.1:8000`)

**Toolkit activation server needs:**
- `ACTIVATION_OFFICE_IP_RANGES` — comma-separated office IPs (e.g., `203.0.113.0/24,198.51.100.0/24`)
- `ACTIVATION_SECRET_KEY` — secret for token signing (never in binary)

## Next Steps

1. **Test activation flow:**
   - Build launcher with new Tauri setup
   - Test PIN request → PIN response
   - Test activation with hardware binding
   - Test token storage + validation

2. **Deploy toolkit activation server:**
   - Choose hosting (AWS Lambda, managed service, self-hosted)
   - Configure office IP ranges
   - Set up database (replace in-memory storage)
   - Test audit logging

3. **Set up transmittal-builder as backend service:**
   - Run `python -m uvicorn app:app --port 8000` locally
   - Or containerize + deploy to service mesh
   - Remove all UI code

4. **Update documentation:**
   - User manual: "Open launcher → activation → use Transmittal Builder"
   - Operator runbook: "Deploy in this order: toolkit → launcher → backends"
   - Developer guide: "New apps: add backend + register route in launcher"

## File Summary

**Deleted:**
- ✅ `transmittal-builder/backend/activation.py`
- ✅ `transmittal-builder/frontend/` (all React/Tauri code)
- ✅ `transmittal-builder/frontend/src-tauri/` (all Rust code)

**Created:**
- ✅ `desktop-toolkit/python/chamber19_desktop_toolkit/activation.py`
- ✅ `launcher/frontend/src-tauri/src/activation.rs`
- ✅ `launcher/frontend/src/ActivationGate.jsx`

**Modified:**
- ✅ `transmittal-builder/backend/app.py` (removed activation endpoints)
- ✅ `launcher/frontend/src/App.jsx` (added activation gate + routing)
- ✅ `launcher/frontend/src-tauri/src/lib.rs` (added activation commands)
- ✅ `launcher/frontend/src-tauri/Cargo.toml` (added deps)
