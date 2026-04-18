# Framework Extraction — Migration Plan

A numbered, executable checklist.  **Steps 1–5 operate on the `kc-framework`
repo.  Steps 6–8 operate on this repo (`Transmittal-Builder`).**

Nothing in this plan moves or deletes any file from the current `main` branch
of Transmittal Builder.  The refactor happens in a dedicated branch
(`refactor/use-kc-framework`) and is merged separately after CI is green.

---

## Pre-flight: standalone safety net (already complete)

The standalone version of Transmittal Builder is preserved in three
independent ways:

- **Tag:** `v5.0.0` — immutable snapshot of the pre-extraction code.
- **Branch:** `legacy/standalone-v1` — protected (`legacy/**` ruleset
  blocks force-push and deletion); can receive emergency hotfixes via PR.
- **GitHub Release:** https://github.com/Koraji95-coder/Transmittal-Builder/releases/tag/v5.0.0
  with the signed Windows installer
  (`R3P.Transmittal.Builder_5.0.0_x64-setup.exe`) attached.

No further action is required before starting the extraction.

---

## Step 1 — Scaffold `kc-framework` with the layout from PROPOSED_LAYOUT.md

```bash
git clone https://github.com/Koraji95-coder/kc-framework.git
cd kc-framework
# Create the directory skeleton
mkdir -p python/kc_framework/{utils,pyinstaller}
mkdir -p js/packages/kc-framework/src/{ipc,splash/assets,updater,utils}
mkdir -p tauri-template/{icons,src-tauri-base/{src,capabilities}}
mkdir -p installer/nsis
mkdir -p build-scripts
mkdir -p .github/workflows

# Add placeholder files so the tree is committed
touch python/kc_framework/__init__.py
touch python/kc_framework/utils/__init__.py
touch js/packages/kc-framework/index.ts

git add .
git commit -m "chore: scaffold kc-framework directory layout"
git push
```

---

## Step 2 — Copy framework files while preserving Git history

Use `git filter-repo` to extract only the framework files from a throw-away
clone of `Transmittal-Builder`, then push that filtered history into
`kc-framework`.

```bash
# Clone Transmittal-Builder into a staging directory
git clone https://github.com/Koraji95-coder/Transmittal-Builder.git kc-framework-staging
cd kc-framework-staging

# Keep only the framework files (every path listed in INVENTORY.md)
git filter-repo \
  --path frontend/src/api/backend.js \
  --path frontend/src/splash.jsx \
  --path frontend/src/splash.css \
  --path frontend/src/updater.jsx \
  --path frontend/src/updater.css \
  --path frontend/src/version.js \
  --path frontend/src/assets/splash/sprocket-hammer.svg \
  --path frontend/src/assets/splash/r3p-logo-transparent.svg \
  --path frontend/src/assets/splash/r3p-logo.svg \
  --path frontend/src/assets/splash/rust-logo.svg \
  --path frontend/src/assets/splash/tauri-logo.svg \
  --path frontend/splash.html \
  --path frontend/updater.html \
  --path frontend/vite.config.js \
  --path frontend/scripts/generate-icons.mjs \
  --path frontend/src-tauri/build.rs \
  --path frontend/src-tauri/Cargo.toml \
  --path frontend/src-tauri/Cargo.lock \
  --path frontend/src-tauri/tauri.conf.json \
  --path frontend/src-tauri/capabilities/default.json \
  --path frontend/src-tauri/src/main.rs \
  --path frontend/src-tauri/src/lib.rs \
  --path frontend/src-tauri/src/sidecar.rs \
  --path frontend/src-tauri/src/splash.rs \
  --path frontend/src-tauri/src/updater.rs \
  --path frontend/src-tauri/installer/hooks.nsh \
  --path frontend/src-tauri/installer/nsis-header.svg \
  --path frontend/src-tauri/installer/nsis-header.bmp \
  --path frontend/src-tauri/installer/nsis-sidebar.svg \
  --path frontend/src-tauri/installer/nsis-sidebar.bmp \
  --path frontend/src-tauri/icons/icon-master.svg \
  --path backend/core/pdf_merge.py \
  --path backend/emails/sender.py \
  --path backend/transmittal_backend.spec \
  --path backend/requirements-build.txt \
  --path scripts/generate-latest-json.mjs \
  --path scripts/publish-to-drive.ps1 \
  --path .github/workflows/release.yml \
  --path RELEASING.md

# Point origin at kc-framework
git remote remove origin
git remote add origin https://github.com/Koraji95-coder/kc-framework.git

# Fetch the existing kc-framework history and merge (preserves the scaffold commit)
git fetch origin
git checkout -b import/from-transmittal-builder
git push origin import/from-transmittal-builder
```

Open a PR in `kc-framework` from `import/from-transmittal-builder` → `main`.

---

## Step 3 — Reorganise the filtered tree to match PROPOSED_LAYOUT.md

After merging the import PR, in a new branch on `kc-framework`:

```bash
cd kc-framework
git checkout -b chore/reorganize-layout

# Python utilities
mkdir -p python/kc_framework/utils
mv backend/core/pdf_merge.py                python/kc_framework/utils/pdf_merge.py
mv backend/emails/sender.py                 python/kc_framework/utils/email_sender.py
mkdir -p python/kc_framework/pyinstaller
mv backend/transmittal_backend.spec         python/kc_framework/pyinstaller/sidecar.spec.template
mv backend/requirements-build.txt           python/kc_framework/pyinstaller/requirements-build.txt

# JS — IPC
mv frontend/src/api/backend.js              js/packages/kc-framework/src/ipc/backend.js

# JS — Splash
mv frontend/src/splash.jsx                  js/packages/kc-framework/src/splash/index.jsx
mv frontend/src/splash.css                  js/packages/kc-framework/src/splash/splash.css
mv frontend/src/assets/splash/sprocket-hammer.svg      js/packages/kc-framework/src/splash/assets/
mv frontend/src/assets/splash/r3p-logo-transparent.svg js/packages/kc-framework/src/splash/assets/
mv frontend/src/assets/splash/r3p-logo.svg             js/packages/kc-framework/src/splash/assets/
mv frontend/src/assets/splash/rust-logo.svg            js/packages/kc-framework/src/splash/assets/
mv frontend/src/assets/splash/tauri-logo.svg           js/packages/kc-framework/src/splash/assets/

# JS — Updater
mv frontend/src/updater.jsx                 js/packages/kc-framework/src/updater/index.jsx
mv frontend/src/updater.css                 js/packages/kc-framework/src/updater/updater.css

# JS — Utils
mv frontend/src/version.js                 js/packages/kc-framework/src/utils/version.js

# Tauri template
mv frontend/splash.html                     tauri-template/splash.html
mv frontend/updater.html                    tauri-template/updater.html
mv frontend/vite.config.js                  tauri-template/vite.config.js
mv frontend/src-tauri/build.rs              tauri-template/src-tauri-base/build.rs
mv frontend/src-tauri/Cargo.toml            tauri-template/src-tauri-base/Cargo.toml
mv frontend/src-tauri/tauri.conf.json       tauri-template/src-tauri-base/tauri.conf.json
mv frontend/src-tauri/capabilities/default.json tauri-template/src-tauri-base/capabilities/default.json
mv frontend/src-tauri/src/main.rs           tauri-template/src-tauri-base/src/main.rs
mv frontend/src-tauri/src/lib.rs            tauri-template/src-tauri-base/src/lib.rs
mv frontend/src-tauri/src/sidecar.rs        tauri-template/src-tauri-base/src/sidecar.rs
mv frontend/src-tauri/src/splash.rs         tauri-template/src-tauri-base/src/splash.rs
mv frontend/src-tauri/src/updater.rs        tauri-template/src-tauri-base/src/updater.rs
mv frontend/src-tauri/icons/icon-master.svg tauri-template/icons/icon-master.svg

# Installer
mv frontend/src-tauri/installer/hooks.nsh        installer/nsis/hooks.nsh
mv frontend/src-tauri/installer/nsis-header.svg  installer/nsis/nsis-header.svg
mv frontend/src-tauri/installer/nsis-header.bmp  installer/nsis/nsis-header.bmp
mv frontend/src-tauri/installer/nsis-sidebar.svg installer/nsis/nsis-sidebar.svg
mv frontend/src-tauri/installer/nsis-sidebar.bmp installer/nsis/nsis-sidebar.bmp

# Build scripts
mv frontend/scripts/generate-icons.mjs      build-scripts/generate-icons.mjs
mv scripts/generate-latest-json.mjs         build-scripts/generate-latest-json.mjs
mv scripts/publish-to-drive.ps1             build-scripts/publish-to-drive.ps1

# CI
mv .github/workflows/release.yml            .github/workflows/release-tauri-sidecar-app.yml

# Release docs
mkdir -p docs
mv RELEASING.md                             docs/releasing.md

# Remove now-empty staging directories
rmdir --ignore-fail-on-non-empty \
  frontend/src/api frontend/src/assets/splash frontend/src/assets \
  frontend/src frontend/scripts frontend/src-tauri/src \
  frontend/src-tauri/capabilities frontend/src-tauri/installer \
  frontend/src-tauri/icons frontend/src-tauri frontend backend/core \
  backend/emails backend scripts frontend 2>/dev/null || true

git add -A
git commit -m "chore: reorganize extracted files to match PROPOSED_LAYOUT"
git push origin chore/reorganize-layout
```

Open and merge the reorganize PR in `kc-framework`.

---

## Step 4 — Add framework package manifests

In another PR on `kc-framework`:

- **`python/pyproject.toml`** — declare `kc-framework` as a Python package.
- **`js/packages/kc-framework/package.json`** — declare the npm package
  `@koraji95-coder/kc-framework`.
- **`LICENSE`** — add MIT licence.
- **`CONTRIBUTING.md`** — contribution guidelines for the framework itself.
- **`CHANGELOG.md`** — initial entry for `v1.0.0`.

---

## Step 5 — Tag `v1.0.0` and create a GitHub Release in `kc-framework`

```bash
cd kc-framework
git tag v1.0.0
git push origin v1.0.0
```

Create the GitHub Release manually (or via CI) with release notes describing
what is included.  This tag is the target for all pinned references in
consuming tools.

---

## Step 6 — Refactor Transmittal Builder to consume the framework

Create a new branch in this repo:

```bash
cd Transmittal-Builder
git checkout -b refactor/use-kc-framework
```

### 6a. Add the Python dependency

Edit `backend/requirements.txt`:

```
kc-framework @ git+https://github.com/Koraji95-coder/kc-framework@v1.0.0#subdirectory=python
```

### 6b. Add the JS dependency

Edit `frontend/package.json`:

```json
"@koraji95-coder/kc-framework": "git+https://github.com/Koraji95-coder/kc-framework.git#semver:^1.0.0&path:js/packages/kc-framework"
```

Then run:

```bash
cd frontend && npm install
```

### 6c. Apply the import rewrites from CONSUMPTION.md

Update every file that imports the modules listed in INVENTORY.md.  See the
full before/after table in [CONSUMPTION.md](./CONSUMPTION.md).

Key substitutions:

- `from backend.core.pdf_merge import ...` → `from kc_framework.utils.pdf_merge import ...`
- `from emails.sender import send_email` → `from kc_framework.utils.email_sender import send_email`
- `import { initBackendUrl } from "./api/backend"` → `import { initBackendUrl } from "@koraji95-coder/kc-framework/ipc"`
- `import { APP_VERSION } from "./version"` → `import { APP_VERSION } from "@koraji95-coder/kc-framework/utils/version"`
- Splash and updater JSX entries updated to import from `@koraji95-coder/kc-framework`.

### 6d. Delete the now-duplicated files

```bash
# Python
rm backend/core/pdf_merge.py
rm backend/emails/sender.py
rm backend/transmittal_backend.spec        # replace with a local spec that extends the template
rm backend/requirements-build.txt

# JS
rm frontend/src/api/backend.js
rm frontend/src/splash.jsx
rm frontend/src/splash.css
rm frontend/src/updater.jsx
rm frontend/src/updater.css
rm frontend/src/version.js
rm -r frontend/src/assets/splash/
rm frontend/splash.html
rm frontend/updater.html
rm frontend/scripts/generate-icons.mjs

# Tauri (replace with local copies from tauri-template — do not delete without replacing)
# frontend/src-tauri/src/{sidecar,splash,updater,lib,main}.rs
# frontend/src-tauri/{build.rs,Cargo.toml,tauri.conf.json,capabilities/}
# frontend/src-tauri/installer/  frontend/src-tauri/icons/icon-master.svg

# Scripts
rm scripts/generate-latest-json.mjs
rm scripts/publish-to-drive.ps1
```

> **Note:** Tauri Rust files must be replaced with parameterised copies from
> `kc-framework/tauri-template/src-tauri-base/src/` before deleting the
> originals — never leave the build in a broken state.

### 6e. Run the full build and smoke test

```bash
# Backend
cd backend
pip install -r requirements.txt -r requirements-build.txt
pyinstaller <tool>.spec --distpath dist-sidecar

# Frontend
cd ../frontend
npm ci
npm run build
npx tauri build
```

Smoke-test the installer on a clean Windows machine or VM.

---

## Step 7 — Open the refactor PR, get CI green, merge

Push the `refactor/use-kc-framework` branch and open a PR targeting `main`.
The PR must:

- Pass the `Release` workflow (build sidecar + Vite + Tauri).
- Show no regressions against the `v5.0.0` baseline.
- Include the `git diff --stat` showing only expected file changes.

---

## Step 8 — Tag a new Transmittal Builder release

```bash
git tag v6.0.0
git push origin v6.0.0
```

The CI workflow creates the GitHub Release and attaches the installer
automatically.

---

## Rollback plan

If anything goes wrong after the refactor PR is merged, the pre-extraction
state is available at:

- **Tag:** `v5.0.0` — immutable snapshot.
- **Branch:** `legacy/standalone-v1` — can receive hotfixes.
- **GitHub Release:** installer binary attached to the `v5.0.0`
  release page.

To rebuild the standalone installer from the legacy branch:

```bash
git checkout legacy/standalone-v1
# Follow the build steps in RELEASING.md
```
