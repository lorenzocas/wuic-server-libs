<#
.SYNOPSIS
  Sprint 1 (CostCnh) — Scaffolding metadata di 8 tabelle Anagrafica + patch
  flag obbligatori (logic-delete, full audit, hide audit cols, mc_logic_editable=0),
  display strings parlanti, voci di menu e invalidateMetadataRuntime.

  Idempotente: skippa scaffolding di tabelle gia' registrate e UPDATE solo
  delta. Sicuro da rilanciare N volte.

.PARAMETER BackendBaseUrl
  Default https://localhost:6543.

.PARAMETER AdminUser / AdminPass
  Default admin / admin.

.EXAMPLE
  pwsh -ExecutionPolicy Bypass -File scripts/sprint1-anagrafica-scaffold.ps1
#>
param(
    [string]$BackendBaseUrl = 'https://localhost:6543',
    [string]$AdminUser      = 'admin',
    [string]$AdminPass      = 'admin'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Trust self-signed dev cert (pwsh 7+ uses -SkipCertificateCheck on Invoke-WebRequest)

# Connection strings (CostCnh dev)
$dataCs = 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Data;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$metaCs = 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$dataDb = 'CostCnh_Data'

# 8 Anagrafica tables — order respects FK dependencies for lookup wiring
$anagrafica = @(
    @{ Schema='core'; Table='site';              Route='sites';            Display='Stabilimenti';  LongDescription='Plant / stabilimento produttivo CNH';     DisplayCol='name'; ParentMenu='anagrafiche' },
    @{ Schema='core'; Table='currency';          Route='currencies';       Display='Valute';        LongDescription='Valute ISO 4217 supportate';              DisplayCol='name'; ParentMenu='anagrafiche' },
    @{ Schema='core'; Table='program_status';    Route='program_statuses'; Display='Stati programma'; LongDescription='Stati workflow per programmi';          DisplayCol='name'; ParentMenu='anagrafiche' },
    @{ Schema='core'; Table='project_class';     Route='project_classes';  Display='Classi progetto'; LongDescription='Classificazione progetti';              DisplayCol='name'; ParentMenu='anagrafiche' },
    @{ Schema='core'; Table='project_scenario';  Route='project_scenarios';Display='Scenari';       LongDescription='Scenari di pianificazione (Baseline/Forecast/What-if)'; DisplayCol='name'; ParentMenu='pianificazione' },
    @{ Schema='core'; Table='program';           Route='programs';         Display='Programmi';     LongDescription='Programmi CNH (entita centrale)';         DisplayCol='code'; ParentMenu='pianificazione' },
    @{ Schema='core'; Table='project';           Route='projects';         Display='Progetti';      LongDescription='Progetti sotto programma';                DisplayCol='code'; ParentMenu='pianificazione' },
    @{ Schema='core'; Table='initiative';        Route='initiatives';      Display='Iniziative';    LongDescription='Iniziative trasversali';                  DisplayCol='code'; ParentMenu='pianificazione' }
)

function Invoke-Sql {
    param([string]$ConnString, [string]$Query, [hashtable]$Params = @{})
    $conn = New-Object System.Data.SqlClient.SqlConnection $ConnString
    $conn.Open()
    try {
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $Query
        $cmd.CommandTimeout = 60
        foreach ($k in $Params.Keys) {
            $null = $cmd.Parameters.AddWithValue("@$k", $Params[$k])
        }
        $reader = $cmd.ExecuteReader()
        $rows = @()
        try {
            while ($reader.Read()) {
                $row = @{}
                for ($i = 0; $i -lt $reader.FieldCount; $i++) {
                    $row[$reader.GetName($i)] = $reader.GetValue($i)
                }
                $rows += [pscustomobject]$row
            }
        } finally { $reader.Close() }
        return ,$rows
    } finally { $conn.Close() }
}

function Invoke-SqlNonQuery {
    param([string]$ConnString, [string]$Query, [hashtable]$Params = @{})
    $conn = New-Object System.Data.SqlClient.SqlConnection $ConnString
    $conn.Open()
    try {
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $Query
        $cmd.CommandTimeout = 60
        foreach ($k in $Params.Keys) {
            $null = $cmd.Parameters.AddWithValue("@$k", $Params[$k])
        }
        return $cmd.ExecuteNonQuery()
    } finally { $conn.Close() }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Sprint 1 — CostCnh Anagrafica metadata scaffolding" -ForegroundColor Green
Write-Host "  Backend: $BackendBaseUrl" -ForegroundColor White
Write-Host "  Tables : $($anagrafica.Count)" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green

# 1) LOGIN ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[1/6] Login admin/admin..." -ForegroundColor Cyan
$kUserCookie = $null
$loginBody = @{ user_name = $AdminUser; password = $AdminPass; captchaToken = '' } | ConvertTo-Json -Compress
try {
    $loginResp = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.login" `
        -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck

    # Extract k-user cookie from Set-Cookie header (server-managed mode, enableCookieAuthentication=true)
    $rawSetCookie = $null
    try { $rawSetCookie = $loginResp.Headers['Set-Cookie'] } catch { $rawSetCookie = $null }
    if ($null -ne $rawSetCookie) {
        $setCookieList = @($rawSetCookie)
        foreach ($sc in $setCookieList) {
            if ($sc -match '^\s*k-user=([^;]+)') {
                $kUserCookie = $Matches[1]
                break
            }
        }
    }

    if (-not $kUserCookie) { throw "Cannot extract k-user cookie from login response Set-Cookie" }

    Write-Host "  [ok] login → HTTP $($loginResp.StatusCode); k-user cookie length=$($kUserCookie.Length)" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] login: $($_.Exception.Message)" -ForegroundColor Red
    throw
}

# Build common auth headers (Cookie header explicitly, since pwsh cookie jar
# may drop server-managed cookie under self-signed cert / SkipCertificateCheck).
$authHeaders = @{ 'Cookie' = "k-user=$kUserCookie" }

# 2) SCAFFOLD ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[2/6] Scaffold $($anagrafica.Count) anagrafica tables..." -ForegroundColor Cyan
foreach ($t in $anagrafica) {
    $schema = $t.Schema; $table = $t.Table; $route = $t.Route

    # Skip if already registered
    $existing = Invoke-Sql -ConnString $metaCs -Query @"
SELECT TOP 1 md_id FROM _metadati__tabelle
 WHERE md_nome_tabella = @t AND mdschemaname = @s
"@ -Params @{ t = $table; s = $schema }

    if ($existing.Count -gt 0) {
        Write-Host "  [skip] $schema.$table — md_id=$($existing[0].md_id) (already scaffolded)" -ForegroundColor DarkGray
        continue
    }

    $body = @{
        connection   = $dataCs
        connName     = ''
        db           = $dataDb
        table        = $table
        createMenu   = $false
        parentMenuId = 0
        schema       = $schema
        provider     = ''
    } | ConvertTo-Json -Compress

    try {
        $resp = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/scaffolding.scaffoldTable" `
            -ContentType 'application/json' -Body $body -Headers $authHeaders -SkipCertificateCheck
        $payload = $resp.Content
        if ($payload.Length -gt 200) { $payload = $payload.Substring(0, 200) + '...' }
        Write-Host "  [ok] $schema.$table → $payload" -ForegroundColor Green
    } catch {
        $resp = $_.Exception.Response
        $err = $_.Exception.Message
        if ($resp -ne $null) {
            try {
                $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
                $err = $reader.ReadToEnd()
            } catch {}
        }
        Write-Host "  [FAIL] $schema.$table → $err" -ForegroundColor Red
        throw
    }
}

# 3) RESOLVE md_id MAP + NORMALIZE routes to plural ───────────────────────────
Write-Host ""
Write-Host "[3/7] Resolving md_id map + normalizing routes to plural..." -ForegroundColor Cyan
$mdMap = @{}
foreach ($t in $anagrafica) {
    $rows = Invoke-Sql -ConnString $metaCs -Query @"
SELECT TOP 1 md_id, mdroutename FROM _metadati__tabelle
 WHERE md_nome_tabella = @t AND mdschemaname = @s
"@ -Params @{ t = $t.Table; s = $t.Schema }
    if ($rows.Count -eq 0) {
        throw "Cannot resolve md_id for $($t.Schema).$($t.Table)"
    }
    $mdMap[$t.Table] = [int]$rows[0].md_id

    # Normalize route to plural (business convention) if different
    if ($rows[0].mdroutename -ne $t.Route) {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__tabelle SET mdroutename = @r WHERE md_id = @md
"@ -Params @{ r = $t.Route; md = $mdMap[$t.Table] }
        Write-Host "  $($t.Schema).$($t.Table) → md_id=$($mdMap[$t.Table]) [route $($rows[0].mdroutename) → $($t.Route)]" -ForegroundColor White
    } else {
        Write-Host "  $($t.Schema).$($t.Table) → md_id=$($mdMap[$t.Table]) [route=$($t.Route)]" -ForegroundColor White
    }
}

# 4) PATCH METADATA: full audit + logic-delete + display strings + hide audit cols
Write-Host ""
Write-Host "[4/6] Patching metadata flags + display strings..." -ForegroundColor Cyan
foreach ($t in $anagrafica) {
    $mdId = $mdMap[$t.Table]

    # 4.a Tabella: logic-delete + full audit + display
    $rowsAffected = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
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
"@ -Params @{ md = $mdId; disp = $t.Display; longdesc = $t.LongDescription }

    # 4.b Colonna cancellato → logic-delete key
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mcislogicdeletekey = 1
 WHERE md_id = @md AND mc_nome_colonna = 'cancellato'
"@ -Params @{ md = $mdId }

    # 4.c Hide audit columns from list + edit + lock editing
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mchideinlist     = 1,
       mchideinedit     = 1,
       mc_logic_editable = 0
 WHERE md_id = @md
   AND mc_nome_colonna IN (
       'cancellato',
       'data_creazione','data_modifica','data_eliminazione',
       'utente_creazione','utente_modifica','utente_eliminazione',
       'sys_start','sys_end',
       'public_id'
   )
"@ -Params @{ md = $mdId }

    Write-Host "  [ok] $($t.Schema).$($t.Table) — md_id=$mdId patched" -ForegroundColor Green
}

# 5) LOOKUP WIRING ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[5/6] Wiring lookup columns (FK → lookupByID)..." -ForegroundColor Cyan

# Mapping: source table → FK column → target route → display field
# (allineato allo schema reale 10-core-master.sql)
$lookups = @(
    @{ Src='program';  Col='site_id';                Target='sites';            DisplayCol='name' },
    @{ Src='program';  Col='program_status_id';      Target='program_statuses'; DisplayCol='name' },
    @{ Src='program';  Col='project_class_id';       Target='project_classes';  DisplayCol='name' },
    @{ Src='program';  Col='project_scenario_id';    Target='project_scenarios';DisplayCol='name' },
    @{ Src='program';  Col='currency_id';            Target='currencies';       DisplayCol='name' },
    @{ Src='program';  Col='program_parent_id';      Target='programs';         DisplayCol='code' },
    @{ Src='project';  Col='program_id';             Target='programs';         DisplayCol='code' }
)
foreach ($lk in $lookups) {
    if (-not $mdMap.ContainsKey($lk.Src)) { continue }
    $mdId = $mdMap[$lk.Src]
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__colonne
   SET mc_ui_column_type        = 'lookupByID',
       mcuilookupentityname     = @tgt,
       mcuilookupdata_value_field = 'id',
       mcuilookupdata_text_field  = @disp,
       voa_class                = 2
 WHERE md_id = @md AND mc_nome_colonna = @col
"@ -Params @{ md = $mdId; col = $lk.Col; tgt = $lk.Target; disp = $lk.DisplayCol }
    Write-Host "  [ok] $($lk.Src).$($lk.Col) → lookup($($lk.Target).$($lk.DisplayCol))" -ForegroundColor Green
}

# 6) MENU ENTRIES ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[6/7] Creating menu entries (Anagrafiche / Pianificazione)..." -ForegroundColor Cyan

function Get-NextMenuId {
    $rows = Invoke-Sql -ConnString $metaCs -Query "SELECT ISNULL(MAX(mm_id), 0) + 1 AS nextId FROM _metadati__menu"
    return [int]$rows[0].nextId
}

function Ensure-MenuGroup {
    param([string]$Key, [string]$Display, [int]$Order)
    $existing = Invoke-Sql -ConnString $metaCs -Query @"
SELECT TOP 1 mm_id FROM _metadati__menu
 WHERE mm_nome_menu = @k AND (mm_parent_id IS NULL OR mm_parent_id = 0)
"@ -Params @{ k = $Key }
    if ($existing.Count -gt 0) { return [int]$existing[0].mm_id }

    $newId = Get-NextMenuId
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
INSERT INTO _metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mmordine, mm_parent_id, mm_uri_menu, mm_is_visible_by_default)
VALUES (@id, @k, @d, @o, 0, NULL, 1)
"@ -Params @{ id = $newId; k = $Key; d = $Display; o = $Order }
    return $newId
}

function Ensure-MenuEntry {
    param([string]$Key, [string]$Display, [int]$ParentId, [int]$Order, [string]$Route, [int]$MdId)
    $uri = "#/$Route/list"
    $existing = Invoke-Sql -ConnString $metaCs -Query @"
SELECT TOP 1 mm_id FROM _metadati__menu
 WHERE mm_nome_menu = @k AND mm_parent_id = @p
"@ -Params @{ k = $Key; p = $ParentId }
    if ($existing.Count -gt 0) {
        $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
UPDATE _metadati__menu
   SET mm_display_string_menu = @d, mm_uri_menu = @u, mdid = @md, mmordine = @o
 WHERE mm_id = @id
"@ -Params @{ id = [int]$existing[0].mm_id; d = $Display; u = $uri; md = $MdId; o = $Order }
        return [int]$existing[0].mm_id
    }
    $newId = Get-NextMenuId
    $null = Invoke-SqlNonQuery -ConnString $metaCs -Query @"
INSERT INTO _metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mmordine, mm_parent_id, mm_uri_menu, mm_is_visible_by_default, mdid)
VALUES (@id, @k, @d, @o, @p, @u, 1, @md)
"@ -Params @{ id = $newId; k = $Key; d = $Display; o = $Order; p = $ParentId; u = $uri; md = $MdId }
    return $newId
}

$anagId = Ensure-MenuGroup -Key 'anagrafiche'    -Display 'Anagrafiche'   -Order 200
$pianId = Ensure-MenuGroup -Key 'pianificazione' -Display 'Pianificazione' -Order 300
Write-Host "  [ok] menu groups: anagrafiche=$anagId, pianificazione=$pianId" -ForegroundColor Green

$order = 10
foreach ($t in $anagrafica) {
    $parentId = if ($t.ParentMenu -eq 'anagrafiche') { $anagId } else { $pianId }
    $mid = Ensure-MenuEntry -Key "$($t.Route)_list" -Display $t.Display -ParentId $parentId -Order $order -Route $t.Route -MdId $mdMap[$t.Table]
    Write-Host "  [ok] menu entry $($t.Route) → mm_id=$mid (parent=$parentId)" -ForegroundColor Green
    $order += 10
}

# 7) INVALIDATE METADATA RUNTIME ──────────────────────────────────────────────
Write-Host ""
Write-Host "[7/7] invalidateMetadataRuntime + getProjectMetadataVersion..." -ForegroundColor Cyan
try {
    $inv = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime" `
        -ContentType 'application/json' -Body '{}' -Headers $authHeaders -SkipCertificateCheck
    Write-Host "  [ok] invalidateMetadataRuntime → $($inv.Content.Substring(0, [Math]::Min(160, $inv.Content.Length)))" -ForegroundColor Green

    $ver = Invoke-WebRequest -Method Post -Uri "$BackendBaseUrl/api/Meta/AsmxProxy/MetaService.getProjectMetadataVersion" `
        -ContentType 'application/json' -Body '{}' -Headers $authHeaders -SkipCertificateCheck
    Write-Host "  [ok] projectMetadataVersion → $($ver.Content)" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] $($_.Exception.Message)" -ForegroundColor Red
    throw
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Sprint 1 Anagrafica scaffolding complete" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
