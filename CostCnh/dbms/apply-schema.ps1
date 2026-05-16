<#
.SYNOPSIS
  Applica gli script DDL della cartella schema/ a CostCnh_Data in ordine
  numerico (00, 10, 20, 30, 40, 50, ..., 99). Idempotente: ogni file usa
  pattern IF OBJECT_ID(...) IS NULL CREATE TABLE / IF NOT EXISTS sys.*.

.PARAMETER SqlInstance
  Default localhost\sqlexpress.

.PARAMETER Database
  Default CostCnh_Data.

.PARAMETER OnlyMatching
  Glob per filtrare i file (es. '10-*.sql'). Default '*.sql'.

.EXAMPLE
  pwsh -ExecutionPolicy Bypass -File apply-schema.ps1
  pwsh -ExecutionPolicy Bypass -File apply-schema.ps1 -OnlyMatching '30-*.sql'
#>
param(
    [string]$SqlInstance = 'localhost\sqlexpress',
    [string]$Database    = 'CostCnh_Data',
    [string]$OnlyMatching = '*.sql'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$schemaDir = Join-Path $PSScriptRoot 'schema'
if (-not (Test-Path $schemaDir)) {
    Write-Host "ERRORE: $schemaDir non trovato" -ForegroundColor Red
    exit 1
}

$files = Get-ChildItem -Path $schemaDir -Filter $OnlyMatching | Sort-Object Name

if (-not $files) {
    Write-Host "Nessun file da applicare (filter: $OnlyMatching)" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  Apply schema → [$SqlInstance].[$Database]" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  Files: $($files.Count) ($OnlyMatching)" -ForegroundColor White

foreach ($f in $files) {
    Write-Host ""
    Write-Host "── $($f.Name) ──" -ForegroundColor Cyan
    & sqlcmd -S $SqlInstance -d $Database -E -C -b -i $f.FullName
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FAIL] sqlcmd exit $LASTEXITCODE su $($f.Name)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "  [ok] $($f.Name) applicato" -ForegroundColor Green
}

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  Tutti gli script applicati con successo" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
