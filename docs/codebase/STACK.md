# Technology Stack

## Core Sections (Required)

### 1) Runtime Summary

| Area | Value | Evidence |
| --- | --- | --- |
| Primary language (backend) | Python 3.13 (min 3.11) | `environment.yml`, `backend/requirements.txt` |
| Primary language (frontend) | JavaScript / JSX (React 19) | `frontend/package.json` |
| Backend runtime | FastAPI + Uvicorn | `backend/requirements.txt` |
| Frontend build | Vite 6.3.x | `frontend/package.json`, `frontend/vite.config.js` |
| Package manager (backend) | pip via Conda (`environment.yml`) | `environment.yml` |
| Package manager (frontend) | npm | `frontend/package.json`, `frontend/package-lock.json` |
| Desktop packaging | PyInstaller 6.20+ (Windows .exe) | `backend/transmittal_backend.spec`, `backend/requirements-build.txt` |

### 2) Production Frameworks and Dependencies

**Backend (`backend/requirements.txt`):**

| Dependency | Version constraint | Role | Evidence |
| --- | --- | --- | --- |
| fastapi | >=0.136.1 | HTTP API framework | `backend/requirements.txt` |
| uvicorn[standard] | >=0.46.0 | ASGI server | `backend/requirements.txt` |
| python-dotenv | >=1.0.0 | `.env` loading | `backend/requirements.txt` |
| python-multipart | >=0.0.27 | Multipart form/file upload parsing | `backend/requirements.txt` |
| python-docx | >=1.2.0 | `.docx` template filling | `backend/requirements.txt` |
| pandas | >=3.0.2 (requires Python ≥3.11) | Excel index parsing | `backend/requirements.txt` |
| openpyxl | >=3.1.5 | Excel engine for pandas | `backend/requirements.txt` |
| pypdf | >=6.10.2,<7 | PDF merging | `backend/requirements.txt` |
| docx2pdf | >=0.1.8 | Word COM `.docx`→`.pdf` (Windows-only) | `backend/requirements.txt` |
| google-auth | >=2.27.0 | Google ID-token verification | `backend/requirements.txt` |
| chamber19-desktop-toolkit | git+…@v2.3.2 | PDF merge util, email sender | `backend/requirements.txt` |

**Frontend (`frontend/package.json`):**

| Dependency | Version | Role | Evidence |
| --- | --- | --- | --- |
| react | ^19.0.0 | UI framework | `frontend/package.json` |
| react-dom | ^19.0.0 | React DOM renderer | `frontend/package.json` |
| @react-oauth/google | ^0.12.1 | Google OAuth sign-in button | `frontend/package.json` |

### 3) Development Toolchain

| Tool | Purpose | Evidence |
| --- | --- | --- |
| Vite + @vitejs/plugin-react | Dev server + HMR + production bundle | `frontend/package.json`, `frontend/vite.config.js` |
| PyInstaller | Packages backend as Windows `.exe` sidecar | `backend/requirements-build.txt`, `backend/transmittal_backend.spec` |
| pytest | Python unit/integration tests | `environment.yml`, `backend/.pytest_cache/` exists |
| Conda | Environment management | `environment.yml`, `docs/CONDA.md` |

No JavaScript linter or formatter config found (no ESLint, Prettier, Biome). No Python linter config found (no `pyproject.toml`, `.flake8`, `ruff.toml`).

### 4) Key Commands

```bash
# Backend setup (Conda)
conda env create -f environment.yml
conda activate transmittal-builder

# Backend dev server
cd backend
python -m uvicorn app:app --reload --port 8000

# Backend tests
cd backend
python -m pytest

# Frontend dev server
cd frontend
npm install
npm run dev

# Frontend production build
cd frontend
npm run build

# PyInstaller binary (CI only, Windows)
cd backend
pyinstaller transmittal_backend.spec --distpath ../dist
```

### 5) Environment and Config

**Backend (`backend/.env`, gitignored):**

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Yes (unless DISABLE_AUTH=1) | — | Google OAuth app client ID |
| `ALLOWED_EMAILS` | No | all verified Google users | Comma-separated allow-list |
| `DISABLE_AUTH` | No | `0` | Set to `1` for local dev bypass |
| `ALLOWED_ORIGINS` | No | `http://localhost:5173` | CORS allow list, comma-separated |
| `APP_VERSION` | No | `"dev"` | Set by CI from git tag |
| `SMTP_SENDER` | No (required for email route) | — | Default SMTP sender address |
| `SMTP_PASSWORD` | No (required for email route) | — | SMTP password / app key |
| `DEVELOPER_EMAIL` | No | `hyphaeos@gmail.com` | Grants developer-only API access |
| `USER_PROFILE_PATH` | No | `backend/data/user_profiles.json` | Override profile storage path |
| `PROJECT_REGISTRY_PATH` | No | `backend/data/project_registry.json` | Legacy registry for migration |
| `ACCESS_LOG_PATH` | No | `backend/access.log` | CSV access log path |

**Frontend (`frontend/.env`, gitignored):**

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `VITE_API_URL` | No | `http://localhost:8000` | Backend base URL |
| `VITE_GOOGLE_CLIENT_ID` | Yes for login | — | Must match backend's `GOOGLE_CLIENT_ID` |

- Deployment constraint: `docx2pdf` requires Microsoft Word (COM automation) on the Windows server running the backend. Without it, only `output_format=docx` works.
- `chamber19-desktop-toolkit` is installed via git URL (not a published PyPI package).

### 6) Evidence

- `backend/requirements.txt`
- `backend/requirements-build.txt`
- `frontend/package.json`
- `environment.yml`
- `frontend/vite.config.js`
- `backend/app.py` (env var reads)
- `backend/auth.py` (env var reads)
- `.github/workflows/release.yml`
- `.github/workflows/backend-ci.yml`
