# Contributing to Transmittal Builder

Thank you for contributing to **R3P Transmittal Builder** — the transmittal
generation tool for ROOT3POWER ENGINEERING.

This document covers the multi-repo architecture we are moving toward, the
branching model, versioning rules, and the release workflow.  For the
step-by-step mechanics of cutting a release, see [RELEASING.md](./RELEASING.md).

---

## 1. Introduction

`Transmittal-Builder` contains the tool-specific Python backend (FastAPI) and
the Tauri/Vite frontend for generating engineering transmittal packages.

**Current state:** the repository is self-contained — shared UI components,
installer templates, logging helpers, and common Python utilities are inlined
here.

**Near-term direction:** those shared pieces will be extracted into a new
`kc-framework` repository and consumed here as a versioned dependency.
`Transmittal-Builder` will then be one of several tools in the `kc-suite`
product lineup.

---

## 2. Repository map

| Repo | Role | Consumes |
| --- | --- | --- |
| [`kc-framework`](https://github.com/Koraji95-coder/kc-framework) | Shared UI kit, installer templates, common Python utilities, auth/license, logging, updater hooks, IPC helpers | — |
| [`transmittal-builder`](https://github.com/chamber-19/transmittal-builder) | Transmittal generation tool | `kc-framework` |
| [`Drawing-List-Manager`](https://github.com/Koraji95-coder/Drawing-List-Manager) | Drawing list tool | `kc-framework` |
| `kc-suite` *(future)* | Meta-installer that bundles selected tools | `kc-framework`, tool repos |

Each tool repo is independent; `kc-suite` pins exact versions of each tool and
assembles them into a single distributable.

---

## 3. Branching model

| Branch | Purpose |
| --- | --- |
| `main` | Always releasable. Protected — no direct pushes. |
| `legacy/standalone-v1` | Frozen snapshot of the pre-framework standalone build. Protected — never delete or force-push. |
| `feat/<short-name>` | New features |
| `fix/<short-name>` | Bug fixes |
| `refactor/<short-name>` | Refactors (no behaviour change) |
| `docs/<short-name>` | Documentation-only changes |

**All changes go through pull requests to `main`.** No direct pushes to
`main` or `legacy/standalone-v1`.

---

## 4. Versioning & dependency pinning

This repo follows **[SemVer](https://semver.org/)** (`MAJOR.MINOR.PATCH`).

### Pinning kc-framework (post-extraction)

Once `kc-framework` is extracted, this repo pins to **exact framework tags**
— never to `main` or a floating branch.  Pinning to a tag is the regression
firewall that prevents an upstream change from silently breaking a tool.

**Python** (`backend/requirements.txt`):

```txt
kc-framework @ git+https://github.com/Koraji95-coder/kc-framework@vX.Y.Z
```

**JavaScript** (`frontend/package.json`):

```json
"kc-framework": "github:Koraji95-coder/kc-framework#vX.Y.Z"
```

### Bumping the framework version

1. Open a PR that changes only the pin (both `requirements.txt` and
   `package.json` if applicable).
2. Wait for CI to go green.
3. Merge, then follow the release workflow below.

> **Never pin to `main`.  Tags only.**

---

## 5. Release workflow

> This is a high-level summary.  See [RELEASING.md](./RELEASING.md) for the
> full step-by-step mechanics, rollback instructions, and troubleshooting.

1. Open a PR → CI green → merge to `main`.
2. Bump the version in `frontend/package.json`, `frontend/src-tauri/tauri.conf.json`,
   and `frontend/src-tauri/Cargo.toml` (all three must match).
3. Tag `vX.Y.Z` and push the tag:

   ```powershell
   git tag vX.Y.Z
   git push && git push --tags
   ```

4. CI builds the PyInstaller sidecar, the Vite frontend, and the Tauri
   installer; a GitHub Release is created with the installer attached.
5. Smoke-test the built installer locally before publishing to the shared drive
   (see [RELEASING.md §2](./RELEASING.md#2-cutting-a-release)).
6. If this release should be picked up by `kc-suite`, open a PR in that repo
   bumping the `Transmittal-Builder` pin to the new tag.

---

## 6. Regression protection

- **CI must be green before tagging.** No exceptions.
- **Smoke-test the installer locally** before running `publish-to-drive.ps1`.
- The `legacy/standalone-v1` branch is the rollback safety net — it preserves
  the last known-good standalone build.  Never delete or force-push it.
- Use **Renovate** or **Dependabot** (to be enabled) to receive automated PRs
  when `kc-framework` releases a new tag.  CI will immediately tell you whether
  the bump is safe to merge.

---

## 7. Local development

See **[README.md — Quick Start](./README.md#quick-start--web-browser)** for
full environment setup, prerequisite installation, and the dev-server commands.
This document does not duplicate those steps.

### Note on the framework extraction (pre- vs post-extraction)

**Before extraction** (current state): develop normally.  All shared code is
inlined in this repo.

**After extraction**: to develop against a local unreleased framework build,
use the standard package-manager link workflows:

- Python: `pip install -e ../kc-framework` (editable install)
- JavaScript: `cd ../kc-framework && npm link`, then `cd frontend && npm link kc-framework`

Remember to revert to a pinned tag before opening a PR.

---

## 8. Commit & PR conventions

This project encourages **[Conventional Commits](https://www.conventionalcommits.org/)**:

| Prefix | Use for |
| --- | --- |
| `feat:` | New user-facing feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code change with no behaviour change |
| `chore:` | Build, tooling, dependency updates |

**PR title** should match the leading commit type (e.g. `feat: add email CC field`).

**PRs that bump the `kc-framework` pin** must include a link to the framework
changelog or the relevant GitHub Release in the PR description so reviewers can
assess the impact at a glance.

---

## 9. Code of conduct & contact

Be respectful and constructive in all interactions.

For questions, bug reports, or feature requests, open an
[issue on GitHub](https://github.com/chamber-19/transmittal-builder/issues).
The maintainer will respond as time allows.
