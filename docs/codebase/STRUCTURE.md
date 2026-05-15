# Project Structure

## Core Sections (Required)

### 1) Directory Layout

```
Transmittal-Builder/
├── backend/                         Python FastAPI service
│   ├── app.py                       All HTTP routes (entry point)
│   ├── auth.py                      Google ID-token verification + access log
│   ├── database.py                  SQLite persistence (projects, transmittals, contacts)
│   ├── core/
│   │   ├── render.py                .docx template filling + PDF rendering logic
│   │   └── excel_parser.py          .xlsx drawing index parsing
│   ├── templates/
│   │   └── transmittal_template.docx  Embedded transmittal letter template
│   ├── data/                        Runtime data (NOT committed to git — see CONCERNS)
│   │   ├── transmittal_builder.db   SQLite database (currently tracked — P0)
│   │   ├── user_profiles.json       User display names (currently tracked — P0)
│   │   └── project_registry.json    Legacy JSON (migrated to DB on startup)
│   ├── access.log                   CSV access log (currently tracked — P0)
│   ├── requirements.txt             Production Python deps
│   ├── requirements-build.txt       Build-only: PyInstaller
│   ├── transmittal_backend.spec     PyInstaller build spec
│   └── .env                        Local secrets (gitignored)
│
├── frontend/                        React web UI (Vite)
│   ├── index.html                   HTML entry point
│   ├── src/
│   │   ├── main.jsx                 React root, GoogleOAuthProvider wrapper
│   │   ├── App.jsx                  Top-level state machine (login→projects→form)
│   │   ├── api.js                   All fetch calls to backend
│   │   ├── styles.css               Global CSS design system
│   │   └── components/
│   │       ├── LoginPage.jsx        Google Sign-In page
│   │       ├── ProjectPicker.jsx    Project browser + recent projects list
│   │       ├── TransmittalForm.jsx  Main form (44.9 KB — largest component)
│   │       ├── CoverSheetPreview.jsx  Live transmittal letter preview
│   │       ├── HelpDrawer.jsx       Help/documentation sidebar
│   │       ├── ProfileSetupModal.jsx  First-login display name setup
│   │       └── SplashScreen.jsx     App startup splash
│   ├── package.json
│   ├── vite.config.js
│   ├── .env                        Local frontend secrets (gitignored)
│   └── .env.example                Documents required frontend env vars
│
├── docs/
│   ├── CONDA.md                    Conda environment policy and commands
│   ├── OPERATOR_RUNBOOK.md         Release/PIN lifecycle runbook
│   └── codebase/                   These documents
│
├── .github/
│   ├── workflows/
│   │   ├── auto-tag.yml            Reads CHANGELOG, tags on version bump
│   │   ├── release.yml             Builds PyInstaller .exe, publishes GitHub Release
│   │   └── backend-ci.yml         Smoke-tests Python imports on 3.11 + 3.13
│   ├── copilot-instructions.md     Agent/Copilot guidance
│   ├── prompts/                    Agent prompt templates
│   └── instructions/               Agent instruction files
│
├── environment.yml                 Conda environment spec (Python 3.13 + pip deps)
├── README.md                       Developer setup guide (partially stale — see CONCERNS)
├── CHANGELOG.md                    Version history (KaC format)
├── RELEASING.md                    Release process documentation
└── AGENTS.md                       Agent/Copilot guidance pointer
```

### 2) Entry Points

| Entry point | Purpose |
| --- | --- |
| `backend/app.py` | FastAPI `app` object; `uvicorn app:app` for dev, `python app.py` for PyInstaller sidecar |
| `frontend/src/main.jsx` | React root, mounts `<GoogleOAuthProvider>` + `<App>` |
| `frontend/index.html` | Vite HTML entry |

### 3) Key Files

| File | Why it matters |
| --- | --- |
| `backend/app.py` | All 14 HTTP routes; auth enforcement; temp-dir lifecycle |
| `backend/auth.py` | Google token verification; allow-list enforcement; access logging |
| `backend/database.py` | SQLite schema, migrations, project/transmittal/contact queries |
| `backend/core/render.py` | `.docx` template fill → PDF via Word COM |
| `backend/core/excel_parser.py` | `.xlsx` drawing index extraction |
| `frontend/src/api.js` | Single API client module used by all components |
| `frontend/src/components/TransmittalForm.jsx` | Largest component (44.9 KB); file drops, contacts, form submit |
| `.github/workflows/auto-tag.yml` | Version source of truth (reads CHANGELOG) |
| `.github/workflows/release.yml` | Full release pipeline (Windows PyInstaller build) |

### 4) Evidence

- `docs/codebase/.codebase-scan.txt` (directory tree)
- `backend/app.py` (route inventory)
- `frontend/package.json`
- `frontend/src/main.jsx`
- `git ls-files` output
