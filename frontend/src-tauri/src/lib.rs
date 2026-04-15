// Phase 2: Tauri auto-starts the Python backend in dev mode.
//
// On startup the Rust `setup` hook checks whether the backend is already
// listening on 127.0.0.1:8000.  If not it locates the repository's
// `backend/` directory, finds a Python interpreter, and spawns
//   python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
//
// Python discovery prefers the Miniconda runtime:
//   1. $CONDA_PREFIX/python (active conda env)
//   2. Common Miniconda install paths (~/<miniconda3|anaconda3>/python)
//   3. `python` on PATH as a final fallback
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
use std::thread;
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

/// Return a working Python executable path, preferring Miniconda.
///
/// Search order:
/// 1. **`CONDA_PREFIX`** — set when a conda environment is activated.
/// 2. **Well-known Miniconda / Anaconda install directories** under the
///    user's home folder.
/// 3. **`python` on `PATH`** — final fallback.
///
/// Each candidate is validated by running `<python> --version`.
fn find_python() -> Option<String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // 1. Active conda environment ($CONDA_PREFIX).
    if let Ok(prefix) = std::env::var("CONDA_PREFIX") {
        let prefix = PathBuf::from(prefix);
        if cfg!(windows) {
            candidates.push(prefix.join("python.exe"));
        } else {
            candidates.push(prefix.join("bin").join("python"));
        }
    }

    // 2. Well-known Miniconda / Anaconda install directories.
    if let Some(home) = home_dir() {
        let dir_names = ["miniconda3", "Miniconda3", "anaconda3", "Anaconda3"];
        for dir in &dir_names {
            if cfg!(windows) {
                candidates.push(home.join(dir).join("python.exe"));
            } else {
                candidates.push(home.join(dir).join("bin").join("python"));
            }
        }
    }

    // Try each candidate path and log what we're doing.
    for path in &candidates {
        println!("[tauri] Checking conda Python: {}", path.display());
        if path.is_file() {
            if Command::new(path)
                .arg("--version")
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
            {
                println!("[tauri] Found conda Python: {}", path.display());
                return Some(path.to_string_lossy().into_owned());
            }
        }
    }

    // 3. Fallback: `python` on PATH.
    println!("[tauri] No conda Python found; falling back to `python` on PATH");
    if Command::new("python")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
    {
        println!("[tauri] Found PATH Python: python");
        return Some("python".to_string());
    }

    None
}

/// Cross-platform helper to obtain the user's home directory.
fn home_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var("USERPROFILE").ok().map(PathBuf::from)
    }
    #[cfg(not(windows))]
    {
        std::env::var("HOME").ok().map(PathBuf::from)
    }
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
                        "[tauri] \u{26a0} Python not found.\n\
                         [tauri]   Tried: $CONDA_PREFIX, ~/miniconda3, ~/anaconda3, `python` on PATH.\n\
                         [tauri]   Please activate your Miniconda environment and retry, or start the backend manually:\n\
                         [tauri]     cd backend && python -m uvicorn app:app --port 8000"
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
            println!("[tauri] Working directory: {}", backend_dir.display());

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
                    let pid = c.id();
                    println!("[tauri] Backend spawned (PID {pid})");
                    *child_for_setup.lock().unwrap() = Some(c);

                    // ── Early-exit detection ──────────────────────
                    // Wait briefly then check whether the process died
                    // immediately (e.g. missing module, bad path).
                    let child_check = child_for_setup.clone();
                    thread::spawn(move || {
                        thread::sleep(Duration::from_secs(2));
                        if let Ok(mut guard) = child_check.lock() {
                            if let Some(ref mut proc) = *guard {
                                match proc.try_wait() {
                                    Ok(Some(status)) => {
                                        eprintln!(
                                            "[tauri] \u{26a0} Backend process (PID {pid}) exited early with {status}.\n\
                                             [tauri]   Check that uvicorn and all backend dependencies are installed:\n\
                                             [tauri]     cd backend && pip install -r requirements.txt"
                                        );
                                    }
                                    Ok(None) => {
                                        // Still running — good, nothing to report.
                                    }
                                    Err(e) => {
                                        eprintln!("[tauri] \u{26a0} Could not check backend status: {e}");
                                    }
                                }
                            }
                        }
                    });
                }
                Err(e) => {
                    eprintln!(
                        "[tauri] \u{26a0} Failed to spawn backend: {e}\n\
                         [tauri]   Command: {python} -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload\n\
                         [tauri]   Working directory: {}\n\
                         [tauri]   Please start the backend manually:\n\
                         [tauri]     cd backend && python -m uvicorn app:app --port 8000",
                        backend_dir.display()
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
