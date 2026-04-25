# Contributing to Transmittal Builder

Transmittal Builder is a small, internal tool. External contributions are
unlikely, but if you are reading this — welcome. This document covers the
basics: how the repo fits into the Chamber 19 family, how to set up a dev
environment, branching, and how to cut a release.

For the full step-by-step release mechanics, see [RELEASING.md](./RELEASING.md).
For diagnosing user-facing issues, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

---

## 1. What this repo is

`transmittal-builder` is a standalone Tauri desktop app (Rust shell + React
frontend + Python FastAPI sidecar) for generating engineering transmittal
packages. It is one of several tools in the Chamber 19 family:

| Repo | Role |
|---|---|
| [`chamber-19/desktop-toolkit`](https://github.com/chamber-19/desktop-toolkit) | Shared framework for Tauri desktop apps (splash, updater, NSIS installer, Python sidecar plumbing) |
| [`chamber-19/launcher`](https://github.com/chamber-19/launcher) | Tauri shell that installs, updates, and launches Chamber 19 tools |
| [`chamber-19/transmittal-builder`](https://github.com/chamber-19/transmittal-builder) | This repo |
| [`chamber-19/object-totaler`](https://github.com/chamber-19/object-totaler) | AutoCAD plugin (independent of this repo) |
| [`chamber-19/autocad-pipeline`](https://github.com/chamber-19/autocad-pipeline) | Shared MSBuild props for AutoCAD plugins (independent of this repo) |

This repo **consumes** `@chamber-19/desktop-toolkit` as a versioned dependency
in three places (kept in lockstep):

- `frontend/package.json` — JS toolkit (npm, GitHub Packages)
- `frontend/src-tauri/Cargo.toml` `[dependencies]` — Rust toolkit (git tag)
- `frontend/src-tauri/Cargo.toml` `[package.metadata.desktop-toolkit]` —
  `library-tag` and `shim-tag` (CI reads `shim-tag` to build the updater shim)

The Python backend depends on `chamber19-desktop-toolkit` from the same
upstream repo (public, no auth needed for `pip install`).

---

## 2. Local development

Full setup steps (prerequisites, `NODE_AUTH_TOKEN`, dev-server commands) live
in **[README.md — Quick Start](./README.md#quick-start--tauri-desktop)**. This
document does not duplicate them.

The short version:

```bash
cd backend
pip install -r requirements.txt

cd ../frontend
export NODE_AUTH_TOKEN=ghp_yourTokenHere   # PAT with read:packages
npm install
npm run desktop                              # = tauri dev
```

---

## 3. Branching

| Branch | Purpose |
|---|---|
| `main` | Always releasable. Tags are cut from here. |
| `feat/<name>` | New features |
| `fix/<name>` | Bug fixes |
| `chore/<name>` | Tooling, dependency bumps |
| `docs/<name>` | Documentation only |
| `copilot/<name>` | Branches authored by the Copilot coding agent |

All changes go through pull requests to `main`. CI (`toolkit-pin-check.yml`,
`release.yml`, markdownlint) must be green before merge.

---

## 4. Versioning

This repo follows **[SemVer](https://semver.org/)** (`MAJOR.MINOR.PATCH`).
Tags are of the form `vX.Y.Z` (no decoration). Pushing a tag triggers
`.github/workflows/release.yml`, which builds the PyInstaller sidecar, the
Vite frontend, and the Tauri NSIS installer, then attaches both the installer
and `latest.json` to a GitHub Release.

The version number lives in three files that **must match**:

- `frontend/package.json`
- `frontend/src-tauri/tauri.conf.json`
- `frontend/src-tauri/Cargo.toml`

Use `node scripts/bump-version.mjs <new-version>` to update all three at once,
then run `cargo check --manifest-path frontend/src-tauri/Cargo.toml` to refresh
`Cargo.lock` in the same commit.

### Bumping `@chamber-19/desktop-toolkit`

When the toolkit ships a new tag, bump **all four** locations together:

- `frontend/package.json` — `"@chamber-19/desktop-toolkit"`
- `frontend/src-tauri/Cargo.toml` — `[package.metadata.desktop-toolkit] library-tag`
- `frontend/src-tauri/Cargo.toml` — `[package.metadata.desktop-toolkit] shim-tag`
- `frontend/src-tauri/Cargo.toml` — `[dependencies] desktop-toolkit { tag = ... }`

Then refresh both lockfiles in the same commit:

```bash
cd frontend && npm install
cargo update -p desktop-toolkit --manifest-path src-tauri/Cargo.toml
```

`.github/workflows/toolkit-pin-check.yml` will fail the PR if any of the four
pin locations are out of sync.

---

## 5. Release workflow (summary)

See [RELEASING.md](./RELEASING.md) for the full procedure. The summary:

1. Open a PR → CI green → merge to `main`.
2. Bump the version (see §4).
3. Add a `## [X.Y.Z] — YYYY-MM-DD` section to `CHANGELOG.md` describing
   the change. `scripts/generate-latest-json.mjs` reads this section
   verbatim and ships it as the in-app release notes — a missing section
   fails the release build.
4. Tag `vX.Y.Z` and push the tag.
5. CI builds the installer and creates a GitHub Release.
6. Run `scripts/publish-to-drive.ps1 -Tag vX.Y.Z` to copy the installer
   and `latest.json` to the shared Google Drive folder. From that point,
   every running instance of the app will detect and install the update
   on next launch.

---

## 6. Documentation policy

This repo enforces a "no stale docs" rule. The full mapping of code-paths
to docs that must be kept in sync lives in
[`.github/copilot-instructions.md`](./.github/copilot-instructions.md). Human
contributors are bound by the same rule as the Copilot coding agent — if
your PR changes code that has documented behaviour, the docs change in the
same PR.

All `*.md` files must pass `markdownlint-cli2 "**/*.md"` (config in
`.markdownlint.jsonc` and `.markdownlint-cli2.jsonc`).

---

## 7. Commit & PR conventions

This project encourages **[Conventional Commits](https://www.conventionalcommits.org/)**:

| Prefix | Use for |
|---|---|
| `feat:` | New user-facing feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code change with no behaviour change |
| `chore:` | Build, tooling, dependency updates |

PR titles should match the leading commit type. PRs that bump the
`@chamber-19/desktop-toolkit` pin must link to the upstream changelog or
release notes in the PR description so reviewers can assess impact.

---

## 8. Contact

For bug reports or feature requests, open an
[issue on GitHub](https://github.com/chamber-19/transmittal-builder/issues).
