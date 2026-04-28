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
- A `desktop-toolkit` bump must update **all five** pin locations in the
  same PR: `frontend/package.json` (`@chamber-19/desktop-toolkit`),
  `frontend/src-tauri/Cargo.toml` `[dependencies]` tag,
  `[package.metadata.desktop-toolkit]` `library-tag` and `shim-tag`, and
  `backend/requirements.txt` (`chamber19-desktop-toolkit @ git+...@vX.Y.Z`).
- Both lockfiles (`frontend/package-lock.json` and
  `frontend/src-tauri/Cargo.lock`) must be regenerated, never hand-edited.
- The Python pin is a git URL, not a PyPI version, so there is no
  Python lockfile to regenerate — but the wheel is cached, so a
  `--force-reinstall --no-deps chamber19-desktop-toolkit` is required
  after the pin bump to pick up the new commit.
- `.github/workflows/toolkit-pin-check.yml` enforces parity on every PR
  and push to main. Treat it as a required status check.
- Toolkit pin bumps are manual review PRs; Dependabot ignores those pins.
  Pin-bump PRs must not contain unrelated feature work.

## Review-Critical Rules

- Preserve the desktop-first workflow and local sidecar startup behavior.
- Do not hand-edit generated icon/installer raster assets without updating the
  SVG masters or generator flow.
- Release workflow changes must update `RELEASING.md` and troubleshooting docs.
- User-facing behavior changes require `CHANGELOG.md` under `## [Unreleased]`.

Path-specific rules live under `.github/instructions/`.
