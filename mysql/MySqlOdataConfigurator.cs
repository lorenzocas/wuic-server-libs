using System;
using System.Data;
using Microsoft.EntityFrameworkCore;
using MySql.Data.MySqlClient;

namespace metaModelRaw
{
    /// <summary>
    /// EF Core DbContext configurator for the WuicOData package when the host
    /// is using MySQL as data DBMS. Lives in the `mysql` (Wuic.MySqlProvider)
    /// project so that WuicOData stays MSSQL-only at compile time and the
    /// MySQL dependency (Pomelo.EntityFrameworkCore.MySql) is loaded only at
    /// runtime via reflection through this gateway.
    ///
    /// WuicOData/Configurator.cs detects the host dbms (from IConfiguration
    /// AppSettings.dbms) and, when "mysql", invokes
    /// <see cref="ConfigureDynamicContextOptions"/> via reflection. Otherwise
    /// it falls back to its default `UseSqlServer(...)` path.
    /// </summary>
    public static class MySqlOdataConfigurator
    {
        /// <summary>
        /// Apply MySQL-specific configuration to the OData DbContext options.
        /// </summary>
        /// <param name="optionsBuilder">The EF Core options builder passed by
        /// WuicOData/Configurator.AddDbContext lambda.</param>
        /// <param name="connectionString">The DataSQLConnection string. The
        /// caller resolves it from IConfiguration; this method only consumes it.</param>
        public static void ConfigureDynamicContextOptions(DbContextOptionsBuilder optionsBuilder, string connectionString)
        {
            if (optionsBuilder == null) throw new ArgumentNullException(nameof(optionsBuilder));
            if (string.IsNullOrWhiteSpace(connectionString))
                throw new ArgumentException("connectionString is required", nameof(connectionString));

            // ServerVersion.AutoDetect opens a probe connection at startup to
            // discover the actual MySQL server version. This is what Pomelo's
            // documentation recommends for multi-version compatibility — the
            // alternative (hard-coded ServerVersion.Create) drifts whenever the
            // DBA upgrades MySQL/MariaDB underneath.
            var serverVersion = ServerVersion.AutoDetect(connectionString);
            optionsBuilder.UseMySql(connectionString, serverVersion);
            optionsBuilder.EnableSensitiveDataLogging();
        }

        /// <summary>
        /// MySQL-flavor read of `mdserviceenable{insert,edit,delete}` for the
        /// given OData entity set. Sibling of WuicOData/EntitiesController
        /// `TryGetWriteFlagsFromMetadata` which is hardcoded to MSSQL
        /// (`SqlConnection` + `SELECT TOP 1`). Reached via reflection from
        /// EntitiesController when `AppSettings:dbms == "mysql"`.
        ///
        /// Returns a 3-element bool array [enableInsert, enableEdit, enableDelete]
        /// or null if no row matches `entityset` on `_metadati__tabelle`.
        /// Returning a primitive array (instead of a struct) keeps the
        /// reflection contract independent of the WuicOData assembly's
        /// `WriteFlags` private struct.
        /// </summary>
        public static bool[] TryGetWriteFlags(string metadataConnectionString, string entityset)
        {
            if (string.IsNullOrWhiteSpace(metadataConnectionString) || string.IsNullOrWhiteSpace(entityset))
                return null;
            try
            {
                using var connection = new MySqlConnection(metadataConnectionString);
                using var cmd = connection.CreateCommand();
                cmd.CommandText = @"
                    SELECT mdserviceenableinsert, mdserviceenableedit, mdserviceenabledelete
                    FROM _metadati__tabelle
                    WHERE mdexposeinwebapi = 1
                      AND (mdroutename = @name OR md_nome_tabella = @name)
                    ORDER BY md_id
                    LIMIT 1";
                var p = cmd.CreateParameter();
                p.ParameterName = "@name";
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
        /// MySQL-flavor list of columns that MUST NOT appear in an INSERT statement
        /// (auto_increment + generated/computed columns). Sibling of WuicOData
        /// `GetNonInsertableColumnsAsync` which queries `sys.columns`.
        ///
        /// Returns column names; comparison should be case-insensitive at call site.
        /// </summary>
        public static string[] GetNonInsertableColumns(string dataConnectionString, string dbName, string tableName)
        {
            if (string.IsNullOrWhiteSpace(dataConnectionString) || string.IsNullOrWhiteSpace(tableName))
                return Array.Empty<string>();
            try
            {
                using var connection = new MySqlConnection(dataConnectionString);
                using var cmd = connection.CreateCommand();
                cmd.CommandText = @"
                    SELECT COLUMN_NAME
                    FROM information_schema.columns
                    WHERE TABLE_SCHEMA = COALESCE(NULLIF(@db, ''), DATABASE())
                      AND TABLE_NAME = @table
                      AND (EXTRA LIKE '%auto_increment%' OR EXTRA LIKE '%GENERATED%')";
                var pDb = cmd.CreateParameter();
                pDb.ParameterName = "@db";
                pDb.Value = dbName ?? string.Empty;
                cmd.Parameters.Add(pDb);
                var pT = cmd.CreateParameter();
                pT.ParameterName = "@table";
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
        /// MySQL-flavor INSERT for an OData entity set. Sibling of WuicOData
        /// `InsertEntityWithSqlAsync` which builds T-SQL with bracket-quoted
        /// `[schema].[table]` + `OUTPUT INSERTED.[keyColumn]`. On MySQL we use
        /// backtick-quoted `` `db`.`table` `` and a separate `SELECT LAST_INSERT_ID()`
        /// to recover the auto-generated PK in the same connection.
        ///
        /// `columnNames` and `paramNames` must be aligned (i = i). `values` keys
        /// match `paramNames` (without the leading `@`). `keyColumn` is the PK
        /// column name (used only to decide whether to fetch LAST_INSERT_ID).
        /// `dbName` may be null/empty (then `db.` prefix is omitted).
        ///
        /// Returns the inserted key (long) when keyColumn is provided and the
        /// table is auto_increment, or null otherwise. Throws on SQL errors so
        /// the caller can surface them to the OData client.
        /// </summary>
        public static object InsertEntity(
            string dataConnectionString,
            string dbName,
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

            string qualifiedTable = string.IsNullOrWhiteSpace(dbName)
                ? "`" + tableName.Replace("`", "``") + "`"
                : "`" + dbName.Replace("`", "``") + "`.`" + tableName.Replace("`", "``") + "`";
            string columnsCsv = string.Join(", ", columnNames);
            string paramsCsv = string.Join(", ", paramNames);

            using var connection = new MySqlConnection(dataConnectionString);
            connection.Open();
            using var cmd = connection.CreateCommand();
            cmd.CommandText = "INSERT INTO " + qualifiedTable + " (" + columnsCsv + ") VALUES (" + paramsCsv + ");";
            foreach (var kv in values)
            {
                var p = cmd.CreateParameter();
                p.ParameterName = kv.Key;
                p.Value = kv.Value ?? DBNull.Value;
                cmd.Parameters.Add(p);
            }
            cmd.ExecuteNonQuery();

            if (string.IsNullOrWhiteSpace(keyColumn))
                return null;

            // LAST_INSERT_ID() is connection-scoped — same `MySqlConnection`
            // instance, no race even under concurrent inserts to the same table.
            using var idCmd = connection.CreateCommand();
            idCmd.CommandText = "SELECT LAST_INSERT_ID()";
            var raw = idCmd.ExecuteScalar();
            if (raw == null || raw == DBNull.Value) return null;
            long id = Convert.ToInt64(raw);
            return id == 0 ? null : (object)id;
        }

        /// <summary>
        /// MySQL-flavor read of the forced page-size for the given entity set
        /// (`mdservicepagesize` fallback to `mdpagesize`). Sibling of
        /// WuicOData `TryGetForcedTopFromMetadata`.
        /// </summary>
        public static int? TryGetForcedTop(string metadataConnectionString, string entityset)
        {
            if (string.IsNullOrWhiteSpace(metadataConnectionString) || string.IsNullOrWhiteSpace(entityset))
                return null;
            try
            {
                using var connection = new MySqlConnection(metadataConnectionString);
                using var cmd = connection.CreateCommand();
                cmd.CommandText = @"
                    SELECT COALESCE(NULLIF(mdservicepagesize, 0), NULLIF(mdpagesize, 0))
                    FROM _metadati__tabelle
                    WHERE mdexposeinwebapi = 1
                      AND (mdroutename = @name OR md_nome_tabella = @name)
                    ORDER BY md_id
                    LIMIT 1";
                var p = cmd.CreateParameter();
                p.ParameterName = "@name";
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
