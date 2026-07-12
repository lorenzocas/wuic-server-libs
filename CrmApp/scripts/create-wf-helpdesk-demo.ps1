# ============================================================================
# create-wf-helpdesk-demo.ps1  (CrmApp)
#
# Workflow business "Ticket Helpdesk" su ENTITA' ESISTENTI del CRM:
#  - crm_cases (case_status_id lookup crm_case_status, priority, owner_user_id,
#    colonne SLA sla_hours/sla_due_at/sla_breached GIA' presenti)
#  - crm_case_status esteso con 'reopened' (id 6)
#  - crm_activities (+case_id) come attivita'/commenti del ticket
#  - crm_notifications/_notifications gia' presenti
# Pattern CLAIM/RELEASE: coda condivisa dei ticket nuovi, presa in carico
# (owner_user_id = crm_user dell'agente, mappato per USERNAME dai login),
# rilascio, attesa cliente, risoluzione; supervisor chiude/riapre.
# Feature: F1 timer (ticket in coda >4h -> notifica supervisor), F2 timeline,
# F8 badge code, claim/release, riuso ruoli CRM Support/CRM Manager.
#
# Utenti demo: agente1.hd / agente2.hd (CRM Support), supervisor.hd (CRM
# Manager) — pwd: HelpdeskDemo123! — con riga gemella in crm_users (username).
# Stati (case_status_id): 1 new -> 2 in_progress -> 3 waiting_customer ->
# 4 resolved -> 5 closed (+6 reopened -> coda).
#
# Idempotente. PRE-REQUISITO: ensure-wuic-workflow-tables.mssql.sql su MetadataCRM.
# ============================================================================
param(
    [string]$AsmxBase = 'http://localhost:5000/api/Meta/AsmxProxy',
    [string]$AsmxUser = 'wuic_e2e_admin',
    [string]$AsmxPassword = 'E2E_Admin123!',
    [string]$DemoUserPassword = 'HelpdeskDemo123!'
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
# 1) RUOLI (riuso) + UTENTI login + righe gemelle crm_users (mappa username)
# ============================================================================
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
function Ensure-CrmUser([string]$Username, [string]$Display, [int]$CrmRoleId) {
    $exists = Scalar-Sql $DataCs "SELECT user_id FROM dbo.crm_users WHERE username = @u" @{ u = $Username }
    if ($exists -and $exists -isnot [System.DBNull]) { return [int]$exists }
    Exec-Sql $DataCs "INSERT INTO dbo.crm_users (username, email, display_name, role_id, is_active, Stato_Record, created_at, updated_at) VALUES (@u, @u + '@demo.local', @d, @r, 1, 0, SYSDATETIME(), SYSDATETIME())" @{ u = $Username; d = $Display; r = $CrmRoleId } | Out-Null
    return [int](Scalar-Sql $DataCs "SELECT user_id FROM dbo.crm_users WHERE username = @u" @{ u = $Username })
}

$RoleSupport = [int](Scalar-Sql $MetaCs "SELECT id_ruolo FROM dbo.ruoli WHERE ruolo_des = 'CRM Support'")
$RoleManager = [int](Scalar-Sql $MetaCs "SELECT id_ruolo FROM dbo.ruoli WHERE ruolo_des = 'CRM Manager'")
if (-not $RoleSupport -or -not $RoleManager) { throw 'ruoli CRM Support/CRM Manager non trovati' }
Ensure-User $AsmxUser $AsmxPassword 1 'E2E admin (seed workflow)' 1 | Out-Null
$UserAg1 = Ensure-User 'agente1.hd'    $DemoUserPassword $RoleSupport 'Demo Helpdesk - agente 1'
$UserAg2 = Ensure-User 'agente2.hd'    $DemoUserPassword $RoleSupport 'Demo Helpdesk - agente 2'
$UserSup = Ensure-User 'supervisor.hd' $DemoUserPassword $RoleManager 'Demo Helpdesk - supervisor'
$CrmAg1 = Ensure-CrmUser 'agente1.hd'    'Agente 1 (HD)' 4
$CrmAg2 = Ensure-CrmUser 'agente2.hd'    'Agente 2 (HD)' 4
$CrmSup = Ensure-CrmUser 'supervisor.hd' 'Supervisor (HD)' 2
Write-Host ("Login: ag1={0} ag2={1} sup={2} | crm_users: {3}/{4}/{5}" -f $UserAg1, $UserAg2, $UserSup, $CrmAg1, $CrmAg2, $CrmSup)

# ============================================================================
# 2) VISTE code (riuso crm_cases; owner_login_id via JOIN username cross-db)
# ============================================================================
Exec-Sql $DataCs @"
EXEC('CREATE OR ALTER VIEW dbo.wf_hd_coda AS
  SELECT c.case_id, c.case_number, c.subject, c.priority, c.case_status_id, s.status_code,
         c.owner_user_id, c.account_id, c.created_at, c.sla_due_at, c.sla_breached
  FROM dbo.crm_cases c
  JOIN dbo.crm_case_status s ON s.case_status_id = c.case_status_id
  WHERE s.status_code IN (''new'', ''reopened'') AND ISNULL(c.Stato_Record,0) = 0');
EXEC('CREATE OR ALTER VIEW dbo.wf_hd_miei AS
  SELECT c.case_id, c.case_number, c.subject, c.priority, c.case_status_id, s.status_code,
         c.owner_user_id, u.id_utente AS owner_login_id, c.account_id, c.created_at,
         c.sla_due_at, c.sla_breached
  FROM dbo.crm_cases c
  JOIN dbo.crm_case_status s ON s.case_status_id = c.case_status_id
  JOIN dbo.crm_users cu ON cu.user_id = c.owner_user_id
  JOIN [$MetaDb].dbo.utenti u ON u.username = cu.username
  WHERE s.status_code IN (''in_progress'', ''waiting_customer'', ''resolved'') AND ISNULL(c.Stato_Record,0) = 0');
"@ | Out-Null
# ticket demo (se il crm ne ha pochi)
Exec-Sql $DataCs @"
IF (SELECT COUNT(*) FROM dbo.crm_cases WHERE ISNULL(Stato_Record,0)=0) < 4
INSERT INTO dbo.crm_cases (case_number, subject, account_id, contact_id, case_status_id, priority, owner_user_id, description, Stato_Record, created_at, updated_at)
VALUES
 ('HD-2026-101', 'VPN non raggiungibile',        (SELECT TOP 1 account_id FROM dbo.crm_accounts), NULL, 1, 'HIGH',     NULL, 'Il cliente non accede alla VPN da stamattina', 0, SYSDATETIME(), SYSDATETIME()),
 ('HD-2026-102', 'Errore fatturazione portale',  (SELECT TOP 1 account_id FROM dbo.crm_accounts), NULL, 1, 'CRITICAL', NULL, 'Totali errati in fattura', 0, SYSDATETIME(), SYSDATETIME()),
 ('HD-2026-103', 'Richiesta nuovo utente',       (SELECT TOP 1 account_id FROM dbo.crm_accounts), NULL, 1, 'NORMAL',   NULL, 'Attivare accesso per nuovo assunto', 0, SYSDATETIME(), SYSDATETIME());
"@ | Out-Null
Write-Host 'Viste code + ticket demo OK'

# ============================================================================
# 3) LOGIN + SCAFFOLD
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
$MdCases = Scaffold-Object 'crm_cases' $false
$MdCoda  = Scaffold-Object 'wf_hd_coda' $true
$MdMiei  = Scaffold-Object 'wf_hd_miei' $true

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
$MdWfLog = Scaffold-MetaObject '_wuic_workflow_instance_log'

# ============================================================================
# 4) METADATA (display, pk viste, multiselection)
# ============================================================================
Exec-Sql $MetaCs @"
UPDATE dbo._metadati__tabelle SET mm_display_string = N'Coda ticket' WHERE mdroutename = N'wf_hd_coda';
UPDATE dbo._metadati__tabelle SET mm_display_string = N'I miei ticket' WHERE mdroutename = N'wf_hd_miei';
UPDATE dbo._metadati__tabelle SET mm_display_string = N'Storico workflow' WHERE mdroutename = N'_wuic_workflow_instance_log';
UPDATE dbo._metadati__tabelle SET mdmultipleselection = 1 WHERE mdroutename IN (N'wf_hd_coda', N'wf_hd_miei', N'crm_cases');
UPDATE c SET c.mc_is_primary_key = 1
FROM dbo._metadati__colonne c JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename IN (N'wf_hd_coda', N'wf_hd_miei') AND c.mc_nome_colonna = N'case_id';
"@ | Out-Null
Exec-Sql $MetaCs @"
DELETE FROM dbo._mtdt__tnt__trzzzioni__tabelle
WHERE ruoloid IN ($RoleSupport, $RoleManager) AND md_id IN ($MdCases, $MdCoda, $MdMiei);
"@ | Out-Null
Write-Host 'Metadata OK'

# ============================================================================
# 5) FLUSH + bundle idratati (bool 1/0)
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
# 6) CALLBACK (claim/release/stati; update su route crm_cases con workflow ctx)
# ============================================================================
$ctx = "routeContext: JSON.stringify(wtoolbox.buildCrudRouteContext('crm_cases', 'list', 'workflow-action'))"
# lookup crm_user dell'utente corrente per USERNAME (identita' app separata dai login)
$meLookup = @"
const meUsername = wtoolbox.getCurrentUsername ? wtoolbox.getCurrentUsername() : '';
const apiBaseRaw = wtoolbox.appSettings?.api_url || (window.location.origin + '/api/');
const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw : (apiBaseRaw + '/');
const meResp = await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.getFlatRecordData', {
  user_id: '', route: 'crm_users', lookup_table_id: 0, SortInfo: [], GroupInfo: [],
  PageInfo: { pageSize: 1, currentPage: 1 },
  filterInfo: { logic: 'AND', filters: [{ field: 'username', operatore: 'eq', value: meUsername, fixed: true }] },
  logicOperator: 'AND', has_server_operation: true, aggregates: [], columnRestrictionList: []
}).toPromise();
const meCrm = (meResp?.results || [])[0];
if (!meCrm) { wtoolbox.messageNotificationService?.add?.({ severity: 'error', summary: 'Utente CRM non trovato per ' + meUsername, life: 5000 }); resolve(); return; }
"@

$cbClaim = @"
// PRESA IN CARICO: assegna a me (crm_user via username) e porta in lavorazione.
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'warn', summary: 'Seleziona un ticket', life: 4000 }); resolve(); return; }
const rows = selected.map(function (r) { return wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; });
$meLookup
const items = [];
for (const row of rows) {
  const entity = { case_id: row.case_id, owner_user_id: meCrm.user_id, case_status_id: 2 };
  await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.updateRecord', { entity: entity, route: 'crm_cases', user_id: '', $ctx }).toPromise();
  items.push({ case_id: row.case_id, case_number: row.case_number });
}
if (datasource.fetchData) { await datasource.fetchData(); }
wtoolbox.messageNotificationService?.add?.({ severity: 'success', summary: items.length + ' ticket presi in carico', life: 4000 });
resolve(items.length === 1 ? items[0] : items);
"@

$cbRelease = @"
// RILASCIO: torna in coda (owner NULL, stato new).
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'warn', summary: 'Seleziona un ticket', life: 4000 }); resolve(); return; }
const rows = selected.map(function (r) { return wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; });
const apiBaseRaw = wtoolbox.appSettings?.api_url || (window.location.origin + '/api/');
const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw : (apiBaseRaw + '/');
const items = [];
for (const row of rows) {
  const entity = { case_id: row.case_id, owner_user_id: null, case_status_id: 1 };
  await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.updateRecord', { entity: entity, route: 'crm_cases', user_id: '', $ctx }).toPromise();
  items.push({ case_id: row.case_id });
}
if (datasource.fetchData) { await datasource.fetchData(); }
wtoolbox.messageNotificationService?.add?.({ severity: 'success', summary: items.length + ' ticket rilasciati', life: 4000 });
resolve(items.length === 1 ? items[0] : items);
"@

function New-StatusCb([int]$TargetStatus, [string]$Caption) {
    return @"
// $Caption (batch).
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'warn', summary: 'Seleziona un ticket', life: 4000 }); resolve(); return; }
const rows = selected.map(function (r) { return wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; });
const apiBaseRaw = wtoolbox.appSettings?.api_url || (window.location.origin + '/api/');
const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw : (apiBaseRaw + '/');
const items = [];
for (const row of rows) {
  const entity = { case_id: row.case_id, case_status_id: $TargetStatus };
  await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.updateRecord', { entity: entity, route: 'crm_cases', user_id: '', $ctx }).toPromise();
  items.push({ case_id: row.case_id, case_number: row.case_number });
}
if (datasource.fetchData) { await datasource.fetchData(); }
wtoolbox.messageNotificationService?.add?.({ severity: 'success', summary: items.length + ' ticket aggiornati: $Caption', life: 4000 });
resolve(items.length === 1 ? items[0] : items);
"@
}
$cbWaiting = New-StatusCb 3 'Attesa cliente'
$cbResolve = New-StatusCb 4 'Risolto'
$cbClose   = New-StatusCb 5 'Chiuso'
$cbReopen  = New-StatusCb 6 'Riaperto'

$dcTemplate = @"
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { return true; }
return selected.some(function (r) { const row = wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; return __COND__; });
"@
$dcCoda    = $dcTemplate.Replace('__COND__', "String(row.status_code) !== 'new' && String(row.status_code) !== 'reopened'")
$dcLavoro  = $dcTemplate.Replace('__COND__', "String(row.status_code) !== 'in_progress' && String(row.status_code) !== 'waiting_customer'")
$dcRisolti = $dcTemplate.Replace('__COND__', "String(row.status_code) !== 'resolved'")

$cbNotifSup = @"
// Notifica al supervisor: ticket risolti/chiusi (raggruppata).
const list = (Array.isArray(payload) ? payload : [payload]).filter(Boolean);
if (!list.length) { return payload; }
await wtoolbox.enqueueNotification({ roleId: $RoleManager, message: 'Ticket aggiornati: ' + list.map(function (x) { return x.case_number || ('#' + x.case_id); }).join(', '), type: 'workflow' });
return payload;
"@

# ============================================================================
# 7) BUNDLE + START MENU + GRAFO (timer 4h sulla coda)
# ============================================================================
$bundleCases = New-Bundle 'crm_cases' 'Ticket (tutti)' @() @(
    (New-TablePerm 1 $RoleSupport $true $false $false $false $true),
    (New-TablePerm 2 $RoleManager $true $false $false $false $true)
)
$bundleCases.tableMetadata.md_workflow_state_field = 'case_status_id'

$bundleCoda = New-Bundle 'wf_hd_coda' 'Coda ticket' @(
    @{ Id = 1; md_id = $MdCoda; md_action_type = 5; ordine = 10; button_caption = 'Prendi in carico'; button_image = 'pi pi-user-plus'; button_template = ''; action_callback = $cbClaim; disable_callback = $dcCoda }
) @(
    (New-TablePerm 1 $RoleSupport $true $false $false $false),
    (New-TablePerm 2 $RoleManager $true $false $false $false)
)
$bundleCoda.tableMetadata.md_workflow_state_field = 'case_status_id'

$bundleMiei = New-Bundle 'wf_hd_miei' 'I miei ticket' @(
    @{ Id = 1; md_id = $MdMiei; md_action_type = 5; ordine = 10; button_caption = 'Rilascia';       button_image = 'pi pi-user-minus'; button_template = ''; action_callback = $cbRelease; disable_callback = $dcLavoro },
    @{ Id = 2; md_id = $MdMiei; md_action_type = 5; ordine = 20; button_caption = 'Attesa cliente'; button_image = 'pi pi-pause';      button_template = ''; action_callback = $cbWaiting; disable_callback = $dcLavoro },
    @{ Id = 3; md_id = $MdMiei; md_action_type = 5; ordine = 30; button_caption = 'Risolvi';        button_image = 'pi pi-check';      button_template = ''; action_callback = $cbResolve; disable_callback = $dcLavoro },
    @{ Id = 4; md_id = $MdMiei; md_action_type = 5; ordine = 40; button_caption = 'Chiudi';         button_image = 'pi pi-lock';       button_template = ''; action_callback = $cbClose;   disable_callback = $dcRisolti },
    @{ Id = 5; md_id = $MdMiei; md_action_type = 5; ordine = 50; button_caption = 'Riapri';         button_image = 'pi pi-replay';     button_template = ''; action_callback = $cbReopen;  disable_callback = $dcRisolti }
) @(
    (New-TablePerm 1 $RoleSupport $true $false $false $false),
    (New-TablePerm 2 $RoleManager $true $false $false $false $true)
)
# coda personale: la vista espone owner_login_id (mappa crm_user->login per username)
$bundleMiei.tableMetadata.md_record_restriction_key_user_field_list = 'owner_login_id'
$bundleMiei.tableMetadata.md_workflow_state_field = 'case_status_id'

function New-StartMenu([int]$Id, [string]$Caption, [string]$Uri, [int]$Ordine, [array]$RoleIds, [bool]$VisibleDefault) {
    $auth = @(); $seq = 1
    foreach ($r in $RoleIds) { $auth += @{ mmid = $Id; muamid = $seq; muamview = 1; ruoloid = $r; utenteid = 0 }; $seq++ }
    return @{
        mm_id = $Id; mm_parent_id = 0; mm_nome_menu = "wfhd_menu_$Id"
        mm_display_string_menu = $Caption; mm_tooltip_menu = $Caption
        mm_uri_menu = $Uri; mm_ordine = $Ordine
        mm_is_visible_by_default = $VisibleDefault
        _Metadati_Utenti_Autorizzazioni_Menus = $auth
    }
}
$startMenus = @(
    (New-StartMenu 9201 'Coda ticket'    '/wf_hd_coda/list' 10 @($RoleSupport, $RoleManager, 1) $false),
    (New-StartMenu 9202 'I miei ticket'  '/wf_hd_miei/list' 20 @($RoleSupport, $RoleManager, 1) $false),
    (New-StartMenu 9203 'Tutti i ticket' '/crm_cases/list'  30 @($RoleManager, 1) $false)
)
$startMenus[0].mm_badge_route = 'wf_hd_coda'
$startMenus[1].mm_badge_route = 'wf_hd_miei'
if ($MdWfLog -gt 0) { $startMenus += (New-StartMenu 9204 'Storico workflow' '/_wuic_workflow_instance_log/list' 40 @(1) $false) }

function New-Node([string]$Id, [string]$Label, [string]$Type, [hashtable]$Extra = @{}, [int]$X = 0, [int]$Y = 0) {
    $n = @{ id = $Id; label = $Label; type = $Type; route = ''; action = ''; x = $X; y = $Y }
    foreach ($k in $Extra.Keys) { $n[$k] = $Extra[$k] }
    return $n
}
$GraphKey  = 'wf_helpdesk'
$GraphName = 'Ticket Helpdesk'
$nodes = @(
    (New-Node 'n_start' 'Start - Helpdesk' 'start' @{ startMenus = $startMenus; startMenuCaption = 'Helpdesk'; startExclusiveMenu = $true; startShowExit = $true; startInheritMetadata = $false } 60 300),
    (New-Node 'n_coda' 'wf_hd_coda/list' 'route' @{ route = 'wf_hd_coda'; action = 'list'; routeSourceType = 'route' } 320 300),
    (New-Node 't_sla' 'Timer 4h coda' 'timer' @{ timerConfig = @{ state_field = 'case_status_id'; state_value = '1'; reference_date_field = 'created_at'; duration_minutes = 240; action = 'notify_role'; target = "$RoleManager"; message = 'Ticket in coda da oltre 4h' } } 320 470),
    (New-Node 'a_claim' 'Prendi in carico' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_coda'; metadataTargetType = 'table_action'; metadataTargetId = 1 } 600 300),
    (New-Node 'n_miei' 'wf_hd_miei/list' 'route' @{ route = 'wf_hd_miei'; action = 'list'; routeSourceType = 'route' } 880 300),
    (New-Node 'a_release' 'Rilascia' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_miei'; metadataTargetType = 'table_action'; metadataTargetId = 1 } 1180 120),
    (New-Node 'a_wait' 'Attesa cliente' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_miei'; metadataTargetType = 'table_action'; metadataTargetId = 2 } 1180 260),
    (New-Node 'a_resolve' 'Risolvi' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_miei'; metadataTargetType = 'table_action'; metadataTargetId = 3 } 1180 400),
    (New-Node 'a_close' 'Chiudi' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_miei'; metadataTargetType = 'table_action'; metadataTargetId = 4 } 1180 540),
    (New-Node 'a_reopen' 'Riapri' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_miei'; metadataTargetType = 'table_action'; metadataTargetId = 5 } 1180 680),
    (New-Node 'i_notif_sup' 'Notifica supervisor' 'action' @{ actionTypeId = 100; actionType = 'workflow.notification'; actionScopeId = 2; actionScope = 'internal'; actionCallback = $cbNotifSup } 1500 400),
    (New-Node 'n_end' 'End' 'end' @{} 1750 400)
)
function New-Conn([string]$Id, [string]$Src, [string]$SrcOut, [string]$Tgt, [string]$TgtIn, [hashtable]$Trans = @{}) {
    $c = @{ id = $Id; source = $Src; sourceOutput = $SrcOut; target = $Tgt; targetInput = $TgtIn }
    foreach ($k in $Trans.Keys) { $c[$k] = $Trans[$k] }
    return $c
}
$connections = @(
    (New-Conn 'e1' 'n_start' 'out' 'n_coda' 'in'),
    (New-Conn 'e2' 'n_coda' 'out' 't_sla' 'in'),
    (New-Conn 'e3' 'n_coda' 'out' 'a_claim' 'in' @{ transitionPermission = "grant:role:$RoleSupport,role:$RoleManager,role:1"; transitionEvent = 'claim' }),
    (New-Conn 'e4' 'a_claim' 'out' 'n_miei' 'in' @{ transitionEvent = 'preso_in_carico'; transitionGuard = "String(record.status_code) === 'new' || String(record.status_code) === 'reopened'" }),
    (New-Conn 'e5' 'n_miei' 'out' 'a_release' 'in' @{ transitionPermission = "grant:role:$RoleSupport,role:$RoleManager,role:1"; transitionEvent = 'release' }),
    (New-Conn 'e6' 'a_release' 'out' 'n_coda' 'in' @{ transitionEvent = 'rilasciato'; transitionGuard = "String(record.status_code) === 'in_progress'" }),
    (New-Conn 'e7' 'n_miei' 'out' 'a_wait' 'in' @{ transitionPermission = "grant:role:$RoleSupport,role:$RoleManager,role:1"; transitionEvent = 'attesa' }),
    (New-Conn 'e8' 'n_miei' 'out' 'a_resolve' 'in' @{ transitionPermission = "grant:role:$RoleSupport,role:$RoleManager,role:1"; transitionEvent = 'risolvi' }),
    (New-Conn 'e9' 'a_resolve' 'out' 'i_notif_sup' 'in'),
    # Chiudi/Riapri: SOLO supervisor (denying per support = esempio deny)
    (New-Conn 'e10' 'n_miei' 'out' 'a_close' 'in' @{ transitionPermission = "grant:role:$RoleManager,role:1"; transitionEvent = 'chiudi' }),
    (New-Conn 'e11' 'n_miei' 'out' 'a_reopen' 'in' @{ transitionPermission = "grant:role:$RoleManager,role:1"; transitionEvent = 'riapri' }),
    (New-Conn 'e12' 'a_reopen' 'out' 'n_coda' 'in' @{ transitionEvent = 'riaperto'; transitionGuard = "String(record.status_code) === 'resolved'" }),
    (New-Conn 'e13' 'a_close' 'out' 'i_notif_sup' 'in'),
    (New-Conn 'e14' 'i_notif_sup' 'out' 'n_end' 'in')
)

$graph = @{ nodes = $nodes; connections = $connections }
$graphJson = ConvertTo-Json -InputObject $graph -Compress -Depth 24
$routeMetadata = @(
    @{ node_id = 'n_coda'; route_name = 'wf_hd_coda'; route_action = 'list'; metadata_json = (ConvertTo-Json -InputObject $bundleCoda -Compress -Depth 12) },
    @{ node_id = 'n_miei'; route_name = 'wf_hd_miei'; route_action = 'list'; metadata_json = (ConvertTo-Json -InputObject $bundleMiei -Compress -Depth 12) },
    @{ node_id = 'n_cases_ctx'; route_name = 'crm_cases'; route_action = 'list'; metadata_json = (ConvertTo-Json -InputObject $bundleCases -Compress -Depth 12) }
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
# 8) MENU APP (root: mm_parent_id NULL!) + INVALIDATE
# ============================================================================
$menuExists = Scalar-Sql $MetaCs "SELECT COUNT(*) FROM dbo._metadati__menu WHERE mm_uri_menu = N'workflow-runner/wf_helpdesk'"
if ([int]$menuExists -eq 0) {
    Exec-Sql $MetaCs @"
DECLARE @mmid INT = (SELECT ISNULL(MAX(mm_id),0)+1 FROM dbo._metadati__menu);
DECLARE @ord INT = (SELECT ISNULL(MAX(mmordine),0)+10 FROM dbo._metadati__menu WHERE mm_parent_id IS NULL);
INSERT INTO dbo._metadati__menu (mm_id, mm_parent_id, mm_nome_menu, mm_display_string_menu, mm_tooltip_menu, mm_uri_menu, mmordine, mm_is_visible_by_default)
VALUES (@mmid, NULL, N'wf_helpdesk', N'Helpdesk (WF)', N'Workflow ticket helpdesk', N'workflow-runner/wf_helpdesk', @ord, 1);
"@ | Out-Null
    Write-Host 'Voce menu creata'
} else { Write-Host "Voce menu gia' presente" }

Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/MetaService.invalidateMetadataRuntime" -WebSession $session -ContentType 'application/json' -Body '{"clearAll":true}' | Out-Null
$ver = Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/MetaService.getProjectMetadataVersion" -WebSession $session -ContentType 'application/json' -Body '{}'
Write-Host ("invalidate OK, version={0}" -f ($ver | ConvertTo-Json -Compress))

Write-Host ''
Write-Host '=== create-wf-helpdesk-demo: DONE ==='
Write-Host ("Grafo: {0} (menu 'Helpdesk (WF)') | Utenti: agente1.hd / agente2.hd / supervisor.hd (pwd: {1})" -f $GraphKey, $DemoUserPassword)
