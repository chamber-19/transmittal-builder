# Testing Patterns

## Core Sections (Required)

### 1) Test Stack and Commands

| Tool | Scope | Evidence |
| --- | --- | --- |
| pytest | Python backend unit/integration tests | `environment.yml`, `backend/.pytest_cache/` |
| CI smoke test | Import verification only (not pytest) | `.github/workflows/backend-ci.yml` |

```bash
# Run backend tests
conda activate transmittal-builder
cd backend
python -m pytest
```

No frontend test framework is configured (no Vitest, Jest, Playwright, or Cypress).

### 2) What Is Tested

**Backend CI (`.github/workflows/backend-ci.yml`):**
- Runs on Python 3.11 and 3.13.
- Verifies all production package imports succeed.
- Checks `pandas >= 3.0.2`.
- Does **not** run pytest or test any business logic.

**pytest (`backend/.pytest_cache/` exists):**
- Test files not found in the current repo tree (no `tests/` or `test_*.py` files visible).
- The pytest cache exists from prior runs, but no test source is committed. [TODO — confirm if test files were deleted or never existed]

**No tests for:**
- Transmittal rendering logic (`core/render.py`)
- Excel parsing (`core/excel_parser.py`)
- Database operations (`database.py`)
- Auth enforcement (`auth.py`)
- Any React component behaviour

### 3) Test Gaps (Production Risk)

| Gap | Risk |
| --- | --- |
| No pytest tests in repo | Core rendering and parsing logic is untested |
| No frontend tests | UI behaviour and API contract unverified |
| CI only tests imports | Regressions in business logic pass CI silently |
| No integration test for render flow | Template+PDF pipeline failures only caught in production |

### 4) Evidence

- `.github/workflows/backend-ci.yml`
- `backend/.pytest_cache/` (directory exists — pytest has been run locally)
- `environment.yml` (pytest listed as dep)
- `docs/codebase/.codebase-scan.txt` (no `tests/` directory in tree)
