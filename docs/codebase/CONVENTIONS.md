# Coding Conventions

## Core Sections (Required)

### 1) Naming Rules

**Python (backend):**
- Module-level constants: `UPPER_SNAKE_CASE` (`_COPY_INTENT_ABBREV`, `_JOB_NUM_RE`)
- Private helpers: `_snake_case` prefix (`_parse_project_name`, `_make_work_dir`)
- FastAPI route functions: `api_<noun>_<verb>` (`api_scan_projects`, `api_render_to_folder`)
- Pydantic models: `PascalCase` + `Request` suffix (`ScanFolderRequest`, `EmailRequest`)
- Database functions: plain `snake_case` verbs (`touch_project`, `log_transmittal`)

**JavaScript/React (frontend):**
- Components: `PascalCase` files and functions (`TransmittalForm.jsx`, `ProjectPicker.jsx`)
- Hooks: `use` prefix where applicable
- API functions: camelCase descriptive verbs (`scanProjects`, `renderToFolder`)
- CSS class names: BEM-like with component prefix (`pp-row`, `pp-row__main`, `pl-overlay`)
- Constants: `UPPER_SNAKE_CASE` (`DEFAULT_PROJECTS_ROOT`, `DEFAULT_CHECKS`)

### 2) Formatting

- Python: No formatter config present (no Black, Ruff, or flake8 config). Style is PEP 8-like with 4-space indentation and section separators (`# ─── Section ───`).
- JavaScript: No ESLint or Prettier config. Consistent 2-space indentation, single quotes, arrow functions.
- No enforced format checking in CI.

### 3) Error Handling

**Backend:**
- All routes use `raise HTTPException(status, detail)` for client errors.
- `try/except HTTPException: raise` pattern re-raises intentional errors in catch-all blocks.
- `shutil.rmtree(work_dir, ignore_errors=True)` in `finally` prevents temp-dir leaks.
- Database errors in non-critical paths (e.g., `log_transmittal`) are swallowed with `except Exception: pass`.
- Auth errors always return 401/403, never 500.

**Frontend:**
- `apiFetch()` in `api.js` throws an `Error` with `.status` property on non-2xx responses.
- Components catch errors with `try/catch` blocks and display inline error strings.
- `sessionStorage.removeItem('auth_token')` on any 401 forces re-login.

### 4) Import Conventions

**Python:**
- Standard lib imports first, then third-party, then local (`from core.render import …`).
- `from __future__ import annotations` at top of all backend modules.
- `load_dotenv()` called at top of `app.py` before any env reads.
- `chamber19_desktop_toolkit` imported inside functions (`api_email`, `api_render`) to avoid import-time failures if optional tools are missing.

**JavaScript:**
- React hooks first, then component imports, then local API imports.
- CSS imported in `main.jsx` only.
- No aliased imports; all relative paths.

### 5) Evidence

- `backend/app.py` (naming, error handling patterns)
- `backend/auth.py` (error handling)
- `backend/database.py` (function naming)
- `frontend/src/api.js` (error handling)
- `frontend/src/components/*.jsx` (naming, CSS class patterns)
