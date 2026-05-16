<#
.SYNOPSIS
  Sprint 5c — Boardcontent 2x2 dashboards (Cost Center View + Business Unit View).
  Clona il template `2x2-grid-with-charts.template.json` 2 volte e adatta
  semanticamente al dominio workforce CostCnh:
    - 4 chart-ready views scaffoldate con propsbag chart preconfigurato
    - 2 dashboard inserite in dom_board (wf_cost_center_dashboard, wf_business_unit_dashboard)
    - Menu workforce aggiornato a puntare ai 2 dashboard

  Strategia: walk ricorsivo del template, sostituzione di
    - DATASOURCE.inputs.route
    - DATASOURCE.inputs.metaInfo.tableMetadata (re-fetched via API)
    - DATASOURCE.inputs.metaInfo.columnMetadata (re-fetched via API, strip extraProps)
    - SPAN.inputs.innerText (titoli widget)
    - DATAREPEATER.inputs.action (chart/list)

.EXAMPLE
  pwsh -ExecutionPolicy Bypass -File scripts/sprint5c-dashboards.ps1
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

# Chart-ready views to scaffold
$chartViews = @(
    @{ Schema='wf'; Object='vw_chart_fte_by_cost_center';  Route='wf_chart_fte_by_cost_center';  Display='FTE per Cost Center';  LabelField='cost_center_name'; DataField='avg_fte'; ChartType='bar' },
    @{ Schema='wf'; Object='vw_chart_cost_by_role';        Route='wf_chart_cost_by_role';        Display='Costo per Ruolo';      LabelField='role_name';        DataField='total_cost'; ChartType='bar' },
    @{ Schema='wf'; Object='vw_chart_fte_by_business_unit';Route='wf_chart_fte_by_business_unit';Display='FTE per Business Unit';LabelField='business_unit_name';DataField='avg_fte'; ChartType='bar' },
    @{ Schema='wf'; Object='vw_chart_resources_by_role';   Route='wf_chart_resources_by_role';   Display='Risorse per Ruolo';    LabelField='role_name';        DataField='resource_count'; ChartType='bar' }
)

# Dashboard definitions
$dashboards = @(
    @{
        BoardRoute  = 'wf_cost_center_dashboard'
        Title       = 'Cost Center View — Workforce KPI'
        Description = 'Dashboard 2x2: FTE per cost center, costo per ruolo, lista CC, lista risorse'
        Widgets = @(
            @{ Title='FTE per Cost Center';  Route='wf_chart_fte_by_cost_center'; Action='chart' },
            @{ Title='Costo per Ruolo';      Route='wf_chart_cost_by_role';       Action='chart' },
            @{ Title='Aggregato Cost Center';Route='wf_cost_center_view';          Action='list'  },
            @{ Title='Risorse';              Route='wf_resources';                  Action='list'  }
        )
    },
    @{
        BoardRoute  = 'wf_business_unit_dashboard'
        Title       = 'Business Unit View — Workforce KPI'
        Description = 'Dashboard 2x2: FTE per business unit, risorse per ruolo, lista BU, lista allocazioni'
        Widgets = @(
            @{ Title='FTE per Business Unit'; Route='wf_chart_fte_by_business_unit'; Action='chart' },
            @{ Title='Risorse per Ruolo';     Route='wf_chart_resources_by_role';    Action='chart' },
            @{ Title='Aggregato Business Unit';Route='wf_business_unit_view';        Action='list'  },
            @{ Title='Allocazioni (dettaglio)';Route='wf_worktask_view';             Action='list'  }
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
Write-Host "  Sprint 5c — Workforce dashboards 2x2 (boardcontent clone)" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# ─── 1. LOGIN ──────────────────────────────────────────────────────────────────
$kUserCookie = $null
$loginBody = @{ user_name = $AdminUser; password = $AdminPass; captchaToken = '' } | ConvertTo-Json -Compress
$loginResp = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.login" -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
foreach ($s in @($loginResp.Headers['Set-Cookie'])) {
    if ($s -match '^\s*k-user=([^;]+)') { $kUserCookie = $Matches[1]; break }
}
if (-not $kUserCookie) { throw "Cannot extract k-user cookie" }
$authHeaders = @{ 'Cookie' = "k-user=$kUserCookie" }
Write-Host "[1/6] login ok" -ForegroundColor Green

# ─── 2. SCAFFOLD chart-ready views + propsbag chart config ─────────────────────
Write-Host ""
Write-Host "[2/6] Scaffold chart-ready views + propsbag chart..." -ForegroundColor Cyan
$chartMdMap = @{}
foreach ($v in $chartViews) {
    $existing = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE md_nome_tabella = @t AND mdschemaname = @s" -Params @{ t = $v.Object; s = $v.Schema }
    if ($existing.Count -gt 0) {
        $chartMdMap[$v.Object] = [int]$existing[0].md_id
        Write-Host "  [skip] $($v.Schema).$($v.Object) — md_id=$($chartMdMap[$v.Object])" -ForegroundColor DarkGray
    } else {
        $body = @{ connection = $dataCs; connName = ''; db = $dataDb; view = $v.Object; createMenu = $false; parentMenuId = 0; provider = '' } | ConvertTo-Json -Compress
        $null = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/scaffolding.scaffoldView" -ContentType 'application/json' -Body $body -Headers $authHeaders -SkipCertificateCheck
        $rows = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE md_nome_tabella = @t AND mdschemaname = @s" -Params @{ t = $v.Object; s = $v.Schema }
        $chartMdMap[$v.Object] = [int]$rows[0].md_id
        Write-Host "  [ok] $($v.Schema).$($v.Object) scaffolded → md_id=$($chartMdMap[$v.Object])" -ForegroundColor Green
    }

    # Normalize route + display + propsbag chart config
    $propsBag = @{
        archetypes = @{
            chart = @{
                chartType    = $v.ChartType
                dataOptions  = @{
                    labelField = $v.LabelField
                    dataField  = $v.DataField
                    datasets   = @(@{ label = $v.Display; dataField = $v.DataField; labelField = $v.LabelField })
                }
            }
        }
    } | ConvertTo-Json -Depth 8 -Compress

    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__tabelle
   SET mdroutename            = @r,
       mm_display_string      = @disp,
       mdpropsbag             = @bag,
       mdserviceenableinsert  = 0,
       mdserviceenableedit    = 0,
       mdserviceenabledelete  = 0
 WHERE md_id = @md
"@ -Params @{ r = $v.Route; disp = $v.Display; bag = $propsBag; md = $chartMdMap[$v.Object] }
}

# ─── 3. LOAD TEMPLATE ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[3/6] Load template..." -ForegroundColor Cyan
$raw = Get-Content -Raw $script:templatePath
Write-Host "  [ok] template loaded ($($raw.Length) chars)" -ForegroundColor Green

# Pre-fetch tableMetadata + columnMetadata for each widget route
function Get-TableMetadata {
    param([string]$Route)
    $body = @{ route = $Route } | ConvertTo-Json -Compress
    try {
        $resp = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.getTableMetadata" -ContentType 'application/json' -Body $body -Headers $authHeaders -SkipCertificateCheck
        $tm = $resp.Content | ConvertFrom-Json -AsHashtable
        if ($tm -and $tm.ContainsKey('columnMetadata')) {
            foreach ($c in $tm.columnMetadata) { if ($c.ContainsKey('extraProps')) { $c.Remove('extraProps') | Out-Null } }
        }
        return $tm
    } catch {
        Write-Host "  [warn] getTableMetadata($Route) failed: $($_.Exception.Message)" -ForegroundColor Yellow
        return @{ tableMetadata = @{}; columnMetadata = @(); operators = @{} }
    }
}

# ─── 4. CLONE-WALK TEMPLATE → BUILD 2 DASHBOARDS ───────────────────────────────
Write-Host ""
Write-Host "[4/6] Clone-walk + substitute widgets..." -ForegroundColor Cyan

function Deep-Clone {
    # Re-parse from disk so we always have a pristine copy
    $r = Get-Content -Raw $script:templatePath
    if ($r[0] -eq [char]0xFEFF) { $r = $r.Substring(1) }
    return ,($r | ConvertFrom-Json -AsHashtable -NoEnumerate)
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

function Find-Widget-Containers {
    # Returns array of TR>TD>DIV containers in widget rows (rows 2 and 3)
    param($templateRoot)
    # templateRoot is array (preserved via -NoEnumerate): [{name:TABLE, nestedComponents:[TR_title, TR_charts, TR_lists]}]
    if ($templateRoot -isnot [array]) { $templateRoot = @($templateRoot) }
    $table = $templateRoot[0]
    if ($null -eq $table -or -not $table.ContainsKey('nestedComponents')) {
        throw "Find-Widget-Containers: TABLE root missing or has no nestedComponents (type=$($table.GetType().FullName))"
    }
    $rows = @($table.nestedComponents)  # [TR_title, TR_data1, TR_data2]
    $result = @()
    for ($i = 1; $i -lt $rows.Count; $i++) {
        $tr = $rows[$i]
        foreach ($td in @($tr.nestedComponents)) {
            # TD > DIV (widget container)
            $div = (@($td.nestedComponents))[0]
            $result += ,$div
        }
    }
    return ,$result
}

foreach ($dash in $dashboards) {
    Write-Host "  → Building $($dash.BoardRoute)..." -ForegroundColor White
    $boardClone = Deep-Clone

    # Substitute title (first SPAN)
    $titleSpans = Find-Nodes $boardClone '<span'
    $titleSpans[0].inputs.innerText = $dash.Title
    if ($titleSpans[0].inputs.ContainsKey('uniqueName')) { $titleSpans[0].inputs.uniqueName = "title_$($dash.BoardRoute)" }

    # Find widgets (4 DIV containers: 2 chart, 2 list)
    $widgets = Find-Widget-Containers $boardClone
    if ($widgets.Count -ne 4) { throw "Expected 4 widget containers, found $($widgets.Count)" }

    for ($i = 0; $i -lt 4; $i++) {
        $w = $dash.Widgets[$i]
        $widget = $widgets[$i]
        # widget structure: DIV > [SPAN title, DATASOURCE, DATAREPEATER]
        # Lookup children by tag prefix WITHOUT Where-Object pipeline (which can copy refs)
        $widgetSpan = $null; $ds = $null; $dr = $null
        for ($k = 0; $k -lt $widget.nestedComponents.Count; $k++) {
            $ch = $widget.nestedComponents[$k]
            if ($ch.tag -and $ch.tag.StartsWith('<span'))               { $widgetSpan = $ch }
            elseif ($ch.tag -and $ch.tag.StartsWith('<wuic-data-source')){ $ds = $ch }
            elseif ($ch.tag -and $ch.tag.StartsWith('<wuic-data-repeater')){ $dr = $ch }
        }

        # Substitute widget title (SPAN)
        if ($widgetSpan) {
            $widgetSpan.inputs.innerText = $w.Title
            if ($widgetSpan.inputs.Contains('uniqueName')) { $widgetSpan.inputs.uniqueName = "title_$($dash.BoardRoute)_w$i" }
        }

        # Substitute DATASOURCE
        if ($ds) {
            $ds.inputs.route = $w.Route
            if ($ds.inputs.Contains('uniqueName')) { $ds.inputs.uniqueName = "ds_$($dash.BoardRoute)_w$i" }
            $tm = Get-TableMetadata -Route $w.Route
            if ($tm) {
                $ds.inputs.metaInfo = @{
                    tableMetadata  = if ($tm.Contains('tableMetadata')) { $tm.tableMetadata } else { @{} }
                    columnMetadata = if ($tm.Contains('columnMetadata')) { $tm.columnMetadata } else { @() }
                    operators      = if ($tm.Contains('operators')) { $tm.operators } else { @{} }
                    dataTabs       = if ($tm.Contains('dataTabs')) { $tm.dataTabs } else { @() }
                    pKey           = if ($tm.Contains('pKey')) { $tm.pKey } else { 'id' }
                    hasFooter      = $false
                    editMode       = if ($tm.Contains('editMode')) { $tm.editMode } else { 'popup' }
                    nestedRoutes   = if ($tm.Contains('nestedRoutes')) { $tm.nestedRoutes } else { @() }
                    rowsPerPageOptions = if ($tm.Contains('rowsPerPageOptions')) { $tm.rowsPerPageOptions } else { @(10,20,50) }
                }
            }
        }

        # Substitute DATAREPEATER action
        if ($dr) {
            $dr.inputs.action = $w.Action
            if ($dr.inputs.Contains('uniqueName')) { $dr.inputs.uniqueName = "dr_$($dash.BoardRoute)_w$i" }
        }
    }

    $boardJson = $boardClone | ConvertTo-Json -Depth 50 -Compress

    # Upsert dom_board row
    $existing = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 id1 FROM dom_board WHERE boardroute = @r" -Params @{ r = $dash.BoardRoute }
    if ($existing.Count -gt 0) {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE dom_board SET boarddes = @d, boardcontent = @c WHERE id1 = @id" -Params @{ d = $dash.Description; c = $boardJson; id = [int]$existing[0].id1 }
        Write-Host "    [update] dom_board.$($dash.BoardRoute) (id1=$($existing[0].id1)) updated ($($boardJson.Length) chars)" -ForegroundColor Green
    } else {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "INSERT INTO dom_board (boardroute, boarddes, boardcontent) VALUES (@r, @d, @c)" -Params @{ r = $dash.BoardRoute; d = $dash.Description; c = $boardJson }
        Write-Host "    [insert] dom_board.$($dash.BoardRoute) inserted ($($boardJson.Length) chars)" -ForegroundColor Green
    }
}

# ─── 5. UPDATE WORKFORCE MENU TO POINT TO DASHBOARDS ──────────────────────────
Write-Host ""
Write-Host "[5/6] Update workforce menu to point to dashboards..." -ForegroundColor Cyan

$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__menu
   SET mm_uri_menu = '#/wf_cost_center_dashboard/dashboard',
       mm_is_visible_by_default = 1,
       mm_display_string_menu = N'Cost Center Dashboard'
 WHERE mm_nome_menu = 'workforce_cost_center'
"@

$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__menu
   SET mm_uri_menu = '#/wf_business_unit_dashboard/dashboard',
       mm_is_visible_by_default = 1,
       mm_display_string_menu = N'Business Unit Dashboard'
 WHERE mm_nome_menu = 'workforce_business_unit'
"@

# Parent Workforce group also points to dashboard
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__menu SET mm_uri_menu = '#/wf_cost_center_dashboard/dashboard' WHERE mm_nome_menu = 'workforce'"
Write-Host "  [ok] menu updated" -ForegroundColor Green

# ─── 6. INVALIDATE ─────────────────────────────────────────────────────────────
$inv = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime" -ContentType 'application/json' -Body '{}' -Headers $authHeaders -SkipCertificateCheck
Write-Host ""
Write-Host "[6/6] $($inv.Content.Substring(0, [Math]::Min(160, $inv.Content.Length)))" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Sprint 5c dashboards complete" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Dashboards:" -ForegroundColor White
Write-Host "    #/wf_cost_center_dashboard/dashboard" -ForegroundColor White
Write-Host "    #/wf_business_unit_dashboard/dashboard" -ForegroundColor White
