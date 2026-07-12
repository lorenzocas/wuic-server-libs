# ============================================================================
# create-wf-ferie-demo.ps1  (FlottaMezzi)
#
# Workflow business "Richiesta Ferie conducenti" multi-livello che esercita le
# feature AVANZATE del workflow-designer/runner WUIC:
#  - F3 assegnazione DINAMICA dell'approvatore (manager del richiedente via
#    _wuic_user_hierarchy + bundle md_workflow_assignee_resolver)
#  - F4 delega/sostituto (_wuic_user_delegates: la coda del delegante appare
#    al delegato nel periodo di validita')
#  - F1 nodo TIMER (reminder 48h sulla coda manager -> notifica ruolo, via
#    _wuic_workflow_sla + scheduler + stored wf_sla_tick)
#  - F2 instance log (timeline transizioni per record)
#  - F8 badge contatori sulle voci menu del runner
#  - 2 LIVELLI di approvazione: manager sempre; HR solo se giorni > 10
#
# RIUSO: ruoli esistenti `autista` e `gestore_flotta`; tabella `conducenti`
# esistente (lookup). Unica entita' nuova: ferie_richieste (non esiste nulla
# di assenze/ferie nello schema, verificato) con pattern audit 7-colonne
# dell'app. Il richiedente e' `utente_creazione` (stamp automatico).
#
# Ruoli:  autista (esistente) / gestore_flotta (esistente) / hr_flotta (nuovo)
# Utenti: autista1.wf / autista2.wf / manager.wf / hr.wf  (pwd: FerieDemo123!)
# Stati:  BOZZA -> IN_APPROVAZIONE -> [giorni>10: IN_APPROVAZIONE_HR] ->
#         APPROVATA | RESPINTA (rework loop verso BOZZA/reinvio)
#
# Idempotente. Riapribile/modificabile dal workflow-designer.
# PRE-REQUISITO: KonvergenceCore\dbms\scripts\ensure-wuic-workflow-tables.mssql.sql
# gia' applicato a FlottaMezzi_Metadata (tabelle _wuic_* + wf_sla_tick).
# ============================================================================
param(
    [string]$AsmxBase = 'http://localhost:5100/api/Meta/AsmxProxy',
    [string]$AsmxUser = 'wuic_e2e_admin',
    [string]$AsmxPassword = 'E2E_Admin123!',
    [string]$DemoUserPassword = 'FerieDemo123!'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$AppSettings = Join-Path $RepoRoot 'appsettings.json'

function Get-Cs([string]$Name) {
    $json = Get-Content -Path $AppSettings -Raw | ConvertFrom-Json
    return [string]$json.ConnectionStrings.$Name
}
function Get-Db([string]$Cs) {
    if ($Cs -match 'Initial Catalog\s*=\s*([^;]+)') { return $Matches[1].Trim() }
    if ($Cs -match 'Database\s*=\s*([^;]+)') { return $Matches[1].Trim() }
    throw 'no catalog in connection string'
}
function Exec-Sql([string]$Cs, [string]$Sql, [hashtable]$Params = @{}) {
    Add-Type -AssemblyName System.Data
    $cn = New-Object System.Data.SqlClient.SqlConnection $Cs
    $cn.Open()
    try {
        $cmd = $cn.CreateCommand(); $cmd.CommandText = $Sql; $cmd.CommandTimeout = 120
        foreach ($k in $Params.Keys) { [void]$cmd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter("@$k", [object]$Params[$k]))) }
        return $cmd.ExecuteNonQuery()
    }
    finally { $cn.Close() }
}
function Scalar-Sql([string]$Cs, [string]$Sql, [hashtable]$Params = @{}) {
    Add-Type -AssemblyName System.Data
    $cn = New-Object System.Data.SqlClient.SqlConnection $Cs
    $cn.Open()
    try {
        $cmd = $cn.CreateCommand(); $cmd.CommandText = $Sql
        foreach ($k in $Params.Keys) { [void]$cmd.Parameters.Add((New-Object System.Data.SqlClient.SqlParameter("@$k", [object]$Params[$k]))) }
        return $cmd.ExecuteScalar()
    }
    finally { $cn.Close() }
}
function New-Pbkdf2Hash([string]$Password) {
    $salt = New-Object byte[] 16
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($salt)
    $pbkdf2 = [System.Security.Cryptography.Rfc2898DeriveBytes]::new($Password, $salt, 100000, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
    try { $hash = $pbkdf2.GetBytes(32) } finally { $pbkdf2.Dispose() }
    return 'PBKDF2$' + [Convert]::ToBase64String($salt) + '$' + [Convert]::ToBase64String($hash)
}

$DataCs = Get-Cs 'DataSQLConnection'
$MetaCs = Get-Cs 'MetaDataSQLConnection'
$DataDb = Get-Db $DataCs
$MetaDb = Get-Db $MetaCs
$IsPwdEncrypted = 'true' -eq ([string](Get-Content -Path $AppSettings -Raw | ConvertFrom-Json).AppSettings.IsPwdEncripted).ToLower()
Write-Host ("DataDb={0} MetaDb={1} IsPwdEncripted={2}" -f $DataDb, $MetaDb, $IsPwdEncrypted)

# ============================================================================
# 1) RUOLI + UTENTI (riuso autista/gestore_flotta; nuovo hr_flotta + admin e2e)
# ============================================================================
function Ensure-Role([string]$Des) {
    $id = Scalar-Sql $MetaCs "SELECT id_ruolo FROM dbo.ruoli WHERE ruolo_des = @des" @{ des = $Des }
    if ($id -and $id -isnot [System.DBNull]) { return [int]$id }
    $isIdentity = Scalar-Sql $MetaCs "SELECT COLUMNPROPERTY(OBJECT_ID('dbo.ruoli'),'id_ruolo','IsIdentity')"
    if ([int]$isIdentity -eq 1) {
        Exec-Sql $MetaCs "INSERT INTO dbo.ruoli (ruolo_des, flag_web, superadmin, admin) VALUES (@des, 1, 0, 0)" @{ des = $Des } | Out-Null
    } else {
        Exec-Sql $MetaCs "INSERT INTO dbo.ruoli (id_ruolo, ruolo_des, flag_web, superadmin, admin) SELECT ISNULL(MAX(id_ruolo),0)+1, @des, 1, 0, 0 FROM dbo.ruoli" @{ des = $Des } | Out-Null
    }
    return [int](Scalar-Sql $MetaCs "SELECT id_ruolo FROM dbo.ruoli WHERE ruolo_des = @des" @{ des = $Des })
}
function Ensure-User([string]$Username, [string]$Password, [int]$RoleId, [string]$Descr, [int]$IsAdmin = 0) {
    $pwdValue = if ($IsPwdEncrypted) { New-Pbkdf2Hash $Password } else { $Password }
    $exists = Scalar-Sql $MetaCs "SELECT id_utente FROM dbo.utenti WHERE username = @u" @{ u = $Username }
    if ($exists -and $exists -isnot [System.DBNull]) {
        Exec-Sql $MetaCs "UPDATE dbo.utenti SET password=@p, isAdmin=@a, id_ruolo=@r, userdescription=@d, cancellato=0 WHERE username=@u" @{ p = $pwdValue; a = $IsAdmin; r = $RoleId; d = $Descr; u = $Username } | Out-Null
    } else {
        Exec-Sql $MetaCs "INSERT INTO dbo.utenti (username, password, isAdmin, id_ruolo, userdescription, cancellato, flag_insert_kiara) VALUES (@u, @p, @a, @r, @d, 0, 0)" @{ u = $Username; p = $pwdValue; a = $IsAdmin; r = $RoleId; d = $Descr } | Out-Null
    }
    return [int](Scalar-Sql $MetaCs "SELECT id_utente FROM dbo.utenti WHERE username = @u" @{ u = $Username })
}

$RoleAut = Ensure-Role 'autista'
$RoleMgr = Ensure-Role 'gestore_flotta'
$RoleHr  = Ensure-Role 'hr_flotta'
# admin e2e per l'esecuzione stessa dello script (idempotente)
Ensure-User $AsmxUser $AsmxPassword 1 'E2E admin (seed workflow)' 1 | Out-Null
$UserAut1 = Ensure-User 'autista1.wf' $DemoUserPassword $RoleAut 'Demo Ferie - autista 1'
$UserAut2 = Ensure-User 'autista2.wf' $DemoUserPassword $RoleAut 'Demo Ferie - autista 2'
$UserMgr  = Ensure-User 'manager.wf'  $DemoUserPassword $RoleMgr 'Demo Ferie - fleet manager'
$UserHr   = Ensure-User 'hr.wf'       $DemoUserPassword $RoleHr  'Demo Ferie - HR'
Write-Host ("Ruoli: autista={0} gestore={1} hr={2} | Utenti: {3}/{4}/{5}/{6}" -f $RoleAut, $RoleMgr, $RoleHr, $UserAut1, $UserAut2, $UserMgr, $UserHr)

# F3 - GERARCHIA: gli autisti riportano al fleet manager (upsert)
Exec-Sql $MetaCs @"
MERGE dbo._wuic_user_hierarchy AS t
USING (VALUES ($UserAut1, $UserMgr), ($UserAut2, $UserMgr)) AS s(user_id, manager_user_id)
ON t.user_id = s.user_id
WHEN MATCHED THEN UPDATE SET manager_user_id = s.manager_user_id
WHEN NOT MATCHED THEN INSERT (user_id, manager_user_id) VALUES (s.user_id, s.manager_user_id);
"@ | Out-Null
Write-Host 'Gerarchia utenti OK (autisti -> manager)'

# ============================================================================
# 2) DDL + SEED su DB Dati (pattern audit 7-colonne dell'app)
# ============================================================================
Exec-Sql $DataCs @"
SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;
IF OBJECT_ID('dbo.ferie_richieste','U') IS NULL
CREATE TABLE dbo.ferie_richieste (
  id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  conducente_id INT NULL REFERENCES dbo.conducenti(id),
  dal DATE NOT NULL,
  al DATE NOT NULL,
  giorni INT NOT NULL DEFAULT 1,
  tipo NVARCHAR(30) NOT NULL DEFAULT 'FERIE',
  stato NVARCHAR(30) NOT NULL DEFAULT 'BOZZA',
  motivo NVARCHAR(500) NULL,
  approvatore_id INT NULL,
  data_invio DATETIME NULL,
  data_approvazione DATETIME NULL,
  cancellato BIT NOT NULL DEFAULT 0,
  data_creazione DATETIME NOT NULL DEFAULT GETDATE(),
  data_modifica DATETIME NULL,
  data_eliminazione DATETIME NULL,
  utente_creazione INT NULL,
  utente_modifica INT NULL,
  utente_eliminazione INT NULL
);
"@ | Out-Null
Exec-Sql $DataCs @"
EXEC('CREATE OR ALTER VIEW dbo.wf_ferie_da_approvare AS
  SELECT id, conducente_id, dal, al, giorni, tipo, stato, motivo, approvatore_id, data_invio, utente_creazione
  FROM dbo.ferie_richieste WHERE stato = ''IN_APPROVAZIONE'' AND ISNULL(cancellato,0)=0');
EXEC('CREATE OR ALTER VIEW dbo.wf_ferie_hr AS
  SELECT id, conducente_id, dal, al, giorni, tipo, stato, motivo, approvatore_id, data_invio, utente_creazione
  FROM dbo.ferie_richieste WHERE stato = ''IN_APPROVAZIONE_HR'' AND ISNULL(cancellato,0)=0');
"@ | Out-Null
Exec-Sql $DataCs @"
IF NOT EXISTS (SELECT 1 FROM dbo.ferie_richieste)
INSERT INTO dbo.ferie_richieste (conducente_id, dal, al, giorni, tipo, stato, motivo, utente_creazione, data_invio) VALUES
 ((SELECT TOP 1 id FROM dbo.conducenti ORDER BY id), '2026-08-03', '2026-08-07',  5, N'FERIE',    N'BOZZA',            N'Settimana al mare', $UserAut1, NULL),
 ((SELECT TOP 1 id FROM dbo.conducenti ORDER BY id), '2026-09-01', '2026-09-20', 15, N'FERIE',    N'BOZZA',            N'Viaggio lungo (serve HR)', $UserAut1, NULL),
 ((SELECT TOP 1 id FROM dbo.conducenti WHERE id > (SELECT MIN(id) FROM dbo.conducenti) ORDER BY id), '2026-07-21', '2026-07-22', 2, N'PERMESSO', N'IN_APPROVAZIONE', N'Visita medica', $UserAut2, GETDATE()),
 ((SELECT TOP 1 id FROM dbo.conducenti WHERE id > (SELECT MIN(id) FROM dbo.conducenti) ORDER BY id), '2026-06-10', '2026-06-12', 3, N'FERIE',    N'APPROVATA',        NULL, $UserAut2, GETDATE());
-- normalizza assegnatario mancante sulle righe gia' in flusso
UPDATE dbo.ferie_richieste SET approvatore_id = $UserMgr
WHERE stato IN (N'IN_APPROVAZIONE', N'IN_APPROVAZIONE_HR', N'APPROVATA', N'RESPINTA') AND approvatore_id IS NULL;
"@ | Out-Null
Write-Host 'DDL + seed OK (ferie_richieste + 2 viste)'

# ============================================================================
# 3) LOGIN AsmxProxy
# ============================================================================
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginPayload = @{ user_name = $AsmxUser; password = $AsmxPassword; captchaToken = '' } | ConvertTo-Json -Compress
$user = Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/MetaService.login" -WebSession $session -ContentType 'application/json' -Body $loginPayload
if ($null -eq $user) { throw 'login null (credenziali e2e admin?)' }
Add-Type -AssemblyName System.Web
$encodedUser = [System.Web.HttpUtility]::UrlEncode(($user | ConvertTo-Json -Compress -Depth 20))
$session.Cookies.Add((New-Object System.Net.Cookie('k-user', $encodedUser, '/', 'localhost')))
Write-Host 'Login OK'

# ============================================================================
# 4) SCAFFOLD tabella + viste (trap connName) + route timeline
# ============================================================================
function Scaffold-Object([string]$Name, [bool]$IsView) {
    foreach ($cnName in @('', 'DataSQLConnection')) {
        if ($IsView) {
            $payload = @{ connection = $DataCs; connName = $cnName; db = $DataDb; view = $Name; createMenu = $false; parentMenuId = 0; provider = '' } | ConvertTo-Json -Compress
            $endpoint = 'scaffolding.scaffoldView'
        } else {
            $payload = @{ connection = $DataCs; connName = $cnName; db = $DataDb; table = $Name; createMenu = $false; parentMenuId = 0; schema = 'dbo'; provider = '' } | ConvertTo-Json -Compress
            $endpoint = 'scaffolding.scaffoldTable'
        }
        try { Invoke-RestMethod -TimeoutSec 180 -Method Post -Uri "$AsmxBase/$endpoint" -WebSession $session -ContentType 'application/json' -Body $payload | Out-Null } catch { }
        $md = Scalar-Sql $MetaCs "SELECT TOP 1 md_id FROM dbo._metadati__tabelle WHERE mdroutename = @r" @{ r = $Name }
        if ($md -and $md -isnot [System.DBNull]) { Write-Host ("scaffold {0} OK (md_id={1}, connName='{2}')" -f $Name, $md, $cnName); return [int]$md }
    }
    throw "scaffold failed for $Name"
}
$MdFerie = Scaffold-Object 'ferie_richieste' $false
$MdAppr  = Scaffold-Object 'wf_ferie_da_approvare' $true
$MdHr    = Scaffold-Object 'wf_ferie_hr' $true

function Scaffold-MetaObject([string]$Name) {
    $md = Scalar-Sql $MetaCs "SELECT TOP 1 md_id FROM dbo._metadati__tabelle WHERE mdroutename = @r" @{ r = $Name }
    if ($md -and $md -isnot [System.DBNull]) { return [int]$md }
    foreach ($cnName in @('MetaDataSQLConnection', '')) {
        $payload = @{ connection = $MetaCs; connName = $cnName; db = $MetaDb; table = $Name; createMenu = $false; parentMenuId = 0; schema = 'dbo'; provider = '' } | ConvertTo-Json -Compress
        try { Invoke-RestMethod -TimeoutSec 180 -Method Post -Uri "$AsmxBase/scaffolding.scaffoldTable" -WebSession $session -ContentType 'application/json' -Body $payload | Out-Null } catch { }
        $md = Scalar-Sql $MetaCs "SELECT TOP 1 md_id FROM dbo._metadati__tabelle WHERE mdroutename = @r" @{ r = $Name }
        if ($md -and $md -isnot [System.DBNull]) { Write-Host ("scaffold {0} OK (md_id={1}, connName='{2}')" -f $Name, $md, $cnName); return [int]$md }
    }
    Write-Warning "scaffold $Name fallito (timeline non ispezionabile da UI)"; return 0
}
$MdWfLog = Scaffold-MetaObject '_wuic_workflow_instance_log'

# ============================================================================
# 5) METADATA: display, lookup, dictionary, pk viste, multiselection, stamp
# ============================================================================
Exec-Sql $MetaCs @"
-- display string route
UPDATE dbo._metadati__tabelle SET mm_display_string = N'Richieste ferie' WHERE mdroutename = N'ferie_richieste';
UPDATE dbo._metadati__tabelle SET mm_display_string = N'Ferie da approvare' WHERE mdroutename = N'wf_ferie_da_approvare';
UPDATE dbo._metadati__tabelle SET mm_display_string = N'Approvazioni HR' WHERE mdroutename = N'wf_ferie_hr';
UPDATE dbo._metadati__tabelle SET mm_display_string = N'Storico workflow' WHERE mdroutename = N'_wuic_workflow_instance_log';
-- edit/insert su tabella; multiselection ovunque; stamp creatore/data
UPDATE dbo._metadati__tabelle SET md_editable = 1, md_insertable = 1, mdmultipleselection = 1,
  mdloggingenable = 1, mdlogginginsertuserfieldname = N'utente_creazione', mdlogginginsertdatefieldname = N'data_creazione'
WHERE mdroutename = N'ferie_richieste';
UPDATE dbo._metadati__tabelle SET mdmultipleselection = 1 WHERE mdroutename IN (N'wf_ferie_da_approvare', N'wf_ferie_hr');
"@ | Out-Null

Exec-Sql $MetaCs @"
-- display string colonne (tutte le route ferie)
UPDATE c SET c.mc_display_string_in_view = d.disp, c.mc_display_string_in_edit = d.disp
FROM dbo._metadati__colonne c
JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
CROSS APPLY (SELECT CASE c.mc_nome_colonna
  WHEN N'conducente_id' THEN N'Conducente'
  WHEN N'dal' THEN N'Dal' WHEN N'al' THEN N'Al' WHEN N'giorni' THEN N'Giorni'
  WHEN N'tipo' THEN N'Tipo' WHEN N'stato' THEN N'Stato' WHEN N'motivo' THEN N'Motivo'
  WHEN N'approvatore_id' THEN N'Approvatore'
  WHEN N'data_invio' THEN N'Inviata il' WHEN N'data_approvazione' THEN N'Approvata il'
  WHEN N'utente_creazione' THEN N'Richiedente'
  ELSE NULL END AS disp) d
WHERE t.mdroutename IN (N'ferie_richieste', N'wf_ferie_da_approvare', N'wf_ferie_hr') AND d.disp IS NOT NULL;

-- colonne audit nascoste sulla tabella
UPDATE c SET c.mchideinlist = 1, c.mchideinedit = 1
FROM dbo._metadati__colonne c JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename = N'ferie_richieste'
  AND c.mc_nome_colonna IN (N'cancellato', N'data_modifica', N'data_eliminazione', N'utente_modifica', N'utente_eliminazione');
-- campi gestiti dal flusso: visibili in lista, NON editabili a mano
UPDATE c SET c.mchideinedit = 1
FROM dbo._metadati__colonne c JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename = N'ferie_richieste'
  AND c.mc_nome_colonna IN (N'stato', N'approvatore_id', N'data_invio', N'data_approvazione', N'utente_creazione', N'data_creazione');

-- lookup conducente_id -> conducenti (voa_class=2 obbligatorio)
UPDATE c SET c.mc_ui_column_type = N'lookupByID', c.voa_class = 2,
  c.mcuilookupentityname = N'conducenti', c.mcuilookupdata_value_field = N'id', c.mcuilookupdata_text_field = N'cognome'
FROM dbo._metadati__colonne c JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename IN (N'ferie_richieste', N'wf_ferie_da_approvare', N'wf_ferie_hr') AND c.mc_nome_colonna = N'conducente_id';

-- stato: dictionary
UPDATE c SET c.mc_ui_column_type = N'dictionary',
  c.mcdictionaryvalue = N'BOZZA,IN_APPROVAZIONE,IN_APPROVAZIONE_HR,APPROVATA,RESPINTA'
FROM dbo._metadati__colonne c JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename = N'ferie_richieste' AND c.mc_nome_colonna = N'stato';
-- tipo: dictionary
UPDATE c SET c.mc_ui_column_type = N'dictionary', c.mcdictionaryvalue = N'FERIE,PERMESSO,MALATTIA'
FROM dbo._metadati__colonne c JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename = N'ferie_richieste' AND c.mc_nome_colonna = N'tipo';

-- pk sulle viste (is-selected-row + edit-by-id)
UPDATE c SET c.mc_is_primary_key = 1
FROM dbo._metadati__colonne c JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename IN (N'wf_ferie_da_approvare', N'wf_ferie_hr') AND c.mc_nome_colonna = N'id';
"@ | Out-Null
Write-Host 'Metadata OK (display, lookup, dictionary, stamp creatore)'

# permessi fisici: SOLO nel bundle del grafo (overlay). Cleanup di residui:
Exec-Sql $MetaCs @"
DELETE FROM dbo._mtdt__tnt__trzzzioni__tabelle
WHERE ruoloid IN ($RoleAut, $RoleMgr, $RoleHr) AND md_id IN ($MdFerie, $MdAppr, $MdHr);
"@ | Out-Null

# ============================================================================
# 6) FLUSH + tableMetadata IDRATATO (bool 1/0) per i bundle
# ============================================================================
Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/MetaService.invalidateMetadataRuntime" -WebSession $session -ContentType 'application/json' -Body '{"clearAll":true}' | Out-Null

function Get-HydratedTableMetadata([string]$Route) {
    $body = @{ route = $Route; lookup_table_id = 0; user_id = ''; dm = 0; md_id = '' } | ConvertTo-Json -Compress
    $resp = Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/MetaService.getTableMetadata" -WebSession $session -ContentType 'application/json' -Body $body
    $tm = [ordered]@{}
    $defaults = $resp.__defaults.table
    if ($defaults) { foreach ($p in $defaults.PSObject.Properties) { $tm[$p.Name] = $p.Value } }
    $delta = $null
    if ($resp.columnMetadata -and @($resp.columnMetadata).Count -gt 0) { $delta = @($resp.columnMetadata)[0]._Metadati_Tabelle }
    if ($delta) {
        foreach ($p in $delta.PSObject.Properties) {
            if ($p.Name -like '_Metadati_*' -or $p.Name -in @('skipColumns', 'skipAuthsAndStyles')) { continue }
            $tm[$p.Name] = $p.Value
        }
    }
    if ($tm.Count -eq 0) { throw "getTableMetadata: tableMetadata vuoto per route '$Route'" }
    if (-not $tm['md_route_name']) { $tm['md_route_name'] = $Route }
    foreach ($k in @($tm.Keys)) { if ($tm[$k] -is [bool]) { $tm[$k] = $(if ($tm[$k]) { 1 } else { 0 }) } }
    return $tm
}

function New-TablePerm([int]$Id, [int]$RoleId, [bool]$View, [bool]$Edit, [bool]$Insert, [bool]$Delete, [bool]$OverrideRecordRestriction = $false) {
    $b = { param($v) if ($v) { 1 } else { 0 } }
    return @{ muat_id = $Id; ruolo_id = "$RoleId"; utente_id = ''; muat_view = (& $b $View); muat_edit = (& $b $Edit); muat_insert = (& $b $Insert); muat_delete = (& $b $Delete); muat_override_record_restriction = (& $b $OverrideRecordRestriction) }
}
function New-Bundle([string]$Route, [string]$Display, [array]$Actions, [array]$TablePerms = @(), [array]$ColPerms = @()) {
    $tm = Get-HydratedTableMetadata $Route
    $tm['md_display_string'] = $Display
    return @{
        route = $Route
        tableMetadata = $tm
        columnMetadata = @(); columnActions = @()
        tableActions = $Actions
        tablePermissions = $TablePerms
        columnPermissions = $ColPerms
        tableStyles = @(); columnStyles = @()
    }
}

# ============================================================================
# 7) CALLBACK azioni (batch multi-selezione, routeContext = workflow-action)
# ============================================================================
$ctx = "routeContext: JSON.stringify(wtoolbox.buildCrudRouteContext('ferie_richieste', 'list', 'workflow-action'))"

$cbInvia = @"
// Invia la richiesta: BOZZA/RESPINTA -> IN_APPROVAZIONE. L'APPROVATORE non
// viene scelto qui: lo risolve il SERVER (F3, manager del richiedente via
// _wuic_user_hierarchy - bundle md_workflow_assignee_resolver).
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'warn', summary: 'Seleziona una richiesta', life: 4000 }); resolve(); return; }
const rows = selected.map(function (r) { return wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; });
const invalid = rows.filter(function (r) { const s = String(r.stato); return s !== 'BOZZA' && s !== 'RESPINTA'; });
if (invalid.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'warn', summary: 'Solo richieste in BOZZA o RESPINTA', detail: 'Righe: ' + invalid.map(function (r) { return r.id; }).join(', '), life: 5000 }); resolve(); return; }
const apiBaseRaw = wtoolbox.appSettings?.api_url || (window.location.origin + '/api/');
const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw : (apiBaseRaw + '/');
const items = [];
for (const row of rows) {
  const entity = Object.assign({}, row, { stato: 'IN_APPROVAZIONE', data_invio: new Date().toISOString(), approvatore_id: null });
  await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.updateRecord', { entity: entity, route: 'ferie_richieste', user_id: '', $ctx }).toPromise();
  items.push({ id: row.id, giorni: row.giorni, utente_creazione: row.utente_creazione });
}
if (datasource.fetchData) { await datasource.fetchData(); }
wtoolbox.messageNotificationService?.add?.({ severity: 'success', summary: items.length + ' richieste inviate', life: 4000 });
resolve(items.length === 1 ? items[0] : items);
"@

$cbApprovaMgr = @"
// Approvazione MANAGER: se giorni > 10 passa al 2° livello HR, altrimenti APPROVATA.
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'warn', summary: 'Seleziona una richiesta', life: 4000 }); resolve(); return; }
const rows = selected.map(function (r) { return wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; });
const apiBaseRaw = wtoolbox.appSettings?.api_url || (window.location.origin + '/api/');
const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw : (apiBaseRaw + '/');
const items = [];
for (const row of rows) {
  const toHr = Number(row.giorni) > 10;
  const entity = Object.assign({}, row, toHr
    ? { stato: 'IN_APPROVAZIONE_HR' }
    : { stato: 'APPROVATA', data_approvazione: new Date().toISOString() });
  await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.updateRecord', { entity: entity, route: 'ferie_richieste', user_id: '', $ctx }).toPromise();
  items.push({ id: row.id, giorni: row.giorni, utente_creazione: row.utente_creazione, stato_nuovo: toHr ? 'IN_APPROVAZIONE_HR' : 'APPROVATA' });
}
if (datasource.fetchData) { await datasource.fetchData(); }
wtoolbox.messageNotificationService?.add?.({ severity: 'success', summary: items.length + ' richieste lavorate', life: 4000 });
resolve(items.length === 1 ? items[0] : items);
"@

$cbRespingi = @"
// Respinta (manager o HR): una motivazione per il lotto.
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'warn', summary: 'Seleziona una richiesta', life: 4000 }); resolve(); return; }
const rows = selected.map(function (r) { return wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; });
const rec = await wtoolbox.promptDialog('Motivo del rifiuto', [{ name: 'motivo', caption: 'Motivo', type: 'txt_area', required: true }], null, '480px');
if (!rec) { resolve(); return; }
const motivo = String(rec.motivo?.value || '').trim();
const apiBaseRaw = wtoolbox.appSettings?.api_url || (window.location.origin + '/api/');
const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw : (apiBaseRaw + '/');
const items = [];
for (const row of rows) {
  const entity = Object.assign({}, row, { stato: 'RESPINTA', motivo: ((row.motivo ? row.motivo + ' | ' : '') + 'Respinta: ' + motivo) });
  await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.updateRecord', { entity: entity, route: 'ferie_richieste', user_id: '', $ctx }).toPromise();
  items.push({ id: row.id, utente_creazione: row.utente_creazione, motivo: motivo });
}
if (datasource.fetchData) { await datasource.fetchData(); }
wtoolbox.messageNotificationService?.add?.({ severity: 'success', summary: items.length + ' richieste respinte', life: 4000 });
resolve(items.length === 1 ? items[0] : items);
"@

$cbApprovaHr = @"
// Approvazione definitiva HR (richieste > 10 giorni).
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'warn', summary: 'Seleziona una richiesta', life: 4000 }); resolve(); return; }
const rows = selected.map(function (r) { return wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; });
const apiBaseRaw = wtoolbox.appSettings?.api_url || (window.location.origin + '/api/');
const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw : (apiBaseRaw + '/');
const items = [];
for (const row of rows) {
  const entity = Object.assign({}, row, { stato: 'APPROVATA', data_approvazione: new Date().toISOString() });
  await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.updateRecord', { entity: entity, route: 'ferie_richieste', user_id: '', $ctx }).toPromise();
  items.push({ id: row.id, utente_creazione: row.utente_creazione });
}
if (datasource.fetchData) { await datasource.fetchData(); }
wtoolbox.messageNotificationService?.add?.({ severity: 'success', summary: items.length + ' richieste approvate', life: 4000 });
resolve(items.length === 1 ? items[0] : items);
"@

# disable: attive solo con selezione nello stato giusto
$dcInvia = @"
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { return true; }
return selected.some(function (r) { const row = wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; const s = String(row.stato); return s !== 'BOZZA' && s !== 'RESPINTA'; });
"@
$dcStato = @"
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { return true; }
return selected.some(function (r) { const row = wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; return String(row.stato) !== '__STATO__'; });
"@
$dcMgr = $dcStato.Replace('__STATO__', 'IN_APPROVAZIONE')
$dcHr  = $dcStato.Replace('__STATO__', 'IN_APPROVAZIONE_HR')

# notifiche interne (payload singolo o array)
$cbNotifManager = @"
// Notifica al MANAGER (ruolo): nuove richieste da approvare.
const list = (Array.isArray(payload) ? payload : [payload]).filter(Boolean);
if (!list.length) { return payload; }
await wtoolbox.enqueueNotification({ roleId: $RoleMgr, message: 'Richieste ferie da approvare: ' + list.map(function (x) { return '#' + x.id; }).join(', '), type: 'workflow' });
return payload;
"@
$cbNotifEsito = @"
// Notifica ESITO al richiedente (raggruppata per utente).
const list = (Array.isArray(payload) ? payload : [payload]).filter(Boolean);
if (!list.length) { return payload; }
const byUser = {};
list.forEach(function (x) { const u = Number(x.utente_creazione || 0); if (!u) return; (byUser[u] = byUser[u] || []).push('#' + x.id); });
for (const u of Object.keys(byUser)) {
  await wtoolbox.enqueueNotification({ userId: Number(u), message: 'Richieste ferie aggiornate: ' + byUser[u].join(', '), type: 'workflow' });
}
return payload;
"@
$cbNotifHr = @"
// Notifica a HR: richieste lunghe in attesa di 2° livello.
const list = (Array.isArray(payload) ? payload : [payload]).filter(Boolean).filter(function (x) { return x.stato_nuovo === 'IN_APPROVAZIONE_HR'; });
if (!list.length) { return payload; }
await wtoolbox.enqueueNotification({ roleId: $RoleHr, message: 'Richieste ferie >10gg da validare: ' + list.map(function (x) { return '#' + x.id; }).join(', '), type: 'workflow' });
return payload;
"@

# ============================================================================
# 8) BUNDLE route (permessi + F2/F3 metadati workflow)
# ============================================================================
$bundleFerie = New-Bundle 'ferie_richieste' 'Richieste ferie' @(
    @{ Id = 1; md_id = $MdFerie; md_action_type = 5; ordine = 10; button_caption = 'Invia richiesta'; button_image = 'pi pi-send'; button_template = ''; action_callback = $cbInvia; disable_callback = $dcInvia }
) @(
    (New-TablePerm 1 $RoleAut $true $true $true $false $false),
    (New-TablePerm 2 $RoleMgr $true $false $false $false $true),
    (New-TablePerm 3 $RoleHr  $true $false $false $false $true)
)
# F2 - timeline; F3 - assegnazione dinamica (manager del creatore); restriction personale
$bundleFerie.tableMetadata.md_workflow_state_field = 'stato'
$bundleFerie.tableMetadata.md_workflow_assignee_resolver = 'manager_of:utente_creazione'
$bundleFerie.tableMetadata.md_workflow_assignee_field = 'approvatore_id'
$bundleFerie.tableMetadata.md_record_restriction_key_user_field_list = 'id_utente'

$bundleAppr = New-Bundle 'wf_ferie_da_approvare' 'Ferie da approvare' @(
    @{ Id = 1; md_id = $MdAppr; md_action_type = 5; ordine = 10; button_caption = 'Approva'; button_image = 'pi pi-check'; button_template = ''; action_callback = $cbApprovaMgr; disable_callback = $dcMgr },
    @{ Id = 2; md_id = $MdAppr; md_action_type = 5; ordine = 20; button_caption = 'Respingi'; button_image = 'pi pi-times'; button_template = ''; action_callback = $cbRespingi; disable_callback = $dcMgr }
) @(
    (New-TablePerm 1 $RoleAut $true $false $false $false),
    (New-TablePerm 2 $RoleMgr $true $false $false $false),
    (New-TablePerm 3 $RoleHr  $true $false $false $false)
)
# CODA PERSONALE del manager (F4: la delega estende il filtro ai deleganti)
$bundleAppr.tableMetadata.md_record_restriction_key_user_field_list = 'approvatore_id'
# F1 - lo state field serve anche sul bundle della VISTA: la proiezione del
# timer collegato a questo route-node lo legge da qui.
$bundleAppr.tableMetadata.md_workflow_state_field = 'stato'

$bundleHr = New-Bundle 'wf_ferie_hr' 'Approvazioni HR' @(
    @{ Id = 1; md_id = $MdHr; md_action_type = 5; ordine = 10; button_caption = 'Approva (HR)'; button_image = 'pi pi-check-circle'; button_template = ''; action_callback = $cbApprovaHr; disable_callback = $dcHr },
    @{ Id = 2; md_id = $MdHr; md_action_type = 5; ordine = 20; button_caption = 'Respingi (HR)'; button_image = 'pi pi-times'; button_template = ''; action_callback = $cbRespingi; disable_callback = $dcHr }
) @(
    (New-TablePerm 1 $RoleMgr $true $false $false $false),
    (New-TablePerm 2 $RoleHr  $true $false $false $false)
)

# ============================================================================
# 9) START MENU (badge F8) + GRAFO (nodi, timer F1, archi gated, transizioni)
# ============================================================================
function New-StartMenu([int]$Id, [string]$Caption, [string]$Uri, [int]$Ordine, [array]$RoleIds, [bool]$VisibleDefault) {
    $auth = @(); $seq = 1
    foreach ($r in $RoleIds) { $auth += @{ mmid = $Id; muamid = $seq; muamview = 1; ruoloid = $r; utenteid = 0 }; $seq++ }
    return @{
        mm_id = $Id; mm_parent_id = 0; mm_nome_menu = "wfferie_menu_$Id"
        mm_display_string_menu = $Caption; mm_tooltip_menu = $Caption
        mm_uri_menu = $Uri; mm_ordine = $Ordine
        mm_is_visible_by_default = $VisibleDefault
        _Metadati_Utenti_Autorizzazioni_Menus = $auth
    }
}
$startMenus = @(
    (New-StartMenu 9101 'Le mie richieste' '/ferie_richieste/list'       10 @($RoleAut, 1) $false),
    (New-StartMenu 9102 'Da approvare'     '/wf_ferie_da_approvare/list' 20 @($RoleMgr, 1) $false),
    (New-StartMenu 9103 'Approvazioni HR'  '/wf_ferie_hr/list'           30 @($RoleHr, 1)  $false)
)
$startMenus[1].mm_badge_route = 'wf_ferie_da_approvare'
$startMenus[2].mm_badge_route = 'wf_ferie_hr'
if ($MdWfLog -gt 0) { $startMenus += (New-StartMenu 9104 'Storico workflow' '/_wuic_workflow_instance_log/list' 40 @(1) $false) }

function New-Node([string]$Id, [string]$Label, [string]$Type, [hashtable]$Extra = @{}, [int]$X = 0, [int]$Y = 0) {
    $n = @{ id = $Id; label = $Label; type = $Type; route = ''; action = ''; x = $X; y = $Y }
    foreach ($k in $Extra.Keys) { $n[$k] = $Extra[$k] }
    return $n
}
$GraphKey  = 'wf_ferie'
$GraphName = 'Richiesta Ferie Conducenti'

$nodes = @(
    (New-Node 'n_start' 'Start - Ferie' 'start' @{ startMenus = $startMenus; startMenuCaption = 'Gestione Ferie'; startExclusiveMenu = $true; startShowExit = $true; startInheritMetadata = $false } 60 300),
    (New-Node 'n_rich' 'ferie_richieste/list' 'route' @{ route = 'ferie_richieste'; action = 'list'; routeSourceType = 'route' } 320 300),
    (New-Node 'a_invia' 'Invia richiesta' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_rich'; metadataTargetType = 'table_action'; metadataTargetId = 1 } 600 300),
    (New-Node 'i_notif_mgr' 'Notifica manager' 'action' @{ actionTypeId = 100; actionType = 'workflow.notification'; actionScopeId = 2; actionScope = 'internal'; actionCallback = $cbNotifManager } 850 160),
    (New-Node 'n_appr' 'wf_ferie_da_approvare/list' 'route' @{ route = 'wf_ferie_da_approvare'; action = 'list'; routeSourceType = 'route' } 880 300),
    (New-Node 't_sla' 'Timer 48h' 'timer' @{ timerConfig = @{ state_field = 'stato'; state_value = 'IN_APPROVAZIONE'; reference_date_field = 'data_invio'; duration_minutes = 2880; action = 'notify_role'; target = "$RoleMgr"; message = 'Richiesta ferie in attesa da oltre 48h' } } 880 470),
    (New-Node 'a_appr_mgr' 'Approva' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_appr'; metadataTargetType = 'table_action'; metadataTargetId = 1 } 1180 220),
    (New-Node 'a_resp_mgr' 'Respingi' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_appr'; metadataTargetType = 'table_action'; metadataTargetId = 2 } 1180 420),
    (New-Node 'c_lunga' 'Condition' 'condition' @{ conditionExpression = 'Number(record.giorni) > 10' } 1450 220),
    (New-Node 'i_notif_hr' 'Notifica HR' 'action' @{ actionTypeId = 100; actionType = 'workflow.notification'; actionScopeId = 2; actionScope = 'internal'; actionCallback = $cbNotifHr } 1700 120),
    (New-Node 'n_hr' 'wf_ferie_hr/list' 'route' @{ route = 'wf_ferie_hr'; action = 'list'; routeSourceType = 'route' } 1700 260),
    (New-Node 'a_appr_hr' 'Approva (HR)' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_hr'; metadataTargetType = 'table_action'; metadataTargetId = 1 } 1980 200),
    (New-Node 'a_resp_hr' 'Respingi (HR)' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_hr'; metadataTargetType = 'table_action'; metadataTargetId = 2 } 1980 380),
    (New-Node 'i_notif_esito' 'Notifica esito' 'action' @{ actionTypeId = 100; actionType = 'workflow.notification'; actionScopeId = 2; actionScope = 'internal'; actionCallback = $cbNotifEsito } 2250 300),
    (New-Node 'n_end' 'End' 'end' @{} 2500 300)
)

function New-Conn([string]$Id, [string]$Src, [string]$SrcOut, [string]$Tgt, [string]$TgtIn, [hashtable]$Trans = @{}) {
    $c = @{ id = $Id; source = $Src; sourceOutput = $SrcOut; target = $Tgt; targetInput = $TgtIn }
    foreach ($k in $Trans.Keys) { $c[$k] = $Trans[$k] }
    return $c
}
$connections = @(
    (New-Conn 'e1'  'n_start' 'out' 'n_rich' 'in'),
    # gate: solo autisti (e admin) vedono "Invia richiesta"
    (New-Conn 'e2'  'n_rich' 'out' 'a_invia' 'in' @{ transitionPermission = "grant:role:$RoleAut,role:1"; transitionEvent = 'invia' }),
    (New-Conn 'e3'  'a_invia' 'out' 'i_notif_mgr' 'in'),
    (New-Conn 'e4'  'a_invia' 'out' 'n_appr' 'in' @{ transitionEvent = 'inviata'; transitionGuard = "record.stato === 'BOZZA' || record.stato === 'RESPINTA'" }),
    # timer 48h agganciato alla coda manager
    (New-Conn 'e5'  'n_appr' 'out' 't_sla' 'in'),
    (New-Conn 'e6'  'n_appr' 'out' 'a_appr_mgr' 'in' @{ transitionPermission = "grant:role:$RoleMgr,role:1"; transitionEvent = 'approva_mgr' }),
    (New-Conn 'e7'  'n_appr' 'out' 'a_resp_mgr' 'in' @{ transitionPermission = "grant:role:$RoleMgr,role:1"; transitionEvent = 'respingi_mgr' }),
    # condition: > 10 giorni? -> secondo livello HR, altrimenti flusso concluso
    (New-Conn 'e8'  'a_appr_mgr' 'out' 'c_lunga' 'in'),
    (New-Conn 'e9'  'c_lunga' 'true'  'n_hr' 'in' @{ transitionEvent = 'serve_hr'; transitionGuard = 'Number(record.giorni) > 10' }),
    (New-Conn 'e10' 'c_lunga' 'false' 'i_notif_esito' 'in' @{ transitionEvent = 'approvata_mgr' }),
    # ramo false: anche una ROUTE target (le guardie di navigazione vogliono un
    # cammino verso una route; la sola notifica interna non basta)
    (New-Conn 'e10b' 'c_lunga' 'false' 'n_rich' 'in'),
    (New-Conn 'e11' 'a_appr_mgr' 'out' 'i_notif_hr' 'in'),
    (New-Conn 'e12' 'a_resp_mgr' 'out' 'i_notif_esito' 'in'),
    # rework: la respinta torna al richiedente
    (New-Conn 'e13' 'a_resp_mgr' 'out' 'n_rich' 'in' @{ transitionEvent = 'respinta'; transitionGuard = "record.stato === 'IN_APPROVAZIONE'" }),
    (New-Conn 'e14' 'n_hr' 'out' 'a_appr_hr' 'in' @{ transitionPermission = "grant:role:$RoleHr,role:1"; transitionEvent = 'approva_hr' }),
    (New-Conn 'e15' 'n_hr' 'out' 'a_resp_hr' 'in' @{ transitionPermission = "grant:role:$RoleHr,role:1"; transitionEvent = 'respingi_hr' }),
    (New-Conn 'e16' 'a_appr_hr' 'out' 'i_notif_esito' 'in'),
    (New-Conn 'e17' 'a_resp_hr' 'out' 'n_rich' 'in' @{ transitionEvent = 'respinta_hr'; transitionGuard = "record.stato === 'IN_APPROVAZIONE_HR'" }),
    (New-Conn 'e18' 'a_resp_hr' 'out' 'i_notif_esito' 'in'),
    (New-Conn 'e19' 'i_notif_esito' 'out' 'n_end' 'in')
)

$graph = @{ nodes = $nodes; connections = $connections }
$graphJson = ConvertTo-Json -InputObject $graph -Compress -Depth 24

$routeMetadata = @(
    @{ node_id = 'n_rich'; route_name = 'ferie_richieste';       route_action = 'list'; metadata_json = (ConvertTo-Json -InputObject $bundleFerie -Compress -Depth 12) },
    @{ node_id = 'n_appr'; route_name = 'wf_ferie_da_approvare'; route_action = 'list'; metadata_json = (ConvertTo-Json -InputObject $bundleAppr -Compress -Depth 12) },
    @{ node_id = 'n_hr';   route_name = 'wf_ferie_hr';           route_action = 'list'; metadata_json = (ConvertTo-Json -InputObject $bundleHr -Compress -Depth 12) }
)
$routeMetadataJson = ConvertTo-Json -InputObject $routeMetadata -Compress -Depth 6
$savePayload = @{ user_id = ''; graph_key = $GraphKey; graph_name = $GraphName; graph_json = $graphJson; route_metadata_json = $routeMetadataJson } | ConvertTo-Json -Compress -Depth 4
Invoke-RestMethod -TimeoutSec 180 -Method Post -Uri "$AsmxBase/MetaService.saveWorkflowGraph" -WebSession $session -ContentType 'application/json' -Body $savePayload | Out-Null
Write-Host 'saveWorkflowGraph OK'

# transizioni proiettate (documentali)
$transitions = @()
foreach ($c in $connections) {
    if ($c.ContainsKey('transitionEvent') -or $c.ContainsKey('transitionGuard') -or $c.ContainsKey('transitionPermission')) {
        $transitions += @{
            source_node = $c.source; target_node = $c.target
            event_name = [string]($c['transitionEvent'] ?? '')
            guard_expression = [string]($c['transitionGuard'] ?? '')
            required_permission = [string]($c['transitionPermission'] ?? '')
        }
    }
}
$transPayload = @{ user_id = ''; graph_key = $GraphKey; transitionsJson = (ConvertTo-Json -InputObject $transitions -Compress -Depth 4) } | ConvertTo-Json -Compress -Depth 4
$transRes = Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/MetaService.saveWorkflowTransitions" -WebSession $session -ContentType 'application/json' -Body $transPayload
Write-Host ("saveWorkflowTransitions OK (saved={0})" -f $transRes.saved)

# versione v1 (skip se esiste; tollerante se la tabella versioni manca)
$verCount = 0
try { $verCount = [int](Scalar-Sql $MetaCs "SELECT COUNT(*) FROM dbo._wuic_workflow_graph_version WHERE wg_key=@k" @{ k = $GraphKey }) } catch { $verCount = 0 }
if ([int]$verCount -eq 0) {
    $verPayload = @{ user_id = ''; graph_key = $GraphKey; graph_json = $graphJson; graph_name = $GraphName; expected_version = '' } | ConvertTo-Json -Compress -Depth 4
    try { Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/MetaService.saveWorkflowGraphVersion" -WebSession $session -ContentType 'application/json' -Body $verPayload | Out-Null; Write-Host 'versione v1 OK' } catch { Write-Warning "saveWorkflowGraphVersion: $($_.Exception.Message)" }
} else { Write-Host "versioni gia' presenti ($verCount): skip v1" }

# ============================================================================
# 10) MENU APP + INVALIDATE
# ============================================================================
$menuExists = Scalar-Sql $MetaCs "SELECT COUNT(*) FROM dbo._metadati__menu WHERE mm_uri_menu = N'workflow-runner/wf_ferie'"
if ([int]$menuExists -eq 0) {
    Exec-Sql $MetaCs @"
DECLARE @mmid INT = (SELECT ISNULL(MAX(mm_id),0)+1 FROM dbo._metadati__menu);
DECLARE @ord INT = (SELECT ISNULL(MAX(mmordine),0)+1 FROM dbo._metadati__menu WHERE mm_parent_id IS NULL);
INSERT INTO dbo._metadati__menu (mm_id, mm_parent_id, mm_nome_menu, mm_display_string_menu, mm_tooltip_menu, mm_uri_menu, mmordine, mm_is_visible_by_default)
VALUES (@mmid, NULL, N'wf_ferie', N'Gestione Ferie (WF)', N'Workflow richiesta ferie', N'workflow-runner/wf_ferie', @ord, 1);
"@ | Out-Null
    Write-Host 'Voce menu creata'
} else { Write-Host "Voce menu gia' presente" }

Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/MetaService.invalidateMetadataRuntime" -WebSession $session -ContentType 'application/json' -Body '{"clearAll":true}' | Out-Null
$ver = Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/MetaService.getProjectMetadataVersion" -WebSession $session -ContentType 'application/json' -Body '{}'
Write-Host ("invalidate OK, version={0}" -f ($ver | ConvertTo-Json -Compress))

Write-Host ''
Write-Host '=== create-wf-ferie-demo: DONE ==='
Write-Host ("Grafo: {0} (menu 'Gestione Ferie (WF)') | Utenti demo: autista1.wf / autista2.wf / manager.wf / hr.wf (pwd: {1})" -f $GraphKey, $DemoUserPassword)
