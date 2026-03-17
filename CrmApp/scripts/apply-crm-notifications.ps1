param(
  [string]$SqlFile = "scripts/setup-crm-notifications.sql"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$configPath = Join-Path $PSScriptRoot "..\appsettings.json"
if (-not (Test-Path $configPath)) {
  throw "Config non trovato: $configPath"
}

$app = Get-Content $configPath -Raw | ConvertFrom-Json
$conn = [string]$app.ConnectionStrings.DataSQLConnection
if ([string]::IsNullOrWhiteSpace($conn)) {
  throw "ConnectionStrings:DataSQLConnection mancante in appsettings.json"
}

$sqlPath = Join-Path $PSScriptRoot "..\$SqlFile"
if (-not (Test-Path $sqlPath)) {
  throw "Script SQL non trovato: $sqlPath"
}

$sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue
if (-not $sqlcmd) {
  throw "sqlcmd non trovato nel PATH"
}

Write-Host "[crm-notifications] applying SQL from $sqlPath"
& sqlcmd -S "localhost\sqlexpress" -d (($app.AppSettings.DataDBName) ? $app.AppSettings.DataDBName : "AdvancedCRM") -U "sa" -P "superlamelauser" -i $sqlPath
Write-Host "[crm-notifications] done"
