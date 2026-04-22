# Tauri backend — developer notes

## Debugging the splash animation

The sprocket/hammer SVG animation plays during the startup splash screen. Because
the dev-mode startup sequence is very fast (~200 ms), it can be difficult to open
DevTools on the splash window in time to inspect `#sprocket`, `#hammer`, and related
elements.

Set the `TRANSMITTAL_SPLASH_HOLD_MS` environment variable to pause for that many
milliseconds **after each status phase** (both Pending and Ok states), giving you a
visible window to open DevTools and inspect the animation mid-sequence.

### PowerShell

```powershell
$env:TRANSMITTAL_SPLASH_HOLD_MS = "2000"
npm run tauri dev
```

### bash / macOS / Linux

```bash
TRANSMITTAL_SPLASH_HOLD_MS=2000 npm run tauri dev
```

When the variable is set you will see a log line at startup:

```text
[splash] Debug hold mode active: 2000 ms per phase
```

Each phase then shows its spinner for ~2 s, then its checkmark for ~2 s, before
moving to the next step — total splash runtime ~16 s visible instead of ~200 ms.

**This is safe to leave in production binaries.** When the environment variable is
unset (the default for all real users), `hold_ms` is 0 and all `if hold_ms > 0`
guards are never entered, so there is zero runtime cost.

## Forcing the full splash on every dev reload

By default the splash runs in short-mode (~3.2 s) for subsequent launches with
the same version.  After the first dev run, every restart skips straight to the
short sequence.

Set `TRANSMITTAL_SPLASH_FORCE_FRESH` to bypass the `splash-seen.json` sentinel
and always run the full 11-second sequence:

### PowerShell

```powershell
$env:TRANSMITTAL_SPLASH_FORCE_FRESH = "1"
npm run tauri dev
```

### bash / macOS / Linux

```bash
TRANSMITTAL_SPLASH_FORCE_FRESH=1 npm run tauri dev
```

The sentinel file is **not written** while this variable is set, so its contents
remain unchanged and short-mode returns the moment the variable is unset.

**Safe for dev only** — leave unset in production builds.

The two env vars compose:

```powershell
$env:TRANSMITTAL_SPLASH_FORCE_FRESH = "1"
$env:TRANSMITTAL_SPLASH_HOLD_MS     = "2000"
npm run tauri dev
# → always-fresh 11-second splash with 2-second hold on each status phase
```

## Browser-preview URL param overrides

Load `http://localhost:1420/splash.html` in a regular browser (Edge / Chrome)
to preview the splash without launching the full Tauri app.  The following query
params are supported:

| Param | Example | Effect |
|---|---|---|
| `phase` | `?phase=welding` | Jump directly to that phase and stay there forever (no auto-advance). Useful for inspecting the sprocket-spin + hammer-strike loop. Also supports `sparks`, `clank`, `final`, `fade-in`. |
| `loop` | `?loop=1` | Run the full 11-second sequence and restart from FADE_IN instead of ending. |
| `mode` | `?mode=short` or `?mode=full` | Force short or full mode without rebuilding Tauri. |

All params are **ignored** when the page runs inside the Tauri webview, so they
cannot accidentally affect production behaviour.

Active overrides are logged once to the console:

```text
[splash] Preview overrides: phase=welding, loop=1
```

## Constants

| Constant | Value | Purpose |
|---|---|---|
| `MIN_SPLASH_MS` | 11 000 ms | Minimum display time on first launch / after update |
| `MIN_SPLASH_MS_SHORT` | 3 200 ms | Minimum display time on subsequent launches |
| `OFFLINE_EXTRA_MS` | 3 000 ms | Extra hold when the offline-error dialog is about to fire |

---

## Customising the NSIS installer / uninstaller UI

We ship a small NSIS hook file at
[`installer/hooks.nsh`](./installer/hooks.nsh), referenced by
[`tauri.conf.json`](./tauri.conf.json) via
`bundle.windows.nsis.installerHooks`. Tauri's installer template
`!include`s the file very early — before any MUI page macros and before
`Name` / `BrandingText` are emitted — so it can:

- Override any `MUI_TEXT_*` / `MUI_UNTEXT_*` page string (Welcome, Finish,
  INSTFILES headers including the "Installation/Uninstallation complete"
  green-bar page).
- Set top-level NSIS attributes such as `Caption` and `UninstallCaption`
  (the title-bar text).
- Define the optional `NSIS_HOOK_PRE/POSTINSTALL` and `…UNINSTALL`
  macros if you ever need to run extra script at those points.

One caveat: because the hook file is included before Tauri later emits
`!define PRODUCTNAME` and `Name "${PRODUCTNAME}"`, immediate NSIS
commands in the hook must not use `${PRODUCTNAME}` directly. For
title-bar captions, use the runtime `$(^Name)` token instead. Deferred
`!define MUI_*` strings can still safely reference `${PRODUCTNAME}`.

This intentionally avoids forking Tauri's `installer.nsi.tera`, so we
don't have to keep diffs in sync across Tauri upgrades. The trade-off is
that anything requiring custom NSIS dialog controls (hiding the
"Show details" button, recolouring the progress bar, replacing the
dialog chrome) is **not** doable from `hooks.nsh` — those would require
a template fork. See `TROUBLESHOOTING.md §11` for the explicit scope.

The companion BMP / SVG branding lives next to the hook file:
`nsis-header.{svg,bmp}` (150×57) and `nsis-sidebar.{svg,bmp}` (164×314).
Regenerate the BMPs from the SVG masters with `npm run icons:generate`
from the `frontend/` directory. The normal `prebuild` flow also re-renders the
installer BMPs locally from the synced SVGs so stale packaged BMPs do not leak
old branding into the installer.
