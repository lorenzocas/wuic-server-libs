<#
.SYNOPSIS
  Provisioning iniziale del server IIS per il sito promozionale WUIC + demo live.
  Eseguire una sola volta sul server Windows appena creato (Contabo VPS o equivalente).

.PARAMETER PromoDomain
  Dominio del sito promozionale (es. "wuic.dev").

.PARAMETER DemoDomain
  Dominio della demo live (es. "demo.wuic.dev").

.PARAMETER PromoPath
  Physical path per il sito promozionale. Default: C:\inetpub\wwwroot\WuicSite.

.PARAMETER DemoPath
  Physical path per la demo WuicTest. Default: C:\inetpub\wwwroot\WuicDemo.

.PARAMETER InstallWinAcme
  Se specificato, scarica e installa win-acme per certificati SSL Let's Encrypt.

.EXAMPLE
  pwsh setup-server.ps1 -PromoDomain "wuic.dev" -DemoDomain "demo.wuic.dev"
  pwsh setup-server.ps1 -PromoDomain "wuic.dev" -DemoDomain "demo.wuic.dev" -InstallWinAcme
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$PromoDomain,
    [Parameter(Mandatory = $true)]
    [string]$DemoDomain,
    [string]$PromoPath = 'C:\inetpub\wwwroot\WuicSite',
    [string]$DemoPath = 'C:\inetpub\wwwroot\WuicDemo',
    [switch]$InstallWinAcme
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  [ok] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [warn] $msg" -ForegroundColor Yellow }

# ── check admin ──────────────────────────────────────────────────────

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERRORE: esegui questo script come amministratore." -ForegroundColor Red
    exit 1
}

# ── step 1: IIS features ────────────────────────────────────────────

Write-Step "1/7 Verifica/installa IIS features"

$features = @(
    'Web-Server',
    'Web-Default-Doc',
    'Web-Static-Content',
    'Web-Http-Errors',
    'Web-Http-Logging',
    'Web-Stat-Compression',
    'Web-Dyn-Compression',
    'Web-Filtering',
    'Web-Mgmt-Console'
)

foreach ($f in $features) {
    $state = (Get-WindowsFeature -Name $f -ErrorAction SilentlyContinue).InstallState
    if ($state -ne 'Installed') {
        Install-WindowsFeature -Name $f -IncludeManagementTools | Out-Null
        Write-Ok "Installato $f"
    }
}
Write-Ok "IIS features pronte"

# ── step 2: ASP.NET Core Hosting Bundle check ────────────────────────

Write-Step "2/7 Verifica ASP.NET Core Hosting Bundle"

$ancmModule = Get-WebGlobalModule -Name 'AspNetCoreModuleV2' -ErrorAction SilentlyContinue
if ($ancmModule) {
    Write-Ok "ASP.NET Core Module V2 presente"
} else {
    Write-Warn "ASP.NET Core Hosting Bundle NON trovato!"
    Write-Host "  Scaricalo da: https://dotnet.microsoft.com/download/dotnet/10.0" -ForegroundColor Yellow
    Write-Host "  Cerca 'Hosting Bundle', installa, poi riesegui questo script." -ForegroundColor Yellow
}

# ── step 3: create directories ───────────────────────────────────────

Write-Step "3/7 Creazione cartelle"

foreach ($dir in @($PromoPath, $DemoPath, "$DemoPath\Upload", "$DemoPath\Reports", "$DemoPath\Tmp_export", "$PromoPath\downloads")) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Ok "Creata $dir"
    }
}

# ── step 4: create app pools ────────────────────────────────────────

Write-Step "4/7 Creazione app pool"

Import-Module WebAdministration -ErrorAction SilentlyContinue

foreach ($poolInfo in @(
    @{ Name = 'WuicSitePool'; Runtime = '' },
    @{ Name = 'WuicDemoPool'; Runtime = '' }
)) {
    if (-not (Test-Path "IIS:\AppPools\$($poolInfo.Name)")) {
        New-WebAppPool -Name $poolInfo.Name | Out-Null
        Set-ItemProperty "IIS:\AppPools\$($poolInfo.Name)" -Name managedRuntimeVersion -Value $poolInfo.Runtime
        Write-Ok "App pool $($poolInfo.Name) creato (No Managed Code)"
    } else {
        Write-Ok "App pool $($poolInfo.Name) gia' presente"
    }
    # AlwaysRunning + no idle timeout + Rapid-Fail Protection disabilitata:
    # il firstRun wizard riavvia l'app al termine del setup DB, causando un exit
    # che IIS conta come "failure". Con la RFP attiva (default: 5 failure in 5 min)
    # il pool si ferma permanentemente. Disabilitandola il pool si riavvia sempre.
    Set-ItemProperty "IIS:\AppPools\$($poolInfo.Name)" -Name startMode -Value 'AlwaysRunning'
    Set-ItemProperty "IIS:\AppPools\$($poolInfo.Name)" -Name processModel.idleTimeout -Value '00:00:00'
    Set-ItemProperty "IIS:\AppPools\$($poolInfo.Name)" -Name failure.rapidFailProtection -Value $false
}

# ── step 5: create IIS sites ────────────────────────────────────────

Write-Step "5/7 Creazione siti IIS"

# Promo site (static Angular)
if (-not (Get-Website -Name 'WuicSite' -ErrorAction SilentlyContinue)) {
    New-Website -Name 'WuicSite' `
        -PhysicalPath $PromoPath `
        -ApplicationPool 'WuicSitePool' `
        -HostHeader $PromoDomain `
        -Port 80 | Out-Null
    Write-Ok "Sito WuicSite ($PromoDomain) creato"
} else {
    Write-Ok "Sito WuicSite gia' presente"
}

# Demo site (ASP.NET Core)
if (-not (Get-Website -Name 'WuicDemo' -ErrorAction SilentlyContinue)) {
    New-Website -Name 'WuicDemo' `
        -PhysicalPath $DemoPath `
        -ApplicationPool 'WuicDemoPool' `
        -HostHeader $DemoDomain `
        -Port 80 | Out-Null
    Write-Ok "Sito WuicDemo ($DemoDomain) creato"
} else {
    Write-Ok "Sito WuicDemo gia' presente"
}

# ── step 6: NTFS permissions ────────────────────────────────────────

Write-Step "6/7 Permessi NTFS"

foreach ($perm in @(
    @{ Path = $PromoPath; Identity = 'IIS AppPool\WuicSitePool' },
    @{ Path = $DemoPath;  Identity = 'IIS AppPool\WuicDemoPool' }
)) {
    $acl = Get-Acl $perm.Path
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $perm.Identity, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow'
    )
    $acl.AddAccessRule($rule)
    Set-Acl -Path $perm.Path -AclObject $acl
    Write-Ok "$($perm.Identity) -> Modify su $($perm.Path)"
}

# ── step 7: win-acme (optional SSL) ─────────────────────────────────

Write-Step "7/7 Certificati SSL (Let's Encrypt)"

if ($InstallWinAcme) {
    $winAcmePath = 'C:\tools\win-acme'
    if (-not (Test-Path $winAcmePath)) {
        Write-Host "  Download win-acme..." -ForegroundColor DarkGray
        $zipUrl = 'https://github.com/win-acme/win-acme/releases/latest/download/win-acme.v2.x64.pluggable.zip'
        $zipDest = "$env:TEMP\win-acme.zip"
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipDest -UseBasicParsing
        Expand-Archive -Path $zipDest -DestinationPath $winAcmePath -Force
        Remove-Item $zipDest -Force
        Write-Ok "win-acme installato in $winAcmePath"
    }
    Write-Host "  Per creare i certificati:" -ForegroundColor Yellow
    Write-Host "    cd $winAcmePath" -ForegroundColor White
    Write-Host "    .\wacs.exe --target iis --siteid $(Get-Website 'WuicSite' | Select-Object -ExpandProperty id) --installation iis" -ForegroundColor White
    Write-Host "    .\wacs.exe --target iis --siteid $(Get-Website 'WuicDemo' | Select-Object -ExpandProperty id) --installation iis" -ForegroundColor White
} else {
    Write-Host "  [skip] Usa -InstallWinAcme per configurare Let's Encrypt" -ForegroundColor DarkGray
}

# ── summary ──────────────────────────────────────────────────────────

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Server configurato!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Prossimi passi:" -ForegroundColor Cyan
Write-Host "  1. Installa ASP.NET Core Hosting Bundle 10 (se non presente)" -ForegroundColor White
Write-Host "  2. Installa SQL Server Express" -ForegroundColor White
Write-Host "  3. Configura DNS: $PromoDomain e $DemoDomain -> IP del server" -ForegroundColor White
Write-Host "  4. Estrai ZIP WuicTest-iis-tutorial-* in $DemoPath" -ForegroundColor White
Write-Host "  5. Configura $DemoPath\appsettings.json con connection string" -ForegroundColor White
Write-Host "  6. Deploy sito promo: pwsh deploy-site.ps1 -Server <ip>" -ForegroundColor White
Write-Host "  7. (Opzionale) Certificati SSL: pwsh setup-server.ps1 ... -InstallWinAcme" -ForegroundColor White
Write-Host ""
