# Architecture

## Core Sections (Required)

### 1) Architectural Style

**Two-process web application:**

```
Browser (React SPA)  ←HTTP→  FastAPI backend  ←COM→  Microsoft Word (PDF)
       ↓                           ↓
   sessionStorage             SQLite DB
   (auth token)               (projects, transmittals, contacts)
```

- **Frontend**: React 19 SPA served by Vite dev server (dev) or static build (prod). Communicates with backend exclusively via HTTP fetch in `frontend/src/api.js`.
- **Backend**: Stateless FastAPI service. All state stored in SQLite (`backend/data/transmittal_builder.db`) and flat JSON (`backend/data/user_profiles.json`). Renders transmittals as temp files and returns them or writes them to disk.
- **Desktop packaging**: Backend can be packaged as a Windows `.exe` sidecar via PyInstaller. The desktop UI shell lives in `chamber-19/launcher` (separate repo).
- **PDF generation**: `docx2pdf` uses Microsoft Word COM automation — hard Windows dependency. The backend must run on a Windows machine with Word installed for PDF output.

### 2) Layer Map

| Layer | Files | Responsibility |
| --- | --- | --- |
| HTTP routes | `backend/app.py` | Request parsing, auth enforcement, orchestration, temp-dir lifecycle |
| Auth | `backend/auth.py` | Google ID-token verification, allow-list enforcement, access logging |
| Core logic | `backend/core/render.py` | `.docx` template substitution, table filling |
| Core logic | `backend/core/excel_parser.py` | `.xlsx` index extraction using pandas/openpyxl |
| Persistence | `backend/database.py` | SQLite schema, init, CRUD (projects, transmittals, contact groups) |
| External tools | `chamber19_desktop_toolkit` | `docx_to_pdf()`, `merge_source_pdfs()`, `send_email()` |
| Frontend state | `frontend/src/App.jsx` | View state machine (login → projects → form) |
| Frontend API | `frontend/src/api.js` | All `fetch` calls; auth header injection |
| UI components | `frontend/src/components/` | Stateful React components |

### 3) Data Flow — Transmittal Render

```
1. User fills TransmittalForm → clicks Submit
2. Frontend calls POST /api/render-to-folder (multipart: JSON fields + PDF files)
3. Backend: validates auth → saves uploads to temp dir
4. backend/core/render.py fills transmittal_template.docx with fields/checks/contacts/documents
5. docx2pdf (Word COM) converts .docx → .pdf in temp dir
6. pypdf merges transmittal cover PDF + source drawing PDFs
7. Output files copied to XMTL-NNN/ folder on disk
8. database.log_transmittal() records the event
9. JSON response { success, xmtl_folder, files_written, next_xmtl_num }
10. Frontend shows success state + offers ZIP download
11. Temp dir cleaned up in `finally` block
```

### 4) Auth Flow

```
1. Browser shows Google Sign-In button (GoogleOAuthProvider with VITE_GOOGLE_CLIENT_ID)
2. User signs in → Google returns credential (JWT)
3. Frontend stores JWT in sessionStorage, calls GET /api/auth/me
4. Backend: google.oauth2.id_token.verify_oauth2_token() validates JWT
5. Backend: checks email against ALLOWED_EMAILS allow-list
6. Backend returns { email, name, picture, display_name, is_developer }
7. Frontend renders authenticated UI
```

### 5) Evidence

- `backend/app.py` (route implementation)
- `backend/auth.py` (token verification)
- `backend/database.py` (schema)
- `frontend/src/App.jsx` (view state machine)
- `frontend/src/api.js` (client-side data flow)
- `README.md` (render flow section)
