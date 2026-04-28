---
mode: agent
description: Bump the pinned desktop-toolkit version in this consumer repo across JS and Rust manifests in lockstep.
---

# desktop-toolkit consumer bump

You are bumping the pinned `desktop-toolkit` version in this consumer repository. Ask the user for the target version (e.g. `v2.2.7`) if not provided.

## Procedure

1. Update the JS pin:
   - `frontend/package.json` — bump the `@chamber-19/desktop-toolkit` (or equivalent) dependency.
2. Update the Rust pin:
   - `frontend/src-tauri/Cargo.toml` — bump the `desktop-toolkit` crate dependency to the matching tag/version.
3. **Both pins must reference the same desktop-toolkit version.** This is the most common source of breakage. Verify before continuing.
4. Regenerate lockfiles:
   - `npm install` from `frontend/`
   - `cargo check` from `frontend/src-tauri/`
5. Re-read `desktop-toolkit/docs/CONSUMING.md` for the target version. Confirm this consumer still satisfies the contract (updater shim, NSIS hooks, etc.).
6. Run `npm test && cargo check` from the repo root (or the equivalent for this repo). Both must pass.
7. Open a PR titled `chore(deps): bump desktop-toolkit to vX.Y.Z`.

## Non-goals

- No refactors of consumer code beyond what the pin bump requires.
- No changes to product behavior.
- No changes to unrelated dependencies.

## Verification

Report:

- The two pin locations updated and their new values (must match).
- The output of `npm test && cargo check`.
- Any CONSUMING.md contract items that needed adjustment.
