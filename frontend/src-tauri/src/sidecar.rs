// SOURCED FROM kc-framework@v1.0.0 — do not edit directly; sync via scripts/sync-framework-tauri.mjs.
// tauri-template/src-tauri-base/src/sidecar.rs
//
// Manages the PyInstaller backend sidecar process.
//
// Protocol:
//   1. Rust picks a free TCP port and passes it via SIDECAR_BACKEND_PORT.
//   2. The sidecar prints the confirmed port on its first stdout line, then
//      starts uvicorn.
//   3. Rust reads that line (with a 15-second timeout) to learn the actual
//      port and returns a base URL string to the caller.
//   4. The caller stores the port/URL in Tauri state and kills the child on
//      app exit.

use std::io::BufRead;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// CREATE_NO_WINDOW — prevents a console window from appearing on Windows.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Find a free TCP port on the loopback interface.
fn find_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
        .unwrap_or(8000)
}

/// Locate the PyInstaller sidecar binary relative to the running executable.
///
/// # Arguments
/// * `sidecar_name` - The binary name **without** the `.exe` extension,
///   e.g. `"transmittal-backend"`. This must match the `name` field in the
///   PyInstaller spec and the sidecar name in `tauri.conf.json`.
///
/// Search order (all relative to the directory containing the app exe):
///   1. `binaries/<sidecar-name>/<sidecar-name>.exe`  ← NSIS layout
///   2. `<sidecar-name>/<sidecar-name>.exe`            ← flat layout
///   3. `<sidecar-name>.exe`                           ← single-file
pub fn find_sidecar_path(sidecar_name: &str) -> Option<PathBuf> {
    let exe_path = std::env::current_exe().ok()?;
    let exe_dir = exe_path.parent()?;
    let exe_name = format!("{}.exe", sidecar_name);

    let candidates = [
        exe_dir.join("binaries").join(sidecar_name).join(&exe_name),
        exe_dir.join(sidecar_name).join(&exe_name),
        exe_dir.join(&exe_name),
    ];

    for p in &candidates {
        if p.is_file() {
            return Some(p.clone());
        }
    }
    None
}

/// Spawn the sidecar, wait for it to report its port, and return the child
/// handle together with the confirmed port number.
pub fn spawn_sidecar(sidecar_path: &PathBuf) -> Result<(Child, u16), String> {
    let port = find_free_port();

    let mut cmd = Command::new(sidecar_path);
    cmd.env("SIDECAR_BACKEND_PORT", port.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar '{}': {e}", sidecar_path.display()))?;

    // Read the confirmed port from the sidecar's first stdout line.
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not capture sidecar stdout".to_string())?;

    let (tx, rx) = mpsc::channel::<u16>();
    thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        if let Some(Ok(line)) = reader.lines().next() {
            if let Ok(p) = line.trim().parse::<u16>() {
                let _ = tx.send(p);
            }
        }
    });

    // Wait up to 15 seconds for the sidecar to report its port.
    let actual_port = rx.recv_timeout(Duration::from_secs(15)).unwrap_or(port);

    println!(
        "[sidecar] Sidecar spawned (PID {}), listening on port {actual_port}",
        child.id()
    );
    Ok((child, actual_port))
}
