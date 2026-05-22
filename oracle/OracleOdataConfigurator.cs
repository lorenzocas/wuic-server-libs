using System;
using System.Data;
using Microsoft.EntityFrameworkCore;
using Oracle.ManagedDataAccess.Client;

namespace metaModelRaw
{
    /// <summary>
    /// EF Core DbContext configurator for the WuicOData package when the host
    /// is using Oracle as data DBMS. Sibling of <see cref="MySqlOdataConfigurator"/>
    /// (mysql provider) — lives in the <c>oracle</c> (Wuic.OracleProvider) project
    /// so that WuicOData stays MSSQL-only at compile time and the Oracle EF
    /// dependency (<c>Oracle.EntityFrameworkCore</c>) is loaded only at runtime
    /// via reflection through this gateway.
    ///
    /// WuicOData/Configurator.cs detects the host dbms (from IConfiguration
    /// AppSettings.dbms) and, when "oracle", invokes
    /// <see cref="ConfigureDynamicContextOptions"/> via reflection. Otherwise
    /// it falls back to its default <c>UseSqlServer(...)</c> path (or to MySQL
    /// when dbms=mysql).
    /// </summary>
    public static class OracleOdataConfigurator
    {
        /// <summary>
        /// Apply Oracle-specific configuration to the OData DbContext options.
        /// </summary>
        public static void ConfigureDynamicContextOptions(DbContextOptionsBuilder optionsBuilder, string connectionString)
        {
            if (optionsBuilder == null) throw new ArgumentNullException(nameof(optionsBuilder));
            if (string.IsNullOrWhiteSpace(connectionString))
                throw new ArgumentException("connectionString is required", nameof(connectionString));

            // UseOracle e' l'extension method di Oracle.EntityFrameworkCore.
            // Quando il provider esegue contro Oracle 23 il default e' compat
            // mode 19; lo lasciamo al default perche' i nuovi DDL ANSI (FETCH
            // FIRST, IDENTITY columns) sono supportati gia' da 12c.
            optionsBuilder.UseOracle(connectionString);
            optionsBuilder.EnableSensitiveDataLogging();
        }

        /// <summary>
        /// Oracle-flavor read di <c>mdserviceenable{insert,edit,delete}</c> per
        /// l'entity set OData. Sibling di <see cref="MySqlOdataConfigurator.TryGetWriteFlags"/>.
        /// Su Oracle 12c+ usiamo la sintassi ANSI <c>FETCH FIRST 1 ROWS ONLY</c>
        /// invece del MSSQL <c>SELECT TOP 1</c>.
        /// </summary>
        public static bool[] TryGetWriteFlags(string metadataConnectionString, string entityset)
        {
            if (string.IsNullOrWhiteSpace(metadataConnectionString) || string.IsNullOrWhiteSpace(entityset))
                return null;
            try
            {
                using var connection = new OracleConnection(metadataConnectionString);
                using var cmd = connection.CreateCommand();
                cmd.CommandText = @"
                    SELECT mdserviceenableinsert, mdserviceenableedit, mdserviceenabledelete
                    FROM _metadati__tabelle
                    WHERE mdexposeinwebapi = 1
                      AND (mdroutename = :name OR md_nome_tabella = :name)
                    ORDER BY md_id
                    FETCH FIRST 1 ROWS ONLY";
                // BindByName: Oracle.ManagedDataAccess di default si lega
                // posizionalmente ai placeholder; senza questo flag il riuso
                // dello stesso :name nelle due clausole avrebbe due posizioni
                // distinte. Dapper non e' coinvolto qui — siamo su ADO.NET puro.
                cmd.BindByName = true;
                var p = cmd.CreateParameter();
                p.ParameterName = "name";
                p.Value = entityset;
                cmd.Parameters.Add(p);
                connection.Open();
                using var reader = cmd.ExecuteReader();
                if (!reader.Read()) return null;
                return new[]
                {
                    !reader.IsDBNull(0) && Convert.ToBoolean(reader.GetValue(0)),
                    !reader.IsDBNull(1) && Convert.ToBoolean(reader.GetValue(1)),
                    !reader.IsDBNull(2) && Convert.ToBoolean(reader.GetValue(2))
                };
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Oracle-flavor list of columns that MUST NOT appear in an INSERT statement
        /// (IDENTITY + virtual/computed columns). Sibling di
        /// <see cref="MySqlOdataConfigurator.GetNonInsertableColumns"/>.
        ///
        /// Usa <c>ALL_TAB_IDENTITY_COLS</c> per le IDENTITY (Oracle 12c+) e
        /// <c>ALL_TAB_COLS.VIRTUAL_COLUMN = 'YES'</c> per le generated/virtual.
        /// Su Oracle il concetto di "schema" coincide con il nome utente; il
        /// param <paramref name="schemaName"/> e' il proprietario tabella
        /// (uppercase di default).
        /// </summary>
        public static string[] GetNonInsertableColumns(string dataConnectionString, string schemaName, string tableName)
        {
            if (string.IsNullOrWhiteSpace(dataConnectionString) || string.IsNullOrWhiteSpace(tableName))
                return Array.Empty<string>();
            try
            {
                using var connection = new OracleConnection(dataConnectionString);
                using var cmd = connection.CreateCommand();
                // Match by (case-preserved) AS-STORED prima, fallback su UPPER per identifier non-quoted:
                // ALL_TAB_*.TABLE_NAME e' uppercase se l'identifier originale non era quoted, ma e'
                // case-preserved se l'identifier e' stato creato quoted (es. "_e2e_callbacks_demo",
                // pattern obbligatorio per nomi con leading underscore). Comparare con OR copre entrambi
                // i casi senza richiedere al chiamante di sapere a priori come e' stata creata la tabella.
                cmd.CommandText = @"
                    SELECT COLUMN_NAME FROM ALL_TAB_IDENTITY_COLS
                    WHERE (TABLE_NAME = :tbl OR TABLE_NAME = UPPER(:tbl))
                      AND (:schema IS NULL OR OWNER = :schema OR OWNER = UPPER(:schema))
                    UNION
                    SELECT COLUMN_NAME FROM ALL_TAB_COLS
                    WHERE (TABLE_NAME = :tbl OR TABLE_NAME = UPPER(:tbl))
                      AND (:schema IS NULL OR OWNER = :schema OR OWNER = UPPER(:schema))
                      AND VIRTUAL_COLUMN = 'YES'";
                cmd.BindByName = true;
                var pSchema = cmd.CreateParameter();
                pSchema.ParameterName = "schema";
                pSchema.Value = string.IsNullOrWhiteSpace(schemaName) ? (object)DBNull.Value : schemaName;
                cmd.Parameters.Add(pSchema);
                var pT = cmd.CreateParameter();
                pT.ParameterName = "tbl";  // ORA-01745: TABLE e' reserved keyword Oracle, non utilizzabile come bind variable name
                pT.Value = tableName;
                cmd.Parameters.Add(pT);
                connection.Open();
                using var reader = cmd.ExecuteReader();
                var list = new System.Collections.Generic.List<string>();
                while (reader.Read())
                {
                    if (!reader.IsDBNull(0))
                        list.Add(reader.GetString(0));
                }
                return list.ToArray();
            }
            catch
            {
                return Array.Empty<string>();
            }
        }

        /// <summary>
        /// Oracle-flavor INSERT for an OData entity set. Sibling di
        /// <see cref="MySqlOdataConfigurator.InsertEntity"/>.
        ///
        /// Su Oracle:
        ///   • Identifier quoting: doppi apici <c>"..."</c> (case-sensitive).
        ///   • Recupero PK auto-generata: clausola <c>RETURNING "pk" INTO :__inserted_id</c>
        ///     appesa al singolo statement, con un OracleParameter di output bindato.
        ///   • Lo schema (= owner) opzionalmente prefissa la tabella: <c>"OWNER"."TABLE"</c>.
        ///
        /// Returns the inserted key (decimal/long) quando keyColumn e' specificato,
        /// oppure null. Throws on SQL errors.
        /// </summary>
        public static object InsertEntity(
            string dataConnectionString,
            string schemaName,
            string tableName,
            string[] columnNames,
            string[] paramNames,
            System.Collections.Generic.IDictionary<string, object> values,
            string keyColumn)
        {
            if (string.IsNullOrWhiteSpace(dataConnectionString)) throw new ArgumentException("dataConnectionString required");
            if (string.IsNullOrWhiteSpace(tableName)) throw new ArgumentException("tableName required");
            if (columnNames == null || paramNames == null || columnNames.Length != paramNames.Length)
                throw new ArgumentException("columnNames/paramNames length mismatch");

            string qualifiedTable = string.IsNullOrWhiteSpace(schemaName)
                ? "\"" + tableName.Replace("\"", "\"\"") + "\""
                : "\"" + schemaName.Replace("\"", "\"\"") + "\".\"" + tableName.Replace("\"", "\"\"") + "\"";
            string columnsCsv = string.Join(", ", columnNames);
            // Oracle wants :name placeholders, not @name; the WuicOData caller
            // generates @p0/@p1/... — strip the leading @ and prefix with :.
            string paramsCsv = string.Join(", ", System.Linq.Enumerable.Select(paramNames, p => p.StartsWith('@') ? ":" + p.Substring(1) : p));

            using var connection = new OracleConnection(dataConnectionString);
            connection.Open();
            using var cmd = connection.CreateCommand();
            cmd.BindByName = true;

            string sql = "INSERT INTO " + qualifiedTable + " (" + columnsCsv + ") VALUES (" + paramsCsv + ")";
            OracleParameter returningParam = null;
            if (!string.IsNullOrWhiteSpace(keyColumn))
            {
                string quotedKey = "\"" + keyColumn.Replace("\"", "\"\"") + "\"";
                sql += " RETURNING " + quotedKey + " INTO :__inserted_id";
                returningParam = new OracleParameter("__inserted_id", OracleDbType.Decimal)
                {
                    Direction = ParameterDirection.Output
                };
            }
            cmd.CommandText = sql;

            foreach (var kv in values)
            {
                var p = cmd.CreateParameter();
                // Strip @ prefix → Oracle named bind is parameter-only (no prefix in CommandText
                // when BindByName=true, but at the ADO.NET parameter level we set just the name)
                p.ParameterName = kv.Key.StartsWith('@') ? kv.Key.Substring(1) : kv.Key;
                p.Value = kv.Value ?? DBNull.Value;
                cmd.Parameters.Add(p);
            }
            if (returningParam != null)
                cmd.Parameters.Add(returningParam);

            cmd.ExecuteNonQuery();

            if (returningParam == null) return null;
            object raw = returningParam.Value;
            if (raw == null || raw == DBNull.Value) return null;
            // Oracle.ManagedDataAccess wraps the OUT value into a OracleDecimal; convert defensively.
            try { return Convert.ToInt64(raw.ToString()); }
            catch { return raw.ToString(); }
        }

        /// <summary>
        /// Oracle-flavor read del forced page-size per l'entity set
        /// (<c>mdservicepagesize</c> fallback a <c>mdpagesize</c>).
        /// Sibling di <see cref="MySqlOdataConfigurator.TryGetForcedTop"/>.
        /// </summary>
        public static int? TryGetForcedTop(string metadataConnectionString, string entityset)
        {
            if (string.IsNullOrWhiteSpace(metadataConnectionString) || string.IsNullOrWhiteSpace(entityset))
                return null;
            try
            {
                using var connection = new OracleConnection(metadataConnectionString);
                using var cmd = connection.CreateCommand();
                cmd.CommandText = @"
                    SELECT COALESCE(NULLIF(mdservicepagesize, 0), NULLIF(mdpagesize, 0))
                    FROM _metadati__tabelle
                    WHERE mdexposeinwebapi = 1
                      AND (mdroutename = :name OR md_nome_tabella = :name)
                    ORDER BY md_id
                    FETCH FIRST 1 ROWS ONLY";
                cmd.BindByName = true;
                var p = cmd.CreateParameter();
                p.ParameterName = "name";
                p.Value = entityset;
                cmd.Parameters.Add(p);
                connection.Open();
                using var reader = cmd.ExecuteReader();
                if (!reader.Read() || reader.IsDBNull(0)) return null;
                return Convert.ToInt32(reader.GetValue(0));
            }
            catch
            {
                return null;
            }
        }
    }
}
