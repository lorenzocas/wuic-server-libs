$ErrorActionPreference = 'Stop'

# Login
$loginBody = @{ user_name = 'admin'; password = 'admin'; captchaToken = '' } | ConvertTo-Json -Compress
$resp = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/Meta/AsmxProxy/MetaService.login' -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
foreach ($s in @($resp.Headers['Set-Cookie'])) { if ($s -match '^\s*k-user=([^;]+)') { $kc = $Matches[1]; break } }
$h = @{ 'Cookie' = "k-user=$kc" }
Write-Host "[login] ok" -ForegroundColor Green

# Find SUMMARY_COST + CNH-PROG-001
$cs = 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Data;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$c = New-Object System.Data.SqlClient.SqlConnection $cs; $c.Open()
$cmd = $c.CreateCommand()
$cmd.CommandText = "SELECT (SELECT TOP 1 id FROM rep.report_definition WHERE code = 'SUMMARY_COST') AS rep_id, (SELECT TOP 1 id FROM core.program WHERE code = 'CNH-PROG-001') AS prog_id"
$rd = $cmd.ExecuteReader()
$rd.Read() | Out-Null
$repId = [int]$rd['rep_id']
$progId = [int]$rd['prog_id']
$rd.Close()
Write-Host "[ids] rep=$repId prog=$progId"

# Test: full year 2026, no scenario filter
$body = @{ params = @{ program_id = $progId; year_from = 2026; year_to = 2026 } } | ConvertTo-Json -Compress
Write-Host ""
Write-Host "[request] $body" -ForegroundColor Cyan
$enq = Invoke-WebRequest -Method Post -Uri "https://localhost:6543/api/reports/run/$repId" `
    -ContentType 'application/json' -Body $body -Headers $h -SkipCertificateCheck
Write-Host ""
Write-Host "[enqueue] $($enq.Content)"
$execId = ($enq.Content | ConvertFrom-Json).executionId

# Dispatch outbox
$disp = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/scheduler/costcnh_outbox_dispatch' `
    -ContentType 'application/json' -Body '{}' -Headers $h -SkipCertificateCheck
Write-Host ""
Write-Host "[dispatch] $($disp.Content)"

# Read execution + result_json
$cmd2 = $c.CreateCommand()
$cmd2.CommandText = "SELECT id, status, duration_ms, result_row_count, result_json FROM rep.report_execution WHERE id = $execId"
$rd2 = $cmd2.ExecuteReader()
$rd2.Read() | Out-Null
$status = [int]$rd2['status']
$durationMs = [int]$rd2['duration_ms']
$rowCount = [int]$rd2['result_row_count']
$resultJson = [string]$rd2['result_json']
$rd2.Close()

Write-Host ""
Write-Host ("[execution] id=$execId status=$status duration=${durationMs}ms input_rows=$rowCount result_len=" + $resultJson.Length + " chars") -ForegroundColor Green

# Pretty-print parse
$result = $resultJson | ConvertFrom-Json
Write-Host ""
Write-Host "─── HEADER ────────────────────────────────────────────────"
Write-Host "  program           = $($result.program.code) / $($result.program.name)"
Write-Host "  time_now_month    = $($result.time_now_month)"
Write-Host "  baseline_source   = $($result.baseline_source_code)"
Write-Host "  filter_year_range = $($result.filter_year_range | ConvertTo-Json -Compress)"

Write-Host ""
Write-Host "─── TOTALS (grand summary) ───────────────────────────────"
Write-Host "  row_count         = $($result.totals.row_count) (XBS_L1 × month)"
Write-Host "  xbs_l1_count      = $($result.totals.xbs_l1_count)"
Write-Host "  month_count       = $($result.totals.month_count)"
Write-Host "  total_planned     = $($result.totals.total_planned)"
Write-Host "  total_actual      = $($result.totals.total_actual)"
Write-Host "  total_variance    = $($result.totals.total_variance) ← (3a) actual-planned"
Write-Host "  baseline_drift    = $($result.totals.total_baseline_drift) ← (3b) planned-baseline"
Write-Host "  forecast_likely   = $($result.totals.total_forecast_likely) ← (5) EAV F2"
Write-Host "  target_amount     = $($result.totals.total_target) ← (5) EAV TG"

Write-Host ""
Write-Host "─── BY XBS L1 (cross-section) ────────────────────────────"
foreach ($x in $result.by_xbs_l1) {
    Write-Host ("  {0,-15} planned={1,10:N2} actual={2,10:N2} variance={3,10:N2} baseline={4,10:N2}" -f $x.xbs_l1_code, $x.planned, $x.actual, $x.variance, $x.baseline)
}

Write-Host ""
Write-Host "─── ROWS sample (first 6) ────────────────────────────────"
Write-Host ("  {0,-7} {1,-15} {2,8} {3,8} {4,8} {5,8} {6,8} {7,8} {8,8} {9,8}" -f 'month','xbs_l1','planned','actual','plan_ytd','act_ytd','past','future','var%','bl_drift%')
$result.rows | Select-Object -First 6 | ForEach-Object {
    $past = if ($_.actual_past_only -ne $null) { '{0:N0}' -f $_.actual_past_only } else { '-' }
    $future = if ($_.forecast_future_only -ne $null) { '{0:N0}' -f $_.forecast_future_only } else { '-' }
    $varpct = if ($_.variance_pct -ne $null) { '{0:N1}%' -f $_.variance_pct } else { '-' }
    $blpct = if ($_.baseline_drift_pct -ne $null) { '{0:N1}%' -f $_.baseline_drift_pct } else { '-' }
    Write-Host ("  {0,-7} {1,-15} {2,8:N0} {3,8} {4,8:N0} {5,8} {6,8} {7,8} {8,8} {9,8}" -f $_.time_month_id, $_.xbs_l1_code, $_.planned, $_.actual, $_.planned_ytd, $_.actual_ytd, $past, $future, $varpct, $blpct)
}

Write-Host ""
Write-Host "─── VERIFY 5 formula categories all present ──────────────"
$tests = @(
    @{ Name='(1) Pivot dimensionale (xbs_l1_code in rows)';        Pass = $result.rows[0].xbs_l1_code -ne $null }
    @{ Name='(2) Running totals (planned_ytd > planned)';          Pass = ($result.rows | Where-Object { $_.planned_ytd -gt $_.planned } | Measure-Object).Count -gt 0 }
    @{ Name='(3a) Variance amount + variance_pct present';         Pass = ($result.rows[0].variance_amount -ne $null) }
    @{ Name='(3b) Baseline drift (baseline_amount != null)';       Pass = ($result.rows | Where-Object { $_.baseline_amount -ne $null } | Measure-Object).Count -gt 0 }
    @{ Name='(4) Conditional past/future split asymmetric';        Pass = (($result.rows | Where-Object { $_.actual_past_only -ne $null } | Measure-Object).Count -gt 0) -and (($result.rows | Where-Object { $_.forecast_future_only -ne $null } | Measure-Object).Count -gt 0) }
    @{ Name='(5) EAV measures (target+forecast_likely present)';   Pass = ($result.rows[0].target_amount -ne $null) -and ($result.rows[0].forecast_likely -ne $null) }
)
foreach ($t in $tests) {
    $sym = if ($t.Pass) { '✓' } else { '✗' }
    $color = if ($t.Pass) { 'Green' } else { 'Red' }
    Write-Host ("  $sym $($t.Name)") -ForegroundColor $color
}

$c.Close()
