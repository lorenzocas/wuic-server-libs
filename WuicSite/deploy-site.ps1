<#
.SYNOPSIS
  Deploy del sito promozionale WUIC e dei pacchetti ZIP sul server remoto.

.PARAMETER Server
  Hostname o IP del server (es. "vps123.contabo.de").

.PARAMETER User
  Utente SSH/SCP (default: Administrator).

.PARAMETER SitePath
  Path remota del sito promozionale su IIS (default: C:\inetpub\wwwroot\WuicSite).

.PARAMETER ZipSourceDir
  Cartella locale contenente i pacchetti ZIP da caricare.
  Default: ../KonvergenceCore/artifacts/release/wuictest/

.PARAMETER SkipBuild
  Se specificato, salta la build Angular e carica direttamente dist/.

.PARAMETER SkipZip
  Se specificato, non carica i pacchetti ZIP sul server.

.EXAMPLE
  pwsh deploy-site.ps1 -Server vps123.contabo.de
  pwsh deploy-site.ps1 -Server vps123.contabo.de -SkipBuild -SkipZip
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Server,
    [string]$User = 'Administrator',
    [string]$SitePath = 'C:\inetpub\wwwroot\WuicSite',
    [string]$ZipSourceDir = '',
    [string]$AppPoolName = 'WuicSitePool',
    [switch]$SkipBuild,
    [switch]$SkipZip,
    [switch]$SkipAppPoolCycle
)

$ErrorActionPreference = 'Stop'
$scriptDir = $PSScriptRoot

# ── resolve defaults ─────────────────────────────────────────────────

if (-not $ZipSourceDir) {
    $ZipSourceDir = Join-Path $scriptDir '..\KonvergenceCore\artifacts\release\wuictest'
}
$distDir = Join-Path $scriptDir 'dist\WuicSite\browser'

function Write-Step($msg) { Write-Host "`n--- $msg" -ForegroundColor Cyan }

function Invoke-RemotePwsh {
    <#
    .SYNOPSIS
        Run a PowerShell snippet on the remote IIS server over SSH.
        Encodes the snippet as Base64 (UTF-16LE) so quoting/escaping is neutralised.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$RemoteUserHost,
        [Parameter(Mandatory = $true)][string]$Script
    )
    $bytes = [System.Text.Encoding]::Unicode.GetBytes($Script)
    $encoded = [Convert]::ToBase64String($bytes)
    # Pipe ssh stdout straight to Out-Host so it doesn't contaminate the
    # function's return value — otherwise $code would capture remote output + exit code together.
    & ssh $RemoteUserHost "powershell -NoProfile -NonInteractive -EncodedCommand $encoded" | Out-Host
    return $LASTEXITCODE
}

function Get-HealthCheckUrl {
    <#
    .SYNOPSIS
        Pick a URL that actually matches an IIS host-header binding.
        Passing a bare IP when IIS uses host headers returns the wrong site (or 404).
    #>
    param([string]$Target)
    # If the caller passed a hostname (not a dotted IPv4) use it as-is.
    if ($Target -match '^\d+\.\d+\.\d+\.\d+$') {
        # IP → map the two known production deployments by IP.
        switch ($Target) {
            '194.163.167.71' { return 'https://wuic-framework.com/' }
            default { return "https://$Target/" }
        }
    }
    return "https://$Target/"
}

# ── step 1: build ────────────────────────────────────────────────────

if (-not $SkipBuild) {
    Write-Step "1/3 Build Angular"
    Push-Location $scriptDir
    try {
        npx ng build --configuration=production
        if ($LASTEXITCODE -ne 0) { throw "ng build failed" }
    } finally { Pop-Location }
} else {
    Write-Step "1/3 Build Angular [SKIP]"
}

if (-not (Test-Path $distDir)) {
    throw "dist non trovata in $distDir — esegui prima la build"
}

# ── step 2: upload site ──────────────────────────────────────────────

Write-Step "2/3 Upload sito promozionale -> $Server"

$remoteUserHost = "${User}@${Server}"
$remoteSite = "${remoteUserHost}:${SitePath}"
Write-Host "  scp $distDir/* -> $remoteSite"

# Stop IIS app pool BEFORE the upload so files aren't locked by the worker process
# and no partial requests can trigger rapid-fail protection while files are in flux.
if (-not $SkipAppPoolCycle) {
    Write-Host "  Stop-WebAppPool $AppPoolName (pre-upload)" -ForegroundColor DarkGray
    $stopScript = @"
Import-Module WebAdministration
`$pool = Get-Item "IIS:\AppPools\$AppPoolName" -ErrorAction SilentlyContinue
if (`$null -eq `$pool) { Write-Host "[warn] App pool $AppPoolName non trovato, skip stop" ; exit 0 }
if (`$pool.State -ne 'Stopped') {
    Stop-WebAppPool -Name '$AppPoolName'
    # wait up to 10s for worker to exit
    for (`$i = 0; `$i -lt 20; `$i++) {
        Start-Sleep -Milliseconds 500
        `$s = (Get-Item "IIS:\AppPools\$AppPoolName").State
        if (`$s -eq 'Stopped') { break }
    }
}
Write-Host "    pool state: `$((Get-Item 'IIS:\AppPools\$AppPoolName').State)"
"@
    $code = Invoke-RemotePwsh -RemoteUserHost $remoteUserHost -Script $stopScript
    if ($code -ne 0) { Write-Host "  [warn] stop app pool exit=$code (continuo)" -ForegroundColor Yellow }
}

# Use robocopy over UNC if on same Windows network, else scp
$uncPath = "\\${Server}\$($SitePath -replace ':', '$')"
if (Test-Path $uncPath -ErrorAction SilentlyContinue) {
    Write-Host "  Modalita' UNC: $uncPath" -ForegroundColor DarkGray
    robocopy $distDir $uncPath /MIR /NJH /NJS /NDL /NP /R:2 /W:1
    if ($LASTEXITCODE -ge 8) { throw "robocopy sito fallito (exit code $LASTEXITCODE)" }
} else {
    Write-Host "  Modalita' SCP" -ForegroundColor DarkGray
    scp -r "${distDir}/*" "${remoteSite}/"
    if ($LASTEXITCODE -ne 0) {
        # try to restart pool even on failure so we don't leave the site down
        if (-not $SkipAppPoolCycle) {
            Write-Host "  [warn] scp fallito, tento comunque restart pool" -ForegroundColor Yellow
            Invoke-RemotePwsh -RemoteUserHost $remoteUserHost -Script "Import-Module WebAdministration; Start-WebAppPool -Name '$AppPoolName'" | Out-Null
        }
        throw "scp sito fallito"
    }
}
Write-Host "  [ok] Sito caricato" -ForegroundColor Green

# Restart app pool AFTER the upload and verify the site responds.
if (-not $SkipAppPoolCycle) {
    Write-Host "  Start-WebAppPool $AppPoolName (post-upload)" -ForegroundColor DarkGray
    $startScript = @"
Import-Module WebAdministration
Start-WebAppPool -Name '$AppPoolName'
for (`$i = 0; `$i -lt 20; `$i++) {
    Start-Sleep -Milliseconds 500
    `$s = (Get-Item "IIS:\AppPools\$AppPoolName").State
    if (`$s -eq 'Started') { break }
}
Write-Host "    pool state: `$((Get-Item 'IIS:\AppPools\$AppPoolName').State)"
"@
    $code = Invoke-RemotePwsh -RemoteUserHost $remoteUserHost -Script $startScript
    if ($code -ne 0) { Write-Host "  [warn] start app pool exit=$code" -ForegroundColor Yellow }

    # Health check: hit the site via its real public hostname (IIS uses host-header bindings,
    # so hitting the bare IP can return the wrong site or a 404).
    $healthUrl = Get-HealthCheckUrl -Target $Server
    Write-Host "  Health check $healthUrl" -ForegroundColor DarkGray
    $ok = $false
    for ($i = 0; $i -lt 10; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri $healthUrl -Method Head -SkipCertificateCheck -TimeoutSec 10 -ErrorAction Stop
            if ($resp.StatusCode -eq 200) { $ok = $true ; break }
        } catch {
            Start-Sleep -Milliseconds 750
        }
    }
    if ($ok) {
        Write-Host "  [ok] Health check HTTP 200 ($healthUrl)" -ForegroundColor Green
    } else {
        Write-Host "  [warn] Health check fallito dopo retry su $healthUrl - controlla IIS manualmente" -ForegroundColor Yellow
    }
}

# ── step 3: upload ZIP artifacts ─────────────────────────────────────

if (-not $SkipZip) {
    Write-Step "3/3 Upload pacchetti ZIP"

    $zipFiles = Get-ChildItem -Path $ZipSourceDir -Filter '*.zip' -ErrorAction SilentlyContinue
    if (-not $zipFiles -or $zipFiles.Count -eq 0) {
        Write-Host "  [skip] Nessun ZIP trovato in $ZipSourceDir" -ForegroundColor Yellow
    } else {
        $remoteDownloads = Join-Path $SitePath 'downloads'
        $uncDownloads = "\\${Server}\$($remoteDownloads -replace ':', '$')"

        Write-Host "  $($zipFiles.Count) ZIP da caricare:" -ForegroundColor DarkGray
        foreach ($z in $zipFiles) {
            Write-Host "    $($z.Name) ($([math]::Round($z.Length / 1MB, 1)) MB)" -ForegroundColor DarkGray
        }

        if (Test-Path $uncDownloads -ErrorAction SilentlyContinue) {
            foreach ($z in $zipFiles) {
                Copy-Item $z.FullName (Join-Path $uncDownloads $z.Name) -Force
            }
        } else {
            $remoteDownloadsPath = "${User}@${Server}:${remoteDownloads}"
            ssh "${User}@${Server}" "if not exist `"$remoteDownloads`" mkdir `"$remoteDownloads`""
            foreach ($z in $zipFiles) {
                scp $z.FullName "${remoteDownloadsPath}/$($z.Name)"
            }
        }

        # Write latest.json for the download page
        $latest = @{
            server = ''
            client = ''
            date   = (Get-Date -Format 'yyyy-MM-dd')
            files  = @()
        }
        foreach ($z in $zipFiles) {
            if ($z.Name -match 'server-([^-]+(?:-rag)?)-client-(.+)\.zip$') {
                $latest.server = ($Matches[1] -replace '-rag$', '')
                $latest.client = $Matches[2]
            }
            $latest.files += @{
                name = $z.Name
                size = "$([math]::Round($z.Length / 1MB, 1)) MB"
                url  = "/downloads/$($z.Name)"
            }
        }
        $latestJson = $latest | ConvertTo-Json -Depth 3
        $latestPath = Join-Path $distDir 'downloads'
        if (-not (Test-Path $latestPath)) { New-Item -ItemType Directory -Path $latestPath -Force | Out-Null }
        Set-Content -Path (Join-Path $latestPath 'latest.json') -Value $latestJson -Encoding UTF8

        # Upload latest.json too
        if (Test-Path $uncDownloads -ErrorAction SilentlyContinue) {
            Copy-Item (Join-Path $latestPath 'latest.json') (Join-Path $uncDownloads 'latest.json') -Force
        } else {
            scp (Join-Path $latestPath 'latest.json') "${remoteDownloadsPath}/latest.json"
        }

        Write-Host "  [ok] $($zipFiles.Count) ZIP + latest.json caricati" -ForegroundColor Green
    }
} else {
    Write-Step "3/3 Upload pacchetti ZIP [SKIP]"
}

# ── done ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Deploy completato su $Server" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
