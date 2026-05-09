param(
  [int]$Port = 8010,
  [string]$PublicKey = "prod-test-key",
  [int]$StartupRetries = 40,
  [int]$StartupDelayMs = 500
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-HttpResult {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers,
    [object]$Body
  )

  try {
    $response = if ($null -ne $Body) {
      Invoke-WebRequest -Method $Method -Uri $Url -Headers $Headers -Body $Body -ContentType "application/json"
    } else {
      Invoke-WebRequest -Method $Method -Uri $Url -Headers $Headers
    }

    return [pscustomobject]@{
      StatusCode = [int]$response.StatusCode
      Body = $response.Content
    }
  }
  catch {
    $status = 0
    $content = ""

    if ($_.Exception.Response) {
      try {
        $status = [int]$_.Exception.Response.StatusCode
      } catch {}

      try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $content = $reader.ReadToEnd()
        $reader.Dispose()
      } catch {}
    }

    return [pscustomobject]@{
      StatusCode = $status
      Body = $content
    }
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendDir = Join-Path $repoRoot "backend"
$stdoutLog = Join-Path $env:TEMP ("tb-auth-smoke-{0}-stdout.log" -f [guid]::NewGuid().ToString("N"))
$stderrLog = Join-Path $env:TEMP ("tb-auth-smoke-{0}-stderr.log" -f [guid]::NewGuid().ToString("N"))
$tempScanRoot = Join-Path $env:TEMP ("tb-auth-smoke-root-{0}" -f [guid]::NewGuid().ToString("N"))
$healthUrl = "http://127.0.0.1:$Port/api/health"
$scanUrl = "http://127.0.0.1:$Port/api/scan-projects?root=$([uri]::EscapeDataString($tempScanRoot))"

$proc = $null
$oldEnvironment = @{}

try {
  New-Item -ItemType Directory -Path $tempScanRoot | Out-Null

  Write-Host "[smoke] Starting backend in production auth mode on port $Port"
  $envVars = @{
    ENVIRONMENT = "production"
    REQUIRE_ACTIVATION = "true"
    DESKTOP_TOOLKIT_PUBLIC_KEY = $PublicKey
  }

  foreach ($k in $envVars.Keys) {
    $oldEnvironment[$k] = [Environment]::GetEnvironmentVariable($k, "Process")
    [Environment]::SetEnvironmentVariable($k, $envVars[$k], "Process")
  }

  $proc = Start-Process `
    -FilePath "python" `
    -ArgumentList "-m", "uvicorn", "app:app", "--port", $Port `
    -WorkingDirectory $backendDir `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru

  $ready = $false
  for ($i = 1; $i -le $StartupRetries; $i++) {
    if ($proc.HasExited) {
      throw "Backend process exited during startup. Check logs: $stdoutLog and $stderrLog"
    }

    $result = Get-HttpResult -Method "GET" -Url $healthUrl -Headers @{} -Body $null
    if ($result.StatusCode -eq 200) {
      $ready = $true
      break
    }
    Start-Sleep -Milliseconds $StartupDelayMs
  }

  if (-not $ready) {
    throw "Backend did not become healthy at $healthUrl"
  }

  Write-Host "[smoke] Health check passed"

  $unauth = Get-HttpResult -Method "GET" -Url $scanUrl -Headers @{} -Body $null
  if ($unauth.StatusCode -ne 401) {
    throw "Expected 401 for unauthenticated request, got $($unauth.StatusCode). Body: $($unauth.Body)"
  }
  Write-Host "[smoke] Unauthenticated request returned 401 as expected"

  $issuedAt = (Get-Date).ToUniversalTime().ToString("s")
  $payloadObj = [ordered]@{
    hardware_fingerprint = "smoke-test-machine"
    issued_at = $issuedAt
    expires_in = 30
  }
  $payloadJson = $payloadObj | ConvertTo-Json -Compress
  $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payloadJson)
  $payloadB64 = [Convert]::ToBase64String($payloadBytes)

  $hmac = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes($PublicKey))
  $signatureBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($payloadB64))
  $signatureB64 = [Convert]::ToBase64String($signatureBytes)
  $token = "$payloadB64.$signatureB64"

  $authHeaders = @{ Authorization = "Bearer $token" }
  $auth = Get-HttpResult -Method "GET" -Url $scanUrl -Headers $authHeaders -Body $null
  if ($auth.StatusCode -ne 200) {
    throw "Expected 200 for authenticated request, got $($auth.StatusCode). Body: $($auth.Body)"
  }

  Write-Host "[smoke] Authenticated request returned 200 as expected"
  Write-Host "[smoke] PASS"
}
finally {
  foreach ($k in $oldEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($k, $oldEnvironment[$k], "Process")
  }

  if ($proc -and -not $proc.HasExited) {
    try {
      $proc.Kill($true)
      $proc.WaitForExit(5000) | Out-Null
    } catch {}
  }

  if (Test-Path $tempScanRoot) {
    Remove-Item -Recurse -Force $tempScanRoot
  }

  Write-Host "[smoke] backend stdout log: $stdoutLog"
  Write-Host "[smoke] backend stderr log: $stderrLog"
}
