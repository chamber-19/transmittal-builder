# Releasing R3P Transmittal Builder

This document covers the full release lifecycle: one-time setup, cutting a
release, rolling back, and troubleshooting.

---

## 1. One-time setup

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS | `node --version` |
| Python | 3.13 | CI uses 3.13. Fall back to 3.12 only if PyInstaller fails — see `TROUBLESHOOTING.md §4`. |
| Rust | stable | `rustup update stable` |
| PyInstaller | ≥ 6.10 | Required for Python 3.13 support. `pip install "pyinstaller>=6.10"` |
| GitHub CLI | latest | `gh auth login` |
| Google Drive for Desktop | latest | R3P shared drive must be mounted as `G:` |

### NSIS branding images (optional but recommended)

The NSIS installer supports custom header and sidebar images. To add them:

1. Create `frontend/src-tauri/icons/nsis-header.bmp` (150 × 57 px, 24-bit BMP)
2. Create `frontend/src-tauri/icons/nsis-sidebar.bmp` (164 × 314 px, 24-bit BMP)
3. Add the paths to `tauri.conf.json` under `bundle.windows.nsis`:

   ```json
   "headerImage":  "icons/nsis-header.bmp",
   "sidebarImage": "icons/nsis-sidebar.bmp"
   ```

4. Commit the images and config change.

Without these files the NSIS installer uses its built-in default images.

### Shared drive path

The app defaults to reading updates from:

```text
G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder\
```

Override for dev/testing by setting the environment variable:

```powershell
$env:TRANSMITTAL_UPDATE_PATH = "C:\path\to\local\test\folder"
```

The folder must contain `latest.json` and the installer `.exe`.

### Code signing (future improvement)

Code signing with an Authenticode certificate is **not required** for initial
internal distribution. Windows SmartScreen will warn on first run but users
can click "More info → Run anyway." To add signing later:

1. Obtain a code-signing certificate.
2. Add `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as
   GitHub repository secrets.
3. Update the CI workflow to pass these to `tauri build`.

---

## 2. Cutting a release

### Step 1 — Bump the version

Edit **all three** files:

| File | Key |
|---|---|
| `frontend/src-tauri/tauri.conf.json` | `"version"` |
| `frontend/package.json` | `"version"` |
| `frontend/src-tauri/Cargo.toml` | `version` |

All three must match, e.g. `4.0.0`.

### Step 2 — (Optional) Add release notes

Create `RELEASE_NOTES.md` at the repository root with a brief description.
This content ends up in the GitHub Release body and in `latest.json` > `notes`.

```markdown
## What's new in v4.0.0
- Initial release of Transmittal Builder v4
- PDF merge and transmittal letter generation
```

### Step 3 — Tag and push

```powershell
git add .
git commit -m "chore: bump version to 4.0.0"
git tag v4.0.0
git push && git push --tags
```

### Step 4 — Wait for CI

The `.github/workflows/release.yml` workflow triggers on the tag push.
Monitor it at `https://github.com/chamber-19/transmittal-builder/actions`.

It will:

1. Build the PyInstaller sidecar on Windows.
2. Build the Vite frontend.
3. Run `tauri build` → produces `R3P.Transmittal.Builder_4.0.0_x64-setup.exe`.
4. Generate `latest.json`.
5. Create a GitHub Release and upload both files.

> **Filename note:** `softprops/action-gh-release` sanitises spaces to dots on
> upload, so the GitHub Release asset is named `R3P.Transmittal.Builder_<version>_x64-setup.exe`
> (dots) rather than the space-separated product name.  The filename on the
> shared drive after `publish-to-drive.ps1` will match this dotted convention.
> `publish-to-drive.ps1` uses a glob pattern to locate the installer, so it is
> filename-agnostic and unaffected by this sanitisation.

### Step 5 — Publish to shared drive

After CI completes and the GitHub Release is created:

1. **Download both release assets** from the GitHub Release page
   (e.g. `https://github.com/chamber-19/transmittal-builder/releases/tag/v6.2.3`):
   - `Transmittal.Builder_<version>_x64-setup.exe`
   - `latest.json`

2. **Open the shared drive folder** in File Explorer:

   ```text
   G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder\
   ```

3. **Archive the previous installer** (safety net — keep for ~2 weeks):
   - Create an `archive\` sub-folder if it doesn't exist.
   - Move the old `Transmittal.Builder_*.exe` into `archive\`.

4. **Copy the new files** into the folder, replacing the existing `latest.json`:
   - `Transmittal.Builder_<version>_x64-setup.exe`
   - `latest.json`

The folder should now contain only one installer `.exe` plus the updated
`latest.json`.  Within ~24 hours every user who launches the app will see
the **Update Available** prompt.

> **Note:** `publish-to-drive.ps1` now reads `latest.json.installer` to pick
> the installer filename — if that file isn't in the downloaded assets, the
> script aborts with a clear error message listing available executables.
>
> **Rollback:** To revert, copy the old installer back from `archive\`
> and edit `latest.json` to set `"version"` back to the previous good
> version.  See `docs/AUTO_UPDATER.md` for details.

---

## 3. Rollback

If a release has a critical bug:

1. In the shared drive, move the bad installer back to `archive\` and restore
   the previous installer from `archive\`:

   ```powershell
   $drive = "G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder"
   # Move bad installer to archive
   Move-Item "$drive\R3P.Transmittal.Builder_4.1.0_x64-setup.exe" "$drive\archive\"
   # Restore the previous good installer
   Copy-Item "$drive\archive\R3P.Transmittal.Builder_4.0.0_x64-setup.exe" "$drive\"
   ```

2. Edit `latest.json` on the shared drive and set `"version"` back to the
   previous good version (e.g. `"4.0.0"`).

3. Users with the bad version will see the "older" manifest and the updater
   will not trigger (since `4.0.0` is not greater than `4.1.0`).
   They will need to manually run the old installer from the shared drive,
   or you can distribute it via another channel.

---

## 4. User flow

```text
┌────────────────────────────────────────────────────────────────────┐
│                         FIRST INSTALL                              │
│  User copies installer from G:\ to desktop                        │
│  Double-clicks → NSIS installer runs → installs per-user          │
│  App shortcut created in Start Menu + Desktop                      │
└──────────────────────────────────┬─────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────┐
│                         EVERY APP LAUNCH                           │
│                                                                    │
│  App starts → Rust setup hook runs (before webview opens)         │
│                                                                    │
│  Check G:\ shared drive reachable?                                │
│        │                                                           │
│   YES  ├─── Read latest.json                                      │
│        │    Compare version to installed version                  │
│        │         │                                                 │
│        │    UP TO DATE ──────────────────────────────────────►    │
│        │         │               Spawn Python sidecar             │
│        │    OUT OF DATE          Show main window                 │
│        │         │                                                 │
│        │         ▼                                                 │
│        │    Show updater window (branded, progress bar)           │
│        │    Copy installer from G:\ to %TEMP%                    │
│        │    Launch installer /PASSIVE /NORESTART                 │
│        │    Exit current app → installer upgrades files          │
│        │    NOTE: installer runs silently in background.         │
│        │    Relaunch the app manually when the upgrade is done.  │
│        │                                                           │
│   NO   └─── Show error dialog:                                    │
│              "Cannot reach R3P shared drive..."                   │
│              Exit (app will not open offline)                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## 5. Why we override hooks.nsh locally

`frontend/src-tauri/installer/hooks.nsh` is a **TB-local checked-in file** and
is intentionally _not_ overwritten by the prebuild sync script.

### The upstream bug (desktop-toolkit v2.2.4 – fixed in v2.2.6)

The upstream `@chamber-19/desktop-toolkit` v2.2.4 `hooks.nsh` contains:

```nsis
!macro NSIS_HOOK_POSTINSTALL
  File "${BUILD_DIR}\desktop-toolkit-updater.exe"
!macroend
```

Tauri 2's NSIS template `!include`s the hooks file at the **top level** of
`installer.nsi` (before any Section or Function definition).  NSIS's `File`
directive embeds file data at compile time and requires Section/Function
context when the surrounding macro is defined — using it in a top-level macro
definition causes makensis to abort with:

```text
Error: command File not valid outside Section or Function
```

The same include ordering also matters for title-bar captions: immediate NSIS
commands in `hooks.nsh` run before Tauri later emits `!define PRODUCTNAME` and
`Name "${PRODUCTNAME}"`. That means `Caption "${PRODUCTNAME} — Setup"` renders
literally as `${PRODUCTNAME} — Setup` at runtime. Use the runtime `$(^Name)`
token for `Caption` / `UninstallCaption` instead.

### Our fix

1. **`bundle.resources`** — `desktop-toolkit-updater.exe` is added to
   `tauri.conf.json → bundle.resources` so Tauri's own Section-level `File`
   emits it into `$INSTDIR\resources\desktop-toolkit-updater.exe`.

2. **`NSIS_HOOK_POSTINSTALL`** — uses `CopyFiles` (valid in all runtime
   contexts) to promote the shim from `resources/` to `$INSTDIR\`:

   ```nsis
   !macro NSIS_HOOK_POSTINSTALL
     CopyFiles /SILENT "$INSTDIR\resources\desktop-toolkit-updater.exe" \
       "$INSTDIR\desktop-toolkit-updater.exe"
   !macroend
   ```

   The Rust updater (`desktop-toolkit` crate) resolves the shim as
   `current_exe().parent() / "desktop-toolkit-updater.exe"`, so placing it
   directly in `$INSTDIR` keeps the existing Rust code working without
   modification.

3. **`scripts/sync-installer-assets-local.mjs`** — the `prebuild` script now
   calls this local wrapper instead of `desktop-toolkit-sync-installer-assets`.
   The wrapper syncs only the SVG art masters, regenerates the BMPs locally
   from those SVGs, and **skips `hooks.nsh`** so the upstream package never
   overwrites our override. This avoids stale packaged BMPs leaking old
   branding into the installer even when the SVGs are current.

### When to re-sync hooks.nsh

If `@chamber-19/desktop-toolkit` is bumped to a version that fixes the
upstream `hooks.nsh` bug, evaluate whether you want to:

- Drop the local override and revert `prebuild` to `desktop-toolkit-sync-installer-assets`, OR
- Keep the local override as belt-and-suspenders.

Either way, run a full local build first (see §"Local smoke-test before tagging" below).

---

## 6. Local smoke-test before tagging

> **Always** run a full local Tauri build after any `@chamber-19/desktop-toolkit`
> version bump (or other changes to `tauri.conf.json` / `installer/hooks.nsh`)
> to catch NSIS compile errors before pushing a release tag.  CI Windows runners
> are expensive to retry.

```powershell
cd frontend

# Ensure the desktop-toolkit-updater shim exists (CI builds it; for local
# testing a placeholder or a real build is fine):
if (-not (Test-Path src-tauri\desktop-toolkit-updater.exe)) {
  Write-Warning "Shim not found — create a placeholder for the NSIS smoke-test:"
  [System.IO.File]::WriteAllBytes(
    "src-tauri\desktop-toolkit-updater.exe",
    [byte[]]@()   # empty file is enough for NSIS to compile
  )
}

npm run tauri build
```

A successful `tauri build` means the NSIS script compiled cleanly and the
`.exe` installer was produced.  You do not need to run the installer locally
unless you want to verify the upgrade flow end-to-end.

---

## 7. Troubleshooting

### Sidecar port conflict

**Symptom:** App opens but all API calls fail; health check spinner never stops.

**Cause:** Another process is using the port the sidecar picked.

**Fix:** The sidecar picks a free OS port dynamically — conflicts are extremely
unlikely. If they occur, restart the app. If the problem persists, check for
rogue processes with `netstat -an | findstr 127.0.0.1`.

---

### Shared drive path changed

**Symptom:** App shows "Cannot reach R3P shared drive" even when connected.

**Cause:** The `G:\` drive letter changed (Drive for Desktop re-assigned it),
or the folder was renamed.

**Fix:**

1. Verify the mounted path in File Explorer.
2. Set `TRANSMITTAL_UPDATE_PATH` to the correct path in the user's environment
   (System Properties → Environment Variables).

---

### latest.json parse error

**Symptom:** App skips the update check and opens normally even though a newer
version exists.

**Cause:** `latest.json` is malformed or has an invalid semver string.

**Fix:** Validate the file manually:

```powershell
Get-Content "G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder\latest.json" | ConvertFrom-Json
```

Ensure `version` is a valid semver string (e.g. `"4.0.0"`, not `"v4.0.0"`).

---

### NSIS branding images missing

**Symptom:** `tauri build` fails with "icon file not found: icons/nsis-header.bmp".

**Fix:** Either add the BMP files (see §1) or remove `headerImage` /
`sidebarImage` from `tauri.conf.json` to use NSIS defaults.

---

### Windows SmartScreen warning

**Symptom:** First-run users see "Windows protected your PC" dialog.

**Cause:** The installer is not code-signed (acceptable for internal use).

**Fix:** Users click "More info" → "Run anyway". For a production release,
add Authenticode signing (see §1).

---

### PyInstaller sidecar not found

**Symptom:** App falls back to the Python dev server (or fails to start backend).

**Cause:** `binaries/transmittal-backend/` was not included in the NSIS bundle.

**Fix:** Ensure the CI step "Copy sidecar to Tauri resources" ran successfully
before `tauri build`. The `binaries/transmittal-backend/` folder must exist
inside `frontend/src-tauri/` at build time.
