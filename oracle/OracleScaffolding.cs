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
                : "select table_name from all_tables where owner=:owner order by table_name";
            using (DbConnection con = OracleProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, sql))
            {
                // CreateOpenConnection gia' apre la connection — Open() di nuovo qui causa ORA-50005.
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
                : "select view_name from all_views where owner=:owner order by view_name";
            using (DbConnection con = OracleProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, sql))
            {
                // CreateOpenConnection gia' apre la connection — Open() di nuovo qui causa ORA-50005.
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
                : "select object_name from all_procedures where owner=:owner and object_type in ('PROCEDURE','FUNCTION') order by object_name";
            using (DbConnection con = OracleProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, sql))
            {
                // CreateOpenConnection gia' apre la connection — Open() di nuovo causa ORA-50005.
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
            // LEFT JOIN su ALL_CONSTRAINTS + ALL_CONS_COLUMNS per popolare InPrimaryKey + Identity. Mirror task #66 PG.
            string sql = string.IsNullOrEmpty(owner)
                ? @"select c.column_name, c.data_type, c.nullable, c.data_default, c.data_length, c.data_precision, c.data_scale,
                           c.identity_column,
                           case when pkcols.column_name is not null then 'YES' else 'NO' end as is_primary_key
                    from user_tab_columns c
                    left join (
                        select acc.column_name
                        from user_constraints ac
                        join user_cons_columns acc on acc.constraint_name = ac.constraint_name
                        where ac.constraint_type = 'P'
                          and ac.table_name = :tbl
                    ) pkcols on pkcols.column_name = c.column_name
                    where c.table_name=:tbl
                    order by c.column_id"
                : @"select c.column_name, c.data_type, c.nullable, c.data_default, c.data_length, c.data_precision, c.data_scale,
                           c.identity_column,
                           case when pkcols.column_name is not null then 'YES' else 'NO' end as is_primary_key
                    from all_tab_columns c
                    left join (
                        select acc.column_name
                        from all_constraints ac
                        join all_cons_columns acc on acc.constraint_name = ac.constraint_name and acc.owner = ac.owner
                        where ac.constraint_type = 'P'
                          and ac.owner = :owner
                          and ac.table_name = :tbl
                    ) pkcols on pkcols.column_name = c.column_name
                    where c.owner=:owner and c.table_name=:tbl
                    order by c.column_id";
            using (DbConnection con = OracleProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, sql))
            {
                // CreateOpenConnection gia' apre la connection — Open() di nuovo causa ORA-50005.
                if (!string.IsNullOrEmpty(owner))
                    DbProviderUtil.AddWithValue(cmd, "owner", owner);
                // NIENTE ToUpperInvariant(): all_tables.table_name conserva il case esatto come e' stato
                // creato l'identifier — gli identifier creati quoted lowercase (es. "_e2e_callbacks_demo",
                // obbligatorio per nomi con leading underscore) restano lowercase. Il dropdown 'table' a
                // monte e' popolato da GetOracleTables che fa SELECT table_name FROM all_tables WHERE owner=...
                // quindi il valore arriva qui gia' as-stored: usarlo tal quale (Oracle e' case-sensitive
                // sui valori, non sugli unquoted identifier).
                DbProviderUtil.AddWithValue(cmd, "tbl", tableName);
                using (DbDataReader dr = cmd.ExecuteReader())
                {
                    while (dr.Read())
                    {
                        string defaultVal = RawHelpers.ParseNull(dr["data_default"]);
                        bool isIdentity = RawHelpers.ParseNull(dr["identity_column"]).Equals("YES", StringComparison.OrdinalIgnoreCase);
                        bool isPk = RawHelpers.ParseNull(dr["is_primary_key"]).Equals("YES", StringComparison.OrdinalIgnoreCase);
                        bool isSequenceDefault = !string.IsNullOrEmpty(defaultVal) && defaultVal.IndexOf(".nextval", StringComparison.OrdinalIgnoreCase) >= 0;

                        ret.Add(new columnDefinition()
                        {
                            Name = RawHelpers.ParseNull(dr["column_name"]),
                            DataType = RawHelpers.ParseNull(dr["data_type"]),
                            Nullable = RawHelpers.ParseNull(dr["nullable"]).Equals("Y", StringComparison.OrdinalIgnoreCase),
                            MaximumLength = int.TryParse(RawHelpers.ParseNull(dr["data_length"]), out int maxLen) ? maxLen : 0,
                            NumericPrecision = int.TryParse(RawHelpers.ParseNull(dr["data_precision"]), out int precision) ? precision : 0,
                            NumericScale = int.TryParse(RawHelpers.ParseNull(dr["data_scale"]), out int scale) ? scale : 0,
                            DefaultValue = defaultVal,
                            InPrimaryKey = isPk,
                            Identity = isIdentity || (isPk && isSequenceDefault)
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
                ? "select column_name, data_type from user_tab_columns where table_name=:tbl order by column_id"
                : "select column_name, data_type from all_tab_columns where owner=:owner and table_name=:tbl order by column_id";
            using (DbConnection con = OracleProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, sql))
            {
                // CreateOpenConnection gia' apre la connection — Open() di nuovo causa ORA-50005.
                if (!string.IsNullOrEmpty(owner))
                    DbProviderUtil.AddWithValue(cmd, "owner", owner);
                // NIENTE ToUpperInvariant(): all_tables.table_name conserva il case esatto come e' stato
                // creato l'identifier — gli identifier creati quoted lowercase (es. "_e2e_callbacks_demo",
                // obbligatorio per nomi con leading underscore) restano lowercase. Il dropdown 'table' a
                // monte e' popolato da GetOracleTables che fa SELECT table_name FROM all_tables WHERE owner=...
                // quindi il valore arriva qui gia' as-stored: usarlo tal quale (Oracle e' case-sensitive
                // sui valori, non sugli unquoted identifier).
                DbProviderUtil.AddWithValue(cmd, "tbl", tableName);

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
                ? "select column_name, data_type from user_tab_columns where table_name=:tbl order by column_id"
                : "select column_name, data_type from all_tab_columns where owner=:owner and table_name=:tbl order by column_id";
            using (DbConnection con = OracleProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, sql))
            {
                // CreateOpenConnection gia' apre la connection — Open() di nuovo causa ORA-50005.
                if (!string.IsNullOrEmpty(owner))
                    DbProviderUtil.AddWithValue(cmd, "owner", owner);
                // As-stored, vedi commento analogo in GetOracleColumns: all_views.view_name e' case-preserved.
                DbProviderUtil.AddWithValue(cmd, "tbl", viewName);

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
    WHERE ac.OWNER = :db AND ac.CONSTRAINT_TYPE = 'P'
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
    WHERE ac.OWNER = :db AND ac.CONSTRAINT_TYPE = 'R'
) fk ON fk.TABLE_NAME = c.TABLE_NAME AND fk.COLUMN_NAME = c.COLUMN_NAME
WHERE c.OWNER = :db
ORDER BY c.TABLE_NAME, c.COLUMN_ID";
                DbProviderUtil.AddWithValue(cmd, "db", owner);

                // CreateOpenConnection gia' apre la connection — Open() di nuovo causa ORA-50005.
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
WHERE t.mddbname = :db OR (:db = '' AND coalesce(t.mddbname, '') = '');";
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
                        scaffoldOfColumnOracle(connection, connName, mmd, tb, db, col, str, ref createMenu, columns.Count);
                    }
                }

                foreach (string vw in views.OrderBy(x => x))
                {
                    List<columnDefinition> columns = GetOracleColumns(connection, owner, vw, str);
                    foreach (columnDefinition col in columns)
                    {
                        scaffoldOfColumnOracle(connection, connName, mmd, vw, db, col, str, ref createMenu, columns.Count);
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
                    return new Dictionary<string, string>() { { "message", "Colonna non trovata" }, { "log", "Colonna non trovata" } };

                bool createMenu = false;
                scaffoldOfColumnOracle(connection, connName, mmd, tableName, owner, col, log, ref createMenu, columns.Count);
                // Shape parity con MSSQL/PG: il frontend `Scaffold Table` callback in metadata
                // legge `postResults.message` (vedi _mtdt__cstom__actions__tabelle); PG include
                // sia "message" sia "log", Oracle deve fare uguale altrimenti il dialog mostra
                // un info-icon vuoto. Niente breaking change: i caller CLI/test che leggono
                // "log" continuano a funzionare.
                string logText = log.ToString();
                return new Dictionary<string, string>()
                {
                    { "message", logText },
                    { "log", logText }
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

            // Mirror task #77/78 PG: resolve from connName when caller passes empty.
            if (string.IsNullOrWhiteSpace(connection))
            {
                string resolvedConnName = string.IsNullOrWhiteSpace(connName) ? "DataSQLConnection" : connName;
                connection = ConfigHelper.ResolveConnectionString(resolvedConnName);
            }

            using (metaRawModel mmd = new metaRawModel())
            {
                if (!GetOracleTables(connection, owner).Any(x => string.Equals(x, tableName, StringComparison.OrdinalIgnoreCase)))
                    return new Dictionary<string, string>() { { "message", "Tabella non trovata" }, { "log", "Tabella non trovata" } };

                List<columnDefinition> columns = GetOracleColumns(connection, owner, tableName, log);
                foreach (columnDefinition col in columns)
                    scaffoldOfColumnOracle(connection, connName, mmd, tableName, owner, col, log, ref createMenu, columns.Count);

                // Cache invalidation post-scaffold: senza questa chiamata la nuova route
                // resta invisibile al runtime (cache `storedTableMeta` / `storedMeta`
                // Application-scoped restano stale). Sintomo: navigare `/<route>/list`
                // subito dopo scaffold mostra "Route X non trovata nei metadata", e
                // anche logout/login non bastano — solo un restart del backend la trova.
                // `InvalidateMetadataCachesAndSetVersion(true)` fa:
                //   1) DB version bump (sys_info.projectmetadataversion)
                //   2) clearMetas(true) → svuota tables/columns caches in-memory
                //   3) clear users/roles/companies/auth restrictions caches
                // Mirror del comportamento canonico (vedi `MetaService.invalidateMetadataRuntime`).
                RawHelpers.InvalidateMetadataCachesAndSetVersion(clearAllMetadata: true);

                // Shape parity con MSSQL/PG: il frontend `Scaffold Table` callback in metadata
                // legge `postResults.message` (vedi _mtdt__cstom__actions__tabelle); PG include
                // sia "message" sia "log", Oracle deve fare uguale altrimenti il dialog mostra
                // un info-icon vuoto. Niente breaking change: i caller CLI/test che leggono
                // "log" continuano a funzionare.
                string logText = log.ToString();

                // Recupera l'md_id della tabella scaffoldata per ritornarlo al caller.
                // Contract atteso da MetaService.ScaffoldTableForDbms / consumer pivot-builder:
                // Dictionary contiene chiave "id" con l'md_id (MSSQL impl mirror, riga 1719 di
                // metaModelRaw.cs; PG mirror in PostgresScaffolding.cs). Senza questo, il
                // pivot-builder logga "Schedulazione non creata: md_id della tabella non risolto
                // dopo scaffolding" e l'auto-scheduler post-pivot non viene mai creato.
                // Route name derivato via RawHelpers.getRouteName (snake-case lowercased) per
                // matchare quello salvato da scaffoldOfTableMySql al primo scaffoldOfColumnMySql.
                string scaffoldedRoute = RawHelpers.getRouteName(tableName);
                _Metadati_Tabelle scaffoldedTable = mmd.GetMetadati_Tabelles(scaffoldedRoute).FirstOrDefault();
                string scaffoldedId = scaffoldedTable != null ? scaffoldedTable.md_id.ToString() : string.Empty;

                return new Dictionary<string, string>()
                {
                    { "message", logText },
                    { "log", logText },
                    { "id", scaffoldedId }
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
                        scaffoldOfColumnOracle(connection, connName, mmd, viewT, owner, col, log, ref createMenu, columns.Count);
                        createMenu = false;
                    }
                }
            }

            string logg = log.ToString();
            if (string.IsNullOrEmpty(logg))
                logg = "Nessuna nuova colonna";

            // Full cache invalidation post-scaffold (vedi commento in scaffoldTable).
            RawHelpers.InvalidateMetadataCachesAndSetVersion(clearAllMetadata: true);

            // Shape parity con MSSQL/PG (vedi commento in scaffoldTable).
            return new Dictionary<string, string>()
            {
                { "message", logg },
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

            // Mirror task #77/78 PG: resolve from connName when caller passes empty.
            if (string.IsNullOrWhiteSpace(connection))
            {
                string resolvedConnName = string.IsNullOrWhiteSpace(connName) ? "DataSQLConnection" : connName;
                connection = ConfigHelper.ResolveConnectionString(resolvedConnName);
            }

            using (metaRawModel mmd = new metaRawModel())
            {
                string storedName = GetOracleStored(connection, owner).FirstOrDefault(x => string.Equals(x, stored, StringComparison.OrdinalIgnoreCase));
                if (string.IsNullOrEmpty(storedName))
                    return new Dictionary<string, string>() { { "message", "Stored non trovata" }, { "log", "Stored non trovata" } };

                mmd.scaffoldOfStoredMySql(connection, connName, storedName, mmd, log, owner);

                // Full cache invalidation post-scaffold (vedi commento in scaffoldTable).
                RawHelpers.InvalidateMetadataCachesAndSetVersion(clearAllMetadata: true);

                // Shape parity con MSSQL/PG: il frontend `Scaffold Table` callback in metadata
                // legge `postResults.message` (vedi _mtdt__cstom__actions__tabelle); PG include
                // sia "message" sia "log", Oracle deve fare uguale altrimenti il dialog mostra
                // un info-icon vuoto. Niente breaking change: i caller CLI/test che leggono
                // "log" continuano a funzionare.
                string logText = log.ToString();
                return new Dictionary<string, string>()
                {
                    { "message", logText },
                    { "log", logText }
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

        // ============================================================
        // Oracle-native COLUMN scaffolder (Fase A — 2026-05-28)
        // ============================================================
        //
        // Sostituisce le 5 chiamate a `mmd.scaffoldOfColumnMySql(...)` in
        // questo file. Quel metodo shared in metaModelRaw.cs e' MySQL-centric:
        // `RawHelpers.getDBDataType` (Helpers.cs:3044) e' case-sensitive e
        // riconosce solo i type-name MySQL lowercase. Tutti i type-name che
        // Oracle ritorna da `all_tab_columns.data_type` sono UPPERCASE e
        // diversi:
        //   - `NUMBER`/`NUMBER(p,s)`         vs MySQL `int`/`decimal`
        //   - `VARCHAR2`/`NVARCHAR2`         vs MySQL `varchar`
        //   - `DATE`                         (Oracle DATE include time!)
        //   - `TIMESTAMP(N)`/`TIMESTAMP(N) WITH (LOCAL) TIME ZONE` vs `datetime`
        //   - `CLOB`/`NCLOB`                 vs MySQL `text`
        //   - `BLOB`/`RAW`                   vs MySQL `blob`/`binary`
        //   - `BINARY_FLOAT`/`BINARY_DOUBLE` vs MySQL `float`/`double`
        // Tutti cadevano nel default → `varchar` → UI `text`, rompendo
        // number/datetime widgets per qualunque tabella Oracle scaffoldata
        // via API.
        //
        // Specificita' Oracle:
        //   1. `DATE` mappa a `datetime` (NON `date`): in Oracle DATE include
        //      sempre ora/minuti/secondi; non c'e' un date-only type nativo.
        //   2. `NUMBER` senza precision/scale (default) mappa a `decimal`
        //      (safer di `int`); `NUMBER(p,0)` mappa a `int`; `NUMBER(p,s)`
        //      con s>0 mappa a `decimal`.
        //   3. Oracle pre-23c non ha BOOLEAN nativo: convenzionalmente si usa
        //      `NUMBER(1)` con 0/1. Lo lasciamo come `int` (UI number) — chi
        //      vuole boolean UI deve patchare md_ui_column_type manualmente.
        //
        // `scaffoldOfTableMySql` resta usato (logica `_metadati__tabelle`
        // row + menu opzionale e' provider-agnostica, promosso a
        // `public static` 2026-05-28 nello stesso commit).
        // ============================================================

        /// <summary>
        /// Maps an Oracle raw `data_type` (from `all_tab_columns.data_type`)
        /// to a canonical type token consumed by
        /// <see cref="SetTypeFromOracleColumn"/>. The `precision`/`scale`
        /// hint is used for NUMBER classification (precision=0, scale=0
        /// means unconstrained NUMBER; scale=0 with precision>0 is integer;
        /// scale>0 is decimal).
        /// </summary>
        private static string GetOracleCanonicalType(string oracleRawType, int precision, int scale)
        {
            if (string.IsNullOrEmpty(oracleRawType)) return "varchar";
            // Trim type-parameters: "TIMESTAMP(6)" → "TIMESTAMP",
            // "NVARCHAR2(200)" → "NVARCHAR2", "INTERVAL DAY(2) TO SECOND(6)"
            // → "INTERVAL DAY TO SECOND".
            string t = oracleRawType.Trim().ToUpperInvariant();
            int paren = t.IndexOf('(');
            string typeOnly = paren > 0 ? t.Substring(0, paren).Trim() : t;
            // Re-attach trailing "WITH TIME ZONE" suffix that arrives separately.
            string suffix = paren > 0 && t.Length > paren ? t.Substring(t.LastIndexOf(')') + 1).Trim() : "";

            // NUMBER classification: integer if scale==0, decimal otherwise.
            if (typeOnly == "NUMBER")
            {
                if (scale > 0) return "decimal";
                // scale==0 with precision==0 = unconstrained NUMBER; treat as
                // decimal for safety (it could hold non-integers in practice).
                if (precision == 0) return "decimal";
                return "int";
            }

            switch (typeOnly)
            {
                // Oracle 22+ INTEGER alias → integer
                case "INTEGER":
                case "SMALLINT":
                    return "int";

                case "FLOAT":
                case "BINARY_FLOAT":
                case "BINARY_DOUBLE":
                case "DOUBLE PRECISION":
                case "REAL":
                    return "float";

                // character family
                case "VARCHAR2":
                case "VARCHAR":
                case "NVARCHAR2":
                case "CHAR":
                case "NCHAR":
                    return "varchar";

                case "CLOB":
                case "NCLOB":
                case "LONG":
                    return "text";

                case "XMLTYPE":
                    return "xml";

                // date/time family — Oracle quirk: DATE includes time
                case "DATE":
                    return "datetime";

                case "TIMESTAMP":
                    // TIMESTAMP / TIMESTAMP(N) / TIMESTAMP(N) WITH (LOCAL) TIME ZONE
                    // tutti mappano a `datetime`. Il suffisso "WITH TIME ZONE"
                    // o "WITH LOCAL TIME ZONE" non cambia la classificazione UI.
                    return "datetime";

                case "INTERVAL DAY TO SECOND":
                case "INTERVAL YEAR TO MONTH":
                    // No first-class UI widget for INTERVAL; treat as text.
                    return "varchar";

                case "RAW":
                case "LONG RAW":
                case "BLOB":
                case "BFILE":
                    return "binary";

                case "ROWID":
                case "UROWID":
                    return "varchar";

                // Spatial types (SDO_GEOMETRY) arrive as the type name
                case "SDO_GEOMETRY":
                    return "geometry";

                default:
                    // Unknown / user-defined object types → fall back to varchar.
                    // (PG had the same default for ENUM USER-DEFINED.)
                    return "varchar";
            }
        }

        /// <summary>
        /// Applies the canonical type → `mc_ui_column_type` mapping and
        /// appends the column row to the model. Mirrors PG's
        /// SetTypeFromPostgresColumn (includes `datetime` case, missing in
        /// the MySQL-centric shared switch).
        /// </summary>
        private static void SetTypeFromOracleColumn(metaRawModel mm, columnDefinition col, _Metadati_Colonne cm, string canonical)
        {
            switch (canonical)
            {
                case "varchar":
                    cm.mc_default_value = col.DefaultValue;
                    cm.mc_ui_column_type = "text";
                    if (col.MaximumLength > 0)
                        cm.mc_max_length = col.MaximumLength;
                    mm.AddColonna(cm);
                    break;

                case "text":
                case "xml":
                    cm.mc_default_value = col.DefaultValue;
                    cm.mc_ui_column_type = "txt_area";
                    if (canonical == "xml")
                        cm.mc_disable_sorting = true;
                    mm.AddColonna(cm);
                    break;

                case "binary":
                    cm.mc_default_value = col.DefaultValue;
                    cm.mc_ui_column_type = "txt_area";
                    cm.mc_hide_in_list = true;
                    cm.mc_hide_in_edit = true;
                    cm.mc_logic_editable = false;
                    mm.AddColonna(cm);
                    break;

                case "int":
                    {
                        cm.mc_default_value = col.DefaultValue;
                        cm.mc_ui_column_type = "number";
                        _Metadati_Colonne_Slider numCol = new _Metadati_Colonne_Slider();
                        RawHelpers.cloneToChild(cm, numCol);
                        numCol.mc_ui_slider_decimals = 0;
                        numCol.mc_ui_slider_format = "N";
                        mm.AddColonna(numCol);
                    }
                    break;

                case "decimal":
                    {
                        cm.mc_default_value = col.DefaultValue;
                        cm.mc_ui_column_type = "number";
                        _Metadati_Colonne_Slider numCol = new _Metadati_Colonne_Slider();
                        RawHelpers.cloneToChild(cm, numCol);
                        // Oracle NUMBER without explicit scale → use 4 decimals as
                        // a reasonable default (mirrors PG `numeric` default).
                        numCol.mc_ui_slider_decimals = (short)(col.NumericScale > 0 ? col.NumericScale : 4);
                        numCol.mc_ui_slider_format = "N";
                        mm.AddColonna(numCol);
                    }
                    break;

                case "float":
                    {
                        cm.mc_default_value = col.DefaultValue;
                        cm.mc_ui_column_type = "number";
                        cm.mc_db_column_type = "float";
                        _Metadati_Colonne_Slider numCol = new _Metadati_Colonne_Slider();
                        RawHelpers.cloneToChild(cm, numCol);
                        numCol.mc_ui_slider_decimals = 4;
                        numCol.mc_ui_slider_format = "N";
                        mm.AddColonna(numCol);
                    }
                    break;

                case "date":
                    // (Not used for Oracle — DATE maps to "datetime" — but kept
                    // for forward compat if a future provider emits "date".)
                    cm.mc_default_value = col.DefaultValue;
                    cm.mc_ui_column_type = "date";
                    mm.AddColonna(cm);
                    break;

                case "datetime":
                    cm.mc_default_value = col.DefaultValue;
                    cm.mc_ui_column_type = "datetime";
                    mm.AddColonna(cm);
                    break;

                case "time":
                    cm.mc_default_value = col.DefaultValue;
                    cm.mc_ui_column_type = "time";
                    mm.AddColonna(cm);
                    break;

                case "geometry":
                    cm.mc_ui_column_type = "polygon";
                    mm.AddColonna(cm);
                    break;

                default:
                    cm.mc_default_value = col.DefaultValue;
                    cm.mc_ui_column_type = "text";
                    mm.AddColonna(cm);
                    break;
            }
        }

        /// <summary>
        /// Oracle-native equivalent of metaRawModel.scaffoldOfColumnMySql.
        /// Same control flow (table ensure + alias + PK detection + _Metadati_Colonne
        /// row + type mapping), but type-mapping uses
        /// <see cref="GetOracleCanonicalType"/> + <see cref="SetTypeFromOracleColumn"/>
        /// instead of the MySQL-centric RawHelpers.getDBDataType +
        /// setTypeFromSMOColumnMySql.
        /// </summary>
        public static string scaffoldOfColumnOracle(
            string connection,
            string connName,
            metaRawModel mm,
            string table,
            string db,
            columnDefinition column,
            StringBuilder log,
            ref bool createMenu,
            int colCount,
            List<columnDefinition> columns = null)
        {
            RawHelpers.authenticate();
            _Metadati_Tabelle md = metaRawModel.scaffoldOfTableMySql(connection, connName, table, mm, log, db, ref createMenu, column.InPrimaryKey);

            string column_name = column.Name;
            string alias = RawHelpers.getValidColumnName(column.Name);

            System.Text.RegularExpressions.Regex rgx = new System.Text.RegularExpressions.Regex("^[0-9].*$");
            if (rgx.IsMatch(alias))
                alias = "C" + alias;

            string aliasLower = alias.ToLowerInvariant();
            if (aliasLower == "data" || aliasLower == "row" || aliasLower == "default" || aliasLower == RawHelpers.getRouteName(table))
            {
                alias = alias + "_field";
            }

            _Metadati_Colonne cm = mm.GetMetadati_ColonnesForScaffolding(alias, table, md.md_route_name).FirstOrDefault();
            if (cm != null)
                return "Colonna esistente";

            bool mc_is_primary_key = column.InPrimaryKey;
            bool mc_hide_in_edit = mc_is_primary_key;
            bool mc_hide_in_list = mc_is_primary_key;
            bool mc_logic_editable = !mc_is_primary_key;

            if (column.Identity)
            {
                mc_hide_in_edit = true;
                mc_logic_editable = false;
            }

            string canonical = GetOracleCanonicalType(column.DataType, column.NumericPrecision, column.NumericScale);

            // PK type detection. Oracle 12c+ supports `GENERATED [ALWAYS|BY DEFAULT]
            // AS IDENTITY` → identity_column='YES' in all_tab_columns; older code
            // uses SEQUENCE + trigger or .NEXTVAL default. GetOracleColumns marks
            // both as Identity=true. Integer PK without identity falls back to
            // "MAX" pattern (SELECT MAX(id)+1).
            if (mc_is_primary_key)
            {
                if (column.Identity)
                {
                    md.md_primary_key_type = "IDENTITY";
                }
                else if (canonical == "int")
                {
                    if (columns != null && columns.Count(x => x.InPrimaryKey) > 1)
                    {
                        mc_hide_in_edit = false;
                        mc_hide_in_list = false;
                        mc_logic_editable = true;
                        md.md_primary_key_type = "";
                    }
                    else
                    {
                        if (columns == null || !columns.Any(x => x.Identity))
                            md.md_primary_key_type = "MAX";
                        else
                        {
                            mc_hide_in_edit = false;
                            mc_hide_in_list = false;
                            mc_logic_editable = true;
                        }
                    }
                }
                else
                {
                    mc_hide_in_edit = false;
                    mc_hide_in_list = false;
                    mc_logic_editable = true;
                    if (columns == null || !columns.Any(x => x.Identity))
                        md.md_primary_key_type = "";
                }

                mm.UpdateTabella(md);
            }

            int mc_ordine = 1;
            if (md._Metadati_Colonnes.Count > 0)
                mc_ordine = md._Metadati_Colonnes.Max(x => x.mc_ordine).Value + 10;

            bool mc_validation_required = !column.Nullable;
            bool mc_has_validation = mc_validation_required;
            string mc_required_err_msg = mc_validation_required ? "Campo obbligatorio" : "";

            string friendlyName = RawHelpers.getDisplayName(column_name);

            cm = new _Metadati_Colonne()
            {
                mc_db_column_type = canonical,
                mc_nome_colonna = alias,
                mc_real_column_name = column_name,
                mc_display_string_in_edit = friendlyName,
                mc_display_string_in_view = friendlyName,
                mc_hide_in_edit = mc_hide_in_edit,
                mc_hide_in_list = mc_hide_in_list,
                mc_is_primary_key = mc_is_primary_key,
                mc_is_range_filter = false,
                mc_logic_converter_has = false,
                mc_logic_editable = mc_logic_editable,
                mc_logic_nullable = true,
                mc_ordine = mc_ordine,
                mc_show_in_filters = false,
                mc_validation_has = mc_has_validation,
                mc_validation_required = mc_validation_required,
                mc_validation_message = mc_required_err_msg,
                md_id = md.md_id,
                mc_grant_by_default = true
            };

            if (colCount >= 20)
                cm.mc_ui_grid_size_width = 50;
            else if (colCount >= 10)
                cm.mc_ui_grid_size_width = 100;

            SetTypeFromOracleColumn(mm, column, cm, canonical);

            log.AppendLine(string.Format("Added column '{0}' of Table '{1}'<br />", column_name, table));
            return "";
        }
    }
}






