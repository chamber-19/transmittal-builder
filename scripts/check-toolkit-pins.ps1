# scripts/check-toolkit-pins.ps1
#
# Asserts that all five desktop-toolkit pin locations are in sync:
#
#   1. frontend/package.json   dependencies["@chamber-19/desktop-toolkit"]   (e.g. "^2.2.8")
#   2. frontend/src-tauri/Cargo.toml  [package.metadata.desktop-toolkit]  library-tag  (e.g. "v2.2.8")
#   3. frontend/src-tauri/Cargo.toml  [package.metadata.desktop-toolkit]  shim-tag     (e.g. "v2.2.8")
#   4. frontend/src-tauri/Cargo.toml  [dependencies]  desktop-toolkit ... tag           (e.g. "v2.2.8")
#   5. backend/requirements.txt  chamber19-desktop-toolkit @ git+...@vX.Y.Z              (e.g. "v2.2.8")
#
# Runnable locally:
#   pwsh ./scripts/check-toolkit-pins.ps1     (from repo root)
#
# The block-scoping regex used to isolate [package.metadata.desktop-toolkit]
# is the same pattern used in .github/workflows/release.yml (the source of truth).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot     = Split-Path -Parent $PSScriptRoot
$PkgJson      = Join-Path $RepoRoot "frontend" "package.json"
$CargoToml    = Join-Path $RepoRoot "frontend" "src-tauri" "Cargo.toml"
$Requirements = Join-Path $RepoRoot "backend" "requirements.txt"

# ── 1. Read frontend/package.json ────────────────────────────────────────────
$pkg = Get-Content -Raw $PkgJson | ConvertFrom-Json
$npmRaw = $pkg.dependencies."@chamber-19/desktop-toolkit"
if (-not $npmRaw) {
    Write-Error "Could not find @chamber-19/desktop-toolkit in frontend/package.json dependencies"
    exit 1
}
$npmVersion = $npmRaw -replace '^[\^~]', ''

# ── 2. Read frontend/src-tauri/Cargo.toml ────────────────────────────────────
$cargoToml = Get-Content -Raw $CargoToml

# Isolate the [package.metadata.desktop-toolkit] block (same pattern as release.yml).
$metadataBlock = [regex]::Match(
    $cargoToml,
    '(?ms)^\[package\.metadata\.desktop-toolkit\]\s*\n(.*?)(?=\n\[|\Z)'
).Groups[1].Value
if (-not $metadataBlock) {
    Write-Error "Could not find [package.metadata.desktop-toolkit] block in $CargoToml"
    exit 1
}

$libraryTagRaw = [regex]::Match($metadataBlock, '(?m)^\s*library-tag\s*=\s*"([^"]+)"').Groups[1].Value
$shimTagRaw    = [regex]::Match($metadataBlock, '(?m)^\s*shim-tag\s*=\s*"([^"]+)"').Groups[1].Value

if (-not $libraryTagRaw) {
    Write-Error "Could not parse library-tag from [package.metadata.desktop-toolkit] in $CargoToml"
    exit 1
}
if (-not $shimTagRaw) {
    Write-Error "Could not parse shim-tag from [package.metadata.desktop-toolkit] in $CargoToml"
    exit 1
}

# Extract the tag from the desktop-toolkit = { git = "...", tag = "..." } line in [dependencies].
# Scoped narrowly to the inline dependency declaration (not the metadata block above).
$depsTagRaw = [regex]::Match(
    $cargoToml,
    '(?m)^desktop-toolkit\s*=\s*\{[^}]*tag\s*=\s*"([^"]+)"[^}]*\}'
).Groups[1].Value
if (-not $depsTagRaw) {
    Write-Error "Could not parse desktop-toolkit tag from [dependencies] in $CargoToml"
    exit 1
}

# ── 3. Read backend/requirements.txt ─────────────────────────────────────────
$reqContent = Get-Content -Raw $Requirements
$pythonTagRaw = [regex]::Match(
    $reqContent,
    '(?m)^\s*chamber19-desktop-toolkit\s*@\s*git\+https://github\.com/chamber-19/desktop-toolkit@(v[\d.]+)#subdirectory=python\s*$'
).Groups[1].Value
if (-not $pythonTagRaw) {
    Write-Error "Could not parse chamber19-desktop-toolkit git+ pin from $Requirements"
    exit 1
}

# ── 4. Strip prefixes to get bare semvers ─────────────────────────────────────
$libraryVersion = $libraryTagRaw -replace '^v', ''
$shimVersion    = $shimTagRaw    -replace '^v', ''
$depsVersion    = $depsTagRaw    -replace '^v', ''
$pythonVersion  = $pythonTagRaw  -replace '^v', ''

# ── 5. Assert all five match ──────────────────────────────────────────────────
$allMatch = ($npmVersion -eq $libraryVersion) -and
            ($npmVersion -eq $shimVersion)    -and
            ($npmVersion -eq $depsVersion)    -and
            ($npmVersion -eq $pythonVersion)

if (-not $allMatch) {
    Write-Host ""
    Write-Host "ERROR: desktop-toolkit pin parity check failed."
    Write-Host ("  {0,-52}  {1,-28}  (parsed: {2})" -f `
        "frontend/package.json", `
        "@chamber-19/desktop-toolkit = $npmRaw", `
        $npmVersion)

    $mismatch2 = if ($libraryVersion -ne $npmVersion) { "  <-- MISMATCH" } else { "" }
    Write-Host ("  {0,-52}  {1,-28}  (parsed: {2}){3}" -f `
        "frontend/src-tauri/Cargo.toml [package.metadata.desktop-toolkit]", `
        "library-tag                  = $libraryTagRaw", `
        $libraryVersion, $mismatch2)

    $mismatch3 = if ($shimVersion -ne $npmVersion) { "  <-- MISMATCH" } else { "" }
    Write-Host ("  {0,-52}  {1,-28}  (parsed: {2}){3}" -f `
        "frontend/src-tauri/Cargo.toml [package.metadata.desktop-toolkit]", `
        "shim-tag                     = $shimTagRaw", `
        $shimVersion, $mismatch3)

    $mismatch4 = if ($depsVersion -ne $npmVersion) { "  <-- MISMATCH" } else { "" }
    Write-Host ("  {0,-52}  {1,-28}  (parsed: {2}){3}" -f `
        "frontend/src-tauri/Cargo.toml [dependencies] desktop-toolkit", `
        "tag                          = $depsTagRaw", `
        $depsVersion, $mismatch4)

    $mismatch5 = if ($pythonVersion -ne $npmVersion) { "  <-- MISMATCH" } else { "" }
    Write-Host ("  {0,-52}  {1,-28}  (parsed: {2}){3}" -f `
        "backend/requirements.txt chamber19-desktop-toolkit", `
        "git+...@$pythonTagRaw", `
        $pythonVersion, $mismatch5)

    Write-Host ""
    Write-Host "All five values must match. Bump them together."
    exit 1
}

# ── 6. Success ────────────────────────────────────────────────────────────────
Write-Host ("desktop-toolkit pin parity OK: {0} (package.json {1} == Cargo.toml library-tag {2} == shim-tag {3} == [dependencies] tag {4} == requirements.txt {5})" -f `
    $npmVersion, $npmRaw, $libraryTagRaw, $shimTagRaw, $depsTagRaw, $pythonTagRaw)
exit 0