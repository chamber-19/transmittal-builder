# Copilot Instructions — Transmittal Builder

> **Repo:** `chamber-19/transmittal-builder`
> **Role:** Backend service for generating engineering transmittal packages.
>
> **Architecture Change (May 2026):** Tauri desktop shell moved to `chamber-19/launcher`.
> This repo is now **backend-only**: Python FastAPI service for document parsing/rendering.

Use Chamber 19 shared conventions as reference guidance, but this file is the
repo-specific source of truth.

## Current Shape

- `backend/` is a Python FastAPI service for document parsing/rendering.
- **No frontend**: All UI logic moved to `chamber-19/launcher`.
- **No Tauri**: Desktop shell now lives in `launcher` (shared by all apps).
- Activation logic moved to `chamber-19/desktop-toolkit`.
- Consumes `desktop-toolkit` Python package only.

## Build And Test

```text
conda env create -f environment.yml
conda activate transmittal-builder

cd backend
python -m pytest
python -m uvicorn app:app --port 8000
```

## Python Environment Policy

- Use Conda as the default local Python environment manager for this repo.
- Prefer `environment.yml` over ad-hoc `.venv` setup.
- Backend/package commands should assume the active environment is
  `transmittal-builder` unless explicitly overridden.
- Do not hard-code Conda requirements into `desktop-toolkit`; keep toolkit
  consumption environment-manager agnostic.

## Architecture Note: Backend Service Model

This repo provides a **stateless HTTP API** that is:
- Callable from `launcher` (Tauri shell via HTTP)
- Deployable as Docker container, managed service, or standalone process
- Independent of the desktop shell

**The launcher (in `chamber-19/launcher`) handles:**
- Desktop UI, ActivationGate, app routing
- Sidecar startup and subprocess management
- Updates, platform integration (Windows registry, shortcuts, etc.)

**This repo handles:**
- Document rendering (`.docx` → PDF)
- Excel index parsing
- Drawing file merging
- Email transmission

No desktop orchestration logic belongs here.

## Dependency Contract

- Python package pins are in `backend/requirements.txt`.
- Desktop-toolkit is consumed for PDF merge utilities only (not for activation).
- No npm or Cargo dependencies in this repo.

## Review-Critical Rules

- Do not add UI code, Tauri commands, or React components.
- Do not add activation/PIN logic (lives in `desktop-toolkit` now).
- User-facing behavior changes require `CHANGELOG.md` under `## [Unreleased]`.
- Changes that affect the HTTP API contract must be documented in README.

## Markdown Formatting Standards

All markdown files in this repo **MUST** be formatted cleanly with no linter warnings:

- **Fenced code blocks** require language specifiers: ` ```python` (not ` ``` `)
- **Headings** must not be duplicated in the same document
- **Lists** must be surrounded by blank lines
- **Line length** should be kept reasonable (80-100 chars preferred, hard wrap at 120)
- Run linter before committing: `npm run lint:md` (if available) or use editor validation

Agent guidance: Any markdown file with linter warnings is treated as technical debt.
Format fixes are low-risk and required. Update all `.md` files before merging PRs.
For new markdown files, validate with editor linter before committing.
