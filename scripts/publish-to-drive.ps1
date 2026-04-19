<#
.SYNOPSIS
    Copies a tagged Transmittal Builder release from GitHub to the shared drive.

.DESCRIPTION
    Downloads the NSIS installer and latest.json from a GitHub Release, archives
    the previous installer on the shared drive, and replaces it with the new one.

    Requires the GitHub CLI (gh) to be installed and authenticated.
    Requires Google Drive for Desktop to be running with the shared drive mounted.

.PARAMETER Tag
    The Git tag to publish, e.g. "v6.0.0".

.PARAMETER DrivePath
    Override the shared drive path (default: G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder).

.PARAMETER Repo
    GitHub repository in owner/name format (default: chamber-19/transmittal-builder).

.EXAMPLE
    .\scripts\publish-to-drive.ps1 -Tag v6.0.0

.EXAMPLE
    .\scripts\publish-to-drive.ps1 -Tag v6.0.0 -DrivePath "D:\TestDrive\TransmittalBuilder"
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [string]$Tag,

    [string]$DrivePath = "G:\Shared drives\R3P RESOURCES\APPS\Transmittal Builder",

    [string]$Repo = "chamber-19/transmittal-builder"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Helpers ─────────────────────────────────────────────────────────────────
function Write-Step { param([string]$msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK   { param([string]$msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "  !!  $msg" -ForegroundColor Yellow }

# ── Pre-flight checks ────────────────────────────────────────────────────────
Write-Step "Pre-flight checks"

# Verify gh CLI is available
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) is not installed. Install it from https://cli.github.com/"
}
Write-OK "gh CLI found"

# Verify shared drive is accessible
if (-not (Test-Path $DrivePath)) {
    throw "Shared drive path not found: $DrivePath`nEnsure Google Drive for Desktop is running and the shared drive is mounted."
}
Write-OK "Shared drive accessible: $DrivePath"

# ── Temp directory ───────────────────────────────────────────────────────────
Write-Step "Downloading release assets for $Tag from $Repo"

$TempDir = Join-Path $env:TEMP "transmittal-publish-$Tag"
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
Write-OK "Temp dir: $TempDir"

# Download all release assets
gh release download $Tag --repo $Repo --dir $TempDir --clobber
Write-OK "Assets downloaded"

# ── Locate downloaded files ──────────────────────────────────────────────────
$NewInstaller = Get-ChildItem $TempDir -Filter "*.exe" | Select-Object -First 1
$NewLatestJson = Join-Path $TempDir "latest.json"

if (-not $NewInstaller) {
    throw "No .exe found in downloaded assets in $TempDir"
}
if (-not (Test-Path $NewLatestJson)) {
    throw "latest.json not found in downloaded assets in $TempDir"
}

Write-OK "Installer : $($NewInstaller.Name)"
Write-OK "Manifest  : latest.json"

# ── Archive existing installer ───────────────────────────────────────────────
Write-Step "Archiving existing installer"

$ArchiveDir = Join-Path $DrivePath "archive"
New-Item -ItemType Directory -Force -Path $ArchiveDir | Out-Null

$ExistingInstallers = @(Get-ChildItem $DrivePath -Filter "*.exe" -File)
foreach ($old in $ExistingInstallers) {
    $dest = Join-Path $ArchiveDir $old.Name
    if ($PSCmdlet.ShouldProcess($old.FullName, "Move to archive")) {
        Move-Item -Force -Path $old.FullName -Destination $dest
        Write-OK "Archived: $($old.Name) → archive\"
    }
}
if ($ExistingInstallers.Count -eq 0) {
    Write-Warn "No existing installer found; nothing to archive."
}

# ── Copy new artefacts to shared drive ───────────────────────────────────────
Write-Step "Copying new artefacts to shared drive"

$DestInstaller  = Join-Path $DrivePath $NewInstaller.Name
$DestLatestJson = Join-Path $DrivePath "latest.json"

if ($PSCmdlet.ShouldProcess($DestInstaller, "Copy installer")) {
    Copy-Item -Force -Path $NewInstaller.FullName -Destination $DestInstaller
    Write-OK "Installer : $DestInstaller"
}
if ($PSCmdlet.ShouldProcess($DestLatestJson, "Copy latest.json")) {
    Copy-Item -Force -Path $NewLatestJson -Destination $DestLatestJson
    Write-OK "Manifest  : $DestLatestJson"
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "──────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Published $Tag to shared drive" -ForegroundColor Green
Write-Host "  Installer : $($NewInstaller.Name)" -ForegroundColor White
Write-Host "  Drive path: $DrivePath" -ForegroundColor White
Write-Host ""
Write-Host "  Users will receive the update the next time they open the app." -ForegroundColor DarkGray
Write-Host "──────────────────────────────────────────────────────────" -ForegroundColor DarkGray

# ── Cleanup ───────────────────────────────────────────────────────────────────
Remove-Item -Recurse -Force -Path $TempDir
