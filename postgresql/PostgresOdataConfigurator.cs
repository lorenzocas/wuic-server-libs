using System;
using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace metaModelRaw
{
    /// <summary>
    /// EF Core DbContext configurator for the WuicOData package when the host
    /// is using PostgreSQL as data DBMS. Sibling di <see cref="MySqlOdataConfigurator"/>
    /// (mysql provider) — lives in the <c>postgresql</c> (Wuic.PostgresProvider)
    /// project per mantenere WuicOData MSSQL-only at compile time. La dipendenza
    /// EF (<c>Npgsql.EntityFrameworkCore.PostgreSQL</c>) viene caricata a runtime
    /// via reflection.
    ///
    /// WuicOData/Configurator.cs dispatch verso <see cref="ConfigureDynamicContextOptions"/>
    /// quando <c>AppSettings:dbms == "postgresql"</c>.
    /// </summary>
    public static class PostgresOdataConfigurator
    {
        /// <summary>
        /// Apply PostgreSQL-specific configuration to the OData DbContext options.
        /// </summary>
        public static void ConfigureDynamicContextOptions(DbContextOptionsBuilder optionsBuilder, string connectionString)
        {
            if (optionsBuilder == null) throw new ArgumentNullException(nameof(optionsBuilder));
            if (string.IsNullOrWhiteSpace(connectionString))
                throw new ArgumentException("connectionString is required", nameof(connectionString));

            optionsBuilder.UseNpgsql(connectionString);
            optionsBuilder.EnableSensitiveDataLogging();
        }

        /// <summary>
        /// PostgreSQL-flavor read of <c>mdserviceenable{insert,edit,delete}</c>.
        /// Sibling di <see cref="MySqlOdataConfigurator.TryGetWriteFlags"/>.
        /// </summary>
        public static bool[] TryGetWriteFlags(string metadataConnectionString, string entityset)
        {
            if (string.IsNullOrWhiteSpace(metadataConnectionString) || string.IsNullOrWhiteSpace(entityset))
                return null;
            try
            {
                using var connection = new NpgsqlConnection(metadataConnectionString);
                using var cmd = connection.CreateCommand();
                cmd.CommandText = @"
                    SELECT mdserviceenableinsert, mdserviceenableedit, mdserviceenabledelete
                    FROM _metadati__tabelle
                    WHERE mdexposeinwebapi = 1
                      AND (mdroutename = @name OR md_nome_tabella = @name)
                    ORDER BY md_id
                    LIMIT 1";
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
        /// PostgreSQL-flavor list of columns that MUST NOT appear in an INSERT
        /// statement (IDENTITY + GENERATED ALWAYS). Sibling di
        /// <see cref="MySqlOdataConfigurator.GetNonInsertableColumns"/>.
        ///
        /// Su PG le SERIAL columns hanno <c>column_default = nextval(...)</c> ma
        /// vogliamo escluderle anche da quel default (caller passes-through DB
        /// default quando il payload non porta valore). Quindi qui isoliamo
        /// solo IDENTITY (<c>is_identity = 'YES'</c>) + GENERATED ALWAYS
        /// (<c>is_generated = 'ALWAYS'</c>).
        ///
        /// <paramref name="schemaName"/>: tipicamente <c>public</c>; quando null/empty
        /// risolviamo via <c>current_schema()</c>.
        /// </summary>
        public static string[] GetNonInsertableColumns(string dataConnectionString, string schemaName, string tableName)
        {
            if (string.IsNullOrWhiteSpace(dataConnectionString) || string.IsNullOrWhiteSpace(tableName))
                return Array.Empty<string>();
            try
            {
                using var connection = new NpgsqlConnection(dataConnectionString);
                using var cmd = connection.CreateCommand();
                cmd.CommandText = @"
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = COALESCE(NULLIF(@schema, ''), current_schema())
                      AND table_name = @table
                      AND (is_identity = 'YES' OR is_generated = 'ALWAYS')";
                var pSchema = cmd.CreateParameter();
                pSchema.ParameterName = "schema";
                pSchema.Value = (object)schemaName ?? DBNull.Value;
                cmd.Parameters.Add(pSchema);
                var pT = cmd.CreateParameter();
                pT.ParameterName = "table";
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
        /// PostgreSQL-flavor INSERT for an OData entity set. Sibling di
        /// <see cref="MySqlOdataConfigurator.InsertEntity"/>.
        ///
        /// PG:
        ///   • Identifier quoting: doppi apici <c>"..."</c>.
        ///   • Recupero PK auto-generata: clausola <c>RETURNING "pk"</c>; il
        ///     valore arriva da <see cref="System.Data.Common.DbCommand.ExecuteScalar"/>.
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
            string paramsCsv = string.Join(", ", paramNames);

            using var connection = new NpgsqlConnection(dataConnectionString);
            connection.Open();
            using var cmd = connection.CreateCommand();
            string sql = "INSERT INTO " + qualifiedTable + " (" + columnsCsv + ") VALUES (" + paramsCsv + ")";
            if (!string.IsNullOrWhiteSpace(keyColumn))
                sql += " RETURNING \"" + keyColumn.Replace("\"", "\"\"") + "\"";
            cmd.CommandText = sql;

            foreach (var kv in values)
            {
                var p = cmd.CreateParameter();
                p.ParameterName = kv.Key;
                p.Value = kv.Value ?? DBNull.Value;
                cmd.Parameters.Add(p);
            }

            if (string.IsNullOrWhiteSpace(keyColumn))
            {
                cmd.ExecuteNonQuery();
                return null;
            }
            object raw = cmd.ExecuteScalar();
            if (raw == null || raw == DBNull.Value) return null;
            try { return Convert.ToInt64(raw); }
            catch { return raw; }
        }

        /// <summary>
        /// PostgreSQL-flavor read del forced page-size. Sibling di
        /// <see cref="MySqlOdataConfigurator.TryGetForcedTop"/>.
        /// </summary>
        public static int? TryGetForcedTop(string metadataConnectionString, string entityset)
        {
            if (string.IsNullOrWhiteSpace(metadataConnectionString) || string.IsNullOrWhiteSpace(entityset))
                return null;
            try
            {
                using var connection = new NpgsqlConnection(metadataConnectionString);
                using var cmd = connection.CreateCommand();
                cmd.CommandText = @"
                    SELECT COALESCE(NULLIF(mdservicepagesize, 0), NULLIF(mdpagesize, 0))
                    FROM _metadati__tabelle
                    WHERE mdexposeinwebapi = 1
                      AND (mdroutename = @name OR md_nome_tabella = @name)
                    ORDER BY md_id
                    LIMIT 1";
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
