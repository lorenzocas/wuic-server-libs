<#
.SYNOPSIS
  Sprint 6 — Scaffold + custom actions + menu activation per:
   - Upload pipeline (uploads.batch + 3 custom actions md_action_type=10)
   - Reporting pipeline (rep.report_definition + rep.report_execution + 1 row-button "Genera")
   - Menu: Planning→Massive Upload, Reporting→Reports, Reporting→Esecuzioni
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

# 3 tables/views to scaffold
$objects = @(
    @{ Schema='uploads'; Object='batch';             Route='uploads_batches';   Display='Massive Upload';     LongDesc='Storico upload massivi (workforce/planned/baseline)'; IsView=$false; ReadOnly=$false },
    @{ Schema='rep';     Object='report_definition'; Route='rep_reports';       Display='Reports';            LongDesc='Catalogo report disponibili — click row button per generare'; IsView=$false; ReadOnly=$false },
    @{ Schema='rep';     Object='report_execution';  Route='rep_executions';    Display='Esecuzioni report';  LongDesc='Storico esecuzioni report con result + status + duration'; IsView=$false; ReadOnly=$false }
)

function Invoke-Sql {
    param([string]$ConnString, [string]$Query, [hashtable]$Params = @{})
    $conn = New-Object System.Data.SqlClient.SqlConnection $ConnString; $conn.Open()
    try {
        $cmd = $conn.CreateCommand(); $cmd.CommandText = $Query; $cmd.CommandTimeout = 60
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
        $cmd = $conn.CreateCommand(); $cmd.CommandText = $Query; $cmd.CommandTimeout = 60
        foreach ($k in $Params.Keys) {
            if ($null -eq $Params[$k]) { $null = $cmd.Parameters.AddWithValue("@$k", [DBNull]::Value) }
            else { $null = $cmd.Parameters.AddWithValue("@$k", $Params[$k]) }
        }
        return $cmd.ExecuteNonQuery()
    } finally { $conn.Close() }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Sprint 6 — Upload + Reporting scaffold + menu" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# Login
$kUserCookie = $null
$loginBody = @{ user_name = $AdminUser; password = $AdminPass; captchaToken = '' } | ConvertTo-Json -Compress
$loginResp = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.login" -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
foreach ($s in @($loginResp.Headers['Set-Cookie'])) {
    if ($s -match '^\s*k-user=([^;]+)') { $kUserCookie = $Matches[1]; break }
}
if (-not $kUserCookie) { throw "Cannot extract k-user cookie" }
$authHeaders = @{ 'Cookie' = "k-user=$kUserCookie" }
Write-Host "[1/6] login ok" -ForegroundColor Green

# Scaffold
Write-Host ""
Write-Host "[2/6] Scaffold tables..." -ForegroundColor Cyan
$mdMap = @{}
foreach ($o in $objects) {
    $existing = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE md_nome_tabella = @t AND mdschemaname = @s" -Params @{ t = $o.Object; s = $o.Schema }
    if ($existing.Count -gt 0) {
        $mdMap[$o.Object] = [int]$existing[0].md_id
        Write-Host "  [skip] $($o.Schema).$($o.Object) — md_id=$($mdMap[$o.Object])" -ForegroundColor DarkGray
    } else {
        $body = @{ connection = $dataCs; connName = ''; db = $dataDb; table = $o.Object; createMenu = $false; parentMenuId = 0; schema = $o.Schema; provider = '' } | ConvertTo-Json -Compress
        $null = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/scaffolding.scaffoldTable" -ContentType 'application/json' -Body $body -Headers $authHeaders -SkipCertificateCheck
        $rows = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE md_nome_tabella = @t AND mdschemaname = @s" -Params @{ t = $o.Object; s = $o.Schema }
        $mdMap[$o.Object] = [int]$rows[0].md_id
        Write-Host "  [ok] $($o.Schema).$($o.Object) → md_id=$($mdMap[$o.Object])" -ForegroundColor Green
    }
}

# Patch metadata + normalize routes
Write-Host ""
Write-Host "[3/6] Patch metadata flags + normalize routes..." -ForegroundColor Cyan
foreach ($o in $objects) {
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__tabelle
   SET mdroutename = @r, mm_display_string = @disp, mm_long_description = @longdesc,
       mdhaslogicdelete = 1, mdloggingenable = 1,
       mdlogginginsertdatefieldname = 'data_creazione',
       mdlogginginsertuserfieldname = 'utente_creazione',
       mdlogginglastmoddatefieldname= 'data_modifica',
       mdlogginglastmoduserfieldname= 'utente_modifica',
       mdloggingdeletedatefieldname = 'data_eliminazione',
       mdloggingdeleteuserfieldname = 'utente_eliminazione'
 WHERE md_id = @md
"@ -Params @{ r = $o.Route; disp = $o.Display; longdesc = $o.LongDesc; md = $mdMap[$o.Object] }
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__colonne SET mcislogicdeletekey = 1 WHERE md_id = @md AND mc_nome_colonna = 'cancellato'" -Params @{ md = $mdMap[$o.Object] }
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mchideinlist = 1, mchideinedit = 1, mc_logic_editable = 0
 WHERE md_id = @md
   AND mc_nome_colonna IN ('cancellato','data_creazione','data_modifica','data_eliminazione','utente_creazione','utente_modifica','utente_eliminazione','public_id')
"@ -Params @{ md = $mdMap[$o.Object] }
    Write-Host "  [ok] $($o.Schema).$($o.Object) patched" -ForegroundColor Green
}

# uploads_batches: also disable insert/edit (records sono creati dalle SP, non manualmente)
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__tabelle SET mdserviceenableinsert = 0, mdserviceenableedit = 0 WHERE md_id = @md" -Params @{ md = $mdMap['batch'] }
# rep_executions: same — append-only via outbox handler
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__tabelle SET mdserviceenableinsert = 0, mdserviceenableedit = 0 WHERE md_id = @md" -Params @{ md = $mdMap['report_execution'] }

# Lookup wiring
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mc_ui_column_type = 'lookupByID', mcuilookupentityname = 'rep_reports',
       mcuilookupdata_value_field = 'id', mcuilookupdata_text_field = 'name', voa_class = 2
 WHERE md_id = @md AND mc_nome_colonna = 'report_definition_id'
"@ -Params @{ md = $mdMap['report_execution'] }
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mc_ui_column_type = 'lookupByID', mcuilookupentityname = 'programs',
       mcuilookupdata_value_field = 'id', mcuilookupdata_text_field = 'code', voa_class = 2
 WHERE md_id = @md AND mc_nome_colonna = 'program_id'
"@ -Params @{ md = $mdMap['batch'] }

# ── Custom actions ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[4/6] Custom actions..." -ForegroundColor Cyan

# Helper: insert custom action row (idempotent via action_callback uniqueness per md_id)
function Ensure-CustomAction {
    param([int]$MdId, [int]$ActionType, [string]$ButtonCaption, [string]$ButtonImage, [string]$ActionCallback, [int]$Order)
    $existing = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 id1 FROM _mtdt__cstom__actions__tabelle WHERE mdid = @md AND buttoncaption = @cap" -Params @{ md = $MdId; cap = $ButtonCaption }
    if ($existing.Count -gt 0) {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _mtdt__cstom__actions__tabelle
   SET md_action_type = @at, buttonimage = @img, actioncallback = @cb, ordine1 = @ord
 WHERE id1 = @id
"@ -Params @{ id = [int]$existing[0].id1; at = $ActionType; img = $ButtonImage; cb = $ActionCallback; ord = $Order }
        Write-Host "  [update] '$ButtonCaption' on md_id=$MdId (id=$($existing[0].id1))" -ForegroundColor Yellow
    } else {
        # id1 e' NOT NULL non-IDENTITY → MAX+1
        $nextRows = Invoke-Sql -ConnString $metaCs -Query "SELECT ISNULL(MAX(id1), 0) + 1 AS n FROM _mtdt__cstom__actions__tabelle"
        $newId = [int]$nextRows[0].n
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
INSERT INTO _mtdt__cstom__actions__tabelle (id1, mdid, md_action_type, buttoncaption, buttonimage, actioncallback, ordine1)
VALUES (@id, @md, @at, @cap, @img, @cb, @ord)
"@ -Params @{ id = $newId; md = $MdId; at = $ActionType; cap = $ButtonCaption; img = $ButtonImage; cb = $ActionCallback; ord = $Order }
        Write-Host "  [insert] '$ButtonCaption' on md_id=$MdId (id1=$newId)" -ForegroundColor Green
    }
}

# 3 upload actions on uploads_batches (md_action_type=10)
$uploadCb = @{}
foreach ($k in 'workforce','planned','baseline') {
    $uploadCb[$k] = @"
// md_action_type=10 upload: dump CSV/XLSX in [uploads].[staging_$k] (mode=replace) → EXEC [uploads].[process_${k}_upload]
const result = await wtoolbox.uploadDialog({
  target_table: 'uploads.staging_$k',
  stored_name:  'uploads.process_${k}_upload',
  mode:         'replace',
  title:        'Upload $k',
  routeName:    datasource?.metaInfo?.tableMetadata?.md_route_name || 'uploads_batches'
});
if (!result) return;
wtoolbox.messageNotificationService.add({ severity: 'success', summary: 'Upload $k', detail: result.message });
if (typeof datasource.fetchData === 'function') { try { await datasource.fetchData(); } catch(_) {} }
"@
}
Ensure-CustomAction -MdId $mdMap['batch'] -ActionType 10 -ButtonCaption 'Upload Workforce'  -ButtonImage 'pi pi-upload' -ActionCallback $uploadCb.workforce -Order 10
Ensure-CustomAction -MdId $mdMap['batch'] -ActionType 10 -ButtonCaption 'Upload Planned'    -ButtonImage 'pi pi-upload' -ActionCallback $uploadCb.planned   -Order 20
Ensure-CustomAction -MdId $mdMap['batch'] -ActionType 10 -ButtonCaption 'Upload Baseline'   -ButtonImage 'pi pi-upload' -ActionCallback $uploadCb.baseline  -Order 30

# 1 toolbar action on rep_reports: "Genera Report" — calls ReportingController async pattern
$generateReportCb = @"
// Sprint 6 Background Report pattern: POST /api/reports/run/{id} returns immediato,
// scheduler outbox_dispatch processa async, INotificationRepository pusha quando pronto.
const rec = record;
if (!rec || !rec.id) {
  wtoolbox.messageNotificationService.add({ severity: 'warn', summary: 'Reports', detail: 'Seleziona un report dalla lista.' });
  return;
}
try {
  const r = await fetch('/api/reports/run/' + rec.id, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params: {} })
  });
  const j = await r.json();
  if (j && j.ok) {
    wtoolbox.messageNotificationService.add({
      severity: 'success',
      summary: 'Report avviato',
      detail: 'Esecuzione #' + j.executionId + ' in coda. Riceverai una notifica quando pronto.'
    });
  } else {
    wtoolbox.messageNotificationService.add({ severity: 'error', summary: 'Report', detail: (j && j.error) || 'Errore' });
  }
} catch (e) {
  wtoolbox.messageNotificationService.add({ severity: 'error', summary: 'Report', detail: String(e) });
}
"@
Ensure-CustomAction -MdId $mdMap['report_definition'] -ActionType 1 -ButtonCaption 'Genera Report' -ButtonImage 'pi pi-play' -ActionCallback $generateReportCb -Order 10

# ── Menu activation ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[5/6] Menu activation..." -ForegroundColor Cyan

# Planning → Massive Upload → list
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__menu
   SET mm_is_visible_by_default = 1,
       mm_uri_menu = '#/uploads_batches/list',
       mdid = @md
 WHERE mm_nome_menu = 'planning_massive_upload'
"@ -Params @{ md = $mdMap['batch'] }

$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__menu
   SET mm_is_visible_by_default = 1,
       mm_uri_menu = '#/uploads_batches/list',
       mdid = @md,
       mm_display_string_menu = N'Storico upload'
 WHERE mm_nome_menu = 'planning_massive_upload_list'
"@ -Params @{ md = $mdMap['batch'] }

# Reporting → Reports
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__menu
   SET mm_is_visible_by_default = 1,
       mm_uri_menu = '#/rep_reports/list',
       mdid = @md
 WHERE mm_nome_menu = 'reporting_list'
"@ -Params @{ md = $mdMap['report_definition'] }

$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__menu
   SET mm_is_visible_by_default = 1,
       mm_uri_menu = '#/reports/list'
 WHERE mm_nome_menu = 'reporting'
"@

# Add Reporting → Esecuzioni (if not present)
$repGroup = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 mm_id FROM _metadati__menu WHERE mm_nome_menu = 'reporting'"
if ($repGroup.Count -gt 0) {
    $repId = [int]$repGroup[0].mm_id
    $existsExec = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 mm_id FROM _metadati__menu WHERE mm_nome_menu = 'reporting_executions'"
    if ($existsExec.Count -eq 0) {
        $nextId = ([int](Invoke-Sql -ConnString $metaCs -Query "SELECT ISNULL(MAX(mm_id), 0) + 1 AS n FROM _metadati__menu")[0].n)
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
INSERT INTO _metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mmordine, mm_parent_id, mm_uri_menu, mm_is_visible_by_default, mdid)
VALUES (@id, 'reporting_executions', N'Esecuzioni', 15, @p, '#/rep_executions/list', 1, @md)
"@ -Params @{ id = $nextId; p = $repId; md = $mdMap['report_execution'] }
        Write-Host "  [insert] menu entry Reporting → Esecuzioni" -ForegroundColor Green
    } else {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__menu SET mm_is_visible_by_default = 1, mm_uri_menu = '#/rep_executions/list', mdid = @md WHERE mm_id = @id" -Params @{ md = $mdMap['report_execution']; id = [int]$existsExec[0].mm_id }
    }
}
Write-Host "  [ok] menu entries activated (Planning→Massive Upload, Reporting→Reports + Esecuzioni)" -ForegroundColor Green

# Invalidate
$inv = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime" -ContentType 'application/json' -Body '{}' -Headers $authHeaders -SkipCertificateCheck
Write-Host ""
Write-Host "[6/6] $($inv.Content.Substring(0, [Math]::Min(160, $inv.Content.Length)))" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Sprint 6 scaffold complete" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Routes:" -ForegroundColor White
Write-Host "    /uploads_batches/list  — Massive Upload (3 toolbar actions)" -ForegroundColor White
Write-Host "    /rep_reports/list      — Reports catalog (row 'Genera Report' button)" -ForegroundColor White
Write-Host "    /rep_executions/list   — Esecuzioni history (status + result_json)" -ForegroundColor White
