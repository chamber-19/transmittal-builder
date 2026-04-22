# Framework Extraction — Proposed `kc-framework` Layout

This document describes the proposed top-level directory structure for the
future `kc-framework` repository and explains the rationale for each split.

---

## Proposed structure

```text
kc-framework/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── CHANGELOG.md
│
├── python/
│   └── kc_framework/
│       ├── __init__.py
│       ├── utils/
│       │   ├── __init__.py
│       │   ├── pdf_merge.py           ← from backend/core/pdf_merge.py
│       │   └── email_sender.py        ← from backend/emails/sender.py
│       └── pyinstaller/
│           ├── sidecar.spec.template  ← from backend/transmittal_backend.spec
│           └── requirements-build.txt ← from backend/requirements-build.txt
│
├── js/
│   └── packages/
│       └── kc-framework/
│           ├── package.json
│           ├── index.ts               ← barrel re-export for all public APIs
│           └── src/
│               ├── ipc/
│               │   └── backend.js     ← from frontend/src/api/backend.js
│               ├── splash/
│               │   ├── index.jsx      ← from frontend/src/splash.jsx
│               │   ├── splash.css     ← from frontend/src/splash.css
│               │   └── assets/
│               │       ├── sprocket-hammer.svg
│               │       ├── r3p-logo-transparent.svg
│               │       ├── r3p-logo.svg
│               │       ├── rust-logo.svg
│               │       └── tauri-logo.svg
│               ├── updater/
│               │   ├── index.jsx      ← from frontend/src/updater.jsx
│               │   └── updater.css    ← from frontend/src/updater.css
│               └── utils/
│                   └── version.js     ← from frontend/src/version.js
│
├── tauri-template/
│   ├── splash.html                    ← from frontend/splash.html
│   ├── updater.html                   ← from frontend/updater.html
│   ├── vite.config.js                 ← from frontend/vite.config.js
│   ├── icons/
│   │   └── icon-master.svg            ← from frontend/src-tauri/icons/icon-master.svg
│   └── src-tauri-base/
│       ├── build.rs                   ← from frontend/src-tauri/build.rs
│       ├── Cargo.toml                 ← from frontend/src-tauri/Cargo.toml
│       ├── tauri.conf.json            ← from frontend/src-tauri/tauri.conf.json
│       ├── capabilities/
│       │   └── default.json           ← from frontend/src-tauri/capabilities/default.json
│       └── src/
│           ├── main.rs                ← from frontend/src-tauri/src/main.rs
│           ├── lib.rs                 ← from frontend/src-tauri/src/lib.rs
│           ├── sidecar.rs             ← from frontend/src-tauri/src/sidecar.rs
│           ├── splash.rs              ← from frontend/src-tauri/src/splash.rs
│           └── updater.rs             ← from frontend/src-tauri/src/updater.rs
│
├── installer/
│   └── nsis/
│       ├── hooks.nsh                  ← from frontend/src-tauri/installer/hooks.nsh
│       ├── nsis-header.svg            ← from frontend/src-tauri/installer/nsis-header.svg
│       ├── nsis-header.bmp            ← from frontend/src-tauri/installer/nsis-header.bmp
│       ├── nsis-sidebar.svg           ← from frontend/src-tauri/installer/nsis-sidebar.svg
│       └── nsis-sidebar.bmp           ← from frontend/src-tauri/installer/nsis-sidebar.bmp
│
├── build-scripts/
│   ├── generate-icons.mjs             ← from frontend/scripts/generate-icons.mjs
│   ├── generate-latest-json.mjs       ← from scripts/generate-latest-json.mjs
│   └── publish-to-drive.ps1           ← from scripts/publish-to-drive.ps1
│
└── .github/
    └── workflows/
        └── release-tauri-sidecar-app.yml  ← from .github/workflows/release.yml (template)
```

---

## Rationale

### Python under `python/kc_framework/`

Python packages require a `pyproject.toml` (or `setup.py`) at a well-known
root.  Keeping Python code under `python/` means:

- Consumers install with:

  ```text
  kc-framework @ git+https://github.com/Koraji95-coder/kc-framework@v1.0.0#subdirectory=python
  ```

  or via PyPI once the package is published there.
- The Python tree is completely isolated from JS — a pure-Python tool that
  never uses Tauri does not need to traverse the `js/` tree at all.
- `kc_framework/pyinstaller/` holds the PyInstaller spec template and build
  requirements separately from the runtime library (`kc_framework/utils/`) so
  consumers can install runtime deps without dragging in PyInstaller.

### JS under `js/packages/kc-framework/`

`js/packages/` is a standard monorepo layout (compatible with npm workspaces
and pnpm).  Keeping JS under a nested `packages/` directory means:

- Future additions (e.g. a second JS package `kc-forms`) fit naturally without
  restructuring.
- Consumers install with:

  ```text
  "kc-framework": "git+https://github.com/Koraji95-coder/kc-framework.git#semver:^1.0.0&path:js/packages/kc-framework"
  ```

  (see [CONSUMPTION.md](./CONSUMPTION.md) for the recommended approach).
- The `index.ts` barrel file lets consumers import from `"kc-framework"` with
  no path suffix for the most common utilities, while deep imports like
  `"kc-framework/splash"` still work.

### Tauri scaffolding under `tauri-template/` (copied, not imported)

Tauri's `src-tauri/` directory must live as a sibling to `package.json` and
be referenced by absolute path in several Cargo and Tauri config files.  It
cannot be installed as an npm or Cargo dependency in the normal sense.

The `tauri-template/` subtree is therefore **copied** into a new tool's repo
at bootstrap time (like a cookiecutter template), not imported at build time.
This is intentional and the `MIGRATION_PLAN.md` documents the copy step
explicitly.

Keeping it in `kc-framework` still provides:

- A single source of truth for the baseline config.
- A diff target when the framework evolves — tool repos can diff their local
  copy against `kc-framework/tauri-template/` to see what they've diverged on.

### Installer assets under `installer/nsis/`

NSIS installer assets (BMP art, NSH hooks) are referenced by path in
`tauri.conf.json`.  They are also copied at bootstrap rather than imported.
Keeping them in a dedicated `installer/nsis/` directory means signing config,
WiX templates, or other future installer formats can coexist under
`installer/wix/`, `installer/signing/` etc.

### Build scripts under `build-scripts/`

Scripts like `generate-icons.mjs`, `generate-latest-json.mjs`, and
`publish-to-drive.ps1` are run from CI and from local developer machines.
They do not need to be inside a package directory — `build-scripts/` is a
flat, easy-to-find location that keeps them separate from framework source
code.

### CI under `.github/workflows/`

The `release-tauri-sidecar-app.yml` workflow is stored as a **reusable
workflow template**.  Individual tool repos can call it via
`workflow_call` or copy it as a starting point.  Keeping it in the framework
repo means all tools benefit from CI improvements automatically when they
update their copy.
