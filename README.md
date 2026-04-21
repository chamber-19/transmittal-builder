# Transmittal Builder

A desktop-first application for generating engineering transmittal packages. Build professional transmittals by dropping files, auto-populating from project folders, and generating combined PDF packages — all from a single interface.

**Key capabilities:**

- **Project folder integration** — Scan a root directory for project folders, auto-detect job numbers, contacts, existing transmittals, and source PDFs
- **Smart file routing** — Drag & drop `.docx` templates, `.xlsx` drawing indexes, and `.pdf` source drawings; each is automatically routed to the right slot
- **Transmittal rendering** — Fill a Word template with project fields, checkboxes, contacts, and a document table, then convert to PDF
- **Combined PDF output** — Merge the transmittal cover letter with all source drawings into a single combined PDF
- **Folder or ZIP output** — Save directly to a project's transmittals folder (desktop mode) or download as a ZIP (web mode)
- **Address book** — Auto-load contacts from `contacts.json` in the project folder; import from saved lists

---

## Installation (non-developers)

> **Users:** The installer lives on the shared Google Drive at:
> ```
> G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder\
> ```
> Double-click the latest `.exe` file, follow the prompts, and the app installs
> to your local profile (no administrator rights needed).
>
> The app checks for updates every time it opens.  If a newer version is
> available it downloads and installs automatically — no action required.
>
> **Note:** You must be connected to the office network (VPN or on-site) with
> Google Drive for Desktop running.  The app will not open while offline.

---


## Architecture

```
Transmittal-Builder/
├── backend/                   Python FastAPI service
│   ├── app.py                 All API routes
│   ├── core/
│   │   ├── render.py          .docx template rendering
│   │   ├── excel_parser.py    Drawing index Excel parsing
│   │   └── pdf_merge.py       Combined PDF generation
│   ├── emails/
│   │   └── sender.py          SMTP email delivery
│   └── requirements.txt
│
└── frontend/                  React/Vite web + Tauri desktop shell
    ├── src/
    │   ├── App.jsx            Main React application
    │   └── main.jsx           React entry point
    ├── src-tauri/             Tauri desktop shell
    │   ├── tauri.conf.json    Window / bundle configuration
    │   ├── Cargo.toml         Rust workspace manifest
    │   ├── build.rs           Tauri build script
    │   ├── src/
    │   │   ├── main.rs        Binary entry point
    │   │   └── lib.rs         Tauri app logic + backend auto-start
    │   ├── capabilities/      Tauri permission grants
    │   └── icons/             App icon assets
    ├── package.json
    └── vite.config.js
```

**Data flow**

```
┌─────────────────────────────┐     HTTP/REST      ┌───────────────────┐
│  Tauri WebView               │ ─────────────────► │  Python FastAPI   │
│  React UI (port 1420 dev)   │ ◄───────────────── │  (port 8000)      │
└─────────────────────────────┘                     └───────────────────┘
        Tauri shell (Rust)            ▲
        wraps the WebView             │
                │                     │
                └── spawns backend ───┘
                    on startup (dev)
```

In dev mode, Tauri automatically spawns the Python backend when the desktop
app starts. The React frontend polls `/api/health` and shows the main UI
once the backend is reachable.

---

## API Endpoints

| Method | Path                 | Description                                                   |
|--------|----------------------|---------------------------------------------------------------|
| GET    | /api/health          | Health check (returns version)                                |
| GET    | /api/scan-projects   | Scan a root directory for project folders                     |
| POST   | /api/scan-folder     | Deep-scan a specific project folder for PDFs, contacts, index |
| POST   | /api/parse-index     | Upload Excel drawing index → parsed document rows             |
| POST   | /api/render          | Render transmittal → ZIP package (docx + pdf + drawings)      |
| POST   | /api/render-to-folder| Render transmittal directly to a project folder on disk       |
| POST   | /api/email           | Send transmittal via SMTP                                     |

---

## Output Filenames

The app produces files using the standard naming convention:

- **Transmittal letter:** `{JobNum}-XMTL-{NNN} - DOCUMENT INDEX.docx` / `.pdf`
- **Combined PDF:** `{JobNum} - {PROJECT DESC} - {IFP}_{YYYYMMDD}.pdf`
- **ZIP package:** `{JobNum}-XMTL-{NNN}-Package.zip`

The copy-intent abbreviation (IFP, IFC, IFA, etc.) is derived from the single selected checkbox.

---

## Quick Start — Web (browser)

```bash
# Terminal 1 — Python backend
cd backend
# Requires Git auth to https://github.com/chamber-19/desktop-toolkit
# (for example: `gh auth login` with repo access, or another Git credential helper)
pip install -r requirements.txt
uvicorn app:app --reload --port 8000

# Terminal 2 — Vite dev server
cd frontend
# Requires NODE_AUTH_TOKEN env var (a GitHub PAT with `read:packages`) for GitHub Packages auth.
# The .npmrc is committed to the repo and will pick up the token automatically.
export NODE_AUTH_TOKEN=ghp_yourTokenHere
npm install
npm run dev          # http://localhost:1420
```

API docs at <http://localhost:8000/docs>

---

## Quick Start — Tauri Desktop

**Prerequisites (all platforms)**

1. Python 3.10+ with `pip` (or a Conda/virtualenv environment)
2. Backend dependencies installed:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
3. [Rust](https://www.rust-lang.org/tools/install) — `rustup` installs the toolchain
4. Node.js ≥ 20 and npm

**Additional prerequisites (Windows)**

- Microsoft C++ Build Tools (or Visual Studio with "Desktop development with C++")

**Additional prerequisites (Linux)**

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  patchelf libssl-dev libayatana-appindicator3-dev
```

### Run the desktop app (single command)

```bash
cd frontend
npm install
npm run desktop      # = tauri dev
```

That's it! The Tauri shell will:

1. Start the Vite dev server on port 1420 (`beforeDevCommand`)
2. Compile and launch the native Rust binary
3. **Automatically spawn the Python backend** on `127.0.0.1:8000`
4. Open the desktop window with a "Starting local services…" spinner
5. Show the main UI once the backend health check passes

> **Note:** If the backend is already running (e.g. you started it manually),
> Tauri detects that port 8000 is occupied and skips spawning a second instance.

### Python environment requirements

> **The dev flow assumes a Miniconda-based Python installation.**
> Full production-safe backend packaging (sidecar binary) is planned for Phase 3.

Tauri searches for a Python interpreter in this order:

1. **`$CONDA_PREFIX`** — the active conda environment (set automatically by
   `conda activate`). This is the recommended approach.
2. **Well-known Miniconda / Anaconda install directories** under your home
   folder (`~/miniconda3`, `~/Miniconda3`, `~/anaconda3`, `~/Anaconda3`).
3. **`python` on `PATH`** — final fallback.

The first candidate that passes a `python --version` check is used.

- **Miniconda users (recommended):** Activate your conda environment in the
  terminal **before** running `npm run desktop`:
  ```bash
  conda activate base        # or your project environment
  cd frontend
  npm run desktop
  ```
- **System Python users:** Ensure `python` is on `PATH` and backend
  dependencies are installed:
  ```bash
  pip install -r backend/requirements.txt
  ```

### Troubleshooting backend auto-start

| Symptom | Fix |
|---------|-----|
| "Python not found" in terminal | Activate your Miniconda environment (`conda activate`) and retry, or install Python 3.10+ and ensure `python` is on PATH |
| "Could not find backend/app.py" | Run `npm run desktop` from the `frontend/` directory |
| "Backend process exited early" | Check terminal output for import errors; run `pip install -r backend/requirements.txt` inside your conda env |
| Backend starts but crashes | Check terminal output for import errors; run `pip install -r backend/requirements.txt` |
| "Backend Unavailable" in the UI | Check terminal for errors; the backend has ~20 s to become reachable |

### Manual backend (fallback)

If the automatic start doesn't work for your setup, you can still start the
backend manually in a separate terminal:

```bash
# Terminal 1 — Python backend
cd backend
uvicorn app:app --reload --port 8000

# Terminal 2 — Tauri dev window
cd frontend
npm run desktop
```

Tauri will detect the already-running backend and skip spawning.

**Build a distributable installer**

```bash
# Generate high-quality icons from a source PNG first:
cd frontend
npx tauri icon path/to/icon-1024.png

# Then build:
npm run desktop:build   # = tauri build
```

The installer is placed in `frontend/src-tauri/target/release/bundle/`.

> **Note:** `desktop:build` does **not** bundle the Python backend yet.
> See Phase 3 in the migration roadmap below.

---

## Render Flow

1. Frontend sends template (.docx), fields, checks, contacts, documents, and source PDFs
2. Backend fills the template using python-docx (placeholder replacement, checkboxes, tables)
3. Converts the filled .docx → PDF via LibreOffice or docx2pdf (Word COM on Windows)
4. Merges cover PDF + all source PDFs into one combined package via pypdf
5. Returns the combined PDF (or .docx, or both as ZIP)

---

## PDF Conversion

Combined PDF output requires converting the transmittal .docx cover sheet to PDF.

**Windows (recommended):** `pip install docx2pdf` — uses Microsoft Word via COM automation.

**Linux/Mac fallback:** `apt install libreoffice-writer` or `brew install --cask libreoffice`

Without either converter, `/api/render` still works for `output_format=docx`.

---

## Environment Variables

### Backend

| Variable       | Description                    |
|----------------|--------------------------------|
| SMTP_SENDER    | Default email sender address   |
| SMTP_PASSWORD  | Default SMTP password/app key  |

### Frontend (`.env` in `frontend/`)

| Variable        | Description                             |
|-----------------|-----------------------------------------|
| VITE_API_URL    | Backend URL (default: `http://127.0.0.1:8000`) |

---

## Version History

| Version | Description |
|---------|-------------|
| **4.0** | Project folder integration, folder output mode, collapsible PDF sources, granular readiness indicator, overwrite protection, copy-intent filename convention, single-intent enforcement, context-aware toasts, purple PDF chips, clear all documents, simplified contacts |
| **3.0** | Tauri desktop shell (Phase 1 & 2), backend auto-start, health check UI, drag & drop, drawing index Excel parsing |
| **2.0** | ZIP package output, combined PDF merge, frontend/backend split |
| **1.0** | Initial web-only transmittal builder |

---

## Migration Phases

This project is being incrementally migrated from a web-only app to a
Windows-first Tauri desktop application.

| Phase | Status | Description |
|-------|--------|-------------|
| **1** | ✅ Done | Tauri shell around existing frontend; Python backend runs separately; backend health-check banner in UI |
| **2** | ✅ Done | Tauri auto-starts the Python backend in dev mode — single `npm run desktop` command |
| 3 | 🔜 Planned | Bundle Python backend as a Tauri [sidecar](https://tauri.app/develop/sidecar/) — fully self-contained installer |
| 4 | 🔜 Planned | Remote version manifest on Google Drive; forced-update flow with `tauri-plugin-updater` |

### Phase 2 — known limitations

- **Dev-only:** The backend auto-start is designed for local development.
  Production/installer builds do not yet bundle the Python backend (see Phase 3).
- **Miniconda assumed:** The dev workflow assumes the developer has Miniconda
  (or Anaconda) installed. Activating a conda environment before launching
  `npm run desktop` is the recommended approach. A plain `python` on PATH
  works as a fallback, but future dependencies may require conda.
- **No auto-install:** Python and the backend's pip dependencies must be
  installed before running the desktop app.
- **Process cleanup:** The backend child process is killed when the Tauri
  window closes normally. If the Tauri process is force-killed (e.g.
  `taskkill /F`), the backend may remain running as an orphan; it will be
  detected and reused on next launch.
- **Single instance:** If port 8000 is already in use by another application,
  Tauri assumes the backend is running and skips spawning. This avoids
  duplicate launches but means a port conflict won't be reported by Tauri
  itself — the frontend health check will fail if the occupant isn't the
  correct backend.

---

## Asset Regeneration

The taskbar icons, Windows Store tiles, ICO file, and NSIS installer art are
**generated from vector SVG masters** — they must not be hand-edited in
their raster form.

### Icon sources

| File | Master source |
|------|--------------|
| `frontend/src-tauri/icons/*.png`, `icon.ico` | `frontend/src-tauri/icons/icon-master.svg` |
| `frontend/src-tauri/installer/nsis-header.bmp` | `frontend/src-tauri/installer/nsis-header.svg` |
| `frontend/src-tauri/installer/nsis-sidebar.bmp` | `frontend/src-tauri/installer/nsis-sidebar.svg` |

### Re-running the generator

```bash
cd frontend
npm install          # installs sharp and png-to-ico if not already present
npm run icons:generate
```

This writes all PNG/ICO/BMP outputs directly into the repository. Commit the
resulting binary files along with any SVG master changes.

**Requirements:** Node ≥ 20.19.0 (matches Vite's engine requirement).

---

## Architecture roadmap

Shared scaffolding (UI primitives, installer templates, logging, updater)
is consumed from [`@chamber-19/desktop-toolkit`](https://github.com/chamber-19/desktop-toolkit)
as a versioned dependency.
See [docs/framework-extraction/](./docs/framework-extraction/README.md) for the inventory and migration plan.

---

## Local Setup

This project talks to GitHub in two different ways during local development:

1. `backend/requirements.txt` and `frontend/src-tauri/Cargo.toml` fetch
   `chamber-19/desktop-toolkit` directly from `https://github.com/...`, so
   Git must already be able to authenticate to that private repo.
   `gh auth login` is the simplest option when using the GitHub CLI
   credential helper.
2. `frontend/package.json` consumes `@chamber-19/desktop-toolkit` from GitHub
   Packages, which requires a `NODE_AUTH_TOKEN` env var for `npm install`.
   The `frontend/.npmrc` is committed to the repo and points npm at
   `https://npm.pkg.github.com` for the `@chamber-19` scope, picking up the
   token automatically — you do **not** need to create your own `.npmrc`.
3. Create a GitHub classic PAT at https://github.com/settings/tokens/new
   with the `read:packages` scope.
4. Export the env var before running `npm install` in `frontend/`:

   **macOS/Linux:**
   ```bash
   export NODE_AUTH_TOKEN=ghp_yourTokenHere
   cd frontend && npm install
   ```

   **Windows PowerShell:**
   ```powershell
   $env:NODE_AUTH_TOKEN = "ghp_yourTokenHere"
   cd frontend; npm install
   ```

5. After install, the env var is no longer needed for development —
   only for re-running `npm install`. Git auth is still required for
   backend `pip install`, `cargo` fetches, and the updater shim helper.

---

© 2026 Transmittal Builder

