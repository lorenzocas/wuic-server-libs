<#
.SYNOPSIS
  Sprint 5b — Workforce metadata scaffolding + activate menu entries.
  Scaffolda 4 tabelle (wf.role, wf.cost_center, wf.resource, wf.allocation)
  + 3 viste (vw_cost_center_summary, vw_business_unit_summary, vw_allocation_detail).
  Aggiorna le 3 voci di menu Workforce a puntare alle viste + visible=1.
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

# 4 tables + 3 views
$objects = @(
    @{ Schema='wf'; Object='role';                      Route='wf_roles';                   Display='Ruoli';                LongDesc='Ruoli/posizioni delle risorse';                      IsView=$false; ReadOnly=$false },
    @{ Schema='wf'; Object='cost_center';               Route='wf_cost_centers';            Display='Centri di costo';      LongDesc='Centri di costo aziendali';                          IsView=$false; ReadOnly=$false },
    @{ Schema='wf'; Object='resource';                  Route='wf_resources';               Display='Risorse';              LongDesc='Anagrafica risorse umane';                           IsView=$false; ReadOnly=$false },
    @{ Schema='wf'; Object='allocation';                Route='wf_allocations';             Display='Allocazioni';          LongDesc='Allocazioni FTE per risorsa/progetto/mese';          IsView=$false; ReadOnly=$false },
    @{ Schema='wf'; Object='vw_cost_center_summary';    Route='wf_cost_center_view';        Display='Cost Center View';     LongDesc='KPI aggregati per centro di costo (Workforce dashboard)'; IsView=$true; ReadOnly=$true },
    @{ Schema='wf'; Object='vw_business_unit_summary';  Route='wf_business_unit_view';      Display='Business Unit View';   LongDesc='KPI aggregati per business unit';                    IsView=$true; ReadOnly=$true },
    @{ Schema='wf'; Object='vw_allocation_detail';      Route='wf_worktask_view';           Display='Worktask View';        LongDesc='Dettaglio allocazioni con join cosmetici (resource, role, cost_center, project)'; IsView=$true; ReadOnly=$true }
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
Write-Host "  Sprint 5b — Workforce scaffold + menu activation" -ForegroundColor Green
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
Write-Host "[1/5] login ok" -ForegroundColor Green

# Scaffold
Write-Host ""
Write-Host "[2/5] Scaffold workforce objects..." -ForegroundColor Cyan
foreach ($o in $objects) {
    $existing = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id FROM _metadati__tabelle WHERE md_nome_tabella = @t AND mdschemaname = @s" -Params @{ t = $o.Object; s = $o.Schema }
    if ($existing.Count -gt 0) {
        Write-Host "  [skip] $($o.Schema).$($o.Object) — md_id=$($existing[0].md_id)" -ForegroundColor DarkGray
        continue
    }
    if ($o.IsView) {
        $body = @{ connection = $dataCs; connName = ''; db = $dataDb; view = $o.Object; createMenu = $false; parentMenuId = 0; provider = '' } | ConvertTo-Json -Compress
        $url = "$BackendBaseUrl/api/Meta/AsmxProxy/scaffolding.scaffoldView"
    } else {
        $body = @{ connection = $dataCs; connName = ''; db = $dataDb; table = $o.Object; createMenu = $false; parentMenuId = 0; schema = $o.Schema; provider = '' } | ConvertTo-Json -Compress
        $url = "$BackendBaseUrl/api/Meta/AsmxProxy/scaffolding.scaffoldTable"
    }
    try {
        $null = Invoke-WebRequest -Method Post -Uri $url -ContentType 'application/json' -Body $body -Headers $authHeaders -SkipCertificateCheck
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

# Resolve md_id + normalize routes + patch
Write-Host ""
Write-Host "[3/5] Resolve md_id + patch flags..." -ForegroundColor Cyan
$mdMap = @{}
foreach ($o in $objects) {
    $rows = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 md_id, mdroutename FROM _metadati__tabelle WHERE md_nome_tabella = @t AND mdschemaname = @s" -Params @{ t = $o.Object; s = $o.Schema }
    if ($rows.Count -eq 0) { throw "Cannot resolve md_id for $($o.Schema).$($o.Object)" }
    $mdMap[$o.Object] = [int]$rows[0].md_id
    if ($rows[0].mdroutename -ne $o.Route) {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__tabelle SET mdroutename = @r WHERE md_id = @md" -Params @{ r = $o.Route; md = $mdMap[$o.Object] }
    }
    Write-Host "  $($o.Schema).$($o.Object) → md_id=$($mdMap[$o.Object]) route=$($o.Route)" -ForegroundColor White

    if (-not $o.ReadOnly) {
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
   AND mc_nome_colonna IN ('cancellato','data_creazione','data_modifica','data_eliminazione','utente_creazione','utente_modifica','utente_eliminazione','public_id')
"@ -Params @{ md = $mdMap[$o.Object] }
    } else {
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

# Lookup wiring
Write-Host ""
Write-Host "[4/5] Lookup wiring..." -ForegroundColor Cyan
$lookups = @(
    @{ Src='cost_center'; Col='site_id';         Target='sites';          DisplayCol='name' },
    @{ Src='resource';    Col='role_id';         Target='wf_roles';       DisplayCol='name' },
    @{ Src='resource';    Col='cost_center_id';  Target='wf_cost_centers';DisplayCol='name' },
    @{ Src='resource';    Col='site_id';         Target='sites';          DisplayCol='name' },
    @{ Src='allocation';  Col='resource_id';     Target='wf_resources';   DisplayCol='code' },
    @{ Src='allocation';  Col='project_id';      Target='projects';       DisplayCol='code' },
    @{ Src='allocation';  Col='program_id';      Target='programs';       DisplayCol='code' },
    @{ Src='allocation';  Col='currency_id';     Target='currencies';     DisplayCol='code' }
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

# Update menu entries for workforce
Write-Host ""
Write-Host "[5/5] Activate workforce menu entries..." -ForegroundColor Cyan

# Get parent workforce group
$wfGroup = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 mm_id FROM _metadati__menu WHERE mm_nome_menu = 'workforce'"
if ($wfGroup.Count -eq 0) { throw "Workforce parent menu not found" }
$wfId = [int]$wfGroup[0].mm_id

# Enable parent
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__menu SET mm_is_visible_by_default = 1, mm_uri_menu = '#/wf_cost_center_view/list' WHERE mm_id = @id" -Params @{ id = $wfId }

# Update 3 sub-entries
$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__menu
   SET mm_is_visible_by_default = 1,
       mm_uri_menu = '#/wf_worktask_view/list',
       mdid = @md
 WHERE mm_nome_menu = 'workforce_allocation'
"@ -Params @{ md = $mdMap['vw_allocation_detail'] }

$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__menu
   SET mm_is_visible_by_default = 1,
       mm_uri_menu = '#/wf_cost_center_view/list',
       mdid = @md
 WHERE mm_nome_menu = 'workforce_cost_center'
"@ -Params @{ md = $mdMap['vw_cost_center_summary'] }

$null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__menu
   SET mm_is_visible_by_default = 1,
       mm_uri_menu = '#/wf_business_unit_view/list',
       mdid = @md
 WHERE mm_nome_menu = 'workforce_business_unit'
"@ -Params @{ md = $mdMap['vw_business_unit_summary'] }

# Add the 4 raw workforce CRUD routes under Masterdata (anagrafica workforce)
function Get-NextMenuId {
    $rows = Invoke-Sql -ConnString $metaCs -Query "SELECT ISNULL(MAX(mm_id), 0) + 1 AS nextId FROM _metadati__menu"
    return [int]$rows[0].nextId
}

$md_anag = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 mm_id FROM _metadati__menu WHERE mm_nome_menu = 'masterdata_anagrafica'"
if ($md_anag.Count -gt 0) {
    $anagId = [int]$md_anag[0].mm_id
    # Insert 4 wf anagrafica entries if not exist
    $wfEntries = @(
        @{ Key='masterdata_anag_wf_roles';        Display='Ruoli (workforce)';   Order=100; Route='wf_roles';         Md=$mdMap['role'] },
        @{ Key='masterdata_anag_wf_costcenters';  Display='Centri di costo';     Order=110; Route='wf_cost_centers';  Md=$mdMap['cost_center'] },
        @{ Key='masterdata_anag_wf_resources';    Display='Risorse (anagrafica)';Order=120; Route='wf_resources';     Md=$mdMap['resource'] },
        @{ Key='masterdata_anag_wf_allocations';  Display='Allocazioni (raw)';   Order=130; Route='wf_allocations';   Md=$mdMap['allocation'] }
    )
    foreach ($e in $wfEntries) {
        $exists = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 mm_id FROM _metadati__menu WHERE mm_nome_menu = @k" -Params @{ k = $e.Key }
        if ($exists.Count -gt 0) {
            $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__menu SET mm_display_string_menu = @d, mm_uri_menu = @u, mdid = @md WHERE mm_id = @id" `
                -Params @{ id = [int]$exists[0].mm_id; d = $e.Display; u = "#/$($e.Route)/list"; md = $e.Md }
        } else {
            $newId = Get-NextMenuId
            $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
INSERT INTO _metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mmordine, mm_parent_id, mm_uri_menu, mm_is_visible_by_default, mdid)
VALUES (@id, @k, @d, @o, @p, @u, 1, @md)
"@ -Params @{ id = $newId; k = $e.Key; d = $e.Display; o = $e.Order; p = $anagId; u = "#/$($e.Route)/list"; md = $e.Md }
        }
    }
    Write-Host "  [ok] 4 workforce anagrafica entries added under Masterdata → Anagrafica base" -ForegroundColor Green
}

Write-Host "  [ok] 3 Workforce dashboard menu entries activated" -ForegroundColor Green

# Invalidate
$inv = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime" -ContentType 'application/json' -Body '{}' -Headers $authHeaders -SkipCertificateCheck
Write-Host ""
Write-Host "[done] $($inv.Content.Substring(0, [Math]::Min(160, $inv.Content.Length)))" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Sprint 5b workforce complete" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
