// PostgreSQL flavor of RecordTranslations machinery. Mirror di
// `mysql/RecordTranslationsMySql.cs` per il provider Postgres.
//
// Differenze dialettali PG vs MySQL:
//   • DDL: PG supporta nativamente `CREATE TABLE IF NOT EXISTS` e
//     `CREATE INDEX IF NOT EXISTS` (9.5+).
//   • Tipi: INT → INTEGER, VARCHAR(N) invariato, LONGTEXT → TEXT,
//     DATETIME(0) → TIMESTAMP, CURRENT_TIMESTAMP → (NOW() AT TIME ZONE 'UTC')::timestamp.
//   • Upsert: MySQL `INSERT … ON DUPLICATE KEY UPDATE` → PG `INSERT … ON CONFLICT
//     (cols) DO UPDATE SET … = EXCLUDED.…`.
//   • Connection: `NpgsqlConnection`/`NpgsqlTransaction`.
//   • Identifier `language` e' reserved word in SQL standard → virgolettiamo.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using Dapper;
using Npgsql;
using Newtonsoft.Json.Linq;
using metaModelRaw;
using WEB_UI_CRAFTER.Helpers;

namespace WEB_UI_CRAFTER
{
    public static class RecordTranslationsPostgres
    {
        private static volatile bool _schemaEnsured = false;
        private static volatile string _schemaEnsuredTable = null;
        private static readonly object _schemaLock = new object();

        private const string DefaultTranslationsTableName = "_record_field_translations";
        private const string DefaultLanguageCode = "it-IT";

        public sealed class Settings
        {
            public bool Enabled { get; set; }
            public string DefaultTableName { get; set; }
            public string TranslationJsonFieldName { get; set; }
            public string DefaultLanguage { get; set; }
            public List<string> FieldNames { get; set; }
        }

        public static Settings ResolveSettings(_Metadati_Tabelle tableMetadata)
        {
            bool enabled = ParseBool(GetConfig("RecordTranslations:Enabled") ?? GetConfig("recordTranslationsEnabled"), false);
            string defaultTableName = NullIfBlank(GetConfig("RecordTranslations:DefaultTableName") ?? GetConfig("recordTranslationsDefaultTableName")) ?? DefaultTranslationsTableName;
            string jsonField = NullIfBlank(GetConfig("RecordTranslations:TranslationJsonFieldName") ?? GetConfig("recordTranslationsTranslationJsonFieldName")) ?? "translation_json";
            string defaultLanguage = NullIfBlank(GetConfig("RecordTranslations:DefaultLanguage") ?? GetConfig("recordTranslationsDefaultLanguage")) ?? DefaultLanguageCode;
            List<string> fieldNames = ParseFieldNamesFromConfig();

            if (tableMetadata != null && !string.IsNullOrWhiteSpace(tableMetadata.md_props_bag))
            {
                try
                {
                    JObject bag = JObject.Parse(tableMetadata.md_props_bag);
                    JObject server = bag["serverProperties"] as JObject;
                    JObject rt = server?["RecordTranslations"] as JObject;
                    if (rt != null)
                    {
                        if (rt["Enabled"] != null) enabled = rt.Value<bool>("Enabled");
                        string overrideTable = NullIfBlank((string)rt["DefaultTableName"]);
                        if (overrideTable != null) defaultTableName = overrideTable;
                        string overrideJson = NullIfBlank((string)rt["TranslationJsonFieldName"]);
                        if (overrideJson != null) jsonField = overrideJson;
                        string overrideLang = NullIfBlank((string)rt["DefaultLanguage"]);
                        if (overrideLang != null) defaultLanguage = overrideLang;
                        JArray fnArr = rt["FieldNames"] as JArray;
                        if (fnArr != null)
                        {
                            fieldNames = fnArr.Select(t => RawHelpers.ParseNull(t?.ToString()).Trim())
                                              .Where(s => !string.IsNullOrWhiteSpace(s))
                                              .Distinct(StringComparer.OrdinalIgnoreCase)
                                              .ToList();
                        }
                    }
                }
                catch { /* malformed props_bag → mantieni globali */ }
            }

            return new Settings
            {
                Enabled = enabled,
                DefaultTableName = defaultTableName,
                TranslationJsonFieldName = jsonField,
                DefaultLanguage = defaultLanguage,
                FieldNames = fieldNames ?? new List<string>()
            };
        }

        // ─────────────────────────────────────────────────────────────────
        //  Schema (PG: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS)
        // ─────────────────────────────────────────────────────────────────
        public static void EnsureSchema(NpgsqlConnection connection, string tableName, string translationJsonFieldName)
        {
            if (connection == null || string.IsNullOrWhiteSpace(tableName)) return;
            if (!IsValidIdentifier(tableName))
                throw new InvalidOperationException("RecordTranslationsPostgres.EnsureSchema: invalid table name '" + tableName + "'.");

            if (_schemaEnsured && string.Equals(_schemaEnsuredTable, tableName, StringComparison.OrdinalIgnoreCase))
                return;

            lock (_schemaLock)
            {
                if (_schemaEnsured && string.Equals(_schemaEnsuredTable, tableName, StringComparison.OrdinalIgnoreCase))
                    return;

                string quoted = "\"" + tableName.Replace("\"", "\"\"") + "\"";

                // PG DDL natively idempotente. `language` virgolettato perche'
                // e' SQL-reserved.
                string ddl = $@"
CREATE TABLE IF NOT EXISTS {quoted} (
    md_id        INTEGER NOT NULL,
    id_record    VARCHAR(450) NOT NULL,
    field_name   VARCHAR(255) NOT NULL,
    ""language""   VARCHAR(16) NOT NULL,
    translation  TEXT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    created_by   VARCHAR(255) NULL,
    updated_at   TIMESTAMP NULL,
    updated_by   VARCHAR(255) NULL,
    CONSTRAINT UX_record_field_translation_key UNIQUE (md_id, id_record, field_name, ""language"")
);";
                connection.Execute(ddl);

                connection.Execute($"CREATE INDEX IF NOT EXISTS IX_record_field_translation_seek ON {quoted} (md_id, \"language\", id_record);");

                if (!string.IsNullOrWhiteSpace(translationJsonFieldName) && IsValidIdentifier(translationJsonFieldName))
                {
                    // PG: ALTER TABLE … ADD COLUMN IF NOT EXISTS supportato da PG 9.6+.
                    string altQuotedCol = "\"" + translationJsonFieldName.Replace("\"", "\"\"") + "\"";
                    connection.Execute($"ALTER TABLE {quoted} ADD COLUMN IF NOT EXISTS {altQuotedCol} TEXT NULL");
                }

                _schemaEnsured = true;
                _schemaEnsuredTable = tableName;
            }
        }

        private static string BuildUpsertSql(string quotedTable)
        {
            return $@"
INSERT INTO {quotedTable}
    (md_id, id_record, field_name, ""language"", translation, created_at, created_by, updated_at, updated_by)
VALUES
    (@mdId, @idRecord, @fieldName, @language, @translation,
     (NOW() AT TIME ZONE 'UTC')::timestamp, @createdBy,
     (NOW() AT TIME ZONE 'UTC')::timestamp, @updatedBy)
ON CONFLICT (md_id, id_record, field_name, ""language"") DO UPDATE SET
    translation = EXCLUDED.translation,
    updated_at  = (NOW() AT TIME ZONE 'UTC')::timestamp,
    updated_by  = EXCLUDED.updated_by;";
        }

        public static void OnInsert(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            _Metadati_Tabelle tableMetadata,
            List<_Metadati_Colonne> metadataColumns,
            IDictionary<string, object> entity,
            string recordId,
            string userId)
        {
            Settings settings = ResolveSettings(tableMetadata);
            if (!settings.Enabled || string.IsNullOrWhiteSpace(recordId) || tableMetadata == null || metadataColumns == null || entity == null)
                return;

            List<string> configuredFields = (settings.FieldNames ?? new List<string>())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (configuredFields.Count == 0) return;

            string tableName = IsValidIdentifier(settings.DefaultTableName) ? settings.DefaultTableName : DefaultTranslationsTableName;
            EnsureSchema(connection, tableName, settings.TranslationJsonFieldName);

            string quotedTable = "\"" + tableName.Replace("\"", "\"\"") + "\"";
            List<string> languages = ResolveLanguages(settings.DefaultLanguage);
            int timeout = ParseTimeout();
            string upsertSql = BuildUpsertSql(quotedTable);

            foreach (string fieldName in configuredFields)
            {
                _Metadati_Colonne column = metadataColumns.FirstOrDefault(x => string.Equals(x.mc_nome_colonna, fieldName, StringComparison.OrdinalIgnoreCase));
                if (column == null || !IsTranslatableTextColumn(column)) continue;
                if (!entity.ContainsKey(column.mc_nome_colonna)) continue;

                string translationValue = RawHelpers.ParseNull(entity[column.mc_nome_colonna]);

                foreach (string language in languages)
                {
                    connection.Execute(upsertSql, new
                    {
                        mdId = tableMetadata.md_id,
                        idRecord = recordId,
                        fieldName = column.mc_nome_colonna,
                        language = language,
                        translation = translationValue,
                        createdBy = userId,
                        updatedBy = userId
                    }, transaction: transaction, commandTimeout: timeout);
                }
            }
        }

        public static void OnUpdate(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            _Metadati_Tabelle tableMetadata,
            List<_Metadati_Colonne> metadataColumns,
            IDictionary<string, object> entity,
            string userId)
        {
            Settings settings = ResolveSettings(tableMetadata);
            if (!settings.Enabled || connection == null || tableMetadata == null || metadataColumns == null || entity == null)
                return;

            _Metadati_Colonne pk = metadataColumns.FirstOrDefault(x => x.mc_is_primary_key);
            if (pk == null || !entity.ContainsKey(pk.mc_nome_colonna) || entity[pk.mc_nome_colonna] == null)
                return;

            string recordId = RawHelpers.ParseNull(entity[pk.mc_nome_colonna]).Trim();
            if (string.IsNullOrWhiteSpace(recordId)) return;

            List<string> configuredFields = (settings.FieldNames ?? new List<string>())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (configuredFields.Count == 0) return;

            var changedFieldNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (entity.ContainsKey("__changes") && entity["__changes"] is IEnumerable<object> changes)
            {
                foreach (object entry in changes)
                {
                    string field = ExtractField(entry);
                    if (!string.IsNullOrWhiteSpace(field)) changedFieldNames.Add(field);
                }
            }
            if (changedFieldNames.Count == 0) return;

            string runtimeLanguage = ResolveRuntimeLanguage(userId, settings.DefaultLanguage);
            string tableName = IsValidIdentifier(settings.DefaultTableName) ? settings.DefaultTableName : DefaultTranslationsTableName;
            EnsureSchema(connection, tableName, settings.TranslationJsonFieldName);
            string quotedTable = "\"" + tableName.Replace("\"", "\"\"") + "\"";
            int timeout = ParseTimeout();
            string upsertSql = BuildUpsertSql(quotedTable);

            foreach (string configuredField in configuredFields)
            {
                _Metadati_Colonne column = metadataColumns.FirstOrDefault(x => string.Equals(x.mc_nome_colonna, configuredField, StringComparison.OrdinalIgnoreCase));
                if (column == null || !IsTranslatableTextColumn(column)) continue;
                if (!changedFieldNames.Contains(column.mc_nome_colonna)) continue;
                if (!entity.ContainsKey(column.mc_nome_colonna)) continue;

                string translationValue = RawHelpers.ParseNull(entity[column.mc_nome_colonna]);

                connection.Execute(upsertSql, new
                {
                    mdId = tableMetadata.md_id,
                    idRecord = recordId,
                    fieldName = column.mc_nome_colonna,
                    language = runtimeLanguage,
                    translation = translationValue,
                    createdBy = userId,
                    updatedBy = userId
                }, transaction: transaction, commandTimeout: timeout);
            }
        }

        public static void OnDelete(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            _Metadati_Tabelle tableMetadata,
            string recordId)
        {
            Settings settings = ResolveSettings(tableMetadata);
            if (!settings.Enabled || tableMetadata == null || string.IsNullOrWhiteSpace(recordId)) return;

            string tableName = IsValidIdentifier(settings.DefaultTableName) ? settings.DefaultTableName : DefaultTranslationsTableName;
            EnsureSchema(connection, tableName, settings.TranslationJsonFieldName);
            string quotedTable = "\"" + tableName.Replace("\"", "\"\"") + "\"";

            string sql = $"DELETE FROM {quotedTable} WHERE md_id = @mdId AND id_record = @idRecord";
            connection.Execute(sql, new { mdId = tableMetadata.md_id, idRecord = recordId },
                transaction: transaction, commandTimeout: ParseTimeout());
        }

        // ─────────────────────────────────────────────────────────────────
        //  Helpers
        // ─────────────────────────────────────────────────────────────────

        private static List<string> ResolveLanguages(string defaultLanguage)
        {
            try
            {
                using (NpgsqlConnection metaConn = metaQueryPostgreSql.GetOpenConnection(true))
                {
                    var langs = metaConn.Query<string>("SELECT DISTINCT id FROM Lingue").ToList();
                    if (langs.Count > 0)
                        return langs.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                }
            }
            catch (Exception ex)
            {
                RawHelpers.logError(ex, "RecordTranslationsPostgres.ResolveLanguages", "Lingue");
            }
            return new List<string> { NormalizeLanguage(defaultLanguage, DefaultLanguageCode) };
        }

        private static string ResolveRuntimeLanguage(string userId, string fallback)
        {
            try
            {
                user u = RawHelpers.getUserFromCookie();
                if (u != null && !string.IsNullOrWhiteSpace(u.language))
                    return NormalizeLanguage(u.language, fallback);
            }
            catch (Exception ex)
            {
                RawHelpers.logError(ex, "RecordTranslationsPostgres.ResolveRuntimeLanguage.cookie", "");
            }

            try
            {
                user u2 = user.getUserByID(userId);
                if (u2 != null && !string.IsNullOrWhiteSpace(u2.language))
                    return NormalizeLanguage(u2.language, fallback);
            }
            catch (Exception ex)
            {
                RawHelpers.logError(ex, "RecordTranslationsPostgres.ResolveRuntimeLanguage.userById", "");
            }

            return NormalizeLanguage(fallback, DefaultLanguageCode);
        }

        private static string NormalizeLanguage(string lang, string fallback)
        {
            if (string.IsNullOrWhiteSpace(lang)) return fallback ?? DefaultLanguageCode;
            return lang.Trim().Replace('_', '-');
        }

        private static bool IsTranslatableTextColumn(_Metadati_Colonne column)
        {
            if (column == null) return false;
            if (column is _Metadati_Colonne_Lookup) return false;
            if (column.mc_is_computed == true) return false;
            string dbType = RawHelpers.ParseNull(column.mc_db_column_type).Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(dbType)) return false;
            // Postgres column types tipici: varchar, character varying, text, char, character.
            // Includo anche nvarchar/ntext per compat con metadata legacy seedati cross-DBMS.
            return dbType == "varchar" || dbType == "character varying" || dbType == "nvarchar" ||
                   dbType == "text" || dbType == "ntext" ||
                   dbType == "char" || dbType == "character" || dbType == "nchar";
        }

        private static string ExtractField(object entry)
        {
            if (entry == null) return null;
            if (entry is IDictionary<string, object> dict
                && dict.TryGetValue("field", out object v) && v != null)
                return RawHelpers.ParseNull(v).Trim();
            if (entry is JObject jo)
            {
                JToken t = jo["field"];
                if (t != null)
                    return RawHelpers.ParseNull(t.ToString()).Trim();
            }
            return null;
        }

        private static int ParseTimeout()
        {
            string raw = ConfigHelper.GetSettingAsString("autoGeneratedQueryTimeout");
            if (int.TryParse(raw, out int n) && n > 0) return n;
            return 30;
        }

        private static bool IsValidIdentifier(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return false;
            foreach (char c in s)
            {
                if (!(char.IsLetterOrDigit(c) || c == '_')) return false;
            }
            return char.IsLetter(s[0]) || s[0] == '_';
        }

        private static string GetConfig(string key)
        {
            try { return ConfigHelper.GetSettingAsString(key); } catch { return null; }
        }

        private static string NullIfBlank(string s) => string.IsNullOrWhiteSpace(s) ? null : s;

        private static bool ParseBool(string s, bool def)
        {
            if (string.IsNullOrWhiteSpace(s)) return def;
            string n = s.Trim().ToLowerInvariant();
            return n == "true" || n == "1" || n == "yes" || n == "on";
        }

        private static List<string> ParseFieldNamesFromConfig()
        {
            var list = new List<string>();
            for (int i = 0; i < 500; i++)
            {
                string indexed = GetConfig("RecordTranslations:FieldNames:" + i);
                if (indexed == null) break;
                string n = RawHelpers.ParseNull(indexed).Trim();
                if (!string.IsNullOrWhiteSpace(n)) list.Add(n);
            }
            string inline = GetConfig("RecordTranslations:FieldNames") ?? GetConfig("recordTranslationsFieldNames");
            if (!string.IsNullOrWhiteSpace(inline))
            {
                string raw = inline.Trim();
                if (raw.StartsWith('[') && raw.EndsWith(']'))
                {
                    try
                    {
                        JArray arr = JArray.Parse(raw);
                        foreach (JToken t in arr)
                        {
                            string v = RawHelpers.ParseNull(t?.ToString()).Trim();
                            if (!string.IsNullOrWhiteSpace(v)) list.Add(v);
                        }
                    }
                    catch { /* csv fallback below */ }
                }
                else
                {
                    foreach (string p in raw.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries))
                    {
                        string v = RawHelpers.ParseNull(p).Trim();
                        if (!string.IsNullOrWhiteSpace(v)) list.Add(v);
                    }
                }
            }
            return list.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }
    }
}
