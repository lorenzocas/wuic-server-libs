$ErrorActionPreference = 'Stop'

# Login
$loginBody = @{ user_name = 'admin'; password = 'admin'; captchaToken = '' } | ConvertTo-Json -Compress
$resp = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/Meta/AsmxProxy/MetaService.login' -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
$kc = $null
foreach ($s in @($resp.Headers['Set-Cookie'])) { if ($s -match '^\s*k-user=([^;]+)') { $kc = $Matches[1]; break } }
$h = @{ 'Cookie' = "k-user=$kc" }
Write-Host "[login] ok" -ForegroundColor Green

# Find PROGRAM_PIVOT
$cs = 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Data;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$c = New-Object System.Data.SqlClient.SqlConnection $cs; $c.Open()
$cmd = $c.CreateCommand()
$cmd.CommandText = "SELECT TOP 1 id, code FROM rep.report_definition WHERE code = 'PROGRAM_PIVOT'"
$rd = $cmd.ExecuteReader()
$rd.Read() | Out-Null
$repId = [int]$rd['id']
$repCode = [string]$rd['code']
$rd.Close()
Write-Host "[def] id=$repId code=$repCode"

# Test 1: enqueue + dispatch with NO filters
$body1 = @{ params = @{} } | ConvertTo-Json -Compress
$enq1 = Invoke-WebRequest -Method Post -Uri "https://localhost:6543/api/reports/run/$repId" -ContentType 'application/json' -Body $body1 -Headers $h -SkipCertificateCheck
Write-Host ""
Write-Host "[test 1] No filters → enqueue:" -ForegroundColor Cyan
Write-Host $enq1.Content

# Test 2: enqueue with site filter
$body2 = @{ params = @{ site_id = 1; year_from = 2025; year_to = 2026 } } | ConvertTo-Json -Compress
$enq2 = Invoke-WebRequest -Method Post -Uri "https://localhost:6543/api/reports/run/$repId" -ContentType 'application/json' -Body $body2 -Headers $h -SkipCertificateCheck
Write-Host ""
Write-Host "[test 2] site_id=1 year_from=2025 year_to=2026:" -ForegroundColor Cyan
Write-Host $enq2.Content

# Trigger dispatch
$disp = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/scheduler/costcnh_outbox_dispatch' -ContentType 'application/json' -Body '{}' -Headers $h -SkipCertificateCheck
Write-Host ""
Write-Host "[dispatch] $($disp.Content)" -ForegroundColor Green

# Read back both executions
$cmd2 = $c.CreateCommand()
$cmd2.CommandText = "SELECT TOP 5 id, report_code, status, duration_ms, result_row_count, params_json, LEFT(CAST(result_json AS NVARCHAR(MAX)), 250) AS result_preview FROM rep.report_execution WHERE report_code = 'PROGRAM_PIVOT' ORDER BY id DESC"
$r = $cmd2.ExecuteReader()
Write-Host ""
Write-Host "--- Recent PROGRAM_PIVOT executions ---" -ForegroundColor Cyan
while ($r.Read()) {
    Write-Host ("  id={0} status={1} dur={2}ms rows={3}" -f $r['id'], $r['status'], $r['duration_ms'], $r['result_row_count'])
    Write-Host ("    params  = $($r['params_json'])")
    Write-Host ("    result  = $($r['result_preview'])")
}
$r.Close()
$c.Close()
