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

```
[splash] Debug hold mode active: 2000 ms per phase
```

Each phase then shows its spinner for ~2 s, then its checkmark for ~2 s, before
moving to the next step — total splash runtime ~16 s visible instead of ~200 ms.

**This is safe to leave in production binaries.** When the environment variable is
unset (the default for all real users), `hold_ms` is 0 and all `if hold_ms > 0`
guards are never entered, so there is zero runtime cost.

## Constants

| Constant | Value | Purpose |
|---|---|---|
| `MIN_SPLASH_MS` | 11 000 ms | Minimum display time on first launch / after update |
| `MIN_SPLASH_MS_SHORT` | 3 200 ms | Minimum display time on subsequent launches |
| `OFFLINE_EXTRA_MS` | 3 000 ms | Extra hold when the offline-error dialog is about to fire |
