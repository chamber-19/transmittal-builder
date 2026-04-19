// frontend/src-tauri/src/updater.rs
//
// Shared-drive update check and force-update flow.
//
// On every launch (release builds only) the app:
//   1. Checks whether the shared drive path is reachable.
//   2. Reads `latest.json` from that path.
//   3. Compares the remote `version` field to the version baked into the
//      binary (`CARGO_PKG_VERSION` via Cargo.toml).
//   4. Returns an `UpdateCheckResult` that the caller acts on.
//
// The shared-drive path defaults to:
//   G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder
// Override for dev/testing by setting `TRANSMITTAL_UPDATE_PATH`.
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
use std::io::{Read, Write};
use std::path::PathBuf;

use semver::Version;
use serde::Deserialize;
use tauri::AppHandle;
use tauri::Emitter;

const DEFAULT_UPDATE_PATH: &str = r"G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder";

/// Contents of `latest.json` on the shared drive.
#[derive(Deserialize, Clone, Debug)]
#[allow(dead_code)]
pub struct LatestJson {
    pub version: String,
    pub installer: String,
    pub notes: Option<String>,
    pub mandatory: Option<bool>,
}

/// Result of the update check.
pub enum UpdateCheckResult {
    /// Shared drive is not reachable (offline / VPN down).
    Offline { path: PathBuf },
    /// Installed version matches or exceeds the remote version.
    UpToDate,
    /// A newer version is available on the shared drive.
    UpdateAvailable {
        latest: LatestJson,
        update_path: PathBuf,
    },
}

/// Return the configured update path (env var override or default G:\ path).
pub fn get_update_path() -> PathBuf {
    std::env::var("TRANSMITTAL_UPDATE_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(DEFAULT_UPDATE_PATH))
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

    // Ensure the directory exists (it should already, but be safe).
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

// ── Update check ──────────────────────────────────────────────────────────

/// Check whether an update is available.
///
/// This is intentionally synchronous — it runs in the setup hook before the
/// main window is shown, so blocking briefly is acceptable.
pub fn check_for_update() -> UpdateCheckResult {
    let update_path = get_update_path();
    log_updater(&format!("Update path: {}", update_path.display()));

    // Hard-block if the path does not exist (offline / Drive not mounted).
    if !update_path.exists() {
        log_updater("latest.json: path not reachable (offline)");
        return UpdateCheckResult::Offline { path: update_path };
    }

    let latest_json_path = update_path.join("latest.json");
    let content = match fs::read_to_string(&latest_json_path) {
        Ok(c) => c,
        Err(e) => {
            log_updater(&format!("latest.json read error: {e}"));
            eprintln!("[updater] Cannot read latest.json: {e}");
            return UpdateCheckResult::Offline { path: update_path };
        }
    };
    log_updater("latest.json: read OK");

    let latest: LatestJson = match serde_json::from_str(&content) {
        Ok(j) => j,
        Err(e) => {
            log_updater(&format!("latest.json parse error: {e}"));
            eprintln!("[updater] Cannot parse latest.json: {e}");
            // Treat a malformed manifest as up-to-date so the app still opens.
            return UpdateCheckResult::UpToDate;
        }
    };

    let current_str = env!("CARGO_PKG_VERSION");
    let current = Version::parse(current_str).unwrap_or_else(|_| Version::new(0, 0, 0));
    let remote = match Version::parse(&latest.version) {
        Ok(v) => v,
        Err(e) => {
            log_updater(&format!(
                "Invalid version in latest.json ('{}'): {e}",
                latest.version
            ));
            eprintln!(
                "[updater] Invalid version in latest.json ('{}'): {e}",
                latest.version
            );
            return UpdateCheckResult::UpToDate;
        }
    };

    log_updater(&format!(
        "Version check: installed={current_str}, remote={}",
        latest.version
    ));

    if remote > current {
        log_updater(&format!(
            "Update available: {current_str} → {}",
            latest.version
        ));
        println!(
            "[updater] Update available: {current_str} → {}",
            latest.version
        );
        UpdateCheckResult::UpdateAvailable {
            latest,
            update_path,
        }
    } else {
        log_updater(&format!("Up to date ({current_str})"));
        println!("[updater] Up to date ({current_str})");
        UpdateCheckResult::UpToDate
    }
}

/// Copy the installer from the shared drive to `%TEMP%\transmittal-update.exe`,
/// emitting `update_progress` events to the Tauri frontend as bytes are copied.
///
/// Returns the path to the copied installer.
pub fn copy_installer_with_progress(
    update_path: &PathBuf,
    installer_name: &str,
    app: &AppHandle,
) -> Result<PathBuf, String> {
    use std::time::Instant;

    let src = update_path.join(installer_name);
    let temp_dir = std::env::var("TEMP")
        .or_else(|_| std::env::var("TMP"))
        .unwrap_or_else(|_| String::from("C:\\Temp"));
    let dest = PathBuf::from(&temp_dir).join("transmittal-update.exe");

    let total_bytes = fs::metadata(&src).map(|m| m.len()).unwrap_or(0);
    log_updater(&format!(
        "Copy: src={}, dest={}, total_bytes={total_bytes}",
        src.display(),
        dest.display(),
    ));

    let mut reader = fs::File::open(&src)
        .map_err(|e| format!("Cannot open installer '{installer_name}': {e}"))?;
    let mut writer =
        fs::File::create(&dest).map_err(|e| format!("Cannot create '{dest:?}': {e}"))?;

    let mut buf = [0u8; 65_536];
    let mut copied: u64 = 0;
    let mut last_logged_pct: i64 = -1;
    let copy_start = Instant::now();

    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("Read error: {e}"))?;
        if n == 0 {
            break;
        }
        writer
            .write_all(&buf[..n])
            .map_err(|e| format!("Write error: {e}"))?;
        copied += n as u64;

        let percent = if total_bytes > 0 {
            (copied as f64 / total_bytes as f64 * 100.0).min(100.0)
        } else {
            0.0
        };

        let _ = app.emit(
            "update_progress",
            serde_json::json!({
                "bytes_copied": copied,
                "total_bytes":  total_bytes,
                "percent":      percent,
            }),
        );

        // Log progress every ~5%.
        let pct_bucket = (percent as i64) / 5 * 5;
        if pct_bucket > last_logged_pct {
            last_logged_pct = pct_bucket;
            log_updater(&format!("Copy progress: {pct_bucket}% ({copied}/{total_bytes} bytes)"));
        }
    }

    let elapsed_ms = copy_start.elapsed().as_millis();
    log_updater(&format!(
        "Copy complete: {copied} bytes in {elapsed_ms} ms → {}",
        dest.display(),
    ));
    println!(
        "[updater] Installer copied to '{}' ({} bytes)",
        dest.display(),
        copied
    );
    Ok(dest)
}
