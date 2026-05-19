#requires -version 5
<#
.SYNOPSIS
  ETL E2E test runner — esegue 3 test files (congruence/consistency/integrity)
  contro l'ultimo etl.run_id (o un run specifico) e produce summary pass/fail.

.PARAMETER EtlRunId
  ID di etl.run da testare. Default = MAX(id) FROM etl.run.

.PARAMETER SourceDb
  Nome source DB (default Cost_Offhighway_Test_Mock).

.EXAMPLE
  pwsh -File run-all.ps1
  pwsh -File run-all.ps1 -EtlRunId 2
#>
param(
    [int]$EtlRunId = 0,
    [string]$SourceDb = 'Cost_Offhighway_Test_Mock'
)

$ErrorActionPreference = 'Stop'
$cs = "Server=localhost\sqlexpress;Database=CostCnh_Data;User Id=sa;Password=superlamelauser;TrustServerCertificate=True;Pooling=False"

function Invoke-Sql {
    param([string]$Sql, [int]$Timeout = 120)
    $cn = New-Object System.Data.SqlClient.SqlConnection $cs; $cn.Open()
    try {
        foreach ($b in ($Sql -split "(?m)^\s*GO\s*$")) {
            $t = $b.Trim(); if (-not $t) { continue }
            $c = $cn.CreateCommand(); $c.CommandText = $t; $c.CommandTimeout = $Timeout
            $c.ExecuteNonQuery() | Out-Null
        }
    } finally { $cn.Close() }
}
function Query-Scalar {
    param([string]$Sql)
    $cn = New-Object System.Data.SqlClient.SqlConnection $cs; $cn.Open()
    try { $c = $cn.CreateCommand(); $c.CommandText = $Sql; return $c.ExecuteScalar() } finally { $cn.Close() }
}
function Query-Rows {
    param([string]$Sql)
    $cn = New-Object System.Data.SqlClient.SqlConnection $cs; $cn.Open()
    $rows = @()
    try {
        $c = $cn.CreateCommand(); $c.CommandText = $Sql
        $rd = $c.ExecuteReader()
        while ($rd.Read()) {
            $r = @{}
            for ($i = 0; $i -lt $rd.FieldCount; $i++) { $r[$rd.GetName($i)] = $rd[$i] }
            $rows += $r
        }
    } finally { $cn.Close() }
    return $rows
}

# Resolve EtlRunId
if ($EtlRunId -eq 0) {
    $EtlRunId = [int](Query-Scalar "SELECT ISNULL(MAX(id), 0) FROM [etl].[run]")
    if ($EtlRunId -eq 0) { throw "No etl.run exists. Run ETL first." }
}
Write-Host "ETL run_id under test: $EtlRunId" -ForegroundColor Cyan
Write-Host "Source DB: $SourceDb" -ForegroundColor Cyan

# Start test_run row
$testRunId = [int](Query-Scalar @"
DECLARE @rid BIGINT;
EXEC [tt].[start_run] @etl_run_id = $EtlRunId, @source_db = N'$SourceDb', @run_id = @rid OUTPUT;
SELECT @rid;
"@)
Write-Host "Test run_id: $testRunId" -ForegroundColor Cyan

# Insert pre-snapshot (capturing current source as 'pre' for integrity test)
# Lo facciamo qui (post-ETL) perché abbiamo gia' ETL completato. Per smoke check su
# qualunque modifica successiva, lasciamo che 30-test re-snappi e confronti.
$preSnapshotSql = @"
INSERT INTO [tt].[source_snapshot] (test_run_id, snapshot_kind, source_db, table_name, row_count, checksum_agg)
SELECT $testRunId, 'pre', N'$SourceDb', 'core.Sites', COUNT(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM [$SourceDb].[core].[Sites];
INSERT INTO [tt].[source_snapshot] (test_run_id, snapshot_kind, source_db, table_name, row_count, checksum_agg)
SELECT $testRunId, 'pre', N'$SourceDb', 'core.Currencies', COUNT(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM [$SourceDb].[core].[Currencies];
INSERT INTO [tt].[source_snapshot] (test_run_id, snapshot_kind, source_db, table_name, row_count, checksum_agg)
SELECT $testRunId, 'pre', N'$SourceDb', 'core.Programs', COUNT(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM [$SourceDb].[core].[Programs];
INSERT INTO [tt].[source_snapshot] (test_run_id, snapshot_kind, source_db, table_name, row_count, checksum_agg)
SELECT $testRunId, 'pre', N'$SourceDb', 'core.ProjectScenarios', COUNT(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM [$SourceDb].[core].[ProjectScenarios];
INSERT INTO [tt].[source_snapshot] (test_run_id, snapshot_kind, source_db, table_name, row_count, checksum_agg)
SELECT $testRunId, 'pre', N'$SourceDb', 'facts.XBS_Objects', COUNT(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM [$SourceDb].[facts].[XBS_Objects];
INSERT INTO [tt].[source_snapshot] (test_run_id, snapshot_kind, source_db, table_name, row_count, checksum_agg)
SELECT $testRunId, 'pre', N'$SourceDb', 'facts.CostPlanning_Facts', COUNT(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM [$SourceDb].[facts].[CostPlanning_Facts];
"@
# Make sure source_snapshot table exists first (script 30 creates it)
Invoke-Sql -Sql "IF OBJECT_ID(N'[tt].[source_snapshot]', N'U') IS NULL BEGIN CREATE TABLE [tt].[source_snapshot] (id BIGINT IDENTITY(1,1) PRIMARY KEY, test_run_id BIGINT NULL, snapshot_kind VARCHAR(10) NOT NULL, source_db NVARCHAR(128) NOT NULL, table_name NVARCHAR(200) NOT NULL, row_count BIGINT NULL, checksum_agg BIGINT NULL, captured_at_utc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()); END"
Invoke-Sql -Sql $preSnapshotSql
Write-Host "Pre-snapshot saved (6 source tables)" -ForegroundColor Gray

# Run test files
$testFiles = @(
    "10-test-congruence.sql",
    "20-test-consistency.sql",
    "30-test-source-integrity.sql",
    "40-test-calculations-rates.sql",
    "50-test-calculations-totals.sql",
    "60-test-side-by-side-legacy.sql"
)
foreach ($f in $testFiles) {
    Write-Host "Running $f..." -ForegroundColor Yellow
    $sql = Get-Content -Raw "C:\src\Wuic\CostCnh\dbms\etl\tests\$f"
    $sql = $sql -replace '<<TEST_RUN_ID>>', $testRunId
    $sql = $sql -replace '<<SOURCE_DB>>', "[$SourceDb]"
    $sql = $sql -replace '<<SOURCE_DB_NAME>>', $SourceDb
    try { Invoke-Sql -Sql $sql -Timeout 300 } catch { Write-Host "  ERR: $($_.Exception.Message)" -ForegroundColor Red }
}

# Complete + summary
Invoke-Sql -Sql "EXEC [tt].[complete_run] @run_id = $testRunId"
$total = [int](Query-Scalar "SELECT ISNULL(total_count, 0) FROM [tt].[test_run] WHERE id = $testRunId")
$pass  = [int](Query-Scalar "SELECT ISNULL(pass_count, 0) FROM [tt].[test_run] WHERE id = $testRunId")
$fail  = [int](Query-Scalar "SELECT ISNULL(fail_count, 0) FROM [tt].[test_run] WHERE id = $testRunId")

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " Test summary (test_run_id=$testRunId, etl_run_id=$EtlRunId)" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Total : $total" -ForegroundColor White
Write-Host "  Pass  : $pass" -ForegroundColor Green
Write-Host "  Fail  : $fail" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
Write-Host ""

# Per-category breakdown
$byCat = Query-Rows @"
SELECT category, status, COUNT(*) AS c
  FROM [tt].[test_result]
 WHERE test_run_id = $testRunId
 GROUP BY category, status
 ORDER BY category, status
"@
Write-Host "Per category:" -ForegroundColor White
foreach ($r in $byCat) {
    $color = if ($r.status -eq 'pass') { 'Green' } elseif ($r.status -eq 'fail') { 'Red' } else { 'Gray' }
    Write-Host ("  {0,-12} {1,-6} {2}" -f $r.category, $r.status, $r.c) -ForegroundColor $color
}

# Failures detail
if ($fail -gt 0) {
    Write-Host ""
    Write-Host "Failures detail:" -ForegroundColor Red
    $fails = Query-Rows @"
SELECT category, test_name, expected, actual, message
  FROM [tt].[test_result]
 WHERE test_run_id = $testRunId AND status = 'fail'
 ORDER BY category, id
"@
    foreach ($r in $fails) {
        Write-Host ("  [{0}] {1}" -f $r.category, $r.test_name) -ForegroundColor Red
        Write-Host ("    expected={0} actual={1}" -f $r.expected, $r.actual) -ForegroundColor DarkRed
        if ($r.message) { Write-Host ("    {0}" -f $r.message) -ForegroundColor DarkRed }
    }
}

exit $(if ($fail -eq 0) { 0 } else { 1 })
