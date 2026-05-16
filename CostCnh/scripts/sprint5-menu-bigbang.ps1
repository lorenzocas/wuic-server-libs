<#
.SYNOPSIS
  Sprint 5 (CostCnh) — Menu big-bang: scaffold delle 8 tabelle mancanti
  (custom_value, fte_hours, hours_currency, exchange_rate, supplier_rate,
  resource_calendar, resource_manager, audit.access_log) + creazione dell'intero
  albero menu specchio di `C:\src\Cost_CNH\CostPlanning\Views\Shared\Menu_OffHighway.json`
  con 5 gruppi top e ~25 voci foglia.

  Idempotente: voci esistenti vengono UPDATE-ate, mancanti INSERT-ate.
  Voci che puntano a route ancora-non-implementate (es. workforce/allocation,
  uploads/massive, planning/edit) sono inserite con `mm_is_visible_by_default=0`
  fino allo Sprint corrispondente.

.EXAMPLE
  pwsh -ExecutionPolicy Bypass -File scripts/sprint5-menu-bigbang.ps1
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

# ─── 8 tabelle/viste da scaffoldare in questo run ─────────────────────────────
$objects = @(
    @{ Schema='core';  Object='custom_value';      Route='custom_values';        Display='Custom Values';      LongDesc='Attributi custom EAV per qualsiasi entita';   IsView=$false },
    @{ Schema='cp';    Object='fte_hours';         Route='fte_hours';            Display='FTE → Hours';         LongDesc='Conversione FTE → ore per ruolo/anno';        IsView=$false },
    @{ Schema='cp';    Object='hours_currency';    Route='hours_currency';       Display='Hours → Currency';    LongDesc='Tariffa oraria per valuta/anno';              IsView=$false },
    @{ Schema='cp';    Object='exchange_rate';     Route='exchange_rates';       Display='Exchange Rates';      LongDesc='Tassi di cambio cross-valuta';                IsView=$false },
    @{ Schema='cp';    Object='supplier_rate';     Route='supplier_rates';       Display='Supplier Rates';      LongDesc='Tariffe fornitori per anno';                  IsView=$false },
    @{ Schema='cp';    Object='resource_calendar'; Route='resource_calendars';   Display='Resources Calendar';  LongDesc='Giorni lavorativi per site/anno';             IsView=$false },
    @{ Schema='core';  Object='resource_manager';  Route='resource_managers';    Display='Resource Manager';    LongDesc='Manager → risorsa → scope program/site';      IsView=$false },
    @{ Schema='audit'; Object='access_log';        Route='history_log';          Display='History Log';         LongDesc='Audit trail accessi e modifiche';             IsView=$false; ReadOnly=$true }
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
        foreach ($k in $Params.Keys) { $null = $cmd.Parameters.AddWithValue("@$k", $Params[$k]) }
        return $cmd.ExecuteNonQuery()
    } finally { $conn.Close() }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Sprint 5 — CostCnh menu big-bang + 8 scaffolds" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# ─── 1. LOGIN ──────────────────────────────────────────────────────────────────
Write-Host "[1/6] Login..." -ForegroundColor Cyan
$kUserCookie = $null
$loginBody = @{ user_name = $AdminUser; password = $AdminPass; captchaToken = '' } | ConvertTo-Json -Compress
$loginResp = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.login" -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
foreach ($s in @($loginResp.Headers['Set-Cookie'])) {
    if ($s -match '^\s*k-user=([^;]+)') { $kUserCookie = $Matches[1]; break }
}
if (-not $kUserCookie) { throw "Cannot extract k-user cookie" }
Write-Host "  [ok] login (cookie length=$($kUserCookie.Length))" -ForegroundColor Green
$authHeaders = @{ 'Cookie' = "k-user=$kUserCookie" }

# ─── 2. SCAFFOLD ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[2/6] Scaffold $($objects.Count) objects..." -ForegroundColor Cyan
foreach ($o in $objects) {
    $existing = Invoke-Sql -ConnString $metaCs -Query @"
SELECT TOP 1 md_id FROM _metadati__tabelle
 WHERE md_nome_tabella = @t AND mdschemaname = @s
"@ -Params @{ t = $o.Object; s = $o.Schema }
    if ($existing.Count -gt 0) {
        Write-Host "  [skip] $($o.Schema).$($o.Object) — md_id=$($existing[0].md_id)" -ForegroundColor DarkGray
        continue
    }
    $body = @{ connection = $dataCs; connName = ''; db = $dataDb; table = $o.Object; createMenu = $false; parentMenuId = 0; schema = $o.Schema; provider = '' } | ConvertTo-Json -Compress
    try {
        $resp = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/scaffolding.scaffoldTable" -ContentType 'application/json' -Body $body -Headers $authHeaders -SkipCertificateCheck
        Write-Host "  [ok] $($o.Schema).$($o.Object) scaffolded" -ForegroundColor Green
    } catch {
        $err = $_.Exception.Message
        if ($_.Exception.Response -ne $null) {
            try { $err = (New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch {}
        }
        Write-Host "  [FAIL] $($o.Schema).$($o.Object) → $err" -ForegroundColor Red
        throw
    }
}

# ─── 3. RESOLVE md_id + normalize routes + patch flags ─────────────────────────
Write-Host ""
Write-Host "[3/6] Resolve md_id + normalize routes + patch metadata..." -ForegroundColor Cyan
$mdMap = @{}
foreach ($o in $objects) {
    $rows = Invoke-Sql -ConnString $metaCs -Query @"
SELECT TOP 1 md_id, mdroutename FROM _metadati__tabelle
 WHERE md_nome_tabella = @t AND mdschemaname = @s
"@ -Params @{ t = $o.Object; s = $o.Schema }
    if ($rows.Count -eq 0) { throw "Cannot resolve md_id for $($o.Schema).$($o.Object)" }
    $mdMap[$o.Object] = [int]$rows[0].md_id

    if ($rows[0].mdroutename -ne $o.Route) {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__tabelle SET mdroutename = @r WHERE md_id = @md" -Params @{ r = $o.Route; md = $mdMap[$o.Object] }
    }
    Write-Host "  $($o.Schema).$($o.Object) → md_id=$($mdMap[$o.Object]) route=$($o.Route)" -ForegroundColor White

    $isReadOnly = if ($o.ContainsKey('ReadOnly')) { [bool]$o.ReadOnly } else { $false }

    if (-not $isReadOnly) {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__tabelle
   SET mdhaslogicdelete             = 1,
       mdloggingenable              = 1,
       mdlogginginsertdatefieldname = 'data_creazione',
       mdlogginginsertuserfieldname = 'utente_creazione',
       mdlogginglastmoddatefieldname= 'data_modifica',
       mdlogginglastmoduserfieldname= 'utente_modifica',
       mdloggingdeletedatefieldname = 'data_eliminazione',
       mdloggingdeleteuserfieldname = 'utente_eliminazione',
       mm_display_string            = @disp,
       mm_long_description          = @longdesc
 WHERE md_id = @md
"@ -Params @{ md = $mdMap[$o.Object]; disp = $o.Display; longdesc = $o.LongDesc }

        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__colonne SET mcislogicdeletekey = 1 WHERE md_id = @md AND mc_nome_colonna = 'cancellato'" -Params @{ md = $mdMap[$o.Object] }

        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mchideinlist = 1, mchideinedit = 1, mc_logic_editable = 0
 WHERE md_id = @md
   AND mc_nome_colonna IN ('cancellato','data_creazione','data_modifica','data_eliminazione','utente_creazione','utente_modifica','utente_eliminazione','sys_start','sys_end','public_id')
"@ -Params @{ md = $mdMap[$o.Object] }
    } else {
        # audit.access_log: read-only (append-only); disable insert/edit/delete dal CRUD UI
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__tabelle
   SET mm_display_string   = @disp,
       mm_long_description = @longdesc,
       mdserviceenableinsert = 0,
       mdserviceenableedit   = 0,
       mdserviceenabledelete = 0
 WHERE md_id = @md
"@ -Params @{ md = $mdMap[$o.Object]; disp = $o.Display; longdesc = $o.LongDesc }
    }
}

# ─── 4. LOOKUP WIRING ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[4/6] Lookup wiring..." -ForegroundColor Cyan
$lookups = @(
    @{ Src='hours_currency';    Col='currency_id';      Target='currencies'; DisplayCol='name' },
    @{ Src='exchange_rate';     Col='from_currency_id'; Target='currencies'; DisplayCol='name' },
    @{ Src='exchange_rate';     Col='to_currency_id';   Target='currencies'; DisplayCol='name' },
    @{ Src='supplier_rate';     Col='currency_id';      Target='currencies'; DisplayCol='name' },
    @{ Src='resource_calendar'; Col='site_id';          Target='sites';      DisplayCol='name' },
    @{ Src='resource_manager';  Col='scope_program_id'; Target='programs';   DisplayCol='code' },
    @{ Src='resource_manager';  Col='scope_site_id';    Target='sites';      DisplayCol='name' }
)
foreach ($lk in $lookups) {
    if (-not $mdMap.ContainsKey($lk.Src)) { continue }
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mc_ui_column_type        = 'lookupByID',
       mcuilookupentityname     = @tgt,
       mcuilookupdata_value_field = 'id',
       mcuilookupdata_text_field  = @disp,
       voa_class                = 2
 WHERE md_id = @md AND mc_nome_colonna = @col
"@ -Params @{ md = $mdMap[$lk.Src]; col = $lk.Col; tgt = $lk.Target; disp = $lk.DisplayCol }
    Write-Host "  [ok] $($lk.Src).$($lk.Col) → lookup($($lk.Target).$($lk.DisplayCol))" -ForegroundColor Green
}

# ─── 5. MENU BIG-BANG ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[5/6] Menu big-bang (mirror Menu_OffHighway.json)..." -ForegroundColor Cyan

# Wipe esistenti CostCnh entries (preserve framework ones) — riconoscibili dai
# 2 gruppi creati negli Sprint 1-2 (anagrafiche, pianificazione)
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
DELETE FROM _metadati__menu
 WHERE mm_nome_menu IN ('anagrafiche','pianificazione','planning','workforce','reporting','masterdata','administration_costcnh')
   OR mm_parent_id IN (SELECT mm_id FROM _metadati__menu WHERE mm_nome_menu IN ('anagrafiche','pianificazione','planning','workforce','reporting','masterdata','administration_costcnh'))
"@
Write-Host "  [info] cleared old CostCnh menu entries" -ForegroundColor DarkGray

function Get-NextMenuId {
    $rows = Invoke-Sql -ConnString $metaCs -Query "SELECT ISNULL(MAX(mm_id), 0) + 1 AS nextId FROM _metadati__menu"
    return [int]$rows[0].nextId
}

function Insert-Menu {
    param(
        [string]$Key,
        [string]$Display,
        [int]$ParentId,
        [int]$Order,
        [string]$Uri = $null,
        [Nullable[int]]$MdId = $null,
        [bool]$Visible = $true,
        [string]$Icon = $null
    )
    $newId = Get-NextMenuId
    $visBit = if ($Visible) { 1 } else { 0 }
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
INSERT INTO _metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mmordine, mm_parent_id, mm_uri_menu, mm_is_visible_by_default, mdid, mm_icon)
VALUES (@id, @k, @d, @o, @p, @u, @v, @md, @ic)
"@ -Params @{
        id = $newId; k = $Key; d = $Display; o = $Order; p = $ParentId
        u  = (if-null $Uri ([DBNull]::Value))
        v  = $visBit
        md = (if-null $MdId ([DBNull]::Value))
        ic = (if-null $Icon ([DBNull]::Value))
    }
    return $newId
}

function if-null { param($v, $fallback) if ($null -eq $v) { return $fallback } else { return $v } }

# ─── Group 1: PLANNING ───────────────────────────────────────────────────────
$g_planning = Insert-Menu -Key 'planning' -Display 'Planning' -ParentId 0 -Order 100 -Uri '#/projects/list' -MdId $null -Visible $true -Icon 'pi pi-th-large'
$g_planning_worktasks = Insert-Menu -Key 'planning_worktasks' -Display 'Worktasks' -ParentId $g_planning -Order 10 -Uri '#/projects/list'
$null = Insert-Menu -Key 'planning_worktasks_list'     -Display 'Lista progetti'      -ParentId $g_planning_worktasks -Order 10 -Uri '#/projects/list' -MdId 4713
$null = Insert-Menu -Key 'planning_worktasks_planning' -Display 'Planning (PowerEdit)' -ParentId $g_planning_worktasks -Order 20 -Uri '#/planning/edit' -Visible $false  # Sprint 4-8

$g_planning_massup = Insert-Menu -Key 'planning_massive_upload' -Display 'Massive Upload' -ParentId $g_planning -Order 20 -Uri '#/uploads/massive' -Visible $false  # Sprint 6
$null = Insert-Menu -Key 'planning_massive_upload_list' -Display 'Carica xlsx' -ParentId $g_planning_massup -Order 10 -Uri '#/uploads/massive' -Visible $false

# ─── Group 2: WORKFORCE ──────────────────────────────────────────────────────
$g_workforce = Insert-Menu -Key 'workforce' -Display 'Workforce' -ParentId 0 -Order 200 -Uri '#/workforce/cost-center' -Visible $false -Icon 'pi pi-users'  # Sprint 5
$null = Insert-Menu -Key 'workforce_allocation'  -Display 'Worktask View'      -ParentId $g_workforce -Order 10 -Uri '#/workforce/allocation'  -Visible $false
$null = Insert-Menu -Key 'workforce_cost_center' -Display 'Cost Center View'   -ParentId $g_workforce -Order 20 -Uri '#/workforce/cost-center' -Visible $false
$null = Insert-Menu -Key 'workforce_business_unit' -Display 'Business Unit View' -ParentId $g_workforce -Order 30 -Uri '#/workforce/business-unit' -Visible $false

# ─── Group 3: REPORTING ──────────────────────────────────────────────────────
$g_reporting = Insert-Menu -Key 'reporting' -Display 'Reporting' -ParentId 0 -Order 300 -Uri '#/reports/list' -Visible $false -Icon 'pi pi-chart-bar'  # Sprint 6-7
$null = Insert-Menu -Key 'reporting_list'        -Display 'Reports'      -ParentId $g_reporting -Order 10 -Uri '#/reports/list' -Visible $false
$null = Insert-Menu -Key 'reporting_history_log' -Display 'History Log'  -ParentId $g_reporting -Order 20 -Uri '#/history_log/list' -MdId $mdMap['access_log']

# ─── Group 4: MASTERDATA ─────────────────────────────────────────────────────
$g_masterdata = Insert-Menu -Key 'masterdata' -Display 'Masterdata' -ParentId 0 -Order 400 -Uri '#/custom_values/list' -Visible $true -Icon 'pi pi-database'

$g_md_custom = Insert-Menu -Key 'masterdata_custom_values' -Display 'Custom Values' -ParentId $g_masterdata -Order 10 -Uri '#/custom_values/list'
$null = Insert-Menu -Key 'masterdata_custom_values_list' -Display 'Lista' -ParentId $g_md_custom -Order 10 -Uri '#/custom_values/list' -MdId $mdMap['custom_value']

$g_md_xbs = Insert-Menu -Key 'masterdata_xbs_editor' -Display 'Structure Editor (XBS)' -ParentId $g_masterdata -Order 20 -Uri '#/xbs_nodes/list'
$null = Insert-Menu -Key 'masterdata_xbs_kinds' -Display 'Tipologie albero' -ParentId $g_md_xbs -Order 10 -Uri '#/xbs_tree_kinds/list' -MdId 4715
$null = Insert-Menu -Key 'masterdata_xbs_nodes' -Display 'Nodi XBS/WBS'     -ParentId $g_md_xbs -Order 20 -Uri '#/xbs_nodes/list'      -MdId 4716

$g_md_scen = Insert-Menu -Key 'masterdata_scenarios' -Display 'Scenarios' -ParentId $g_masterdata -Order 30 -Uri '#/project_scenarios/list'
$null = Insert-Menu -Key 'masterdata_scenarios_list'      -Display 'Lista scenari'       -ParentId $g_md_scen -Order 10 -Uri '#/project_scenarios/list' -MdId 4711
$null = Insert-Menu -Key 'masterdata_scenarios_workforce' -Display 'Workforce Scenarios' -ParentId $g_md_scen -Order 20 -Uri '#/scenarios/workforce' -Visible $false  # Sprint 5
$null = Insert-Menu -Key 'masterdata_scenarios_baseline'  -Display 'Baseline Scenarios'  -ParentId $g_md_scen -Order 30 -Uri '#/scenarios/baseline'  -Visible $false  # Sprint 7

$g_md_rates = Insert-Menu -Key 'masterdata_rates' -Display 'Rates' -ParentId $g_masterdata -Order 40 -Uri '#/fte_hours/list'
$null = Insert-Menu -Key 'masterdata_rates_fte'       -Display 'FTE → Hours'         -ParentId $g_md_rates -Order 10 -Uri '#/fte_hours/list'           -MdId $mdMap['fte_hours']
$null = Insert-Menu -Key 'masterdata_rates_hourscur'  -Display 'Hours → Currency'    -ParentId $g_md_rates -Order 20 -Uri '#/hours_currency/list'      -MdId $mdMap['hours_currency']
$null = Insert-Menu -Key 'masterdata_rates_exchange'  -Display 'Exchange Rates'      -ParentId $g_md_rates -Order 30 -Uri '#/exchange_rates/list'      -MdId $mdMap['exchange_rate']
$null = Insert-Menu -Key 'masterdata_rates_supplier'  -Display 'Supplier Rates'      -ParentId $g_md_rates -Order 40 -Uri '#/supplier_rates/list'      -MdId $mdMap['supplier_rate']
$null = Insert-Menu -Key 'masterdata_rates_calendar'  -Display 'Resources Calendar'  -ParentId $g_md_rates -Order 50 -Uri '#/resource_calendars/list'  -MdId $mdMap['resource_calendar']

$g_md_anag = Insert-Menu -Key 'masterdata_anagrafica' -Display 'Anagrafica base' -ParentId $g_masterdata -Order 50 -Uri '#/sites/list'
$null = Insert-Menu -Key 'masterdata_anag_sites'    -Display 'Stabilimenti'       -ParentId $g_md_anag -Order 10 -Uri '#/sites/list'             -MdId 4707
$null = Insert-Menu -Key 'masterdata_anag_curr'     -Display 'Valute'             -ParentId $g_md_anag -Order 20 -Uri '#/currencies/list'        -MdId 4708
$null = Insert-Menu -Key 'masterdata_anag_status'   -Display 'Stati programma'    -ParentId $g_md_anag -Order 30 -Uri '#/program_statuses/list'  -MdId 4709
$null = Insert-Menu -Key 'masterdata_anag_class'    -Display 'Classi progetto'    -ParentId $g_md_anag -Order 40 -Uri '#/project_classes/list'   -MdId 4710
$null = Insert-Menu -Key 'masterdata_anag_program'  -Display 'Programmi'          -ParentId $g_md_anag -Order 50 -Uri '#/programs/list'          -MdId 4712
$null = Insert-Menu -Key 'masterdata_anag_init'     -Display 'Iniziative'         -ParentId $g_md_anag -Order 60 -Uri '#/initiatives/list'       -MdId 4714

# ─── Group 5: ADMINISTRATION (CostCnh-specific) ──────────────────────────────
# Le voci Groups/Users/Roles/Settings/Platform Permissions sono fornite dal
# framework WUIC con menu entries gia' presenti nei metadata clonati.
# Aggiungiamo solo "Resource Manager" che e' CostCnh-specific.
$g_admin = Insert-Menu -Key 'administration_costcnh' -Display 'Resource Manager' -ParentId 0 -Order 500 -Uri '#/resource_managers/list' -Visible $true -Icon 'pi pi-cog'
$null = Insert-Menu -Key 'administration_resource_manager' -Display 'Lista' -ParentId $g_admin -Order 10 -Uri '#/resource_managers/list' -MdId $mdMap['resource_manager']

Write-Host "  [ok] 5 top groups + ~28 sub-entries inserted" -ForegroundColor Green

# ─── 6. INVALIDATE METADATA RUNTIME ────────────────────────────────────────────
Write-Host ""
Write-Host "[6/6] invalidateMetadataRuntime..." -ForegroundColor Cyan
$inv = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime" -ContentType 'application/json' -Body '{}' -Headers $authHeaders -SkipCertificateCheck
Write-Host "  [ok] $($inv.Content.Substring(0, [Math]::Min(160, $inv.Content.Length)))" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Sprint 5 menu big-bang complete" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
