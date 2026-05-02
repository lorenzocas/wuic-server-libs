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

.PARAMETER SkipApi
  Se specificato, salta build + deploy del progetto WuicSiteApi (.NET).
  L'API e' la sub-app `/api` che gestisce server-side la create/capture
  PayPal (vedi WuicSite/api/Program.cs) tenendo il Client SECRET fuori
  dal browser bundle. Usare quando si sta lavorando solo sul sito statico.

.PARAMETER SkipLinuxTarball
  Se specificato, NON carica il tarball Linux x64 (output di
  deploy-release.ps1 -GenerateLinuxTarball) sul server. Default: lo carica
  in `<SitePath>\releases\v<version>\` + mirror in `<SitePath>\releases\latest\`.
  Il tarball e' un asset NASCOSTO: NON viene linkato dal sito promozionale,
  NON entra in releases.json/latest.json. E' raggiungibile solo via URL
  diretto (https://wuic-framework.com/releases/latest/wuic-framework-linux-x64.tar.gz)
  ed e' consumato dallo script bash one-liner ospitato a /install.sh.

.PARAMETER LinuxTarballSourceDir
  Cartella locale dove trovare il tarball linux. Default:
  ../KonvergenceCore/artifacts/release/linux/

.PARAMETER ReleaseNotesDir
  Cartella locale che contiene i file di release notes per ogni versione,
  multi-locale con naming convention
  `release-notes-v<server>_<client>.<localeCode>.md` dove <localeCode> e' uno
  dei codici supportati dal sito: `it-IT`, `en-US`, `de-DE`, `es-ES`, `fr-FR`
  (vedi src/app/services/language.service.ts). Esempi:
  `release-notes-v1.0.19_1.0.19.it-IT.md`, `release-notes-v1.0.19_1.0.19.en-US.md`.
  Per ogni locale trovata, lo script converte il .md in .html (con lang
  attribute + back-link tradotti) e lo carica sotto
  `<SitePath>\downloads\release-notes\release-notes-<key>.<locale>.html`.
  La release entry in `releases.json` riceve `releaseNotesUrls` (mappa
  locale -> url) + `releaseNotesUrl` (singolare, backward-compat = it-IT URL
  se presente, altrimenti prima locale disponibile).
  Backward-compat: il file legacy senza suffisso locale (`release-notes-<key>.md`)
  e' accettato come variante it-IT. Se nessuna locale viene trovata per
  la `releaseKey` corrente, emette warning ma non fallisce. Skippato se
  `-SkipZip`. Default: `release-notes/` accanto a questo script.

.PARAMETER LocalOnly
  Modalita' DRY-RUN per dev preview: NON tocca il server remoto, NON fa
  SCP/SSH/UNC/iisreset/maintenance swap. Esegue SOLO la logica di
  composizione `releases.json` + lookup release notes, e scrive il risultato
  sotto `public/downloads/` del repo WuicSite cosi' il dev server (`ng serve`
  su port 4300) puo' visualizzare la nuova release nella pagina /downloads.
  Skip totale degli step Build, Site upload, Linux tarball. Lo step ZIP
  legge gli stessi ZIP da `$ZipSourceDir` e fa merge con il
  `public/downloads/releases.json` esistente (rotation simulata localmente,
  max 5 release). Use case: previsualizzare il rendering prima di
  deployare in produzione.

.EXAMPLE
  pwsh deploy-site.ps1 -Server vps123.contabo.de
  pwsh deploy-site.ps1 -Server vps123.contabo.de -SkipBuild -SkipZip
  pwsh deploy-site.ps1 -Server vps123.contabo.de -SkipMaintenancePage  # hotfix mode
  pwsh deploy-site.ps1 -Server vps123.contabo.de -SkipApi              # solo sito statico
#>
param(
    [string]$Server = '',
    [string]$User = 'Administrator',
    [string]$SitePath = 'C:\inetpub\wwwroot\WuicSite',
    [string]$ZipSourceDir = '',
    [string]$AppPoolName = 'WuicSitePool',
    [switch]$SkipBuild,
    [switch]$SkipZip,
    [switch]$SkipAppPoolCycle,
    [switch]$SkipMaintenancePage,
    [switch]$SkipApi,
    [switch]$SkipLinuxTarball,
    [string]$LinuxTarballSourceDir = '',
    [string]$ReleaseNotesDir = '',
    [string]$InstallScriptPath = '',
    [switch]$LocalOnly
)

# Validate Server requirement (mandatory unless LocalOnly)
if (-not $LocalOnly -and -not $Server) {
    throw "Parameter -Server is required (omit only when -LocalOnly is set)."
}

$ErrorActionPreference = 'Stop'
$scriptDir = $PSScriptRoot

# ── resolve defaults ─────────────────────────────────────────────────

if (-not $ZipSourceDir) {
    $ZipSourceDir = Join-Path $scriptDir '..\KonvergenceCore\artifacts\release\wuictest'
}
if (-not $LinuxTarballSourceDir) {
    $LinuxTarballSourceDir = Join-Path $scriptDir '..\KonvergenceCore\artifacts\release\linux'
}
if (-not $ReleaseNotesDir) {
    $ReleaseNotesDir = Join-Path $scriptDir 'release-notes'
}
if (-not $InstallScriptPath) {
    $InstallScriptPath = Join-Path $scriptDir '..\KonvergenceCore\scripts\install.sh'
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
# In LocalOnly mode forziamo SkipBuild (la build Angular non serve per
# popolare public/downloads/ — il dev server gia' compila al volo).
if ($LocalOnly) { $SkipBuild = $true }


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

        # Cache invalidation for `public/` asset changes (2026-04-24):
        # esbuild/@angular/build fa cache fingerprinting sul contenuto degli
        # input .ts/.html/.scss, ma NON rileva affidabilmente nuovi file
        # aggiunti in `public/` (es. screenshots mirrorati da `docs:build`).
        # Sintomo: dist contiene la versione vecchia di `assets/**`, il deploy
        # carica asset stantii e il CDN pubblica 404 sui file nuovi.
        # Fix: se un file in `public/` e' piu' recente dell'index.html in dist,
        # cancella `dist/` + la cache Angular cosi' il prossimo build ricopi
        # tutti gli asset da zero. Idempotente: se niente e' cambiato, noop.
        $publicDir = Join-Path $scriptDir 'public'
        $distIndex = Join-Path $distDir 'index.html'
        if ((Test-Path $publicDir) -and (Test-Path $distIndex)) {
            $distStamp = (Get-Item $distIndex).LastWriteTimeUtc
            $stalePublic = Get-ChildItem -Path $publicDir -Recurse -File -ErrorAction SilentlyContinue |
                Where-Object { $_.LastWriteTimeUtc -gt $distStamp } | Select-Object -First 1
            if ($stalePublic) {
                Write-Sub "public/ newer than dist (e.g. $($stalePublic.Name)) -> clean rebuild"
                $distRoot = Split-Path -Parent $distDir
                if (Test-Path $distRoot) { Remove-Item -Recurse -Force $distRoot }
                $ngCache = Join-Path $scriptDir '.angular\cache'
                if (Test-Path $ngCache) { Remove-Item -Recurse -Force $ngCache }
            }
        }

        # Run the same generators package.json wires up as `prebuild`. We
        # invoke ng directly (not `npm run build`) for performance reasons
        # — but that also skips npm's pre/postbuild hooks, so we have to
        # call the scripts ourselves to keep public/sitemap.xml and
        # public/blog-manifest.json fresh at each deploy. Skipping these
        # ships stale artifacts (e.g. last week's blog post list).
        Write-Sub "prebuild: regenerating sitemap.xml + blog-manifest.json"
        & node 'scripts/generate-sitemap.mjs'
        if ($LASTEXITCODE -ne 0) { throw "generate-sitemap.mjs failed (exit $LASTEXITCODE)" }
        & node 'scripts/generate-blog-manifest.mjs'
        if ($LASTEXITCODE -ne 0) { throw "generate-blog-manifest.mjs failed (exit $LASTEXITCODE)" }

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

# LocalOnly: skip dell'intero step 2 (upload sito + maintenance) — non
# tocchiamo niente di remoto in dry-run dev.
if ($LocalOnly) {
    Write-Step "2/3 Upload sito promozionale [SKIP — LocalOnly mode]"
} else {
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

    # Upload the LATEST production web.config from the repo BEFORE the swap.
    # This way the backup snapshot taken in the next step contains the new
    # file, and the post-deploy restore brings it back live. Without this
    # step the deploy never updates web.config: the swap preserves whatever
    # was on the server at install time, so changes to the SPA-fallback /
    # API-passthrough rules made in the repo never take effect on prod.
    $localProductionWebConfig = Join-Path $scriptDir 'web.config'
    if (Test-Path $localProductionWebConfig) {
        scp $localProductionWebConfig "${remoteUserHost}:${remoteWebConfig}"
        if ($LASTEXITCODE -ne 0) { throw "scp production web.config fallita (exit $LASTEXITCODE)" }
        Write-Host "    production web.config aggiornato dal repo" -ForegroundColor DarkGray
    }

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

    # ── 2c-bis: build + upload .NET API (server-side PayPal capture) ──
    #
    # Il progetto WuicSite/api/ e' un minimal API .NET 10 che gestisce
    # server-side la creazione e la cattura degli ordini PayPal — vedi
    # WuicSite/api/Program.cs. Viene deployato come sub-application IIS
    # `/api` (physical path: $SitePath\api). Il file appsettings.json
    # NON viene sovrascritto: contiene il Client SECRET PayPal, e' "server-managed".
    #
    # Per rilasciare i lock sulle DLL usiamo il pattern app_offline.htm:
    # AspNetCoreModuleV2 lo rileva automaticamente e shutdown il worker
    # process, liberando i file. Dopo lo SCP rimuoviamo il file e
    # AspNetCoreModuleV2 riavvia il worker.
    if (-not $SkipApi) {
        $apiSrcDir = Join-Path $scriptDir 'api'
        if (Test-Path $apiSrcDir) {
            Write-Host "  [api] Build + deploy WuicSiteApi (.NET 10)" -ForegroundColor DarkGray

            # publish locale in cartella temp dedicata (resta utile per debug)
            $apiPublishDir = Join-Path $scriptDir 'dist\api-publish'
            if (Test-Path $apiPublishDir) { Remove-Item $apiPublishDir -Recurse -Force }
            New-Item -ItemType Directory -Path $apiPublishDir -Force | Out-Null

            Push-Location $apiSrcDir
            try {
                Write-Sub "dotnet publish -c Release -o $apiPublishDir"
                & dotnet publish -c Release -o $apiPublishDir --nologo /p:PublishProfile=
                if ($LASTEXITCODE -ne 0) { throw "dotnet publish API fallito (exit $LASTEXITCODE)" }
            } finally { Pop-Location }

            # NEVER overwrite appsettings.json on the server: contiene
            # i Client SECRET (sandbox + live) configurati a mano in deploy iniziale.
            $localProdSettings = Join-Path $apiPublishDir 'appsettings.json'
            if (Test-Path $localProdSettings) { Remove-Item $localProdSettings -Force }

            $remoteApiPath = Join-Path $SitePath 'api'

            # Step 1: garantisci che la cartella esista, scrivi app_offline.htm
            $offlineScript = @"
`$apiPath = '$remoteApiPath'
if (-not (Test-Path `$apiPath)) {
    New-Item -ItemType Directory -Force -Path `$apiPath | Out-Null
    Write-Host "    [api] cartella api/ creata: `$apiPath"
}
Set-Content -Path (Join-Path `$apiPath 'app_offline.htm') -Value '<h1>API deploying</h1>' -Encoding UTF8
Write-Host "    [api] app_offline.htm scritto, attendo 2s shutdown worker"
Start-Sleep -Seconds 2
"@
            $code = Invoke-RemotePwsh -RemoteUserHost $remoteUserHost -Script $offlineScript
            if ($code -ne 0) { throw "[api] preparazione cartella remota fallita (exit $code)" }

            # Step 2: SCP del publish output (modalita' UNC se supportata, altrimenti SCP)
            $uncApiPath = "\\${Server}\$($remoteApiPath -replace ':', '$')"
            if (Test-Path $uncApiPath -ErrorAction SilentlyContinue) {
                Write-Sub "[api] modalita' UNC: $uncApiPath"
                # Skip appsettings.json (server-managed)
                robocopy $apiPublishDir $uncApiPath /MIR /NJH /NJS /NDL /NP /R:2 /W:1 /XF appsettings.json app_offline.htm
                if ($LASTEXITCODE -ge 8) { throw "[api] robocopy fallito (exit $LASTEXITCODE)" }
            } else {
                Write-Sub "[api] modalita' SCP -> ${remoteUserHost}:${remoteApiPath}"
                scp -r "${apiPublishDir}/*" "${remoteUserHost}:${remoteApiPath}/"
                if ($LASTEXITCODE -ne 0) { throw "[api] scp fallito (exit $LASTEXITCODE)" }
            }

            # Step 3: rimuovi app_offline.htm → AspNetCoreModuleV2 riavvia il worker
            $onlineScript = @"
`$f = Join-Path '$remoteApiPath' 'app_offline.htm'
if (Test-Path `$f) {
    Remove-Item -Path `$f -Force
    Write-Host "    [api] app_offline.htm rimosso, worker in restart"
}
"@
            $code = Invoke-RemotePwsh -RemoteUserHost $remoteUserHost -Script $onlineScript
            if ($code -ne 0) { Write-Host "  [warn] [api] rimozione app_offline.htm fallita (exit $code)" -ForegroundColor Yellow }

            Write-Host "  [ok] API deployata" -ForegroundColor Green
        } else {
            Write-Sub "[api] cartella api/ non trovata, skip"
        }
    } else {
        Write-Sub "[api] SKIP (-SkipApi)"
    }
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
        Write-Host "    [warn] errore attempt `${attempt}: `$_"
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

# API health check (non-fatal — se la sub-app /api non e' configurata in IIS,
# il path torna 404 / 500 ma il sito principale resta valido).
if (-not $SkipApi) {
    $apiHealthUrl = ($healthUrl.TrimEnd('/')) + "/api/health"
    Write-Host "  Health check $apiHealthUrl" -ForegroundColor DarkGray
    $apiOk = $false
    for ($i = 0; $i -lt 6; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri $apiHealthUrl -Method Get -SkipCertificateCheck -TimeoutSec 10 -ErrorAction Stop
            if ($resp.StatusCode -eq 200) { $apiOk = $true ; break }
        } catch { Start-Sleep -Milliseconds 1000 }
    }
    if ($apiOk) {
        Write-Host "  [ok] API health HTTP 200 ($apiHealthUrl)" -ForegroundColor Green
    } else {
        Write-Host "  [warn] API health fallito su $apiHealthUrl" -ForegroundColor Yellow
        Write-Host "         - se e' la prima volta, configura la sub-app IIS '/api' che punta a ${SitePath}\api" -ForegroundColor Yellow
        Write-Host "         - poi popola ${SitePath}\api\appsettings.json con i Client SECRET PayPal" -ForegroundColor Yellow
        Write-Host "         - vedi WuicSite/api/Program.cs per dettagli" -ForegroundColor Yellow
    }
}

} # end of LocalOnly skip for step 2

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
        # LocalOnly: salta TUTTA la prep + upload remota. Procediamo dritti
        # alla composizione manifest letta dal mirror locale.
        if ($LocalOnly) {
            Write-Sub "[LocalOnly] skip prep archive remoto + upload ZIP"
            $useUnc = $false
        }
        else {
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
        # Multi-locale: enumera tutti i file release-notes-<key>.*.{html,md}
        # presenti sotto /downloads/release-notes/ e popola la mappa
        # `releaseNotesUrls` (locale -> url). `releaseNotesUrl` (singolare)
        # e' backward-compat con priorita' it-IT, altrimenti prima locale
        # disponibile, altrimenti formato legacy single-locale.
        `$rnDir = Join-Path `$downloads 'release-notes'
        `$rnUrls = [ordered]@{}
        `$rnUrl = `$null
        if (Test-Path -LiteralPath `$rnDir) {
            `$kName = `$keyDir.Name
            Get-ChildItem -Path `$rnDir -Filter "release-notes-`$kName.*" -File -ErrorAction SilentlyContinue |
                Where-Object { `$_.Extension -in '.html','.md' } |
                ForEach-Object {
                    # Estrai locale dal nome: release-notes-<key>.<locale>.<ext>
                    `$base = `$_.BaseName  # release-notes-<key>.<locale> oppure release-notes-<key>
                    `$prefix = "release-notes-`$kName"
                    if (`$base -eq `$prefix) {
                        # Legacy single-locale (no locale suffix) -> it-IT
                        if (-not `$rnUrls.Contains('it-IT')) {
                            `$rnUrls['it-IT'] = "/downloads/release-notes/`$(`$_.Name)"
                        }
                    } elseif (`$base.StartsWith("`$prefix.")) {
                        `$loc = `$base.Substring(`$prefix.Length + 1)
                        # Preferisci .html su .md se entrambi presenti per la stessa locale
                        if (-not `$rnUrls.Contains(`$loc) -or `$_.Extension -eq '.html') {
                            `$rnUrls[`$loc] = "/downloads/release-notes/`$(`$_.Name)"
                        }
                    }
                }
            if (`$rnUrls.Contains('it-IT')) { `$rnUrl = `$rnUrls['it-IT'] }
            elseif (`$rnUrls.Count -gt 0)   { `$rnUrl = (`$rnUrls.Values | Select-Object -First 1) }
        }
        `$state[`$keyDir.Name] = [ordered]@{
            files            = `$files
            date             = `$mostRecent.ToString('yyyy-MM-dd')
            releaseNotesUrl  = `$rnUrl
            releaseNotesUrls = if (`$rnUrls.Count -gt 0) { `$rnUrls } else { `$null }
        }
    }
}
`$state | ConvertTo-Json -Depth 6 | Set-Content -Path `$stateFile -Encoding UTF8
Write-Host "  archive snapshot scritto: `$stateFile (keys: `$(`$state.Keys.Count))"
"@
            $code = Invoke-RemotePwsh -RemoteUserHost $remoteUserHost -Script $prepScript
            if ($code -ne 0) { throw "step 3: prep archive remoto fallita (exit $code)" }
        }

        } # end of !LocalOnly remote prep block

        # ── Release notes lookup + Markdown -> HTML conversion ─────
        # MULTI-LOCALE: lo script cerca un file .md per OGNI locale supportato
        # dal sito (vedi src/app/services/language.service.ts).
        # Convenzione naming sorgente: release-notes-<releaseKey>.<locale>.md
        # (es. release-notes-v1.0.19_1.0.19.it-IT.md, .en-US.md, .de-DE.md,
        # .es-ES.md, .fr-FR.md).
        # Backward compat: se manca la variante .it-IT.md, lo script accetta
        # anche `release-notes-<releaseKey>.md` (formato legacy single-locale)
        # come traduzione italiana.
        # Per ogni .md trovato, lo script:
        #   1. converte in .html con `ConvertFrom-Markdown` (built-in PS 6+)
        #      wrappando l'output in un layout HTML minimale con
        #      <meta charset="utf-8"> + CSS leggibile + back-link a /downloads
        #      tradotto nella lingua del file
        #   2. carica il .html sul server (NON il .md)
        # Il file .html ha 2 vantaggi rispetto al raw .md:
        #   a) charset utf-8 dichiarato nel <head> -> encoding garantito su
        #      tutti i browser, niente piu' "ðŸ›¡ï¸" al posto di "🛡️"
        #   b) markdown renderizzato (h1/h2, tabelle, code blocks, ecc.) =
        #      esperienza utente decente.
        # Naming output: release-notes-<releaseKey>.<locale>.html → rotation
        # cleanup matcha lo stesso pattern (esteso a tutte le locale).
        # Manifest: campo `releaseNotesUrls` (mappa { locale -> url }), piu'
        # `releaseNotesUrl` (string) come backward-compat = it-IT URL se
        # disponibile, altrimenti prima locale trovata.
        $supportedLocales = @(
            @{ code = 'it-IT'; lang = 'it'; backLabel = '&larr; Torna ai download' },
            @{ code = 'en-US'; lang = 'en'; backLabel = '&larr; Back to downloads' },
            @{ code = 'de-DE'; lang = 'de'; backLabel = '&larr; Zur&uuml;ck zu den Downloads' },
            @{ code = 'es-ES'; lang = 'es'; backLabel = '&larr; Volver a las descargas' },
            @{ code = 'fr-FR'; lang = 'fr'; backLabel = '&larr; Retour aux t&eacute;l&eacute;chargements' }
        )
        $releaseNotesUrls = [ordered]@{}    # locale -> url
        $releaseNotesHtmlFiles = @()        # lista FileInfo per upload/mirror
        $releaseNotesUrl = $null            # backward-compat (it-IT URL)
        if (Test-Path $ReleaseNotesDir) {
            foreach ($loc in $supportedLocales) {
                $localeCode = $loc.code
                $sourceFileName = "release-notes-$releaseKey.$localeCode.md"
                $candidate = Join-Path $ReleaseNotesDir $sourceFileName
                # Backward-compat: accetta `release-notes-<key>.md` come it-IT
                if ($localeCode -eq 'it-IT' -and -not (Test-Path $candidate)) {
                    $legacyCandidate = Join-Path $ReleaseNotesDir "release-notes-$releaseKey.md"
                    if (Test-Path $legacyCandidate) {
                        $candidate = $legacyCandidate
                        $sourceFileName = "release-notes-$releaseKey.md"
                    }
                }
                if (-not (Test-Path $candidate)) {
                    Write-Sub "[$localeCode] release notes non trovate (atteso $sourceFileName) — skip"
                    continue
                }
                $htmlFileName = "release-notes-$releaseKey.$localeCode.html"
                $sourceFile = Get-Item $candidate
                Write-Sub "[$localeCode] sorgente: $sourceFileName ($([math]::Round($sourceFile.Length / 1KB, 1)) KB)"
                # Convert markdown -> HTML
                try {
                    $mdContent = Get-Content $candidate -Raw -Encoding UTF8
                    $rendered = (ConvertFrom-Markdown -InputObject $mdContent).Html
                    $htmlLang = $loc.lang
                    $backLabel = $loc.backLabel
                    $titleEsc = "Release Notes $releaseKey - WUIC Framework"
                    # Stylesheet allineato al WuicSite (palette indigo `#6366f1`,
                    # font system stack identico a `src/styles.scss`, header
                    # bianco con bordo `#e2e8f0`, max-width 1200px container).
                    # Light mode only: il sito principale e' light-only, non
                    # vogliamo dark-mode discrepanza fra navbar bianca site-wide
                    # e release notes scure. Niente `prefers-color-scheme`.
                    $htmlBody = @"
<!DOCTYPE html>
<html lang="$htmlLang">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>$titleEsc</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; color: #1e293b; background: #ffffff; line-height: 1.6; overflow-wrap: anywhere; word-wrap: break-word; }
a { color: #6366f1; text-decoration: none; }
a:hover { color: #4f46e5; text-decoration: underline; }

/* Site-style header (mini-navbar) */
.rn-header { background: rgba(255, 255, 255, 0.95); border-bottom: 1px solid #e2e8f0; backdrop-filter: blur(8px); position: sticky; top: 0; z-index: 10; }
.rn-header-inner { max-width: 1200px; margin: 0 auto; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.rn-brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: #0f172a; font-size: 1.15rem; }
.rn-brand-bolt { display: inline-block; width: 24px; height: 24px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); -webkit-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M13 2L3 14h7l-1 8 10-12h-7l1-8z'/></svg>") center/contain no-repeat; mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M13 2L3 14h7l-1 8 10-12h-7l1-8z'/></svg>") center/contain no-repeat; }
.rn-back { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border: 1px solid #c7d2fe; border-radius: 6px; color: #4f46e5; background: #eef2ff; font-size: 0.9rem; transition: background 0.15s, border-color 0.15s; }
.rn-back:hover { background: #e0e7ff; border-color: #a5b4fc; text-decoration: none; }

/* Article container: same width as Site .container */
.rn-article { max-width: 880px; margin: 0 auto; padding: 48px 24px 80px; }

/* Headings: site palette */
h1, h2, h3, h4 { color: #0f172a; line-height: 1.25; font-weight: 700; }
h1 { font-size: 2rem; padding-bottom: 0.5rem; border-bottom: 2px solid #e2e8f0; margin-bottom: 1.25rem; }
h2 { font-size: 1.4rem; margin-top: 2.25rem; margin-bottom: 0.75rem; }
h3 { font-size: 1.125rem; margin-top: 1.5rem; margin-bottom: 0.5rem; color: #334155; }

p { margin: 0.75rem 0; color: #334155; }
strong { color: #0f172a; font-weight: 600; }

ul, ol { padding-left: 1.4rem; margin: 0.75rem 0; }
li { margin: 0.25rem 0; color: #334155; }

hr { border: 0; border-top: 1px solid #e2e8f0; margin: 2.5rem 0; }

/* Inline code: tinta indigo che richiama il brand */
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; }
code { background: #eef2ff; color: #4f46e5; border: 1px solid #c7d2fe; padding: 0.1em 0.4em; border-radius: 4px; word-break: break-word; }
pre { background: #f8fafc; border: 1px solid #e2e8f0; padding: 1rem 1.25rem; border-radius: 8px; overflow-x: auto; max-width: 100%; margin: 1rem 0; }
pre code { background: transparent; color: #1e293b; border: 0; padding: 0; word-break: normal; }

/* Tables: scrollabili, header indigo-tint */
.table-wrap { overflow-x: auto; max-width: 100%; margin: 1.25rem 0; border: 1px solid #e2e8f0; border-radius: 8px; }
table { border-collapse: collapse; width: max-content; min-width: 100%; background: #ffffff; }
th, td { border-bottom: 1px solid #e2e8f0; padding: 0.65rem 0.95rem; text-align: left; vertical-align: top; font-size: 0.95rem; }
th { background: #f8fafc; color: #0f172a; font-weight: 600; border-bottom-color: #cbd5e1; }
tr:last-child td { border-bottom: 0; }
td { color: #334155; }

/* Blockquote: brand accent */
blockquote { border-left: 3px solid #6366f1; margin: 1.25rem 0; padding: 0.6rem 1.1rem; color: #475569; background: #eef2ff; border-radius: 0 6px 6px 0; }
blockquote p { color: #475569; }

img { max-width: 100%; height: auto; border-radius: 6px; }
</style>
<script>
// Wrap tables post-render in scroll container (markdown converter emits raw <table>).
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('table').forEach(t => {
    if (t.parentElement && t.parentElement.classList.contains('table-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    t.parentNode.insertBefore(wrap, t);
    wrap.appendChild(t);
  });
});
</script>
</head>
<body>
<header class="rn-header">
  <div class="rn-header-inner">
    <a href="/" class="rn-brand"><span class="rn-brand-bolt"></span><span>WUIC</span></a>
    <a href="/downloads" class="rn-back">$backLabel</a>
  </div>
</header>
<article class="rn-article">
$rendered
</article>
</body>
</html>
"@
                    $tmpHtml = New-TemporaryFile
                    $tmpHtmlPath = "$($tmpHtml.FullName).$localeCode.html"
                    Move-Item $tmpHtml.FullName $tmpHtmlPath -Force
                    Set-Content -Path $tmpHtmlPath -Value $htmlBody -Encoding UTF8
                    $htmlFile = Get-Item $tmpHtmlPath
                    $publicUrl = "/downloads/release-notes/$htmlFileName"
                    $releaseNotesUrls[$localeCode] = $publicUrl
                    $releaseNotesHtmlFiles += [pscustomobject]@{
                        Locale       = $localeCode
                        FileInfo     = $htmlFile
                        HtmlFileName = $htmlFileName
                    }
                    if ($localeCode -eq 'it-IT') { $releaseNotesUrl = $publicUrl }
                    Write-Sub "[$localeCode] convertito -> $htmlFileName ($([math]::Round($htmlFile.Length / 1KB, 1)) KB)"
                } catch {
                    Write-Sub "[$localeCode] [warn] conversione markdown fallita: $($_.Exception.Message) — skip"
                }
            }
            # Backward-compat fallback singolare: se mancano release notes it-IT
            # ma esistono in altre lingue, popola releaseNotesUrl con la prima
            # disponibile cosi' i client legacy non hanno link rotto.
            if (-not $releaseNotesUrl -and $releaseNotesUrls.Count -gt 0) {
                $releaseNotesUrl = $releaseNotesUrls.Values | Select-Object -First 1
            }
            if ($releaseNotesUrls.Count -eq 0) {
                Write-Sub "[warn] nessuna release notes trovata per $releaseKey in $ReleaseNotesDir"
            }
        } else {
            Write-Sub "[warn] cartella release notes non esiste: $ReleaseNotesDir — skip linkage"
        }

        # Upload nuovi ZIP in /downloads/ root (latest). La copia "archive" della
        # release corrente NON si carica qui: al prossimo deploy questi stessi
        # file verranno spostati da /downloads/ a /archive/<releaseKey>/ dallo
        # step di move sopra, senza ri-trasferire byte via rete.
        if (-not $LocalOnly) {
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

        # Upload release notes HTML (uno per locale) sotto /downloads/release-notes/.
        # Eseguito dopo gli ZIP cosi' se il file e' grosso non blocchiamo
        # l'upload primario. SCP idempotente: ri-deploy della stessa versione
        # sovrascrive il file con eventuali edit successivi alle release notes.
        if ($releaseNotesHtmlFiles.Count -gt 0 -and -not $LocalOnly) {
            $remoteReleaseNotesDir = Join-Path $remoteDownloads 'release-notes'
            if ($useUnc) {
                $uncReleaseNotesDir = Join-Path $uncDownloads 'release-notes'
                if (-not (Test-Path $uncReleaseNotesDir)) {
                    New-Item -ItemType Directory -Path $uncReleaseNotesDir -Force | Out-Null
                }
                foreach ($rn in $releaseNotesHtmlFiles) {
                    Copy-Item $rn.FileInfo.FullName (Join-Path $uncReleaseNotesDir $rn.HtmlFileName) -Force
                    Write-Sub "  [$($rn.Locale)] -> /downloads/release-notes/$($rn.HtmlFileName) (UNC)"
                }
            } else {
                # Assicura che la directory remota esista (un solo SSH roundtrip)
                $mkdirScript = "New-Item -ItemType Directory -Force -Path '$remoteReleaseNotesDir' | Out-Null"
                Invoke-RemotePwsh -RemoteUserHost $remoteUserHost -Script $mkdirScript | Out-Null
                foreach ($rn in $releaseNotesHtmlFiles) {
                    scp $rn.FileInfo.FullName "${remoteDownloadsPath}/release-notes/$($rn.HtmlFileName)"
                    if ($LASTEXITCODE -ne 0) { throw "scp release-notes/$($rn.HtmlFileName) fallita (exit $LASTEXITCODE)" }
                    Write-Sub "  [$($rn.Locale)] -> /downloads/release-notes/$($rn.HtmlFileName)"
                }
            }
        }

        $newRelease = [ordered]@{
            key              = $releaseKey
            server           = $serverVersion
            client           = $clientVersion
            date             = (Get-Date -Format 'yyyy-MM-dd')
            timestampUtc     = (Get-Date).ToUniversalTime().ToString('o')
            files            = $filesMeta
            releaseNotesUrl  = $releaseNotesUrl                                    # backward-compat
            releaseNotesUrls = if ($releaseNotesUrls.Count -gt 0) { $releaseNotesUrls } else { $null }  # multi-locale
        }

        # Merge con releases.json remoto esistente (se c'e'). Facciamo mirror
        # locale via scp in una cartella temporanea prima di modificare.
        $tmpDir = Join-Path $env:TEMP "wuicsite-releases-$([guid]::NewGuid().ToString('N').Substring(0,8))"
        New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
        $remoteReleasesJson = Join-Path $remoteDownloads 'releases.json'
        $localReleasesJson = Join-Path $tmpDir 'releases.json'

        $existingReleases = @()
        # LocalOnly: read-existing dal mirror locale public/downloads/releases.json
        # cosi' iterazioni successive accumulano la storia (rotation simulata).
        if ($LocalOnly) {
            $localPublicReleasesJson = Join-Path $scriptDir 'public\downloads\releases.json'
            if (Test-Path $localPublicReleasesJson) {
                try {
                    $existingReleases = (Get-Content $localPublicReleasesJson -Raw | ConvertFrom-Json).releases
                    if ($null -eq $existingReleases) { $existingReleases = @() }
                    Write-Sub "[LocalOnly] read $($existingReleases.Count) release(s) da public/downloads/releases.json"
                } catch { Write-Host "  [warn] public/downloads/releases.json malformato, ricostruisco da zero" -ForegroundColor Yellow }
            } else {
                Write-Sub "[LocalOnly] nessun public/downloads/releases.json esistente, partiamo da zero"
            }
        }
        elseif ($useUnc) {
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
        if (-not $useUnc -and -not $LocalOnly) {
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
                        # Ripristina link release notes dallo snapshot archive-state:
                        # ora il prep script remoto enumera tutte le locale presenti
                        # in /downloads/release-notes/ per la key e popola
                        # `releaseNotesUrls` (mappa) + `releaseNotesUrl` (it-IT
                        # backward-compat).
                        $syntheticReleaseNotesUrl = $null
                        $syntheticReleaseNotesUrls = $null
                        if ($entry.PSObject.Properties.Name -contains 'releaseNotesUrls' -and $entry.releaseNotesUrls) {
                            $syntheticReleaseNotesUrls = [ordered]@{}
                            foreach ($prop2 in $entry.releaseNotesUrls.PSObject.Properties) {
                                $syntheticReleaseNotesUrls[$prop2.Name] = [string]$prop2.Value
                            }
                        }
                        if ($entry.PSObject.Properties.Name -contains 'releaseNotesUrl' -and $entry.releaseNotesUrl) {
                            $syntheticReleaseNotesUrl = [string]$entry.releaseNotesUrl
                        }
                        $existingReleases += [ordered]@{
                            key              = $oldKey
                            server           = $sVer
                            client           = $cVer
                            date             = if ($entry.date) { $entry.date } else { (Get-Date -Format 'yyyy-MM-dd') }
                            timestampUtc     = (Get-Date).ToUniversalTime().ToString('o')
                            files            = $syntheticFiles
                            releaseNotesUrl  = $syntheticReleaseNotesUrl
                            releaseNotesUrls = $syntheticReleaseNotesUrls
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
        # Eliminiamo anche eventuali release notes (release-notes-<key>.md) sotto
        # /downloads/release-notes/ — il manifest non le referenzia piu', tenerle
        # sarebbe orphan storage.
        # LocalOnly: skip cleanup remoto (in dev tutto vive in public/downloads/).
        if ($drop.Count -gt 0 -and -not $LocalOnly) {
            Write-Sub "rotation: elimino $($drop.Count) release obsolete"
            $dropKeys = @($drop | ForEach-Object { if ($_.key) { $_.key } else { "v$($_.server)_$($_.client)" } })
            foreach ($k in $dropKeys) { Write-Sub "  - $k" }
            if ($useUnc) {
                $uncReleaseNotesDir = Join-Path $uncDownloads 'release-notes'
                foreach ($k in $dropKeys) {
                    $dir = Join-Path $uncDownloads "archive\$k"
                    if (Test-Path $dir) { Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue }
                    # Cancella TUTTE le varianti locale (release-notes-<k>.*.{html,md})
                    # piu' il formato legacy single-locale (release-notes-<k>.{html,md}).
                    if (Test-Path $uncReleaseNotesDir) {
                        Get-ChildItem -Path $uncReleaseNotesDir -Filter "release-notes-$k.*" -File -ErrorAction SilentlyContinue |
                            Where-Object { $_.Extension -in '.html','.md' } |
                            Remove-Item -Force -ErrorAction SilentlyContinue
                    }
                }
            } else {
                $dropLiteral = ($dropKeys | ForEach-Object { "'" + ($_ -replace "'", "''") + "'" }) -join ','
                if (-not $dropLiteral) { $dropLiteral = "''" }
                $remoteReleaseNotesDirInner = Join-Path $remoteDownloads 'release-notes'
                $rotScript = @"
`$archiveRoot     = '$remoteArchiveDir'
`$releaseNotesDir = '$remoteReleaseNotesDirInner'
`$keys = @($dropLiteral)
foreach (`$k in `$keys) {
    if (-not `$k) { continue }
    `$dir = Join-Path `$archiveRoot `$k
    if (Test-Path -LiteralPath `$dir) {
        Remove-Item -LiteralPath `$dir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  deleted archive/`$k/"
    }
    if (Test-Path -LiteralPath `$releaseNotesDir) {
        Get-ChildItem -Path `$releaseNotesDir -Filter "release-notes-`$k.*" -File -ErrorAction SilentlyContinue |
            Where-Object { `$_.Extension -in '.html','.md' } |
            ForEach-Object {
                Remove-Item -LiteralPath `$_.FullName -Force -ErrorAction SilentlyContinue
                Write-Host "  deleted release-notes/`$(`$_.Name)"
            }
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

        # Upload releases.json (skip remoto in LocalOnly)
        if (-not $LocalOnly) {
            if ($useUnc) {
                Copy-Item $localReleasesJson (Join-Path $uncDownloads 'releases.json') -Force
            } else {
                scp $localReleasesJson "${remoteDownloadsPath}/releases.json"
            }
        }

        # Mirror locale per dev (`ng serve` su port 4300): scrivi lo stesso
        # releases.json + il file release notes (se presente) sotto
        # `public/downloads/` del repo WuicSite. Cosi' lavorando in locale sulla
        # pagina /downloads (e /downloads/older) il dev server vede gli stessi
        # dati che vede produzione, senza dover montare il filesystem remoto.
        # Snapshot at deploy time: dopo deploy successivi il mirror diverge dal
        # server (quello e' authoritative). Per ri-allineare basta ri-deployare.
        $localPublicDownloads = Join-Path $scriptDir 'public\downloads'
        if (-not (Test-Path $localPublicDownloads)) {
            New-Item -ItemType Directory -Path $localPublicDownloads -Force | Out-Null
        }
        Copy-Item $localReleasesJson (Join-Path $localPublicDownloads 'releases.json') -Force
        Write-Sub "mirror locale: public/downloads/releases.json"
        if ($releaseNotesHtmlFiles.Count -gt 0) {
            $localPublicReleaseNotes = Join-Path $localPublicDownloads 'release-notes'
            if (-not (Test-Path $localPublicReleaseNotes)) {
                New-Item -ItemType Directory -Path $localPublicReleaseNotes -Force | Out-Null
            }
            foreach ($rn in $releaseNotesHtmlFiles) {
                Copy-Item $rn.FileInfo.FullName (Join-Path $localPublicReleaseNotes $rn.HtmlFileName) -Force
                Write-Sub "mirror locale: public/downloads/release-notes/$($rn.HtmlFileName)"
            }
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
        if (-not $LocalOnly) {
            if ($useUnc) {
                Copy-Item $localLatestJson (Join-Path $uncDownloads 'latest.json') -Force
            } else {
                scp $localLatestJson "${remoteDownloadsPath}/latest.json"
            }
        }

        # Cleanup temp
        Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue

        Write-Host "  [ok] release $releaseKey pubblicata ($($keep.Count) release totali in archivio)" -ForegroundColor Green
    }
} else {
    Write-Step "3/3 Upload pacchetti ZIP [SKIP]"
}

# ── step 4: upload Linux tarball (hidden asset) ──────────────────────
# LocalOnly: il tarball Linux non e' parte del dev preview, skip totale.
if ($LocalOnly) { $SkipLinuxTarball = $true }

#
# Il tarball linux-x64 e' generato da deploy-release.ps1 -GenerateLinuxTarball
# e finisce in artifacts\release\linux\wuic-framework-vX.Y.Z-linux-x64.tar.gz
# (+ relativo .sha256 sidecar). Lo carichiamo come ASSET NASCOSTO sotto
# <SitePath>\releases\:
#
#   /releases/v<version>/wuic-framework-v<version>-linux-x64.tar.gz   (+ .sha256)
#   /releases/latest/wuic-framework-linux-x64.tar.gz                   (+ .sha256)
#
# La copia "latest" usa un nome senza versione cosi' install.sh puo' fare
#   curl -fsSL https://wuic-framework.com/releases/latest/wuic-framework-linux-x64.tar.gz
# senza dover prima risolvere il numero di versione corrente. La versione
# specifica resta accessibile sotto /releases/v<version>/ per pinning.
#
# QUESTO ASSET NON VIENE LINKATO DAL SITO PROMOZIONALE: niente entry in
# releases.json/latest.json, niente menzione nelle pagine pubbliche. E'
# scaricabile solo via URL diretto, dal one-liner bash ospitato a /install.sh.

if (-not $SkipLinuxTarball) {
    Write-Step "4/4 Upload tarball Linux (hidden asset)"
    $tarballs = @()
    if (Test-Path $LinuxTarballSourceDir) {
        $tarballs = Get-ChildItem -Path $LinuxTarballSourceDir -Filter 'wuic-framework-v*-linux-x64.tar.gz' -File -ErrorAction SilentlyContinue
    }
    if ($tarballs.Count -eq 0) {
        Write-Host "  [skip] Nessun tarball trovato in $LinuxTarballSourceDir" -ForegroundColor Yellow
        Write-Host "         (usa: pwsh deploy-release.ps1 -GenerateLinuxTarball per produrlo)" -ForegroundColor DarkGray
    } else {
        # In caso di piu' file, prendi il piu' recente (timestamp).
        $tarball = $tarballs | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        $sha256 = "$($tarball.FullName).sha256"
        if (-not (Test-Path $sha256)) {
            Write-Host "  [warn] sha256 sidecar mancante per $($tarball.Name) — install.sh non potra' verificare l'integrita'" -ForegroundColor Yellow
        }
        # Estrai versione dal nome file: wuic-framework-vX.Y.Z-linux-x64.tar.gz
        if ($tarball.Name -notmatch 'wuic-framework-v(.+)-linux-x64\.tar\.gz$') {
            throw "Nome tarball non parsabile: $($tarball.Name)"
        }
        $tarballVersion = $Matches[1]
        $tarballSizeMB = [math]::Round($tarball.Length / 1MB, 1)
        Write-Host "  tarball: $($tarball.Name) ($tarballSizeMB MB, version $tarballVersion)" -ForegroundColor DarkGray

        $remoteReleasesRoot   = Join-Path $SitePath 'releases'
        $remoteVersionDir     = Join-Path $remoteReleasesRoot "v$tarballVersion"
        $remoteLatestDir      = Join-Path $remoteReleasesRoot 'latest'

        $latestTarballName = 'wuic-framework-linux-x64.tar.gz'

        $uncReleasesRoot = "\\${Server}\$($remoteReleasesRoot -replace ':', '$')"
        $useUnc = [bool](Test-Path $uncReleasesRoot -ErrorAction SilentlyContinue)

        if ($useUnc) {
            Write-Sub "modalita' UNC: $uncReleasesRoot"
            $uncVersionDir = Join-Path $uncReleasesRoot "v$tarballVersion"
            $uncLatestDir  = Join-Path $uncReleasesRoot 'latest'
            foreach ($d in @($uncReleasesRoot, $uncVersionDir, $uncLatestDir)) {
                if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
            }
            # /releases/v<version>/ — keep the original filename so users who
            # pin a version can grab it as-is.
            Copy-Item -Path $tarball.FullName -Destination (Join-Path $uncVersionDir $tarball.Name) -Force
            if (Test-Path $sha256) {
                Copy-Item -Path $sha256 -Destination (Join-Path $uncVersionDir "$($tarball.Name).sha256") -Force
            }
            # /releases/latest/ — versionless filename for install.sh.
            Copy-Item -Path $tarball.FullName -Destination (Join-Path $uncLatestDir $latestTarballName) -Force
            if (Test-Path $sha256) {
                # The sha256 sidecar references the original filename; rewrite to use $latestTarballName.
                $shaHashLine = (Get-Content $sha256 -Raw).Trim()
                $shaHash = ($shaHashLine -split '\s+')[0]
                Set-Content -Path (Join-Path $uncLatestDir "$latestTarballName.sha256") -Value "$shaHash  $latestTarballName" -Encoding ascii
            }
        } else {
            Write-Sub "modalita' SCP"
            # Crea le 3 cartelle remote in un solo roundtrip ssh.
            $mkScript = @"
`$dirs = @('$remoteReleasesRoot', '$remoteVersionDir', '$remoteLatestDir')
foreach (`$d in `$dirs) {
    if (-not (Test-Path `$d)) { New-Item -ItemType Directory -Force -Path `$d | Out-Null }
}
"@
            $code = Invoke-RemotePwsh -RemoteUserHost $remoteUserHost -Script $mkScript
            if ($code -ne 0) { throw "step 4: prep cartelle remote fallita (exit $code)" }

            $remoteVersionDirScp = ConvertTo-ScpRemotePath $remoteVersionDir
            $remoteLatestDirScp  = ConvertTo-ScpRemotePath $remoteLatestDir

            # /releases/v<version>/<filename>.tar.gz (+ .sha256)
            Write-Sub "scp -> $remoteVersionDir/$($tarball.Name)"
            scp $tarball.FullName "${User}@${Server}:${remoteVersionDirScp}/$($tarball.Name)"
            if ($LASTEXITCODE -ne 0) { throw "scp tarball -> /releases/v$tarballVersion/ fallita (exit $LASTEXITCODE)" }
            if (Test-Path $sha256) {
                scp $sha256 "${User}@${Server}:${remoteVersionDirScp}/$($tarball.Name).sha256"
                if ($LASTEXITCODE -ne 0) { Write-Host "  [warn] scp .sha256 fallita" -ForegroundColor Yellow }
            }

            # /releases/latest/wuic-framework-linux-x64.tar.gz (+ .sha256)
            Write-Sub "scp -> $remoteLatestDir/$latestTarballName"
            scp $tarball.FullName "${User}@${Server}:${remoteLatestDirScp}/$latestTarballName"
            if ($LASTEXITCODE -ne 0) { throw "scp tarball -> /releases/latest/ fallita (exit $LASTEXITCODE)" }
            if (Test-Path $sha256) {
                # Rewrite the sha256 sidecar so its filename column matches the renamed tarball.
                $shaHashLine = (Get-Content $sha256 -Raw).Trim()
                $shaHash = ($shaHashLine -split '\s+')[0]
                $tmpSha = Join-Path $env:TEMP "wuic-linux-latest-$([guid]::NewGuid().ToString('N').Substring(0,8)).sha256"
                Set-Content -Path $tmpSha -Value "$shaHash  $latestTarballName" -Encoding ascii
                scp $tmpSha "${User}@${Server}:${remoteLatestDirScp}/$latestTarballName.sha256"
                Remove-Item -Path $tmpSha -Force -ErrorAction SilentlyContinue
                if ($LASTEXITCODE -ne 0) { Write-Host "  [warn] scp .sha256 latest fallita" -ForegroundColor Yellow }
            }
        }

        Write-Host "  [ok] Tarball pubblicato come asset NASCOSTO su $Server" -ForegroundColor Green
        Write-Host "         /releases/v$tarballVersion/$($tarball.Name)"      -ForegroundColor DarkGray
        Write-Host "         /releases/latest/$latestTarballName"               -ForegroundColor DarkGray
        Write-Host "       Consumato da: https://wuic-framework.com/install.sh" -ForegroundColor DarkGray
    }
} else {
    Write-Step "4/4 Upload tarball Linux [SKIP]"
}

# ── step 5: upload install.sh (linux one-liner installer) ────────────
# install.sh e' lo script bash hosted a https://wuic-framework.com/install.sh
# che gli utenti Linux invocano via:
#   curl -fsSL https://wuic-framework.com/install.sh | sudo bash -s -- ...
# Lo script scarica il tarball latest da /releases/latest/, lo verifica via
# sha256, lo estrae e invoca scripts/linux/install-all.sh.
#
# A differenza del tarball (asset nascosto), install.sh E' linkato dalla
# pagina /downloads (sezione "Installazione Linux") cosi' gli utenti possono
# vedere/copiare il comando ed eventualmente scaricare lo script per
# ispezionarlo prima di lanciarlo.
#
# Sorgente: KonvergenceCore/scripts/install.sh (default $InstallScriptPath).
# Destinazione server: <SitePath>/install.sh (root del sito, non /downloads/).
# Mirror locale: public/install.sh per dev preview (anche in LocalOnly).
# Non c'e' uno SkipInstallScript flag: lo script e' tiny (~10 KB), idempotente,
# va sempre allineato.

Write-Step "5/5 Upload install.sh (linux one-liner)"
if (Test-Path $InstallScriptPath) {
    $installFile = Get-Item $InstallScriptPath
    Write-Sub "sorgente: $InstallScriptPath ($([math]::Round($installFile.Length / 1KB, 1)) KB)"

    # Mirror locale per dev preview — sempre, anche LocalOnly
    $localPublicInstall = Join-Path $scriptDir 'public\install.sh'
    Copy-Item $installFile.FullName $localPublicInstall -Force
    Write-Sub "mirror locale: public/install.sh"

    if (-not $LocalOnly) {
        $remoteInstallPath = Join-Path $SitePath 'install.sh'
        if ($useUnc) {
            $uncSiteRoot = "\\${Server}\$($SitePath -replace ':', '$')"
            Copy-Item $installFile.FullName (Join-Path $uncSiteRoot 'install.sh') -Force
            Write-Sub "install.sh -> $remoteInstallPath (UNC)"
        } else {
            $remoteInstallPathScp = ConvertTo-ScpRemotePath $remoteInstallPath
            scp $installFile.FullName "${User}@${Server}:${remoteInstallPathScp}"
            if ($LASTEXITCODE -ne 0) { throw "scp install.sh fallita (exit $LASTEXITCODE)" }
            Write-Sub "install.sh -> $remoteInstallPath"
        }
        Write-Host "  [ok] install.sh pubblicato su https://${Server}/install.sh" -ForegroundColor Green
    }
} else {
    Write-Host "  [warn] install.sh non trovato: $InstallScriptPath — skip" -ForegroundColor Yellow
}

# ── done ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Deploy completato su $Server" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
