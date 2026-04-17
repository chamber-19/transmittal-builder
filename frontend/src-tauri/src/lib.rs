// Tauri app entry point.
//
// Startup sequence (release builds):
//   1. Shared-drive update check (updater::check_for_update).
//      * Offline  -> show error dialog, exit 1.
//      * Update   -> show updater window, copy + launch installer, exit 0.
//      * OK       -> continue.
//   2. Spawn the PyInstaller backend sidecar (sidecar::spawn_sidecar).
//      Falls back to a Python uvicorn process when no sidecar binary is
//      found (dev mode).
//   3. Store the backend base URL in Tauri-managed state so the frontend
//      can query it via the `get_backend_url` command.
//   4. Show the main window.
//
// In debug builds the update check is skipped so local development works
// without a network drive.

mod sidecar;
mod updater;

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

// -- Backend state -------------------------------------------------------

/// Holds the backend base URL; updated once the sidecar starts.
struct BackendState {
    url: Mutex<String>,
}

/// Tauri command: return the backend base URL to the webview.
#[tauri::command]
fn get_backend_url(state: tauri::State<BackendState>) -> String {
    state.url.lock().unwrap().clone()
}

const BACKEND_ADDR: &str = "127.0.0.1:8000";

/// Returns `true` when something is already listening on [`BACKEND_ADDR`].
fn is_backend_running() -> bool {
    std::net::TcpStream::connect_timeout(
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

/// Locate the repository's `backend/` directory containing `app.py`.
fn find_backend_dir() -> Option<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let anchored = manifest_dir.join("..").join("..").join("backend");
    if anchored.join("app.py").is_file() {
        if let Ok(abs) = anchored.canonicalize() {
            return Some(abs);
        }
    }

    for rel in ["../backend", "../../backend", "./backend"] {
        let p = PathBuf::from(rel);
        if p.join("app.py").is_file() {
            if let Ok(abs) = p.canonicalize() {
                return Some(abs);
            }
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![get_backend_url])
        .manage(BackendState {
            url: Mutex::new(String::from("http://127.0.0.1:8000")),
        })
        .setup(move |app| {
            // 1. Update check (release builds only).
            #[cfg(not(debug_assertions))]
            {
                run_update_check(app)?;
            }

            // 2. Spawn backend.
            let backend_url = do_spawn_backend(&child_for_setup);
            println!("[tauri] Backend URL: {backend_url}");

            // 3. Store URL in managed state.
            if let Some(state) = app.try_state::<BackendState>() {
                *state.url.lock().unwrap() = backend_url;
            }

            // 4. Show the main window.
            if let Some(main_win) = app.get_webview_window("main") {
                let _ = main_win.show();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    // Cleanup: terminate the backend process when the app exits.
    let mut proc_opt = child.lock().unwrap().take();
    if let Some(ref mut proc) = proc_opt {
        println!("[tauri] Stopping backend (PID {})", proc.id());
        let _ = proc.kill();
        let _ = proc.wait();
    }
}

// -- Update-check helper -------------------------------------------------

fn run_update_check(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    match updater::check_for_update() {
        updater::UpdateCheckResult::Offline { path } => {
            app.dialog()
                .message(format!(
                    "Cannot reach R3P shared drive at `{}`.\n\
                     Connect to the network (Drive for Desktop must be \
                     running) and try again.",
                    path.display()
                ))
                .title("Connection Required")
                .kind(MessageDialogKind::Error)
                .blocking_show();
            std::process::exit(1);
        }

        updater::UpdateCheckResult::UpdateAvailable { latest, update_path } => {
            if let Some(updater_win) = app.get_webview_window("updater") {
                let _ = updater_win.emit(
                    "update_info",
                    serde_json::json!({
                        "version": latest.version,
                        "notes":   latest.notes,
                    }),
                );
                let _ = updater_win.show();
            }

            let app_handle = app.handle().clone();
            let installer_name = latest.installer.clone();
            thread::spawn(move || {
                match updater::copy_installer_with_progress(
                    &update_path,
                    &installer_name,
                    &app_handle,
                ) {
                    Ok(dest_path) => {
                        println!("[updater] Launching installer: {}", dest_path.display());
                        let mut cmd = Command::new(&dest_path);
                        cmd.args(["/PASSIVE", "/NORESTART"]);
                        #[cfg(windows)]
                        {
                            use std::os::windows::process::CommandExt;
                            cmd.creation_flags(0x0000_0008); // DETACHED_PROCESS
                        }
                        match cmd.spawn() {
                            Ok(_) => {
                                println!("[updater] Installer launched -- exiting");
                                app_handle.exit(0);
                            }
                            Err(e) => {
                                eprintln!("[updater] Failed to launch installer: {e}");
                                app_handle.exit(1);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[updater] Copy failed: {e}");
                        app_handle.exit(1);
                    }
                }
            });

            // Return OK -- event loop keeps running. Main window stays hidden.
            return Ok(());
        }

        updater::UpdateCheckResult::UpToDate => {}
    }
    Ok(())
}

// -- Backend spawning ----------------------------------------------------

fn do_spawn_backend(child_arc: &Arc<Mutex<Option<Child>>>) -> String {
    // Production: try the PyInstaller sidecar first.
    if let Some(sidecar_path) = sidecar::find_sidecar_path() {
        println!("[sidecar] Found sidecar at: {}", sidecar_path.display());
        match sidecar::spawn_sidecar(&sidecar_path) {
            Ok((proc, port)) => {
                *child_arc.lock().unwrap() = Some(proc);
                return format!("http://127.0.0.1:{port}");
            }
            Err(e) => {
                eprintln!("[sidecar] {e} -- falling back to Python dev server");
            }
        }
    }

    // Dev fallback: Python uvicorn on the fixed port 8000.
    spawn_python_backend(child_arc);
    String::from("http://127.0.0.1:8000")
}

// -- Python dev-server helpers -------------------------------------------

fn spawn_python_backend(child_arc: &Arc<Mutex<Option<Child>>>) {
    if is_backend_running() {
        println!("[tauri] Backend already running on {BACKEND_ADDR}");
        return;
    }

    let python = match find_python() {
        Some(p) => p,
        None => {
            eprintln!(
                "[tauri] Python not found. \
                 Start the backend manually: cd backend && python -m uvicorn app:app --port 8000"
            );
            return;
        }
    };

    let backend_dir = match find_backend_dir() {
        Some(d) => d,
        None => {
            eprintln!("[tauri] Could not find backend/app.py. Start the backend manually.");
            return;
        }
    };

    println!("[tauri] Starting Python backend on port 8000");

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
            println!("[tauri] Python backend spawned (PID {pid})");
            *child_arc.lock().unwrap() = Some(c);

            let check = child_arc.clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_secs(2));
                if let Ok(mut guard) = check.lock() {
                    if let Some(ref mut proc) = *guard {
                        if let Ok(Some(status)) = proc.try_wait() {
                            eprintln!(
                                "[tauri] Backend (PID {pid}) exited early: {status}. \
                                 Run: cd backend && pip install -r requirements.txt"
                            );
                        }
                    }
                }
            });
        }
        Err(e) => {
            eprintln!("[tauri] Failed to spawn Python backend: {e}");
        }
    }
}
