$ErrorActionPreference = 'Stop'

# Login
$loginBody = @{ user_name = 'admin'; password = 'admin'; captchaToken = '' } | ConvertTo-Json -Compress
$resp = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/Meta/AsmxProxy/MetaService.login' -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
foreach ($s in @($resp.Headers['Set-Cookie'])) { if ($s -match '^\s*k-user=([^;]+)') { $kc = $Matches[1]; break } }
$h = @{ 'Cookie' = "k-user=$kc" }
Write-Host "[login] ok" -ForegroundColor Green

# Find any program
$cs = 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Data;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$c = New-Object System.Data.SqlClient.SqlConnection $cs; $c.Open()
$cmd = $c.CreateCommand()
$cmd.CommandText = "SELECT TOP 1 id FROM core.program WHERE ISNULL(cancellato,0)=0"
$progId = [int]$cmd.ExecuteScalar()
Write-Host "[program] id=$progId"

# 1. Acquire lock
$lockResp = Invoke-WebRequest -Method Post -Uri "https://localhost:6543/api/spreadsheet/lock-range/$progId" `
    -ContentType 'application/json' -Body '{"year":2026}' -Headers $h -SkipCertificateCheck
Write-Host ""
Write-Host "[1. lock-range]" -ForegroundColor Cyan
Write-Host $lockResp.Content
$lock = $lockResp.Content | ConvertFrom-Json

# 2. Snapshot
$snap = Invoke-WebRequest -Method Get -Uri "https://localhost:6543/api/spreadsheet/snapshot/${progId}?year=2026" -Headers $h -SkipCertificateCheck
$snapObj = $snap.Content | ConvertFrom-Json
Write-Host ""
Write-Host "[2. snapshot] rowCount=$($snapObj.rowCount) monthFrom=$($snapObj.monthFrom) monthTo=$($snapObj.monthTo)" -ForegroundColor Cyan

# 3. Heartbeat
$hb = Invoke-WebRequest -Method Post -Uri "https://localhost:6543/api/spreadsheet/heartbeat" `
    -ContentType 'application/json' -Body (@{ lockToken = $lock.lockToken } | ConvertTo-Json) -Headers $h -SkipCertificateCheck
Write-Host ""
Write-Host "[3. heartbeat] $($hb.Content)" -ForegroundColor Cyan

# 4. Save cells — pick a few fact rows + simulate edits
$cmd2 = $c.CreateCommand()
$cmd2.CommandText = "SELECT TOP 3 id, planned, actual FROM cp.facts WHERE program_id = $progId ORDER BY id"
$rd = $cmd2.ExecuteReader()
$factsRows = @()
while ($rd.Read()) { $factsRows += @{ id = [long]$rd['id']; planned = $rd['planned']; actual = $rd['actual'] } }
$rd.Close()

if ($factsRows.Count -gt 0) {
    $changes = @()
    foreach ($r in $factsRows) {
        $changes += @{ FactsId = $r.id; Field = 'planned'; NewValue = 9999.50 }
        $changes += @{ FactsId = $r.id; Field = 'actual';  NewValue = 5500.25 }
    }
    $saveBody = @{ LockToken = $lock.lockToken; Changes = $changes } | ConvertTo-Json -Depth 5 -Compress
    $save = Invoke-WebRequest -Method Post -Uri "https://localhost:6543/api/spreadsheet/save-cells" `
        -ContentType 'application/json' -Body $saveBody -Headers $h -SkipCertificateCheck
    Write-Host ""
    Write-Host "[4. save-cells]" -ForegroundColor Cyan
    Write-Host $save.Content
} else {
    Write-Host ""
    Write-Host "[4. save-cells] SKIP — no cp.facts rows for program $progId" -ForegroundColor Yellow
}

# 5. Verify changes via cp.spreadsheet_change_log
$cmd3 = $c.CreateCommand()
$cmd3.CommandText = "SELECT TOP 5 facts_id, cell_field, old_value, new_value, changed_at_utc FROM cp.spreadsheet_change_log ORDER BY id DESC"
$rd3 = $cmd3.ExecuteReader()
Write-Host ""
Write-Host "[5. change_log (latest 5)]" -ForegroundColor Cyan
while ($rd3.Read()) {
    Write-Host ("  facts={0} field={1} old={2} new={3} at={4}" -f $rd3['facts_id'], $rd3['cell_field'], $rd3['old_value'], $rd3['new_value'], $rd3['changed_at_utc'])
}
$rd3.Close()

# 6. Release lock
$rel = Invoke-WebRequest -Method Post -Uri "https://localhost:6543/api/spreadsheet/release-lock" `
    -ContentType 'application/json' -Body (@{ lockToken = $lock.lockToken } | ConvertTo-Json) -Headers $h -SkipCertificateCheck
Write-Host ""
Write-Host "[6. release-lock] $($rel.Content)" -ForegroundColor Cyan

# 7. Export xlsx
try {
    $tmp = "$env:TEMP\spreadsheet_export_$progId.xlsx"
    Invoke-WebRequest -Method Get -Uri "https://localhost:6543/api/spreadsheet/export-xlsx/${progId}?year=2026" -Headers $h -SkipCertificateCheck -OutFile $tmp
    $size = (Get-Item $tmp).Length
    Write-Host ""
    Write-Host "[7. export-xlsx] → $tmp ($size bytes)" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "[7. export-xlsx] error: $($_.Exception.Message)" -ForegroundColor Red
}

$c.Close()
