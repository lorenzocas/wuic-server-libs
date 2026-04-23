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

.PARAMETER SkipAppPoolCycle
  Legacy flag, mantenuto per backwards-compat ma ignorato: il nuovo flow
  non cicla piu' l'AppPool (usa invece lo swap atomico di web.config per
  attivare/disattivare la maintenance page).

.PARAMETER SkipMaintenancePage
  Se specificato, salta completamente la maintenance mode durante l'upload
  del sito. SCP scrive direttamente sui file mentre IIS continua a servirli
  live. Usare solo per hotfix veloci o quando si sa che non ci sono visitatori.
  Con questo flag il rischio di file-lock/sharing violations durante lo SCP
  torna a essere reale, seppur basso.

.EXAMPLE
  pwsh deploy-site.ps1 -Server vps123.contabo.de
  pwsh deploy-site.ps1 -Server vps123.contabo.de -SkipBuild -SkipZip
  pwsh deploy-site.ps1 -Server vps123.contabo.de -SkipMaintenancePage  # hotfix mode
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
    [switch]$SkipAppPoolCycle,
    [switch]$SkipMaintenancePage
)

$ErrorActionPreference = 'Stop'
$scriptDir = $PSScriptRoot

# ── resolve defaults ─────────────────────────────────────────────────

if (-not $ZipSourceDir) {
    $ZipSourceDir = Join-Path $scriptDir '..\KonvergenceCore\artifacts\release\wuictest'
}
$distDir = Join-Path $scriptDir 'dist\WuicSite\browser'

function Write-Step($msg) {
    $ts = (Get-Date).ToString('HH:mm:ss')
    Write-Host "`n--- [$ts] $msg" -ForegroundColor Cyan
}
function Write-Sub($msg) {
    $ts = (Get-Date).ToString('HH:mm:ss')
    Write-Host "    [$ts] $msg" -ForegroundColor DarkGray
}

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

function ConvertTo-ScpRemotePath {
    <#
    .SYNOPSIS
        scp Windows-to-Windows (OpenSSH) vuole forward slash nel remote path
        ('C:/inetpub/...'). Un backslash viene interpretato come escape dalla
        shell remota e scp emette "No such file or directory" silenziosamente.
        Questa funzione sostituisce '\' -> '/' nel path per farlo digerire.
    #>
    param([Parameter(Mandatory = $true)][string]$Path)
    return ($Path -replace '\\', '/')
}

function ConvertTo-ZipMeta {
    <#
    .SYNOPSIS
        Parse un filename ZIP del formato
        WuicTest-<audience>-[tutorial(-bak)-]server-<serverVer>[-rag]-client-<clientVer>.zip
        in hashtable {audience, rag, tutorial, serverVersion, clientVersion, key}.
        audience: 'src' | 'iis'
        tutorial: 'no' | 'SQL' | 'BAK'
        Ritorna $null se il nome non matcha il pattern.
    #>
    param([Parameter(Mandatory = $true)][string]$FileName)
    if ($FileName -notmatch 'WuicTest-(iis|src)(?:-(tutorial(?:-bak)?))?-server-([^-]+?)(-rag)?-client-(.+)\.zip$') {
        return $null
    }
    $audience = $Matches[1]
    $tutorialRaw = $Matches[2]
    $serverVer = $Matches[3]
    $rag = [bool]$Matches[4]
    $clientVer = $Matches[5]
    $tutorial = switch ($tutorialRaw) {
        'tutorial' { 'SQL' }
        'tutorial-bak' { 'BAK' }
        default { 'no' }
    }
    return @{
        audience      = $audience
        rag           = $rag
        tutorial      = $tutorial
        serverVersion = $serverVer
        clientVersion = $clientVer
        key           = "v${serverVer}_${clientVer}"
    }
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
        # Invoke the local ng binary directly. `npx ng build` was used here in the
        # past but hangs indefinitely in non-interactive pwsh sessions (observed
        # 2026-04-22: 11 min wall time, 0.2s CPU, zero child processes).
        # The local binary bypasses npx's module resolver and just works.
        $ngCmd = Join-Path $scriptDir 'node_modules\.bin\ng.cmd'
        if (-not (Test-Path $ngCmd)) { throw "ng binary not found at $ngCmd - run 'npm install' first" }
        Write-Sub "exec: $ngCmd build --configuration=production"
        & $ngCmd build --configuration=production
        if ($LASTEXITCODE -ne 0) { throw "ng build failed (exit $LASTEXITCODE)" }
        Write-Sub "ng build ok"
    } finally { Pop-Location }
} else {
    Write-Step "1/3 Build Angular [SKIP]"
}

if (-not (Test-Path $distDir)) {
    throw "dist non trovata in $distDir — esegui prima la build"
}

# ── step 2: upload site ──────────────────────────────────────────────
#
# ZERO-DOWNTIME MAINTENANCE STRATEGY
#
# We NO LONGER stop the IIS AppPool. Instead, we swap the live `web.config`
# with a maintenance-mode one (`web.config.maintenance`) that rewrites every
# incoming request to `/maintenance.html`. While the swap is active:
#
#   * Visitors see a friendly "We'll be back shortly" page (static HTML,
#     inline CSS, no external deps — served directly by IIS)
#   * The bundled Angular assets (`*.js`, `*.css`, `index.html` of the old
#     site) are NOT served by IIS, so SCP can overwrite them with zero
#     risk of file-sharing violations
#   * `maintenance.html` is the only file being served, and it is NOT in
#     the SCP scope (it sits at the site root but we only upload the
#     `dist/WuicSite/browser/` tree, which matches the Angular output —
#     maintenance.html is at a different path level)
#
# Flow:
#   1. pre-swap: upload maintenance.html + web.config.maintenance to the server
#   2. activate maintenance: remote script renames web.config <-> maintenance variant
#      IIS auto-reloads web.config (no AppPool restart), ~1s transition
#   3. SCP the new dist/WuicSite/browser/* as usual
#   4. deactivate maintenance: restore original web.config
#   5. health check
#
# The SkipAppPoolCycle flag is kept for backwards compatibility but has no
# effect with the new flow (we never cycle the pool). Use the new flag
# `SkipMaintenancePage` to bypass the maintenance swap and just SCP directly
# (accepts the small risk of file-lock collisions, useful for hotfixes).

Write-Step "2/3 Upload sito promozionale -> $Server"

$remoteUserHost = "${User}@${Server}"
$remoteSite = "${remoteUserHost}:${SitePath}"
Write-Host "  scp $distDir/* -> $remoteSite"

# Paths on the remote IIS server
$remoteWebConfig = Join-Path $SitePath 'web.config'
$remoteWebConfigBackup = Join-Path $SitePath 'web.config.production.bak'
$remoteWebConfigMaintenance = Join-Path $SitePath 'web.config.maintenance'
$remoteMaintenancePage = Join-Path $SitePath 'maintenance.html'

# Local source paths for the maintenance-mode files
$localMaintenanceHtml = Join-Path $scriptDir 'public\maintenance.html'
$localWebConfigMaintenance = Join-Path $scriptDir 'web.config.maintenance'

# ── 2a: activate maintenance page (web.config swap IN) ──────────────

if (-not $SkipMaintenancePage) {
    Write-Host "  [maint] Activating maintenance mode" -ForegroundColor DarkGray

    # First, make sure maintenance.html and web.config.maintenance exist on the remote.
    # We upload them unconditionally (idempotent — tiny files).
    if (-not (Test-Path $localMaintenanceHtml)) {
        throw "maintenance.html non trovato: $localMaintenanceHtml"
    }
    if (-not (Test-Path $localWebConfigMaintenance)) {
        throw "web.config.maintenance non trovato: $localWebConfigMaintenance"
    }
    scp $localMaintenanceHtml "${remoteUserHost}:${remoteMaintenancePage}"
    if ($LASTEXITCODE -ne 0) { throw "scp maintenance.html fallita (exit $LASTEXITCODE)" }
    scp $localWebConfigMaintenance "${remoteUserHost}:${remoteWebConfigMaintenance}"
    if ($LASTEXITCODE -ne 0) { throw "scp web.config.maintenance fallita (exit $LASTEXITCODE)" }

    # Atomic swap: back up current web.config, then make maintenance the active one.
    # IIS reloads web.config on change automatically — no AppPool restart needed.
    $activateMaintenanceScript = @"
if (Test-Path '$remoteWebConfig') {
    Move-Item -Path '$remoteWebConfig' -Destination '$remoteWebConfigBackup' -Force
}
Copy-Item -Path '$remoteWebConfigMaintenance' -Destination '$remoteWebConfig' -Force
Write-Host "    maintenance web.config active"
"@
    $code = Invoke-RemotePwsh -RemoteUserHost $remoteUserHost -Script $activateMaintenanceScript
    if ($code -ne 0) {
        throw "attivazione maintenance mode fallita (exit $code)"
    }
    Write-Host "  [ok] Maintenance mode attivo -> visitatori vedono maintenance.html" -ForegroundColor Green

    # Small grace period so IIS picks up the new web.config before we start rewriting
    # files that were being served.
    Start-Sleep -Seconds 2
} else {
    Write-Host "  [maint] SKIP (flag -SkipMaintenancePage) -> deploy diretto, rischio file-lock" -ForegroundColor Yellow
}

# ── 2b: upload new site ─────────────────────────────────────────────
#
# Wrapped in try/finally so that even if SCP fails we always deactivate
# maintenance mode (restore the previous web.config). We do NOT want to leave
# the site stuck showing the maintenance page because of a transient upload
# failure — better a half-rolled site than a permanently "under construction"
# message for real visitors.

$siteUploadOk = $false
try {
    $uncPath = "\\${Server}\$($SitePath -replace ':', '$')"
    if (Test-Path $uncPath -ErrorAction SilentlyContinue) {
        Write-Host "  Modalita' UNC: $uncPath" -ForegroundColor DarkGray
        robocopy $distDir $uncPath /MIR /NJH /NJS /NDL /NP /R:2 /W:1 /XF web.config web.config.maintenance web.config.production.bak maintenance.html
        if ($LASTEXITCODE -ge 8) { throw "robocopy sito fallito (exit code $LASTEXITCODE)" }
    } else {
        Write-Host "  Modalita' SCP" -ForegroundColor DarkGray
        scp -r "${distDir}/*" "${remoteSite}/"
        if ($LASTEXITCODE -ne 0) { throw "scp sito fallito (exit $LASTEXITCODE)" }
    }
    $siteUploadOk = $true
    Write-Host "  [ok] Sito caricato" -ForegroundColor Green
}
finally {
    # ── 2c: deactivate maintenance (web.config swap OUT) ────────────
    #
    # Difensiva a piu' strati:
    #   1. Usa Remove-Item esplicito prima di Rename-Item (evita edge-case del
    #      Move-Item -Force quando il dst e' "locked" da IIS worker o da un
    #      handler static che tiene l'handle aperto)
    #   2. Riprova fino a 3 volte con sleep crescente (1s/2s/3s)
    #   3. Dopo ogni tentativo verifica via Get-Content che il contenuto
    #      corrente sia quello di PRODUZIONE (cerca la stringa "Angular SPA
    #      Fallback" che esiste solo nel web.config prod) e NON quello di
    #      maintenance (cerca "MAINTENANCE variant" che esiste solo li').
    #      Ritorna exit code 2 se dopo i retry il web.config e' ancora la
    #      variante maintenance — chiamante logga come errore grave.
    if (-not $SkipMaintenancePage) {
        Write-Host "  [maint] Deactivating maintenance mode" -ForegroundColor DarkGray
        $deactivateMaintenanceScript = @"
`$ErrorActionPreference = 'Continue'
`$backup = '$remoteWebConfigBackup'
`$target = '$remoteWebConfig'

function Test-IsProductionConfig {
    param([string]`$Path)
    if (-not (Test-Path `$Path)) { return `$false }
    try {
        `$content = Get-Content -Path `$Path -Raw -ErrorAction Stop
        if (`$content -match 'MAINTENANCE variant') { return `$false }
        if (`$content -match 'Angular SPA Fallback') { return `$true }
        # Unknown content — be conservative and consider NOT production
        return `$false
    } catch {
        return `$false
    }
}

`$success = `$false
for (`$attempt = 1; `$attempt -le 3; `$attempt++) {
    Write-Host "    attempt `$attempt/3: restoring production web.config"
    try {
        # Remove current (maintenance) web.config explicitly, then rename the
        # backup into place. This two-step is more resilient than Move-Item -Force
        # against weird file-lock situations.
        if (Test-Path `$target) {
            Remove-Item -Path `$target -Force -ErrorAction Stop
        }
        if (Test-Path `$backup) {
            Rename-Item -Path `$backup -NewName 'web.config' -Force -ErrorAction Stop
        } else {
            Write-Host "    [warn] backup .bak non presente (attempt `$attempt)"
        }
    } catch {
        Write-Host "    [warn] errore attempt `$attempt: `$_"
    }
    # Verify the current state
    if (Test-IsProductionConfig -Path `$target) {
        Write-Host "    production web.config confirmed at attempt `$attempt"
        `$success = `$true
        break
    }
    Start-Sleep -Seconds `$attempt  # grow the backoff: 1s / 2s / 3s
}

if (-not `$success) {
    Write-Host "    [FATAL] web.config is NOT in production state after 3 attempts"
    # Last-resort: if backup still exists somewhere, try one more plain copy
    if (Test-Path `$backup) {
        try {
            Copy-Item -Path `$backup -Destination `$target -Force -ErrorAction Stop
            if (Test-IsProductionConfig -Path `$target) {
                Write-Host "    recovered via final Copy-Item fallback"
                `$success = `$true
            }
        } catch { Write-Host "    final fallback failed: `$_" }
    }
}

if (`$success) { exit 0 } else { exit 2 }
"@
        $code = Invoke-RemotePwsh -RemoteUserHost $remoteUserHost -Script $deactivateMaintenanceScript
        if ($code -ne 0) {
            Write-Host "  [WARN] deactivate maintenance exit=$code - web.config potrebbe essere ancora in maintenance" -ForegroundColor Red
            Write-Host "  [WARN] tento fallback: upload diretto del web.config di produzione" -ForegroundColor Yellow
            $localProductionWebConfig = Join-Path $scriptDir 'web.config'
            if (Test-Path $localProductionWebConfig) {
                scp $localProductionWebConfig "${remoteUserHost}:${remoteWebConfig}"
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  [ok] web.config di produzione ripristinato via SCP diretto" -ForegroundColor Green
                } else {
                    Write-Host "  [FATAL] impossibile ripristinare web.config — sito potrebbe essere stuck in maintenance" -ForegroundColor Red
                }
            } else {
                Write-Host "  [FATAL] web.config locale non trovato a $localProductionWebConfig" -ForegroundColor Red
            }
        } else {
            Write-Host "  [ok] Maintenance mode disattivato (verificato via content check)" -ForegroundColor Green
        }
    }
}

if (-not $siteUploadOk) { throw "Site upload failed (see errors above)" }

# Health check: hit the site via its real public hostname (IIS uses host-header bindings,
# so hitting the bare IP can return the wrong site or a 404). We also make sure we are
# NOT seeing the maintenance page (X-Maintenance response header).
$healthUrl = Get-HealthCheckUrl -Target $Server
Write-Host "  Health check $healthUrl" -ForegroundColor DarkGray
$ok = $false
for ($i = 0; $i -lt 10; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri $healthUrl -Method Head -SkipCertificateCheck -TimeoutSec 10 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            $isMaint = $false
            try { $isMaint = ($resp.Headers['X-Maintenance'] -contains 'true') } catch { }
            if ($isMaint) {
                Write-Host "  [warn] X-Maintenance ancora presente, retry..." -ForegroundColor Yellow
                Start-Sleep -Milliseconds 1000
                continue
            }
            $ok = $true ; break
        }
    } catch {
        Start-Sleep -Milliseconds 750
    }
}
if ($ok) {
    Write-Host "  [ok] Health check HTTP 200 ($healthUrl)" -ForegroundColor Green
} else {
    Write-Host "  [warn] Health check fallito dopo retry su $healthUrl - controlla IIS manualmente" -ForegroundColor Yellow
}

# ── step 3: upload ZIP artifacts ─────────────────────────────────────

if (-not $SkipZip) {
    Write-Step "3/3 Upload pacchetti ZIP (con rotation 5 release)"

    $zipFiles = Get-ChildItem -Path $ZipSourceDir -Filter '*.zip' -ErrorAction SilentlyContinue
    if (-not $zipFiles -or $zipFiles.Count -eq 0) {
        Write-Host "  [skip] Nessun ZIP trovato in $ZipSourceDir" -ForegroundColor Yellow
    } else {
        $remoteDownloads = Join-Path $SitePath 'downloads'
        $uncDownloads = "\\${Server}\$($remoteDownloads -replace ':', '$')"

        # Estrai versione corrente dai nomi file (server+client sono nel filename).
        # Tutti gli ZIP del batch hanno la stessa versione (li produce la stessa pipeline).
        $serverVersion = ''
        $clientVersion = ''
        foreach ($z in $zipFiles) {
            if ($z.Name -match 'server-([^-]+(?:-rag)?)-client-(.+)\.zip$') {
                $serverVersion = ($Matches[1] -replace '-rag$', '')
                $clientVersion = $Matches[2]
                break
            }
        }
        $releaseKey = "v${serverVersion}_${clientVersion}"
        Write-Host "  release key: $releaseKey" -ForegroundColor DarkGray
        Write-Host "  $($zipFiles.Count) ZIP da caricare:" -ForegroundColor DarkGray
        foreach ($z in $zipFiles) {
            Write-Host "    $($z.Name) ($([math]::Round($z.Length / 1MB, 1)) MB)" -ForegroundColor DarkGray
        }

        # Assicura che la cartella remota esista (incluso archive/<newKey>/)
        # e sposta ogni ZIP gia' presente in /downloads/ che NON appartiene
        # alla release corrente nella sua sottocartella /archive/<oldKey>/.
        # Questo tiene /downloads/ root "solo latest" e preserva le release
        # precedenti sotto /archive/ senza bisogno di ridurre la pipeline.
        #
        # NOTA sintassi: `ssh ... "if not exist mkdir"` (CMD) non funziona perche'
        # OpenSSH sul server IIS usa PowerShell come shell di default
        # (verificato: i comandi remoti emettono CLIXML). Usiamo Invoke-RemotePwsh
        # che manda il codice via -EncodedCommand a powershell.exe.
        $useUnc = [bool](Test-Path $uncDownloads -ErrorAction SilentlyContinue)
        $remoteDownloadsPath = "${User}@${Server}:${remoteDownloads}"
        $remoteArchiveDir = Join-Path $remoteDownloads 'archive'
        $remoteNewArchiveDir = Join-Path $remoteArchiveDir $releaseKey

        if ($useUnc) {
            Write-Sub "modalita' UNC: prep cartelle archive"
            foreach ($dir in @($uncDownloads, (Join-Path $uncDownloads 'archive'))) {
                if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
            }
            # Move old .zip in /downloads/ root (non-current) into /archive/<oldKey>/
            $newNamesSet = @{}
            foreach ($z in $zipFiles) { $newNamesSet[$z.Name] = $true }
            Get-ChildItem -LiteralPath $uncDownloads -Filter '*.zip' -File -ErrorAction SilentlyContinue | ForEach-Object {
                if ($newNamesSet.ContainsKey($_.Name)) { return }
                if ($_.Name -match 'server-([^-]+?)(?:-rag)?-client-(.+)\.zip$') {
                    $oldKey = "v$($Matches[1])_$($Matches[2])"
                    $destDir = Join-Path $uncDownloads "archive\$oldKey"
                    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
                    $destFile = Join-Path $destDir $_.Name
                    Move-Item -LiteralPath $_.FullName -Destination $destFile -Force
                    Write-Sub "moved $($_.Name) -> archive/$oldKey/"
                } else {
                    Write-Sub "[warn] filename non parsabile: $($_.Name) (lasciato in /downloads/)"
                }
            }
        } else {
            # Remote side: unico roundtrip ssh per mkdir + move-vecchi-in-archive
            # + dump di uno snapshot JSON dello stato /archive/* (per ricostruire le
            # entry storiche in releases.json anche se il file remoto era vuoto/malformato).
            Write-Sub "prep cartelle archive remote + move ZIP di release precedenti..."
            $newNamesLiteral = ($zipFiles | ForEach-Object { "'" + ($_.Name -replace "'", "''") + "'" }) -join ','
            if (-not $newNamesLiteral) { $newNamesLiteral = "''" }  # defensive: never empty array literal
            $remoteArchiveStateFile = Join-Path $remoteDownloads '.archive-state.json'
            $prepScript = @"
`$ErrorActionPreference = 'Stop'
`$downloads   = '$remoteDownloads'
`$archiveRoot = '$remoteArchiveDir'
`$stateFile   = '$remoteArchiveStateFile'
`$newNames    = @($newNamesLiteral)
New-Item -ItemType Directory -Force -Path `$archiveRoot | Out-Null
`$moved = @{}
Get-ChildItem -LiteralPath `$downloads -Filter '*.zip' -File -ErrorAction SilentlyContinue | ForEach-Object {
    if (`$newNames -contains `$_.Name) { return }
    if (`$_.Name -match 'server-([^-]+?)(?:-rag)?-client-(.+)\.zip$') {
        `$oldKey = 'v' + `$Matches[1] + '_' + `$Matches[2]
        `$dest   = Join-Path `$archiveRoot `$oldKey
        New-Item -ItemType Directory -Force -Path `$dest | Out-Null
        Move-Item -LiteralPath `$_.FullName -Destination (Join-Path `$dest `$_.Name) -Force
        if (-not `$moved.ContainsKey(`$oldKey)) { `$moved[`$oldKey] = 0 }
        `$moved[`$oldKey]++
    } else {
        Write-Host "  [warn] filename non parsabile: `$(`$_.Name), lasciato in /downloads/"
    }
}
foreach (`$k in `$moved.Keys) { Write-Host "  moved `$(`$moved[`$k]) file(s) -> archive/`$k/" }
if (`$moved.Count -eq 0) { Write-Host "  nessuna release precedente da spostare" }

# Dump snapshot dello stato /archive/* per merge in releases.json sul lato dev.
`$state = @{}
Get-ChildItem -LiteralPath `$archiveRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    `$keyDir = `$_
    `$files = @(Get-ChildItem -LiteralPath `$keyDir.FullName -Filter '*.zip' -File -ErrorAction SilentlyContinue | ForEach-Object {
        [ordered]@{
            name     = `$_.Name
            size     = `$_.Length
            modified = `$_.LastWriteTimeUtc.ToString('o')
        }
    })
    if (`$files.Count -gt 0) {
        `$mostRecent = (`$files | ForEach-Object { [datetime]`$_.modified } | Sort-Object -Descending)[0]
        `$state[`$keyDir.Name] = [ordered]@{
            files = `$files
            date  = `$mostRecent.ToString('yyyy-MM-dd')
        }
    }
}
`$state | ConvertTo-Json -Depth 6 | Set-Content -Path `$stateFile -Encoding UTF8
Write-Host "  archive snapshot scritto: `$stateFile (keys: `$(`$state.Keys.Count))"
"@
            $code = Invoke-RemotePwsh -RemoteUserHost $remoteUserHost -Script $prepScript
            if ($code -ne 0) { throw "step 3: prep archive remoto fallita (exit $code)" }
        }

        # Upload nuovi ZIP in /downloads/ root (latest). La copia "archive" della
        # release corrente NON si carica qui: al prossimo deploy questi stessi
        # file verranno spostati da /downloads/ a /archive/<releaseKey>/ dallo
        # step di move sopra, senza ri-trasferire byte via rete.
        Write-Sub "upload ZIP -> /downloads/ (latest)"
        if ($useUnc) {
            foreach ($z in $zipFiles) {
                Write-Sub "  $($z.Name) ($([math]::Round($z.Length/1MB,1)) MB)"
                Copy-Item $z.FullName (Join-Path $uncDownloads $z.Name) -Force
            }
        } else {
            foreach ($z in $zipFiles) {
                Write-Sub "  $($z.Name) ($([math]::Round($z.Length/1MB,1)) MB)"
                scp $z.FullName "${remoteDownloadsPath}/$($z.Name)"
                if ($LASTEXITCODE -ne 0) { throw "scp /downloads/$($z.Name) fallita (exit $LASTEXITCODE)" }
            }
        }

        # Costruisci la release entry per releases.json (current release)
        $filesMeta = @()
        foreach ($z in $zipFiles) {
            $meta = ConvertTo-ZipMeta -FileName $z.Name
            if ($null -eq $meta) {
                Write-Sub "[warn] filename non parsabile: $($z.Name), skip metadata"
                continue
            }
            $sizeMb = [math]::Round($z.Length / 1MB, 1)
            $filesMeta += @{
                name       = $z.Name
                audience   = $meta.audience
                rag        = $meta.rag
                tutorial   = $meta.tutorial
                size       = "$sizeMb MB"
                sizeMb     = $sizeMb
                url        = "/downloads/$($z.Name)"
                archiveUrl = "/downloads/archive/$releaseKey/$($z.Name)"
            }
        }

        $newRelease = [ordered]@{
            key            = $releaseKey
            server         = $serverVersion
            client         = $clientVersion
            date           = (Get-Date -Format 'yyyy-MM-dd')
            timestampUtc   = (Get-Date).ToUniversalTime().ToString('o')
            files          = $filesMeta
        }

        # Merge con releases.json remoto esistente (se c'e'). Facciamo mirror
        # locale via scp in una cartella temporanea prima di modificare.
        $tmpDir = Join-Path $env:TEMP "wuicsite-releases-$([guid]::NewGuid().ToString('N').Substring(0,8))"
        New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
        $remoteReleasesJson = Join-Path $remoteDownloads 'releases.json'
        $localReleasesJson = Join-Path $tmpDir 'releases.json'

        $existingReleases = @()
        if ($useUnc) {
            $uncReleasesJson = Join-Path $uncDownloads 'releases.json'
            if (Test-Path $uncReleasesJson) {
                try {
                    $existingReleases = (Get-Content $uncReleasesJson -Raw | ConvertFrom-Json).releases
                    if ($null -eq $existingReleases) { $existingReleases = @() }
                } catch { Write-Host "  [warn] releases.json remoto malformato, ricostruisco da zero" -ForegroundColor Yellow }
            }
        } else {
            # Tentativo non-bloccante di scaricare il releases.json corrente
            $remoteReleasesJsonScp = ConvertTo-ScpRemotePath $remoteReleasesJson
            & scp "${User}@${Server}:${remoteReleasesJsonScp}" $localReleasesJson 2>$null | Out-Null
            if (Test-Path $localReleasesJson) {
                try {
                    $existingReleases = (Get-Content $localReleasesJson -Raw | ConvertFrom-Json).releases
                    if ($null -eq $existingReleases) { $existingReleases = @() }
                } catch { Write-Host "  [warn] releases.json remoto malformato, ricostruisco da zero" -ForegroundColor Yellow }
            }
        }

        # Cast a lista (PowerShell ConvertFrom-Json ritorna PSCustomObject[] o singolo obj)
        if ($existingReleases -and $existingReleases -isnot [array]) { $existingReleases = @($existingReleases) }

        # Rimuovi eventuale duplicato della stessa release-key (ri-deploy della stessa versione)
        $existingReleases = @($existingReleases | Where-Object { $_.key -ne $releaseKey })

        # Scarica lo snapshot archive-state.json scritto dal prep script remoto
        # e ricostruisci synthetic ReleaseEntry per le key che lo script
        # ha trovato in /archive/ ma che mancano da releases.json remoto. Questo
        # copre il caso in cui releases.json era vuoto/stale (es. primo deploy
        # dopo il fix pipeline): il filesystem server e' l'authoritative source.
        if (-not $useUnc) {
            $localArchiveState = Join-Path $tmpDir 'archive-state.json'
            $remoteArchiveStateFileScp = ConvertTo-ScpRemotePath $remoteArchiveStateFile
            & scp "${User}@${Server}:${remoteArchiveStateFileScp}" $localArchiveState 2>$null | Out-Null
            if (Test-Path $localArchiveState) {
                try {
                    $archiveStateRaw = Get-Content $localArchiveState -Raw | ConvertFrom-Json
                    $existingKeys = @{}
                    foreach ($r in $existingReleases) { if ($r.key) { $existingKeys[$r.key] = $true } }
                    $existingKeys[$releaseKey] = $true  # evita doppione della new release
                    $synthesized = 0
                    # ConvertFrom-Json produce PSCustomObject con proprieta' dinamiche
                    foreach ($prop in $archiveStateRaw.PSObject.Properties) {
                        $oldKey = $prop.Name
                        if ($existingKeys.ContainsKey($oldKey)) { continue }
                        $entry = $prop.Value
                        # Parse server/client dal nome key: "vS.S.S_C.C.C"
                        if ($oldKey -notmatch '^v(.+)_(.+)$') { continue }
                        $sVer = $Matches[1]
                        $cVer = $Matches[2]
                        $syntheticFiles = @()
                        foreach ($f in @($entry.files)) {
                            $meta = ConvertTo-ZipMeta -FileName $f.name
                            if ($null -eq $meta) { continue }
                            $szMb = [math]::Round($f.size / 1MB, 1)
                            $syntheticFiles += @{
                                name       = $f.name
                                audience   = $meta.audience
                                rag        = $meta.rag
                                tutorial   = $meta.tutorial
                                size       = "$szMb MB"
                                sizeMb     = $szMb
                                url        = "/downloads/archive/$oldKey/$($f.name)"
                                archiveUrl = "/downloads/archive/$oldKey/$($f.name)"
                            }
                        }
                        if ($syntheticFiles.Count -eq 0) { continue }
                        $existingReleases += [ordered]@{
                            key          = $oldKey
                            server       = $sVer
                            client       = $cVer
                            date         = if ($entry.date) { $entry.date } else { (Get-Date -Format 'yyyy-MM-dd') }
                            timestampUtc = (Get-Date).ToUniversalTime().ToString('o')
                            files        = $syntheticFiles
                        }
                        $existingKeys[$oldKey] = $true
                        $synthesized++
                    }
                    if ($synthesized -gt 0) {
                        Write-Sub "releases.json: ricostruite $synthesized release da /archive/* snapshot"
                    }
                } catch {
                    Write-Host "  [warn] archive-state.json malformato, skip ricostruzione storica: $($_.Exception.Message)" -ForegroundColor Yellow
                }
            }
            # Ordina le release esistenti per timestampUtc/date DESC (piu' recente prima)
            # per mantenere l'ordine corretto dopo l'inserimento delle synthetic.
            $existingReleases = @($existingReleases | Sort-Object -Property @{Expression = { if ($_.timestampUtc) { [datetime]$_.timestampUtc } else { [datetime]$_.date } }; Descending = $true })
        }

        # Inserisci nuova release in testa, taglia a max 5
        $all = @($newRelease) + @($existingReleases)
        $keep = @($all | Select-Object -First 5)
        $drop = @($all | Select-Object -Skip 5)

        # Cleanup archivio: cancella le release "drop" dal server.
        # Come sopra, OpenSSH usa PowerShell, non CMD → Remove-Item invece di rmdir.
        if ($drop.Count -gt 0) {
            Write-Sub "rotation: elimino $($drop.Count) release obsolete"
            $dropKeys = @($drop | ForEach-Object { if ($_.key) { $_.key } else { "v$($_.server)_$($_.client)" } })
            foreach ($k in $dropKeys) { Write-Sub "  - $k" }
            if ($useUnc) {
                foreach ($k in $dropKeys) {
                    $dir = Join-Path $uncDownloads "archive\$k"
                    if (Test-Path $dir) { Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue }
                }
            } else {
                $dropLiteral = ($dropKeys | ForEach-Object { "'" + ($_ -replace "'", "''") + "'" }) -join ','
                if (-not $dropLiteral) { $dropLiteral = "''" }
                $rotScript = @"
`$archiveRoot = '$remoteArchiveDir'
`$keys = @($dropLiteral)
foreach (`$k in `$keys) {
    if (-not `$k) { continue }
    `$dir = Join-Path `$archiveRoot `$k
    if (Test-Path -LiteralPath `$dir) {
        Remove-Item -LiteralPath `$dir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  deleted archive/`$k/"
    }
}
"@
                Invoke-RemotePwsh -RemoteUserHost $remoteUserHost -Script $rotScript | Out-Null
            }
        }

        # Serializza releases.json (massimo 5)
        $manifest = @{
            latest   = $keep[0].key
            updated  = (Get-Date).ToUniversalTime().ToString('o')
            releases = $keep
        }
        $manifestJson = $manifest | ConvertTo-Json -Depth 6
        Set-Content -Path $localReleasesJson -Value $manifestJson -Encoding UTF8

        # Upload releases.json
        if ($useUnc) {
            Copy-Item $localReleasesJson (Join-Path $uncDownloads 'releases.json') -Force
        } else {
            scp $localReleasesJson "${remoteDownloadsPath}/releases.json"
        }

        # Backward-compat: scrivi anche latest.json (vecchio formato, pagina
        # attuale puo' fallback a questo se releases.json non esiste)
        $legacy = @{
            server = $serverVersion
            client = $clientVersion
            date   = $newRelease.date
            files  = $filesMeta
        }
        $legacyJson = $legacy | ConvertTo-Json -Depth 3
        $localLatestJson = Join-Path $tmpDir 'latest.json'
        Set-Content -Path $localLatestJson -Value $legacyJson -Encoding UTF8
        if ($useUnc) {
            Copy-Item $localLatestJson (Join-Path $uncDownloads 'latest.json') -Force
        } else {
            scp $localLatestJson "${remoteDownloadsPath}/latest.json"
        }

        # Cleanup temp
        Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue

        Write-Host "  [ok] release $releaseKey pubblicata ($($keep.Count) release totali in archivio)" -ForegroundColor Green
    }
} else {
    Write-Step "3/3 Upload pacchetti ZIP [SKIP]"
}

# ── done ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Deploy completato su $Server" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
