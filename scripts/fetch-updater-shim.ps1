# scripts/fetch-updater-shim.ps1
#
# One-shot helper to build/fetch desktop-toolkit-updater.exe for local development.
#
# Run this once after cloning the repo (or after bumping the framework version)
# so `npm run desktop` / `tauri dev` can find the shim binary.
#
# Usage (from repo root):
#   pwsh scripts/fetch-updater-shim.ps1
#
# Prerequisites: Rust + Cargo installed (same toolchain as the main app).
# The output is written to frontend/src-tauri/desktop-toolkit-updater.exe
# (gitignored; produced fresh by CI for release builds).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$DestPath = Join-Path $RepoRoot "frontend\src-tauri\desktop-toolkit-updater.exe"
$TmpCloneDir = Join-Path $env:TEMP "dtk-updater-shim-src"
$DesktopToolkitTag = "v2.2.4"

Write-Host "[fetch-updater-shim] Building desktop-toolkit-updater.exe from source..."

# ── Clone or update the framework repo ────────────────────────────────────
if (Test-Path $TmpCloneDir) {
    Write-Host "[fetch-updater-shim] Reusing existing clone at $TmpCloneDir"
    Push-Location $TmpCloneDir
    git fetch --tags --quiet
    git checkout "tags/$DesktopToolkitTag" --quiet 2>$null
    Pop-Location
} else {
    Write-Host "[fetch-updater-shim] Cloning desktop-toolkit at $DesktopToolkitTag..."
    git clone --depth 1 --branch $DesktopToolkitTag `
        https://github.com/chamber-19/desktop-toolkit.git `
        $TmpCloneDir
}

# ── Build the shim binary ──────────────────────────────────────────────────
Write-Host "[fetch-updater-shim] Building crates/desktop-toolkit-updater (release)..."
Push-Location $TmpCloneDir
cargo build --release --manifest-path crates/desktop-toolkit-updater/Cargo.toml
Pop-Location

$BuiltExe = Join-Path $TmpCloneDir "target\release\desktop-toolkit-updater.exe"
if (-not (Test-Path $BuiltExe)) {
    Write-Error "[fetch-updater-shim] Build succeeded but binary not found at $BuiltExe"
}

# ── Copy to Tauri src dir ──────────────────────────────────────────────────
Copy-Item -Force $BuiltExe $DestPath
Write-Host ("[fetch-updater-shim] Done - shim installed at {0}" -f $DestPath)
Write-Host "You can now run: npm run desktop (from frontend/)"
