<#
.SYNOPSIS
  Phase G.1 v2 — wiring generico metadata-driven dello spreadsheet lock-aware
  sulla route plan_facts.

  Approccio:
    - NIENTE dashboard wrapper (plan_facts_poweredit eliminato).
    - mdpropsbag.archetypes.spreadsheet della route plan_facts contiene tutta
      la config lock (endpointBase, primaryScopeField, requiredScopeFields,
      autoEnableOnScope) + le formule metadata-driven.
    - Custom action toolbar "Open PowerEdit" naviga a:
        /plan_facts/spreadsheet?program_id=X&year=Y
      Il framework BoundedRepeater dispatch-a action=spreadsheet →
      LazySpreadsheetListSfComponent (gia' registrata). La lazy-wrapper
      pumpa i query param in lockScope generico; il componente interno
      legge la config dalla mdpropsbag e auto-acquire-a il lock.

.NOTES
  Idempotente. Drop del wrapper plan_facts_poweredit (cleanup v1).
#>
param(
    [string]$BackendBaseUrl = 'https://localhost:6543',
    [string]$AdminUser      = 'admin',
    [string]$AdminPass      = 'admin'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$metaCs = 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'

function Invoke-Sql {
    param([string]$ConnString, [string]$Query, [hashtable]$Params = @{})
    $conn = New-Object System.Data.SqlClient.SqlConnection $ConnString; $conn.Open()
    try {
        $cmd = $conn.CreateCommand(); $cmd.CommandText = $Query
        foreach ($k in $Params.Keys) { $null = $cmd.Parameters.AddWithValue("@$k", $Params[$k]) }
        $reader = $cmd.ExecuteReader(); $rows = @()
        try { while ($reader.Read()) { $row = @{}; for ($i = 0; $i -lt $reader.FieldCount; $i++) { $row[$reader.GetName($i)] = $reader.GetValue($i) }; $rows += [pscustomobject]$row } } finally { $reader.Close() }
        return ,$rows
    } finally { $conn.Close() }
}
function Invoke-SqlNonQuery {
    param([string]$ConnString, [string]$Query, [hashtable]$Params = @{})
    $conn = New-Object System.Data.SqlClient.SqlConnection $ConnString; $conn.Open()
    try {
        $cmd = $conn.CreateCommand(); $cmd.CommandText = $Query
        foreach ($k in $Params.Keys) { if ($null -eq $Params[$k]) { $null = $cmd.Parameters.AddWithValue("@$k", [DBNull]::Value) } else { $null = $cmd.Parameters.AddWithValue("@$k", $Params[$k]) } }
        return $cmd.ExecuteNonQuery()
    } finally { $conn.Close() }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Phase G.1 v2 — Generic spreadsheet wiring on plan_facts" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# Login
$kUserCookie = $null
$loginBody = @{ user_name = $AdminUser; password = $AdminPass; captchaToken = '' } | ConvertTo-Json -Compress
$loginResp = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.login" -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
foreach ($s in @($loginResp.Headers['Set-Cookie'])) { if ($s -match '^\s*k-user=([^;]+)') { $kUserCookie = $Matches[1]; break } }
if (-not $kUserCookie) { throw "Cannot extract k-user cookie" }
$authHeaders = @{ 'Cookie' = "k-user=$kUserCookie" }
Write-Host "[1/5] login ok" -ForegroundColor Green

# ─── 1. mdpropsbag su plan_facts con archetypes.spreadsheet config ─────────
Write-Host ""
Write-Host "[2/5] Set mdpropsbag.archetypes.spreadsheet su plan_facts..." -ForegroundColor Cyan

$planFactsRow = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id, mdpropsbag FROM _metadati__tabelle WHERE mdroutename = 'plan_facts'"
if ($planFactsRow.Count -eq 0) { throw "Route plan_facts non trovata" }
$pfMdId = [int]$planFactsRow[0].md_id
$existingPropsBagRaw = if ($planFactsRow[0].PSObject.Properties['mdpropsbag'] -and $planFactsRow[0].mdpropsbag -isnot [DBNull]) { [string]$planFactsRow[0].mdpropsbag } else { $null }

$existingPb = if ($existingPropsBagRaw) {
    try { $existingPropsBagRaw | ConvertFrom-Json -AsHashtable -NoEnumerate } catch { @{} }
} else { @{} }
if (-not $existingPb) { $existingPb = @{} }
if (-not $existingPb.ContainsKey('archetypes')) { $existingPb['archetypes'] = @{} }

# Config spreadsheet archetype: lock + formulas (placeholder example)
$existingPb['archetypes']['spreadsheet'] = @{
    lock = @{
        endpointBase         = '/api/spreadsheet'
        primaryScopeField    = 'program_id'
        requiredScopeFields  = @('program_id')
        autoEnableOnScope    = $true
        heartbeatIntervalSec = 60
    }
    # Esempio formule metadata-driven (target_col → template con token {colName}).
    # Le formule vengono applicate post-dataBound. Token {field} → A1 address (es. C5).
    # Lasciato vuoto qui — l'utente puo' aggiungere via metadata-editor:
    #   formulas = @{ 'variance' = '={actual}-{planned}'; 'variance_pct' = '=IF({planned}=0,0,({actual}-{planned})/{planned})' }
    formulas = @{}
}

$newPbJson = $existingPb | ConvertTo-Json -Depth 20 -Compress
$null = Invoke-SqlNonQuery -ConnString $metaCs `
    -Query "UPDATE _metadati__tabelle SET mdpropsbag = @pb WHERE md_id = @id" `
    -Params @{ pb = $newPbJson; id = $pfMdId }
Write-Host "  [ok] plan_facts.mdpropsbag.archetypes.spreadsheet aggiornato (md_id=$pfMdId, $($newPbJson.Length) chars)" -ForegroundColor Green

# ─── 2. Cleanup wrapper plan_facts_poweredit (v1) ──────────────────────────
Write-Host ""
Write-Host "[3/5] Cleanup wrapper plan_facts_poweredit (v1)..." -ForegroundColor Cyan

$wrapperBoard = Invoke-Sql -ConnString $metaCs -Query "SELECT id1 FROM dom_board WHERE boardroute = 'plan_facts_poweredit'"
if ($wrapperBoard.Count -gt 0) {
    $deleted = Invoke-SqlNonQuery -ConnString $metaCs -Query "DELETE FROM dom_board WHERE boardroute = 'plan_facts_poweredit'"
    Write-Host "  [delete] dom_board.plan_facts_poweredit ($deleted row)" -ForegroundColor Yellow
} else {
    Write-Host "  [skip] dom_board.plan_facts_poweredit gia' assente" -ForegroundColor DarkGray
}

# ─── 3. Custom action "Open PowerEdit" → /plan_facts/spreadsheet?... ───────
Write-Host ""
Write-Host "[4/5] Update custom action 'Open PowerEdit' su plan_facts..." -ForegroundColor Cyan

# Callback aggiornato: naviga direttamente alla route catch-all /plan_facts/spreadsheet
# con query param generici (program_id, year). Il framework BoundedRepeater +
# DataRepeater dispatcha action=spreadsheet → LazySpreadsheetListSfComponent.
$openPwrCb = @"
// Phase G.1 v2 — Open PowerEdit (Syncfusion spreadsheet, generic metadata-driven lock)
// Naviga alla route catch-all /:route/:action: il BoundedRepeater dispatcha
// action=spreadsheet → LazySpreadsheetListSfComponent → SpreadsheetListSfComponent.
// I query param vengono caricati come lockScope generico dalla lazy-wrapper.
// L'auto-acquire-lock viene attivato dalla mdpropsbag.archetypes.spreadsheet.lock
// quando tutti i requiredScopeFields (program_id) sono presenti.
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
// Query string generica: program_id+year vengono raccolti come lockScope.
// show_formula_bar=1 attiva la formula bar di Syncfusion.
const url = '/plan_facts/spreadsheet?program_id=' + programId + '&year=' + year + '&show_formula_bar=1';
if (typeof wtoolbox.navigate === 'function') {
  wtoolbox.navigate(url);
} else {
  window.location.hash = '#' + url;
}
wtoolbox.messageNotificationService.add({
  severity: 'info', summary: 'PowerEdit',
  detail: 'Apertura spreadsheet per Program ' + programId + ' (year ' + year + ')'
});
"@

$exists = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 id1 FROM _mtdt__cstom__actions__tabelle WHERE mdid = @md AND buttoncaption = 'Open PowerEdit'" -Params @{ md = $pfMdId }
if ($exists.Count -gt 0) {
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _mtdt__cstom__actions__tabelle SET md_action_type = 0, buttonimage = 'pi pi-table', actioncallback = @cb, ordine1 = 10 WHERE id1 = @id" -Params @{ id = [int]$exists[0].id1; cb = $openPwrCb }
    Write-Host "  [update] 'Open PowerEdit' on plan_facts (id=$($exists[0].id1))" -ForegroundColor Yellow
} else {
    $nextRows = Invoke-Sql -ConnString $metaCs -Query "SELECT ISNULL(MAX(id1), 0) + 1 AS n FROM _mtdt__cstom__actions__tabelle"
    $newId = [int]$nextRows[0].n
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
INSERT INTO _mtdt__cstom__actions__tabelle (id1, mdid, md_action_type, buttoncaption, buttonimage, actioncallback, ordine1)
VALUES (@id, @md, 0, 'Open PowerEdit', 'pi pi-table', @cb, 10)
"@ -Params @{ id = $newId; md = $pfMdId; cb = $openPwrCb }
    Write-Host "  [insert] 'Open PowerEdit' on plan_facts (id1=$newId)" -ForegroundColor Green
}

# ─── 4. Menu Planning → Worktasks → PowerEdit → route generica ─────────────
Write-Host ""
Write-Host "[5/5] Menu Planning → Worktasks → PowerEdit..." -ForegroundColor Cyan

$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__menu
   SET mm_is_visible_by_default = 1,
       mm_uri_menu = '#/plan_facts/spreadsheet?program_id=1&year=2026&show_formula_bar=1',
       mm_display_string_menu = N'PowerEdit (Syncfusion)'
 WHERE mm_nome_menu = 'planning_worktasks_planning'
"@
Write-Host "  [ok] Planning → Worktasks → PowerEdit → /plan_facts/spreadsheet?program_id=1&year=2026" -ForegroundColor Green

# Invalidate
$inv = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime" -ContentType 'application/json' -Body '{}' -Headers $authHeaders -SkipCertificateCheck
Write-Host ""
Write-Host "[done] $($inv.Content.Substring(0, [Math]::Min(160, $inv.Content.Length)))" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Phase G.1 v2 generic wiring complete" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Routes:" -ForegroundColor White
Write-Host "    /plan_facts/list                                  — list-grid base (toolbar 'Open PowerEdit')" -ForegroundColor White
Write-Host "    /plan_facts/spreadsheet?program_id=X&year=Y       — Syncfusion lock-aware (auto-acquire da mdpropsbag)" -ForegroundColor White
Write-Host ""
Write-Host "  Config archetype:" -ForegroundColor White
Write-Host "    _metadati__tabelle.mdpropsbag.archetypes.spreadsheet.lock = {" -ForegroundColor White
Write-Host "      endpointBase: '/api/spreadsheet'," -ForegroundColor White
Write-Host "      primaryScopeField: 'program_id'," -ForegroundColor White
Write-Host "      requiredScopeFields: ['program_id']," -ForegroundColor White
Write-Host "      autoEnableOnScope: true," -ForegroundColor White
Write-Host "      heartbeatIntervalSec: 60" -ForegroundColor White
Write-Host "    }" -ForegroundColor White
