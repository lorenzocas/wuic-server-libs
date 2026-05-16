<#
.SYNOPSIS
  Sprint 6 follow-up — Scaffold 7 rep.params_<code> tables + lookup wiring +
  cascading filters + update "Genera Report" callback on rep_reports per
  navigare al params form quando params_route e' valorizzato.
  Aggiunge anche custom action "Esegui con questo preset" su ogni params route.
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

# 7 params tables to scaffold + lookup config + cascading config
$paramsTables = @(
    @{
        Schema='rep'; Table='params_program_pivot'; Route='rep_params_program_pivot'; Display='Filtri Program Pivot';
        Lookups=@(
            @{ Col='site_id';          Target='sites';             DisplayCol='name'; Multi=$false },
            @{ Col='project_class_id'; Target='project_classes';   DisplayCol='name'; Multi=$false },
            @{ Col='program_id';       Target='programs';          DisplayCol='code'; Multi=$false; CascadeFromField='site_id'; CascadeTargetField='site_id' },
            @{ Col='scenario_id';      Target='project_scenarios'; DisplayCol='name'; Multi=$false }
        )
    },
    @{
        Schema='rep'; Table='params_summary_cost'; Route='rep_params_summary_cost'; Display='Filtri Summary Cost';
        Lookups=@(
            @{ Col='program_id';  Target='programs';          DisplayCol='code'; Multi=$false },
            @{ Col='scenario_id'; Target='project_scenarios'; DisplayCol='name'; Multi=$false }
        )
    },
    @{
        Schema='rep'; Table='params_monthly_status'; Route='rep_params_monthly_status'; Display='Filtri Monthly Status';
        Lookups=@(
            @{ Col='program_id';  Target='programs';          DisplayCol='code'; Multi=$false },
            @{ Col='scenario_id'; Target='project_scenarios'; DisplayCol='name'; Multi=$false }
        )
    },
    @{
        Schema='rep'; Table='params_site_planning'; Route='rep_params_site_planning'; Display='Filtri Site Planning';
        Lookups=@(
            @{ Col='site_id';          Target='sites';           DisplayCol='name'; Multi=$false },
            @{ Col='project_class_id'; Target='project_classes'; DisplayCol='name'; Multi=$false }
        )
    },
    @{
        Schema='rep'; Table='params_overall_status'; Route='rep_params_overall_status'; Display='Filtri Overall Status';
        Lookups=@(
            @{ Col='site_id';          Target='sites';             DisplayCol='name'; Multi=$false },
            @{ Col='project_class_id'; Target='project_classes';   DisplayCol='name'; Multi=$false },
            @{ Col='scenario_id';      Target='project_scenarios'; DisplayCol='name'; Multi=$false }
        )
    },
    @{
        Schema='rep'; Table='params_worst_planning_projects'; Route='rep_params_worst_planning_projects'; Display='Filtri Worst Planning';
        Lookups=@(
            @{ Col='site_id';          Target='sites';           DisplayCol='name'; Multi=$false },
            @{ Col='project_class_id'; Target='project_classes'; DisplayCol='name'; Multi=$false }
        )
    },
    @{
        Schema='rep'; Table='params_fte_report'; Route='rep_params_fte_report'; Display='Filtri FTE Report';
        Lookups=@(
            @{ Col='site_id';        Target='sites';           DisplayCol='name'; Multi=$false },
            @{ Col='role_id';        Target='wf_roles';        DisplayCol='name'; Multi=$false },
            @{ Col='cost_center_id'; Target='wf_cost_centers'; DisplayCol='name'; Multi=$false; CascadeFromField='site_id'; CascadeTargetField='site_id' }
        )
    }
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
Write-Host "  Sprint 6 follow-up — 7 params tables + cascading + actions" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# Login
$kUserCookie = $null
$loginBody = @{ user_name = $AdminUser; password = $AdminPass; captchaToken = '' } | ConvertTo-Json -Compress
$loginResp = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.login" -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
foreach ($s in @($loginResp.Headers['Set-Cookie'])) { if ($s -match '^\s*k-user=([^;]+)') { $kUserCookie = $Matches[1]; break } }
if (-not $kUserCookie) { throw "Cannot extract k-user cookie" }
$authHeaders = @{ 'Cookie' = "k-user=$kUserCookie" }
Write-Host "[1/4] login ok" -ForegroundColor Green

# Scaffold + patch + lookup wiring
Write-Host ""
Write-Host "[2/4] Scaffold 7 params tables + lookup wiring..." -ForegroundColor Cyan
$mdMap = @{}
foreach ($p in $paramsTables) {
    $existing = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE md_nome_tabella = @t AND mdschemaname = @s" -Params @{ t = $p.Table; s = $p.Schema }
    if ($existing.Count -gt 0) {
        $mdMap[$p.Table] = [int]$existing[0].md_id
        Write-Host "  [skip] $($p.Schema).$($p.Table)" -ForegroundColor DarkGray
    } else {
        $body = @{ connection = $dataCs; connName = ''; db = $dataDb; table = $p.Table; createMenu = $false; parentMenuId = 0; schema = $p.Schema; provider = '' } | ConvertTo-Json -Compress
        $null = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/scaffolding.scaffoldTable" -ContentType 'application/json' -Body $body -Headers $authHeaders -SkipCertificateCheck
        $rows = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE md_nome_tabella = @t AND mdschemaname = @s" -Params @{ t = $p.Table; s = $p.Schema }
        $mdMap[$p.Table] = [int]$rows[0].md_id
        Write-Host "  [ok] $($p.Schema).$($p.Table) → md_id=$($mdMap[$p.Table])" -ForegroundColor Green
    }

    # Normalize route + flags
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__tabelle
   SET mdroutename = @r, mm_display_string = @disp,
       mdhaslogicdelete = 1, mdloggingenable = 1,
       mdlogginginsertdatefieldname = 'data_creazione',
       mdlogginginsertuserfieldname = 'utente_creazione',
       mdlogginglastmoddatefieldname= 'data_modifica',
       mdlogginglastmoduserfieldname= 'utente_modifica',
       mdloggingdeletedatefieldname = 'data_eliminazione',
       mdloggingdeleteuserfieldname = 'utente_eliminazione'
 WHERE md_id = @md
"@ -Params @{ r = $p.Route; disp = $p.Display; md = $mdMap[$p.Table] }
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__colonne SET mcislogicdeletekey = 1 WHERE md_id = @md AND mc_nome_colonna = 'cancellato'" -Params @{ md = $mdMap[$p.Table] }
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mchideinlist = 1, mchideinedit = 1, mc_logic_editable = 0
 WHERE md_id = @md
   AND mc_nome_colonna IN ('id','cancellato','data_creazione','data_modifica','data_eliminazione','utente_creazione','utente_modifica','utente_eliminazione','saved_at')
"@ -Params @{ md = $mdMap[$p.Table] }

    # Hide user_id (auto-filled from current user, framework pattern)
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__colonne SET mchideinedit = 1, mchideinlist = 1 WHERE md_id = @md AND mc_nome_colonna = 'user_id'" -Params @{ md = $mdMap[$p.Table] }

    # Lookup wiring
    foreach ($lk in $p.Lookups) {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mc_ui_column_type        = 'lookupByID',
       mcuilookupentityname     = @tgt,
       mcuilookupdata_value_field = 'id',
       mcuilookupdata_text_field  = @disp,
       voa_class                = 2
 WHERE md_id = @md AND mc_nome_colonna = @col
"@ -Params @{ md = $mdMap[$p.Table]; col = $lk.Col; tgt = $lk.Target; disp = $lk.DisplayCol }

        # Cascading filter wiring (target_lookup filters by another field on this same row)
        if ($lk.ContainsKey('CascadeFromField') -and $lk.CascadeFromField) {
            $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mclogiccascadefiltering_parent = @parent,
       mclgccscdfltr_n_dtsrc_fld_name = @tgt_field,
       mclogiccascadefilter_operator  = 'eq',
       mclogiccascadeis               = 1,
       mclogiccascadechild_to_reset   = 1
 WHERE md_id = @md AND mc_nome_colonna = @col
"@ -Params @{ md = $mdMap[$p.Table]; col = $lk.Col; parent = $lk.CascadeFromField; tgt_field = $lk.CascadeTargetField }
        }
    }
    Write-Host "    [ok] $($p.Route): $($p.Lookups.Count) lookup configured (incl. cascade)" -ForegroundColor Green
}

# ── Update "Genera Report" callback on rep_reports ───────────────────────────
Write-Host ""
Write-Host "[3/4] Update 'Genera Report' callback (route-aware)..." -ForegroundColor Cyan

$repReportsMd = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE mdroutename = 'rep_reports'"
if ($repReportsMd.Count -eq 0) { throw "rep_reports route not found" }
$repReportsId = [int]$repReportsMd[0].md_id

$generateCb = @"
// Sprint 6 — Background Report con params_route:
//   - se params_route NULL → enqueue immediato (params={})
//   - altrimenti naviga a /<params_route>/list dove l'utente edita il preset
//     e clicca poi "Esegui con questo preset" che fa la POST /api/reports/run
const def = record;
if (!def || !def.id) {
  wtoolbox.messageNotificationService.add({ severity: 'warn', summary: 'Reports', detail: 'Seleziona un report.' });
  return;
}
if (def.params_route && def.params_route.length > 0) {
  // Naviga al params form
  const url = '/' + def.params_route + '/list';
  if (typeof wtoolbox.navigate === 'function') {
    wtoolbox.navigate(url);
  } else {
    window.location.hash = '#' + url;
  }
  wtoolbox.messageNotificationService.add({
    severity: 'info', summary: 'Filtri',
    detail: 'Configura i filtri e clicca "Esegui con questo preset" per generare il report'
  });
  return;
}
// No params → enqueue immediato
try {
  const r = await fetch('/api/reports/run/' + def.id, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ params: {} })
  });
  const j = await r.json();
  if (j && j.ok) {
    wtoolbox.messageNotificationService.add({
      severity: 'success', summary: 'Report avviato',
      detail: 'Esecuzione #' + j.executionId + '. Riceverai una notifica quando pronto.'
    });
  } else {
    wtoolbox.messageNotificationService.add({ severity: 'error', summary: 'Report', detail: (j && j.error) || 'Errore' });
  }
} catch (e) {
  wtoolbox.messageNotificationService.add({ severity: 'error', summary: 'Report', detail: String(e) });
}
"@

$exists = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 id1 FROM _mtdt__cstom__actions__tabelle WHERE mdid = @md AND buttoncaption = 'Genera Report'" -Params @{ md = $repReportsId }
if ($exists.Count -gt 0) {
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _mtdt__cstom__actions__tabelle SET actioncallback = @cb WHERE id1 = @id" -Params @{ id = [int]$exists[0].id1; cb = $generateCb }
    Write-Host "  [update] 'Genera Report' callback on rep_reports (id=$($exists[0].id1))" -ForegroundColor Green
}

# Also: make `code`, `name`, `description`, `category`, `est_duration_seconds`, `params_route` visible in list-grid
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mchideinlist = 0
 WHERE md_id = @md AND mc_nome_colonna IN ('code','name','description','category','est_duration_seconds','params_route','is_active')
"@ -Params @{ md = $repReportsId }

# ── Add "Esegui con questo preset" toolbar action on each params route ──────
Write-Host ""
Write-Host "[4/4] Add 'Esegui con questo preset' actions on 7 params routes..." -ForegroundColor Cyan

foreach ($p in $paramsTables) {
    # Find report_definition.id for this params_route
    $defRows = Invoke-Sql -ConnString $dataCs -Query "SELECT TOP 1 id FROM [rep].[report_definition] WHERE params_route = @r" -Params @{ r = $p.Route }
    if ($defRows.Count -eq 0) {
        Write-Host "  [skip] no report_definition for params_route=$($p.Route)" -ForegroundColor Yellow
        continue
    }
    $defId = [int]$defRows[0].id

    $execCb = @"
// Sprint 6 — Esegui report con preset corrente.
// Salva prima il record (UPSERT su user_id) tramite il framework parametric-dialog
// save flow, poi POST /api/reports/run/$defId con params=current record.
const def_id = $defId;
const params = record || {};
try {
  const r = await fetch('/api/reports/run/' + def_id, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params })
  });
  const j = await r.json();
  if (j && j.ok) {
    wtoolbox.messageNotificationService.add({
      severity: 'success', summary: 'Report avviato',
      detail: 'Esecuzione #' + j.executionId + '. Notifica al completamento.'
    });
  } else {
    wtoolbox.messageNotificationService.add({ severity: 'error', summary: 'Report', detail: (j && j.error) || 'Errore' });
  }
} catch (e) {
  wtoolbox.messageNotificationService.add({ severity: 'error', summary: 'Report', detail: String(e) });
}
"@
    $exists2 = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 id1 FROM _mtdt__cstom__actions__tabelle WHERE mdid = @md AND buttoncaption = 'Esegui con questo preset'" -Params @{ md = $mdMap[$p.Table] }
    if ($exists2.Count -gt 0) {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _mtdt__cstom__actions__tabelle SET md_action_type = 1, buttonimage = 'pi pi-play', actioncallback = @cb, ordine1 = 10 WHERE id1 = @id" -Params @{ id = [int]$exists2[0].id1; cb = $execCb }
        Write-Host "  [update] $($p.Route) — id=$($exists2[0].id1)" -ForegroundColor Yellow
    } else {
        $nextRows = Invoke-Sql -ConnString $metaCs -Query "SELECT ISNULL(MAX(id1), 0) + 1 AS n FROM _mtdt__cstom__actions__tabelle"
        $newId = [int]$nextRows[0].n
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
INSERT INTO _mtdt__cstom__actions__tabelle (id1, mdid, md_action_type, buttoncaption, buttonimage, actioncallback, ordine1)
VALUES (@id, @md, 1, 'Esegui con questo preset', 'pi pi-play', @cb, 10)
"@ -Params @{ id = $newId; md = $mdMap[$p.Table]; cb = $execCb }
        Write-Host "  [insert] $($p.Route) (id1=$newId, def_id=$defId)" -ForegroundColor Green
    }
}

# Invalidate
$inv = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime" -ContentType 'application/json' -Body '{}' -Headers $authHeaders -SkipCertificateCheck
Write-Host ""
Write-Host "[done] $($inv.Content.Substring(0, [Math]::Min(160, $inv.Content.Length)))" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Sprint 6 reports params scaffold complete" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Flusso UI:" -ForegroundColor White
Write-Host "    1. /rep_reports/list  → 7 report (PROGRAM_PIVOT, SUMMARY_COST, ...)" -ForegroundColor White
Write-Host "    2. Click 'Genera Report' → naviga a /<params_route>/list" -ForegroundColor White
Write-Host "    3. Edit preset (parametric-dialog auto-render con cascading)" -ForegroundColor White
Write-Host "    4. Click 'Esegui con questo preset' → POST /api/reports/run + toast" -ForegroundColor White
Write-Host "    5. Notification-bell → click → /rep_executions/edit/<id>" -ForegroundColor White
