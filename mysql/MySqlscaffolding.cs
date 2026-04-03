using System;
using System.Collections.Generic;
using System.Configuration;
using System.Data;
using System.Data.Common;
using System.Linq;
using System.Reflection;
using System.Text;
using Dapper;
using WEB_UI_CRAFTER.Helpers;

namespace metaModelRaw
{
    public class MySqlscaffolding
    {
        private static void ParseQualifiedDbObjectName(string input, out string schema, out string name)
        {
            schema = null;
            name = string.IsNullOrWhiteSpace(input) ? string.Empty : input.Trim();

            if (string.IsNullOrWhiteSpace(name))
                return;

            int dotIndex = name.IndexOf('.');
            if (dotIndex <= 0 || dotIndex >= name.Length - 1)
                return;

            schema = name.Substring(0, dotIndex).Trim().Trim('`');
            name = name.Substring(dotIndex + 1).Trim().Trim('`');
        }

        public int AddTable(string nome_tabella, string connectionName, string schema, string db, string pKeyType, bool createMenu, string pkeyName = "id", bool isPkeyUnique = true, int parentMenuId = 0)
        {
            using (metaRawModel context = new metaRawModel())
            {
                return context.AddTable(nome_tabella, ref connectionName, ref schema, ref db, pKeyType, createMenu, pkeyName, isPkeyUnique, parentMenuId);
            }
        }

        public int AddColumn(string route, string mc_ui_column_type, string mc_nome_colonna, string alias, bool nullable = true, int scale = 0, int precision = 0, int maxLength = 0, string defaultValue = "")
        {
            string uID = RawHelpers.authenticate();
            RawHelpers.checkAdmin(uID);

            using (metaRawModel md = new metaRawModel())
            {
                _Metadati_Tabelle mt = md.GetMetadati_Tabelles(route).FirstOrDefault();
                if (mt == null)
                    return 0;

                return md.AddMySqlColumn(md, mt, route, mc_ui_column_type, mc_nome_colonna, alias, nullable, scale, precision, maxLength, defaultValue);
            }
        }

        public void RemoveColumn(string table, string mc_nome_colonna, int mc_id)
        {
            string uID = RawHelpers.authenticate();
            RawHelpers.checkAdmin(uID);

            using (metaRawModel md = new metaRawModel())
            {
                md.RemoveColonna(table, mc_nome_colonna, mc_id);
            }
        }

        public string getConnections()
        {
            return RawHelpers.getConnections();
        }

        public string getDefaultConnection()
        {
            string uid = RawHelpers.authenticate();
            RawHelpers.checkAdmin(uid);

            return ConfigHelper.GetSettingAsString("connection");
        }

        public string getDatabasesFromConnection(string connection, string provider)
        {
            return RawHelpers.getDatabasesFromConnection(connection, provider);
        }

        public string getTablesFromDB(string connection, string db, string schema = null)
        {
            using (metaRawModel ctx = new metaRawModel())
            {
                RawHelpers.authenticate();
                List<bind_list> tblList = new List<bind_list>();

                string effectiveDb = string.IsNullOrWhiteSpace(schema) ? db : schema;

                var tables = ctx.getTableDTMySql(connection, effectiveDb);
                foreach (string tb in tables.OrderBy(x => x))
                {
                    tblList.Add(new bind_list() { valore = tb, text = tb });
                }

                var views = ctx.getViewVWMySql(connection, effectiveDb);
                foreach (string vw in views.OrderBy(x => x))
                {
                    tblList.Add(new bind_list() { valore = vw, text = vw + " [VISTA]" });
                }

                var storeds = ctx.getStoredSPMySql(connection, effectiveDb);
                foreach (string sp in storeds.OrderBy(x => x))
                {
                    tblList.Add(new bind_list() { valore = sp, text = sp + " [STORED]", isStored = true });
                }

                return RawHelpers.serialize(tblList, null);
            }
        }

        public string getColumnsFromTable(string connection, string db, string table)
        {
            string uid = RawHelpers.authenticate();
            RawHelpers.checkAdmin(uid);

            ParseQualifiedDbObjectName(table, out string tableSchema, out string tableName);
            string effectiveDb = string.IsNullOrWhiteSpace(tableSchema) ? db : tableSchema;

            List<bind_list> tblList = new List<bind_list>();
            using (DbConnection con = MySqlProviderGateway.CreateOpenConnection(connection + ";database=information_schema"))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, "select COLUMN_NAME, DATA_TYPE from columns where table_schema=@db and table_name=@table"))
            {
                con.Open();
                DbProviderUtil.AddWithValue(cmd, "db", effectiveDb);
                DbProviderUtil.AddWithValue(cmd, "table", tableName);

                using (DbDataReader reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        string ownerTable = string.IsNullOrWhiteSpace(tableSchema) ? tableName : tableSchema + "." + tableName;
                        tblList.Add(new bind_list()
                        {
                            valore = reader.GetString(0),
                            text = ownerTable + "." + reader.GetString(0) + string.Format(" [{0}]", reader.GetString(1)),
                            ownerTable = ownerTable
                        });
                    }
                }
            }

            return RawHelpers.serialize(tblList, null);
        }

        public string getColumnsFromView(string connection, string db, string view)
        {
            RawHelpers.authenticate();

            ParseQualifiedDbObjectName(view, out string viewSchema, out string viewName);
            string effectiveDb = string.IsNullOrWhiteSpace(viewSchema) ? db : viewSchema;

            List<bind_list> tblList = new List<bind_list>();
            using (DbConnection con = MySqlProviderGateway.CreateOpenConnection(connection + ";database=information_schema"))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, "select COLUMN_NAME, DATA_TYPE from columns where table_schema=@db and table_name=@table"))
            {
                con.Open();
                DbProviderUtil.AddWithValue(cmd, "db", effectiveDb);
                DbProviderUtil.AddWithValue(cmd, "table", viewName);

                using (DbDataReader reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        string ownerTable = string.IsNullOrWhiteSpace(viewSchema) ? viewName : viewSchema + "." + viewName;
                        tblList.Add(new bind_list()
                        {
                            valore = reader.GetString(0),
                            text = ownerTable + "." + reader.GetString(0) + string.Format(" [{0}]", reader.GetString(1)),
                            ownerTable = ownerTable
                        });
                    }
                }
            }

            return RawHelpers.serialize(tblList, null);
        }

        public void fixFKeys(string connection, string db)
        {
            string uid = RawHelpers.authenticate();
            RawHelpers.checkAdmin(uid);

            var sourceColumns = new List<(string TableName, string ColumnName, string DataType, bool IsPk, string PkName, string FkName, string RefTable, string RefColumn)>();
            using (DbConnection con = MySqlProviderGateway.CreateOpenConnection(connection + ";database=information_schema"))
            using (DbCommand cmd = con.CreateCommand())
            {
                cmd.CommandText = @"
SELECT
    c.TABLE_NAME AS TableName,
    c.COLUMN_NAME AS ColumnName,
    c.DATA_TYPE AS DataTypeName,
    CASE WHEN pk.CONSTRAINT_NAME IS NULL THEN 0 ELSE 1 END AS IsPrimaryKey,
    pk.CONSTRAINT_NAME AS PkName,
    fk.CONSTRAINT_NAME AS FkName,
    fk.REFERENCED_TABLE_NAME AS ReferencedTable,
    fk.REFERENCED_COLUMN_NAME AS ReferencedColumn
FROM COLUMNS c
LEFT JOIN (
    SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME
    FROM KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = @db AND CONSTRAINT_NAME = 'PRIMARY'
) pk ON pk.TABLE_NAME = c.TABLE_NAME AND pk.COLUMN_NAME = c.COLUMN_NAME
LEFT JOIN (
    SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = @db AND REFERENCED_TABLE_NAME IS NOT NULL
) fk ON fk.TABLE_NAME = c.TABLE_NAME AND fk.COLUMN_NAME = c.COLUMN_NAME
WHERE c.TABLE_SCHEMA = @db
ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION;";
                DbProviderUtil.AddWithValue(cmd, "db", db ?? string.Empty);

                con.Open();
                using (DbDataReader dr = cmd.ExecuteReader())
                {
                    while (dr.Read())
                    {
                        sourceColumns.Add((
                            RawHelpers.ParseNull(dr["TableName"]),
                            RawHelpers.ParseNull(dr["ColumnName"]),
                            RawHelpers.ParseNull(dr["DataTypeName"]),
                            RawHelpers.ParseNull(dr["IsPrimaryKey"]).Trim() == "1",
                            RawHelpers.ParseNull(dr["PkName"]),
                            RawHelpers.ParseNull(dr["FkName"]),
                            RawHelpers.ParseNull(dr["ReferencedTable"]),
                            RawHelpers.ParseNull(dr["ReferencedColumn"])
                        ));
                    }
                }
            }

            var metaMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            using (DbConnection metaCon = MySqlProviderGateway.GetOpenConnection(true))
            using (DbCommand metaCmd = metaCon.CreateCommand())
            {
                metaCmd.CommandText = @"
SELECT
    c.mc_id,
    c.mcrealcolumnname AS mc_real_column_name,
    t.md_nome_tabella
FROM _metadati__colonne c
INNER JOIN _metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mddbname = @db OR (@db = '' AND IFNULL(t.mddbname, '') = '');";
                DbProviderUtil.AddWithValue(metaCmd, "db", db ?? string.Empty);

                using (DbDataReader dr = metaCmd.ExecuteReader())
                {
                    while (dr.Read())
                    {
                        int mcId = Convert.ToInt32(dr["mc_id"]);
                        string tableName = RawHelpers.ParseNull(dr["md_nome_tabella"]);
                        string colName = RawHelpers.ParseNull(dr["mc_real_column_name"]);
                        metaMap[tableName + "|" + colName] = mcId;
                    }
                }
            }

            using (metaRawModel context = new metaRawModel())
            {
                foreach (var src in sourceColumns)
                {
                    if (!metaMap.TryGetValue(src.TableName + "|" + src.ColumnName, out int mcId))
                        continue;

                    _Metadati_Colonne uicCol = context.GetMetadati_Colonnes(mcId.ToString()).FirstOrDefault();
                    if (uicCol == null)
                        continue;

                    bool updated = false;

                    if (!string.IsNullOrEmpty(src.FkName))
                    {
                        _Metadati_Colonne_Lookup look = uicCol as _Metadati_Colonne_Lookup;
                        if (look != null)
                        {
                            if (look.mc_fk_name != src.FkName)
                            {
                                look.mc_fk_name = src.FkName;
                                updated = true;
                            }
                            if (look.mc_ui_lookup_dataValueField != src.RefColumn)
                            {
                                look.mc_ui_lookup_dataValueField = src.RefColumn;
                                updated = true;
                            }
                            string routeName = RawHelpers.getRouteName(src.RefTable);
                            if (look.mc_ui_lookup_entity_name != routeName)
                            {
                                look.mc_ui_lookup_entity_name = routeName;
                                updated = true;
                            }
                        }
                        else
                        {
                            look = new _Metadati_Colonne_Lookup();
                            cloneToChild(uicCol, look);

                            look.mc_fk_name = src.FkName;
                            look.mc_ui_lookup_dataValueField = src.RefColumn;
                            look.mc_ui_lookup_entity_name = RawHelpers.getRouteName(src.RefTable);
                            look.mc_ui_lookup_filter = "contains";
                            look.mc_serverside_operations = true;
                            look.mc_ui_pagesize = 10;
                            look.mc_ui_lookup_insert_allow = true;
                            look.mc_ui_lookup_search_grid = true;

                            uicCol = look;
                            updated = true;
                        }
                    }

                    if (src.IsPk)
                    {
                        if (uicCol.mc_pk_name != src.PkName || !uicCol.mc_is_primary_key)
                        {
                            uicCol.mc_pk_name = src.PkName;
                            uicCol.mc_is_primary_key = true;
                            updated = true;
                        }
                    }

                    string actualType = RawHelpers.getDBDataType((src.DataType ?? string.Empty).ToLowerInvariant());
                    if (uicCol.mc_db_column_type != actualType)
                    {
                        uicCol.mc_db_column_type = actualType;
                        updated = true;
                    }

                    if (updated)
                        context.UpdateColonna(uicCol);
                }

                RawHelpers.setMetadataVersion();
            }
        }

        // Backward-compatible signature.
        public string scaffoldDB(string connection, string connName, string db, bool createMenu)
        {
            return scaffoldDB(connection, connName, db, createMenu, 0)["log"];
        }

        public Dictionary<string, string> scaffoldDB(string connection, string connName, string db, bool createMenu, int parentMenuId)
        {
            RawHelpers.authenticate();
            StringBuilder str = new StringBuilder();

            using (metaRawModel mmd = new metaRawModel())
            {
                List<string> tables = mmd.getTableDTMySql(connection, db);
                List<string> views = mmd.getViewVWMySql(connection, db);
                List<string> storeds = mmd.getStoredSPMySql(connection, db);

                str.AppendLine(string.Format("Scaffolding {0} tables<br />", tables.Count));

                bool createM = createMenu;

                foreach (string tb in tables.OrderBy(x => x))
                {
                    createMenu = createM;

                    if (tb == "test" || tb == "information_schema")
                        continue;

                    List<columnDefinition> columns = mmd.getColumnsDTMySql(connection, db, tb, str);

                    foreach (columnDefinition col in columns)
                    {
                        mmd.scaffoldOfColumnMySql(connection, connName, mmd, tb, db, col, str, ref createMenu, columns.Count);
                    }
                }

                foreach (string vw in views.OrderBy(x => x))
                {
                    if (vw.Equals("information_schema", StringComparison.OrdinalIgnoreCase))
                        continue;

                    List<columnDefinition> columns = mmd.getColumnsVWMySql(connection, db, vw, str);
                    foreach (columnDefinition col in columns)
                    {
                        mmd.scaffoldOfColumnMySql(connection, connName, mmd, vw, db, col, str, ref createMenu, columns.Count);
                    }
                }

                foreach (string sp in storeds.OrderBy(x => x))
                {
                    mmd.scaffoldOfStoredMySql(connection, connName, sp, mmd, str, db);
                }

                RawHelpers.setMetadataVersion();
            }

            return new Dictionary<string, string>()
            {
                { "message", str.ToString() }
            };
        }

        // Backward-compatible signature.
        public string scaffoldColumn(string connection, string connName, string db, string table, string column)
        {
            return scaffoldColumnAsDictionary(connection, connName, db, table, column)["log"];
        }

        public Dictionary<string, string> scaffoldColumnAsDictionary(string connection, string connName, string db, string table, string column)
        {
            using (metaRawModel ctx = new metaRawModel())
            {
                string log = ctx.scaffoldColumnMySql(connection, connName, db, table, column);
                return new Dictionary<string, string>()
                {
                    { "message", log }
                };
            }
        }

        // Backward-compatible signature.
        public string scaffoldTable(string connection, string connName, string db, string table, bool createMenu)
        {
            return scaffoldTable(connection, connName, db, table, createMenu, 0)["log"];
        }

        public Dictionary<string, string> scaffoldTable(string connection, string connName, string db, string table, bool createMenu, int parentMenuId, string schema = null)
        {
            using (metaRawModel ctx = new metaRawModel())
            {
                string effectiveDb = string.IsNullOrWhiteSpace(schema) ? db : schema;
                string log = ctx.scaffoldTableMySql(ref connection, connName, effectiveDb, table, ref createMenu);
                return new Dictionary<string, string>()
                {
                    { "message", log }
                };
            }
        }

        // Backward-compatible signature.
        public string scaffoldView(string connection, string connName, string db, string view, bool createMenu)
        {
            return scaffoldView(connection, connName, db, view, createMenu, 0)["message"];
        }

        public Dictionary<string, string> scaffoldView(string connection, string connName, string db, string view, bool createMenu, int parentMenuId)
        {
            RawHelpers.authenticate();

            connection = connection + ";database=information_schema";
            StringBuilder log = new StringBuilder();

            _Metadati_Tabelle currentMT = null;

            using (metaRawModel mmd = new metaRawModel())
            {
                string viewT = mmd.getViewVWMySql(connection, db).FirstOrDefault(x => x == view);
                if (!string.IsNullOrEmpty(viewT))
                {
                    List<columnDefinition> columns = mmd.getColumnsVWMySql(connection, db, viewT, log);
                    currentMT = mmd.scaffoldOfViewMySql(connection, connName, viewT, mmd, log, db, createMenu);

                    foreach (columnDefinition col in columns)
                    {
                        mmd.scaffoldOfColumnMySql(connection, connName, mmd, viewT, db, col, log, ref createMenu, columns.Count);
                        createMenu = false;
                    }
                }
            }

            string logg = log.ToString();
            if (string.IsNullOrEmpty(logg))
                logg = "Nessuna nuova colonna";

            RawHelpers.setMetadataVersion();

            return new Dictionary<string, string>()
            {
                { "message", logg },
                { "id", currentMT != null ? currentMT.md_id.ToString() : string.Empty }
            };
        }

        // Backward-compatible signature.
        public string scaffoldStored(string connection, string connName, string db, string stored)
        {
            return scaffoldStored(connection, connName, db, stored, false, 0)["log"];
        }

        public Dictionary<string, string> scaffoldStored(string connection, string connName, string db, string stored, bool createMenu, int parentMenuId)
        {
            using (metaRawModel ctx = new metaRawModel())
            {
                string log = ctx.scaffoldStoredMySql(ref connection, connName, db, stored);
                return new Dictionary<string, string>()
                {
                    { "message", log }
                };
            }
        }

        private void cloneToChild(object baseClassObj, object childClassObject)
        {
            foreach (PropertyInfo pinfo in baseClassObj.GetType().GetProperties())
            {
                PropertyInfo childPinfo = childClassObject.GetType().GetProperty(pinfo.Name);
                if (childPinfo != null && childPinfo.CanWrite)
                {
                    childPinfo.SetValue(childClassObject, pinfo.GetValue(baseClassObj, null), null);
                }
            }
        }
    }
}





