# R3P Transmittal Builder v3.0

Standalone application for generating engineering transmittal packages.
Drop your files, generate a combined PDF, and send it.

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
    ├── src-tauri/             Tauri desktop shell (Phase 1)
    │   ├── tauri.conf.json    Window / bundle configuration
    │   ├── Cargo.toml         Rust workspace manifest
    │   ├── build.rs           Tauri build script
    │   ├── src/
    │   │   ├── main.rs        Binary entry point
    │   │   └── lib.rs         Tauri app logic
    │   ├── capabilities/      Tauri permission grants
    │   └── icons/             App icon assets
    ├── package.json
    └── vite.config.js
```

**Data flow (Phase 1)**

```
┌─────────────────────────────┐     HTTP/REST      ┌───────────────────┐
│  Tauri WebView               │ ─────────────────► │  Python FastAPI   │
│  React UI (port 1420 dev)   │ ◄───────────────── │  (port 8000)      │
└─────────────────────────────┘                     └───────────────────┘
        Tauri shell (Rust)
        wraps the WebView
```

The React frontend communicates with the Python backend over `http://127.0.0.1:8000`.
No IPC between Rust and Python is needed in Phase 1.

---

## API Endpoints

| Method | Path               | Description                                    |
|--------|--------------------|------------------------------------------------|
| GET    | /api/health        | Health check                                   |
| POST   | /api/parse-index   | Upload Excel → parsed document rows            |
| POST   | /api/render        | Render transmittal → DOCX / combined PDF / ZIP |
| POST   | /api/email         | Send transmittal via SMTP                      |

---

## Quick Start — Web (browser)

```bash
# Terminal 1 — Python backend
cd backend
pip install -r requirements.txt
uvicorn app:app --reload --port 8000

# Terminal 2 — Vite dev server
cd frontend
npm install
npm run dev          # http://localhost:1420
```

API docs at <http://localhost:8000/docs>

---

## Quick Start — Tauri Desktop

**Prerequisites (Windows)**

1. [Rust](https://www.rust-lang.org/tools/install) — `rustup` installs the toolchain
2. Microsoft C++ Build Tools (or Visual Studio with "Desktop development with C++")
3. Node.js ≥ 18 and npm

**Prerequisites (Linux)**

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  patchelf libssl-dev libayatana-appindicator3-dev
```

**Run the desktop app**

```bash
# Terminal 1 — Python backend (must be running first)
cd backend
uvicorn app:app --port 8000

# Terminal 2 — Tauri dev window
cd frontend
npm install
npm run desktop      # = tauri dev
```

`tauri dev` starts the Vite server on port 1420 automatically (via `beforeDevCommand`),
then opens the native desktop window wrapping that server.

**Build a distributable installer**

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
| VITE_API_URL    | Backend URL (default: `http://localhost:8000`) |

---

## Migration Phases

This project is being incrementally migrated from a web-only app to a
Windows-first Tauri desktop application.

| Phase | Status | Description |
|-------|--------|-------------|
| **1** | ✅ **Done** | Tauri shell around existing frontend; Python backend runs separately; backend health-check banner in UI |
| 2 | 🔜 Planned | Tauri orchestrates Python backend startup — spawn/monitor `uvicorn` from `lib.rs` |
| 3 | 🔜 Planned | Bundle Python backend as a Tauri [sidecar](https://tauri.app/develop/sidecar/) — fully self-contained installer |
| 4 | 🔜 Planned | Remote version manifest on Google Drive; forced-update flow with `tauri-plugin-updater` |

---

ROOT3POWER ENGINEERING

