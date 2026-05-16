<#
.SYNOPSIS
  Phase H.6 — wiring custom action + menu su nuova route /power-edit/:programId
  per il componente custom <costcnh-power-edit> (hierarchical pivot grid).

  - Sostituisce il callback "Open PowerEdit" su plan_facts: ora naviga a
    /power-edit/<programId>?year=YYYY invece di /plan_facts/spreadsheet?...
  - Aggiorna l'URL del menu Planning → Worktasks → PowerEdit.
  - La route /plan_facts/spreadsheet rimane disponibile (BoundedRepeater +
    LazySpreadsheetListSfComponent) per scenari flat-spreadsheet non-pivot.
#>
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$metaCs = 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'

function Invoke-SqlNonQuery {
    param([string]$ConnString, [string]$Query, [hashtable]$Params = @{})
    $conn = New-Object System.Data.SqlClient.SqlConnection $ConnString; $conn.Open()
    try {
        $cmd = $conn.CreateCommand(); $cmd.CommandText = $Query
        foreach ($k in $Params.Keys) {
            if ($null -eq $Params[$k]) { $null = $cmd.Parameters.AddWithValue("@$k", [DBNull]::Value) }
            else { $null = $cmd.Parameters.AddWithValue("@$k", $Params[$k]) }
        }
        return $cmd.ExecuteNonQuery()
    } finally { $conn.Close() }
}
function Invoke-SqlScalar {
    param([string]$ConnString, [string]$Query, [hashtable]$Params = @{})
    $conn = New-Object System.Data.SqlClient.SqlConnection $ConnString; $conn.Open()
    try {
        $cmd = $conn.CreateCommand(); $cmd.CommandText = $Query
        foreach ($k in $Params.Keys) { $null = $cmd.Parameters.AddWithValue("@$k", $Params[$k]) }
        return $cmd.ExecuteScalar()
    } finally { $conn.Close() }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Phase H.6 — PowerEdit route wiring (/power-edit/:id)" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# Login per metadata invalidation
$loginBody = @{ user_name = 'admin'; password = 'admin'; captchaToken = '' } | ConvertTo-Json -Compress
$loginResp = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/Meta/AsmxProxy/MetaService.login' -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
$kUserCookie = $null
foreach ($s in @($loginResp.Headers['Set-Cookie'])) {
    if ($s -match '^\s*k-user=([^;]+)') { $kUserCookie = $Matches[1]; break }
}
if (-not $kUserCookie) { throw "Cannot extract k-user cookie" }
$authHeaders = @{ 'Cookie' = "k-user=$kUserCookie" }
Write-Host "[1/3] login ok" -ForegroundColor Green

# ─── 1. Update custom toolbar action "Open PowerEdit" ───────────────────────
$pfMdId = [int](Invoke-SqlScalar -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE mdroutename = 'plan_facts'")
if (-not $pfMdId) { throw "Route plan_facts non trovata" }

$openPwrCb = @"
// Phase H — Open PowerEdit (hierarchical pivot grid app-local)
// Naviga al componente custom <costcnh-power-edit> in /power-edit/:programId.
// Il componente acquisisce lock pessimistic via /api/spreadsheet/lock-range/{id}
// (riusa SpreadsheetController genericato in Phase G.1 v2) e carica lo snapshot
// via /api/power-edit/snapshot/{id}?year=YYYY (PowerEditController, Phase H.2).
const rec = record;
let programId = rec && rec.program_id ? rec.program_id : null;
if (!programId) {
  const prog = await wtoolbox.promptDialog({
    title: 'Open PowerEdit',
    message: 'Inserisci Program ID da editare:',
    inputType: 'number'
  });
  if (!prog) return;
  programId = prog;
}
const year = new Date().getFullYear();
const url = '/power-edit/' + programId + '?year=' + year;
if (typeof wtoolbox.navigate === 'function') {
  wtoolbox.navigate(url);
} else {
  window.location.hash = '#' + url;
}
wtoolbox.messageNotificationService.add({
  severity: 'info', summary: 'PowerEdit',
  detail: 'Apertura grid gerarchica per Program ' + programId + ' (year ' + year + ')'
});
"@

$rows = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _mtdt__cstom__actions__tabelle
   SET actioncallback = @cb,
       buttoncaption  = 'Open PowerEdit',
       buttonimage    = 'pi pi-sitemap',
       md_action_type = 0,
       ordine1        = 10
 WHERE mdid = @md AND buttoncaption = 'Open PowerEdit'
"@ -Params @{ md = $pfMdId; cb = $openPwrCb }
Write-Host "[2/3] 'Open PowerEdit' callback aggiornato a /power-edit/:id ($rows row)" -ForegroundColor Green

# ─── 2. Update menu Planning → Worktasks → PowerEdit ────────────────────────
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__menu
   SET mm_is_visible_by_default = 1,
       mm_uri_menu = '#/power-edit/1?year=2026',
       mm_display_string_menu = N'PowerEdit (Hierarchical)'
 WHERE mm_nome_menu = 'planning_worktasks_planning'
"@
Write-Host "[3/3] Menu Planning → Worktasks → PowerEdit → /power-edit/1?year=2026" -ForegroundColor Green

# Invalidate metadata
$inv = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime' -ContentType 'application/json' -Body '{}' -Headers $authHeaders -SkipCertificateCheck
Write-Host ""
Write-Host "[done] $($inv.Content.Substring(0, [Math]::Min(160, $inv.Content.Length)))" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Phase H.6 wiring complete" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Routes attive:" -ForegroundColor White
Write-Host "    /plan_facts/list                              — list-grid (toolbar 'Open PowerEdit')" -ForegroundColor White
Write-Host "    /plan_facts/spreadsheet?program_id=X          — flat Syncfusion (Phase G.1 v2)" -ForegroundColor White
Write-Host "    /power-edit/:programId?year=YYYY              — hierarchical pivot (Phase H)" -ForegroundColor White
