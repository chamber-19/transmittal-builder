# Changelog

All notable changes to Transmittal Builder are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [6.2.7] — 2026-04-24

### Fixed

- **Release workflow now builds `desktop-toolkit-updater.exe` from the
  correct toolkit tag.** `.github/workflows/release.yml` "Build
  desktop-toolkit-updater shim" step had a hardcoded
  `$desktopToolkitTag = "v2.2.6"` that was not bumped when the rest of
  the source pins moved to v2.2.7. The shipped shim binary was therefore
  compiled from v2.2.6 source and used `/PASSIVE /NORESTART` (visible
  NSIS window) instead of v2.2.7's `/S` (fully silent). See PR #103.
- **Local `frontend/src-tauri/installer/hooks.nsh` no longer kills the
  updater shim during preinstall.** The local override was a frozen copy
  of the v2.2.6 upstream `hooks.nsh` and still ran
  `taskkill /F /IM "desktop-toolkit-updater.exe"` in
  `NSIS_HOOK_PREINSTALL`. During an in-app update the shim is the
  process actively running the installer and blocking on
  `child.wait()`; killing it mid-install orphaned the update flow and
  prevented the post-install relaunch. Matches v2.2.7 upstream
  `hooks.nsh`. See PR #103.

## [6.2.6] — 2026-04-24

### Fixed

- Bumped `@chamber-19/desktop-toolkit` pin to v2.2.7, which fixes the broken
  in-app update flow. Users on v6.2.4 or v6.2.5 who attempted to auto-update
  received a brief installer flash and then no update occurred. Root causes
  were upstream in desktop-toolkit (chamber-19/desktop-toolkit#31): NSIS
  silent-install flag was incorrect (`/PASSIVE` instead of `/S`), and
  `hooks.nsh` was killing the updater shim mid-install. **Note:** the
  source pins (`package.json`, `Cargo.toml`, both lockfiles) correctly
  resolved to v2.2.7 in this release, but the build artifact did not
  actually carry v2.2.7's code — the CI workflow had a hardcoded shim
  tag at v2.2.6 and the local `hooks.nsh` override was never updated.
  See v6.2.7 for the actual delivery of the v2.2.7 fix.

## [6.2.5] — 2026-04-24

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
