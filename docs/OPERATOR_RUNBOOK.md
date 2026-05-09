# Operator Runbook

Operational procedures for release, update, and machine PIN activation.

---

## 1. Environment Baseline (Operators)

Use the project Conda environment before backend tooling operations:

```powershell
conda env create -f environment.yml
conda activate transmittal-builder
```

Backend verification:

```powershell
cd backend
python -m pytest
```

---

## 2. PIN Activation Operations

The app uses `desktop-toolkit` machine-bound PIN activation primitives.

### Required build-time secrets

Set these for release packaging:

- `ACTIVATION_DRIVE_FILE_ID`
- `ACTIVATION_DRIVE_API_KEY`
- `ACTIVATION_HMAC_SECRET`

### Generate a PIN

Use the upstream toolkit script:

```powershell
python scripts/generate_key.py --name "Engineer Name" --expires "2026-12-31"
```

### Add PIN entry

Paste generated key entry into Drive auth JSON (`keys` object), then share PIN
through a secure channel.

### Revoke PIN

Set:

- `active: false` to revoke at next token refresh
- `expires` to a past date for immediate expiry behavior

---

## 3. PIN Enforcement Policy

PIN UI enforcement is build-time gated.

- Default behavior (local dev, coding-agent runs): PIN gate disabled.
- Packaged/release builds: enable by setting `TB_ENFORCE_PIN=1`.

This avoids blocking Copilot/agent automation while enforcing activation in
production artifacts.

---

## 4. Release Checklist (Ops)

- Ensure toolkit pins are in sync (`scripts/check-toolkit-pins.ps1`).
- Ensure updater shim exists at `frontend/src-tauri/desktop-toolkit-updater.exe`.
- Build and test:

```powershell
cd backend
python -m pytest

cd ../frontend
npm ci
npm run build

cd src-tauri
cargo check
```

- Push release tag and let `.github/workflows/release.yml` publish assets.
- Mirror release artifacts to shared drive per `RELEASING.md` and
   `docs/AUTO_UPDATER.md`.

---

## 5. Upstream desktop-toolkit Documentation Contract

When Transmittal Builder consumes new activation behavior or policy changes,
ensure upstream docs are updated in `chamber-19/desktop-toolkit` as needed:

- `docs/CONSUMING.md` (consumer integration contract)
- `docs/activation.md` (PIN provisioning and operational lifecycle)

Reference URLs:

- https://github.com/chamber-19/desktop-toolkit/blob/main/docs/CONSUMING.md
- https://github.com/chamber-19/desktop-toolkit/blob/main/docs/activation.md

For this repo, keep links current in:

- `docs/CONDA.md`
- `RELEASING.md`
- `.github/copilot-instructions.md`
