# Releasing Transmittal Builder

## Release process

1. Update `CHANGELOG.md` — promote `## [Unreleased]` to `## [X.Y.Z] — YYYY-MM-DD`
2. Merge to `main`

That's it. `.github/workflows/auto-tag.yml` reads the version from `CHANGELOG.md`,
creates the git tag if it's new, and `.github/workflows/release.yml` then builds
the PyInstaller binary and publishes the GitHub Release automatically.

## Version source of truth

The version lives in the CHANGELOG heading. `APP_VERSION` is set from the git tag
at CI build time — `backend/app.py` reads it via `os.getenv("APP_VERSION", "dev")`.
Nothing to bump manually.

## Rollback

Delete the GitHub Release and the git tag. Merge a CHANGELOG entry for the
previous good version and re-release from there.

## Local dev

```powershell
conda activate transmittal-builder
cd backend
python -m uvicorn app:app --reload --port 8000
```

The health endpoint returns `"version": "dev"` locally — that is expected.
