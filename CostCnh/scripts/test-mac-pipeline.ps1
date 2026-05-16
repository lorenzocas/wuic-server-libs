$ErrorActionPreference = 'Stop'

# Login
$loginBody = @{ user_name = 'admin'; password = 'admin'; captchaToken = '' } | ConvertTo-Json -Compress
$resp = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/Meta/AsmxProxy/MetaService.login' -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
foreach ($s in @($resp.Headers['Set-Cookie'])) { if ($s -match '^\s*k-user=([^;]+)') { $kc = $Matches[1]; break } }
$h = @{ 'Cookie' = "k-user=$kc" }
Write-Host "[login] ok" -ForegroundColor Green

# Insert a MAC request directly (skip parametric-dialog UI form)
$cs = 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Data;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$c = New-Object System.Data.SqlClient.SqlConnection $cs; $c.Open()
$cmd = $c.CreateCommand()
$cmd.CommandText = @"
DECLARE @prog INT = (SELECT TOP 1 id FROM [core].[program]);
DECLARE @eur INT = (SELECT TOP 1 id FROM [core].[currency] WHERE code = 'EUR');
INSERT INTO [mac].[request] (correlation_id, request_code, program_id, request_kind, subject, details, amount, currency_id, status, utente_creazione)
OUTPUT INSERTED.id
VALUES (CONVERT(VARCHAR(36), NEWID()), 'MAC-2026-TEST-' + FORMAT(SYSUTCDATETIME(), 'HHmmss'), @prog, 'baseline_change', N'Budget increase for engine cooling subsystem', N'Costo aggiuntivo per nuovo materiale richiesto da R&D — Sprint 8 test', 25000.00, @eur, 0, 101281);
"@
$reqId = [int]$cmd.ExecuteScalar()
Write-Host "[insert] mac.request id=$reqId (status=draft)" -ForegroundColor Green

# Send (via endpoint)
$send = Invoke-WebRequest -Method Post -Uri "https://localhost:6543/api/mac/send/$reqId" -ContentType 'application/json' -Body '{}' -Headers $h -SkipCertificateCheck
Write-Host "[send] $($send.Content)"

# Dispatch
$disp = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/scheduler/costcnh_outbox_dispatch' -ContentType 'application/json' -Body '{}' -Headers $h -SkipCertificateCheck
Write-Host "[dispatch] $($disp.Content)"

# Verify mac.request state
$cmd2 = $c.CreateCommand()
$cmd2.CommandText = "SELECT id, status, sent_at_utc, outbox_id, ISNULL(last_error,'') AS err FROM [mac].[request] WHERE id = $reqId"
$rd = $cmd2.ExecuteReader()
$rd.Read() | Out-Null
Write-Host ""
Write-Host "--- mac.request $($rd['id']) ---" -ForegroundColor Cyan
Write-Host "  status      = $($rd['status'])  (0=draft, 1=sent, 9=rejected)"
Write-Host "  sent_at_utc = $($rd['sent_at_utc'])"
Write-Host "  outbox_id   = $($rd['outbox_id'])"
Write-Host "  last_error  = $($rd['err'])"
$rd.Close()

# Verify message_envelope log
$cmd3 = $c.CreateCommand()
$cmd3.CommandText = "SELECT TOP 1 id, system, direction, message_id, status, outcome_text FROM [integrations].[message_envelope] WHERE system = 'mac' AND direction = 'OUT' ORDER BY id DESC"
$rd3 = $cmd3.ExecuteReader()
if ($rd3.Read()) {
    Write-Host ""
    Write-Host "--- integrations.message_envelope (latest OUT mac) ---" -ForegroundColor Cyan
    Write-Host "  id=$($rd3['id']) status=$($rd3['status']) msgId=$($rd3['message_id']) outcome=$($rd3['outcome_text'])"
}
$rd3.Close()
$c.Close()

# Verify notification
$cm = New-Object System.Data.SqlClient.SqlConnection 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$cm.Open()
$ncmd = $cm.CreateCommand()
$ncmd.CommandText = "SELECT TOP 1 id, type, message, target_json FROM _notifications WHERE source = 'mac.dispatcher' ORDER BY id DESC"
$nr = $ncmd.ExecuteReader()
if ($nr.Read()) {
    Write-Host ""
    Write-Host "--- _notifications (latest MAC) ---" -ForegroundColor Cyan
    Write-Host "  id=$($nr['id']) type=$($nr['type'])"
    Write-Host "  message: $($nr['message'])"
    Write-Host "  target:  $($nr['target_json'])"
}
$nr.Close()
$cm.Close()
