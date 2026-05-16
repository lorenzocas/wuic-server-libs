<#
.SYNOPSIS
  Sprint 8 — Scaffold:
    Phase A: MAC tables + custom action 'Invia richiesta' + menu Integrazioni→MAC
    Phase B: cp.facts spreadsheet-light (mdinlineedit=1, scaffold + menu Planning→PowerEdit)
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

function Invoke-Sql {
    param([string]$ConnString, [string]$Query, [hashtable]$Params = @{})
    $conn = New-Object System.Data.SqlClient.SqlConnection $ConnString; $conn.Open()
    try {
        $cmd = $conn.CreateCommand(); $cmd.CommandText = $Query
        foreach ($k in $Params.Keys) { $null = $cmd.Parameters.AddWithValue("@$k", $Params[$k]) }
        $reader = $cmd.ExecuteReader(); $rows = @()
        try {
            while ($reader.Read()) {
                $row = @{}; for ($i = 0; $i -lt $reader.FieldCount; $i++) { $row[$reader.GetName($i)] = $reader.GetValue($i) }
                $rows += [pscustomobject]$row
            }
        } finally { $reader.Close() }
        return ,$rows
    } finally { $conn.Close() }
}
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
function Get-NextActionId {
    $rows = Invoke-Sql -ConnString $metaCs -Query "SELECT ISNULL(MAX(id1), 0) + 1 AS n FROM _mtdt__cstom__actions__tabelle"
    return [int]$rows[0].n
}
function Get-NextMenuId {
    $rows = Invoke-Sql -ConnString $metaCs -Query "SELECT ISNULL(MAX(mm_id), 0) + 1 AS n FROM _metadati__menu"
    return [int]$rows[0].n
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Sprint 8 — MAC + Spreadsheet-light + cutover" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# Login
$kUserCookie = $null
$loginBody = @{ user_name = $AdminUser; password = $AdminPass; captchaToken = '' } | ConvertTo-Json -Compress
$loginResp = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.login" -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
foreach ($s in @($loginResp.Headers['Set-Cookie'])) { if ($s -match '^\s*k-user=([^;]+)') { $kUserCookie = $Matches[1]; break } }
if (-not $kUserCookie) { throw "Cannot extract k-user cookie" }
$authHeaders = @{ 'Cookie' = "k-user=$kUserCookie" }
Write-Host "[1/4] login ok" -ForegroundColor Green

# ─── Phase A: MAC scaffold ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "[2/4] Phase A — MAC tables scaffold..." -ForegroundColor Cyan
$macObjects = @(
    @{ Schema='mac'; Object='request';  Route='mac_requests';  Display='Richieste MAC';  LongDesc='Richieste MAC outbound (Master Approval / Cost change)' },
    @{ Schema='mac'; Object='response'; Route='mac_responses'; Display='Risposte MAC';   LongDesc='Risposte MAC inbound (polled da costcnh_poll_mac)' }
)
$mdMacMap = @{}
foreach ($o in $macObjects) {
    $ex = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE md_nome_tabella=@t AND mdschemaname=@s" -Params @{ t=$o.Object; s=$o.Schema }
    if ($ex.Count -gt 0) {
        $mdMacMap[$o.Object] = [int]$ex[0].md_id
        Write-Host "  [skip] $($o.Schema).$($o.Object)" -ForegroundColor DarkGray
    } else {
        $body = @{ connection = $dataCs; connName=''; db=$dataDb; table=$o.Object; createMenu=$false; parentMenuId=0; schema=$o.Schema; provider='' } | ConvertTo-Json -Compress
        $null = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/scaffolding.scaffoldTable" -ContentType 'application/json' -Body $body -Headers $authHeaders -SkipCertificateCheck
        $rows = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE md_nome_tabella=@t AND mdschemaname=@s" -Params @{ t=$o.Object; s=$o.Schema }
        $mdMacMap[$o.Object] = [int]$rows[0].md_id
        Write-Host "  [ok] $($o.Schema).$($o.Object) → md_id=$($mdMacMap[$o.Object])" -ForegroundColor Green
    }
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__tabelle
   SET mdroutename=@r, mm_display_string=@disp, mm_long_description=@longdesc,
       mdhaslogicdelete=1, mdloggingenable=1,
       mdlogginginsertdatefieldname='data_creazione', mdlogginginsertuserfieldname='utente_creazione',
       mdlogginglastmoddatefieldname='data_modifica', mdlogginglastmoduserfieldname='utente_modifica',
       mdloggingdeletedatefieldname='data_eliminazione', mdloggingdeleteuserfieldname='utente_eliminazione'
 WHERE md_id=@md
"@ -Params @{ r=$o.Route; disp=$o.Display; longdesc=$o.LongDesc; md=$mdMacMap[$o.Object] }
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__colonne SET mcislogicdeletekey=1 WHERE md_id=@md AND mc_nome_colonna='cancellato'" -Params @{ md=$mdMacMap[$o.Object] }
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne SET mchideinlist=1, mchideinedit=1, mc_logic_editable=0
 WHERE md_id=@md AND mc_nome_colonna IN ('cancellato','data_creazione','data_modifica','data_eliminazione','utente_creazione','utente_modifica','utente_eliminazione','public_id','outbox_id','notification_id')
"@ -Params @{ md=$mdMacMap[$o.Object] }
}

# Disable insert/edit on mac.response (auto-populated by poller)
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__tabelle SET mdserviceenableinsert=0, mdserviceenableedit=0 WHERE md_id=@md" -Params @{ md=$mdMacMap['response'] }

# Lookups
$macLookups = @(
    @{ Src='request';  Col='program_id';   Target='programs';           DisplayCol='code' },
    @{ Src='request';  Col='project_id';   Target='projects';           DisplayCol='code' },
    @{ Src='request';  Col='scenario_id';  Target='project_scenarios';  DisplayCol='name' },
    @{ Src='request';  Col='currency_id';  Target='currencies';         DisplayCol='code' },
    @{ Src='response'; Col='request_id';   Target='mac_requests';       DisplayCol='request_code' }
)
foreach ($lk in $macLookups) {
    if (-not $mdMacMap.ContainsKey($lk.Src)) { continue }
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mc_ui_column_type='lookupByID', mcuilookupentityname=@tgt,
       mcuilookupdata_value_field='id', mcuilookupdata_text_field=@disp, voa_class=2
 WHERE md_id=@md AND mc_nome_colonna=@col
"@ -Params @{ md=$mdMacMap[$lk.Src]; col=$lk.Col; tgt=$lk.Target; disp=$lk.DisplayCol }
}
Write-Host "  [ok] MAC lookup wiring ($($macLookups.Count) cols)" -ForegroundColor Green

# Custom action "Invia richiesta MAC" on mac.request route
$macSendCb = @"
// Sprint 8 Phase A — Invia richiesta MAC (background async via outbox + Provider Symmetry)
const rec = record;
if (!rec || !rec.id) {
  wtoolbox.messageNotificationService.add({ severity: 'warn', summary: 'MAC', detail: 'Seleziona una richiesta.' });
  return;
}
if (rec.status !== 0) {
  wtoolbox.messageNotificationService.add({ severity: 'warn', summary: 'MAC', detail: 'Solo richieste in stato Draft (status=0) possono essere inviate.' });
  return;
}
try {
  const r = await fetch('/api/mac/send/' + rec.id, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'} });
  const j = await r.json();
  if (j && j.ok) {
    wtoolbox.messageNotificationService.add({
      severity: 'success', summary: 'MAC inviata',
      detail: 'Outbox #' + j.outboxId + '. Riceverai notifica al completamento.'
    });
    if (typeof datasource.fetchData === 'function') { try { await datasource.fetchData(); } catch(_) {} }
  } else {
    wtoolbox.messageNotificationService.add({ severity: 'error', summary: 'MAC', detail: (j && j.error) || 'Errore' });
  }
} catch (e) {
  wtoolbox.messageNotificationService.add({ severity: 'error', summary: 'MAC', detail: String(e) });
}
"@
$exists = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 id1 FROM _mtdt__cstom__actions__tabelle WHERE mdid=@md AND buttoncaption='Invia richiesta'" -Params @{ md=$mdMacMap['request'] }
if ($exists.Count -gt 0) {
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _mtdt__cstom__actions__tabelle SET md_action_type=1, buttonimage='pi pi-send', actioncallback=@cb, ordine1=10 WHERE id1=@id" -Params @{ id=[int]$exists[0].id1; cb=$macSendCb }
} else {
    $newId = Get-NextActionId
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
INSERT INTO _mtdt__cstom__actions__tabelle (id1, mdid, md_action_type, buttoncaption, buttonimage, actioncallback, ordine1)
VALUES (@id, @md, 1, 'Invia richiesta', 'pi pi-send', @cb, 10)
"@ -Params @{ id=$newId; md=$mdMacMap['request']; cb=$macSendCb }
    Write-Host "  [insert] 'Invia richiesta' on mac_requests (id1=$newId)" -ForegroundColor Green
}

# ─── Phase B: cp.facts spreadsheet-light ────────────────────────────────────────
Write-Host ""
Write-Host "[3/4] Phase B — cp.facts spreadsheet-light (mdinlineedit=1)..." -ForegroundColor Cyan

$cpFacts = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE md_nome_tabella=@t AND mdschemaname=@s" -Params @{ t='facts'; s='cp' }
if ($cpFacts.Count -eq 0) {
    # Scaffold cp.facts (was never scaffolded — used only via SP)
    $body = @{ connection = $dataCs; connName=''; db=$dataDb; table='facts'; createMenu=$false; parentMenuId=0; schema='cp'; provider='' } | ConvertTo-Json -Compress
    $null = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/scaffolding.scaffoldTable" -ContentType 'application/json' -Body $body -Headers $authHeaders -SkipCertificateCheck
    $cpFacts = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE md_nome_tabella='facts' AND mdschemaname='cp'"
    Write-Host "  [ok] cp.facts scaffolded → md_id=$($cpFacts[0].md_id)" -ForegroundColor Green
} else {
    Write-Host "  [skip] cp.facts already scaffolded → md_id=$($cpFacts[0].md_id)" -ForegroundColor DarkGray
}
$cpFactsMd = [int]$cpFacts[0].md_id

# Activate inline-edit + sensible config
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__tabelle
   SET mdroutename = 'plan_facts',
       mm_display_string = N'Planning facts (PowerEdit)',
       mm_long_description = N'Spreadsheet-light editing inline su cp.facts. Per archetype <wuic-spreadsheet> full (copy/paste multi-cell, formule) vedi Sprint 8 design doc.',
       mdinlineedit = 1,
       mdinlinecellediting = 1,
       mdhaslogicdelete = 1,
       mdloggingenable = 1,
       mdlogginginsertdatefieldname = 'data_creazione',
       mdlogginginsertuserfieldname = 'utente_creazione',
       mdlogginglastmoddatefieldname= 'data_modifica',
       mdlogginglastmoduserfieldname= 'utente_modifica',
       mdloggingdeletedatefieldname = 'data_eliminazione',
       mdloggingdeleteuserfieldname = 'utente_eliminazione',
       mdpagesize = 100
 WHERE md_id = @md
"@ -Params @{ md = $cpFactsMd }

# Logic delete flag + hide audit
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__colonne SET mcislogicdeletekey=1 WHERE md_id=@md AND mc_nome_colonna='cancellato'" -Params @{ md=$cpFactsMd }
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne SET mchideinlist=1, mchideinedit=1, mc_logic_editable=0
 WHERE md_id=@md AND mc_nome_colonna IN ('cancellato','data_creazione','data_modifica','data_eliminazione','utente_creazione','utente_modifica','utente_eliminazione')
"@ -Params @{ md=$cpFactsMd }

# Lookup wiring (FK columns)
$cpLookups = @(
    @{ Col='time_month_id';      Target='dim_time';            DisplayCol='month_id' },
    @{ Col='program_id';         Target='programs';            DisplayCol='code' },
    @{ Col='project_id';         Target='projects';            DisplayCol='code' },
    @{ Col='project_scenario_id';Target='project_scenarios';   DisplayCol='name' },
    @{ Col='unit_measure_id';    Target='wf_roles';            DisplayCol='name' },   # placeholder — cp.unit_measure non scaffoldato come route
    @{ Col='currency_id';        Target='currencies';          DisplayCol='code' },
    @{ Col='xbs_node_id';        Target='xbs_nodes';           DisplayCol='name' }
)
foreach ($lk in $cpLookups) {
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mc_ui_column_type='lookupByID', mcuilookupentityname=@tgt,
       mcuilookupdata_value_field='id', mcuilookupdata_text_field=@disp, voa_class=2
 WHERE md_id=@md AND mc_nome_colonna=@col
"@ -Params @{ md=$cpFactsMd; col=$lk.Col; tgt=$lk.Target; disp=$lk.DisplayCol }
}
Write-Host "  [ok] cp.facts inline-edit + lookup wiring ($($cpLookups.Count) cols)" -ForegroundColor Green

# ─── Menu activation ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[4/4] Menu activation..." -ForegroundColor Cyan

# Activate Planning → PowerEdit
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__menu
   SET mm_is_visible_by_default = 1,
       mm_uri_menu = '#/plan_facts/list',
       mdid = @md,
       mm_display_string_menu = N'PowerEdit (inline)'
 WHERE mm_nome_menu = 'planning_worktasks_planning'
"@ -Params @{ md = $cpFactsMd }

# Add Integrazioni menu group with MAC submenu (if missing)
$intGroup = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 mm_id FROM _metadati__menu WHERE mm_nome_menu = 'integrazioni'"
if ($intGroup.Count -eq 0) {
    $newId = Get-NextMenuId
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
INSERT INTO _metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mmordine, mm_parent_id, mm_uri_menu, mm_is_visible_by_default, mm_icon)
VALUES (@id, 'integrazioni', N'Integrazioni', 600, 0, '#/mac_requests/list', 1, 'pi pi-link')
"@ -Params @{ id = $newId }
    $intId = $newId
    Write-Host "  [insert] Integrazioni top menu (id=$intId)" -ForegroundColor Green
} else {
    $intId = [int]$intGroup[0].mm_id
}

# Sub-entries under Integrazioni
function Ensure-MenuEntry {
    param([string]$Key, [string]$Display, [int]$ParentId, [int]$Order, [string]$Route, [int]$MdId)
    $uri = "#/$Route/list"
    $ex = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 mm_id FROM _metadati__menu WHERE mm_nome_menu = @k" -Params @{ k = $Key }
    if ($ex.Count -gt 0) {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__menu SET mm_display_string_menu=@d, mm_uri_menu=@u, mdid=@md, mmordine=@o, mm_parent_id=@p, mm_is_visible_by_default=1 WHERE mm_id=@id" -Params @{ id=[int]$ex[0].mm_id; d=$Display; u=$uri; md=$MdId; o=$Order; p=$ParentId }
        return [int]$ex[0].mm_id
    }
    $newId = Get-NextMenuId
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
INSERT INTO _metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mmordine, mm_parent_id, mm_uri_menu, mm_is_visible_by_default, mdid)
VALUES (@id, @k, @d, @o, @p, @u, 1, @md)
"@ -Params @{ id=$newId; k=$Key; d=$Display; o=$Order; p=$ParentId; u=$uri; md=$MdId }
    return $newId
}
$null = Ensure-MenuEntry -Key 'integrazioni_mac_requests' -Display 'Richieste MAC (outbound)' -ParentId $intId -Order 10 -Route 'mac_requests'  -MdId $mdMacMap['request']
$null = Ensure-MenuEntry -Key 'integrazioni_mac_responses' -Display 'Risposte MAC (inbound)'  -ParentId $intId -Order 20 -Route 'mac_responses' -MdId $mdMacMap['response']
$null = Ensure-MenuEntry -Key 'integrazioni_provider_cursors' -Display 'Provider cursors' -ParentId $intId -Order 30 -Route 'provider_cursors'  -MdId 1   # placeholder

Write-Host "  [ok] Menu Planning→PowerEdit + Integrazioni→MAC entries activated" -ForegroundColor Green

# Invalidate
$inv = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime" -ContentType 'application/json' -Body '{}' -Headers $authHeaders -SkipCertificateCheck
Write-Host ""
Write-Host "[done] $($inv.Content.Substring(0, [Math]::Min(160, $inv.Content.Length)))" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Sprint 8 scaffold complete" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Routes:" -ForegroundColor White
Write-Host "    /mac_requests/list   — toolbar 'Invia richiesta' (background outbox + notif)" -ForegroundColor White
Write-Host "    /mac_responses/list  — risposte inbound polled" -ForegroundColor White
Write-Host "    /plan_facts/list     — cp.facts inline-edit (mdinlineedit=1)" -ForegroundColor White
