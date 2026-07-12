# ============================================================================
# create-wf-onboarding-demo.ps1  (CrmApp)
#
# Workflow business "Onboarding nuovo CLIENTE" su ENTITA' ESISTENTI del CRM:
#  - crm_accounts (+ colonna lifecycle_status: NUOVO/IN_ONBOARDING/ATTIVO —
#    unico delta schema, dictionary; metadata clonati da colonna esistente)
#  - crm_activities come TASK PARALLELI (F5): subject/owner_user_id/completed/
#    account_id/due_date, activity_type 4 = task
#  - riuso utenti demo helpdesk (agente1.hd/agente2.hd/supervisor.hd + twin
#    crm_users 6/7/8) e ruoli CRM Support / CRM Manager
#
# F5 parallel split/join (gateway AND):
#  - "Avvia onboarding" (manager) -> parallel_split genera 3 task
#    (Setup contratto / Kickoff call / Provisioning) assegnati a crm_users
#    diversi -> account IN_ONBOARDING
#  - i task si lavorano da "Task onboarding" (Completa task)
#  - parallel_join: "Attiva cliente" e' percorribile solo quando TUTTI i task
#    dell'account sono chiusi (wtoolbox.areWorkflowTasksDone nel callback)
#
# Idempotente. PRE-REQUISITI: ensure-wuic-workflow-tables su MetadataCRM +
# seed helpdesk (utenti demo). Backend: :5200 (pattern porte separate).
# ============================================================================
param(
    [string]$AsmxBase = 'http://localhost:5200/api/Meta/AsmxProxy',
    [string]$AsmxUser = 'wuic_e2e_admin',
    [string]$AsmxPassword = 'E2E_Admin123!'
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

$DataCs = Get-Cs 'DataSQLConnection'
$MetaCs = Get-Cs 'MetaDataSQLConnection'
$DataDb = Get-Db $DataCs
$MetaDb = Get-Db $MetaCs
Write-Host ("DataDb={0} MetaDb={1}" -f $DataDb, $MetaDb)

$RoleSupport = [int](Scalar-Sql $MetaCs "SELECT id_ruolo FROM dbo.ruoli WHERE ruolo_des = 'CRM Support'")
$RoleManager = [int](Scalar-Sql $MetaCs "SELECT id_ruolo FROM dbo.ruoli WHERE ruolo_des = 'CRM Manager'")
if (-not $RoleSupport -or -not $RoleManager) { throw 'ruoli CRM Support/CRM Manager non trovati (eseguire prima il seed helpdesk)' }
$CrmAg1 = Scalar-Sql $DataCs "SELECT user_id FROM dbo.crm_users WHERE username='agente1.hd'"
$CrmAg2 = Scalar-Sql $DataCs "SELECT user_id FROM dbo.crm_users WHERE username='agente2.hd'"
$CrmSup = Scalar-Sql $DataCs "SELECT user_id FROM dbo.crm_users WHERE username='supervisor.hd'"
if (-not $CrmAg1 -or -not $CrmAg2 -or -not $CrmSup) { throw 'crm_users demo non trovati (eseguire prima il seed helpdesk)' }
Write-Host ("crm_users demo: {0}/{1}/{2}" -f $CrmAg1, $CrmAg2, $CrmSup)

# ============================================================================
# 1) DELTA SCHEMA: crm_accounts.lifecycle_status + metadata colonna (clone)
# ============================================================================
Exec-Sql $DataCs @"
IF COL_LENGTH('dbo.crm_accounts', 'lifecycle_status') IS NULL
    ALTER TABLE dbo.crm_accounts ADD lifecycle_status VARCHAR(30) NOT NULL CONSTRAINT DF_crm_acc_lifecycle DEFAULT 'NUOVO';
"@ | Out-Null
# metadata: clona la riga della colonna 'industry' (text base) con override
Exec-Sql $MetaCs @"
IF NOT EXISTS (
    SELECT 1 FROM dbo._metadati__colonne c
    JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
    WHERE t.mdroutename = 'crm_accounts' AND c.mc_nome_colonna = 'lifecycle_status'
)
BEGIN
    -- compat level 100 (no STRING_AGG): aggregazione via FOR XML PATH,
    -- entrambe le liste ORDER BY column_id (stesso ordinamento).
    DECLARE @cols NVARCHAR(MAX), @sel NVARCHAR(MAX), @sql NVARCHAR(MAX);
    SET @cols = STUFF((
        SELECT ',' + QUOTENAME(name)
        FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo._metadati__colonne') AND is_identity = 0
        ORDER BY column_id
        FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 1, '');
    SET @sel = STUFF((
        SELECT ',' +
            CASE name
                WHEN 'mc_nome_colonna'   THEN '''lifecycle_status'''
                WHEN 'mcrealcolumnname'  THEN '''lifecycle_status'''
                WHEN 'mc_display_string_in_view' THEN '''Stato cliente'''
                WHEN 'mc_display_string_in_edit' THEN '''Stato cliente'''
                WHEN 'mcordine'          THEN '(SELECT MAX(c2.mcordine) + 1 FROM dbo._metadati__colonne c2 WHERE c2.md_id = src.md_id)'
                WHEN 'mc_ui_column_type' THEN '''dictionary'''
                WHEN 'mcdictionaryvalue' THEN '''NUOVO@@Nuovo||IN_ONBOARDING@@In onboarding||ATTIVO@@Attivo'''
                WHEN 'voa_class'         THEN '1'
                ELSE 'src.' + QUOTENAME(name)
            END
        FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo._metadati__colonne') AND is_identity = 0
        ORDER BY column_id
        FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 1, '');
    SET @sql = 'INSERT INTO dbo._metadati__colonne (' + @cols + ') SELECT ' + @sel
        + ' FROM dbo._metadati__colonne src JOIN dbo._metadati__tabelle t ON t.md_id = src.md_id'
        + ' WHERE t.mdroutename = ''crm_accounts'' AND src.mc_nome_colonna = ''industry'';';
    EXEC sp_executesql @sql;
END
"@ | Out-Null
Write-Host 'lifecycle_status: colonna + metadata OK'

# account demo per il flusso (NUOVO)
Exec-Sql $DataCs @"
IF NOT EXISTS (SELECT 1 FROM dbo.crm_accounts WHERE account_name LIKE 'WF Onboarding%')
INSERT INTO dbo.crm_accounts (account_name, vat_number, industry, phone, city, country, owner_user_id, Stato_Record, created_at, updated_at, lifecycle_status)
VALUES
 ('WF Onboarding Demo S.p.A.', 'IT90000000101', 'Software', '085000001', 'Pescara', 'IT', @sup, 0, SYSDATETIME(), SYSDATETIME(), 'NUOVO'),
 ('WF Onboarding Beta S.r.l.', 'IT90000000102', 'Retail',   '085000002', 'Montesilvano', 'IT', @sup, 0, SYSDATETIME(), SYSDATETIME(), 'NUOVO');
"@ @{ sup = [int]$CrmSup } | Out-Null

# ============================================================================
# 2) VISTE step (nuovi / in corso con conteggio task / coda task)
# ============================================================================
Exec-Sql $DataCs @"
EXEC('CREATE OR ALTER VIEW dbo.wf_onb_nuovi AS
  SELECT a.account_id, a.account_name, a.vat_number, a.industry, a.city, a.lifecycle_status, a.created_at
  FROM dbo.crm_accounts a
  WHERE a.lifecycle_status = ''NUOVO'' AND ISNULL(a.Stato_Record,0) = 0');
EXEC('CREATE OR ALTER VIEW dbo.wf_onb_incorso AS
  SELECT a.account_id, a.account_name, a.vat_number, a.city, a.lifecycle_status,
         (SELECT COUNT(*) FROM dbo.crm_activities t WHERE t.account_id = a.account_id AND t.completed = 0 AND ISNULL(t.Stato_Record,0) = 0) AS task_aperti,
         (SELECT COUNT(*) FROM dbo.crm_activities t WHERE t.account_id = a.account_id AND ISNULL(t.Stato_Record,0) = 0) AS task_totali
  FROM dbo.crm_accounts a
  WHERE a.lifecycle_status = ''IN_ONBOARDING'' AND ISNULL(a.Stato_Record,0) = 0');
EXEC('CREATE OR ALTER VIEW dbo.wf_onb_task AS
  SELECT t.activity_id, t.subject, t.due_date, t.completed, t.account_id, a.account_name,
         t.owner_user_id, cu.display_name AS assegnatario, u.id_utente AS owner_login_id
  FROM dbo.crm_activities t
  JOIN dbo.crm_accounts a ON a.account_id = t.account_id AND a.lifecycle_status = ''IN_ONBOARDING''
  LEFT JOIN dbo.crm_users cu ON cu.user_id = t.owner_user_id
  LEFT JOIN [$MetaDb].dbo.utenti u ON u.username = cu.username
  WHERE t.completed = 0 AND ISNULL(t.Stato_Record,0) = 0');
"@ | Out-Null
Write-Host 'Viste onboarding OK'

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
$MdNuovi   = Scaffold-Object 'wf_onb_nuovi' $true
$MdIncorso = Scaffold-Object 'wf_onb_incorso' $true
$MdTask    = Scaffold-Object 'wf_onb_task' $true

# ============================================================================
# 4) METADATA (display, pk viste, multiselection)
# ============================================================================
Exec-Sql $MetaCs @"
UPDATE dbo._metadati__tabelle SET mm_display_string = N'Clienti nuovi' WHERE mdroutename = N'wf_onb_nuovi';
UPDATE dbo._metadati__tabelle SET mm_display_string = N'Onboarding in corso' WHERE mdroutename = N'wf_onb_incorso';
UPDATE dbo._metadati__tabelle SET mm_display_string = N'Task onboarding' WHERE mdroutename = N'wf_onb_task';
UPDATE dbo._metadati__tabelle SET mdmultipleselection = 1 WHERE mdroutename IN (N'wf_onb_nuovi', N'wf_onb_incorso', N'wf_onb_task');
UPDATE c SET c.mc_is_primary_key = 1
FROM dbo._metadati__colonne c JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE (t.mdroutename IN (N'wf_onb_nuovi', N'wf_onb_incorso') AND c.mc_nome_colonna = N'account_id')
   OR (t.mdroutename = N'wf_onb_task' AND c.mc_nome_colonna = N'activity_id');
"@ | Out-Null
Exec-Sql $MetaCs @"
DELETE FROM dbo._mtdt__tnt__trzzzioni__tabelle
WHERE ruoloid IN ($RoleSupport, $RoleManager) AND md_id IN ($MdNuovi, $MdIncorso, $MdTask);
"@ | Out-Null
Write-Host 'Metadata OK'

# ============================================================================
# 5) FLUSH + bundle idratati
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
# 6) CALLBACK
# ============================================================================
$ctxAcc = "routeContext: JSON.stringify(wtoolbox.buildCrudRouteContext('crm_accounts', 'list', 'workflow-action'))"
$ctxAct = "routeContext: JSON.stringify(wtoolbox.buildCrudRouteContext('crm_activities', 'list', 'workflow-action'))"

$cbAvvia = @"
// AVVIA ONBOARDING (batch): account -> IN_ONBOARDING; i task paralleli sono
// materializzati dal nodo parallel_split A VALLE (azione interna sintetica 102).
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'warn', summary: 'Seleziona un cliente', life: 4000 }); resolve(); return; }
const rows = selected.map(function (r) { return wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; });
const apiBaseRaw = wtoolbox.appSettings?.api_url || (window.location.origin + '/api/');
const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw : (apiBaseRaw + '/');
const items = [];
for (const row of rows) {
  await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.updateRecord', { entity: { account_id: row.account_id, lifecycle_status: 'IN_ONBOARDING' }, route: 'crm_accounts', user_id: '', $ctxAcc }).toPromise();
  items.push({ account_id: row.account_id, account_name: row.account_name });
}
if (datasource.fetchData) { await datasource.fetchData(); }
wtoolbox.messageNotificationService?.add?.({ severity: 'success', summary: items.length + ' onboarding avviati', life: 4000 });
resolve(items);
"@

$cbCompleta = @"
// COMPLETA TASK (batch) dalla coda task onboarding.
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'warn', summary: 'Seleziona un task', life: 4000 }); resolve(); return; }
const rows = selected.map(function (r) { return wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; });
const apiBaseRaw = wtoolbox.appSettings?.api_url || (window.location.origin + '/api/');
const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw : (apiBaseRaw + '/');
for (const row of rows) {
  await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.updateRecord', { entity: { activity_id: row.activity_id, completed: true }, route: 'crm_activities', user_id: '', $ctxAct }).toPromise();
}
if (datasource.fetchData) { await datasource.fetchData(); }
wtoolbox.messageNotificationService?.add?.({ severity: 'success', summary: rows.length + ' task completati', life: 4000 });
resolve(rows.map(function (r) { return { activity_id: r.activity_id, account_id: r.account_id, subject: r.subject }; }));
"@

$cbAttiva = @"
// ATTIVA CLIENTE (batch) — JOIN GATE (F5): percorribile SOLO quando tutti i
// task dell'account sono chiusi (wtoolbox.areWorkflowTasksDone).
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'warn', summary: 'Seleziona un cliente', life: 4000 }); resolve(); return; }
const rows = selected.map(function (r) { return wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; });
const apiBaseRaw = wtoolbox.appSettings?.api_url || (window.location.origin + '/api/');
const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw : (apiBaseRaw + '/');
const items = []; const bloccati = [];
for (const row of rows) {
  const done = await wtoolbox.areWorkflowTasksDone('crm_activities', 'account_id', row.account_id, 'completed');
  if (!done) { bloccati.push(row.account_name); continue; }
  await wtoolbox.http.post(apiBase + 'Meta/AsmxProxy/MetaService.updateRecord', { entity: { account_id: row.account_id, lifecycle_status: 'ATTIVO' }, route: 'crm_accounts', user_id: '', $ctxAcc }).toPromise();
  items.push({ account_id: row.account_id, account_name: row.account_name });
}
if (bloccati.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'error', summary: 'Task ancora aperti', detail: bloccati.join(', '), life: 6000 }); }
if (datasource.fetchData) { await datasource.fetchData(); }
if (items.length) { wtoolbox.messageNotificationService?.add?.({ severity: 'success', summary: items.length + ' clienti attivati', life: 4000 }); }
resolve(items);
"@

$cbNotifAttivo = @"
const list = (Array.isArray(payload) ? payload : [payload]).filter(Boolean);
if (!list.length) { return payload; }
await wtoolbox.enqueueNotification({ roleId: $RoleManager, message: 'Clienti attivati: ' + list.map(function (x) { return x.account_name || ('#' + x.account_id); }).join(', '), type: 'workflow' });
return payload;
"@

$dcTemplate = @"
const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
if (!selected.length) { return true; }
return selected.some(function (r) { const row = wtoolbox.unwrapEntity ? wtoolbox.unwrapEntity(r) : r; return __COND__; });
"@
$dcNuovi   = $dcTemplate.Replace('__COND__', "String(row.lifecycle_status) !== 'NUOVO'")
$dcIncorso = $dcTemplate.Replace('__COND__', "String(row.lifecycle_status) !== 'IN_ONBOARDING'")
$dcTask    = $dcTemplate.Replace('__COND__', "Boolean(row.completed)")

# ============================================================================
# 7) BUNDLE + START MENU + GRAFO (parallel split/join F5)
# ============================================================================
$bundleAccounts = New-Bundle 'crm_accounts' 'Clienti (WF)' @() @(
    (New-TablePerm 1 $RoleSupport $true $false $false $false $true),
    (New-TablePerm 2 $RoleManager $true $false $false $false $true)
)
$bundleAccounts.tableMetadata.md_workflow_state_field = 'lifecycle_status'

$bundleActivities = New-Bundle 'crm_activities' 'Task (WF)' @() @(
    (New-TablePerm 1 $RoleSupport $true $false $false $false $true),
    (New-TablePerm 2 $RoleManager $true $false $false $false $true)
)

$bundleNuovi = New-Bundle 'wf_onb_nuovi' 'Clienti nuovi' @(
    @{ Id = 1; md_id = $MdNuovi; md_action_type = 5; ordine = 10; button_caption = 'Avvia onboarding'; button_image = 'pi pi-play'; button_template = ''; action_callback = $cbAvvia; disable_callback = $dcNuovi }
) @(
    (New-TablePerm 1 $RoleManager $true $false $false $false)
)
$bundleNuovi.tableMetadata.md_workflow_state_field = 'lifecycle_status'

$bundleIncorso = New-Bundle 'wf_onb_incorso' 'Onboarding in corso' @(
    @{ Id = 1; md_id = $MdIncorso; md_action_type = 5; ordine = 10; button_caption = 'Attiva cliente'; button_image = 'pi pi-check-circle'; button_template = ''; action_callback = $cbAttiva; disable_callback = $dcIncorso }
) @(
    (New-TablePerm 1 $RoleManager $true $false $false $false),
    (New-TablePerm 2 $RoleSupport $true $false $false $false)
)
$bundleIncorso.tableMetadata.md_workflow_state_field = 'lifecycle_status'

$bundleTask = New-Bundle 'wf_onb_task' 'Task onboarding' @(
    @{ Id = 1; md_id = $MdTask; md_action_type = 5; ordine = 10; button_caption = 'Completa task'; button_image = 'pi pi-check'; button_template = ''; action_callback = $cbCompleta; disable_callback = $dcTask }
) @(
    (New-TablePerm 1 $RoleSupport $true $false $false $false),
    (New-TablePerm 2 $RoleManager $true $false $false $false $true)
)

function New-StartMenu([int]$Id, [string]$Caption, [string]$Uri, [int]$Ordine, [array]$RoleIds, [bool]$VisibleDefault) {
    $auth = @(); $seq = 1
    foreach ($r in $RoleIds) { $auth += @{ mmid = $Id; muamid = $seq; muamview = 1; ruoloid = $r; utenteid = 0 }; $seq++ }
    return @{
        mm_id = $Id; mm_parent_id = 0; mm_nome_menu = "wfonb_menu_$Id"
        mm_display_string_menu = $Caption; mm_tooltip_menu = $Caption
        mm_uri_menu = $Uri; mm_ordine = $Ordine
        mm_is_visible_by_default = $VisibleDefault
        _Metadati_Utenti_Autorizzazioni_Menus = $auth
    }
}
$startMenus = @(
    (New-StartMenu 9401 'Clienti nuovi'       '/wf_onb_nuovi/list'   10 @($RoleManager, 1) $false),
    (New-StartMenu 9402 'Onboarding in corso' '/wf_onb_incorso/list' 20 @($RoleManager, $RoleSupport, 1) $false),
    (New-StartMenu 9403 'Task onboarding'     '/wf_onb_task/list'    30 @($RoleSupport, $RoleManager, 1) $false)
)
$startMenus[1].mm_badge_route = 'wf_onb_incorso'
$startMenus[2].mm_badge_route = 'wf_onb_task'

$splitConfig = @{
    task_route = 'crm_activities'
    fk_field = 'account_id'
    record_pk_field = 'account_id'
    caption_field = 'subject'
    done_field = 'completed'
    assignee_field = 'owner_user_id'
    due_days = 7
    extra_defaults = @{ activity_type_id = 4 }
    branches = @(
        @{ caption = 'Onboarding: setup contratto'; assignee_user_id = [int]$CrmAg1 },
        @{ caption = 'Onboarding: kickoff call';    assignee_user_id = [int]$CrmAg2 },
        @{ caption = 'Onboarding: provisioning';    assignee_user_id = [int]$CrmSup }
    )
}

function New-Node([string]$Id, [string]$Label, [string]$Type, [hashtable]$Extra = @{}, [int]$X = 0, [int]$Y = 0) {
    $n = @{ id = $Id; label = $Label; type = $Type; route = ''; action = ''; x = $X; y = $Y }
    foreach ($k in $Extra.Keys) { $n[$k] = $Extra[$k] }
    return $n
}
$GraphKey  = 'wf_onboarding'
$GraphName = 'Onboarding Cliente'
$nodes = @(
    (New-Node 'n_start' 'Start - Onboarding' 'start' @{ startMenus = $startMenus; startMenuCaption = 'Onboarding'; startExclusiveMenu = $true; startShowExit = $true; startInheritMetadata = $false } 60 300),
    (New-Node 'n_nuovi' 'wf_onb_nuovi/list' 'route' @{ route = 'wf_onb_nuovi'; action = 'list'; routeSourceType = 'route' } 320 300),
    (New-Node 'a_avvia' 'Avvia onboarding' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_nuovi'; metadataTargetType = 'table_action'; metadataTargetId = 1 } 600 300),
    (New-Node 'sp_split' 'Split - task paralleli' 'parallel_split' @{ splitConfig = $splitConfig } 860 300),
    (New-Node 'n_task' 'wf_onb_task/list' 'route' @{ route = 'wf_onb_task'; action = 'list'; routeSourceType = 'route' } 860 520),
    (New-Node 'a_completa' 'Completa task' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_task'; metadataTargetType = 'table_action'; metadataTargetId = 1 } 1120 520),
    (New-Node 'j_join' 'Join - tutti chiusi' 'parallel_join' @{} 1120 300),
    (New-Node 'n_incorso' 'wf_onb_incorso/list' 'route' @{ route = 'wf_onb_incorso'; action = 'list'; routeSourceType = 'route' } 1380 300),
    (New-Node 'a_attiva' 'Attiva cliente' 'action' @{ actionTypeId = 5; actionType = 'approve.action'; actionScopeId = 0; actionScope = 'azione_tab'; routeNodeId = 'n_incorso'; metadataTargetType = 'table_action'; metadataTargetId = 1 } 1660 300),
    (New-Node 'i_notif' 'Notifica attivazione' 'action' @{ actionTypeId = 100; actionType = 'workflow.notification'; actionScopeId = 2; actionScope = 'internal'; actionCallback = $cbNotifAttivo } 1920 300),
    (New-Node 'n_end' 'End' 'end' @{} 2160 300)
)
function New-Conn([string]$Id, [string]$Src, [string]$SrcOut, [string]$Tgt, [string]$TgtIn, [hashtable]$Trans = @{}) {
    $c = @{ id = $Id; source = $Src; sourceOutput = $SrcOut; target = $Tgt; targetInput = $TgtIn }
    foreach ($k in $Trans.Keys) { $c[$k] = $Trans[$k] }
    return $c
}
$connections = @(
    (New-Conn 'e1' 'n_start' 'out' 'n_nuovi' 'in'),
    (New-Conn 'e2' 'n_nuovi' 'out' 'a_avvia' 'in' @{ transitionPermission = "grant:role:$RoleManager,role:1"; transitionEvent = 'avvia'; transitionGuard = "String(record.lifecycle_status) === 'NUOVO'" }),
    # split A VALLE del trigger: azione interna SINTETICA 102 (materializza i task)
    (New-Conn 'e3' 'a_avvia' 'out' 'sp_split' 'in' @{ transitionEvent = 'fork_task' }),
    (New-Conn 'e4' 'sp_split' 'out' 'j_join' 'in'),
    (New-Conn 'e5' 'j_join' 'out' 'n_incorso' 'in' @{ transitionEvent = 'all_tasks_done' }),
    # lavorazione task (step dedicato)
    (New-Conn 'e6' 'n_task' 'out' 'a_completa' 'in' @{ transitionPermission = "grant:role:$RoleSupport,role:$RoleManager,role:1"; transitionEvent = 'completa_task' }),
    # attivazione (gate del join nel callback: areWorkflowTasksDone)
    (New-Conn 'e7' 'n_incorso' 'out' 'a_attiva' 'in' @{ transitionPermission = "grant:role:$RoleManager,role:1"; transitionEvent = 'attiva'; transitionGuard = "String(record.lifecycle_status) === 'IN_ONBOARDING'" }),
    (New-Conn 'e8' 'a_attiva' 'out' 'i_notif' 'in'),
    (New-Conn 'e9' 'i_notif' 'out' 'n_end' 'in')
)

$graph = @{ nodes = $nodes; connections = $connections }
$graphJson = ConvertTo-Json -InputObject $graph -Compress -Depth 24
$routeMetadata = @(
    @{ node_id = 'n_nuovi'; route_name = 'wf_onb_nuovi'; route_action = 'list'; metadata_json = (ConvertTo-Json -InputObject $bundleNuovi -Compress -Depth 12) },
    @{ node_id = 'n_incorso'; route_name = 'wf_onb_incorso'; route_action = 'list'; metadata_json = (ConvertTo-Json -InputObject $bundleIncorso -Compress -Depth 12) },
    @{ node_id = 'n_task'; route_name = 'wf_onb_task'; route_action = 'list'; metadata_json = (ConvertTo-Json -InputObject $bundleTask -Compress -Depth 12) },
    # bundle CONTEXT-ONLY (tabelle fisiche dei callback)
    @{ node_id = 'n_accounts_ctx'; route_name = 'crm_accounts'; route_action = 'list'; metadata_json = (ConvertTo-Json -InputObject $bundleAccounts -Compress -Depth 12) },
    @{ node_id = 'n_activities_ctx'; route_name = 'crm_activities'; route_action = 'list'; metadata_json = (ConvertTo-Json -InputObject $bundleActivities -Compress -Depth 12) }
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
# 8) MENU APP + INVALIDATE
# ============================================================================
$menuExists = Scalar-Sql $MetaCs "SELECT COUNT(*) FROM dbo._metadati__menu WHERE mm_uri_menu = N'workflow-runner/wf_onboarding'"
if ([int]$menuExists -eq 0) {
    Exec-Sql $MetaCs @"
DECLARE @mmid INT = (SELECT ISNULL(MAX(mm_id),0)+1 FROM dbo._metadati__menu);
DECLARE @ord INT = (SELECT ISNULL(MAX(mmordine),0)+10 FROM dbo._metadati__menu WHERE mm_parent_id IS NULL);
INSERT INTO dbo._metadati__menu (mm_id, mm_parent_id, mm_nome_menu, mm_display_string_menu, mm_tooltip_menu, mm_uri_menu, mmordine, mm_is_visible_by_default)
VALUES (@mmid, NULL, N'wf_onboarding', N'Onboarding (WF)', N'Workflow onboarding clienti', N'workflow-runner/wf_onboarding', @ord, 1);
"@ | Out-Null
    Write-Host 'Voce menu creata'
} else { Write-Host "Voce menu gia' presente" }

Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/MetaService.invalidateMetadataRuntime" -WebSession $session -ContentType 'application/json' -Body '{"clearAll":true}' | Out-Null
$ver = Invoke-RestMethod -TimeoutSec 120 -Method Post -Uri "$AsmxBase/MetaService.getProjectMetadataVersion" -WebSession $session -ContentType 'application/json' -Body '{}'
Write-Host ("invalidate OK, version={0}" -f ($ver | ConvertTo-Json -Compress))

Write-Host ''
Write-Host '=== create-wf-onboarding-demo: DONE ==='
Write-Host ("Grafo: {0} (menu 'Onboarding (WF)') | Utenti demo helpdesk riusati" -f $GraphKey)
