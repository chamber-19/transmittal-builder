// Tauri app entry point.
//
// Startup sequence:
//   1. Splash window opens with visible:false; React invokes `splash_ready`
//      after the first CSS paint so the user never sees a transparent ghost.
//   2. Background thread runs the setup sequence while emitting
//      `splash://status` events that drive the splash terminal animation:
//        a. Spawn the PyInstaller sidecar (or Python dev-server fallback).
//        b. Emit "Mounting shared drive" → Ok  (informational only).
//        c. Emit "Checking for updates" → Ok  (deferred to React on mount).
//   3. The thread waits until at least 11 s have elapsed so the full
//      animation plays before the transition.
//   4. The splash closes and the main window opens. The React app then
//      invokes `check_for_update` on mount and shows the UpdateModal if
//      a newer version is found on the shared drive.

mod sidecar;

use desktop_toolkit::{splash, updater};
use desktop_toolkit::updater::UpdateState;

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager};

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

/// Tauri command: list the immediate subdirectory names inside `path`.
///
/// Returns an empty list if the path does not exist or cannot be read.
/// Used by the frontend to detect when a user points the projects root at a
/// single project folder instead of the parent that contains all projects.
#[tauri::command]
fn peek_subfolders(path: String) -> Vec<String> {
    match std::fs::read_dir(&path) {
        Err(_) => vec![],
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .filter_map(|e| e.file_name().into_string().ok())
            .collect(),
    }
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

// ── TB updater constants ──────────────────────────────────────────────────

/// Directory on the shared drive that contains `latest.json` and the installer.
/// Consumers can override this by setting the `TOOL_UPDATE_PATH` environment
/// variable before launching the app.
const TB_UPDATE_PATH_DEFAULT: &str =
    r"G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder";

/// Sub-directory of `%LOCALAPPDATA%` used for the updater log.
const TB_LOG_DIR: &str = "Transmittal Builder";

/// App data directory name used for the splash-seen sentinel
/// (`%APPDATA%\<id>\splash-seen.json`).
const TB_APP_IDENTIFIER: &str = "Transmittal Builder";

/// PyInstaller sidecar binary name (without `.exe`).
const TB_SIDECAR_NAME: &str = "transmittal-backend";

// ── Tauri commands: update check / start ──────────────────────────────────

/// Returned by the `check_for_update` Tauri command.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckUpdateResult {
    update_available: bool,
    version: Option<String>,
    notes: Option<String>,
}

/// Check whether a newer version is available on the shared drive.
///
/// Reads the shared-drive path from the `TOOL_UPDATE_PATH` environment
/// variable (defaults to the G:\ share if not set).  All failures degrade
/// silently — returns `{ updateAvailable: false }` so the user can still use
/// the app when the drive is unreachable.
///
/// On success the pending update is stored in `UpdateState` so `start_update`
/// can retrieve it without the frontend having to pass the installer path.
#[tauri::command]
fn check_for_update(state: tauri::State<UpdateState>) -> CheckUpdateResult {
    match updater::check_for_update(env!("CARGO_PKG_VERSION"), TB_LOG_DIR) {
        updater::UpdateCheckResult::UpdateAvailable { latest, update_path } => {
            *state.latest.lock().unwrap() = Some(latest.clone());
            *state.update_path.lock().unwrap() = Some(update_path);
            CheckUpdateResult {
                update_available: true,
                version: Some(latest.version),
                notes: latest.notes,
            }
        }
        _ => CheckUpdateResult {
            update_available: false,
            version: None,
            notes: None,
        },
    }
}

/// Delegate the update orchestration to the `desktop-toolkit-updater.exe` shim.
///
/// desktop-toolkit architecture: the shim process survives the parent app's exit, so
/// NSIS can overwrite the main exe without a file-lock.  The sequence is:
///   1. Copy the installer from the shared drive to `%TEMP%` (emits
///      `update_progress` events so the frontend can show a progress bar).
///   2. Spawn `desktop-toolkit-updater.exe` as a fully-detached process.
///   3. Call `app.exit(0)` — releases all file handles so NSIS can replace them.
///
/// The shim then kills the sidecar, waits for the installer, and relaunches
/// the new app version.
#[tauri::command]
fn start_update(
    app: tauri::AppHandle,
    state: tauri::State<UpdateState>,
) -> Result<(), String> {
    updater::start_update(app, state, TB_SIDECAR_NAME, TB_LOG_DIR)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let child: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let child_for_setup = child.clone();

    // Set the default shared-drive update path for the framework's updater module.
    // SAFETY: `std::env::set_var` is unsafe in multi-threaded programs (Rust 1.81+).
    // This call is safe here because `run()` is called from `main()` before the
    // Tauri builder creates any threads.  `tauri::Builder::default()` and its
    // `.run()` call are what spawn the internal Tauri thread pool, so the
    // environment is single-threaded at this point.
    //
    // Consumers can bypass this default by setting TOOL_UPDATE_PATH in the
    // process environment before launching the app (e.g. via a .env file or a
    // system environment variable).
    if std::env::var(updater::UPDATE_PATH_ENV_VAR).is_err() {
        #[allow(unsafe_code)]
        // SAFETY: single-threaded at this point — see above.
        unsafe {
            std::env::set_var(updater::UPDATE_PATH_ENV_VAR, TB_UPDATE_PATH_DEFAULT);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_backend_url,
            peek_subfolders,
            check_for_update,
            start_update,
            splash::splash_is_first_run,
            splash::splash_ready,
            splash::splash_fade_complete,
        ])
        .manage(BackendState {
            url: Mutex::new(String::from("http://127.0.0.1:8000")),
        })
        .manage(UpdateState::new())
        .manage(splash::SplashState::new(splash::first_launch_after_update(
            TB_APP_IDENTIFIER,
            env!("CARGO_PKG_VERSION"),
        )))
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
const MIN_SPLASH_MS: u64 = 13_000;

/// Reduced minimum (ms) for subsequent launches with the same version.
/// Chosen so the user sees at most one hammer-strike cycle before the
/// window closes (the CSS `animation-iteration-count: 1` in `.splash-root.short-mode`
/// limits the hammer loop to a single swing on the frontend side).
/// NOTE: if the frontend `hammer-strike` keyframe duration (currently 1.6 s in
/// splash.css) changes, this constant should be updated to remain in sync.
const MIN_SPLASH_MS_SHORT: u64 = 3_200;

fn startup_sequence(app: tauri::AppHandle, child_arc: Arc<Mutex<Option<Child>>>) {
    let start = Instant::now();

    // Read optional debug hold (dev only; no-op in production when unset).
    let hold_ms: u64 = match std::env::var("TRANSMITTAL_SPLASH_HOLD_MS") {
        Ok(val) => match val.parse::<u64>() {
            Ok(ms) => ms,
            Err(_) => {
                eprintln!(
                    "[splash] TRANSMITTAL_SPLASH_HOLD_MS is set to {:?} but is not a valid u64; defaulting to 0",
                    val
                );
                0
            }
        },
        Err(_) => 0,
    };
    if hold_ms > 0 {
        println!("[splash] Debug hold mode active: {} ms per phase", hold_ms);
    }

    // Brief pause to let the splash window finish its initial render.
    thread::sleep(Duration::from_millis(200));

    // ── 1. Backend ────────────────────────────────────────────────────────
    splash::emit_status(
        &app,
        "backend",
        "Starting backend service",
        splash::StatusKind::Pending,
    );
    if hold_ms > 0 { thread::sleep(Duration::from_millis(hold_ms)); }
    let backend_url = do_spawn_backend(&child_arc);
    println!("[tauri] Backend URL: {backend_url}");
    splash::emit_status(&app, "backend", "Starting backend service", splash::StatusKind::Ok);
    if hold_ms > 0 { thread::sleep(Duration::from_millis(hold_ms)); }

    // Store backend URL in managed state.
    if let Some(state) = app.try_state::<BackendState>() {
        *state.url.lock().unwrap() = backend_url;
    }

    // ── 2. Shared drive (informational; actual check deferred to React) ───
    // The update check now runs client-side via `invoke('check_for_update')`
    // after the main window opens.  Errors degrade silently — no forced exit.
    splash::emit_status(&app, "mount", "Mounting shared drive", splash::StatusKind::Pending);
    if hold_ms > 0 { thread::sleep(Duration::from_millis(hold_ms)); }
    splash::emit_status(&app, "mount", "Mounting shared drive", splash::StatusKind::Ok);
    if hold_ms > 0 { thread::sleep(Duration::from_millis(hold_ms)); }

    // ── 3. Update check status (deferred; emit Ok immediately) ───────────
    splash::emit_status(&app, "updates", "Checking for updates", splash::StatusKind::Pending);
    if hold_ms > 0 { thread::sleep(Duration::from_millis(hold_ms)); }
    splash::emit_status(&app, "updates", "Checking for updates", splash::StatusKind::Ok);
    if hold_ms > 0 { thread::sleep(Duration::from_millis(hold_ms)); }

    // ── 4. Final status ────────────────────────────────────────────────────
    splash::emit_status(&app, "final", "Ready", splash::StatusKind::Ok);
    // Small pause so the UI has a guaranteed beat to render "Ready".
    thread::sleep(Duration::from_millis(200));

    // ── 5. Minimum display duration ────────────────────────────────────────
    let is_first = app
        .try_state::<splash::SplashState>()
        .map(|s| s.first_run())
        .unwrap_or(true);
    let min_ms = if is_first { MIN_SPLASH_MS } else { MIN_SPLASH_MS_SHORT };
    let elapsed = start.elapsed().as_millis() as u64;
    if elapsed < min_ms {
        thread::sleep(Duration::from_millis(min_ms - elapsed));
    }

    // ── 6. Transition to main window ──────────────────────────────────────
    //
    // Emit `splash://fade-now` so the splash JS holds the success state for
    // FADE_HOLD_MS, then cross-fades the whole `.splash-root` to opacity 0
    // over FADE_DURATION_MS.  The splash invokes `splash_fade_complete` from
    // `transitionend`, which shows the main window and closes the splash
    // atomically — no "brown background gap" between the two.
    //
    // Safety net: if the frontend never invokes `splash_fade_complete` (e.g.
    // JS error, window minimized mid-fade), we sleep for the expected
    // hold + fade duration and then perform the same show/close from Rust.
    // Both paths are idempotent.
    //
    // The constants below must stay in sync with the matching
    // FADE_HOLD_MS / FADE_DURATION_MS in frontend/src/splash.jsx.
    const FADE_HOLD_MS:     u64 = 800;
    const FADE_DURATION_MS: u64 = 1000;
    const FADE_SAFETY_MS:   u64 = 400;

    if let Err(e) = app.emit("splash://fade-now", ()) {
        eprintln!("[splash] emit splash://fade-now failed: {e}");
    }

    thread::sleep(Duration::from_millis(
        FADE_HOLD_MS + FADE_DURATION_MS + FADE_SAFETY_MS,
    ));

    // Safety net: idempotent if the frontend already invoked
    // splash_fade_complete from `transitionend`.
    let app_for_ui = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(main_win) = app_for_ui.get_webview_window("main") {
            let _ = main_win.show();
        }
        splash::close_splash(&app_for_ui);
    });
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
