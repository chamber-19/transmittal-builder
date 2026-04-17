# Releasing R3P Transmittal Builder

This document covers the full release lifecycle: one-time setup, cutting a
release, rolling back, and troubleshooting.

---

## 1. One-time setup

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS | `node --version` |
| Python | 3.11 | Match the CI environment |
| Rust | stable | `rustup update stable` |
| PyInstaller | ≥ 6 | `pip install pyinstaller` |
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

```
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
Monitor it at `https://github.com/Koraji95-coder/Transmittal-Builder/actions`.

It will:
1. Build the PyInstaller sidecar on Windows.
2. Build the Vite frontend.
3. Run `tauri build` → produces `R3P-Transmittal-Builder_4.0.0_x64-setup.exe`.
4. Generate `latest.json`.
5. Create a GitHub Release and upload both files.

### Step 5 — Publish to shared drive

On a machine with **Google Drive for Desktop** running and the R3P drive mounted:

```powershell
.\scripts\publish-to-drive.ps1 -Tag v4.0.0
```

This script:
- Downloads the release assets from GitHub.
- Archives the previous installer to `archive\` on the drive.
- Copies the new installer and `latest.json` into place.

After this step, every user who opens the app will be prompted to update.

---

## 3. Rollback

If a release has a critical bug:

1. In the shared drive, move the bad installer back to `archive\` and restore
   the previous installer from `archive\`:

   ```powershell
   $drive = "G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder"
   # Move bad installer to archive
   Move-Item "$drive\R3P-Transmittal-Builder_4.1.0_x64-setup.exe" "$drive\archive\"
   # Restore the previous good installer
   Copy-Item "$drive\archive\R3P-Transmittal-Builder_4.0.0_x64-setup.exe" "$drive\"
   ```

2. Edit `latest.json` on the shared drive and set `"version"` back to the
   previous good version (e.g. `"4.0.0"`).

3. Users with the bad version will see the "older" manifest and the updater
   will not trigger (since `4.0.0` is not greater than `4.1.0`).
   They will need to manually run the old installer from the shared drive,
   or you can distribute it via another channel.

---

## 4. User flow

```
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
│        │                                                           │
│   NO   └─── Show error dialog:                                    │
│              "Cannot reach R3P shared drive..."                   │
│              Exit (app will not open offline)                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## 5. Troubleshooting

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
