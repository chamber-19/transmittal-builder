# Copilot Instructions — Transmittal Builder

> **Repo:** `chamber-19/transmittal-builder`
> **Role:** Backend service for generating engineering transmittal packages.
>
> **Source of Truth:** See [`chamber-19/.github`](https://github.com/chamber-19/.github) for:
> - Org-wide architecture and SKILLS
> - Hard architectural decisions (Tauri, Python, Rust constraints)
> - Family-wide conventions and AI agent guidance
>
> This file contains **repo-specific guidance only**. Repo-specific rules override
> org-wide rules on conflict.

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

## SKILLS and Shared Resources

This repo draws on shared knowledge from [`chamber-19/.github`](https://github.com/chamber-19/.github):

- **SKILLS** — Reusable domain knowledge in `.github/` folder (Tauri, Python, Rust, Markdown, etc.)
- **`copilot-instructions.md`** — Org-wide baseline for all agents
- **Hard architectural decisions** — Closed decisions on Tauri, Python, AutoCAD patterns
- **Family conventions** — Shared practices across all repos

**When working in this repo:** Always check `.github` repo first for shared context,
then apply repo-specific rules from this file. Repo-specific rules override org-wide
rules on conflict.


<!-- Added by chamber-19-skill-sync — required skill references for this repo's stack -->
- Read [`docs/skills/PYTHON.md`](https://github.com/chamber-19/.github/blob/main/docs/skills/PYTHON.md) before any Python work.
- Read [`docs/skills/RUST.MD`](https://github.com/chamber-19/.github/blob/main/docs/skills/RUST.MD) before any Rust work.
- Read [`docs/skills/TAURI.MD`](https://github.com/chamber-19/.github/blob/main/docs/skills/TAURI.MD) before any Tauri work.
