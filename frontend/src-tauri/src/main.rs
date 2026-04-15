// Prevents an additional console window from appearing on Windows in release.
// DO NOT REMOVE — required for a clean desktop experience.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    app_lib::run()
}
