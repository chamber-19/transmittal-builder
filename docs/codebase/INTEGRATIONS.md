# External Integrations

## Core Sections (Required)

### 1) Integration Inventory

| Integration | Type | Direction | Auth method | Evidence |
| --- | --- | --- | --- | --- |
| Google OAuth 2.0 | Identity provider | Inbound (user login) | Google ID token (JWT) in `Authorization: Bearer` header | `backend/auth.py`, `frontend/src/main.jsx` |
| Microsoft Word (COM) | Local process | Backend → Word | None (OS-level COM on Windows) | `backend/requirements.txt` (`docx2pdf`), `README.md` |
| SMTP (Gmail or other) | Email transport | Backend → external | Username + password/app key from env | `backend/app.py` (`/api/email`), `chamber19_desktop_toolkit` |
| GitHub (release dispatch) | CI notification | CI → GitHub API | `LAUNCHER_DISPATCH_TOKEN` secret (PAT with `repo` scope) | `.github/workflows/release.yml` |
| `chamber-19/launcher` | Sibling repo | Post-release event dispatch | `LAUNCHER_DISPATCH_TOKEN` | `.github/workflows/release.yml` |
| `chamber-19/desktop-toolkit` | Python library (git dep) | Backend import | None (git+https install) | `backend/requirements.txt` |
| SQLite | Local database | Backend read/write | None (file on disk) | `backend/database.py` |

### 2) Google OAuth Details

- Client ID set via `GOOGLE_CLIENT_ID` env var on backend and `VITE_GOOGLE_CLIENT_ID` on frontend.
- Backend verifies tokens with `google.oauth2.id_token.verify_oauth2_token()` (online verification against Google's public keys).
- Allow-list enforcement via `ALLOWED_EMAILS` env var (comma-separated) or `backend/allowed_emails.json` file.
- `DISABLE_AUTH=1` bypasses all auth for local development.

### 3) Microsoft Word Dependency

- `docx2pdf` converts rendered `.docx` files to PDF via Word COM automation.
- **Hard requirement**: Microsoft Word must be installed on the machine running the backend.
- Without Word, `/api/render` and `/api/render-to-folder` fail for PDF/ZIP output.
- `output_format=docx` (not currently exposed as a route param) would work without Word.
- This makes the backend **Windows-only in production** for full functionality.

### 4) chamber19-desktop-toolkit

- Installed via `git+https://github.com/chamber-19/desktop-toolkit@v2.3.2#subdirectory=python`.
- Provides: `docx_to_pdf()`, `merge_source_pdfs()`, `send_email()`.
- **Not on PyPI** — requires git access to `chamber-19/desktop-toolkit` at install time.
- Pinned to tag `v2.3.2`. Bumps require manual `requirements.txt` update.

### 5) Evidence

- `backend/auth.py`
- `backend/requirements.txt`
- `backend/app.py` (email route)
- `.github/workflows/release.yml`
- `frontend/src/main.jsx`
- `README.md` (PDF Conversion section)
