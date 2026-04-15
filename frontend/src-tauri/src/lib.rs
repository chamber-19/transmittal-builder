// Phase 1: minimal Tauri shell.
// The frontend (React/Vite) communicates with the Python backend over
// http://127.0.0.1:8000 — no Rust-side IPC is needed yet.
//
// Future phases may add:
//   Phase 2 — spawn/monitor the Python backend process from here.
//   Phase 3 — bundle the backend as a Tauri sidecar binary.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
