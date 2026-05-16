$ErrorActionPreference = 'Stop'

# 1) Login → cookie
$loginBody = @{ user_name = 'admin'; password = 'admin'; captchaToken = '' } | ConvertTo-Json -Compress
$resp = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/Meta/AsmxProxy/MetaService.login' -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
$kc = $null
foreach ($s in @($resp.Headers['Set-Cookie'])) { if ($s -match '^\s*k-user=([^;]+)') { $kc = $Matches[1]; break } }
if (-not $kc) { throw "no cookie" }
$h = @{ 'Cookie' = "k-user=$kc" }
Write-Host "[login] ok, cookie len=$($kc.Length)" -ForegroundColor Green

# 2) Find a report def
$cs = 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Data;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$c = New-Object System.Data.SqlClient.SqlConnection $cs; $c.Open()
$cmd = $c.CreateCommand()
$cmd.CommandText = "SELECT TOP 1 id, code FROM rep.report_definition WHERE code = 'program_overview'"
$rd = $cmd.ExecuteReader()
$rd.Read() | Out-Null
$repId = [int]$rd['id']
$repCode = [string]$rd['code']
$rd.Close()
Write-Host "[def] id=$repId code=$repCode" -ForegroundColor Green

# 3) Enqueue with auth
$enq = Invoke-WebRequest -Method Post -Uri "https://localhost:6543/api/reports/run/$repId" -ContentType 'application/json' -Body '{}' -Headers $h -SkipCertificateCheck
Write-Host "[enqueue] $($enq.Content)" -ForegroundColor Green
$enqObj = $enq.Content | ConvertFrom-Json
$execId = $enqObj.executionId

# 4) Trigger dispatch
$disp = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/scheduler/costcnh_outbox_dispatch' -ContentType 'application/json' -Body '{}' -Headers $h -SkipCertificateCheck
Write-Host "[dispatch] $($disp.Content)" -ForegroundColor Green

# 5) Read back execution
$cmd2 = $c.CreateCommand()
$cmd2.CommandText = "SELECT id, status, duration_ms, result_row_count, LEN(CAST(result_json AS NVARCHAR(MAX))) AS result_len, requested_by_user_id, notification_id, LEFT(CAST(result_json AS NVARCHAR(MAX)), 400) AS result_preview FROM rep.report_execution WHERE id = $execId"
$r = $cmd2.ExecuteReader()
$r.Read() | Out-Null
Write-Host ""
Write-Host "--- Execution $($r['id']) ---" -ForegroundColor Cyan
Write-Host "  status            = $($r['status'])  (2=completed, 9=failed)"
Write-Host "  duration_ms       = $($r['duration_ms'])"
Write-Host "  result_row_count  = $($r['result_row_count'])"
Write-Host "  result_len        = $($r['result_len']) chars"
Write-Host "  requested_by_user = $($r['requested_by_user_id'])"
Write-Host "  notification_id   = $($r['notification_id'])"
Write-Host ""
Write-Host "--- result_json (preview) ---" -ForegroundColor Cyan
Write-Host $r['result_preview']
$r.Close()
$c.Close()

# 6) Read notification (CostCnh_Metadata)
$cm = New-Object System.Data.SqlClient.SqlConnection 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$cm.Open()
$ncmd = $cm.CreateCommand()
$ncmd.CommandText = "SELECT TOP 3 id, user_id, type, message, target_json, created_at_utc FROM dbo.notifications ORDER BY id DESC"
$nr = $ncmd.ExecuteReader()
Write-Host ""
Write-Host "--- Recent notifications ---" -ForegroundColor Cyan
while ($nr.Read()) {
    Write-Host ("  id={0} user={1} type={2} msg='{3}' target='{4}'" -f $nr['id'], $nr['user_id'], $nr['type'], $nr['message'], $nr['target_json'])
}
$nr.Close()
$cm.Close()
