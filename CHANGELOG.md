# Changelog

All notable changes to Transmittal Builder are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Fixed

- **Document index and merged PDF now appear in natural drawing-number order.**
  PDFs dropped onto the file zone (and the resulting document index rows)
  are now sorted by drawing number using a numeric collator both at
  drop-time and at submit-time, instead of inheriting the browser's
  arbitrary file-delivery order. See PR #99.

### Removed

- **Removed unused `frontend/transmittal-builder.jsx`.** This was a
  legacy single-file variant of the UI from before the `frontend/src/`
  refactor. It was not referenced by `index.html`, `vite.config.js`,
  or `main.jsx`, and not imported anywhere in the codebase.

## [6.2.4] — 2026-04-22

### Fixed

- **NSIS installer title bar now resolves the app name correctly.**
  The local `hooks.nsh` override now uses the runtime `$(^Name)` token
  instead of `${PRODUCTNAME}`, which Tauri includes too early for direct
  caption expansion.
- **Installer branding no longer regresses to stale packaged BMP text.**
  The local prebuild sync now trusts the SVG masters and regenerates the
  NSIS BMPs on every build instead of copying pre-rendered BMPs from the
  upstream package.

## [6.2.3] — 2026-04-22

### Changed

- Bumped `@chamber-19/desktop-toolkit` to **v2.2.6** (JS, Rust, and Python in lockstep).
  Picks up the upstream updater shim resolution fix
  (`app.path().resource_dir()` first, fall back to app exe directory).

### Fixed

- **Release workflow no longer ships a stale cached installer.**
  `release.yml` now wipes `frontend/src-tauri/target/release/bundle/nsis`
  before `tauri build` and selects the installer whose filename matches
  the current tag, rather than `Select-Object -First 1`. Mirrors
  chamber-19/desktop-toolkit#25.
- **`scripts/publish-to-drive.ps1` now copies the installer named by `latest.json`.**
  Errors loudly with the list of available executables if the expected
  installer is missing instead of silently publishing the wrong file.
- **Local `npm run desktop:build` now self-cleans the NSIS bundle dir**
  via the new `predesktop:build` hook + `frontend/scripts/clean-bundle.mjs`.
