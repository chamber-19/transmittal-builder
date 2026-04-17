# Backend Sidecar — Build Guide

The Transmittal Builder backend is bundled as a standalone Windows executable
using [PyInstaller](https://pyinstaller.org/). The Tauri Rust shell launches
it silently on startup and kills it on exit.

## Prerequisites

| Tool | Version |
|---|---|
| Python | 3.11 (match the CI environment) |
| pip | latest |
| PyInstaller | ≥ 6.0 |

All Python backend dependencies must be installed first.

## Building locally

Run these commands from the **repository root**:

```powershell
# 1. Install dependencies + PyInstaller
cd backend
pip install -r requirements.txt
pip install pyinstaller

# 2. Run the spec (must be run from backend/)
pyinstaller transmittal_backend.spec

# 3. Copy the one-dir output to the Tauri resource folder
robocopy dist\transmittal-backend ..\frontend\src-tauri\binaries\transmittal-backend /E /NFL /NDL
```

After this step, `frontend/src-tauri/binaries/transmittal-backend/` will
contain `transmittal-backend.exe` and its `_internal/` folder.

## How the sidecar works at runtime

1. The Rust `setup` hook in `lib.rs` detects the `transmittal-backend.exe`
   next to the installed application binary.
2. It picks a free TCP port and sets `TRANSMITTAL_BACKEND_PORT=<port>` in
   the sidecar's environment.
3. It spawns the sidecar with `CREATE_NO_WINDOW` (no visible terminal).
4. The sidecar's `__main__` block reads the env var, prints the port on its
   first stdout line, then starts uvicorn.
5. Rust reads that first line to confirm the port and stores it in Tauri
   state, exposed as the `get_backend_url` command.
6. On app exit, Rust kills the sidecar process.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `TRANSMITTAL_BACKEND_PORT` | `0` (OS-assigned) | Port for uvicorn to listen on. Set by Rust. |

## Notes

- Use **`console=True`** in the PyInstaller spec (not `--noconsole`).
  The Rust side uses `CREATE_NO_WINDOW` to hide the terminal window.
  A windowed (`console=False`) executable cannot write to stdout, which
  would break the port-handshake protocol.
- The one-dir build (`COLLECT`) is preferred over `--onefile` because it
  avoids the extraction delay on each launch.
- Do **not** commit the `dist/` or `build/` folders. CI builds the sidecar
  fresh on every tagged release.
