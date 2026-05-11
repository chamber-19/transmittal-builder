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

- Activate the project environment and run backend verification:

```powershell
conda activate transmittal-builder
cd backend
python -m pytest
```

- Confirm `CHANGELOG.md` has a new release section.
- Merge to `main`; `.github/workflows/auto-tag.yml` creates the tag from
  `CHANGELOG.md`, then `.github/workflows/release.yml` builds and publishes the
  backend artifact release.

---

## 5. Production Activation Sanity Check

Before production rollout, validate the release build in launcher-integrated
mode (activation token present, backend starts, health endpoint responds).

From repo root:

```powershell
conda activate transmittal-builder
cd backend
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Then verify in a second terminal:

```powershell
Invoke-WebRequest http://127.0.0.1:8000/api/health
```

Expected result: HTTP 200 with health payload.

---

## 6. Upstream desktop-toolkit Documentation Contract

When Transmittal Builder consumes new activation behavior or policy changes,
ensure upstream docs are updated in `chamber-19/desktop-toolkit` as needed:

- `docs/CONSUMING.md` (consumer integration contract)
- `docs/activation.md` (PIN provisioning and operational lifecycle)

Reference URLs:

- [desktop-toolkit consuming guide](https://github.com/chamber-19/desktop-toolkit/blob/main/docs/CONSUMING.md)
- [desktop-toolkit activation guide](https://github.com/chamber-19/desktop-toolkit/blob/main/docs/activation.md)

For this repo, keep links current in:

- `docs/CONDA.md`
- `RELEASING.md`
- `.github/copilot-instructions.md`
