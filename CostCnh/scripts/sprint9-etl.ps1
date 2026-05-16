<#
.SYNOPSIS
  Sprint 9.1 — ETL orchestrator: Cost_Offhighway_Test → CostCnh_Data.
  Idempotente + restartable: ogni phase si skippa se gia' status=1 in etl.run_phase.
  Pre-requisito: source DB raggiungibile come 3-part name (stesso SQL instance)
  oppure via Linked Server pre-configurato.

.PARAMETER SourceDb
  Nome database sorgente (es. 'Cost_Offhighway_Test') sullo stesso SQL instance.
  Per cross-server: passare nome 4-part del linked server (es. 'AzureSrv.Cost_Offhighway_Test').

.PARAMETER TargetServer
  SQL Server target. Default localhost\sqlexpress.

.PARAMETER TargetDb
  DB target. Default CostCnh_Data.

.PARAMETER Phases
  Comma-separated list di fasi da eseguire (1,2,3,4,9). Default = "1,2,3,4,9".

.PARAMETER DryRun
  Switch: se presente, esegue solo i phase scripts in `--no-execute` mode (PRINT
  only, no INSERT/UPDATE).

.PARAMETER MonthFrom / MonthTo
  Solo per phase 4 (cp.facts). Range YYYYMM. Default 201801..203012.

.EXAMPLE
  pwsh -File scripts/sprint9-etl.ps1 -SourceDb Cost_Offhighway_Test
  pwsh -File scripts/sprint9-etl.ps1 -SourceDb Cost_Offhighway_Test -Phases "1,2"
  pwsh -File scripts/sprint9-etl.ps1 -SourceDb Cost_Offhighway_Test -DryRun
#>
param(
    [Parameter(Mandatory=$true)] [string]$SourceDb,
    [string]$TargetServer = 'localhost\sqlexpress',
    [string]$TargetDb     = 'CostCnh_Data',
    [string]$Phases       = '1,2,3,4,9',
    [switch]$DryRun,
    [int]$MonthFrom       = 201801,
    [int]$MonthTo         = 203012,
    [string]$SqlUser      = 'sa',
    [string]$SqlPassword  = 'superlamelauser'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$etlDir = Join-Path $PSScriptRoot '..\dbms\etl' | Resolve-Path | Select-Object -ExpandProperty Path

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Sprint 9.1 ETL orchestrator" -ForegroundColor Green
Write-Host "  Source: $SourceDb → Target: [$TargetServer].[$TargetDb]" -ForegroundColor White
Write-Host "  Phases: $Phases   DryRun: $($DryRun.IsPresent)" -ForegroundColor White
Write-Host "  cp.facts range: $MonthFrom .. $MonthTo" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green

# 1) Verify framework schema esiste
function Invoke-SqlScalar {
    param([string]$Query)
    $args = @('-S', $TargetServer, '-U', $SqlUser, '-P', $SqlPassword, '-C', '-d', $TargetDb, '-b', '-h', '-1', '-W', '-Q', $Query)
    $output = & sqlcmd @args 2>&1
    if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed: $($output -join [Environment]::NewLine)" }
    return ($output | Select-Object -First 1).ToString().Trim()
}

$schemaOk = Invoke-SqlScalar "SELECT CASE WHEN OBJECT_ID('etl.run') IS NOT NULL THEN '1' ELSE '0' END"
if ($schemaOk -ne '1') {
    Write-Host "[bootstrap] etl schema mancante — applico 00-etl-framework.sql..." -ForegroundColor Yellow
    & sqlcmd -S $TargetServer -U $SqlUser -P $SqlPassword -C -d $TargetDb -b -i (Join-Path $etlDir '00-etl-framework.sql')
    if ($LASTEXITCODE -ne 0) { throw "Bootstrap framework failed" }
}

# 2) Verify source DB reachable
try {
    $srcCount = Invoke-SqlScalar "SELECT COUNT(*) FROM [$SourceDb].[core].[Sites]"
    Write-Host "[connect] [$SourceDb].[core].[Sites] count = $srcCount" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Source DB [$SourceDb] non raggiungibile. Errore: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "      Verifica che:" -ForegroundColor Yellow
    Write-Host "        - Il database sia attached/online sul SQL instance $TargetServer" -ForegroundColor Yellow
    Write-Host "        - O che il linked server '$SourceDb' sia configurato e funzionante" -ForegroundColor Yellow
    Write-Host "        - O che si stia usando il nome corretto (4-part: 'LinkedSrv.DbName')" -ForegroundColor Yellow
    throw
}

# 3) Start ETL run
$dryRunFlag = if ($DryRun.IsPresent) { '1' } else { '0' }
$startRunQuery = @"
DECLARE @id BIGINT;
EXEC [etl].[start_run] @source_dsn = N'$SourceDb', @dry_run = $dryRunFlag, @run_id = @id OUTPUT;
SELECT @id;
"@
$runId = [int](Invoke-SqlScalar $startRunQuery)
Write-Host "[run] etl.run.id = $runId (dry_run=$dryRunFlag)" -ForegroundColor Cyan

# 4) Execute each phase
$phaseFiles = @{
    '1' = '10-phase1-anagrafica.sql'
    '2' = '20-phase2-xbs.sql'
    '3' = '30-phase3-programs.sql'
    '4' = '40-phase4-facts.sql'
    '9' = '90-phase9-validation.sql'
}

$phaseList = $Phases -split ',' | ForEach-Object { $_.Trim() }
foreach ($p in $phaseList) {
    if (-not $phaseFiles.ContainsKey($p)) {
        Write-Host "  [warn] phase '$p' sconosciuto, skip" -ForegroundColor Yellow
        continue
    }
    $f = Join-Path $etlDir $phaseFiles[$p]
    if (-not (Test-Path $f)) {
        Write-Host "  [warn] file $($phaseFiles[$p]) mancante, skip" -ForegroundColor Yellow
        continue
    }

    Write-Host ""
    Write-Host ("-- Phase {0}: {1} --" -f $p, $phaseFiles[$p]) -ForegroundColor Cyan

    # Read script + substitute placeholders
    $sql = Get-Content -Raw $f
    $sql = $sql.Replace('<<RUN_ID>>',     $runId.ToString())
    $sql = $sql.Replace('<<SOURCE_DB>>',  "[$SourceDb]")
    $sql = $sql.Replace('<<MONTH_FROM>>', $MonthFrom.ToString())
    $sql = $sql.Replace('<<MONTH_TO>>',   $MonthTo.ToString())

    # Wrap in tx + (optional) rollback for dry-run
    if ($DryRun.IsPresent) {
        $sql = "BEGIN TRAN; SET XACT_ABORT ON;`n" + $sql + "`nROLLBACK;`nPRINT '[dry-run] all changes rolled back';"
    }

    # Write to temp file + run
    $tmp = "$env:TEMP\sprint9-phase$p-$(Get-Random).sql"
    Set-Content -Path $tmp -Value $sql -Encoding UTF8
    try {
        & sqlcmd -S $TargetServer -U $SqlUser -P $SqlPassword -C -d $TargetDb -b -i $tmp 2>&1 | ForEach-Object { Write-Host "  $_" }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [FAIL] phase $p sqlcmd exit $LASTEXITCODE" -ForegroundColor Red
            throw "Phase $p failed"
        }
    } finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
}

# 5) Mark run completed
$completeQuery = @"
UPDATE [etl].[run]
   SET completed_at_utc = SYSUTCDATETIME(),
       status = (SELECT TOP 1 CASE WHEN status = 9 THEN 9 ELSE 1 END FROM [etl].[run_phase] WHERE run_id = $runId ORDER BY status DESC),
       total_errors = (SELECT COUNT(*) FROM [etl].[error] WHERE run_id = $runId)
 WHERE id = $runId;
SELECT '[summary] ' + CAST(id AS NVARCHAR(10)) + ' status=' + CAST(status AS NVARCHAR(5)) + ' errors=' + CAST(total_errors AS NVARCHAR(10))
FROM [etl].[run] WHERE id = $runId;
"@
$summary = Invoke-SqlScalar $completeQuery
Write-Host ""
Write-Host $summary -ForegroundColor Green

# 6) Show phase summary
$summaryQuery = @"
SELECT
    'phase=' + CAST(phase_number AS NVARCHAR(2))
    + ' ' + RIGHT('                                  ' + phase_name, 38)
    + ' status=' + CAST(status AS NVARCHAR(2))
    + ' rows_in=' + ISNULL(CAST(rows_in AS NVARCHAR(20)), '0')
    + ' inserted=' + ISNULL(CAST(rows_inserted AS NVARCHAR(20)), '0')
    + ' rejected=' + ISNULL(CAST(rows_rejected AS NVARCHAR(20)), '0')
    + ' dur=' + ISNULL(CAST(duration_ms AS NVARCHAR(10)), '0') + 'ms'
FROM [etl].[run_phase] WHERE run_id = $runId ORDER BY phase_number;
"@
& sqlcmd -S $TargetServer -U $SqlUser -P $SqlPassword -C -d $TargetDb -b -h -1 -W -Q $summaryQuery

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  ETL run $runId complete" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
