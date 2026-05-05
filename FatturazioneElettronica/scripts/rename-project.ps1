<#
.SYNOPSIS
  Rinomina il progetto WuicTest in un nome custom.
  Aggiorna assembly, namespace, Angular, VS Code launcher e configurazioni.

.PARAMETER Name
  Nome del progetto in PascalCase (es. "MioProgetto", "AcmeApp").
  Deve iniziare con lettera e contenere solo lettere e cifre.

.PARAMETER InPlace
  Se specificato, rinomina direttamente nella cartella corrente (incluso il
  nome della cartella stessa). Senza questo flag, clona prima la cartella
  in una copia con il nuovo nome e applica le modifiche sulla copia.

.EXAMPLE
  # Clona WuicTest → AcmeApp (cartella nuova, originale intatto)
  pwsh rename-project.ps1 -Name "AcmeApp"

  # Rinomina in-place (modifica la cartella corrente)
  pwsh rename-project.ps1 -Name "AcmeApp" -InPlace
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [switch]$InPlace
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ── validation ───────────────────────────────────────────────────────

if ($Name -notmatch '^[A-Z][a-zA-Z0-9]+$') {
    Write-Host "ERRORE: il nome deve essere PascalCase, iniziare con maiuscola e contenere solo lettere/cifre." -ForegroundColor Red
    Write-Host "  Esempio: pwsh rename-project.ps1 -Name 'AcmeApp'" -ForegroundColor Yellow
    exit 1
}

if ($Name -eq 'WuicTest') {
    Write-Host "Il progetto si chiama gia' WuicTest — nulla da fare." -ForegroundColor Yellow
    exit 0
}

# ── derive variants ──────────────────────────────────────────────────

$pascal = $Name  # es. "AcmeApp"

# PascalCase → kebab-case: inserisci "-" prima di ogni maiuscola (tranne la prima), poi lowercase
$kebab = ($pascal -creplace '([A-Z])', '-$1').TrimStart('-').ToLower()  # es. "acme-app"

$oldPascal = 'WuicTest'
$oldKebab  = 'wuic-test'

# ── resolve source root ─────────────────────────────────────────────

$sourceRoot = $PSScriptRoot
# Se lo script e' in scripts/, risali alla root del progetto
if ((Split-Path $sourceRoot -Leaf) -eq 'scripts') {
    $sourceRoot = Split-Path $sourceRoot -Parent
}

$csprojCheck = Join-Path $sourceRoot "$oldPascal.csproj"
if (-not (Test-Path $csprojCheck)) {
    Write-Host "ERRORE: $csprojCheck non trovato. Esegui questo script dalla root del progetto." -ForegroundColor Red
    exit 1
}

# ── clone or in-place ────────────────────────────────────────────────

if ($InPlace) {
    $projectRoot = $sourceRoot
    Write-Host ""
    Write-Host "Modalita': IN-PLACE (modifica diretta)" -ForegroundColor Yellow
} else {
    $parentDir = Split-Path $sourceRoot -Parent
    $cloneDir = Join-Path $parentDir $pascal
    if (Test-Path $cloneDir) {
        Write-Host "ERRORE: la cartella $cloneDir esiste gia'. Rimuovila o usa -InPlace." -ForegroundColor Red
        exit 1
    }
    Write-Host ""
    Write-Host "Clonazione $sourceRoot -> $cloneDir ..." -ForegroundColor Cyan

    # Copia escludendo artefatti pesanti/rigenerabili
    $excludeDirs = @('node_modules', '.angular', 'dist', 'bin', 'obj')
    $sourceLeaf = Split-Path $sourceRoot -Leaf

    # robocopy per performance su cartelle grandi. /E = ricorsivo, /XD = escludi dir.
    # robocopy exit code 0-7 = successo, >=8 = errore.
    $robocopyArgs = @($sourceRoot, $cloneDir, '/E', '/NJH', '/NJS', '/NFL', '/NDL', '/NC', '/NS', '/NP')
    foreach ($d in $excludeDirs) {
        $robocopyArgs += '/XD'
        $robocopyArgs += $d
    }
    & robocopy @robocopyArgs | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy fallito con exit code $LASTEXITCODE"
    }

    Write-Host "  Clonata (esclusi: $($excludeDirs -join ', '))" -ForegroundColor Green
    $projectRoot = $cloneDir
}

Write-Host ""
Write-Host "Rinomina progetto:" -ForegroundColor Cyan
Write-Host "  $oldPascal -> $pascal" -ForegroundColor White
Write-Host "  $oldKebab  -> $kebab" -ForegroundColor White
Write-Host "  Root: $projectRoot" -ForegroundColor DarkGray
Write-Host ""

# ── helpers ──────────────────────────────────────────────────────────

$stats = @{ filesModified = 0; filesRenamed = 0 }

function Replace-InFile {
    param(
        [string]$FilePath,
        [string]$Old,
        [string]$New
    )
    if (-not (Test-Path $FilePath)) { return $false }
    $content = Get-Content -Path $FilePath -Raw -Encoding UTF8
    if ($content -match [regex]::Escape($Old)) {
        $content = $content -replace [regex]::Escape($Old), $New
        Set-Content -Path $FilePath -Value $content -Encoding UTF8 -NoNewline
        return $true
    }
    return $false
}

function Process-File {
    param([string]$RelPath)
    $fullPath = Join-Path $projectRoot $RelPath
    if (-not (Test-Path $fullPath)) {
        Write-Host "  [skip] $RelPath (non trovato)" -ForegroundColor DarkGray
        return
    }
    $changed = $false
    if (Replace-InFile -FilePath $fullPath -Old $oldPascal -New $pascal) { $changed = $true }
    if (Replace-InFile -FilePath $fullPath -Old $oldKebab -New $kebab) { $changed = $true }
    if (Replace-InFile -FilePath $fullPath -Old "${oldKebab}-standalone" -New "${kebab}") { $changed = $true }
    if ($changed) {
        $stats.filesModified++
        Write-Host "  [ok] $RelPath" -ForegroundColor Green
    }
}

# ── step 1: rename .csproj file ─────────────────────────────────────

Write-Host "--- 1/5 Rinomina file .csproj" -ForegroundColor Cyan
$csprojOld = Join-Path $projectRoot "$oldPascal.csproj"
if (Test-Path $csprojOld) {
    Rename-Item -Path $csprojOld -NewName "$pascal.csproj"
    $stats.filesRenamed++
    Write-Host "  [ok] $oldPascal.csproj -> $pascal.csproj" -ForegroundColor Green
}

# ── step 2: rename controller file ──────────────────────────────────

Write-Host "--- 2/5 Rinomina controller" -ForegroundColor Cyan
$ctrlOld = Join-Path $projectRoot "Controllers\${oldPascal}ActionsController.cs"
if (Test-Path $ctrlOld) {
    Rename-Item -Path $ctrlOld -NewName "${pascal}ActionsController.cs"
    $stats.filesRenamed++
    Write-Host "  [ok] ${oldPascal}ActionsController.cs -> ${pascal}ActionsController.cs" -ForegroundColor Green
}

# ── step 3: content replacements ────────────────────────────────────

Write-Host "--- 3/5 Aggiornamento contenuti" -ForegroundColor Cyan

# C# files
Process-File "Program.cs"
Process-File "Controllers\${pascal}ActionsController.cs"

# Configuration
Process-File "appsettings.json"
Process-File "appsettings.Development.json"

# Angular
Process-File "wwwroot\angular.json"
Process-File "wwwroot\package.json"
Process-File "wwwroot\src\index.html"
Process-File "wwwroot\src\app\app.component.ts"
Process-File "wwwroot\src\app\app.component.spec.ts"

# VS Code
Process-File ".vscode\launch.json"
Process-File ".vscode\tasks.json"

# ── step 4: fix package.json name ───────────────────────────────────

Write-Host "--- 4/5 Verifica package.json name" -ForegroundColor Cyan
$pkgPath = Join-Path $projectRoot "wwwroot\package.json"
if (Test-Path $pkgPath) {
    $pkgContent = Get-Content -Path $pkgPath -Raw -Encoding UTF8
    if ($pkgContent -match '"name"\s*:\s*"[^"]*-standalone"') {
        $pkgContent = $pkgContent -replace '"name"\s*:\s*"[^"]*"', "`"name`": `"$kebab`""
        Set-Content -Path $pkgPath -Value $pkgContent -Encoding UTF8 -NoNewline
        Write-Host "  [ok] package.json name -> $kebab" -ForegroundColor Green
    } else {
        Write-Host "  [ok] package.json name gia' corretto" -ForegroundColor Green
    }
}

# ── step 5: rename project folder (in-place only) ───────────────────

Write-Host "--- 5/5 Rinomina cartella progetto" -ForegroundColor Cyan
$currentLeaf = Split-Path $projectRoot -Leaf
if ($currentLeaf -eq $oldPascal -and $InPlace) {
    $parentDir = Split-Path $projectRoot -Parent
    $newDir = Join-Path $parentDir $pascal
    if (Test-Path $newDir) {
        Write-Host "  [skip] cartella $newDir esiste gia'" -ForegroundColor Yellow
    } else {
        Rename-Item -Path $projectRoot -NewName $pascal
        $projectRoot = $newDir
        $stats.filesRenamed++
        Write-Host "  [ok] $oldPascal/ -> $pascal/" -ForegroundColor Green
    }
} else {
    Write-Host "  [skip] cartella gia' con nome corretto o modalita' clone" -ForegroundColor DarkGray
}

# ── summary ──────────────────────────────────────────────────────────

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Progetto rinominato: $pascal" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "  File rinominati:  $($stats.filesRenamed)" -ForegroundColor White
Write-Host "  File aggiornati:  $($stats.filesModified)" -ForegroundColor White
Write-Host "  Cartella:         $projectRoot" -ForegroundColor White
Write-Host ""
Write-Host "Prossimi passi:" -ForegroundColor Cyan
Write-Host "  cd `"$projectRoot`"" -ForegroundColor White
Write-Host "  dotnet restore" -ForegroundColor White
Write-Host "  dotnet build $pascal.csproj" -ForegroundColor White
Write-Host "  cd wwwroot && npm install && npm run serve:npm" -ForegroundColor White
Write-Host ""
