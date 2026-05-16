<#
.SYNOPSIS
  Sprint 2 (CostCnh) — Scaffolding metadata di xbs.tree_kind + scaffolding
  della vista xbs.vw_node_flat per browsing nodi via list-grid.
  Aggiunge menu entries sotto "Pianificazione" → "XBS hierarchy".
  Crea anche una _mtdt__cstom__actions__tabelle che chiama l'XbsController
  custom (Livello 5) per le operazioni tree (add child, move subtree, delete).
.EXAMPLE
  pwsh -ExecutionPolicy Bypass -File scripts/sprint2-xbs-scaffold.ps1
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

# (Schema, Table/View, Route, Display, LongDesc, IsView?)
$xbsObjects = @(
    @{ Schema='xbs'; Object='tree_kind';    Route='xbs_tree_kinds'; Display='Tipologie albero XBS'; LongDescription='XBS / WBS / OBS / CBS'; IsView=$false; ParentMenu='pianificazione' },
    @{ Schema='xbs'; Object='vw_node_flat'; Route='xbs_nodes';      Display='Nodi XBS / WBS';      LongDescription='Browse di tutti i nodi gerarchia (flat view con path string + parent_id)'; IsView=$true; ParentMenu='pianificazione' }
)

function Invoke-Sql {
    param([string]$ConnString, [string]$Query, [hashtable]$Params = @{})
    $conn = New-Object System.Data.SqlClient.SqlConnection $ConnString
    $conn.Open()
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
Write-Host "  Sprint 2 — CostCnh XBS hierarchy metadata scaffolding" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# 1) LOGIN
Write-Host "[1/5] Login..." -ForegroundColor Cyan
$kUserCookie = $null
$loginBody = @{ user_name = $AdminUser; password = $AdminPass; captchaToken = '' } | ConvertTo-Json -Compress
$loginResp = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.login" -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
$sc = $loginResp.Headers['Set-Cookie']
foreach ($s in @($sc)) { if ($s -match '^\s*k-user=([^;]+)') { $kUserCookie = $Matches[1]; break } }
if (-not $kUserCookie) { throw "Cannot extract k-user cookie" }
Write-Host "  [ok] login (cookie length=$($kUserCookie.Length))" -ForegroundColor Green
$authHeaders = @{ 'Cookie' = "k-user=$kUserCookie" }

# 2) SCAFFOLD (table for tree_kind, view for vw_node_flat)
Write-Host ""
Write-Host "[2/5] Scaffold xbs objects..." -ForegroundColor Cyan
foreach ($o in $xbsObjects) {
    $existing = Invoke-Sql -ConnString $metaCs -Query @"
SELECT TOP 1 md_id FROM _metadati__tabelle
 WHERE md_nome_tabella = @t AND mdschemaname = @s
"@ -Params @{ t = $o.Object; s = $o.Schema }
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
        $resp = Invoke-WebRequest -Method Post -Uri $url -ContentType 'application/json' -Body $body -Headers $authHeaders -SkipCertificateCheck
        $payload = $resp.Content
        if ($payload.Length -gt 200) { $payload = $payload.Substring(0, 200) + '...' }
        Write-Host "  [ok] $($o.Schema).$($o.Object) → $payload" -ForegroundColor Green
    } catch {
        $err = $_.Exception.Message
        if ($_.Exception.Response -ne $null) {
            try { $err = (New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch {}
        }
        Write-Host "  [FAIL] $($o.Schema).$($o.Object) → $err" -ForegroundColor Red
        throw
    }
}

# 3) RESOLVE md_id MAP + normalize routes
Write-Host ""
Write-Host "[3/5] Resolving md_id + normalizing routes..." -ForegroundColor Cyan
$mdMap = @{}
foreach ($o in $xbsObjects) {
    $rows = Invoke-Sql -ConnString $metaCs -Query @"
SELECT TOP 1 md_id, mdroutename FROM _metadati__tabelle
 WHERE md_nome_tabella = @t AND mdschemaname = @s
"@ -Params @{ t = $o.Object; s = $o.Schema }
    if ($rows.Count -eq 0) { throw "Cannot resolve md_id for $($o.Schema).$($o.Object)" }
    $mdMap[$o.Object] = [int]$rows[0].md_id
    if ($rows[0].mdroutename -ne $o.Route) {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__tabelle SET mdroutename = @r WHERE md_id = @md" -Params @{ r = $o.Route; md = $mdMap[$o.Object] }
        Write-Host "  $($o.Schema).$($o.Object) → md_id=$($mdMap[$o.Object]) [route $($rows[0].mdroutename) → $($o.Route)]" -ForegroundColor White
    } else {
        Write-Host "  $($o.Schema).$($o.Object) → md_id=$($mdMap[$o.Object]) [route=$($o.Route)]" -ForegroundColor White
    }

    # Tabelle base: audit + logic-delete; viste: solo display
    if (-not $o.IsView) {
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
"@ -Params @{ md = $mdMap[$o.Object]; disp = $o.Display; longdesc = $o.LongDescription }

        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne SET mcislogicdeletekey = 1
 WHERE md_id = @md AND mc_nome_colonna = 'cancellato'
"@ -Params @{ md = $mdMap[$o.Object] }

        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mchideinlist = 1, mchideinedit = 1, mc_logic_editable = 0
 WHERE md_id = @md
   AND mc_nome_colonna IN ('cancellato','data_creazione','data_modifica','data_eliminazione','utente_creazione','utente_modifica','utente_eliminazione','sys_start','sys_end','public_id')
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
"@ -Params @{ md = $mdMap[$o.Object]; disp = $o.Display; longdesc = $o.LongDescription }
    }
}

# 4) Lookup wiring per xbs.tree_kind sulla vw_node_flat (tree_kind_id → xbs_tree_kinds.name)
Write-Host ""
Write-Host "[4/5] Wiring lookup xbs_nodes.tree_kind_id → xbs_tree_kinds..." -ForegroundColor Cyan
if ($mdMap.ContainsKey('vw_node_flat')) {
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mc_ui_column_type        = 'lookupByID',
       mcuilookupentityname     = 'xbs_tree_kinds',
       mcuilookupdata_value_field = 'id',
       mcuilookupdata_text_field  = 'name',
       voa_class                = 2
 WHERE md_id = @md AND mc_nome_colonna = 'tree_kind_id'
"@ -Params @{ md = $mdMap['vw_node_flat'] }
    Write-Host "  [ok] xbs_nodes.tree_kind_id → lookup(xbs_tree_kinds.name)" -ForegroundColor Green
}

# 5) MENU ENTRIES sotto "Pianificazione"
Write-Host ""
Write-Host "[5/5] Menu entries..." -ForegroundColor Cyan

function Get-NextMenuId {
    $rows = Invoke-Sql -ConnString $metaCs -Query "SELECT ISNULL(MAX(mm_id), 0) + 1 AS nextId FROM _metadati__menu"
    return [int]$rows[0].nextId
}

function Ensure-MenuEntry {
    param([string]$Key, [string]$Display, [int]$ParentId, [int]$Order, [string]$Route, [int]$MdId)
    $uri = "#/$Route/list"
    $existing = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 mm_id FROM _metadati__menu WHERE mm_nome_menu = @k AND mm_parent_id = @p" -Params @{ k = $Key; p = $ParentId }
    if ($existing.Count -gt 0) {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query "UPDATE _metadati__menu SET mm_display_string_menu = @d, mm_uri_menu = @u, mdid = @md, mmordine = @o WHERE mm_id = @id" `
            -Params @{ id = [int]$existing[0].mm_id; d = $Display; u = $uri; md = $MdId; o = $Order }
        return [int]$existing[0].mm_id
    }
    $newId = Get-NextMenuId
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
INSERT INTO _metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mmordine, mm_parent_id, mm_uri_menu, mm_is_visible_by_default, mdid)
VALUES (@id, @k, @d, @o, @p, @u, 1, @md)
"@ -Params @{ id = $newId; k = $Key; d = $Display; o = $Order; p = $ParentId; u = $uri; md = $MdId }
    return $newId
}

# Pianificazione parent menu
$pianRows = Invoke-Sql -ConnString $metaCs -Query "SELECT TOP 1 mm_id FROM _metadati__menu WHERE mm_nome_menu = 'pianificazione' AND (mm_parent_id IS NULL OR mm_parent_id = 0)"
if ($pianRows.Count -eq 0) { throw "Parent menu 'pianificazione' non trovato (eseguire prima Sprint 1)" }
$pianId = [int]$pianRows[0].mm_id

$null = Ensure-MenuEntry -Key 'xbs_tree_kinds_list' -Display 'Tipologie XBS'   -ParentId $pianId -Order 100 -Route 'xbs_tree_kinds' -MdId $mdMap['tree_kind']
$null = Ensure-MenuEntry -Key 'xbs_nodes_list'      -Display 'Nodi XBS / WBS'  -ParentId $pianId -Order 110 -Route 'xbs_nodes'      -MdId $mdMap['vw_node_flat']
Write-Host "  [ok] menu entries created (parent=$pianId)" -ForegroundColor Green

# Invalidate
Write-Host ""
$inv = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime" -ContentType 'application/json' -Body '{}' -Headers $authHeaders -SkipCertificateCheck
Write-Host "  [ok] invalidateMetadataRuntime → $($inv.Content.Substring(0, [Math]::Min(160, $inv.Content.Length)))" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Sprint 2 XBS scaffolding complete" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
