# Framework Extraction — File Inventory

Every entry below describes a file or module that should move from
**Transmittal Builder** into `kc-framework` because it would be reused
unchanged (or with trivial parameterisation) by any future R3P desktop tool.

Files **not listed here** are tool-specific and stay in this repo permanently.

---

## How to read this table

- **Current path** — repo-relative path today.
- **Target path** — where it lands inside `kc-framework/` after migration.
- **Category** — one of `ui` | `theme` | `installer` | `updater` | `auth` | `logging` | `ipc` | `build` | `python-utils` | `js-utils` | `assets` | `ci`.
- **Justification** — one-line answer to "would _any_ future tool reuse this?".
- **Tool-specific imports to invert** — any reference to a transmittal-specific
  symbol, path, or env var that must become a parameter once the file lives in
  the framework (dependency direction must always be tool → framework, never
  framework → tool).

---

## IPC helpers

| Current path | Target path in `kc-framework` | Category | Justification | Tool-specific imports to invert |
|---|---|---|---|---|
| `frontend/src/api/backend.js` | `js/packages/kc-framework/src/ipc/backend.js` | `ipc` | Resolves the Python sidecar's dynamic port via the Tauri `get_backend_url` command; identical pattern for any tool with a Python sidecar. | None — no transmittal symbols; uses only `@tauri-apps/api/core`. |
| `frontend/src-tauri/src/sidecar.rs` | `tauri-template/src-tauri-base/src/sidecar.rs` | `ipc` | Spawns the PyInstaller sidecar, negotiates the port via stdout, returns a `(Child, u16)` tuple; generic for any Python-backed Tauri app. | `TRANSMITTAL_BACKEND_PORT` env var name and `transmittal-backend` binary path must be supplied by the consuming tool (e.g. via a build constant or config). |
| `frontend/src-tauri/src/lib.rs` | `tauri-template/src-tauri-base/src/lib.rs` | `ipc` | Tauri app setup: `BackendState`, `get_backend_url` / `peek_subfolders` commands, startup sequence, window lifecycle. | `transmittal-backend` binary name referenced in startup logic; replace with a per-tool constant. |
| `frontend/src-tauri/src/main.rs` | `tauri-template/src-tauri-base/src/main.rs` | `ipc` | Tauri binary entry point — pure boilerplate (`#![cfg_attr(…)]` + `app_lib::run()`). | None. |

---

## Splash / UI

| Current path | Target path in `kc-framework` | Category | Justification | Tool-specific imports to invert |
|---|---|---|---|---|
| `frontend/src/splash.jsx` | `js/packages/kc-framework/src/splash/index.jsx` | `ui` | Branded animated forge splash screen with progress/status terminal; any R3P desktop tool should show this on launch. | Imports `./version.js` (must be re-exported from the framework package or provided by the tool via a prop). |
| `frontend/src/splash.css` | `js/packages/kc-framework/src/splash/splash.css` | `ui` | CSS driving the forge animation — no tool-specific rules. | None. |
| `frontend/splash.html` | `tauri-template/splash.html` | `ui` | Vite multi-page HTML entry for the splash window; pure scaffolding. | None. |
| `frontend/src-tauri/src/splash.rs` | `tauri-template/src-tauri-base/src/splash.rs` | `ui` | Tauri integration for splash: `emit_status`, `close_splash`, `SplashState`, `splash_ready`, `splash_fade_complete`, first-run sentinel logic. | `com.r3p.transmittal` app-data directory identifier; replace with `tauri::AppHandle`'s built-in data dir or a per-tool constant. |

---

## Updater

| Current path | Target path in `kc-framework` | Category | Justification | Tool-specific imports to invert |
|---|---|---|---|---|
| `frontend/src/updater.jsx` | `js/packages/kc-framework/src/updater/index.jsx` | `updater` | Force-update progress window; listens for `update_info` / `update_progress` Tauri events; zero transmittal logic. | None — only `@tauri-apps/api/event`. |
| `frontend/src/updater.css` | `js/packages/kc-framework/src/updater/updater.css` | `updater` | CSS for the updater window — no tool-specific rules. | None. |
| `frontend/updater.html` | `tauri-template/updater.html` | `updater` | Vite multi-page HTML entry for the updater window; pure scaffolding. | None. |
| `frontend/src-tauri/src/updater.rs` | `tauri-template/src-tauri-base/src/updater.rs` | `updater` | Shared-drive update check (`check_for_update`), installer copy with progress events (`copy_installer_with_progress`), structured logging. | `G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder` default path and `TRANSMITTAL_UPDATE_PATH` env var → parameterise as `DEFAULT_UPDATE_PATH` constant and `<TOOL>_UPDATE_PATH` env var. Log dir name `R3P Transmittal Builder` → per-tool config. |

---

## Version utility

| Current path | Target path in `kc-framework` | Category | Justification | Tool-specific imports to invert |
|---|---|---|---|---|
| `frontend/src/version.js` | `js/packages/kc-framework/src/utils/version.js` | `js-utils` | Vite `__APP_VERSION__` injection with runtime fallback; identical boilerplate needed by every Vite/Tauri tool. | None. |

---

## Build tooling & templates

| Current path | Target path in `kc-framework` | Category | Justification | Tool-specific imports to invert |
|---|---|---|---|---|
| `frontend/vite.config.js` | `tauri-template/vite.config.js` | `build` | Vite config with Tauri-specific overrides (fixed port 1420, `TAURI_ENV_*` prefix, multi-page rollup inputs, `__APP_VERSION__` define); every Tauri tool needs this skeleton. | Main entry hardcoded as `index.html`; multi-page inputs (splash, updater) are correct and stay. |
| `frontend/scripts/generate-icons.mjs` | `build-scripts/generate-icons.mjs` | `build` | Generates all PNG/ICO/BMP icon variants from an SVG master via `sharp` + `png-to-ico`; any Tauri tool with the same icon pipeline uses this verbatim. | None. |
| `frontend/src-tauri/build.rs` | `tauri-template/src-tauri-base/build.rs` | `build` | Tauri build script (`tauri_build::build()`); boilerplate for every Tauri app. | None. |
| `frontend/src-tauri/Cargo.toml` | `tauri-template/src-tauri-base/Cargo.toml` | `build` | Cargo manifest skeleton: `tauri`, `serde`, `semver`, `tauri-plugin-dialog`; same dependency set for every tool. | `[package] name`, `description`, `version`; `identifier` in `tauri.conf.json`. |
| `frontend/src-tauri/tauri.conf.json` | `tauri-template/src-tauri-base/tauri.conf.json` | `build` | Tauri config template: window layout (main, updater, splash), NSIS bundle settings, capabilities link. | `productName`, `identifier`, window sizes/titles. |
| `frontend/src-tauri/capabilities/default.json` | `tauri-template/src-tauri-base/capabilities/default.json` | `build` | Minimal capability set (`core:default`, `opener:default`, `dialog:default`, `dialog:allow-open`); sufficient baseline for any tool. | None. |
| `backend/transmittal_backend.spec` | `python/kc_framework/pyinstaller/sidecar.spec.template` | `build` | PyInstaller spec template for bundling a Python FastAPI sidecar; any tool with a Python backend follows this spec pattern. | Output binary name `transmittal-backend` must be parameterised per tool. |
| `backend/requirements-build.txt` | `python/kc_framework/pyinstaller/requirements-build.txt` | `build` | PyInstaller + its hooks dependencies isolated from runtime deps; reusable across tools. | None. |
| `scripts/generate-latest-json.mjs` | `build-scripts/generate-latest-json.mjs` | `build` | Generates the `latest.json` update manifest from `TAG_NAME` + `INSTALLER_NAME` env vars; any tool on the shared-drive update model needs this. | `R3P Transmittal Builder` in fallback release notes string. |
| `scripts/publish-to-drive.ps1` | `build-scripts/publish-to-drive.ps1` | `build` | Copies the built installer to the Google Shared Drive app folder; generic script parameterised by env var. | Shared drive subfolder path references `Transmittal Builder`; make it a parameter. |

---

## Installer assets

| Current path | Target path in `kc-framework` | Category | Justification | Tool-specific imports to invert |
|---|---|---|---|---|
| `frontend/src-tauri/installer/hooks.nsh` | `installer/nsis/hooks.nsh` | `installer` | NSIS installer lifecycle hooks (pre/post-install silent close, desktop shortcut logic); generic for all NSIS-packaged Tauri tools. | None visible in current file. |
| `frontend/src-tauri/installer/nsis-header.svg` | `installer/nsis/nsis-header.svg` | `installer` | SVG master for the NSIS installer header banner (150 × 57 px); framework branding. | None — swap art per tool if desired. |
| `frontend/src-tauri/installer/nsis-header.bmp` | `installer/nsis/nsis-header.bmp` | `installer` | Compiled BMP used directly by NSIS; regenerated from the SVG master. | None. |
| `frontend/src-tauri/installer/nsis-sidebar.svg` | `installer/nsis/nsis-sidebar.svg` | `installer` | SVG master for the NSIS installer sidebar banner (164 × 314 px); framework branding. | None — swap art per tool if desired. |
| `frontend/src-tauri/installer/nsis-sidebar.bmp` | `installer/nsis/nsis-sidebar.bmp` | `installer` | Compiled BMP used directly by NSIS. | None. |

---

## Assets

| Current path | Target path in `kc-framework` | Category | Justification | Tool-specific imports to invert |
|---|---|---|---|---|
| `frontend/src/assets/splash/sprocket-hammer.svg` | `js/packages/kc-framework/src/splash/assets/sprocket-hammer.svg` | `assets` | Animated sprocket + hammer SVG powering the forge splash scene; shared brand asset. | None. |
| `frontend/src/assets/splash/r3p-logo-transparent.svg` | `js/packages/kc-framework/src/splash/assets/r3p-logo-transparent.svg` | `assets` | R3P corporate mark (transparent background) displayed in the splash header. | None. |
| `frontend/src/assets/splash/r3p-logo.svg` | `js/packages/kc-framework/src/splash/assets/r3p-logo.svg` | `assets` | R3P corporate mark (opaque background) — alternate. | None. |
| `frontend/src/assets/splash/rust-logo.svg` | `js/packages/kc-framework/src/splash/assets/rust-logo.svg` | `assets` | Rust logo shown in the splash credits bar. | None. |
| `frontend/src/assets/splash/tauri-logo.svg` | `js/packages/kc-framework/src/splash/assets/tauri-logo.svg` | `assets` | Tauri logo shown in the splash credits bar. | None. |
| `frontend/src-tauri/icons/icon-master.svg` | `tauri-template/icons/icon-master.svg` | `assets` | SVG master that `generate-icons.mjs` uses to produce all PNG/ICO/BMP sizes; every new tool starts from this. | Replace with tool-specific art, keeping the file path convention. |

---

## Python utilities

| Current path | Target path in `kc-framework` | Category | Justification | Tool-specific imports to invert |
|---|---|---|---|---|
| `backend/core/pdf_merge.py` | `python/kc_framework/utils/pdf_merge.py` | `python-utils` | Generic PDF merge helpers (`docx_to_pdf`, `merge_pdfs`, `merge_source_pdfs`, `build_combined_pdf`); usable by any document-processing tool. | None — no transmittal-specific symbols. |
| `backend/emails/sender.py` | `python/kc_framework/utils/email_sender.py` | `python-utils` | Generic SMTP email helper (`send_email`); standard library only + stdlib email modules. | None — no transmittal-specific symbols. |

---

## CI / Release

| Current path | Target path in `kc-framework` | Category | Justification | Tool-specific imports to invert |
|---|---|---|---|---|
| `.github/workflows/release.yml` | `.github/workflows/release-tauri-sidecar-app.yml` (template) | `ci` | Builds PyInstaller sidecar + Vite + Tauri NSIS installer + GitHub Release; every Python-backed Tauri tool follows this exact pipeline. | Step names and sidecar spec path hardcode `transmittal_backend`; parameterise via workflow inputs or matrix. |
| `RELEASING.md` | `docs/releasing.md` (copy) | `ci` | Documents the full release workflow (env setup, version bumps, tag, CI, shared-drive publish); relevant to every tool in the suite. | References Transmittal Builder-specific shared-drive path. |

---

## Files that stay in this repo (tool-specific)

The following files are **not** listed above and must remain here:

| File | Reason |
|---|---|
| `frontend/transmittal-builder.jsx` | Top-level transmittal form UI — product logic, not framework. |
| `frontend/src/App.jsx` | All transmittal data models, field state, readiness calculation, PDF routing. |
| `frontend/index.html` | Tool-specific Vite HTML entry for the main window. |
| `backend/app.py` | All FastAPI routes are transmittal-specific (`/api/render`, `/api/parse-index`, etc.). The PyInstaller `__main__` block is generic in pattern but tied to `TRANSMITTAL_BACKEND_PORT`. |
| `backend/core/render.py` | Docx template rendering with transmittal field schema. |
| `backend/core/excel_parser.py` | Drawing index Excel parsing logic. |
| `backend/core/__init__.py` | Empty init for the `core` package. |
| `backend/emails/__init__.py` | Empty init for the `emails` package. |
| `backend/requirements.txt` | Tool-specific runtime dependencies. |
| `frontend/src-tauri/icons/` (PNG/ICO) | Tool-specific icon art (only `icon-master.svg` is framework). |
| `repos/` | Stale local API-response cache — not code. |
| `docs/mcp.md` | MCP server configuration — not framework. |
