using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.IO;
using System.Linq;
using Microsoft.AspNetCore.Http;
using Dapper;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Oracle.ManagedDataAccess.Client;
using System.ComponentModel.DataAnnotations;
using metaModelRaw;
using ngUicOrm.metaModel;
using WEB_UI_CRAFTER.Helpers;
using WuicCore.Services.Licensing;

public class oracleDataProvider : IMetaQuery
{
    private const int UnlicensedMaxRecords = 20;

    private static void ApplyUnlicensedRequestCap(PageInfo pageInfo)
    {
        if (pageInfo == null)
            return;

        pageInfo.pageSize = UnlicensedMaxRecords;
        pageInfo.currentPage = Math.Max(pageInfo.currentPage, 1);
    }

    private static void ApplyUnlicensedResultCap(rawPagedResult pr, LicenseEvaluationResult licenseEvaluation, string operation, string routeOrStored)
    {
        if (pr == null)
            return;

        pr.licenseLimited = true;
        pr.licenseLimitReason = licenseEvaluation?.Reason ?? "license_invalid";
        if (pr.results != null && pr.results.Count > UnlicensedMaxRecords)
            pr.results = pr.results.Cast<object>().Take(UnlicensedMaxRecords).ToList();

        pr.TotalRecords = Math.Min(pr.TotalRecords, UnlicensedMaxRecords);
        pr.cursorMode = false;
        pr.nextPageCursor = null;
        pr.prevPageCursor = null;

        LicenseRuntime.Service.TryLogInvalidLicenseWarning(licenseEvaluation, operation, routeOrStored);
    }

    public void logOut(user user) => metaQueryOracleSql.logOut(user);

    public void logOutForce()
    {
        List<user> users = GetUserList(true);
        if (users == null)
            return;

        users.ForEach(logOut);
    }

    public rawPagedResult GetLoggedUsers() => metaQueryOracleSql.getLoggedUsers();

    public int GetLoggedUserCount() => metaQueryOracleSql.getLoggedUserCount();

    public user login(string user_name, string password, SysInfo infos) => metaQueryOracleSql.login(user_name, password, infos);

    public user mapUserFields(SysInfo infos, Dapper.SqlMapper.FastExpando user)
    {
        string userid = user.Where(x => x.Key == infos.user_id_column_name).First().Value.ToString();
        string display = user.Where(x => x.Key == infos.user_description_column_name).First().Value.ToString();
        bool isAdmin = (bool)user.Where(x => x.Key == infos.isAdmin_column_name).First().Value;
        string roleId = user.Where(x => x.Key == infos.role_id_column_name).First().Value.ToString();
        string userName = user.Where(x => x.Key == infos.username_column_name).First().Value.ToString();

        List<role> allRoles = GetRoleList();
        role myRole = allRoles?.FirstOrDefault(x => x.role_id == roleId);
        List<role> roles = GetMultipleRoleRoleByUserID(userid) ?? new List<role>();

        var lastAct = user.Where(x => x.Key == "LastActivityDate").FirstOrDefault().Value;
        DateTime lastActivity = DateTime.MinValue;
        if (lastAct != null)
            DateTime.TryParse(lastAct.ToString(), out lastActivity);

        user u = new user
        {
            display_name = display,
            isAdmin = isAdmin,
            role = myRole?.role_name ?? "",
            otherRoles = roles,
            role_id = roleId,
            user_id = userid,
            username = userName,
            LastActivityDate = lastActivity,
            extra_keys = new SerializableDictionary<string, object>(),
            extra_client = new SerializableDictionary<string, object>(),
            ip = user.data.ContainsKey("ip") ? RawHelpers.ParseNull(user.data["ip"]) : "",
            email = user.data.ContainsKey("email") ? RawHelpers.ParseNull(user.data["email"]) : ""
        };

        if (user.data.ContainsKey("language") && user.data["language"] != null)
            u.language = user.data["language"].ToString();

        // foreach (string extraField in user.data.Keys.Where(x => x != infos.password_column_name))

        if (user.data.ContainsKey(infos.azienda_id_column_name) && user.data[infos.azienda_id_column_name] != null)
            u.azienda_id = int.Parse(user.data[infos.azienda_id_column_name].ToString());

        return u;
    }

    public List<user> GetUserList(bool force = false) => metaQueryOracleSql.getUserList();

    public List<role> GetRoleList() => metaQueryOracleSql.getRoleList();

    public rawPagedResult GetAziendeList() => metaQueryOracleSql.getAziendeList();

    public role GetRoleByUserID(string user_id) => metaQueryOracleSql.getRoleByUserID(user_id);

    public List<role> GetMultipleRoleRoleByUserID(string user_id) => metaQueryOracleSql.getMultipleRoleRoleByUserID(user_id);

    public user getUserByID(string user_id) => metaQueryOracleSql.getUserByID(user_id);

    public user GetUserByEMail(string email) => metaQueryOracleSql.getUserByEMail(email);

    public user GetUserByName(string user_name) => metaQueryOracleSql.getUserByName(user_name);

    public DateTime? getLastUserActivityByID(string user_id)
    {
        using (metaRawModel context = new metaRawModel())
            return context.GetLastActivityDateByUserId(user_id);
    }

    public string readCustomSettings(string user_id, string key)
    {
        using (OracleConnection connection = metaQueryOracleSql.GetOpenConnection(true))
        {
            // Oracle: customSettings è CLOB; coalesce(CLOB, '') causa ORA-00932 (CLOB vs CHAR).
            // Wrap del literal vuoto in TO_CLOB per allineare i tipi.
            string settings = connection.Query<string>(
                "select coalesce(customSettings, TO_CLOB('')) from utenti where id_utente=:id_utente",
                new { id_utente = user_id }).FirstOrDefault() ?? "";

            if (string.IsNullOrEmpty(key))
                return settings;

            Dictionary<string, object> dict = string.IsNullOrEmpty(settings)
                ? new Dictionary<string, object>()
                : JsonConvert.DeserializeObject<Dictionary<string, object>>(settings);

            return dict != null && dict.ContainsKey(key) ? dict[key]?.ToString() : null;
        }
    }

    public void clearCustomSettings(string key)
    {
        string currentUserId = RawHelpers.authenticate();
        if (string.IsNullOrEmpty(currentUserId))
            return;

        string settings = readCustomSettings(currentUserId, "") ?? "{}";
        Dictionary<string, object> dict = JsonConvert.DeserializeObject<Dictionary<string, object>>(settings) ?? new Dictionary<string, object>();
        if (!dict.ContainsKey(key))
            return;

        dict[key] = null;
        using (OracleConnection connection = metaQueryOracleSql.GetOpenConnection(true))
        {
            connection.Execute("update utenti set customSettings=:customSettings where id_utente=:id_utente",
                new { customSettings = JsonConvert.SerializeObject(dict), id_utente = currentUserId });
        }
    }

    public decimal readProgress(string guid)
    {
        using (DbConnection connection = metaQueryOracleSql.GetOpenConnection(true))
            return connection.Query<decimal>("SELECT coalesce(progress, -1) FROM _progress_indicator WHERE guid=:guid", new { guid }).FirstOrDefault();
    }

    public void saveProgress(string guid, decimal progress)
    {
        using (DbConnection connection = metaQueryOracleSql.GetOpenConnection(true))
        {
            int i = connection.Execute("UPDATE _progress_indicator SET progress=:progress WHERE guid=:guid", new { guid, progress });
            if (i == 0)
                connection.Execute("INSERT INTO _progress_indicator(guid, progress) VALUES(:guid, :progress)", new { guid, progress });
        }
    }

    public string saveCustomSettings(string user_id, string settings, string key)
    {
        string completeSettings = readCustomSettings(user_id, "") ?? "{}";
        Dictionary<string, object> dict = JsonConvert.DeserializeObject<Dictionary<string, object>>(completeSettings) ?? new Dictionary<string, object>();
        object deserializedSettings = string.IsNullOrWhiteSpace(settings) ? null : JsonConvert.DeserializeObject(settings);

        if (dict.ContainsKey(key))
            dict[key] = deserializedSettings;
        else
            dict.Add(key, deserializedSettings);

        using (OracleConnection connection = metaQueryOracleSql.GetOpenConnection(true))
        {
            int updated = connection.Execute("update utenti set customSettings=:customSettings where id_utente=:id_utente",
                new { customSettings = JsonConvert.SerializeObject(dict), id_utente = user_id });
            return updated.ToString();
        }
    }

    public string ExportFlatRecordData(List<SerializableDictionary<string, object>> dati, List<SerializableDictionary<string, object>> lst, string route, string uid, string progressGuid)
    {
        saveProgress(progressGuid, 100);
        return "";
    }

    public string GetOpenConnection(string route)
    {
        bool isMeta = RawHelpers.checkIsMetaData(route);
        using (OracleConnection connection = metaQueryOracleSql.GetOpenConnection(isMeta))
            return connection.ConnectionString;
    }

    public rawPagedResult GetFlatData(
        string user_id,
        string route,
        int lookup_table_id = 0,
        List<SortInfo> SortInfo = null,
        List<GroupInfo> GroupInfo = null,
        PageInfo PageInfo = null,
        FilterInfos filterInfo = null,
        string logicOperator = "AND",
        bool has_server_operation = true,
        List<AggregationInfo> aggregates = null,
        List<string> columnRestrictionLists = null,
        string formula_lookup = "",
        int mc_id = 0,
        bool skipNested = false,
        string extraFields = "",
        SerializableDictionary<string, object> currentRecord = null)
    {
        LicenseEvaluationResult licenseEvaluation = LicenseRuntime.Service.Evaluate();
        bool enforceUnlicensedCap = licenseEvaluation == null || !licenseEvaluation.IsValid;
        if (enforceUnlicensedCap)
            ApplyUnlicensedRequestCap(PageInfo);

        rawPagedResult result = metaQueryOracleSql.GetFlatData(user_id, route, lookup_table_id, SortInfo, GroupInfo, PageInfo, filterInfo, logicOperator, has_server_operation, aggregates, columnRestrictionLists, formula_lookup, mc_id, skipNested);

        if (enforceUnlicensedCap)
            ApplyUnlicensedResultCap(result, licenseEvaluation, "OracleProvider.GetFlatData", route);

        return result;
    }

    public string UpdateflatData(Dictionary<string, object> entity, string route, string userId, DbConnection conn = null, IDbTransaction trn = null)
        => metaQueryOracleSql.UpdateflatData(entity, route, userId);

    public string DeleteflatData(Dictionary<string, object> entity, string route, string userId, DbConnection conn = null, IDbTransaction trn = null)
        => metaQueryOracleSql.DeleteflatData(entity, route, userId);

    public string InsertflatData(Dictionary<string, object> entity, string route, string userId, DbConnection conn = null, IDbTransaction trn = null)
        => metaQueryOracleSql.InsertflatData(entity, route, userId);

    public rawPagedResult GetDistinctValues(int column_id, string text, string filter_type, int max_results, string user_id)
        => metaQueryOracleSql.GetDistinctValues(column_id, text, filter_type, max_results, user_id);

    public rawPagedResult getFlatRecordDistinctComboData(
        string user_id,
        string route,
        string ownerRoute,
        List<SortInfo> SortInfo,
        List<GroupInfo> GroupInfo,
        PageInfo PageInfo,
        FilterInfos filterInfo,
        string logicOperator,
        bool has_server_operation,
        List<string> columnRestrictionList,
        string formula_lookup,
        int mc_id)
    {
        return metaQueryOracleSql.GetFlatData(user_id, route, 0, SortInfo, GroupInfo, PageInfo, filterInfo, logicOperator, has_server_operation, null, columnRestrictionList, formula_lookup, mc_id, false);
    }

    public rawPagedResult GetFlatDataFromStored(
        string user_id,
        string stored,
        List<filterElement> parameters,
        long __pageIndex,
        int __pageSize,
        string __sortField,
        string __sortDir,
        bool skipExtraParams = false,
        bool noResults = false)
    {
        LicenseEvaluationResult licenseEvaluation = LicenseRuntime.Service.Evaluate();
        bool enforceUnlicensedCap = licenseEvaluation == null || !licenseEvaluation.IsValid;
        if (enforceUnlicensedCap && __pageSize > 0 && __pageSize > UnlicensedMaxRecords)
            __pageSize = UnlicensedMaxRecords;

        rawPagedResult result = metaQueryOracleSql.GetFlatDataFromStored(user_id, stored, parameters, __pageIndex, __pageSize, __sortField, __sortDir, skipExtraParams, noResults);

        if (enforceUnlicensedCap)
            ApplyUnlicensedResultCap(result, licenseEvaluation, "OracleProvider.GetFlatDataFromStored", stored);

        return result;
    }

    public string CloneData(IDictionary<string, object> entity, string route, string user_id, List<routePair> relatedRouteToClone)
        => metaQueryOracleSql.CloneData(entity, route, user_id, relatedRouteToClone);

    public UploadFileInfo FileUploadHandle(string uploaded_file_string, string name, string type, string error, uploadOptions uploadOption)
    {
        UploadFileInfo output = new UploadFileInfo
        {
            name = name,
            type = type,
            error = error,
            uploadOpt = uploadOption
        };

        if (string.IsNullOrWhiteSpace(uploaded_file_string))
        {
            output.error = string.IsNullOrWhiteSpace(error) ? "missingFileContent" : error;
            return output;
        }

        try
        {
            string base64 = uploaded_file_string;
            int marker = uploaded_file_string.IndexOf("base64,", StringComparison.OrdinalIgnoreCase);
            if (marker >= 0)
                base64 = uploaded_file_string.Substring(marker + 7);

            byte[] content = Convert.FromBase64String(base64);
            uploadOptions options = uploadOption ?? new uploadOptions();

            using (MemoryStream stream = new MemoryStream(content))
            {
                FormFile file = new FormFile(stream, 0, stream.Length, "files", name)
                {
                    Headers = new HeaderDictionary(),
                    ContentType = type
                };

                jQueryFileUpload.UploadHandlerCustom uploadHandler = new jQueryFileUpload.UploadHandlerCustom();
                jQueryFileUpload.UploadFileInfo uploaded = uploadHandler.FileUploadHandle(file, name, content.Length, type, error, options);

                return new UploadFileInfo
                {
                    name = uploaded.name,
                    size = uploaded.size,
                    width = uploaded.width,
                    height = uploaded.height,
                    type = uploaded.type,
                    dir = uploaded.dir,
                    url = uploaded.url,
                    thumbnail_url = uploaded.thumbnail_url,
                    error = uploaded.error,
                    delete_type = uploaded.delete_type,
                    delete_url = uploaded.delete_url,
                    base64Content = uploaded.base64Content,
                    uploadOpt = uploaded.uploadOpt
                };
            }
        }
        catch (FormatException)
        {
            output.error = "invalidBase64";
            return output;
        }
        catch (Exception ex)
        {
            output.error = ex.Message;
            return output;
        }
    }

    public string RestoreflatData(SerializableDictionary<string, object> entity, string route, string user_id)
    {
        Dictionary<string, object> normalized = new Dictionary<string, object>(entity);
        if (normalized.ContainsKey("cancellato"))
            normalized["cancellato"] = 0;
        if (normalized.ContainsKey("stato_record"))
            normalized["stato_record"] = "A";
        return metaQueryOracleSql.UpdateflatData(normalized, route, user_id);
    }

    // ===========================================================================
    // VIEW BUILDER / PIVOT BUILDER — implementazioni Oracle-specifiche
    //
    // Pattern (allineato a CRUD): MetaService.cs ha la versione MSSQL inline e,
    // quando `dbms=oracle` (o `meta-dbms=oracle`), dispaccia qui via
    // `RawHelpers.getMetaQueryProvider("oracle").<method>()`.
    //
    // Differenze SQL gestite qui (rispetto a MSSQL/MySQL):
    //   - identifier quoting con doppi apici "..." (case-sensitive in Oracle
    //     quando virgolettati; manteniamo il case originale dei nomi)
    //   - FETCH FIRST N ROWS ONLY (Oracle 12c+) invece di LIMIT N
    //   - ALL_TAB_COLUMNS WHERE OWNER = SYS_CONTEXT('USERENV','CURRENT_SCHEMA')
    //     AND TABLE_NAME = UPPER(:tableName) — Oracle uppercase by default
    //   - ALL_VIEWS per existence check
    //   - CREATE OR REPLACE FORCE VIEW (FORCE permette refs a oggetti non
    //     ancora compilabili)
    //   - NVL(x, y) invece di IFNULL/ISNULL
    //   - SDO_UTIL.TO_WKTGEOMETRY per export spatial (Oracle Spatial)
    //   - SDO_GEOMETRY('<wkt>', NULL) per spatial equality
    // ===========================================================================

    private static string QId(string identifier)
    {
        // Delega a `metaQueryOracleSql.EscapeDBObjectName` per coerenza con tutto il resto
        // del satellite Oracle. Quel metodo gestisce correttamente:
        //   - safe identifier (es. `Application__Cities`) → emette UPPER unquoted
        //     (`APPLICATION__CITIES`), che Oracle case-folde e matcha il physical UPPER.
        //   - identifier con leading underscore (es. `_metadati__colonne`) → quoted preservando
        //     case (`"_metadati__colonne"`) perche' Oracle richiede letter-start unquoted.
        //   - reserved keywords (es. ORDER, TYPE) → quoted UPPER per evitare ORA-00904.
        //
        // Il vecchio QId quotava tutto literalmente preservando il case dell'input — su Oracle
        // significava ORA-00942 ogni volta che il metadata aveva il physical name mixed-case
        // (es. md_nome_tabella='Application__Cities') ma il fisico era `APPLICATION__CITIES`
        // UPPER. Pattern documentato in `metaQueryOracleSql.EscapeDBObjectName` line 2714.
        return metaQueryOracleSql.EscapeDBObjectName(identifier ?? string.Empty);
    }

    /// <summary>
    /// Versione Oracle di MetaService.previewViewDefinition.
    /// Dispatch via `RawHelpers.getMetaQueryProvider("oracle").previewViewDefinition(...)`.
    /// </summary>
    public SerializableDictionary<string, object> previewViewDefinition(
        string user_id,
        string viewDefinitionJson,
        int maxRows = 0,
        bool generateOnly = false,
        string filterInfoJson = "",
        string manual_sql = "")
    {
        var response = new SerializableDictionary<string, object>();
        try
        {
            string uid = RawHelpers.authenticate();
            RawHelpers.checkAdmin(uid);

            // --- Manual SQL mode ---
            if (!string.IsNullOrWhiteSpace(manual_sql))
            {
                int safeMaxRowsManual = maxRows > 0 ? maxRows : 0;
                string execSqlManual = manual_sql.Trim();
                if (safeMaxRowsManual > 0
                    && !System.Text.RegularExpressions.Regex.IsMatch(execSqlManual, @"\bfetch\s+first\s+\d+", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                {
                    execSqlManual = execSqlManual.TrimEnd(';') + " FETCH FIRST " + safeMaxRowsManual + " ROWS ONLY";
                }

                response["ok"] = true;
                response["sql"] = manual_sql.Trim();

                if (!generateOnly)
                {
                    using (var dataConn = metaQueryOracleSql.GetOpenConnection(false))
                    {
                        var rows = (List<Dapper.SqlMapper.FastExpando>)dataConn.Query(execSqlManual);
                        var resultColumns = new List<string>();
                        var resultRows = new List<Dictionary<string, object>>();
                        if (rows.Count > 0) resultColumns.AddRange(rows[0].data.Keys);
                        foreach (var row in rows) resultRows.Add(new Dictionary<string, object>(row.data));
                        response["columns"] = resultColumns;
                        response["rows"] = resultRows;
                        response["rowCount"] = resultRows.Count;
                    }
                }
                return response;
            }

            if (string.IsNullOrWhiteSpace(viewDefinitionJson))
                throw new ValidationException("viewDefinition is required.");

            JObject def = JObject.Parse(viewDefinitionJson);
            JArray tables = def["tables"] as JArray;
            JArray joins = def["joins"] as JArray;
            if (tables == null || tables.Count == 0)
                throw new ValidationException("viewDefinition must have at least one table.");

            int safeMaxRows = maxRows > 0 ? maxRows : 0;

            using (var metaConn = metaQueryOracleSql.GetOpenConnection(true))
            {
                // Build table info from metadata.
                var tableInfos = new List<(string Alias, string PhysicalName, string Schema, string ConnName, JArray SelectedCols)>();
                const string metaSql = @"
SELECT
    TRIM(NVL(md_nome_tabella, '')) AS table_name,
    TRIM(NVL(NULLIF(mdschemaname, ''), '')) AS schema_name,
    TRIM(NVL(NULLIF(mdconnname, ''), 'DataSQLConnection')) AS conn_name
FROM _metadati__tabelle
WHERE TRIM(NVL(mdroutename, '')) = :route
FETCH FIRST 1 ROWS ONLY";
                foreach (var tbl in tables)
                {
                    string route = Convert.ToString(tbl["route"] ?? "").Trim();
                    string alias = Convert.ToString(tbl["tableAlias"] ?? "").Trim();
                    var cols = tbl["columns"] as JArray ?? new JArray();
                    var selectedCols = new JArray(cols.Where(c => c["selected"]?.Value<bool>() == true));
                    if (string.IsNullOrWhiteSpace(route) || string.IsNullOrWhiteSpace(alias)) continue;

                    var meta = metaConn.Query(metaSql, new { route }).FirstOrDefault();
                    if (meta == null)
                        throw new Exception($"Route '{route}' non trovata nei metadati.");

                    tableInfos.Add((
                        alias,
                        Convert.ToString(meta.table_name),
                        Convert.ToString(meta.schema_name),
                        Convert.ToString(meta.conn_name),
                        selectedCols
                    ));
                }
                if (tableInfos.Count == 0)
                    throw new ValidationException("No valid tables in viewDefinition.");

                // Physical columns + spatial type detect.
                var spatialColumnTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                var physicalColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                using (var dataConnSchema = metaQueryOracleSql.GetOpenConnection(false))
                {
                    const string colSql = @"SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS
                                            WHERE OWNER = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') AND TABLE_NAME = UPPER(:tableName)";
                    foreach (var info in tableInfos)
                    {
                        var dbCols = (List<Dapper.SqlMapper.FastExpando>)dataConnSchema.Query(colSql,
                            new { tableName = info.PhysicalName });
                        foreach (var c in dbCols)
                        {
                            string colName = Convert.ToString(c.data["COLUMN_NAME"]);
                            string dataType = Convert.ToString(c.data["DATA_TYPE"]).ToLowerInvariant();
                            string key = $"{info.Alias}|{colName}";
                            physicalColumns.Add(key);
                            if (dataType == "sdo_geometry" || dataType == "geometry")
                                spatialColumnTypes[key] = dataType;
                        }
                    }
                }

                // SELECT columns.
                var selectParts = new List<string>();
                foreach (var info in tableInfos)
                {
                    foreach (var col in info.SelectedCols)
                    {
                        string realName = Convert.ToString(col["realName"] ?? col["alias"] ?? "").Trim();
                        string colLabel = Convert.ToString(col["label"] ?? col["alias"] ?? "").Trim();
                        string qualifiedAlias = $"{info.Alias}.{colLabel}";
                        string lookupKey = $"{info.Alias}|{realName}";
                        if (!string.IsNullOrWhiteSpace(realName) && physicalColumns.Contains(lookupKey))
                        {
                            string formula = Convert.ToString(col["formula"] ?? "").Trim();
                            string formulaAlias = Convert.ToString(col["formulaAlias"] ?? "").Trim();
                            string colRef;
                            string outputAlias;
                            if (!string.IsNullOrWhiteSpace(formula))
                            {
                                colRef = formula;
                                outputAlias = !string.IsNullOrWhiteSpace(formulaAlias)
                                    ? $"{info.Alias}.{formulaAlias}"
                                    : qualifiedAlias;
                            }
                            else
                            {
                                colRef = $"{QId(info.Alias)}.{QId(realName)}";
                                if (spatialColumnTypes.ContainsKey(lookupKey))
                                    colRef = $"SDO_UTIL.TO_WKTGEOMETRY({colRef})";
                                outputAlias = qualifiedAlias;
                            }
                            selectParts.Add($"{colRef} AS {QId(outputAlias)}");
                        }
                    }
                }
                if (selectParts.Count == 0)
                    throw new ValidationException("No columns selected in viewDefinition.");

                // FROM + JOINs (Oracle no schema-prefix).
                string FromOf((string Alias, string PhysicalName, string Schema, string ConnName, JArray SelectedCols) ti)
                    => $"{QId(ti.PhysicalName)} {QId(ti.Alias)}";

                var firstTable = tableInfos[0];
                var fromSb = new System.Text.StringBuilder();
                fromSb.Append(FromOf(firstTable));
                var joinedAliasSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { firstTable.Alias };

                // Map (alias → friendlyName → realName) per le JOIN columns: la viewDefinition
                // JSON manda `sourceColumn`/`targetColumn` come C# friendly name (mc_nome_colonna,
                // es. "StateProvinceID" mixed-case). Senza resolve to physical, EscapeDBObjectName
                // emette "StateProvinceID" quoted preserve → ORA-00904 (physical UPPER su Oracle).
                // Costruiamo il map dall'array completo di columns di ogni table (tutti, anche
                // unselected — le FK column spesso non sono selected ma servono per la JOIN).
                var realNameByAlias = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
                foreach (var tbl in tables)
                {
                    string ta = Convert.ToString(tbl["tableAlias"] ?? "").Trim();
                    if (string.IsNullOrWhiteSpace(ta)) continue;
                    var allCols = tbl["columns"] as JArray ?? new JArray();
                    var colMap = new Dictionary<string, string>(StringComparer.Ordinal);
                    foreach (var c in allCols)
                    {
                        string friendly = Convert.ToString(c["alias"] ?? "").Trim();
                        string real = Convert.ToString(c["realName"] ?? friendly).Trim();
                        if (!string.IsNullOrWhiteSpace(friendly)) colMap[friendly] = real;
                    }
                    realNameByAlias[ta] = colMap;
                }
                string ResolveJoinColReal(string alias, string friendlyName)
                {
                    if (realNameByAlias.TryGetValue(alias, out var m) && m.TryGetValue(friendlyName, out var real))
                        return real;
                    return friendlyName; // fallback: client manda gia' il physical name
                }

                if (joins != null)
                {
                    var parsedJoins = new List<(string SrcAlias, string SrcCol, string TgtAlias, string TgtCol, string JoinType)>();
                    foreach (var join in joins)
                    {
                        string srcNodeId = Convert.ToString(join["sourceNodeId"] ?? "").Trim();
                        string srcCol = Convert.ToString(join["sourceColumn"] ?? "").Trim();
                        string tgtNodeId = Convert.ToString(join["targetNodeId"] ?? "").Trim();
                        string tgtCol = Convert.ToString(join["targetColumn"] ?? "").Trim();
                        string joinType = Convert.ToString(join["joinType"] ?? "LEFT").Trim().ToUpperInvariant();
                        joinType = joinType switch
                        {
                            "INNER" => "INNER",
                            "RIGHT" => "RIGHT",
                            "FULL" => "FULL OUTER",
                            _ => "LEFT"
                        };
                        string srcTblAlias = "", tgtTblAlias = "";
                        foreach (var tbl in tables)
                        {
                            string nid = Convert.ToString(tbl["nodeId"] ?? "");
                            string ta = Convert.ToString(tbl["tableAlias"] ?? "");
                            if (nid == srcNodeId) srcTblAlias = ta;
                            if (nid == tgtNodeId) tgtTblAlias = ta;
                        }
                        // Resolve friendly → physical (per Oracle case-fold con EscapeDBObjectName).
                        string srcColReal = ResolveJoinColReal(srcTblAlias, srcCol);
                        string tgtColReal = ResolveJoinColReal(tgtTblAlias, tgtCol);
                        if (!string.IsNullOrWhiteSpace(srcTblAlias) && !string.IsNullOrWhiteSpace(tgtTblAlias)
                            && !string.IsNullOrWhiteSpace(srcColReal) && !string.IsNullOrWhiteSpace(tgtColReal))
                            parsedJoins.Add((srcTblAlias, srcColReal, tgtTblAlias, tgtColReal, joinType));
                    }

                    var processed = new HashSet<int>();
                    for (int i = 0; i < parsedJoins.Count; i++)
                    {
                        if (processed.Contains(i)) continue;
                        var pj = parsedJoins[i];
                        bool srcInFrom = joinedAliasSet.Contains(pj.SrcAlias);
                        bool tgtInFrom = joinedAliasSet.Contains(pj.TgtAlias);
                        string newTableAlias;
                        if (!srcInFrom && tgtInFrom) newTableAlias = pj.SrcAlias;
                        else if (srcInFrom && !tgtInFrom) newTableAlias = pj.TgtAlias;
                        else if (!srcInFrom && !tgtInFrom)
                        {
                            var srcInfo2 = tableInfos.FirstOrDefault(t => t.Alias == pj.SrcAlias);
                            if (!string.IsNullOrWhiteSpace(srcInfo2.PhysicalName))
                            {
                                fromSb.AppendLine();
                                fromSb.Append($"  CROSS JOIN {FromOf(srcInfo2)}");
                                joinedAliasSet.Add(pj.SrcAlias);
                            }
                            newTableAlias = pj.TgtAlias;
                        }
                        else
                        {
                            processed.Add(i);
                            continue;
                        }
                        var onConditions = new List<string>();
                        string joinType2 = pj.JoinType;
                        for (int j = i; j < parsedJoins.Count; j++)
                        {
                            if (processed.Contains(j)) continue;
                            var pj2 = parsedJoins[j];
                            bool sameNewTable = (pj2.SrcAlias == newTableAlias && joinedAliasSet.Contains(pj2.TgtAlias))
                                || (pj2.TgtAlias == newTableAlias && joinedAliasSet.Contains(pj2.SrcAlias));
                            if (sameNewTable)
                            {
                                onConditions.Add($"{QId(pj2.TgtAlias)}.{QId(pj2.TgtCol)} = {QId(pj2.SrcAlias)}.{QId(pj2.SrcCol)}");
                                processed.Add(j);
                            }
                        }
                        if (onConditions.Count == 0) continue;
                        var newTableInfo = tableInfos.FirstOrDefault(t => t.Alias == newTableAlias);
                        if (string.IsNullOrWhiteSpace(newTableInfo.PhysicalName)) continue;
                        fromSb.AppendLine();
                        fromSb.Append($"  {joinType2} JOIN {FromOf(newTableInfo)}");
                        fromSb.Append($" ON {string.Join(" AND ", onConditions)}");
                        joinedAliasSet.Add(newTableAlias);
                    }
                }
                foreach (var info in tableInfos)
                {
                    if (!joinedAliasSet.Contains(info.Alias))
                    {
                        fromSb.AppendLine();
                        fromSb.Append($"  CROSS JOIN {FromOf(info)}");
                    }
                }

                string selectSql = string.Join(",\n  ", selectParts);

                // WHERE da filterInfo (Oracle: '...' literal, spatial via SDO_GEOMETRY/SDO_RELATE).
                string whereSql = "";
                if (!string.IsNullOrWhiteSpace(filterInfoJson))
                {
                    try
                    {
                        var filterObj = JObject.Parse(filterInfoJson);
                        var filters = filterObj["filters"] as JArray;
                        var logic = Convert.ToString(filterObj["logic"] ?? "AND").Trim().ToUpperInvariant();
                        if (logic != "OR") logic = "AND";
                        if (filters != null && filters.Count > 0)
                        {
                            var firstAlias = tableInfos[0].Alias;
                            var conditions = new List<string>();
                            foreach (var f in filters)
                            {
                                string field = Convert.ToString(f["field"] ?? "").Trim();
                                string op = Convert.ToString(f["operator"] ?? f["operatore"] ?? "contains").Trim().ToLowerInvariant();
                                string value = Convert.ToString(f["value"] ?? "").Trim();
                                if (string.IsNullOrWhiteSpace(field)) continue;
                                string alias, colName;
                                if (field.Contains('.'))
                                {
                                    var parts = field.Split('.', 2);
                                    alias = parts[0].Trim();
                                    colName = parts[1].Trim();
                                    if (!tableInfos.Any(t => t.Alias.Equals(alias, StringComparison.OrdinalIgnoreCase)))
                                    {
                                        alias = firstAlias; colName = field;
                                    }
                                }
                                else { alias = firstAlias; colName = field; }
                                string colRef = $"{QId(alias)}.{QId(colName)}";
                                string spatialKey = $"{alias}|{colName}";
                                bool isSpatial = spatialColumnTypes.ContainsKey(spatialKey);
                                bool isSpatialEq = isSpatial && (op == "eq" || op == "equals");
                                string condition;
                                if (isSpatialEq)
                                {
                                    string wktEscaped = (value ?? string.Empty).Replace("'", "''");
                                    condition = $"SDO_RELATE({colRef}, SDO_GEOMETRY('{wktEscaped}', NULL), 'mask=ANYINTERACT') = 'TRUE'";
                                }
                                else
                                {
                                    string ev = (value ?? string.Empty).Replace("'", "''");
                                    condition = op switch
                                    {
                                        "eq" or "equals" => $"{colRef} = '{ev}'",
                                        "neq" or "notequals" => $"{colRef} <> '{ev}'",
                                        "contains" => $"{colRef} LIKE '%{ev}%'",
                                        "startswith" => $"{colRef} LIKE '{ev}%'",
                                        "endswith" => $"{colRef} LIKE '%{ev}'",
                                        "gt" => $"{colRef} > '{ev}'",
                                        "gte" => $"{colRef} >= '{ev}'",
                                        "lt" => $"{colRef} < '{ev}'",
                                        "lte" => $"{colRef} <= '{ev}'",
                                        "isnull" => $"{colRef} IS NULL",
                                        "isnotnull" => $"{colRef} IS NOT NULL",
                                        _ => $"{colRef} LIKE '%{ev}%'"
                                    };
                                }
                                conditions.Add(condition);
                            }
                            if (conditions.Count > 0)
                                whereSql = $"\nWHERE {string.Join($" {logic} ", conditions)}";
                        }
                    }
                    catch { /* ignore malformed */ }
                }

                string querySql = safeMaxRows > 0
                    ? $"SELECT\n  {selectSql}\nFROM {fromSb}{whereSql}\nFETCH FIRST {safeMaxRows} ROWS ONLY"
                    : $"SELECT\n  {selectSql}\nFROM {fromSb}{whereSql}";

                response["ok"] = true;
                response["sql"] = querySql;

                if (!generateOnly)
                {
                    using (var dataConn = metaQueryOracleSql.GetOpenConnection(false))
                    {
                        var rows = (List<Dapper.SqlMapper.FastExpando>)dataConn.Query(querySql);
                        var resultColumns = new List<string>();
                        var resultRows = new List<Dictionary<string, object>>();
                        if (rows.Count > 0) resultColumns.AddRange(rows[0].data.Keys);
                        foreach (var row in rows) resultRows.Add(new Dictionary<string, object>(row.data));
                        response["columns"] = resultColumns;
                        response["rows"] = resultRows;
                        response["rowCount"] = resultRows.Count;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            response["ok"] = false;
            response["error"] = ex.Message;
        }
        return response;
    }

    /// <summary>
    /// Versione Oracle di MetaService.createViewFromDefinition.
    /// Dispatch via `RawHelpers.getMetaQueryProvider("oracle").createViewFromDefinition(...)`.
    /// </summary>
    public SerializableDictionary<string, object> createViewFromDefinition(
        string user_id,
        string viewDefinitionJson,
        string view_name = "",
        string target_schema = "",
        bool createMenu = false,
        int parentMenuId = 0,
        bool overwrite_if_exists = false,
        bool scaffold = true,
        string manual_sql = "")
    {
        var response = new SerializableDictionary<string, object>();
        try
        {
            string uid = RawHelpers.authenticate();
            RawHelpers.checkAdmin(uid);

            if (string.IsNullOrWhiteSpace(viewDefinitionJson))
                throw new ValidationException("viewDefinition is required.");

            JObject def = JObject.Parse(viewDefinitionJson);
            JArray tables = def["tables"] as JArray;
            JArray joins = def["joins"] as JArray;
            if (tables == null || tables.Count == 0)
                throw new ValidationException("viewDefinition must have at least one table.");

            string requestedViewName = string.IsNullOrWhiteSpace(view_name)
                ? "vw_" + string.Join("_", tables.Select(t => Convert.ToString(t["route"] ?? "").Trim()).Where(r => r.Length > 0).Take(3))
                : view_name.Trim();
            // Normalize: alphanumerico + underscore.
            string safeViewName = System.Text.RegularExpressions.Regex.Replace(requestedViewName, @"[^A-Za-z0-9_]", "_");
            if (safeViewName.Length == 0 || !char.IsLetter(safeViewName[0])) safeViewName = "vw_" + safeViewName;

            using (var metaConn = metaQueryOracleSql.GetOpenConnection(true))
            {
                var tableInfos = new List<(string Alias, string PhysicalName, string Schema, string ConnName, JArray SelectedCols)>();
                const string metaSql = @"
SELECT
    TRIM(NVL(md_nome_tabella, '')) AS table_name,
    TRIM(NVL(NULLIF(mdschemaname, ''), '')) AS schema_name,
    TRIM(NVL(NULLIF(mdconnname, ''), 'DataSQLConnection')) AS conn_name
FROM _metadati__tabelle
WHERE TRIM(NVL(mdroutename, '')) = :route
FETCH FIRST 1 ROWS ONLY";
                foreach (var tbl in tables)
                {
                    string route = Convert.ToString(tbl["route"] ?? "").Trim();
                    string alias = Convert.ToString(tbl["tableAlias"] ?? "").Trim();
                    var cols = tbl["columns"] as JArray ?? new JArray();
                    var selectedCols = new JArray(cols.Where(c => c["selected"]?.Value<bool>() == true));
                    if (string.IsNullOrWhiteSpace(route) || string.IsNullOrWhiteSpace(alias)) continue;
                    var meta = metaConn.Query(metaSql, new { route }).FirstOrDefault();
                    if (meta == null) throw new Exception($"Route '{route}' non trovata nei metadati.");
                    tableInfos.Add((alias, Convert.ToString(meta.table_name), Convert.ToString(meta.schema_name), Convert.ToString(meta.conn_name), selectedCols));
                }
                if (tableInfos.Count == 0) throw new ValidationException("No valid tables in viewDefinition.");

                var physicalColumnsCV = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                using (var dataConnCV = metaQueryOracleSql.GetOpenConnection(false))
                {
                    const string colSql = @"SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS
                                            WHERE OWNER = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') AND TABLE_NAME = UPPER(:tableName)";
                    foreach (var info in tableInfos)
                    {
                        var dbCols = (List<Dapper.SqlMapper.FastExpando>)dataConnCV.Query(colSql, new { tableName = info.PhysicalName });
                        foreach (var c in dbCols)
                            physicalColumnsCV.Add($"{info.Alias}|{Convert.ToString(c.data["COLUMN_NAME"])}");
                    }
                }

                var selectParts = new List<string>();
                foreach (var info in tableInfos)
                {
                    foreach (var col in info.SelectedCols)
                    {
                        string realName = Convert.ToString(col["realName"] ?? col["alias"] ?? "").Trim();
                        string colLabel = Convert.ToString(col["label"] ?? col["alias"] ?? "").Trim();
                        string qualifiedAlias = $"{info.Alias}.{colLabel}";
                        string lookupKey = $"{info.Alias}|{realName}";
                        string formula = Convert.ToString(col["formula"] ?? "").Trim();
                        string formulaAlias = Convert.ToString(col["formulaAlias"] ?? "").Trim();
                        bool hasFormula = !string.IsNullOrWhiteSpace(formula);
                        if (!hasFormula && (string.IsNullOrWhiteSpace(realName) || !physicalColumnsCV.Contains(lookupKey))) continue;
                        string colRef = hasFormula ? formula : $"{QId(info.Alias)}.{QId(realName)}";
                        string outputAlias = hasFormula && !string.IsNullOrWhiteSpace(formulaAlias)
                            ? $"{info.Alias}.{formulaAlias}"
                            : qualifiedAlias;
                        selectParts.Add($"{colRef} AS {QId(outputAlias)}");
                    }
                }
                if (selectParts.Count == 0) throw new ValidationException("No columns selected in viewDefinition.");

                string FromOf((string Alias, string PhysicalName, string Schema, string ConnName, JArray SelectedCols) ti)
                    => $"{QId(ti.PhysicalName)} {QId(ti.Alias)}";

                var firstTable = tableInfos[0];
                var fromSb = new System.Text.StringBuilder();
                fromSb.Append(FromOf(firstTable));
                var joinedAliasesCV = new HashSet<string>(StringComparer.Ordinal) { firstTable.Alias };

                // Map alias → friendlyName → realName (vedi commento twin in previewViewDefinition).
                var realNameByAliasCV = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
                foreach (var tbl in tables)
                {
                    string ta2 = Convert.ToString(tbl["tableAlias"] ?? "").Trim();
                    if (string.IsNullOrWhiteSpace(ta2)) continue;
                    var allCols = tbl["columns"] as JArray ?? new JArray();
                    var colMap = new Dictionary<string, string>(StringComparer.Ordinal);
                    foreach (var c in allCols)
                    {
                        string friendly = Convert.ToString(c["alias"] ?? "").Trim();
                        string real = Convert.ToString(c["realName"] ?? friendly).Trim();
                        if (!string.IsNullOrWhiteSpace(friendly)) colMap[friendly] = real;
                    }
                    realNameByAliasCV[ta2] = colMap;
                }
                string ResolveJoinColRealCV(string alias, string friendlyName)
                {
                    if (realNameByAliasCV.TryGetValue(alias, out var m) && m.TryGetValue(friendlyName, out var real))
                        return real;
                    return friendlyName;
                }

                if (joins != null)
                {
                    foreach (var join in joins)
                    {
                        string srcAlias = Convert.ToString(join["sourceNodeId"] ?? "").Trim();
                        string srcCol = Convert.ToString(join["sourceColumn"] ?? "").Trim();
                        string tgtAlias = Convert.ToString(join["targetNodeId"] ?? "").Trim();
                        string tgtCol = Convert.ToString(join["targetColumn"] ?? "").Trim();
                        string joinType = Convert.ToString(join["joinType"] ?? "LEFT").Trim().ToUpperInvariant();
                        joinType = joinType switch { "INNER" => "INNER", "RIGHT" => "RIGHT", "FULL" => "FULL OUTER", _ => "LEFT" };

                        string srcTblAlias = "", tgtTblAlias = "";
                        foreach (var tbl in tables)
                        {
                            string nid = Convert.ToString(tbl["nodeId"] ?? "");
                            string ta = Convert.ToString(tbl["tableAlias"] ?? "");
                            if (nid == srcAlias) srcTblAlias = ta;
                            if (nid == tgtAlias) tgtTblAlias = ta;
                        }
                        // Resolve friendly → physical realName (per Oracle case-fold).
                        srcCol = ResolveJoinColRealCV(srcTblAlias, srcCol);
                        tgtCol = ResolveJoinColRealCV(tgtTblAlias, tgtCol);
                        if (string.IsNullOrWhiteSpace(srcTblAlias) || string.IsNullOrWhiteSpace(tgtTblAlias)
                            || string.IsNullOrWhiteSpace(srcCol) || string.IsNullOrWhiteSpace(tgtCol)) continue;

                        bool srcInFrom = joinedAliasesCV.Contains(srcTblAlias);
                        bool tgtInFrom = joinedAliasesCV.Contains(tgtTblAlias);
                        string newTblAlias, anchorAlias, newCol, anchorCol;
                        if (srcInFrom && !tgtInFrom) { newTblAlias = tgtTblAlias; anchorAlias = srcTblAlias; newCol = tgtCol; anchorCol = srcCol; }
                        else if (!srcInFrom && tgtInFrom) { newTblAlias = srcTblAlias; anchorAlias = tgtTblAlias; newCol = srcCol; anchorCol = tgtCol; }
                        else if (!srcInFrom && !tgtInFrom) { newTblAlias = tgtTblAlias; anchorAlias = srcTblAlias; newCol = tgtCol; anchorCol = srcCol; }
                        else continue;

                        var newInfo = tableInfos.FirstOrDefault(t => t.Alias == newTblAlias);
                        if (string.IsNullOrWhiteSpace(newInfo.PhysicalName)) continue;

                        fromSb.AppendLine();
                        fromSb.Append($"  {joinType} JOIN {FromOf(newInfo)}");
                        fromSb.Append($" ON {QId(anchorAlias)}.{QId(anchorCol)} = {QId(newTblAlias)}.{QId(newCol)}");
                        joinedAliasesCV.Add(newTblAlias);
                    }
                }

                string qualifiedViewName = QId(safeViewName);
                string createViewSql;
                if (!string.IsNullOrWhiteSpace(manual_sql))
                {
                    createViewSql = $"CREATE OR REPLACE FORCE VIEW {qualifiedViewName}\nAS\n{manual_sql.Trim()}";
                }
                else
                {
                    string selectSql = string.Join(",\n  ", selectParts);
                    createViewSql = $@"CREATE OR REPLACE FORCE VIEW {qualifiedViewName}
AS
SELECT
  {selectSql}
FROM {fromSb}";
                }

                using (var dataConn = metaQueryOracleSql.GetOpenConnection(false))
                {
                    bool exists;
                    var existRows = (List<Dapper.SqlMapper.FastExpando>)dataConn.Query(
                        @"SELECT 1 AS oid FROM ALL_VIEWS
                          WHERE OWNER = SYS_CONTEXT('USERENV','CURRENT_SCHEMA') AND VIEW_NAME = UPPER(:name)",
                        new { name = safeViewName });
                    exists = existRows.Count > 0;
                    if (exists && !overwrite_if_exists)
                    {
                        response["ok"] = false;
                        response["error"] = $"View '{qualifiedViewName}' already exists.";
                        response["errorCode"] = "VIEW_EXISTS";
                        response["qualifiedView"] = qualifiedViewName;
                        response["sql"] = createViewSql;
                        return response;
                    }
                    dataConn.Execute(createViewSql);
                }

                response["ok"] = true;
                response["qualifiedView"] = qualifiedViewName;
                response["viewName"] = safeViewName;
                response["sql"] = createViewSql;
                response["columnCount"] = selectParts.Count;
                // Scaffold (delegato al chiamante: il dispatcher in MetaService gestisce
                // ScaffoldViewForDbms in modo gia' provider-aware).
            }
        }
        catch (Exception ex)
        {
            response["ok"] = false;
            response["error"] = ex.Message;
        }
        return response;
    }

    /// <summary>
    /// Versione Oracle di MetaService.getViewBuilderForeignKeys.
    /// </summary>
    public SerializableDictionary<string, object> getViewBuilderForeignKeys(string user_id)
    {
        var response = new SerializableDictionary<string, object>();
        try
        {
            RawHelpers.authenticate();
            using (var metaConn = metaQueryOracleSql.GetOpenConnection(true))
            {
                const string sql = @"
SELECT DISTINCT
    TRIM(NVL(t.mdroutename, '')) AS source_route,
    TRIM(NVL(c.mcuilookupentityname, '')) AS target_route
FROM _metadati__colonne c
JOIN _metadati__tabelle t ON t.md_id = c.md_id
WHERE c.mc_ui_column_type = 'lookupByID'
  AND NVL(c.mcuilookupentityname, '') != ''
  AND NVL(t.mdroutename, '') != ''";
                var rows = (List<Dapper.SqlMapper.FastExpando>)metaConn.Query(sql);
                var fks = new List<Dictionary<string, string>>();
                foreach (var r in rows)
                {
                    fks.Add(new Dictionary<string, string>
                    {
                        ["source"] = Convert.ToString(r.data["source_route"]),
                        ["target"] = Convert.ToString(r.data["target_route"])
                    });
                }
                response["ok"] = true;
                response["foreignKeys"] = fks;
            }
        }
        catch (Exception ex)
        {
            response["ok"] = false;
            response["error"] = ex.Message;
        }
        return response;
    }

    /// <summary>
    /// Versione Oracle di MetaService.updateColumnMetadata.
    /// Applica patch incrementali su `_metadati__colonne` per uno o piu' mc_id.
    /// </summary>
    public SerializableDictionary<string, object> updateColumnMetadata(
        string user_id,
        string column_metadata_patches)
    {
        var response = new SerializableDictionary<string, object>();
        try
        {
            string uid = RawHelpers.authenticate();
            RawHelpers.checkAdmin(uid);

            if (string.IsNullOrWhiteSpace(column_metadata_patches))
                throw new ValidationException("column_metadata_patches is required.");

            JArray arr = JArray.Parse(column_metadata_patches);
            if (arr.Count == 0)
            {
                response["ok"] = true;
                response["updated"] = 0;
                return response;
            }

            var blockedFields = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "mc_id", "md_id" };

            int updated = 0;
            using (var metaConn = metaQueryOracleSql.GetOpenConnection(true))
            {
                // Mapping csProperty -> sqlColumn dalla skill metadata-tables-columns
                // (single source of truth per AGENTS regola 25). Il client manda nomi
                // C# friendly (es. mc_ui_grid_size_width) mentre la colonna SQL e'
                // mcuigridsizewidth (no underscore).
                var sqlByCsProp = LoadMetadatiColonneCsToSqlMapForOracle();

                string ResolveSqlCol(string csProp)
                {
                    if (string.IsNullOrWhiteSpace(csProp)) return null;
                    return sqlByCsProp.TryGetValue(csProp, out string sqlName) ? sqlName : null;
                }

                foreach (JToken patchTok in arr)
                {
                    if (!(patchTok is JObject patchObj)) continue;
                    if (patchObj["mc_id"] == null) continue;
                    if (!long.TryParse(Convert.ToString(patchObj["mc_id"]), out long mcId)) continue;
                    JObject realPatch = patchObj["patch"] is JObject inner ? inner : patchObj;

                    var sets = new List<string>();
                    var p = new DynamicParameters();
                    p.Add("mc_id", mcId);
                    int paramIdx = 0;
                    foreach (var prop in realPatch.Properties())
                    {
                        string field = prop.Name;
                        if (string.IsNullOrWhiteSpace(field) || blockedFields.Contains(field)) continue;
                        string sqlCol = ResolveSqlCol(field);
                        if (sqlCol == null) continue;
                        string paramName = "@p" + (paramIdx++);
                        sets.Add($"\"{sqlCol.Replace("\"", "\"\"")}\" = {paramName}");
                        object val = prop.Value?.Type == JTokenType.Null ? null : prop.Value?.ToObject<object>();
                        p.Add(paramName, val);
                    }
                    if (sets.Count == 0) continue;

                    string sql = "UPDATE \"_metadati__colonne\" SET " + string.Join(", ", sets) + " WHERE \"mc_id\" = :mc_id";
                    int n = metaConn.Execute(sql, p);
                    updated += n;
                }
            }

            response["ok"] = true;
            response["updated"] = updated;
            return response;
        }
        catch (Exception ex)
        {
            response["ok"] = false;
            response["error"] = ex.Message;
            throw;
        }
    }

    // Cache lazy del mapping csProperty -> sqlColumn per `_metadati__colonne`.
    private static Dictionary<string, string> _metadatiColonneCsToSqlCacheOracle;
    private static readonly object _metadatiColonneCsToSqlSyncOracle = new object();

    private static Dictionary<string, string> LoadMetadatiColonneCsToSqlMapForOracle()
    {
        if (_metadatiColonneCsToSqlCacheOracle != null) return _metadatiColonneCsToSqlCacheOracle;
        lock (_metadatiColonneCsToSqlSyncOracle)
        {
            if (_metadatiColonneCsToSqlCacheOracle != null) return _metadatiColonneCsToSqlCacheOracle;
            var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            string mappingPath = ResolveMetadataMappingsPathOracle();
            if (mappingPath != null && System.IO.File.Exists(mappingPath))
            {
                try
                {
                    string json = System.IO.File.ReadAllText(mappingPath);
                    var root = JObject.Parse(json);
                    var cols = root["MetadatiColonne"]?["columns"] as JArray;
                    if (cols != null)
                    {
                        foreach (JToken col in cols)
                        {
                            string csProp = Convert.ToString(col["csProperty"] ?? "").Trim();
                            string sqlCol = Convert.ToString(col["sqlColumn"] ?? "").Trim();
                            if (string.IsNullOrWhiteSpace(csProp) || string.IsNullOrWhiteSpace(sqlCol)) continue;
                            if (!dict.ContainsKey(csProp)) dict[csProp] = sqlCol;
                            if (!dict.ContainsKey(sqlCol)) dict[sqlCol] = sqlCol;
                        }
                    }
                }
                catch { }
            }
            _metadatiColonneCsToSqlCacheOracle = dict;
            return _metadatiColonneCsToSqlCacheOracle;
        }
    }

    private static string ResolveMetadataMappingsPathOracle()
    {
        string overridePath = ConfigHelper.GetSettingAsString("metadataMappingsPath");
        if (!string.IsNullOrWhiteSpace(overridePath) && System.IO.File.Exists(overridePath))
            return overridePath;

        string[] candidates = new[]
        {
            AppContext.BaseDirectory,
            System.IO.Directory.GetCurrentDirectory()
        };
        foreach (var startDir in candidates)
        {
            string dir = startDir;
            for (int i = 0; i < 8 && !string.IsNullOrWhiteSpace(dir); i++)
            {
                string probe = System.IO.Path.Combine(dir, "skills", "metadata-tables-columns", "metadata-mappings.json");
                if (System.IO.File.Exists(probe)) return probe;
                var parent = System.IO.Directory.GetParent(dir);
                if (parent == null) break;
                dir = parent.FullName;
            }
        }
        return null;
    }

    /// <summary>
    /// Versione Oracle del cleanup metadata DB per `MetaService.removeReport`.
    /// Cancella le voci di menu e le custom action che referenziano il file `.mrt`
    /// rimosso, usando Oracle syntax (doppi apici quoting + OracleConnection).
    /// </summary>
    public bool removeReportMetadata(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return false;

        using (var conn = (OracleConnection)metaQueryOracleSql.GetOpenConnection(true))
        {
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "DELETE FROM \"_metadati__menu\" WHERE \"mm_uri_menu\" LIKE :nm";
                cmd.Parameters.Add(new OracleParameter("nm", "%" + name + "%"));
                cmd.ExecuteNonQuery();

                cmd.Parameters.Clear();
                cmd.CommandText = "DELETE FROM \"_mtdt__cstom__actions__tabelle\" WHERE \"actioncallback\" LIKE :nm";
                cmd.Parameters.Add(new OracleParameter("nm", "%" + name + "%"));
                cmd.ExecuteNonQuery();
            }
        }
        return true;
    }

    /// <summary>
    /// Oracle-flavor di <c>MetaService.dropScaffoldedView</c>. Dispatch via
    /// <c>TryDispatchToActiveProvider</c> dal MetaService MSSQL sibling.
    /// Senza dispatch, il MSSQL impl aprirebbe una SqlConnection con la connection
    /// string Oracle → "Stringa di connessione non valida" / ORA-irrelated.
    ///
    /// Differenze Oracle vs MSSQL impl:
    ///   • niente <c>INFORMATION_SCHEMA.VIEWS</c>/<c>.TABLES</c> — usiamo <c>USER_VIEWS</c>/<c>USER_TABLES</c>.
    ///   • niente <c>SELECT TOP 1 ... ORDER BY md_id DESC</c> — usiamo <c>FETCH FIRST 1 ROWS ONLY</c>.
    ///   • table/view name su Oracle e' UPPER unquoted (case-fold default) — usiamo
    ///     <c>UPPER(table_name)</c> nelle WHERE per match cross-case-input.
    ///   • niente scheduler cleanup specifico (best-effort: se la tabella non esiste, no-op
    ///     dentro try/catch).
    /// Idempotente: se route non trovata o view non esiste, ritorna ok=true con
    /// flag <c>dropped_view=false</c>.
    /// </summary>
    public string dropScaffoldedView(string user_id, string view_route)
    {
        var result = new SerializableDictionary<string, object>();
        try
        {
            string uid = RawHelpers.authenticate();
            RawHelpers.checkAdmin(uid);

            string normalizedRoute = (view_route ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(normalizedRoute))
                throw new ValidationException("view_route is required");

            int removedMdId = 0;
            int removedColumns = 0;
            bool droppedView = false;
            string tableName = string.Empty;

            // 1) Lookup metadata row.
            using (var metaConn = OracleProviderGateway.GetOpenConnection(true) as OracleConnection)
            {
                var metaRow = metaConn.Query(@"
SELECT md_id, md_nome_tabella
  FROM ""_metadati__tabelle""
 WHERE TRIM(NVL(mdroutename, '')) = :route
 ORDER BY md_id DESC
 FETCH FIRST 1 ROWS ONLY",
                    new { route = normalizedRoute }).FirstOrDefault();

                if (metaRow != null)
                {
                    var rowDict = (System.Collections.Generic.IDictionary<string, object>)((Dapper.SqlMapper.FastExpando)metaRow).data;
                    if (RawHelpers.CiTryGet(rowDict, "md_id", out var mdIdObj) && mdIdObj != null)
                        removedMdId = Convert.ToInt32(mdIdObj);
                    if (RawHelpers.CiTryGet(rowDict, "md_nome_tabella", out var tnObj) && tnObj != null)
                        tableName = Convert.ToString(tnObj);
                }
            }

            // 2) Drop physical VIEW/TABLE sul data DB se esiste.
            if (!string.IsNullOrWhiteSpace(tableName))
            {
                string upperName = tableName.ToUpperInvariant();
                try
                {
                    using (var dataConn = metaModelRaw.metaQueryOracleSql.GetOpenConnection(false))
                    {
                        // VIEW
                        int viewExists = dataConn.QueryColumn<decimal>(
                            "SELECT COUNT(*) FROM user_views WHERE view_name = :nm",
                            new DynamicParameters(new { nm = upperName })).Select(x => (int)x).FirstOrDefault();
                        if (viewExists > 0)
                        {
                            dataConn.Execute($"DROP VIEW {metaModelRaw.metaQueryOracleSql.EscapeDBObjectName(tableName)}");
                        }
                        // BASE TABLE
                        int tblExists = dataConn.QueryColumn<decimal>(
                            "SELECT COUNT(*) FROM user_tables WHERE table_name = :nm",
                            new DynamicParameters(new { nm = upperName })).Select(x => (int)x).FirstOrDefault();
                        if (tblExists > 0)
                        {
                            dataConn.Execute($"DROP TABLE {metaModelRaw.metaQueryOracleSql.EscapeDBObjectName(tableName)} CASCADE CONSTRAINTS");
                        }
                        // Conferma drop
                        int stillExistsView = dataConn.QueryColumn<decimal>(
                            "SELECT COUNT(*) FROM user_views WHERE view_name = :nm",
                            new DynamicParameters(new { nm = upperName })).Select(x => (int)x).FirstOrDefault();
                        int stillExistsTbl = dataConn.QueryColumn<decimal>(
                            "SELECT COUNT(*) FROM user_tables WHERE table_name = :nm",
                            new DynamicParameters(new { nm = upperName })).Select(x => (int)x).FirstOrDefault();
                        droppedView = (stillExistsView + stillExistsTbl) == 0;
                    }
                }
                catch
                {
                    droppedView = false;
                }
            }

            // 3) Metadata cleanup (colonne + tabella).
            if (removedMdId > 0)
            {
                using (var metaConnD = OracleProviderGateway.GetOpenConnection(true) as OracleConnection)
                {
                    // Conta colonne prima del delete (per il response).
                    removedColumns = metaConnD.QueryColumn<decimal>(
                        "SELECT COUNT(*) FROM \"_metadati__colonne\" WHERE md_id = :id",
                        new DynamicParameters(new { id = removedMdId })).Select(x => (int)x).FirstOrDefault();

                    // Best-effort: pulisci tabelle correlate che hanno FK su md_id.
                    foreach (string relTable in new[] {
                        "_metadati__u_i__stili__tabelle",
                        "_metadati__u_i__stili__colonne",
                        "_mtdt__tnt__trzzzioni__tabelle",
                        "_mtdt__tnt__trzzzioni__colonne",
                        "_mtdt__cstom__actions__tabelle",
                        "_metadati_condition_group",
                        "_metadati__colonne"
                    })
                    {
                        try
                        {
                            metaConnD.Execute(
                                $"DELETE FROM \"{relTable}\" WHERE md_id = :id",
                                new DynamicParameters(new { id = removedMdId }));
                        }
                        catch { /* best-effort: tabelle correlate possono non avere md_id column */ }
                    }

                    // Delete final della riga _metadati__tabelle.
                    metaConnD.Execute(
                        "DELETE FROM \"_metadati__tabelle\" WHERE md_id = :id",
                        new DynamicParameters(new { id = removedMdId }));
                }

                // Full cache invalidation post-delete (mirror scaffoldTable).
                RawHelpers.InvalidateMetadataCachesAndSetVersion(clearAllMetadata: true);
            }

            result["ok"] = true;
            result["dropped_view"] = droppedView;
            result["removed_metadata"] = removedMdId > 0;
            result["md_id"] = removedMdId;
            result["removed_columns"] = removedColumns;
            result["view_route"] = normalizedRoute;
            return RawHelpers.serialize(result, null);
        }
        catch (Exception ex)
        {
            result["ok"] = false;
            result["error"] = ex.Message;
            result["view_route"] = view_route;
            return RawHelpers.serialize(result, null);
        }
    }
}
