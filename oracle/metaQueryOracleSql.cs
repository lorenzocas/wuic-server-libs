using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Linq;
using System.Security.Authentication;
using System.Web;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using System.Data.SqlClient;
using Dapper;
using System.Configuration;
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
using Microsoft.SqlServer.Management.Smo;
using Microsoft.SqlServer.Management.Common;
using System.Xml;
using Newtonsoft.Json.Linq;
using WEB_UI_CRAFTER.Helpers;
using Oracle.ManagedDataAccess.Client;
using HttpContext = System.WebCore.HttpContext;

namespace metaModelRaw
{
    public class metaQueryOracleSql
    {
        #region "CHARTING"

        public static string buildChartSelect(string chartType, string route, string user_id, string aggregationFunction, string valueField, FilterInfos filters, string categoryAxFld)
        {
            chartType tipo = (chartType)Enum.Parse(typeof(chartType), chartType);

            //route:                utenti
            //chartType:            bar
            //valueField:           PRID
            //aggregationFunction:  count
            //categoryAxFld:        PRID
            //seriesGroupingField:  ""

            string query = "SELECT {0} FROM {1} {5} {2} {4} ORDER BY {3}";
            string select_cols;
            string join = "";
            string current_fld;
            string group_by = "";
            string where = "";

            using (metaRawModel mmd = new metaRawModel())
            {
                List<_Metadati_Colonne> lst = _Metadati_Colonne.getColonneByUserID(route, 0, user_id, dataMode.view, null);
                _Metadati_Tabelle tab = lst.First()._Metadati_Tabelle;

                string table_name = (string.IsNullOrEmpty(tab.md_db_name) ? "" : "[" + tab.md_db_name + "]..") + metaQuery.EscapeDBObjectName(tab.md_nome_tabella);

                current_fld = table_name + "." + metaQuery.EscapeDBObjectName(categoryAxFld);

                select_cols = aggregationFunction + "(" + table_name + "." + metaQuery.EscapeDBObjectName(valueField) + ") AS " + metaQuery.EscapeDBObjectName(valueField) + ", coalesce(" + metaQuery.EscapeDBObjectName(categoryAxFld) + ", 'NULLO') AS " + metaQuery.EscapeDBObjectName(categoryAxFld);

                _Metadati_Colonne categoryColumn = lst.FirstOrDefault(x => x.mc_nome_colonna == categoryAxFld);
                _Metadati_Colonne_Lookup categoryColumnLookUp = categoryColumn as _Metadati_Colonne_Lookup;

                if (categoryColumnLookUp != null)
                {
                    categoryAxFld = categoryColumnLookUp.mc_ui_lookup_entity_name + "___" + categoryColumnLookUp.mc_ui_lookup_dataTextField;
                    _Metadati_Tabelle relatedTable = mmd.GetMetadati_Tabelles(categoryColumnLookUp.mc_ui_lookup_entity_name).FirstOrDefault();
                    string safeEntityName = (string.IsNullOrEmpty(tab.md_db_name) ? "" : "[" + tab.md_db_name + "]..") + metaQuery.EscapeDBObjectName(relatedTable.md_nome_tabella);
                    string safeUniqueEntityName = metaQuery.EscapeDBObjectName(categoryColumnLookUp.mc_nome_colonna + "_" + categoryColumnLookUp.mc_ui_lookup_entity_name);
                    string calculatedText = categoryColumnLookUp.mc_ui_lookup_computed_dataTextField;
                    string safeTextField = metaQuery.EscapeDBObjectName(categoryColumnLookUp.mc_ui_lookup_dataTextField);
                    join = string.Format(" LEFT JOIN {0} AS {3} ON {1} = {2} ", safeEntityName, current_fld, safeUniqueEntityName + "." + metaQuery.EscapeDBObjectName(categoryColumnLookUp.mc_ui_lookup_dataValueField), safeUniqueEntityName);
                    group_by = safeUniqueEntityName + "." + safeTextField;
                    select_cols = aggregationFunction + "(" + table_name + "." + metaQuery.EscapeDBObjectName(valueField) + ") AS " + metaQuery.EscapeDBObjectName(valueField) + ", coalesce(" + group_by + ", 'NULLO') AS " + safeTextField;
                }
                else
                {
                    group_by = current_fld;
                }

                if (filters != null)
                {
                    if (filters.filters.Count > 0)

                        lst.ForEach(fld =>
                        {
                            if (filters.filters.Any(x => x.field == "__extra"))
                                where = AppendFilter(fld, filters, "AND", (current_fld), where, tab, "", user_id);
                            else
                                where = AppendFilter(fld, filters, "AND", current_fld, where, tab, "", user_id);
                        });

                }

                query = string.Format(query, select_cols, table_name, where, group_by, string.IsNullOrEmpty(aggregationFunction) ? "" : "GROUP BY " + group_by, join);
                return query;
            }
        }


        #endregion

        #region "CONNECTION UTILS"
        public static string getTableFullName(_Metadati_Tabelle tab)
        {
            string table_name = tab.md_nome_tabella;
            string safetable_name = (string.IsNullOrEmpty(tab.md_db_name) ? "" : "[" + tab.md_db_name + "].") + (!string.IsNullOrEmpty(tab.md_schema_name) ? "[" + tab.md_schema_name + "]." : ".") + EscapeDBObjectName(table_name);
            if (string.IsNullOrEmpty(tab.md_db_name))
            {
                if (string.IsNullOrEmpty(tab.md_schema_name))
                {
                    safetable_name = EscapeDBObjectName(table_name);
                }
                else
                {
                    safetable_name = "[" + tab.md_schema_name + "]." + EscapeDBObjectName(table_name);
                }
            }
            else
            {
                if (string.IsNullOrEmpty(tab.md_schema_name))
                {
                    safetable_name = "[" + tab.md_db_name + "].." + EscapeDBObjectName(table_name);
                }
                else
                {
                    safetable_name = "[" + tab.md_db_name + "]." + "[" + tab.md_schema_name + "]." + EscapeDBObjectName(table_name);
                }
            }
            return safetable_name;
        }


        public static OracleConnection GetContentConnection()
        {
            string connectionString;
            connectionString = ConfigurationManager.ConnectionStrings["ContentSQLConnection"].ConnectionString;

            var connection = new OracleConnection(connectionString);
            connection.Open();
            return connection;
        }

        public static OracleConnection GetOpenConnection(bool isMetaDataQuery, string connectionName = "")
        {
            string connectionString;

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
                connectionString = ConfigurationManager.ConnectionStrings[connectionName].ConnectionString;

            var connection = new OracleConnection(connectionString);
            connection.Open();
            return connection;
        }

        #endregion

        #region "RETICULAR"

        public static string addReticularColumn(string route, string type, bool isReticular)
        {
            using (metaModelRaw.metaRawModel mmd = new metaModelRaw.metaRawModel("mssql"))
            {
                _Metadati_Tabelle tab = mmd.GetMetadati_Tabelles(route).FirstOrDefault();
                if (tab != null)
                {
                    string col_name = "";
                    string db_col_type = "";
                    string mc_ui_column_type = "";
                    List<_Metadati_Colonne> cols = tab._Metadati_Colonnes.ToList();
                    int text_col_count = cols.Where(x => x.mc_db_column_type == "varchar").Count();
                    int numeric_col_count = cols.Where(x => x.mc_db_column_type == "decimal" || x.mc_db_column_type == "bit").Count();
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

                        string query = "INSERT INTO [_metadati__colonne] ([voa_class], [md_id], [mc_db_column_type], [mc_display_string_in_edit], [mc_display_string_in_view], [mc_logic_editable], [mc_logic_nullable], [mc_nome_colonna], [mc_ui_column_type], [mccomputedformula], [mciscomputed], [mcgrantbydefault], [mcordine]) VALUES (@voa_class, @md_id, @mc_db_column_type, @mc_display_string_in_edit, @mc_display_string_in_view, @mc_logic_editable, @mc_logic_nullable, @mc_nome_colonna, @mc_ui_column_type, @mccomputedformula, @mciscomputed, @mcgrantbydefault, @mcordine); select SCOPE_IDENTITY()";
                        using (OracleConnection con = GetOpenConnection(true))
                        {
                            OracleCommand cmd = new OracleCommand(NormalizeSql(query), con);
                            cmd.Parameters.Add(new SqlParameter("voa_class", 1));
                            cmd.Parameters.Add(new SqlParameter("md_id", tab.md_id));
                            cmd.Parameters.Add(new SqlParameter("mc_db_column_type", db_col_type));
                            cmd.Parameters.Add(new SqlParameter("mc_display_string_in_edit", col_name));
                            cmd.Parameters.Add(new SqlParameter("mc_display_string_in_view", col_name));
                            cmd.Parameters.Add(new SqlParameter("mc_logic_editable", true));
                            cmd.Parameters.Add(new SqlParameter("mc_logic_nullable", true));
                            cmd.Parameters.Add(new SqlParameter("mc_nome_colonna", col_name));
                            cmd.Parameters.Add(new SqlParameter("mc_ui_column_type", mc_ui_column_type));
                            cmd.Parameters.Add(new SqlParameter("mccomputedformula", !isReticular ? "null" : ""));
                            cmd.Parameters.Add(new SqlParameter("mciscomputed", !isReticular ? true : false));
                            cmd.Parameters.Add(new SqlParameter("mcgrantbydefault", true));
                            cmd.Parameters.Add(new SqlParameter("mcordine", total_col_count));
                            cmd.Parameters.Add(new SqlParameter("mc_ui_slider_format", "N"));
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

                        string query = "INSERT INTO [_metadati__colonne] ([voa_class], [md_id], [mc_db_column_type], [mc_display_string_in_edit], [mc_display_string_in_view], [mc_logic_editable], [mc_logic_nullable], [mc_nome_colonna], [mc_ui_column_type], [mccomputedformula], [mciscomputed], [mcgrantbydefault], [mcordine]) VALUES (@voa_class, @md_id, @mc_db_column_type, @mc_display_string_in_edit, @mc_display_string_in_view, @mc_logic_editable, @mc_logic_nullable, @mc_nome_colonna, @mc_ui_column_type, @mccomputedformula, @mciscomputed, @mcgrantbydefault, @mcordine); select SCOPE_IDENTITY()";
                        using (OracleConnection con = GetOpenConnection(true))
                        {
                            OracleCommand cmd = new OracleCommand(NormalizeSql(query), con);
                            cmd.Parameters.Add(new SqlParameter("voa_class", 1));
                            cmd.Parameters.Add(new SqlParameter("md_id", tab.md_id));
                            cmd.Parameters.Add(new SqlParameter("mc_db_column_type", db_col_type));
                            cmd.Parameters.Add(new SqlParameter("mc_display_string_in_edit", col_name));
                            cmd.Parameters.Add(new SqlParameter("mc_display_string_in_view", col_name));
                            cmd.Parameters.Add(new SqlParameter("mc_logic_editable", true));
                            cmd.Parameters.Add(new SqlParameter("mc_logic_nullable", true));
                            cmd.Parameters.Add(new SqlParameter("mc_nome_colonna", col_name));
                            cmd.Parameters.Add(new SqlParameter("mc_ui_column_type", mc_ui_column_type));
                            cmd.Parameters.Add(new SqlParameter("mccomputedformula", !isReticular ? "null" : ""));
                            cmd.Parameters.Add(new SqlParameter("mciscomputed", !isReticular ? true : false));
                            cmd.Parameters.Add(new SqlParameter("mcgrantbydefault", true));
                            cmd.Parameters.Add(new SqlParameter("mcordine", total_col_count));
                            cmd.Parameters.Add(new SqlParameter("mc_ui_slider_format", "N"));
                            return cmd.ExecuteScalar().ToString();
                        }



                    }
                    else if (type == "3")
                    {
                        col_name = string.Format("colonna_{0}_numero", (numeric_col_count + 1).ToString().PadLeft(3, '0'));
                        db_col_type = "decimal";
                        mc_ui_column_type = "number";

                        string query = "INSERT INTO [_metadati__colonne] ([voa_class], [md_id], [mc_db_column_type], [mc_display_string_in_edit], [mc_display_string_in_view], [mc_logic_editable], [mc_logic_nullable], [mc_nome_colonna], [mc_ui_column_type], [mccomputedformula], [mciscomputed], [mcgrantbydefault], [mcordine]) VALUES (@voa_class, @md_id, @mc_db_column_type, @mc_display_string_in_edit, @mc_display_string_in_view, @mc_logic_editable, @mc_logic_nullable, @mc_nome_colonna, @mc_ui_column_type, @mccomputedformula, @mciscomputed, @mcgrantbydefault, @mcordine); select SCOPE_IDENTITY()";
                        using (OracleConnection con = GetOpenConnection(true))
                        {
                            OracleCommand cmd = new OracleCommand(NormalizeSql(query), con);
                            cmd.Parameters.Add(new SqlParameter("voa_class", 3));
                            cmd.Parameters.Add(new SqlParameter("md_id", tab.md_id));
                            cmd.Parameters.Add(new SqlParameter("mc_db_column_type", db_col_type));
                            cmd.Parameters.Add(new SqlParameter("mc_display_string_in_edit", col_name));
                            cmd.Parameters.Add(new SqlParameter("mc_display_string_in_view", col_name));
                            cmd.Parameters.Add(new SqlParameter("mc_logic_editable", true));
                            cmd.Parameters.Add(new SqlParameter("mc_logic_nullable", true));
                            cmd.Parameters.Add(new SqlParameter("mc_nome_colonna", col_name));
                            cmd.Parameters.Add(new SqlParameter("mc_ui_column_type", mc_ui_column_type));
                            cmd.Parameters.Add(new SqlParameter("mccomputedformula", !isReticular ? "null" : ""));
                            cmd.Parameters.Add(new SqlParameter("mciscomputed", !isReticular ? true : false));
                            cmd.Parameters.Add(new SqlParameter("mcgrantbydefault", true));
                            cmd.Parameters.Add(new SqlParameter("mcordine", total_col_count));
                            cmd.Parameters.Add(new SqlParameter("mc_ui_slider_format", "N"));
                            return cmd.ExecuteScalar().ToString();
                        }

                    }
                    else if (type == "4")
                    {
                        col_name = string.Format("colonna_{0}_numero", (numeric_col_count + 1).ToString().PadLeft(3, '0'));
                        db_col_type = "bit";
                        mc_ui_column_type = "boolean";

                        string display_name = col_name.Replace("_numero", "_bit");

                        string query = "INSERT INTO [_metadati__colonne] ([voa_class], [md_id], [mc_db_column_type], [mc_display_string_in_edit], [mc_display_string_in_view], [mc_logic_editable], [mc_logic_nullable], [mc_nome_colonna], [mc_ui_column_type], [mccomputedformula], [mciscomputed], [mcgrantbydefault], [mcordine]) VALUES (@voa_class, @md_id, @mc_db_column_type, @mc_display_string_in_edit, @mc_display_string_in_view, @mc_logic_editable, @mc_logic_nullable, @mc_nome_colonna, @mc_ui_column_type, @mccomputedformula, @mciscomputed, @mcgrantbydefault, @mcordine); select SCOPE_IDENTITY()";
                        using (OracleConnection con = GetOpenConnection(true))
                        {
                            OracleCommand cmd = new OracleCommand(NormalizeSql(query), con);
                            cmd.Parameters.Add(new SqlParameter("voa_class", 3));
                            cmd.Parameters.Add(new SqlParameter("md_id", tab.md_id));
                            cmd.Parameters.Add(new SqlParameter("mc_db_column_type", db_col_type));
                            cmd.Parameters.Add(new SqlParameter("mc_display_string_in_edit", display_name));
                            cmd.Parameters.Add(new SqlParameter("mc_display_string_in_view", display_name));
                            cmd.Parameters.Add(new SqlParameter("mc_logic_editable", true));
                            cmd.Parameters.Add(new SqlParameter("mc_logic_nullable", true));
                            cmd.Parameters.Add(new SqlParameter("mc_nome_colonna", col_name));
                            cmd.Parameters.Add(new SqlParameter("mc_ui_column_type", mc_ui_column_type));
                            cmd.Parameters.Add(new SqlParameter("mccomputedformula", !isReticular ? "null" : ""));
                            cmd.Parameters.Add(new SqlParameter("mciscomputed", !isReticular ? true : false));
                            cmd.Parameters.Add(new SqlParameter("mcgrantbydefault", true));
                            cmd.Parameters.Add(new SqlParameter("mcordine", total_col_count));
                            return cmd.ExecuteScalar().ToString();
                        }

                    }
                    else if (type == "5")
                    {
                        col_name = string.Format("colonna_{0}_numero", (numeric_col_count + 1).ToString().PadLeft(3, '0'));
                        db_col_type = "int";
                        mc_ui_column_type = "lookupByID";

                        string display_name = col_name.Replace("_numero", "_lookup");

                        string query = "INSERT INTO [_metadati__colonne] ([voa_class], [md_id], [mc_db_column_type], [mc_display_string_in_edit], [mc_display_string_in_view], [mc_logic_editable], [mc_logic_nullable], [mc_nome_colonna], [mc_ui_column_type], [mccomputedformula], [mciscomputed], [mcgrantbydefault], [mcordine]) VALUES (@voa_class, @md_id, @mc_db_column_type, @mc_display_string_in_edit, @mc_display_string_in_view, @mc_logic_editable, @mc_logic_nullable, @mc_nome_colonna, @mc_ui_column_type, @mccomputedformula, @mciscomputed, @mcgrantbydefault, @mcordine); select SCOPE_IDENTITY()";
                        using (OracleConnection con = GetOpenConnection(true))
                        {
                            OracleCommand cmd = new OracleCommand(NormalizeSql(query), con);
                            cmd.Parameters.Add(new SqlParameter("voa_class", 2));
                            cmd.Parameters.Add(new SqlParameter("md_id", tab.md_id));
                            cmd.Parameters.Add(new SqlParameter("mc_db_column_type", db_col_type));
                            cmd.Parameters.Add(new SqlParameter("mc_display_string_in_edit", display_name));
                            cmd.Parameters.Add(new SqlParameter("mc_display_string_in_view", display_name));
                            cmd.Parameters.Add(new SqlParameter("mc_logic_editable", true));
                            cmd.Parameters.Add(new SqlParameter("mc_logic_nullable", true));
                            cmd.Parameters.Add(new SqlParameter("mc_nome_colonna", col_name));
                            cmd.Parameters.Add(new SqlParameter("mc_ui_column_type", mc_ui_column_type));
                            cmd.Parameters.Add(new SqlParameter("mccomputedformula", !isReticular ? "null" : ""));
                            cmd.Parameters.Add(new SqlParameter("mciscomputed", !isReticular ? true : false));
                            cmd.Parameters.Add(new SqlParameter("mcgrantbydefault", true));
                            cmd.Parameters.Add(new SqlParameter("mcordine", total_col_count));
                            return cmd.ExecuteScalar().ToString();
                        }

                    }
                    else if (type == "6")
                    {
                        col_name = string.Format("colonna_{0}_testo", (text_col_count + 1).ToString().PadLeft(3, '0'));
                        db_col_type = "varchar";
                        mc_ui_column_type = "button";

                        string display_name = col_name.Replace("_testo", "_button");

                        string query = "INSERT INTO [_metadati__colonne] ([voa_class], [md_id], [mc_db_column_type], [mc_display_string_in_edit], [mc_display_string_in_view], [mc_logic_editable], [mc_logic_nullable], [mc_nome_colonna], [mc_ui_column_type], [mccomputedformula], [mciscomputed], [mcgrantbydefault], [mcordine], mchideinedit, mcisdbcomputed) VALUES (@voa_class, @md_id, @mc_db_column_type, @mc_display_string_in_edit, @mc_display_string_in_view, @mc_logic_editable, @mc_logic_nullable, @mc_nome_colonna, @mc_ui_column_type, @mccomputedformula, @mciscomputed, @mcgrantbydefault, @mcordine, @mchideinedit, @mcisdbcomputed); select SCOPE_IDENTITY()";
                        using (OracleConnection con = GetOpenConnection(true))
                        {
                            OracleCommand cmd = new OracleCommand(NormalizeSql(query), con);
                            cmd.Parameters.Add(new SqlParameter("voa_class", 6));
                            cmd.Parameters.Add(new SqlParameter("md_id", tab.md_id));
                            cmd.Parameters.Add(new SqlParameter("mc_db_column_type", db_col_type));
                            cmd.Parameters.Add(new SqlParameter("mc_display_string_in_edit", display_name));
                            cmd.Parameters.Add(new SqlParameter("mc_display_string_in_view", display_name));
                            cmd.Parameters.Add(new SqlParameter("mc_logic_editable", false));
                            cmd.Parameters.Add(new SqlParameter("mc_logic_nullable", true));
                            cmd.Parameters.Add(new SqlParameter("mc_nome_colonna", col_name));
                            cmd.Parameters.Add(new SqlParameter("mc_ui_column_type", mc_ui_column_type));
                            cmd.Parameters.Add(new SqlParameter("mccomputedformula", !isReticular ? "''" : ""));
                            cmd.Parameters.Add(new SqlParameter("mciscomputed", !isReticular ? true : false));
                            cmd.Parameters.Add(new SqlParameter("mcgrantbydefault", true));
                            cmd.Parameters.Add(new SqlParameter("mcordine", total_col_count));
                            cmd.Parameters.Add(new SqlParameter("mchideinedit", true));
                            cmd.Parameters.Add(new SqlParameter("mcisdbcomputed", false));

                            return cmd.ExecuteScalar().ToString();
                        }

                    }
                    else if (type == "7")
                    {
                        col_name = string.Format("colonna_{0}_testo", (text_col_count + 1).ToString().PadLeft(3, '0'));
                        db_col_type = "varchar";
                        mc_ui_column_type = "multiple_check";

                        string display_name = col_name.Replace("_testo", "_multiple_check");

                        string query = "INSERT INTO [_metadati__colonne] ([voa_class], [md_id], [mc_db_column_type], [mc_display_string_in_edit], [mc_display_string_in_view], [mc_logic_editable], [mc_logic_nullable], [mc_nome_colonna], [mc_ui_column_type], [mcgrantbydefault], [mcordine], [mccomputedformula], [mciscomputed]) VALUES (@voa_class, @md_id, @mc_db_column_type, @mc_display_string_in_edit, @mc_display_string_in_view, @mc_logic_editable, @mc_logic_nullable, @mc_nome_colonna, @mc_ui_column_type, @mcgrantbydefault, @mcordine, @mccomputedformula, @mciscomputed); select SCOPE_IDENTITY()";
                        using (OracleConnection con = GetOpenConnection(true))
                        {
                            OracleCommand cmd = new OracleCommand(NormalizeSql(query), con);
                            cmd.Parameters.Add(new SqlParameter("voa_class", 4));
                            cmd.Parameters.Add(new SqlParameter("md_id", tab.md_id));
                            cmd.Parameters.Add(new SqlParameter("mc_db_column_type", db_col_type));
                            cmd.Parameters.Add(new SqlParameter("mc_display_string_in_edit", display_name));
                            cmd.Parameters.Add(new SqlParameter("mc_display_string_in_view", display_name));
                            cmd.Parameters.Add(new SqlParameter("mc_logic_editable", true));
                            cmd.Parameters.Add(new SqlParameter("mc_logic_nullable", true));
                            cmd.Parameters.Add(new SqlParameter("mc_nome_colonna", col_name));
                            cmd.Parameters.Add(new SqlParameter("mc_ui_column_type", mc_ui_column_type));
                            cmd.Parameters.Add(new SqlParameter("mcgrantbydefault", true));
                            cmd.Parameters.Add(new SqlParameter("mcordine", total_col_count));
                            cmd.Parameters.Add(new SqlParameter("mccomputedformula", "''"));
                            cmd.Parameters.Add(new SqlParameter("mciscomputed", true));

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

                public static OracleConnection getSpecificConnection(string db_name)
        {
            OracleConnection connection;
            if (string.IsNullOrEmpty(db_name))
            {
                connection = GetOpenConnection(false);
            }
            else
            {
                connection = new OracleConnection(ConfigHelper.GetSettingAsString("connection") + string.Format(";initial catalog={0}", db_name));
                connection.Open();
            }

            return connection;
        }

        public static List<Dictionary<string, object>> convertDataReaderToDictionaryList(DbDataReader dr)
        {
            List<Dictionary<string, object>> rows = new List<Dictionary<string, object>>();
            if (dr == null)
                return rows;

            while (dr.Read())
            {
                Dictionary<string, object> row = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                for (int i = 0; i < dr.FieldCount; i++)
                    row[dr.GetName(i)] = dr.IsDBNull(i) ? null : dr.GetValue(i);

                rows.Add(row);
            }

            return rows;
        }

        private static string checkUserName(string user_name, string email, OracleConnection connection)
        {
            if (user.getUserByName(user_name) != null)
            {
                return "-1"; // throw new ValidationException(string.Format("User name '{0}' già utilizzato", user_name));
            }

            if (user.getUserByEMail(email) != null)
            {
                return "-2";  //throw new ValidationException(string.Format("E-mail '{0}' già utilizzata", email));
            }

            string query = "select * from cms.register_requests where username=@username";
            OracleCommand cmd = new OracleCommand(NormalizeSql(query), connection);
            cmd.Parameters.Add(new SqlParameter("username", user_name));
            OracleDataAdapter adpt = new OracleDataAdapter(cmd);
            DataTable dt = new DataTable();
            adpt.Fill(dt);

            if (dt.Rows.Count > 0)
                return "-1"; //throw new ValidationException(string.Format("User name '{0}' già utilizzato", user_name));

            query = "select * from cms.register_requests where email=@email";
            cmd = new OracleCommand(NormalizeSql(query), connection);
            cmd.Parameters.Add(new SqlParameter("email", email));
            adpt = new OracleDataAdapter(cmd);
            dt = new DataTable();
            adpt.Fill(dt);

            if (dt.Rows.Count > 0)
                return "-2";  //throw new ValidationException(string.Format("E-mail '{0}' già utilizzata", email));

            return user_name;
        }

        public static void logOut(user user)
        {
            if (bool.Parse(ConfigHelper.GetSettingAsString("enableCookieAuthentication")))
            {
                using (metaRawModel context = new metaRawModel())
                {
                    SysInfo infos = context.GetSysInfos();
                    using (OracleConnection connection = string.IsNullOrEmpty(infos.user_db_name) ? GetOpenConnection(true) : getSpecificConnection(infos.user_db_name))
                    {
                        connection.Execute(string.Format("UPDATE {0} SET {1}='', LastLogoutDate=getdate(), IsLoggedIn = 0 WHERE {2} = {3}", infos.user_table_name, "token", infos.user_id_column_name, user.user_id));
                    }
                }
            }

            if (HttpContext.Current?.Request?.Cookies["user"] != null)
            {
                HttpContext.Current.Response.Cookies["userId"].Expires = DateTime.Now.AddDays(-1);
            }

        }

        public static rawPagedResult getLoggedUsers()
        {
            using (OracleConnection connection = GetOpenConnection(true))
            {
                string stored = "loggedUserList";
                var dbArgs = new DynamicParameters();
                dbArgs.Add("@sessiontimeout", ConfigHelper.GetSettingAsString("sessionTimeoutMinutes"));
                List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)connection.Query(stored, dbArgs, commandType: CommandType.StoredProcedure);

                return new rawPagedResult() { Agg = null, results = rows, TotalRecords = rows.Count };
            }

        }

        public static Int32 getLoggedUserCount()
        {
            using (OracleConnection connection = GetOpenConnection(true))
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
            using (OracleConnection connection = string.IsNullOrEmpty(infos.user_db_name) ? GetOpenConnection(true) : getSpecificConnection(infos.user_db_name))
            {
                bool isPwdEncripted = bool.Parse(ConfigHelper.GetSettingAsString("IsPwdEncripted") ?? "false");
                string encriptionMethod = ConfigHelper.GetSettingAsString("encriptionMethod") ?? "SHA1";

                Dapper.SqlMapper.FastExpando user = ((List<Dapper.SqlMapper.FastExpando>)connection.Query(string.Format("SELECT id_utente, username, isAdmin, id_ruolo, userdescription, email, token, ip, language, {0} as pwd_hash FROM {1} WHERE {2} = '{3}' and coalesce(cancellato,0)=0", infos.password_column_name, infos.user_table_name, infos.username_column_name, EscapeValue(user_name)))).FirstOrDefault();

                if (user == null) return null;

                if (isPwdEncripted)
                {
                    string storedHash = ((IDictionary<string, object>)user)["pwd_hash"]?.ToString() ?? "";
                    if (!Global.verifyPassword(password, storedHash, encriptionMethod))
                        return null;
                    if (!Global.isPbkdf2Hash(storedHash))
                    {
                        string newHash = Global.pbkdf2Hash(password);
                        connection.Execute(string.Format("UPDATE {0} SET {1}='{2}' WHERE {3} = '{4}'", infos.user_table_name, infos.password_column_name, EscapeValue(newHash), infos.username_column_name, EscapeValue(user_name)));
                    }
                }
                else
                {
                    string storedPwd = ((IDictionary<string, object>)user)["pwd_hash"]?.ToString() ?? "";
                    if (storedPwd != password) return null;
                }

                {
                    user u = mapUserFields(infos, user);

                    if (bool.Parse(ConfigHelper.GetSettingAsString("enableCookieAuthentication")))
                    {
                        string iP = HttpContext.Current.Request.UserHostAddress;
                        string token = Guid.NewGuid().ToString();
                        connection.Execute(string.Format("UPDATE {0} SET {1}='{2}', ip = '{5}' WHERE {3} = {4}", infos.user_table_name, "token", token, infos.user_id_column_name, u.user_id, iP));
                        u.user_token = token;
                    }

                    connection.Execute(string.Format("UPDATE {0} SET LastLoginDate=getdate(), LastActivityDate=getdate(), IsLoggedIn = 1 WHERE {1} = {2}", infos.user_table_name, infos.user_id_column_name, u.user_id));


                    return u;
                }
            }
        }

        private static user mapUserFields(SysInfo infos, SqlMapper.FastExpando user)
        {
            string userid = user.Where(x => x.Key == infos.user_id_column_name).First().Value.ToString();

            string display = user.Where(x => x.Key == infos.user_description_column_name).First().Value.ToString();
            bool isAdmin = (bool)user.Where(x => x.Key == infos.isAdmin_column_name).First().Value;
            string roleName = getRoleByUserID(userid).role_name;
            string role_id = user.Where(x => x.Key == infos.role_id_column_name).First().Value.ToString();
            string uName = user.Where(x => x.Key == infos.username_column_name).First().Value.ToString();
            List<role> roles = getMultipleRoleRoleByUserID(userid);

            user u = new user()
            {
                display_name = display,
                isAdmin = isAdmin,
                role = roleName,
                otherRoles = roles,
                role_id = role_id,
                user_id = userid,
                username = uName,
                extra_keys = new SerializableDictionary<string, object>()
            };

            if (user.data.ContainsKey("language") && user.data["language"] != null)
                u.language = user.data["language"].ToString();

            var extra_fields = user.data.Keys.Where(x => x != infos.password_column_name);

            foreach (string extra_field in extra_fields)
            {
                var user_param = user.data[extra_field];
                u.extra_keys.Add(extra_field, user_param != null ? user_param.ToString() : "");
            }

            KeyValuePair<string, object>? az_field = user.Where(x => x.Key == infos.azienda_id_column_name).FirstOrDefault();
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
                role_name = role.Where(x => x.Key == infos.role_description_column_name).First().Value.ToString(),
                role_id = role.Where(x => x.Key == infos.role_id_column_name).First().Value.ToString(),
            };
        }

        public static List<user> getUserList()
        {
            using (metaRawModel context = new metaRawModel())
            {
                SysInfo infos = context.GetSysInfos();

                if (infos == null)
                    return null;

                using (OracleConnection connection = string.IsNullOrEmpty(infos.user_db_name) ? GetOpenConnection(true) : getSpecificConnection(infos.user_db_name))
                {
                    List<user> users = new List<user>();
                    List<Dapper.SqlMapper.FastExpando> userss = (List<Dapper.SqlMapper.FastExpando>)connection.Query(string.Format("SELECT * FROM {0} ORDER BY {1}", infos.user_table_name, infos.username_column_name));
                    userss.ForEach((xx) =>
                    {
                        users.Add(mapUserFields(infos, xx));
                    });

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

                using (OracleConnection connection = string.IsNullOrEmpty(infos.role_db_name) ? GetOpenConnection(true) : getSpecificConnection(infos.role_db_name))
                {
                    List<role> roles = new List<role>();
                    List<Dapper.SqlMapper.FastExpando> roless = (List<Dapper.SqlMapper.FastExpando>)connection.Query(string.Format("SELECT * FROM {0} ORDER BY {1}", infos.role_table_name, infos.role_description_column_name));
                    roless.ForEach((xx) =>
                    {
                        roles.Add(mapRoleFields(infos, xx));
                    });

                    return roles;
                }
            }
        }

        public static rawPagedResult getAziendeList()
        {
            using (metaRawModel context = new metaRawModel())
            {
                SysInfo infos = context.GetSysInfos();


                using (OracleConnection connection = GetOpenConnection(true))
                {
                    List<Dapper.SqlMapper.FastExpando> azs = (List<Dapper.SqlMapper.FastExpando>)connection.Query(string.Format("SELECT * FROM {0} ORDER BY {1}", "aziende", "nome_azienda"));

                    return new rawPagedResult() { results = azs, TotalRecords = azs.Count, Agg = null };
                }
            }
        }

        public static role GetRoleByUserID(string user_id)
        {
            return getRoleByUserID(user_id);
        }
        
        public static role getRoleByUserID(string user_id)
        {
            using (metaRawModel context = new metaRawModel())
            {
                SysInfo infos = context.GetSysInfos();

                if (infos == null)
                    return null;

                using (OracleConnection connection = string.IsNullOrEmpty(infos.role_db_name) ? GetOpenConnection(true) : getSpecificConnection(infos.role_db_name))
                {
                    Dapper.SqlMapper.FastExpando role = ((List<Dapper.SqlMapper.FastExpando>)connection.Query(string.Format("SELECT {2}.{0}, {2}.{1} FROM {2} inner join {5} ON {2}.{6}={5}.{7} WHERE {3}='{4}'", infos.role_id_column_name, infos.role_description_column_name, infos.role_table_name, infos.user_id_column_name, user_id, infos.user_table_name, infos.role_id_column_name, infos.role_user_table_fk_name))).FirstOrDefault();
                    if (role != null)
                    {
                        return mapRoleFields(infos, role);
                    }
                    return null;
                }
            }
        }

        public static List<role> getMultipleRoleRoleByUserID(string user_id)
        {
            using (metaRawModel context = new metaRawModel())
            {
                SysInfo infos = context.GetSysInfos();

                if (infos == null)
                    return null;

                using (OracleConnection connection = string.IsNullOrEmpty(infos.role_db_name) ? GetOpenConnection(true) : getSpecificConnection(infos.role_db_name))
                {
                    var dbArgs = new DynamicParameters();
                    dbArgs.Add("@uid", user_id);

                    string query = string.Format("SELECT {0}.{1}, {0}.{2} FROM {0} inner join utenti_ruoli on utenti_ruoli.{1} = {0}.{1} inner join utenti on utenti_ruoli.{6} = {4}.{6} WHERE {4}.{3}=@uid", infos.role_table_name, infos.role_id_column_name, infos.role_description_column_name, infos.user_id_column_name, infos.user_table_name, infos.role_user_table_fk_name, infos.user_id_column_name);

                    List<Dapper.SqlMapper.FastExpando> roles = ((List<Dapper.SqlMapper.FastExpando>)connection.Query(NormalizeSql(query), dbArgs));

                    List<role> roleList = new List<role>();

                    roles.ForEach(r =>
                    {
                        roleList.Add(mapRoleFields(infos, r));
                    });

                    return roleList;
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

                using (OracleConnection connection = string.IsNullOrEmpty(infos.user_db_name) ? GetOpenConnection(true) : getSpecificConnection(infos.user_db_name))
                {

                    Dapper.SqlMapper.FastExpando user = ((List<Dapper.SqlMapper.FastExpando>)connection.Query(string.Format("SELECT * FROM {0} WHERE {1}='{2}'", infos.user_table_name, infos.user_id_column_name, user_id))).FirstOrDefault();
                    if (user != null)
                    {
                        return mapUserFields(infos, user);
                    }
                    return null;
                }
            }
        }

        public static user GetUserByEMail(string email)
        {
            return getUserByEMail(email);
        }
        
        public static user getUserByEMail(string email)
        {
            using (metaRawModel context = new metaRawModel())
            {
                SysInfo infos = context.GetSysInfos();

                if (infos == null)
                    return null;

                using (OracleConnection connection = string.IsNullOrEmpty(infos.user_db_name) ? GetOpenConnection(true) : getSpecificConnection(infos.user_db_name))
                {
                    Dapper.SqlMapper.FastExpando user = ((List<Dapper.SqlMapper.FastExpando>)connection.Query(string.Format("SELECT * FROM {0} WHERE {1}='{2}'", infos.user_table_name, infos.email_column_name, email))).FirstOrDefault();
                    if (user != null)
                    {
                        return mapUserFields(infos, user);
                    }
                    return null;
                }
            }
        }

        public static user GetUserByName(string user_name)
        {
            return getUserByName(user_name);
        }
        
        public static user getUserByName(string user_name)
        {
            using (metaRawModel context = new metaRawModel())
            {
                SysInfo infos = context.GetSysInfos();

                if (infos == null)
                    return null;

                using (OracleConnection connection = string.IsNullOrEmpty(infos.user_db_name) ? GetOpenConnection(true) : getSpecificConnection(infos.user_db_name))
                {
                    Dapper.SqlMapper.FastExpando user = ((List<Dapper.SqlMapper.FastExpando>)connection.Query(string.Format("SELECT * FROM {0} WHERE {1}='{2}'", infos.user_table_name, infos.username_column_name, user_name))).FirstOrDefault();
                    if (user != null)
                    {
                        return mapUserFields(infos, user);
                    }
                    return null;
                }
            }
        }

        #endregion

        #region "FLAT"


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

                        query = BuildDynamicSelectQuery(tabel._Metadati_Colonnes.ToList(), null, null, new PageInfo() { currentPage = 0, pageSize = max_results }, finfos, "AND", true, (OracleConnection)connection, out ouut, null, out nullo, user_id, "", 0, column_name);

                        try
                        {
                            List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)connection.Query(NormalizeSql(query));
                            return new rawPagedResult() { results = rows, TotalRecords = rows.Count, Agg = null };
                        }
                        catch (SqlException ex1)
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

        public static rawPagedResult GetFlatData(string user_id, string route, int lookup_table_id, List<SortInfo> SortInfo, List<GroupInfo> GroupInfo, PageInfo PageInfo, FilterInfos filterInfo, string logicOperator, bool has_server_operation, List<AggregationInfo> aggregates, List<string> columnRestrictionLists, string formula_lookup = "", int mc_id = 0, bool skipNested = false)
        {
            List<_Metadati_Colonne> lst = _Metadati_Colonne.getColonneByUserID(route, lookup_table_id, user_id, dataMode.view, columnRestrictionLists);
            if (!string.IsNullOrEmpty(formula_lookup))
            {
                int col_to_override_index = lst.IndexOf(lst.FirstOrDefault(x => !x.mc_is_primary_key));

                if (col_to_override_index < 0) col_to_override_index = 0;

                lst[col_to_override_index] = new _Metadati_Colonne() { mc_nome_colonna = lst[col_to_override_index].mc_nome_colonna, _Metadati_Tabelle = lst[col_to_override_index]._Metadati_Tabelle, mc_computed_formula = formula_lookup, mc_ui_column_type = "text", mc_is_computed = true, mc_grant_by_default = lst[col_to_override_index].mc_grant_by_default };
            }

            if (lst.Count > 0)
            {
                string query = "";
                long totalRecords;
                List<AggregationResult> aggregateValues;
                _Metadati_Tabelle tab = lst.First()._Metadati_Tabelle;

                using (OracleConnection connection = GetOpenConnection(RawHelpers.checkIsMetaData(route), tab.md_conn_name))
                {

                    query = BuildDynamicSelectQuery(lst, SortInfo, GroupInfo, PageInfo, filterInfo, logicOperator, has_server_operation, connection, out totalRecords, aggregates, out aggregateValues, user_id, formula_lookup, mc_id);

                    List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)connection.Query(NormalizeSql(query), commandTimeout: 2000);

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
            }
            else
            {
                return null;
            }
        }

        public static string GetValueFromStored(string user_id, string stored, List<filterElement> parameters)
        {
            using (metaRawModel context = new metaRawModel())
            {
                _Metadati_Tabelle metaStored = context.GetMetadati_Tabelles(stored).FirstOrDefault();

                if (metaStored != null)
                {

                    using (OracleConnection connection = metaQueryOracleSql.GetOpenConnection(false, metaStored.md_conn_name))
                    {
                        stored = RawHelpers.getStorePrefix(metaStored, "oracle") + RawHelpers.getDBEntityQuoteSymbol("oracle") + metaStored.md_nome_tabella + RawHelpers.getDBEntityQuoteSymbol("oracle", false);

                        OracleCommand cmd = new OracleCommand(stored, connection);

                        foreach (var pair in parameters)
                        {
                            cmd.Parameters.Add(pair.field, pair.value);
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
                    using (OracleConnection connection = GetOpenConnection(false, metaStored.md_conn_name))
                    {
                        stored = RawHelpers.getStoreTableName(metaStored, "mssql");

                        var dbArgs = new DynamicParameters();
                        foreach (JToken jt in parameterDefinition)
                        {
                            var pair = parameters.FirstOrDefault(x => x.field == jt["Name"].ToString());

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

                        //test stored with normal out params, multiple output normal param, cursor + normal output param -> bind
                        if (parameterDefinition != null && parameterDefinition.Count != parameters.Count)
                            return new rawPagedResult() { results = new List<Dapper.SqlMapper.FastExpando>(), TotalRecords = 0 };

                        List<Dapper.SqlMapper.FastExpando> rows = new List<SqlMapper.FastExpando>();
                        long conto = 0;

                        if (noResults)
                        {
                            connection.Execute(stored, dbArgs, commandType: CommandType.StoredProcedure, commandTimeout: 200);
                        }
                        else
                        {
                            rows = (List<Dapper.SqlMapper.FastExpando>)connection.Query(stored, dbArgs, commandType: CommandType.StoredProcedure, commandTimeout: 200);
                        }

                        if (rows.Count == 1 && rows[0].data.Keys.Count == 1 && string.IsNullOrEmpty(rows[0].data.Keys.First()))
                        {
                            rows[0].data["valore"] = rows[0].data[""];
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
            using (OracleConnection connection = GetOpenConnection(false))
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

        public static string UpdateflatData(Dictionary<string, object> entity, string route, string userId)
        {
            string query = "";

            try
            {

                bool isMeta = RawHelpers.checkIsMetaData(route);
                List<_Metadati_Colonne> metadata = _Metadati_Colonne.getColonneByUserID(route, 0, userId, dataMode.edit, null);
                _Metadati_Tabelle tab = metadata.First()._Metadati_Tabelle;

                using (OracleConnection connection = GetOpenConnection(isMeta, tab.md_conn_name))
                {

                    if (!OptimisticCheck(entity, route, metadata))
                    {
                        ValidationException optEx = new ValidationException("Errore concorrenza ottimistica");
                        throw optEx;
                    }

                    List<_Metadati_Colonne_Upload> upload_fixes = metadata.OfType<_Metadati_Colonne_Upload>().Where(x => x.isDBUpload).ToList();
                    List<_Metadati_Colonne_Grid> multiple_check_fixes = metadata.OfType<_Metadati_Colonne_Grid>().ToList();

                    query = BuildDynamicUpdateQuery(entity, metadata, userId);

                    RawHelpers.setMetadataVersion(metadata.FirstOrDefault()._Metadati_Tabelle);

                    string result = connection.Execute(NormalizeSql(query)).ToString();

                    if (isMeta)
                        RawHelpers.logError(new Exception("Metadata update"), "Metadata Update", query);

                    upload_fixes.ForEach(upload_fix =>
                    {
                        if (upload_fix != null)
                        {
                            string __id = entity[metadata.First(x => x.mc_is_primary_key).mc_nome_colonna].ToString();

                            string rootPath = upload_fix.DefaultUploadRootPath;

                            if (string.IsNullOrEmpty(rootPath))
                                rootPath = "/Upload/";
                            else
                            {
                                if (rootPath.Substring(rootPath.Length - 1, 1) != "/")
                                {
                                    rootPath += "/";
                                }
                            }

                            string pth = HttpContext.Current.Server.MapPath(rootPath + (upload_fix.UseRouteNameAsSubfolder ? "/" + route : "") + (upload_fix.UseRecordIDAsSubfolder ? "/" + __id : ""));

                            if (entity[upload_fix.mc_nome_colonna] != null && upload_fix.UseRecordIDAsSubfolder)
                            {
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

                    return result;
                }
            }
            catch (Exception ex)
            {
                RawHelpers.logError(ex, "updateFlatData", query);
                throw ex;
            }

        }

        public static string DeleteflatDataByID(int id, string route, string userId)
        {
            List<_Metadati_Colonne> metadata = _Metadati_Colonne.getColonneByUserID(route, 0, userId, dataMode.insert, null);
            _Metadati_Tabelle tab = metadata.First()._Metadati_Tabelle;

            using (OracleConnection connection = GetOpenConnection(RawHelpers.checkIsMetaData(route), tab.md_conn_name))
            {
                string query = "";

                try
                {

                    Dictionary<string, object> entity = new Dictionary<string, object>();
                    entity.Add(metadata.FirstOrDefault(x => x.mc_is_primary_key).mc_nome_colonna, id);

                    _Metadati_Colonne logic_del_key = metadata.FirstOrDefault(x => x.mc_is_logic_delete_key == true);
                    if (logic_del_key != null)
                        entity.Add(logic_del_key.mc_nome_colonna, false);

                    query = BuildDynamicDeleteQuery(entity, metadata, userId);

                    RawHelpers.setMetadataVersion(metadata.FirstOrDefault()._Metadati_Tabelle);

                    return connection.Execute(NormalizeSql(query)).ToString();

                }
                catch (ValidationException e1)
                {
                    throw e1;
                }
                catch (SqlException e2)
                {
                    if (e2.Number == 547)
                        throw new ValidationException(string.Format("Vincolo chiave esterna violato. {0}", e2.Message));
                    else
                    {
                        RawHelpers.logError(e2, "deleteFlatDataByID", query);
                        throw e2;
                    }
                }
                catch (Exception e3)
                {
                    RawHelpers.logError(e3, "deleteFlatDataByID", query);
                    throw e3;
                }
            }
        }

        public static string DeleteflatData(Dictionary<string, object> entity, string route, string user_id)
        {
            string query = "";

            try
            {
                List<_Metadati_Colonne> metadata = _Metadati_Colonne.getColonneByUserID(route, 0, user_id, dataMode.insert, null);
                _Metadati_Tabelle tab = metadata.First()._Metadati_Tabelle;

                using (OracleConnection connection = GetOpenConnection(RawHelpers.checkIsMetaData(route), tab.md_conn_name))
                {

                    query = BuildDynamicDeleteQuery(entity, metadata, user_id);

                    RawHelpers.setMetadataVersion(metadata.FirstOrDefault()._Metadati_Tabelle);


                    return connection.Execute(NormalizeSql(query)).ToString();
                }
            }
            catch (ValidationException e1)
            {
                throw e1;
            }
            catch (SqlException e2)
            {
                if (e2.Number == 547)
                    throw new ValidationException(string.Format("Vincolo chiave esterna violato. {0}", e2.Message));
                else
                {
                    RawHelpers.logError(e2, "deleteFlatData", query);
                    throw e2;
                }
            }
            catch (Exception e3)
            {
                RawHelpers.logError(e3, "deleteFlatData", query);
                throw e3;
            }

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
                        if (col.mc_validation_required == true)
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

        public static string InsertflatData(Dictionary<string, object> entity, string route, string userId)
        {
            string query = "";

            try
            {
                List<_Metadati_Colonne> metadata = _Metadati_Colonne.getColonneByUserID(route, 0, userId, dataMode.insert, null);
                _Metadati_Tabelle tab = metadata.First()._Metadati_Tabelle;

                using (OracleConnection connection = GetOpenConnection(RawHelpers.checkIsMetaData(route), tab.md_conn_name))
                {

                    string generated_pkey = "";

                    query = BuildDynamicInsertQuery(entity, metadata, userId, out generated_pkey);

                    RawHelpers.setMetadataVersion(metadata.FirstOrDefault()._Metadati_Tabelle);

                    List<_Metadati_Colonne_Upload> upload_fixes = metadata.OfType<_Metadati_Colonne_Upload>().ToList();
                    List<_Metadati_Colonne_Grid> multiple_check_fixes = metadata.OfType<_Metadati_Colonne_Grid>().ToList();


                    string result = connection.Execute(NormalizeSql(query)).ToString();

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
                        object[] collection = (object[])entity[colGrid.mc_nome_colonna];
                        foreach (object item in collection)
                        {
                            Dictionary<string, object> subEntity = (Dictionary<string, object>)item;
                            string localfield = colGrid.mc_ui_grid_manytomany_related_id_field;
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

                                    subEntity[colGrid.mc_ui_grid_manytomany_related_id_field] = subEntity[colGrid.mc_ui_grid_related_id_field];
                                    subEntity[colGrid.mc_ui_grid_manytomany_local_id_field] = entity[colGrid.mc_ui_grid_local_id_field];

                                    if (colGrid.mc_ui_grid_related_id_field != colGrid.mc_ui_grid_local_id_field)
                                        subEntity[colGrid.mc_ui_grid_related_id_field] = subEntity[colGrid.mc_ui_grid_local_id_field];

                                    string insertedID = InsertflatData(subEntity, subRoute, userId);

                                }
                            }
                            else if (subEntity.ContainsKey("___deleted") && (bool)subEntity["___deleted"])
                            {
                                if ((bool)subEntity["___selected"])
                                {
                                    subEntity[colGrid.mc_ui_grid_manytomany_related_id_field] = subEntity[colGrid.mc_ui_grid_related_id_field];
                                    subEntity[colGrid.mc_ui_grid_manytomany_local_id_field] = entity[colGrid.mc_ui_grid_local_id_field];

                                    DeleteflatData(subEntity, subRoute, userId);
                                }
                            }
                        }

                    });

                    upload_fixes.ForEach(upload_fix =>
                    {
                        if (upload_fix != null)
                        {
                            string __id = (entity.ContainsKey("__guid") ? entity["__guid"].ToString() : entity["__id"].ToString());

                            string rootPath = upload_fix.DefaultUploadRootPath;

                            if (string.IsNullOrEmpty(rootPath))
                                rootPath = "/Upload/";
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

                            if (entity[upload_fix.mc_nome_colonna] != null && upload_fix.UseRecordIDAsSubfolder)
                            {
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
                        }
                    });


                    if (!string.IsNullOrEmpty(metadata.First()._Metadati_Tabelle.md_after_save_server_method_name))
                    {
                        RawHelpers.executeCustomCommand(new object[] { userId, entity, dataMode.insert }, metadata.First()._Metadati_Tabelle.md_after_save_server_method_name, metadata.First()._Metadati_Tabelle.md_after_server_save_method_class);
                    }

                    return result;

                }
            }
            catch (Exception ex)
            {
                RawHelpers.logError(ex, "insertFlatData", query);
                throw ex;
            }

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

                case "isnull":
                    return "is null";

                case "eqor":
                    return "eqor";

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

        public static string EscapeDBObjectName(string obj)
        {
            return string.Format("\"{0}\"", obj);
        }

        private static string NormalizeSql(string sql)
        {
            if (string.IsNullOrWhiteSpace(sql))
                return sql;

            string normalized = Regex.Replace(sql, @"\[([^\]]+)\]", "\"$1\"");
            normalized = Regex.Replace(normalized, @"\bgetdate\s*\(\s*\)", "SYSDATE", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\bselect\s+SCOPE_IDENTITY\s*\(\s*\)", "select 0 from dual", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\bSCOPE_IDENTITY\s*\(\s*\)", "0", RegexOptions.IgnoreCase);
            normalized = Regex.Replace(normalized, @"\bnvarchar\s*\(", "varchar2(", RegexOptions.IgnoreCase);
            return normalized;
        }

        public static object EscapeValue(object valore)
        {
            if (valore == null)
                return valore;
            return valore.ToString().Replace("'", "''");
        }

        private static object EscapeValueStrict(object valore)
        {
            if (valore == null)
                return valore;
            return Regex.Replace(valore.ToString().Replace("'", "''").Replace("(", "").Replace(")", ""), @"\s", "");
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

            if (fld.mc_db_column_type == "point")
            {
                current_fld = RawHelpers.sqlPointToString(current_fld, "mssql", fld);
            }

            if (fld.mc_db_column_type == "geometry")
            {
                current_fld = string.Format(" cast({0} as geography).ToString()", current_fld);
            }

            return current_fld;
        }

        public static string GetSafeTableName(_Metadati_Tabelle tab)
        {
            string safetable_name = GetTableName(tab);
            if (tab.md_is_reticular)
            {
                string table_name = "tabella_reticolare";
                safetable_name = (string.IsNullOrEmpty(tab.md_db_name) ? "" : "[" + tab.md_db_name + "]." + (!string.IsNullOrEmpty(tab.md_schema_name) ? "[" + tab.md_schema_name + "]" : "") + ".") + EscapeDBObjectName(table_name);
            }
            return safetable_name;
        }

        public static string BuildDynamicSelectQuery(List<_Metadati_Colonne> lst, List<SortInfo> SortInfo, List<GroupInfo> GroupInfo, PageInfo PageInfo, FilterInfos filterInfo, string logicOperator, bool hasServerOperation, OracleConnection connection, out long totalRecords, List<AggregationInfo> aggregates, out List<AggregationResult> aggregateValues, string userId, string formulaLookup = "", int mcId = 0, string distinct = "")
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
                _Metadati_Colonne pKey = lst.FirstOrDefault(x => x.mc_is_primary_key);
                string safetableName = GetSafeTableName(tab);
                _Metadati_Colonne_Lookup lookuprelatedCol = null;

                if (mcId != 0)
                    lookuprelatedCol = mmd.GetMetadati_Colonnes(mcId.ToString()).OfType<_Metadati_Colonne_Lookup>().FirstOrDefault();

                string orderBy = BuildDynamicOrderBy(SortInfo, lst, tab, pKey, clonedfilters);
                string fieldList = BuildDynamicFieldList(mmd, lst, tab, joins, formulaLookup, joinsAppend, mcId);
                string join = BuildFinalJoin(tab, joins, joinsAppend);

                string where = BuildDynamicWhere(clonedfilters, PageInfo, mmd, lst, tab, pKey, logicOperator, distinct, joins, formulaLookup, userId);

                where = ManageRelatedLookup(filterInfo, tab, mmd, logicOperator, fieldList, join, where, orderBy, lookuprelatedCol, pKey, userId);

                string countQry = "";
                string finalQry = "";
                string customSelectClause = (lookuprelatedCol == null ? "" : lookuprelatedCol.mc_custom_select_clause);
                string autocompleteFilterValue = (string.IsNullOrEmpty(distinct) ? "" : filterInfo.filters.First().value);

                if (string.IsNullOrEmpty(distinct) && hasServerOperation)
                {
                    countQry = string.Format("SELECT {0} FROM {1} {2} {3} {4}", "count(*)", safetableName, join, where, "");
                    try
                    {
                        totalRecords = connection.Query<Int32>(countQry).FirstOrDefault();
                    }
                    catch (Exception ex)
                    {
                        throw new Exception(ex.Message + " " + countQry);
                    }

                    ManageAggregates(aggregates, where, connection, aggregateValues, safetableName, join);
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
                                finalQry = string.Format("SELECT * FROM " +
                                    "(SELECT ROW_NUMBER() " +
                                        "OVER ({5}) AS Row, " +
                                        "{0} " +
                                        "FROM {1} {2} {3} {4}) AS ENT ", fieldList, safetableName, join, where, "", orderBy) +
                                        string.Format("WHERE Row BETWEEN {0} AND {1}", ((skiprecords == 0) ? 0 : skiprecords + 1), skiprecords + PageInfo.pageSize);
                            }
                            else //Distinct for autocomplete text filters
                            {
                                //need to perform distinct and paging. No need to join. order by autocomplete field
                                _Metadati_Colonne distCol = lst.FirstOrDefault(x => x.mc_nome_colonna == distinct);
                                string distColName = RawHelpers.getStoreColumnName(distCol);

                                string distinctStr = string.Format("DISTINCT {0}", safetableName + "." + distColName);

                                finalQry = "WITH t AS" +
                                        "(" +
                                            " SELECT " + distColName + ", ROW_NUMBER() OVER (order by X." + distColName + ") AS Row " +
                                            " FROM (" +
                                                    "SELECT " + distinctStr +
                                                    string.Format(" FROM {0} {1} {2} {3} ", safetableName, "", where, "") +
                                            ") as X" +
                                        ")" +
                                        " SELECT " + distColName + " as " + distinct +
                                        " FROM t where t." + distColName + " like '%" + EscapeValue(autocompleteFilterValue) + "%' " +
                                        string.Format(" AND Row BETWEEN {0} AND {1} ", ((skiprecords == 0) ? 0 : skiprecords + 1), skiprecords + PageInfo.pageSize) +
                                        "order by t." + distColName;
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
                            finalQry = string.Format("SELECT {0} FROM {1} {2} {3} {4} ", fieldList, safetableName, join, where, orderBy);
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
                        finalQry = FinalizeCientSideGrouping(tab, lst, mmd, GroupInfo, safetableName, join, where);

                    }
                    #endregion
                }
                #endregion

                return finalQry;
            }
        }

        private static string FinalizeCientSideGrouping(_Metadati_Tabelle tab, List<_Metadati_Colonne> lst, metaRawModel mmd, List<GroupInfo> GroupInfo, string safetableName, string join, string where)
        {
            string fieldList = "";

            GroupInfo.ForEach(gi =>
            {
                string currentFld = (string.IsNullOrEmpty(tab.md_db_name) ? "" : "[" + tab.md_db_name + "]." + (!string.IsNullOrEmpty(tab.md_schema_name) ? "[" + tab.md_schema_name + "]" : "") + ".") + EscapeDBObjectName(tab.md_nome_tabella) + "." + EscapeDBObjectName(gi.field);
                fieldList += (string.IsNullOrEmpty(fieldList) ? "" : ", ") + currentFld;

                _Metadati_Colonne_Lookup col = lst.FirstOrDefault(x => x.mc_nome_colonna == gi.field) as _Metadati_Colonne_Lookup;
                if (col != null)
                {
                    _Metadati_Tabelle relatedTable = mmd.GetMetadati_Tabelles(col.mc_ui_lookup_entity_name).FirstOrDefault();
                    if (relatedTable != null)
                    {
                        string safeappend = EscapeDBObjectName(col.mc_ui_lookup_entity_name.Replace(" ", "_") + "___" + col.mc_ui_lookup_dataTextField + "__" + col.mc_nome_colonna);

                        string safeUniqueEntityName = EscapeDBObjectName(col.mc_nome_colonna + "_" + col.mc_ui_lookup_entity_name);
                        string safeTextField = EscapeDBObjectName(col.mc_ui_lookup_dataTextField);

                        fieldList += (string.IsNullOrEmpty(fieldList) ? "" : ", ") + string.Format("{0} AS {1}", safeUniqueEntityName + "." + safeTextField, safeappend);
                    }
                }
            });

            return string.Format("SELECT DISTINCT {0}, 1 as __group_header " +
                                     "FROM {1} {2} {3} ", fieldList, safetableName, join, where);
        }

        private static string FinalizeServerSideGrouping(_Metadati_Tabelle tab, List<_Metadati_Colonne> lst, metaRawModel mmd, List<GroupInfo> GroupInfo, string safetableName, string join, string where, OracleConnection connection, int skiprecords, PageInfo PageInfo)
        {
            string fieldList = "";
            string fieldListForCount = "";
            string distList = "";
            string orderListX = "";
            string orderListT = "";

            GroupInfo.ForEach(gi =>
            {
                string currentFld = (string.IsNullOrEmpty(tab.md_db_name) ? "" : "[" + tab.md_db_name + "]." + (!string.IsNullOrEmpty(tab.md_schema_name) ? "[" + tab.md_schema_name + "]" : "") + ".") + EscapeDBObjectName(tab.md_nome_tabella) + "." + EscapeDBObjectName(gi.field);
                fieldList += (string.IsNullOrEmpty(fieldList) ? "" : ", ") + currentFld;
                fieldListForCount += (string.IsNullOrEmpty(fieldListForCount) ? "" : ", ") + currentFld;

                _Metadati_Colonne distCol = lst.FirstOrDefault(x => x.mc_nome_colonna == gi.field);
                string distColName = RawHelpers.getStoreColumnName(distCol);

                distList += (string.IsNullOrEmpty(distList) ? "" : ", ") + distColName;

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
                        distList += (string.IsNullOrEmpty(distList) ? "" : ", ") + string.Format("{0}", safeappend);
                        orderListX += (string.IsNullOrEmpty(orderListX) ? "" : ", ") + "X." + safeappend;
                        orderListT += (string.IsNullOrEmpty(orderListT) ? "" : ", ") + "t." + safeappend;
                    }
                }
                else
                {
                    orderListX += (string.IsNullOrEmpty(orderListX) ? "" : ", ") + "X." + distColName;
                    orderListT += (string.IsNullOrEmpty(orderListT) ? "" : ", ") + "t." + distColName;
                }
            });

            string countGroupQry = string.Format("SELECT COUNT(DISTINCT CHECKSUM ({0})) FROM {1} {2} {3} {4}", fieldListForCount, safetableName, join, where, "");

            try
            {
                GroupInfo[0].groupCount = connection.Query<Int32>(countGroupQry).FirstOrDefault();
            }
            catch (Exception ex)
            {
                throw new Exception(ex.Message + " " + countGroupQry);
            }

            return "WITH t AS" +
                       "(" +
                       " SELECT DISTINCT " + distList + ", ROW_NUMBER() OVER (order by " + orderListX + ") AS Row " +
                       " FROM (" +
                       "SELECT DISTINCT " + fieldList +
                       string.Format(" FROM {0} {1} {2} {3} ", safetableName, join, where, "") +
                       ") as X" +
                       ")" +
                       " SELECT " + distList + ", 1 as __group_header" +
                       string.Format(" FROM t {0} ", "") +
                       string.Format(" WHERE Row BETWEEN {0} AND {1} ", ((skiprecords == 0) ? 0 : skiprecords + 1), skiprecords + PageInfo.pageSize) +
                       "order by " + orderListT;
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
                                filter_value = u.extra_keys[userField.Groups[1].Value]?.ToString();
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

                        _Metadati_Tabelle currentFldLUpTabel = filteringCol._Metadati_Tabelle;
                        string currentFldLUp = (string.IsNullOrEmpty(currentFldLUpTabel.md_db_name) ? "" : "[" + currentFldLUpTabel.md_db_name + "]." + (!string.IsNullOrEmpty(currentFldLUpTabel.md_schema_name) ? "[" + currentFldLUpTabel.md_schema_name + "]" : "") + ".") + EscapeDBObjectName(currentFldLUpTabel.md_nome_tabella) + "." + metaQuery.EscapeDBObjectName(RawHelpers.getStoreColumnName(filteringCol));
                        innerWhere = AppendFilter(filteringCol, filterInfo, logicOperator, currentFldLUp, innerWhere, tab, "", user_id);
                    }
                }
            }

            if (pKey != null)
            {
                if (filterInfo != null && filterInfo.filters.FirstOrDefault(x => x.field == "__extra") != null)
                {

                }
                else
                {
                    where = where + string.Format("{0}", innerWhere == "" ? "" : (where == "" ? innerWhere : " AND (" + innerWhere.Substring(6) + ")"));
                }
            }

            return where;

        }

        private static void ManageAggregates(List<AggregationInfo> aggregates, string where, OracleConnection connection, List<AggregationResult> aggregateValues, string safetableName, string join)
        {
            if (aggregates != null)
            {
                foreach (AggregationInfo agg in aggregates)
                {
                    foreach (string ag in agg.aggregate.Split(','))
                    {
                        Dapper.SqlMapper.FastExpando aggValue = connection.Query(string.Format("SELECT {0} FROM {1} {2} {3} {4}", string.Format("{0}({1})", ag, safetableName + "." + EscapeDBObjectName(agg.field)), safetableName, join, where, "")).FirstOrDefault();

                        string aggValueString = "";

                        if (aggValue.data[aggValue.data.Keys.First()] != null)
                            aggValueString = aggValue.data[aggValue.data.Keys.First()].ToString();

                        aggregateValues.Add(new AggregationResult()
                        {
                            field = agg.field,
                            aggregateValue = decimal.Parse(aggValueString),
                            aggregation = ag
                        });
                    }
                }
            }
        }

        public static string BuildDynamicWhere(FilterInfos filterInfo, PageInfo PageInfo, metaRawModel mmd, List<_Metadati_Colonne> lst, _Metadati_Tabelle tab, _Metadati_Colonne pKey, string logicOperator, string distinct, Dictionary<aliasPair, string> joins, string formulaLookup, string userId)
        {
            string where = "";

            string tableName = tab.md_nome_tabella;
            string safetableName = GetTableName(tab);

            #region paging

            if (filterInfo != null)
            {
                filterElement pagingFragment = filterInfo.filters.FirstOrDefault(x => x.field.IndexOf("@page=") == 0);
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
                safetableName = (string.IsNullOrEmpty(tab.md_db_name) ? "" : "[" + tab.md_db_name + "]." + (!string.IsNullOrEmpty(tab.md_schema_name) ? "[" + tab.md_schema_name + "]" : "") + ".") + EscapeDBObjectName(tableName);
                where += ((where == "") ? " where " : " " + logicOperator + " ") + safetableName + "." + tab.reticular_key_name + " = " + (tab.reticular_key_value.HasValue ? tab.reticular_key_value.Value.ToString() : "null");
            }

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
                            filter_value = u.extra_keys[userField.Groups[1].Value]?.ToString();
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

            lst.ForEach((fld) =>
            {
                string currentFld = GetCurrentFieldString(tab, fld);

                if (filterInfo != null)
                {
                    if (filterInfo.filters.Count > 0)
                        if (filterInfo.filters.Any(x => x.field == "__extra"))
                            where = AppendFilter(fld, filterInfo, logicOperator, (currentFld), where, tab, formulaLookup, userId);
                        else
                            where = AppendFilter(fld, filterInfo, logicOperator, (String.IsNullOrEmpty(formulaLookup) ? (!fld.mc_is_computed.HasValue || !fld.mc_is_computed.Value ? currentFld : fld.mc_nome_colonna) : formulaLookup), where, tab, formulaLookup, userId);
                }
            });

            return where;
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

            if (pKey != null)
            {
                bool invertSort = false;

                string pkOrder = string.Format("{0}.{1} ASC", safetableName, RawHelpers.getStoreColumnName(pKey));
                if (clonedfilters.filters.FirstOrDefault(x => x.field == "__extra") != null)
                {
                    var flr = clonedfilters.filters.FirstOrDefault(x => x.field == pKey.mc_nome_colonna);
                    string pkeyFilterValue = "";
                    string quote = "";

                    if (flr == null)
                    {
                        flr = clonedfilters.filters.First();
                        pkeyFilterValue = flr.value;
                        int ou;
                        if (!int.TryParse(flr.value, out ou))
                            pkeyFilterValue = "'" + flr.value + "'";
                    }
                    else
                    {
                        pkeyFilterValue = flr.value;

                        if (string.IsNullOrEmpty(tab.md_primary_key_type) || tab.md_primary_key_type == "GUID")
                            quote = "'";

                        invertSort = true;

                    }

                    pkOrder = "case when " + safetableName + "." + EscapeDBObjectName(flr.field) + " = " + quote + pkeyFilterValue + quote + " then 0 else 1 end, " + pkOrder;

                }

                if (!invertSort)
                    fixOrder = ((fixOrder == "") ? string.Format(" ORDER BY {0}", pkOrder) : fixOrder + ", " + pkOrder);
                else
                    fixOrder = ((fixOrder == "") ? string.Format(" ORDER BY {0}", pkOrder) : "ORDER BY " + fixOrder + ", " + sort.Replace("ORDER BY", ""));
            }
            else
            {
                fixOrder = string.Format(" ORDER BY {0}.{1}", safetableName, EscapeDBObjectName(RawHelpers.getStoreColumnName(lst.First(x => !x.mc_is_computed.HasValue || !x.mc_is_computed.Value))));
            }

            return fixOrder;
        }

        public static string BuildDynamicFieldList(metaRawModel mmd, List<_Metadati_Colonne> lst, _Metadati_Tabelle tab, Dictionary<aliasPair, string> joins, string formulaLookup, List<string> joinsAppend, int mcId)
        {
            string fieldList = "";

            if (lst.Count > 0)
            {
                _Metadati_Colonne_Lookup lookuprelatedCol = mmd.GetMetadati_Colonnes(mcId.ToString()).OfType<_Metadati_Colonne_Lookup>().FirstOrDefault();

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
                    if (lookuprelatedCol != null && !string.IsNullOrEmpty(lookuprelatedCol.mc_custom_join))
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
                        fieldList += (fieldList == "" ? "" : ", ") + string.Format(" {0} AS {1}", formulaLookup, safeAlias);
                    else
                        fieldList += (fieldList == "" ? "" : ", ") + currentFld + " AS " + safeAlias;

                });
            }

            return fieldList;
        }

        private static string JoinBuilder(_Metadati_Tabelle relatedTable, _Metadati_Colonne fld, _Metadati_Colonne_Lookup col, Dictionary<aliasPair, string> joins, string currentFld, _Metadati_Tabelle tab, string fieldList)
        {
            string safeEntityName = GetTableName(relatedTable);
            string safeUniqueEntityName = EscapeDBObjectName(fld.mc_nome_colonna + "_" + col.mc_ui_lookup_entity_name);
            string calculatedText = col.mc_ui_lookup_computed_dataTextField;
            string safeTextField = EscapeDBObjectName(col.mc_ui_lookup_dataTextField);

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
                else
                {
                    joins[ap] = joins[ap] + " AND " + string.Format("{0} = {1} ", currentFld, ap.alias_name + "." + EscapeDBObjectName(col.mc_ui_lookup_dataValueField));
                }
            }

            string safeappend = EscapeDBObjectName(col.mc_ui_lookup_entity_name.Replace(" ", "_") + "___" + col.mc_ui_lookup_dataTextField + "__" + col.mc_nome_colonna);

            if (ap == null)
                comboTxtValue = ((!string.IsNullOrEmpty(calculatedText)) ? calculatedText : safeUniqueEntityName + "." + safeTextField);
            else
                comboTxtValue = ((!string.IsNullOrEmpty(calculatedText)) ? calculatedText : ap.alias_name + "." + safeTextField);

            if (col.mc_ui_lookup_dataValueField == "mc_nome_colonna")
                comboTxtValue = "''";

            fieldList += (fieldList == "" ? "" : ", ") + string.Format(" {0} AS {1}", comboTxtValue, safeappend);
            return fieldList;
        }

        private static string BuildFinalJoin(_Metadati_Tabelle tab, Dictionary<aliasPair, string> joins, List<string> joinsAppend)
        {
            string joinList = "";

            if (string.IsNullOrEmpty(tab.md_join_override))
            {
                joinList = CreateJoinString(joins, joinList);
                foreach (string jj in joinsAppend)
                {
                    if (!string.IsNullOrWhiteSpace(jj))
                    {
                        if (!joinList.Contains(jj.Trim()))
                        {
                            if (jj.Trim().StartsWith("AND "))
                                joinList += string.Format(" {0} ", jj.Trim());
                            else
                                joinList += string.Format(" LEFT JOIN {0} ", jj.Trim());
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

        private static string AppendFilter(_Metadati_Colonne fld, FilterInfos filterInfo, string logicOperator, string currentFld, string where, _Metadati_Tabelle tabel, string formulaLookup = "", string userId = "", bool isNested = false)
        {

            filterInfo.filters.Where(x => (fld == null && x.nestedFilters != null) || (x.field != null && x.field.ToLower() == fld.mc_nome_colonna.ToLower() && x.field != "__extra" && !x.isHaving)).ToList().ForEach((f) =>
            {
                if (f.nestedFilters != null && f.nestedFilters.filters.Count > 0)
                {
                    where += ((where == "") ? " where ( " : logicOperator + " ( ");
                    bool isFirstNested = true;
                    foreach (var nestedFld in f.nestedFilters.filters)
                    {
                        fld = tabel._Metadati_Colonnes.FirstOrDefault(x => x.mc_nome_colonna == nestedFld.field);

                        string safeColumnName;

                        if (fld != null)
                        {
                            safeColumnName = EscapeDBObjectName(RawHelpers.getStoreColumnName(fld));
                            currentFld = (string.IsNullOrEmpty(tabel.md_db_name) ? "" : "[" + tabel.md_db_name + "]." + (!string.IsNullOrEmpty(tabel.md_schema_name) ? "[" + tabel.md_schema_name + "]" : "") + ".") + EscapeDBObjectName(tabel.md_nome_tabella) + "." + safeColumnName;

                            where = AppendFilter(fld, f.nestedFilters, (isFirstNested ? "" : f.nestedFilters.logic), currentFld, where, tabel, formulaLookup, userId, true);
                            isFirstNested = false;
                        }
                        else
                        {
                            throw new Exception("Campo filtro '" + nestedFld.field + "' non trovato in route '" + tabel.md_route_name + "'");
                        }

                    }
                    where += " )";
                    return;
                }

                var realOperator = GetRealOperator(f.operatore);
                string quote = RawHelpers.getQuoteFromColumn(fld);

                if (fld.mc_ui_column_type == "multiple_check")
                {
                    _Metadati_Colonne_Grid mm = fld as _Metadati_Colonne_Grid;
                    string nestedWhere = "";

                    _Metadati_Tabelle mmTable = _Metadati_Tabelle.getTableMetadataFromRoute(mm.mc_ui_grid_manytomany_route);

                    using (OracleConnection con = GetOpenConnection(false, mmTable.md_conn_name))
                    {
                        long tot;
                        List<AggregationResult> ar;


                        string safeTableName = RawHelpers.getStoreTableName(mmTable, "mssql");
                        string localTableName = RawHelpers.getStoreTableName(tabel, "mssql");

                        if (realOperator == "eqor")
                        {
                            FilterInfos fiNest = new FilterInfos();
                            fiNest.filters = new List<filterElement>();
                            fiNest.filters.Add(new filterElement() { field = mm.mc_ui_grid_manytomany_related_id_field, operatore = f.operatore, value = EscapeValueStrict(f.value).ToString() });
                            nestedWhere = BuildDynamicSelectQuery(mmTable._Metadati_Colonnes.Where(x => x.mc_nome_colonna == mm.mc_ui_grid_manytomany_local_id_field).ToList(), null, null, null, fiNest, "AND", true, con, out tot, null, out ar, userId);

                            //NEEDED TO EXCLUDE THE COMBO DESCRIPTION FIELD ASSOCIATED WITH <mc_ui_grid_manytomany_local_id_field> LOOKUP-COLUMN
                            nestedWhere = string.Format("SELECT {1}.{0} FROM ", mm.mc_ui_grid_manytomany_local_id_field, safeTableName) + nestedWhere.Split(new string[] { "FROM" }, StringSplitOptions.None)[1];

                            string part = " ( " + localTableName + "." + EscapeDBObjectName(mm.mc_ui_grid_local_id_field) + " IN (" + nestedWhere + ") )";

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
                                fiComplexNest.filters = new List<filterElement>();
                                fiComplexNest.filters.Add(new filterElement() { field = mm.mc_ui_grid_manytomany_related_id_field, operatore = "eq", value = EscapeValueStrict(fltrVal).ToString() });

                                nestedWhere = BuildDynamicSelectQuery(mmTable._Metadati_Colonnes.Where(x => x.mc_nome_colonna == mm.mc_ui_grid_manytomany_local_id_field).ToList(), null, null, null, fiComplexNest, "AND", true, con, out tot, null, out ar, userId);

                                //NEEDED TO EXCLUDE THE COMBO-DESCRIPTION-FIELD ASSOCIATED WITH <mc_ui_grid_manytomany_local_id_field> LOOKUP-COLUMN
                                nestedWhere = string.Format("SELECT {1}.{0} FROM ", EscapeDBObjectName(mm.mc_ui_grid_manytomany_local_id_field), safeTableName) + nestedWhere.Split(new string[] { "FROM" }, StringSplitOptions.None)[1];

                                complexNestedWhere = complexNestedWhere + (string.IsNullOrEmpty(complexNestedWhere) ? "" : " INTERSECT ") + nestedWhere;

                            });

                            where += ((where == "") ? " where " : " " + logicOperator) + " ( " + localTableName + "." + EscapeDBObjectName(mm.mc_ui_grid_local_id_field) + " IN (" + complexNestedWhere + ") )";
                        }

                        if (!isNested)
                            filterInfo.filters.Remove(f);
                    }

                    return;
                }

                if (realOperator == "eqor")
                {
                    string nestedWhere = "";

                    f.value.Split(',').ToList()
                    .ForEach(x =>
                    {
                        nestedWhere = nestedWhere + (string.IsNullOrEmpty(nestedWhere) ? "(" : " OR ") + currentFld + " = " + string.Format(" {0}{1}{0} ", quote, x);
                    });

                    nestedWhere = nestedWhere + ")";

                    where += ((where == "") ? " where " : " " + logicOperator + " ") + nestedWhere;
                    if (!isNested)
                        filterInfo.filters.Remove(f);
                    return;
                }

                if (realOperator == "eqorconcatenate")
                {
                    string nestedWhere = "";

                    f.value.Split(',').ToList()
                    .ForEach(x =>
                    {
                        nestedWhere = nestedWhere + (string.IsNullOrEmpty(nestedWhere) ? "(" : " OR ") + currentFld + " "
                            + string.Format(" like '%, {0}%'", x);
                    });

                    nestedWhere = nestedWhere + ")";

                    where += ((where == "") ? " where " : " " + logicOperator + " ") + nestedWhere;
                    if (!isNested)
                        filterInfo.filters.Remove(f);
                    return;
                }

                if (realOperator == "maparea")
                {
                    string lat_field = "";
                    string lon_field = "";

                    dynamic extraProps = RawHelpers.deserialize(fld.mc_props_bag, null);
                    dynamic mapProps = null;
                    if (extraProps != null)
                    {
                        mapProps = extraProps.mapProperties;
                    }

                    string lat = "";
                    string lng = "";
                    bool singleGeography = false;

                    if (fld.mc_ui_column_type == "google_map")
                    {
                        lat_field = "latitude";
                        lon_field = "longitude";

                        if (mapProps != null && mapProps.linked_point_field != null)
                        {
                            lat_field = string.Format("{0}.Long", mapProps.linked_point_field);
                            lon_field = string.Format("{0}.Lat", mapProps.linked_point_field);
                        }
                        else if (mapProps != null && mapProps.latitude_field != null)
                        {
                            lat_field = mapProps.latitude_field;
                            lon_field = mapProps.longitude_field;
                        }
                    }
                    else if (mapProps != null)
                    {
                        if (mapProps.map_type == "point")
                        {
                            lat_field = string.Format("{0}.Long", fld.mc_nome_colonna);
                            lon_field = string.Format("{0}.Lat", fld.mc_nome_colonna);
                            singleGeography = true;
                        }
                    }

                    if (string.IsNullOrEmpty(lat_field) || string.IsNullOrEmpty(lon_field))
                    {
                        if (mapProps.map_type == "polyline")
                        {
                            string polylineWhere = string.Format(" ( geography::STGeomFromText('{0}', 8307).STContains({1}) = 1 || geography::STGeomFromText('{0}', 8307).STIntersects({1}) = 1 )", f.value, fld.mc_nome_colonna);
                            where += ((where == "") ? " where " : " " + logicOperator + " ") + polylineWhere;

                            filterInfo.filters.Remove(f);
                            return;
                        }
                        else
                            throw new Exception("Please specify spatial field.");
                    }

                    string geoWhere;

                    if (singleGeography)
                        geoWhere = string.Format(" (  geography::STGeomFromText('{0}', 8307).STContains({1}) = 1 )", f.value, fld.mc_nome_colonna);
                    else
                        geoWhere = string.Format(" (  geography::STGeomFromText('{0}', 8307).STContains(geography::STGeomFromText('Point({1}, {2})', 8307)) = 1 )", f.value, lat_field, lon_field);

                    where += ((where == "") ? " where " : " " + logicOperator + " ") + geoWhere;

                    filterInfo.filters.Remove(f);
                    return;
                }
                else if (realOperator == "mapdistance")
                {
                    dynamic extraProps = RawHelpers.deserialize(fld.mc_props_bag, null);
                    dynamic mapProps = null;
                    if (extraProps != null)
                    {
                        mapProps = extraProps.mapProperties;
                    }

                    string lat = "";
                    string lng = "";
                    string radius = "";

                    List<Match> mc = Regex.Matches(f.value, @"^CIRCLE\(\(([^\s]+\s[^\)]+)\),([^\)]+)\)$").OfType<Match>().ToList();

                    if (mc.Count > 0)
                    {
                        string lat_field = "";
                        string lon_field = "";

                        if (fld.mc_ui_column_type == "google_map")
                        {
                            if (mapProps != null && mapProps.linked_point_field != null)
                            {
                                lat_field = string.Format("{0}.Long", mapProps.linked_point_field);
                                lon_field = string.Format("{0}.Lat", mapProps.linked_point_field);
                            }
                            else if (mapProps != null && mapProps.latitude_field != null)
                            {
                                lat_field = string.Format("cast({0} as decimal(18,12))", mapProps.latitude_field);
                                lon_field = string.Format("cast({0} as decimal(18,12))", mapProps.longitude_field);
                            }

                            _Metadati_Colonne pointField = tabel._Metadati_Colonnes.FirstOrDefault(x => x.mc_db_column_type == "point");

                            if ((string.IsNullOrEmpty(lat_field) || string.IsNullOrEmpty(lon_field)) && pointField != null)
                            {
                                lat_field = string.Format("{0}.Lat", pointField.mc_nome_colonna);
                                lon_field = string.Format("{0}.Long", pointField.mc_nome_colonna);
                            }
                            else if (string.IsNullOrEmpty(lat_field) || string.IsNullOrEmpty(lon_field))
                            {
                                lat_field = "cast(latitude as decimal(18,12))";
                                lon_field = "cast(longitude as decimal(18,12))";
                            }
                        }
                        else if (mapProps != null)
                        {
                            if (mapProps.map_type == "point")
                            {
                                lat_field = string.Format("{0}.Lat", fld.mc_nome_colonna);
                                lon_field = string.Format("{0}.Long", fld.mc_nome_colonna);
                            }
                        }

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

                if (realOperator == "is null")
                {
                    where += ((where == "") ? " where " : " " + logicOperator + " ") + "(" + currentFld + " is null)";
                    if (!isNested)
                        filterInfo.filters.Remove(f);
                    return;
                }

                string async_extra_condition = "";

                if (f.value != null)
                    f.value = EscapeValue(f.value).ToString();
                else if (f.value == null && f.operatore == "eq")
                    return;
                else
                    f.value = null;

                if (f.value == "{NULL}")
                {
                    where += ((where == "") ? " where " : " " + logicOperator + " ") + "(" + currentFld + " is null)";
                    if (!isNested)
                        filterInfo.filters.Remove(f);
                    return;
                }

                if (fld.mc_ui_column_type == "datetime" && f.value != null && f.value != "")
                {
                    //se f.value è del format YYYY-MM-ddTHH:mm:ssZ -> il DateTime.Parse applica UTC time. 
                    string parsed = f.value.ToString().Replace(@"""", "");
                    DateTime d = DateTime.Parse(parsed);
                    f.value = d.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");

                    where += ((where == "") ? " where " : " " + logicOperator + " ") + "( (" + "DATEADD(ms, -DATEPART(ms, " + currentFld + "), " + currentFld + ")" + ")" + realOperator + string.Format(" {0}{1}{2} {3} )", leftExtraOperator, f.value, rightExtraOperator, async_extra_condition);
                    if (!isNested)
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

                    where += ((where == "") ? " where " : " " + logicOperator + " ") + "( (" + "DateAdd(day, datediff(day,0, " + currentFld + "), 0)" + ")" + realOperator + string.Format(" {0}{1}{2} {3} )", leftExtraOperator, f.value, rightExtraOperator, async_extra_condition);

                    if (!isNested)
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

                where += ((where == "") ? " where " : " " + logicOperator + " ") + "( (" + (fld.mc_is_computed.HasValue && fld.mc_is_computed.Value ? fld.mc_computed_formula : currentFld) + ")" + realOperator + string.Format(" {0}{1}{2} {3} {4} )", leftExtraOperator, f.value, rightExtraOperator, async_extra_condition, (f.__extra ? " OR 1=1" : ""));

                if (!isNested)
                    filterInfo.filters.Remove(f);
            });

            return where;
        }

        private static void AppendSort(_Metadati_Colonne fld, string orderSafetableName, ref string sort, string sortDir)
        {
            _Metadati_Colonne_Lookup look = fld as _Metadati_Colonne_Lookup;

            dynamic serverProps = null;

            if (fld.mc_props_bag != null)
            {
                dynamic extraProps = RawHelpers.deserialize(fld.mc_props_bag, null);
                if (extraProps != null)
                {
                    serverProps = extraProps.serverProperties;
                }
            }

            if (serverProps != null && serverProps.custom_sort_formula != null)
            {
                sort += ((sort == "") ? " ORDER BY " : ", ") + serverProps.custom_sort_formula;
            }
            else
            {
                if (look != null)
                {
                    orderSafetableName = EscapeDBObjectName(look.mc_nome_colonna + "_" + look.mc_ui_lookup_entity_name);

                    string calculatedText = look.mc_ui_lookup_computed_dataTextField;
                    string safename = EscapeDBObjectName(look.mc_ui_lookup_entity_name) + "." + EscapeDBObjectName(look.mc_ui_lookup_dataTextField);
                    if (look.mc_is_computed.HasValue && look.mc_is_computed.Value)
                        safename = "(" + look.mc_computed_formula + ")";
                    sort += ((sort == "") ? " ORDER BY " : ", ") + orderSafetableName + "." + look.mc_ui_lookup_dataValueField + " " + sortDir;
                }
                else
                {
                    sort += ((sort == "") ? " ORDER BY " : ", ") + "(" + ((fld.mc_is_computed.HasValue && fld.mc_is_computed.Value) ? "(SELECT " + fld.mc_computed_formula + ")" : orderSafetableName + "." + EscapeDBObjectName(RawHelpers.getStoreColumnName(fld))) + ") " + sortDir;
                }
            }
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
                    where += ((where == "") ? " where " : " " + logicOperator + " ") + EscapeDBObjectName(sys.user_table_name) + "." + tab.md_record_restriction_key_user_field_list + " = '" + keyvalue + "'";

                    aliasPair ap = joins.Keys.FirstOrDefault(x => x.table_name == EscapeDBObjectName(sys.user_table_name));
                    if (ap == null)
                        joins.Add(new aliasPair() { table_name = EscapeDBObjectName(sys.user_table_name), alias_name = EscapeDBObjectName(sys.user_table_name) }, string.Format(" LEFT JOIN {0} ON {1}.{2} = {0}.{3} ", EscapeDBObjectName(sys.user_table_name), safetableName, EscapeDBObjectName(tab.md_logging_insert_user_field_name), sys.user_id_column_name));
                    else
                        joins[ap] = joins[ap] + " AND " + string.Format("{1}.{2} = {0}.{3} ", EscapeDBObjectName(sys.user_table_name), safetableName, EscapeDBObjectName(tab.md_logging_insert_user_field_name), sys.user_id_column_name);
                }
            }
        }

        private static string AppendHaving(_Metadati_Colonne fld, FilterInfos filterInfo, string logicOperator, string currentFld, string having, _Metadati_Tabelle tabel, Definizione_Universi def)
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
                        nestedHaving = nestedHaving + (string.IsNullOrEmpty(nestedHaving) ? "(" : " OR ") + currentFld + " = " + string.Format(" {0}{1}{0} ", quote, x);
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

                    having += ((having == "") ? " where " : " " + logicOperator + " ") + string.Format("( {0}(", f.havingAggregation) + "DATEADD(ms, -DATEPART(ms, " + currentFld + "), " + currentFld + ")" + ")" + realOperator + string.Format(" {0}{1}{2} {3} )", leftExtraOperator, f.value, rightExtraOperator, async_extra_condition);
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

                    having += ((having == "") ? " having " : " " + logicOperator + " ") + string.Format("( {0}(", f.havingAggregation) + "DateAdd(day, datediff(day,0, " + currentFld + "), 0)" + ")" + realOperator + string.Format(" {0}{1}{2} {3} )", leftExtraOperator, f.value, rightExtraOperator, async_extra_condition);
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

                having += ((having == "") ? " having " : " " + logicOperator + " ") + string.Format("( {0}(", f.havingAggregation) + currentFld + ")" + realOperator + string.Format(" {0}{1}{2} {3} )", leftExtraOperator, f.value, rightExtraOperator, async_extra_condition);
                filterInfo.filters.Remove(f);
            });

            return having;
        }

        private static void AppendLoggingInsertFields(ref string fieldList, ref string valueList, _Metadati_Tabelle tabel, string userId, IDictionary<string, object> entity)
        {
            if (!string.IsNullOrEmpty(tabel.md_logging_insert_date_field_name))
            {
                if (tabel.md_logging_insert_date_field_name.Contains(","))
                {
                    foreach (string fld in tabel.md_logging_insert_date_field_name.Split(','))
                    {
                        fieldList += (fieldList == "" ? "" : ", ") + fld;
                        valueList += (valueList == "" ? "" : ", ") + "'" + DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":") + "'";
                        entity[fld] = DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
                    }
                }
                else
                {
                    fieldList += (fieldList == "" ? "" : ", ") + tabel.md_logging_insert_date_field_name;
                    valueList += (valueList == "" ? "" : ", ") + "'" + DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":") + "'";
                    entity[tabel.md_logging_insert_date_field_name] = DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
                }
            }

            if (!string.IsNullOrEmpty(tabel.md_logging_last_mod_date_field_name))
            {
                if (tabel.md_logging_last_mod_date_field_name.Contains(","))
                {
                    foreach (string fld in tabel.md_logging_last_mod_date_field_name.Split(','))
                    {
                        fieldList += (fieldList == "" ? "" : ", ") + fld;
                        valueList += (valueList == "" ? "" : ", ") + "'" + DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":") + "'";
                        entity[fld] = DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
                    }
                }
                else
                {
                    fieldList += (fieldList == "" ? "" : ", ") + tabel.md_logging_last_mod_date_field_name;
                    valueList += (valueList == "" ? "" : ", ") + "'" + DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":") + "'";
                    entity[tabel.md_logging_last_mod_date_field_name] = DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
                }
            }

            if (!string.IsNullOrEmpty(tabel.md_logging_insert_user_field_name))
            {
                fieldList += (fieldList == "" ? "" : ", ") + tabel.md_logging_insert_user_field_name;
                valueList += (valueList == "" ? "" : ", ") + "'" + userId + "'";
                entity[tabel.md_logging_insert_user_field_name] = userId;
            }

            if (!string.IsNullOrEmpty(tabel.md_logging_last_mod_user_field_name))
            {
                fieldList += (fieldList == "" ? "" : ", ") + tabel.md_logging_last_mod_user_field_name;
                valueList += (valueList == "" ? "" : ", ") + "'" + userId + "'";
                entity[tabel.md_logging_last_mod_user_field_name] = userId;
            }

            if (!string.IsNullOrEmpty(tabel.md_logging_azienda_field_name))
            {
                using (metaModelRaw.metaRawModel context = new metaModelRaw.metaRawModel())
                {
                    fieldList += (fieldList == "" ? "" : ", ") + tabel.md_logging_azienda_field_name;
                    user u = getUserByID(userId);
                    if (u.azienda_id != null)
                        valueList += (valueList == "" ? "" : ", ") + "'" + u.azienda_id + "'";
                    else
                        valueList += (valueList == "" ? "" : ", ") + "null";
                }
            }
        }

        private static void AppendLoggingUpdateFields(ref string fieldValueList, _Metadati_Tabelle tabel, string userId, Dictionary<string, object> entity)
        {
            if (!string.IsNullOrEmpty(tabel.md_logging_last_mod_date_field_name))
            {
                if (tabel.md_logging_last_mod_date_field_name.Contains(","))
                {
                    foreach (string fld in tabel.md_logging_last_mod_date_field_name.Split(','))
                    {
                        fieldValueList += (fieldValueList == "" ? "" : ", ") + fld + "=" + string.Format("'{0}'", DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":"));
                        entity["fld"] = DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
                    }
                }
                else
                {
                    fieldValueList += (fieldValueList == "" ? "" : ", ") + tabel.md_logging_last_mod_date_field_name + "=" + string.Format("'{0}'", DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":"));
                    entity[tabel.md_logging_last_mod_date_field_name] = DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
                }

            }
            if (!string.IsNullOrEmpty(tabel.md_logging_last_mod_user_field_name))
            {
                fieldValueList += (fieldValueList == "" ? "" : ", ") + tabel.md_logging_last_mod_user_field_name + "=" + string.Format("'{0}'", userId);
                entity[tabel.md_logging_last_mod_user_field_name] = userId;
            }
        }

        private static void AppendLoggingDeleteFields(ref string deleteLog, _Metadati_Tabelle tabel, string userId, Dictionary<string, object> entity)
        {
            if (!string.IsNullOrEmpty(tabel.md_loggingdelete_date_field_name))
            {
                deleteLog += (deleteLog == "" ? "" : ", ") + tabel.md_loggingdelete_date_field_name + "=" + string.Format("'{0}'", DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":"));
                entity[tabel.md_loggingdelete_date_field_name] = DateTime.Now.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
            }
            if (!string.IsNullOrEmpty(tabel.md_logging_delete_user_field_name))
            {
                deleteLog += (deleteLog == "" ? "" : ", ") + tabel.md_logging_delete_user_field_name + "=" + string.Format("'{0}'", userId);
                entity[tabel.md_logging_delete_user_field_name] = userId;
            }
        }

        #endregion

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
            _Metadati_Colonne pkey = lst.FirstOrDefault(x => x.mc_is_primary_key);

            List<_Metadati_Colonne_Grid> grid_cols = lst.OfType<_Metadati_Colonne_Grid>().Where(x => x.mc_ui_grid_is_multiple_check).ToList();

            if (grid_cols.Count > 0 && pkey == null)
                throw new Exception("Missing primary key on current route.");

            List<_Metadati_Colonne> pkeys = lst.Where(x => x.mc_is_primary_key).ToList();

            List<_Metadati_Colonne_Slider> chartCols = lst.OfType<_Metadati_Colonne_Slider>().Where(x => x.use_chart_in_view > 0).ToList();

            if (chartCols.Count > 0)
            {
                using (OracleConnection con = GetOpenConnection(false))
                {
                    foreach (_Metadati_Colonne_Slider chartCol in chartCols)
                    {
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
                        manyToManyKey = manyToManyRoute._Metadati_Colonnes.FirstOrDefault(x => x.mc_is_primary_key);
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

                        List<Dictionary<string, object>> relatedFullDataClone = GetManyToManyOptions(localKeyName, row_id, pkey, userId, grid_col, row, relatedKeyName, manyToManyKey);

                        row.data[grid_col.mc_nome_colonna] = relatedFullDataClone;
                    }
                }
            }
        }

        private static List<Dictionary<string, object>> GetManyToManyOptions(string localKeyName, string row_id, _Metadati_Colonne pkey, string userId, _Metadati_Colonne_Grid gridCol, SqlMapper.FastExpando row, string relatedKeyName, _Metadati_Colonne manyToManyKey)
        {
            FilterInfos fltr = RawHelpers.createStandardFilter(localKeyName, row_id, pkey);

            string[] restriction = { gridCol.mc_ui_grid_related_id_field, gridCol.mc_ui_grid_display_field };

            rawPagedResult relatedData = GetFlatData(userId, gridCol.mc_ui_grid_manytomany_route, 0, null, null, null, fltr, "AND", true, null, restriction.ToList());

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

        private static string GetTableName(_Metadati_Tabelle tab)
        {
            string tablename = "";

            if (!string.IsNullOrEmpty(tab.md_db_name))
                tablename = "[" + tab.md_db_name + "].";

            if (!string.IsNullOrEmpty(tab.md_schema_name))
                tablename += "[" + tab.md_schema_name + "].";
            else if (!string.IsNullOrEmpty(tab.md_db_name))
                tablename += "dbo.";

            tablename += EscapeDBObjectName(tab.md_nome_tabella);

            return tablename;

        }

        public static string BuildDynamicUpdateQuery(Dictionary<string, object> entity, List<_Metadati_Colonne> metadata, string userId, bool importing = false)
        {
            string field_value_list = "";
            string where = "";
            string query = "";

            Dictionary<string, object> original = (importing ? new Dictionary<string, object>() : (Dictionary<string, object>)(entity["__original"]));

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

            string safetable_name = GetTableName(tabel);

            metadata.Where(x => x.mc_is_computed != true || x.GetType() == typeof(_Metadati_Colonne_Grid)).ToList().ForEach((fld) =>
            {
                if (tabel.md_logging_enable)
                {
                    if (fld.mc_nome_colonna == tabel.md_logging_last_mod_date_field_name || fld.mc_nome_colonna == tabel.md_logging_last_mod_user_field_name)
                    {
                        return;
                    }
                }

                if ((!fld.mc_logic_editable.HasValue || !fld.mc_logic_editable.Value) && !fld.mc_is_primary_key & fld.mc_nome_colonna != "voa_class")
                {
                    return;
                }

                if (importing && ((fld.hide_in_import.HasValue && fld.hide_in_import.Value) || !entity.ContainsKey(fld.mc_nome_colonna)))
                    return;

                _Metadati_Colonne_Button btnCol = fld as _Metadati_Colonne_Button;
                if (btnCol != null)
                    return;

                string safecolumn_name = EscapeDBObjectName(RawHelpers.getStoreColumnName(fld));

                object valore = null;

                if (entity[fld.mc_nome_colonna] != null)
                    valore = entity[fld.mc_nome_colonna];

                if (fld.mc_validation_has.HasValue && fld.mc_validation_has.Value && fld.mc_validation_required.HasValue && fld.mc_validation_required.Value && valore == null && fld.mc_ui_column_type != "boolean" && fld.mc_ui_column_type != "number_boolean")
                    throw new ValidationException(string.Format("{0} non può essere null", fld.mc_display_string_in_view));

                valore = EscapeValue(valore);

                if (fld.mc_ui_column_type == "datetime" && valore != null && valore.ToString() != "")
                {
                    if (valore.ToString().IndexOf("@") != 0)
                    {
                        //FIX UTC TIME ISSUE 
                        string parsed = valore.ToString().Replace(@"""", "");
                        DateTime d = DateTime.Parse(parsed);
                        valore = d.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
                    }
                }
                else if (fld.mc_ui_column_type == "date" && valore != null && valore.ToString() != "")
                {
                    //FIX UTC TIME ISSUE 
                    string parsed = valore.ToString().Replace(@"""", "");

                    if (tabel.md_is_reticular || parsed.IndexOf("@") == 0)
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
                else if (fld.mc_ui_column_type == "boolean" && tabel.md_is_reticular)
                {
                    if (valore != null)
                    {
                        if (valore.ToString().ToLower() == "true")
                        {
                            valore = 1;
                        }
                        else if (valore.ToString().ToLower() == "false")
                        {
                            valore = 0;
                        }
                    }
                    else
                    {
                        if (fld.mc_validation_has.HasValue && fld.mc_validation_has.Value && fld.mc_validation_required.HasValue && fld.mc_validation_required.Value)
                        {
                            valore = 0;
                        }
                    }
                }
                else if (fld.mc_ui_column_type == "number_boolean")
                {
                    if (valore != null)
                    {
                        if (valore.GetType() is bool)
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
                            else if (valore.ToString().ToLower() == "1" || valore.ToString().ToLower() == "0")
                            {

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
                    if (valore != null)
                    {
                        Pair point = RawHelpers.pointStringToPoint(valore.ToString(), "mssql");
                        valore = string.Format("geography::STGeomFromText('POINT({0} {1})', 8307)", point.First.ToString(), point.Second.ToString());
                    }
                }
                else if (fld.mc_db_column_type == "geometry")
                {
                    if (valore != null)
                    {
                        valore = string.Format("geography::STGeomFromText('{0}', 8307)", valore);
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

                    object[] collection = entity[colGrid.mc_nome_colonna] as object[];

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

                                if (colGrid.mc_ui_grid_related_id_field != colGrid.mc_ui_grid_local_id_field)
                                    subEntity[colGrid.mc_ui_grid_related_id_field] = subEntity[colGrid.mc_ui_grid_local_id_field];

                                string insertedID = InsertflatData(subEntity, subRoute, userId);

                            }
                            else if (subEntity.ContainsKey("___deleted") && subEntity["___deleted"] != null && (bool)subEntity["___deleted"])
                            {
                                subEntity[colGrid.mc_ui_grid_manytomany_related_id_field] = subEntity[colGrid.mc_ui_grid_related_id_field];
                                subEntity[colGrid.mc_ui_grid_manytomany_local_id_field] = entity[colGrid.mc_ui_grid_local_id_field];

                                DeleteflatData(subEntity, subRoute, userId);
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

                if (fld.mc_is_primary_key)
                {
                    int ou;
                    string quote = "";
                    if (!int.TryParse(entity[fld.mc_nome_colonna].ToString(), out ou))
                        quote = "'";

                    if (string.IsNullOrEmpty(tabel.md_primary_key_type) || tabel.md_primary_key_type == "GUID")
                        quote = "'";

                    if (original.ContainsKey(fld.mc_nome_colonna) && tabel.md_primary_key_type != "IDENTITY")
                    {
                        if (original[fld.mc_nome_colonna].ToString() != valore)
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

                    field_value_list += (field_value_list == "" ? "" : ", ") + current_fld + "=" + string.Format("{0}{1}{0}", ((fld.mc_db_column_type == "int" || fld.mc_db_column_type == "point" || fld.mc_db_column_type == "geometry" || valore.ToString() == "") ? "" : "'"), ((valore.ToString() == "") ? (string.IsNullOrEmpty(fld.convert_null_to_string) ? "null" : "'" + valore.ToString() + "'") : valore.ToString()));

                    if (fld.mc_ui_column_type == "upload")
                    {
                        _Metadati_Colonne_Upload uploader = fld as _Metadati_Colonne_Upload;
                        if (uploader.isDBUpload)
                        {
                            if (entity[fld.mc_nome_colonna] != null)
                            {
                                //get path of the uploaded file
                                string __id = entity[tabel._Metadati_Colonnes.First(x => x.mc_is_primary_key).mc_nome_colonna].ToString();
                                string pth = HttpContext.Current.Server.MapPath("/Upload" + (uploader.UseRouteNameAsSubfolder ? "/" + tabel.md_route_name : "") + (uploader.UseRecordIDAsSubfolder ? "/" + __id : ""));
                                string tmp_path = System.IO.Path.Combine(pth, entity[fld.mc_nome_colonna].ToString());

                                //append to query
                                if (System.IO.File.Exists(tmp_path))
                                    field_value_list += (field_value_list == "" ? "" : ", ") + uploader.MultipleUploadBlobFieldName + "=" + "(" + "SELECT * FROM OPENROWSET (BULK '" + tmp_path.Replace("'", "''") + "', SINGLE_BLOB) " + uploader.MultipleUploadBlobFieldName + ")";

                            }
                            else
                                field_value_list += (field_value_list == "" ? "" : ", ") + uploader.MultipleUploadBlobFieldName + "=" + "null";
                        }
                    }

                }


            });

            if (tabel.md_logging_enable)
            {
                AppendLoggingUpdateFields(ref field_value_list, tabel, userId, entity);
            }

            query = string.Format("UPDATE {0} SET {1} WHERE {2}", safetable_name, field_value_list, where);

            return query;
        }

        public static string BuildDynamicDeleteQuery(Dictionary<string, object> entity, List<_Metadati_Colonne> metadata, string userId)
        {
            string where = "";
            string query = "";

            _Metadati_Tabelle tabel = metadata[0]._Metadati_Tabelle;
            string table_name = GetTableName(tabel);
            string safetable_name = table_name;

            if (!tabel.md_deletable)
                throw new ValidationException("Cancellazione disabilitata");

            if (tabel.md_is_reticular)
            {
                table_name = "tabella_reticolare";
                safetable_name = (string.IsNullOrEmpty(tabel.md_db_name) ? "" : "[" + tabel.md_db_name + "]." + (!string.IsNullOrEmpty(tabel.md_schema_name) ? "[" + tabel.md_schema_name + "]" : "") + ".") + EscapeDBObjectName(table_name);
            }

            metadata.ForEach((fld) =>
            {
                string safecolumn_name = EscapeDBObjectName(RawHelpers.getStoreColumnName(fld));

                string current_fld = safetable_name + "." + safecolumn_name;

                if (fld.mc_is_primary_key)
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
                _Metadati_Colonne logic_del_key = metadata.FirstOrDefault(x => x.mc_is_logic_delete_key.HasValue && x.mc_is_logic_delete_key.Value);
                if (logic_del_key != null)
                {
                    string delete_log = "";
                    if (tabel.md_logging_enable)
                    {
                        AppendLoggingDeleteFields(ref delete_log, tabel, userId, entity);
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
                            AppendLoggingDeleteFields(ref delete_log, tabel, userId, entity);
                        }
                        query = string.Format("UPDATE {0} SET {1} = 1 {3} {2}", safetable_name, safetable_name + ".[cancellato]", where, string.IsNullOrEmpty(delete_log) ? "" : ", " + delete_log);
                    }
                    else
                        throw new Exception("Missing logic delete key field.");
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

            using (OracleConnection connection = GetOpenConnection(isMeta, tab.md_conn_name))
            {
                string fltr = "";
                string table_name = tab.md_nome_tabella;
                string safetable_name = RawHelpers.getStoreTableName(tab, "mssql");

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
                    string local_key = key;

                    _Metadati_Colonne col = metadata.FirstOrDefault(x => x.mc_nome_colonna == local_key);

                    if (col != null && col.mc_db_column_type != "varbinary" && col.mc_db_column_type != "binary" && (!col.mc_is_db_computed.HasValue || !col.mc_is_db_computed.Value) && (!col.mc_is_computed.HasValue || !col.mc_is_computed.Value))
                    {
                        string quote = RawHelpers.getQuoteFromColumn(col);

                        string field_compare = RawHelpers.getStoreColumnName(col);
                        if (col.mc_ui_column_type == "txt_area" || col.mc_db_column_type == "text" || col.mc_ui_column_type == "html_area" || col.mc_ui_column_type == "localized_text" || col.mc_ui_column_type == "localized_html")
                            field_compare = string.Format("CAST ({0} AS varchar(MAX))", RawHelpers.getStoreColumnName(col));

                        if (original[key] == null)
                        {
                            if (col.mc_db_column_type == "point" || col.mc_db_column_type == "geometry")
                            {
                                fltr += string.Format((string.IsNullOrEmpty(fltr) ? "" : " AND ") + field_compare + ".ToString()" + " is null", RawHelpers.getQuoteFromColumn(col));
                            }
                            else
                            {
                                fltr += string.Format((string.IsNullOrEmpty(fltr) ? "" : " AND ") + field_compare + " is null", RawHelpers.getQuoteFromColumn(col));
                            }
                        }
                        else
                        {
                            string valore = original[key].ToString();
                            if (col.mc_ui_column_type == "number" || col.mc_ui_column_type == "number_slider")
                                valore = valore.Replace(",", ".");

                            if (col.mc_ui_column_type == "boolean" || col.mc_ui_column_type == "number_boolean")
                            {
                                if (bool.Parse(valore.ToString()))
                                    valore = "1";
                                else
                                    valore = "0";
                            }
                            else if (col.mc_db_column_type == "point")
                            {
                                continue;
                            }
                            else if (col.mc_db_column_type == "geometry")
                            {
                                continue;
                            }

                            fltr += (string.IsNullOrEmpty(fltr) ? "" : " AND ") + field_compare + "=" + quote + EscapeValue(valore) + quote;

                        }
                    }
                }

                if (fltr != "")
                {
                    string optQry = string.Format("select count(*) from {0} where {1}", safetable_name, fltr);

                    try
                    {
                        return connection.Query<Int32>(optQry).FirstOrDefault() > 0;
                    }
                    catch (Exception ex)
                    {
                        RawHelpers.logError(ex, "optimisticCheck", optQry);
                        throw ex;
                    }
                }
                else
                    return true;

            }
        }

        public static string BuildDynamicInsertQuery(IDictionary<string, object> entity, List<_Metadati_Colonne> metadata, string userId, out string generatedPkey, bool importing = false)
        {
            generatedPkey = "";
            string field_list = "";
            string value_list = "";
            string query = "";
            string local_generated_pkey = "";

            _Metadati_Tabelle tabel = metadata[0]._Metadati_Tabelle;
            string table_name = tabel.md_nome_tabella;
            string safetable_name = GetTableName(tabel);

            if (!tabel.md_insertable)
                throw new ValidationException("Inserimento disabilitato");

            if (tabel.md_is_reticular)
            {
                field_list += (field_list == "" ? "" : ", ") + tabel.reticular_key_name;
                value_list += (value_list == "" ? "" : ", ") + tabel.reticular_key_value;
                table_name = "tabella_reticolare";
                safetable_name = (string.IsNullOrEmpty(tabel.md_db_name) ? "" : "[" + tabel.md_db_name + "]." + (!string.IsNullOrEmpty(tabel.md_schema_name) ? "[" + tabel.md_schema_name + "]" : "") + ".") + EscapeDBObjectName(table_name);
            }

            metadata.Where(x => x.mc_is_computed != true).ToList().ForEach((fld) =>
            {
                string safecolumn_name = EscapeDBObjectName(RawHelpers.getStoreColumnName(fld));
                string current_fld = safetable_name + "." + safecolumn_name;

                if (tabel.md_logging_enable)
                {
                    if (fld.mc_nome_colonna == tabel.md_logging_last_mod_date_field_name || fld.mc_nome_colonna == tabel.md_logging_last_mod_user_field_name || fld.mc_nome_colonna == tabel.md_logging_insert_date_field_name || fld.mc_nome_colonna == tabel.md_logging_insert_user_field_name)
                    {
                        return;
                    }
                }

                if (!entity.ContainsKey(fld.mc_nome_colonna))
                    return;

                if ((!fld.mc_logic_editable.HasValue || !fld.mc_logic_editable.Value) && !fld.mc_is_primary_key & string.IsNullOrEmpty(fld.mc_default_value))
                {
                    return;
                }

                if (importing && fld.hide_in_import.HasValue && fld.hide_in_import.Value)
                    return;

                _Metadati_Colonne_Button btnCol = fld as _Metadati_Colonne_Button;
                if (btnCol != null)
                    return;

                if (fld.mc_validation_has.HasValue && fld.mc_validation_has.Value && fld.mc_validation_required.HasValue && fld.mc_validation_required.Value && (!entity.ContainsKey(fld.mc_nome_colonna) || entity[fld.mc_nome_colonna] == null) && fld.mc_ui_column_type != "boolean" && fld.mc_ui_column_type != "number_boolean" && string.IsNullOrEmpty(fld.mc_default_value))
                {
                    if (fld.mc_is_primary_key)
                    {
                        if (tabel.md_primary_key_type == "GUID" || tabel.md_primary_key_type == "IDENTITY" || tabel.md_primary_key_type == "MAX")
                        {
                            //autogenerated
                        }
                        else
                        {
                            List<_Metadati_Colonne> pks = metadata.Where(x => x.mc_is_primary_key).ToList();
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

                    valore = EscapeValue(valore);

                    if (fld.mc_ui_column_type == "datetime" && valore != null && valore.ToString() != "")
                    {
                        if (valore.ToString().IndexOf("@") != 0)
                        {
                            //FIX UTC TIME ISSUE 
                            string parsed = valore.ToString().Replace(@"""", "");
                            DateTime d = DateTime.Parse(parsed);
                            valore = d.ToString("yyyyMMdd HH:mm:ss").Replace(".", ":");
                        }
                    }
                    else if (fld.mc_ui_column_type == "date" && valore != null && valore.ToString() != "")
                    {
                        if (valore.ToString().IndexOf("@") != 0)
                        {
                            //FIX UTC TIME ISSUE 
                            string parsed = valore.ToString().Replace(@"""", "");
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
                    else if (fld.mc_ui_column_type == "boolean" && tabel.md_is_reticular)
                    {
                        if (valore != null)
                        {
                            if (valore.ToString().ToLower() == "true")
                            {
                                valore = 1;
                            }
                            else if (valore.ToString().ToLower() == "false")
                            {
                                valore = 0;
                            }
                        }
                        else
                        {
                            if (fld.mc_validation_has.HasValue && fld.mc_validation_has.Value && fld.mc_validation_required.HasValue && fld.mc_validation_required.Value)
                            {
                                valore = 0;
                            }
                        }
                    }
                    else if (fld.mc_ui_column_type == "boolean")
                    {
                        if (valore == null)
                        {
                            if (fld.mc_validation_has.HasValue && fld.mc_validation_has.Value && fld.mc_validation_required.HasValue && fld.mc_validation_required.Value)
                            {
                                valore = 0;
                            }
                        }
                    }
                    else if (fld.mc_ui_column_type == "number_boolean")
                    {
                        if (valore != null)
                        {
                            if (valore.GetType() is bool)
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
                                else if (valore.ToString().ToLower() == "1" || valore.ToString().ToLower() == "0")
                                {

                                }
                                else
                                {
                                    if (fld.mc_validation_has.HasValue && fld.mc_validation_has.Value && fld.mc_validation_required.HasValue && fld.mc_validation_required.Value)
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
                        if (valore != null)
                        {
                            Pair point = RawHelpers.pointStringToPoint(valore.ToString(), "mssql");
                            valore = string.Format("geography::STGeomFromText('POINT({0} {1})', 8307)", point.First.ToString(), point.Second.ToString());
                        }
                    }
                    else if (fld.mc_db_column_type == "geometry")
                    {
                        if (valore != null)
                        {
                            valore = string.Format("geography::STGeomFromText('{0}', 8307)", valore);
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

                    if (valore != null)
                    {
                        if (!string.IsNullOrEmpty(valore.ToString()))
                        {
                            if (fld.mc_ui_is_password.HasValue && fld.mc_ui_is_password.Value && ConfigHelper.GetSettingAsString("IsPwdEncripted") == "true")
                            {
                                valore = Global.pbkdf2Hash(valore.ToString());
                            }
                        }
                    }

                    string fix_quote = "";
                    if ((fld.mc_db_column_type == "int" || fld.mc_db_column_type == "point" || fld.mc_db_column_type == "geometry" || (fld.mc_is_primary_key && !string.IsNullOrEmpty(tabel.md_primary_key_type)) || valore == null))
                    {
                        fix_quote = "";
                    }
                    else
                    {
                        fix_quote = "'";
                    }

                    value_list += (value_list == "" ? "" : ", ") + string.Format("{0}{1}{0}", fix_quote, valore == null ? "null" : valore.ToString());


                    if (fld.mc_ui_column_type == "upload")
                    {
                        _Metadati_Colonne_Upload uploader = fld as _Metadati_Colonne_Upload;
                        if (uploader.isDBUpload && (entity.ContainsKey("__guid") || entity.ContainsKey("__id")))
                        {
                            field_list += (field_list == "" ? "" : ", ") + safetable_name + "." + metaQuery.EscapeDBObjectName(uploader.MultipleUploadBlobFieldName);

                            if (entity[fld.mc_nome_colonna] != null)
                            {
                                //get path of the uploaded file
                                string __id = entity.ContainsKey("__id") ? entity["__id"].ToString() : entity["__guid"].ToString();
                                string pth = HttpContext.Current.Server.MapPath("/Upload" + (uploader.UseRouteNameAsSubfolder ? "/" + tabel.md_route_name : "") + (uploader.UseRecordIDAsSubfolder ? "/" + __id : ""));

                                string tmp_path = System.IO.Path.Combine(pth, entity[fld.mc_nome_colonna].ToString());

                                ////serialize

                                //append to query
                                value_list += (value_list == "" ? "" : ", ") + "(" + "SELECT * FROM OPENROWSET (BULK '" + tmp_path.Replace("'", "''") + "', SINGLE_BLOB) " + uploader.MultipleUploadBlobFieldName + ")";

                                //...

                            }
                            else
                                value_list += (value_list == "" ? "" : ", ") + "null";
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

                            using (OracleConnection connection = GetOpenConnection(RawHelpers.checkIsMetaData(tabel.md_route_name), tabel.md_conn_name))
                            {
                                OracleCommand cmd = new OracleCommand("", connection);
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
                AppendLoggingInsertFields(ref field_list, ref value_list, tabel, userId, entity);
            }

            if (!string.IsNullOrEmpty(local_generated_pkey))
            {
                generatedPkey = local_generated_pkey;
            }

            query = string.Format("INSERT INTO {0}({1}) VALUES({2})", safetable_name, field_list, value_list);

            return query;
        }

        //Clones Entity + First Level related entities
        public static string CloneData(IDictionary<string, object> entity, string route, string user_id, List<routePair> relatedRouteToClone)
        {
            string query = "";
            List<_Metadati_Colonne> metadata = _Metadati_Colonne.getColonneByUserID(route, 0, user_id, dataMode.insert, null);
            List<_Metadati_Colonne> pkeys = metadata.Where(x => x.mc_is_primary_key).ToList();
            _Metadati_Tabelle tab = _Metadati_Tabelle.getTableMetadataFromRoute(route);


            using (OracleConnection connection = GetOpenConnection(RawHelpers.checkIsMetaData(route), tab.md_conn_name))
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
                    ManageMaxKeyType(tab, pkeys[0], pkeys, entity, RawHelpers.getStoreColumnName(pkeys[0]), RawHelpers.getStoreTableName(tab, "mssql"));
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

                query = BuildDynamicInsertQuery(entity, metadata, user_id, out generated_pkey);

                string scope_identity = connection.Execute(NormalizeSql(query)).ToString();

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

                return scope_identity + "," + pkeys[0].mc_nome_colonna;

            }

        }

        private static void ManageMaxKeyType(_Metadati_Tabelle tabel, _Metadati_Colonne fld, List<_Metadati_Colonne> pks, IDictionary<string, object> entity, string safecolumnName, string safetableName)
        {
            using (OracleConnection connection = GetOpenConnection(RawHelpers.checkIsMetaData(tabel.md_route_name), tabel.md_conn_name))
            {
                //special case 
                //mixed pkey 2 cols: 1 is fkey one is int -> logic approach is to use a "Max dependant key"
                OracleCommand cmd = new OracleCommand("", connection);
                string fltr = "";

                string valore = "";

                pks.Where(x => x.mc_nome_colonna != fld.mc_nome_colonna)
                   .ToList()
                   .ForEach(pp =>
                   {
                       fltr += string.Format((string.IsNullOrEmpty(fltr) ? "" : " AND ") + pp.mc_nome_colonna + "={0}" + entity[pp.mc_nome_colonna].ToString() + "{0}", RawHelpers.getQuoteFromColumn(pp));
                   });

                cmd.CommandText = string.Format("SELECT max({0}) FROM {1} {2}", safecolumnName, safetableName, string.IsNullOrEmpty(fltr) ? "" : "where " + fltr);

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

        #endregion

        #region "BO UNIVERSE"

        private static string BuilSelectFromUniverseDefinition(List<Definizione_Universi> definition, List<SortInfo> SortInfo, PageInfo PageInfo, FilterInfos filterInfo, string logicOperator, OracleConnection connection, out long totalRecords)
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

            using (metaModelRaw.metaRawModel context = new metaModelRaw.metaRawModel())
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
                                string safetable_name = RawHelpers.getStoreTableNameFromUniverseDef(def, "mssql");

                                _Metadati_Tabelle tbl = context.GetMetadati_Tabelles("", def.realID.ToString()).FirstOrDefault();
                                _Metadati_Colonne pk = tbl._Metadati_Colonnes.FirstOrDefault(x => x.mc_is_primary_key);

                                string prefix = RawHelpers.getStorePrefix(tbl, "mssql");
                                string safeEntityName = (!string.IsNullOrEmpty(prefix) ? prefix : "") + metaQuery.EscapeDBObjectName(tbl.md_nome_tabella);

                                if (pk != null)
                                    default_order += (string.IsNullOrEmpty(default_order) ? "" : ", ") + safeEntityName + "." + metaQuery.EscapeDBObjectName(pk.mc_nome_colonna);
                                else
                                    default_order += (string.IsNullOrEmpty(default_order) ? "" : ", ") + safeEntityName + "." + metaQuery.EscapeDBObjectName(tbl._Metadati_Colonnes.FirstOrDefault().mc_nome_colonna);

                                from_clause = safetable_name;
                            }
                            else
                            {
                                Definizione_Universi lookH = definition.FirstOrDefault(x => x.id == def.parent && x.isLookup);
                                _Metadati_Colonne_Lookup lookC = context.GetMetadati_Colonnes(lookH.realID.ToString()).FirstOrDefault() as _Metadati_Colonne_Lookup;
                                if (lookC != null)
                                {
                                    _Metadati_Tabelle ownerTable = lookC._Metadati_Tabelle;
                                    _Metadati_Tabelle relatedTable = context.GetMetadati_Tabelles(lookC.mc_ui_lookup_entity_name).FirstOrDefault();
                                    if (relatedTable != null)
                                    {
                                        string prefix = RawHelpers.getStorePrefix(relatedTable, "mssql");
                                        string prefix_2 = RawHelpers.getStorePrefix(ownerTable, "mssql");
                                        string safeEntityName = (!string.IsNullOrEmpty(prefix) ? prefix : "") + metaQuery.EscapeDBObjectName(relatedTable.md_nome_tabella);
                                        string safeColumnName = metaQuery.EscapeDBObjectName(RawHelpers.getStoreColumnName(lookC));

                                        string safeUniqueEntityName = metaQuery.EscapeDBObjectName(lookC.mc_nome_colonna + "_" + lookC.mc_ui_lookup_entity_name);

                                        string current_fld;

                                        if (!aliases.ContainsKey(relatedTable.md_nome_tabella))
                                        {
                                            aliases.Add(relatedTable.md_nome_tabella, safeUniqueEntityName);
                                            current_fld = (!string.IsNullOrEmpty(prefix) ? prefix_2 : "") + metaQuery.EscapeDBObjectName(ownerTable.md_nome_tabella) + "." + safeColumnName;
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

                                        join_clause += string.Format(" LEFT JOIN {0} AS {3} ON {1} = {2}", safeEntityName, current_fld, safeUniqueEntityName + "." + metaQuery.EscapeDBObjectName(lookC.mc_ui_lookup_dataValueField), safeUniqueEntityName);

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
                                safeColumnName = metaQuery.EscapeDBObjectName(alias);
                            }
                            else
                            {
                                alias = col.mc_nome_colonna + "_" + def.id.ToString();
                                safeAlias = metaQuery.EscapeDBObjectName(alias);

                                ownerTable = col._Metadati_Tabelle;
                                safeColumnName = metaQuery.EscapeDBObjectName(RawHelpers.getStoreColumnName(col));

                                prefix = RawHelpers.getStorePrefix(ownerTable, "mssql");

                                if (!aliases.ContainsKey(ownerTable.md_nome_tabella))
                                {
                                    prefix = RawHelpers.getStorePrefix(ownerTable, "mssql");
                                    current_fld = (!string.IsNullOrEmpty(prefix) ? prefix : "") + metaQuery.EscapeDBObjectName(ownerTable.md_nome_tabella) + "." + safeColumnName;
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
                                    select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("Count({0}) as [count_{1}]", current_fld, alias);
                                }
                                if (def.navigator_isAggregableSumChecked)
                                {
                                    aggregatedAlias = string.Format("Sum({0})", current_fld);
                                    select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("Sum({0}) as [sum_{1}]", current_fld, alias);
                                }
                                if (def.navigator_isAggregableMaxChecked)
                                {
                                    aggregatedAlias = string.Format("Max({0})", current_fld);
                                    select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("Max({0}) as [max_{1}]", current_fld, alias);
                                }
                                if (def.navigator_isAggregableMinChecked)
                                {
                                    aggregatedAlias = string.Format("Min({0})", current_fld);
                                    select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("Min({0}) as [min_{1}]", current_fld, alias);
                                }
                                if (def.navigator_isAggregableAvgChecked)
                                {
                                    aggregatedAlias = string.Format("Avg({0})", current_fld);
                                    select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("Avg({0}) as [avg_{1}]", current_fld, alias);
                                }
                                if (def.navigator_isAggregableVarChecked)
                                {
                                    aggregatedAlias = string.Format("Var({0})", current_fld);
                                    select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("Var({0}) as [var_{1}]", current_fld, alias);
                                }

                                if (!def.navigator_isAggregableCountChecked && !def.navigator_isAggregableSumChecked && !def.navigator_isAggregableMaxChecked && !def.navigator_isAggregableMinChecked && !def.navigator_isAggregableAvgChecked && !def.navigator_isAggregableVarChecked)
                                {

                                    string group_piece = "";
                                    if (def.navigator_isDayOfTheYearChecked)
                                    {
                                        group_piece = string.Format("DATEPART(dy, {0})", current_fld);
                                        groupby_fields.Add(def, group_piece);

                                        groupby_clause += (string.IsNullOrEmpty(groupby_clause) ? "GROUP BY " : ", ") + group_piece;
                                        select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("DATEPART(dy, {0}) as {1}", current_fld, safeColumnName);
                                    }
                                    else if (def.navigator_isMonthOfTheYearChecked)
                                    {
                                        group_piece = string.Format("DATEPART(mm, {0})", current_fld);
                                        groupby_fields.Add(def, group_piece);

                                        groupby_clause += (string.IsNullOrEmpty(groupby_clause) ? "GROUP BY " : ", ") + group_piece;
                                        select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("DATEPART(mm, {0}) as {1}", current_fld, safeColumnName);
                                    }
                                    else if (def.navigator_isDay_and_monthChecked)
                                    {
                                        group_piece = string.Format("RIGHT(REPLICATE('0',2) + cast(DATEPART(dd, {0}) as varchar(2)) ,2)  +  '-' + RIGHT(REPLICATE('0',2) + cast(DATEPART(mm, {0}) as varchar(2)) ,2)", current_fld);
                                        groupby_fields.Add(def, group_piece);

                                        groupby_clause += (string.IsNullOrEmpty(groupby_clause) ? "GROUP BY " : ", ") + group_piece;
                                        select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("RIGHT(REPLICATE('0',2) + cast(DATEPART(dd, {0}) as varchar(2)) ,2)  +  '-' + RIGHT(REPLICATE('0',2) + cast(DATEPART(mm, {0}) as varchar(2)) ,2) as {1}", current_fld, safeColumnName);
                                        alternate_ordering = alias;
                                    }
                                    else if (def.navigator_isMonth_and_yearChecked)
                                    {
                                        group_piece = string.Format("cast(DATEPART(year, {0}) as varchar(4)) +  '-' + RIGHT(REPLICATE('0',2) + cast(DATEPART(mm, {0}) as varchar(2)) ,2)", current_fld);
                                        groupby_fields.Add(def, group_piece);

                                        groupby_clause += (string.IsNullOrEmpty(groupby_clause) ? "GROUP BY " : ", ") + group_piece;
                                        select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("cast(DATEPART(year, {0}) as varchar(4)) +  '-' + RIGHT(REPLICATE('0',2) + cast(DATEPART(mm, {0}) as varchar(2)) ,2) as {1}", current_fld, safeColumnName);
                                        alternate_ordering = alias;
                                    }
                                    else if (def.navigator_isGroupableChecked)
                                    {
                                        group_piece = current_fld;
                                        groupby_fields.Add(def, group_piece);

                                        groupby_clause += (string.IsNullOrEmpty(groupby_clause) ? "GROUP BY " : ", ") + group_piece;
                                        select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("{0} as [{1}]", current_fld, alias);
                                    }
                                    else
                                    {
                                        select_clause += (string.IsNullOrEmpty(select_clause) ? "" : ", ") + string.Format("{0} as [{1}]", current_fld, alias);
                                    }

                                    if (ownerTable != null)
                                    {
                                        order_safetable_name = (!string.IsNullOrEmpty(prefix) ? prefix : metaQuery.EscapeDBObjectName(ownerTable.md_nome_tabella));
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
                            filterElement matchingFilter = filterInfo.filters.FirstOrDefault(x => (x.isHaving == null || x.isHaving == false) && x.havingAggregation != null && x.field == x.havingAggregation + "_" + col.mc_nome_colonna + "_" + def.id);
                            if (matchingFilter == null)
                            {
                                aliased = col.mc_nome_colonna + "_" + def.id;
                                matchingFilter = filterInfo.filters.FirstOrDefault(x => (x.isHaving == null || x.isHaving == false) && x.havingAggregation == null && x.field == aliased);
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
                                    orderby_clause += ((orderby_clause == "") ? " ORDER BY " : ", ") + "(" + ((col.mc_is_computed.HasValue && col.mc_is_computed.Value) ? "(SELECT " + col.mc_computed_formula + ")" : (!string.IsNullOrEmpty(aggregatedAlias) ? aggregatedAlias : alias)) + ") " + SortInfo.FirstOrDefault(x => x.mc_id == col.mc_id).dir;
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
                    string countQry = string.Format("SELECT count(*) FROM ( SELECT {0} FROM {1} {2} {3} {4} {5} ) as T", select_clause, from_clause, join_clause, where_clause, groupby_clause, having_clause);
                    try
                    {
                        totalRecords = connection.Query<Int32>(countQry).FirstOrDefault();
                    }
                    catch (Exception ex)
                    {
                        RawHelpers.logError(ex, "getFlatData", countQry);
                        throw new Exception(ex.Message + " " + countQry);
                    }

                    ret = string.Format("SELECT * FROM " +
                                "(SELECT ROW_NUMBER() " +
                                    "OVER ({6}) AS Row, " +
                                    "{0} " +
                                "FROM {1} {2} {3} {4} {5}) AS ENT ", select_clause, from_clause, join_clause, where_clause, groupby_clause, having_clause, fix_order) +
                                string.Format("WHERE Row BETWEEN {0} AND {1}", ((skiprecords == 0) ? 0 : skiprecords + 1), skiprecords + PageInfo.pageSize);
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

        private static string parseComputedFormula(Definizione_Universi def, metaModelRaw.metaRawModel context)
        {
            Regex rgx = new Regex(@"\{[^}]+\}");
            string current_fld = rgx.Replace(def.computedFormula, new MatchEvaluator((m) =>
            {
                int mc_id = int.Parse(m.Value.Split(new string[] { "___" }, StringSplitOptions.None)[1].Replace("}", ""));
                return context.GetMetadati_Colonnes(mc_id.ToString()).FirstOrDefault().mc_nome_colonna;
            }));
            return current_fld;
        }

        private static string fix_select(List<Definizione_Universi> definition, string select_clause, metaModelRaw.metaRawModel context, Dictionary<string, string> aliases)
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
                bo = context.GetUniversis(bo_id.Value.ToString()).FirstOrDefault();
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
                List<AggregationResult> aggregateValues;
                using (OracleConnection connection = GetOpenConnection(false))
                {
                    try
                    {

                        query = BuilSelectFromUniverseDefinition(definition, SortInfo, PageInfo, filterInfo, logicOperator, connection, out totalRecords);

                        List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)connection.Query(NormalizeSql(query));

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

                string qry = "INSERT INTO [dbo].[definizione__universi] ([boid],[display_name1],[is_lookup1],[is_table1],[name1],[parent1],[type1],[id1],computed_formula1 ,[is_tbl1],[owner_route_name1],[owner_table_name1],[schema_name1],[db_name1],is_checked1,navigatoris_selected) VALUES(@boid,@display_name1,@is_lookup1,@is_table1,@name1,@parent1,@type1,@id1,@computed_formula1 ,@is_tbl1,@owner_route_name1,@owner_table_name1,@schema_name1,@db_name1,@is_checked1,@navigatoris_selected)";

                using (OracleConnection con = GetOpenConnection(true))
                {
                    var dbArgs = new DynamicParameters();
                    dbArgs.Add("@boid", bo.bo_id);
                    dbArgs.Add("@display_name1", nome);
                    dbArgs.Add("@is_lookup1", false);
                    dbArgs.Add("@is_table1", false);
                    dbArgs.Add("@name1", nome);
                    dbArgs.Add("@parent1", parentID);
                    dbArgs.Add("@type1", tipo);
                    dbArgs.Add("@id1", id);
                    dbArgs.Add("@computed_formula1", formula);
                    dbArgs.Add("@is_tbl1", 2);
                    dbArgs.Add("@owner_route_name1", tabel.md_route_name);
                    dbArgs.Add("@owner_table_name1", tabel.md_nome_tabella);
                    dbArgs.Add("@schema_name1", tabel.md_schema_name);
                    dbArgs.Add("@db_name1", tabel.md_db_name);
                    dbArgs.Add("@is_checked1", false);
                    dbArgs.Add("@navigatoris_selected", false);

                    int iid = con.Execute(qry, dbArgs);
                    computed.bo_def_id = iid;
                }

                return computed;
            }
        }

                public static string GetLastCrudSqlQuery()
        {
            return null;
        }

        public static void ClearLastCrudSqlQuery()
        {
        }

        public static void FlushCache(string route)
        {
            if (string.IsNullOrWhiteSpace(route))
                return;

            string shadowTableName = RawHelpers.escapeDBObjectName("_shadow_" + route, "oracle");
            using (OracleConnection connection = GetOpenConnection(false))
            {
                var dbArgs = new DynamicParameters();
                dbArgs.Add("route", EscapeValue(route));
                try { connection.Execute(string.Format("DELETE FROM {0}", shadowTableName)); } catch { }

                using (OracleConnection connection2 = GetOpenConnection(true))
                {
                    try { connection2.Execute("DELETE FROM _shadow_caching where route=:route", dbArgs); } catch { }
                }
            }
        }

        public static string ExportFlatRecordData(List<SerializableDictionary<string, object>> dati, List<SerializableDictionary<string, object>> lst, string route, string uid, string progressGuid, string excelTheme = null, string excelThemeMode = null)
        {
            using (metaRawModel context = new metaRawModel())
            {
                List<_Metadati_Colonne> mcs = context.GetMetadati_Colonnes(null, null, route);
                return RawHelpers.ExportToExcel2(mcs, dati, route, route, uid, progressGuid, excelTheme, excelThemeMode);
            }
        }

        public static bool GetIsUniqueValue(int column_id, string text, string user_id)
        {
            using (metaRawModel context = new metaRawModel())
            {
                _Metadati_Tabelle tabel = context.GetMetadati_TabellaByColID(column_id);
                if (tabel == null)
                    throw new Exception("Table not found!");

                bool isMeta = RawHelpers.checkIsMetaData(tabel.md_route_name);
                using (DbConnection connection = GetOpenConnection(isMeta, tabel.md_conn_name))
                {
                    _Metadati_Colonne col = tabel._Metadati_Colonnes.FirstOrDefault(x => x.mc_id == column_id);
                    if (col == null)
                        return true;

                    if (col.mc_db_column_type == "text" || col.mc_db_column_type == "xml")
                        return true;

                    string query;
                    long total;
                    List<AggregationResult> agg;
                    FilterInfos finfos = new FilterInfos { filters = new List<filterElement> { new filterElement() { field = col.mc_nome_colonna, operatore = "eq", value = text } } };
                    query = BuildDynamicSelectQuery(tabel._Metadati_Colonnes.ToList(), null, null, new PageInfo() { currentPage = 0, pageSize = 1 }, finfos, "AND", true, (OracleConnection)connection, out total, null, out agg, user_id, "", 0, col.mc_nome_colonna);
                    List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)connection.Query(query, commandTimeout: int.Parse(ConfigHelper.GetSettingAsString("autoGeneratedQueryTimeout")));
                    return rows.Count == 0;
                }
            }
        }

        public static List<domBoard> loadDashboard(string dashRoute)
        {
            using (metaRawModel context = new metaRawModel())
            {
                List<domBoard> boards = context.GetdomBoards(dashRoute).ToList();
                boards.ForEach(b => { b.skipChilds = false; var _ = b.domBoardSheets; });
                return boards;
            }
        }

        public static int GetMetadati_Tabelles_NonSystem_Count()
        {
            using (OracleConnection con = GetOpenConnection(true))
            {
                return (int)con.Query<long>("select count(*) from _metadati__tabelle where coalesce(issystemroute,0)=0").FirstOrDefault();
            }
        }

        public static List<_Metadati_Tabelle> GetMetadati_Tabelles_NonSystem()
        {
            using (OracleConnection con = GetOpenConnection(true))
            {
                List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)con.Query("select * from _metadati__tabelle where coalesce(issystemroute,0)=0");
                return metaRawModel.convertDictionariesToList<_Metadati_Tabelle>(rows);
            }
        }

        public static List<_Metadati_Tabelle> GetMetadati_TabellesForScaffolding(string tableName, string connName = "", string tableSchema = "", string db = "", bool skipColumns = false)
        {
            using (OracleConnection con = GetOpenConnection(true))
            {
                string query = "select * from _metadati__tabelle";
                List<string> where = new List<string>();
                var dbArgs = new DynamicParameters();
                if (!string.IsNullOrEmpty(tableName)) { where.Add("md_nome_tabella=:md_nome_tabella"); dbArgs.Add("md_nome_tabella", tableName); }
                if (!string.IsNullOrEmpty(connName)) { where.Add("mdconnname=:mdconnname"); dbArgs.Add("mdconnname", connName); }
                if (!string.IsNullOrEmpty(tableSchema)) { where.Add("mdschemaname=:mdschemaname"); dbArgs.Add("mdschemaname", tableSchema); }
                if (!string.IsNullOrEmpty(db)) { where.Add("mddbname=:mddbname"); dbArgs.Add("mddbname", db); }
                if (where.Count > 0) query += " WHERE " + string.Join(" AND ", where);

                List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)con.Query(query, dbArgs);
                List<_Metadati_Tabelle> res = metaRawModel.convertDictionariesToList<_Metadati_Tabelle>(rows);
                res.ForEach(x => x.skipColumns = skipColumns);
                return res;
            }
        }

        public static List<_Metadati_Tabelle> GetMetadati_TabellesWhere(string searchPredicate, bool skipColumns = false)
        {
            using (OracleConnection con = GetOpenConnection(true))
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
            using (OracleConnection con = GetOpenConnection(true))
            {
                var dbArgs = new DynamicParameters();
                dbArgs.Add("md_id", md_id);
                List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)con.Query("SELECT * FROM _Metadati_Condition_Group WHERE md_id=:md_id", dbArgs);
                List<WuicCore.MetaModel._Metadati_Condition_Group> ret = metaRawModel.convertDictionariesToList<WuicCore.MetaModel._Metadati_Condition_Group>(rows);

                string ids = string.Join(",", ret.Select(x => x.CG_Id));
                if (!string.IsNullOrWhiteSpace(ids))
                {
                    List<Dapper.SqlMapper.FastExpando> condRows = (List<Dapper.SqlMapper.FastExpando>)con.Query("SELECT * FROM _Metadati_Condition_Action_Group WHERE fk_cg_id IN (" + ids + ")");
                    List<WuicCore.MetaModel._Metadati_Condition_Action_Group> cond = metaRawModel.convertDictionariesToList<WuicCore.MetaModel._Metadati_Condition_Action_Group>(condRows);
                    ret.ForEach(c => c.ConditionActions = cond.Where(x => x.FK_CG_Id == c.CG_Id).ToList());
                }

                return ret;
            }
        }

        public static List<_Error_Logs> GetError_Logs()
        {
            using (OracleConnection con = GetOpenConnection(true))
            {
                List<Dapper.SqlMapper.FastExpando> rows = (List<Dapper.SqlMapper.FastExpando>)con.Query("SELECT * FROM _error_logs");
                return metaRawModel.convertDictionariesToList<_Error_Logs>(rows);
            }
        }
        public static void authenticate(SysInfo infos, user user)
        {
            if (infos == null || user == null)
                return;
            user.role = user.role ?? string.Empty;
        }

        public static DbConnection CreateOpenConnection(string connectionString)
        {
            var connection = new OracleConnection(connectionString);
            connection.Open();
            return connection;
        }

        public static DateTime? getLastUserActivityByID(string user_id)
        {
            return null;
        }

        public static void saveProgress(string guid, decimal progress)
        {
            // oracle provider does not persist query progress yet.
        }

        public static List<bind_list> getDatabasesFromConnection(string connection, string provider)
        {
            using (var con = new OracleConnection(connection))
            {
                con.Open();
                var dbs = con.Query<string>("SELECT DISTINCT SYS_CONTEXT('USERENV', 'DB_NAME') FROM dual").ToList();
                return dbs.Select(x => new bind_list() { valore = x, text = x }).ToList();
            }
        }

        public static void getUploadedFile(_Metadati_Tabelle tabel, string connectionString, _Metadati_Colonne pkey, _Metadati_Colonne_Upload uploader, string tabel_name, string __id, out byte[] file)
        {
            file = null;
            if (uploader == null || pkey == null || string.IsNullOrWhiteSpace(connectionString) || string.IsNullOrWhiteSpace(__id))
                return;

            using (var con = new OracleConnection(connectionString))
            {
                con.Open();
                string q = $"SELECT {EscapeDBObjectName(uploader.mc_nome_colonna)} FROM {EscapeDBObjectName(tabel_name)} WHERE {EscapeDBObjectName(pkey.mc_nome_colonna)}=:id";
                file = con.Query<byte[]>(q, new { id = __id }).FirstOrDefault();
            }
        }

        public static void fixQueryReport(string user_id, dynamic report, string route, DbConnection connection, ref int needFilter, string[] filterSplit)
        {
            // TODO provider-specific report query patching; keep behavior non-failing.
            needFilter = Math.Max(needFilter, 0);
        }
#endregion



    }

}














