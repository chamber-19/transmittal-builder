# Transmittal Builder — Troubleshooting

This document covers common issues encountered when installing, running, or
building Transmittal Builder.

---

## 1. Windows SmartScreen "Unknown publisher" warning

**Symptom:** After double-clicking the installer, Windows displays:

> Windows protected your PC
> Microsoft Defender SmartScreen prevented an unrecognized app from starting.

**Cause:** The NSIS installer is unsigned. This is expected for internal
distribution without a code-signing certificate.

**Fix (users):**

1. Click **"More info"** (the small link under the warning).
2. Click **"Run anyway"**.
3. The installer proceeds normally.

This dialog only appears on the **first run** on each machine. Once Windows
records that you ran the installer intentionally, it will not appear again for
the same version.

**Fix (future — ops/dev):** Obtain an Authenticode code-signing certificate
and add it to CI. The workflow already has a placeholder comment showing
exactly where `signtool` slots in. See `RELEASING.md §1 — Code signing`.

---

## 2. App refuses to open — "Cannot reach shared drive"

**Symptom:** The splash screen appears, then the app shows an error dialog:

> Cannot reach shared drive. Connect to VPN or map the G:\ drive and
> try again.

The app then exits without opening the main window.

**Cause:** The app checks `G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder\`
on every launch (hard-block policy). If the path is unreachable — because
Google Drive for Desktop is not running, the drive is not mounted, or VPN is
disconnected — the app refuses to start.

**Fix:**

1. Ensure **Google Drive for Desktop** is running and signed in.
2. Verify the shared drive is mounted at `G:` in File Explorer.
3. If the drive letter changed, set the `TRANSMITTAL_UPDATE_PATH` environment
   variable to the correct path:

   ```powershell
   [System.Environment]::SetEnvironmentVariable(
     "TRANSMITTAL_UPDATE_PATH",
     "H:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder",
     "User"
   )
   ```

   Then restart the app.
4. If you are on VPN, ensure the VPN tunnel is connected before launching.

**Dev/testing override:** Set `TRANSMITTAL_UPDATE_PATH` to a local folder
containing a valid `latest.json` and the installer `.exe`:

```powershell
$env:TRANSMITTAL_UPDATE_PATH = "C:\tmp\fake-drive"
```

In this mode the app will run without a real shared drive.

---

## 3. Sidecar port capture timeout

**Symptom:** The splash shows "Starting backend service…" indefinitely, or the
main window opens but all API calls fail with `ERR_CONNECTION_REFUSED`. The app
may fall back to port 8000.

**Cause:** The Rust launcher waits up to 15 seconds for the sidecar to print
its port number on stdout. If the sidecar crashes, takes too long to start, or
the output is lost, Rust times out and falls back to the pre-allocated port
(which the sidecar may not have bound yet).

**Diagnostics:**

1. Open the app's log (Tauri writes to stderr / Windows Event Log in debug builds).
2. Look for `[sidecar]` lines:
   - `[sidecar] Found sidecar at: …` — sidecar binary was found.
   - `[sidecar] Failed to spawn sidecar …` — binary not found or crashed on
     launch.
   - `[sidecar] Sidecar spawned (PID …)` — success.
3. Run the sidecar manually from a terminal to see its output:

   ```powershell
   $env:TRANSMITTAL_BACKEND_PORT = "9000"
   .\binaries\transmittal-backend\transmittal-backend.exe
   ```

   It should print `9000` on the first line and then start uvicorn.

**Common causes & fixes:**

- **Missing `_internal/` folder:** The NSIS installer bundles the whole
  `transmittal-backend/` one-dir output. If only `transmittal-backend.exe` was
  copied (missing `_internal/`), the sidecar will crash immediately.
  Re-run the "Copy sidecar to Tauri resources" CI step.
- **Antivirus blocking:** Some AV products quarantine PyInstaller executables.
  Add `transmittal-backend.exe` to the AV exclusion list.
- **Port already in use:** Extremely unlikely since Rust picks a free port with
  `TcpListener::bind("127.0.0.1:0")`, but if it happens restart the app.

---

## 4. PyInstaller build failures on Python 3.13

**Symptom:** `pyinstaller transmittal_backend.spec` fails with one of:

- `ModuleNotFoundError: No module named 'pkg_resources'`
- `TypeError: argument of type 'NoneType' is not iterable`
- Import errors for `docxtpl`, `pdf2docx`, or other dependencies

**Cause:** PyInstaller < 6.10 does not support Python 3.13. The `importlib`
internals changed in 3.13 and older PyInstaller versions cannot walk the
module graph correctly.

**Fix:**

```powershell
pip install "pyinstaller>=6.10"
```

Verify: `pyinstaller --version` should print `6.10.x` or higher.

**If PyInstaller 6.10 still fails on 3.13 (rare):**
This can happen if a third-party package (e.g., an older version of
`pdf2docx` or `docx2pdf`) has a hook incompatible with 3.13. Steps to
diagnose:

1. Run with `--debug all` for verbose import tracing:

   ```powershell
   pyinstaller transmittal_backend.spec --debug all 2>&1 | Tee-Object build.log
   ```

2. Search the log for the first `ERROR` or `ModuleNotFoundError`.
3. If the failing package does not support 3.13, pin it to the last 3.12-
   compatible release in `requirements.txt`.

**CI fallback:** If 3.13 cannot be made to work, change the CI workflow Python
version from `"3.13"` to `"3.12"` in `.github/workflows/release.yml` and add
a comment explaining the reason. Document it here and in `RELEASING.md`.

---

## 5. latest.json parse error / update not triggering

**Symptom:** App opens normally even though a newer version exists on the
shared drive, OR the app update dialog shows garbled version text.

**Cause:** `latest.json` is malformed, uses a `v`-prefixed version string
(`"v4.0.0"` instead of `"4.0.0"`), or was not uploaded correctly.

**Fix:**

1. Validate the file manually:

   ```powershell
   Get-Content "G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder\latest.json" | ConvertFrom-Json
   ```

2. Ensure `version` is a bare semver string, e.g. `"4.1.0"` (no `v` prefix).
3. If the file is missing, re-run:

   ```powershell
   .\scripts\publish-to-drive.ps1 -Tag v4.1.0
   ```

---

## 6. NSIS installer fails to create Start Menu shortcut

**Symptom:** Installation completes but no Start Menu or Desktop shortcut
appears.

**Cause:** `installMode: currentUser` installs to `%LOCALAPPDATA%\Programs\`,
which does not require admin. The shortcut is placed in the user's own Start
Menu (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\`). If the current user
profile is roaming/managed, this folder may be redirected.

**Fix:** Check `%APPDATA%\Microsoft\Windows\Start Menu\Programs\` for the
shortcut. If missing, create it manually or re-run the installer.

---

## 7. "tauri build" fails — NSIS branding images missing

**Symptom:**

```text
error: icon file not found: icons/nsis-header.bmp
```

**Fix:** Either:

- Add the BMP files (150×57 px header, 164×314 px sidebar) to
  `frontend/src-tauri/icons/`, **or**
- Remove the `headerImage` / `sidebarImage` keys from `tauri.conf.json`
  (under `bundle.windows.nsis`) to use NSIS defaults.

---

## 8. "Cargo.toml version does not match tauri.conf.json"

**Symptom:** `tauri build` fails with a version mismatch warning/error.

**Fix:** All three files must have the same version string:

- `frontend/src-tauri/tauri.conf.json` → `"version"`
- `frontend/src-tauri/Cargo.toml` → `version`
- `frontend/package.json` → `"version"`

Update all three before tagging a release. See `RELEASING.md §2 — Step 1`.

---

## 9. Force-update flow — updater log

**Symptom:** The app shows "Update detected, loading updater…" on the splash
screen but the updater window never appears, or the progress bar does not
animate, or the installer is never launched.

**Cause:** The update flow runs in a background thread and its output
(`println!`/`eprintln!`) is swallowed by the Windows GUI subsystem.  All
updater activity is written to a log file instead.

**Log file location (v6+):**

```text
%LOCALAPPDATA%\Transmittal Builder\updater.log
```

For most users this resolves to:

```text
C:\Users\<username>\AppData\Local\Transmittal Builder\updater.log
```

**View the log in PowerShell:**

```powershell
Get-Content "$env:LOCALAPPDATA\Transmittal Builder\updater.log" | Select-Object -Last 50
```

**Decode a timestamp line:**

```powershell
# Each log line starts with [<unix-epoch-seconds>]
# e.g. [1713340345] Copy complete: 34567890 bytes in 420 ms → C:\...\transmittal-update.exe
[DateTimeOffset]::FromUnixTimeSeconds(1713340345).LocalDateTime
```

**What a healthy update log looks like:**

```text
[...] Update path: G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder
[...] latest.json: read OK
[...] Version check: installed=4.0.0, remote=4.0.1
[...] Update available: 4.0.0 → 4.0.1
[...] Update available: 4.0.0 → 4.0.1 (path: G:\...)
[...] Copy: src=G:\...\R3P Transmittal Builder_4.0.1_x64-setup.exe, dest=C:\...\transmittal-update.exe, total_bytes=34567890
[...] Copy progress: 5% (...)
[...] ...
[...] Copy progress: 100% (...)
[...] Copy complete: 34567890 bytes in 420 ms → C:\...\transmittal-update.exe
[...] Launching installer: C:\...\transmittal-update.exe
[...] Installer launched (PID 12345) -- exiting
```

**Common failure patterns:**

| Log ends at… | Likely cause | Fix |
|---|---|---|
| `Update path: G:\...` and nothing after | Drive not reachable (path exists check passed but file read failed) | Ensure Drive for Desktop is running; try the env var override |
| `latest.json read error: …` | `latest.json` missing or locked | Re-run `publish-to-drive.ps1` |
| `Version check: installed=X, remote=X` | Versions match — no update triggered | Bump `version` in `latest.json` on the drive |
| `Copy: src=…` then `Copy failed: …` | Installer file missing on drive | Re-run `publish-to-drive.ps1 -Tag <tag>` |
| `Launching installer: …` then nothing | Installer spawn failed (AV blocked?) | Check AV exclusions for `%TEMP%\transmittal-update.exe` |

**Auto-relaunch note:** The installer runs silently in the background using
`/PASSIVE /NORESTART`.  The current app process exits as soon as the installer
is launched.  After the installer finishes, users must relaunch the app
manually from the Start Menu or Desktop shortcut.

---

## 10. Dependabot RUSTSEC alerts on `glib 0.18` / `rand 0.7`

**Symptom:** The repository **Security → Dependabot** tab shows two open
alerts against transitive crates pulled in by Tauri:

- `glib 0.18.x` — RUSTSEC-2024-0429 (`VariantStrIter` unsoundness)
- `rand 0.7.x`  — soundness issue in the legacy `rand` line

**Cause:** Both crates come in via `gtk-rs 0.18 → tao → tauri-runtime-wry`,
and only compile when targeting **Linux/GTK**. Transmittal Builder
ships a Windows-only NSIS installer (see `bundle.targets` in
`frontend/src-tauri/tauri.conf.json` and the `windows-latest` runner in
`.github/workflows/release.yml`), so the vulnerable code is never built
into the binary we distribute.

**Fix:**

1. Future Dependabot PRs/alerts for these two packages are suppressed by
   `.github/dependabot.yml` (see the `ignore:` block under the `cargo`
   ecosystem). No action required.
2. The **existing** open alerts are not auto-closed by `dependabot.yml`;
   GitHub requires a one-time manual dismissal:
   - Go to **Security → Dependabot → alert #N**.
   - Click **Dismiss → Tolerable risk** (or **Vulnerable code is not
     actually used**).
   - Reason text: _"Transitive Linux-only dependency via gtk-rs; we only ship
     Windows NSIS bundles. Will be removed when Tauri upgrades past
     gtk-rs 0.18."_
3. Re-evaluate when bumping Tauri to a release that updates gtk-rs past
   0.18 (then drop the `ignore:` entries in `dependabot.yml`).

---

## 11. Customising the NSIS installer / uninstaller wording

The installer and uninstaller wizard text (page titles, "Installation
complete" / "Uninstall complete" headers, title-bar captions) is
overridden via a thin NSIS hook file at
`frontend/src-tauri/installer/hooks.nsh`, wired in through
`bundle.windows.nsis.installerHooks` in `tauri.conf.json`.

The hook only `!define`s MUI text strings and sets `Caption` /
`UninstallCaption`; it does **not** fork Tauri's `installer.nsi.tera`
template. Things you can change there safely:

- All `MUI_TEXT_*` and `MUI_UNTEXT_*` page titles/subtitles
- `MUI_INSTFILESPAGE_FINISHHEADER_TEXT/SUBTEXT` (and `UN` variants) —
  these are the big bold strings on the green-progress-bar page
- `Caption` / `UninstallCaption` — the title-bar text

Things you **cannot** change without forking the template (intentionally
out-of-scope for now):

- The OS-drawn dialog frame, min/close buttons, rounded corners
- The progress-bar colour
- The presence of the "Show details" button on INSTFILES pages
