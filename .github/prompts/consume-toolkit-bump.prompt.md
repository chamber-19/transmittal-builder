---
description: Bump the pinned desktop-toolkit version in this consumer repo across JS and Rust manifests in lockstep.
---

# desktop-toolkit consumer bump

You are bumping the pinned `desktop-toolkit` version in this consumer
repository. Ask the user for the target version (e.g. `v2.2.7`) if not
provided.

## Procedure

### Step 0 — Orient before touching anything

Read the repo structure first. Do not assume paths.

- Find the JS manifest: look for `package.json` at root, `frontend/`, or
  `src/`. The dependency is `@chamber-19/desktop-toolkit`.
- Find the Rust manifest: look for `Cargo.toml` at root,
  `frontend/src-tauri/`, or `src-tauri/`. The dependency is
  `desktop-toolkit`.
- If neither file is found at the expected path, stop and report before
  proceeding.

### Step 1 — Update the JS pin

In the `package.json` you found in Step 0, bump
`@chamber-19/desktop-toolkit` to the target version.

### Step 2 — Update the Rust pin

In the `Cargo.toml` you found in Step 0, bump the `desktop-toolkit` crate
dependency to the matching version.

### Step 3 — Verify both pins agree

Both pins must reference the same `desktop-toolkit` version. This is the
report the discrepancy.
most common source of breakage. Read both files after editing and confirm
the versions match before continuing. If they do not match, stop and

### Step 4 — Regenerate lockfiles

Run from the directory containing each manifest:

```bash
# JS lockfile
npm install

# Rust lockfile
cargo check --locked
```

Both must succeed without errors. If either fails, stop and report the
output before continuing.

### Step 5 — Check the consuming contract

Read `desktop-toolkit/CONSUMING.md` (or `docs/CONSUMING.md`) for the
target version. Confirm this consumer still satisfies the contract —
specifically the updater shim, NSIS hooks, and any breaking changes
listed in the toolkit's CHANGELOG for this version range.

If any contract item requires changes to consumer code, list them
explicitly before making any edits.

### Step 6 — Run tests

```bash
npm test && cargo check
```

Both must pass. If either fails, fix the failure before opening the PR.

### Step 7 — Open a PR

Title: `chore(deps): bump desktop-toolkit to vX.Y.Z`

The PR must contain only:
- The two manifest changes (Step 1 and 2)
- The two regenerated lockfiles (Step 4)
- Any contract-required consumer changes identified in Step 5

## Non-goals

- No refactors of consumer code beyond what the pin bump requires
- No changes to product behavior
- No changes to unrelated dependencies
- Do not combine this PR with feature work — keep it reviewable as a pin bump

## Verification report

When complete, report:

1. The two pin file paths updated and their new version values — must match
2. Output of `npm test && cargo check`
3. Any CONSUMING.md contract items that required adjustment, and what was changed
