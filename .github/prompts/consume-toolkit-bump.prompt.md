---
agent: agent
description: Bump the pinned desktop-toolkit version in this consumer repo across all five pin locations in lockstep.
---

# desktop-toolkit consumer bump

You are bumping the pinned `desktop-toolkit` version in this consumer repository. Ask the user for the target version (e.g. `v2.2.7`) if not provided.

## The five pin locations

A desktop-toolkit bump must update **all five** of these in the same PR:

1. `frontend/package.json` — `@chamber-19/desktop-toolkit` (npm)
2. `frontend/src-tauri/Cargo.toml` — `[dependencies] desktop-toolkit ... tag = "..."` (Cargo)
3. `frontend/src-tauri/Cargo.toml` — `[package.metadata.desktop-toolkit] library-tag` (metadata)
4. `frontend/src-tauri/Cargo.toml` — `[package.metadata.desktop-toolkit] shim-tag` (metadata)
5. `backend/requirements.txt` — the `chamber19-desktop-toolkit @ git+...@vX.Y.Z` pin (Python)

All five must reference the same desktop-toolkit version. Mismatched pins are the most common source of breakage and will be caught by `.github/workflows/toolkit-pin-check.yml` on PR open.

## Procedure

1. Update all five pin locations to the target version.
2. Regenerate lockfiles:
   - `npm install` from `frontend/`
   - `cargo check` from `frontend/src-tauri/`
3. Reinstall the Python pin so a stale wheel doesn't mask the change:
   - From `backend/`: `pip install -r requirements.txt --force-reinstall --no-deps chamber19-desktop-toolkit`
4. Re-read `desktop-toolkit/docs/CONSUMING.md` for the target version. Confirm this consumer still satisfies the contract (updater shim, NSIS hooks, Python API surface).
5. Run the build/test gates:
   - `npm run build` from `frontend/`
   - `cargo check` from `frontend/src-tauri/`
   - `python -m pytest` from `backend/`
6. Open a PR titled `chore(deps): bump desktop-toolkit to vX.Y.Z`.

## Success criteria

- All five pin locations show the same target version.
- `toolkit-pin-check.yml` passes on the PR.
- All three build/test gates pass locally before opening the PR.
- The PR description lists each pin location and its new value.

## Non-goals

- No refactors of consumer code beyond what the pin bump requires.
- No changes to product behavior.
- No changes to unrelated dependencies.
- No combining the pin bump with feature work in the same PR.

## Verification

Report:

- The five pin locations updated, with old and new values.
- The output of `toolkit-pin-check.yml` if you can run it locally via `pwsh ./scripts/check-toolkit-pins.ps1`.
- The output of all three build/test gates.
- Any `CONSUMING.md` contract items that needed adjustment, including Python API changes.