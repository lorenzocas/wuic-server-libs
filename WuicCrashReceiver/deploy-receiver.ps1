#requires -Version 7
<#
.SYNOPSIS
  Deploy del WuicCrashReceiver su `errors.wuic-framework.com` (IIS,
  Windows Server 2025).

.DESCRIPTION
  Skill crash-reporting Commit 11. Pattern mirror di
  ../WuicSite/deploy-site.ps1:
    1. dotnet publish framework-dependent (server gia' ha runtime .NET 10)
    2. SCP del publish output → C:\inetpub\wwwroot\errors.wuic-framework.com\
    3. Restart IIS App Pool `WuicCrashReceiverPool`
    4. Health check via curl GET /health

  ATTENZIONE: pre-requisiti gia' completati via win-acme + IIS console:
    - DNS A: errors.wuic-framework.com → IP server
    - Wildcard cert *.wuic-framework.com bound al sito IIS
    - IIS site `errors.wuic-framework.com` creato + AppPool no-managed-runtime
    - Web-IP-Security feature installata (per ipSecurity rules in web.config)
    - SQL Server raggiungibile da IIS worker process

.PARAMETER Server
  Hostname/IP server. Default: wuic-framework.com (gli SSH config gia' hanno
  l'host alias che mappa al VPS Contabo).

.PARAMETER User
  Utente SSH/SCP. Default: Administrator (gia' configurato per deploy-site.ps1).

.PARAMETER SitePath
  Path remoto del sito IIS. Default: C:\inetpub\wwwroot\errors.wuic-framework.com

.PARAMETER AppPoolName
  Nome IIS App Pool da ciclare. Default: WuicCrashReceiverPool

.PARAMETER SkipBuild
  Se specificato, salta `dotnet publish` (riusa il publish esistente in
  bin/Release/net10.0/publish). Utile per push iterativi rapidi.

.PARAMETER SkipUpload
  Se specificato, salta SCP. Utile per testare il flow di build/cycle senza
  toccare il server (es. dry-run pre-deploy).

.PARAMETER SkipAppPoolCycle
  Se specificato, salta il restart App Pool. La nuova DLL non viene
  caricata fino al prossimo recycle/recompile. Usare solo per push di
  asset statici (admin SPA in wwwroot/admin) che non richiedono restart.

.PARAMETER SkipHealthCheck
  Se specificato, salta il GET /health post-deploy.

.EXAMPLE
  pwsh deploy-receiver.ps1
  pwsh deploy-receiver.ps1 -SkipBuild              # solo upload + cycle
  pwsh deploy-receiver.ps1 -SkipUpload             # dry-run locale
#>
param(
    [string]$Server = 'wuic-framework.com',
    [string]$User = 'Administrator',
    [string]$SitePath = 'C:\inetpub\WuicCrashReceiver\stub',
    [string]$AppPoolName = 'WuicCrashReceiverPool',
    [string]$HealthUrl = 'https://errors.wuic-framework.com/health',
    [switch]$SkipBuild,
    [switch]$SkipUpload,
    [switch]$SkipAppPoolCycle,
    [switch]$SkipHealthCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = $PSScriptRoot
$publishDir = Join-Path $scriptDir 'bin\Release\net10.0\publish'
$csproj = Join-Path $scriptDir 'WuicCrashReceiver.csproj'

function Write-Step($msg) {
    $ts = (Get-Date).ToString('HH:mm:ss')
    Write-Host "`n--- [$ts] $msg" -ForegroundColor Cyan
}
function Write-Sub($msg) {
    $ts = (Get-Date).ToString('HH:mm:ss')
    Write-Host "    [$ts] $msg" -ForegroundColor DarkGray
}

# ── Step 1: dotnet publish ────────────────────────────────────────────
if (-not $SkipBuild) {
    Write-Step "Publishing framework-dependent (Release, net10.0)"
    if (Test-Path $publishDir) {
        Write-Sub "removing previous publish: $publishDir"
        Remove-Item -Recurse -Force $publishDir
    }
    & dotnet publish $csproj `
        -c Release `
        -o $publishDir `
        --no-self-contained `
        /p:PublishReadyToRun=false `
        /p:UseAppHost=false `
        /p:DebugType=portable `
        /p:DebugSymbols=true
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed with exit $LASTEXITCODE" }

    # Sanity: web.config + admin/index.html devono essere nel publish.
    $checks = @(
        Join-Path $publishDir 'web.config',
        Join-Path $publishDir 'WuicCrashReceiver.dll',
        Join-Path $publishDir 'wwwroot\admin\index.html',
        Join-Path $publishDir 'wwwroot\admin\app.js',
        Join-Path $publishDir 'wwwroot\admin\style.css'
    )
    foreach ($c in $checks) {
        if (-not (Test-Path $c)) { throw "publish sanity FAILED: missing $c" }
        Write-Sub "ok: $c"
    }
} else {
    Write-Step "Skipping build (SkipBuild=true). Using existing $publishDir"
    if (-not (Test-Path $publishDir)) { throw "Publish dir not found: $publishDir. Re-run without -SkipBuild." }
}

# ── Step 2: SCP upload ───────────────────────────────────────────────
if (-not $SkipUpload) {
    Write-Step "Uploading publish to ${User}@${Server}:${SitePath}"

    # Ensure remote dir exists.
    Write-Sub "ssh ensure remote dir exists"
    $mkdirCmd = ('powershell -NoProfile -Command "if (-not (Test-Path ''' + $SitePath + ''')) { New-Item -ItemType Directory -Path ''' + $SitePath + ''' -Force | Out-Null }"')
    & ssh "$User@$Server" $mkdirCmd 2>&1 | ForEach-Object { Write-Sub $_ }
    if ($LASTEXITCODE -ne 0) { throw "ssh mkdir failed (exit $LASTEXITCODE)" }

    # Optionally stop the app pool before upload to avoid file-lock on the
    # in-process DLL. We skip this only when -SkipAppPoolCycle is set
    # (useful for static-asset-only updates).
    if (-not $SkipAppPoolCycle) {
        Write-Sub "ssh stop AppPool $AppPoolName (avoid file lock during scp)"
        $stopCmd = "powershell -NoProfile -Command `"Import-Module WebAdministration; if ((Get-Item IIS:\\AppPools\\$AppPoolName -ErrorAction SilentlyContinue).State -eq 'Started') { Stop-WebAppPool -Name '$AppPoolName' }`""
        & ssh "$User@$Server" $stopCmd 2>&1 | ForEach-Object { Write-Sub $_ }
        Start-Sleep -Seconds 2  # let workers drain
    }

    # SCP recursive. Strategia: zip local → scp single file → ssh remote unzip.
    # Mixed pwsh/Win/OpenSSH wildcard expansion is unreliable (`publish/*` viene
    # passato letterale al remoto). Zip + unzip e' affidabile cross-platform.
    Write-Sub "zip publish dir for atomic transfer..."
    $zipLocal = Join-Path ([System.IO.Path]::GetTempPath()) ("wuic-receiver-publish-" + [guid]::NewGuid() + ".zip")
    if (Test-Path $zipLocal) { Remove-Item $zipLocal -Force }
    Compress-Archive -Path (Join-Path $publishDir '*') -DestinationPath $zipLocal -Force
    Write-Sub "scp $zipLocal → $User@${Server}"
    $remoteZip = "C:/Users/$User/wuic-receiver-publish-inflight.zip"
    & scp -q $zipLocal "${User}@${Server}:${remoteZip}" 2>&1 | ForEach-Object { Write-Sub $_ }
    if ($LASTEXITCODE -ne 0) { Remove-Item $zipLocal -Force -ErrorAction SilentlyContinue; throw "scp upload failed (exit $LASTEXITCODE)" }
    Write-Sub "ssh remote unzip into $SitePath"
    $unzipCmd = "powershell -NoProfile -Command `"Expand-Archive -Path '$remoteZip' -DestinationPath '$SitePath' -Force; Remove-Item '$remoteZip' -Force`""
    & ssh "$User@$Server" $unzipCmd 2>&1 | ForEach-Object { Write-Sub $_ }
    if ($LASTEXITCODE -ne 0) { Remove-Item $zipLocal -Force -ErrorAction SilentlyContinue; throw "ssh remote unzip failed (exit $LASTEXITCODE)" }
    Remove-Item $zipLocal -Force -ErrorAction SilentlyContinue

    Write-Sub "upload done"
}

# ── Step 3: AppPool cycle ────────────────────────────────────────────
if (-not $SkipAppPoolCycle) {
    Write-Step "Cycling IIS AppPool $AppPoolName"
    $startCmd = "powershell -NoProfile -Command `"Import-Module WebAdministration; Start-WebAppPool -Name '$AppPoolName'; (Get-Item IIS:\\AppPools\\$AppPoolName).State`""
    & ssh "$User@$Server" $startCmd 2>&1 | ForEach-Object { Write-Sub $_ }
    if ($LASTEXITCODE -ne 0) { throw "ssh AppPool start failed (exit $LASTEXITCODE)" }
}

# ── Step 4: Health check ─────────────────────────────────────────────
if (-not $SkipHealthCheck) {
    Write-Step "Health check $HealthUrl"
    $deadline = (Get-Date).AddSeconds(60)
    $healthy = $false
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 5 -SkipHttpErrorCheck
            if ($resp.StatusCode -eq 200) {
                Write-Sub "200 OK — body: $($resp.Content.Substring(0,[Math]::Min(200,$resp.Content.Length)))"
                $healthy = $true
                break
            } else {
                Write-Sub "got HTTP $($resp.StatusCode), retrying…"
            }
        } catch {
            Write-Sub "connect failed ($($_.Exception.Message)), retrying…"
        }
        Start-Sleep -Seconds 2
    }
    if (-not $healthy) {
        throw "Health check FAILED after 60s. Check stdout logs on remote: $SitePath\logs\stdout*.log"
    }
}

Write-Step "Deploy complete."
Write-Host "  Admin UI:   https://errors.wuic-framework.com/admin/" -ForegroundColor Green
Write-Host "  Health:     $HealthUrl" -ForegroundColor Green
