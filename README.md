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

For installation, update, and PIN instructions see the launcher's user documentation.

---

## For Developers: Environment Setup

### Conda-first Python setup

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

**VS Code interpreter:** Select the `transmittal-builder` conda env
(`Ctrl+Shift+P` → `Python: Select Interpreter`) to resolve FastAPI and other
imports without warnings.

---

## Architecture

**This repo is a stateless HTTP backend service.**

```text
Transmittal-Builder/
├── backend/
│   ├── app.py                   HTTP API routes
│   ├── core/
│   │   ├── render.py            .docx template → PDF rendering
│   │   └── excel_parser.py      .xlsx drawing index parsing
│   ├── requirements.txt
│   └── transmittal_backend.spec PyInstaller build spec
├── environment.yml              Conda environment spec
├── docs/
├── CHANGELOG.md
└── README.md
```

**No frontend code in this repo.** Desktop shell lives in `chamber-19/launcher`.

---

## API Reference

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | /api/health | Health check — returns version |
| GET | /api/scan-projects | Scan root directory → project folders |
| POST | /api/scan-folder | Deep-scan folder → PDFs, contacts, indexes |
| POST | /api/parse-index | Upload Excel index → parsed document rows |
| POST | /api/render | Render transmittal → ZIP (docx + pdf + drawings) |
| POST | /api/render-to-folder | Render transmittal directly to project folder |
| POST | /api/email | Send transmittal via SMTP |

API docs available at `http://localhost:8000/docs` when the server is running.

---

## Output Filenames

- **Transmittal letter:** `{JobNum}-XMTL-{NNN} - DOCUMENT INDEX.docx` / `.pdf`
- **Combined PDF:** `{JobNum} - {PROJECT DESC} - {IFP}_{YYYYMMDD}.pdf`
- **ZIP package:** `{JobNum}-XMTL-{NNN}-Package.zip`

---

## Running in Isolation

To test the backend independently (without the launcher):

```bash
# Terminal 1 — start backend
cd backend
python -m uvicorn app:app --reload --port 8000

# Terminal 2 — call the API
curl -X POST http://127.0.0.1:8000/api/parse-index -F file=@drawing_index.xlsx
```

---

## Render Flow

1. Caller sends template (`.docx`), fields, checks, contacts, documents, and source PDFs
2. Backend fills the template using `python-docx` (placeholder replacement, checkboxes, tables)
3. Converts the filled `.docx` → PDF via `docx2pdf` (Word COM on Windows)
4. Merges cover PDF + all source PDFs into one combined package via `pypdf`
5. Returns the combined PDF (or `.docx`, or both as ZIP)

---

## PDF Conversion

`docx2pdf` uses Microsoft Word via COM automation — Word must be installed on the
server running this service.

Without it, `/api/render` still works for `output_format=docx`.

---

## Environment Variables

| Variable | Description |
| --- | --- |
| APP_VERSION | Set by CI from git tag — returns `"dev"` locally |
| SMTP_SENDER | Default email sender address |
| SMTP_PASSWORD | Default SMTP password/app key |

---

## Documentation

- Conda environment policy: [`docs/CONDA.md`](docs/CONDA.md)
- Operator runbook: [`docs/OPERATOR_RUNBOOK.md`](docs/OPERATOR_RUNBOOK.md)
- Release process: [`RELEASING.md`](RELEASING.md)

---

## Version History

See [CHANGELOG.md](./CHANGELOG.md) for the full version history.

© 2026 Chamber 19
