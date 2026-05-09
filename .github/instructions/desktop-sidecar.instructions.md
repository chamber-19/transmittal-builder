---
applyTo: "backend/**,frontend/**"
---

# Transmittal Builder Sidecar Instructions

- The Python backend is the authority for rendering, PDF merging, and project
  folder scanning; the frontend should call it through the existing API helper
  in `frontend/src/api/`.
- In desktop mode, Tauri starts or detects the backend sidecar. Do not add a
  second backend bootstrap path without updating docs and tests.
- Local Python setup is Conda-first via `environment.yml`. Keep docs and
  workflows aligned with that policy.
- Keep `backend/requirements*.txt` and release prerequisites in sync.
- Preserve GitHub Packages auth through `NODE_AUTH_TOKEN` for npm installs.
- Activation/PIN gating must be enabled for packaged/release builds only.
  Local dev and agent workflows must remain unblocked by default.