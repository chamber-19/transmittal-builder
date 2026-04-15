// Phase 2: Tauri auto-starts the Python backend in dev mode.
//
// On startup the Rust `setup` hook checks whether the backend is already
// listening on 127.0.0.1:8000.  If not it locates the repository's
// `backend/` directory, finds a Python interpreter, and spawns
//   python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
//
// The child process is terminated when the Tauri window closes.
//
// The React frontend polls `/api/health` independently and shows a
// waiting spinner until the backend is reachable — no Rust→JS readiness
// IPC is needed.
//
// Future phases:
//   Phase 3 — bundle the backend as a Tauri sidecar binary.
//   Phase 4 — remote version manifest / forced-update flow.

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const BACKEND_ADDR: &str = "127.0.0.1:8000";

/// Returns `true` when something is already listening on [`BACKEND_ADDR`].
fn is_backend_running() -> bool {
    TcpStream::connect_timeout(
        &BACKEND_ADDR.parse().expect("invalid socket address"),
        Duration::from_millis(300),
    )
    .is_ok()
}

/// Try common Python interpreter names and return the first that works.
fn find_python() -> Option<String> {
    for name in ["python", "python3", "py"] {
        if Command::new(name)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
        {
            return Some(name.to_string());
        }
    }
    None
}

/// Search likely working-directory-relative paths for `backend/app.py`.
///
/// The working directory varies depending on how `tauri dev` is invoked:
///   • `frontend/`           → `../backend`
///   • `frontend/src-tauri/` → `../../backend`
///   • repo root             → `./backend`
fn find_backend_dir() -> Option<PathBuf> {
    for rel in ["../backend", "../../backend", "./backend"] {
        let p = PathBuf::from(rel);
        if p.join("app.py").exists() {
            return p.canonicalize().ok();
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let child: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let child_for_setup = child.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |_app| {
            // ── Skip if the backend is already reachable ────────
            if is_backend_running() {
                println!("[tauri] Backend already running on {BACKEND_ADDR}");
                return Ok(());
            }

            // ── Locate a Python interpreter ────────────────────
            let python = match find_python() {
                Some(p) => p,
                None => {
                    eprintln!(
                        "[tauri] \u{26a0} Python not found (tried python, python3, py).\n\
                         [tauri]   Please start the backend manually:\n\
                         [tauri]     cd backend && uvicorn app:app --port 8000"
                    );
                    return Ok(());
                }
            };

            // ── Locate backend directory ───────────────────────
            let backend_dir = match find_backend_dir() {
                Some(d) => d,
                None => {
                    eprintln!(
                        "[tauri] \u{26a0} Could not find backend/app.py.\n\
                         [tauri]   Please start the backend manually."
                    );
                    return Ok(());
                }
            };

            println!(
                "[tauri] Starting backend: {} -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload",
                python
            );
            println!("[tauri] Backend directory: {}", backend_dir.display());

            match Command::new(&python)
                .args([
                    "-m", "uvicorn", "app:app",
                    "--host", "127.0.0.1",
                    "--port", "8000",
                    "--reload",
                ])
                .current_dir(&backend_dir)
                .spawn()
            {
                Ok(c) => {
                    println!("[tauri] Backend spawned (PID {})", c.id());
                    *child_for_setup.lock().unwrap() = Some(c);
                }
                Err(e) => {
                    eprintln!("[tauri] \u{26a0} Failed to spawn backend: {e}");
                    eprintln!(
                        "[tauri]   Please start the backend manually:\n\
                         [tauri]     cd backend && uvicorn app:app --port 8000"
                    );
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    // ── Cleanup: terminate the backend when the app exits ───
    let mut proc_opt = child.lock().unwrap().take();
    if let Some(ref mut proc) = proc_opt {
        println!("[tauri] Stopping backend (PID {})", proc.id());
        let _ = proc.kill();
        let _ = proc.wait();
    }
}
