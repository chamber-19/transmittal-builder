// frontend/src-tauri/src/splash.rs
//
// Splash screen integration.
//
// Provides:
//   - `emit_status`   — emit a terminal status line to the splash window.
//   - `close_splash`  — close the splash window (no-op if already closed).
//   - `SplashState`   — managed Tauri state holding the skip-requested flag.
//   - `request_skip_splash` — Tauri command called by the splash frontend
//     when the user clicks or presses Esc/Space to skip.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::Serialize;
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
}

impl SplashState {
    pub fn new() -> Self {
        Self {
            skip_requested: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn skip(&self) {
        self.skip_requested.store(true, Ordering::SeqCst);
    }

    pub fn is_skip_requested(&self) -> bool {
        self.skip_requested.load(Ordering::SeqCst)
    }
}

// ── Tauri command ─────────────────────────────────────────────────────────

/// Called by the splash frontend when the user requests an early exit.
///
/// This sets the skip flag so the background startup thread can omit the
/// minimum-duration wait and proceed directly to showing the next window.
#[tauri::command]
pub fn request_skip_splash(state: tauri::State<SplashState>) {
    println!("[splash] Skip requested by user");
    state.skip();
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
