# Framework Extraction — Consumption Guide

How **Transmittal Builder** will depend on `kc-framework` after the files
described in [INVENTORY.md](./INVENTORY.md) are extracted.

---

## 1. Python dependency

Add to `backend/requirements.txt`:

```text
kc-framework @ git+https://github.com/Koraji95-coder/kc-framework@v1.0.0#subdirectory=python
```

This installs the `kc_framework` package from the `python/` subdirectory of
the `kc-framework` repo, pinned to the `v1.0.0` tag.

To update to a later release, change the tag:

```text
kc-framework @ git+https://github.com/Koraji95-coder/kc-framework@v1.2.0#subdirectory=python
```

---

## 2. JavaScript dependency

### Recommended approach: GitHub Packages npm registry

**Option A — GitHub Packages (recommended).**
Publish `js/packages/kc-framework` to
`https://npm.pkg.github.com/@Koraji95-coder` via a CI step in the framework
repo.  Consumers add:

```json
// frontend/package.json
{
  "dependencies": {
    "@koraji95-coder/kc-framework": "^1.0.0"
  }
}
```

and an `.npmrc` file:

```text
@koraji95-coder:registry=https://npm.pkg.github.com
```

**Why:** GitHub Packages gives proper semver resolution, lock-file integrity,
and `npm update` support — none of which work reliably with raw git URLs.  The
`github:owner/repo#tag&path:...` syntax is fragile across npm versions and
does not survive `npm ci` correctly in all environments.

**Option B — `git+https` with subdirectory (fallback).**
If publishing to GitHub Packages is not yet set up, npm 7+ supports:

```json
"@koraji95-coder/kc-framework": "git+https://github.com/Koraji95-coder/kc-framework.git#semver:^1.0.0&path:js/packages/kc-framework"
```

This works but has caveats: lock-file entries are commit-SHA-based (not
semver), `npm audit` cannot resolve vulnerabilities, and some CI environments
require extra auth configuration.  **Migrate to GitHub Packages as soon as
possible.**

---

## 3. Before / after import table

Every module catalogued in INVENTORY.md appears in this table.

| Before (current path in this repo) | After (post-extraction import) |
|---|---|
| `from backend.core.pdf_merge import docx_to_pdf` | `from kc_framework.utils.pdf_merge import docx_to_pdf` |
| `from backend.core.pdf_merge import merge_pdfs` | `from kc_framework.utils.pdf_merge import merge_pdfs` |
| `from backend.core.pdf_merge import merge_source_pdfs` | `from kc_framework.utils.pdf_merge import merge_source_pdfs` |
| `from backend.core.pdf_merge import build_combined_pdf` | `from kc_framework.utils.pdf_merge import build_combined_pdf` |
| `from emails.sender import send_email` | `from kc_framework.utils.email_sender import send_email` |
| `import { initBackendUrl } from "./api/backend"` | `import { initBackendUrl } from "@koraji95-coder/kc-framework/ipc"` |
| `import { refreshBackendUrl } from "./api/backend"` | `import { refreshBackendUrl } from "@koraji95-coder/kc-framework/ipc"` |
| `import { getBackendUrl } from "./api/backend"` | `import { getBackendUrl } from "@koraji95-coder/kc-framework/ipc"` |
| `import { APP_VERSION } from "./version"` | `import { APP_VERSION } from "@koraji95-coder/kc-framework/utils/version"` |
| `import Splash from "./splash"` (splash.html entry point) | `import Splash from "@koraji95-coder/kc-framework/splash"` |
| `import "./splash.css"` | Bundled with `kc-framework/splash` — no separate import needed. |
| `import Updater from "./updater"` (updater.html entry point) | `import Updater from "@koraji95-coder/kc-framework/updater"` |
| `import "./updater.css"` | Bundled with `kc-framework/updater` — no separate import needed. |
| `use crate::sidecar` in `lib.rs` | Crate stays local (copied from `tauri-template`); parameterise binary name via a const. |
| `use crate::splash` in `lib.rs` | Same as above — copied from `tauri-template`; `com.r3p.transmittal` → tool identifier const. |
| `use crate::updater` in `lib.rs` | Same as above — copied from `tauri-template`; `TRANSMITTAL_UPDATE_PATH` → `<TOOL>_UPDATE_PATH`. |
| `frontend/src/assets/splash/sprocket-hammer.svg` | Shipped inside `@koraji95-coder/kc-framework`; import as `@koraji95-coder/kc-framework/splash/assets/sprocket-hammer.svg?raw`. |
| `frontend/src/assets/splash/r3p-logo-transparent.svg` | Shipped inside `@koraji95-coder/kc-framework`; import as `@koraji95-coder/kc-framework/splash/assets/r3p-logo-transparent.svg`. |
| `frontend/src/assets/splash/r3p-logo.svg` | Shipped inside `@koraji95-coder/kc-framework`. |
| `frontend/src/assets/splash/rust-logo.svg` | Shipped inside `@koraji95-coder/kc-framework`. |
| `frontend/src/assets/splash/tauri-logo.svg` | Shipped inside `@koraji95-coder/kc-framework`. |
| `frontend/splash.html` | Copied from `kc-framework/tauri-template/splash.html` at bootstrap; not imported at build time. |
| `frontend/updater.html` | Copied from `kc-framework/tauri-template/updater.html` at bootstrap. |
| `frontend/vite.config.js` | Copied from `kc-framework/tauri-template/vite.config.js` at bootstrap; customise per-tool inputs. |
| `frontend/scripts/generate-icons.mjs` | Copied from `kc-framework/build-scripts/generate-icons.mjs` at bootstrap. |
| `frontend/src-tauri/build.rs` | Copied from `kc-framework/tauri-template/src-tauri-base/build.rs`. |
| `frontend/src-tauri/Cargo.toml` | Copied from `kc-framework/tauri-template/src-tauri-base/Cargo.toml`; update `[package]` fields. |
| `frontend/src-tauri/tauri.conf.json` | Copied from `kc-framework/tauri-template/src-tauri-base/tauri.conf.json`; update `productName`/`identifier`. |
| `frontend/src-tauri/capabilities/default.json` | Copied from `kc-framework/tauri-template/src-tauri-base/capabilities/default.json`. |
| `frontend/src-tauri/src/main.rs` | Copied from `kc-framework/tauri-template/src-tauri-base/src/main.rs`. |
| `frontend/src-tauri/src/lib.rs` | Copied from `kc-framework/tauri-template/src-tauri-base/src/lib.rs`; replace `transmittal-backend` binary name. |
| `frontend/src-tauri/src/sidecar.rs` | Copied from `kc-framework/tauri-template/src-tauri-base/src/sidecar.rs`; replace `TRANSMITTAL_BACKEND_PORT`. |
| `frontend/src-tauri/src/splash.rs` | Copied from `kc-framework/tauri-template/src-tauri-base/src/splash.rs`; replace `com.r3p.transmittal`. |
| `frontend/src-tauri/src/updater.rs` | Copied from `kc-framework/tauri-template/src-tauri-base/src/updater.rs`; replace default update path and env var name. |
| `frontend/src-tauri/installer/hooks.nsh` | Copied from `kc-framework/installer/nsis/hooks.nsh`. |
| `frontend/src-tauri/installer/nsis-header.bmp` | Copied from `kc-framework/installer/nsis/nsis-header.bmp` (or replaced with tool art). |
| `frontend/src-tauri/installer/nsis-sidebar.bmp` | Copied from `kc-framework/installer/nsis/nsis-sidebar.bmp` (or replaced with tool art). |
| `frontend/src-tauri/icons/icon-master.svg` | Copied from `kc-framework/tauri-template/icons/icon-master.svg` (replace with tool icon). |
| `backend/transmittal_backend.spec` | Derived from `kc-framework/python/kc_framework/pyinstaller/sidecar.spec.template`; customise output name. |
| `backend/requirements-build.txt` | Copied from `kc-framework/python/kc_framework/pyinstaller/requirements-build.txt`. |
| `scripts/generate-latest-json.mjs` | Copied from `kc-framework/build-scripts/generate-latest-json.mjs`. |
| `scripts/publish-to-drive.ps1` | Copied from `kc-framework/build-scripts/publish-to-drive.ps1`; update drive subfolder path. |
| `.github/workflows/release.yml` | Derived from `kc-framework/.github/workflows/release-tauri-sidecar-app.yml`; update sidecar spec path. |
| `RELEASING.md` | Aligned with `kc-framework/docs/releasing.md`; tool-specific paths updated. |

---

## 4. Notes on Rust / Tauri modules

The Rust source files (`sidecar.rs`, `splash.rs`, `updater.rs`, `lib.rs`)
cannot be imported as an external crate in the normal Cargo sense — they form
the tool's own `src-tauri/src/` tree.  The workflow is therefore:

1. **Bootstrap:** copy the `tauri-template/src-tauri-base/src/` tree into the
   new tool's `frontend/src-tauri/src/`.
2. **Parameterise:** replace the three tool-specific constants:
   - `transmittal-backend` → your tool's sidecar binary name (in `sidecar.rs`
     and `lib.rs`).
   - `TRANSMITTAL_BACKEND_PORT` → `<YOUR_TOOL>_BACKEND_PORT` (in
     `sidecar.rs`).
   - `com.r3p.transmittal` → your tool's Tauri identifier (in `splash.rs`).
   - `G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder` → your tool's
     shared-drive path (in `updater.rs`); also rename the env var override.
3. **Track upstream:** periodically diff your local copy against
   `kc-framework/tauri-template/src-tauri-base/src/` to pick up framework
   improvements.
