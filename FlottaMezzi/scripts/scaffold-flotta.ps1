# ============================================================================
# scaffold-flotta.ps1
#
# Orchestratore Phase 3 Liv 1 della skill app-creation per FlottaMezzi.
# Per ogni tabella business:
#   1. POST scaffolding.scaffoldTable -> registra _metadati__tabelle + _metadati__colonne
#   2. UPDATE _metadati__tabelle (audit + logic-delete + display strings)
#   3. UPDATE _metadati__colonne (mcislogicdeletekey + hide_in_* + display strings)
# Final: MetaService.invalidateMetadataRuntime
#
# Idempotente: scaffoldTable e' no-op se la route esiste, le UPDATE sono upsert.
# DDL fisico: gia' applicato da dbms/schema/01-*.sql + 02-*.sql.
# ============================================================================
param(
    [string]$AsmxBase = 'http://localhost:5100/api/Meta/AsmxProxy',
    [string]$AppRoot  = 'C:\src\Wuic\FlottaMezzi'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Data
Add-Type -AssemblyName System.Web

function Get-ConnString { param([string]$Path, [string]$Name)
    $j = Get-Content $Path -Raw | ConvertFrom-Json
    return [string]$j.ConnectionStrings.$Name
}
function Get-Db { param([string]$Cs)
    if ($Cs -match 'Initial Catalog\s*=\s*([^;]+)') { return $Matches[1].Trim() }
    if ($Cs -match 'Database\s*=\s*([^;]+)') { return $Matches[1].Trim() }
    throw "no catalog in $Cs"
}
function Invoke-MetaSql { param([string]$Sql, [hashtable]$Params = @{})
    $cs = $script:MetaCs
    $cn = New-Object System.Data.SqlClient.SqlConnection $cs
    $cn.Open()
    try {
        $cmd = $cn.CreateCommand()
        $cmd.CommandText = $Sql
        $cmd.CommandTimeout = 30
        foreach ($k in $Params.Keys) {
            [void]$cmd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter("@$k", $Params[$k])))
        }
        return $cmd.ExecuteNonQuery()
    } finally { $cn.Close() }
}
function Get-MdId { param([string]$Route)
    $cs = $script:MetaCs
    $cn = New-Object System.Data.SqlClient.SqlConnection $cs
    $cn.Open()
    try {
        $cmd = $cn.CreateCommand()
        $cmd.CommandText = "SELECT TOP 1 md_id FROM dbo._metadati__tabelle WHERE mdroutename = @r"
        [void]$cmd.Parameters.AddWithValue('@r', $Route)
        $v = $cmd.ExecuteScalar()
        if ($null -eq $v -or $v -is [System.DBNull]) { return $null }
        return [int]$v
    } finally { $cn.Close() }
}

# ── 1) Setup ─────────────────────────────────────────────────────────
$AppSettings = Join-Path $AppRoot 'appsettings.json'
$DataCs   = Get-ConnString -Path $AppSettings -Name 'DataSQLConnection'
$DataDb   = Get-Db -Cs $DataCs
$script:MetaCs = Get-ConnString -Path $AppSettings -Name 'MetaDataSQLConnection'
$MetaDb   = Get-Db -Cs $script:MetaCs

Write-Host "DB Dati:     $DataDb"
Write-Host "DB Metadati: $MetaDb"
Write-Host "AsmxBase:    $AsmxBase"

# ── 2) Login admin/admin ─────────────────────────────────────────────
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginPayload = @{ user_name = 'admin'; password = 'admin' } | ConvertTo-Json -Compress
$user = Invoke-RestMethod -TimeoutSec 60 -Method Post -Uri "$AsmxBase/MetaService.login" -WebSession $session -ContentType 'application/json' -Body $loginPayload
if ($null -eq $user) { throw 'login returned null' }
$encodedUser = [System.Web.HttpUtility]::UrlEncode(($user | ConvertTo-Json -Compress -Depth 20))
$cookie = New-Object System.Net.Cookie('k-user', $encodedUser, '/', 'localhost')
$session.Cookies.Add($cookie)
Write-Host "Login admin OK"

# ── 3) Tables to scaffold (FK-safe order) ────────────────────────────
$tables = @(
    @{ Route='tipo_mezzo';            Display='Tipo mezzo';            LongDesc='Tipologia di veicolo (auto, furgone, camion, motociclo)'; PkColumn='id' }
    @{ Route='stato_mezzo';           Display='Stato mezzo';           LongDesc='Stato operativo del veicolo (attivo, fermo, in riparazione, dismesso)'; PkColumn='id' }
    @{ Route='tipo_manutenzione';     Display='Tipo manutenzione';     LongDesc='Categoria intervento manutentivo (ordinaria, straordinaria, revisione, gomme)'; PkColumn='id' }
    @{ Route='conducenti';            Display='Conducenti';            LongDesc='Anagrafica autisti con patente e dati personali'; PkColumn='id' }
    @{ Route='mezzi';                 Display='Mezzi';                 LongDesc='Anagrafica veicoli della flotta con dati tecnici, stato, posizione GPS'; PkColumn='id' }
    @{ Route='manutenzioni';          Display='Manutenzioni';          LongDesc='Storico interventi manutentivi su ogni mezzo con costi e officina'; PkColumn='id' }
    @{ Route='rifornimenti';          Display='Rifornimenti';          LongDesc='Log rifornimenti carburante con litri, costo e km al rifornimento'; PkColumn='id' }
    @{ Route='contratti_assicurativi'; Display='Contratti assicurativi'; LongDesc='Polizze assicurative dei mezzi con scadenze e premi annui'; PkColumn='id' }
    @{ Route='revisioni';             Display='Revisioni';             LongDesc='Storico revisioni mezzi con esito e prossima scadenza'; PkColumn='id' }
    @{ Route='sinistri';              Display='Sinistri';              LongDesc='Eventi sinistro per ogni mezzo con controparte e stato pratica'; PkColumn='id' }
)

# ── 4) Scaffold each table ───────────────────────────────────────────
$results = @()
foreach ($t in $tables) {
    $route = $t.Route
    Write-Host ""
    Write-Host "=== $route ===" -ForegroundColor Cyan

    # 4.1 POST scaffolding.scaffoldTable
    $payload = @{
        connection   = $DataCs
        connName     = ''   # IMPORTANT: vuoto, vedi SKILL gotcha #2
        db           = $DataDb
        table        = $route
        createMenu   = $false
        parentMenuId = 0
        schema       = 'dbo'
        provider     = ''
    } | ConvertTo-Json -Compress

    try {
        $resp = Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/scaffolding.scaffoldTable" -WebSession $session -ContentType 'application/json' -Body $payload
        $msg = if ($resp.PSObject.Properties['message']) { $resp.message } else { ($resp | ConvertTo-Json -Compress -Depth 4) }
        Write-Host "  scaffoldTable: $msg" -ForegroundColor Green
    } catch {
        Write-Host "  scaffoldTable FAILED: $($_.Exception.Message)" -ForegroundColor Red
        throw
    }

    # 4.2 Resolve md_id
    $mdId = Get-MdId -Route $route
    if ($null -eq $mdId) { throw "md_id NULL after scaffold of $route" }
    Write-Host "  md_id=$mdId"

    # 4.3 UPDATE _metadati__tabelle: audit + logic-delete + archetypes list+edit + display
    # Schema legacy del template: usa mm_* (display, long_description). mdpropsbag e' nuovo (no underscore).
    [void](Invoke-MetaSql -Sql @"
UPDATE dbo._metadati__tabelle SET
  md_editable      = 1,
  md_insertable    = 1,
  md_deletable     = 1,
  mdhaslogicdelete = 1,
  mdloggingenable  = 1,
  mdlogginginsertdatefieldname  = N'data_creazione',
  mdlogginginsertuserfieldname  = N'utente_creazione',
  mdlogginglastmoddatefieldname = N'data_modifica',
  mdlogginglastmoduserfieldname = N'utente_modifica',
  mdloggingdeletedatefieldname  = N'data_eliminazione',
  mdloggingdeleteuserfieldname  = N'utente_eliminazione',
  mm_display_string             = @disp,
  mm_long_description           = @longd,
  mdpropsbag                    = N'{"archetypes":{"list":{},"edit":{}}}'
WHERE md_id = @mdid
"@ -Params @{ disp = $t.Display; longd = $t.LongDesc; mdid = $mdId })

    # 4.4 UPDATE _metadati__colonne: mark logic-delete key + hide audit cols
    [void](Invoke-MetaSql -Sql @"
UPDATE c
   SET c.mcislogicdeletekey = 1, c.mchideinedit = 1, c.mchideinlist = 1
  FROM dbo._metadati__colonne c
 WHERE c.md_id = @mdid AND c.mc_nome_colonna = N'cancellato';
UPDATE c
   SET c.mchideinedit = 1, c.mchideinlist = 1
  FROM dbo._metadati__colonne c
 WHERE c.md_id = @mdid
   AND c.mc_nome_colonna IN (N'data_creazione', N'data_modifica', N'data_eliminazione',
                              N'utente_creazione', N'utente_modifica', N'utente_eliminazione');
"@ -Params @{ mdid = $mdId })

    Write-Host "  metadata patches applied" -ForegroundColor Green
    $results += [pscustomobject]@{ Route = $route; MdId = $mdId; Display = $t.Display }
}

# ── 5) Invalidate metadata runtime ────────────────────────────────────
Write-Host ""
[void](Invoke-RestMethod -TimeoutSec 60 -Method Post -Uri "$AsmxBase/MetaService.invalidateMetadataRuntime" -WebSession $session -ContentType 'application/json' -Body '{}')
Write-Host "invalidateMetadataRuntime OK" -ForegroundColor Green
$ver = Invoke-RestMethod -TimeoutSec 60 -Method Post -Uri "$AsmxBase/MetaService.getProjectMetadataVersion" -WebSession $session -ContentType 'application/json' -Body '{}'
Write-Host "projectMetadataVersion: $ver" -ForegroundColor Green

Write-Host ""
Write-Host "=== Riepilogo ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize
