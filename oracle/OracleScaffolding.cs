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
    public class OracleScaffolding
    {
        private static string NormalizeOwner(string schemaOrDb)
        {
            return string.IsNullOrWhiteSpace(schemaOrDb) ? string.Empty : schemaOrDb.Trim().ToUpperInvariant();
        }

        private static List<string> GetOracleTables(string connection, string owner)
        {
            var ret = new List<string>();
            string sql = string.IsNullOrEmpty(owner)
                ? "select table_name from user_tables order by table_name"
                : "select table_name from all_tables where owner=@owner order by table_name";
            using (DbConnection con = OracleProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, sql))
            {
                con.Open();
                if (!string.IsNullOrEmpty(owner))
                    DbProviderUtil.AddWithValue(cmd, "owner", owner);
                using (DbDataReader dr = cmd.ExecuteReader())
                {
                    while (dr.Read())
                        ret.Add(RawHelpers.ParseNull(dr[0]));
                }
            }

            return ret;
        }

        private static List<string> GetOracleViews(string connection, string owner)
        {
            var ret = new List<string>();
            string sql = string.IsNullOrEmpty(owner)
                ? "select view_name from user_views order by view_name"
                : "select view_name from all_views where owner=@owner order by view_name";
            using (DbConnection con = OracleProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, sql))
            {
                con.Open();
                if (!string.IsNullOrEmpty(owner))
                    DbProviderUtil.AddWithValue(cmd, "owner", owner);
                using (DbDataReader dr = cmd.ExecuteReader())
                {
                    while (dr.Read())
                        ret.Add(RawHelpers.ParseNull(dr[0]));
                }
            }

            return ret;
        }

        private static List<string> GetOracleStored(string connection, string owner)
        {
            var ret = new List<string>();
            string sql = string.IsNullOrEmpty(owner)
                ? "select object_name from user_procedures where object_type in ('PROCEDURE','FUNCTION') order by object_name"
                : "select object_name from all_procedures where owner=@owner and object_type in ('PROCEDURE','FUNCTION') order by object_name";
            using (DbConnection con = OracleProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, sql))
            {
                con.Open();
                if (!string.IsNullOrEmpty(owner))
                    DbProviderUtil.AddWithValue(cmd, "owner", owner);
                using (DbDataReader dr = cmd.ExecuteReader())
                {
                    while (dr.Read())
                        ret.Add(RawHelpers.ParseNull(dr[0]));
                }
            }

            return ret.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }

        private static List<columnDefinition> GetOracleColumns(string connection, string owner, string tableName, StringBuilder log)
        {
            var ret = new List<columnDefinition>();
            string sql = string.IsNullOrEmpty(owner)
                ? @"select column_name, data_type, nullable, data_default, data_length, data_precision, data_scale
                    from user_tab_columns where table_name=@table order by column_id"
                : @"select column_name, data_type, nullable, data_default, data_length, data_precision, data_scale
                    from all_tab_columns where owner=@owner and table_name=@table order by column_id";
            using (DbConnection con = OracleProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, sql))
            {
                con.Open();
                if (!string.IsNullOrEmpty(owner))
                    DbProviderUtil.AddWithValue(cmd, "owner", owner);
                DbProviderUtil.AddWithValue(cmd, "table", tableName.ToUpperInvariant());
                using (DbDataReader dr = cmd.ExecuteReader())
                {
                    while (dr.Read())
                    {
                        ret.Add(new columnDefinition()
                        {
                            Name = RawHelpers.ParseNull(dr["column_name"]),
                            DataType = RawHelpers.ParseNull(dr["data_type"]),
                            Nullable = RawHelpers.ParseNull(dr["nullable"]).Equals("Y", StringComparison.OrdinalIgnoreCase),
                            MaximumLength = int.TryParse(RawHelpers.ParseNull(dr["data_length"]), out int maxLen) ? maxLen : 0,
                            NumericPrecision = int.TryParse(RawHelpers.ParseNull(dr["data_precision"]), out int precision) ? precision : 0,
                            NumericScale = int.TryParse(RawHelpers.ParseNull(dr["data_scale"]), out int scale) ? scale : 0,
                            DefaultValue = RawHelpers.ParseNull(dr["data_default"])
                        });
                    }
                }
            }

            return ret;
        }

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
            RawHelpers.authenticate();
            List<bind_list> tblList = new List<bind_list>();
            string owner = NormalizeOwner(schema ?? db);

            foreach (string tb in GetOracleTables(connection, owner).OrderBy(x => x))
            {
                tblList.Add(new bind_list() { valore = tb, text = tb });
            }
            foreach (string vw in GetOracleViews(connection, owner).OrderBy(x => x))
            {
                tblList.Add(new bind_list() { valore = vw, text = vw + " [VISTA]" });
            }
            foreach (string sp in GetOracleStored(connection, owner).OrderBy(x => x))
            {
                tblList.Add(new bind_list() { valore = sp, text = sp + " [STORED]", isStored = true });
            }

            return RawHelpers.serialize(tblList, null);
        }

        public string getColumnsFromTable(string connection, string db, string table)
        {
            string uid = RawHelpers.authenticate();
            RawHelpers.checkAdmin(uid);

            ParseQualifiedDbObjectName(table, out string tableSchema, out string tableName);
            string owner = NormalizeOwner(tableSchema ?? db);

            List<bind_list> tblList = new List<bind_list>();
            string sql = string.IsNullOrEmpty(owner)
                ? "select column_name, data_type from user_tab_columns where table_name=@table order by column_id"
                : "select column_name, data_type from all_tab_columns where owner=@owner and table_name=@table order by column_id";
            using (DbConnection con = OracleProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, sql))
            {
                con.Open();
                if (!string.IsNullOrEmpty(owner))
                    DbProviderUtil.AddWithValue(cmd, "owner", owner);
                DbProviderUtil.AddWithValue(cmd, "table", tableName.ToUpperInvariant());

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
            string owner = NormalizeOwner(viewSchema ?? db);

            List<bind_list> tblList = new List<bind_list>();
            string sql = string.IsNullOrEmpty(owner)
                ? "select column_name, data_type from user_tab_columns where table_name=@table order by column_id"
                : "select column_name, data_type from all_tab_columns where owner=@owner and table_name=@table order by column_id";
            using (DbConnection con = OracleProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, sql))
            {
                con.Open();
                if (!string.IsNullOrEmpty(owner))
                    DbProviderUtil.AddWithValue(cmd, "owner", owner);
                DbProviderUtil.AddWithValue(cmd, "table", viewName.ToUpperInvariant());

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
            string owner = NormalizeOwner(db);
            using (DbConnection con = OracleProviderGateway.CreateOpenConnection(connection))
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
FROM ALL_TAB_COLUMNS c
LEFT JOIN (
    SELECT acc.TABLE_NAME, acc.COLUMN_NAME, ac.CONSTRAINT_NAME
    FROM ALL_CONSTRAINTS ac
    INNER JOIN ALL_CONS_COLUMNS acc ON ac.CONSTRAINT_NAME = acc.CONSTRAINT_NAME AND ac.OWNER = acc.OWNER
    WHERE ac.OWNER = @db AND ac.CONSTRAINT_TYPE = 'P'
) pk ON pk.TABLE_NAME = c.TABLE_NAME AND pk.COLUMN_NAME = c.COLUMN_NAME
LEFT JOIN (
    SELECT
        acc.TABLE_NAME,
        acc.COLUMN_NAME,
        ac.CONSTRAINT_NAME,
        rcc.TABLE_NAME as REFERENCED_TABLE_NAME,
        rcc.COLUMN_NAME as REFERENCED_COLUMN_NAME
    FROM ALL_CONSTRAINTS ac
    INNER JOIN ALL_CONS_COLUMNS acc ON ac.CONSTRAINT_NAME = acc.CONSTRAINT_NAME AND ac.OWNER = acc.OWNER
    INNER JOIN ALL_CONS_COLUMNS rcc ON ac.R_CONSTRAINT_NAME = rcc.CONSTRAINT_NAME AND ac.R_OWNER = rcc.OWNER AND acc.POSITION = rcc.POSITION
    WHERE ac.OWNER = @db AND ac.CONSTRAINT_TYPE = 'R'
) fk ON fk.TABLE_NAME = c.TABLE_NAME AND fk.COLUMN_NAME = c.COLUMN_NAME
WHERE c.OWNER = @db
ORDER BY c.TABLE_NAME, c.COLUMN_ID";
                DbProviderUtil.AddWithValue(cmd, "db", owner);

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
            using (DbConnection metaCon = OracleProviderGateway.GetOpenConnection(true))
            using (DbCommand metaCmd = metaCon.CreateCommand())
            {
                metaCmd.CommandText = @"
SELECT
    c.mc_id,
    c.mcrealcolumnname AS mc_real_column_name,
    t.md_nome_tabella
FROM _metadati__colonne c
INNER JOIN _metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mddbname = @db OR (@db = '' AND coalesce(t.mddbname, '') = '');";
                DbProviderUtil.AddWithValue(metaCmd, "db", owner);

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
                string owner = NormalizeOwner(db);
                List<string> tables = GetOracleTables(connection, owner);
                List<string> views = GetOracleViews(connection, owner);
                List<string> storeds = GetOracleStored(connection, owner);

                str.AppendLine(string.Format("Scaffolding {0} tables<br />", tables.Count));

                bool createM = createMenu;

                foreach (string tb in tables.OrderBy(x => x))
                {
                    createMenu = createM;

                    List<columnDefinition> columns = GetOracleColumns(connection, owner, tb, str);

                    foreach (columnDefinition col in columns)
                    {
                        mmd.scaffoldOfColumnMySql(connection, connName, mmd, tb, db, col, str, ref createMenu, columns.Count);
                    }
                }

                foreach (string vw in views.OrderBy(x => x))
                {
                    List<columnDefinition> columns = GetOracleColumns(connection, owner, vw, str);
                    foreach (columnDefinition col in columns)
                    {
                        mmd.scaffoldOfColumnMySql(connection, connName, mmd, vw, db, col, str, ref createMenu, columns.Count);
                    }
                }

                foreach (string sp in storeds.OrderBy(x => x))
                {
                    mmd.scaffoldOfStoredMySql(connection, connName, sp, mmd, str, owner);
                }

                RawHelpers.setMetadataVersion();
            }

            return new Dictionary<string, string>()
            {
                { "log", str.ToString() }
            };
        }

        // Backward-compatible signature.
        public string scaffoldColumn(string connection, string connName, string db, string table, string column)
        {
            return scaffoldColumnAsDictionary(connection, connName, db, table, column)["log"];
        }

        public Dictionary<string, string> scaffoldColumnAsDictionary(string connection, string connName, string db, string table, string column)
        {
            RawHelpers.authenticate();
            StringBuilder log = new StringBuilder();
            string owner = NormalizeOwner(db);
            ParseQualifiedDbObjectName(table, out string tableSchema, out string tableName);
            if (!string.IsNullOrWhiteSpace(tableSchema))
                owner = NormalizeOwner(tableSchema);

            using (metaRawModel mmd = new metaRawModel())
            {
                List<columnDefinition> columns = GetOracleColumns(connection, owner, tableName, log);
                columnDefinition col = columns.FirstOrDefault(x => string.Equals(x.Name, column, StringComparison.OrdinalIgnoreCase));
                if (col == null)
                    return new Dictionary<string, string>() { { "log", "Colonna non trovata" } };

                bool createMenu = false;
                mmd.scaffoldOfColumnMySql(connection, connName, mmd, tableName, owner, col, log, ref createMenu, columns.Count);
                return new Dictionary<string, string>()
                {
                    { "log", log.ToString() }
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
            RawHelpers.authenticate();
            StringBuilder log = new StringBuilder();
            string owner = NormalizeOwner(schema ?? db);
            ParseQualifiedDbObjectName(table, out string tableSchema, out string tableName);
            if (!string.IsNullOrWhiteSpace(tableSchema))
                owner = NormalizeOwner(tableSchema);

            using (metaRawModel mmd = new metaRawModel())
            {
                if (!GetOracleTables(connection, owner).Any(x => string.Equals(x, tableName, StringComparison.OrdinalIgnoreCase)))
                    return new Dictionary<string, string>() { { "log", "Tabella non trovata" } };

                List<columnDefinition> columns = GetOracleColumns(connection, owner, tableName, log);
                foreach (columnDefinition col in columns)
                    mmd.scaffoldOfColumnMySql(connection, connName, mmd, tableName, owner, col, log, ref createMenu, columns.Count);

                return new Dictionary<string, string>()
                {
                    { "log", log.ToString() }
                };
            }
        }

        // Backward-compatible signature.
        public string scaffoldView(string connection, string connName, string db, string view, bool createMenu)
        {
            return scaffoldView(connection, connName, db, view, createMenu, 0)["log"];
        }

        public Dictionary<string, string> scaffoldView(string connection, string connName, string db, string view, bool createMenu, int parentMenuId)
        {
            RawHelpers.authenticate();

            StringBuilder log = new StringBuilder();
            string owner = NormalizeOwner(db);
            ParseQualifiedDbObjectName(view, out string viewSchema, out string viewName);
            if (!string.IsNullOrWhiteSpace(viewSchema))
                owner = NormalizeOwner(viewSchema);

            using (metaRawModel mmd = new metaRawModel())
            {
                string viewT = GetOracleViews(connection, owner).FirstOrDefault(x => string.Equals(x, viewName, StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrEmpty(viewT))
                {
                    List<columnDefinition> columns = GetOracleColumns(connection, owner, viewT, log);
                    mmd.scaffoldOfViewMySql(connection, connName, viewT, mmd, log, owner, createMenu);

                    foreach (columnDefinition col in columns)
                    {
                        mmd.scaffoldOfColumnMySql(connection, connName, mmd, viewT, owner, col, log, ref createMenu, columns.Count);
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
                { "log", logg }
            };
        }

        // Backward-compatible signature.
        public string scaffoldStored(string connection, string connName, string db, string stored)
        {
            return scaffoldStored(connection, connName, db, stored, false, 0)["log"];
        }

        public Dictionary<string, string> scaffoldStored(string connection, string connName, string db, string stored, bool createMenu, int parentMenuId)
        {
            RawHelpers.authenticate();
            StringBuilder log = new StringBuilder();
            string owner = NormalizeOwner(db);

            using (metaRawModel mmd = new metaRawModel())
            {
                string storedName = GetOracleStored(connection, owner).FirstOrDefault(x => string.Equals(x, stored, StringComparison.OrdinalIgnoreCase));
                if (string.IsNullOrEmpty(storedName))
                    return new Dictionary<string, string>() { { "log", "Stored non trovata" } };

                mmd.scaffoldOfStoredMySql(connection, connName, storedName, mmd, log, owner);
                return new Dictionary<string, string>()
                {
                    { "log", log.ToString() }
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






