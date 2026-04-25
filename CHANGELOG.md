# Changelog

All notable changes to Transmittal Builder are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Changed

- Release notes for the in-app updater are now extracted from the
  matching `## [VERSION]` section of `CHANGELOG.md` instead of a
  hand-maintained `RELEASE_NOTES.md` file. Eliminates duplicate state
  and the v6.2.5-stale-notes bug that affected every release between
  v6.2.6 and v6.3.1 inclusive. `RELEASE_NOTES.md` has been removed.

## [6.3.1] — 2026-04-25

### Added

- **Markdown rendering test release.** This release exists solely to
  verify that the new update modal correctly renders formatted markdown
  in release notes (a feature shipped in v6.3.0 but only visible when
  updating _from_ v6.3.0 to a later version).

### Renderer test cases

The following markdown features should all render correctly in the
update modal you're seeing right now:

#### Headings

- `### H3` should be a sub-heading, not literal text
- `#### H4` should be a smaller sub-heading

#### Inline formatting

- **bold text** should be bold
- _italic text_ should be italic
- `inline code` should be monospaced

#### Lists

- Bullet point one
- Bullet point two
  - Nested bullet
  - Another nested bullet
- Bullet point three

#### Numbered lists

1. First item
2. Second item
3. Third item

#### Links

- [GitHub repo](https://github.com/chamber-19/transmittal-builder)
- [v6.3.0 release notes](https://github.com/chamber-19/transmittal-builder/releases/tag/v6.3.0)

#### Code blocks

Should render as a fenced block:

```text
function hello() {
  console.log("world");
}
```

### Fixed

- Nothing. This is a pure version bump.

### Changed

- Nothing. This is a pure version bump.

## [6.3.0] — 2026-04-25

### Changed

- Bumped `@chamber-19/desktop-toolkit` from v2.2.8 to v2.3.0. Brings three
  user-visible improvements to the in-app update experience:
  - **Release notes are now rendered as formatted markdown** (headers,
    bullets, links) instead of showing raw markdown syntax like
    `## What's new` or `### Fixed` as literal text.
  - **Multi-phase update progress UI**: the update modal now shows
    distinct phases (checking → downloading → verifying → installing →
    launching) with real byte-level progress during download and
    contextual status messages during each step. Errors during any phase
    surface the failing phase name and the path to `updater.log`.
  - **White-flash on launch eliminated**: the main window is now hidden
    until React has rendered its first frame, then revealed via the new
    `showOnReady()` helper. Background color set to `#1C1B19` so any
    brief pre-JS exposure matches the design system instead of showing
    white. See `frontend/src/main.jsx` for the call.

### Migration

- Internal: `frontend/src/main.jsx` now calls
  `showOnReady()` from `@chamber-19/desktop-toolkit/window/showOnReady`
  after `createRoot().render()`. This is a hard requirement of v2.3.0 —
  without it the main window stays invisible after launch. Documented
  in desktop-toolkit `docs/CONSUMING.md` § "Window flash prevention".

## [6.2.9] — 2026-04-25

### Changed

- Trivial version bump to enable an end-to-end verification of the v6.2.8 → v6.2.9 in-app update flow. v6.2.8 was the first release with the fixed `desktop-toolkit-updater` shim (see [chamber-19/desktop-toolkit#31](https://github.com/chamber-19/desktop-toolkit/pull/31) + [#33](https://github.com/chamber-19/desktop-toolkit/pull/33)), but the only way to prove the fix works empirically is to actually perform an in-app update _from_ v6.2.8 _to_ a later version — this is that later version. No functional changes from v6.2.8.

## [6.2.8] — 2026-04-24

### Added

- **CI guard against `desktop-toolkit` pin drift.** New
  `.github/workflows/toolkit-pin-check.yml` runs `scripts/check-toolkit-pins.ps1`
  on every PR and on push to `main`. The script asserts that the
  `@chamber-19/desktop-toolkit` version in `frontend/package.json`
  matches the `library-tag`, `shim-tag`, and `[dependencies]` tag in
  `frontend/src-tauri/Cargo.toml`. After PR #105 (B2: single source of
  truth via `[package.metadata.desktop-toolkit]`) and PR #106 (B3:
  retired local `hooks.nsh`), this is the last possible drift surface
  for the toolkit pin — the guard makes that drift impossible to merge
  without a loud CI failure. Closes the elimination plan from PR #103's
  diagnostic.

### Changed

- Bumped `@chamber-19/desktop-toolkit` from v2.2.7 to v2.2.8 (absorbs the
  `$(^Name)` caption fix and clarifies POSTINSTALL behavior —
  see [chamber-19/desktop-toolkit#33](https://github.com/chamber-19/desktop-toolkit/pull/33)).
- **Retired the local `frontend/src-tauri/installer/hooks.nsh` override.** All
  customizations the local file carried have been absorbed upstream as of
  v2.2.8. `tauri.conf.json` now points `installerHooks` directly at the file
  in `node_modules`. This eliminates the entire bug class from PR #103's Bug #2
  (local override silently drifting from upstream is now impossible — there is
  no local override). See [chamber-19/desktop-toolkit#33](https://github.com/chamber-19/desktop-toolkit/pull/33).

## [6.2.6] — 2026-04-24

### Fixed

- Bumped `@chamber-19/desktop-toolkit` pin to v2.2.7, which fixes the broken
  in-app update flow. Users on v6.2.4 or v6.2.5 who attempted to auto-update
  received a brief installer flash and then no update occurred. Root causes
  were upstream in desktop-toolkit (chamber-19/desktop-toolkit#31): NSIS
  silent-install flag was incorrect (`/PASSIVE` instead of `/S`), and
  `hooks.nsh` was killing the updater shim mid-install. This release is the
  first transmittal-builder release that incorporates the fix; the in-app
  update will work correctly from v6.2.6 forward.

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
