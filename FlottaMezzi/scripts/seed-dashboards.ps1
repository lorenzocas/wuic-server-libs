# ============================================================================
# seed-dashboards.ps1
#
# Phase 3 Liv 3: Dashboard FlottaMezzi
#  a) Scaffold metadata route per 8 VIEW aggregate
#  b) Crea route 'mezzi_mappa' con archetypes.map (riusa tabella mezzi)
#  c) Adatta 4 boardcontent FE -> 4 dashboard FlottaMezzi (route swap)
#     - home              (clone fe_home)
#     - aging_scadenze    (clone fe_aging_crediti)
#     - costi_forecast    (clone fe_cashflow_forecast)
#     - top_mezzi         (clone fe_top_clienti)
#  d) Top-level menu 'Cruscotto' + 5 leaf (home, mezzi_mappa + 3 board)
#  e) invalidateMetadataRuntime
#
# Idempotente: scaffoldView no-op se route esiste, dom_board UPSERT, menu UPSERT.
# ============================================================================
param(
    [string]$AsmxBase = 'http://localhost:5100/api/Meta/AsmxProxy',
    [string]$AppRoot  = 'C:\src\Wuic\FlottaMezzi'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Data
Add-Type -AssemblyName System.Web

# ── Helpers ──────────────────────────────────────────────────────────
function Get-ConnString { param($Path, $Name)
    $j = Get-Content $Path -Raw | ConvertFrom-Json
    return [string]$j.ConnectionStrings.$Name
}
function Get-Db { param($Cs)
    if ($Cs -match 'Initial Catalog\s*=\s*([^;]+)') { return $Matches[1].Trim() }
    if ($Cs -match 'Database\s*=\s*([^;]+)') { return $Matches[1].Trim() }
    throw "no catalog"
}
function Sql-Exec { param($Cs, $Sql, $Params = @{})
    $cn = New-Object System.Data.SqlClient.SqlConnection $Cs
    $cn.Open()
    try {
        $cmd = $cn.CreateCommand()
        $cmd.CommandText = $Sql
        $cmd.CommandTimeout = 60
        foreach ($k in $Params.Keys) {
            [void]$cmd.Parameters.AddWithValue("@$k", $Params[$k])
        }
        return $cmd.ExecuteNonQuery()
    } finally { $cn.Close() }
}
function Sql-Scalar { param($Cs, $Sql, $Params = @{})
    $cn = New-Object System.Data.SqlClient.SqlConnection $Cs
    $cn.Open()
    try {
        $cmd = $cn.CreateCommand()
        $cmd.CommandText = $Sql
        foreach ($k in $Params.Keys) {
            [void]$cmd.Parameters.AddWithValue("@$k", $Params[$k])
        }
        $v = $cmd.ExecuteScalar()
        if ($null -eq $v -or $v -is [System.DBNull]) { return $null }
        return $v
    } finally { $cn.Close() }
}

# ── Setup ────────────────────────────────────────────────────────────
$AppSettings = Join-Path $AppRoot 'appsettings.json'
$DataCs = Get-ConnString -Path $AppSettings -Name 'DataSQLConnection'
$DataDb = Get-Db -Cs $DataCs
$MetaCs = Get-ConnString -Path $AppSettings -Name 'MetaDataSQLConnection'

# Login
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginPayload = @{ user_name = 'admin'; password = 'admin' } | ConvertTo-Json -Compress
$user = Invoke-RestMethod -TimeoutSec 60 -Method Post -Uri "$AsmxBase/MetaService.login" -WebSession $session -ContentType 'application/json' -Body $loginPayload
$encodedUser = [System.Web.HttpUtility]::UrlEncode(($user | ConvertTo-Json -Compress -Depth 20))
$cookie = New-Object System.Net.Cookie('k-user', $encodedUser, '/', 'localhost')
$session.Cookies.Add($cookie)
Write-Host "Login admin OK"

# ── a) Scaffold 8 VIEW ───────────────────────────────────────────────
$views = @(
    @{ Route='vw_dash_mezzi_per_stato';        Disp='Dash Mezzi per stato' }
    @{ Route='vw_dash_scadenze_imminenti';     Disp='Dash Scadenze imminenti' }
    @{ Route='vw_aging_scadenze';              Disp='Aging Scadenze (dettaglio)' }
    @{ Route='vw_aging_scadenze_per_fascia';   Disp='Aging Scadenze per fascia' }
    @{ Route='vw_costi_storici_mensili';       Disp='Costi storici mensili' }
    @{ Route='vw_costi_forecast';              Disp='Costi forecast 90gg' }
    @{ Route='vw_top_mezzi_per_costo';         Disp='Top mezzi per costo' }
    @{ Route='vw_top_mezzi_per_km';            Disp='Top mezzi per km' }
)
Write-Host "`n=== a) Scaffold 8 VIEW ===" -ForegroundColor Cyan
foreach ($v in $views) {
    $payload = @{
        connection   = $DataCs
        connName     = ''
        db           = $DataDb
        view         = $v.Route
        createMenu   = $false
        parentMenuId = 0
    } | ConvertTo-Json -Compress
    try {
        $resp = Invoke-RestMethod -TimeoutSec 60 -Method Post -Uri "$AsmxBase/scaffolding.scaffoldView" -WebSession $session -ContentType 'application/json' -Body $payload
        Write-Host ("  {0}: {1}" -f $v.Route, ($resp | ConvertTo-Json -Compress -Depth 3).Substring(0, [Math]::Min(80, ($resp | ConvertTo-Json -Compress -Depth 3).Length)))
    } catch {
        Write-Host ("  {0} FAILED: {1}" -f $v.Route, $_.Exception.Message) -ForegroundColor Red
    }
    # Set display + archetype list (per chart tile, archetype 'chart' va aggiunto, ma per ora list base)
    [void](Sql-Exec -Cs $MetaCs -Sql @"
UPDATE dbo._metadati__tabelle
   SET mm_display_string = @disp,
       mm_long_description = @disp
 WHERE mdroutename = @r
"@ -Params @{ disp = $v.Disp; r = $v.Route })
}

# Imposta archetypes.chart per le viste destinate ai chart (bar/pie/line)
$chartConfigs = @{
    'vw_dash_mezzi_per_stato'        = @{ type='bar'; dataField='num_mezzi'; labelField='stato'; label='Mezzi per stato' }
    'vw_dash_scadenze_imminenti'     = @{ type='pie'; dataField='num_scadenze'; labelField='tipo'; label='Scadenze 30gg' }
    'vw_aging_scadenze_per_fascia'   = @{ type='bar'; dataField='num_scadenze'; labelField='fascia'; label='Aging' }
    'vw_costi_storici_mensili'       = @{ type='line'; dataField='totale'; labelField='periodo'; label='Costi storici' }
    'vw_costi_forecast'              = @{ type='line'; dataField='totale_proiettato'; labelField='periodo'; label='Forecast 90gg' }
    'vw_top_mezzi_per_costo'         = @{ type='bar'; dataField='totale_costi'; labelField='targa'; label='Top per costo' }
    'vw_top_mezzi_per_km'            = @{ type='bar'; dataField='km_percorsi'; labelField='targa'; label='Top per km' }
}
foreach ($kv in $chartConfigs.GetEnumerator()) {
    $r = $kv.Key
    $c = $kv.Value
    $bag = @{
        archetypes = @{
            chart = @{
                type = $c.type
                dataOptions = @{
                    datasets = @(@{ dataField = $c.dataField; labelField = $c.labelField; label = $c.label })
                    dataProperty = 'dato'
                }
            }
        }
    } | ConvertTo-Json -Compress -Depth 10
    [void](Sql-Exec -Cs $MetaCs -Sql "UPDATE dbo._metadati__tabelle SET mdpropsbag = @bag WHERE mdroutename = @r" -Params @{ bag = $bag; r = $r })
}
Write-Host "  archetypes.chart applicati"

# ── b) Route mezzi_mappa (riusa tabella mezzi con archetypes.map) ────
Write-Host "`n=== b) Route mezzi_mappa (archetypes.map) ===" -ForegroundColor Cyan
$mdMezzi = Sql-Scalar -Cs $MetaCs -Sql "SELECT TOP 1 md_id FROM dbo._metadati__tabelle WHERE mdroutename = N'mezzi'"
$mdMappa = Sql-Scalar -Cs $MetaCs -Sql "SELECT TOP 1 md_id FROM dbo._metadati__tabelle WHERE mdroutename = N'mezzi_mappa'"
$mapBag = '{"archetypes":{"map":{"advancedFilter":true,"center":null,"zoom":6}}}'
if ($null -eq $mdMappa) {
    # Full-row clone via SELECT * INTO #tmp pattern (tabella ha 136 cols, non elenchiamo a mano)
    [void](Sql-Exec -Cs $MetaCs -Sql @"
SELECT * INTO #t FROM dbo._metadati__tabelle WHERE mdroutename = N'mezzi';
DECLARE @newId INT = (SELECT ISNULL(MAX(md_id),0) + 1 FROM dbo._metadati__tabelle);
UPDATE #t
   SET md_id = @newId,
       mdroutename = N'mezzi_mappa',
       mdpropsbag = @bag,
       mm_display_string = N'Mappa mezzi',
       mm_long_description = N'Visualizzazione geografica dei mezzi della flotta',
       md_editable = 0, md_insertable = 0, md_deletable = 0;
INSERT INTO dbo._metadati__tabelle SELECT * FROM #t;
DROP TABLE #t;
"@ -Params @{ bag = $mapBag })
    $mdMappa = Sql-Scalar -Cs $MetaCs -Sql "SELECT TOP 1 md_id FROM dbo._metadati__tabelle WHERE mdroutename = N'mezzi_mappa'"
    Write-Host "  mezzi_mappa creata md_id=$mdMappa"
} else {
    [void](Sql-Exec -Cs $MetaCs -Sql "UPDATE dbo._metadati__tabelle SET mdpropsbag = @bag WHERE md_id = @id" -Params @{ bag = $mapBag; id = $mdMappa })
    Write-Host "  mezzi_mappa esistente md_id=$mdMappa, propsbag aggiornato"
}

# Clona _metadati__colonne da mezzi -> mezzi_mappa via SELECT * INTO #c, drop mc_id, INSERT con dynamic column list
$existCol = Sql-Scalar -Cs $MetaCs -Sql "SELECT COUNT(*) FROM dbo._metadati__colonne WHERE md_id = @id" -Params @{ id = $mdMappa }
if ([int]$existCol -eq 0) {
    # Build column list (excluding mc_id IDENTITY) outside dynamic SQL
    $colsList = Sql-Scalar -Cs $MetaCs -Sql @"
SELECT STUFF((
  SELECT ', ' + QUOTENAME(name)
    FROM sys.columns
   WHERE object_id = OBJECT_ID('dbo._metadati__colonne')
     AND is_identity = 0 AND is_computed = 0
   ORDER BY column_id
   FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
"@
    if ([string]::IsNullOrWhiteSpace($colsList)) { throw "column list empty" }
    $sqlClone = "SELECT $colsList INTO #c FROM dbo._metadati__colonne WHERE md_id = @src; UPDATE #c SET md_id = @dst; INSERT INTO dbo._metadati__colonne ($colsList) SELECT $colsList FROM #c; DROP TABLE #c;"
    [void](Sql-Exec -Cs $MetaCs -Sql $sqlClone -Params @{ src = $mdMezzi; dst = $mdMappa })
    Write-Host "  colonne clonate per mezzi_mappa"
}

# ── c) Adatta 4 boardcontent FE ──────────────────────────────────────
Write-Host "`n=== c) Adatta 4 boardcontent FE ===" -ForegroundColor Cyan

# Cache metaInfo per route (evita ri-fetchare la stessa route)
$script:MetaInfoCache = @{}

function Get-MetaInfoForRoute { param($Route)
    if ($script:MetaInfoCache.ContainsKey($Route)) { return $script:MetaInfoCache[$Route] }
    try {
        # MetaService.getTableMetadata firma: route, lookup_table_id, user_id, dm (dataMode 1=view,2=edit)
        $payload = @{ route = $Route; lookup_table_id = 0; user_id = ''; dm = 1 } | ConvertTo-Json -Compress
        $resp = Invoke-RestMethod -TimeoutSec 30 -Method Post -Uri "$AsmxBase/MetaService.getTableMetadata" -WebSession $session -ContentType 'application/json' -Body $payload
        if (-not $resp -or -not $resp.columnMetadata -or $resp.columnMetadata.Count -eq 0) {
            Write-Host ("  [warn] getTableMetadata({0}): no columnMetadata" -f $Route) -ForegroundColor Yellow
            return $null
        }
        # Estrai tableMetadata dal primo column._Metadati_Tabelle (pattern client framework).
        # Rimuovi extraProps (AGENTS regola 7: serializzare md_props_bag, non extraProps).
        $tm = $resp.columnMetadata[0]._Metadati_Tabelle
        $tableMeta = [ordered]@{}
        if ($tm) {
            foreach ($p in $tm.PSObject.Properties) {
                if ($p.Name -eq 'extraProps') { continue }
                $tableMeta[$p.Name] = $p.Value
            }
        }
        # `metaInfo` deve includere `operators: {}` (mappa { colName -> defaultOperator })
        # popolato a runtime da DataSourceComponent. Senza, il framework crasha con
        # "TypeError: Cannot set properties of undefined (setting 'id')" alla linea
        # `this.metaInfo.operators[col.mc_nome_colonna] = ...` (data-source.component.ts ~4509).
        # Il render del board fallisce silenziosamente (DOM presenti ma invisibili).
        $info = [pscustomobject]@{
            tableMetadata = [pscustomobject]$tableMeta
            columnMetadata = $resp.columnMetadata
            operators = [pscustomobject]@{}
        }
        $script:MetaInfoCache[$Route] = $info
        return $info
    } catch {
        Write-Host ("  [warn] getTableMetadata({0}) FAILED: {1}" -f $Route, $_.Exception.Message) -ForegroundColor Yellow
        return $null
    }
}

function Walk-And-Adapt { param($node, $routeMap, $newTitle)
    if ($null -eq $node) { return }
    if ($node -is [System.Object[]] -or $node -is [System.Array]) {
        foreach ($n in $node) { Walk-And-Adapt $n $routeMap $newTitle }
        return
    }
    if ($node -isnot [System.Management.Automation.PSCustomObject]) { return }

    # DATASOURCE: swap route + popola metaInfo via getTableMetadata sulla nuova route
    if ($node.PSObject.Properties['name'] -and $node.name -eq 'DATASOURCE') {
        if ($node.PSObject.Properties['inputs'] -and $node.inputs -and $node.inputs.PSObject.Properties['route']) {
            $oldR = [string]$node.inputs.route
            $newR = $oldR
            if ($routeMap.ContainsKey($oldR)) {
                $newR = $routeMap[$oldR]
                $node.inputs.route = $newR
            }
            # Popola metaInfo SOLO in inputs.metaInfo (verificato 2026-05-09 FlottaMezzi:
            # nei boardcontent FE source `metaInfo` e' sempre dentro inputs, MAI al
            # top-level del node. Mettendolo top-level il framework prova a passarlo
            # come @Input al template Dynamic_DynamicDashboardTemplateComponent_N che
            # non lo dichiara -> NG0303 + render fallisce silenziosamente).
            $info = Get-MetaInfoForRoute -Route $newR
            if ($info) {
                if ($node.inputs.PSObject.Properties['metaInfo']) {
                    $node.inputs.metaInfo = $info
                } else {
                    $node.inputs | Add-Member -NotePropertyName 'metaInfo' -NotePropertyValue $info
                }
            }
        }
    }

    # SPAN with innerText -> swap titolo (heuristic: primo SPAN bold + fontSize >= 24px)
    if ($node.PSObject.Properties['name'] -and $node.name -eq 'SPAN') {
        if ($node.PSObject.Properties['inputs'] -and $node.inputs -and $node.inputs.PSObject.Properties['innerText']) {
            if ($node.inputs.PSObject.Properties['fontSize'] -and $node.inputs.PSObject.Properties['fontWeight']) {
                $sz = [string]$node.inputs.fontSize
                $wt = [string]$node.inputs.fontWeight
                if ($wt -match '700|800|900|bold' -and $sz -match '(2[4-9]|[3-9][0-9]|1[0-9][0-9])px') {
                    if (-not $script:TitleSwapped) {
                        $node.inputs.innerText = $newTitle
                        $script:TitleSwapped = $true
                    }
                }
            }
        }
    }

    # Recurse on all properties
    foreach ($p in $node.PSObject.Properties) {
        if ($p.Value -is [System.Object[]] -or $p.Value -is [System.Array] -or $p.Value -is [System.Management.Automation.PSCustomObject]) {
            Walk-And-Adapt $p.Value $routeMap $newTitle
        }
    }
}

function Adapt-Board { param($SrcFile, $TargetRoute, $TargetTitle, $RouteMap)
    Write-Host ("  Adapting {0} -> {1}" -f (Split-Path $SrcFile -Leaf), $TargetRoute) -ForegroundColor Yellow
    $jsonText = [System.IO.File]::ReadAllText($SrcFile)
    # AGENTS regola 6: dom_board.boardcontent DEVE essere array JSON (top-level [...]).
    # PowerShell ConvertFrom-Json unwrappa array di lunghezza 1 a oggetto singolo.
    # Forzo coercion ad array con la virgola unaria PRIMA di ConvertTo-Json,
    # altrimenti il framework Angular vede un oggetto, fa !Array.isArray()=true,
    # cerca .dashboardElements/.elements (assenti) e carica [] vuoto -> dashboard vuota.
    $parsed = $jsonText | ConvertFrom-Json -Depth 50
    $arr = if ($parsed -is [array]) { $parsed } else { @($parsed) }
    $script:TitleSwapped = $false
    Walk-And-Adapt $arr $RouteMap $TargetTitle
    # Force refresh: cancello prima la riga esistente per forzare re-INSERT con nuovo metaInfo
    $exists = Sql-Scalar -Cs $MetaCs -Sql "SELECT TOP 1 id1 FROM dbo.dom_board WHERE boardroute = @r" -Params @{ r = $TargetRoute }
    if ($null -ne $exists) {
        [void](Sql-Exec -Cs $MetaCs -Sql "DELETE FROM dbo.dom_board WHERE boardroute = @r" -Params @{ r = $TargetRoute })
    }
    # ConvertTo-Json + pipeline unwrappa array length=1 a oggetto. Uso `-AsArray` (PS7+)
    # per forzare serializzazione array anche con singolo elemento.
    $newJson = ConvertTo-Json -InputObject $arr -Compress -Depth 50 -AsArray

    # UPSERT dom_board
    $exists = Sql-Scalar -Cs $MetaCs -Sql "SELECT TOP 1 id1 FROM dbo.dom_board WHERE boardroute = @r" -Params @{ r = $TargetRoute }
    if ($null -eq $exists) {
        [void](Sql-Exec -Cs $MetaCs -Sql "INSERT INTO dbo.dom_board (boardroute, boarddes, boardcontent) VALUES (@r, @d, @c)" -Params @{ r = $TargetRoute; d = $TargetTitle; c = $newJson })
        Write-Host ("    INSERTED dom_board.{0} ({1} bytes)" -f $TargetRoute, $newJson.Length) -ForegroundColor Green
    } else {
        [void](Sql-Exec -Cs $MetaCs -Sql "UPDATE dbo.dom_board SET boarddes = @d, boardcontent = @c WHERE boardroute = @r" -Params @{ r = $TargetRoute; d = $TargetTitle; c = $newJson })
        Write-Host ("    UPDATED dom_board.{0} ({1} bytes)" -f $TargetRoute, $newJson.Length) -ForegroundColor Green
    }
}

$tplDir = Join-Path $AppRoot 'dbms\templates'

Adapt-Board -SrcFile "$tplDir\fe_home.boardcontent.json" -TargetRoute 'home' -TargetTitle 'Cruscotto FlottaMezzi' -RouteMap @{
    'fatture_ricevute'             = 'rifornimenti'
    'preventivi'                   = 'manutenzioni'
    'vw_dash_fatture_per_stato'    = 'vw_dash_mezzi_per_stato'
    'vw_dash_scadenze_per_stato'   = 'vw_dash_scadenze_imminenti'
}

Adapt-Board -SrcFile "$tplDir\fe_aging_crediti.boardcontent.json" -TargetRoute 'aging_scadenze' -TargetTitle 'Aging scadenze' -RouteMap @{
    'vw_aging_crediti_clienti' = 'vw_aging_scadenze'
    'vw_aging_crediti_totali'  = 'vw_aging_scadenze_per_fascia'
}

Adapt-Board -SrcFile "$tplDir\fe_cashflow_forecast.boardcontent.json" -TargetRoute 'costi_forecast' -TargetTitle 'Forecast costi' -RouteMap @{
    'vw_cashflow_giornaliero' = 'vw_costi_storici_mensili'
    'vw_cashflow_totali'      = 'vw_costi_forecast'
}

Adapt-Board -SrcFile "$tplDir\fe_top_clienti.boardcontent.json" -TargetRoute 'top_mezzi' -TargetTitle 'Top mezzi' -RouteMap @{
    'vw_top_clienti_anno'    = 'vw_top_mezzi_per_costo'
    'vw_top_clienti_totali'  = 'vw_top_mezzi_per_km'
}

# ── d) Top-level menu Cruscotto + 5 leaf ─────────────────────────────
Write-Host "`n=== d) Menu Cruscotto + 5 dashboard ===" -ForegroundColor Cyan
[void](Sql-Exec -Cs $MetaCs -Sql @"
DECLARE @cr_id INT, @nextId INT;

SELECT @cr_id = mm_id FROM dbo._metadati__menu WHERE mm_parent_id IS NULL AND mm_nome_menu = N'flotta_cruscotto';
IF @cr_id IS NULL
BEGIN
    SELECT @nextId = ISNULL(MAX(mm_id), 0) + 1 FROM dbo._metadati__menu;
    INSERT INTO dbo._metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mm_parent_id, mmordine, mm_is_visible_by_default, mm_uri_menu, mm_icon)
    VALUES (@nextId, N'flotta_cruscotto', N'Cruscotto', NULL, 5, 1, NULL, N'pi pi-chart-bar');
    SET @cr_id = @nextId;
END

DECLARE @leafs TABLE (nome NVARCHAR(80), display NVARCHAR(150), uri NVARCHAR(200), ord INT, icon NVARCHAR(50));
INSERT INTO @leafs VALUES
    (N'flotta_dash_home',      N'Home',           N'#/home/dashboard',           10, N'pi pi-home'),
    (N'flotta_dash_mappa',     N'Mappa mezzi',    N'#/mezzi_mappa/list',         20, N'pi pi-map'),
    (N'flotta_dash_aging',     N'Aging scadenze', N'#/aging_scadenze/dashboard', 30, N'pi pi-calendar'),
    (N'flotta_dash_costi',     N'Forecast costi', N'#/costi_forecast/dashboard', 40, N'pi pi-chart-line'),
    (N'flotta_dash_top',       N'Top mezzi',      N'#/top_mezzi/dashboard',      50, N'pi pi-chart-bar');

DECLARE @nome NVARCHAR(80), @disp NVARCHAR(150), @uri NVARCHAR(200), @ord INT, @icon NVARCHAR(50);
DECLARE leaf_cur CURSOR LOCAL FAST_FORWARD FOR SELECT nome, display, uri, ord, icon FROM @leafs;
OPEN leaf_cur;
FETCH NEXT FROM leaf_cur INTO @nome, @disp, @uri, @ord, @icon;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF EXISTS (SELECT 1 FROM dbo._metadati__menu WHERE mm_nome_menu = @nome)
    BEGIN
        UPDATE dbo._metadati__menu SET mm_display_string_menu = @disp, mm_uri_menu = @uri,
            mm_parent_id = @cr_id, mmordine = @ord, mm_is_visible_by_default = 1, mm_icon = @icon
         WHERE mm_nome_menu = @nome;
    END ELSE BEGIN
        SELECT @nextId = ISNULL(MAX(mm_id), 0) + 1 FROM dbo._metadati__menu;
        INSERT INTO dbo._metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mm_parent_id, mmordine, mm_is_visible_by_default, mm_uri_menu, mm_icon)
        VALUES (@nextId, @nome, @disp, @cr_id, @ord, 1, @uri, @icon);
    END
    FETCH NEXT FROM leaf_cur INTO @nome, @disp, @uri, @ord, @icon;
END
CLOSE leaf_cur; DEALLOCATE leaf_cur;
"@ -Params @{})
Write-Host "  Cruscotto + 5 leaf upserted"

# ── e) Invalidate ────────────────────────────────────────────────────
Write-Host ""
[void](Invoke-RestMethod -TimeoutSec 60 -Method Post -Uri "$AsmxBase/MetaService.invalidateMetadataRuntime" -WebSession $session -ContentType 'application/json' -Body '{}')
$ver = Invoke-RestMethod -TimeoutSec 60 -Method Post -Uri "$AsmxBase/MetaService.getProjectMetadataVersion" -WebSession $session -ContentType 'application/json' -Body '{}'
Write-Host ("invalidate OK, projectMetadataVersion: {0}" -f $ver) -ForegroundColor Green

Write-Host "`n=== Phase 3 Liv 3 completata ===" -ForegroundColor Cyan
