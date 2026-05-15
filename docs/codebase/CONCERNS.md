# Codebase Concerns

## Core Sections (Required)

### 1) Top Risks (Prioritized)

| Severity | Concern | Evidence | Impact | Suggested action |
| --- | --- | --- | --- | --- |
| **P0** | `backend/access.log` tracked in git | `git ls-files backend/access.log` returns a match; file contains real email + IP addresses | PII committed to repo history; GDPR/privacy risk | Add to `.gitignore`, `git rm --cached`, purge from history |
| **P0** | `backend/data/transmittal_builder.db` tracked in git | `git ls-files` confirms it; DB contains project paths, contacts, transmittal history | Sensitive operational data in repo history | Add to `.gitignore`, `git rm --cached`, purge from history |
| **P0** | `backend/data/user_profiles.json` tracked in git | File contains `{"koraji95coder@gmail.com": {"display_name": "Dustin Ward", ...}}` | PII (real name + email) in repo | Add to `.gitignore`, `git rm --cached`, purge from history |
| **P1** | README says "No frontend code in this repo" | `frontend/` directory exists with full React app | Misleads contributors and operators | Update README to describe current two-process architecture |
| **P1** | README API reference is incomplete | README lists 7 endpoints; `app.py` has 14 routes | Operators cannot discover `/api/browse`, `/api/projects/*`, `/api/contacts/*`, `/api/drawings/*` | Update API table in README |
| **P1** | Hardcoded `DEVELOPER_EMAIL` default in `app.py` | `os.getenv("DEVELOPER_EMAIL", "hyphaeos@gmail.com")` — line 163 | Real email address committed; dev-only admin gate uses it | Move default to `.env.example`; remove hardcoded email |
| **P1** | Hardcoded company path in `ProjectPicker.jsx` | `DEFAULT_PROJECTS_ROOT = 'G:\\Shared drives\\Root 3 Power\\02-ACTIVE PROJECTS'` | Different deployment will need code edit, not config | Move to env var or make configurable via UI |
| **P1** | No pytest tests in repo | No `tests/` dir in git tree despite `.pytest_cache/` existing | Core rendering, parsing, auth logic have zero test coverage | Add at minimum smoke tests for `render.py` and `excel_parser.py` |
| **P1** | No frontend CI build step | `.github/workflows/backend-ci.yml` only validates Python; no `npm ci && npm run build` in CI | Broken frontend could be released without warning | Add frontend build check to CI |
| **P2** | `docs/codebase/` files were empty templates until this audit | Added in commit `f25c397` but not filled in | Misleads future agents/developers | Now populated — keep updated |
| **P2** | CHANGELOG version ordering is confusing | Versions go 6.3.3 → 4.0.2 → 4.0.1 → 6.3.2 (not monotonically increasing) | Auto-tag takes first entry (6.3.3); 4.x entries are noise | Clarify 4.x entries as internal refactor tracking or renumber |
| **P2** | `_temp_dirs` list in `app.py` grows without bound | `_temp_dirs: list[str] = []` accumulates per-render (line 139) | Long-running server leaks memory (list entries, not the dirs themselves since `finally` cleans dirs) | Cleanup list entries after `shutil.rmtree` in `finally` |
| **P2** | `backend/data/project_registry.json` tracked in git | `git ls-files` confirms it; contains project paths | May contain internal project/client paths | Add to `.gitignore`, remove from tracking |
| **P2** | `chamber19-desktop-toolkit` installed from git URL | `git+https://github.com/chamber-19/desktop-toolkit@v2.3.2` — not a PyPI package | Install requires internet access to GitHub; no immutability guarantee beyond tag | Publish to internal PyPI or keep tag-pinned and document |
| **P2** | `docx2pdf` requires Microsoft Word COM on Windows server | Documented in README but not enforced/checked at startup | Backend silently fails PDF generation on non-Windows or Word-free machines | Add startup health check that warns if Word is unavailable |

### 2) Technical Debt

| Debt item | Why it exists | Where | Risk if ignored | Suggested fix |
| --- | --- | --- | --- | --- |
| `TransmittalForm.jsx` is 44.9 KB (monolithic) | Evolved incrementally from a simpler form | `frontend/src/components/TransmittalForm.jsx` | High churn makes bugs and regressions likely | Split into sub-components when next significant change is needed |
| No linter or formatter | Never configured | Repo root, `frontend/`, `backend/` | Style drift; missed bugs | Add Ruff (Python) + Biome/ESLint (JS) |
| `app.py` at 1196 lines handles all routes | Routes were added incrementally | `backend/app.py` | Large file is harder to navigate; high change rate (19 commits in 90 days) | Split into route modules (projects.py, auth.py router, etc.) when convenient |
| Legacy `project_registry.json` still in repo | Migration ran once at startup; file not deleted | `backend/data/project_registry.json` | Confusion about which is the source of truth | Remove after confirming DB migration ran |

### 3) Security Concerns

| Risk | OWASP category | Evidence | Current mitigation | Gap |
| --- | --- | --- | --- | --- |
| PII in git history (email, name, IP) | A02 Cryptographic Failures / data exposure | `access.log`, `user_profiles.json` tracked | `.env` correctly gitignored | Committed data files must be purged from history |
| Hardcoded real email as env var default | A05 Security Misconfiguration | `app.py` line 163 | Can be overridden via env | Remove hardcoded default |
| `DISABLE_AUTH=1` in local dev | A07 Identification and Authentication Failures | `backend/auth.py` | Only documented for local dev; production `.env` sets `DISABLE_AUTH=0` | Ensure production `.env` explicitly sets `DISABLE_AUTH=0` |
| Auth token in `sessionStorage` | A02 | `frontend/src/App.jsx` | Clears on tab close | `sessionStorage` is accessible to same-origin JS; `httpOnly` cookie would be stronger |
| `os.scandir` on user-supplied `path` and `root` params | A01 Broken Access Control | `/api/browse`, `/api/scan-projects` | Auth required; only directory listing, not file reads | No path traversal above given root; acceptable for internal tool |
| Contacts written to arbitrary `output_dir` | A01 Broken Access Control | `api_render_to_folder` `_write_merged_contacts` | Auth required; path normalized | Authenticated users can write `contacts.json` anywhere their supplied path points |

### 4) Performance and Scaling Concerns

| Concern | Evidence | Current symptom | Scaling risk | Suggested improvement |
| --- | --- | --- | --- | --- |
| Single SQLite file; no WAL-level connection pooling | `database.py` opens/closes per call; `PRAGMA journal_mode=WAL` set | Fine for single-user; degrades under concurrent use | Multi-user concurrent writes would serialize | Acceptable for current internal-tool use case |
| Large PDF uploads go through multipart to temp disk | `_save_upload()` reads entire file into memory | Fine for normal drawings (1–50 MB) | Very large uploads could exhaust RAM | Acceptable for current use case |

### 5) Fragile/High-Churn Areas

| Area | Why fragile | Churn signal | Safe change strategy |
| --- | --- | --- | --- |
| `frontend/src/App.jsx` | Central state machine; touches auth, views, user profile | 48 commits in 90 days (highest in repo) | Change via PR with manual smoke test of login flow |
| `frontend/src/components/TransmittalForm.jsx` | 44.9 KB monolithic; all form logic in one component | Implied by `frontend/package.json` churn (46 commits) | Narrow, focused changes; test full submit flow after each |
| `backend/app.py` | All routes + filesystem helpers in one file | 19 commits in 90 days | Treat each route change as independent; add regression test before refactoring |
| `.github/workflows/release.yml` | Release pipeline; broken = no deployments | 21 commits in 90 days | Test with a dry-run tag before merging changes |

### 6) `[ASK USER]` Questions

1. **[ASK USER]** Were there ever pytest test files for the backend? `.pytest_cache/` exists but no `tests/` directory is present. Should tests be restored or written new?
2. **[ASK USER]** The CHANGELOG has 4.x version entries (4.0.1, 4.0.2) interleaved with 6.x entries. Are the 4.x entries intentional internal tracking versions, or should they be renumbered under 6.x?
3. **[ASK USER]** Is `backend/data/project_registry.json` safe to remove from git tracking? Has the DB migration from it been confirmed on production?
4. **[ASK USER]** The `DEFAULT_PROJECTS_ROOT` in `ProjectPicker.jsx` points to `G:\Shared drives\Root 3 Power\...`. Is this path expected to be the same across all deployments, or should it be configurable?
5. **[ASK USER]** Is the frontend (`frontend/`) intended to be deployed as a standalone web app, or only served locally alongside the backend? (The README says "no frontend" but the code exists.)
6. **[ASK USER]** Should `docx2pdf` / Microsoft Word be validated at backend startup with a clear error message rather than failing silently at render time?

### 7) Evidence

- `git ls-files backend/access.log backend/data/transmittal_builder.db backend/data/user_profiles.json`
- `backend/data/user_profiles.json` (real PII content confirmed)
- `backend/access.log` (real email + IP content confirmed)
- `backend/app.py` line 163 (`_DEVELOPER_EMAIL` default)
- `frontend/src/components/ProjectPicker.jsx` line 4 (`DEFAULT_PROJECTS_ROOT`)
- `docs/codebase/.codebase-scan.txt` (HIGH-CHURN FILES section)
- `.github/workflows/backend-ci.yml` (no pytest, no frontend build)
- `CHANGELOG.md` (version ordering)
