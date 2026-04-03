using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using Microsoft.Data.SqlClient;
using System.IO.Compression;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using metaModelRaw;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using WEB_UI_CRAFTER.Helpers;
using System.IO;
using Newtonsoft.Json;
using System.Collections.Concurrent;
using System.Security.Authentication;
using Dapper;
using WEB_UI_CRAFTER;
using System.Net;
using System.Net.Mail;
using System.Data;
using System.Data.Common;
using System.Security.Cryptography.X509Certificates;
using System.Globalization;
using DocumentFormat.OpenXml.Packaging;
using ExcelOpenXMLBasics;
using DocumentFormat.OpenXml.Spreadsheet;
using Newtonsoft.Json.Linq;
using DocumentFormat.OpenXml.Drawing.Charts;
using DocumentFormat.OpenXml;
using System.Reflection;
using System.Configuration;
using System.ServiceModel;
using HttpContext = System.WebCore.HttpContext;
using WuicCore.Services.Licensing;

namespace WEB_UI_CRAFTER.ProjectData.ServiziMySql
{
    public class Utility
    {
        public enum QueryType
        {
            STORED_PROCEDURE = 1,
            FUNCTION = 2,
            TABLE = 3,
            VIEW = 4
        }

        private static readonly log4net.ILog log = log4net.LogManager.GetLogger(System.Reflection.MethodBase.GetCurrentMethod().DeclaringType);

        #region Customize select / insert / exceptions management

        public static bool isClientSideReport(string user_id,
            string route,
            string filters,
            string parameters,
            string language,
            string jsonPath,
            string columnsMapping,
            string[] filterSplit,
            string[] parameterSplit,
            string reportName)
        {
            return true;
        }

        private static string ResolveUploadRecordDirectory(_Metadati_Colonne_Upload uploader, _Metadati_Tabelle tabel, string recordId)
        {
            string basePath = string.IsNullOrEmpty(uploader.DefaultUploadRootPath) || uploader.DefaultUploadRootPath == "null"
                ? ((ConfigHelper.GetSettingAsString("uploadFolder") != null ? (ConfigHelper.GetSettingAsString("uploadFolder") + "/") : ("~/upload/")))
                : uploader.DefaultUploadRootPath;

            string normalizedBasePath = (basePath ?? string.Empty).Trim().Trim('\'', '"');
            if (normalizedBasePath.StartsWith("/") && normalizedBasePath.Length > 2 && normalizedBasePath[2] == ':')
            {
                normalizedBasePath = normalizedBasePath.TrimStart('/');
            }
            string resolved = System.IO.Path.IsPathRooted(normalizedBasePath)
                ? normalizedBasePath
                : HttpContext.Current.Server.MapPath(normalizedBasePath);
            string routeName = (tabel.md_route_name ?? string.Empty).Trim().Trim('\'', '"').Trim('\\', '/');
            string safeRecordId = (recordId ?? string.Empty).Trim().Trim('\'', '"').Trim('\\', '/');
            if (uploader.UseRouteNameAsSubfolder)
            {
                resolved = System.IO.Path.Combine(resolved, routeName);
            }

            if (uploader.UseRecordIDAsSubfolder && !string.IsNullOrWhiteSpace(safeRecordId))
            {
                resolved = System.IO.Path.Combine(resolved, safeRecordId);
            }

            return resolved;
        }


        public static void customizeImgDBInsert(Dictionary<string, object> entity, _Metadati_Colonne_Upload uploader, _Metadati_Tabelle tabel, string safetable_name, ref string field_list, ref string value_list, bool base64Image)
        {
            field_list += (field_list == "" ? "" : ", ") + RawHelpers.escapeDBObjectName(uploader.MultipleUploadBlobFieldName, "mysql");
            if (!string.IsNullOrEmpty(RawHelpers.ParseNull(entity[uploader.mc_nome_colonna])))
            {
                string __id = entity.ContainsKey("__id") ? entity["__id"].ToString() : entity["__guid"].ToString();
                string pth = ResolveUploadRecordDirectory(uploader, tabel, __id);

                string tmp_path = System.IO.Path.Combine(pth, entity[uploader.mc_nome_colonna].ToString());

                if (base64Image)
                {
                    string base64Converted = "";
                    base64Converted = Utility.ImageToBase64(tmp_path);
                    value_list += (value_list == "" ? "" : ", ") + "'" + base64Converted + "'";
                }
                else
                {
                    if (!System.IO.File.Exists(tmp_path))
                    {
                        value_list += (value_list == "" ? "" : ", ") + "null";
                        return;
                    }
                    //serialize
                    byte[] bytes = System.IO.File.ReadAllBytes(tmp_path);

                    ////HexFormat introduced in postgresql 9.0
                    string hexString = RawHelpers.convertByteToHexString(bytes);

                    ////append to query
                    ////alternative like openrowset ->  http://www.sql-workbench.net/manual/using.html#blob-support
                    value_list += (value_list == "" ? "" : ", ") + "x'" + hexString + "'";
                }
            }
            else
                value_list += (value_list == "" ? "" : ", ") + "null";
        }


        public static void customizeImgDBUpdate(Dictionary<string, object> entity, _Metadati_Colonne_Upload uploader, _Metadati_Tabelle tabel, ref string field_value_list)
        {
            if (entity[uploader.mc_nome_colonna] != null)
            {
                bool base64Image = RawHelpers.ParseBool(ConfigHelper.GetSettingAsString("base64Image") ?? "false");
                string __id = entity[tabel._Metadati_Colonnes.First(x => x.mc_is_primary_key).mc_nome_colonna].ToString();
                string pth = ResolveUploadRecordDirectory(uploader, tabel, __id);

                string tmp_path = System.IO.Path.Combine(pth, entity[uploader.mc_nome_colonna].ToString());

                if (base64Image)
                {
                    if (File.Exists(tmp_path))
                    {
                        string base64Converted = "";

                        if (entity[uploader.mc_nome_colonna].ToString() != "")
                        {
                            base64Converted = ImageToBase64(tmp_path);
                        }
                        field_value_list += (field_value_list == "" ? "" : ", ") + uploader.MultipleUploadBlobFieldName + "='" + base64Converted + "'";
                    }
                }
                else
                {
                    if (!System.IO.File.Exists(tmp_path))
                    {
                        return;
                    }
                    //serialize
                    byte[] bytes = System.IO.File.ReadAllBytes(tmp_path);

                    ////HexFormat introduced in postgresql 9.0
                    string hexString = RawHelpers.convertByteToHexString(bytes);

                    ////for older version bytea Escape Format
                    ////use decode('...', 'hex')

                    field_value_list += (field_value_list == "" ? "" : ", ") + RawHelpers.escapeDBObjectName(uploader.MultipleUploadBlobFieldName, "mysql") + "=x'" + hexString + "'";

                    ////append to query
                    ////alternative like openrowset ->  http://www.sql-workbench.net/manual/using.html#blob-support
                }
            }
            else
                field_value_list += (field_value_list == "" ? "" : ", ") + uploader.MultipleUploadBlobFieldName + "=" + "null";
        }

        public static Exception customizeException(string method, Exception ex, user u, string route, string query, Dictionary<string, object> entity = null)
        {
            SqlException sqlEx = ex as SqlException;
            if (sqlEx != null && (sqlEx.Number == 2601 || sqlEx.Number == 2627))
            {
                //Key violation
                customException newEx = new customException("data_already_inserted_warning", route);
                newEx.exceptionData.Add("errorCode", sqlEx.Number);
                newEx.exceptionData.Add("title", "data_already_inserted_title");
                newEx.exceptionData.Add("localizationResources", new string[] { route.Replace("_", " ").ToUpper() });

                string serializedEx = RawHelpers.serialize(newEx, new MetadataContractresolver(), false);
                JsonException jEx = new JsonException(serializedEx);
                return jEx;
            }
            else if (ex.Message == "already_logged")
            {
                customException newEx = new customException("user_already_logged_warning", route);
                newEx.exceptionData.Add("title", "auth_error_title");
                newEx.exceptionData.Add("code", "already_logged");
                string serializedEx = RawHelpers.serialize(newEx, new MetadataContractresolver(), false);
                JsonException jEx = new JsonException(serializedEx);
                return jEx;
            }

            else if (ex.Message == "new_logged_ip")
            {
                customException newEx = new customException("user_already_logged_other_ip_warning", route);
                newEx.exceptionData.Add("title", "auth_error_title");
                newEx.exceptionData.Add("code", "new_logged_ip");

                string serializedEx = RawHelpers.serialize(newEx, new MetadataContractresolver(), false);
                JsonException jEx = new JsonException(serializedEx);
                return jEx;
            }

            else if (ex.Message == "missing_email_logged_checking")
            {
                customException newEx = new customException("user_mail_missing_warning", route);
                newEx.exceptionData.Add("title", "auth_error_title");
                newEx.exceptionData.Add("code", "missing_email_logged_checking");

                string serializedEx = RawHelpers.serialize(newEx, new MetadataContractresolver(), false);
                JsonException jEx = new JsonException(serializedEx);
                return jEx;
            }

            else if (ex.Message == "user_not_found")
            {
                customException newEx = new customException("user_not_found_warning", route);
                newEx.exceptionData.Add("title", "user_not_found_title");

                string serializedEx = RawHelpers.serialize(newEx, new MetadataContractresolver(), false);
                JsonException jEx = new JsonException(serializedEx);
                return jEx;
            }

            else
            {
                customException newEx = new customException(RawHelpers.flatException(ex, false).Message, route);
                newEx.exceptionData.Add("title", string.Format("Error method: '{0}' - Route: '{1}'", method, route));
                newEx.exceptionData.Add("stackTrace", ex.StackTrace);
                newEx.exceptionData.Add("query", query);

                string serializedEx = RawHelpers.serialize(newEx, new MetadataContractresolver(), false);
                JsonException jEx = new JsonException(serializedEx);
                return jEx;
            }
        }

        public static void beforeInsert(string route, Dictionary<string, object> entity, string userId)
        {
            InvokeHostCrudHook("beforeInsert", new object[] { route, entity, userId });
        }

        public static void customizeInsert(ref string query, string route, Dictionary<string, object> entity, string userId)
        {
            var args = new object[] { query, route, entity, userId };
            if (InvokeHostCrudHook("customizeInsert", args, new[] { typeof(string).MakeByRefType(), typeof(string), typeof(Dictionary<string, object>), typeof(string) }))
            {
                query = RawHelpers.ParseNull(args[0]);
            }
        }

        public static void beforeUpdate(string route, Dictionary<string, object> entity, string userId)
        {
            InvokeHostCrudHook("beforeUpdate", new object[] { route, entity, userId });
        }

        public static void customizeUpdate(ref string query, string route, Dictionary<string, object> entity, string userId)
        {
            var args = new object[] { query, route, entity, userId };
            if (InvokeHostCrudHook("customizeUpdate", args, new[] { typeof(string).MakeByRefType(), typeof(string), typeof(Dictionary<string, object>), typeof(string) }))
            {
                query = RawHelpers.ParseNull(args[0]);
            }
        }

        public static void beforeDelete(string route, Dictionary<string, object> entity, string userId)
        {
            InvokeHostCrudHook("beforeDelete", new object[] { route, entity, userId });
        }

        public static void beforeRestore(string route, Dictionary<string, object> entity, string userId)
        {
            InvokeHostCrudHook("beforeRestore", new object[] { route, entity, userId });
        }

        public static void customizeDelete(ref string query, string route, Dictionary<string, object> entity, string userId)
        {
            var args = new object[] { query, route, entity, userId };
            if (InvokeHostCrudHook("customizeDelete", args, new[] { typeof(string).MakeByRefType(), typeof(string), typeof(Dictionary<string, object>), typeof(string) }))
            {
                query = RawHelpers.ParseNull(args[0]);
            }
        }

        public static void customizeRestore(ref string query, string route, Dictionary<string, object> entity, string userId)
        {
            var args = new object[] { query, route, entity, userId };
            if (InvokeHostCrudHook("customizeRestore", args, new[] { typeof(string).MakeByRefType(), typeof(string), typeof(Dictionary<string, object>), typeof(string) }))
            {
                query = RawHelpers.ParseNull(args[0]);
            }
        }

        public static void customizeCountSelect(ref string selectFields, ref string joinClause, ref string whereclause, ref string orderByClause, user utente, _Metadati_Tabelle table_metadata, ref string safetableName, ref string customCount, FilterInfos filterInfo = null, List<SortInfo> SortInfo = null, PageInfo PageInfo = null)
        {
            var args = new object[] { selectFields, joinClause, whereclause, orderByClause, utente, table_metadata, safetableName, customCount, filterInfo, SortInfo, PageInfo };
            if (InvokeHostCrudHook("customizeCountSelect", args, new[] {
                typeof(string).MakeByRefType(),
                typeof(string).MakeByRefType(),
                typeof(string).MakeByRefType(),
                typeof(string).MakeByRefType(),
                typeof(user),
                typeof(_Metadati_Tabelle),
                typeof(string).MakeByRefType(),
                typeof(string).MakeByRefType(),
                typeof(FilterInfos),
                typeof(List<SortInfo>),
                typeof(PageInfo)
            }))
            {
                selectFields = RawHelpers.ParseNull(args[0]);
                joinClause = RawHelpers.ParseNull(args[1]);
                whereclause = RawHelpers.ParseNull(args[2]);
                orderByClause = RawHelpers.ParseNull(args[3]);
                safetableName = RawHelpers.ParseNull(args[6]);
                customCount = RawHelpers.ParseNull(args[7]);
            }
        }

        public static void customizewhereNotGroupBy(ref string selectFields, ref string whereclause, user utente, _Metadati_Tabelle table_metadata) { }

        public static void customizeSelect(ref string selectFields, ref string joinClause, ref string whereclause, ref string orderByClause, user utente, _Metadati_Tabelle table_metadata, ref string customSelectClause, string parentRoute = "", SerializableDictionary<string, object> currentRecord = null, FilterInfos filterInfo = null, List<SortInfo> SortInfo = null, PageInfo PageInfo = null)
        {
            var args = new object[] { selectFields, joinClause, whereclause, orderByClause, utente, table_metadata, customSelectClause, parentRoute, currentRecord, filterInfo, SortInfo, PageInfo };
            if (InvokeHostCrudHook("customizeSelect", args, new[] {
                typeof(string).MakeByRefType(),
                typeof(string).MakeByRefType(),
                typeof(string).MakeByRefType(),
                typeof(string).MakeByRefType(),
                typeof(user),
                typeof(_Metadati_Tabelle),
                typeof(string).MakeByRefType(),
                typeof(string),
                typeof(SerializableDictionary<string, object>),
                typeof(FilterInfos),
                typeof(List<SortInfo>),
                typeof(PageInfo)
            }))
            {
                selectFields = RawHelpers.ParseNull(args[0]);
                joinClause = RawHelpers.ParseNull(args[1]);
                whereclause = RawHelpers.ParseNull(args[2]);
                orderByClause = RawHelpers.ParseNull(args[3]);
                customSelectClause = RawHelpers.ParseNull(args[6]);
            }
        }



        private static bool InvokeHostCrudHook(string methodName, object[] args, Type[] parameterTypes = null)
        {
            if (string.Equals(methodName, "customizeSelect", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    LicenseEvaluationResult licenseEvaluation = LicenseRuntime.Service.Evaluate();
                    if (licenseEvaluation == null || !licenseEvaluation.IsValid)
                    {
                        LicenseRuntime.Service.TryLogInvalidLicenseWarning(licenseEvaluation, "HostCrudHook.customizeSelect");
                        return false;
                    }
                }
                catch
                {
                    // In case of licensing check errors, do not block hook invocation.
                }
            }

            string configuredTypeName = ConfigHelper.GetSettingAsString("customCrudHookClass");
            var typeCandidates = new List<string>();
            if (!string.IsNullOrWhiteSpace(configuredTypeName))
                typeCandidates.Add(configuredTypeName.Trim());

            typeCandidates.Add("WEB_UI_CRAFTER.ProjectData.ServiziMySql.UtilityHost");
            typeCandidates.Add("WEB_UI_CRAFTER.ProjectData.ServiziMySql.CustomCrudHooks");
            typeCandidates.Add("WEB_UI_CRAFTER.ProjectData.Servizi.UtilityHost");
            typeCandidates.Add("WEB_UI_CRAFTER.ProjectData.Servizi.CustomCrudHooks");

            var assemblies = new List<Assembly>();
            var entry = Assembly.GetEntryAssembly();
            if (entry != null)
                assemblies.Add(entry);
            assemblies.AddRange(AppDomain.CurrentDomain.GetAssemblies().Where(a => a != null && a != entry));

            foreach (var assembly in assemblies)
            {
                foreach (var typeName in typeCandidates.Distinct(StringComparer.OrdinalIgnoreCase))
                {
                    var hookType = assembly.GetType(typeName, throwOnError: false, ignoreCase: true);
                    if (hookType == null)
                        continue;

                    MethodInfo method = parameterTypes == null
                        ? hookType.GetMethod(methodName, BindingFlags.Public | BindingFlags.Static | BindingFlags.Instance | BindingFlags.IgnoreCase)
                        : hookType.GetMethod(methodName, BindingFlags.Public | BindingFlags.Static | BindingFlags.Instance | BindingFlags.IgnoreCase, null, parameterTypes, null);

                    if (method == null)
                    {
                        method = hookType.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.Instance)
                            .FirstOrDefault(m => string.Equals(m.Name, methodName, StringComparison.OrdinalIgnoreCase)
                                && m.GetParameters().Length == (args?.Length ?? 0));
                    }

                    if (method == null)
                        continue;

                    var instance = method.IsStatic ? null : Activator.CreateInstance(hookType);
                    method.Invoke(instance, args);
                    return true;
                }
            }

            return false;
        }

        public static string get_Lingua_ID_Utente(user utente)
        {
            RawHelpers.authenticate();

            DbConnection myConn;
            DbCommand myCmd;
            DbDataReader myReader;

            string idLingua = "";
            string idUtente = "";

            using (myConn = MySqlProviderGateway.GetOpenConnection(false))
            {
                myCmd = myConn.CreateCommand();

                myCmd.CommandText = "SELECT ID_Utente, FK_Lingua, * from Utenti WHERE FK_Utente_WUIC = @FK_Utente_WUIC";
                DbProviderUtil.AddWithValue(myCmd, "@FK_Utente_WUIC", utente.user_id);

                myReader = myCmd.ExecuteReader();
                if (myReader.Read())
                {
                    idLingua = myReader.IsDBNull(myReader.GetOrdinal("FK_Lingua")) ? "1" : myReader.GetInt16(myReader.GetOrdinal("FK_Lingua")).ToString();
                    idUtente = myReader.IsDBNull(myReader.GetOrdinal("ID_Utente")) ? utente.user_id.ToString() : myReader.GetInt32(myReader.GetOrdinal("ID_Utente")).ToString();
                }

                myReader.Close();
                myConn.Close();
                myCmd = null;
            }

            return idLingua + "-" + idUtente;
        }
        #endregion

        #region Files & Images Management

        public class my_file_info
        {
            public string name { get; set; }
            public string OriginalPath { get; set; }
            public string extension { get; set; }
            public int kbsyze { get; set; }
            public int bytesyze { get; set; }
            public string folder { get; set; }
            public string path { get; set; }
            public bool isFolder { get; set; }
            public string content { get; set; }
        }



        public List<my_file_info> getFileList(string folder, List<string> fileTypes)
        {
            RawHelpers.authenticate();

            System.IO.DirectoryInfo dir = new System.IO.DirectoryInfo(HttpContext.Current.Server.MapPath("~/" + folder));

            if (fileTypes.Count == 0)
                return dir.GetFiles().ToList().Select((x) => new my_file_info() { folder = x.DirectoryName, extension = x.Extension, OriginalPath = x.Name, bytesyze = (int)x.Length, kbsyze = (int)(x.Length / 1024) }).ToList();
            else
            {
                List<my_file_info> fi = fileTypes.SelectMany(i => dir.GetFiles(i)).Distinct().ToList().Select((x) => new my_file_info() { folder = x.DirectoryName, extension = x.Extension, OriginalPath = x.Name, bytesyze = (int)x.Length, kbsyze = (int)(x.Length / 1024) }).ToList();
                return fi;
            }
        }



        public List<my_file_info> getFileList(string folder, List<string> fileTypes, bool deep)
        {
            RawHelpers.authenticate();

            System.IO.DirectoryInfo dir = new System.IO.DirectoryInfo(HttpContext.Current.Server.MapPath("~/" + folder));

            if (fileTypes.Count == 0)
                return dir.EnumerateFiles().ToList().Select((x) => new my_file_info() { name = x.Name, folder = x.Directory.Name, extension = x.Extension, OriginalPath = x.FullName, bytesyze = (int)x.Length, kbsyze = (int)(x.Length / 1024) }).ToList();
            else
            {
                var dirs = dir.EnumerateFiles();
                List<my_file_info> fi = fileTypes.SelectMany(i => dir.EnumerateFiles("*.*", SearchOption.AllDirectories)).Distinct().ToList().Select((x) => new my_file_info() { name = x.Name, folder = x.Directory.Name, extension = x.Extension, OriginalPath = x.FullName, bytesyze = (int)x.Length, kbsyze = (int)(x.Length / 1024) }).ToList();
                return fi;
            }
        }



        public List<my_file_info> getFolderList(string folder)
        {
            RawHelpers.authenticate();

            System.IO.DirectoryInfo dir = new System.IO.DirectoryInfo(HttpContext.Current.Server.MapPath("~/" + folder));
            var dirs = dir.EnumerateDirectories();

            List<my_file_info> dirsList = dirs.ToList().Select((x) => new my_file_info() { folder = x.Name, extension = null }).ToList();
            return dirsList;
        }



        public void saveBase64Image(string keyName, int keyValue, string tableName, string field, string imgName, string routePath, user utente)
        {
            RawHelpers.authenticate();

            if (imgName != "")
            {
                string uploadBasePath = "/upload/";

                try
                {
                    if (File.Exists(HttpContext.Current.Server.MapPath(uploadBasePath + ((routePath != null) ? routePath : "/")) + imgName))
                    {
                        string filePath = HttpContext.Current.Server.MapPath(uploadBasePath + ((routePath != null) ? routePath : "/") + imgName);
                        string imgB64 = ImageToBase64(filePath);

                        // scrivi in upload il file nel DB nel campo Foto
                        DbConnection myConn;
                        DbCommand myCmd;

                        using (myConn = MySqlProviderGateway.GetOpenConnection(false))
                        {
                            try
                            {
                                myCmd = myConn.CreateCommand();

                                myCmd.CommandText = string.Format("UPDATE {0} SET {1} = '{2}', NomeFoto = @NomeFoto , DataAggiornamento = getDate(), UtenteAggiornamento = {3} WHERE {4} = {5}", tableName, field, imgB64.ToString(), utente.user_id, keyName, keyValue);
                                DbProviderUtil.AddWithValue(myCmd, "@NomeFoto", imgName);
                                myCmd.ExecuteNonQuery();
                            }
                            catch (Exception)
                            {
                                throw;
                            }
                        }
                        myConn.Close();
                        myCmd = null;
                    }
                    else
                        throw new FileNotFoundException(HttpContext.Current.Server.MapPath((routePath != null) ? routePath : "/") + imgName);
                }
                catch (FileNotFoundException)
                {
                    throw;
                }
            }
            else
            {
                // scrivi in upload il file nel DB nel campo Foto
                DbConnection myConn;
                DbCommand myCmd;

                using (myConn = MySqlProviderGateway.GetOpenConnection(false))
                {
                    try
                    {
                        myCmd = myConn.CreateCommand();

                        myCmd.CommandText = string.Format("UPDATE {0} SET {1} = '', NomeFoto = @NomeFoto WHERE {2} = {3} ", tableName, field, keyName, keyValue);
                        DbProviderUtil.AddWithValue(myCmd, "@NomeFoto", imgName);
                        myCmd.ExecuteNonQuery();
                    }
                    catch (Exception ex)
                    {
                        throwJsonException(ex, "immagini", "saveBase64Image");
                    }
                }
                myConn.Close();
                myCmd = null;
            }
        }

        protected virtual bool IsFileLocked(FileInfo file)
        {
            FileStream stream = null;

            try
            {
                stream = file.Open(FileMode.Open, FileAccess.ReadWrite, FileShare.None);
            }
            catch (IOException)
            {
                return true;
            }
            finally
            {
                if (stream != null)
                    stream.Close();
            }
            return false;
        }

        public static string ImageToBase64(string imagePath)
        {
            if (string.IsNullOrEmpty(imagePath) || !System.IO.File.Exists(imagePath))
                return "";

            byte[] imageBytes = System.IO.File.ReadAllBytes(imagePath);
            return Convert.ToBase64String(imageBytes);
        }

        #endregion

        #region Authentication & User Management

        public static string getCustomerProjectPath()
        {
            string projFolder = ConfigHelper.GetSettingAsString("projectDataFolder") ?? string.Empty;

            if (!string.IsNullOrEmpty(projFolder))
                return projFolder;

            string releasePath = HttpContext.Current.Server.MapPath("/");
            ////string debugPath = ""; // HostingEnvironment.MapPath("~");

            //#if DEBUG
            //#else
            return releasePath;
            //#endif
        }



        public string getRealPath()
        {
            RawHelpers.authenticate();
            return getCustomerProjectPath();
        }

        public static string getConnectionString(ConcurrentDictionary<string, object> utenteExtra)
        {

            string connectionString = "";

            if (utenteExtra.ContainsKey("connection"))
            {
                string userConnection = utenteExtra["connection"].ToString();

                if (!string.IsNullOrEmpty(userConnection))
                    connectionString = ConfigurationManager.ConnectionStrings[userConnection].ConnectionString;
                else
                {
                    connectionString = ConfigurationManager.ConnectionStrings["DataSQLConnection"].ConnectionString;
                }
            }
            else
            {
                connectionString = ConfigurationManager.ConnectionStrings["DataSQLConnection"].ConnectionString;
            }
            return connectionString;
        }

        public static string authenticate()
        {
            user user = RawHelpers.getUserFromCookie();

            if (user == null)
                throw new AuthenticationException("Authentication exception!");

            bool enableCookieAuthentication = RawHelpers.ParseBool(ConfigHelper.GetSettingAsString("enableCookieAuthentication"));

            if (enableCookieAuthentication)
            {
                using (metaModelRaw.metaRawModel context = new metaModelRaw.metaRawModel())
                {
                    metaModelRaw.SysInfo infos = context.GetSysInfos();

                    using (DbConnection connection = string.IsNullOrEmpty(infos.user_db_name) ? MySqlProviderGateway.GetOpenConnection(true) : MySqlProviderGateway.getSpecificConnection(infos.user_db_name))
                    {
                        SqlMapper.FastExpando token = connection.Query(
                            string.Format("SELECT token, ip FROM {0} WHERE {1} = '{2}' and Dateadd(MINUTE, " +
                                            ConfigHelper.GetSettingAsString("sessionTimeoutMinutes") +
                                            ", LastActivityDate) > GETDATE()",
                                            infos.user_table_name,
                                            infos.user_id_column_name,
                                            user.user_id)).FirstOrDefault();

                        if (token == null)
                            throw new AuthenticationException("Session expired");

                        string current_ip = HttpContext.Current.Request.UserHostAddress;
                        string saved_token = token.data["token"].ToString();
                        string saved_ip = token.data["ip"].ToString();

                        if (saved_token != user.user_token || current_ip != saved_ip || string.IsNullOrEmpty(saved_token))
                        {
                            connection.Execute(string.Format("UPDATE {0} SET {1}='', LastActivityDate=getdate() WHERE {2} = {3}",
                                                                infos.user_table_name,
                                                                "token",
                                                                infos.user_id_column_name,
                                                                user.user_id));

                            throw new AuthenticationException("Authentication exception!");
                        }
                        else
                        {
                            connection.Execute(string.Format("UPDATE {0} SET LastActivityDate=getdate() WHERE {1} = {2}",
                                                                infos.user_table_name,
                                                                infos.user_id_column_name,
                                                                user.user_id));
                        }
                    }
                }
            }

            return user.user_id;
        }



        public bool switchUser(string token, string username, string password)
        {
            using (metaRawModel context = new metaRawModel())
            {
                SysInfo infos = context.GetSysInfos();

                if (infos != null)
                {
                    using (DbConnection connection = MySqlProviderGateway.GetOpenConnection(true))
                    {
                        bool isPwdEncripted = RawHelpers.ParseBool(ConfigHelper.GetSettingAsString("IsPwdEncripted"));

                        string pwd = password;
                        if (isPwdEncripted)
                        {
                            pwd = Global.pbkdf2Hash(pwd);
                        }

                        string iP = HttpContext.Current.Request.UserHostAddress;

                        var dbArgs = new DynamicParameters();
                        dbArgs.Add("ip", iP);
                        dbArgs.Add("motivo", token);
                        dbArgs.Add("username", username);
                        dbArgs.Add("password", password);

                        int modified = connection.Execute(string.Format("UPDATE {0} SET IsLoggedIn = 0, ip = @ip WHERE motivo = @motivo AND username = @username AND password = @password",
                            infos.user_table_name), dbArgs);

                        return modified >= 0;
                    }
                }
            }

            return false;

        }

        public static string customAuth(string user_name, string password)
        {   // se utilizzo questo metodo in webconfig impostare <add key="customAuthentication" value="true"/>


            return "";
        }


        public static user getUserByID(string user_id)
        {
            var utente = MySqlProviderGateway.getUserByID(user_id);


            return utente;
        }

        public static bool userIsAdmin(user u)
        {
            bool boolVal = (u.role_id == "1" || u.role_id == "2" || u.role_id == "10");
            return boolVal;
        }

        public static user mapUserFields(SysInfo infos, SqlMapper.FastExpando user)
        {

            string userid = user.Where(x => x.Key == infos.user_id_column_name).Any() ? RawHelpers.ParseNull(user.Where(x => x.Key == infos.user_id_column_name).First().Value).ToString() : "";
            string display = user.Where(x => x.Key == infos.user_description_column_name).Any() ? RawHelpers.ParseNull(user.Where(x => x.Key == infos.user_description_column_name).First().Value).ToString() : "";
            bool isAdmin = user.Where(x => x.Key == infos.isAdmin_column_name).Any() ? RawHelpers.ParseBool(user.Where(x => x.Key == infos.isAdmin_column_name).First().Value) : false;
            string role_id = user.Where(x => x.Key == infos.role_id_column_name).Any() ? RawHelpers.ParseNull(user.Where(x => x.Key == infos.role_id_column_name).First().Value).ToString() : "";
            string ip = user.Where(x => x.Key == "ip").Any() ? RawHelpers.ParseNull(user.Where(x => x.Key == "ip").First().Value) : "";
            string email = user.Where(x => x.Key == "email").Any() ? RawHelpers.ParseNull(user.Where(x => x.Key == "email").First().Value) : "";
            string uName = user.Where(x => x.Key == infos.username_column_name).Any() ? RawHelpers.ParseNull(user.Where(x => x.Key == infos.username_column_name).First().Value).ToString() : "";

            var lastAct = user.Where(x => x.Key == "LastActivityDate").Any() ? RawHelpers.ParseNull(user.Where(x => x.Key == "LastActivityDate").First().Value) : null;
            DateTime lastActivity = DateTime.MinValue;

            if (lastAct != null)
                DateTime.TryParse(lastAct.ToString(), out lastActivity);

            user u = new user()
            {
                display_name = display,
                isAdmin = isAdmin,
                role_id = role_id,
                user_id = userid,
                username = uName,
                LastActivityDate = lastActivity,
                extra_keys = new SerializableDictionary<string, object>(),
                extra_client = new SerializableDictionary<string, object>(),
                ip = ip,
                email = email
            };

            if (user.data.ContainsKey("language") && user.data["language"] != null)
                u.language = user.data["language"].ToString();

            var extra_fields = user.data.Keys.Where(x => x != infos.password_column_name).Any() ? user.data.Keys.Where(x => x != infos.password_column_name) : null;
            if (extra_fields != null)
            {
                foreach (string extra_field in extra_fields)
                {
                    var user_param = user.data[extra_field];
                    u.extra_keys.Add(extra_field, user_param != null ? user_param.ToString() : "");
                }
            }

            if (user.Where(x => x.Key == infos.azienda_id_column_name).Any())
            {
                KeyValuePair<string, object>? az_field = user.Where(x => x.Key == infos.azienda_id_column_name).FirstOrDefault();
                if (az_field != null)
                {
                    object id_azienda = az_field.Value.Value;

                    if (id_azienda != null)
                    {
                        u.azienda_id = int.Parse(id_azienda.ToString());
                    }
                }
            }

            return u;
        }

        #region Excel

        private static readonly Regex LeadingInteger = new Regex(@"^(-?\d+)");

        public string ExportToExcel(string[] models, string[] datas, double timestamp)
        {
            using (System.IO.MemoryStream stream = new System.IO.MemoryStream())
            {
                SpreadsheetDocument spreadsheet = Excel.CreateWorkbook(stream);

                Excel.AddPredefinedStyles(spreadsheet, File.ReadAllText(HttpContext.Current.Server.MapPath("~/" + "Style/PredefinedStyles.xml")));

                string title = "";

                for (int i = 0; i < models.Length; i++)
                {
                    if (i == 0)
                    {
                        title = "Progressivo giorno";
                    }
                    else if (i == 1)
                    {
                        title = "Progressivo settimana";
                    }
                    else if (i == 2)
                    {
                        title = "Progressivo mese";
                    }
                    else if (i == 3)
                    {
                        title = "Progressivo anno";
                    }

                    Excel.AddWorksheet(spreadsheet, title);
                    Worksheet worksheet = spreadsheet.WorkbookPart.WorksheetParts.Skip(i).First().Worksheet;


                    /* Get the information needed for the worksheet */

                    var modelObject = JsonConvert.DeserializeObject<dynamic>(models[i]);
                    var dataObject = JsonConvert.DeserializeObject<dynamic>(datas[i]);


                    /* Add the column titles to the worksheet. */

                    for (int mdx = 0; mdx < modelObject.Count; mdx++)
                    {
                        string titleX = title;
                        string caption = modelObject[mdx].metaInfo.mc_display_string_in_view;

                        Excel.SetColumnHeadingValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1),
                            caption,
                            false, false);
                    }

                    /* Add the data to the worksheet. */

                    for (int idx = 0; idx < dataObject.Count; idx++)
                    {
                        for (int mdx = 0; mdx < modelObject.Count; mdx++)
                        {
                            var metadata = modelObject[mdx];
                            string type = metadata.type;
                            var metaInfo = metadata.metaInfo;
                            var fieldName = (metaInfo.mc_nome_colonna != null) ? metaInfo.mc_nome_colonna.ToString() : "";

                            JValue val = ((JValue)dataObject[idx][fieldName]);
                            if (val != null)
                            {
                                uint styleIndex = 0;

                                if (type == "number")
                                {
                                    styleIndex = 2;

                                    short? decimals = metaInfo.mc_ui_slider_decimals;
                                    string format = metaInfo.mc_ui_slider_format;

                                    if (decimals.HasValue)
                                    {
                                        switch (decimals)
                                        {
                                            case 0:
                                                styleIndex = 2;
                                                break;
                                            case 1:
                                                styleIndex = 4;
                                                break;
                                            case 2:
                                                styleIndex = 6;
                                                break;
                                            case 3:
                                                styleIndex = 8;
                                                break;
                                            case 4:
                                                styleIndex = 10;
                                                break;
                                            case 5:
                                                styleIndex = 12;
                                                break;
                                            case 6:
                                                styleIndex = 14;
                                                break;
                                        }
                                    }

                                    Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2),
                                    Convert.ToDouble(val.Value), styleIndex, false);
                                }
                                else if (type == "date")
                                {
                                    string col_type = metadata.metaInfo.mc_ui_column_type;

                                    if (col_type == "datetime")
                                        Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2),
    Convert.ToDateTime(val.Value), 18, false);
                                    else
                                        Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2),
                                   Convert.ToDateTime(val.Value), 17, false);
                                }
                                else if (type == "boolean")
                                {
                                    if (RawHelpers.ParseNull(val.Value) == string.Empty)
                                        Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), "", false, false);
                                    else if (Convert.ToBoolean(val.Value))
                                        Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), "SI", false, false);
                                    else
                                        Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), "NO", false, false);
                                }
                                else if (type == "number_boolean")
                                {
                                    if (RawHelpers.ParseNull(val.Value) == string.Empty)
                                        Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), "", false, false);
                                    else if (Convert.ToInt32(val.Value) == 1)
                                        Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), "SI", false, false);
                                    else if (Convert.ToInt32(val.Value) == 0)
                                        Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), "NO", false, false);
                                }
                                else if (type == "lookupByID")
                                {
                                    _Metadati_Colonne_Lookup col = metadata as _Metadati_Colonne_Lookup;
                                    val = ((JValue)dataObject[idx][col.mc_ui_lookup_entity_name.Replace(" ", "_") + "___" + col.mc_ui_lookup_dataTextField + "__" + col.mc_nome_colonna]);
                                    Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), RawHelpers.ParseNull(val.Value), false, false);
                                }
                                else
                                    Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), RawHelpers.ParseNull(val.Value), false, false);
                            }
                        }
                    }
                    worksheet.Save();
                }
                /* Save the worksheet and store it in Session using the spreadsheet title. */
                spreadsheet.Dispose();
                byte[] file = stream.ToArray();
                HttpContext.Current.Session["Dati del giorno_" + timestamp.ToString()] = file;
            }
            return "{\"success\":true}";
        }
        public static bool customizeExcelField(string fieldName, string routeName, string type, dynamic metaInfo, SpreadsheetDocument spreadsheet, Worksheet worksheet, UInt32 columnIndex, UInt32 rowIndex, object value)
        {
            uint? styleIndex = 0;
            if (routeName == "pfn_visualizzatore" && type == "number")
            {
                styleIndex = 2;
                Excel.SetCellValue(spreadsheet, worksheet, columnIndex, rowIndex, Convert.ToDouble(value), styleIndex, false);
                return true;
            }
            else return false;

        }

        private static void InsertChartInSpreadsheet(SpreadsheetDocument document, string rangeRef, chartType chartType, string cellName, string rangeEtichette, string rangeValue)
        {
            /******************************************************************/
            //ActiveSheet.Shapes.AddChart.Select
            //ActiveChart.SeriesCollection.NewSeries
            /******************************************************************/


            IEnumerable<Sheet> sheets = document.WorkbookPart.Workbook.Descendants<Sheet>().Where
                (s => s.Name == "Chart");

            WorksheetPart worksheetPart = (WorksheetPart)document.WorkbookPart.GetPartById(sheets.First().Id);

            //// Add a new drawing to the worksheet.
            DrawingsPart drawingsPart = worksheetPart.AddNewPart<DrawingsPart>();
            worksheetPart.Worksheet.Append(new DocumentFormat.OpenXml.Spreadsheet.Drawing() { Id = worksheetPart.GetIdOfPart(drawingsPart) });
            worksheetPart.Worksheet.Save();

            //// Add a new chart and set the chart language to English-US.
            ChartPart chartPart = drawingsPart.AddNewPart<ChartPart>();
            chartPart.ChartSpace = new ChartSpace();
            chartPart.ChartSpace.Append(new EditingLanguage() { Val = new StringValue("en-US") });

            DocumentFormat.OpenXml.Drawing.Charts.Chart chart = chartPart.ChartSpace.AppendChild
                <DocumentFormat.OpenXml.Drawing.Charts.Chart>
                (new DocumentFormat.OpenXml.Drawing.Charts.Chart());

            PlotArea plotArea = new PlotArea();
            Layout layout = new Layout();

            PieChart pie = new PieChart();

            PieChartSeries pieSiries = new PieChartSeries();

            PieChartSeries pieSeries = pie.AppendChild<PieChartSeries>(new PieChartSeries());


            DocumentFormat.OpenXml.Drawing.Charts.Formula formula = new DocumentFormat.OpenXml.Drawing.Charts.Formula();


            NumberReference numberRef = new NumberReference();
            numberRef.Append(formula);

            DocumentFormat.OpenXml.Drawing.Charts.Values value = new DocumentFormat.OpenXml.Drawing.Charts.Values();

            value.Append(numberRef);
            pieSiries.Append(value);
            pie.Append(pieSiries);
            plotArea.Append(pie);
            chart.Append(plotArea);

            chartPart.ChartSpace.Append(chart);
        }

        #endregion

        private void throwJsonException(Exception ex, string route, string method)
        {
            customException newEx = new customException(RawHelpers.flatException(ex, false).Message, route);
            newEx.exceptionData.Add("title", "Error method: " + method);
            newEx.exceptionData.Add("stackTrace", ex.StackTrace);
            string serializedEx = RawHelpers.serialize(newEx, new MetadataContractresolver(), false);
            JsonException jEx = new JsonException(serializedEx);
            throw jEx;
        }

        #endregion
    }
}






