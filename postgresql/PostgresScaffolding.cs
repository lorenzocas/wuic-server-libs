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
                // CreateOpenConnection ha gia' fatto Open(); evitiamo doppio Open (errore Npgsql).
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
                // CreateOpenConnection ha gia' fatto Open(); evitiamo doppio Open (errore Npgsql).
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
            // Solo function/procedure UTENTE: esclude le funzioni di EXTENSION (postgis &
            // co. -> centinaia di routine in `public`, NON storeds applicativi) via pg_depend
            // deptype='e', e gli aggregate/window (prokind a/w). Senza questo filtro il count
            // first-run esplodeva (es. 564 funzioni postgis su WideWorldImporters).
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con,
                "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
                "where n.nspname = @schema and p.prokind in ('f','p') " +
                "and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') " +
                "order by p.proname"))
            {
                // CreateOpenConnection ha gia' fatto Open(); evitiamo doppio Open (errore Npgsql).
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
            // LEFT JOIN su information_schema.key_column_usage + table_constraints
            // per identificare le colonne PRIMARY KEY. Senza questa info,
            // mc_is_primary_key resta 0 in metadata → UpdateflatData genera
            // `UPDATE … SET id=...` (PK in SET invece che WHERE) + WHERE vuoto
            // → 42601 syntax error. is_identity='YES' rileva IDENTITY/SERIAL.
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, @"
select
    c.column_name,
    case when c.data_type='USER-DEFINED' then c.udt_name else c.data_type end as data_type,
    c.is_nullable,
    coalesce(c.character_maximum_length,0) as max_length,
    coalesce(c.numeric_precision,0) as numeric_precision,
    coalesce(c.numeric_scale,0) as numeric_scale,
    c.column_default,
    c.is_identity,
    case when pkcols.column_name is not null then 'YES' else 'NO' end as is_primary_key
from information_schema.columns c
left join (
    select kcu.column_name
    from information_schema.table_constraints tc
    inner join information_schema.key_column_usage kcu
        on tc.constraint_schema = kcu.constraint_schema
        and tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
        and tc.table_name = kcu.table_name
    where tc.constraint_type = 'PRIMARY KEY'
        and tc.table_schema = @schema
        and tc.table_name = @table
) pkcols on pkcols.column_name = c.column_name
where c.table_schema=@schema and c.table_name=@table
order by c.ordinal_position"))
            {
                // CreateOpenConnection ha gia' fatto Open(); evitiamo doppio Open (errore Npgsql).
                DbProviderUtil.AddWithValue(cmd, "schema", schema);
                DbProviderUtil.AddWithValue(cmd, "table", tableName);
                using (DbDataReader dr = cmd.ExecuteReader())
                {
                    while (dr.Read())
                    {
                        string defaultVal = RawHelpers.ParseNull(dr["column_default"]);
                        bool isIdentity = RawHelpers.ParseNull(dr["is_identity"]).Equals("YES", StringComparison.OrdinalIgnoreCase);
                        // SERIAL columns: is_identity='NO' ma column_default contiene `nextval('...seq'::regclass)`.
                        bool isSequence = !string.IsNullOrEmpty(defaultVal) && defaultVal.IndexOf("nextval", StringComparison.OrdinalIgnoreCase) >= 0;
                        bool isPk = RawHelpers.ParseNull(dr["is_primary_key"]).Equals("YES", StringComparison.OrdinalIgnoreCase);

                        ret.Add(new columnDefinition()
                        {
                            Name = RawHelpers.ParseNull(dr["column_name"]),
                            DataType = RawHelpers.ParseNull(dr["data_type"]),
                            Nullable = RawHelpers.ParseNull(dr["is_nullable"]).Equals("YES", StringComparison.OrdinalIgnoreCase),
                            MaximumLength = int.TryParse(RawHelpers.ParseNull(dr["max_length"]), out int maxLen) ? maxLen : 0,
                            NumericPrecision = int.TryParse(RawHelpers.ParseNull(dr["numeric_precision"]), out int precision) ? precision : 0,
                            NumericScale = int.TryParse(RawHelpers.ParseNull(dr["numeric_scale"]), out int scale) ? scale : 0,
                            DefaultValue = defaultVal,
                            InPrimaryKey = isPk,
                            Identity = isIdentity || (isPk && isSequence)
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

                return metaRawModel.AddMySqlColumn(md, mt, route, mc_ui_column_type, mc_nome_colonna, alias, nullable, scale, precision, maxLength, defaultValue);
            }
        }

        public void RemoveColumn(string table, string mc_nome_colonna, int mc_id)
        {
            string uID = RawHelpers.authenticate();
            RawHelpers.checkAdmin(uID);

            using (metaRawModel md = new metaRawModel())
            {
                metaRawModel.RemoveColonna(table, mc_nome_colonna, mc_id);
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
            // PG: il database e' gia' selezionato nella connection string (Database=...).
            // Lo `db` parametro arriva dal client che lo usa come schema su MSSQL (dove
            // 'dbo' e' lo schema implicito), ma in PG il `db` NON e' uno schema valido —
            // userebbe 'WideWorldImporters' come schema e ritornerebbe 0 tabelle. Quindi
            // fallback solo se `schema` esplicito non e' fornito.
            string effectiveSchema = NormalizeSchema(schema);

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
            // PG: ignora il `db` come schema (e' un MSSQL-ism). Usa il parametro
            // tableSchema esplicito o fallback a "public" via NormalizeSchema.
            string effectiveSchema = NormalizeSchema(tableSchema);

            List<bind_list> tblList = new List<bind_list>();
            using (DbConnection con = PostGresProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, "select column_name, data_type from information_schema.columns where table_schema=@schema and table_name=@table order by ordinal_position"))
            {
                // CreateOpenConnection ha gia' fatto Open(); evitiamo doppio Open (errore Npgsql).
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
            // PG: ignora `db` come schema (MSSQL-ism). Usa viewSchema esplicito o "public".
            string effectiveSchema = NormalizeSchema(viewSchema);

            List<bind_list> tblList = new List<bind_list>();
            using (DbConnection con = PostGresProviderGateway.CreateOpenConnection(connection))
            using (DbCommand cmd = DbProviderUtil.CreateTextCommand(con, "select column_name, data_type from information_schema.columns where table_schema=@schema and table_name=@table order by ordinal_position"))
            {
                // CreateOpenConnection ha gia' fatto Open(); evitiamo doppio Open (errore Npgsql).
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
            // PG: `db` non e' uno schema (MSSQL-ism); il DB e' gia' selezionato nella
            // connection string. NormalizeSchema(null) ritorna "public".
            string effectiveSchema = NormalizeSchema(null);
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

                // CreateOpenConnection ha gia' fatto Open(); evitiamo doppio Open (errore Npgsql).
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
                        metaRawModel.UpdateColonna(uicCol);
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
                // PG: `db` non e' uno schema (MSSQL-ism); il DB e' gia' selezionato nella
            // connection string. NormalizeSchema(null) ritorna "public".
            string effectiveSchema = NormalizeSchema(null);
                List<string> tables = GetPgTables(connection, effectiveSchema);
                List<string> views = GetPgViews(connection, effectiveSchema);
                List<string> storeds = GetPgStored(connection, effectiveSchema);

                str.AppendLine(string.Format("Scaffolding {0} tables<br />", tables.Count));

                // First-run progress (fase scaffolding, parity con metaModelRaw.scaffoldDB MSSQL).
                bool reportProg = ngUicServicesCore.Controllers.FirstRunProgressTracker.IsActive;
                long totalObj = 0, processedObj = 0;
                if (reportProg)
                {
                    // Storeds esclusi dal first-run (vedi loop sotto): solo tabelle + viste.
                    totalObj =
                        tables.Count(t => t != "test" && t != "information_schema") +
                        views.Count;
                    ngUicServicesCore.Controllers.FirstRunProgressTracker.Start(
                        Guid.NewGuid().ToString(), "scaffold-existing-db", totalObj, "Scaffolding " + db);
                }

                bool createM = createMenu;

                foreach (string tb in tables.OrderBy(x => x))
                {
                    createMenu = createM;

                    if (tb == "test" || tb == "information_schema")
                        continue;

                    List<columnDefinition> columns = GetPgColumns(connection, effectiveSchema, tb, str);

                    foreach (columnDefinition col in columns)
                    {
                        scaffoldOfColumnPostgres(connection, connName, mmd, tb, db, col, str, ref createMenu, columns.Count);
                    }

                    if (reportProg)
                    {
                        processedObj++;
                        ngUicServicesCore.Controllers.FirstRunProgressTracker.Update(processedObj, "table " + tb);
                    }
                }

                foreach (string vw in views.OrderBy(x => x))
                {
                    List<columnDefinition> columns = GetPgColumns(connection, effectiveSchema, vw, str);
                    foreach (columnDefinition col in columns)
                    {
                        scaffoldOfColumnPostgres(connection, connName, mmd, vw, db, col, str, ref createMenu, columns.Count);
                    }

                    if (reportProg)
                    {
                        processedObj++;
                        ngUicServicesCore.Controllers.FirstRunProgressTracker.Update(processedObj, "view " + vw);
                    }
                }

                // Storeds ESCLUSI dal first-run (richiesta 2026-06-17): scaffoldDB e' il
                // path bulk del first-run e NON deve scaffoldare gli storeds. In piu',
                // mmd.scaffoldOfStoredMySql introspetta i parametri via getStoredParamsMySql
                // (mysql-specific) -> apriva una connessione MySQL -> SocketException su PG.
                // Lo scaffold di un singolo stored PG (path designer scaffoldStored) deve
                // usare un metodo dbms-specific sul satellite PG (scaffoldOfStoredPostgres) -
                // TODO separato. Qui, per il first-run, gli storeds restano fuori.
                _ = storeds; // soppress unused (computato sopra, non scaffoldato nel first-run)

                RawHelpers.setMetadataVersion();

                if (reportProg)
                    ngUicServicesCore.Controllers.FirstRunProgressTracker.Complete("Scaffold of " + db + " done");
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
            // PG: `db` non e' uno schema (MSSQL-ism); il DB e' gia' selezionato nella
            // connection string. NormalizeSchema(null) ritorna "public".
            string effectiveSchema = NormalizeSchema(null);
            ParseQualifiedDbObjectName(table, out string tableSchema, out string tableName);
            if (!string.IsNullOrWhiteSpace(tableSchema))
                effectiveSchema = NormalizeSchema(tableSchema);

            using (metaRawModel mmd = new metaRawModel())
            {
                List<columnDefinition> columns = GetPgColumns(connection, effectiveSchema, tableName, log);
                columnDefinition col = columns.FirstOrDefault(x => string.Equals(x.Name, column, StringComparison.OrdinalIgnoreCase));
                if (col == null)
                    return new Dictionary<string, string>() { { "message", "Colonna non trovata" }, { "log", "Colonna non trovata" } };

                bool createMenu = false;
                scaffoldOfColumnPostgres(connection, connName, mmd, tableName, effectiveSchema, col, log, ref createMenu, columns.Count);
                return new Dictionary<string, string>()
                {
                    { "message", log.ToString() }, { "log", log.ToString() }
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
            // PG: ignora `db` come schema (MSSQL-ism). Usa schema esplicito o "public".
            string effectiveSchema = NormalizeSchema(schema);
            ParseQualifiedDbObjectName(table, out string tableSchema, out string tableName);
            if (!string.IsNullOrWhiteSpace(tableSchema))
                effectiveSchema = NormalizeSchema(tableSchema);

            // Resolve `connection` from `connName` if caller passed empty (i client
            // E2E passano sempre `connection=''` + `connName='DataSQLConnection'`).
            // Senza questo, GetPgTables/CreateOpenConnection esplodono con
            // "ConnectionString property has not been initialized.".
            if (string.IsNullOrWhiteSpace(connection))
            {
                string resolvedConnName = string.IsNullOrWhiteSpace(connName) ? "DataSQLConnection" : connName;
                connection = ConfigHelper.ResolveConnectionString(resolvedConnName);
            }

            using (metaRawModel mmd = new metaRawModel())
            {
                if (!GetPgTables(connection, effectiveSchema).Any(x => string.Equals(x, tableName, StringComparison.OrdinalIgnoreCase)))
                    return new Dictionary<string, string>() { { "message", "Tabella non trovata" }, { "log", "Tabella non trovata" } };

                List<columnDefinition> columns = GetPgColumns(connection, effectiveSchema, tableName, log);
                foreach (columnDefinition col in columns)
                    scaffoldOfColumnPostgres(connection, connName, mmd, tableName, effectiveSchema, col, log, ref createMenu, columns.Count);

                // Full cache invalidation post-scaffold: senza questa chiamata la nuova route
                // resta invisibile al runtime (cache `storedTableMeta` / `storedMeta`
                // Application-scoped restano stale). Mirror Oracle/MySQL satellite.
                RawHelpers.InvalidateMetadataCachesAndSetVersion(clearAllMetadata: true);

                // Recupera l'md_id della tabella scaffoldata per ritornarlo al caller.
                // Contract atteso da MetaService.ScaffoldTableForDbms / consumer pivot-builder:
                // Dictionary contiene chiave "id" con l'md_id (MSSQL impl mirror, riga 1719 di
                // metaModelRaw.cs). Senza questo, il pivot-builder logga
                // "Schedulazione non creata: md_id della tabella non risolto dopo scaffolding"
                // e l'auto-scheduler post-pivot non viene mai creato. Route name derivato via
                // RawHelpers.getRouteName (snake-case lowercased) per matchare quello salvato
                // da scaffoldOfTableMySql al primo scaffoldOfColumnMySql invocato sopra.
                string scaffoldedRoute = RawHelpers.getRouteName(tableName);
                _Metadati_Tabelle scaffoldedTable = mmd.GetMetadati_Tabelles(scaffoldedRoute).FirstOrDefault();
                string scaffoldedId = scaffoldedTable != null ? scaffoldedTable.md_id.ToString() : string.Empty;

                return new Dictionary<string, string>()
                {
                    { "message", log.ToString() },
                    { "log", log.ToString() },
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
            // PG: `db` non e' uno schema (MSSQL-ism); il DB e' gia' selezionato nella
            // connection string. NormalizeSchema(null) ritorna "public".
            string effectiveSchema = NormalizeSchema(null);
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
                        scaffoldOfColumnPostgres(connection, connName, mmd, viewT, effectiveSchema, col, log, ref createMenu, columns.Count);
                        createMenu = false;
                    }
                }
            }

            string logg = log.ToString();
            if (string.IsNullOrEmpty(logg))
                logg = "Nessuna nuova colonna";

            // Full cache invalidation post-scaffold (vedi commento in scaffoldTable).
            RawHelpers.InvalidateMetadataCachesAndSetVersion(clearAllMetadata: true);

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
            // PG: `db` non e' uno schema (MSSQL-ism); il DB e' gia' selezionato nella
            // connection string. NormalizeSchema(null) ritorna "public".
            string effectiveSchema = NormalizeSchema(null);

            // Resolve `connection` from `connName` if caller passed empty (mirror
            // pattern usato da scaffoldTable upstream). Senza questo, GetPgStored
            // chiama CreateOpenConnection("") → InvalidOperationException
            // "ConnectionString property has not been initialized.".
            if (string.IsNullOrWhiteSpace(connection))
            {
                string resolvedConnName = string.IsNullOrWhiteSpace(connName) ? "DataSQLConnection" : connName;
                connection = ConfigHelper.ResolveConnectionString(resolvedConnName);
            }

            using (metaRawModel mmd = new metaRawModel())
            {
                string storedName = GetPgStored(connection, effectiveSchema).FirstOrDefault(x => string.Equals(x, stored, StringComparison.OrdinalIgnoreCase));
                if (string.IsNullOrEmpty(storedName))
                    return new Dictionary<string, string>() { { "message", "Stored non trovata" }, { "log", "Stored non trovata" } };

                mmd.scaffoldOfStoredMySql(connection, connName, storedName, mmd, log, effectiveSchema);

                // Full cache invalidation post-scaffold (vedi commento in scaffoldTable).
                RawHelpers.InvalidateMetadataCachesAndSetVersion(clearAllMetadata: true);

                return new Dictionary<string, string>()
                {
                    { "message", log.ToString() }, { "log", log.ToString() }
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
        // PG-native COLUMN scaffolder (Fase A — 2026-05-28)
        // ============================================================
        //
        // Sostituisce le 5 chiamate a `mmd.scaffoldOfColumnMySql(...)`
        // in questo file. Quel metodo shared in metaModelRaw.cs e' MySQL-
        // centric: chiama RawHelpers.getDBDataType che riconosce solo i
        // type-name MySQL (`int`/`decimal`/`datetime`/`varchar`/...). I
        // type-name che PG ritorna da information_schema.columns sono
        // diversi:
        //   - `integer`/`int4`/`bigint`/`int8` vs MySQL `int`
        //   - `numeric`/`decimal`              vs MySQL `decimal`
        //   - `timestamp without time zone`    vs MySQL `datetime`
        //   - `character varying`/`bpchar`     vs MySQL `varchar`
        //   - `boolean`/`bool`                 vs MySQL `tinyint(1)`/`bit`
        //   - `uuid`/`bytea`/`json`/`jsonb`    (no MySQL analog)
        // Tutti i tipi PG sopra cadevano nel default → UI `text`,
        // rompendo number-editor / date-picker / datetime-picker per
        // qualunque tabella PG scaffoldata via API. Il bug si manifesta
        // anche su CRUD INSERT: il branch type-aware "number" in
        // BuildDynamicInsertQuery ha il fix `.Replace(",", ".")` per
        // normalizzare il decimal separator italiano, ma con
        // mc_ui_column_type="text" quel branch non scatta → il
        // `valore.ToString()` raw produce "9876,4321" e PG rifiuta
        // con 22P02. Riferimenti:
        //   - skill: scripts/docs-driven-tests/sql/datetime-locale-test/
        //   - orchestrator: scripts/test-datetime-locale-roundtrip.ps1
        //
        // `scaffoldOfTableMySql` resta usato (logica `_metadati__tabelle`
        // row + menu opzionale e' provider-agnostica), promosso a
        // `public static` 2026-05-28 nello stesso commit.
        // ============================================================

        /// <summary>
        /// Maps a PG raw `data_type` (information_schema.columns.data_type
        /// or udt_name for USER-DEFINED) to a canonical type token consumed
        /// by <see cref="SetTypeFromPostgresColumn"/>.
        /// </summary>
        private static string GetPostgresCanonicalType(string pgRawType)
        {
            if (string.IsNullOrEmpty(pgRawType)) return "varchar";
            string t = pgRawType.Trim().ToLowerInvariant();
            switch (t)
            {
                // integer family
                case "smallint":
                case "int2":
                case "integer":
                case "int":
                case "int4":
                case "bigint":
                case "int8":
                case "smallserial":
                case "serial":
                case "serial4":
                case "bigserial":
                case "serial8":
                    return "int";

                // decimal / fixed-point
                case "numeric":
                case "decimal":
                    return "decimal";

                // float family
                case "real":
                case "float4":
                case "double precision":
                case "float8":
                    return "float";

                case "money":
                    return "money";

                // character family
                case "character varying":
                case "varchar":
                case "character":
                case "char":
                case "bpchar":
                case "name":
                    return "varchar";

                case "text":
                    return "text";

                case "xml":
                    return "xml";

                case "json":
                case "jsonb":
                    // present as textarea (mirror MSSQL xml mapping)
                    return "text";

                // boolean
                case "boolean":
                case "bool":
                    return "boolean";

                // date/time family
                case "date":
                    return "date";

                case "timestamp without time zone":
                case "timestamp":
                case "timestamp with time zone":
                case "timestamptz":
                    return "datetime";

                case "time without time zone":
                case "time":
                case "time with time zone":
                case "timetz":
                    return "time";

                case "interval":
                    return "varchar";

                // binary
                case "bytea":
                    return "binary";

                case "uuid":
                    return "uniqueidentifier";

                // spatial (PostGIS arrives as udt_name)
                case "point":
                    return "point";
                case "polygon":
                case "geometry":
                case "geography":
                    return "geometry";

                default:
                    // Unknown PG type — fall back to varchar/text. ENUM types
                    // arrive as the enum name (USER-DEFINED) and land here.
                    return "varchar";
            }
        }

        /// <summary>
        /// Applies the canonical type → `mc_ui_column_type` mapping and
        /// appends the column row to the model. Mirrors the MySQL
        /// `setTypeFromSMOColumnMySql` but with a distinct `datetime` case
        /// (MySQL collapsed datetime into date for historical reasons).
        /// </summary>
        private static void SetTypeFromPostgresColumn(metaRawModel mm, columnDefinition col, _Metadati_Colonne cm, string canonical)
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
                        numCol.mc_ui_slider_decimals = (short)col.NumericScale;
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

                case "money":
                    {
                        cm.mc_default_value = col.DefaultValue;
                        cm.mc_ui_column_type = "number";
                        _Metadati_Colonne_Slider monCol = new _Metadati_Colonne_Slider();
                        RawHelpers.cloneToChild(cm, monCol);
                        monCol.mc_ui_slider_decimals = (short)col.NumericScale;
                        monCol.mc_ui_slider_format = "C";
                        mm.AddColonna(monCol);
                    }
                    break;

                case "boolean":
                    cm.mc_default_value = col.DefaultValue;
                    cm.mc_ui_column_type = "boolean";
                    if (!col.Nullable && string.IsNullOrEmpty(cm.mc_default_value))
                        cm.mc_default_value = "false";
                    mm.AddColonna(cm);
                    break;

                case "date":
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

                case "uniqueidentifier":
                    cm.mc_default_value = col.DefaultValue;
                    cm.mc_ui_column_type = "text";
                    cm.mc_logic_editable = false;
                    cm.mc_hide_in_edit = true;
                    cm.mc_hide_in_list = true;
                    mm.AddColonna(cm);
                    break;

                case "point":
                    cm.mc_ui_column_type = "point";
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
        /// PG-native equivalent of metaRawModel.scaffoldOfColumnMySql.
        /// Same control flow (table ensure + alias resolution + PK detection
        /// + _Metadati_Colonne row creation + type mapping), but the
        /// type-mapping step uses <see cref="GetPostgresCanonicalType"/> +
        /// <see cref="SetTypeFromPostgresColumn"/> instead of the
        /// MySQL-centric RawHelpers.getDBDataType + setTypeFromSMOColumnMySql.
        /// </summary>
        public static string scaffoldOfColumnPostgres(
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

            string canonical = GetPostgresCanonicalType(column.DataType);

            // PK type detection: IDENTITY (PG `is_identity='YES'` or SERIAL)
            // UUID → "GUID"; everything else → manual.
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
                        {
                            md.md_primary_key_type = "MAX";
                        }
                        else
                        {
                            mc_hide_in_edit = false;
                            mc_hide_in_list = false;
                            mc_logic_editable = true;
                        }
                    }
                }
                else if (canonical == "uniqueidentifier")
                {
                    md.md_primary_key_type = "GUID";
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
                // PG-native canonical token (es. "decimal","datetime"); downstream
                // BuildDynamic*Query branches detectano questo per emettere
                // SQL type-safe (Replace(",", ".") sul decimal, TO_TIMESTAMP
                // sul datetime, ecc.).
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

            SetTypeFromPostgresColumn(mm, column, cm, canonical);

            log.AppendLine(string.Format("Added column '{0}' of Table '{1}'<br />", column_name, table));
            return "";
        }
    }
}






