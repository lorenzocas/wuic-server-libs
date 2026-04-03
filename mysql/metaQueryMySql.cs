using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Linq;
using System.Security.Authentication;
using System.WebCore;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using Dapper;

using System.Collections;
using System.Text;
using System.IO;
using System.Net.Mail;
using System.Data;
using System.Net;
using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using WEB_UI_CRAFTER;
using System.Xml;
using Newtonsoft.Json.Linq;
using WEB_UI_CRAFTER.Helpers;
using MySql.Data.MySqlClient;
using System.Diagnostics;
using System.Configuration;
using System.Threading;
using Westwind.Utilities.Dynamic;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using DocumentFormat.OpenXml;
using ExcelOpenXMLBasics;
using WEB_UI_CRAFTER.ProjectData.ServiziMySql;

namespace metaModelRaw
{
    public partial class metaQueryMySql
    {
        private static readonly AsyncLocal<string> LastCrudSqlQuery = new AsyncLocal<string>();
        private static readonly object ChangeTrackingSchemaLock = new object();
        private static volatile bool ChangeTrackingSchemaEnsured = false;

        public static string GetLastCrudSqlQuery()
        {
            return LastCrudSqlQuery.Value;
        }

        public static void ClearLastCrudSqlQuery()
        {
            LastCrudSqlQuery.Value = null;
        }

        private static void SetLastCrudSqlQuery(string query)
        {
            LastCrudSqlQuery.Value = query;
        }

        private static void EnsureChangeTrackingSchema(MySqlConnection connection)
        {
            if (ChangeTrackingSchemaEnsured || connection == null)
                return;

            lock (ChangeTrackingSchemaLock)
            {
                if (ChangeTrackingSchemaEnsured || connection == null)
                    return;

                connection.Execute(@"
CREATE TABLE IF NOT EXISTS `ChangeMaster` (
    `IdChange` INT NOT NULL AUTO_INCREMENT,
    `MdRouteName` VARCHAR(255) NOT NULL,
    `Timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `Pkey` VARCHAR(255) NULL,
    `operation` VARCHAR(50) NULL,
    `userID` VARCHAR(255) NULL,
    PRIMARY KEY (`IdChange`)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;");

                connection.Execute(@"
CREATE TABLE IF NOT EXISTS `ChangeDetail` (
    `IdFieldChange` INT NOT NULL AUTO_INCREMENT,
    `FK_IdChange` INT NOT NULL,
    `Field` VARCHAR(255) NOT NULL,
    `NewValue` LONGTEXT NOT NULL,
    `OldValue` LONGTEXT NULL,
    `TimestampClient` DATETIME NULL,
    PRIMARY KEY (`IdFieldChange`)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;");

                int hasOperation = connection.Query<int>(@"
SELECT COUNT(*)
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'ChangeMaster'
  AND column_name = 'operation';").FirstOrDefault();

                if (hasOperation == 0)
                    connection.Execute("ALTER TABLE `ChangeMaster` ADD COLUMN `operation` VARCHAR(50) NULL;");

                int hasUserId = connection.Query<int>(@"
SELECT COUNT(*)
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'ChangeMaster'
  AND column_name = 'userID';").FirstOrDefault();

                if (hasUserId == 0)
                    connection.Execute("ALTER TABLE `ChangeMaster` ADD COLUMN `userID` VARCHAR(255) NULL;");

                int hasNewValue = connection.Query<int>(@"
SELECT COUNT(*)
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'ChangeDetail'
  AND column_name = 'NewValue';").FirstOrDefault();

                if (hasNewValue > 0)
                {
                    connection.Execute("UPDATE `ChangeDetail` SET `NewValue` = '' WHERE `NewValue` IS NULL;");
                    connection.Execute("ALTER TABLE `ChangeDetail` MODIFY COLUMN `NewValue` LONGTEXT NOT NULL;");
                }

                int hasFk = connection.Query<int>(@"
SELECT COUNT(*)
FROM information_schema.referential_constraints
WHERE constraint_schema = DATABASE()
  AND table_name = 'ChangeDetail'
  AND constraint_name = 'FK_ChangeDetail_ChangeMaster';").FirstOrDefault();

                if (hasFk == 0)
                {
                    try
                    {
                        connection.Execute(@"
ALTER TABLE `ChangeDetail`
ADD CONSTRAINT `FK_ChangeDetail_ChangeMaster`
FOREIGN KEY (`FK_IdChange`) REFERENCES `ChangeMaster`(`IdChange`);");
                    }
                    catch
                    {
                    }
                }

                ChangeTrackingSchemaEnsured = true;
            }
        }

        #region "CONNECTION UTILS"


        public static MySqlConnection GetContentConnection()
        {
            string connectionString;
            connectionString = ConfigurationManager.ConnectionStrings["ContentSQLConnection"].ConnectionString;

            var connection = new MySqlConnection(connectionString);
            connection.Open();
            return connection;
        }

        public static List<company> GetAziende()
        {
            List<company> companies = RawHelpers.getCompaniesFromSession();

            if (companies == null)
            {
                using (MySqlConnection con = metaQueryMySql.GetOpenConnection(true))
                {
                    companies = con.Query<company>("SELECT * FROM aziende").ToList();
                    RawHelpers.setCompaniesIntoSession(companies);
                }
            }

            return companies;
        }

        public static MySqlConnection GetOpenConnection(bool isMetaDataQuery, string connectionName = "", user u = null)
        {
            string connectionString = null;
            MySqlConnection connection;

            if (string.IsNullOrEmpty(connectionString))
            {
                if (string.IsNullOrEmpty(connectionName))
                {
                    if (isMetaDataQuery)
                    {
                        connectionString = ConfigurationManager.ConnectionStrings["MetaDataSQLConnection"].ConnectionString;
                    }
                    else
                    {
                        connectionString = ConfigurationManager.ConnectionStrings["DataSQLConnection"].ConnectionString;
                    }
                }
                else
                {
                    if (ConfigurationManager.ConnectionStrings[connectionName] == null)
                        throw new Exception(string.Format("Connection '{0}' not found in web.config", connectionName));

                    connectionString = ConfigurationManager.ConnectionStrings[connectionName].ConnectionString;
                }

                if (!isMetaDataQuery)
                {
                    bool connectionByUser = bool.Parse(ConfigHelper.GetSettingAsString("connectionByUser") ?? "false");

                    if (connectionByUser)
                    {
                        if (u == null)
                            u = user.getUserByID(RawHelpers.authenticate());

                        if (u.extra_keys != null && u.extra_keys.ContainsKey("connection"))
                        {
                            string userConnection = (string)u.extra_keys["connection"];

                            if (!string.IsNullOrEmpty(userConnection))
                                connectionString = ConfigurationManager.ConnectionStrings[userConnection].ConnectionString;
                        }
                    }
                }
            }


            if (!string.IsNullOrEmpty(connectionString))
            {
                connection = new MySqlConnection(connectionString);
                connection.Open();



                return connection;
            }
            else
            {
                throw new Exception("Connection string not defined. Please install first!");
            }
        }


        public static DbConnection CreateOpenConnection(string connectionString)
        {
            if (string.IsNullOrWhiteSpace(connectionString))
                throw new Exception("Connection string not defined. Please install first!");

            return new MySqlConnection(connectionString);
        }

        public static void ExecuteMySqlScript(DbConnection connection, string script)
        {
            if (connection == null)
                throw new ArgumentNullException(nameof(connection));

            if (string.IsNullOrWhiteSpace(script))
                return;

            bool shouldClose = connection.State != ConnectionState.Open;
            if (shouldClose)
                connection.Open();

            try
            {
                using (var cmd = connection.CreateCommand())
                {
                    cmd.CommandText = script;
                    cmd.ExecuteNonQuery();
                }
            }
            finally
            {
                if (shouldClose)
                    connection.Close();
            }
        }
        public static void FlushCache(string route)
        {
            if (string.IsNullOrWhiteSpace(route))
            {
                return;
            }

            string shadowTableName = RawHelpers.escapeDBObjectName("_shadow_" + route, "mysql");

            using (MySqlConnection connection = metaQueryMySql.GetOpenConnection(false))
            {
                var dbArgs = new DynamicParameters();
                dbArgs.Add("route", metaQueryMySql.EscapeValue(route));

                try
                {
                    connection.Execute(string.Format("DELETE FROM {0}", shadowTableName));
                }
                catch (MySqlException ex) when (ex.Number == 1146) // Table doesn't exist
                {
                    // Shadow table may not exist yet for this route.
                }

                using (MySqlConnection connection2 = metaQueryMySql.GetOpenConnection(true))
                {
                    try
                    {
                        connection2.Execute("DELETE FROM _shadow_caching where route=@route", dbArgs);
                    }
                    catch (MySqlException ex) when (ex.Number == 1146) // Table doesn't exist
                    {
                        // Shadow cache table may not exist yet.
                    }
                }
            }
        }

        #endregion

        #region "RETICULAR"

        public static string addReticularColumn(string route, string type, bool isReticular)
        {
            using (metaModelRaw.metaRawModel mmd = new metaModelRaw.metaRawModel("mysql"))
            {
                _Metadati_Tabelle tab = mmd.GetMetadati_Tabelles(route).FirstOrDefault();
                if (tab != null)
                {
                    string col_name = "";
                    string db_col_type = "";
                    string mc_ui_column_type = "";
                    List<_Metadati_Colonne> cols = tab._Metadati_Colonnes.ToList();
                    int text_col_count = cols.Count(x => x.mc_db_column_type == "varchar");
                    int numeric_col_count = cols.Count(x => x.mc_db_column_type == "decimal" || x.mc_db_column_type == "bit");
                    int total_col_count = cols.Count;

                    if (type == "1")
                    {
                        col_name = string.Format("colonna_{0}_testo", (text_col_count + 1).ToString().PadLeft(3, '0'));
                        db_col_type = "varchar";
                        mc_ui_column_type = "text";

                        _Metadati_Colonne reticularCol = new _Metadati_Colonne() { md_id = tab.md_id, mc_db_column_type = db_col_type, mc_logic_nullable = true, mc_logic_editable = true, mc_display_string_in_view = col_name, mc_display_string_in_edit = col_name, mc_grant_by_default = true, mc_nome_colonna = col_name, mc_ui_column_type = mc_ui_column_type, mc_ordine = total_col_count };

                        if (!isReticular)
                        {
                            reticularCol.mc_is_computed = true;
                            reticularCol.mc_computed_formula = "''";
                        }

                        string query = "INSERT INTO `_metadati__colonne` (`voa_class`, `md_id`, `mc_db_column_type`, `mc_display_string_in_edit`, `mc_display_string_in_view`, `mc_logic_editable`, `mc_logic_nullable`, `mc_nome_colonna`, `mc_ui_column_type`, `mccomputedformula`, `mciscomputed`, `mcgrantbydefault`, `mcordine`) VALUES (@voa_class, @md_id, @mc_db_column_type, @mc_display_string_in_edit, @mc_display_string_in_view, @mc_logic_editable, @mc_logic_nullable, @mc_nome_colonna, @mc_ui_column_type, @mccomputedformula, @mciscomputed, @mcgrantbydefault, @mcordine); SELECT LAST_INSERT_ID()";
                        using (MySqlConnection con = GetOpenConnection(true))
                        {
                            MySqlCommand cmd = new MySqlCommand(query, con);
                            cmd.Parameters.Add(new MySqlParameter("voa_class", 1));
                            cmd.Parameters.Add(new MySqlParameter("md_id", tab.md_id));
                            cmd.Parameters.Add(new MySqlParameter("mc_db_column_type", db_col_type));
                            cmd.Parameters.Add(new MySqlParameter("mc_display_string_in_edit", col_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_display_string_in_view", col_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_logic_editable", true));
                            cmd.Parameters.Add(new MySqlParameter("mc_logic_nullable", true));
                            cmd.Parameters.Add(new MySqlParameter("mc_nome_colonna", col_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_ui_column_type", mc_ui_column_type));
                            cmd.Parameters.Add(new MySqlParameter("mccomputedformula", !isReticular ? "null" : ""));
                            cmd.Parameters.Add(new MySqlParameter("mciscomputed", !isReticular));
                            cmd.Parameters.Add(new MySqlParameter("mcgrantbydefault", true));
                            cmd.Parameters.Add(new MySqlParameter("mcordine", total_col_count));
                            cmd.Parameters.Add(new MySqlParameter("mc_ui_slider_format", "N"));
                            return cmd.ExecuteScalar().ToString();
                        }

                    }
                    else if (type == "2")
                    {

                        col_name = string.Format("colonna_{0}_testo", (text_col_count + 1).ToString().PadLeft(3, '0'));
                        db_col_type = "varchar";
                        mc_ui_column_type = "date";

                        string display_name = col_name.Replace("_testo", "_date");

                        _Metadati_Colonne reticularCol = new _Metadati_Colonne() { md_id = tab.md_id, mc_db_column_type = db_col_type, mc_logic_nullable = true, mc_logic_editable = true, mc_display_string_in_view = display_name, mc_display_string_in_edit = display_name, mc_grant_by_default = true, mc_nome_colonna = col_name, mc_ui_column_type = mc_ui_column_type, mc_ordine = total_col_count };

                        if (!isReticular)
                        {
                            reticularCol.mc_is_computed = true;
                            reticularCol.mc_computed_formula = "''";
                        }

                        string query = "INSERT INTO `_metadati__colonne` (`voa_class`, `md_id`, `mc_db_column_type`, `mc_display_string_in_edit`, `mc_display_string_in_view`, `mc_logic_editable`, `mc_logic_nullable`, `mc_nome_colonna`, `mc_ui_column_type`, `mccomputedformula`, `mciscomputed`, `mcgrantbydefault`, `mcordine`) VALUES (@voa_class, @md_id, @mc_db_column_type, @mc_display_string_in_edit, @mc_display_string_in_view, @mc_logic_editable, @mc_logic_nullable, @mc_nome_colonna, @mc_ui_column_type, @mccomputedformula, @mciscomputed, @mcgrantbydefault, @mcordine); SELECT LAST_INSERT_ID()";
                        using (MySqlConnection con = GetOpenConnection(true))
                        {
                            MySqlCommand cmd = new MySqlCommand(query, con);
                            cmd.Parameters.Add(new MySqlParameter("voa_class", 1));
                            cmd.Parameters.Add(new MySqlParameter("md_id", tab.md_id));
                            cmd.Parameters.Add(new MySqlParameter("mc_db_column_type", db_col_type));
                            cmd.Parameters.Add(new MySqlParameter("mc_display_string_in_edit", col_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_display_string_in_view", col_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_logic_editable", true));
                            cmd.Parameters.Add(new MySqlParameter("mc_logic_nullable", true));
                            cmd.Parameters.Add(new MySqlParameter("mc_nome_colonna", col_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_ui_column_type", mc_ui_column_type));
                            cmd.Parameters.Add(new MySqlParameter("mccomputedformula", !isReticular ? "null" : ""));
                            cmd.Parameters.Add(new MySqlParameter("mciscomputed", !isReticular));
                            cmd.Parameters.Add(new MySqlParameter("mcgrantbydefault", true));
                            cmd.Parameters.Add(new MySqlParameter("mcordine", total_col_count));
                            cmd.Parameters.Add(new MySqlParameter("mc_ui_slider_format", "N"));
                            return cmd.ExecuteScalar().ToString();
                        }



                    }
                    else if (type == "3")
                    {
                        col_name = string.Format("colonna_{0}_numero", (numeric_col_count + 1).ToString().PadLeft(3, '0'));
                        db_col_type = "decimal";
                        mc_ui_column_type = "number";

                        string query = "INSERT INTO `_metadati__colonne` (`voa_class`, `md_id`, `mc_db_column_type`, `mc_display_string_in_edit`, `mc_display_string_in_view`, `mc_logic_editable`, `mc_logic_nullable`, `mc_nome_colonna`, `mc_ui_column_type`, `mccomputedformula`, `mciscomputed`, `mcgrantbydefault`, `mcordine`) VALUES (@voa_class, @md_id, @mc_db_column_type, @mc_display_string_in_edit, @mc_display_string_in_view, @mc_logic_editable, @mc_logic_nullable, @mc_nome_colonna, @mc_ui_column_type, @mccomputedformula, @mciscomputed, @mcgrantbydefault, @mcordine); SELECT LAST_INSERT_ID()";
                        using (MySqlConnection con = GetOpenConnection(true))
                        {
                            MySqlCommand cmd = new MySqlCommand(query, con);
                            cmd.Parameters.Add(new MySqlParameter("voa_class", 3));
                            cmd.Parameters.Add(new MySqlParameter("md_id", tab.md_id));
                            cmd.Parameters.Add(new MySqlParameter("mc_db_column_type", db_col_type));
                            cmd.Parameters.Add(new MySqlParameter("mc_display_string_in_edit", col_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_display_string_in_view", col_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_logic_editable", true));
                            cmd.Parameters.Add(new MySqlParameter("mc_logic_nullable", true));
                            cmd.Parameters.Add(new MySqlParameter("mc_nome_colonna", col_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_ui_column_type", mc_ui_column_type));
                            cmd.Parameters.Add(new MySqlParameter("mccomputedformula", !isReticular ? "null" : ""));
                            cmd.Parameters.Add(new MySqlParameter("mciscomputed", !isReticular));
                            cmd.Parameters.Add(new MySqlParameter("mcgrantbydefault", true));
                            cmd.Parameters.Add(new MySqlParameter("mcordine", total_col_count));
                            cmd.Parameters.Add(new MySqlParameter("mc_ui_slider_format", "N"));
                            return cmd.ExecuteScalar().ToString();
                        }

                    }
                    else if (type == "4")
                    {
                        col_name = string.Format("colonna_{0}_numero", (numeric_col_count + 1).ToString().PadLeft(3, '0'));
                        db_col_type = "bit";
                        mc_ui_column_type = "boolean";

                        string display_name = col_name.Replace("_numero", "_bit");

                        string query = "INSERT INTO `_metadati__colonne` (`voa_class`, `md_id`, `mc_db_column_type`, `mc_display_string_in_edit`, `mc_display_string_in_view`, `mc_logic_editable`, `mc_logic_nullable`, `mc_nome_colonna`, `mc_ui_column_type`, `mccomputedformula`, `mciscomputed`, `mcgrantbydefault`, `mcordine`) VALUES (@voa_class, @md_id, @mc_db_column_type, @mc_display_string_in_edit, @mc_display_string_in_view, @mc_logic_editable, @mc_logic_nullable, @mc_nome_colonna, @mc_ui_column_type, @mccomputedformula, @mciscomputed, @mcgrantbydefault, @mcordine); SELECT LAST_INSERT_ID()";
                        using (MySqlConnection con = GetOpenConnection(true))
                        {
                            MySqlCommand cmd = new MySqlCommand(query, con);
                            cmd.Parameters.Add(new MySqlParameter("voa_class", 3));
                            cmd.Parameters.Add(new MySqlParameter("md_id", tab.md_id));
                            cmd.Parameters.Add(new MySqlParameter("mc_db_column_type", db_col_type));
                            cmd.Parameters.Add(new MySqlParameter("mc_display_string_in_edit", display_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_display_string_in_view", display_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_logic_editable", true));
                            cmd.Parameters.Add(new MySqlParameter("mc_logic_nullable", true));
                            cmd.Parameters.Add(new MySqlParameter("mc_nome_colonna", col_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_ui_column_type", mc_ui_column_type));
                            cmd.Parameters.Add(new MySqlParameter("mccomputedformula", !isReticular ? "null" : ""));
                            cmd.Parameters.Add(new MySqlParameter("mciscomputed", !isReticular));
                            cmd.Parameters.Add(new MySqlParameter("mcgrantbydefault", true));
                            cmd.Parameters.Add(new MySqlParameter("mcordine", total_col_count));
                            return cmd.ExecuteScalar().ToString();
                        }

                    }
                    else if (type == "5")
                    {
                        col_name = string.Format("colonna_{0}_numero", (numeric_col_count + 1).ToString().PadLeft(3, '0'));
                        db_col_type = "int";
                        mc_ui_column_type = "lookupByID";

                        string display_name = col_name.Replace("_numero", "_lookup");

                        string query = "INSERT INTO `_metadati__colonne` (`voa_class`, `md_id`, `mc_db_column_type`, `mc_display_string_in_edit`, `mc_display_string_in_view`, `mc_logic_editable`, `mc_logic_nullable`, `mc_nome_colonna`, `mc_ui_column_type`, `mccomputedformula`, `mciscomputed`, `mcgrantbydefault`, `mcordine`) VALUES (@voa_class, @md_id, @mc_db_column_type, @mc_display_string_in_edit, @mc_display_string_in_view, @mc_logic_editable, @mc_logic_nullable, @mc_nome_colonna, @mc_ui_column_type, @mccomputedformula, @mciscomputed, @mcgrantbydefault, @mcordine); SELECT LAST_INSERT_ID()";
                        using (MySqlConnection con = GetOpenConnection(true))
                        {
                            MySqlCommand cmd = new MySqlCommand(query, con);
                            cmd.Parameters.Add(new MySqlParameter("voa_class", 2));
                            cmd.Parameters.Add(new MySqlParameter("md_id", tab.md_id));
                            cmd.Parameters.Add(new MySqlParameter("mc_db_column_type", db_col_type));
                            cmd.Parameters.Add(new MySqlParameter("mc_display_string_in_edit", display_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_display_string_in_view", display_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_logic_editable", true));
                            cmd.Parameters.Add(new MySqlParameter("mc_logic_nullable", true));
                            cmd.Parameters.Add(new MySqlParameter("mc_nome_colonna", col_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_ui_column_type", mc_ui_column_type));
                            cmd.Parameters.Add(new MySqlParameter("mccomputedformula", !isReticular ? "null" : ""));
                            cmd.Parameters.Add(new MySqlParameter("mciscomputed", !isReticular));
                            cmd.Parameters.Add(new MySqlParameter("mcgrantbydefault", true));
                            cmd.Parameters.Add(new MySqlParameter("mcordine", total_col_count));
                            return cmd.ExecuteScalar().ToString();
                        }

                    }
                    else if (type == "6")
                    {
                        col_name = string.Format("colonna_{0}_testo", (text_col_count + 1).ToString().PadLeft(3, '0'));
                        db_col_type = "varchar";
                        mc_ui_column_type = "button";

                        string display_name = col_name.Replace("_testo", "_button");

                        string query = "INSERT INTO `_metadati__colonne` (`voa_class`, `md_id`, `mc_db_column_type`, `mc_display_string_in_edit`, `mc_display_string_in_view`, `mc_logic_editable`, `mc_logic_nullable`, `mc_nome_colonna`, `mc_ui_column_type`, `mccomputedformula`, `mciscomputed`, `mcgrantbydefault`, `mcordine`, mchideinedit, mcisdbcomputed) VALUES (@voa_class, @md_id, @mc_db_column_type, @mc_display_string_in_edit, @mc_display_string_in_view, @mc_logic_editable, @mc_logic_nullable, @mc_nome_colonna, @mc_ui_column_type, @mccomputedformula, @mciscomputed, @mcgrantbydefault, @mcordine, @mchideinedit, @mcisdbcomputed); SELECT LAST_INSERT_ID()";
                        using (MySqlConnection con = GetOpenConnection(true))
                        {
                            MySqlCommand cmd = new MySqlCommand(query, con);
                            cmd.Parameters.Add(new MySqlParameter("voa_class", 6));
                            cmd.Parameters.Add(new MySqlParameter("md_id", tab.md_id));
                            cmd.Parameters.Add(new MySqlParameter("mc_db_column_type", db_col_type));
                            cmd.Parameters.Add(new MySqlParameter("mc_display_string_in_edit", display_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_display_string_in_view", display_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_logic_editable", false));
                            cmd.Parameters.Add(new MySqlParameter("mc_logic_nullable", true));
                            cmd.Parameters.Add(new MySqlParameter("mc_nome_colonna", col_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_ui_column_type", mc_ui_column_type));
                            cmd.Parameters.Add(new MySqlParameter("mccomputedformula", !isReticular ? "''" : ""));
                            cmd.Parameters.Add(new MySqlParameter("mciscomputed", !isReticular));
                            cmd.Parameters.Add(new MySqlParameter("mcgrantbydefault", true));
                            cmd.Parameters.Add(new MySqlParameter("mcordine", total_col_count));
                            cmd.Parameters.Add(new MySqlParameter("mchideinedit", true));
                            cmd.Parameters.Add(new MySqlParameter("mcisdbcomputed", false));

                            return cmd.ExecuteScalar().ToString();
                        }

                    }
                    else if (type == "7")
                    {
                        col_name = string.Format("colonna_{0}_testo", (text_col_count + 1).ToString().PadLeft(3, '0'));
                        db_col_type = "varchar";
                        mc_ui_column_type = "multiple_check";

                        string display_name = col_name.Replace("_testo", "_multiple_check");

                        string query = "INSERT INTO `_metadati__colonne` (`voa_class`, `md_id`, `mc_db_column_type`, `mc_display_string_in_edit`, `mc_display_string_in_view`, `mc_logic_editable`, `mc_logic_nullable`, `mc_nome_colonna`, `mc_ui_column_type`, `mcgrantbydefault`, `mcordine`, `mccomputedformula`, `mciscomputed`) VALUES (@voa_class, @md_id, @mc_db_column_type, @mc_display_string_in_edit, @mc_display_string_in_view, @mc_logic_editable, @mc_logic_nullable, @mc_nome_colonna, @mc_ui_column_type, @mcgrantbydefault, @mcordine, @mccomputedformula, @mciscomputed); SELECT LAST_INSERT_ID()";
                        using (MySqlConnection con = GetOpenConnection(true))
                        {
                            MySqlCommand cmd = new MySqlCommand(query, con);
                            cmd.Parameters.Add(new MySqlParameter("voa_class", 4));
                            cmd.Parameters.Add(new MySqlParameter("md_id", tab.md_id));
                            cmd.Parameters.Add(new MySqlParameter("mc_db_column_type", db_col_type));
                            cmd.Parameters.Add(new MySqlParameter("mc_display_string_in_edit", display_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_display_string_in_view", display_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_logic_editable", true));
                            cmd.Parameters.Add(new MySqlParameter("mc_logic_nullable", true));
                            cmd.Parameters.Add(new MySqlParameter("mc_nome_colonna", col_name));
                            cmd.Parameters.Add(new MySqlParameter("mc_ui_column_type", mc_ui_column_type));
                            cmd.Parameters.Add(new MySqlParameter("mcgrantbydefault", true));
                            cmd.Parameters.Add(new MySqlParameter("mcordine", total_col_count));
                            cmd.Parameters.Add(new MySqlParameter("mccomputedformula", "''"));
                            cmd.Parameters.Add(new MySqlParameter("mciscomputed", true));

                            return cmd.ExecuteScalar().ToString();
                        }
                    }
                    else
                    {
                        return "";
                    }
                }
                else
                {
                    return null;
                }

            }
        }

        #endregion

        #region "PERMISSIONS"

        public static void authenticate(metaModelRaw.SysInfo infos, user user)
        {
            using (MySqlConnection connection = string.IsNullOrEmpty(infos.user_db_name) ? metaQueryMySql.GetOpenConnection(true) : metaQueryMySql.getSpecificConnection(infos.user_db_name))
            {
                Dapper.SqlMapper.FastExpando token = connection.Query(string.Format("SELECT token, ip FROM {0} WHERE {1} = '{2}' and ADDDATE(LastActivityDate, Interval " + ConfigHelper.GetSettingAsString("sessionTimeoutMinutes") + " MINUTE) > NOW()", infos.user_table_name, infos.user_id_column_name, user.user_id)).FirstOrDefault();

                if (token == null)
                    throw new AuthenticationException("Session expired!");

                string current_ip = HttpContext.Current.Request.UserHostAddress;
                string saved_token = token.data["token"].ToString();
                string saved_ip = token.data["ip"].ToString();

                if (saved_token != user.user_token || current_ip != saved_ip || string.IsNullOrEmpty(saved_token))
                {
                    connection.Execute(string.Format("UPDATE {0} SET {1}='', LastActivityDate=NOW() WHERE {2} = {3}", infos.user_table_name, "token", infos.user_id_column_name, user.user_id));
                    throw new AuthenticationException("Authentication exception!");
                }
                else
                {
                    connection.Execute(string.Format("UPDATE {0} SET LastActivityDate=NOW() WHERE {1} = {2}", infos.user_table_name, infos.user_id_column_name, user.user_id));
                }
            }
        }

        public static MySqlConnection getSpecificConnection(string db_name)
        {
            MySqlConnection connection;
            if (string.IsNullOrEmpty(db_name))
            {
                connection = GetOpenConnection(false);
            }
            else
            {
                connection = new MySqlConnection(ConfigHelper.GetSettingAsString("connection") + string.Format(";initial catalog={0}", db_name));
                connection.Open();
            }
            return connection;
        }

        private static string checkUserName(string user_name, string email, MySqlConnection connection)
        {
            if (user.getUserByName(user_name) != null)
            {
                return "-1";
            }

            if (user.getUserByEMail(email) != null)
            {
                return "-2";
            }

            string query = "select * from cms.register_requests where username=@username";
            MySqlCommand cmd = new MySqlCommand(query, connection);
            cmd.Parameters.Add(new MySqlParameter("username", user_name));
            MySqlDataAdapter adpt = new MySqlDataAdapter(cmd);
            DataTable dt = new DataTable();
            adpt.Fill(dt);

            if (dt.Rows.Count > 0)
                return "-1";

            query = "select * from cms.register_requests where email=@email";
            cmd = new MySqlCommand(query, connection);
            cmd.Parameters.Add(new MySqlParameter("email", email));
            adpt = new MySqlDataAdapter(cmd);
            dt = new DataTable();
            adpt.Fill(dt);

            if (dt.Rows.Count > 0)
                return "-2";

            return user_name;
        }

        public static void logOut(user user)
        {
            if (bool.Parse(ConfigHelper.GetSettingAsString("enableCookieAuthentication")))
            {
                using (metaRawModel context = new metaRawModel())
                {
                    SysInfo infos = context.GetSysInfos();
                    using (MySqlConnection connection = string.IsNullOrEmpty(infos.user_db_name) ? GetOpenConnection(true) : getSpecificConnection(infos.user_db_name))
                    {
                        connection.Execute(string.Format("UPDATE {0} SET {1}='', LastLogoutDate=getdate(), IsLoggedIn = 0 WHERE {2} = {3}", infos.user_table_name, "token", infos.user_id_column_name, user.user_id));

                        Global.loggedUser.TryRemove(user.username, out user);

                    }
                }
            }
            try
            {
                GetUserList(true);
            }
            catch (Exception ex)
            {
                throw new Exception(ex.Message);
            }

            if (HttpContext.Current != null)
            {
                if (HttpContext.Current.Request.Cookies["user"] != null)
                {
                    HttpContext.Current.Request.Cookies.Remove("userId");
                }
            }
        }

        public static void logOutForce()
        {
            user user = RawHelpers.getUserFromCookie();

            if (user != null)
            {
                string uid = user.user_id;

                if (uid != "0")
                {

                    DateTime? last1 = user.getLastUserActivityByID(uid);

                    System.Threading.Thread.Sleep(10000);

                    DateTime? last2 = user.getLastUserActivityByID(uid);

                    if (last1.HasValue && last2.HasValue && (last2.Value - last1.Value).TotalSeconds == 0)
                    {
                        user u = user.getUserByID(uid);
                        logOut(u);
                    }
                }
            }
        }

        public static rawPagedResult GetLoggedUsers()
        {
            using (MySqlConnection connection = GetOpenConnection(true))
            {
                string stored = "loggedUserList";
                var dbArgs = new DynamicParameters();
                dbArgs.Add("@sessiontimeout", ConfigHelper.GetSettingAsString("sessionTimeoutMinutes"));
                List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)connection.Query(stored, dbArgs, commandType: CommandType.StoredProcedure);

                return new rawPagedResult() { Agg = null, results = rows, TotalRecords = rows.Count };
            }

        }

        public static Int32 GetLoggedUserCount()
        {
            using (MySqlConnection connection = GetOpenConnection(true))
            {
                string stored = "loggedUserCount";
                var dbArgs = new DynamicParameters();
                dbArgs.Add("@sessiontimeout", ConfigHelper.GetSettingAsString("sessionTimeoutMinutes"));
                Int32 count = connection.Query<Int32>(stored, dbArgs, commandType: CommandType.StoredProcedure).FirstOrDefault();

                return count;
            }

        }

        public static user login(string user_name, string password, SysInfo infos)
        {
            using (MySqlConnection connection = string.IsNullOrEmpty(infos.user_db_name) ? GetOpenConnection(true) : getSpecificConnection(infos.user_db_name))
            {
                bool isPwdEncripted = bool.Parse(ConfigHelper.GetSettingAsString("IsPwdEncripted") ?? "false");
                string encriptionMethod = ConfigHelper.GetSettingAsString("encriptionMethod") ?? "SHA1";

                Dapper.SqlMapper.FastExpando user = ((List<Dapper.SqlMapper.FastExpando>)connection.Query(string.Format("SELECT id_utente, username, isAdmin, id_ruolo, userdescription, email, token, ip, language, LastActivityDate, {0} as pwd_hash FROM {1} WHERE {2} = '{3}' and coalesce(cancellato,0)=0", infos.password_column_name, infos.user_table_name, infos.username_column_name, EscapeValue(user_name)))).FirstOrDefault();

                if (user == null) return null;

                if (isPwdEncripted)
                {
                    string storedHash = ((IDictionary<string, object>)user)["pwd_hash"]?.ToString() ?? "";
                    if (!Global.verifyPassword(password, storedHash, encriptionMethod))
                        return null;
                    if (!Global.isPbkdf2Hash(storedHash))
                    {
                        string newHash = Global.pbkdf2Hash(password);
                        connection.Execute(string.Format("UPDATE {0} SET {1}='{2}' WHERE {3} = '{4}'", infos.user_table_name, infos.password_column_name, metaQueryMySql.EscapeValue(newHash), infos.username_column_name, metaQueryMySql.EscapeValue(user_name)));
                    }
                }
                else
                {
                    string storedPwd = ((IDictionary<string, object>)user)["pwd_hash"]?.ToString() ?? "";
                    if (storedPwd != password) return null;
                }

                user u = mapUserFields(infos, user);

                if (bool.Parse(ConfigHelper.GetSettingAsString("enableCookieAuthentication")))
                {
                    string iP = HttpContext.Current.Request.UserHostAddress;
                    string token = Guid.NewGuid().ToString();
                    connection.Execute(string.Format("UPDATE {0} SET {1}='{2}', ip = '{5}' WHERE {3} = {4}", infos.user_table_name, "token", token, infos.user_id_column_name, u.user_id, iP));
                    u.user_token = token;
                }

                connection.Execute(string.Format("UPDATE {0} SET LastLoginDate=NOW(), LastActivityDate=NOW(), IsLoggedIn = 1 WHERE {1} = {2}", infos.user_table_name, infos.user_id_column_name, u.user_id));

                Global.loggedUser.TryAdd(u.username, u);

                return u;
            }
        }

        public static user mapUserFields(SysInfo infos, SqlMapper.FastExpando user)
        {
            string userid = user.First(x => x.Key == infos.user_id_column_name).Value.ToString();

            string display = user.First(x => x.Key == infos.user_description_column_name).Value.ToString();
            bool isAdmin = RawHelpers.ParseBool(user.First(x => x.Key == infos.isAdmin_column_name).Value.ToString());
            string roleName = "";

            string role_id = user.First(x => x.Key == infos.role_id_column_name).Value.ToString();

            List<role> allRoles = getRoleList();

            role myRole = allRoles.FirstOrDefault(x => x.role_id == role_id);
            if (myRole != null)
                roleName = myRole.role_name;

            string uName = user.First(x => x.Key == infos.username_column_name).Value.ToString();
            List<role> roles = getMultipleRoleRoleByUserID(userid);

            var lastAct = user.First(x => x.Key == "LastActivityDate").Value;
            DateTime lastActivity = DateTime.MinValue;

            if (lastAct != null)
                DateTime.TryParse(lastAct.ToString(), out lastActivity);

            user u = new user()
            {
                display_name = display,
                isAdmin = isAdmin,
                role = roleName,
                otherRoles = roles,
                role_id = role_id,
                user_id = userid,
                username = uName,
                LastActivityDate = lastActivity,
                extra_keys = new SerializableDictionary<string, object>(),
                extra_client = new SerializableDictionary<string, object>()

            };

            if (user.data.ContainsKey("language") && user.data["language"] != null)
                u.language = user.data["language"].ToString();

            var extra_fields = user.data.Keys.Where(x => x != infos.password_column_name);

            foreach (string extra_field in extra_fields)
            {
                var user_param = user.data[extra_field];
                u.extra_keys.Add(extra_field, user_param != null ? user_param.ToString() : "");
            }

            KeyValuePair<string, object>? az_field = user.FirstOrDefault(x => x.Key == infos.azienda_id_column_name);
            if (az_field != null)
            {
                object id_azienda = az_field.Value.Value;

                if (id_azienda != null)
                {
                    u.azienda_id = int.Parse(id_azienda.ToString());
                }
            }

            return u;
        }

        private static role mapRoleFields(SysInfo infos, SqlMapper.FastExpando role)
        {
            return new role()
            {
                role_name = role.First(x => x.Key == infos.role_description_column_name).Value.ToString(),
                role_id = role.First(x => x.Key == infos.role_id_column_name).Value.ToString(),
            };
        }

        public static List<user> GetUserList(bool force = false)
        {
            using (metaRawModel context = new metaRawModel())
            {
                SysInfo infos = context.GetSysInfos();

                if (infos == null)
                    return null;

                List<user> userList = RawHelpers.getUsersFromSession();

                if (!force && userList != null)
                    return userList;

                using (MySqlConnection connection = string.IsNullOrEmpty(infos.user_db_name) ? GetOpenConnection(true) : getSpecificConnection(infos.user_db_name))
                {
                    List<user> users = new List<user>();
                    List<Dapper.SqlMapper.FastExpando> userss = (List<Dapper.SqlMapper.FastExpando>)connection.Query(string.Format("SELECT * FROM {0} ORDER BY {1}", infos.user_table_name, infos.username_column_name));
                    userss.ForEach((xx) =>
                    {
                        users.Add(mapUserFields(infos, xx));
                    });

                    RawHelpers.setUsersIntoSession(users);

                    return users;
                }
            }
        }

        public static List<role> getRoleList()
        {
            using (metaRawModel context = new metaRawModel())
            {
                SysInfo infos = context.GetSysInfos();

                if (infos == null)
                    return null;

                List<role> roleList = RawHelpers.getRolesFromSession();

                if (roleList != null)
                    return roleList;

                using (MySqlConnection connection = string.IsNullOrEmpty(infos.role_db_name) ? GetOpenConnection(true) : getSpecificConnection(infos.role_db_name))
                {
                    List<role> roles = new List<role>();
                    List<Dapper.SqlMapper.FastExpando> roless = (List<Dapper.SqlMapper.FastExpando>)connection.Query(string.Format("SELECT * FROM {0} ORDER BY {1}", infos.role_table_name, infos.role_description_column_name));
                    roless.ForEach((xx) =>
                    {
                        roles.Add(mapRoleFields(infos, xx));
                    });

                    RawHelpers.setRolesIntoSession(roles);

                    return roles;
                }
            }
        }

        public static rawPagedResult getAziendeList()
        {
            using (metaRawModel context = new metaRawModel())
            {
                SysInfo infos = context.GetSysInfos();


                using (MySqlConnection connection = GetOpenConnection(true))
                {
                    List<Dapper.SqlMapper.FastExpando> azs = (List<Dapper.SqlMapper.FastExpando>)connection.Query(string.Format("SELECT * FROM {0} ORDER BY {1}", "aziende", "nome_azienda"));

                    return new rawPagedResult() { results = azs, TotalRecords = azs.Count, Agg = null };
                }
            }
        }

        public static role GetRoleByUserID(string user_id)
        {
            using (metaRawModel context = new metaRawModel())
            {
                SysInfo infos = context.GetSysInfos();

                if (infos == null)
                    return null;

                List<role> roleList = getRoleList();

                user u = getUserByID(user_id);

                if (u != null)
                {
                    return roleList.FirstOrDefault(x => x.role_id == u.role_id);
                }
                else
                    return null;
            }
        }

        public static List<role> getMultipleRoleRoleByUserID(string user_id)
        {
            using (metaRawModel context = new metaRawModel())
            {
                SysInfo infos = context.GetSysInfos();

                if (infos == null)
                    return null;


                Dictionary<string, List<role>> userRoleList = RawHelpers.getUserRoleFromSession();

                if (userRoleList != null)
                {
                    if (userRoleList.ContainsKey(user_id))
                        return userRoleList[user_id];
                    else
                        return new List<role>();
                }

                userRoleList = new Dictionary<string, List<role>>();

                using (MySqlConnection connection = string.IsNullOrEmpty(infos.role_db_name) ? GetOpenConnection(true) : getSpecificConnection(infos.role_db_name))
                {
                    var dbArgs = new DynamicParameters();
                    dbArgs.Add("@uid", user_id);

                    string query = string.Format("SELECT {0}.{1}, {0}.{2} FROM {0} inner join utenti_ruoli on utenti_ruoli.{1} = {0}.{1} inner join utenti on utenti_ruoli.{6} = {4}.{6} WHERE {4}.{3}=@uid", infos.role_table_name, infos.role_id_column_name, infos.role_description_column_name, infos.user_id_column_name, infos.user_table_name, infos.role_user_table_fk_name, infos.user_id_column_name);

                    List<Dapper.SqlMapper.FastExpando> roles = ((List<Dapper.SqlMapper.FastExpando>)connection.Query(query, dbArgs));

                    roles.ForEach(ur =>
                    {
                        string key = ur.data[infos.user_id_column_name].ToString();
                        if (!userRoleList.ContainsKey(key))
                            userRoleList.Add(key, new List<role>());

                        userRoleList[key].Add(mapRoleFields(infos, ur));

                    });

                    RawHelpers.setUserRoleIntoSession(userRoleList);

                    if (userRoleList != null && userRoleList.ContainsKey(user_id))
                        return userRoleList[user_id];
                    else
                        return new List<role>();
                }
            }
        }

        public static user getUserByID(string user_id)
        {
            using (metaRawModel context = new metaRawModel())
            {
                SysInfo infos = context.GetSysInfos();

                if (infos == null)
                    return null;

                List<user> userList = GetUserList();

                return userList.FirstOrDefault(x => x.user_id == user_id);

            }
        }

        public static user GetUserByEMail(string email)
        {
            using (metaRawModel context = new metaRawModel())
            {
                SysInfo infos = context.GetSysInfos();

                if (infos == null)
                    return null;

                List<user> userList = GetUserList();

                return userList.FirstOrDefault(x => x.GetType().GetProperty(infos.email_column_name).GetValue(x, null).ToString() == email);

            }
        }


        public static user GetUserByName(string user_name)
        {
            using (metaRawModel context = new metaRawModel())
            {
                SysInfo infos = context.GetSysInfos();

                if (infos == null)
                    return null;

                List<user> userList = GetUserList();

                return userList.FirstOrDefault(x => x.GetType().GetProperty(infos.username_column_name).GetValue(x, null).ToString() == user_name);
            }
        }

        public static DateTime? getLastUserActivityByID(string user_id)
        {
            using (metaRawModel context = new metaRawModel())
            {
                return context.GetLastActivityDateByUserId(user_id);
            }
        }

        #endregion

        #region "FLAT"

        public static List<Dictionary<string, object>> convertDataReaderToDictionaryList(MySqlDataReader dr)
        {
            List<Dictionary<string, object>> rows = new List<Dictionary<string, object>>();

            while (dr.Read())
            {
                Dictionary<string, object> row = new Dictionary<string, object>();
                for (int i = 0; i < dr.FieldCount; i++)
                {
                    string colName = dr.GetName(i);

                    if (row.ContainsKey(colName))
                    {
                        throw new Exception("Chiave {0} già aggiunta. Verificare che la query non torni campi con lo stesso alias.");
                    }

                    row.Add(colName, dr[i] ?? "");

                }
                rows.Add(row);
            }
            return rows;
        }

        private static List<Dictionary<string, object>> GetDictionaryListValue(Dictionary<string, object> source, string key)
        {
            if (source == null || string.IsNullOrEmpty(key) || !source.TryGetValue(key, out object raw) || raw == null)
                return null;

            if (raw is List<Dictionary<string, object>> typed)
                return typed;

            if (raw is System.Collections.Generic.IEnumerable<Dictionary<string, object>> typedEnumerable)
                return typedEnumerable.ToList();

            if (raw is System.Collections.IEnumerable enumerable && !(raw is string))
            {
                List<Dictionary<string, object>> result = new List<Dictionary<string, object>>();
                foreach (object item in enumerable)
                {
                    Dictionary<string, object> normalized = NormalizeToDictionary(item);
                    if (normalized != null)
                        result.Add(normalized);
                }

                return result;
            }

            return null;
        }

        private static Dictionary<string, object> NormalizeToDictionary(object item)
        {
            if (item == null)
                return null;

            if (item is Dictionary<string, object> dict)
                return dict;

            if (item is System.Collections.Generic.IDictionary<string, object> genericDict)
                return new Dictionary<string, object>(genericDict);

            if (item is System.Collections.IDictionary legacyDict)
            {
                Dictionary<string, object> converted = new Dictionary<string, object>();
                foreach (System.Collections.DictionaryEntry entry in legacyDict)
                {
                    string entryKey = entry.Key?.ToString() ?? string.Empty;
                    converted[entryKey] = entry.Value;
                }

                return converted;
            }

            return null;
        }

        public static string EscapeDBObjectName(string obj)
        {
            return string.Format("`{0}`", obj);
        }

        private static string GetUnqualifiedTableNameForMySql(string tableName)
        {
            string value = RawHelpers.ParseNull(tableName).Trim();
            if (string.IsNullOrEmpty(value))
                return value;

            value = value.Replace("[", "").Replace("]", "").Replace("`", "");
            string[] parts = value.Split(new[] { '.' }, StringSplitOptions.RemoveEmptyEntries);
            return parts.Length == 0 ? value : parts[parts.Length - 1].Trim();
        }

        private static string GetTableName(_Metadati_Tabelle tab)
        {
            string tablename = "";

            if (!string.IsNullOrEmpty(tab.md_db_name))
                tablename = RawHelpers.escapeDBObjectName(tab.md_db_name, "mysql") + ".";
            else if (tab.is_system_route)
            {
                string cs = ConfigurationManager.ConnectionStrings["MetaDataSQLConnection"].ConnectionString;
                var csb = new MySqlConnectionStringBuilder(cs);
                string metadataDbName = csb.Database;
                tablename = RawHelpers.escapeDBObjectName(metadataDbName, "mysql") + ".";
            }

            if (!string.IsNullOrEmpty(tab.md_schema_name))
                tablename += RawHelpers.escapeDBObjectName(tab.md_schema_name, "mysql") + ".";
            else if (!string.IsNullOrEmpty(tab.md_db_name))
                tablename += "";

            tablename += RawHelpers.escapeDBObjectName(tab.md_nome_tabella, "mysql");

            return tablename;
        }

        public static string getTableFullName(_Metadati_Tabelle tab)
        {
            string table_name = tab.md_nome_tabella;
            string safetable_name = (string.IsNullOrEmpty(tab.md_db_name) ? "" : "`" + tab.md_db_name + "`.") + (!string.IsNullOrEmpty(tab.md_schema_name) ? "`" + tab.md_schema_name + "`." : ".") + EscapeDBObjectName(table_name);
            if (string.IsNullOrEmpty(tab.md_db_name))
            {
                if (string.IsNullOrEmpty(tab.md_schema_name))
                {
                    safetable_name = EscapeDBObjectName(table_name);
                }
                else
                {
                    safetable_name = "`" + tab.md_schema_name + "`." + EscapeDBObjectName(table_name);
                }
            }
            else
            {
                safetable_name = "`" + tab.md_db_name + "`." + EscapeDBObjectName(table_name);
            }
            return safetable_name;
        }

        public static object EscapeValue(object valore)
        {
            if (valore == null)
                return valore;
            return valore.ToString().Replace("'", "''").Replace("\\", "\\\\");
        }

        private static object EscapeValueStrict(object valore)
        {
            if (valore == null)
                return valore;
            return Regex.Replace(valore.ToString().Replace("'", "''").Replace("(", "").Replace(")", "").Replace("\\", "\\\\"), @"\s", "");
        }

        public static string readCustomSettings(string user_id, string key)
        {
            if (user_id != null)
            {
                user u = user.getUserByID(user_id);

                using (MySqlConnection connection = metaQueryMySql.GetOpenConnection(true))
                {
                    using (MySqlCommand cmd = new MySqlCommand("select coalesce(customSettings, '') from utenti where id_utente=@id_utente ", connection))
                    {
                        cmd.Parameters.AddWithValue("id_utente", user_id);
                        string settings = RawHelpers.ParseNull(cmd.ExecuteScalar());

                        if (string.IsNullOrEmpty(key))
                        {
                            if (!u.isAdmin)
                            {
                                using (StringReader sr = new StringReader(settings))
                                {
                                    using (JsonTextReader reader = new JsonTextReader(sr))
                                    {
                                        JsonSerializer serializer = new JsonSerializer();
                                        Expando data = serializer.Deserialize<Expando>(reader);

                                        dynamic dynData = data;

                                        cmd.CommandText = "select coalesce(customSettings, '') from utenti where id_utente=@id_utente";
                                        cmd.Parameters.Clear();
                                        cmd.Parameters.AddWithValue("id_utente", "99999");

                                        string adminSettings = RawHelpers.ParseNull(cmd.ExecuteScalar());

                                        if (string.IsNullOrEmpty(settings))
                                        {
                                            settings = adminSettings;
                                        }
                                        else
                                        {
                                            if (!string.IsNullOrEmpty(adminSettings))
                                            {
                                                using (StringReader sra = new StringReader(adminSettings))
                                                {
                                                    using (JsonTextReader readera = new JsonTextReader(sra))
                                                    {
                                                        JsonSerializer serializera = new JsonSerializer();
                                                        Expando adminData = serializera.Deserialize<Expando>(readera);

                                                        foreach (KeyValuePair<string, object> prop in adminData.GetProperties())
                                                        {
                                                            if (!data.Contains(prop))
                                                            {
                                                                dynData[prop.Key] = prop.Value;
                                                            }
                                                        }

                                                        StringWriter sw = new StringWriter();
                                                        JsonTextWriter jtr = new JsonTextWriter(sw);
                                                        serializera.Serialize(jtr, data);
                                                        settings = sw.ToString();
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            return settings;
                        }
                        else
                        {
                            Dictionary<string, object> dict = JsonConvert.DeserializeObject<Dictionary<string, object>>(settings);

                            if (dict != null && dict.ContainsKey(key))
                            {
                                string requestedSetting = dict[key].ToString();

                                return requestedSetting;
                            }
                            else
                                return null;
                        }
                    }
                }
            }
            else
                return null;
        }

        public static void clearCustomSettings(string key)
        {
            user u = user.getUserByID(RawHelpers.authenticate());

            using (MySqlConnection connection = metaQueryMySql.GetOpenConnection(true))
            {
                using (metaModelRaw.metaRawModel context = new metaModelRaw.metaRawModel())
                {
                    string completeSettings = readCustomSettings(u.user_id, "");

                    if (string.IsNullOrEmpty(completeSettings))
                        completeSettings = "{}";

                    var deserializedSettings = JsonConvert.DeserializeObject(completeSettings);

                    Dictionary<string, object> dict = JsonConvert.DeserializeObject<Dictionary<string, object>>(completeSettings);

                    if (dict.ContainsKey(key))
                    {
                        dict[key] = null;
                        completeSettings = JsonConvert.SerializeObject(dict);

                        connection.Execute("update utenti set customSettings=@customSettings where id_utente=@id_utente", new { customSettings = completeSettings, id_utente = u.user_id }).ToString();
                    }

                }
            }
        }

        public static string saveCustomSettings(string user_id, string settings, string key)
        {
            user u = user.getUserByID(user_id);

            using (MySqlConnection connection = metaQueryMySql.GetOpenConnection(true))
            {
                try
                {
                    using (metaModelRaw.metaRawModel context = new metaModelRaw.metaRawModel())
                    {
                        string completeSettings = readCustomSettings(user_id, "");

                        if (string.IsNullOrEmpty(completeSettings))
                            completeSettings = "{}";

                        var deserializedSettings = JsonConvert.DeserializeObject(settings);

                        Dictionary<string, object> dict = JsonConvert.DeserializeObject<Dictionary<string, object>>(completeSettings);

                        if (dict.ContainsKey(key))
                        {
                            dict[key] = deserializedSettings;
                        }
                        else
                        {
                            dict.Add(key, deserializedSettings);
                        }

                        completeSettings = JsonConvert.SerializeObject(dict);

                        return connection.Execute("update utenti set customSettings=@customSettings where id_utente=@id_utente", new { customSettings = completeSettings, id_utente = user_id }).ToString();

                        #region ignore metadata








                        //                        //else






                        #endregion

                    }

                }
                catch (Exception ex)
                {
                    return ex.Message;
                }
            }
        }

        public static string ExportFlatRecordData(List<SerializableDictionary<string, object>> dati, List<SerializableDictionary<string, object>> lst, string route, string uid, string progressGuid, string excelTheme = null, string excelThemeMode = null)
        {
            using (metaRawModel context = new metaRawModel())
            {
                List<_Metadati_Colonne> mcs = context.GetMetadati_Colonnes(null, null, route);
                StringBuilder sb = new StringBuilder();
                string file = RawHelpers.ExportToExcel2(mcs, dati, route, route, uid, progressGuid, excelTheme, excelThemeMode);

                return file;
            }
        }

        public static object ExportToExcel(string model, string data, string title, string route, string progressGuid)
        {
            using (System.IO.MemoryStream stream = new System.IO.MemoryStream())
            {
                Regex LeadingInteger = new Regex(@"^(-?\d+)");

                var spreadsheet = SpreadsheetDocument
                    .Create(stream, SpreadsheetDocumentType.Workbook);

                var workbookpart = spreadsheet.AddWorkbookPart();
                workbookpart.Workbook = new Workbook();
                var worksheetPart = workbookpart.AddNewPart<WorksheetPart>();
                var sheetData = new SheetData();

                Worksheet worksheet = new Worksheet(sheetData);
                worksheetPart.Worksheet = worksheet;

                var sheets = spreadsheet.WorkbookPart.Workbook.
                    AppendChild<Sheets>(new Sheets());

                var sheet = new Sheet()
                {
                    Id = spreadsheet.WorkbookPart
                        .GetIdOfPart(worksheetPart),
                    SheetId = 1,
                    Name = title
                };
                sheets.AppendChild(sheet);

                string path = RawHelpers.InvokeUtilityHook("getCustomerProjectPath").ToString();

                Excel.AddPredefinedStyles(spreadsheet, File.ReadAllText(System.IO.Path.Combine(path, "Style/PredefinedStyles.xml")));

                var modelObject = JsonConvert.DeserializeObject<dynamic>(model);
                var dataObject = JsonConvert.DeserializeObject<dynamic>(data);

                for (int mdx = 0; mdx < modelObject.Count; mdx++)
                {
                    Excel.SetColumnHeadingValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1),
                        (modelObject[mdx].title == null || modelObject[mdx].title == "&nbsp;")
                            ? modelObject[mdx].field.ToString()
                            : modelObject[mdx].title.ToString(),
                        false, false);

                    Excel.SetColumnWidth(worksheet, mdx + 1, modelObject[mdx].width != null
                        ? int.Parse(LeadingInteger.Match(modelObject[mdx].width.ToString()).Value) / 4
                        : 25);
                }

                for (int idx = 0; idx < dataObject.Count; idx++)
                {
                    for (int mdx = 0; mdx < modelObject.Count; mdx++)
                    {
                        var fieldName = modelObject[mdx].field.ToString();
                        dynamic metadata = modelObject[mdx];
                        string type = metadata.type;
                        var metaInfo = metadata.metaInfo;

                        var objVal = dataObject[idx][fieldName];

                        if (objVal != null && objVal.GetType() == typeof(JArray))
                        {
                            if ((bool)RawHelpers.InvokeUtilityHook("customizeExcelField", new object[] { fieldName, route, type, metaInfo, spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), objVal }))
                            {
                            }
                            else
                            {
                                _Metadati_Colonne_Grid gridCol = JsonConvert.DeserializeObject<_Metadati_Colonne_Grid>(metaInfo.ToString());

                                string display = "";
                                dynamic values = JsonConvert.DeserializeObject(objVal.ToString());

                                if (!string.IsNullOrEmpty(gridCol.mc_ui_grid_display_field))
                                {
                                    foreach (JObject value in values)
                                    {
                                        string valo = value[gridCol.mc_ui_grid_display_field].ToString();
                                        bool selected = value["___selected"].ToObject<bool>();

                                        if (selected)
                                            display += (string.IsNullOrEmpty(display) ? "" : ", ") + valo;
                                    }
                                }
                                else
                                {
                                    foreach (JObject value in values)
                                    {
                                        foreach (var x in value)
                                        {
                                            display += (string.IsNullOrEmpty(display) ? "" : ", ") + string.Format("{0}: {1}", x.Key, x.Value);
                                        }
                                    }
                                }

                                Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2),
                                    RawHelpers.ParseNull(display), false, false);
                            }
                        }
                        else
                        {
                            JValue val = dataObject[idx][fieldName] as JValue;

                            if (val != null)
                            {
                                uint styleIndex = 0;

                                if ((bool)RawHelpers.InvokeUtilityHook("customizeExcelField", new object[] { fieldName, route, type, metaInfo, spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), (val != null) ? val.Value : null }))
                                {
                                }
                                else
                                {
                                    if (type == "number")
                                    {
                                        styleIndex = 2;

                                        _Metadati_Colonne_Slider numCol = metaInfo as _Metadati_Colonne_Slider;
                                        if (numCol != null)
                                        {
                                            short? decimals = numCol.mc_ui_slider_decimals;

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
                                        }

                                        Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2),
                                            Convert.ToDouble(val.Value), styleIndex, false);
                                    }
                                    else if (type == "date")
                                    {
                                        string col_type = metadata.metaInfo.mc_ui_column_type;

                                        string parsed = val.Value.ToString().Replace(@"""", "");
                                        DateTime d = DateTime.Parse(parsed).ToLocalTime();

                                        if (col_type == "datetime")
                                            Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), d, 18, false);
                                        else
                                            Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), d, 17, false);
                                    }
                                    else if (type == "boolean")
                                    {
                                        if (RawHelpers.ParseNull(val.Value) == string.Empty)
                                        {
                                            Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), "", false, false);
                                        }
                                        else if (Convert.ToBoolean(val.Value))
                                        {
                                            Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), "SI", false, false);
                                        }
                                        else
                                        {
                                            Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), "NO", false, false);
                                        }
                                    }
                                    else if (type == "number_boolean")
                                    {
                                        if (RawHelpers.ParseNull(val.Value) == string.Empty)
                                        {
                                            Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), "", false, false);
                                        }
                                        else if (Convert.ToInt32(val.Value) == 1)
                                        {
                                            Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), "SI", false, false);
                                        }
                                        else if (Convert.ToInt32(val.Value) == 0)
                                        {
                                            Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2), "NO", false, false);
                                        }
                                    }
                                    else if (type == "lookupByID")
                                    {
                                        _Metadati_Colonne_Lookup col = metadata as _Metadati_Colonne_Lookup;
                                        val = (JValue)dataObject[idx][col.mc_ui_lookup_entity_name.Replace(" ", "_") + "___" + col.mc_ui_lookup_dataTextField + "__" + col.mc_nome_colonna];
                                        Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2),
                                            RawHelpers.ParseNull(val.Value), false, false);
                                    }
                                    else if (type == "dictionary" || type == "dictionary_radio")
                                    {
                                        Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2),
                                            RawHelpers.GetDictionaryText(RawHelpers.ParseNull(val), metadata), false, false);
                                    }
                                    else
                                    {
                                        Excel.SetCellValue(spreadsheet, worksheet, Convert.ToUInt32(mdx + 1), Convert.ToUInt32(idx + 2),
                                            RawHelpers.ParseNull(val.Value), false, false);
                                    }
                                }
                            }
                        }
                    }

                    decimal progress = Math.Round(((decimal)100 * (decimal)idx) / (decimal)dataObject.Count, 2);
                    metaQueryMySql.saveProgress(progressGuid, progress);
                }

                spreadsheet.WorkbookPart.Workbook.Save();
                spreadsheet.Dispose();

                string exportPath = System.IO.Path.Combine(path, "Tmp_export");
                string filename = RawHelpers.SanitizeFileName(title + "_" + RawHelpers.getAnsiTimeStamp() + ".xlsx");
                string exportFullName = System.IO.Path.Combine(exportPath, filename);
                byte[] file = stream.ToArray();
                System.IO.File.WriteAllBytes(exportFullName, file);

                return new { success = true, url = "Tmp_export/" + filename };
            }
        }

        public static string ExportPdfFlatRecordData(string report_route, string report_name, string report_filters, string report_parameters, string report_language)
        {
            return RawHelpers.ExportToPdf(report_route, report_name, report_filters, report_parameters, report_language);
        }

        public static bool GetIsUniqueValue(int column_id, string text, string user_id)
        {
            using (metaRawModel context = new metaRawModel())
            {

                _Metadati_Tabelle tabel = context.GetMetadati_TabellaByColID(column_id);
                if (tabel != null)
                {
                    string route_name = tabel.md_route_name;
                    string table_name = tabel.md_nome_tabella;

                    bool isMeta = RawHelpers.checkIsMetaData(route_name);

                    using (DbConnection connection = GetOpenConnection(isMeta, tabel.md_conn_name))
                    {
                        _Metadati_Colonne col = tabel._Metadati_Colonnes.FirstOrDefault(x => x.mc_id == column_id);

                        string column_name = col.mc_nome_colonna;

                        if (col.mc_db_column_type == "text" || col.mc_db_column_type == "xml")
                            return true;

                        string query;
                        long ouut;
                        List<AggregationResult> nullo;
                        FilterInfos finfos = new FilterInfos();
                        finfos.filters = new List<filterElement>();
                        finfos.filters.Add(new filterElement() { field = column_name, operatore = "eq", value = text });

                        query = BuildDynamicSelectQuery(tabel._Metadati_Colonnes.ToList(), null, null, new PageInfo() { currentPage = 0, pageSize = 1 }, finfos, "AND", true, (MySqlConnection)connection, out ouut, null, out nullo, user_id, "", 0, column_name);

                        try
                        {
                            List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)connection.Query(query, commandTimeout: int.Parse(ConfigHelper.GetSettingAsString("autoGeneratedQueryTimeout")));
                            return rows.Count == 0;
                        }
                        catch (MySqlException ex1)
                        {
                            if (ex1.Number != 421)
                                throw new Exception(ex1.Message + "****EXECUTED QUERY:****" + query);
                            else
                            {
                                return false;
                            }
                        }
                        catch (Exception EX)
                        {
                            throw new Exception(EX.Message + "****EXECUTED QUERY:****" + query);
                        }

                    }
                }
                else
                    throw new Exception("Table not found!");

            }
        }

        public static rawPagedResult GetDistinctValues(int column_id, string text, string filter_type, int max_results, string user_id)
        {
            using (metaRawModel context = new metaRawModel())
            {

                _Metadati_Tabelle tabel = context.GetMetadati_TabellaByColID(column_id);
                if (tabel != null)
                {
                    string route_name = tabel.md_route_name;
                    string table_name = tabel.md_nome_tabella;

                    bool isMeta = RawHelpers.checkIsMetaData(route_name);

                    using (DbConnection connection = GetOpenConnection(isMeta, tabel.md_conn_name))
                    {
                        _Metadati_Colonne col = tabel._Metadati_Colonnes.FirstOrDefault(x => x.mc_id == column_id);

                        string column_name = col.mc_nome_colonna;

                        if (col.mc_db_column_type == "text" || col.mc_db_column_type == "xml")
                            return new rawPagedResult() { results = new List<Dapper.SqlMapper.FastExpando>(), TotalRecords = 0, Agg = null };

                        string query;
                        long ouut;
                        List<AggregationResult> nullo;
                        FilterInfos finfos = new FilterInfos();
                        finfos.filters = new List<filterElement>();
                        finfos.filters.Add(new filterElement() { field = column_name, operatore = filter_type, value = text });

                        query = BuildDynamicSelectQuery(tabel._Metadati_Colonnes.ToList(), null, null, new PageInfo() { currentPage = 0, pageSize = max_results }, finfos, "AND", true, (MySqlConnection)connection, out ouut, null, out nullo, user_id, "", 0, column_name);

                        try
                        {
                            List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)connection.Query(query);
                            return new rawPagedResult() { results = rows, TotalRecords = rows.Count, Agg = null };
                        }
                        catch (MySqlException ex1)
                        {
                            if (ex1.Number != 421)
                                throw new Exception(ex1.Message + "****EXECUTED QUERY:****" + query);
                            else
                            {
                                return new rawPagedResult() { results = new List<Dapper.SqlMapper.FastExpando>(), TotalRecords = 0, Agg = null };
                            }
                        }
                        catch (Exception EX)
                        {
                            throw new Exception(EX.Message + "****EXECUTED QUERY:****" + query);
                        }

                    }
                }
                else
                    return new rawPagedResult() { results = new List<Dapper.SqlMapper.FastExpando>(), TotalRecords = 0, Agg = null };

            }
        }

        public static rawPagedResult GetFlatData(string user_id, string route, int lookup_table_id = 0, List<SortInfo> SortInfo = null, List<GroupInfo> GroupInfo = null, PageInfo PageInfo = null, FilterInfos filterInfo = null, string logicOperator = "AND", bool has_server_operation = true, List<AggregationInfo> aggregates = null, List<string> columnRestrictionLists = null, string formula_lookup = "", int mc_id = 0, bool skipNested = false, string extraFields = "", SerializableDictionary<string, object> currentRecord = null)
        {
            string parentRoute = "";

            string[] composedRoute = route.Split('|');

            route = composedRoute[0];

            if (composedRoute.Length > 1)
                parentRoute = composedRoute[1];

            List<_Metadati_Colonne> lst = _Metadati_Colonne.getColonneByUserID(route, lookup_table_id, user_id, dataMode.view, columnRestrictionLists);

            if (!string.IsNullOrEmpty(formula_lookup))
            {
                List<_Metadati_Colonne> redux = new List<_Metadati_Colonne>();

                redux.AddRange(lst.Where(x => x.mc_is_primary_key || !string.IsNullOrEmpty(x.mc_custom_join)).ToList());

                _Metadati_Colonne otherCol = lst.FirstOrDefault(x => x.mc_is_primary_key is not true);

                if (otherCol != null)
                    redux.Add(new _Metadati_Colonne() { mc_nome_colonna = otherCol.mc_nome_colonna, _Metadati_Tabelle = lst.First()._Metadati_Tabelle, mc_computed_formula = formula_lookup, mc_ui_column_type = "text", mc_is_computed = true, mc_grant_by_default = true });

                lst = redux;
            }

            if (lst.Count > 0)
            {
                string query = "";
                long totalRecords;
                List<AggregationResult> aggregateValues;
                _Metadati_Tabelle tab = lst.First()._Metadati_Tabelle;

                using (MySqlConnection connection = GetOpenConnection(RawHelpers.checkIsMetaData(route), tab.md_conn_name))
                {
                    try
                    {
                        var watch = Stopwatch.StartNew();

                        query = BuildDynamicSelectQuery(lst, SortInfo, GroupInfo, PageInfo, filterInfo, logicOperator, has_server_operation, connection, out totalRecords, aggregates, out aggregateValues, user_id, formula_lookup, mc_id, null, false, extraFields, parentRoute, currentRecord);

                        List<Dapper.SqlMapper.FastExpando> rows = null;

                        double cacheDataMinutes = RawHelpers.ParseDouble(ConfigHelper.GetSettingAsString("cacheDataMinutes") ?? "0");

                        if (cacheDataMinutes == -1 || cacheDataMinutes > 0)
                        {
                            rows = RawHelpers.getCachedDataFromSession(route, query, cacheDataMinutes);
                        }

                        if (rows == null)
                        {
                            rows = (List<Dapper.SqlMapper.FastExpando>)connection.Query(query, commandTimeout: int.Parse(ConfigHelper.GetSettingAsString("autoGeneratedQueryTimeout")));

                            if (totalRecords == 0)
                                totalRecords = rows.Count;

                            RawHelpers.setCachedDataIntoSession(route, query, rows, totalRecords);
                        }

                        watch.Stop();
                        RawHelpers.traceQuery("GetFlatData", query, watch.ElapsedMilliseconds, route);

                        if (totalRecords == 0)
                            totalRecords = rows.Count;

                        if (!skipNested)
                            ParseGridColumns(lst, user_id, rows);

                        if (!tab.md_server_side_operations && aggregates != null)
                        {
                            foreach (AggregationInfo agg in aggregates)
                            {
                                foreach (string ag in agg.aggregate.Split(','))
                                {
                                    Decimal tot = 0;
                                    decimal count = 0;
                                    Decimal maxVal = Decimal.MinValue;
                                    Decimal minVal = Decimal.MaxValue;

                                    foreach (Dapper.SqlMapper.FastExpando row in rows)
                                    {
                                        Decimal val = 0;
                                        Decimal.TryParse(RawHelpers.ParseNull(row.data[agg.field]).Replace(".", ","), out val);

                                        if (val != 0)
                                            tot += val;

                                        count++;

                                        if (val > maxVal)
                                            maxVal = val;

                                        if (val < minVal)
                                            minVal = val;
                                    }

                                    if (agg.aggregate == "sum")
                                        aggregateValues.Add(new AggregationResult() { field = agg.field, aggregateValue = tot, aggregation = ag });
                                    else if (agg.aggregate == "count")
                                        aggregateValues.Add(new AggregationResult() { field = agg.field, aggregateValue = count, aggregation = ag });
                                    else if (agg.aggregate == "avg")
                                        aggregateValues.Add(new AggregationResult() { field = agg.field, aggregateValue = (tot / count), aggregation = ag });
                                    else if (agg.aggregate == "min")
                                        aggregateValues.Add(new AggregationResult() { field = agg.field, aggregateValue = minVal, aggregation = ag });
                                    else if (agg.aggregate == "max")
                                        aggregateValues.Add(new AggregationResult() { field = agg.field, aggregateValue = maxVal, aggregation = ag });

                                }

                            }
                        }

                        return new rawPagedResult() { results = rows, TotalRecords = totalRecords, Agg = aggregateValues, TotalGroups = (GroupInfo != null && GroupInfo.Count > 0 ? GroupInfo[0].groupCount : 0) };

                    }
                    catch (Exception ex)
                    {
                        Exception customEx = Utility.customizeException("GetFlatData", ex, user.getUserByID(user_id), route, query, null);
                        RawHelpers.logError(customEx, "getFlatData", query);
                        throw customEx;
                    }
                }
            }
            else
            {
                return null;
            }
        }

        public static rawPagedResult getFlatRecordDistinctComboData(string user_id, string route, string ownerRoute, List<SortInfo> SortInfo, List<GroupInfo> GroupInfo, PageInfo PageInfo, FilterInfos filterInfo, string logicOperator, bool has_server_operation, List<string> columnRestrictionList, string formula_lookup, int mc_id)
        {
            using (metaRawModel context = new metaRawModel())
            {
                _Metadati_Tabelle ownerTable = context.GetMetadati_Tabelles(ownerRoute).FirstOrDefault();
                _Metadati_Colonne_Lookup col = context.GetMetadati_Colonnes(mc_id.ToString(), "", ownerRoute).FirstOrDefault() as _Metadati_Colonne_Lookup;

                if (col != null)
                {
                    string lookupAlias = RawHelpers.getLookupAlias(col, RawHelpers.getDBMS(ownerRoute), false);

                    filterElement fi = filterInfo.filters.FirstOrDefault(x => x.field == col.mc_ui_lookup_dataTextField);

                    if (fi != null)
                        filterInfo.filters = filterInfo.filters.Where(x => x.field != fi.field).ToList();

                    rawPagedResult res = GetFlatData(user_id, ownerRoute, 0, null, GroupInfo, new PageInfo() { currentPage = 1, pageSize = 0 }, filterInfo, logicOperator, has_server_operation, null, null, "", 0, false);

                    rawPagedResult cmbRes = new rawPagedResult();
                    cmbRes.results = new List<Dictionary<string, object>>();

                    List<Dapper.SqlMapper.FastExpando> results = res.results.OfType<Dapper.SqlMapper.FastExpando>().Where(z => z.data[lookupAlias] != null).GroupBy(x => x.data[col.mc_nome_colonna].ToString()).Select(x => x.First()).ToList().OrderBy(z => z.data[lookupAlias].ToString()).ToList();

                    foreach (Dapper.SqlMapper.FastExpando x in results)
                    {
                        if (fi != null && !string.IsNullOrEmpty(fi.value))
                        {
                            if (fi != null && fi.operatore == "startswith")
                            {
                                if (!x.data[lookupAlias].ToString().ToLower().StartsWith(fi.value.ToLower()))
                                    continue;
                            }
                            else if (fi != null && fi.operatore == "contains")
                            {
                                if (!x.data[lookupAlias].ToString().ToLower().Contains(fi.value.ToLower()))
                                    continue;
                            }
                            else if (fi != null && fi.operatore == "endswith")
                            {
                                if (!x.data[lookupAlias].ToString().ToLower().EndsWith(fi.value.ToLower()))
                                    continue;
                            }
                        }
                        Dictionary<string, object> cmbItem = new Dictionary<string, object>();

                        object idValue = x.data[col.mc_nome_colonna];

                        if (idValue != null && !cmbRes.results.OfType<Dictionary<string, object>>().Any(y => y[col.mc_ui_lookup_dataValueField].ToString() == idValue.ToString()))
                        {
                            cmbItem.Add(col.mc_ui_lookup_dataValueField, x.data[col.mc_nome_colonna]);
                            cmbItem.Add(col.mc_ui_lookup_dataTextField, x.data[lookupAlias]);
                            cmbRes.results.Add(cmbItem);
                        }

                        if (cmbRes.results.Count == PageInfo.pageSize)
                            break;

                    }
                    ;

                    cmbRes.TotalRecords = cmbRes.results.Count;
                    return cmbRes;

                }
            }

            return null;
        }

        public static string GetValueFromStored(string user_id, string stored, List<filterElement> parameters)
        {
            using (metaRawModel context = new metaRawModel())
            {
                _Metadati_Tabelle metaStored = context.GetMetadati_Tabelles(stored).FirstOrDefault();

                if (metaStored != null)
                {

                    using (MySqlConnection connection = metaQueryMySql.GetOpenConnection(false, metaStored.md_conn_name))
                    {
                        stored = RawHelpers.getStorePrefix(metaStored, "mysql") + RawHelpers.getDBEntityQuoteSymbol("mysql") + metaStored.md_nome_tabella + RawHelpers.getDBEntityQuoteSymbol("mysql", false);

                        MySqlCommand cmd = new MySqlCommand(stored, connection);

                        foreach (var pair in parameters)
                        {
                            cmd.Parameters.AddWithValue(pair.field, pair.value);
                        }

                        cmd.CommandType = CommandType.StoredProcedure;
                        object ret = cmd.ExecuteScalar();

                        if (ret != null)
                            return ret.ToString();
                        else
                            return "";
                    }
                }
                else
                    throw new ValidationException(string.Format("Stored '{0}' not found", stored));
            }
        }

        public static DataTable GetSchemaFromStored(string stored, List<filterElement> parameters)
        {
            using (metaRawModel context = new metaRawModel())
            {
                _Metadati_Tabelle metaStored = context.GetMetadati_Tabelles(stored).FirstOrDefault();

                dynamic parameterDefinition = null;
                dynamic extraProps;

                if (!string.IsNullOrEmpty(metaStored.md_props_bag))
                {
                    extraProps = RawHelpers.deserialize(metaStored.md_props_bag, null);
                    if (extraProps != null)
                    {
                        parameterDefinition = extraProps.parameters;
                    }
                }

                if (metaStored != null)
                {
                    DataTable dt = new DataTable();

                    using (MySqlConnection connection = GetOpenConnection(false, metaStored.md_conn_name))
                    {
                        stored = RawHelpers.getStoreTableName(metaStored, "mysql");

                        using (MySqlCommand cmd = new MySqlCommand(stored, connection))
                        {
                            using (MySqlDataAdapter da = new MySqlDataAdapter(cmd))
                            {
                                cmd.CommandType = CommandType.StoredProcedure;

                                if (parameterDefinition != null)
                                {
                                    foreach (JToken jt in parameterDefinition)
                                    {
                                        filterElement pair = parameters.FirstOrDefault(x => x.field.Replace("@", "").ToLower() == jt["Name"].ToString().Replace("@", "").ToLower());

                                        if (pair != null)
                                        {
                                            cmd.Parameters.Add(new MySqlParameter(pair.field, pair.value));
                                        }
                                    }
                                }

                                da.FillSchema(dt, SchemaType.Mapped);
                            }
                        }
                    }

                    return dt;
                }
                else
                    throw new ValidationException(string.Format("Stored '{0}' not found", stored));
            }
        }

        public static rawPagedResult GetFlatDataFromStored(string user_id, string stored, List<filterElement> parameters, long __pageIndex, int __pageSize, string __sortField, string __sortDir, bool skipExtraParams = false, bool noResults = false)
        {
            using (metaRawModel context = new metaRawModel())
            {
                _Metadati_Tabelle metaStored = context.GetMetadati_Tabelles(stored).FirstOrDefault();

                dynamic parameterDefinition = null;

                if (!string.IsNullOrEmpty(metaStored.md_props_bag))
                {
                    dynamic extraProps = RawHelpers.deserialize(metaStored.md_props_bag, null);
                    if (extraProps != null)
                    {
                        parameterDefinition = extraProps.parameters;
                    }
                }

                if (metaStored != null)
                {
                    using (MySqlConnection connection = GetOpenConnection(false, metaStored.md_conn_name))
                    {
                        stored = RawHelpers.getStoreTableName(metaStored, "mysql");

                        var dbArgs = new DynamicParameters();

                        if (parameterDefinition != null)
                        {
                            foreach (JToken jt in parameterDefinition)
                            {
                                var pair = parameters.FirstOrDefault(x => x.field.Replace("@", "").ToLower() == jt["Name"].ToString().Replace("@", "").ToLower());

                                if (pair != null)
                                {
                                    if (pair.field == "pageIndex__")
                                        dbArgs.Add(":pageIndex__", (__pageIndex == 0 ? 1 : __pageIndex));
                                    else if (pair.field == "pageSize__")
                                        dbArgs.Add("pageSize__", (__pageSize == 0 ? int.MaxValue : __pageSize));
                                    else if (pair.field == "count__")
                                        dbArgs.Add(":count__", direction: ParameterDirection.Output, size: 32);
                                    else if (pair.field == "sortField__")
                                        dbArgs.Add(":sortField__", __sortField);
                                    else if (pair.field == "sortDir__")
                                        dbArgs.Add(":sortDir__", __sortField);
                                    else
                                    {
                                        int? size = new int?();

                                        DbType? dbtype = new DbType?();

                                        ParameterDirection? pDir = new ParameterDirection?();
                                        if (pair.isOut)
                                        {
                                            if (pair.Type == "text")
                                                size = 4000;

                                            pDir = ParameterDirection.Output;
                                            dbArgs.Add(pair.field, null, dbtype, pDir, size);
                                        }
                                        else
                                            dbArgs.Add(pair.field, (pair.value == null ? null : pair.value.ToString()), dbtype, pDir);
                                    }
                                }
                            }
                        }

                        //test stored with normal out params, multiple output normal param, cursor + normal output param -> bind
                        if (parameterDefinition != null && parameterDefinition.Count != parameters.Count)
                            return new rawPagedResult() { results = new List<Dapper.SqlMapper.FastExpando>(), TotalRecords = 0 };

                        List<Dapper.SqlMapper.FastExpando> rows = new List<SqlMapper.FastExpando>();
                        long conto = 0;

                        if (noResults)
                        {
                            connection.Execute(stored, dbArgs, commandType: CommandType.StoredProcedure, commandTimeout: int.Parse(ConfigHelper.GetSettingAsString("storedProcTimeout")));
                        }
                        else
                        {
                            rows = (List<Dapper.SqlMapper.FastExpando>)connection.Query(stored, dbArgs, commandType: CommandType.StoredProcedure, commandTimeout: int.Parse(ConfigHelper.GetSettingAsString("storedProcTimeout")));
                        }

                        if (rows.Count == 1 && rows[0].data.Keys.Count == 1 && string.IsNullOrEmpty(rows[0].data.Keys.First()))
                        {
                            rows[0].data["valore"] = rows[0].data[""];
                            rows[0].data["Column1"] = rows[0].data[""];
                            rows[0].data.Remove("");
                        }

                        if (dbArgs.ParameterNames.Any(x => x == "count__"))
                            conto = long.Parse(dbArgs.Get<string>("count__"));

                        foreach (var pair in parameters.Where(x => x.isOut))
                        {
                            if (pair.field != "count__")
                            {
                                if (rows.Count == 0)
                                    rows.Add(new SqlMapper.FastExpando() { data = new Dictionary<string, object>() });

                                rows[0].data.Add(pair.field, dbArgs.Get<object>(pair.field));
                            }
                        }

                        return new rawPagedResult() { results = rows, TotalRecords = (__pageSize != 0 ? conto : rows.Count), Agg = null };
                    }
                }
                else
                    throw new ValidationException(string.Format("Stored '{0}' not found", stored));
            }
        }

        public static Int32 checkAsyncCondition(string user_id, string query)
        {
            using (MySqlConnection connection = GetOpenConnection(false))
            {
                try
                {
                    query = query.Replace("{{user}}", user_id.ToString());
                    return connection.Query<Int32>(query).FirstOrDefault();
                }
                catch (Exception EX)
                {
                    throw new Exception(EX.Message + "****EXECUTED QUERY:****" + query);
                }
            }
        }

        public static string UpdateflatData(Dictionary<string, object> entity, string route, string userId, MySqlConnection conn = null, MySqlTransaction trn = null)
        {
            string query = "";
            ClearLastCrudSqlQuery();

            try
            {

                bool isMeta = RawHelpers.checkIsMetaData(route);
                userId = RawHelpers.authenticate();

                if (isMeta)
                    RawHelpers.checkAdmin(userId);

                List<_Metadati_Colonne> metadata = _Metadati_Colonne.getColonneByUserID(route, 0, userId, dataMode.edit, null);
                _Metadati_Tabelle tab = metadata.First()._Metadati_Tabelle;

                if (conn == null)
                {
                    using (MySqlConnection connection = GetOpenConnection(isMeta, tab.md_conn_name))
                    {
                        return RawUpdateFlatData(entity, route, userId, ref query, isMeta, metadata, connection, trn);
                    }
                }
                else
                {
                    return RawUpdateFlatData(entity, route, userId, ref query, isMeta, metadata, conn, trn);
                }
            }
            catch (Exception ex)
            {
                Exception customEx = Utility.customizeException("UpdateFlatData", ex, user.getUserByID(userId), route, query, entity);
                RawHelpers.logError(customEx, "updateFlatData", query);
                throw customEx;
            }
        }

        public static string RawUpdateFlatData(Dictionary<string, object> entity, string route, string userId, ref string query, bool isMeta, List<_Metadati_Colonne> metadata, MySqlConnection connection, MySqlTransaction trn)
        {
            if (!OptimisticCheck(entity, route, metadata))
            {
                ValidationException optEx = new ValidationException("Errore concorrenza ottimistica");
                throw optEx;
            }

            List<_Metadati_Colonne_Upload> upload_fixes = metadata.OfType<_Metadati_Colonne_Upload>().Where(x => x.isDBUpload).ToList();
            List<_Metadati_Colonne_Grid> multiple_check_fixes = metadata.OfType<_Metadati_Colonne_Grid>().ToList();

            Utility.beforeUpdate(route, entity, userId);

            query = BuildDynamicUpdateQuery(entity, metadata, userId, false, isMeta);

            Utility.customizeUpdate(ref query, route, entity, userId);

            _Metadati_Tabelle tableMetadata = metadata.FirstOrDefault()._Metadati_Tabelle;
            bool invalidateAllMetadata = tableMetadata != null && tableMetadata.is_system_route;

            RawHelpers.setMetadataVersion(invalidateAllMetadata ? null : tableMetadata);

            var watch = Stopwatch.StartNew();
            SetLastCrudSqlQuery(query);
            string result = connection.Execute(query, commandTimeout: int.Parse(ConfigHelper.GetSettingAsString("autoGeneratedQueryTimeout")), transaction: trn).ToString();
            watch.Stop();
            RawHelpers.traceQuery("UpdateflatData", query, watch.ElapsedMilliseconds, route);

            if (invalidateAllMetadata)
                RawHelpers.ClearCachedDataFromSession();
            else
                RawHelpers.ClearCachedDataFromSession(route);

            if (isMeta || invalidateAllMetadata)
                metaRawModel.clearMetas(true);

            if (isMeta || invalidateAllMetadata)
                RawHelpers.logError(new Exception("Metadata update"), "Metadata Update", query);

            multiple_check_fixes.ForEach(colGrid =>
            {
                string subRoute = colGrid.mc_ui_grid_manytomany_route;
                _Metadati_Tabelle subTable;
                List<_Metadati_Colonne> subColumns;
                using (metaRawModel mmd = new metaRawModel())
                {
                    subTable = mmd.GetMetadati_Tabelles(subRoute).FirstOrDefault();
                    if (subTable != null)
                        subColumns = subTable._Metadati_Colonnes.ToList();
                }

                List<Dictionary<string, object>> collection = GetDictionaryListValue(entity, colGrid.mc_nome_colonna);

                if (collection != null)
                {
                    foreach (Dictionary<string, object> subEntity in collection)
                    {
                        if (subEntity.ContainsKey("___added") && subEntity["___added"] != null && (bool)subEntity["___added"])
                        {
                            if (subEntity.ContainsKey("___deleted"))
                            {
                                object deleted = subEntity["___deleted"];
                                if (deleted != null)
                                    if ((bool)deleted)
                                        continue;
                            }

                            Dictionary<string, object> newMMEntity = new Dictionary<string, object>();
                            newMMEntity[colGrid.mc_ui_grid_manytomany_related_id_field] = subEntity[colGrid.mc_ui_grid_related_id_field];
                            newMMEntity[colGrid.mc_ui_grid_manytomany_local_id_field] = entity[colGrid.mc_ui_grid_local_id_field];

                            string insertedID = InsertflatData(newMMEntity, subRoute, userId);
                        }
                        else if (subEntity.ContainsKey("___deleted") && (bool)subEntity["___deleted"])
                        {
                            if ((bool)subEntity["___selected"])
                            {
                                Dictionary<string, object> MMEntityToDelete = new Dictionary<string, object>();
                                MMEntityToDelete[colGrid.mc_ui_grid_manytomany_related_id_field] = subEntity[colGrid.mc_ui_grid_related_id_field];
                                MMEntityToDelete[colGrid.mc_ui_grid_manytomany_local_id_field] = entity[colGrid.mc_ui_grid_local_id_field];

                                DeleteflatData(MMEntityToDelete, subRoute, userId, connection, trn);
                            }
                        }
                    }
                }
            });

            upload_fixes.ForEach(upload_fix =>
            {
                if (upload_fix != null)
                {

                    if (entity[upload_fix.mc_nome_colonna] != null && upload_fix.UseRecordIDAsSubfolder)
                    {
                        string __id = entity[metadata.First(x => x.mc_is_primary_key is true).mc_nome_colonna].ToString();

                        string rootPath = upload_fix.DefaultUploadRootPath;

                        if (string.IsNullOrEmpty(rootPath))
                            rootPath = "/" + (ConfigHelper.GetSettingAsString("uploadFolder") ?? "/upload/");
                        else
                        {
                            if (rootPath.Substring(rootPath.Length - 1, 1) != "/")
                            {
                                rootPath += "/";
                            }
                        }

                        string pth = HttpContext.Current.Server.MapPath(rootPath + (upload_fix.UseRouteNameAsSubfolder ? "/" + route : "") + (upload_fix.UseRecordIDAsSubfolder ? "/" + __id : ""));

                        string new_dir = System.IO.Path.Combine(HttpContext.Current.Server.MapPath(rootPath + route), result);

                        string fname = System.IO.Path.Combine(pth, entity[upload_fix.mc_nome_colonna].ToString());

                        if (System.IO.File.Exists(fname))
                        {
                            if (!upload_fix.isDBUpload)
                            {
                                if (!System.IO.Directory.Exists(new_dir))
                                    System.IO.Directory.CreateDirectory(new_dir);

                                System.IO.File.Copy(fname, System.IO.Path.Combine(new_dir, entity[upload_fix.mc_nome_colonna].ToString()));

                                if (upload_fix.isImageUpload && upload_fix.createThumb)
                                {
                                    FileInfo fi = new FileInfo(fname);
                                    string thumbName = fi.Name.Replace(fi.Extension, "_thumb" + fi.Extension);
                                    System.IO.File.Copy(fname, System.IO.Path.Combine(new_dir, thumbName));
                                    System.IO.File.Delete(thumbName);

                                }
                            }
                            System.IO.File.Delete(fname);
                        }
                    }
                    else
                    {

                    }

                }
            });

            if (!string.IsNullOrEmpty(metadata.First()._Metadati_Tabelle.md_after_save_server_method_name))
            {
                RawHelpers.InvokeUtilityHook(metadata.First()._Metadati_Tabelle.md_after_save_server_method_name, new object[] { userId, entity, dataMode.edit, "" });
            }

            bool enableServerSideCrudChangeLog = RawHelpers.ParseBool(ConfigHelper.GetSettingAsString("enableServerSideCrudChangeLog") ?? "true");
            if (enableServerSideCrudChangeLog && entity.ContainsKey("__changes"))
            {
                List<Dictionary<string, object>> changess = GetDictionaryListValue(entity, "__changes");

                if (changess == null)
                    changess = new List<Dictionary<string, object>>();

                List<ChangeT> changes = new List<ChangeT>();
                changess.ForEach(x =>
                {
                    ChangeT ct = new ChangeT();
                    ct.field = x["field"].ToString();
                    ct.oldValue = RawHelpers.ParseNull(x["oldValue"]);
                    ct.newValue = RawHelpers.ParseNull(x["newValue"]);
                    ct.timestamp = DateTime.Parse(x["timestamp"].ToString());

                    changes.Add(ct);
                });

                if (changes.Count > 0)
                {
                    using (MySqlConnection connection2 = GetOpenConnection(false))
                    {
                        try
                        {
                            EnsureChangeTrackingSchema(connection2);

                            MySqlCommand cmd = new MySqlCommand("INSERT INTO ChangeMaster(MdRouteName, Timestamp, Pkey, operation, userID) VALUES(@MdRouteName, NOW(), @Pkey, @operation, @userID); SELECT LAST_INSERT_ID()", connection2);
                            cmd.Parameters.Add(new MySqlParameter("MdRouteName", route));
                            cmd.Parameters.Add(new MySqlParameter("Pkey", entity[metadata.FirstOrDefault(x => x.mc_is_primary_key is true).mc_nome_colonna]));
                            cmd.Parameters.Add(new MySqlParameter("operation", "update"));
                            cmd.Parameters.Add(new MySqlParameter("userID", userId ?? ""));

                            var masterId = cmd.ExecuteScalar().ToString();

                            foreach (ChangeT change in changes)
                            {
                                var dbArgs = new DynamicParameters();
                                dbArgs.Add("masterId", metaQueryMySql.EscapeValue(masterId));
                                dbArgs.Add("field", metaQueryMySql.EscapeValue(change.field));
                                dbArgs.Add("newValue", metaQueryMySql.EscapeValue(change.newValue));
                                dbArgs.Add("oldValue", metaQueryMySql.EscapeValue(change.oldValue));
                                dbArgs.Add("timestamp", metaQueryMySql.EscapeValue(change.timestamp));

                                connection2.Execute("INSERT INTO ChangeDetail(FK_IdChange, Field, NewValue, OldValue, TimestampClient) VALUES(@masterId, @field, @newValue, @oldValue, @timestamp)", dbArgs).ToString();
                            }
                        }
                        catch (Exception ex)
                        {
                            RawHelpers.logError(ex, "crudChangeLogUpdate", route);
                        }
                    }
                }
            }

            return result;
        }

        public static string DeleteflatDataByID(int id, string route, string userId)
        {
            ClearLastCrudSqlQuery();
            List<_Metadati_Colonne> metadata = _Metadati_Colonne.getColonneByUserID(route, 0, userId, dataMode.insert, null);
            _Metadati_Tabelle tab = metadata.First()._Metadati_Tabelle;

            using (MySqlConnection connection = GetOpenConnection(RawHelpers.checkIsMetaData(route), tab.md_conn_name))
            {
                string query = "";

                try
                {

                    Dictionary<string, object> entity = new Dictionary<string, object>();
                    entity.Add(metadata.FirstOrDefault(x => x.mc_is_primary_key is true).mc_nome_colonna, id);

                    _Metadati_Colonne logic_del_key = metadata.FirstOrDefault(x => x.mc_is_logic_delete_key is true);
                    if (logic_del_key != null)
                        entity.Add(logic_del_key.mc_nome_colonna, false);

                    query = BuildDynamicDeleteQuery(entity, metadata, userId);

                    RawHelpers.setMetadataVersion(metadata.FirstOrDefault()._Metadati_Tabelle);

                    SetLastCrudSqlQuery(query);
                    return connection.Execute(query).ToString();

                }
                catch (ValidationException)
                {
                    throw;
                }
                catch (MySqlException e2)
                {
                    if (e2.Number == 547)
                        throw new ValidationException(string.Format("Vincolo chiave esterna violato. {0}", e2.Message));
                    else
                    {
                        RawHelpers.logError(e2, "deleteFlatDataByID", query);
                        throw;
                    }
                }
                catch (Exception e3)
                {
                    RawHelpers.logError(e3, "deleteFlatDataByID", query);
                    throw;
                }
            }
        }


        public static string DeleteflatData(Dictionary<string, object> entity, string route, string userId, MySqlConnection conn = null, MySqlTransaction trn = null)
        {
            string query = "";
            _Metadati_Tabelle tab = null;
            ClearLastCrudSqlQuery();
            userId = RawHelpers.authenticate();

            try
            {
                List<_Metadati_Colonne> metadata = _Metadati_Colonne.getColonneByUserID(route, 0, userId, dataMode.insert, null);
                tab = metadata.First()._Metadati_Tabelle;
                bool isMeta = RawHelpers.checkIsMetaData(route);

                if (conn == null)
                {
                    using (MySqlConnection connection = GetOpenConnection(isMeta, tab.md_conn_name))
                    {
                        return RawDeleteFlatData(entity, route, userId, ref query, metadata, isMeta, connection, trn);
                    }
                }
                else
                {
                    return RawDeleteFlatData(entity, route, userId, ref query, metadata, isMeta, conn, trn);
                }
            }
            catch (ValidationException e1)
            {
                Exception customEx = Utility.customizeException("DeleteflatData", e1, user.getUserByID(userId), route, query, entity);
                throw customEx;
            }
            catch (MySqlException e2)
            {
                if (e2.Number == 1451 || e2.Number == 1452 || e2.Number == 547)
                {
                    ValidationException ve = new ValidationException(string.Format("Impossibile cancellare '{0}'. Esistono dati collegati.", (tab != null ? tab.md_long_description : "")));
                    Exception customEx = Utility.customizeException("DeleteflatData", ve, user.getUserByID(userId), route, query, entity);
                    throw customEx;
                }
                else
                {
                    Exception customEx = Utility.customizeException("DeleteflatData", e2, user.getUserByID(userId), route, query, entity);
                    RawHelpers.logError(customEx, "deleteFlatData", query);
                    throw customEx;
                }
            }
            catch (Exception e3)
            {
                Exception customEx = Utility.customizeException("DeleteflatData", e3, user.getUserByID(userId), route, query, entity);
                RawHelpers.logError(customEx, "deleteFlatData", query);
                throw customEx;
            }
        }

        private static string RawDeleteFlatData(Dictionary<string, object> entity, string route, string userId, ref string query, List<_Metadati_Colonne> metadata, bool isMeta, MySqlConnection connection, MySqlTransaction trn)
        {

            Utility.beforeDelete(route, entity, userId);

            query = BuildDynamicDeleteQuery(entity, metadata, userId);

            Utility.customizeDelete(ref query, route, entity, userId);

            RawHelpers.setMetadataVersion(metadata.FirstOrDefault()._Metadati_Tabelle);

            var watch = Stopwatch.StartNew();
            SetLastCrudSqlQuery(query);
            string ret = connection.Execute(query, commandTimeout: int.Parse(ConfigHelper.GetSettingAsString("autoGeneratedQueryTimeout")), transaction: trn).ToString();
            watch.Stop();
            RawHelpers.traceQuery("DeleteflatData", query, watch.ElapsedMilliseconds, route);

            RawHelpers.ClearCachedDataFromSession(route);

            if (isMeta)
                RawHelpers.logError(new Exception("Metadata delete"), "Metadata delete", query);

            if (!string.IsNullOrEmpty(metadata.First()._Metadati_Tabelle.md_after_save_server_method_name))
            {
                RawHelpers.InvokeUtilityHook(metadata.First()._Metadati_Tabelle.md_after_save_server_method_name, new object[] { userId, entity, dataMode.delete, "" });
            }

            // Change tracking per DELETE: registra master + dettaglio anche in cancellazione.
            string pKeyField = metadata.FirstOrDefault(x => x.mc_is_primary_key is true)?.mc_nome_colonna;
            object pKeyValue = null;
            if (!string.IsNullOrEmpty(pKeyField) && entity.ContainsKey(pKeyField))
            {
                pKeyValue = entity[pKeyField];
            }

            List<Dictionary<string, object>> deleteChanges = new List<Dictionary<string, object>>();
            foreach (var kv in entity)
            {
                if (string.IsNullOrEmpty(kv.Key) || kv.Key.StartsWith("__", StringComparison.OrdinalIgnoreCase))
                    continue;

                deleteChanges.Add(new Dictionary<string, object>
                {
                    { "field", kv.Key },
                    { "oldValue", RawHelpers.ParseNull(kv.Value) },
                    { "timestamp", DateTime.Now }
                });
            }

            if (deleteChanges.Count == 0 && !string.IsNullOrEmpty(pKeyField))
            {
                deleteChanges.Add(new Dictionary<string, object>
                {
                    { "field", pKeyField },
                    { "oldValue", RawHelpers.ParseNull(pKeyValue) },
                    { "timestamp", DateTime.Now }
                });
            }

            bool enableServerSideCrudChangeLog = RawHelpers.ParseBool(ConfigHelper.GetSettingAsString("enableServerSideCrudChangeLog") ?? "true");
            if (enableServerSideCrudChangeLog && deleteChanges.Count > 0)
            {
                string operationType = "delete_physical";
                string globalLogicDeleteField = RawHelpers.ParseNull(ConfigHelper.GetSettingAsString("logicDeleteField"));
                if (!string.IsNullOrEmpty(globalLogicDeleteField))
                {
                    operationType = metadata.Any(x => string.Equals(x.mc_nome_colonna, globalLogicDeleteField, StringComparison.OrdinalIgnoreCase))
                        ? "delete_logical"
                        : "delete_physical";
                }
                else
                {
                    bool hasLogicalDeleteKey = metadata.Any(x => x.mc_is_logic_delete_key.HasValue && x.mc_is_logic_delete_key.Value);
                    operationType = metadata.First()._Metadati_Tabelle.md_has_logic_delete && hasLogicalDeleteKey
                        ? "delete_logical"
                        : "delete_physical";
                }

                using (MySqlConnection connection2 = GetOpenConnection(false))
                {
                    try
                    {
                        EnsureChangeTrackingSchema(connection2);

                        MySqlCommand cmd = new MySqlCommand("INSERT INTO ChangeMaster(MdRouteName, Timestamp, Pkey, operation, userID) VALUES(@MdRouteName, NOW(), @Pkey, @operation, @userID); SELECT LAST_INSERT_ID()", connection2);
                        cmd.Parameters.Add(new MySqlParameter("MdRouteName", route));
                        cmd.Parameters.Add(new MySqlParameter("Pkey", pKeyValue ?? ""));
                        cmd.Parameters.Add(new MySqlParameter("operation", operationType));
                        cmd.Parameters.Add(new MySqlParameter("userID", userId ?? ""));

                        var masterId = cmd.ExecuteScalar().ToString();

                        foreach (var change in deleteChanges)
                        {
                            var dbArgs = new DynamicParameters();
                            dbArgs.Add("masterId", metaQueryMySql.EscapeValue(masterId));
                            dbArgs.Add("field", metaQueryMySql.EscapeValue(change["field"]));
                            dbArgs.Add("newValue", metaQueryMySql.EscapeValue(string.Empty));
                            dbArgs.Add("oldValue", metaQueryMySql.EscapeValue(change["oldValue"]));
                            dbArgs.Add("timestamp", metaQueryMySql.EscapeValue(change["timestamp"]));

                            connection2.Execute("INSERT INTO ChangeDetail(FK_IdChange, Field, NewValue, OldValue, TimestampClient) VALUES(@masterId, @field, @newValue, @oldValue, @timestamp)", dbArgs).ToString();
                        }
                    }
                    catch (Exception ex)
                    {
                        RawHelpers.logError(ex, "crudChangeLogDelete", route);
                    }
                }
            }

            return ret;
        }

        public static string InsertflatData(Dictionary<string, object> entity, string route, string userId, MySqlConnection conn = null, MySqlTransaction trn = null)
        {
            string query = "";
            ClearLastCrudSqlQuery();

            try
            {
                List<_Metadati_Colonne> metadata = _Metadati_Colonne.getColonneByUserID(route, 0, userId, dataMode.insert, null);
                _Metadati_Tabelle tab = metadata.First()._Metadati_Tabelle;

                bool isMeta = RawHelpers.checkIsMetaData(route);
                userId = RawHelpers.authenticate();

                if (conn == null)
                {
                    using (MySqlConnection connection = GetOpenConnection(isMeta, tab.md_conn_name))
                    {
                        return RawInsertFlatData(entity, route, userId, ref query, metadata, isMeta, connection, trn);
                    }
                }
                else
                {
                    return RawInsertFlatData(entity, route, userId, ref query, metadata, isMeta, conn, trn);
                }
            }
            catch (Exception ex)
            {
                Exception customEx = Utility.customizeException("InsertflatData", ex, user.getUserByID(userId), route, query, entity);
                RawHelpers.logError(customEx, "insertFlatData", query);
                throw customEx;
            }
        }

        public static string RawInsertFlatData(Dictionary<string, object> entity, string route, string userId, ref string query, List<_Metadati_Colonne> metadata, bool isMeta, MySqlConnection connection, MySqlTransaction trn = null)
        {
            string generated_pkey = "";

            Utility.beforeInsert(route, entity, userId);

            query = BuildDynamicInsertQuery(entity, metadata, userId, out generated_pkey);

            Utility.customizeInsert(ref query, route, entity, userId);

            RawHelpers.setMetadataVersion(metadata.FirstOrDefault()._Metadati_Tabelle);

            List<_Metadati_Colonne_Upload> upload_fixes = metadata.OfType<_Metadati_Colonne_Upload>().ToList();
            List<_Metadati_Colonne_Grid> multiple_check_fixes = metadata.OfType<_Metadati_Colonne_Grid>().ToList();

            var watch = Stopwatch.StartNew();
            SetLastCrudSqlQuery(query);
            string result = connection.Execute(query, commandTimeout: int.Parse(ConfigHelper.GetSettingAsString("autoGeneratedQueryTimeout")), transaction: trn).ToString();
            watch.Stop();
            RawHelpers.traceQuery("InsertflatData", query, watch.ElapsedMilliseconds, route);

            RawHelpers.ClearCachedDataFromSession(route);

            if (isMeta)
                RawHelpers.logError(new Exception("Metadata insert"), "Metadata insert", query);

            if (!string.IsNullOrEmpty(generated_pkey))
                result = generated_pkey;

            //NEED TO BLANK RESULT: IF THE TABLE HAS A FULL TEXT INDEX -> INSERT QUERY RETURNS THIS AUTOGENERATED VALUE THAT IS CLIENT SIDE ASSIGNED TO THE FIRST PRIMARY KEY COLUMN OF THE TABLE !!!!!
            if (string.IsNullOrEmpty(metadata.FirstOrDefault()._Metadati_Tabelle.md_primary_key_type))
                result = "";

            multiple_check_fixes.ForEach(colGrid =>
            {
                string subRoute = colGrid.mc_ui_grid_manytomany_route;
                _Metadati_Tabelle subTable;
                List<_Metadati_Colonne> subColumns;
                using (metaRawModel mmd = new metaRawModel())
                {
                    subTable = mmd.GetMetadati_Tabelles(subRoute).FirstOrDefault();
                    if (subTable != null)
                        subColumns = subTable._Metadati_Colonnes.ToList();
                }


                List<Dictionary<string, object>> collection = GetDictionaryListValue(entity, colGrid.mc_nome_colonna);

                if (collection != null)
                {
                    foreach (Dictionary<string, object> subEntity in collection)
                    {
                        if (subEntity.ContainsKey("___added") && subEntity["___added"] != null)
                        {
                            if ((bool)subEntity["___added"])
                            {
                                if (subEntity.ContainsKey("___deleted"))
                                {
                                    object deleted = subEntity["___deleted"];
                                    if (deleted != null)
                                        if ((bool)deleted)
                                            continue;
                                }

                                entity[colGrid.mc_ui_grid_local_id_field] = result;

                                Dictionary<string, object> newMMEntity = new Dictionary<string, object>();

                                newMMEntity[colGrid.mc_ui_grid_manytomany_related_id_field] = subEntity[colGrid.mc_ui_grid_related_id_field];
                                newMMEntity[colGrid.mc_ui_grid_manytomany_local_id_field] = entity[colGrid.mc_ui_grid_local_id_field];

                                ////****************IT's WRONG!!!!*******************

                                string insertedID = InsertflatData(newMMEntity, subRoute, userId);

                            }
                        }
                        else if (subEntity.ContainsKey("___deleted") && (bool)subEntity["___deleted"])
                        {
                            if ((bool)subEntity["___selected"])
                            {
                                Dictionary<string, object> MMEntityToDelete = new Dictionary<string, object>();

                                MMEntityToDelete[colGrid.mc_ui_grid_manytomany_related_id_field] = subEntity[colGrid.mc_ui_grid_related_id_field];
                                MMEntityToDelete[colGrid.mc_ui_grid_manytomany_local_id_field] = entity[colGrid.mc_ui_grid_local_id_field];

                                DeleteflatData(MMEntityToDelete, subRoute, userId, connection, trn);
                            }
                        }
                    }
                }
            });

            upload_fixes.ForEach(upload_fix =>
            {
                if (upload_fix != null)
                {

                    if (entity.ContainsKey(upload_fix.mc_nome_colonna) && entity[upload_fix.mc_nome_colonna] != null && upload_fix.UseRecordIDAsSubfolder)
                    {
                        string __id = "";

                        if (entity.ContainsKey("__guid"))
                            __id = entity["__guid"].ToString();
                        else if (entity.ContainsKey("__id"))
                            __id = entity["__id"].ToString();
                        else if (entity.ContainsKey("uid"))
                            __id = entity["uid"].ToString();

                        string rootPath = upload_fix.DefaultUploadRootPath;

                        if (string.IsNullOrEmpty(rootPath))
                            rootPath = "/" + (ConfigHelper.GetSettingAsString("uploadFolder") ?? "/upload/");
                        else
                        {
                            if (rootPath.Substring(rootPath.Length - 1, 1) != "/")
                            {
                                rootPath += "/";
                            }
                        }

                        string pth = HttpContext.Current.Server.MapPath(rootPath + (upload_fix.UseRouteNameAsSubfolder ? "/" + route : "") + (upload_fix.UseRecordIDAsSubfolder ? "/" + __id : ""));

                        if (!System.IO.Directory.Exists(pth))
                            System.IO.Directory.CreateDirectory(pth);

                        string new_dir = System.IO.Path.Combine(HttpContext.Current.Server.MapPath(rootPath + route), result);

                        string fname = System.IO.Path.Combine(pth, entity[upload_fix.mc_nome_colonna].ToString());

                        if (System.IO.File.Exists(fname))
                        {
                            if (!upload_fix.isDBUpload)
                            {
                                if (!System.IO.Directory.Exists(new_dir))
                                    System.IO.Directory.CreateDirectory(new_dir);

                                System.IO.File.Copy(fname, System.IO.Path.Combine(new_dir, entity[upload_fix.mc_nome_colonna].ToString()));

                                if (upload_fix.isImageUpload && upload_fix.createThumb)
                                {
                                    FileInfo fi = new FileInfo(fname);
                                    string thumbName = fi.Name.Replace(fi.Extension, "_thumb" + fi.Extension);
                                    string thumbPath = System.IO.Path.Combine(pth, thumbName);
                                    System.IO.File.Copy(thumbPath, System.IO.Path.Combine(new_dir, thumbName));
                                    System.IO.File.Delete(thumbPath);

                                }
                            }
                            System.IO.File.Delete(fname);
                            System.IO.Directory.Delete(pth, true);
                        }
                    }
                }
            });


            if (!string.IsNullOrEmpty(metadata.First()._Metadati_Tabelle.md_after_save_server_method_name))
            {
                RawHelpers.InvokeUtilityHook(metadata.First()._Metadati_Tabelle.md_after_save_server_method_name, new object[] { userId, entity, dataMode.insert, result });
            }

            return result;
        }

        public static string RestoreflatData(Dictionary<string, object> entity, string route, string userId, MySqlConnection conn = null, MySqlTransaction trn = null)
        {
            string query = "";
            _Metadati_Tabelle tab = null;
            ClearLastCrudSqlQuery();
            userId = RawHelpers.authenticate();

            try
            {
                List<_Metadati_Colonne> metadata = _Metadati_Colonne.getColonneByUserID(route, 0, userId, dataMode.insert, null);
                tab = metadata.First()._Metadati_Tabelle;
                bool isMeta = RawHelpers.checkIsMetaData(route);

                if (conn == null)
                {
                    using (MySqlConnection connection = GetOpenConnection(isMeta, tab.md_conn_name))
                    {
                        return RawRestoreFlatData(entity, route, userId, ref query, metadata, isMeta, connection, trn);
                    }
                }
                else
                {
                    return RawRestoreFlatData(entity, route, userId, ref query, metadata, isMeta, conn, trn);
                }

            }
            catch (ValidationException e1)
            {
                Exception customEx = Utility.customizeException("RestoreflatData", e1, user.getUserByID(userId), route, query, entity);
                throw customEx;
            }
            catch (MySqlException e2)
            {
                Exception customEx = Utility.customizeException("RestoreflatData", e2, user.getUserByID(userId), route, query, entity);
                RawHelpers.logError(customEx, "restoreFlatData", query);
                throw customEx;
            }
            catch (Exception e3)
            {
                Exception customEx = Utility.customizeException("RestoreflatData", e3, user.getUserByID(userId), route, query, entity);
                RawHelpers.logError(customEx, "restoreFlatData", query);
                throw customEx;

            }
        }

        private static string RawRestoreFlatData(Dictionary<string, object> entity, string route, string userId, ref string query, List<_Metadati_Colonne> metadata, bool isMeta, MySqlConnection connection, MySqlTransaction trn)
        {
            Utility.beforeRestore(route, entity, userId);

            query = BuildDynamicRestoreQuery(entity, metadata, userId);

            Utility.customizeRestore(ref query, route, entity, userId);

            RawHelpers.setMetadataVersion(metadata.FirstOrDefault()._Metadati_Tabelle);

            var watch = Stopwatch.StartNew();
            SetLastCrudSqlQuery(query);
            string ret = connection.Execute(query, commandTimeout: int.Parse(ConfigHelper.GetSettingAsString("autoGeneratedQueryTimeout")), transaction: trn).ToString();
            watch.Stop();
            RawHelpers.traceQuery("RestoreflatData", query, watch.ElapsedMilliseconds, route);

            RawHelpers.ClearCachedDataFromSession(route);

            return ret;
        }

        private static string BuildDynamicRestoreQuery(Dictionary<string, object> entity, List<_Metadati_Colonne> metadata, string userId)
        {
            string where = "";
            string query = "";

            _Metadati_Tabelle tabel = metadata[0]._Metadati_Tabelle;
            string table_name = GetTableName(tabel);
            string safetable_name = table_name;

            if (!tabel.md_deletable)
                throw new ValidationException("Ripristino disabilitato");

            if (tabel.md_is_reticular)
            {
                table_name = "tabella_reticolare";
                safetable_name = (string.IsNullOrEmpty(tabel.md_db_name) ? "" : "[" + tabel.md_db_name + "]." + (!string.IsNullOrEmpty(tabel.md_schema_name) ? "[" + tabel.md_schema_name + "]" : "") + ".") + EscapeDBObjectName(table_name);
            }

            metadata.ForEach((fld) =>
            {
                string safecolumn_name = EscapeDBObjectName(RawHelpers.getStoreColumnName(fld));

                string current_fld = safetable_name + "." + safecolumn_name;

                if (fld.mc_is_primary_key is true)
                {
                    if (string.IsNullOrEmpty(tabel.md_primary_key_type) || tabel.md_primary_key_type == "GUID")
                        where += ((where == "") ? " where " : " AND ") + current_fld + " = '" + entity[fld.mc_nome_colonna] + "'";
                    else
                    {
                        int ou;
                        string quote = "";

                        if (entity.ContainsKey(fld.mc_nome_colonna))
                        {
                            if (!int.TryParse(entity[fld.mc_nome_colonna].ToString(), out ou) || fld.mc_db_column_type == "varchar")
                                quote = "'";

                            where += ((where == "") ? " where " : " AND ") + current_fld + " = " + quote + entity[fld.mc_nome_colonna] + quote;
                        }
                    }
                }
            });

            string logicRestoreValue = "0";

            if (tabel.md_has_logic_delete)
            {
                _Metadati_Colonne logic_del_key = metadata.FirstOrDefault(x => x.mc_is_logic_delete_key.HasValue && x.mc_is_logic_delete_key.Value);
                if (logic_del_key != null)
                {
                    string delete_log = "";
                    if (tabel.md_logging_enable)
                    {
                        //if (ConfigHelper.GetSettingAsString("logging-extra_client") != null)
                        //{
                        //    userId = Utility.id_extraClient(ref userId);
                        //}

                        AppendLoggingDeleteFields(ref delete_log, tabel, userId, entity);
                    }
                    query = string.Format("UPDATE {0} SET {1} = {4} {3} {2}", safetable_name, safetable_name + "." + RawHelpers.getStoreColumnName(logic_del_key), where, string.IsNullOrEmpty(delete_log) ? "" : ", " + delete_log, logicRestoreValue);
                }
                else
                {
                    throw new Exception("Missing logic delete key field.");
                }
            }
            else if (!string.IsNullOrEmpty(ConfigHelper.GetSettingAsString("logicDeleteField")))
            {
                string logicRestoreField = ConfigHelper.GetSettingAsString("logicDeleteField");

                if (!string.IsNullOrEmpty(logicRestoreField))
                {
                    _Metadati_Colonne logic_del_key = metadata.FirstOrDefault(x => x.mc_nome_colonna == logicRestoreField);
                    if (logic_del_key != null)
                    {
                        string delete_log = "";
                        if (tabel.md_logging_enable)
                        {
                            //if (ConfigHelper.GetSettingAsString("logging-extra_client") != null)
                            //{
                            //    userId = Utility.id_extraClient(ref userId);
                            //}

                            AppendLoggingDeleteFields(ref delete_log, tabel, userId, entity);
                        }
                        query = string.Format("UPDATE {0} SET {1} = '{4}' {3} {2}", safetable_name, safetable_name + "." + RawHelpers.getStoreColumnName(logic_del_key), where, string.IsNullOrEmpty(delete_log) ? "" : ", " + delete_log, logicRestoreValue);
                    }
                    else
                    {
                        throw new Exception("Data can not be restored");
                    }
                }
            }
            else
            {
                throw new Exception("Data can not be restored");
            }

            return query;
        }

        public static string AddDummyTreeRecord(string route, int id, string parent_id, bool sameLevel, FilterInfos filters, string user_id)
        {
            List<_Metadati_Colonne> metadata = _Metadati_Colonne.getColonneByUserID(route, 0, user_id, dataMode.insert, null);
            _Metadati_Tabelle tabel = metadata[0]._Metadati_Tabelle;
            Dictionary<string, object> entity = new Dictionary<string, object>();

            foreach (_Metadati_Colonne col in metadata)
            {
                if (tabel.md_parent_key_name == col.mc_nome_colonna)
                {
                    if (string.IsNullOrEmpty(parent_id))
                    {
                        if (sameLevel)
                        {

                        }
                        else
                        {
                            entity.Add(col.mc_nome_colonna, id);
                        }
                    }
                    else
                    {
                        if (sameLevel)
                        {
                            entity.Add(col.mc_nome_colonna, parent_id);
                        }
                        else
                        {
                            entity.Add(col.mc_nome_colonna, id);
                        }
                    }
                }
                else
                {
                    filterElement fltr = filters.filters.FirstOrDefault(x => x.field == col.mc_nome_colonna);
                    if (fltr != null)
                    {
                        entity.Add(col.mc_nome_colonna, fltr.value);
                    }
                    else
                    {
                        if (col.mc_validation_required is true)
                        {
                            if (col as _Metadati_Colonne_Slider != null)
                                entity.Add(col.mc_nome_colonna, 0);
                            else if (col as _Metadati_Colonne_Lookup == null)
                                entity.Add(col.mc_nome_colonna, "<" + col.mc_nome_colonna + ">");
                        }
                        else
                        {
                            entity.Add(col.mc_nome_colonna, null);
                        }
                    }
                }
            }

            return InsertflatData(entity, route, user_id);
        }

        #region Optimized Select

        public static string GetCurrentFieldString(_Metadati_Tabelle tab, _Metadati_Colonne fld)
        {
            string safeColumnName = EscapeDBObjectName(RawHelpers.getStoreColumnName(fld));
            string safeAlias = EscapeDBObjectName(fld.mc_nome_colonna);

            string current_fld = GetTableName(tab) + "." + safeColumnName;

            if (fld.mc_db_column_type == "binary")
                current_fld = string.Format("null", safeAlias);

            _Metadati_Colonne_Lookup col = fld as _Metadati_Colonne_Lookup;
            if (col != null)
            {

            }
            else if (fld.mc_is_computed.HasValue && fld.mc_is_computed.Value)
            {
                string safeappend = (string.IsNullOrEmpty(fld.mc_computed_formula) ? "''" : fld.mc_computed_formula);
                current_fld = string.Format(" {0} {1}", safeappend, "");
            }

            _Metadati_Colonne_Button btn_col = fld as _Metadati_Colonne_Button;
            if (btn_col != null)
            {
                string safeappend = "''";
                current_fld = string.Format(" {0} {1}", safeappend, "");
            }

            if (fld.mc_ui_column_type == "hierarchyid")
            {
                current_fld = string.Format(" Cast({0} AS nvarchar(4000))", current_fld);
            }

            if (fld.mc_db_column_type == "point" || fld.mc_ui_column_type == "point")
            {
                current_fld = RawHelpers.sqlPointToString(current_fld, "mysql", fld);
            }
            else if (fld.mc_db_column_type == "geometry" || fld.mc_ui_column_type == "geometry")
            {
                current_fld = string.Format(" ST_AsText({0})", current_fld);
            }

            return current_fld;
        }


        public static string BuildWherePart(List<_Metadati_Colonne> lst, PageInfo PageInfo, FilterInfos filterInfo, string userId, string logicOperator = "AND", string distinct = "", string formulaLookup = "", _Metadati_Colonne linkedCol = null)
        {
            if (PageInfo == null) { PageInfo = new PageInfo() { pageSize = 0, currentPage = 1 }; }
            if (filterInfo == null) { filterInfo = new FilterInfos(); filterInfo.filters = new List<filterElement>(); }
            FilterInfos clonedfilters = FilterInfos.clone(filterInfo);
            Dictionary<aliasPair, string> joins = new Dictionary<aliasPair, string>();

            _Metadati_Tabelle tab = lst.First()._Metadati_Tabelle;
            _Metadati_Colonne pKey = lst.FirstOrDefault(x => x.mc_is_primary_key is true);

            using (metaRawModel mmd = new metaRawModel())
            {
                string where = BuildDynamicWhere(clonedfilters, PageInfo, mmd, lst, tab, pKey, logicOperator, distinct, joins, formulaLookup, userId, 0, linkedCol);

                return where;
            }
        }

        public static string BuildDynamicSelectQuery(List<_Metadati_Colonne> lst, List<SortInfo> SortInfo, List<GroupInfo> GroupInfo, PageInfo PageInfo, FilterInfos filterInfo, string logicOperator, bool hasServerOperation, MySqlConnection connection, out long totalRecords, List<AggregationInfo> aggregates, out List<AggregationResult> aggregateValues, string userId, string formulaLookup = "", int mcId = 0, string distinct = "", bool skipOrder = false, string extraFields = "", string parentRoute = "", SerializableDictionary<string, object> currentRecord = null)
        {
            if (PageInfo == null) { PageInfo = new PageInfo() { pageSize = 0, currentPage = 1 }; }
            if (filterInfo == null) { filterInfo = new FilterInfos(); filterInfo.filters = new List<filterElement>(); }
            if (SortInfo == null) { SortInfo = new List<SortInfo>(); }
            if (GroupInfo == null) { GroupInfo = new List<GroupInfo>(); }

            totalRecords = 0;
            aggregateValues = new List<AggregationResult>();

            FilterInfos clonedfilters = FilterInfos.clone(filterInfo);
            Dictionary<aliasPair, string> joins = new Dictionary<aliasPair, string>();
            List<string> joinsAppend = new List<string>();

            using (metaRawModel mmd = new metaRawModel())
            {
                _Metadati_Tabelle tab = lst.First()._Metadati_Tabelle;
                _Metadati_Colonne pKey = lst.FirstOrDefault(x => x.mc_is_primary_key is true);
                string safetableName = RawHelpers.getStoreTableName(tab, "mysql");
                _Metadati_Colonne_Lookup lookuprelatedCol = null;
                _Metadati_Colonne linkedCol = null;

                bool shadowing = false;
                dynamic caching = null;

                if (!string.IsNullOrEmpty(tab.md_props_bag))
                {
                    dynamic extraProps = RawHelpers.deserialize(tab.md_props_bag, null);
                    if (extraProps is IDictionary<string, object> extraDict &&
                        extraDict.TryGetValue("caching", out object cachingObj) &&
                        cachingObj is IDictionary<string, object> cachingDict &&
                        cachingDict.TryGetValue("shadowing", out object shadowingObj) &&
                        shadowingObj is bool shadowingEnabled && shadowingEnabled)
                    {
                        shadowing = true;
                        caching = cachingObj;
                    }

                }

                if (mcId != 0)
                {
                    lookuprelatedCol = mmd.GetMetadati_Colonnes(mcId.ToString()).OfType<_Metadati_Colonne_Lookup>().FirstOrDefault();
                    linkedCol = mmd.GetMetadati_Colonnes(mcId.ToString()).FirstOrDefault();
                }

                string orderBy = skipOrder ? "" : BuildDynamicOrderBy(SortInfo, lst, tab, pKey, clonedfilters);
                string fieldList = BuildDynamicFieldList(mmd, lst, tab, joins, formulaLookup, joinsAppend, mcId, lookuprelatedCol, extraFields);

                string where = BuildDynamicWhere(clonedfilters, PageInfo, mmd, lst, tab, pKey, logicOperator, distinct, joins, formulaLookup, userId, mcId, linkedCol);

                string join = BuildFinalJoin(tab, joins, joinsAppend);

                where = ManageRelatedLookup(filterInfo, tab, mmd, logicOperator, fieldList, join, where, orderBy, lookuprelatedCol, pKey, userId);

                string countQry = "";
                string finalQry = "";
                string customSelectClause = (lookuprelatedCol == null ? "" : lookuprelatedCol.mc_custom_select_clause);
                string autocompleteFilterValue = (string.IsNullOrEmpty(distinct) ? "" : filterInfo.filters.First().value);

                //custom injection
                Utility.customizeSelect(ref fieldList, ref join, ref where, ref orderBy, user.getUserByID(userId), tab, ref customSelectClause, parentRoute, currentRecord, filterInfo, SortInfo, PageInfo);

                if (string.IsNullOrEmpty(distinct) && hasServerOperation)
                {
                    string WhereCustom = where;
                    string safetableNameCustom = safetableName;


                    string customCount = "";

                    Utility.customizeCountSelect(ref fieldList, ref join, ref WhereCustom, ref orderBy, user.getUserByID(userId), tab, ref safetableNameCustom, ref customCount, filterInfo, SortInfo, PageInfo);

                    if (!shadowing)
                    {
                        if (safetableNameCustom != safetableName || WhereCustom != where)
                        {
                            if (safetableNameCustom != safetableName && WhereCustom != where)
                                countQry = string.Format("SELECT {0} FROM {1} {2} {3} {4}", "count(*)", safetableNameCustom, join, WhereCustom, "");
                            if (safetableNameCustom != safetableName && WhereCustom == where)
                                countQry = string.Format("SELECT {0} FROM {1} {2} {3} {4}", "count(*)", safetableNameCustom, join, where, "");
                            if (safetableNameCustom == safetableName && WhereCustom != where)
                                countQry = string.Format("SELECT {0} FROM {1} {2} {3} {4}", "count(*)", safetableName, join, WhereCustom, "");

                        }
                        else
                        {
                            countQry = string.Format("SELECT {0} FROM {1} {2} {3} {4}", "count(*)", safetableName, join, where, "");
                        }

                        try
                        {
                            var watch = Stopwatch.StartNew();

                            totalRecords = connection.Query<long>(countQry, commandTimeout: int.Parse(ConfigHelper.GetSettingAsString("autoGeneratedQueryTimeout"))).FirstOrDefault();

                            watch.Stop();
                            RawHelpers.traceQuery("BuildDynamicSelectQuery", countQry, watch.ElapsedMilliseconds, tab.md_route_name);
                        }
                        catch (Exception ex)
                        {
                            throw RawHelpers.flatException(ex, true, countQry);
                        }


                    }
                }

                #region Finalize query
                if (hasServerOperation && PageInfo.pageSize > 0)
                {
                    if (PageInfo.currentPage == 0)
                        PageInfo.currentPage = 1;

                    int skiprecords = (PageInfo.currentPage - 1) * PageInfo.pageSize;

                    if (string.IsNullOrEmpty(customSelectClause))
                    {
                        #region No Grouping
                        if (GroupInfo.Count == 0)
                        {
                            if (string.IsNullOrEmpty(distinct))
                            {
                                finalQry = string.Format("SELECT {0} " +
                                    "FROM {1} {2} {3} {4} {5} ", fieldList, safetableName, join, where, "", orderBy) +
                                    string.Format(" limit {0} offset {1}", PageInfo.pageSize, skiprecords);

                                if (shadowing)
                                {
                                    ManageShadowCaching(caching, connection, mmd, tab, lst, safetableName, fieldList, join, where, orderBy, skiprecords, PageInfo, SortInfo, filterInfo, aggregates, aggregateValues, logicOperator, distinct, joins, formulaLookup, userId, mcId, linkedCol, ref finalQry, out totalRecords);
                                }

                            }
                            else //Distinct for autocomplete text filters
                            {
                                //need to perform distinct and paging. No need to join. order by autocomplete field
                                _Metadati_Colonne distCol = lst.FirstOrDefault(x => x.mc_nome_colonna == distinct);
                                string distColName = EscapeDBObjectName(RawHelpers.getStoreColumnName(distCol));


                                finalQry = " SELECT " + distColName + " as " + distinct +
                                            string.Format(" FROM {0} where {0}.", safetableName) + distColName + " like '%" + EscapeValue(autocompleteFilterValue) + "%' " +
                                            string.Format(" order by {0}.", safetableName) + distColName +
                                            string.Format(" limit {1} offset {0} ", skiprecords, PageInfo.pageSize);
                            }
                        }
                        #endregion

                        #region Grouping
                        else
                        {
                            finalQry = FinalizeServerSideGrouping(tab, lst, mmd, GroupInfo, safetableName, join, where, connection, skiprecords, PageInfo);

                        }
                        #endregion
                    }
                    else //custom select
                    {
                        finalQry = "";
                        finalQry = ParseCustomSelectClause(customSelectClause, where, finalQry);
                    }
                }
                else
                {
                    #region No Grouping
                    if (GroupInfo.Count == 0)
                    {
                        if (string.IsNullOrEmpty(customSelectClause))
                        {
                            finalQry = string.Format("SELECT {0} FROM {1} {2} {3} {4} ", fieldList, safetableName, join, where, orderBy);
                            if (shadowing)
                            {
                                ManageShadowCaching(caching, connection, mmd, tab, lst, safetableName, fieldList, join, where, orderBy, 0, PageInfo, SortInfo, filterInfo, aggregates, aggregateValues, logicOperator, distinct, joins, formulaLookup, userId, mcId, linkedCol, ref finalQry, out totalRecords);
                            }
                        }
                        else
                        {
                            finalQry = "";
                            finalQry = ParseCustomSelectClause(customSelectClause, where, finalQry);

                        }
                    }
                    #endregion

                    #region Grouping
                    else
                    {
                        finalQry = FinalizeCientSideGrouping(tab, lst, mmd, GroupInfo, safetableName, join, where, ref fieldList);

                    }
                    #endregion
                }
                #endregion

                return finalQry;
            }
        }

        private static string ManageRelatedLookup(FilterInfos filterInfo, _Metadati_Tabelle tab, metaRawModel mmd, string logicOperator, string fieldList, string join, string where, string orderBy, _Metadati_Colonne_Lookup lookuprelatedCol, _Metadati_Colonne pKey, string user_id)
        {
            string innerWhere = "";

            if (lookuprelatedCol != null)
            {
                if (!string.IsNullOrEmpty(lookuprelatedCol.mc_ui_lookup_default_filter))
                {
                    string[] filterDefs = lookuprelatedCol.mc_ui_lookup_default_filter.Split('\\');
                    Regex userFieldRgxp = new Regex(@"\{user\.(.[^}]+)\}");
                    user u = user.getUserByID(user_id);
                    foreach (string filterDef in filterDefs)
                    {
                        string[] filterPart = filterDef.Split(new[] { "||" }, StringSplitOptions.None);
                        string filter_value = filterPart[2];
                        Match userField = userFieldRgxp.Match(filter_value);
                        if (userField.Success)
                        {
                            if (u.extra_keys.ContainsKey(userField.Groups[1].Value))
                                filter_value = (string)u.extra_keys[userField.Groups[1].Value];
                            else
                                throw new Exception(string.Format("Default-Filter user parameter '{0}' not found.", userField.Groups[1].Value));
                        }

                        filterInfo.filters.Add(new filterElement()
                        {
                            field = filterPart[0],
                            operatore = filterPart[1],
                            value = filter_value
                        });
                        _Metadati_Colonne filteringCol = mmd.GetMetadati_Colonnes("", tab.md_id.ToString(), "", filterPart[0]).FirstOrDefault();
                        if (filteringCol == null)
                            throw new Exception(string.Format("Colonna '{0}' non trovata. Default lookup filter definition '{1}'", filterPart[0], lookuprelatedCol.mc_display_string_in_view));

                        string currentFldLUp = RawHelpers.getFullyQualifiedColumnName(filteringCol, "mysql");
                        innerWhere = AppendFilter(filteringCol, filterInfo, logicOperator, currentFldLUp, innerWhere, tab, "", user_id);
                    }
                }
            }

            if (pKey != null)
            {
                if (filterInfo != null && filterInfo.filters.FirstOrDefault(x => x.field == "__extra") != null && lookuprelatedCol != null && string.IsNullOrEmpty(lookuprelatedCol.mc_ui_lookup_default_filter))
                {

                }
                else
                {
                    where = where + string.Format("{0}", innerWhere == "" ? "" : (where == "" ? innerWhere : " AND (" + innerWhere.Substring(6) + ")"));
                }
            }

            return where;

        }

        private static void ManageAggregates(List<AggregationInfo> aggregates, string where, MySqlConnection connection, List<AggregationResult> aggregateValues, string safetableName, string join)
        {
            if (aggregates != null && aggregates.Count > 0)
            {
                string aggregateFields = "";
                foreach (AggregationInfo agg in aggregates)
                {
                    foreach (string ag in agg.aggregate.Split(','))
                    {
                        if (agg.field.IndexOf("fk_") < 0)
                        {
                            aggregateFields += (string.IsNullOrEmpty(aggregateFields) ? "" : ", ") + string.Format("{0}({1}) AS " + agg.field, ag, safetableName + "." + EscapeDBObjectName(agg.field));
                        }
                    }
                }

                Dapper.SqlMapper.FastExpando aggValue = connection.Query(string.Format("SELECT {0} FROM {1} {2} {3} {4}", aggregateFields, safetableName, join, where, ""), commandTimeout: int.Parse(ConfigHelper.GetSettingAsString("autoGeneratedQueryTimeout"))).FirstOrDefault();

                foreach (AggregationInfo agg in aggregates)
                {
                    foreach (string ag in agg.aggregate.Split(','))
                    {
                        if (agg.field.IndexOf("fk_") < 0)
                        {
                            string aggValueString = "";

                            if (aggValue.data[agg.field] != null)
                                aggValueString = aggValue.data[agg.field].ToString();

                            aggregateValues.Add(new AggregationResult()
                            {
                                field = agg.field,
                                aggregateValue = string.IsNullOrEmpty(aggValueString) ? new Nullable<decimal>() : new Nullable<decimal>(decimal.Parse(aggValueString)),
                                aggregation = ag
                            });
                        }
                    }
                }

            }
        }

        public static string BuildDynamicFieldList(metaRawModel mmd, List<_Metadati_Colonne> lst, _Metadati_Tabelle tab, Dictionary<aliasPair, string> joins, string formulaLookup, List<string> joinsAppend, int mcId, _Metadati_Colonne_Lookup lookuprelatedCol, string extraFields = "")
        {
            string fieldList = "";

            if (lst.Count > 0)
            {
                bool fixFormulaLookupFieldListDuplication = false;

                lst.ForEach((fld) =>
                {

                    string safeAlias = EscapeDBObjectName(fld.mc_nome_colonna);

                    string currentFld = GetCurrentFieldString(tab, fld);

                    _Metadati_Colonne_Lookup col = fld as _Metadati_Colonne_Lookup;
                    if (col != null)
                    {
                        _Metadati_Tabelle relatedTable = mmd.GetMetadati_Tabelles(col.mc_ui_lookup_entity_name).FirstOrDefault();
                        if (relatedTable == null)
                        {
                            string safeappend = EscapeDBObjectName(col.mc_ui_lookup_entity_name.Replace(" ", "_") + "___" + col.mc_ui_lookup_dataTextField + "__" + col.mc_nome_colonna);

                            fieldList += (fieldList == "" ? "" : ", ") + string.Format(" {0} AS {1}", currentFld, safeappend);
                        }
                        else
                        {
                            fieldList = JoinBuilder(relatedTable, fld, col, joins, currentFld, tab, fieldList);
                        }
                    }

                    if (!string.IsNullOrEmpty(fld.mc_custom_join))
                    {
                        joinsAppend.AddRange(fld.mc_custom_join.Split(new string[] { "LEFT JOIN" }, StringSplitOptions.None));
                    }
                    if (lookuprelatedCol != null && !string.IsNullOrEmpty(lookuprelatedCol.mc_custom_join) && lookuprelatedCol.mc_ui_lookup_dataValueField == fld.mc_nome_colonna)
                    {
                        string[] all_joins = lookuprelatedCol.mc_custom_join.Split(new string[] { "LEFT JOIN" }, StringSplitOptions.None);

                        if (all_joins.Length > 1)
                        {
                            string firstJoin = all_joins[1];

                            string realTableName = firstJoin.Split(new string[] { " AS " }, StringSplitOptions.None)[0].Trim();

                            string aliasToFix = firstJoin.Split(new string[] { " AS " }, StringSplitOptions.None)[1].Split(new string[] { " ON " }, StringSplitOptions.None)[0].Trim();

                            for (int lindx = 2; lindx < all_joins.Length; lindx++)
                            {
                                string replaced = Regex.Replace(all_joins[lindx], Regex.Escape(aliasToFix), realTableName);
                                joinsAppend.Add(replaced);
                            }
                        }
                    }


                    if (!fld.mc_is_primary_key && !string.IsNullOrEmpty(formulaLookup))
                    {
                        if (!fixFormulaLookupFieldListDuplication)
                        {
                            fieldList += (fieldList == "" ? "" : ", ") + string.Format(" {0} AS {1}", formulaLookup, lookuprelatedCol.mc_ui_lookup_dataTextField);
                            fixFormulaLookupFieldListDuplication = true;
                        }
                    }
                    else
                        fieldList += (fieldList == "" ? "" : ", ") + currentFld + " AS " + EscapeDBObjectName(fld.mc_nome_colonna);

                });
            }

            return fieldList + (string.IsNullOrEmpty(extraFields) ? "" : ", " + extraFields);
        }

        private static string JoinBuilder(_Metadati_Tabelle relatedTable, _Metadati_Colonne fld, _Metadati_Colonne_Lookup col, Dictionary<aliasPair, string> joins, string currentFld, _Metadati_Tabelle tab, string fieldList)
        {
            string safeEntityName = GetTableName(relatedTable);
            string safeUniqueEntityName = EscapeDBObjectName(fld.mc_nome_colonna + "_" + col.mc_ui_lookup_entity_name);
            string calculatedText = col.mc_ui_lookup_computed_dataTextField;

            if (relatedTable.skipColumns)
                relatedTable.skipColumns = false;

            var safeTextCol = relatedTable._Metadati_Colonnes.FirstOrDefault(xk => xk.mc_nome_colonna == col.mc_ui_lookup_dataTextField);
            if (safeTextCol == null)
                safeTextCol = relatedTable._Metadati_Colonnes.FirstOrDefault(xk => xk.mc_real_column_name == col.mc_ui_lookup_dataTextField);

            if (safeTextCol == null)
                throw new Exception(string.Format("Colonna {0} Descrittiva per la lookup {1} mancante sulla tabella {2}", col.mc_ui_lookup_dataTextField, col.mc_nome_colonna, relatedTable.md_nome_tabella));

            string safeTextField = EscapeDBObjectName(string.IsNullOrEmpty(safeTextCol.mc_real_column_name) ? safeTextCol.mc_nome_colonna : safeTextCol.mc_real_column_name);

            string comboTxtValue;

            var isAlias = !relatedTable._Metadati_Colonnes.Any(xk => xk.mc_real_column_name == col.mc_ui_lookup_dataValueField);
            if (isAlias && relatedTable.md_nome_tabella != "tabella_reticolare")
            {
                string realName = relatedTable._Metadati_Colonnes.FirstOrDefault(xk => xk.mc_nome_colonna.ToLower() == col.mc_ui_lookup_dataValueField.ToLower()).mc_real_column_name;

                if (!string.IsNullOrEmpty(realName))
                    col.mc_ui_lookup_dataValueField = relatedTable._Metadati_Colonnes.FirstOrDefault(xk => xk.mc_nome_colonna.ToLower() == col.mc_ui_lookup_dataValueField.ToLower()).mc_real_column_name;
            }

            aliasPair ap = joins.Keys.FirstOrDefault(x => x.table_name == col.mc_ui_lookup_entity_name && x.fk_name != col.mc_ui_lookup_dataValueField);

            if (col.mc_ui_lookup_dataValueField != "mc_nome_colonna")
            {
                if (ap == null)
                {
                    if (!string.IsNullOrEmpty(col.mc_ui_lookup_dataValueField))
                    {
                        string joinn = string.Format(" LEFT JOIN {0} AS {3} ON {1} = {2} ", safeEntityName, currentFld, safeUniqueEntityName + "." + EscapeDBObjectName(col.mc_ui_lookup_dataValueField), safeUniqueEntityName);
                        var currentAP = new aliasPair()
                        {
                            table_name = col.mc_ui_lookup_entity_name,
                            alias_name = safeUniqueEntityName,
                            fk_name = col.mc_ui_lookup_dataValueField
                        };
                        joins.Add(currentAP, joinn);

                        List<_Metadati_Colonne_Lookup> loos = relatedTable._Metadati_Colonnes.OfType<_Metadati_Colonne_Lookup>().ToList();

                        loos.ForEach(x =>
                        {
                            tab._Metadati_Colonnes.OfType<_Metadati_Colonne_Lookup>().ToList().ForEach(y =>
                            {
                                if (x.mc_ui_lookup_entity_name == y.mc_ui_lookup_entity_name)
                                {
                                    string nomeTabX = ((_Metadati_Colonne)x)._Metadati_Tabelle.md_route_name;
                                    aliasPair apX = joins.Keys.FirstOrDefault(a => a.table_name == nomeTabX);
                                    if (joins.ContainsKey(apX))
                                    {
                                        aliasPair apY = joins.Keys.FirstOrDefault(a => a.table_name == y.mc_ui_lookup_entity_name);
                                        if (apY != null)
                                        {
                                            if (joins.ContainsKey(apY))
                                            {
                                                string joinPart = " AND " + apX.alias_name + "." + x.mc_nome_colonna + "=" + apY.alias_name + "." + apY.fk_name;
                                                if (currentAP.alias_name == apX.alias_name)
                                                {
                                                    //TODO CREATE A NEW DERIVED ALIAS AND PLUG A NEW JOIN CLAUSE IN JOINS-ARRAY
                                                }
                                                else
                                                {
                                                    joinn += joinPart;
                                                    joins[currentAP] = joinn;
                                                }
                                            }
                                        }
                                    }
                                }
                            });
                        });
                    }
                }
                else
                {
                    joins[ap] = joins[ap] + " AND " + string.Format("{0} = {1} ", currentFld, ap.alias_name + "." + EscapeDBObjectName(col.mc_ui_lookup_dataValueField));
                }
            }

            if (!string.IsNullOrEmpty(col.mc_ui_lookup_entity_name) && !string.IsNullOrEmpty(col.mc_ui_lookup_dataTextField))
            {
                string safeappend = EscapeDBObjectName(col.mc_ui_lookup_entity_name.Replace(" ", "_") + "___" + col.mc_ui_lookup_dataTextField + "__" + col.mc_nome_colonna);

                if (ap == null)
                    comboTxtValue = ((!string.IsNullOrEmpty(calculatedText)) ? calculatedText : safeUniqueEntityName + "." + safeTextField);
                else
                    comboTxtValue = ((!string.IsNullOrEmpty(calculatedText)) ? calculatedText : ap.alias_name + "." + safeTextField);

                if (col.mc_ui_lookup_dataValueField == "mc_nome_colonna")
                    comboTxtValue = "''";

                fieldList += (fieldList == "" ? "" : ", ") + string.Format(" {0} AS {1}", comboTxtValue, safeappend);
            }
            return fieldList;
        }

        public static string BuildFinalJoin(_Metadati_Tabelle tab, Dictionary<aliasPair, string> joins, List<string> joinsAppend)
        {
            string joinList = "";

            if (string.IsNullOrEmpty(tab.md_join_override))
            {
                joinList = CreateJoinString(joins, joinList);
                foreach (string jj in joinsAppend)
                {
                    if (!string.IsNullOrWhiteSpace(jj))
                    {
                        Match m = Regex.Match(jj.Trim(), ".+ AS (.+) ON ", RegexOptions.IgnoreCase);

                        if (m.Success)
                        {
                            if (!joinList.ToUpper().Contains(" AS " + m.Groups[1].Value.ToUpper() + " ON ") /*|| !joinList.Contains(" AS " + m.Groups[1].Value + " on ") ||
                                !joinList.Contains(" as " + m.Groups[1].Value + " ON ") ||!joinList.Contains(" as " + m.Groups[1].Value + " on ")*/)
                            {
                                if (jj.Trim().StartsWith("AND "))
                                    joinList += string.Format(" {0} ", jj.Trim());
                                else
                                    joinList += string.Format(" LEFT JOIN {0} ", jj.Trim());
                            }
                        }
                    }
                }
            }
            else
            {
                joinList = tab.md_join_override;
            }

            return joinList;
        }

        private static string CreateJoinString(Dictionary<aliasPair, string> joins, string joinList)
        {
            string joinString = " ";
            foreach (aliasPair j in joins.Keys)
                joinString += joins[j] + " ";
            return joinString + " " + joinList;
        }

        public static string GetRealOperator(string operatore)
        {
            switch (operatore)
            {
                case "gte":
                    return ">=";

                case "ge":
                    return ">=";

                case "gt":
                    return ">";

                case "lte":
                    return "<=";

                case "le":
                    return "<=";

                case "lt":
                    return "<";

                case "eq":
                    return "=";

                case "neq":
                    return "!=";

                case "contains":
                    return "like";

                case "startswith":
                    return "like";

                case "endswith":
                    return "like";

                case "between":
                    return "between";

                case "isnull":
                    return "is null";

                case "isnotnull":
                    return "is not null";

                case "eqor":
                    return "eqor";

                case "eqorlogic":
                    return "eqorlogic";

                case "eqall":
                    return "eqall";

                case "eqorconcatenate":
                    return "eqorconcatenate";

                case "maparea":
                    return "maparea";

                case "mapdistance":
                    return "mapdistance";

                default:
                    return "=";
            }
        }

        private static void AppendFilterMultipleCheck(filterElement f, _Metadati_Colonne_Grid mm, _Metadati_Tabelle tabel, string realOperator, ref string where, string logicOperator, string userId)
        {
            string nestedWhere = "";

            _Metadati_Tabelle mmTable = _Metadati_Tabelle.getTableMetadataFromRoute(mm.mc_ui_grid_manytomany_route);

            using (MySqlConnection con = metaQueryMySql.GetOpenConnection(false, mmTable.md_conn_name))
            {
                long tot;
                List<AggregationResult> ar;

                string safeTableName = RawHelpers.getStoreTableName(mmTable, "mysql");
                string localTableName = RawHelpers.getStoreTableName(tabel, "mysql");


                if (realOperator == "eqor")
                {
                    FilterInfos fiNest = new FilterInfos();
                    fiNest.logic = "OR";
                    fiNest.filters = new List<filterElement>();

                    f.value.Split(',').ToList().ForEach((fltrVal) =>
                    {
                        fiNest.filters.Add(new filterElement() { field = mm.mc_ui_grid_manytomany_related_id_field, operatore = "eq", value = EscapeValueStrict(fltrVal).ToString() });
                    });

                    nestedWhere = BuildDynamicSelectQuery(mmTable._Metadati_Colonnes.ToList(), null, null, null, fiNest, "OR", true, con, out tot, null, out ar, userId, "", 0, "", true); //.Where(x => x.mc_nome_colonna == mm.mc_ui_grid_manytomany_local_id_field)

                    //NEEDED TO EXCLUDE THE COMBO DESCRIPTION FIELD ASSOCIATED WITH <mc_ui_grid_manytomany_local_id_field> LOOKUP-COLUMN
                    nestedWhere = string.Format("SELECT {1}.{0} FROM ", mm.mc_ui_grid_manytomany_local_id_field, safeTableName) + nestedWhere.Split(new string[] { "FROM" }, StringSplitOptions.None)[1];

                    string part = " ( " + localTableName + "." + RawHelpers.escapeDBObjectName(mm.mc_ui_grid_local_id_field, "mysql") + " IN (" + nestedWhere + ") ";

                    where += ((where == "") ? " where " : " " + logicOperator) + part;

                }
                else if (realOperator == "eqall")
                {
                    var complexNestedWhere = "";
                    f.value.Split(',').ToList().ForEach((fltrVal) =>
                    {
                        //TODO
                        ////******************BETTER SOLUTION****************************************
                        //SELECT [hts1].[config].[Utente].[UtenteId] AS [UtenteId], [hts1].[config].[Utente].[UserName] AS [UserName],  ''  AS [colonna_002_testo], [hts1].[config].[Utente].[AziendaId] AS [AziendaId], [hts1].[config].[Utente].[FlAgente] AS [FlAgente], [hts1].[config].[Utente].[FlPartner] AS [FlPartner], [hts1].[config].[Utente].[FlSegnalatore] AS [FlSegnalatore], [hts1].[config].[Utente].[FlAmministratore] AS [FlAmministratore], [hts1].[config].[Utente].[FlFiltroProvincie] AS [FlFiltroProvincie] 
                        //FROM [hts1].[config].[Utente]     
                        //    UtenteId IN 
                        //        select M.UtenteId
                        //        from [config].[Utente] M
                        //        group by M.UtenteId
                        ////*************************************************************************

                        FilterInfos fiComplexNest = new FilterInfos();
                        fiComplexNest.logic = "AND";
                        fiComplexNest.filters = new List<filterElement>();
                        fiComplexNest.filters.Add(new filterElement() { field = mm.mc_ui_grid_manytomany_related_id_field, operatore = "eq", value = EscapeValueStrict(fltrVal).ToString() });

                        nestedWhere = BuildDynamicSelectQuery(mmTable._Metadati_Colonnes.ToList(), null, null, null, fiComplexNest, "AND", true, con, out tot, null, out ar, userId, "", 0, "", true); //.Where(x => x.mc_nome_colonna == mm.mc_ui_grid_manytomany_local_id_field)

                        //NEEDED TO EXCLUDE THE COMBO-DESCRIPTION-FIELD ASSOCIATED WITH <mc_ui_grid_manytomany_local_id_field> LOOKUP-COLUMN
                        nestedWhere = string.Format("SELECT {1}.{0} FROM ", RawHelpers.escapeDBObjectName(mm.mc_ui_grid_manytomany_local_id_field, "mysql"), safeTableName) + nestedWhere.Split(new string[] { "FROM" }, StringSplitOptions.None)[1];

                        complexNestedWhere = complexNestedWhere + (string.IsNullOrEmpty(complexNestedWhere) ? "" : " INTERSECT ") + nestedWhere;

                    });

                    where += ((where == "") ? " where " : " " + logicOperator) + " ( " + localTableName + "." + RawHelpers.escapeDBObjectName(mm.mc_ui_grid_local_id_field, "mysql") + " IN (" + complexNestedWhere + ") ";
                }

            }
        }

        private static string AppendFilter(_Metadati_Colonne fld, FilterInfos filterInfo, string logicOperator, string current_fld, string where, _Metadati_Tabelle tabel, string formula_lookup = "", string user_id = "", bool isNested = false)
        {
            filterInfo.filters.Where(x => (fld == null && x.nestedFilters != null) || (x.field != null && x.field.ToLower() == fld.mc_nome_colonna.ToLower() && x.field != "__extra" && !x.isHaving)).ToList().ForEach((f) =>
            {

                var realOperator = GetRealOperator(f.operatore);
                string quote = fld != null ? RawHelpers.getQuoteFromColumn(fld) : "";
                var valore = f.value;

                if (fld != null && fld.mc_ui_column_type == "multiple_check")
                {
                    _Metadati_Colonne_Grid mm = fld as _Metadati_Colonne_Grid;
                    AppendFilterMultipleCheck(f, mm, tabel, realOperator, ref where, logicOperator, user_id);

                }
                else if (realOperator == "eqor")
                {
                    string nestedWhere = "";

                    f.value.Split(',').ToList()
                    .ForEach(x =>
                    {
                        nestedWhere = nestedWhere + (string.IsNullOrEmpty(nestedWhere) ? "(" : " OR ") + current_fld + " = " + string.Format(" {0}{1}{0} ", quote, x);
                    });

                    where += ((where == "") ? " where " : " " + logicOperator + " ") + nestedWhere;

                }
                else if (realOperator == "eqorlogic")
                {
                    string orWhere = "";

                    f.value.Split(',').ToList().ForEach((fltrVal) =>
                    {
                        orWhere += (string.IsNullOrEmpty(orWhere) ? "" : " OR ") + string.Format("{0} = {2}{1}{2} ", f.field, fltrVal, quote);
                    });

                    where += ((where == "") ? " where " : " " + logicOperator + " ") + " ( " + orWhere;

                }
                else if (realOperator == "eqall")
                {
                    string orWhere = "";

                    f.value.Split(',').ToList().ForEach((fltrVal) =>
                    {
                        orWhere += (string.IsNullOrEmpty(orWhere) ? "" : " OR ") + string.Format("{0} = {2}{1}{2} ", f.field, fltrVal, quote);
                    });

                    where += ((where == "") ? " where " : " " + logicOperator + " ") + " ( " + orWhere;

                }
                else if (realOperator == "eqorconcatenate")
                {
                    string nestedWhere = "";

                    f.value.Split(',').ToList()
                    .ForEach(x =>
                    {
                        nestedWhere = nestedWhere + (string.IsNullOrEmpty(nestedWhere) ? "(" : " OR ") + current_fld + " "
                            + string.Format(" like '%, {0}%'", x);
                    });

                    nestedWhere = nestedWhere + ")";

                    where += ((where == "") ? " where " : " " + logicOperator + " ") + nestedWhere;

                }
                else if (realOperator == "maparea")
                {
                    string lat_field = "";
                    string lon_field = "";

                    dynamic mapProps = null;
                    if (!string.IsNullOrEmpty(fld.mc_props_bag))
                    {
                        dynamic extraProps = RawHelpers.deserialize(fld.mc_props_bag, null);
                        if (extraProps != null)
                        {
                            mapProps = extraProps.mapProperties;
                        }
                    }

                    bool singleGeography = false;

                    if ((mapProps != null && mapProps.map_type == "point") || fld.mc_db_column_type == "point")
                    {
                        singleGeography = true;
                        lat_field = string.Format("X({0})", fld.mc_nome_colonna);
                        lon_field = string.Format("Y({0})", fld.mc_nome_colonna);
                    }

                    if (fld.mc_ui_column_type == "google_map")
                    {
                        lat_field = "latitude";
                        lon_field = "longitude";

                        if (mapProps != null && mapProps.linked_point_field != null)
                        {
                            lat_field = string.Format("X({0})", mapProps.linked_point_field);
                            lon_field = string.Format("Y({0})", mapProps.linked_point_field);
                        }
                        else if (mapProps != null && mapProps.latitude_field != null)
                        {
                            lat_field = mapProps.latitude_field;
                            lon_field = mapProps.longitude_field;
                        }
                    }

                    if (string.IsNullOrEmpty(lat_field) || string.IsNullOrEmpty(lon_field))
                    {
                        if (mapProps != null && (mapProps.map_type == "polyline" || mapProps.map_type == "polygon" || mapProps.map_type == "geometry"))
                        {
                            string polylineWhere = string.Format(" ( ST_Contains(GeomFromText('{0}') ,{1}) = 1 || ST_Intersects(GeomFromText('{0}') ,{1}) = 1 )", f.value, fld.mc_nome_colonna);
                            where += ((where == "") ? " where " : " " + logicOperator + " ") + polylineWhere;

                            filterInfo.filters.Remove(f);
                            return;
                        }
                        else
                            throw new Exception("Please specify spatial field.");
                    }

                    string geoWhere;
                    if (singleGeography)
                        geoWhere = string.Format(" ( ST_Contains(GeomFromText('{0}') , {1}) = 1 )", f.value, fld.mc_nome_colonna);
                    else
                        geoWhere = string.Format(" ( ST_Contains( GeomFromText( '{0}' ) , Point({1}, {2}) ) = 1 )", f.value, lat_field, lon_field);

                    where += ((where == "") ? " where " : " " + logicOperator + " ") + geoWhere;

                }
                else if (realOperator == "mapdistance")
                {
                    dynamic mapProps = null;
                    if (!string.IsNullOrEmpty(fld.mc_props_bag))
                    {
                        dynamic extraProps = RawHelpers.deserialize(fld.mc_props_bag, null);
                        if (extraProps != null)
                        {
                            mapProps = extraProps.mapProperties;
                        }
                    }

                    string lat = "";
                    string lng = "";
                    string radius = "";

                    List<Match> mc = Regex.Matches(f.value, @"^CIRCLE\(\(([^\s]+\s[^\)]+)\),([^\)]+)\)$").OfType<Match>().ToList();

                    if (mc.Count > 0)
                    {
                        string lat_field = "";
                        string lon_field = "";

                        if ((mapProps != null && mapProps.map_type == "point") || fld.mc_db_column_type == "point")
                        {
                            lat_field = string.Format("Y({0})", fld.mc_nome_colonna);
                            lon_field = string.Format("X({0})", fld.mc_nome_colonna);
                        }
                        else if (fld.mc_ui_column_type == "google_map")
                        {
                            if (mapProps != null && mapProps.linked_point_field != null)
                            {
                                lat_field = string.Format("X({0})", mapProps.linked_point_field);
                                lon_field = string.Format("Y({0})", mapProps.linked_point_field);
                            }
                            else if (mapProps != null && mapProps.latitude_field != null)
                            {
                                lat_field = string.Format("cast({0} as decimal(18,12))", mapProps.latitude_field);
                                lon_field = string.Format("cast({0} as decimal(18,12))", mapProps.longitude_field);
                            }

                            _Metadati_Colonne pointField = tabel._Metadati_Colonnes.FirstOrDefault(x => x.mc_db_column_type == "point");

                            if ((string.IsNullOrEmpty(lat_field) || string.IsNullOrEmpty(lon_field)) && pointField != null)
                            {
                                lat_field = string.Format("Y({0})", pointField.mc_nome_colonna);
                                lon_field = string.Format("X({0})", pointField.mc_nome_colonna);
                            }
                            else if (string.IsNullOrEmpty(lat_field) || string.IsNullOrEmpty(lon_field))
                            {
                                lat_field = "cast(latitude as decimal(18,12))";
                                lon_field = "cast(longitude as decimal(18,12))";
                            }
                        }
                        else if (mapProps != null && mapProps.map_type != "point")
                            throw new Exception("Distance filter not supported from polyline and polygon.");

                        if (string.IsNullOrEmpty(lat_field) || string.IsNullOrEmpty(lon_field))
                        {
                            throw new Exception("Please specify spatial field.");
                        }

                        lat = mc.First().Groups[1].Value.ToString().Split(' ')[0];
                        lng = mc.First().Groups[1].Value.ToString().Split(' ')[1];
                        radius = mc.First().Groups[2].Value.ToString();

                        if (string.IsNullOrEmpty(lat) || string.IsNullOrEmpty(lng) || string.IsNullOrEmpty(radius))
                        {
                            throw new Exception("Please specify point of origin and radius");
                        }

                        string lat1 = lat + " - " + radius + " / 69";
                        string lat2 = lat + " + " + radius + " / 69";
                        string lon1 = lng + " - " + radius + " / abs(cos(radians(" + lat + "))*69)";
                        string lon2 = lng + " + " + radius + " / abs(cos(radians(" + lat + "))*69)";

                        //reduce points using rectangle containing the circle
                        string rectangleOptimizationWhere = string.Format("{0} between ({1}) and ({2}) and {3} between ({4}) and ({5})", lat_field, lat1, lat2, lon_field, lon1, lon2);

                        //average earth radius in meters: 6 371.000 -> distance in meters
                        //could be a parameter specified in mapProps -> depending on area -> to improve precision
                        string geoWhere = string.Format("(    (  {4} >= (  6371000 * 2 * ASIN(SQRT( POWER(SIN(({0} - {2}) *  pi()/180 / 2), 2) + COS({0} * pi()/180) * COS({2} * pi()/180) * POWER(SIN(({1} - {3}) * pi()/180 / 2), 2) ))  )   ) AND ( {5} )    ) ", lat, lng, lat_field, lon_field, radius, rectangleOptimizationWhere);

                        where += ((where == "") ? " where " : " " + logicOperator + " ") + geoWhere;
                    }

                }
                else
                {
                    AppendBaseFilter(fld, current_fld, f.operatore, realOperator, f.value, f.__extra, logicOperator, ref where);
                }







                where += " )";

                if (!isNested)
                    filterInfo.filters.Remove(f);
            });

            return where;
        }

        private static void AppendBaseFilter(_Metadati_Colonne fld, string currentFld, string originalOperator, string realOperator, string filterValue, bool xtra, string logicOperator, ref string where, bool forceQuotes = false)
        {
            string quote = forceQuotes ? "'" : RawHelpers.getQuoteFromColumn(fld);

            if (string.Equals(realOperator, "between", StringComparison.OrdinalIgnoreCase))
            {
                string fromValue = null;
                string toValue = null;

                if (!string.IsNullOrWhiteSpace(filterValue))
                {
                    var rawRange = filterValue.Trim();
                    try
                    {
                        var token = JToken.Parse(rawRange);
                        if (token is JObject obj)
                        {
                            fromValue = obj["from"]?.ToString();
                            toValue = obj["to"]?.ToString();
                        }
                    }
                    catch
                    {
                        string[] separators = new[] { "||", "|", ";", "," };
                        foreach (var separator in separators)
                        {
                            if (rawRange.Contains(separator))
                            {
                                var parts = rawRange.Split(new[] { separator }, 2, StringSplitOptions.None);
                                fromValue = parts.Length > 0 ? parts[0] : null;
                                toValue = parts.Length > 1 ? parts[1] : null;
                                break;
                            }
                        }
                    }
                }

                fromValue = string.IsNullOrWhiteSpace(fromValue) ? null : EscapeValue(fromValue.Trim())?.ToString();
                toValue = string.IsNullOrWhiteSpace(toValue) ? null : EscapeValue(toValue.Trim())?.ToString();
                if (fromValue == null || toValue == null)
                {
                    return;
                }

                if (fld.mc_ui_column_type == "number" || fld.mc_ui_column_type == "number_slider")
                {
                    fromValue = fromValue.Replace(",", ".");
                    toValue = toValue.Replace(",", ".");
                }

                var targetExpression = (fld.mc_is_computed.HasValue && fld.mc_is_computed.Value ? fld.mc_computed_formula : currentFld);
                where += ((where == "") ? " where " : " " + logicOperator + " ")
                    + "( (" + targetExpression + ") between "
                    + string.Format("{0}{1}{2} and {3}{4}{5} {6}",
                        quote, fromValue, quote,
                        quote, toValue, quote,
                        (xtra ? " OR 1=1" : ""));
                return;
            }

            string leftExtraOperator = quote;

            string rightExtraOperator = leftExtraOperator;

            if (realOperator == "like")
            {
                if (originalOperator == "contains")
                {
                    leftExtraOperator = quote + "%";
                    rightExtraOperator = "%" + quote;
                }
                if (originalOperator == "startswith")
                {
                    leftExtraOperator = quote;
                    rightExtraOperator = "%" + quote;
                }
                if (originalOperator == "endswith")
                {
                    leftExtraOperator = quote + "%";
                    rightExtraOperator = quote;
                }
            }

            string async_extra_condition = "";

            if (filterValue != null)
                filterValue = EscapeValue(filterValue).ToString();
            else if (filterValue == null && originalOperator == "eq")
                return;
            else
                filterValue = null;

            if (realOperator == "is null")
            {
                if (fld.mc_db_column_type == "point" || fld.mc_db_column_type == "geometry")
                    where += ((where == "") ? " where " : " " + logicOperator + " ") + "(" + "AsText(" + currentFld + ")" + " is null";
                else
                    where += ((where == "") ? " where " : " " + logicOperator + " ") + "(" + currentFld + " is null";
            }
            else if (realOperator == "is not null")
            {
                if (fld.mc_db_column_type == "point" || fld.mc_db_column_type == "geometry")
                    where += ((where == "") ? " where " : " " + logicOperator + " ") + "(" + "AsText(" + currentFld + ")" + " is not null";
                else
                    where += ((where == "") ? " where " : " " + logicOperator + " ") + "(" + currentFld + " is not null";
            }
            else if (filterValue == "{NULL}")
            {
                where += ((where == "") ? " where " : " " + logicOperator + " ") + "(" + currentFld + " is null";
            }
            else if (fld.mc_ui_column_type == "number" || fld.mc_ui_column_type == "number_slider")
            {
                filterValue = filterValue.Replace(",", ".");
                where += ((where == "") ? " where " : " " + logicOperator + " ") + "( (" + (fld.mc_is_computed.HasValue && fld.mc_is_computed.Value ? fld.mc_computed_formula : currentFld) + ")" + realOperator + string.Format(" {0}{1}{2} {3} {4}", leftExtraOperator, filterValue, rightExtraOperator, async_extra_condition, (xtra ? " OR 1=1" : ""));

            }
            else if (fld.mc_ui_column_type == "datetime" && filterValue != null && filterValue != "")
            {
                //FIX UTC TIME ISSUE 
                //se f.value è del format YYYY-MM-ddTHH:mm:ssZ -> il DateTime.Parse applica UTC time. 
                string parsed = filterValue.ToString().Replace(@"""", "");
                DateTime d = DateTime.Parse(parsed);
                filterValue = d.ToString("yyyy-MM-dd HH:mm:ss").Replace(".", ":");

                where += ((where == "") ? " where " : " " + logicOperator + " ") + "( DATE_FORMAT(" + currentFld + ", '%Y-%m-%d %H:%i:%s')" + realOperator + string.Format(" {0}{1}{2} {3} ", leftExtraOperator, filterValue, rightExtraOperator, async_extra_condition);

            }
            else if (fld.mc_ui_column_type == "date" && filterValue != null && filterValue != "")
            {
                //FIX UTC TIME ISSUE 
                string parsed = filterValue.ToString().Replace(@"""", "");
                DateTime d = DateTime.Parse(parsed);
                if (realOperator == "<=")
                    d = new DateTime(d.Year, d.Month, d.Day, 23, 59, 59);
                else
                {
                    if (d.Hour != 0)
                        d = d.AddHours(1);
                }

                filterValue = d.ToString("yyyyMMdd");

                where += ((where == "") ? " where " : " " + logicOperator + " ") + "( DATE_FORMAT(" + currentFld + ", '%Y%m%d')" + realOperator + string.Format(" {0}{1}{2} {3} ", leftExtraOperator, filterValue, rightExtraOperator, async_extra_condition);

            }
            else if ((fld.mc_ui_column_type == "boolean" || fld.mc_ui_column_type == "number_boolean" || fld.mc_ui_column_type == "bit") && filterValue != null && filterValue != "")
            {
                if (filterValue.ToString().ToLower() == "false" || filterValue.ToString().ToLower() == "0")
                    filterValue = "0";
                else
                    filterValue = "1";

                where += ((where == "") ? " where " : " " + logicOperator + " ") + "( (" + (fld.mc_is_computed.HasValue && fld.mc_is_computed.Value ? fld.mc_computed_formula : currentFld) + ")" + realOperator + string.Format(" {0}{1}{2} {3} ", leftExtraOperator, filterValue, rightExtraOperator, async_extra_condition);

            }
            else if (fld.mc_db_column_type == "point")
            {
                currentFld = string.Format("AsText({0})", currentFld);
                Pair point = RawHelpers.pointStringToPoint(filterValue, "mysql");
                filterValue = string.Format("POINT({0} {1})", point.First.ToString(), point.Second.ToString());
                leftExtraOperator = rightExtraOperator = "'";
                where += ((where == "") ? " where " : " " + logicOperator + " ") + "( (" + (fld.mc_is_computed.Value ? fld.mc_computed_formula : currentFld) + ")" + realOperator + string.Format(" {0}{1}{2} ", leftExtraOperator, filterValue, rightExtraOperator);
            }
            else if (fld.mc_db_column_type == "geometry")
            {
                currentFld = string.Format("AsText({0})", currentFld);
                leftExtraOperator = rightExtraOperator = "'";
                where += ((where == "") ? " where " : " " + logicOperator + " ") + "( (" + (fld.mc_is_computed.Value ? fld.mc_computed_formula : currentFld) + ")" + realOperator + string.Format(" {0}{1}{2} ", leftExtraOperator, filterValue, rightExtraOperator);
            }
            else
            {
                if (fld.mc_db_column_type == "uniqueidentifier")
                    leftExtraOperator = rightExtraOperator = "'";

                if (filterValue != null)
                {
                    filterValue = filterValue.Replace(Environment.NewLine, @"\n");
                }

                where += ((where == "") ? " where " : " " + logicOperator + " ") + "( (" + (fld.mc_is_computed.HasValue && fld.mc_is_computed.Value ? fld.mc_computed_formula : currentFld) + ")" + realOperator + string.Format(" {0}{1}{2} {3} {4} ", leftExtraOperator, filterValue, rightExtraOperator, async_extra_condition, (xtra ? " OR 1=1" : ""));
            }

        }

        public static string BuildDynamicWhere(FilterInfos filterInfo, PageInfo PageInfo, metaRawModel mmd, List<_Metadati_Colonne> lst, _Metadati_Tabelle tab, _Metadati_Colonne pKey, string logicOperator, string distinct, Dictionary<aliasPair, string> joins, string formulaLookup, string userId, int mcId = 0, _Metadati_Colonne linkedCol = null)
        {
            string where = "";

            string tableName = tab.md_nome_tabella;
            string safetableName = GetTableName(tab);

            #region paging

            if (filterInfo != null)
            {
                filterElement pagingFragment = filterInfo.filters.FirstOrDefault(x => RawHelpers.ParseNull(x.field).IndexOf("@page=") == 0);
                if (pagingFragment != null && PageInfo != null)
                {
                    PageInfo.currentPage = int.Parse(pagingFragment.field.Replace("@page=", ""));
                    filterInfo.filters.Remove(pagingFragment);
                }
            }
            #endregion

            #region special cases

            if (tab.md_is_reticular)
            {
                tableName = "tabella_reticolare";
                safetableName = (string.IsNullOrEmpty(tab.md_db_name) ? "" : "`" + tab.md_db_name + "`." + (!string.IsNullOrEmpty(tab.md_schema_name) ? "`" + tab.md_schema_name + "`" : "") + ".") + EscapeDBObjectName(tableName);
                where += ((where == "") ? " where " : " " + logicOperator + " ") + safetableName + "." + tab.reticular_key_name + " = " + (tab.reticular_key_value.HasValue ? tab.reticular_key_value.Value.ToString() : "null");
            }

            if (ConfigHelper.GetSettingAsString("logicDeleteField") != null)
            {
                string logicDeleteField = ConfigHelper.GetSettingAsString("logicDeleteField");
                string logicDeleteValue = ConfigHelper.GetSettingAsString("logicDeleteValue");

                if (!string.IsNullOrEmpty(logicDeleteField))
                {
                    _Metadati_Colonne logic_del_key = tab._Metadati_Colonnes.FirstOrDefault(x => x.mc_nome_colonna == logicDeleteField);
                    if (logic_del_key != null)
                    {
                        where += ((string.IsNullOrEmpty(where)) ? " where " : " " + logicOperator + " ") + " coalesce(" + safetableName + "." + EscapeDBObjectName(RawHelpers.getStoreColumnName(logic_del_key)) + string.Format(", '') <> '{0}'", logicDeleteValue);
                    }
                }
            }
            else
            {
                if (tab.md_has_logic_delete)
                {
                    _Metadati_Colonne logic_del_key = tab._Metadati_Colonnes.FirstOrDefault(x => x.mc_is_logic_delete_key.HasValue && x.mc_is_logic_delete_key.Value);
                    if (logic_del_key != null)
                    {
                        where += ((where == "") ? " where " : " " + logicOperator + " ") + " coalesce(" + safetableName + "." + EscapeDBObjectName(RawHelpers.getStoreColumnName(logic_del_key)) + ",0) = 0";
                    }
                    else if (tab.md_is_reticular)
                    {
                        where += ((where == "") ? " where " : " " + logicOperator + " ") + " coalesce(" + safetableName + ".[cancellato],0) = 0";
                    }
                }
            }

            if (!string.IsNullOrEmpty(tab.md_record_restriction_key_user_field_list))
            {
                SysInfo sys = mmd.GetSysInfos();
                if (sys != null)
                {
                    string keyvalue = userId;
                    PlugExtraLogic(ref keyvalue, ref where, joins, tab, sys, userId, safetableName, logicOperator);
                }
            }

            if (!string.IsNullOrEmpty(tab.md_default_filter))
            {
                string[] filters = tab.md_default_filter.Split('\\');
                Regex userFieldRgxp = new Regex(@"\{user\.(.[^}]+)\}");
                user u = user.getUserByID(userId);
                foreach (string filter in filters)
                {
                    var split = filter.Split(new string[] { "||" }, StringSplitOptions.None);
                    if (split.Length < 2)
                    {
                        throw new Exception(string.Format("Default filter definition '{0}' invalid", tab.md_default_filter));
                    }

                    string filter_value = split.Length > 2 ? split[2] : "";
                    Match userField = userFieldRgxp.Match(filter_value);
                    if (userField.Success)
                    {
                        if (u.extra_keys.ContainsKey(userField.Groups[1].Value))
                            filter_value = (string)u.extra_keys[userField.Groups[1].Value];
                        else
                            throw new Exception(string.Format("Default-Filter user parameter '{0}' not found.", userField.Groups[1].Value));
                    }

                    if (filterInfo == null)
                    {
                        filterInfo = new FilterInfos();
                        filterInfo.filters = new List<filterElement>();
                    }

                    string filterField = split[0];
                    string filterOperatore = split[1];
                    bool alreadyExists = filterInfo.filters.Any(x =>
                        x != null &&
                        x.field == filterField &&
                        x.operatore == filterOperatore &&
                        ((x.value ?? "").ToString() == (filter_value ?? "").ToString()));
                    if (!alreadyExists)
                    {
                        filterInfo.filters.Add(new filterElement() { field = filterField, operatore = filterOperatore, value = filter_value });
                    }
                }


            }

            #endregion

            List<_Metadati_Colonne> cols = tab._Metadati_Colonnes;

            if (tab._Metadati_Colonnes == null)
            {
                tab.skipColumns = false;
                cols = tab._Metadati_Colonnes;
            }

            _Metadati_Colonne_Lookup lc = linkedCol as _Metadati_Colonne_Lookup;

            if (filterInfo != null)
            {
                if (filterInfo.filters.Count > 0)
                {
                    tab._Metadati_Colonnes.ForEach((fld) =>
                    {
                        string currentFld = GetCurrentFieldString(tab, fld);

                        if (filterInfo.filters.Any(x => x.field == "__extra"))
                            where = AppendFilter(fld, filterInfo, logicOperator, (currentFld), where, tab, formulaLookup, userId);
                        else
                        {
                            bool useFormula = false;
                            if (lc != null && lc.mc_ui_lookup_dataTextField == fld.mc_nome_colonna && !string.IsNullOrEmpty(formulaLookup))
                            {
                                useFormula = true;

                                where = AppendFilter(fld, filterInfo, logicOperator, (String.IsNullOrEmpty(formulaLookup) ? (!fld.mc_is_computed.HasValue || !fld.mc_is_computed.Value ? currentFld : fld.mc_nome_colonna) : (useFormula ? formulaLookup : currentFld)), where, tab, formulaLookup, userId);
                            }
                            else
                            {
                                where = AppendFilter(fld, filterInfo, logicOperator, (String.IsNullOrEmpty(formulaLookup) ? (!fld.mc_is_computed.HasValue || !fld.mc_is_computed.Value ? currentFld : fld.mc_nome_colonna) : (useFormula ? formulaLookup : currentFld)), where, tab, formulaLookup, userId);

                            }
                        }
                    });

                    List<filterElement> unboundedFilters = filterInfo.filters.Where(x => !tab._Metadati_Colonnes.Any(y => y.mc_nome_colonna == x.field)).ToList();
                    unboundedFilters.ForEach(fi =>
                    {
                        if (fi != null && fi.custom_join_clause != null && fi.custom_join_clause.Length > 0)
                        {
                            where += ((where == "") ? " where " : " " + logicOperator + " ") + "( " + string.Format(fi.custom_where_clause, EscapeValue(fi.value)) + " ) ";

                            int co = 0;
                            fi.custom_join_clause.ToList().ForEach(cj =>
                            {

                                string dummy_alias = fi.field + co.ToString();
                                joins.Add(new aliasPair()
                                {
                                    alias_name = dummy_alias,
                                    fk_name = dummy_alias,
                                    table_name = dummy_alias
                                }, cj);
                                co++;
                            });
                        }
                    });
                }
            }

            bool addOperator = true;

            parseNestedFilters(filterInfo, logicOperator, tab, formulaLookup, userId, ref where, ref addOperator);

            return where;
        }

        private static void parseNestedFilters(FilterInfos filterInfo, string logicOperator, _Metadati_Tabelle tab, string formulaLookup, string userId, ref string where, ref bool addOperator)
        {
            if (filterInfo.filters.Any(fi => fi.field != "__extra"))
            {
                bool hasNested = false;

                foreach (filterElement fi in filterInfo.filters.Where(z => z.field != "__extra").ToList())
                {

                    if (fi.skip) continue;

                    string safeColumnName;
                    string currentFld = "";

                    if (fi.nestedFilters != null && fi.nestedFilters.filters.Count > 0)
                    {
                        string parentesis = "";

                        hasNested = true;

                        where += ((where == "") ? " where ( " : (!addOperator ? " (" : logicOperator + " ( "));
                        int nestedIndex = 0;

                        foreach (var nestedFld in fi.nestedFilters.filters)
                        {
                            if (nestedFld.skip || nestedFld.field == null) continue;

                            _Metadati_Colonne fld = tab._Metadati_Colonnes.FirstOrDefault(x => x.mc_nome_colonna == nestedFld.field || x.mc_real_column_name == nestedFld.field);

                            if (fld != null)
                            {
                                safeColumnName = EscapeDBObjectName(RawHelpers.getStoreColumnName(fld));
                                currentFld = (string.IsNullOrEmpty(tab.md_db_name) ? "" : "`" + tab.md_db_name + "`.") + EscapeDBObjectName(tab.md_nome_tabella) + "." + safeColumnName;

                                AppendBaseFilter(fld, currentFld, nestedFld.operatore, GetRealOperator(nestedFld.operatore), nestedFld.value, false, (addOperator && nestedIndex > 0 ? fi.nestedFilters.logic : ""), ref where);

                                nestedIndex++;
                            }
                            else
                            {
                                addOperator = false;
                                parseNestedFilters(fi.nestedFilters, fi.nestedFilters.logic, tab, "", userId, ref where, ref addOperator);
                            }

                            addOperator = true;

                            parentesis += ")";
                        }

                        where += parentesis;
                    }
                    else
                    {
                        _Metadati_Colonne fld = tab._Metadati_Colonnes.FirstOrDefault(x => x.mc_nome_colonna == fi.field || x.mc_real_column_name == fi.field);
                        safeColumnName = EscapeDBObjectName(RawHelpers.getStoreColumnName(fld));
                        currentFld = (string.IsNullOrEmpty(tab.md_db_name) ? "" : "`" + tab.md_db_name + "`.") + EscapeDBObjectName(tab.md_nome_tabella) + "." + safeColumnName;

                        if (fld != null)
                        {
                            AppendBaseFilter(fld, currentFld, fi.operatore, GetRealOperator(fi.operatore), fi.value, false, logicOperator, ref where);

                            where += " )";
                        }
                    }

                    fi.skip = true;
                }

                if (where.Count(x => x == '(') > where.Count(x => x == ')') && hasNested)
                    where += " )";
            }

            return;
        }

        public static rawPagedResult GetManyToManyOptionsForInsert(string mc_ui_grid_route, int mc_ui_grid_pagesize, string mc_ui_grid_related_id_field, string mc_ui_grid_display_field, string user_id)
        {
            PageInfo pi = null;

            if (mc_ui_grid_pagesize > 0)
            {
                pi = new PageInfo() { pageSize = mc_ui_grid_pagesize, currentPage = 0 };
            }

            string[] restriction = { mc_ui_grid_related_id_field, mc_ui_grid_display_field };

            rawPagedResult data = GetFlatData(user_id, mc_ui_grid_route, 0, null, null, pi, null, "AND", true, null, restriction.ToList());
            if (data != null)
            {
                foreach (Dapper.SqlMapper.FastExpando rd in data.results)
                {
                    rd.data["___selected"] = false;
                    rd.data["___added"] = false;
                    rd.data["___deleted"] = false;
                }
            }
            return data;
        }

        private static void ParseGridColumns(List<_Metadati_Colonne> lst, string userId, List<SqlMapper.FastExpando> rows)
        {
            _Metadati_Colonne pkey = lst.FirstOrDefault(x => x.mc_is_primary_key is true);

            List<_Metadati_Colonne_Grid> grid_cols = lst.OfType<_Metadati_Colonne_Grid>().Where(x => x.mc_ui_grid_is_multiple_check).ToList();

            if (grid_cols.Count > 0 && pkey == null)
                throw new Exception("Missing primary key on current route.");

            List<_Metadati_Colonne> pkeys = lst.Where(x => x.mc_is_primary_key is true).ToList();

            List<_Metadati_Colonne_Slider> chartCols = lst.OfType<_Metadati_Colonne_Slider>().Where(x => x.use_chart_in_view > 0).ToList();

            if (chartCols.Count > 0)
            {
                using (MySqlConnection con = GetOpenConnection(false))
                {
                    foreach (_Metadati_Colonne_Slider chartCol in chartCols)
                    {
                        if (string.IsNullOrEmpty(chartCol.mc_chart_select))
                            throw new Exception(string.Format("Chart select not specified for column {0}", chartCol.mc_display_string_in_view));

                        foreach (Dapper.SqlMapper.FastExpando row in rows)
                        {
                            var dbArgs = new DynamicParameters();
                            foreach (_Metadati_Colonne pk in pkeys)
                            {
                                dbArgs.Add("@" + pk.mc_nome_colonna, row.data[pk.mc_nome_colonna].ToString());
                            }
                            List<Dapper.SqlMapper.FastExpando> chartRows = (List<Dapper.SqlMapper.FastExpando>)con.Query(chartCol.mc_chart_select, dbArgs);

                            List<Dictionary<string, object>> charts = new List<Dictionary<string, object>>();
                            chartRows.ForEach(cr =>
                            {
                                charts.Add((Dictionary<string, object>)cr.data);
                            });

                            row.data["__chartData"] = charts;
                        }
                    }
                }
            }

            foreach (_Metadati_Colonne_Grid grid_col in grid_cols)
            {
                List<_Metadati_Colonne> grid_col_metadata = _Metadati_Colonne.getColonneByUserID(grid_col.mc_ui_grid_manytomany_route, 0, userId, dataMode.insert, null);

                if (grid_col_metadata.Count > 0)
                {
                    _Metadati_Tabelle manyToManyRoute;
                    _Metadati_Colonne manyToManyKey;
                    using (metaRawModel mmd = new metaRawModel())
                    {
                        manyToManyRoute = mmd.GetMetadati_Tabelles(grid_col.mc_ui_grid_manytomany_route).FirstOrDefault();
                        manyToManyRoute.skipColumns = false;
                        manyToManyKey = manyToManyRoute._Metadati_Colonnes.FirstOrDefault(x => x.mc_is_primary_key is true);
                    }

                    string localKeyName = grid_col.mc_ui_grid_manytomany_local_id_field;
                    string relatedKeyName = grid_col.mc_ui_grid_manytomany_related_id_field;
                    if (localKeyName == "")
                        localKeyName = pkey.mc_nome_colonna;
                    _Metadati_Colonne_Lookup local_key = grid_col_metadata.First(x => x.mc_nome_colonna == localKeyName) as _Metadati_Colonne_Lookup;
                    _Metadati_Colonne_Lookup related_key = grid_col_metadata.First(x => x.mc_nome_colonna == relatedKeyName) as _Metadati_Colonne_Lookup;

                    string display_col = related_key.mc_ui_lookup_entity_name.Replace(" ", "_") + "___" + related_key.mc_ui_lookup_dataTextField + "__" + related_key.mc_nome_colonna;
                    foreach (Dapper.SqlMapper.FastExpando row in rows)
                    {
                        string row_id = row.data[pkey.mc_nome_colonna].ToString();

                        List<Dictionary<string, object>> relatedFullDataClone = GetManyToManyOptions(localKeyName, row_id, pkey, userId, grid_col, row, relatedKeyName, manyToManyKey, related_key, display_col);

                        row.data[grid_col.mc_nome_colonna] = relatedFullDataClone;
                    }
                }
            }
        }


        private static List<Dictionary<string, object>> GetManyToManyOptions(string localKeyName, string row_id, _Metadati_Colonne pkey, string userId, _Metadati_Colonne_Grid gridCol, SqlMapper.FastExpando row, string relatedKeyName, _Metadati_Colonne manyToManyKey, _Metadati_Colonne_Lookup related_key, string display_col)
        {
            FilterInfos fltr = RawHelpers.createStandardFilter(localKeyName, row_id, pkey);


            string[] restriction = { gridCol.mc_ui_grid_related_id_field, gridCol.mc_ui_grid_display_field };

            rawPagedResult relatedData = GetFlatData(userId, gridCol.mc_ui_grid_manytomany_route, 0, null, null, null, fltr, "AND", true, null, null, related_key.mc_ui_lookup_combo_text_edit_computed_dataTextField, related_key.mc_id);

            FilterInfos fltrRemoteRoute = new FilterInfos() { logic = "OR" };
            fltrRemoteRoute.filters = new List<filterElement>();

            relatedData.results.OfType<Dapper.SqlMapper.FastExpando>().ToList().ForEach(rd =>
            {
                fltrRemoteRoute.filters.Add(new filterElement() { field = gridCol.mc_ui_grid_related_id_field, operatore = "eq", value = rd.data[gridCol.mc_ui_grid_manytomany_related_id_field].ToString() });
            });
            rawPagedResult relatedFullData = GetFlatData(userId, gridCol.mc_ui_grid_route, 0, null, null, null, fltrRemoteRoute, "OR", true, null, restriction.ToList(), "", 0, true);

            List<Dictionary<string, object>> relatedFullDataClone = new List<Dictionary<string, object>>();

            if (relatedFullData != null)
            {
                foreach (Dapper.SqlMapper.FastExpando rd in relatedFullData.results)
                {
                    Dictionary<string, object> cloned = new Dictionary<string, object>(rd.data);
                    Dapper.SqlMapper.FastExpando selected = relatedData.results.OfType<Dapper.SqlMapper.FastExpando>().FirstOrDefault(x => x.data[localKeyName].ToString() == row.data[gridCol.mc_ui_grid_local_id_field].ToString() && x.data[relatedKeyName].ToString() == rd.data[gridCol.mc_ui_grid_related_id_field].ToString());
                    if (selected != null)
                    {
                        cloned[manyToManyKey.mc_nome_colonna] = selected.data[manyToManyKey.mc_nome_colonna];
                        cloned[gridCol.mc_ui_grid_display_field] = selected.data[display_col];

                        cloned["___selected"] = true;
                    }
                    else
                        cloned["___selected"] = false;

                    cloned["___added"] = false;
                    cloned["___deleted"] = false;

                    relatedFullDataClone.Add(cloned);
                }
            }
            return relatedFullDataClone;
        }

        private static void AppendSort(_Metadati_Colonne fld, string orderSafetableName, ref string sort, string sortDir)
        {
            if (fld == null)
                return;

            _Metadati_Colonne_Lookup look = fld as _Metadati_Colonne_Lookup;

            dynamic serverProps = null;
            string customSortFormula = null;

            if (fld.mc_props_bag != null)
            {
                dynamic extraProps = RawHelpers.deserialize(fld.mc_props_bag, null);
                if (extraProps != null)
                {
                    Dictionary<string, object> extraDict = NormalizeToDictionary((object)extraProps);
                    if (extraDict != null && extraDict.TryGetValue("serverProperties", out object serverPropsObj))
                    {
                        serverProps = serverPropsObj;

                        Dictionary<string, object> serverPropsDict = NormalizeToDictionary(serverPropsObj);
                        if (serverPropsDict != null &&
                            serverPropsDict.TryGetValue("custom_sort_formula", out object customSortObj))
                        {
                            customSortFormula = RawHelpers.ParseNull(customSortObj);
                        }
                    }
                }
            }

            if (!string.IsNullOrWhiteSpace(customSortFormula))
            {
                sort += ((sort == "") ? " ORDER BY " : ", ") + customSortFormula.ToUpper().Replace(";", "").Replace("GO ", "");
            }
            else
            {
                if (look != null)
                {
                    orderSafetableName = EscapeDBObjectName(look.mc_nome_colonna + "_" + look.mc_ui_lookup_entity_name);

                    string calculatedText = look.mc_ui_lookup_computed_dataTextField;

                    using (metaRawModel ctx = new metaRawModel())
                    {
                        _Metadati_Tabelle related = ctx.GetMetadati_Tabelles(look.mc_ui_lookup_entity_name).FirstOrDefault();

                        if (related != null)
                        {
                            related.skipColumns = false;
                            _Metadati_Colonne descField = related._Metadati_Colonnes.FirstOrDefault(x => x.mc_nome_colonna == look.mc_ui_lookup_dataTextField);
                            string safeField = RawHelpers.getStoreColumnName(descField);
                            string safename = EscapeDBObjectName(look.mc_ui_lookup_entity_name) + "." + EscapeDBObjectName(safeField);

                            if (look.mc_is_computed.HasValue && look.mc_is_computed.Value)
                                safename = "(" + look.mc_computed_formula + ")";

                            if (string.IsNullOrEmpty(look.mc_ui_lookup_computed_dataTextField))
                            {
                                sort += ((sort == "") ? " ORDER BY " : ", ") + orderSafetableName + "." + safeField + " " + sortDir;
                            }
                            else
                            {
                                sort += ((sort == "") ? " ORDER BY " : ", ") + look.mc_ui_lookup_computed_dataTextField + " " + sortDir;
                            }
                        }
                    }
                }
                else
                {
                    sort += ((sort == "") ? " ORDER BY " : ", ") + "(" + ((fld.mc_is_computed.HasValue && fld.mc_is_computed.Value) ? "(SELECT " + fld.mc_computed_formula + ")" : orderSafetableName + "." + EscapeDBObjectName(RawHelpers.getStoreColumnName(fld))) + ") " + sortDir;
                }
            }
        }

        public static string BuildDynamicOrderBy(List<SortInfo> SortInfo, List<_Metadati_Colonne> lst, _Metadati_Tabelle tab, _Metadati_Colonne pKey, FilterInfos clonedfilters)
        {
            string sort = "";
            string safetableName = GetTableName(tab);
            string orderSafetableName = safetableName;

            if (SortInfo != null)
            {
                if (SortInfo.Count > 0)
                {
                    foreach (SortInfo s in SortInfo.Where(x => x.field != null))
                    {
                        _Metadati_Colonne cooll = lst.FirstOrDefault(x => x.mc_nome_colonna == s.field);

                        if (cooll == null)
                            cooll = lst.OfType<_Metadati_Colonne_Lookup>().FirstOrDefault(x => x.mc_ui_lookup_entity_name.Replace(" ", "_") + "___" + x.mc_ui_lookup_dataTextField + "__" + x.mc_nome_colonna == s.field);

                        AppendSort(cooll, orderSafetableName, ref sort, s.dir);
                    }
                }
                else if (tab.md_is_reticular)
                {
                    AppendSort(pKey, orderSafetableName, ref sort, "DESC");
                }
                else
                {
                    foreach (_Metadati_Colonne col in lst.Where(x => !string.IsNullOrEmpty(x.mc_default_sort)).OrderBy(x => x.mc_default_multisort_order))
                    {
                        AppendSort(col, orderSafetableName, ref sort, col.mc_default_sort);
                    }
                }
            }
            else
            {
                foreach (_Metadati_Colonne col in lst.Where(x => !string.IsNullOrEmpty(x.mc_default_sort)).OrderBy(x => x.mc_default_multisort_order))
                {
                    AppendSort(col, orderSafetableName, ref sort, col.mc_default_sort);
                }
            }

            string fixOrder = "";
            string inverted = "";

            if (pKey != null)
            {
                tab.skipColumns = false;

                bool invertSort = false;
                string pKeyName = RawHelpers.getStoreColumnName(pKey);

                string pkOrder = sort.IndexOf(pKeyName) >= 0 ? "" : string.Format("{0}.{1} ASC", safetableName, pKeyName);
                if (clonedfilters.filters.FirstOrDefault(x => x.field == "__extra") != null)
                {
                    var flr = clonedfilters.filters.FirstOrDefault(x => x.field == pKey.mc_nome_colonna);
                    string pkeyFilterValue = "";
                    string quote = "";
                    _Metadati_Colonne overSortCol;

                    if (flr == null)
                    {
                        flr = clonedfilters.filters.First(x => x.field != "__extra");
                        pkeyFilterValue = flr.value;

                        overSortCol = tab._Metadati_Colonnes.FirstOrDefault(x => x.mc_nome_colonna == flr.field || x.mc_real_column_name == flr.field);

                        int ou;
                        if (!int.TryParse(flr.value, out ou))
                            pkeyFilterValue = "'" + flr.value + "'";
                    }
                    else
                    {
                        overSortCol = tab._Metadati_Colonnes.FirstOrDefault(x => x.mc_nome_colonna == flr.field || x.mc_real_column_name == flr.field);
                        quote = RawHelpers.getQuoteFromColumn(overSortCol);

                        pkeyFilterValue = flr.value;

                        invertSort = true;

                        inverted = "case when " + safetableName + "." + RawHelpers.getStoreColumnName(overSortCol) + " = " + quote + pkeyFilterValue + quote + " then 0 else 1 end, " + (sort == "" ? "" : sort.Replace("ORDER BY", "") + ", ") + pkOrder;

                    }

                    pkOrder = "case when " + safetableName + "." + RawHelpers.getStoreColumnName(overSortCol) + " = " + quote + pkeyFilterValue + quote + " then 0 else 1 end, " + pkOrder;

                }

                if (!invertSort)
                    fixOrder = ((sort == "") ? string.Format(" ORDER BY {0}", pkOrder) : sort + (!string.IsNullOrEmpty(pkOrder) ? ", " + pkOrder : ""));
                else
                    fixOrder = string.Format(" ORDER BY {0}", inverted);
            }
            else
            {
                _Metadati_Colonne filtre_default = lst.FirstOrDefault(x => !x.mc_is_computed.HasValue || !x.mc_is_computed.Value);
                if (filtre_default == null)
                {
                    filtre_default = null;
                }

                string filter_col_name = RawHelpers.getStoreColumnName(filtre_default);
                fixOrder = String.IsNullOrEmpty(sort) ? string.Format(" ORDER BY {0}.{1}", safetableName, EscapeDBObjectName(filter_col_name)) : sort;
            }

            fixOrder = fixOrder.Trim();

            if (fixOrder.LastIndexOf(",") == fixOrder.Length - 1)
                fixOrder = fixOrder.Substring(0, fixOrder.Length - 1);

            return fixOrder;
        }

        private static string ParseCustomSelectClause(string customSelectClause, string where, string query)
        {
            if (customSelectClause.ToLower().Contains("where"))
            {
                if (string.IsNullOrEmpty(where))
                {
                    query = string.Format("{0}", customSelectClause);
                }
                else
                {
                    if (customSelectClause.ToLower().Contains("group by"))
                    {
                        string[] unordered_clause = customSelectClause.Split(new string[] { "group by" }, StringSplitOptions.None);
                        string replacing_where = " and (" + where.Replace(" where ", " ") + ")";
                        query = string.Format("{0} {1} GROUP BY {2}", unordered_clause[0], replacing_where, unordered_clause[1]);
                    }
                    else if (customSelectClause.ToLower().Contains("order by"))
                    {
                        string[] unordered_clause = customSelectClause.Split(new string[] { "order by" }, StringSplitOptions.None);
                        string replacing_where = " and (" + where.Replace(" where ", " ") + ")";
                        query = string.Format("{0} {1} ORDER BY {2}", unordered_clause[0], replacing_where, unordered_clause[1]);
                    }
                    else
                    {
                        string replacing_where = " and (" + where.Replace(" where ", " ") + ")";
                        query = string.Format("{0} {1}", customSelectClause, replacing_where);
                    }
                }
            }
            else
            {
                query = string.Format("{0} {1} ", customSelectClause, where);
            }
            return query;
        }

        public static void PlugExtraLogic(ref string keyvalue, ref string where, Dictionary<aliasPair, string> joins, _Metadati_Tabelle tab, SysInfo sys, string userId, string safetableName, string logicOperator)
        {

            user ute = user.getUserByID(userId);
            List<role> otherRoles = user.getMultipleRoleID(userId);

            if (ute.isAdmin)
                return;

            string predicate;
            string innerRolePredicate = "";

            otherRoles.ForEach(or =>
            {
                innerRolePredicate += (string.IsNullOrEmpty(innerRolePredicate) ? " OR " : "") + "ruolo_id=\"" + or.role_id + "\"";
            });

            predicate = string.Format("(utenteid=@user_id or ruoloid=@role_id {0} or aziendaid=@azienda_id) and md_id=@md_id", innerRolePredicate);
            using (metaRawModel context = new metaRawModel())
            {
                List<_Metadati_Utenti_Autorizzazioni_Tabelle> auth = context.GetMetadati_Utenti_Autorizzazioni_Tabelles(predicate, ute.role_id, userId, ute.azienda_id, tab.md_id).ToList();
                if (auth.Count > 0 && auth.First().muat_override_record_restriction)
                {
                    return;
                }
            }

            if (tab.md_record_restriction_key_user_field_list == sys.user_id_column_name)
            {
                if (string.IsNullOrEmpty(tab.md_logging_insert_user_field_name))
                    throw new Exception("Specifica insert user field");

                if (tab.md_logging_insert_user_field_name.Contains("*"))
                {
                    where += ((where == "") ? " where " : " " + logicOperator + " ") + "( " + safetableName + "." + EscapeDBObjectName(tab.md_logging_insert_user_field_name.Replace("*", "")) + " = '" + userId + "' or " + safetableName + "." + EscapeDBObjectName(tab.md_logging_insert_user_field_name.Replace("*", "")) + " is null ) ";
                }
                else if (tab.md_logging_insert_user_field_name.Contains("|"))
                {
                    string mappedField = tab.md_logging_insert_user_field_name.Split('|')[1];

                    where += ((where == "") ? " where " : " " + logicOperator + " ") + safetableName + "." + EscapeDBObjectName(mappedField) + " = '" + userId + "'";
                }
                else
                {
                    where += ((where == "") ? " where " : " " + logicOperator + " ") + safetableName + "." + EscapeDBObjectName(tab.md_logging_insert_user_field_name) + " = '" + userId + "'";
                }
            }
            else
            {

                if (!string.IsNullOrEmpty(tab.md_logging_azienda_field_name) && tab.md_record_restriction_key_user_field_list == "id_azienda")
                {
                    keyvalue = ute.azienda_id.ToString();
                    where += ((where == "") ? " where " : " " + logicOperator + " ") + getTableFullName(tab) + "." + tab.md_logging_azienda_field_name + " = " + keyvalue + "";
                }
                else
                {
                    keyvalue = ute.role_id;
                    string safeUserTableName = EscapeDBObjectName(GetUnqualifiedTableNameForMySql(sys.user_table_name));
                    where += ((where == "") ? " where " : " " + logicOperator + " ") + safeUserTableName + "." + tab.md_record_restriction_key_user_field_list + " = '" + keyvalue + "'";

                    aliasPair ap = joins.Keys.FirstOrDefault(x => x.table_name == safeUserTableName);
                    if (ap == null)
                        joins.Add(new aliasPair() { table_name = safeUserTableName, alias_name = safeUserTableName }, string.Format(" LEFT JOIN {0} ON {1}.{2} = {0}.{3} ", safeUserTableName, safetableName, EscapeDBObjectName(tab.md_logging_insert_user_field_name), sys.user_id_column_name));
                    else
                        joins[ap] = joins[ap] + " AND " + string.Format("{1}.{2} = {0}.{3} ", safeUserTableName, safetableName, EscapeDBObjectName(tab.md_logging_insert_user_field_name), sys.user_id_column_name);
                }
            }
        }

        private static string AppendHaving(_Metadati_Colonne fld, FilterInfos filterInfo, string logicOperator, string current_fld, string having, _Metadati_Tabelle tabel, Definizione_Universi def)
        {
            filterInfo.filters.Where(x => x.field != "__extra" && x.isHaving).ToList().ForEach((f) =>
            {
                string having_alias = f.havingAggregation + "_" + fld.mc_nome_colonna + "_" + def.id;

                var realOperator = GetRealOperator(f.operatore);
                string quote = RawHelpers.getQuoteFromColumn(fld);

                if (realOperator == "eqor")
                {
                    string nestedHaving = "";

                    f.value.Split(',').ToList()
                    .ForEach(x =>
                    {
                        nestedHaving = nestedHaving + (string.IsNullOrEmpty(nestedHaving) ? "(" : " OR ") + current_fld + " = " + string.Format(" {0}{1}{0} ", quote, x);
                    });

                    nestedHaving = nestedHaving + ")";

                    having += ((having == "") ? " having " : " " + logicOperator + " ") + nestedHaving;
                    filterInfo.filters.Remove(f);
                    return;
                }

                string leftExtraOperator = quote;

                string rightExtraOperator = leftExtraOperator;
                if (realOperator == "like")
                {
                    if (f.operatore == "contains")
                    {
                        leftExtraOperator = quote + "%";
                        rightExtraOperator = "%" + quote;
                    }
                    if (f.operatore == "startswith")
                    {
                        leftExtraOperator = quote;
                        rightExtraOperator = "%" + quote;
                    }
                    if (f.operatore == "endswith")
                    {
                        leftExtraOperator = quote + "%";
                        rightExtraOperator = quote;
                    }
                }

                string async_extra_condition = "";

                f.value = EscapeValue(f.value).ToString();

                if (fld.mc_ui_column_type == "datetime" && f.value != null && f.value != "")
                {
                    //FIX UTC TIME ISSUE 
                    string parsed = f.value.ToString().Replace(@"""", "");
                    DateTime d = DateTime.Parse(parsed);
                    f.value = d.AddHours(-1).ToString("yyyyMMdd HH:mm:ss");

                    having += ((having == "") ? " where " : " " + logicOperator + " ") + string.Format("( {0}(", f.havingAggregation) + "DATEADD(ms, -DATEPART(ms, " + current_fld + "), " + current_fld + ")" + ")" + realOperator + string.Format(" {0}{1}{2} {3} )", leftExtraOperator, f.value, rightExtraOperator, async_extra_condition);
                    filterInfo.filters.Remove(f);
                    return;

                }
                else if (fld.mc_ui_column_type == "date" && f.value != null && f.value != "")
                {
                    //FIX UTC TIME ISSUE 
                    string parsed = f.value.ToString().Replace(@"""", "");
                    DateTime d = DateTime.Parse(parsed, new System.Globalization.CultureInfo("en-US", false));
                    if (f.operatore == "le" || f.operatore == "lte")
                        d = new DateTime(d.Year, d.Month, d.Day, 23, 59, 59);
                    else
                    {
                        if (d.Hour != 0)
                            d = d.AddHours(1);
                    }

                    f.value = d.ToString("yyyyMMdd");

                    having += ((having == "") ? " having " : " " + logicOperator + " ") + string.Format("( {0}(", f.havingAggregation) + "DateAdd(day, datediff(day,0, " + current_fld + "), 0)" + ")" + realOperator + string.Format(" {0}{1}{2} {3} )", leftExtraOperator, f.value, rightExtraOperator, async_extra_condition);
                    filterInfo.filters.Remove(f);

                    return;
                    //
                }
                else if (fld.mc_ui_column_type == "number_boolean" && f.value != null && f.value != "")
                {
                    if (f.value.ToString().ToLower() == "false" || f.value.ToString().ToLower() == "0")
                        f.value = "0";
                    else
                        f.value = "1";
                }

                having += ((having == "") ? " having " : " " + logicOperator + " ") + string.Format("( {0}(", f.havingAggregation) + current_fld + ")" + realOperator + string.Format(" {0}{1}{2} {3} )", leftExtraOperator, f.value, rightExtraOperator, async_extra_condition);
                filterInfo.filters.Remove(f);
            });

            return having;
        }

        private static void AppendLoggingInsertFields(ref string field_list, ref string value_list, _Metadati_Tabelle tabel, string user_id, IDictionary<string, object> entity)
        {
            if (!string.IsNullOrEmpty(tabel.md_logging_insert_date_field_name))
            {
                if (tabel.md_logging_insert_date_field_name.Contains(","))
                {
                    foreach (string fld in tabel.md_logging_insert_date_field_name.Split(','))
                    {
                        field_list += (field_list == "" ? "" : ", ") + fld;
                        value_list += (value_list == "" ? "" : ", ") + "'" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss").Replace(".", ":") + "'";
                        entity[fld] = DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
                    }
                }
                else
                {
                    field_list += (field_list == "" ? "" : ", ") + tabel.md_logging_insert_date_field_name;
                    value_list += (value_list == "" ? "" : ", ") + "'" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss").Replace(".", ":") + "'";
                    entity[tabel.md_logging_insert_date_field_name] = DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
                }
            }

            if (!string.IsNullOrEmpty(tabel.md_logging_last_mod_date_field_name) && tabel.md_logging_last_mod_date_field_name != tabel.md_logging_insert_date_field_name)
            {
                if (tabel.md_logging_last_mod_date_field_name.Contains(","))
                {
                    foreach (string fld in tabel.md_logging_last_mod_date_field_name.Split(','))
                    {
                        field_list += (field_list == "" ? "" : ", ") + fld;
                        value_list += (value_list == "" ? "" : ", ") + "'" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss").Replace(".", ":") + "'";
                        entity[fld] = DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
                    }
                }
                else
                {
                    field_list += (field_list == "" ? "" : ", ") + tabel.md_logging_last_mod_date_field_name;
                    value_list += (value_list == "" ? "" : ", ") + "'" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss").Replace(".", ":") + "'";
                    entity[tabel.md_logging_last_mod_date_field_name] = DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
                }
            }

            if (!string.IsNullOrEmpty(tabel.md_logging_insert_user_field_name))
            {
                field_list += (field_list == "" ? "" : ", ") + tabel.md_logging_insert_user_field_name;
                value_list += (value_list == "" ? "" : ", ") + "'" + user_id + "'";
                entity[tabel.md_logging_insert_user_field_name] = user_id;
            }

            if (!string.IsNullOrEmpty(tabel.md_logging_last_mod_user_field_name) && tabel.md_logging_last_mod_user_field_name != tabel.md_logging_insert_user_field_name)
            {
                field_list += (field_list == "" ? "" : ", ") + tabel.md_logging_last_mod_user_field_name;
                value_list += (value_list == "" ? "" : ", ") + "'" + user_id + "'";
                entity[tabel.md_logging_last_mod_user_field_name] = user_id;
            }

            if (!string.IsNullOrEmpty(tabel.md_logging_azienda_field_name))
            {
                using (metaRawModel context = new metaRawModel())
                {
                    field_list += (field_list == "" ? "" : ", ") + tabel.md_logging_azienda_field_name;
                    user u = getUserByID(user_id);
                    if (u.has_azienda_id)
                        value_list += (value_list == "" ? "" : ", ") + "'" + u.azienda_id + "'";
                    else
                        value_list += (value_list == "" ? "" : ", ") + "null";
                }
            }
        }

        private static void AppendLoggingUpdateFields(ref string field_value_list, _Metadati_Tabelle tabel, string user_id, Dictionary<string, object> entity)
        {
            if (!string.IsNullOrEmpty(tabel.md_logging_last_mod_date_field_name))
            {
                if (tabel.md_logging_last_mod_date_field_name.Contains(","))
                {
                    foreach (string fld in tabel.md_logging_last_mod_date_field_name.Split(','))
                    {
                        field_value_list += (field_value_list == "" ? "" : ", ") + fld + "=" + string.Format("'{0}'", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss").Replace(".", ":"));
                        entity["fld"] = DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
                    }
                }
                else
                {
                    field_value_list += (field_value_list == "" ? "" : ", ") + tabel.md_logging_last_mod_date_field_name + "=" + string.Format("'{0}'", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss").Replace(".", ":"));
                    entity[tabel.md_logging_last_mod_date_field_name] = DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
                }

            }
            if (!string.IsNullOrEmpty(tabel.md_logging_last_mod_user_field_name))
            {
                field_value_list += (field_value_list == "" ? "" : ", ") + tabel.md_logging_last_mod_user_field_name + "=" + string.Format("'{0}'", user_id);
                entity[tabel.md_logging_last_mod_user_field_name] = user_id;
            }
        }

        private static void AppendLoggingDeleteFields(ref string delete_log, _Metadati_Tabelle tabel, string user_id, Dictionary<string, object> entity)
        {
            if (!string.IsNullOrEmpty(tabel.md_loggingdelete_date_field_name))
            {
                delete_log += (delete_log == "" ? "" : ", ") + tabel.md_loggingdelete_date_field_name + "=" + string.Format("'{0}'", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss").Replace(".", ":"));
                entity[tabel.md_loggingdelete_date_field_name] = DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
            }
            if (!string.IsNullOrEmpty(tabel.md_logging_delete_user_field_name))
            {
                delete_log += (delete_log == "" ? "" : ", ") + tabel.md_logging_delete_user_field_name + "=" + string.Format("'{0}'", user_id);
                entity[tabel.md_logging_delete_user_field_name] = user_id;
            }
        }

        #endregion

        private static string FinalizeCientSideGrouping(_Metadati_Tabelle tab, List<_Metadati_Colonne> lst, metaRawModel mmd, List<GroupInfo> GroupInfo, string safetableName, string join, string where, ref string fieldList)
        {
            string field_list = "";

            GroupInfo.ForEach(gi =>
            {
                string currentFld = safetableName + "." + EscapeDBObjectName(gi.field);
                field_list += (string.IsNullOrEmpty(field_list) ? "" : ", ") + currentFld;

                _Metadati_Colonne_Lookup col = lst.FirstOrDefault(x => x.mc_nome_colonna == gi.field) as _Metadati_Colonne_Lookup;
                if (col != null)
                {
                    _Metadati_Tabelle relatedTable = mmd.GetMetadati_Tabelles(col.mc_ui_lookup_entity_name).FirstOrDefault();
                    if (relatedTable != null)
                    {
                        string safeappend = EscapeDBObjectName(col.mc_ui_lookup_entity_name.Replace(" ", "_") + "___" + col.mc_ui_lookup_dataTextField + "__" + col.mc_nome_colonna);

                        string safeUniqueEntityName = EscapeDBObjectName(col.mc_nome_colonna + "_" + col.mc_ui_lookup_entity_name);
                        string safeTextField = EscapeDBObjectName(col.mc_ui_lookup_dataTextField);

                        field_list += (string.IsNullOrEmpty(field_list) ? "" : ", ") + string.Format("{0} AS {1}", safeUniqueEntityName + "." + safeTextField, safeappend);
                    }
                }
            });

            return string.Format("SELECT DISTINCT {0}, 1 as __group_header " +
                                     "FROM {1} {2} {3} ", field_list, safetableName, join, where);
        }

        private static string FinalizeServerSideGrouping(_Metadati_Tabelle tab, List<_Metadati_Colonne> lst, metaRawModel mmd, List<GroupInfo> GroupInfo, string safetableName, string join, string where, MySqlConnection connection, int skiprecords, PageInfo PageInfo)
        {
            string fieldList = "";
            string fieldListForCount = "";
            string orderListT = "";

            GroupInfo.ForEach(gi =>
            {
                string current_fld = safetableName + "." + EscapeDBObjectName(gi.field);
                fieldList += (string.IsNullOrEmpty(fieldList) ? "" : ", ") + current_fld;
                fieldListForCount += (string.IsNullOrEmpty(fieldListForCount) ? "" : ", ") + current_fld;

                _Metadati_Colonne dist_col = lst.FirstOrDefault(x => x.mc_nome_colonna == gi.field);
                string dist_col_name = RawHelpers.getStoreColumnName(dist_col);

                _Metadati_Colonne_Lookup col = lst.FirstOrDefault(x => x.mc_nome_colonna == gi.field) as _Metadati_Colonne_Lookup;
                if (col != null)
                {
                    _Metadati_Tabelle relatedTable = mmd.GetMetadati_Tabelles(col.mc_ui_lookup_entity_name).FirstOrDefault();
                    if (relatedTable != null)
                    {
                        string safeappend = EscapeDBObjectName(col.mc_ui_lookup_entity_name.Replace(" ", "_") + "___" + col.mc_ui_lookup_dataTextField + "__" + col.mc_nome_colonna);

                        string safeEntityName = GetTableName(relatedTable);
                        string safeUniqueEntityName = EscapeDBObjectName(col.mc_nome_colonna + "_" + col.mc_ui_lookup_entity_name);
                        string safeTextField = EscapeDBObjectName(col.mc_ui_lookup_dataTextField);
                        string calculatedText = col.mc_ui_lookup_computed_dataTextField;

                        fieldList += (string.IsNullOrEmpty(fieldList) ? "" : ", ") + string.Format("{0} AS {1}", string.IsNullOrEmpty(calculatedText) ? (safeUniqueEntityName + "." + safeTextField) : calculatedText, safeappend);

                        orderListT += (string.IsNullOrEmpty(orderListT) ? "" : ", ") + safeappend;

                    }
                }
                else
                {
                    orderListT += (string.IsNullOrEmpty(orderListT) ? "" : ", ") + dist_col_name;
                }
            });

            string countGroupQry = string.Format("SELECT COUNT(DISTINCT {0}) as conta_record FROM {1} {2} {3} {4}", fieldListForCount, safetableName, join, where, "");
            try
            {
                Dapper.SqlMapper.FastExpando jj = connection.Query(countGroupQry).FirstOrDefault();
                GroupInfo[0].groupCount = long.Parse(jj.data["conta_record"].ToString());
            }
            catch (Exception ex)
            {
                throw new Exception(ex.Message + " " + countGroupQry);
            }

            return " SELECT DISTINCT" + fieldList + ", 1 as __group_header " +
                      string.Format(" FROM {0} {1} {2} ", safetableName, join, where) +
                      "order by " + orderListT +
                      string.Format(" limit {0} offset {1}", PageInfo.pageSize, ((skiprecords == 0) ? 0 : skiprecords + 1));
        }

        public static string BuildDynamicUpdateQuery(Dictionary<string, object> entity, List<_Metadati_Colonne> metadata, string user_id, bool importing = false, bool isMeta = false)
        {
            string field_value_list = "";
            string where = "";
            string query = "";

            Dictionary<string, object> original = (importing || !entity.ContainsKey("__original") ? new Dictionary<string, object>() : entity["__original"] as Dictionary<string, object>);

            _Metadati_Tabelle tabel = metadata[0]._Metadati_Tabelle;
            string table_name = tabel.md_nome_tabella;

            if (tabel.md_is_reticular)
            {
                table_name = "tabella_reticolare";

            }

            if (!tabel.md_editable)
                throw new ValidationException("Modifica disabilitata");

            if (table_name == "_metadati__colonne")
            {
                string widget = entity["mc_ui_column_type"].ToString();
                switch (widget)
                {
                    case "lookupByID":
                        entity["voa_class"] = 2;

                        break;

                    case "number_slider":
                    case "number":
                        entity["voa_class"] = 3;

                        break;

                    case "upload":
                        entity["voa_class"] = 5;

                        break;

                    case "button":
                        entity["voa_class"] = 6;

                        break;

                    case "multiple_check":
                        entity["voa_class"] = 4;

                        break;

                    case "html_area":
                        entity["voa_class"] = 7;

                        break;

                    default:
                        entity["voa_class"] = 1;

                        break;
                }
            }

            string safetable_name = RawHelpers.getStoreTableName(tabel, "mysql");

            List<_Metadati_Colonne_Upload> metadataUpload = metadata.OfType<_Metadati_Colonne_Upload>().ToList();

            metadata.Where(x => !x.mc_is_computed.HasValue || x.mc_is_computed.Value is false || x.GetType() == typeof(_Metadati_Colonne_Grid)).ToList().ForEach((fld) =>
            {

                string safecolumn_name = EscapeDBObjectName(RawHelpers.getStoreColumnName(fld));

                if (isMeta && !fld.mc_is_primary_key && entity.ContainsKey("inheritFrom") && RawHelpers.ParseDouble(entity["inheritFrom"]) > 0)
                {
                    if (fld.mc_nome_colonna == "mc_ui_column_type")
                    {
                        entity[fld.mc_nome_colonna] = null; // CAN'T OVERRIDE WIDGET TYPE !!!
                    }
                    else if (original != null && entity.ContainsKey(fld.mc_nome_colonna) && original.ContainsKey(fld.mc_nome_colonna))
                    {
                        object valoreCheck = entity[fld.mc_nome_colonna];
                        if (RawHelpers.ParseNull(original[fld.mc_nome_colonna]) == RawHelpers.ParseNull(valoreCheck))
                        {
                            return;
                        }
                    }

                }

                if (tabel.md_logging_enable)
                {
                    if (fld.mc_nome_colonna == tabel.md_logging_last_mod_date_field_name || fld.mc_nome_colonna == tabel.md_logging_last_mod_user_field_name)
                    {
                        return;
                    }
                }


                if (fld.mc_nome_colonna == tabel.md_logging_last_mod_date_field_name || fld.mc_nome_colonna == tabel.md_logging_last_mod_user_field_name)
                {
                    field_value_list += (field_value_list == "" ? "" : ", ") + safetable_name + "." + safecolumn_name + " = CURRENT_TIMESTAMP";
                    return;
                }

                if (!fld.mc_logic_editable.Value && !fld.mc_is_primary_key & fld.mc_nome_colonna != "voa_class")
                {
                    return;
                }

                if (importing && (fld.hide_in_import.Value || !entity.ContainsKey(fld.mc_nome_colonna)))
                    return;

                _Metadati_Colonne_Button btnCol = fld as _Metadati_Colonne_Button;
                if (btnCol != null)
                    return;


                object valore = null;

                if (entity.ContainsKey(fld.mc_nome_colonna) && entity[fld.mc_nome_colonna] != null)
                    valore = entity[fld.mc_nome_colonna];

                string quote = ((fld.mc_db_column_type == "int" || fld.mc_db_column_type == "bit" || RawHelpers.ParseNull(valore) == "") ? "" : "'");

                if (fld.mc_validation_has.Value && fld.mc_validation_required.Value && valore == null && fld.mc_ui_column_type != "boolean" && fld.mc_ui_column_type != "number_boolean")
                    throw new ValidationException(string.Format("{0} non può essere null", fld.mc_display_string_in_view));

                valore = EscapeValue(valore);

                if (fld.mc_ui_column_type == "datetime" && valore != null && valore.ToString() != "")
                {
                    //FIX UTC TIME ISSUE 
                    string parsed = valore.ToString().Replace(@"""", "");
                    DateTime d = DateTime.Parse(parsed);
                    valore = d.ToString("yyyy-MM-dd HH:mm:ss").Replace(".", ":");
                }
                else if (fld.mc_ui_column_type == "date" && valore != null && valore.ToString() != "")
                {
                    //FIX UTC TIME ISSUE 
                    string parsed = valore.ToString().Replace(@"""", "");

                    if (tabel.md_is_reticular)
                    {
                        valore = parsed;
                    }
                    else
                    {
                        DateTime d = DateTime.Parse(parsed);
                        valore = d.ToString("yyyyMMdd");
                    }

                }
                else if (fld.mc_ui_column_type == "number" || fld.mc_ui_column_type == "number_slider")
                {
                    if (valore != null)
                    {
                        valore = valore.ToString().Replace(",", ".");
                        if (string.IsNullOrEmpty(valore.ToString())) //incomprensibile ma risolve...
                            valore = null;
                    }

                }
                else if ((fld.mc_ui_column_type == "boolean" || fld.mc_ui_column_type == "bit") && tabel.md_is_reticular)
                {
                    if (valore != null)
                    {
                        if (valore.ToString().ToLower() == "true")
                        {
                            valore = true;
                        }
                        else if (valore.ToString().ToLower() == "false")
                        {
                            valore = false;
                        }
                    }
                    else
                    {
                        if (fld.mc_validation_has.HasValue && fld.mc_validation_has.Value && fld.mc_validation_required.HasValue && fld.mc_validation_required.Value)
                        {
                            valore = false;
                        }
                    }
                }
                else if (fld.mc_ui_column_type == "number_boolean")
                {
                    if (valore != null)
                    {
                        if (valore.GetType() == typeof(bool))
                        {
                            if (!(bool)valore)
                                valore = 0;
                            else
                                valore = 1;
                        }
                        else
                        {
                            if (valore.ToString().ToLower() == "true")
                            {
                                valore = 1;
                            }
                            else if (valore.ToString().ToLower() == "false")
                            {
                                valore = 0;
                            }
                            else if (valore.ToString().ToLower() == "1")
                            {
                                valore = 1;
                            }
                            else if (valore.ToString().ToLower() == "0")
                            {
                                valore = 0;
                            }
                            else
                                valore = 0;
                        }
                    }
                    else
                        valore = 0;
                }
                else if (fld.mc_ui_column_type == "html_area")
                {
                    if (valore != null)
                    {
                        valore = Regex.Replace(valore.ToString(), @"url\(""([^""]+)""\)", delegate (Match match)
                        {
                            string v = match.ToString();
                            return v.Replace("\"", "''");
                        });
                    }
                }
                else if (fld.mc_db_column_type == "point")
                {
                    if (valore != null && !string.IsNullOrEmpty(valore.ToString()))
                    {
                        string rawGeo = valore.ToString();
                        Pair point = null;

                        try
                        {
                            if (rawGeo.TrimStart().StartsWith("{") && rawGeo.IndexOf("lat", StringComparison.OrdinalIgnoreCase) >= 0 && rawGeo.IndexOf("lng", StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                var geoObj = JObject.Parse(rawGeo);
                                var latToken = geoObj["lat"] ?? geoObj["Lat"] ?? geoObj["LAT"];
                                var lngToken = geoObj["lng"] ?? geoObj["Lng"] ?? geoObj["LNG"] ?? geoObj["lon"] ?? geoObj["Lon"] ?? geoObj["LON"] ?? geoObj["long"] ?? geoObj["Long"] ?? geoObj["LONG"];
                                if (latToken != null && lngToken != null)
                                {
                                    string latRaw = latToken.ToString().Trim().Replace(",", ".");
                                    string lngRaw = lngToken.ToString().Trim().Replace(",", ".");
                                    if (double.TryParse(lngRaw, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double lngParsed)
                                        && double.TryParse(latRaw, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double latParsed))
                                    {
                                        point = new Pair()
                                        {
                                            First = lngParsed.ToString(System.Globalization.CultureInfo.InvariantCulture),
                                            Second = latParsed.ToString(System.Globalization.CultureInfo.InvariantCulture)
                                        };
                                    }
                                }
                            }
                        }
                        catch
                        {
                            // fallback to legacy parser
                        }

                        if (point == null)
                            point = RawHelpers.pointStringToPoint(rawGeo, "mysql");

                        if (!string.IsNullOrEmpty(point?.First?.ToString()) && !string.IsNullOrEmpty(point?.Second?.ToString()))
                        {
                            valore = string.Format("GeomFromText('POINT({0} {1})')", point.First.ToString(), point.Second.ToString());
                            quote = "";
                        }
                        else
                        {
                            valore = null;
                        }
                    }
                }
                else if (fld.mc_db_column_type == "geometry")
                {
                    if (valore != null && !string.IsNullOrEmpty(valore.ToString()))
                    {
                        valore = string.Format("GeomFromText('{0}')", valore.ToString().Replace("'", "''"));
                        quote = "";
                    }
                }
                else if (fld.mc_db_column_type == "geography")
                {
                    if (valore != null && !string.IsNullOrEmpty(valore.ToString()))
                    {
                        string rawGeo = valore.ToString().Trim();
                        bool convertedToPoint = false;

                        try
                        {
                            if (rawGeo.StartsWith("{") && rawGeo.IndexOf("lat", StringComparison.OrdinalIgnoreCase) >= 0 && rawGeo.IndexOf("lng", StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                var geoObj = JObject.Parse(rawGeo);
                                var latToken = geoObj["lat"] ?? geoObj["Lat"] ?? geoObj["LAT"];
                                var lngToken = geoObj["lng"] ?? geoObj["Lng"] ?? geoObj["LNG"] ?? geoObj["lon"] ?? geoObj["Lon"] ?? geoObj["LON"] ?? geoObj["long"] ?? geoObj["Long"] ?? geoObj["LONG"];
                                string latRaw = latToken?.ToString()?.Trim()?.Replace(",", ".");
                                string lngRaw = lngToken?.ToString()?.Trim()?.Replace(",", ".");

                                if (latToken != null && lngToken != null
                                    && double.TryParse(latRaw, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double lat)
                                    && double.TryParse(lngRaw, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double lng))
                                {
                                    valore = string.Format("GeomFromText('POINT({0} {1})')",
                                        lng.ToString(System.Globalization.CultureInfo.InvariantCulture),
                                        lat.ToString(System.Globalization.CultureInfo.InvariantCulture));
                                    convertedToPoint = true;
                                }
                            }
                        }
                        catch
                        {
                            // fallback to legacy parsing below
                        }

                        if (!convertedToPoint)
                        {
                            bool isWkt = Regex.IsMatch(rawGeo, @"^\s*(POINT|POLYGON|MULTIPOLYGON|LINESTRING|MULTILINESTRING)\s*\(", RegexOptions.IgnoreCase);
                            if (!isWkt && rawGeo.IndexOf(',') >= 0)
                            {
                                Pair point = RawHelpers.pointStringToPoint(rawGeo, "mysql");
                                if (!string.IsNullOrEmpty(point.First?.ToString()) && !string.IsNullOrEmpty(point.Second?.ToString()))
                                {
                                    valore = string.Format("GeomFromText('POINT({0} {1})')", point.First.ToString(), point.Second.ToString());
                                    convertedToPoint = true;
                                }
                            }
                        }

                        if (!convertedToPoint)
                        {
                            valore = string.Format("GeomFromText('{0}')", rawGeo.Replace("'", "''"));
                        }

                        quote = "";
                    }
                }

                _Metadati_Colonne_Grid colGrid = fld as _Metadati_Colonne_Grid;
                if (colGrid != null)
                {
                    string subRoute = colGrid.mc_ui_grid_manytomany_route;
                    _Metadati_Tabelle subTable;
                    List<_Metadati_Colonne> subColumns;
                    using (metaRawModel mmd = new metaRawModel())
                    {
                        subTable = mmd.GetMetadati_Tabelles(subRoute).FirstOrDefault();
                        if (subTable != null)
                            subColumns = subTable._Metadati_Colonnes.ToList();
                    }
                    object[] collection = (object[])entity[colGrid.mc_nome_colonna];

                    if (collection != null)
                    {
                        foreach (object item in collection)
                        {
                            Dictionary<string, object> subEntity = (Dictionary<string, object>)item;
                            string localfield = colGrid.mc_ui_grid_manytomany_related_id_field;
                            if (subEntity.ContainsKey("___added") && (bool)subEntity["___added"])
                            {
                                if (subEntity.ContainsKey("___deleted"))
                                {
                                    object deleted = subEntity["___deleted"];
                                    if (deleted != null)
                                        if ((bool)deleted)
                                            continue;
                                }

                                subEntity[colGrid.mc_ui_grid_manytomany_related_id_field] = subEntity[colGrid.mc_ui_grid_related_id_field];
                                subEntity[colGrid.mc_ui_grid_manytomany_local_id_field] = entity[colGrid.mc_ui_grid_local_id_field];

                                if (colGrid.mc_ui_grid_related_id_field != colGrid.mc_ui_grid_local_id_field && !subEntity.ContainsKey(colGrid.mc_ui_grid_related_id_field))
                                    subEntity[colGrid.mc_ui_grid_related_id_field] = subEntity[colGrid.mc_ui_grid_local_id_field];

                                string insertedID = InsertflatData(subEntity, subRoute, user_id);

                            }
                            else if (subEntity.ContainsKey("___deleted") && subEntity["___deleted"] != null && (bool)subEntity["___deleted"])
                            {
                                subEntity[colGrid.mc_ui_grid_manytomany_related_id_field] = subEntity[colGrid.mc_ui_grid_related_id_field];
                                subEntity[colGrid.mc_ui_grid_manytomany_local_id_field] = entity[colGrid.mc_ui_grid_local_id_field];

                                DeleteflatData(subEntity, subRoute, user_id);
                            }
                        }
                    }

                    return;
                }

                if (valore == null)
                {
                    if (string.IsNullOrEmpty(fld.convert_null_to_string) || fld.convert_null_to_string == "{EMPTY}")
                        valore = "";
                    else
                        valore = fld.convert_null_to_string;
                }

                string current_fld = safetable_name + "." + safecolumn_name;

                if (fld.mc_is_primary_key is true)
                {
                    int ou;
                    quote = "";
                    if (!int.TryParse(entity[fld.mc_nome_colonna].ToString(), out ou))
                        quote = "'";

                    if (string.IsNullOrEmpty(tabel.md_primary_key_type) || tabel.md_primary_key_type == "GUID")
                        quote = "'";

                    if (original != null && original.ContainsKey(fld.mc_nome_colonna) && tabel.md_primary_key_type != "IDENTITY")
                    {
                        if (original[fld.mc_nome_colonna].ToString() != RawHelpers.ParseNull(valore))
                            field_value_list += (field_value_list == "" ? "" : ", ") + current_fld + "=" + string.Format("{0}{1}{0}", quote, ((valore.ToString() == "") ? "null" : valore.ToString()));

                        where += ((where == "") ? "" : " AND ") + current_fld + "=" + quote + original[fld.mc_nome_colonna] + quote;
                    }
                    else
                    {
                        where += ((where == "") ? "" : " AND ") + current_fld + "=" + quote + entity[fld.mc_nome_colonna] + quote;
                    }

                }
                else
                {
                    if (valore.ToString() != "")
                    {
                        if (fld.mc_ui_is_password.HasValue && fld.mc_ui_is_password.Value && ConfigHelper.GetSettingAsString("IsPwdEncripted") == "true")
                        {
                            if (Global.isPbkdf2Hash(valore.ToString()))
                                return;
                            valore = Global.pbkdf2Hash(valore.ToString());
                        }
                    }

                    field_value_list += (field_value_list == "" ? "" : ", ") + current_fld + "=" + string.Format("{0}{1}{0}", quote, ((valore.ToString() == "") ? (string.IsNullOrEmpty(fld.convert_null_to_string) ? "null" : "'" + valore.ToString() + "'") : valore.ToString()));

                    if (fld.mc_ui_column_type == "upload")
                    {
                        _Metadati_Colonne_Upload uploader = fld as _Metadati_Colonne_Upload;
                        if (uploader.isDBUpload)
                        {

                            Utility.customizeImgDBUpdate(entity, uploader, tabel, ref field_value_list);
                        }
                    }
                }

            });

            if (tabel.md_logging_enable)
            {
                //if (ConfigHelper.GetSettingAsString("logging-extra_client") != null)
                //{
                //    user_id = Utility.id_extraClient(ref user_id);
                //}

                AppendLoggingUpdateFields(ref field_value_list, tabel, user_id, entity);
            }

            query = string.Format("UPDATE {0} SET {1} WHERE {2}", safetable_name, field_value_list, where);

            return query;
        }

        private static string BuildDynamicDeleteQuery(Dictionary<string, object> entity, List<_Metadati_Colonne> metadata, string user_id)
        {
            string where = "";
            string query = "";

            _Metadati_Tabelle tabel = metadata[0]._Metadati_Tabelle;
            string table_name = RawHelpers.getStoreTableName(tabel, "mysql");
            string safetable_name = table_name;

            if (!tabel.md_deletable)
                throw new ValidationException("Cancellazione disabilitata");

            if (tabel.md_is_reticular)
            {
                table_name = "tabella_reticolare";
                safetable_name = (string.IsNullOrEmpty(tabel.md_db_name) ? "" : "`" + tabel.md_db_name + "`." + (!string.IsNullOrEmpty(tabel.md_schema_name) ? "`" + tabel.md_schema_name + "`" : "") + ".") + RawHelpers.escapeDBObjectName(table_name, "mysql");
            }

            metadata.ForEach((fld) =>
            {
                string safecolumn_name = RawHelpers.escapeDBObjectName(RawHelpers.getStoreColumnName(fld), "mysql");

                string current_fld = safetable_name + "." + safecolumn_name;

                if (fld.mc_is_primary_key is true)
                {
                    if (string.IsNullOrEmpty(tabel.md_primary_key_type) || tabel.md_primary_key_type == "GUID")
                        where += ((where == "") ? " where " : " AND ") + current_fld + " = '" + entity[fld.mc_nome_colonna] + "'";
                    else
                    {


                        int ou;
                        string quote = "";
                        if (!int.TryParse(entity[fld.mc_nome_colonna].ToString(), out ou))
                            quote = "'";

                        where += ((where == "") ? " where " : " AND ") + current_fld + " = " + quote + entity[fld.mc_nome_colonna] + quote;
                    }
                }

            });


            if (tabel.md_has_logic_delete)
            {
                _Metadati_Colonne logic_del_key = metadata.FirstOrDefault(x => x.mc_is_logic_delete_key.Value);
                if (logic_del_key != null)
                {
                    string delete_log = "";
                    if (tabel.md_logging_enable)
                    {
                        //if (ConfigHelper.GetSettingAsString("logging-extra_client") != null)
                        //{
                        //    user_id = Utility.id_extraClient(ref user_id);
                        //}

                        AppendLoggingDeleteFields(ref delete_log, tabel, user_id, entity);
                    }
                    query = string.Format("UPDATE {0} SET {1} = 1 {3} {2}", safetable_name, safetable_name + "." + RawHelpers.getStoreColumnName(logic_del_key), where, string.IsNullOrEmpty(delete_log) ? "" : ", " + delete_log);
                }
                else
                {
                    if (tabel.md_is_reticular)
                    {
                        string delete_log = "";
                        if (tabel.md_logging_enable)
                        {
                            //if (ConfigHelper.GetSettingAsString("logging-extra_client") != null)
                            //{
                            //    user_id = Utility.id_extraClient(ref user_id);
                            //}

                            AppendLoggingDeleteFields(ref delete_log, tabel, user_id, entity);
                        }
                        query = string.Format("UPDATE {0} SET {1} = 1 {3} {2}", safetable_name, safetable_name + ".[cancellato]", where, string.IsNullOrEmpty(delete_log) ? "" : ", " + delete_log);
                    }
                    else
                        throw new Exception("Missing logic delete key field.");
                }
            }
            else if (!string.IsNullOrEmpty(RawHelpers.ParseNull(ConfigHelper.GetSettingAsString("logicDeleteField"))))
            {
                string logicDeleteField = ConfigHelper.GetSettingAsString("logicDeleteField");
                string logicDeleteValue = ConfigHelper.GetSettingAsString("logicDeleteValue");

                if (!string.IsNullOrEmpty(logicDeleteField))
                {
                    _Metadati_Colonne logic_del_key = metadata.FirstOrDefault(x => x.mc_nome_colonna == logicDeleteField);
                    if (logic_del_key != null)
                    {
                        string delete_log = "";
                        if (tabel.md_logging_enable)
                        {
                            //if (ConfigHelper.GetSettingAsString("logging-extra_client") != null)
                            //{
                            //    user_id = Utility.id_extraClient(ref user_id);
                            //}

                            AppendLoggingDeleteFields(ref delete_log, tabel, user_id, entity);
                        }
                        query = string.Format("UPDATE {0} SET {1} = '{4}' {3} {2}", safetable_name, safetable_name + "." + RawHelpers.getStoreColumnName(logic_del_key), where, string.IsNullOrEmpty(delete_log) ? "" : ", " + delete_log, logicDeleteValue);
                    }
                    else
                    {
                        query = string.Format("DELETE FROM {0} {1}", safetable_name, where);
                    }
                }
            }
            else
            {
                query = string.Format("DELETE FROM {0} {1}", safetable_name, where);
            }

            return query;
        }

        private static bool OptimisticCheck(Dictionary<string, object> entity, string route, List<_Metadati_Colonne> metadata)
        {
            bool isMeta = RawHelpers.checkIsMetaData(route);

            if (isMeta) return true;
            _Metadati_Tabelle tab = metadata.First()._Metadati_Tabelle;

            using (MySqlConnection connection = metaQueryMySql.GetOpenConnection(isMeta, tab.md_conn_name))
            {
                string fltr = "";
                string safetableName = RawHelpers.getStoreTableName(tab, "mysql");

                if (!entity.ContainsKey("__original"))
                    return true;

                Dictionary<string, object> original = entity["__original"] as Dictionary<string, object>;

                if (original == null) //android
                {
                    XmlNode[] propsValues = entity["__original"] as XmlNode[];
                    if (propsValues != null)
                    {
                        original = new Dictionary<string, object>();
                        for (int i = 1; i < propsValues.Length; i++)
                        {
                            var value = propsValues[i].LastChild.Name == "Value" ? (propsValues[i].LastChild.FirstChild == null ? null : propsValues[i].LastChild.FirstChild.Value) : null;
                            original.Add(propsValues[i].FirstChild.FirstChild.Value.ToString(), value);
                        }
                    }
                    entity["__original"] = original;
                }

                foreach (string key in original.Keys)
                {
                    string localKey = key;

                    _Metadati_Colonne col = metadata.FirstOrDefault(x => x.mc_nome_colonna == localKey);

                    if (col != null && col.mc_db_column_type != "varbinary" && col.mc_db_column_type != "binary" && (!col.mc_is_db_computed.HasValue || !col.mc_is_db_computed.Value) && (!col.mc_is_computed.HasValue || !col.mc_is_computed.Value) && col.mc_db_column_type != "float")
                    {

                        string currentFld = RawHelpers.escapeDBObjectName(RawHelpers.getStoreColumnName(col), "mysql");

                        if (original[key] == null)
                        {
                            AppendBaseFilter(col, currentFld, "isnull", "is null", null, false, "AND", ref fltr);
                            fltr += ")";
                        }
                        else
                        {
                            AppendBaseFilter(col, currentFld, "eq", "=", original[key].ToString(), false, "AND", ref fltr);
                            fltr += ")";
                        }
                    }
                }

                if (fltr != "")
                {
                    string optQry = string.Format("select count(*) from {0} {1} ", safetableName, fltr);

                    try
                    {
                        return connection.Query<long>(optQry).FirstOrDefault() > 0;
                    }
                    catch (Exception ex)
                    {
                        RawHelpers.logError(ex, "optimisticCheck", optQry);
                        throw;
                    }
                }
                else
                    return true;

            }
        }

        public static string BuildDynamicInsertQuery(IDictionary<string, object> entity, List<_Metadati_Colonne> metadata, string user_id, out string generated_pkey, bool importing = false, bool parametric = false)
        {
            generated_pkey = "";
            string field_list = "";
            string value_list = "";
            string query = "";
            string local_generated_pkey = "";

            _Metadati_Tabelle tabel = metadata[0]._Metadati_Tabelle;
            string table_name = tabel.md_nome_tabella;
            string safetable_name = RawHelpers.getStoreTableName(tabel, "mysql");

            if (!tabel.md_insertable)
                throw new ValidationException("Inserimento disabilitato");

            if (table_name == "_metadati__colonne")
            {
                string widget = entity["mc_ui_column_type"].ToString();
                switch (widget)
                {
                    case "lookupByID":
                        entity["voa_class"] = 2;

                        break;

                    case "number_slider":
                    case "number":
                        entity["voa_class"] = 3;

                        break;

                    case "upload":
                        entity["voa_class"] = 5;

                        break;

                    case "button":
                        entity["voa_class"] = 6;

                        break;

                    case "multiple_check":
                        entity["voa_class"] = 4;

                        break;

                    case "html_area":
                        entity["voa_class"] = 7;

                        break;

                    default:
                        entity["voa_class"] = 1;

                        break;
                }
            }

            if (tabel.md_is_reticular)
            {
                field_list += (field_list == "" ? "" : ", ") + tabel.reticular_key_name;
                value_list += (value_list == "" ? "" : ", ") + tabel.reticular_key_value;
                table_name = "tabella_reticolare";
                safetable_name = (string.IsNullOrEmpty(tabel.md_db_name) ? "" : "`" + tabel.md_db_name + "`." + (!string.IsNullOrEmpty(tabel.md_schema_name) ? "`" + tabel.md_schema_name + "`" : "") + ".") + RawHelpers.escapeDBObjectName(table_name, "mysql");
            }

            bool base64Image = RawHelpers.ParseBool(ConfigHelper.GetSettingAsString("base64Image") ?? "false");

            List<string> skipUploadFields = metadata.OfType<_Metadati_Colonne_Upload>().Where(x => !string.IsNullOrEmpty(x.MultipleUploadBlobFieldName)).Select(x => x.MultipleUploadBlobFieldName).ToList();

            metadata.Where(x => !x.mc_is_computed.HasValue || x.mc_is_computed.Value is false).ToList().ForEach((fld) =>
            {

                string safecolumn_name = RawHelpers.escapeDBObjectName(RawHelpers.getStoreColumnName(fld), "mysql");
                string current_fld = safetable_name + "." + safecolumn_name;
                string quote;

                if (tabel.md_logging_enable)
                {
                    if (fld.mc_nome_colonna == tabel.md_logging_last_mod_date_field_name || fld.mc_nome_colonna == tabel.md_logging_last_mod_user_field_name || fld.mc_nome_colonna == tabel.md_logging_insert_date_field_name || fld.mc_nome_colonna == tabel.md_logging_insert_user_field_name)
                    {
                        return;
                    }
                }

                if (!entity.ContainsKey(fld.mc_nome_colonna) && !fld.mc_is_primary_key)
                    return;

                if ((!fld.mc_logic_editable.HasValue || !fld.mc_logic_editable.Value) && !fld.mc_is_primary_key & string.IsNullOrEmpty(fld.mc_default_value) & string.IsNullOrEmpty(fld.mc_default_value_callback))
                {
                    return;
                }

                if (importing && (fld.hide_in_import.HasValue && fld.hide_in_import.Value))
                    return;

                _Metadati_Colonne_Button btnCol = fld as _Metadati_Colonne_Button;
                if (btnCol != null)
                    return;

                if (fld.mc_validation_has.HasValue && fld.mc_validation_has.Value && fld.mc_validation_required.HasValue && fld.mc_validation_required.Value && (!entity.ContainsKey(fld.mc_nome_colonna) || entity[fld.mc_nome_colonna] == null) && fld.mc_ui_column_type != "boolean" && fld.mc_ui_column_type != "number_boolean" && string.IsNullOrEmpty(fld.mc_default_value))
                {
                    if (fld.mc_is_primary_key is true)
                    {
                        if (tabel.md_primary_key_type == "GUID" || tabel.md_primary_key_type == "IDENTITY" || tabel.md_primary_key_type == "MAX")
                        {
                            //autogenerated
                        }
                        else
                        {
                            List<_Metadati_Colonne> pks = metadata.Where(x => x.mc_is_primary_key is true).ToList();
                            if (pks.Count == 1)
                                throw new ValidationException(string.Format("{0} non può essere null.", fld.mc_display_string_in_view));
                            else
                            {
                                ManageMaxKeyType(tabel, fld, pks, entity, safecolumn_name, safetable_name);
                            }
                        }
                    }
                    else
                    {
                        throw new ValidationException(string.Format("{0} non può essere null.", fld.mc_display_string_in_view));
                    }
                }

                if (!fld.mc_is_primary_key || string.IsNullOrEmpty(tabel.md_primary_key_type) || (fld.mc_logic_editable.HasValue && fld.mc_logic_editable.Value))
                {

                    field_list += (field_list == "" ? "" : ", ") + current_fld;

                    object valore = entity[fld.mc_nome_colonna];

                    if (valore != null)
                    {
                        Type tp = valore.GetType();
                        bool isPrimitiveType = tp.IsPrimitive || tp.IsValueType || (tp == typeof(string));

                        if (!isPrimitiveType && (fld.mc_ui_column_type == "lookupByID" || fld.mc_ui_column_type == "dictionary"))
                        {
                            _Metadati_Colonne_Lookup lookup = fld as _Metadati_Colonne_Lookup;
                            if (lookup != null)
                            {
                                valore = ((Dictionary<string, object>)valore)[lookup.mc_ui_lookup_dataValueField];
                            }
                            else if (fld.mc_ui_column_type == "dictionary")
                            {
                                valore = ((Dictionary<string, object>)valore)["value"];
                            }
                        }
                    }

                    valore = EscapeValue(valore);

                    if (fld.mc_ui_column_type == "datetime" && valore != null && valore.ToString() != "")
                    {
                        //FIX UTC TIME ISSUE 
                        string parsed = valore.ToString().Replace(@"""", "");
                        DateTime d = DateTime.Parse(parsed);
                        valore = d.ToString("yyyy-MM-dd HH:mm:ss").Replace(".", ":");
                    }
                    else if (fld.mc_ui_column_type == "date" && valore != null && valore.ToString() != "")
                    {
                        //FIX UTC TIME ISSUE 
                        string parsed = valore.ToString().Replace(@"""", "");
                        DateTime d = DateTime.Parse(parsed);
                        valore = d.ToString("yyyyMMdd");
                    }
                    else if (fld.mc_ui_column_type == "number" || fld.mc_ui_column_type == "number_slider")
                    {
                        if (valore != null)
                        {
                            valore = valore.ToString().Replace(",", ".");
                            if (string.IsNullOrEmpty(valore.ToString())) //incomprensibile ma risolve...
                                valore = null;
                        }
                    }
                    else if ((fld.mc_ui_column_type == "boolean" || fld.mc_ui_column_type == "bit") && tabel.md_is_reticular)
                    {
                        if (valore != null)
                        {
                            if (valore.ToString().ToLower() == "true")
                            {
                                valore = true;
                            }
                            else if (valore.ToString().ToLower() == "false")
                            {
                                valore = false;
                            }
                        }
                        else
                        {
                            if (fld.mc_validation_has.HasValue && fld.mc_validation_has.Value && fld.mc_validation_required.HasValue && fld.mc_validation_required.Value)
                            {
                                valore = false;
                            }
                        }
                    }
                    else if (fld.mc_ui_column_type == "boolean")
                    {
                        if (valore == null)
                        {
                            if (fld.mc_validation_has.HasValue && fld.mc_validation_has.Value && fld.mc_validation_required.HasValue && fld.mc_validation_required.Value)
                            {
                                valore = false;
                            }
                        }
                    }
                    else if (fld.mc_ui_column_type == "number_boolean")
                    {
                        if (valore != null)
                        {
                            if (valore.GetType() == typeof(bool))
                            {
                                if (!(bool)valore)
                                    valore = 0;
                                else
                                    valore = 1;
                            }
                            else
                            {
                                if (valore.ToString().ToLower() == "true")
                                {
                                    valore = 1;
                                }
                                else if (valore.ToString().ToLower() == "false")
                                {
                                    valore = 0;
                                }
                                else if (valore.ToString().ToLower() == "1")
                                {
                                    valore = 1;
                                }
                                else if (valore.ToString().ToLower() == "0")
                                {
                                    valore = 0;
                                }
                                else
                                {
                                    if (fld.mc_validation_has.Value && fld.mc_validation_required.Value)
                                    {
                                        valore = 0;
                                    }
                                }
                            }
                        }
                        else
                            valore = 0;
                    }
                    else if (fld.mc_ui_column_type == "html_area")
                    {
                        if (valore != null)
                        {
                            valore = Regex.Replace(valore.ToString(), @"url\(""([^""]+)""\)", delegate (Match match)
                            {
                                string v = match.ToString();
                                return v.Replace("\"", "''");
                            });
                        }
                    }
                    else if (fld.mc_db_column_type == "point")
                    {
                        if (valore != null && !string.IsNullOrEmpty(valore.ToString()))
                        {
                            string rawGeo = valore.ToString();
                            Pair point = null;

                            try
                            {
                                if (rawGeo.TrimStart().StartsWith("{") && rawGeo.IndexOf("lat", StringComparison.OrdinalIgnoreCase) >= 0 && rawGeo.IndexOf("lng", StringComparison.OrdinalIgnoreCase) >= 0)
                                {
                                    var geoObj = JObject.Parse(rawGeo);
                                    var latToken = geoObj["lat"] ?? geoObj["Lat"] ?? geoObj["LAT"];
                                    var lngToken = geoObj["lng"] ?? geoObj["Lng"] ?? geoObj["LNG"] ?? geoObj["lon"] ?? geoObj["Lon"] ?? geoObj["LON"] ?? geoObj["long"] ?? geoObj["Long"] ?? geoObj["LONG"];
                                    if (latToken != null && lngToken != null)
                                    {
                                        string latRaw = latToken.ToString().Trim().Replace(",", ".");
                                        string lngRaw = lngToken.ToString().Trim().Replace(",", ".");
                                        if (double.TryParse(lngRaw, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double lngParsed)
                                            && double.TryParse(latRaw, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double latParsed))
                                        {
                                            point = new Pair()
                                            {
                                                First = lngParsed.ToString(System.Globalization.CultureInfo.InvariantCulture),
                                                Second = latParsed.ToString(System.Globalization.CultureInfo.InvariantCulture)
                                            };
                                        }
                                    }
                                }
                            }
                            catch
                            {
                                // fallback to legacy parser
                            }

                            if (point == null)
                                point = RawHelpers.pointStringToPoint(rawGeo, "mysql");

                            if (!string.IsNullOrEmpty(point?.First?.ToString()) && !string.IsNullOrEmpty(point?.Second?.ToString()))
                            {
                                valore = string.Format("GeomFromText('POINT({0} {1})')", point.First.ToString(), point.Second.ToString());
                                quote = "";
                            }
                            else
                            {
                                valore = null;
                            }
                        }
                    }
                    else if (fld.mc_db_column_type == "geometry")
                    {
                        if (valore != null && !string.IsNullOrEmpty(valore.ToString()))
                        {
                            valore = string.Format("GeomFromText('{0}')", valore.ToString().Replace("'", "''"));
                            quote = "";
                        }
                    }
                    else if (fld.mc_db_column_type == "geography")
                    {
                        if (valore != null && !string.IsNullOrEmpty(valore.ToString()))
                        {
                            string rawGeo = valore.ToString().Trim();
                            bool convertedToPoint = false;

                            try
                            {
                                if (rawGeo.StartsWith("{") && rawGeo.IndexOf("lat", StringComparison.OrdinalIgnoreCase) >= 0 && rawGeo.IndexOf("lng", StringComparison.OrdinalIgnoreCase) >= 0)
                                {
                                    var geoObj = JObject.Parse(rawGeo);
                                    var latToken = geoObj["lat"] ?? geoObj["Lat"] ?? geoObj["LAT"];
                                    var lngToken = geoObj["lng"] ?? geoObj["Lng"] ?? geoObj["LNG"] ?? geoObj["lon"] ?? geoObj["Lon"] ?? geoObj["LON"] ?? geoObj["long"] ?? geoObj["Long"] ?? geoObj["LONG"];
                                    string latRaw = latToken?.ToString()?.Trim()?.Replace(",", ".");
                                    string lngRaw = lngToken?.ToString()?.Trim()?.Replace(",", ".");

                                    if (latToken != null && lngToken != null
                                        && double.TryParse(latRaw, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double lat)
                                        && double.TryParse(lngRaw, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double lng))
                                    {
                                        valore = string.Format("GeomFromText('POINT({0} {1})')",
                                            lng.ToString(System.Globalization.CultureInfo.InvariantCulture),
                                            lat.ToString(System.Globalization.CultureInfo.InvariantCulture));
                                        convertedToPoint = true;
                                    }
                                }
                            }
                            catch
                            {
                                // fallback to legacy parsing below
                            }

                            if (!convertedToPoint)
                            {
                                bool isWkt = Regex.IsMatch(rawGeo, @"^\s*(POINT|POLYGON|MULTIPOLYGON|LINESTRING|MULTILINESTRING)\s*\(", RegexOptions.IgnoreCase);
                                if (!isWkt && rawGeo.IndexOf(',') >= 0)
                                {
                                    Pair point = RawHelpers.pointStringToPoint(rawGeo, "mysql");
                                    if (!string.IsNullOrEmpty(point.First?.ToString()) && !string.IsNullOrEmpty(point.Second?.ToString()))
                                    {
                                        valore = string.Format("GeomFromText('POINT({0} {1})')", point.First.ToString(), point.Second.ToString());
                                        convertedToPoint = true;
                                    }
                                }
                            }

                            if (!convertedToPoint)
                            {
                                valore = string.Format("GeomFromText('{0}')", rawGeo.Replace("'", "''"));
                            }

                            quote = "";
                        }
                    }

                    if (valore == null)
                    {
                        if (fld.convert_null_to_string == "{EMPTY}")
                            valore = "";
                        else if (!string.IsNullOrEmpty(fld.convert_null_to_string))
                            valore = fld.convert_null_to_string;
                    }


                    if (!string.IsNullOrEmpty(fld.mc_default_value))
                    {
                        if (valore == null)
                        {
                            valore = fld.mc_default_value;
                        }
                        else
                        {
                            if (string.IsNullOrEmpty(valore.ToString()))
                            {
                                valore = fld.mc_default_value;
                            }
                        }
                    }

                    quote = ((fld.mc_db_column_type == "int" || fld.mc_db_column_type == "bit" || fld.mc_db_column_type == "point" || fld.mc_db_column_type == "geometry" || RawHelpers.ParseNull(valore) == "") ? "" : "'");

                    if (valore != null)
                    {
                        if (!string.IsNullOrEmpty(valore.ToString()))
                        {
                            if (fld.mc_ui_is_password.Value && ConfigHelper.GetSettingAsString("IsPwdEncripted") == "true")
                            {
                                valore = Global.pbkdf2Hash(valore.ToString());
                            }
                        }
                    }

                    if (string.IsNullOrEmpty(RawHelpers.ParseNull(valore)) && (fld.mc_db_column_type == "date" || fld.mc_db_column_type == "datetime"))
                    {
                        quote = "";
                    }

                    if (valore != null)
                    {
                        if (string.IsNullOrEmpty(quote) && string.IsNullOrEmpty(valore.ToString()))
                            valore = null;
                    }

                    if (RawHelpers.ParseNull(valore) == "CURRENT_TIMESTAMP")
                        quote = "";

                    value_list += (value_list == "" ? "" : ", ") + string.Format("{0}{1}{0}", quote, valore == null ? "null" : valore.ToString());


                    if (fld.mc_ui_column_type == "upload")
                    {
                        _Metadati_Colonne_Upload uploader = fld as _Metadati_Colonne_Upload;
                        if (uploader.isDBUpload && (entity.ContainsKey("__guid") || entity.ContainsKey("__id")))
                        {

                            Utility.customizeImgDBInsert((Dictionary<string, object>)entity, uploader, tabel, safetable_name, ref field_list, ref value_list, base64Image);
                        }
                    }
                }
                else
                {
                    string pkeytype = tabel.md_primary_key_type;
                    string valore;

                    switch (pkeytype)
                    {
                        case "GUID":

                            field_list += (field_list == "" ? "" : ", ") + current_fld;
                            valore = Guid.NewGuid().ToString();
                            value_list += (value_list == "" ? "" : ", ") + "'" + valore + "'";

                            local_generated_pkey = valore;

                            break;

                        case "MAX":

                            using (MySqlConnection connection = metaQueryMySql.GetOpenConnection(RawHelpers.checkIsMetaData(tabel.md_route_name), tabel.md_conn_name))
                            {
                                MySqlCommand cmd = new MySqlCommand("", connection);
                                cmd.CommandText = string.Format("SELECT max({0}) FROM {1}", safecolumn_name, safetable_name);

                                object ob = cmd.ExecuteScalar();

                                if (ob == null)
                                    valore = "0";
                                else
                                    valore = ob.ToString();

                                if (string.IsNullOrEmpty(valore) || valore == "null" || valore == null)
                                    valore = "0";

                                valore = (long.Parse(valore) + 1L).ToString();
                                field_list += (field_list == "" ? "" : ", ") + current_fld;
                                value_list += (value_list == "" ? "" : ", ") + valore;

                                local_generated_pkey = valore;
                            }
                            break;

                        case "PARAMETRIC":
                            field_list += (field_list == "" ? "" : ", ") + current_fld;
                            value_list += (value_list == "" ? "" : ", ") + "@" + fld.mc_nome_colonna;

                            local_generated_pkey = "@" + fld.mc_nome_colonna;

                            break;

                        default:

                            break;
                    }
                }

            });

            if (tabel.md_logging_enable)
            {
                //if (ConfigHelper.GetSettingAsString("logging-extra_client") != null)
                //{
                //    user_id = Utility.id_extraClient(ref user_id);
                //}

                AppendLoggingInsertFields(ref field_list, ref value_list, tabel, user_id, entity);
            }

            if (!string.IsNullOrEmpty(local_generated_pkey))
            {
                generated_pkey = local_generated_pkey;
            }

            query = string.Format("INSERT INTO {0}({1}) VALUES({2})", safetable_name, field_list, value_list);

            return query;
        }

        //Clones Entity + First Level related entities
        public static string CloneData(IDictionary<string, object> entity, string route, string user_id, List<routePair> relatedRouteToClone)
        {
            string query = "";
            List<_Metadati_Colonne> metadata = _Metadati_Colonne.getColonneByUserID(route, 0, user_id, dataMode.insert, null);
            List<_Metadati_Colonne> pkeys = metadata.Where(x => x.mc_is_primary_key is true).ToList();
            _Metadati_Tabelle tab = _Metadati_Tabelle.getTableMetadataFromRoute(route);


            using (MySqlConnection connection = GetOpenConnection(RawHelpers.checkIsMetaData(route), tab.md_conn_name))
            {

                if (pkeys.Count == 0)
                    throw new ValidationException("Missing primary key.");

                string originalID = entity[pkeys[0].mc_nome_colonna].ToString();

                if (tab.md_primary_key_type == "IDENTITY" || tab.md_primary_key_type == "GUID")
                {
                    entity[pkeys[0].mc_nome_colonna] = null;
                }
                else if (tab.md_primary_key_type == "MAX")
                {
                    ManageMaxKeyType(tab, pkeys[0], pkeys, entity, RawHelpers.getStoreColumnName(pkeys[0]), RawHelpers.getStoreTableName(tab, "mysql"));
                }
                else
                {
                    throw new Exception("Impossibile clonare il record. Il primary key type della tabella dovrebbe essere: 'IDENTITY', 'GUID' o 'MAX'");
                }

                string generated_pkey = "";

                if (entity.ContainsKey("mdroutename"))
                {
                    entity["mdroutename"] = entity["mdroutename"].ToString() + "_cloned";
                }
                else if (entity.ContainsKey("md_route_name"))
                {
                    entity["md_route_name"] = entity["md_route_name"].ToString() + "_cloned";
                }

                query = BuildDynamicInsertQuery(entity, metadata, user_id, out generated_pkey);

                var watch = Stopwatch.StartNew();

                SetLastCrudSqlQuery(query);
                string scope_identity = connection.Execute(query).ToString();

                if (!string.IsNullOrEmpty(generated_pkey))
                    scope_identity = generated_pkey;

                if (relatedRouteToClone != null)
                {
                    foreach (routePair rp in relatedRouteToClone)
                    {
                        List<_Metadati_Colonne> related_metadata = _Metadati_Colonne.getColonneByUserID(rp.relatedRoute, 0, user_id, dataMode.insert, null);
                        FilterInfos fltr = RawHelpers.createStandardFilter(rp.relatedIdField, originalID, pkeys[0]);
                        rawPagedResult res = GetFlatData(user_id, rp.relatedRoute, 0, null, null, null, fltr, "AND", true, null, null);
                        foreach (SqlMapper.FastExpando o in res.results)
                        {
                            o.data[rp.relatedIdField] = scope_identity.ToString();
                            CloneData(o.data, rp.relatedRoute, user_id, null);
                        }
                    }
                }

                RawHelpers.setMetadataVersion(metadata.FirstOrDefault()._Metadati_Tabelle);
                RawHelpers.ClearCachedDataFromSession(route);

                watch.Stop();
                RawHelpers.traceQuery("CloneData", query, watch.ElapsedMilliseconds, route);

                return "{\"" + pkeys[0].mc_nome_colonna + "\":" + scope_identity + "}";

            }

        }

        public static void ManageShadowCaching(dynamic caching, MySqlConnection con, metaRawModel mmd, _Metadati_Tabelle tab, List<_Metadati_Colonne> lst, string safetableName, string fieldList, string join, string where, string orderBy, int skiprecords, PageInfo PageInfo, List<SortInfo> SortInfo, FilterInfos filterInfo, List<AggregationInfo> aggregates, List<AggregationResult> aggregateValues, string logicOperator, string distinct, Dictionary<aliasPair, string> joins, string formulaLookup, string userId, int mcId, _Metadati_Colonne linkedCol, ref string finalQry, out long totalRecords)
        {
            // Fallback implementation for MySQL: keep query execution path active even when
            // shadow-caching metadata is enabled, by bypassing shadow table materialization.
            totalRecords = 0;

            if (string.IsNullOrEmpty(distinct))
            {
                string countQry = string.Format("SELECT {0} FROM {1} {2} {3}", "count(*)", safetableName, join, where);

                try
                {
                    var watch = Stopwatch.StartNew();

                    totalRecords = con.Query<long>(countQry, commandTimeout: int.Parse(ConfigHelper.GetSettingAsString("autoGeneratedQueryTimeout"))).FirstOrDefault();

                    watch.Stop();
                    RawHelpers.traceQuery("ManageShadowCaching", countQry, watch.ElapsedMilliseconds, tab.md_route_name);
                }
                catch (Exception ex)
                {
                    throw RawHelpers.flatException(ex, true, countQry);
                }
            }

            return;












            ////try
            ////{


            //wait:













            ////}
            ////catch (Exception ex)
            ////{

            ////    throw;
            ////}
        }

        private static void ManageMaxKeyType(_Metadati_Tabelle tabel, _Metadati_Colonne fld, List<_Metadati_Colonne> pks, IDictionary<string, object> entity, string safecolumn_name, string safetable_name)
        {
            using (MySqlConnection connection = metaQueryMySql.GetOpenConnection(RawHelpers.checkIsMetaData(tabel.md_route_name), tabel.md_conn_name))
            {
                //special case 
                //mixed pkey 2 cols: 1 is fkey one is int -> logic approach is to use a "Max dependant key"
                MySqlCommand cmd = new MySqlCommand("", connection);
                string fltr = "";

                string valore = "";

                pks.Where(x => x.mc_nome_colonna != fld.mc_nome_colonna)
                   .ToList()
                   .ForEach(pp =>
                   {
                       fltr += string.Format((string.IsNullOrEmpty(fltr) ? "" : " AND ") + pp.mc_nome_colonna + "={0}" + entity[pp.mc_nome_colonna].ToString() + "{0}", RawHelpers.getQuoteFromColumn(pp));
                   });

                cmd.CommandText = string.Format("SELECT max({0}) FROM {1} {2}", safecolumn_name, safetable_name, string.IsNullOrEmpty(fltr) ? "" : "where " + fltr);

                object ob = cmd.ExecuteScalar();

                if (ob == null)
                    valore = "0";
                else
                    valore = ob.ToString();

                if (string.IsNullOrEmpty(valore) || valore == "null" || valore == null)
                    valore = "0";

                valore = (long.Parse(valore) + 1L).ToString();

                entity[fld.mc_nome_colonna] = valore;
            }
        }

        public static decimal readProgress(string guid)
        {
            using (DbConnection connection = GetOpenConnection(true))
            {
                var dbArgs = new DynamicParameters();
                dbArgs.Add("guid", guid);
                return connection.Query<decimal>("SELECT coalesce(progress, -1) FROM _progress_indicator WHERE guid=@guid", dbArgs).FirstOrDefault();
            }
        }

        public static void saveProgress(string guid, decimal progress)
        {
            using (DbConnection connection = GetOpenConnection(true))
            {
                var dbArgs = new DynamicParameters();
                dbArgs.Add("guid", guid);
                dbArgs.Add("progress", progress);

                int i = connection.Execute("UPDATE _progress_indicator SET progress=@progress WHERE guid=@guid", dbArgs);

                if (i == 0)
                    connection.Execute("INSERT INTO _progress_indicator(guid, progress) VALUES(@guid, @progress)", dbArgs);
            }
        }

        #endregion

        #region "BO UNIVERSE"


        private static string builSelectFromUniverseDefinition(List<Definizione_Universi> definition, List<SortInfo> SortInfo, PageInfo PageInfo, FilterInfos filterInfo, string logicOperator, MySqlConnection connection, out long totalRecords)
        {
            Dictionary<string, string> aliases = new Dictionary<string, string>();
            string select_clause = "";
            string from_clause = "";
            string join_clause = "";
            string where_clause = "";
            string groupby_clause = "";
            Dictionary<Definizione_Universi, string> groupby_fields = new Dictionary<Definizione_Universi, string>();
            string orderby_clause = "";
            string order_safetable_name = "";
            string having_clause = "";
            string default_order = "";
            string alternate_ordering = "";

            using (metaRawModel context = new metaRawModel())
            {
                foreach (Definizione_Universi def in definition)
                {
                    alternate_ordering = "";

                    if (def.isChecked)
                    {
                        if (def.isTable)
                        {
                            if (string.IsNullOrEmpty(from_clause))
                            {
                                string safetable_name = RawHelpers.getStoreTableNameFromUniverseDef(def, "mysql");

                                _Metadati_Tabelle tbl = context.GetMetadati_Tabelles("", def.realID.ToString()).FirstOrDefault();
                                _Metadati_Colonne pk = tbl._Metadati_Colonnes.FirstOrDefault(x => x.mc_is_primary_key is true);

                                string prefix = RawHelpers.getStorePrefix(tbl, "mysql");
                                string safeEntityName = (!string.IsNullOrEmpty(prefix) ? prefix : "") + RawHelpers.escapeDBObjectName(tbl.md_nome_tabella, "mysql");

                                if (pk != null)
                                    default_order += (string.IsNullOrEmpty(default_order) ? "" : ", ") + safeEntityName + "." + RawHelpers.escapeDBObjectName(pk.mc_nome_colonna, "mysql");
                                else
                                    default_order += (string.IsNullOrEmpty(default_order) ? "" : ", ") + safeEntityName + "." + RawHelpers.escapeDBObjectName(tbl._Metadati_Colonnes.FirstOrDefault().mc_nome_colonna, "mysql");

                                from_clause = safetable_name;
                            }
                            else
                            {
                                Definizione_Universi lookH = definition.FirstOrDefault(x => x.id == def.parent && x.isLookup);
                                _Metadati_Colonne_Lookup lookC = context.GetMetadati_Colonnes(lookH.realID.ToString()).OfType<_Metadati_Colonne_Lookup>().FirstOrDefault();
                                if (lookC != null)
                                {
                                    _Metadati_Tabelle ownerTable = lookC._Metadati_Tabelle;
                                    _Metadati_Tabelle relatedTable = context.GetMetadati_Tabelles(lookC.mc_ui_lookup_entity_name).FirstOrDefault();
                                    if (relatedTable != null)
                                    {
                                        string prefix = RawHelpers.getStorePrefix(relatedTable, "mysql");
                                        string prefix_2 = RawHelpers.getStorePrefix(ownerTable, "mysql");
                                        string safeEntityName = (!string.IsNullOrEmpty(prefix) ? prefix : "") + RawHelpers.escapeDBObjectName(relatedTable.md_nome_tabella, "mysql");
                                        string safeColumnName = RawHelpers.escapeDBObjectName(RawHelpers.getStoreColumnName(lookC), "mysql");

                                        string safeUniqueEntityName = RawHelpers.escapeDBObjectName(lookC.mc_nome_colonna + "_" + lookC.mc_ui_lookup_entity_name, "mysql");

                                        string current_fld;

                                        if (!aliases.ContainsKey(relatedTable.md_nome_tabella))
                                        {
                                            aliases.Add(relatedTable.md_nome_tabella, safeUniqueEntityName);
                                            current_fld = (!string.IsNullOrEmpty(prefix) ? prefix_2 : "") + RawHelpers.escapeDBObjectName(ownerTable.md_nome_tabella, "mysql") + "." + safeColumnName;
                                        }
                                        else
                                        {
                                            current_fld = aliases[relatedTable.md_nome_tabella] + "." + safeColumnName;
                                        }

                                        if (!aliases.ContainsKey(ownerTable.md_nome_tabella))
                                        {

                                        }
                                        else
                                        {
                                            current_fld = aliases[ownerTable.md_nome_tabella] + "." + safeColumnName;
                                        }

                                        join_clause += string.Format(" LEFT JOIN {0} AS {3} ON {1} = {2}", safeEntityName, current_fld, safeUniqueEntityName + "." + RawHelpers.escapeDBObjectName(lookC.mc_ui_lookup_dataValueField, "mysql"), safeUniqueEntityName);

                                        where_clause = AppendFilter(lookC, filterInfo, logicOperator, (current_fld), where_clause, ownerTable, "");

                                    }
                                }
                            }
                        }
                        else if (def.isLookup)
                            continue;
                        else
                        {
                            _Metadati_Colonne col = context.GetMetadati_Colonnes(def.realID.ToString()).FirstOrDefault();
                            _Metadati_Tabelle ownerTable = null;
                            string safeColumnName = "";
                            string current_fld;
                            string prefix = "";
                            string alias;
                            string aggregatedAlias = "";
                            string safeAlias;

                            if (col == null) //computed
                            {
                                current_fld = parseComputedFormula(def, context);

                                alias = def.name.Replace(" ", "_") + "_" + def.id;
                                safeColumnName = RawHelpers.escapeDBObjectName(alias, "mysql");
                            }
                            else
                            {
                                alias = col.mc_nome_colonna + "_" + def.id.ToString();
                                safeAlias = RawHelpers.escapeDBObjectName(alias, "mysql");

                                ownerTable = col._Metadati_Tabelle;
                                safeColumnName = RawHelpers.escapeDBObjectName(RawHelpers.getStoreColumnName(col), "mysql");

                                prefix = RawHelpers.getStorePrefix(ownerTable, "mysql");

                                if (!aliases.ContainsKey(ownerTable.md_nome_tabella))
                                {
                                    prefix = RawHelpers.getStorePrefix(ownerTable, "mysql");
                                    current_fld = (!string.IsNullOrEmpty(prefix) ? prefix : "") + RawHelpers.escapeDBObjectName(ownerTable.md_nome_tabella, "mysql") + "." + safeColumnName;
                                }
                                else
                                {
                                    prefix = "";
                                    current_fld = (!string.IsNullOrEmpty(prefix) ? prefix : "") + aliases[ownerTable.md_nome_tabella] + "." + safeColumnName;
                                    prefix = aliases[ownerTable.md_nome_tabella];
                                }
                            }


                            if (def.navigator_isSelected)
                            {
                                if (def.navigator_isAggregableCountChecked)
                                {
                                    aggregatedAlias = string.Format("Count({0})", current_fld);
                                    select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("Count({0}) as `count_{1}`", current_fld, alias);
                                }
                                if (def.navigator_isAggregableSumChecked)
                                {
                                    aggregatedAlias = string.Format("Sum({0})", current_fld);
                                    select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("Sum({0}) as `sum_{1}`", current_fld, alias);
                                }
                                if (def.navigator_isAggregableMaxChecked)
                                {
                                    aggregatedAlias = string.Format("Max({0})", current_fld);
                                    select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("Max({0}) as `max_{1}`", current_fld, alias);
                                }
                                if (def.navigator_isAggregableMinChecked)
                                {
                                    aggregatedAlias = string.Format("Min({0})", current_fld);
                                    select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("Min({0}) as `min_{1}`", current_fld, alias);
                                }
                                if (def.navigator_isAggregableAvgChecked)
                                {
                                    aggregatedAlias = string.Format("Avg({0})", current_fld);
                                    select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("Avg({0}) as `avg_{1}`", current_fld, alias);
                                }
                                if (def.navigator_isAggregableVarChecked)
                                {
                                    aggregatedAlias = string.Format("Var({0})", current_fld);
                                    select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("Var({0}) as `var_{1}`", current_fld, alias);
                                }

                                if (!def.navigator_isAggregableCountChecked && !def.navigator_isAggregableSumChecked && !def.navigator_isAggregableMaxChecked && !def.navigator_isAggregableMinChecked && !def.navigator_isAggregableAvgChecked && !def.navigator_isAggregableVarChecked)
                                {

                                    string group_piece = "";
                                    if (def.navigator_isDayOfTheYearChecked)
                                    {
                                        group_piece = string.Format("DAYOFYEAR({0})", current_fld);
                                        groupby_fields.Add(def, group_piece);

                                        groupby_clause += (string.IsNullOrEmpty(groupby_clause) ? "GROUP BY " : ", ") + group_piece;
                                        select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("DAYOFYEAR({0}) as {1}", current_fld, safeColumnName);
                                    }
                                    else if (def.navigator_isMonthOfTheYearChecked)
                                    {
                                        group_piece = string.Format("DAYOFMONTH({0})", current_fld);
                                        groupby_fields.Add(def, group_piece);

                                        groupby_clause += (string.IsNullOrEmpty(groupby_clause) ? "GROUP BY " : ", ") + group_piece;
                                        select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("DAYOFMONTH({0}) as {1}", current_fld, safeColumnName);
                                    }
                                    else if (def.navigator_isDay_and_monthChecked)
                                    {
                                        group_piece = string.Format(" DATE_FORMAT({0}, '%e-%c')", current_fld);
                                        groupby_fields.Add(def, group_piece);

                                        groupby_clause += (string.IsNullOrEmpty(groupby_clause) ? "GROUP BY " : ", ") + group_piece;
                                        select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("EXTRACT(YEAR_MONTH FROM {0}) as {1}", current_fld, safeColumnName);
                                        alternate_ordering = alias;
                                    }
                                    else if (def.navigator_isMonth_and_yearChecked)
                                    {
                                        group_piece = string.Format("EXTRACT(YEAR_MONTH FROM {0})", current_fld);
                                        groupby_fields.Add(def, group_piece);

                                        groupby_clause += (string.IsNullOrEmpty(groupby_clause) ? "GROUP BY " : ", ") + group_piece;
                                        select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("EXTRACT(YEAR_MONTH FROM {0}) as {1}", current_fld, safeColumnName);
                                        alternate_ordering = alias;
                                    }
                                    else if (def.navigator_isGroupableChecked)
                                    {
                                        group_piece = current_fld;
                                        groupby_fields.Add(def, group_piece);

                                        groupby_clause += (string.IsNullOrEmpty(groupby_clause) ? "GROUP BY " : ", ") + group_piece;
                                        select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("{0} as `{1}`", current_fld, alias);
                                    }
                                    else
                                    {
                                        select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("{0} as `{1}`", current_fld, alias);
                                    }

                                    if (ownerTable != null)
                                    {
                                        order_safetable_name = (!string.IsNullOrEmpty(prefix) ? prefix : "") + RawHelpers.escapeDBObjectName(ownerTable.md_nome_tabella, "mysql");
                                        SortInfo sortI = SortInfo.FirstOrDefault(x => x.field == col.mc_nome_colonna);

                                        if (string.IsNullOrEmpty(alternate_ordering))
                                        {
                                            if (sortI != null)
                                                AppendSort(col, order_safetable_name, ref orderby_clause, sortI.dir);
                                        }
                                        else
                                        {
                                            if (sortI != null)
                                            {
                                                orderby_clause += ((orderby_clause == "") ? " ORDER BY " : ", ") + alternate_ordering + " " + sortI.dir;
                                            }
                                        }
                                    }

                                }
                            }

                            if (col == null)
                            {
                                col = new _Metadati_Colonne() { mc_ui_column_type = def.type, mc_is_primary_key = false, mc_nome_colonna = def.name, mc_display_string_in_view = def.displayName };
                            }

                            string aliased = "";
                            filterElement matchingFilter = filterInfo.filters.FirstOrDefault(x => (x.isHaving is false) && x.havingAggregation != null && x.field == x.havingAggregation + "_" + col.mc_nome_colonna + "_" + def.id);
                            if (matchingFilter == null)
                            {
                                aliased = col.mc_nome_colonna + "_" + def.id;
                                matchingFilter = filterInfo.filters.FirstOrDefault(x => (x.isHaving is false) && x.havingAggregation == null && x.field == aliased);
                            }
                            if (matchingFilter != null)
                            {
                                if (string.IsNullOrEmpty(aliased))
                                    col.mc_nome_colonna = matchingFilter.havingAggregation + "_" + col.mc_nome_colonna + "_" + def.id;
                                else
                                    col.mc_nome_colonna = aliased;
                            }

                            where_clause = AppendFilter(col, filterInfo, logicOperator, (current_fld), where_clause, ownerTable, "");
                            having_clause = AppendHaving(col, filterInfo, logicOperator, (current_fld), having_clause, ownerTable, def);

                            if (SortInfo.Any(x => x.mc_id == col.mc_id))
                            {
                                if (string.IsNullOrEmpty(order_safetable_name))
                                {
                                    orderby_clause += ((orderby_clause == "") ? " ORDER BY " : ", ") + "(" + ((col.mc_is_computed.Value) ? "(SELECT " + col.mc_computed_formula + ")" : (!string.IsNullOrEmpty(aggregatedAlias) ? aggregatedAlias : alias)) + ") " + SortInfo.FirstOrDefault(x => x.mc_id == col.mc_id).dir;
                                }
                                else
                                {
                                    AppendSort(col, order_safetable_name, ref orderby_clause, SortInfo.FirstOrDefault(x => x.mc_id == col.mc_id).dir);
                                }
                            }

                        }
                    }
                }



                string ret = "";

                if (PageInfo.pageSize > 0)
                {
                    if (PageInfo.currentPage == 0)
                        PageInfo.currentPage = 1;

                    int skiprecords = (PageInfo.currentPage - 1) * PageInfo.pageSize;

                    string fix_order;

                    if (!string.IsNullOrEmpty(groupby_clause))
                    {
                        if (string.IsNullOrEmpty(orderby_clause))
                        {
                            fix_order = "ORDER BY " + groupby_clause.Replace("GROUP BY ", "");
                        }
                        else
                        {
                            fix_order = orderby_clause;
                        }
                        groupby_clause = fix_groupby(definition, groupby_fields, groupby_clause);
                    }
                    else
                    {
                        fix_order = (string.IsNullOrEmpty(orderby_clause) ? "ORDER BY " + default_order : orderby_clause);
                    }

                    //ritorna il count per il paging
                    string countQry = string.Format("SELECT count(*) as conta_record FROM ( SELECT {0} FROM {1} {2} {3} {4} {5} ) as T", select_clause, from_clause, join_clause, where_clause, groupby_clause, having_clause);
                    try
                    {
                        Dapper.SqlMapper.FastExpando jj = connection.Query(countQry).FirstOrDefault();
                        totalRecords = long.Parse(jj.data["conta_record"].ToString());
                    }
                    catch (Exception ex)
                    {
                        RawHelpers.logError(ex, "getFlatData", countQry);
                        throw new Exception(ex.Message + " " + countQry);
                    }

                    ret = string.Format("SELECT  {0} " +
                                "FROM {1} {2} {3} {4} {5} {6} ", select_clause, from_clause, join_clause, where_clause, groupby_clause, having_clause, fix_order) +
                                string.Format("limit {0} offset {1}", PageInfo.pageSize, ((skiprecords == 0) ? 0 : skiprecords + 1));
                }
                else
                {
                    groupby_clause = fix_groupby(definition, groupby_fields, groupby_clause);

                    select_clause = fix_select(definition, select_clause, context, aliases);

                    ret = string.Format("SELECT {0} FROM {1} {2} {3} {4} {5} {6}", select_clause, from_clause, join_clause, where_clause, groupby_clause, having_clause, string.IsNullOrEmpty(orderby_clause) ? "" : orderby_clause);

                    totalRecords = 0;
                }
                return ret;
            }

        }

        private static string parseComputedFormula(Definizione_Universi def, metaRawModel context)
        {
            Regex rgx = new Regex(@"\{[^}]+\}");
            string current_fld = rgx.Replace(def.computedFormula, new MatchEvaluator((m) =>
            {
                string mc_id = m.Value.Split(new string[] { "___" }, StringSplitOptions.None)[1].Replace("}", "");
                return context.GetMetadati_Colonnes(mc_id).FirstOrDefault().mc_nome_colonna;
            }));
            return current_fld;
        }

        private static string fix_select(List<Definizione_Universi> definition, string select_clause, metaRawModel context, Dictionary<string, string> aliases)
        {
            string select_append = "";

            definition.Where(x => (x.navigator_isGroupableChecked || x.navigator_isDay_and_monthChecked || x.navigator_isDayOfTheYearChecked || x.navigator_isMonth_and_yearChecked || x.navigator_isMonthOfTheYearChecked) && (x.groupByCube || x.groupByRollup))
            .OrderBy(y => y.groupingOrder).ToList().ForEach(z =>
            {
                string colName = (aliases.ContainsKey(z.ownerTableName) ? aliases[z.ownerTableName] : z.ownerTableName) + "." + z.name;
                if (z.navigator_isDay_and_monthChecked)
                {
                    select_append += (string.IsNullOrEmpty(select_append) ? ", case when " : " OR ") + string.Format("GROUPING({0})=1", string.Format("RIGHT(REPLICATE('0',2) + cast(DATEPART(dd, {0}) as varchar(2)) ,2)  +  '-' + RIGHT(REPLICATE('0',2) + cast(DATEPART(mm, {0}) as varchar(2)) ,2)", (z.realID == 0 ? parseComputedFormula(z, context) : colName)));
                }
                else if (z.navigator_isDayOfTheYearChecked)
                {
                    select_append += (string.IsNullOrEmpty(select_append) ? ", case when " : " OR ") + string.Format("GROUPING({0})=1", string.Format("DATEPART(dy, {0})", (z.realID == 0 ? parseComputedFormula(z, context) : colName)));
                }
                else if (z.navigator_isMonth_and_yearChecked)
                {
                    select_append += (string.IsNullOrEmpty(select_append) ? ", case when " : " OR ") + string.Format("GROUPING({0})=1", string.Format("RIGHT(REPLICATE('0',2) + cast(DATEPART(dd, {0}) as varchar(2)) ,2)  +  '-' + RIGHT(REPLICATE('0',2) + cast(DATEPART(mm, {0}) as varchar(2)) ,2)", (z.realID == 0 ? parseComputedFormula(z, context) : colName)));
                }
                else if (z.navigator_isMonthOfTheYearChecked)
                {
                    select_append += (string.IsNullOrEmpty(select_append) ? ", case when " : " OR ") + string.Format("GROUPING({0})=1", string.Format("DATEPART(mm, {0})", (z.realID == 0 ? parseComputedFormula(z, context) : colName)));
                }
                else
                {
                    select_append += (string.IsNullOrEmpty(select_append) ? ", case when " : " OR ") + string.Format("GROUPING({0})=1", colName);
                }
            });

            return select_clause + (string.IsNullOrEmpty(select_append) ? "" : select_append + " then 1 else 0 end as __is_total");
        }


        private static string fix_groupby(List<Definizione_Universi> definition, Dictionary<Definizione_Universi, string> groupby_fields, string groupby_clause)
        {
            groupby_clause = "";
            bool rollup_started = false;
            bool cube_started = false;

            definition.OrderBy(y => y.groupingOrder).ToList().ForEach(z =>
            {
                string group_piece = groupby_fields.FirstOrDefault(d => d.Key.realID == z.realID).Value;
                if (string.IsNullOrEmpty(group_piece))
                    return;

                string special_pre = "";
                string special_post = "";
                if (z.groupByRollup)
                {
                    if (rollup_started)
                    {
                        special_pre = "";
                    }
                    else
                    {
                        special_pre = " ROLLUP (";
                    }
                    rollup_started = true;
                }
                else if (z.groupByCube)
                {
                    if (cube_started)
                    {
                    }
                    else
                    {
                        special_pre = " CUBE (";
                    }
                    cube_started = true;
                }
                else
                {
                    if (rollup_started)
                    {
                        special_post = ")";
                        rollup_started = false;
                    }
                    if (cube_started)
                    {
                        special_post = ")";
                        cube_started = false;
                    }
                }
                groupby_clause += (string.IsNullOrEmpty(groupby_clause) ? "GROUP BY " : ", ") + special_pre + group_piece + special_post;
            });

            if (rollup_started || cube_started)
                groupby_clause += ")";
            return groupby_clause;
        }

        public static Universi getUniverseDefinition(string route)
        {
            using (metaRawModel context = new metaRawModel())
            {
                Universi bo = context.GetUniversis(route).FirstOrDefault();
                return bo;
            }
        }

        public static Universi getUniverseDefinitionByID(int universe_id)
        {
            using (metaRawModel context = new metaRawModel())
            {
                Universi bo = context.GetUniversis("", universe_id.ToString()).FirstOrDefault();
                return bo;
            }
        }

        public static rawPagedResult getUniverseData(List<Definizione_Universi> definition, List<SortInfo> SortInfo, PageInfo PageInfo, FilterInfos filterInfo, string logicOperator, string user_id)
        {
            Universi bo;
            int? bo_id = definition.First().bo_id;
            using (metaRawModel context = new metaRawModel())
            {
                bo = context.GetUniversis("", bo_id.Value.ToString()).FirstOrDefault();
            }
            List<_Metadati_Colonne> lst = _Metadati_Colonne.getColonneFromUniverse(definition.Where(x => x.navigator_isSelected).ToList()).OrderBy(x => x.mc_ordine).ToList();

            _Metadati_Tabelle universe_table = new _Metadati_Tabelle() { md_route_name = "universe", md_pagesize = 0, md_server_side_operations = true, md_display_string = "universe", md_is_view = true, md_long_description = "universe", md_pageable = false, md_show_record_count = true, md_sortable = true, md_scrollable = true, md_disabilita_filtri = true, md_ui_grid_conditional_template = "total_row", md_ui_grid_conditional_alt_template = "total_row" };

            if (definition.Any(x => x.navigator_isSelected && (x.groupByCube || x.groupByRollup)))
            {
                universe_table.md_ui_grid_conditional_template_condition = "(data.__is_total) ? __is_total==1 : false";
            }

            //implement authorization...
            List<_Metadati_Colonne> restricted = new List<_Metadati_Colonne>();
            bool added = false;
            lst.ForEach(x =>
            {
                if (x.applyColumnRestrictions(new List<_Metadati_Utenti_Autorizzazioni_Colonne>()))
                {
                    restricted.Add(x);
                    if (!added)
                    {
                        x._Metadati_Tabelle = universe_table;
                        added = true;
                    }
                }
            });

            if (restricted.Count > 0)
            {
                string query = "";
                long totalRecords;
                using (MySqlConnection connection = metaQueryMySql.GetOpenConnection(false))
                {
                    try
                    {
                        query = builSelectFromUniverseDefinition(definition, SortInfo, PageInfo, filterInfo, logicOperator, connection, out totalRecords);
                        List<SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)connection.Query(query);

                        if (totalRecords == 0)
                            totalRecords = rows.Count;

                        return new rawPagedResult() { results = rows, TotalRecords = totalRecords, Agg = null, metadata = restricted };
                    }
                    catch (Exception EX)
                    {
                        RawHelpers.logError(EX, "getUniverseData", query);
                        throw new Exception(EX.Message + "****EXECUTED QUERY:****" + query);
                    }
                }
            }
            else
            {
                return null;
            }
        }

        public static Definizione_Universi addComputedColumn(string route, int parentID, string formula, string nome, string tipo)
        {
            using (metaRawModel context = new metaRawModel())
            {
                Universi bo = context.GetUniversis(route).FirstOrDefault();
                long id = bo.Definizione_Universis.Max(x => x.id) + 10000;
                _Metadati_Tabelle tabel = context.GetMetadati_Tabelles("", parentID.ToString()).FirstOrDefault();
                Definizione_Universi computed = new Definizione_Universi() { bo_id = bo.bo_id, displayName = nome, isLookup = false, isTable = false, name = nome, parent = parentID, type = tipo, id = id, computedFormula = formula, isTbl = 2, ownerRouteName = tabel.md_route_name, ownerTableName = tabel.md_nome_tabella, schemaName = tabel.md_schema_name, dbName = tabel.md_db_name, isChecked = false, navigator_isSelected = false };
                List<Definizione_Universi> l = new List<Definizione_Universi>();
                l.Add(computed);
                context.AddDefUniversi(l);
                return computed;
            }
        }

        public static int GetMetadati_Tabelles_NonSystem_Count()
        {
            using (MySqlConnection con = GetOpenConnection(true))
            {
                return (int)con.Query<long>("select count(*) from _metadati__tabelle where coalesce(issystemroute,0)=0").FirstOrDefault();
            }
        }

        public static List<_Metadati_Tabelle> GetMetadati_Tabelles_NonSystem()
        {
            using (MySqlConnection con = GetOpenConnection(true))
            {
                List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)con.Query("select * from _metadati__tabelle where coalesce(issystemroute,0)=0");
                return metaRawModel.convertDictionariesToList<_Metadati_Tabelle>(rows);
            }
        }

        public static List<_Metadati_Tabelle> GetMetadati_TabellesForScaffolding(string tableName, string connName = "", string tableSchema = "", string db = "", bool skipColumns = false)
        {
            using (MySqlConnection con = GetOpenConnection(true))
            {
                string query = "select * from _metadati__tabelle";
                List<string> where = new List<string>();
                var dbArgs = new DynamicParameters();

                if (!string.IsNullOrEmpty(tableName))
                {
                    where.Add("md_nome_tabella=@md_nome_tabella");
                    dbArgs.Add("@md_nome_tabella", tableName);
                }

                if (!string.IsNullOrEmpty(connName))
                {
                    where.Add("mdconnname=@mdconnname");
                    dbArgs.Add("@mdconnname", connName);
                }

                if (!string.IsNullOrEmpty(tableSchema))
                {
                    where.Add("mdschemaname=@mdschemaname");
                    dbArgs.Add("@mdschemaname", tableSchema);
                }

                if (!string.IsNullOrEmpty(db))
                {
                    where.Add("mddbname=@mddbname");
                    dbArgs.Add("@mddbname", db);
                }

                if (where.Count > 0)
                    query += " WHERE " + string.Join(" AND ", where);

                List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)con.Query(query, dbArgs);
                List<_Metadati_Tabelle> res = metaRawModel.convertDictionariesToList<_Metadati_Tabelle>(rows);
                res.ForEach(x => x.skipColumns = skipColumns);
                return res;
            }
        }

        public static List<_Metadati_Tabelle> GetMetadati_TabellesWhere(string searchPredicate, bool skipColumns = false)
        {
            using (MySqlConnection con = GetOpenConnection(true))
            {
                string query = "select * from _metadati__tabelle WHERE " + searchPredicate;
                List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)con.Query(query);
                List<_Metadati_Tabelle> res = metaRawModel.convertDictionariesToList<_Metadati_Tabelle>(rows);
                res.ForEach(x => x.skipColumns = skipColumns);
                return res;
            }
        }
        public static List<WuicCore.MetaModel._Metadati_Condition_Group> GetMetadati_Condition_Groups(int md_id)
        {
            using (MySqlConnection con = GetOpenConnection(true))
            {
                string select = "SELECT CG_Id, CG_Name, _metadati_condition_group.md_id, CI_Id, FK_CG_Id, CI_Evaluation_Trigger, CI_Comparison_Left_Field, CI_Comparison_Operator, CI_Comparison_Right_Field, CI_Formula, CI_Enabled FROM _metadati_condition_group LEFT JOIN _metadati_condition_item ON _metadati_condition_group.CG_Id = _metadati_condition_item.FK_CG_Id  WHERE md_id=@md_id";
                var dbArgs = new DynamicParameters();
                dbArgs.Add("@md_id", md_id);

                List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)con.Query(select, dbArgs);
                List<WuicCore.MetaModel._Metadati_Condition_Group> ret = metaRawModel.convertDictionariesToList<WuicCore.MetaModel._Metadati_Condition_Group>(rows);

                string ids = string.Join(",", ret.Select(x => x.CG_Id));
                if (!string.IsNullOrWhiteSpace(ids))
                {
                    string selectCond = "SELECT CG_Id, CG_Name, _metadati_condition_group.md_id, CAG_Id, CAG_Name, FK_CG_Id, CAG_Execute_If_False, CAI_Id, FK_CAG_Id, CAI_Target_Field, CAI_Target_Action, CAI_Target_Action_Param_Value, CAI_Formula, CAI_Enabled FROM _metadati_condition_group INNER JOIN _metadati_condition_action_group ON _metadati_condition_group.CG_Id = _metadati_condition_action_group.FK_CG_Id LEFT JOIN _metadati_condition_action_item ON _metadati_condition_action_group.CAG_Id = _metadati_condition_action_item.FK_CAG_Id WHERE FK_CG_Id IN (" + ids + ")";
                    List<Dapper.SqlMapper.FastExpando> condRows = (List<Dapper.SqlMapper.FastExpando>)con.Query(selectCond);
                    List<WuicCore.MetaModel._Metadati_Condition_Action_Group> cond = metaRawModel.convertDictionariesToList<WuicCore.MetaModel._Metadati_Condition_Action_Group>(condRows);
                    ret.ForEach(c => c.ConditionActions = cond.Where(x => x.FK_CG_Id == c.CG_Id).ToList());
                }

                return ret;
            }
        }

        public static List<_Error_Logs> GetError_Logs()
        {
            using (MySqlConnection con = GetOpenConnection(true))
            {
                List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)con.Query("SELECT * FROM _error_logs");
                return metaRawModel.convertDictionariesToList<_Error_Logs>(rows);
            }

        }
        #endregion

        public static List<domBoard> loadDashboard(string dashRoute)
        {
            using (metaRawModel context = new metaRawModel())
            {
                List<domBoard> boards = context.GetdomBoards(dashRoute).ToList();
                boards.ForEach(b =>
               {
                   b.skipChilds = false;
                   var _ = b.domBoardSheets;
               });
                return boards;
            }
        }


        /// <summary>
        /// Salva o aggiorna configurazione dashboard (layout, contenuti, sheet, modalit├á design/password).
        /// </summary>
        /// <param name="dashRoute">Nome route/metadato tabella su cui applicare l'operazione.</param>
        /// <param name="boardcontent">Contenuto o riferimento file/report elaborato dal metodo.</param>
        /// <param name="desc">Valore di input 'desc' utilizzato dalla logica del metodo.</param>
        /// <param name="sheetPaths">Riferimento/contenuto file o documento da elaborare.</param>
        /// <param name="designMode">Valore di input 'designMode' utilizzato dalla logica del metodo.</param>
        /// <param name="pwd">Valore di input 'pwd' utilizzato dalla logica del metodo.</param>
        /// <returns>Dashboard salvata/aggiornata con i metadati persistiti.</returns>
        public static domBoard saveDashboard(string dashRoute, string boardcontent, string desc, List<string> sheetPaths, string designMode, string pwd)
        {
            using (metaRawModel context = new metaRawModel())
            {
                sheetPaths = (sheetPaths ?? new List<string>())
                    .Select(x => (x ?? "").Trim())
                    .Where(x => !string.IsNullOrEmpty(x))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                domBoard board = context.GetdomBoards(dashRoute).FirstOrDefault();
                if (board != null)
                {

                    board.pwd = pwd;
                    board.board_des = desc;
                    board.jsController = "";
                    board.boardcontent = boardcontent;

                    context.UpdateDomBoard(board);


                }
                else
                {
                    board = new domBoard() { board_route = dashRoute, boardcontent = boardcontent, board_des = desc, boardType = designMode, pwd = pwd };
                    context.AddDomBoard(board);
                }


                using (MySqlConnection con = metaQueryMySql.GetOpenConnection(true))
                {
                    DynamicParameters deleteArgs = new DynamicParameters();
                    deleteArgs.Add("@dom_boardid", board.id);
                    con.Execute("delete from dom_board_sheet where dom_boardid=@dom_boardid", deleteArgs);
                }

                sheetPaths.ForEach(x =>
                {
                    context.AddDomBoardSheets(new domBoardSheet() { domBoard_id = board.id, sheetPath = x });
                });

                context.setMetadataVersion();

                return board;
            }
        }

        public static List<bind_list> getDatabasesFromConnection(string connection, string provider)
        {
            List<bind_list> dbList = new List<bind_list>();
            using (MySqlConnection SqlCon = new MySqlConnection(connection + ";database=information_schema"))
            {
                using (MySqlCommand cmd = new MySqlCommand("select distinct table_schema from tables", SqlCon))
                {
                    SqlCon.Open();
                    using (MySqlDataReader reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            dbList.Add(new bind_list() { valore = reader.GetString(0) });
                        }
                    }
                }
                return dbList;
            }
        }

        public static void traceQuery(string method, string query, long durata, string route)
        {
            if (!string.IsNullOrWhiteSpace(query))
            {
                SetLastCrudSqlQuery(query);
            }
            bool trace = RawHelpers.ParseBool(ConfigHelper.GetSettingAsString("traceQuery") ?? "false");
            user user = RawHelpers.getUserFromCookie();

            if (user != null)
            {
                if (trace)
                {
                    using (MySqlConnection con = metaQueryMySql.GetOpenConnection(true))
                    {
                        using (MySqlCommand cmd = new MySqlCommand("INSERT INTO _log_query(timestamp, query, method, durata, user_id, route) VALUES(NOW(), @query, @method, @durata, @user_id, @route)", con))
                        {
                            cmd.Parameters.AddWithValue("query", query);
                            cmd.Parameters.AddWithValue("method", method);
                            cmd.Parameters.AddWithValue("durata", durata);
                            cmd.Parameters.AddWithValue("user_id", user.user_id);
                            cmd.Parameters.AddWithValue("route", route);
                            cmd.ExecuteNonQuery();
                        }
                    }
                }
            }
        }

        public static bool checkTableExist(string SQLTableName)
        {
            string sql = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = @tableName";
            using (MySqlConnection conn = metaQueryMySql.GetOpenConnection(false))
            {
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@tableName", SQLTableName);
                return Convert.ToInt32(cmd.ExecuteScalar()) > 0;
            }
        }

        public static void getUploadedFile(_Metadati_Tabelle tabel, string connectionString, _Metadati_Colonne pkey, _Metadati_Colonne_Upload uploader, string tabel_name, string __id, out byte[] file)
        {
            using (MySqlConnection con = new MySqlConnection(connectionString))
            {

                string quote = "";
                if (tabel.md_primary_key_type == "GUID" || string.IsNullOrEmpty(tabel.md_primary_key_type))
                    quote = "'";

                string where = string.Format("{0} = {2}{1}{2}", RawHelpers.escapeDBObjectName(pkey.mc_nome_colonna, "mysql"), __id, quote);
                string cmdStr = string.Format("select {0} from {1} where {2}", RawHelpers.escapeDBObjectName(uploader.MultipleUploadBlobFieldName, "mysql"), tabel_name, where);

                using (MySqlCommand cmd = new MySqlCommand(cmdStr, con))
                {

                    con.Open();
                    object blob = cmd.ExecuteScalar();

                    if (blob != null && !(blob is DBNull))
                    {
                        if (blob.GetType() == typeof(string))
                        {
                            file = Convert.FromBase64String(blob.ToString());
                        }
                        else
                        {
                            file = (byte[])blob;
                        }
                    }
                    else
                    {
                        file = null;
                    }

                }

            }
        }

        public static void fixQueryReport(string user_id, dynamic report, string route, DbConnection connection, ref int needFilter, string[] filterSplit)
        {
            List<_Metadati_Colonne> lst = _Metadati_Colonne.getColonneByUserID(route, 0, user_id, dataMode.view, null);

            if (lst.Count > 0)
            {
                long totalRecords;
                _Metadati_Tabelle tbl = lst[0]._Metadati_Tabelle;

                List<AggregationResult> aggregateValues;
                FilterInfos fi = new FilterInfos() { logic = "AND", filters = new List<filterElement>() };

                if (needFilter == 0)
                {
                    for (int i = needFilter; i < filterSplit.Length; i++)
                    {
                        string[] filterDef = filterSplit[i].Split(new string[] { "||" }, StringSplitOptions.None);
                        if (filterDef.Length > 1)
                            fi.filters.Add(new filterElement() { field = filterDef[0], operatore = filterDef[1], value = filterDef[2], });
                    }
                }

                if (!tbl.md_is_stored)
                {
                    string query = metaQueryMySql.BuildDynamicSelectQuery(lst, null, null, null, fi, "AND", true, (MySqlConnection)connection, out totalRecords, null, out aggregateValues, user_id);

                    dynamic ds = report.Dictionary.DataSources[route.Trim().Replace(" ", "_")];
                    if (ds == null)
                        ds = report.Dictionary.DataSources[route.Replace(" ", "_")];

                    if (needFilter == 0 && ds != null)
                    {
                        var prop = ds.GetType().GetProperty("SqlCommand");
                        if (prop != null && prop.CanWrite)
                            prop.SetValue(ds, query);
                    }
                }

                needFilter = 1;

                _Metadati_Tabelle tabel = lst.First()._Metadati_Tabelle;

                if (!string.IsNullOrEmpty(tabel.md_nested_grid_routes) || !string.IsNullOrEmpty(tabel.md_detail_grid_routes))
                {
                    string relatedRouteDefinition = tabel.md_detail_grid_routes;
                    if (string.IsNullOrEmpty(relatedRouteDefinition))
                        relatedRouteDefinition = tabel.md_nested_grid_routes;

                    string[] relatedRoutes = relatedRouteDefinition.Split(',');
                    foreach (string relatedRoute in relatedRoutes)
                    {
                        string[] relatedRouteDef = relatedRoute.Split(new string[] { "||" }, StringSplitOptions.None);
                        string relatedRouteName = relatedRouteDef[0];

                        fixQueryReport(user_id, report, relatedRouteName, connection, ref needFilter, filterSplit);
                    }
                }
            }
        }

        public static string ImportFile(uploadOptions uploadOption, string theName, string fileName, _Metadati_Tabelle tabel, metaModelRaw.metaRawModel context)
        {
            StringBuilder log = new StringBuilder();
            int insertedRecord = 0;
            int updatedRecord = 0;
            int deletedRecord = 0;
            int errorCount = 0;
            using (MySqlConnection con = metaQueryMySql.GetOpenConnection(false))
            {
                using (MySqlTransaction myTrans = con.BeginTransaction())
                {
                    if (tabel != null)
                    {
                        DataTable dt;

                        if (uploadOption.fyle_type == "X")
                            dt = RawHelpers.createDataTablefromXLS(theName, log, fileName, uploadOption, ref errorCount);
                        else
                            dt = RawHelpers.createDataTablefromCSV(theName, log, fileName, uploadOption, ref errorCount);

                        var columns = dt.Columns.Cast<DataColumn>();
                        List<_Metadati_Colonne> pkeys = tabel._Metadati_Colonnes.Where(x => x.mc_is_primary_key is true).ToList();

                        bool returnValue;
                        if (RawHelpers.CheckImportColumns(columns, tabel, log, uploadOption, fileName, out returnValue, ref errorCount, pkeys))
                        {
                            return log.ToString();
                        }

                        IEnumerable<Dictionary<string, object>> dicts =
                            dt.Rows.OfType<DataRow>().Select(dataRow => columns.Select(column => new { Column = uploadOption.use_column_captions == "C" ? tabel._Metadati_Colonnes.FirstOrDefault(x => x.mc_display_string_in_view == column.ColumnName.Replace("#", ".")).mc_nome_colonna : column.ColumnName, Value = dataRow[column] }).ToDictionary(data => data.Column, data => data.Value));

                        int recordCounter = 0;
                        foreach (Dictionary<string, object> record in dicts)
                        {
                            string pk = "";
                            bool fkeyParsed = false;

                            recordCounter++;

                            if (uploadOption.import_type.Contains("U"))
                            {
                                //select using pkey values in record ... 
                                string table_name = RawHelpers.getStoreTableName(tabel, "mysql");

                                string query_check_from = string.Format(string.Format("SELECT * FROM {0} ", table_name));
                                string query_check_where = "";
                                bool flg = true;

                                foreach (_Metadati_Colonne pkey in pkeys)
                                {
                                    object pkey_value = record[pkey.mc_nome_colonna];
                                    if (pkey_value == null || string.IsNullOrEmpty(pkey_value.ToString()))
                                    {
                                        flg = false;
                                        break;
                                    }
                                    else
                                    {

                                        string quote = "";
                                        if (string.IsNullOrEmpty(tabel.md_primary_key_type) || tabel.md_primary_key_type == "GUID")
                                            quote = "'";

                                        query_check_where += (string.IsNullOrEmpty(query_check_where) ? " WHERE " : " AND ") + RawHelpers.getStoreTableName(tabel, "mysql") + "." + RawHelpers.escapeDBObjectName(pkey.mc_nome_colonna, "mysql") + " = " + quote + pkey_value + quote;
                                    }
                                }

                                if (flg)
                                {
                                    List<Dapper.SqlMapper.FastExpando> entity = (List<Dapper.SqlMapper.FastExpando>)con.Query(query_check_from + query_check_where, null, myTrans);
                                    if (entity.Count > 0)
                                    {
                                        if (!parseFKey(uploadOption, tabel, record, context, ref errorCount, log, fileName, recordCounter, "mysql"))
                                            return log.ToString();

                                        fkeyParsed = true;

                                        string update_query = metaQueryMySql.BuildDynamicUpdateQuery(record, tabel._Metadati_Colonnes.ToList(), uploadOption.user_id, true);
                                        string result = con.Execute(update_query, null, myTrans).ToString();

                                        updatedRecord++;
                                        continue;
                                    }
                                }

                            }

                            if (uploadOption.import_type.Contains("I"))
                            {
                                if (!fkeyParsed)
                                {
                                    if (!parseFKey(uploadOption, tabel, record, context, ref errorCount, log, fileName, recordCounter, "mysql"))
                                        return log.ToString();
                                }

                                string insert_query = metaQueryMySql.BuildDynamicInsertQuery(record, tabel._Metadati_Colonnes.ToList(), uploadOption.user_id, out pk, true);
                                string result = con.Execute(insert_query, null, myTrans).ToString();
                                insertedRecord++;
                                continue;
                            }
                        }

                        if (uploadOption.commit_level == "T")
                        {
                            myTrans.Rollback();
                            log.AppendLine(string.Format("Total records to be inserted: {0}", insertedRecord));
                            log.AppendLine(string.Format("Total records to be updated: {0}", updatedRecord));
                            log.AppendLine(string.Format("Total records to be deleted: {0}", deletedRecord));

                            log.AppendLine(string.Format("Test completed{0}.", errorCount == 0 ? " successfully" : " with " + errorCount + " errors"));
                        }
                        else
                        {
                            myTrans.Commit();
                            log.AppendLine(string.Format("Total records inserted: {0}", insertedRecord));
                            log.AppendLine(string.Format("Total records updated: {0}", updatedRecord));
                            log.AppendLine(string.Format("Total records deleted: {0}", deletedRecord));

                            log.AppendLine(string.Format("Import completed{0}.", errorCount == 0 ? " successfully" : " with " + errorCount + " errors"));
                        }


                    }
                }
            }

            return log.ToString();
        }

        public static bool parseFKey(uploadOptions uploadOption, _Metadati_Tabelle tabel, Dictionary<string, object> record, metaModelRaw.metaRawModel context, ref int errorCount, StringBuilder log, string fileName, long recordCounter, string dbms)
        {
            if (uploadOption.use_descriptive_fkey)
            {
                foreach (_Metadati_Colonne_Lookup lc in tabel._Metadati_Colonnes.OfType<_Metadati_Colonne_Lookup>())
                {
                    string key = (uploadOption.use_column_captions == "C" ? lc.mc_nome_colonna : lc.mc_display_string_in_view);
                    if (record.ContainsKey(key))
                    {
                        if (record[key] != null && !string.IsNullOrEmpty(record[key].ToString()))
                        {
                            _Metadati_Tabelle tabbe = context.GetMetadati_Tabelles(lc.mc_ui_lookup_entity_name).FirstOrDefault();
                            _Metadati_Colonne pkey = tabbe._Metadati_Colonnes.FirstOrDefault(x => x.mc_is_primary_key is true);
                            rawPagedResult match;

                            match = metaQueryMySql.GetFlatData(uploadOption.user_id, tabbe.md_route_name, 0, null, null, null, RawHelpers.createStandardFilter(lc.mc_ui_lookup_dataTextField, record[key].ToString(), pkey), "AND", true, null, null);

                            if (match.TotalRecords == 1)
                            {
                                IDictionary<string, object> found = match.results.OfType<Dapper.SqlMapper.FastExpando>().First().data;
                                record[key] = found[pkey.mc_nome_colonna];
                            }
                            else
                            {
                                errorCount++;
                                log.AppendLine(string.Format("Record {0}: Foreign key value error [{1} = {2}]", recordCounter, key, record[key]));
                                if (uploadOption.commit_level == "I" || uploadOption.commit_level == "R")
                                {
                                    HttpContext.Current.Response.Write(JsonConvert.SerializeObject(new uploadCallBackInfo { message = log.ToString(), filename = fileName, errorCount = errorCount }, Newtonsoft.Json.Formatting.Indented));
                                    return false;
                                }
                                else
                                {

                                }
                            }
                        }
                        else
                        {
                            record[key] = null;
                        }
                    }
                }
            }

            return true;
        }



    }

}













