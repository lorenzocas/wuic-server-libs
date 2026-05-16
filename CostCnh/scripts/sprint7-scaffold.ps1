<#
.SYNOPSIS
  Sprint 7 — Scaffold:
    A) 3 history views (core.vw_program_history, core.vw_project_history, xbs.vw_node_history)
    B) Custom actions "Storia versioni" su programs/projects/xbs_nodes
    C) Custom action "Download xlsx" su rep_executions (Sprint 7 Phase B)
    D) Menu Reporting → "Revisions / Storia"
    E) Modifica program_pivot a output_format=xlsx (per testare il download)
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

$histViews = @(
    @{ Schema='core'; Object='vw_program_history'; Route='program_history'; Display='Storia Programmi'; LongDesc='Tutte le versioni temporali del programma (FOR SYSTEM_TIME ALL).' },
    @{ Schema='core'; Object='vw_project_history'; Route='project_history'; Display='Storia Progetti';  LongDesc='Tutte le versioni temporali del progetto.' },
    @{ Schema='xbs';  Object='vw_node_history';    Route='xbs_node_history'; Display='Storia Nodi XBS'; LongDesc='Tutte le versioni temporali dei nodi XBS/WBS.' }
)

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

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Sprint 7 — Revisions + xlsx download scaffold" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# Login
$kUserCookie = $null
$loginBody = @{ user_name = $AdminUser; password = $AdminPass; captchaToken = '' } | ConvertTo-Json -Compress
$loginResp = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.login" -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
foreach ($s in @($loginResp.Headers['Set-Cookie'])) { if ($s -match '^\s*k-user=([^;]+)') { $kUserCookie = $Matches[1]; break } }
if (-not $kUserCookie) { throw "Cannot extract k-user cookie" }
$authHeaders = @{ 'Cookie' = "k-user=$kUserCookie" }
Write-Host "[1/5] login ok" -ForegroundColor Green

# 2. Scaffold history views
Write-Host ""
Write-Host "[2/5] Scaffold 3 history views..." -ForegroundColor Cyan
$mdMap = @{}
foreach ($v in $histViews) {
    $existing = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE md_nome_tabella = @t AND mdschemaname = @s" -Params @{ t = $v.Object; s = $v.Schema }
    if ($existing.Count -gt 0) {
        $mdMap[$v.Object] = [int]$existing[0].md_id
        Write-Host "  [skip] $($v.Schema).$($v.Object)" -ForegroundColor DarkGray
    } else {
        $body = @{ connection = $dataCs; connName = ''; db = $dataDb; view = $v.Object; createMenu = $false; parentMenuId = 0; provider = '' } | ConvertTo-Json -Compress
        $null = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/scaffolding.scaffoldView" -ContentType 'application/json' -Body $body -Headers $authHeaders -SkipCertificateCheck
        $rows = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE md_nome_tabella = @t AND mdschemaname = @s" -Params @{ t = $v.Object; s = $v.Schema }
        $mdMap[$v.Object] = [int]$rows[0].md_id
        Write-Host "  [ok] $($v.Schema).$($v.Object) → md_id=$($mdMap[$v.Object])" -ForegroundColor Green
    }

    # Patch: read-only (audit log), normalize route, hide internals
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__tabelle
   SET mdroutename = @r, mm_display_string = @disp, mm_long_description = @longdesc,
       mdserviceenableinsert = 0, mdserviceenableedit = 0, mdserviceenabledelete = 0
 WHERE md_id = @md
"@ -Params @{ r = $v.Route; disp = $v.Display; longdesc = $v.LongDesc; md = $mdMap[$v.Object] }
}

# 3. Custom action "Storia versioni" on base routes (programs, projects, xbs_nodes)
Write-Host ""
Write-Host "[3/5] Add 'Storia versioni' actions on base routes..." -ForegroundColor Cyan

$baseRoutes = @(
    @{ BaseRoute='programs';  HistRoute='program_history'; FkField='id'  },
    @{ BaseRoute='projects';  HistRoute='project_history'; FkField='id'  },
    @{ BaseRoute='xbs_nodes'; HistRoute='xbs_node_history';FkField='id'  }
)

function Get-NextActionId {
    $rows = Invoke-Sql -ConnString $metaCs -Query "SELECT ISNULL(MAX(id1), 0) + 1 AS n FROM _mtdt__cstom__actions__tabelle"
    return [int]$rows[0].n
}

foreach ($br in $baseRoutes) {
    $rt = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE mdroutename = @r" -Params @{ r = $br.BaseRoute }
    if ($rt.Count -eq 0) {
        Write-Host "  [skip] route $($br.BaseRoute) not found" -ForegroundColor Yellow
        continue
    }
    $mdId = [int]$rt[0].md_id

    $cb = @"
// Sprint 7 — Storia versioni (Temporal Tables AS OF / FOR SYSTEM_TIME ALL)
// Naviga al list-grid della history view filtrato per id del record corrente.
const rec = record;
if (!rec || !rec.id) {
  wtoolbox.messageNotificationService.add({ severity: 'warn', summary: 'Storia', detail: 'Seleziona una riga.' });
  return;
}
const filterInfo = { filters: [{ field: 'id', operator: 'eq', value: rec.id }] };
const url = '/$($br.HistRoute)/list?filterInfo=' + encodeURIComponent(JSON.stringify(filterInfo));
if (typeof wtoolbox.navigate === 'function') { wtoolbox.navigate(url); }
else { window.location.hash = '#' + url; }
"@

    $exists = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 id1 FROM _mtdt__cstom__actions__tabelle WHERE mdid = @md AND buttoncaption = 'Storia versioni'" -Params @{ md = $mdId }
    if ($exists.Count -gt 0) {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _mtdt__cstom__actions__tabelle SET md_action_type = 0, buttonimage = 'pi pi-history', actioncallback = @cb, ordine1 = 100 WHERE id1 = @id" -Params @{ id = [int]$exists[0].id1; cb = $cb }
        Write-Host "  [update] $($br.BaseRoute) — 'Storia versioni' (id=$($exists[0].id1))" -ForegroundColor Yellow
    } else {
        $newId = Get-NextActionId
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
INSERT INTO _mtdt__cstom__actions__tabelle (id1, mdid, md_action_type, buttoncaption, buttonimage, actioncallback, ordine1)
VALUES (@id, @md, 0, 'Storia versioni', 'pi pi-history', @cb, 100)
"@ -Params @{ id = $newId; md = $mdId; cb = $cb }
        Write-Host "  [insert] $($br.BaseRoute) — 'Storia versioni' (id1=$newId)" -ForegroundColor Green
    }
}

# 4. Custom action "Download xlsx" on rep_executions
Write-Host ""
Write-Host "[4/5] Add 'Download xlsx' action on rep_executions..." -ForegroundColor Cyan

$execRt = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE mdroutename = 'rep_executions'"
if ($execRt.Count -gt 0) {
    $execMdId = [int]$execRt[0].md_id
    $dlCb = @"
// Sprint 7 Phase B — Download xlsx result
const rec = record;
if (!rec || !rec.id) {
  wtoolbox.messageNotificationService.add({ severity: 'warn', summary: 'Download', detail: 'Seleziona una esecuzione.' });
  return;
}
if (rec.status !== 2) {
  wtoolbox.messageNotificationService.add({ severity: 'warn', summary: 'Download', detail: 'Esecuzione non completata (status=' + rec.status + ').' });
  return;
}
if (!rec.result_path) {
  wtoolbox.messageNotificationService.add({ severity: 'info', summary: 'Download', detail: 'Questo report e\' in JSON inline (vedi result_json). Solo report con output_format=xlsx generano file scaricabile.' });
  return;
}
// Trigger download via anchor click
const url = '/api/reports/download/' + rec.id;
const a = document.createElement('a');
a.href = url;
a.download = '';
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
"@
    $exists = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 id1 FROM _mtdt__cstom__actions__tabelle WHERE mdid = @md AND buttoncaption = 'Download xlsx'" -Params @{ md = $execMdId }
    if ($exists.Count -gt 0) {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _mtdt__cstom__actions__tabelle SET md_action_type = 0, buttonimage = 'pi pi-download', actioncallback = @cb, ordine1 = 10 WHERE id1 = @id" -Params @{ id = [int]$exists[0].id1; cb = $dlCb }
        Write-Host "  [update] rep_executions — 'Download xlsx' (id=$($exists[0].id1))" -ForegroundColor Yellow
    } else {
        $newId = Get-NextActionId
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
INSERT INTO _mtdt__cstom__actions__tabelle (id1, mdid, md_action_type, buttoncaption, buttonimage, actioncallback, ordine1)
VALUES (@id, @md, 0, 'Download xlsx', 'pi pi-download', @cb, 10)
"@ -Params @{ id = $newId; md = $execMdId; cb = $dlCb }
        Write-Host "  [insert] rep_executions — 'Download xlsx' (id1=$newId)" -ForegroundColor Green
    }
}

# 5. Switch PROGRAM_PIVOT to output_format=xlsx (per test download)
$null = Invoke-SqlNonQuery -ConnString $dataCs -Query "UPDATE [rep].[report_definition] SET output_format = 'xlsx' WHERE code = 'PROGRAM_PIVOT'"
Write-Host "  [info] PROGRAM_PIVOT.output_format = 'xlsx'" -ForegroundColor DarkGray

# 6. Menu: Reporting → "Storia / Revisions"
Write-Host ""
Write-Host "[5/5] Menu Reporting → Storia/Revisions..." -ForegroundColor Cyan
$repGroup = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 mm_id FROM _metadati__menu WHERE mm_nome_menu = 'reporting'"
if ($repGroup.Count -gt 0) {
    $repId = [int]$repGroup[0].mm_id

    function Ensure-MenuEntry {
        param([string]$Key, [string]$Display, [int]$ParentId, [int]$Order, [string]$Route, [int]$MdId)
        $uri = "#/$Route/list"
        $ex = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 mm_id FROM _metadati__menu WHERE mm_nome_menu = @k" -Params @{ k = $Key }
        if ($ex.Count -gt 0) {
            $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__menu SET mm_display_string_menu = @d, mm_uri_menu = @u, mdid = @md, mmordine = @o, mm_parent_id = @p, mm_is_visible_by_default = 1 WHERE mm_id = @id" `
                -Params @{ id = [int]$ex[0].mm_id; d = $Display; u = $uri; md = $MdId; o = $Order; p = $ParentId }
            return [int]$ex[0].mm_id
        }
        $nextRows = Invoke-Sql -ConnString $metaCs -Query "SELECT ISNULL(MAX(mm_id), 0) + 1 AS n FROM _metadati__menu"
        $newId = [int]$nextRows[0].n
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
INSERT INTO _metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mmordine, mm_parent_id, mm_uri_menu, mm_is_visible_by_default, mdid)
VALUES (@id, @k, @d, @o, @p, @u, 1, @md)
"@ -Params @{ id = $newId; k = $Key; d = $Display; o = $Order; p = $ParentId; u = $uri; md = $MdId }
        return $newId
    }

    $null = Ensure-MenuEntry -Key 'reporting_history_programs' -Display 'Storia Programmi' -ParentId $repId -Order 50 -Route 'program_history' -MdId $mdMap['vw_program_history']
    $null = Ensure-MenuEntry -Key 'reporting_history_projects' -Display 'Storia Progetti'  -ParentId $repId -Order 60 -Route 'project_history' -MdId $mdMap['vw_project_history']
    $null = Ensure-MenuEntry -Key 'reporting_history_xbs'      -Display 'Storia XBS'       -ParentId $repId -Order 70 -Route 'xbs_node_history' -MdId $mdMap['vw_node_history']
    Write-Host "  [ok] 3 menu entries Reporting → Storia (under id=$repId)" -ForegroundColor Green
}

# Invalidate
$inv = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime" -ContentType 'application/json' -Body '{}' -Headers $authHeaders -SkipCertificateCheck
Write-Host ""
Write-Host "[done] $($inv.Content.Substring(0, [Math]::Min(160, $inv.Content.Length)))" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Sprint 7 scaffold complete" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Routes:" -ForegroundColor White
Write-Host "    /program_history/list   — versioni FOR SYSTEM_TIME ALL" -ForegroundColor White
Write-Host "    /project_history/list   — versioni FOR SYSTEM_TIME ALL" -ForegroundColor White
Write-Host "    /xbs_node_history/list  — versioni FOR SYSTEM_TIME ALL" -ForegroundColor White
Write-Host "  Custom actions:" -ForegroundColor White
Write-Host "    programs/projects/xbs_nodes → 'Storia versioni' (navigate)" -ForegroundColor White
Write-Host "    rep_executions → 'Download xlsx' (when result_path set)" -ForegroundColor White
Write-Host "  PROGRAM_PIVOT ora produce xlsx invece di JSON inline" -ForegroundColor White
