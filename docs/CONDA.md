# Conda Environment Guide

This repository uses a Conda-first Python workflow to keep dependencies isolated
per tool/repository and avoid cross-project clashes.

---

## Standard Environment

Use the committed environment file:

```powershell
conda env create -f environment.yml
conda activate transmittal-builder
```

To refresh after dependency changes:

```powershell
conda env update -f environment.yml --prune
conda activate transmittal-builder
```

---

## Daily Commands

From repo root:

```powershell
# Backend tests
cd backend
python -m pytest

# Frontend build
cd ../frontend
npm ci
npm run build

# Tauri compile check
cd src-tauri
cargo check
```

---

## Why Conda Here (Not In desktop-toolkit)

`desktop-toolkit` is consumed by multiple applications and CI contexts, so it
must remain environment-manager agnostic.

Conda policy is therefore enforced in consumer repos (like
`transmittal-builder`) rather than in `desktop-toolkit` itself.

---

## Agent/Copilot Expectations

- Agents should prefer the `transmittal-builder` Conda env for Python commands.
- Do not require `.venv` in docs or workflows.
- If a toolkit pin is bumped, reinstall the Python git pin with:

```powershell
cd backend
python -m pip install --force-reinstall --no-deps "chamber19-desktop-toolkit @ git+https://github.com/chamber-19/desktop-toolkit@vX.Y.Z#subdirectory=python"
```

- Keep all five toolkit pin locations in sync (see `.github/copilot-instructions.md`).
