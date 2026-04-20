// SYNCED FROM desktop-toolkit v2.0.0 — DO NOT EDIT HERE.
// Source of truth: https://github.com/chamber-19/desktop-toolkit (src-tauri/src/updater.rs)
// Remove this file and import from the framework crate once the Rust crate is
// published (tracked for Phase 3).
//
// frontend/src-tauri/src/updater.rs
//
// G:\-based update check for internal distribution.
//
// On every app launch the React app invokes `check_for_update` (a Tauri
// command defined in lib.rs) which calls `cmd_check_for_update()` here.
// The flow:
//   1. Read / lazy-create `%APPDATA%\Transmittal Builder\update-source.json`.
//   2. If `enabled: false`, return `{ updateAvailable: false }` immediately.
//   3. Read `latest.json` from the configured `manifestPath`.
//      Missing / unreachable → return false, log to console (silent fail).
//   4. Parse manifest.  Compare versions with the `semver` crate.
//   5. Synthesize installer path from the manifest folder + version.
//   6. Verify installer exists on disk.
//   7. Return `{ updateAvailable: true, version, installerPath, notes }`.
//
// File logging (release builds only):
//   %LOCALAPPDATA%\Transmittal Builder\updater.log
//   Each line: [<unix-epoch-seconds>] <message>
//   To convert a timestamp in PowerShell:
//     [DateTimeOffset]::FromUnixTimeSeconds(<secs>).LocalDateTime

// In debug builds these items are only used in release code paths; suppress
// the resulting dead-code warnings without affecting release builds.
#![cfg_attr(debug_assertions, allow(dead_code))]

use std::fs;
use std::io::Write;
use std::path::PathBuf;

use semver::Version;
use serde::{Deserialize, Serialize};

const DEFAULT_MANIFEST_PATH: &str =
    r"G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder\latest.json";

// ── Update-source config ──────────────────────────────────────────────────

/// Per-machine config stored in `%APPDATA%\Transmittal Builder\update-source.json`.
/// Lazy-created on first launch with the default G:\ path.
/// Lets admins redirect the update source or disable updates without rebuilding.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSourceConfig {
    manifest_path: String,
    enabled: bool,
}

impl Default for UpdateSourceConfig {
    fn default() -> Self {
        Self {
            manifest_path: DEFAULT_MANIFEST_PATH.to_string(),
            enabled: true,
        }
    }
}

/// Return `%APPDATA%\Transmittal Builder\` on Windows or
/// `$HOME/.config/Transmittal Builder/` on other platforms.
fn get_config_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var("APPDATA")
            .ok()
            .map(|s| PathBuf::from(s).join("Transmittal Builder"))
    }
    #[cfg(not(windows))]
    {
        std::env::var("HOME")
            .ok()
            .map(|s| PathBuf::from(s).join(".config").join("Transmittal Builder"))
    }
}

/// Read `update-source.json`, creating it with defaults if absent or unreadable.
fn read_or_create_source_config() -> UpdateSourceConfig {
    let Some(dir) = get_config_dir() else {
        return UpdateSourceConfig::default();
    };
    let path = dir.join("update-source.json");

    // Try to read and parse existing file.
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(cfg) = serde_json::from_str::<UpdateSourceConfig>(&content) {
                return cfg;
            }
        }
    }

    // Write the default config so users can easily find and edit it.
    let cfg = UpdateSourceConfig::default();
    let _ = fs::create_dir_all(&dir);
    if let Ok(json) = serde_json::to_string_pretty(&cfg) {
        let _ = fs::write(&path, format!("{json}\n"));
    }
    cfg
}

// ── Command-facing check result ───────────────────────────────────────────

/// Returned by the `check_for_update` Tauri command.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckUpdateResult {
    pub update_available: bool,
    pub version: Option<String>,
    pub installer_path: Option<String>,
    pub notes: Option<String>,
}

impl CheckUpdateResult {
    fn none() -> Self {
        Self {
            update_available: false,
            version: None,
            installer_path: None,
            notes: None,
        }
    }
}

/// Check whether a newer version is available on the shared drive.
///
/// Called by the `check_for_update` Tauri command from the React app on mount.
/// All errors degrade silently — returns `CheckUpdateResult { update_available: false }`
/// and logs to console rather than showing a user-facing error.
pub fn cmd_check_for_update() -> CheckUpdateResult {
    // 1. Read / create update-source.json.
    let config = read_or_create_source_config();

    // 2. Bail if disabled.
    if !config.enabled {
        println!("[updater] Update check disabled via update-source.json");
        return CheckUpdateResult::none();
    }

    // 3. Resolve manifest path and its containing folder.
    let manifest_path = PathBuf::from(&config.manifest_path);
    let manifest_folder = match manifest_path.parent() {
        Some(p) => p.to_path_buf(),
        None => {
            eprintln!(
                "[updater] Cannot determine manifest folder from: {}",
                manifest_path.display()
            );
            return CheckUpdateResult::none();
        }
    };

    // 4. Read the manifest — missing / unreachable → silent fail.
    let content = match fs::read_to_string(&manifest_path) {
        Ok(c) => c,
        Err(e) => {
            println!(
                "[updater] Cannot read manifest at {}: {e}",
                manifest_path.display()
            );
            return CheckUpdateResult::none();
        }
    };

    // 5. Parse manifest.
    let latest: LatestJson = match serde_json::from_str(&content) {
        Ok(j) => j,
        Err(e) => {
            println!("[updater] Cannot parse latest.json: {e}");
            return CheckUpdateResult::none();
        }
    };

    // 6. Compare versions using semver so "6.0.10 > 6.0.9" works correctly.
    let current_str = env!("CARGO_PKG_VERSION");
    let current = Version::parse(current_str).unwrap_or_else(|_| Version::new(0, 0, 0));
    let remote = match Version::parse(&latest.version) {
        Ok(v) => v,
        Err(e) => {
            println!(
                "[updater] Invalid version in latest.json ('{}'): {e}",
                latest.version
            );
            return CheckUpdateResult::none();
        }
    };

    if remote <= current {
        println!("[updater] Up to date ({current_str})");
        return CheckUpdateResult::none();
    }

    // 7. Synthesize installer path: use the `installer` field from latest.json
    //    when present; fall back to the conventional filename pattern when absent.
    let installer_filename = if latest.installer.is_empty() {
        format!("Transmittal.Builder_{}_x64-setup.exe", latest.version)
    } else {
        latest.installer.clone()
    };
    let installer_path = manifest_folder.join(&installer_filename);

    // 8. Verify the installer actually exists on disk.
    if !installer_path.exists() {
        println!(
            "[updater] Installer not found at: {}",
            installer_path.display()
        );
        return CheckUpdateResult::none();
    }

    println!(
        "[updater] Update available: {current_str} → {} ({})",
        latest.version,
        installer_path.display()
    );

    CheckUpdateResult {
        update_available: true,
        version: Some(latest.version),
        installer_path: Some(installer_path.to_string_lossy().into_owned()),
        notes: latest.notes,
    }
}

// ── File logging ──────────────────────────────────────────────────────────

/// Append a timestamped message to the updater log file (release builds only).
///
/// Log location: `%LOCALAPPDATA%\Transmittal Builder\updater.log`
/// Timestamp format: Unix epoch seconds.  To decode in PowerShell:
///   `[DateTimeOffset]::FromUnixTimeSeconds(<secs>).LocalDateTime`
///
/// Silently ignores I/O errors so a missing/unwritable log never aborts the
/// update flow.
#[cfg(not(debug_assertions))]
pub fn log_updater(msg: &str) {
    use std::time::{SystemTime, UNIX_EPOCH};

    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let base = std::env::var("LOCALAPPDATA")
        .or_else(|_| std::env::var("TEMP"))
        .unwrap_or_else(|_| String::from("C:\\Temp"));
    let log_path = PathBuf::from(base)
        .join("Transmittal Builder")
        .join("updater.log");

    if let Some(parent) = log_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(mut f) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let _ = writeln!(f, "[{secs}] {msg}");
    }
}

/// No-op in debug builds — updater code paths are not exercised in dev mode.
#[cfg(debug_assertions)]
pub fn log_updater(_msg: &str) {}

/// Contents of `latest.json` on the shared drive.
#[derive(Deserialize, Clone, Debug)]
#[allow(dead_code)]
pub struct LatestJson {
    pub version: String,
    #[serde(default)]
    pub installer: String,
    pub notes: Option<String>,
    pub mandatory: Option<bool>,
}
