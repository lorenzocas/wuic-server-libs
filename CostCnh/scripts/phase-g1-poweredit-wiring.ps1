<#
.SYNOPSIS
  Phase G.1 — wiring 'Open PowerEdit' custom action su plan_facts route +
  creazione boardcontent plan_facts_poweredit con Syncfusion spreadsheet
  archetype lock-aware. Activate menu Planning → Worktasks → PowerEdit.
#>
param(
    [string]$BackendBaseUrl = 'https://localhost:6543',
    [string]$AdminUser      = 'admin',
    [string]$AdminPass      = 'admin'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$dataCs = 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Data;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$metaCs = 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$dataDb = 'CostCnh_Data'
$script:templatePath = 'C:/src/Wuic/KonvergenceCore/skills/dashboard-boardcontent/templates/2x2-grid-with-charts.template.json'

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
Write-Host "  Phase G.1 — Open PowerEdit wiring" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# Login
$kUserCookie = $null
$loginBody = @{ user_name = $AdminUser; password = $AdminPass; captchaToken = '' } | ConvertTo-Json -Compress
$loginResp = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.login" -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
foreach ($s in @($loginResp.Headers['Set-Cookie'])) { if ($s -match '^\s*k-user=([^;]+)') { $kUserCookie = $Matches[1]; break } }
if (-not $kUserCookie) { throw "Cannot extract k-user cookie" }
$authHeaders = @{ 'Cookie' = "k-user=$kUserCookie" }
Write-Host "[1/4] login ok" -ForegroundColor Green

# ─── 1. Load template + build single-widget board for plan_facts_poweredit ──
Write-Host ""
Write-Host "[2/4] Build boardcontent plan_facts_poweredit (spreadsheet archetype)..." -ForegroundColor Cyan

function Deep-Clone {
    $r = Get-Content -Raw $script:templatePath
    if ($r[0] -eq [char]0xFEFF) { $r = $r.Substring(1) }
    return ,($r | ConvertFrom-Json -AsHashtable -NoEnumerate)
}
function Find-Widget-Containers {
    param($templateRoot)
    if ($templateRoot -isnot [array]) { $templateRoot = @($templateRoot) }
    $table = $templateRoot[0]
    $rows = @($table.nestedComponents)
    $result = @()
    for ($i = 1; $i -lt $rows.Count; $i++) {
        $tr = $rows[$i]
        foreach ($td in @($tr.nestedComponents)) {
            $div = (@($td.nestedComponents))[0]
            $result += ,$div
        }
    }
    return ,$result
}
function Find-Nodes {
    param($n, [string]$TagPrefix)
    $res = @()
    if ($n -is [System.Collections.IDictionary]) {
        if ($n.Contains('tag') -and $n['tag'] -and $n['tag'].StartsWith($TagPrefix)) { $res += ,$n }
        if ($n.Contains('nestedComponents') -and $n['nestedComponents']) {
            foreach ($c in @($n['nestedComponents'])) { $res += Find-Nodes $c $TagPrefix }
        }
    } elseif ($n -is [array]) {
        foreach ($c in $n) { $res += Find-Nodes $c $TagPrefix }
    }
    return ,$res
}

# Helper: fetch table metadata for plan_facts
function Get-TableMetadata {
    param([string]$Route)
    $body = @{ route = $Route } | ConvertTo-Json -Compress
    try {
        $resp = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.getTableMetadata" -ContentType 'application/json' -Body $body -Headers $authHeaders -SkipCertificateCheck
        $tm = $resp.Content | ConvertFrom-Json -AsHashtable
        if ($tm -and $tm.ContainsKey('columnMetadata')) { foreach ($c in $tm.columnMetadata) { if ($c.ContainsKey('extraProps')) { $c.Remove('extraProps') | Out-Null } } }
        return $tm
    } catch { Write-Host "  [warn] getTableMetadata($Route) failed" -ForegroundColor Yellow; return @{ tableMetadata = @{}; columnMetadata = @(); operators = @{} } }
}

$boardClone = Deep-Clone

# Title SPAN
$titleSpans = Find-Nodes $boardClone '<span'
$titleSpans[0].inputs.innerText = 'PowerEdit — Plan Facts spreadsheet'
if ($titleSpans[0].inputs.Contains('uniqueName')) { $titleSpans[0].inputs.uniqueName = 'title_plan_facts_poweredit' }

# Use first widget container as the spreadsheet host, hide/empty the rest
$widgets = Find-Widget-Containers $boardClone
if ($widgets.Count -lt 1) { throw "No widget containers found in template" }
$widget = $widgets[0]

# Patch first widget: SPAN title + DATASOURCE route=plan_facts + DATAREPEATER action=spreadsheet + lock-awareness inputs
$ws = $null; $ds = $null; $dr = $null
for ($k = 0; $k -lt $widget.nestedComponents.Count; $k++) {
    $ch = $widget.nestedComponents[$k]
    if ($ch.tag -and $ch.tag.StartsWith('<span'))                  { $ws = $ch }
    elseif ($ch.tag -and $ch.tag.StartsWith('<wuic-data-source'))   { $ds = $ch }
    elseif ($ch.tag -and $ch.tag.StartsWith('<wuic-data-repeater')) { $dr = $ch }
}
if ($ws) {
    $ws.inputs.innerText = 'Plan Facts (lock-aware spreadsheet, formule metadata-driven)'
    if ($ws.inputs.Contains('uniqueName')) { $ws.inputs.uniqueName = 'title_widget_plan_facts_poweredit' }
}
if ($ds) {
    $ds.inputs.route = 'plan_facts'
    if ($ds.inputs.Contains('uniqueName')) { $ds.inputs.uniqueName = 'ds_plan_facts_poweredit' }
    $tm = Get-TableMetadata -Route 'plan_facts'
    if ($tm) {
        $ds.inputs.metaInfo = @{
            tableMetadata = if ($tm.Contains('tableMetadata')) { $tm.tableMetadata } else { @{} }
            columnMetadata = if ($tm.Contains('columnMetadata')) { $tm.columnMetadata } else { @() }
            operators = if ($tm.Contains('operators')) { $tm.operators } else { @{} }
            dataTabs = if ($tm.Contains('dataTabs')) { $tm.dataTabs } else { @() }
            pKey = if ($tm.Contains('pKey')) { $tm.pKey } else { 'id' }
            hasFooter = $false
            editMode = 'inline'
            nestedRoutes = if ($tm.Contains('nestedRoutes')) { $tm.nestedRoutes } else { @() }
            rowsPerPageOptions = @(50, 100, 200)
        }
    }
}
if ($dr) {
    $dr.inputs.action = 'spreadsheet'
    if ($dr.inputs.Contains('uniqueName')) { $dr.inputs.uniqueName = 'dr_plan_facts_poweredit' }
    # Lock-awareness inputs (passthrough da LazySpreadsheetListSfComponent → SpreadsheetListSfComponent)
    $dr.inputs.enableLockAwareness = $true
    $dr.inputs.lockEndpointBase    = '/api/spreadsheet'
    $dr.inputs.showFormulaBar      = $true
    $dr.inputs.showRibbon          = $false
    $dr.inputs.heartbeatIntervalSec = 60
    # lockProgramId NON è settato qui — verra' fornito a runtime via URL query
    # param (program_id=X) interpretato dal componente custom o (per ora) preso
    # da Angular ActivatedRoute via parent lookup. Workaround per Phase G.1:
    # custom action passa solo URL ?program_id=, future iteration può iniettarlo
    # tramite un wrapper component CostCnh-specific.
}

# Empty the 3 unused widget containers (keep structure for layout, hide via inputs)
for ($i = 1; $i -lt $widgets.Count; $i++) {
    $w = $widgets[$i]
    for ($k = 0; $k -lt $w.nestedComponents.Count; $k++) {
        $ch = $w.nestedComponents[$k]
        if ($ch.tag -and $ch.tag.StartsWith('<span')) {
            $ch.inputs.innerText = ''
            if ($ch.inputs.Contains('uniqueName')) { $ch.inputs.uniqueName = "title_empty_w$i" }
        } elseif ($ch.tag -and $ch.tag.StartsWith('<wuic-data-source')) {
            $ch.inputs.route = 'plan_facts'   # placeholder per evitare runtime error
            if ($ch.inputs.Contains('uniqueName')) { $ch.inputs.uniqueName = "ds_empty_w$i" }
            $ch.inputs.metaInfo = @{ tableMetadata = @{}; columnMetadata = @(); operators = @{} }
            $ch.inputs.autoload = $false
        } elseif ($ch.tag -and $ch.tag.StartsWith('<wuic-data-repeater')) {
            $ch.inputs.action = 'list'
            if ($ch.inputs.Contains('uniqueName')) { $ch.inputs.uniqueName = "dr_empty_w$i" }
        }
    }
}

$boardJson = $boardClone | ConvertTo-Json -Depth 50 -Compress

# Upsert dom_board
$existing = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 id1 FROM dom_board WHERE boardroute = 'plan_facts_poweredit'"
if ($existing.Count -gt 0) {
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE dom_board SET boarddes = @d, boardcontent = @c WHERE id1 = @id" -Params @{ d = 'PowerEdit Plan Facts — Syncfusion spreadsheet con lock + formule'; c = $boardJson; id = [int]$existing[0].id1 }
    Write-Host "  [update] dom_board.plan_facts_poweredit ($($boardJson.Length) chars)" -ForegroundColor Yellow
} else {
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "INSERT INTO dom_board (boardroute, boarddes, boardcontent) VALUES (@r, @d, @c)" -Params @{ r = 'plan_facts_poweredit'; d = 'PowerEdit Plan Facts — Syncfusion spreadsheet con lock + formule'; c = $boardJson }
    Write-Host "  [insert] dom_board.plan_facts_poweredit ($($boardJson.Length) chars)" -ForegroundColor Green
}

# ─── 2. Custom toolbar action "Open PowerEdit" on plan_facts ────────────────
Write-Host ""
Write-Host "[3/4] Custom action 'Open PowerEdit' su plan_facts..." -ForegroundColor Cyan

$planFactsRoute = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE mdroutename = 'plan_facts'"
if ($planFactsRoute.Count -eq 0) { throw "Route plan_facts non trovata" }
$pfMdId = [int]$planFactsRoute[0].md_id

$openPwrCb = @"
// Phase G.1 — Open PowerEdit (Syncfusion spreadsheet lock-aware)
// Estrae program_id dal record corrente (preferito) OR prompt utente.
// Naviga a /plan_facts_poweredit/dashboard?program_id=X&year=Y.
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
const url = '/plan_facts_poweredit/dashboard?program_id=' + programId + '&year=' + year;
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

# ─── 3. Activate menu Planning → Worktasks → PowerEdit ──────────────────────
Write-Host ""
Write-Host "[4/4] Menu activation..." -ForegroundColor Cyan

$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__menu
   SET mm_is_visible_by_default = 1,
       mm_uri_menu = '#/plan_facts_poweredit/dashboard?program_id=1&year=2026',
       mm_display_string_menu = N'PowerEdit (Syncfusion)'
 WHERE mm_nome_menu = 'planning_worktasks_planning'
"@
Write-Host "  [ok] Planning → Worktasks → PowerEdit activated → /plan_facts_poweredit/dashboard" -ForegroundColor Green

# Invalidate
$inv = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime" -ContentType 'application/json' -Body '{}' -Headers $authHeaders -SkipCertificateCheck
Write-Host ""
Write-Host "[done] $($inv.Content.Substring(0, [Math]::Min(160, $inv.Content.Length)))" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Phase G.1 wiring complete" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Routes:" -ForegroundColor White
Write-Host "    /plan_facts/list                              — list-grid base (toolbar 'Open PowerEdit')" -ForegroundColor White
Write-Host "    /plan_facts_poweredit/dashboard?program_id=X  — Syncfusion spreadsheet lock-aware" -ForegroundColor White
