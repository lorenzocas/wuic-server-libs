using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.IO;
using System.Linq;
using Microsoft.AspNetCore.Http;
using Dapper;
using Newtonsoft.Json;
using MySql.Data.MySqlClient;
using metaModelRaw;
using ngUicOrm.metaModel;
using WEB_UI_CRAFTER.Helpers;
using WuicCore.Services.Licensing;

public class mysqlDataProvider : IMetaQuery
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

    public void logOut(user user) => metaQueryMySql.logOut(user);

    public void logOutForce()
    {
        List<user> users = GetUserList(true);
        if (users == null)
            return;

        users.ForEach(logOut);
    }

    public rawPagedResult GetLoggedUsers() => metaQueryMySql.GetLoggedUsers();

    public int GetLoggedUserCount() => metaQueryMySql.GetLoggedUserCount();

    public user login(string user_name, string password, SysInfo infos) => metaQueryMySql.login(user_name, password, infos);

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
        //     u.extra_keys[extraField] = user.data[extraField]?.ToString() ?? "";

        if (user.data.ContainsKey(infos.azienda_id_column_name) && user.data[infos.azienda_id_column_name] != null)
            u.azienda_id = int.Parse(user.data[infos.azienda_id_column_name].ToString());

        return u;
    }

    public List<user> GetUserList(bool force = false) => metaQueryMySql.GetUserList(force);

    public List<role> GetRoleList() => metaQueryMySql.getRoleList();

    public rawPagedResult GetAziendeList() => metaQueryMySql.getAziendeList();

    public role GetRoleByUserID(string user_id) => metaQueryMySql.GetRoleByUserID(user_id);

    public List<role> GetMultipleRoleRoleByUserID(string user_id) => metaQueryMySql.getMultipleRoleRoleByUserID(user_id);

    public user getUserByID(string user_id) => metaQueryMySql.getUserByID(user_id);

    public user GetUserByEMail(string email) => metaQueryMySql.GetUserByEMail(email);

    public user GetUserByName(string user_name) => metaQueryMySql.GetUserByName(user_name);

    public DateTime? getLastUserActivityByID(string user_id)
    {
        using (metaRawModel context = new metaRawModel())
            return context.GetLastActivityDateByUserId(user_id);
    }

    public string readCustomSettings(string user_id, string key)
    {
        using (MySqlConnection connection = metaQueryMySql.GetOpenConnection(true))
        {
            string settings = connection.Query<string>(
                "select coalesce(customSettings, '') from utenti where id_utente=@id_utente",
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
        using (MySqlConnection connection = metaQueryMySql.GetOpenConnection(true))
        {
            connection.Execute("update utenti set customSettings=@customSettings where id_utente=@id_utente",
                new { customSettings = JsonConvert.SerializeObject(dict), id_utente = currentUserId });
        }
    }

    public decimal readProgress(string guid)
    {
        using (DbConnection connection = metaQueryMySql.GetOpenConnection(true))
            return connection.Query<decimal>("SELECT coalesce(progress, -1) FROM _progress_indicator WHERE guid=@guid", new { guid }).FirstOrDefault();
    }

    public void saveProgress(string guid, decimal progress)
    {
        using (DbConnection connection = metaQueryMySql.GetOpenConnection(true))
        {
            int i = connection.Execute("UPDATE _progress_indicator SET progress=@progress WHERE guid=@guid", new { guid, progress });
            if (i == 0)
                connection.Execute("INSERT INTO _progress_indicator(guid, progress) VALUES(@guid, @progress)", new { guid, progress });
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

        using (MySqlConnection connection = metaQueryMySql.GetOpenConnection(true))
        {
            int updated = connection.Execute("update utenti set customSettings=@customSettings where id_utente=@id_utente",
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
        using (MySqlConnection connection = metaQueryMySql.GetOpenConnection(isMeta))
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

        rawPagedResult result = metaQueryMySql.GetFlatData(user_id, route, lookup_table_id, SortInfo, GroupInfo, PageInfo, filterInfo, logicOperator, has_server_operation, aggregates, columnRestrictionLists, formula_lookup, mc_id, skipNested);

        if (enforceUnlicensedCap)
            ApplyUnlicensedResultCap(result, licenseEvaluation, "MySqlProvider.GetFlatData", route);

        return result;
    }

    public string UpdateflatData(Dictionary<string, object> entity, string route, string userId, DbConnection conn = null, IDbTransaction trn = null)
        => metaQueryMySql.UpdateflatData(entity, route, userId);

    public string DeleteflatData(Dictionary<string, object> entity, string route, string userId, DbConnection conn = null, IDbTransaction trn = null)
        => metaQueryMySql.DeleteflatData(entity, route, userId);

    public string InsertflatData(Dictionary<string, object> entity, string route, string userId, DbConnection conn = null, IDbTransaction trn = null)
        => metaQueryMySql.InsertflatData(entity, route, userId);

    public rawPagedResult GetDistinctValues(int column_id, string text, string filter_type, int max_results, string user_id)
        => metaQueryMySql.GetDistinctValues(column_id, text, filter_type, max_results, user_id);

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
        return metaQueryMySql.GetFlatData(user_id, route, 0, SortInfo, GroupInfo, PageInfo, filterInfo, logicOperator, has_server_operation, null, columnRestrictionList, formula_lookup, mc_id, false);
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

        rawPagedResult result = metaQueryMySql.GetFlatDataFromStored(user_id, stored, parameters, __pageIndex, __pageSize, __sortField, __sortDir, skipExtraParams, noResults);

        if (enforceUnlicensedCap)
            ApplyUnlicensedResultCap(result, licenseEvaluation, "MySqlProvider.GetFlatDataFromStored", stored);

        return result;
    }

    public string CloneData(IDictionary<string, object> entity, string route, string user_id, List<routePair> relatedRouteToClone)
        => metaQueryMySql.CloneData(entity, route, user_id, relatedRouteToClone);

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
        return metaQueryMySql.UpdateflatData(normalized, route, user_id);
    }
}
