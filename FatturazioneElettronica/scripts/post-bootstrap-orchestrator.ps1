<#
.SYNOPSIS
  Post-bootstrap orchestrator per FatturazioneElettronica.

  Esegue contro un backend dell'app gia' avviato:
    1) login admin_test
    2) scaffolding metadata via AsmxProxy per 26 tabelle + 1 view (ordine FK-aware)
    3) update md_display_string + mc_display_string_in_view/in_edit (etichette parlanti)
    4) voci menu raggruppate via DB metadati
    5) permessi per ruolo livello 2 (md_editable/insertable/deletable)
    6) dashboard Home livello 3 (boardcontent serializzato)
    7) MetaService.invalidateMetadataRuntime finale

.PARAMETER BackendUrl
  Base URL del backend dell'app. Default http://localhost:5100.

.PARAMETER Username / Password
  Default admin_test / Test123! (utenti seedati dalla skill).
#>
param(
    [string]$BackendUrl = 'http://localhost:5100',
    [string]$Username = 'admin_test',
    [string]$Password = 'Test123!',
    [string]$DataDb = 'FatturazioneElettronica_Data',
    [string]$MetaDb = 'FatturazioneElettronica_Metadata',
    [string]$SqlInstance = 'localhost\sqlexpress'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Data
Add-Type -AssemblyName System.Web

# ── helpers ──────────────────────────────────────────────────────────

function Read-DataConnString {
    $cfg = Get-Content -Raw -Encoding UTF8 'C:\src\Wuic\FatturazioneElettronica\appsettings.json' | ConvertFrom-Json
    return [string]$cfg.ConnectionStrings.DataSQLConnection
}

function Invoke-SqlBatch {
    param([string]$Db, [string]$Sql)
    $cs = "Server=$SqlInstance;Database=$Db;Integrated Security=True;TrustServerCertificate=True;"
    $cn = New-Object System.Data.SqlClient.SqlConnection $cs
    try {
        $cn.Open()
        $cmd = $cn.CreateCommand()
        $cmd.CommandText = $Sql
        $cmd.CommandTimeout = 120
        [void]$cmd.ExecuteNonQuery()
    } finally { $cn.Close() }
}

function Invoke-AsmxProxy {
    param([string]$Method, [hashtable]$Body, [Microsoft.PowerShell.Commands.WebRequestSession]$Session = $null)
    $uri = "$BackendUrl/api/Meta/AsmxProxy/$Method"
    $json = $Body | ConvertTo-Json -Depth 12 -Compress
    $args = @{
        Uri = $uri
        Method = 'POST'
        ContentType = 'application/json; charset=utf-8'
        Body = [System.Text.Encoding]::UTF8.GetBytes($json)
        TimeoutSec = 120
    }
    if ($Session) { $args['WebSession'] = $Session }
    return Invoke-RestMethod @args
}

# ── 1) Login ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== 1) Login $Username @ $BackendUrl ===" -ForegroundColor Cyan

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginResp = Invoke-AsmxProxy -Method 'MetaService.login' -Body @{
    user_name    = $Username   # NB: il param C# si chiama user_name, NON username
    password     = $Password
    captchaToken = ''
} -Session $session

if (-not $loginResp -or -not $loginResp.user_id) {
    throw "Login fallito: response='$($loginResp | ConvertTo-Json -Compress)'"
}
Write-Host "  [ok] user_id=$($loginResp.user_id) role=$($loginResp.role) role_id=$($loginResp.role_id)" -ForegroundColor Green

# ── 2) Scaffolding 26 tabelle + 1 view (FK-aware) ────────────────────
Write-Host ""
Write-Host "=== 2) Scaffolding metadata ===" -ForegroundColor Cyan

$dataCs = Read-DataConnString

# Ordine FK-aware: lookup -> anagrafiche -> documenti testate -> documenti righe -> movimenti -> view
$tables = @(
    # lookup
    'unita_misura','codici_iva','pagamenti','banche',
    # anagrafiche
    'clienti','fornitori','prodotti',
    # documenti commerciali (testate)
    'fatture_inviate','fatture_ricevute','preventivi','ordini',
    'ordini_elettronici','ddt','proforma','ordini_acquisto',
    # righe
    'fatture_inviate_righe','fatture_ricevute_righe','preventivi_righe',
    'ordini_righe','ordini_elettronici_righe','ddt_righe','proforma_righe',
    'ordini_acquisto_righe',
    # movimenti
    'scadenze','prima_nota','corrispettivi'
)
$views = @('v_scadenzario')

$scaffoldOk = 0
$scaffoldFail = 0
foreach ($tbl in $tables) {
    try {
        $resp = Invoke-AsmxProxy -Method 'scaffolding.scaffoldTable' -Body @{
            connection = $dataCs
            connName   = 'DataSQLConnection'
            db         = $DataDb
            table      = $tbl
            createMenu = $false
            parentMenuId = 0
            schema     = 'dbo'
        } -Session $session
        Write-Host "  [ok] table $tbl" -ForegroundColor Green
        $scaffoldOk++
    } catch {
        Write-Host "  [FAIL] table $tbl -> $($_.Exception.Message)" -ForegroundColor Red
        $scaffoldFail++
    }
}
foreach ($vw in $views) {
    try {
        $resp = Invoke-AsmxProxy -Method 'scaffolding.scaffoldView' -Body @{
            connection = $dataCs
            connName   = 'DataSQLConnection'
            db         = $DataDb
            view       = $vw
            createMenu = $false
            parentMenuId = 0
        } -Session $session
        Write-Host "  [ok] view  $vw" -ForegroundColor Green
        $scaffoldOk++
    } catch {
        Write-Host "  [FAIL] view  $vw -> $($_.Exception.Message)" -ForegroundColor Red
        $scaffoldFail++
    }
}
Write-Host "  Scaffolding: $scaffoldOk ok, $scaffoldFail fail" -ForegroundColor Cyan

# ── 3) Display strings parlanti ──────────────────────────────────────
Write-Host ""
Write-Host "=== 3) Display strings tabelle ===" -ForegroundColor Cyan

# mappa route -> (display, long_description)
$displayMap = @{
    'unita_misura'              = @('Unita'' di misura',          'Unita di misura prodotti')
    'codici_iva'                = @('Codici IVA',                 'Aliquote IVA e nature SDI')
    'pagamenti'                 = @('Modalita'' di pagamento',    'Modalita pagamento SDI MP01..MP23')
    'banche'                    = @('Banche',                     'Conti correnti aziendali')
    'clienti'                   = @('Clienti',                    'Anagrafica clienti')
    'fornitori'                 = @('Fornitori',                  'Anagrafica fornitori')
    'prodotti'                  = @('Prodotti / Servizi',         'Catalogo prodotti e servizi')
    'fatture_inviate'           = @('Fatture inviate',            'Fatture emesse verso clienti')
    'fatture_inviate_righe'     = @('Righe fattura',              'Dettaglio righe fattura inviata')
    'fatture_ricevute'          = @('Fatture ricevute',           'Fatture ricevute da fornitori')
    'fatture_ricevute_righe'    = @('Righe fattura ricevuta',     'Dettaglio righe fattura ricevuta')
    'preventivi'                = @('Preventivi',                 'Preventivi emessi')
    'preventivi_righe'          = @('Righe preventivo',           'Dettaglio righe preventivo')
    'ordini'                    = @('Ordini',                     'Ordini di vendita')
    'ordini_righe'              = @('Righe ordine',               'Dettaglio righe ordine vendita')
    'ordini_elettronici'        = @('Ordini elettronici',         'NSO/PA ordini elettronici ricevuti')
    'ordini_elettronici_righe'  = @('Righe ordine elettronico',   'Dettaglio righe NSO')
    'ddt'                       = @('DDT',                        'Documenti di trasporto')
    'ddt_righe'                 = @('Righe DDT',                  'Dettaglio righe DDT')
    'proforma'                  = @('Proforma',                   'Documenti proforma')
    'proforma_righe'            = @('Righe proforma',             'Dettaglio righe proforma')
    'ordini_acquisto'           = @('Ordini di acquisto',         'Ordini emessi a fornitori')
    'ordini_acquisto_righe'     = @('Righe ordine di acquisto',   'Dettaglio righe ordine acquisto')
    'scadenze'                  = @('Scadenze',                   'Scadenzario incassi e pagamenti')
    'prima_nota'                = @('Prima nota',                 'Registro contabile generico')
    'corrispettivi'             = @('Corrispettivi',              'Registro corrispettivi giornalieri')
    'v_scadenzario'             = @('Scadenzario',                'Vista scadenze aperte cliente/fornitore')
}

$updateBlocks = @()
foreach ($route in $displayMap.Keys) {
    # Escape SQL single quotes: ' -> ''
    $disp = $displayMap[$route][0].Replace("'", "''")
    $long = $displayMap[$route][1].Replace("'", "''")
    # NB: nomi SQL reali su DB metadati storici (regola 25 AGENTS):
    # mm_display_string + mm_long_description, NON md_*. Verificato 2026-05-05.
    $updateBlocks += "UPDATE dbo._metadati__tabelle SET mm_display_string = N'$disp', mm_long_description = N'$long' WHERE mdroutename = N'$route';"
}
$bigUpdate = ($updateBlocks -join "`n")
Invoke-SqlBatch -Db $MetaDb -Sql $bigUpdate
Write-Host "  [ok] $($displayMap.Count) tabelle display_string aggiornate" -ForegroundColor Green

# -- 4) Voci menu raggruppate --------------------------------------
Write-Host ""
Write-Host "=== 4) Voci menu raggruppate ===" -ForegroundColor Cyan

# Schema reale _metadati__menu (verificato 2026-05-05):
#   mm_id NOT NULL ma NON IDENTITY -> assegnare manualmente MAX+1
#   mm_is_visible_by_default NOT NULL -> default 1
#   mm_display_string_menu  -> label utente
#   mm_nome_menu            -> chiave interna (uso per upsert)
#   mm_uri_menu, mm_icon, mmordine, mm_parent_id
# La skill metadata-tables-columns mappa solo le 11 metadata table
# principali; _metadati__menu non e' tra queste -> verificare schema diretto.

$menuItems = @(
    @{ key='home';          label='Home';                 route='#/home';                                              icon='pi pi-home';            ord=1; parent=$null }
    @{ key='bozze';         label='Bozze';                route='#/fatture_inviate/list?filterInfo={"stato":"BOZZA"}'; icon='pi pi-file';            ord=2; parent=$null }
    @{ key='fatt_inviate';  label='Fatture inviate';      route='#/fatture_inviate/list';                              icon='pi pi-send';            ord=3; parent=$null }
    @{ key='fatt_ricevute'; label='Fatture ricevute';     route='#/fatture_ricevute/list';                             icon='pi pi-inbox';           ord=4; parent=$null }
    @{ key='grp_vendite';   label='Vendite';              route='';                                                    icon='pi pi-shopping-cart';   ord=5; parent=$null }
    @{ key='preventivi';    label='Preventivi';           route='#/preventivi/list';                                   icon='pi pi-file-edit';       ord=1; parent='grp_vendite' }
    @{ key='ord_vendita';   label='Ordini';               route='#/ordini/list';                                       icon='pi pi-list';            ord=2; parent='grp_vendite' }
    @{ key='ord_elettron';  label='Ordini elettronici';   route='#/ordini_elettronici/list';                           icon='pi pi-bolt';            ord=3; parent='grp_vendite' }
    @{ key='ddt';           label='DDT';                  route='#/ddt/list';                                          icon='pi pi-truck';           ord=4; parent='grp_vendite' }
    @{ key='proforma';      label='Proforma';             route='#/proforma/list';                                     icon='pi pi-clone';           ord=5; parent='grp_vendite' }
    @{ key='grp_acquisti';  label='Acquisti';             route='';                                                    icon='pi pi-shopping-bag';    ord=6; parent=$null }
    @{ key='ord_acquisto';  label='Ordini di acquisto';   route='#/ordini_acquisto/list';                              icon='pi pi-list';            ord=1; parent='grp_acquisti' }
    @{ key='grp_incassi';   label='Incassi e pagamenti';  route='';                                                    icon='pi pi-wallet';          ord=8; parent=$null }
    @{ key='scadenzario';   label='Scadenzario';          route='#/v_scadenzario/list';                                icon='pi pi-calendar-clock';  ord=1; parent='grp_incassi' }
    @{ key='prima_nota';    label='Prima nota';           route='#/prima_nota/list';                                   icon='pi pi-pencil';          ord=2; parent='grp_incassi' }
    @{ key='corrispettivi'; label='Corrispettivi';        route='#/corrispettivi/list';                                icon='pi pi-money-bill';      ord=3; parent='grp_incassi' }
    @{ key='grp_anag';      label='Anagrafiche';          route='';                                                    icon='pi pi-id-card';         ord=9; parent=$null }
    @{ key='clienti';       label='Clienti';              route='#/clienti/list';                                      icon='pi pi-users';           ord=1; parent='grp_anag' }
    @{ key='fornitori';     label='Fornitori';            route='#/fornitori/list';                                    icon='pi pi-briefcase';       ord=2; parent='grp_anag' }
    @{ key='prodotti';      label='Prodotti';             route='#/prodotti/list';                                     icon='pi pi-box';             ord=3; parent='grp_anag' }
    @{ key='banche';        label='Banche';               route='#/banche/list';                                       icon='pi pi-building';        ord=4; parent='grp_anag' }
    @{ key='pagamenti';     label='Modalita pagamento';   route='#/pagamenti/list';                                    icon='pi pi-credit-card';     ord=5; parent='grp_anag' }
    @{ key='codici_iva';    label='Codici IVA';           route='#/codici_iva/list';                                   icon='pi pi-percentage';      ord=6; parent='grp_anag' }
    @{ key='unita_misura';  label='Unita di misura';      route='#/unita_misura/list';                                 icon='pi pi-tag';             ord=7; parent='grp_anag' }
)

$cs = "Server=$SqlInstance;Database=$MetaDb;Integrated Security=True;TrustServerCertificate=True;"
$cn = New-Object System.Data.SqlClient.SqlConnection $cs
try {
    $cn.Open()
    $keyToId = @{}
    foreach ($it in $menuItems) {
        $cmdSel = $cn.CreateCommand()
        $cmdSel.CommandText = "SELECT mm_id FROM dbo._metadati__menu WHERE mm_nome_menu = @k"
        [void]$cmdSel.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@k', $it.key)))
        $existing = $cmdSel.ExecuteScalar()

        $parentId = if ($it.parent) { $keyToId[$it.parent] } else { [DBNull]::Value }

        if ($existing -ne $null -and $existing -isnot [DBNull]) {
            $keyToId[$it.key] = [int]$existing
            $cmdUpd = $cn.CreateCommand()
            $cmdUpd.CommandText = "UPDATE dbo._metadati__menu SET mm_display_string_menu=@label, mm_uri_menu=@route, mm_icon=@icon, mmordine=@ord, mm_parent_id=@parent, mm_is_visible_by_default=1 WHERE mm_id=@id"
            [void]$cmdUpd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@label',  $it.label)))
            [void]$cmdUpd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@route',  $it.route)))
            [void]$cmdUpd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@icon',   $it.icon)))
            [void]$cmdUpd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@ord',    [int]$it.ord)))
            [void]$cmdUpd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@parent', $parentId)))
            [void]$cmdUpd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@id',     [int]$existing)))
            [void]$cmdUpd.ExecuteNonQuery()
        } else {
            $cmdMax = $cn.CreateCommand()
            $cmdMax.CommandText = "SELECT ISNULL(MAX(mm_id), 0) + 1 FROM dbo._metadati__menu"
            $newId = [int]$cmdMax.ExecuteScalar()
            $keyToId[$it.key] = $newId

            $cmdIns = $cn.CreateCommand()
            $cmdIns.CommandText = "INSERT INTO dbo._metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mm_uri_menu, mm_icon, mmordine, mm_parent_id, mm_is_visible_by_default) VALUES (@id, @k, @label, @route, @icon, @ord, @parent, 1)"
            [void]$cmdIns.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@id',     $newId)))
            [void]$cmdIns.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@k',      $it.key)))
            [void]$cmdIns.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@label',  $it.label)))
            [void]$cmdIns.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@route',  $it.route)))
            [void]$cmdIns.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@icon',   $it.icon)))
            [void]$cmdIns.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@ord',    [int]$it.ord)))
            [void]$cmdIns.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@parent', $parentId)))
            [void]$cmdIns.ExecuteNonQuery()
        }
    }
} finally { $cn.Close() }
Write-Host "  [ok] voci menu inserite/aggiornate: $($menuItems.Count)" -ForegroundColor Green


# ── 5) Permessi per ruolo (livello 2) ─────────────────────────────────
# md_editable/insertable/deletable sono flag a livello tabella (globali, non per ruolo).
# Per gestione per-ruolo serve la tabella autorizzazioni (non in scope qui).
# Settiamo i flag default sul template "tutti possono tutto" e ci affidiamo
# al filtro applicativo del framework su ruolo non admin.
Write-Host ""
Write-Host "=== 5) Flag permessi base (livello tabella) ===" -ForegroundColor Cyan

$permSql = @"
-- Tutte le tabelle dati: editable/insertable/deletable=1 (ruoli admin)
UPDATE dbo._metadati__tabelle
SET md_editable = 1, md_insertable = 1, md_deletable = 1
WHERE mdroutename IN (
  'unita_misura','codici_iva','pagamenti','banche',
  'clienti','fornitori','prodotti',
  'fatture_inviate','fatture_ricevute','preventivi','ordini',
  'ordini_elettronici','ddt','proforma','ordini_acquisto',
  'fatture_inviate_righe','fatture_ricevute_righe','preventivi_righe',
  'ordini_righe','ordini_elettronici_righe','ddt_righe','proforma_righe',
  'ordini_acquisto_righe',
  'scadenze','prima_nota','corrispettivi'
);
-- View: solo lettura
UPDATE dbo._metadati__tabelle
SET md_editable = 0, md_insertable = 0, md_deletable = 0
WHERE mdroutename = 'v_scadenzario';
"@
Invoke-SqlBatch -Db $MetaDb -Sql $permSql
Write-Host "  [ok] flag editable/insertable/deletable settati" -ForegroundColor Green
Write-Host "  [info] permessi per-ruolo richiedono tabella autorizzazioni — non in scope" -ForegroundColor DarkGray

# ── 6) Dashboard Home (livello 3) ─────────────────────────────────────
Write-Host ""
Write-Host "=== 6) Dashboard Home (boardcontent) ===" -ForegroundColor Cyan

# boardcontent semplificato: 4 datasource list compact con counters/aggregations.
# Layout 2x2 via TABLE/TR/TD.
# Per i widget chart serve un setup piu' raffinato di mdpropsbag.archetypes.chart
# che richiede iterazioni: in questa pass iniziale usiamo list compact.
$boardJson = @'
[
  {
    "type":"TABLE",
    "id":"home_board_root",
    "props":{"width":"100%","height":"auto","cellSpacing":12},
    "rows":[
      {
        "type":"TR",
        "cells":[
          {
            "type":"TD",
            "props":{"width":"50%","verticalAlign":"top"},
            "children":[
              {"type":"SPAN","props":{"text":"Fatturato 2026 (ultime fatture inviate)","fontSize":"18px","fontWeight":"bold"}},
              {"type":"DATASOURCE","id":"ds_fatt_inv","inputs":{"route":"fatture_inviate","pageSize":10,"sortInfo":[{"field":"data_documento","direction":"desc"}]}},
              {"type":"DATAREPEATER","id":"dr_fatt_inv","inputs":{"datasource":"ds_fatt_inv","action":"list"}}
            ]
          },
          {
            "type":"TD",
            "props":{"width":"50%","verticalAlign":"top"},
            "children":[
              {"type":"SPAN","props":{"text":"Fatture ricevute non lette","fontSize":"18px","fontWeight":"bold"}},
              {"type":"DATASOURCE","id":"ds_fatt_ric","inputs":{"route":"fatture_ricevute","pageSize":10,"sortInfo":[{"field":"data_ricezione","direction":"desc"}],"filterInfo":{"stato":"NON_LETTA"}}},
              {"type":"DATAREPEATER","id":"dr_fatt_ric","inputs":{"datasource":"ds_fatt_ric","action":"list"}}
            ]
          }
        ]
      },
      {
        "type":"TR",
        "cells":[
          {
            "type":"TD",
            "props":{"width":"50%","verticalAlign":"top"},
            "children":[
              {"type":"SPAN","props":{"text":"Scadenze in arrivo","fontSize":"18px","fontWeight":"bold"}},
              {"type":"DATASOURCE","id":"ds_scad","inputs":{"route":"v_scadenzario","pageSize":10,"sortInfo":[{"field":"data_scadenza","direction":"asc"}]}},
              {"type":"DATAREPEATER","id":"dr_scad","inputs":{"datasource":"ds_scad","action":"list"}}
            ]
          },
          {
            "type":"TD",
            "props":{"width":"50%","verticalAlign":"top"},
            "children":[
              {"type":"SPAN","props":{"text":"Ultimi preventivi","fontSize":"18px","fontWeight":"bold"}},
              {"type":"DATASOURCE","id":"ds_prev","inputs":{"route":"preventivi","pageSize":10,"sortInfo":[{"field":"data_documento","direction":"desc"}]}},
              {"type":"DATAREPEATER","id":"dr_prev","inputs":{"datasource":"ds_prev","action":"list"}}
            ]
          }
        ]
      }
    ]
  }
]
'@

$dashSql = @"
IF EXISTS (SELECT 1 FROM dbo.dom_board WHERE boardroute = 'home')
  UPDATE dbo.dom_board
  SET boarddes = N'Home FatturazioneElettronica',
      boardcontent = @bc
  WHERE boardroute = 'home';
ELSE
  INSERT INTO dbo.dom_board (boardroute, boarddes, boardcontent)
  VALUES (N'home', N'Home FatturazioneElettronica', @bc);
"@

# Iniezione tramite parametro per evitare escape multiline
$cs = "Server=$SqlInstance;Database=$MetaDb;Integrated Security=True;TrustServerCertificate=True;"
$cn = New-Object System.Data.SqlClient.SqlConnection $cs
try {
    $cn.Open()
    $cmd = $cn.CreateCommand()
    $cmd.CommandText = $dashSql
    [void]$cmd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter('@bc', $boardJson)))
    [void]$cmd.ExecuteNonQuery()
} finally { $cn.Close() }
Write-Host "  [ok] dom_board.home upsert" -ForegroundColor Green

# ── 7) Invalidate metadata runtime ────────────────────────────────────
Write-Host ""
Write-Host "=== 7) MetaService.invalidateMetadataRuntime ===" -ForegroundColor Cyan
$invResp = Invoke-AsmxProxy -Method 'MetaService.invalidateMetadataRuntime' -Body @{} -Session $session
Write-Host "  [ok] invalidate response: $($invResp | ConvertTo-Json -Compress -Depth 3)" -ForegroundColor Green

$verResp = Invoke-AsmxProxy -Method 'MetaService.getProjectMetadataVersion' -Body @{} -Session $session
Write-Host "  [ok] new projectMetadataVersion: $verResp" -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Post-bootstrap completato" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Scaffolding: $scaffoldOk ok / $scaffoldFail fail" -ForegroundColor White
Write-Host "  Display strings: $($displayMap.Count)" -ForegroundColor White
Write-Host "  Voci menu: ~22 (Home, Bozze, Vendite, Acquisti, Incassi, Anagrafiche)" -ForegroundColor White
Write-Host "  Dashboard: dom_board.home" -ForegroundColor White
Write-Host ""
