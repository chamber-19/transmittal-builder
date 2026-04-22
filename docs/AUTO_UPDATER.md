# Auto-Updater

Transmittal Builder ships a lightweight, G:\-based auto-updater that
reads a manifest from the shared drive on every launch and prompts the
user to install a newer version when one is available.

There is no public hosting, no Tauri updater plugin, and no signing
requirement. Distribution is internal-only over Google Drive.

---

## How It Works

1. On app mount the React frontend calls `invoke('check_for_update')`.
2. Rust reads `update-source.json` from the user's app config directory
   (`%APPDATA%\Transmittal Builder\update-source.json`) to determine
   whether the check is enabled and where to find the manifest.
3. If the check is enabled, Rust reads `latest.json` from the configured
   path.  If the drive is unreachable or the file is missing, the check
   fails **silently** (console log only — no error popup).
4. The manifest version is compared to the running version using the
   `semver` crate, so `6.0.10 > 6.0.9` is handled correctly.
5. If a newer version is found and its installer exists on the shared
   drive, Rust returns `{ updateAvailable: true, version, installerPath,
   notes }` to the React caller.
6. The **Update Available** modal appears, blocking the main UI:
   - **Install Now** — shows a brief "Installing update…" message
     (~2.5 s), invokes `apply_update`, which spawns the installer with
     `/S` (silent NSIS flag) and calls `app.exit(0)`.  All file locks
     are released before the installer overwrites them.
   - **Remind Me Later** — session-only dismiss.  The modal reappears
     on the next launch.

---

## Manifest Location

Default path (baked in at build time, overridable per machine):

```text
G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder\latest.json
```

The installer must live in the **same folder** as `latest.json`:

```text
G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder\
  ├── latest.json
  └── Transmittal.Builder_<version>_x64-setup.exe
```

### `latest.json` format

`scripts/generate-latest-json.mjs` (run by CI) produces:

```json
{
  "version": "6.0.4",
  "pub_date": "2026-04-19T07:18:35Z",
  "installer": "Transmittal.Builder_6.0.4_x64-setup.exe",
  "notes": "What's new in v6.0.4",
  "mandatory": true
}
```

The updater reads `version`, `notes`, and `installer` (to locate the
exe in the manifest folder).  If the `installer` field is absent the
path is synthesised as `Transmittal.Builder_<version>_x64-setup.exe`.

---

## Per-Machine Override (`update-source.json`)

On first launch the app writes:

```json
{
  "manifestPath": "G:\\Shared drives\\R3P RESOURCES\\APPS\\Transmittal Builder\\latest.json",
  "enabled": true
}
```

to `%APPDATA%\Transmittal Builder\update-source.json`.

You can edit this file without rebuilding the app to:

| Change | How |
|---|---|
| Redirect to a different folder / drive letter | Update `manifestPath` |
| Disable update checks for one machine | Set `"enabled": false` |
| Test against a staging manifest | Point `manifestPath` at a local copy |

---

## Disabling Updates

Set `enabled: false` in `update-source.json`:

```json
{
  "manifestPath": "G:\\Shared drives\\R3P RESOURCES\\APPS\\Transmittal Builder\\latest.json",
  "enabled": false
}
```

The app will skip the check entirely and open normally.

---

## Error Handling

All errors during the update check degrade silently:

| Condition | Behaviour |
|---|---|
| G:\ drive not mounted | Console log only, app opens normally |
| `latest.json` missing or unreadable | Console log only, app opens normally |
| Malformed JSON | Console log only, app opens normally |
| Installer `.exe` not found on drive | Console log only, no modal shown |
| Version string not valid semver | Console log only, treated as up-to-date |

No user-facing error dialog is shown.  Check
`%LOCALAPPDATA%\Transmittal Builder\updater.log` (release builds only)
for timestamped log entries from the Rust side.

---

## Release Flow

After the GitHub Actions release workflow completes (triggered by a
`v*` tag), a maintainer must copy the new artefacts to the shared drive:

1. Go to the GitHub Release page for the new tag, e.g. `v6.1.0`.
2. Download both assets:
   - `Transmittal.Builder_6.1.0_x64-setup.exe`
   - `latest.json`
3. Open `G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder\` in
   File Explorer.
4. Move the **old** installer to an `archive\` sub-folder (safety net).
5. Copy the **new** installer and `latest.json` into the folder,
   replacing the existing `latest.json`.

Within ~24 hours every running instance of the app will show the
**Update Available** modal on next launch.

See [RELEASING.md](../RELEASING.md) for the full release procedure.
