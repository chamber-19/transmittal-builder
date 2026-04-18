// SOURCED FROM kc-framework@v1.0.0 — do not edit directly; sync via scripts/sync-framework-tauri.mjs.
// tauri-template/src-tauri-base/src/main.rs
//
// Prevents an additional console window from appearing on Windows in release.
// DO NOT REMOVE — required for a clean desktop experience.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    app_lib::run()
}
