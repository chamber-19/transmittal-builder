---
applyTo: "frontend/package.json,frontend/src-tauri/Cargo.toml,frontend/src-tauri/tauri.conf.json,backend/requirements.txt,backend/transmittal_backend.spec,RELEASING.md,CHANGELOG.md,scripts/publish-to-drive.ps1,scripts/generate-latest-json.mjs,scripts/check-toolkit-pins.ps1,.github/workflows/release.yml,.github/workflows/toolkit-pin-check.yml,docs/AUTO_UPDATER.md"
---

# Release and Documentation Currency — Transmittal Builder

These rules apply when editing release-relevant files. They exist to
prevent the recurring failure mode where a version bumps in one place
but not another, or a release ships with stale documentation.

## Version alignment contract

The app version must be identical across these files:

- `frontend/package.json` (`version`)
- `frontend/src-tauri/Cargo.toml` (`[package] version`)
- `frontend/src-tauri/tauri.conf.json` (`version`)

Bumping one without the others is a build-breaking error. Update all
three in the same commit.

The git tag (`vMAJOR.MINOR.PATCH`) must match the version in those
three files. The release workflow validates this implicitly via the
installer-locator step in `release.yml`.

## Doc-currency table

When you change one of these, update the others in the same PR:

| If you change... | You must also update... |
| --- | --- |
| Anything user-facing | `CHANGELOG.md` under `## [Unreleased]` |
| `release.yml` | `RELEASING.md` (prerequisites + step list) |
| Python version in `release.yml` | `RELEASING.md` prereqs + `TROUBLESHOOTING.md` §4 |
| `scripts/publish-to-drive.ps1` | `docs/AUTO_UPDATER.md` Release Flow section |
| `scripts/generate-latest-json.mjs` | `docs/AUTO_UPDATER.md` `latest.json format` section |
| `frontend/src-tauri/Cargo.toml` shim-tag/library-tag | Open a paired PR per `consume-toolkit-bump.prompt.md` |
| Auto-updater behavior in Rust | `docs/AUTO_UPDATER.md` (How It Works + Error Handling tables) |
| `backend/requirements.txt` desktop-toolkit pin | The other four toolkit pin locations (see `consume-toolkit-bump.prompt.md`) |

## Release-bump checklist

When cutting a release tag:

1. Bump the three version fields above to the target version.
2. Regenerate both lockfiles: `npm install` from `frontend/` updates
   `frontend/package-lock.json`; `cargo check` from `frontend/src-tauri/`
   updates `frontend/src-tauri/Cargo.lock`. The Python git+ pin in
   `backend/requirements.txt` does not have a lockfile.
3. Move `CHANGELOG.md` `## [Unreleased]` entries under `## [vX.Y.Z]`
   with the release date. Add a new empty `## [Unreleased]` above.
4. Smoke-test the build locally: `npm run build` + `cargo check` +
   `python -m pytest`.
5. Verify `pwsh ./scripts/check-toolkit-pins.ps1` passes locally. The
   release workflow won't pass CI if it doesn't.
6. Tag with `git tag vX.Y.Z` and push the tag.
7. Verify the release workflow succeeds and the GitHub Release page
   has both `Transmittal.Builder_X.Y.Z_x64-setup.exe` and `latest.json`.
8. Run `scripts/publish-to-drive.ps1` (or follow the manual steps in
   `docs/AUTO_UPDATER.md` Release Flow) to mirror the artifacts to G:\.
9. Verify a running instance picks up the update on next launch.

If any step fails, stop and report. Do not paper over a failure to keep
the release moving — a broken release is harder to roll back than to
delay.

## Lockfile rules

- `frontend/package-lock.json` and `frontend/src-tauri/Cargo.lock` are
  generated, not hand-edited. If a dependency change requires a lockfile
  edit, run the relevant install/check command and commit the result.
- Hand-edited lockfile integrity hashes have caused real outages in this
  repo. The `copilot-setup-steps.yml` workflow exists specifically to
  give the cloud agent real `npm install` access so this doesn't happen.

## Toolkit pin discipline

Toolkit pin bumps are governed by `consume-toolkit-bump.prompt.md` and
enforced by `.github/workflows/toolkit-pin-check.yml`. The five pin locations are listed in the prompt.
Do not bump toolkit and ship feature
work in the same PR.