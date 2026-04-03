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
    public class PostgresScaffolding
    {
        private static string NormalizeSchema(string schemaOrDb)
        {
            return string.IsNullOrWhiteSpace(schemaOrDb) ? "public" : schemaOrDb.Trim();
        }

        private static List<string> GetPgTables(string connection, string schema)
        {
            var ret = new List<string>();
            using (DbConnection con = PostGresProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, "select table_name from information_schema.tables where table_schema=@schema and table_type='BASE TABLE' order by table_name"))
            {
                con.Open();
                DbProviderUtil.AddWithValue(cmd, "schema", schema);
                using (DbDataReader dr = cmd.ExecuteReader())
                {
                    while (dr.Read())
                        ret.Add(RawHelpers.ParseNull(dr[0]));
                }
            }

            return ret;
        }

        private static List<string> GetPgViews(string connection, string schema)
        {
            var ret = new List<string>();
            using (DbConnection con = PostGresProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, "select table_name from information_schema.views where table_schema=@schema order by table_name"))
            {
                con.Open();
                DbProviderUtil.AddWithValue(cmd, "schema", schema);
                using (DbDataReader dr = cmd.ExecuteReader())
                {
                    while (dr.Read())
                        ret.Add(RawHelpers.ParseNull(dr[0]));
                }
            }

            return ret;
        }

        private static List<string> GetPgStored(string connection, string schema)
        {
            var ret = new List<string>();
            using (DbConnection con = PostGresProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, "select routine_name from information_schema.routines where routine_schema=@schema order by routine_name"))
            {
                con.Open();
                DbProviderUtil.AddWithValue(cmd, "schema", schema);
                using (DbDataReader dr = cmd.ExecuteReader())
                {
                    while (dr.Read())
                        ret.Add(RawHelpers.ParseNull(dr[0]));
                }
            }

            return ret.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }

        private static List<columnDefinition> GetPgColumns(string connection, string schema, string tableName, StringBuilder log)
        {
            var ret = new List<columnDefinition>();
            using (DbConnection con = PostGresProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, @"
select
    column_name,
    data_type,
    is_nullable,
    coalesce(character_maximum_length,0) as max_length,
    coalesce(numeric_precision,0) as numeric_precision,
    coalesce(numeric_scale,0) as numeric_scale,
    column_default
from information_schema.columns
where table_schema=@schema and table_name=@table
order by ordinal_position"))
            {
                con.Open();
                DbProviderUtil.AddWithValue(cmd, "schema", schema);
                DbProviderUtil.AddWithValue(cmd, "table", tableName);
                using (DbDataReader dr = cmd.ExecuteReader())
                {
                    while (dr.Read())
                    {
                        ret.Add(new columnDefinition()
                        {
                            Name = RawHelpers.ParseNull(dr["column_name"]),
                            DataType = RawHelpers.ParseNull(dr["data_type"]),
                            Nullable = RawHelpers.ParseNull(dr["is_nullable"]).Equals("YES", StringComparison.OrdinalIgnoreCase),
                            MaximumLength = int.TryParse(RawHelpers.ParseNull(dr["max_length"]), out int maxLen) ? maxLen : 0,
                            NumericPrecision = int.TryParse(RawHelpers.ParseNull(dr["numeric_precision"]), out int precision) ? precision : 0,
                            NumericScale = int.TryParse(RawHelpers.ParseNull(dr["numeric_scale"]), out int scale) ? scale : 0,
                            DefaultValue = RawHelpers.ParseNull(dr["column_default"])
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
            string effectiveSchema = NormalizeSchema(schema ?? db);

            foreach (string tb in GetPgTables(connection, effectiveSchema).OrderBy(x => x))
            {
                tblList.Add(new bind_list() { valore = tb, text = tb });
            }

            foreach (string vw in GetPgViews(connection, effectiveSchema).OrderBy(x => x))
            {
                tblList.Add(new bind_list() { valore = vw, text = vw + " [VISTA]" });
            }

            foreach (string sp in GetPgStored(connection, effectiveSchema).OrderBy(x => x))
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
            string effectiveSchema = NormalizeSchema(tableSchema ?? db);

            List<bind_list> tblList = new List<bind_list>();
            using (DbConnection con = PostGresProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, "select column_name, data_type from information_schema.columns where table_schema=@schema and table_name=@table order by ordinal_position"))
            {
                con.Open();
                DbProviderUtil.AddWithValue(cmd, "schema", effectiveSchema);
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
            string effectiveSchema = NormalizeSchema(viewSchema ?? db);

            List<bind_list> tblList = new List<bind_list>();
            using (DbConnection con = PostGresProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, "select column_name, data_type from information_schema.columns where table_schema=@schema and table_name=@table order by ordinal_position"))
            {
                con.Open();
                DbProviderUtil.AddWithValue(cmd, "schema", effectiveSchema);
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
            string effectiveSchema = NormalizeSchema(db);
            using (DbConnection con = PostGresProviderGateway.CreateOpenConnection(connection))
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
    SELECT
        kcu.table_name,
        kcu.column_name,
        tc.constraint_name,
        ccu.table_name as referenced_table_name,
        ccu.column_name as referenced_column_name
    FROM information_schema.table_constraints tc
    inner join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    inner join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = @db AND tc.constraint_type = 'FOREIGN KEY'
) fk ON fk.TABLE_NAME = c.TABLE_NAME AND fk.COLUMN_NAME = c.COLUMN_NAME
WHERE c.TABLE_SCHEMA = @db
ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION;";
                DbProviderUtil.AddWithValue(cmd, "db", effectiveSchema);

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
            using (DbConnection metaCon = PostGresProviderGateway.GetOpenConnection(true))
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
                DbProviderUtil.AddWithValue(metaCmd, "db", effectiveSchema);

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
                string effectiveSchema = NormalizeSchema(db);
                List<string> tables = GetPgTables(connection, effectiveSchema);
                List<string> views = GetPgViews(connection, effectiveSchema);
                List<string> storeds = GetPgStored(connection, effectiveSchema);

                str.AppendLine(string.Format("Scaffolding {0} tables<br />", tables.Count));

                bool createM = createMenu;

                foreach (string tb in tables.OrderBy(x => x))
                {
                    createMenu = createM;

                    if (tb == "test" || tb == "information_schema")
                        continue;

                    List<columnDefinition> columns = GetPgColumns(connection, effectiveSchema, tb, str);

                    foreach (columnDefinition col in columns)
                    {
                        mmd.scaffoldOfColumnMySql(connection, connName, mmd, tb, db, col, str, ref createMenu, columns.Count);
                    }
                }

                foreach (string vw in views.OrderBy(x => x))
                {
                    List<columnDefinition> columns = GetPgColumns(connection, effectiveSchema, vw, str);
                    foreach (columnDefinition col in columns)
                    {
                        mmd.scaffoldOfColumnMySql(connection, connName, mmd, vw, db, col, str, ref createMenu, columns.Count);
                    }
                }

                foreach (string sp in storeds.OrderBy(x => x))
                {
                    mmd.scaffoldOfStoredMySql(connection, connName, sp, mmd, str, effectiveSchema);
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
            string effectiveSchema = NormalizeSchema(db);
            ParseQualifiedDbObjectName(table, out string tableSchema, out string tableName);
            if (!string.IsNullOrWhiteSpace(tableSchema))
                effectiveSchema = NormalizeSchema(tableSchema);

            using (metaRawModel mmd = new metaRawModel())
            {
                List<columnDefinition> columns = GetPgColumns(connection, effectiveSchema, tableName, log);
                columnDefinition col = columns.FirstOrDefault(x => string.Equals(x.Name, column, StringComparison.OrdinalIgnoreCase));
                if (col == null)
                    return new Dictionary<string, string>() { { "log", "Colonna non trovata" } };

                bool createMenu = false;
                mmd.scaffoldOfColumnMySql(connection, connName, mmd, tableName, effectiveSchema, col, log, ref createMenu, columns.Count);
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
            string effectiveSchema = NormalizeSchema(schema ?? db);
            ParseQualifiedDbObjectName(table, out string tableSchema, out string tableName);
            if (!string.IsNullOrWhiteSpace(tableSchema))
                effectiveSchema = NormalizeSchema(tableSchema);

            using (metaRawModel mmd = new metaRawModel())
            {
                if (!GetPgTables(connection, effectiveSchema).Any(x => string.Equals(x, tableName, StringComparison.OrdinalIgnoreCase)))
                    return new Dictionary<string, string>() { { "log", "Tabella non trovata" } };

                List<columnDefinition> columns = GetPgColumns(connection, effectiveSchema, tableName, log);
                foreach (columnDefinition col in columns)
                    mmd.scaffoldOfColumnMySql(connection, connName, mmd, tableName, effectiveSchema, col, log, ref createMenu, columns.Count);

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
            string effectiveSchema = NormalizeSchema(db);
            ParseQualifiedDbObjectName(view, out string viewSchema, out string viewName);
            if (!string.IsNullOrWhiteSpace(viewSchema))
                effectiveSchema = NormalizeSchema(viewSchema);

            using (metaRawModel mmd = new metaRawModel())
            {
                string viewT = GetPgViews(connection, effectiveSchema).FirstOrDefault(x => string.Equals(x, viewName, StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrEmpty(viewT))
                {
                    List<columnDefinition> columns = GetPgColumns(connection, effectiveSchema, viewT, log);
                    mmd.scaffoldOfViewMySql(connection, connName, viewT, mmd, log, effectiveSchema, createMenu);

                    foreach (columnDefinition col in columns)
                    {
                        mmd.scaffoldOfColumnMySql(connection, connName, mmd, viewT, effectiveSchema, col, log, ref createMenu, columns.Count);
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
            string effectiveSchema = NormalizeSchema(db);

            using (metaRawModel mmd = new metaRawModel())
            {
                string storedName = GetPgStored(connection, effectiveSchema).FirstOrDefault(x => string.Equals(x, stored, StringComparison.OrdinalIgnoreCase));
                if (string.IsNullOrEmpty(storedName))
                    return new Dictionary<string, string>() { { "log", "Stored non trovata" } };

                mmd.scaffoldOfStoredMySql(connection, connName, storedName, mmd, log, effectiveSchema);
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






