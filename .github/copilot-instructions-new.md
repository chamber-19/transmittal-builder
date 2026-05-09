# Copilot Instructions — Transmittal Builder

> **Repo:** `chamber-19/transmittal-builder`
> **Role:** Backend service for generating engineering transmittal packages.
>
> **Note:** As of May 2026, the Tauri desktop shell has been moved to `chamber-19/launcher`.
> This repo is now **backend-only**: Python FastAPI service for document parsing/rendering.

Use Chamber 19 shared conventions as reference guidance, but this file is the
repo-specific source of truth.

## Current Shape

- `backend/` is a Python FastAPI service for document parsing/rendering.
- **No frontend**: All UI logic moved to `chamber-19/launcher`.
- **No Tauri**: Desktop shell now lives in `launcher` (used by all apps).
- Activation logic moved to `chamber-19/desktop-toolkit`.
- Consumes `desktop-toolkit` Python package for PDF utilities.

## Build And Test

```text
conda env create -f environment.yml
conda activate transmittal-builder

cd backend
python -m pytest
python -m uvicorn app:app --port 8000

# Verify API
curl http://127.0.0.1:8000/api/health
```

## Python Environment Policy

- Use Conda as the default local Python environment manager for this repo.
- Prefer `environment.yml` over ad-hoc `.venv` setup.
- Backend commands should assume the active environment is
  `transmittal-builder` unless explicitly overridden.

## Architecture Note: Backend Service Model

This repo provides a **stateless HTTP API** that is:

- ✅ Callable from `launcher` (Tauri shell)
- ✅ Deployable as a Docker container
- ✅ Deployable as a managed service (serverless, managed cloud runtime, etc.)
- ✅ Consumable by other tools via HTTP

**The launcher handles:**
- Desktop UI, activation gate, app routing
- Sidecar startup and subprocess management
- Updates, platform integration (Windows registry, shortcuts, etc.)

**This repo handles:**
- Document rendering (`.docx` → PDF)
- Excel index parsing
- Drawing file merging
- Email transmission

No desktop orchestration logic belongs here.

## Review-Critical Rules

- Do not add UI code, Tauri commands, or React components.
- Do not add activation/PIN logic (lives in `desktop-toolkit` now).
- User-facing behavior changes require `CHANGELOG.md` under `## [Unreleased]`.
- Changes that affect the HTTP API contract must be documented in README.

Path-specific rules live under `.github/instructions/`.
