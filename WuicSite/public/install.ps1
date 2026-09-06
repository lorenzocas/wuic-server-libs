<#
.SYNOPSIS
  WUIC one-line installer for Windows (Windows 10/11 and Windows Server 2019+).

  Hosted on https://wuic-framework.com/install.ps1 - the Windows counterpart of
  install.sh. Run it from a regular PowerShell window (Windows PowerShell 5.1 or
  PowerShell 7 both work):

    irm https://wuic-framework.com/install.ps1 | iex

  With options:

    & ([scriptblock]::Create((irm https://wuic-framework.com/install.ps1))) -WithTutorial -Port 5000

.DESCRIPTION
  What it does, in order:
    1. Checks winget (ships with Windows 10 22H2+ / 11 / Server 2022+).
    2. Installs the ASP.NET Core Runtime 10 if `dotnet --list-runtimes` does not
       list Microsoft.AspNetCore.App 10.x (winget id Microsoft.DotNet.AspNetCore.10).
    3. Looks for a SQL Server instance reachable with Windows authentication
       (localhost, localhost\SQLEXPRESS, (localdb)\MSSQLLocalDB, or -SqlServer).
       If none answers it installs SQL Server 2022 Express via winget
       (id Microsoft.SQLServer.2022.Express, instance SQLEXPRESS), unless -NoSqlInstall.
    4. Reads https://wuic-framework.com/downloads/releases.json, picks the latest
       IIS-ready package (RAG engine included; with -WithTutorial the variant that
       ships the WideWorldImporters demo database as .bak) and downloads it.
    5. Extracts it under -InstallDir (default %LOCALAPPDATA%\WUIC\app), writes
       start-wuic.cmd, starts the backend on Kestrel (http://localhost:<Port>) and
       opens the browser on the first-run wizard, where you paste the connection
       string printed at the end and choose the admin password.

  Nothing is installed under Program Files and no Windows service is created:
  the app runs in a console window you can close; start-wuic.cmd restarts it.
  To host it in IIS instead, install the Hosting Bundle
  (winget install Microsoft.DotNet.HostingBundle.10) and point a site with an
  app pool set to "No Managed Code" at the same folder: web.config is included.

.PARAMETER InstallDir
  Root folder of the installation. The app goes in <InstallDir>\app, the
  downloaded zip in <InstallDir>\downloads. Default: %LOCALAPPDATA%\WUIC.

.PARAMETER Port
  HTTP port of the backend on localhost. Default 5000.

.PARAMETER WithTutorial
  Download the package that ships the WideWorldImporters tutorial database
  (~1.2 GB instead of ~640 MB). The first-run wizard can then provision the
  demo data with one click ("Tutorial WideWorldImporters" setup mode).

.PARAMETER SqlServer
  SQL Server data source to use (e.g. "localhost\SQLEXPRESS" or "MYHOST,1433").
  Default: auto-detect with Windows authentication.

.PARAMETER NoSqlInstall
  Never install SQL Server Express: fail if no instance is reachable.

.PARAMETER NoStart
  Download and extract only: do not start the backend nor open the browser.

.PARAMETER Version
  Release key to install (e.g. "v1.7.0_1.7.0"). Default: the `latest` entry of
  releases.json.

.PARAMETER BaseUrl
  Download origin. Default https://wuic-framework.com.

.NOTES
  Compatible with Windows PowerShell 5.1: no `??`, `?.` or ternaries on purpose.
  Exit codes: 0 ok, 1 prerequisite missing, 2 download/extract failure,
  3 backend did not answer in time.
#>
[CmdletBinding()]
param(
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'WUIC'),
    [int]$Port = 5000,
    [switch]$WithTutorial,
    [string]$SqlServer = '',
    [switch]$NoSqlInstall,
    [switch]$NoStart,
    [string]$Version = 'latest',
    [string]$BaseUrl = 'https://wuic-framework.com'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

function Write-Step([string]$msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host "    [ok] $msg" -ForegroundColor Green }
function Write-Info([string]$msg) { Write-Host "    $msg" -ForegroundColor Gray }
function Write-Warn2([string]$msg){ Write-Host "    [!] $msg" -ForegroundColor Yellow }
function Fail([string]$msg, [int]$code) { Write-Host ""; Write-Host "ERROR: $msg" -ForegroundColor Red; exit $code }

function Refresh-Path {
    # winget installers update the Machine/User PATH; the running session keeps the
    # old copy. Merge the registry values so `dotnet` resolves without a new shell.
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = ($machine, $user, $env:Path) -join ';'
}

function Test-Winget {
    return [bool](Get-Command winget -ErrorAction SilentlyContinue)
}

function Invoke-Winget([string]$id) {
    Write-Info "winget install --id $id (a UAC prompt may appear)"
    $p = Start-Process -FilePath 'winget' -ArgumentList @('install', '--id', $id, '--exact', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity') -Wait -PassThru -NoNewWindow
    # 0 = installed, -1978335189 (0x8A15002B) = already installed / no applicable upgrade
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne -1978335189) {
        Fail "winget install $id failed with exit code $($p.ExitCode). Install it manually and rerun." 1
    }
    Refresh-Path
}

function Test-AspNetRuntime10 {
    $dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
    if (-not $dotnet) { return $false }
    $list = & dotnet --list-runtimes 2>$null
    return [bool]($list | Where-Object { $_ -match '^Microsoft\.AspNetCore\.App 10\.' })
}

function Test-SqlDataSource([string]$ds) {
    $cs = "Data Source=$ds;Integrated Security=SSPI;Encrypt=False;TrustServerCertificate=True;Connect Timeout=6"
    try {
        $conn = New-Object System.Data.SqlClient.SqlConnection($cs)
        $conn.Open()
        $cmd = $conn.CreateCommand(); $cmd.CommandText = "SELECT SERVERPROPERTY('ProductVersion')"
        $ver = [string]$cmd.ExecuteScalar()
        $conn.Close()
        $major = 0; if ($ver -match '^(\d+)\.') { $major = [int]$Matches[1] }
        if ($major -gt 0 -and $major -lt 15) { Write-Warn2 "$ds is SQL Server ${ver}: WUIC needs 2019+ (version 15). Skipping it."; return $false }
        Write-Ok "SQL Server reachable at $ds (version $ver)"
        return $true
    } catch { return $false }
}

function Find-SqlServer {
    if ($SqlServer) {
        if (Test-SqlDataSource $SqlServer) { return $SqlServer }
        Fail "SQL Server '$SqlServer' is not reachable with Windows authentication." 1
    }
    foreach ($cand in @('localhost', "localhost\SQLEXPRESS", "(localdb)\MSSQLLocalDB")) {
        if (Test-SqlDataSource $cand) { return $cand }
    }
    return $null
}

function Get-RemoteLength([string]$url) {
    try {
        $req = [System.Net.WebRequest]::Create($url); $req.Method = 'HEAD'; $req.Timeout = 20000
        $res = $req.GetResponse(); $len = $res.ContentLength; $res.Close(); return $len
    } catch { return -1 }
}

function Download-File([string]$url, [string]$dest) {
    $expected = Get-RemoteLength $url
    if ((Test-Path $dest) -and $expected -gt 0 -and (Get-Item $dest).Length -eq $expected) {
        Write-Ok "Already downloaded: $dest"
        return
    }
    if (Test-Path $dest) { Remove-Item $dest -Force }
    $sizeMb = if ($expected -gt 0) { [math]::Round($expected / 1MB) } else { '?' }
    Write-Info "Downloading $url ($sizeMb MB) -> $dest"
    $bits = Get-Command Start-BitsTransfer -ErrorAction SilentlyContinue
    if ($bits) {
        try { Start-BitsTransfer -Source $url -Destination $dest -DisplayName 'WUIC package' -Description $url; }
        catch { Write-Warn2 "BITS failed ($($_.Exception.Message)); falling back to WebClient." ; if (Test-Path $dest) { Remove-Item $dest -Force } }
    }
    if (-not (Test-Path $dest)) {
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($url, $dest)
    }
    $actual = (Get-Item $dest).Length
    if ($expected -gt 0 -and $actual -ne $expected) { Fail "Download incomplete: $actual of $expected bytes. Rerun to resume." 2 }
    Write-Ok "Downloaded $([math]::Round($actual / 1MB)) MB"
}

function Expand-Package([string]$zip, [string]$target) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Write-Info "Extracting to $target (a few minutes for a 600 MB archive)"
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $target)
    # The archive may carry a single top-level folder: flatten it so WuicTest.dll sits in $target.
    if (-not (Test-Path (Join-Path $target 'WuicTest.dll'))) {
        $dirs = @(Get-ChildItem -Path $target -Directory)
        $files = @(Get-ChildItem -Path $target -File)
        if ($dirs.Count -eq 1 -and $files.Count -eq 0 -and (Test-Path (Join-Path $dirs[0].FullName 'WuicTest.dll'))) {
            $inner = $dirs[0].FullName
            Get-ChildItem -Path $inner -Force | Move-Item -Destination $target -Force
            Remove-Item $inner -Recurse -Force
        }
    }
    if (-not (Test-Path (Join-Path $target 'WuicTest.dll'))) { Fail "WuicTest.dll not found after extraction: unexpected package layout." 2 }
    Write-Ok "Extracted"
}

# ------------------------------------------------------------------------------------
Write-Host ""
Write-Host "WUIC Framework - Windows installer" -ForegroundColor White
Write-Host "InstallDir: $InstallDir   Port: $Port   Tutorial DB: $($WithTutorial.IsPresent)" -ForegroundColor Gray

if (-not [Environment]::Is64BitOperatingSystem) { Fail "64-bit Windows required." 1 }
if ($InstallDir -like "$env:ProgramFiles*") { Fail "Do not install under Program Files: the backend writes settings and logs next to the app." 1 }

# 1. winget -----------------------------------------------------------------------------
Write-Step "Checking winget"
$hasWinget = Test-Winget
if ($hasWinget) { Write-Ok "winget available" } else { Write-Warn2 "winget not found: prerequisites will not be installed automatically (Windows 10 22H2+ / Server 2022+ ship it; otherwise install 'App Installer' from the Microsoft Store)." }

# 2. ASP.NET Core Runtime 10 ---------------------------------------------------------------
Write-Step "Checking ASP.NET Core Runtime 10"
Refresh-Path
if (Test-AspNetRuntime10) {
    Write-Ok "Microsoft.AspNetCore.App 10.x present"
} else {
    if (-not $hasWinget) { Fail "ASP.NET Core Runtime 10 missing. Install it from https://dotnet.microsoft.com/download/dotnet/10.0 and rerun." 1 }
    Invoke-Winget 'Microsoft.DotNet.AspNetCore.10'
    if (-not (Test-AspNetRuntime10)) { Fail "ASP.NET Core Runtime 10 still not visible. Open a new PowerShell window (PATH refresh) and rerun." 1 }
    Write-Ok "ASP.NET Core Runtime 10 installed"
}

# 3. SQL Server -----------------------------------------------------------------------------
Write-Step "Looking for a SQL Server instance (Windows authentication)"
$sqlDs = Find-SqlServer
if (-not $sqlDs) {
    if ($NoSqlInstall) { Fail "No SQL Server instance reachable and -NoSqlInstall given. Pass -SqlServer <host\instance>." 1 }
    if (-not $hasWinget) { Fail "No SQL Server instance reachable and winget is missing: install SQL Server 2019+ (Express is enough for evaluation) and rerun with -SqlServer." 1 }
    Write-Warn2 "No instance found: installing SQL Server 2022 Express (instance SQLEXPRESS, 5-15 minutes, UAC prompt)."
    Invoke-Winget 'Microsoft.SQLServer.2022.Express'
    $deadline = (Get-Date).AddMinutes(5)
    while (-not $sqlDs -and (Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 10
        if (Test-SqlDataSource "localhost\SQLEXPRESS") { $sqlDs = "localhost\SQLEXPRESS" }
    }
    if (-not $sqlDs) { Fail "SQL Server Express installed but localhost\SQLEXPRESS does not answer yet. Check the service 'SQL Server (SQLEXPRESS)' and rerun with -SqlServer 'localhost\SQLEXPRESS'." 1 }
}
$dataConnection = "Data Source=$sqlDs;Integrated Security=SSPI;Initial Catalog=WuicData;Encrypt=False;TrustServerCertificate=True"

# 4. Release + download -----------------------------------------------------------------------
Write-Step "Resolving the release"
$manifest = Invoke-RestMethod -Uri "$BaseUrl/downloads/releases.json" -TimeoutSec 30
$key = if ($Version -eq 'latest') { $manifest.latest } else { $Version }
$release = $manifest.releases | Where-Object { $_.key -eq $key } | Select-Object -First 1
if (-not $release) { Fail "Release '$key' not found in releases.json (available: $(($manifest.releases | ForEach-Object { $_.key }) -join ', '))." 2 }
$wantTutorial = if ($WithTutorial) { 'BAK' } else { 'no' }
$pkg = $release.files | Where-Object { $_.audience -eq 'iis' -and $_.rag -eq $true -and $_.tutorial -eq $wantTutorial } | Select-Object -First 1
if (-not $pkg) { $pkg = $release.files | Where-Object { $_.audience -eq 'iis' -and $_.tutorial -eq $wantTutorial } | Select-Object -First 1 }
if (-not $pkg) { Fail "No IIS package with tutorial='$wantTutorial' in release $key." 2 }
Write-Ok "Release $key - $($pkg.name) ($($pkg.size))"

$downloadDir = Join-Path $InstallDir 'downloads'
$appDir      = Join-Path $InstallDir 'app'
New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
$zipPath = Join-Path $downloadDir $pkg.name
$zipUrl  = if ($pkg.url -match '^https?://') { $pkg.url } else { "$BaseUrl$($pkg.url)" }

$installedMarker = Join-Path $appDir 'wuic-install.json'
$alreadyInstalled = $false
if ((Test-Path $installedMarker) -and (Test-Path (Join-Path $appDir 'WuicTest.dll'))) {
    try { $prev = Get-Content $installedMarker -Raw | ConvertFrom-Json; if ($prev.package -eq $pkg.name) { $alreadyInstalled = $true } } catch { }
}
if ($alreadyInstalled) {
    Write-Ok "Package $($pkg.name) already installed in $appDir (delete the folder to reinstall)"
} else {
    Write-Step "Downloading the package"
    Download-File $zipUrl $zipPath
    Write-Step "Extracting the package"
    Expand-Package $zipPath $appDir
    @{ package = $pkg.name; release = $key; installedAt = (Get-Date).ToString('o'); sqlDataSource = $sqlDs; port = $Port } |
        ConvertTo-Json | Set-Content -Path $installedMarker -Encoding UTF8
}

# 5. Launcher ----------------------------------------------------------------------------------
$startCmd = Join-Path $appDir 'start-wuic.cmd'
@"
@echo off
rem WUIC backend on Kestrel - generated by install.ps1. Close this window to stop.
cd /d "%~dp0"
set ASPNETCORE_ENVIRONMENT=Production
set ASPNETCORE_URLS=http://localhost:$Port
echo WUIC listening on http://localhost:$Port  (Ctrl+C or close the window to stop)
dotnet WuicTest.dll --urls http://localhost:$Port
"@ | Set-Content -Path $startCmd -Encoding ASCII
Write-Ok "Launcher written: $startCmd"

if ($NoStart) {
    Write-Host ""
    Write-Host "Done (not started). Run: $startCmd" -ForegroundColor White
    exit 0
}

# 6. Start + wait + browser ---------------------------------------------------------------------
Write-Step "Starting the backend on http://localhost:$Port"
$health = "http://localhost:$Port/api/Meta/FirstRunStatus"
$alreadyUp = $false
try { $null = Invoke-WebRequest -Uri $health -UseBasicParsing -TimeoutSec 5; $alreadyUp = $true } catch { }
if ($alreadyUp) {
    Write-Warn2 "Something already answers on port ${Port}: not starting a second instance. Use -Port to pick another port if it is not WUIC."
} else {
    Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', "`"$startCmd`"") -WorkingDirectory $appDir | Out-Null
    $deadline = (Get-Date).AddSeconds(120); $up = $false
    while (-not $up -and (Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 3
        try { $null = Invoke-WebRequest -Uri $health -UseBasicParsing -TimeoutSec 5; $up = $true } catch { }
    }
    if (-not $up) { Fail "The backend did not answer on $health within 120 s. Look at the console window that was opened (and $appDir\logs)." 3 }
    Write-Ok "Backend up"
}

Start-Process "http://localhost:$Port/"

Write-Host ""
Write-Host "WUIC is running: http://localhost:$Port/" -ForegroundColor Green
Write-Host ""
Write-Host "In the first-run wizard paste this connection string (Windows authentication):" -ForegroundColor White
Write-Host "  $dataConnection" -ForegroundColor Yellow
if ($WithTutorial) { Write-Host "  or choose setup mode 'Tutorial WideWorldImporters' to provision the demo database." -ForegroundColor Gray }
Write-Host "Then pick the admin password. Without a license the app runs in Trial mode (20 records per query)." -ForegroundColor Gray
Write-Host ""
Write-Host "Restart later: $startCmd" -ForegroundColor Gray
Write-Host "Docs: $BaseUrl/docs/getting-started" -ForegroundColor Gray
exit 0
