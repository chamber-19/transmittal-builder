# Copilot Instructions — Transmittal Builder

> **Repo:** `chamber-19/transmittal-builder`
> **Role:** Standalone Tauri app for generating engineering transmittal packages.

Use Chamber 19 shared conventions as reference guidance, but this file is the
repo-specific source of truth.

## Current Shape

- `backend/` is a Python FastAPI service for document parsing/rendering.
- `frontend/` is the React/Vite/Tauri desktop shell.
- This repo consumes `desktop-toolkit` through npm, Cargo, and Python.

## Build And Test

```text
cd backend
python -m pytest

cd frontend
npm ci
npm run build

cd frontend/src-tauri
cargo check
```

## Dependency Contract

- Keep app versions aligned across `frontend/package.json`,
  `frontend/src-tauri/Cargo.toml`, and `frontend/src-tauri/tauri.conf.json`.
- Toolkit bumps must update npm, Cargo, and backend Python git pins together
  when all are present, with lockfiles refreshed.
- Toolkit pin bumps are manual review PRs; Dependabot ignores those pins.

## Review-Critical Rules

- Preserve the desktop-first workflow and local sidecar startup behavior.
- Do not hand-edit generated icon/installer raster assets without updating the
  SVG masters or generator flow.
- Release workflow changes must update `RELEASING.md` and troubleshooting docs.
- User-facing behavior changes require `CHANGELOG.md` under `## [Unreleased]`.

Path-specific rules live under `.github/instructions/`.
