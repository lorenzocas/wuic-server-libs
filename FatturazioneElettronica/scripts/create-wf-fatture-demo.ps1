# ============================================================================
# create-wf-fatture-demo.ps1  (FatturazioneElettronica)
#
# Workflow business "Approvazione Fatture AP" su ENTITA' ESISTENTI:
#  - fatture_ricevute (stato VARCHAR esistente: si AGGIUNGONO i valori
#    IN_APPROVAZIONE_L1 / IN_APPROVAZIONE_L2 / APPROVATA / RIFIUTATA;
#    file_xml = allegato obbligatorio, guardia F6; NIENTE colonne nuove:
#    l'approvatore/quando e' tracciato dalla timeline F2)
#  - fornitori (email/pec destinatario email F7 — seed le popola se vuote)
#  - scadenze (su APPROVATA -> INSERT scadenza pagamento: integrazione reale)
# Entita' NUOVA giustificata: ap_approval_levels (matrice soglie data-driven).
#
# Feature: chain a soglie L1->L2 (matrice), guardia allegato file_xml (F6),
# email event-driven su APPROVATA/RIFIUTATA via _wuic_mail_outbox (F7,
# status 'logged' senza SMTP), timeline F2, badge code F8, timer SLA 48h (F1).
#
# Utenti demo: contab.ap (commercialista), respacq.ap (resp_acquisti NUOVO),
# cfo.ap (imprenditore) — pwd: FattureDemo123!
# Stati: REGISTRATA -> IN_APPROVAZIONE_L1 -> [totale >= soglia L2] ->
# IN_APPROVAZIONE_L2 -> APPROVATA (+scadenza +email) / RIFIUTATA (+email).
#
# Idempotente. PRE-REQUISITO: ensure-wuic-workflow-tables.mssql.sql sul MetaDb.
# ============================================================================
param(
    [string]$AsmxBase = 'http://localhost:5400/api/Meta/AsmxProxy',
    [string]$AsmxUser = 'wuic_e2e_admin',
    [string]$AsmxPassword = 'E2E_Admin123!',
    [string]$DemoUserPassword = 'FattureDemo123!'
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
# 1) RUOLI (riuso commercialista/imprenditore + NUOVO resp_acquisti) + UTENTI
# ============================================================================
function Ensure-Role([string]$Descr) {
    $id = Scalar-Sql $MetaCs "SELECT id_ruolo FROM dbo.ruoli WHERE ruolo_des = @d" @{ d = $Descr }
    if ($id -and $id -isnot [System.DBNull]) { return [int]$id }
    Exec-Sql $MetaCs "INSERT INTO dbo.ruoli (ruolo_des, flag_web, superadmin, admin) VALUES (@d, 1, 0, 0)" @{ d = $Descr } | Out-Null
    return [int](Scalar-Sql $MetaCs "SELECT id_ruolo FROM dbo.ruoli WHERE ruolo_des = @d" @{ d = $Descr })
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

$RoleContab = [int](Scalar-Sql $MetaCs "SELECT id_ruolo FROM dbo.ruoli WHERE ruolo_des = 'commercialista'")
$RoleCfo    = [int](Scalar-Sql $MetaCs "SELECT id_ruolo FROM dbo.ruoli WHERE ruolo_des = 'imprenditore'")
if (-not $RoleContab -or -not $RoleCfo) { throw 'ruoli commercialista/imprenditore non trovati' }
$RoleRespAcq = Ensure-Role 'resp_acquisti'
Ensure-User $AsmxUser $AsmxPassword 1 'E2E admin (seed workflow)' 1 | Out-Null
$UserContab  = Ensure-User 'contab.ap'  $DemoUserPassword $RoleContab  'Demo AP - contabilita'
$UserRespAcq = Ensure-User 'respacq.ap' $DemoUserPassword $RoleRespAcq 'Demo AP - resp. acquisti'
$UserCfo     = Ensure-User 'cfo.ap'     $DemoUserPassword $RoleCfo     'Demo AP - CFO'
Write-Host ("Ruoli: contab={0} respacq={1} cfo={2} | Utenti: {3}/{4}/{5}" -f $RoleContab, $RoleRespAcq, $RoleCfo, $UserContab, $UserRespAcq, $UserCfo)

# ============================================================================
# 2) MATRICE SOGLIE (unica entita' nuova) + email fornitori + fatture demo
# ============================================================================
Exec-Sql $DataCs @"
IF OBJECT_ID('dbo.ap_approval_levels','U') IS NULL
CREATE TABLE dbo.ap_approval_levels (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    livello INT NOT NULL,
    soglia_min DECIMAL(18,4) NOT NULL,
    soglia_max DECIMAL(18,4) NULL,
    ruolo_id INT NOT NULL,
    descrizione VARCHAR(200) NULL
);
"@ | Out-Null
Exec-Sql $DataCs @"
IF NOT EXISTS (SELECT 1 FROM dbo.ap_approval_levels)
INSERT INTO dbo.ap_approval_levels (livello, soglia_min, soglia_max, ruolo_id, descrizione)
VALUES (1, 0, 1999.99, @r1, 'Approvazione resp. acquisti (fino a 2.000)'),
       (2, 2000, NULL, @r2, 'Approvazione CFO (da 2.000 in su)');
"@ @{ r1 = $RoleRespAcq; r2 = $RoleCfo } | Out-Null

# email demo sui fornitori usati (F7)
Exec-Sql $DataCs @"
UPDATE dbo.fornitori SET email = LOWER(REPLACE(ragione_sociale,' ','.')) + '@pec.demo.local'
WHERE (email IS NULL OR email = '') AND id IN (SELECT DISTINCT fornitore_id FROM dbo.fatture_ricevute WHERE cancellato = 0);
"@ | Out-Null

# fatture demo dedicate al WF (3 con XML, 1 senza per la guardia F6)
Exec-Sql $DataCs @"
IF NOT EXISTS (SELECT 1 FROM dbo.fatture_ricevute WHERE numero_fornitore LIKE 'WF-AP-%')
INSERT INTO dbo.fatture_ricevute
    (numero_fornitore, progressivo_interno, anno, data_documento, data_ricezione, fornitore_id, pagamento_id,
     causale, imponibile, iva, totale, iva_indetraibile, stato, stato_sdi, file_xml, note, cancellato,
     data_creazione, data_modifica, utente_creazione, utente_modifica)
SELECT v.nf, 9000 + v.n, YEAR(GETDATE()), CAST(GETDATE() AS date), CAST(GETDATE() AS date),
       f.fornitore_id, f.pagamento_id, v.causale, v.imponibile, v.iva, v.totale, 0,
       'REGISTRATA', 'RICEVUTA', v.fx, '', 0, GETDATE(), GETDATE(), f.utente_creazione, f.utente_creazione
FROM (SELECT TOP 1 fornitore_id, pagamento_id, utente_creazione FROM dbo.fatture_ricevute WHERE cancellato = 0 ORDER BY id DESC) f
CROSS JOIN (VALUES
    (1, 'WF-AP-101', 'Cancelleria Q3',        409.84, 90.16, 500.00,  'upload/wf-ap-101.xml'),
    (2, 'WF-AP-102', 'Manutenzione impianti', 1229.51, 270.49, 1500.00, 'upload/wf-ap-102.xml'),
    (3, 'WF-AP-103', 'Consulenza ERP',        4016.39, 883.61, 4900.00, 'upload/wf-ap-103.xml'),
    (4, 'WF-AP-104', 'Trasporti (no XML)',    655.74, 144.26, 800.00,  '')
) v(n, nf, causale, imponibile, iva, totale, fx);
"@ | Out-Null

# ============================================================================
# 3) VISTE code (riuso fatture_ricevute + fornitori.email)
# ============================================================================
Exec-Sql $DataCs @"
EXEC('CREATE OR ALTER VIEW dbo.wf_ap_da_inviare AS
  SELECT fr.id, fr.numero_fornitore, fr.data_documento, fr.causale, fr.totale, fr.stato,
         fr.file_xml, fr.fornitore_id, fo.ragione_sociale AS fornitore, fo.email AS fornitore_email, fr.note
  FROM dbo.fatture_ricevute fr
  JOIN dbo.fornitori fo ON fo.id = fr.fornitore_id
  WHERE fr.stato IN (''NON_LETTA'', ''REGISTRATA'', ''RIFIUTATA'') AND fr.cancellato = 0');
EXEC('CREATE OR ALTER VIEW dbo.wf_ap_l1 AS
  SELECT fr.id, fr.numero_fornitore, fr.data_documento, fr.causale, fr.totale, fr.stato,
         fr.file_xml, fr.fornitore_id, fo.ragione_sociale AS fornitore, fo.email AS fornitore_email, fr.data_modifica
  FROM dbo.fatture_ricevute fr
  JOIN dbo.fornitori fo ON fo.id = fr.fornitore_id
  WHERE fr.stato = ''IN_APPROVAZIONE_L1'' AND fr.cancellato = 0');
EXEC('CREATE OR ALTER VIEW dbo.wf_ap_l2 AS
  SELECT fr.id, fr.numero_fornitore, fr.data_documento, fr.causale, fr.totale, fr.stato,
         fr.file_xml, fr.fornitore_id, fo.ragione_sociale AS fornitore, fo.email AS fornitore_email, fr.data_modifica
  FROM dbo.fatture_ricevute fr
  JOIN dbo.fornitori fo ON fo.id = fr.fornitore_id
  WHERE fr.stato = ''IN_APPROVAZIONE_L2'' AND fr.cancellato = 0');
"@ | Out-Null
Write-Host 'Matrice soglie + viste + fatture demo OK'

# ============================================================================
# 4) LOGIN + SCAFFOLD
# ============================================================================
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginPayload = @{ user_name = $AsmxUser; password = $AsmxPassword; captchaToken = '' } | ConvertTo-Json -Compress
$user = Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/MetaService.login" -WebSession $session -ContentType 'application/json' -Body $loginPayload
if ($null -eq $user) { throw 'login null' }
Add-Type -AssemblyName System.Web
$encodedUser = [System.Web.HttpUtility]::UrlEncode(($user | ConvertTo-Json -Compress -Depth 20))
$session.Cookies.Add((New-Object System.Net.Cookie('k-user', $encodedUser, '/', 'localhost')))
Write-Host 'Login OK'

function Scaffold-Object([string]$Name, [bool]$IsView) {
    $md = Scalar-Sql $MetaCs "SELECT TOP 1 md_id FROM dbo._metadati__tabelle WHERE mdroutename = @r" @{ r = $Name }
    if ($md -and $md -isnot [System.DBNull]) { return [int]$md }
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
        if ($md -and $md -isnot [System.DBNull]) { Write-Host ("scaffold {0} OK (md_id={1})" -f $Name, $md); return [int]$md }
    }
    throw "scaffold failed for $Name"
}
function Scaffold-MetaObject([string]$Name) {
    $md = Scalar-Sql $MetaCs "SELECT TOP 1 md_id FROM dbo._metadati__tabelle WHERE mdroutename = @r" @{ r = $Name }
    if ($md -and $md -isnot [System.DBNull]) { return [int]$md }
    foreach ($cnName in @('MetaDataSQLConnection', '')) {
        $payload = @{ connection = $MetaCs; connName = $cnName; db = $MetaDb; table = $Name; createMenu = $false; parentMenuId = 0; schema = 'dbo'; provider = '' } | ConvertTo-Json -Compress
        try { Invoke-RestMethod -TimeoutSec 180 -Method Post -Uri "$AsmxBase/scaffolding.scaffoldTable" -WebSession $session -ContentType 'application/json' -Body $payload | Out-Null } catch { }
        $md = Scalar-Sql $MetaCs "SELECT TOP 1 md_id FROM dbo._metadati__tabelle WHERE mdroutename = @r" @{ r = $Name }
        if ($md -and $md -isnot [System.DBNull]) { Write-Host ("scaffold {0} OK (md_id={1})" -f $Name, $md); return [int]$md }
    }
    Write-Warning "scaffold $Name fallito"; return 0
}
$MdFatture = Scaffold-Object 'fatture_ricevute' $false     # gia' scaffoldata: riuso md_id
$MdInviare = Scaffold-Object 'wf_ap_da_inviare' $true
$MdL1      = Scaffold-Object 'wf_ap_l1' $true
$MdL2      = Scaffold-Object 'wf_ap_l2' $true
$MdLevels  = Scaffold-Object 'ap_approval_levels' $false
$MdScad    = Scaffold-Object 'scadenze' $false
$MdWfLog   = Scaffold-MetaObject '_wuic_workflow_instance_log'
$MdOutbox  = Scaffold-MetaObject '_wuic_mail_outbox'

# ============================================================================
# 5) METADATA (display, pk viste, multiselection) + traduzione tipo azione 101
# ============================================================================
Exec-Sql $MetaCs @"
UPDATE dbo._metadati__tabelle SET mm_display_string = N'Fatture da inviare' WHERE mdroutename = N'wf_ap_da_inviare';
UPDATE dbo._metadati__tabelle SET mm_display_string = N'Approvazioni L1' WHERE mdroutename = N'wf_ap_l1';
UPDATE dbo._metadati__tabelle SET mm_display_string = N'Approvazioni L2 (CFO)' WHERE mdroutename = N'wf_ap_l2';
UPDATE dbo._metadati__tabelle SET mm_display_string = N'Matrice soglie AP' WHERE mdroutename = N'ap_approval_levels';
UPDATE dbo._metadati__tabelle SET mm_display_string = N'Storico workflow' WHERE mdroutename = N'_wuic_workflow_instance_log';
UPDATE dbo._metadati__tabelle SET mm_display_string = N'Outbox email' WHERE mdroutename = N'_wuic_mail_outbox';
UPDATE dbo._metadati__tabelle SET mdmultipleselection = 1 WHERE mdroutename IN (N'wf_ap_da_inviare', N'wf_ap_l1', N'wf_ap_l2');
UPDATE c SET c.mc_is_primary_key = 1
FROM dbo._metadati__colonne c JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename IN (N'wf_ap_da_inviare', N'wf_ap_l1', N'wf_ap_l2') AND c.mc_nome_colonna = N'id';
"@ | Out-Null
Exec-Sql $MetaCs @"
DELETE FROM dbo._mtdt__tnt__trzzzioni__tabelle
WHERE ruoloid IN ($RoleContab, $RoleRespAcq, $RoleCfo) AND md_id IN ($MdFatture, $MdInviare, $MdL1, $MdL2);
"@ | Out-Null
# chiave i18n del nuovo tipo azione interna 101 (designer)
Exec-Sql $MetaCs @"
MERGE dbo._wuic_translations AS t
USING (VALUES
    (N'workflow.action_type.email', N'it-IT', N'Email'),
    (N'workflow.action_type.email', N'en-US', N'Email'),
    (N'workflow.action_type.email', N'fr-FR', N'E-mail'),
    (N'workflow.action_type.email', N'es-ES', N'Correo'),
    (N'workflow.action_type.email', N'de-DE', N'E-Mail')
) AS s(k, lang, val) ON t.resource = s.k AND t.language = s.lang
WHEN MATCHED THEN UPDATE SET t.translation = s.val
WHEN NOT MATCHED THEN INSERT (resource, language, translation) VALUES (s.k, s.lang, s.val);
"@ | Out-Null
Write-Host 'Metadata + traduzioni OK'

# ============================================================================
# 6) FLUSH + bundle idratati (bool 1/0)
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
    if ($tm.Count -eq 0) { throw "tableMetadata vuoto per '$Route'" }
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
        route = $Route; tableMetadata = $tm
        columnMetadata = @(); columnActions = @()
        tableActions = $Actions; tablePermissions = $TablePerms; columnPermissions = $ColPerms
        tableStyles = @(); columnStyles = @()
    }
}

# ============================================================================
# 7) CALLBACK (invio con guardia F6, approvazioni a soglia, rifiuto, email F7)
# ============================================================================
$ctx = "routeContext: JSON.stringify(wtoolbox.buildCrudRouteContext('fatture_ricevute', 'list', 'workflow-action'))"

$cbInvia = @"
// INVIO IN APPROVAZIONE (batch). Guardia F6: file_xml obbligatorio.
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'warn', summary: 'Seleziona una fattura', life: 4000 }); resolve(); return; }
const rows = selected.map(function (r) { return wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; });
const senzaXml = rows.filter(function (r) { return !String(r.file_xml || '').trim(); });
if (senzaXml.length) {
  wtoolbox.messageNotificationService?.add?.({ severity: 'error', summary: 'Allegato XML mancante', detail: senzaXml.map(function (r) { return r.numero_fornitore; }).join(', '), life: 6000 });
  resolve(); return;
}
const apiBaseRaw = wtoolbox.appSettings?.api_url || (window.location.origin + '/api/');
const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw : (apiBaseRaw + '/');
const items = [];
for (const row of rows) {
  const entity = { id: row.id, stato: 'IN_APPROVAZIONE_L1' };
  await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.updateRecord', { entity: entity, route: 'fatture_ricevute', user_id: '', $ctx }).toPromise();
  items.push({ id: row.id, numero: row.numero_fornitore });
}
if (datasource.fetchData) { await datasource.fetchData(); }
wtoolbox.messageNotificationService?.add?.({ severity: 'success', summary: items.length + ' fatture inviate in approvazione', life: 4000 });
resolve(items.length === 1 ? items[0] : items);
"@

# approvazione L1: matrice soglie DATA-DRIVEN (ap_approval_levels livello 2)
$cbApprL1 = @"
// APPROVAZIONE L1 (batch): sotto la soglia L2 -> APPROVATA (+scadenza),
// da soglia L2 in su -> IN_APPROVAZIONE_L2. Matrice letta da ap_approval_levels.
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'warn', summary: 'Seleziona una fattura', life: 4000 }); resolve(); return; }
const rows = selected.map(function (r) { return wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; });
const apiBaseRaw = wtoolbox.appSettings?.api_url || (window.location.origin + '/api/');
const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw : (apiBaseRaw + '/');
const lv = await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.getFlatRecordData', {
  user_id: '', route: 'ap_approval_levels', lookup_table_id: 0, SortInfo: [], GroupInfo: [],
  PageInfo: { pageSize: 1, currentPage: 1 },
  filterInfo: { logic: 'AND', filters: [{ field: 'livello', operatore: 'eq', value: 2, fixed: true }] },
  logicOperator: 'AND', has_server_operation: true, aggregates: [], columnRestrictionList: []
}).toPromise();
const sogliaL2 = Number((lv?.results || [])[0]?.soglia_min ?? NaN);
if (!Number.isFinite(sogliaL2)) { wtoolbox.messageNotificationService?.add?.({ severity: 'error', summary: 'Matrice soglie non trovata', life: 5000 }); resolve(); return; }
const done = [];
for (const row of rows) {
  const escalate = Number(row.totale) >= sogliaL2;
  const entity = { id: row.id, stato: escalate ? 'IN_APPROVAZIONE_L2' : 'APPROVATA' };
  await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.updateRecord', { entity: entity, route: 'fatture_ricevute', user_id: '', $ctx }).toPromise();
  if (!escalate) {
    // integrazione reale: scadenza di pagamento a 30gg sulla fattura approvata
    const due = new Date(); due.setDate(due.getDate() + 30);
    await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.insertRecord', { entity: {
      tipo: 'PAGAMENTO', fattura_ricevuta_id: row.id, fornitore_id: row.fornitore_id,
      data_scadenza: due.toISOString().slice(0, 10), importo: row.totale, importo_pagato: 0,
      stato: 'APERTA', rata_n: 1, rata_totale: 1, note: 'WF AP: pagamento fattura ' + row.numero_fornitore, cancellato: false
    }, route: 'scadenze', user_id: '' }).toPromise();
  }
  done.push({ id: row.id, numero: row.numero_fornitore, esito: escalate ? 'escalation L2' : 'APPROVATA', email: row.fornitore_email, subject: 'Fattura ' + row.numero_fornitore + (escalate ? ' in approvazione CFO' : ' approvata'), route: 'fatture_ricevute', pk: row.id, send: !escalate });
}
if (datasource.fetchData) { await datasource.fetchData(); }
wtoolbox.messageNotificationService?.add?.({ severity: 'success', summary: done.map(function (x) { return x.numero + ': ' + x.esito; }).join(' | '), life: 5000 });
resolve(done);
"@

$cbApprL2 = @"
// APPROVAZIONE L2/CFO (batch): APPROVATA + scadenza pagamento.
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'warn', summary: 'Seleziona una fattura', life: 4000 }); resolve(); return; }
const rows = selected.map(function (r) { return wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; });
const apiBaseRaw = wtoolbox.appSettings?.api_url || (window.location.origin + '/api/');
const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw : (apiBaseRaw + '/');
const done = [];
for (const row of rows) {
  await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.updateRecord', { entity: { id: row.id, stato: 'APPROVATA' }, route: 'fatture_ricevute', user_id: '', $ctx }).toPromise();
  const due = new Date(); due.setDate(due.getDate() + 30);
  await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.insertRecord', { entity: {
    tipo: 'PAGAMENTO', fattura_ricevuta_id: row.id, fornitore_id: row.fornitore_id,
    data_scadenza: due.toISOString().slice(0, 10), importo: row.totale, importo_pagato: 0,
    stato: 'APERTA', rata_n: 1, rata_totale: 1, note: 'WF AP: pagamento fattura ' + row.numero_fornitore, cancellato: false
  }, route: 'scadenze', user_id: '' }).toPromise();
  done.push({ id: row.id, numero: row.numero_fornitore, email: row.fornitore_email, subject: 'Fattura ' + row.numero_fornitore + ' approvata (CFO)', route: 'fatture_ricevute', pk: row.id, send: true });
}
if (datasource.fetchData) { await datasource.fetchData(); }
wtoolbox.messageNotificationService?.add?.({ severity: 'success', summary: done.length + ' fatture approvate (CFO)', life: 4000 });
resolve(done);
"@

$cbRifiuta = @"
// RIFIUTO (batch): torna a disposizione della contabilita' (rework loop).
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'warn', summary: 'Seleziona una fattura', life: 4000 }); resolve(); return; }
const rows = selected.map(function (r) { return wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; });
const motivo = await wtoolbox.promptDialog('Motivo del rifiuto', [{ name: 'motivo', caption: 'Motivo', type: 'txt_area', value: '', required: true }], '520px', '300px');
if (!motivo) { resolve(); return; }
const motivoTxt = String(motivo?.motivo?.value || '').trim();
const apiBaseRaw = wtoolbox.appSettings?.api_url || (window.location.origin + '/api/');
const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw : (apiBaseRaw + '/');
const done = [];
for (const row of rows) {
  const entity = { id: row.id, stato: 'RIFIUTATA', note: ('RIFIUTATA: ' + motivoTxt).slice(0, 490) };
  await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.updateRecord', { entity: entity, route: 'fatture_ricevute', user_id: '', $ctx }).toPromise();
  done.push({ id: row.id, numero: row.numero_fornitore, email: row.fornitore_email, subject: 'Fattura ' + row.numero_fornitore + ' rifiutata: ' + motivoTxt, route: 'fatture_ricevute', pk: row.id, send: true });
}
if (datasource.fetchData) { await datasource.fetchData(); }
wtoolbox.messageNotificationService?.add?.({ severity: 'success', summary: done.length + ' fatture rifiutate', life: 4000 });
resolve(done);
"@

# azione interna 101 (F7): email al fornitore per gli esiti finali
$cbEmail = @"
// Email F7 (outbox): una mail al fornitore per ogni esito finale (send=true).
const list = (Array.isArray(payload) ? payload : [payload]).filter(function (x) { return x && x.send; });
for (const x of list) {
  await wtoolbox.enqueueEmail({ to: x.email || 'fornitore@pec.demo.local', subject: x.subject, body: 'Gentile fornitore, ' + x.subject + '. (demo workflow AP)', relatedRoute: x.route, relatedPk: x.pk });
}
if (list.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'info', summary: list.length + ' email accodate (outbox)', life: 4000 }); }
return payload;
"@

# azione interna 100: notifica al ruolo L1 quando arrivano fatture da approvare
$cbNotifL1 = @"
const list = (Array.isArray(payload) ? payload : [payload]).filter(Boolean);
if (!list.length) { return payload; }
await wtoolbox.enqueueNotification({ roleId: $RoleRespAcq, message: 'Fatture da approvare: ' + list.map(function (x) { return x.numero || ('#' + x.id); }).join(', '), type: 'workflow' });
return payload;
"@

$dcTemplate = @"
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { return true; }
return selected.some(function (r) { const row = wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; return __COND__; });
"@
$dcInviare = $dcTemplate.Replace('__COND__', "['NON_LETTA','REGISTRATA','RIFIUTATA'].indexOf(String(row.stato)) < 0")
$dcL1      = $dcTemplate.Replace('__COND__', "String(row.stato) !== 'IN_APPROVAZIONE_L1'")
$dcL2      = $dcTemplate.Replace('__COND__', "String(row.stato) !== 'IN_APPROVAZIONE_L2'")

# ============================================================================
# 8) BUNDLE + START MENU + GRAFO (timer 48h su L1)
# ============================================================================
$bundleFatture = New-Bundle 'fatture_ricevute' 'Fatture ricevute (WF)' @() @(
    (New-TablePerm 1 $RoleContab  $true $false $false $false $true),
    (New-TablePerm 2 $RoleRespAcq $true $false $false $false $true),
    (New-TablePerm 3 $RoleCfo     $true $false $false $false $true)
)
$bundleFatture.tableMetadata.md_workflow_state_field = 'stato'

$bundleInviare = New-Bundle 'wf_ap_da_inviare' 'Fatture da inviare' @(
    @{ Id = 1; md_id = $MdInviare; md_action_type = 5; ordine = 10; button_caption = 'Invia in approvazione'; button_image = 'pi pi-send'; button_template = ''; action_callback = $cbInvia; disable_callback = $dcInviare }
) @(
    (New-TablePerm 1 $RoleContab $true $false $false $false)
)
$bundleInviare.tableMetadata.md_workflow_state_field = 'stato'

$bundleL1 = New-Bundle 'wf_ap_l1' 'Approvazioni L1' @(
    @{ Id = 1; md_id = $MdL1; md_action_type = 5; ordine = 10; button_caption = 'Approva'; button_image = 'pi pi-check'; button_template = ''; action_callback = $cbApprL1; disable_callback = $dcL1 },
    @{ Id = 2; md_id = $MdL1; md_action_type = 5; ordine = 20; button_caption = 'Rifiuta'; button_image = 'pi pi-times'; button_template = ''; action_callback = $cbRifiuta; disable_callback = $dcL1 }
) @(
    (New-TablePerm 1 $RoleRespAcq $true $false $false $false)
)
$bundleL1.tableMetadata.md_workflow_state_field = 'stato'

$bundleL2 = New-Bundle 'wf_ap_l2' 'Approvazioni L2 (CFO)' @(
    @{ Id = 1; md_id = $MdL2; md_action_type = 5; ordine = 10; button_caption = 'Approva (CFO)'; button_image = 'pi pi-check-circle'; button_template = ''; action_callback = $cbApprL2; disable_callback = $dcL2 },
    @{ Id = 2; md_id = $MdL2; md_action_type = 5; ordine = 20; button_caption = 'Rifiuta'; button_image = 'pi pi-times'; button_template = ''; action_callback = $cbRifiuta; disable_callback = $dcL2 }
) @(
    (New-TablePerm 1 $RoleCfo $true $false $false $false)
)
$bundleL2.tableMetadata.md_workflow_state_field = 'stato'

function New-StartMenu([int]$Id, [string]$Caption, [string]$Uri, [int]$Ordine, [array]$RoleIds, [bool]$VisibleDefault) {
    $auth = @(); $seq = 1
    foreach ($r in $RoleIds) { $auth += @{ mmid = $Id; muamid = $seq; muamview = 1; ruoloid = $r; utenteid = 0 }; $seq++ }
    return @{
        mm_id = $Id; mm_parent_id = 0; mm_nome_menu = "wfap_menu_$Id"
        mm_display_string_menu = $Caption; mm_tooltip_menu = $Caption
        mm_uri_menu = $Uri; mm_ordine = $Ordine
        mm_is_visible_by_default = $VisibleDefault
        _Metadati_Utenti_Autorizzazioni_Menus = $auth
    }
}
$startMenus = @(
    (New-StartMenu 9301 'Da inviare'            '/wf_ap_da_inviare/list' 10 @($RoleContab, 1) $false),
    (New-StartMenu 9302 'Approvazioni L1'       '/wf_ap_l1/list'         20 @($RoleRespAcq, 1) $false),
    (New-StartMenu 9303 'Approvazioni L2 (CFO)' '/wf_ap_l2/list'         30 @($RoleCfo, 1) $false),
    (New-StartMenu 9304 'Matrice soglie'        '/ap_approval_levels/list' 40 @(1) $false)
)
$startMenus[1].mm_badge_route = 'wf_ap_l1'
$startMenus[2].mm_badge_route = 'wf_ap_l2'
if ($MdWfLog -gt 0) { $startMenus += (New-StartMenu 9305 'Storico workflow' '/_wuic_workflow_instance_log/list' 50 @(1) $false) }
if ($MdOutbox -gt 0) { $startMenus += (New-StartMenu 9306 'Outbox email' '/_wuic_mail_outbox/list' 60 @(1) $false) }

function New-Node([string]$Id, [string]$Label, [string]$Type, [hashtable]$Extra = @{}, [int]$X = 0, [int]$Y = 0) {
    $n = @{ id = $Id; label = $Label; type = $Type; route = ''; action = ''; x = $X; y = $Y }
    foreach ($k in $Extra.Keys) { $n[$k] = $Extra[$k] }
    return $n
}
$GraphKey  = 'wf_fatture_ap'
$GraphName = 'Approvazione Fatture AP'
$nodes = @(
    (New-Node 'n_start' 'Start - Fatture AP' 'start' @{ startMenus = $startMenus; startMenuCaption = 'Fatture AP'; startExclusiveMenu = $true; startShowExit = $true; startInheritMetadata = $false } 60 300),
    (New-Node 'n_inviare' 'wf_ap_da_inviare/list' 'route' @{ route = 'wf_ap_da_inviare'; action = 'list'; routeSourceType = 'route' } 320 300),
    (New-Node 'a_invia' 'Invia in approvazione' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_inviare'; metadataTargetType = 'table_action'; metadataTargetId = 1 } 600 300),
    (New-Node 'i_notif_l1' 'Notifica L1' 'action' @{ actionTypeId = 100; actionType = 'workflow.notification'; actionScopeId = 2; actionScope = 'internal'; actionCallback = $cbNotifL1 } 600 140),
    (New-Node 'n_l1' 'wf_ap_l1/list' 'route' @{ route = 'wf_ap_l1'; action = 'list'; routeSourceType = 'route' } 880 300),
    (New-Node 't_sla_l1' 'Timer 48h L1' 'timer' @{ timerConfig = @{ state_field = 'stato'; state_value = 'IN_APPROVAZIONE_L1'; reference_date_field = 'data_modifica'; duration_minutes = 2880; action = 'notify_role'; target = "$RoleRespAcq"; message = 'Fattura in approvazione L1 da oltre 48h' } } 880 470),
    (New-Node 'a_appr_l1' 'Approva L1' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_l1'; metadataTargetType = 'table_action'; metadataTargetId = 1 } 1160 200),
    (New-Node 'a_rif_l1' 'Rifiuta L1' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_l1'; metadataTargetType = 'table_action'; metadataTargetId = 2 } 1160 420),
    (New-Node 'n_l2' 'wf_ap_l2/list' 'route' @{ route = 'wf_ap_l2'; action = 'list'; routeSourceType = 'route' } 1440 200),
    (New-Node 'a_appr_l2' 'Approva CFO' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_l2'; metadataTargetType = 'table_action'; metadataTargetId = 1 } 1700 140),
    (New-Node 'a_rif_l2' 'Rifiuta CFO' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_l2'; metadataTargetType = 'table_action'; metadataTargetId = 2 } 1700 300),
    (New-Node 'i_email' 'Email fornitore' 'action' @{ actionTypeId = 101; actionType = 'workflow.email'; actionScopeId = 2; actionScope = 'internal'; actionCallback = $cbEmail } 1980 300),
    (New-Node 'n_end' 'End' 'end' @{} 2220 300)
)
function New-Conn([string]$Id, [string]$Src, [string]$SrcOut, [string]$Tgt, [string]$TgtIn, [hashtable]$Trans = @{}) {
    $c = @{ id = $Id; source = $Src; sourceOutput = $SrcOut; target = $Tgt; targetInput = $TgtIn }
    foreach ($k in $Trans.Keys) { $c[$k] = $Trans[$k] }
    return $c
}
$connections = @(
    (New-Conn 'e1' 'n_start' 'out' 'n_inviare' 'in'),
    # guardie PRE-stato + F6: XML obbligatorio autorato ANCHE sull'arco
    (New-Conn 'e2' 'n_inviare' 'out' 'a_invia' 'in' @{ transitionPermission = "grant:role:$RoleContab,role:1"; transitionEvent = 'invia'; transitionGuard = "['NON_LETTA','REGISTRATA','RIFIUTATA'].indexOf(String(record.stato)) >= 0 && String(record.file_xml || '').trim() !== ''" }),
    (New-Conn 'e3' 'a_invia' 'out' 'i_notif_l1' 'in'),
    (New-Conn 'e4' 'i_notif_l1' 'out' 'n_l1' 'in'),
    (New-Conn 'e5' 'n_l1' 'out' 't_sla_l1' 'in'),
    (New-Conn 'e6' 'n_l1' 'out' 'a_appr_l1' 'in' @{ transitionPermission = "grant:role:$RoleRespAcq,role:1"; transitionEvent = 'approva_l1'; transitionGuard = "String(record.stato) === 'IN_APPROVAZIONE_L1'" }),
    (New-Conn 'e7' 'n_l1' 'out' 'a_rif_l1' 'in' @{ transitionPermission = "grant:role:$RoleRespAcq,role:1"; transitionEvent = 'rifiuta_l1'; transitionGuard = "String(record.stato) === 'IN_APPROVAZIONE_L1'" }),
    (New-Conn 'e8' 'a_appr_l1' 'out' 'n_l2' 'in' @{ transitionEvent = 'escalation_l2' }),
    (New-Conn 'e9' 'n_l2' 'out' 'a_appr_l2' 'in' @{ transitionPermission = "grant:role:$RoleCfo,role:1"; transitionEvent = 'approva_l2'; transitionGuard = "String(record.stato) === 'IN_APPROVAZIONE_L2'" }),
    (New-Conn 'e10' 'n_l2' 'out' 'a_rif_l2' 'in' @{ transitionPermission = "grant:role:$RoleCfo,role:1"; transitionEvent = 'rifiuta_l2'; transitionGuard = "String(record.stato) === 'IN_APPROVAZIONE_L2'" }),
    (New-Conn 'e11' 'a_appr_l2' 'out' 'i_email' 'in'),
    (New-Conn 'e12' 'a_rif_l2' 'out' 'i_email' 'in'),
    (New-Conn 'e13' 'a_rif_l1' 'out' 'i_email' 'in'),
    (New-Conn 'e14' 'a_appr_l1' 'out' 'i_email' 'in'),
    (New-Conn 'e15' 'i_email' 'out' 'n_end' 'in')
)

$graph = @{ nodes = $nodes; connections = $connections }
$graphJson = ConvertTo-Json -InputObject $graph -Compress -Depth 24
$routeMetadata = @(
    @{ node_id = 'n_inviare'; route_name = 'wf_ap_da_inviare'; route_action = 'list'; metadata_json = (ConvertTo-Json -InputObject $bundleInviare -Compress -Depth 12) },
    @{ node_id = 'n_l1'; route_name = 'wf_ap_l1'; route_action = 'list'; metadata_json = (ConvertTo-Json -InputObject $bundleL1 -Compress -Depth 12) },
    @{ node_id = 'n_l2'; route_name = 'wf_ap_l2'; route_action = 'list'; metadata_json = (ConvertTo-Json -InputObject $bundleL2 -Compress -Depth 12) },
    # bundle CONTEXT-ONLY: tabella fisica bersaglio dei callback (nessun nodo)
    @{ node_id = 'n_fatture_ctx'; route_name = 'fatture_ricevute'; route_action = 'list'; metadata_json = (ConvertTo-Json -InputObject $bundleFatture -Compress -Depth 12) }
)
$routeMetadataJson = ConvertTo-Json -InputObject $routeMetadata -Compress -Depth 6
$savePayload = @{ user_id = ''; graph_key = $GraphKey; graph_name = $GraphName; graph_json = $graphJson; route_metadata_json = $routeMetadataJson } | ConvertTo-Json -Compress -Depth 4
Invoke-RestMethod -TimeoutSec 180 -Method Post -Uri "$AsmxBase/MetaService.saveWorkflowGraph" -WebSession $session -ContentType 'application/json' -Body $savePayload | Out-Null
Write-Host 'saveWorkflowGraph OK'

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

$verCount = 0
try { $verCount = [int](Scalar-Sql $MetaCs "SELECT COUNT(*) FROM dbo._wuic_workflow_graph_version WHERE wg_key=@k" @{ k = $GraphKey }) } catch { $verCount = 0 }
if ($verCount -eq 0) {
    $verPayload = @{ user_id = ''; graph_key = $GraphKey; graph_json = $graphJson; graph_name = $GraphName; expected_version = '' } | ConvertTo-Json -Compress -Depth 4
    try { Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/MetaService.saveWorkflowGraphVersion" -WebSession $session -ContentType 'application/json' -Body $verPayload | Out-Null; Write-Host 'versione v1 OK' } catch { Write-Warning "version: $($_.Exception.Message)" }
} else { Write-Host "versioni gia' presenti ($verCount): skip v1" }

# ============================================================================
# 9) MENU APP (root: mm_parent_id NULL!) + INVALIDATE
# ============================================================================
$menuExists = Scalar-Sql $MetaCs "SELECT COUNT(*) FROM dbo._metadati__menu WHERE mm_uri_menu = N'workflow-runner/wf_fatture_ap'"
if ([int]$menuExists -eq 0) {
    Exec-Sql $MetaCs @"
DECLARE @mmid INT = (SELECT ISNULL(MAX(mm_id),0)+1 FROM dbo._metadati__menu);
DECLARE @ord INT = (SELECT ISNULL(MAX(mmordine),0)+10 FROM dbo._metadati__menu WHERE mm_parent_id IS NULL);
INSERT INTO dbo._metadati__menu (mm_id, mm_parent_id, mm_nome_menu, mm_display_string_menu, mm_tooltip_menu, mm_uri_menu, mmordine, mm_is_visible_by_default)
VALUES (@mmid, NULL, N'wf_fatture_ap', N'Fatture AP (WF)', N'Workflow approvazione fatture', N'workflow-runner/wf_fatture_ap', @ord, 1);
"@ | Out-Null
    Write-Host 'Voce menu creata'
} else { Write-Host "Voce menu gia' presente" }

Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/MetaService.invalidateMetadataRuntime" -WebSession $session -ContentType 'application/json' -Body '{"clearAll":true}' | Out-Null
$ver = Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/MetaService.getProjectMetadataVersion" -WebSession $session -ContentType 'application/json' -Body '{}'
Write-Host ("invalidate OK, version={0}" -f ($ver | ConvertTo-Json -Compress))

Write-Host ''
Write-Host '=== create-wf-fatture-demo: DONE ==='
Write-Host ("Grafo: {0} (menu 'Fatture AP (WF)') | Utenti: contab.ap / respacq.ap / cfo.ap (pwd: {1})" -f $GraphKey, $DemoUserPassword)
