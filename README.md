# Transmittal Builder — Backend Service

A Python FastAPI service for generating engineering transmittal packages.

**Core functions:**

- **Project folder scanning** — Detect job numbers, existing transmittals, and source PDFs from folder structure
- **Excel index parsing** — Extract document rows from `.xlsx` drawing index files
- **Document rendering** — Fill `.docx` templates with project data and render to PDF
- **PDF merging** — Combine transmittal cover with source drawings into single PDF
- **Email transmission** — Send completed transmittals via SMTP

**UI & Desktop Shell:**

The desktop UI is in `chamber-19/launcher` (shared Tauri shell for all Chamber 19 tools).
Users install/run the launcher, which calls this backend service via HTTP.

---

## Installation (End Users)

Users should install via **`chamber-19/launcher`**, not this repo directly.

For installation/update/PIN instructions, see the launcher's user documentation.

---

## For Developers: Environment Setup

### Conda-first Python setup (recommended)

```powershell
conda env create -f environment.yml
conda activate transmittal-builder
```

### Backend (Python FastAPI)

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run tests
python -m pytest

# Start server (dev mode)
python -m uvicorn app:app --reload --port 8000

# Verify health check
curl http://127.0.0.1:8000/api/health
```

---

## Documentation

- Conda environment policy and setup: [`docs/CONDA.md`](docs/CONDA.md)
- Release/operator procedures: [`docs/OPERATOR_RUNBOOK.md`](docs/OPERATOR_RUNBOOK.md)
- Publishing and updater flow: [`RELEASING.md`](RELEASING.md), [`docs/AUTO_UPDATER.md`](docs/AUTO_UPDATER.md)
- Copilot/agent guidance: [`.github/copilot-instructions.md`](.github/copilot-instructions.md)

---

## Architecture

**This repo is a stateless HTTP backend service.**

```text
Transmittal-Builder/
├── backend/                   Python FastAPI service
│   ├── app.py                 HTTP API routes
│   ├── core/
│   │   ├── render.py          .docx template → PDF rendering
│   │   └── excel_parser.py    .xlsx drawing index parsing
│   ├── requirements.txt
│   └── __pycache__/
├── environment.yml            Conda environment spec
├── docs/
├── CHANGELOG.md
└── README.md
```

**No frontend code in this repo.** Desktop shell lives in `chamber-19/launcher`.

---

## API Reference

| Method | Endpoint             | Description                                          |
|--------|----------------------|------------------------------------------------------|
| GET    | /api/health          | Health check (returns version)                       |
| GET    | /api/scan-projects   | Scan root directory → project folders                |
| POST   | /api/scan-folder     | Deep-scan folder → PDFs, contacts, indexes           |
| POST   | /api/parse-index     | Upload Excel index → parsed document rows            |
| POST   | /api/render          | Render transmittal → ZIP (docx + pdf + drawings)    |
| POST   | /api/render-to-folder| Render transmittal directly to project folder        |
| POST   | /api/email           | Send transmittal via SMTP                            |

---

## Output Filenames

Standard naming conventions:

- **Transmittal letter:** `{JobNum}-XMTL-{NNN} - DOCUMENT INDEX.docx` / `.pdf`
- **Combined PDF:** `{JobNum} - {PROJECT DESC} - {IFP}_{YYYYMMDD}.pdf`  
  (IFP/IFC/IFA/IFB/etc. based on copy-intent checkbox)
- **ZIP package:** `{JobNum}-XMTL-{NNN}-Package.zip`

---

## Development: Running in Isolation

To test this backend independently (without the launcher):

```bash
# Terminal 1 — Start backend
cd backend
python -m uvicorn app:app --reload --port 8000

# Terminal 2 — Call the API
curl -X POST http://127.0.0.1:8000/api/parse-index \
  -F file=@drawing_index.xlsx

# Or use a REST client like Postman/Insomnia
# POST http://127.0.0.1:8000/api/render
# with body: { "template": "...", "index": [...], ... }
```

---

## Deployment

This service can be deployed as:

1. **Local sidecar** (launched by `launcher` on user's machine)
2. **Docker container** (via Dockerfile, not in this repo yet)
3. **Managed service** (AWS Lambda, Azure Functions, etc.)
4. **Traditional server** (systemd, supervisor, etc.)

The launcher connects via HTTP; it doesn't care where the backend runs.
npm run dev          # http://localhost:1420
```

API docs at <http://localhost:8000/docs>

---

## Quick Start — Tauri Desktop

### Prerequisites (all platforms)

1. Python 3.10+ with `pip` (or a Conda/virtualenv environment)
2. Backend dependencies installed:

   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. [Rust](https://www.rust-lang.org/tools/install) — `rustup` installs the toolchain
4. Node.js ≥ 20 and npm

### Additional prerequisites (Windows)

- Microsoft C++ Build Tools (or Visual Studio with "Desktop development with C++")

### Additional prerequisites (Linux)

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

### Build a distributable installer

```bash
# Generate high-quality icons from a source PNG first:
cd frontend
npx tauri icon path/to/icon-1024.png

# Then build:
npm run desktop:build   # = tauri build
```

The installer is placed in `frontend/src-tauri/target/release/bundle/`.

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

See [CHANGELOG.md](./CHANGELOG.md) for the full version history.

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

---

## Local Setup

This project talks to GitHub in two different ways during local development:

1. `backend/requirements.txt` and `frontend/src-tauri/Cargo.toml` fetch
   `chamber-19/desktop-toolkit` directly from `https://github.com/...`.
   Because `chamber-19/desktop-toolkit` is a **public** repository, no
   authentication is needed — `pip install` and `cargo` fetches work without
   `gh auth login` or any token.
2. `frontend/package.json` consumes `@chamber-19/desktop-toolkit` from GitHub
   Packages, which requires a `NODE_AUTH_TOKEN` env var for `npm install`.
   GitHub Packages npm always requires auth even for public packages (known
   platform limitation). The `frontend/.npmrc` is committed to the repo and
   points npm at `https://npm.pkg.github.com` for the `@chamber-19` scope,
   picking up the token automatically — you do **not** need to create your
   own `.npmrc`.
3. Create a GitHub classic PAT at https://github.com/settings/tokens/new
   with **only** the `read:packages` scope.
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
   only for re-running `npm install`.

---

© 2026 Transmittal Builder
