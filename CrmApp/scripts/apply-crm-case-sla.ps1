param(
  [string]$SqlFile = "scripts/setup-crm-case-sla.sql",
  [switch]$SkipMetadataPatch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$configPath = Join-Path $PSScriptRoot "..\appsettings.json"
if (-not (Test-Path $configPath)) {
  throw "Config non trovato: $configPath"
}

$app = Get-Content $configPath -Raw | ConvertFrom-Json
$dataConn = [string]$app.ConnectionStrings.DataSQLConnection
$metaConn = [string]$app.ConnectionStrings.MetaDataSQLConnection
if ([string]::IsNullOrWhiteSpace($dataConn)) {
  throw "ConnectionStrings:DataSQLConnection mancante in appsettings.json"
}
if ([string]::IsNullOrWhiteSpace($metaConn)) {
  throw "ConnectionStrings:MetaDataSQLConnection mancante in appsettings.json"
}

$sqlPath = Join-Path $PSScriptRoot "..\$SqlFile"
if (-not (Test-Path $sqlPath)) {
  throw "Script SQL non trovato: $sqlPath"
}

$sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue
if (-not $sqlcmd) {
  throw "sqlcmd non trovato nel PATH"
}

$dbName = if ($app.AppSettings.DataDBName) { [string]$app.AppSettings.DataDBName } else { "AdvancedCRM" }

Write-Host "[crm-cases-sla] applying SQL from $sqlPath"
& sqlcmd -S "localhost\sqlexpress" -d $dbName -U "sa" -P "superlamelauser" -i $sqlPath

if (-not $SkipMetadataPatch) {
  $patchPath = Join-Path $PSScriptRoot "metadata-patches\20260322-crm-cases-sla.patch.ps1"
  if (-not (Test-Path $patchPath)) {
    throw "Metadata patch non trovata: $patchPath"
  }

  Write-Host "[crm-cases-sla] applying metadata patch from $patchPath"
  & $patchPath -DataConnectionString $dataConn -MetadataConnectionString $metaConn
}

# Upsert scheduler in MetadataCRM (scheduler table lives in metadata DB)
$upsertSchedulerSql = @"
DECLARE @target_md_id INT;
SELECT @target_md_id = md_id
FROM _metadati__tabelle
WHERE mdroutename = 'crm_cases';

IF @target_md_id IS NULL
BEGIN
  RAISERROR('Route crm_cases non trovata in metadata.', 16, 1);
  RETURN;
END

IF EXISTS (SELECT 1 FROM dbo.scheduler WHERE event_name = 'CRM_Cases_SLA_Check')
BEGIN
  UPDATE dbo.scheduler
  SET
    action_type = '1',
    action_cmd = 'EXEC dbo.crm_sp_check_sla_breach',
    params_values = '',
    month_interval = 0,
    day_interval = 0,
    hour_interval = 0,
    minute_interval = 15,
    second_interval = 0,
    enabled = 1,
    target_route = @target_md_id,
    next_execution = DATEADD(MINUTE, 15, GETDATE())
  WHERE event_name = 'CRM_Cases_SLA_Check';
END
ELSE
BEGIN
  INSERT INTO dbo.scheduler
  (
    event_name,
    action_type,
    action_cmd,
    params_values,
    month_interval,
    day_interval,
    hour_interval,
    minute_interval,
    second_interval,
    enabled,
    target_route,
    next_execution
  )
  VALUES
  (
    'CRM_Cases_SLA_Check',
    '1',
    'EXEC dbo.crm_sp_check_sla_breach',
    '',
    0,
    0,
    0,
    15,
    0,
    1,
    @target_md_id,
    DATEADD(MINUTE, 15, GETDATE())
  );
END
"@

& sqlcmd -S "localhost\sqlexpress" -d "MetadataCRM" -U "sa" -P "superlamelauser" -Q $upsertSchedulerSql

Write-Host "[crm-cases-sla] done"
