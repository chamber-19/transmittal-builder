# Migration Guide — v5 → v6

## Overview

Transmittal Builder v6.0.0 (formerly shipped as "R3P Transmittal Builder") is
a rebranded, modernized release. The Tauri application identifier changed from
`com.root3power.transmittal-builder` to `com.chamber-19.transmittal-builder`,
which means Windows treats v5 and v6 as different installed applications.

**User data is preserved.** The product name remains `Transmittal Builder`, so
the `%APPDATA%\Transmittal Builder\` data folder is shared between versions.

---

## Silent Migration (Recommended)

Perform a silent uninstall of v5 followed by a silent install of v6:

```powershell
# 1. Silent uninstall of v5 (adjust path if installed for all users)
& "$env:LOCALAPPDATA\Programs\R3P Transmittal Builder\unins000.exe" /S

# 2. Silent install of v6 (adjust path to your download location)
& ".\Transmittal.Builder_6.0.0_x64-setup.exe" /S
```

> **Note:** The v5 uninstaller path uses the old product name
> `R3P Transmittal Builder`. The v6 installer is named
> `Transmittal.Builder_6.0.0_x64-setup.exe`.

---

## What Changes

| Item | v5 | v6 |
|------|----|----|
| Tauri identifier | `com.root3power.transmittal-builder` | `com.chamber-19.transmittal-builder` |
| Product name | `R3P Transmittal Builder` | `Transmittal Builder` |
| Cargo package name | `r3p-transmittal-builder` | `transmittal-builder` |
| User data path | `%APPDATA%\Transmittal Builder\` | `%APPDATA%\Transmittal Builder\` (unchanged) |
| Log path | `%LOCALAPPDATA%\R3P Transmittal Builder\updater.log` | `%LOCALAPPDATA%\Transmittal Builder\updater.log` |

## What Does NOT Change

- `%APPDATA%\Transmittal Builder\` — user settings, splash sentinel, etc.
- All functional behaviour — rendering, PDF merge, email, folder scanning
- The shared drive update path (`G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder\`)

---

## Framework Consumption (Developers)

v6 consumes `@chamber-19/desktop-toolkit@^1.1.0` from GitHub Packages for the
JS toolkit. See the [Local Setup](./README.md#local-setup) section in
`README.md` for the `NODE_AUTH_TOKEN` setup (a PAT with `read:packages` scope
is all that is needed for npm).

The Python backend consumes `chamber19-desktop-toolkit` from the **public**
`chamber-19/desktop-toolkit` repository, so no token is required for
`pip install` — the git+https clone works without authentication.
