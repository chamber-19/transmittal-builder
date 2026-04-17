// frontend/src-tauri/src/splash.rs
//
// Splash screen integration.
//
// Provides:
//   - `emit_status`                    — emit a terminal status line to the splash window.
//   - `close_splash`                   — close the splash window (no-op if already closed).
//   - `SplashState`                    — managed Tauri state holding the skip flag and
//                                        first-run flag.
//   - `request_skip_splash`            — Tauri command called by the splash frontend
//     when the user clicks or presses Esc/Space to skip.
//   - `splash_is_first_run`            — Tauri command: returns true when this launch
//     follows an update or is the very first launch (drives full vs. short animation).
//   - `splash_ready`                   — Tauri command: called by the frontend after the
//     first CSS paint to show the window (avoids transparent-ghost pre-flash).
//   - `splash_first_launch_after_update` — internal helper: reads/writes the
//     splash-seen.json sentinel and returns true when the stored version differs
//     from the current binary version (i.e. a fresh install or just-updated launch).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

// ── Status event types ────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum StatusKind {
    Pending,
    Ok,
    Warn,
    Error,
}

#[derive(Serialize, Clone, Debug)]
pub struct StatusPayload {
    pub phase: String,
    pub message: String,
    pub kind: StatusKind,
}

// ── Managed state ─────────────────────────────────────────────────────────

/// Shared state held in Tauri's managed-state map.
pub struct SplashState {
    pub skip_requested: Arc<AtomicBool>,
    pub is_first_run:   Arc<AtomicBool>,
}

impl SplashState {
    pub fn new(is_first_run: bool) -> Self {
        Self {
            skip_requested: Arc::new(AtomicBool::new(false)),
            is_first_run:   Arc::new(AtomicBool::new(is_first_run)),
        }
    }

    pub fn skip(&self) {
        self.skip_requested.store(true, Ordering::SeqCst);
    }

    pub fn is_skip_requested(&self) -> bool {
        self.skip_requested.load(Ordering::SeqCst)
    }

    pub fn first_run(&self) -> bool {
        self.is_first_run.load(Ordering::SeqCst)
    }
}

// ── Sentinel JSON schema ──────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
struct SplashSeen {
    last_seen_version: String,
}

// ── First-launch-after-update logic ──────────────────────────────────────

/// Returns `true` if this is the first launch after an install or update.
///
/// Reads `%APPDATA%\com.r3p.transmittal\splash-seen.json` (created on first
/// run) and compares the stored version against `CARGO_PKG_VERSION`.
/// If they differ (or the file is absent) it writes the current version back
/// and returns `true` so the full 9.5 s animation plays.
/// On subsequent launches with the same version it returns `false`, triggering
/// the short (~3.2 s) mode.
pub fn splash_first_launch_after_update() -> bool {
    let current = env!("CARGO_PKG_VERSION");

    // Resolve %APPDATA%\com.r3p.transmittal\ on Windows,
    // $HOME/.local/share/com.r3p.transmittal/ on Linux/macOS.
    // If the base directory variable is absent, return `true` (full-mode fallback)
    // so the sentinel is not written to an invalid relative path.
    let base_opt = {
        #[cfg(windows)]
        let v = std::env::var("APPDATA").ok();
        #[cfg(not(windows))]
        let v = std::env::var("HOME")
            .ok()
            .map(|h| format!("{h}/.local/share"));
        v
    };

    let base = match base_opt {
        Some(b) if !b.is_empty() => b,
        _ => {
            // Cannot locate the config directory — treat as first run.
            return true;
        }
    };

    let sentinel_path = std::path::PathBuf::from(base)
        .join("com.r3p.transmittal")
        .join("splash-seen.json");

    // Try to read the sentinel; treat read errors as "first run".
    let last_seen = sentinel_path
        .exists()
        .then(|| std::fs::read_to_string(&sentinel_path).ok())
        .flatten()
        .and_then(|s| serde_json::from_str::<SplashSeen>(&s).ok())
        .map(|ss| ss.last_seen_version);

    let is_new = last_seen.as_deref() != Some(current);

    if is_new {
        // Write current version back so next run is short mode.
        if let Some(parent) = sentinel_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let sentinel = SplashSeen {
            last_seen_version: current.to_string(),
        };
        if let Ok(json) = serde_json::to_string(&sentinel) {
            let _ = std::fs::write(&sentinel_path, json);
        }
    }

    is_new
}

// ── Tauri commands ────────────────────────────────────────────────────────

/// Called by the splash frontend when the user requests an early exit.
///
/// This sets the skip flag so the background startup thread can omit the
/// minimum-duration wait and proceed directly to showing the next window.
#[tauri::command]
pub fn request_skip_splash(state: tauri::State<SplashState>) {
    println!("[splash] Skip requested by user");
    state.skip();
}

/// Returns `true` when the current launch is the first launch after an install
/// or update (i.e. the full ~9.5 s animation should play).
/// Returns `false` on repeat launches with the same version (short ~3.2 s mode).
#[tauri::command]
pub fn splash_is_first_run(state: tauri::State<SplashState>) -> bool {
    state.first_run()
}

/// Called by the splash frontend once the first CSS paint has completed.
///
/// The splash window is created with `visible: false` (tauri.conf.json) to
/// avoid a transparent-ghost flash before React mounts.  After the first
/// animation frame this command is invoked to show the window, ensuring the
/// viewer only ever sees a fully-painted background.
#[tauri::command]
pub fn splash_ready(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("splash") {
        let _ = win.show();
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────

/// Emit a `splash://status` event to all windows (including the splash).
pub fn emit_status(app: &AppHandle, phase: &str, message: &str, kind: StatusKind) {
    let payload = StatusPayload {
        phase: phase.to_string(),
        message: message.to_string(),
        kind,
    };
    if let Err(e) = app.emit("splash://status", payload) {
        eprintln!("[splash] emit_status failed: {e}");
    }
}

/// Close the splash window. Silently ignores errors (e.g. already closed).
pub fn close_splash(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("splash") {
        if let Err(e) = win.close() {
            eprintln!("[splash] close_splash failed: {e}");
        }
    }
}
