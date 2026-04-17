// Tauri app entry point.
//
// Startup sequence:
//   1. Splash window opens automatically (visible: true in tauri.conf.json).
//   2. Background thread runs the setup sequence while emitting
//      `splash://status` events that drive the splash terminal animation:
//        a. Spawn the PyInstaller sidecar (or Python dev-server fallback).
//        b. Check shared-drive reachability  → "Mounting shared drive".
//        c. Run the version check            → "Checking for updates".
//   3. The thread waits until at least 9.5 s have elapsed (or the user
//      clicks to skip) so the full animation plays before the transition.
//   4. The splash closes and either the main window or the updater window
//      is shown, depending on the update check result.
//
// In debug builds the update / shared-drive check is skipped so local
// development works without a network drive.

mod sidecar;
mod splash;
mod updater;

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

// ── Backend state ─────────────────────────────────────────────────────────

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

// ── Update outcome (internal) ─────────────────────────────────────────────

enum UpdateOutcome {
    UpToDate,
    UpdateAvailable {
        latest: updater::LatestJson,
        update_path: PathBuf,
    },
    Offline {
        path: PathBuf,
    },
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let child: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let child_for_setup = child.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_backend_url,
            splash::request_skip_splash,
        ])
        .manage(BackendState {
            url: Mutex::new(String::from("http://127.0.0.1:8000")),
        })
        .manage(splash::SplashState::new())
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let child_arc = child_for_setup.clone();

            // Run the startup sequence in a background thread so the splash
            // window remains responsive (event loop keeps running).
            thread::spawn(move || {
                startup_sequence(app_handle, child_arc);
            });

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

// ── Startup sequence ──────────────────────────────────────────────────────

/// Minimum time (ms) the splash must stay visible so the full animation
/// plays through to the fade-out phase.
const MIN_SPLASH_MS: u64 = 9_500;

/// Extra hold (ms) for the offline error state before the dialog fires.
const OFFLINE_EXTRA_MS: u64 = 3_000;

fn startup_sequence(app: tauri::AppHandle, child_arc: Arc<Mutex<Option<Child>>>) {
    let start = Instant::now();

    // Brief pause to let the splash window finish its initial render.
    thread::sleep(Duration::from_millis(200));

    // ── 1. Backend ────────────────────────────────────────────────────────
    splash::emit_status(
        &app,
        "Starting backend service",
        splash::StatusKind::Pending,
    );
    let backend_url = do_spawn_backend(&child_arc);
    println!("[tauri] Backend URL: {backend_url}");
    splash::emit_status(&app, "Starting backend service", splash::StatusKind::Ok);

    // Store backend URL in managed state.
    if let Some(state) = app.try_state::<BackendState>() {
        *state.url.lock().unwrap() = backend_url;
    }

    // ── 2. Update check ───────────────────────────────────────────────────
    let outcome: UpdateOutcome;

    #[cfg(not(debug_assertions))]
    {
        outcome = run_update_check_with_status(&app);
    }
    #[cfg(debug_assertions)]
    {
        // Dev mode: skip the actual network check; emit fake Ok statuses.
        splash::emit_status(&app, "Mounting shared drive", splash::StatusKind::Ok);
        splash::emit_status(&app, "Checking for updates", splash::StatusKind::Ok);
        outcome = UpdateOutcome::UpToDate;
    }

    // ── 3. Final status line ──────────────────────────────────────────────
    let extra_hold_ms: u64 = match &outcome {
        UpdateOutcome::Offline { .. } => {
            splash::emit_status(
                &app,
                "Cannot reach R3P shared drive",
                splash::StatusKind::Error,
            );
            OFFLINE_EXTRA_MS
        }
        UpdateOutcome::UpdateAvailable { .. } => {
            splash::emit_status(
                &app,
                "Update detected, loading updater\u{2026}",
                splash::StatusKind::Warn,
            );
            0
        }
        UpdateOutcome::UpToDate => {
            splash::emit_status(&app, "Ready", splash::StatusKind::Ok);
            0
        }
    };

    // ── 4. Minimum display duration ───────────────────────────────────────
    // Wait until MIN_SPLASH_MS from startup (unless the user skipped).
    let target_ms = MIN_SPLASH_MS + extra_hold_ms;
    let elapsed = start.elapsed().as_millis() as u64;

    if elapsed < target_ms {
        let remaining = target_ms - elapsed;
        let skip_state = app.try_state::<splash::SplashState>();
        let mut waited = 0u64;
        while waited < remaining {
            thread::sleep(Duration::from_millis(100));
            waited += 100;
            if let Some(ref s) = skip_state {
                if s.is_skip_requested() {
                    println!("[splash] Minimum wait interrupted by skip request");
                    break;
                }
            }
        }
    }

    // ── 5. Transition ─────────────────────────────────────────────────────
    match outcome {
        UpdateOutcome::Offline { path } => {
            splash::close_splash(&app);
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
            app.exit(1);
        }

        UpdateOutcome::UpdateAvailable {
            latest,
            update_path,
        } => {
            // Show the updater progress window.
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

            splash::close_splash(&app);

            // Copy installer then launch it.
            match updater::copy_installer_with_progress(&update_path, &latest.installer, &app) {
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
                            app.exit(0);
                        }
                        Err(e) => {
                            eprintln!("[updater] Failed to launch installer: {e}");
                            app.exit(1);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[updater] Copy failed: {e}");
                    app.exit(1);
                }
            }
        }

        UpdateOutcome::UpToDate => {
            // Show the main window, then close the splash.
            if let Some(main_win) = app.get_webview_window("main") {
                let _ = main_win.show();
            }
            splash::close_splash(&app);
        }
    }
}

// ── Update check with status emission ─────────────────────────────────────

#[cfg(not(debug_assertions))]
fn run_update_check_with_status(app: &tauri::AppHandle) -> UpdateOutcome {
    // Step A: check drive reachability.
    splash::emit_status(app, "Mounting shared drive", splash::StatusKind::Pending);
    let update_path = updater::get_update_path();
    if !update_path.exists() {
        splash::emit_status(app, "Mounting shared drive", splash::StatusKind::Error);
        return UpdateOutcome::Offline { path: update_path };
    }
    splash::emit_status(app, "Mounting shared drive", splash::StatusKind::Ok);

    // Step B: version comparison.
    splash::emit_status(app, "Checking for updates", splash::StatusKind::Pending);
    match updater::check_for_update() {
        updater::UpdateCheckResult::Offline { path } => {
            splash::emit_status(app, "Checking for updates", splash::StatusKind::Error);
            UpdateOutcome::Offline { path }
        }
        updater::UpdateCheckResult::UpdateAvailable {
            latest,
            update_path,
        } => {
            splash::emit_status(app, "Checking for updates", splash::StatusKind::Warn);
            UpdateOutcome::UpdateAvailable {
                latest,
                update_path,
            }
        }
        updater::UpdateCheckResult::UpToDate => {
            splash::emit_status(app, "Checking for updates", splash::StatusKind::Ok);
            UpdateOutcome::UpToDate
        }
    }
}

// ── Backend spawning ──────────────────────────────────────────────────────

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

// ── Python dev-server helpers ─────────────────────────────────────────────

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
            "-m",
            "uvicorn",
            "app:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
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
