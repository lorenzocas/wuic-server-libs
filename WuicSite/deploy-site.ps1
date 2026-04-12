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
    [switch]$SkipBuild,
    [switch]$SkipZip
)

$ErrorActionPreference = 'Stop'
$scriptDir = $PSScriptRoot

# ── resolve defaults ─────────────────────────────────────────────────

if (-not $ZipSourceDir) {
    $ZipSourceDir = Join-Path $scriptDir '..\KonvergenceCore\artifacts\release\wuictest'
}
$distDir = Join-Path $scriptDir 'dist\WuicSite\browser'

function Write-Step($msg) { Write-Host "`n--- $msg" -ForegroundColor Cyan }

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

$remoteSite = "${User}@${Server}:${SitePath}"
Write-Host "  scp $distDir/* -> $remoteSite"

# Use robocopy over UNC if on same Windows network, else scp
$uncPath = "\\${Server}\$($SitePath -replace ':', '$')"
if (Test-Path $uncPath -ErrorAction SilentlyContinue) {
    Write-Host "  Modalita' UNC: $uncPath" -ForegroundColor DarkGray
    robocopy $distDir $uncPath /MIR /NJH /NJS /NDL /NP /R:2 /W:1
    if ($LASTEXITCODE -ge 8) { throw "robocopy sito fallito (exit code $LASTEXITCODE)" }
} else {
    Write-Host "  Modalita' SCP" -ForegroundColor DarkGray
    scp -r "${distDir}/*" "${remoteSite}/"
    if ($LASTEXITCODE -ne 0) { throw "scp sito fallito" }
}
Write-Host "  [ok] Sito caricato" -ForegroundColor Green

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
