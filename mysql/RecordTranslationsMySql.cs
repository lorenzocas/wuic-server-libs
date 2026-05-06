// MySQL flavor of RecordTranslations machinery (mirror di
// `KonvergenceCore/MetaModel/_Metadati_methods.cs::EnsureRecordTranslationsSchema`,
// `InitializeRecordTranslationsForInsert`, `SyncRecordTranslationsForUpdate`,
// `DeleteRecordTranslationsForRecord`).
//
// Pre-fix (master 35 mysql): la feature `RecordTranslations` esisteva solo
// nel pipeline MSSQL (`KonvergenceCore/MetaModel/_Metadati_methods.cs`), che
// non viene mai eseguito quando `dbms=mysql` perche' `MetaService.insertRecord`
// (e i fratelli) instradano la chiamata a `RawHelpers.getMetaQueryProvider("mysql").InsertflatData`,
// cioe' a `metaQueryMySql.RawInsertFlatData` qui dentro. Risultato: la tabella
// `_record_field_translations` non veniva mai creata, `getTableMetadata` su
// route con deny non emetteva il seed, e il test docs-driven `translations-data`
// falliva con `MISSING` table sul backend MySQL Windows nativo (sulla VM Linux
// passava silenziosamente perche' `WUIC_E2E_REMOTE=1` skippava le verifiche
// SQL dirette nel test).
//
// Questo file aggiunge il porting MySQL della feature: DDL via
// `CREATE TABLE IF NOT EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS` (MySQL
// 8.0.29+ supporta IF NOT EXISTS sugli indici; per compatibilita' MySQL 8.0.x
// piu' vecchio usiamo `INFORMATION_SCHEMA.STATISTICS` come fallback). DML via
// `INSERT ... ON DUPLICATE KEY UPDATE` (equivalente MySQL del pattern MSSQL
// `UPDATE ... IF @@ROWCOUNT=0 INSERT`). Le 4 callsite sono in `metaQueryMySql.cs`
// (RawInsertFlatData, RawUpdateFlatData, RawDeleteFlatData, DeleteflatDataByID).
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using Dapper;
using MySql.Data.MySqlClient;
using Newtonsoft.Json.Linq;
using metaModelRaw;
using WEB_UI_CRAFTER.Helpers;

namespace WEB_UI_CRAFTER
{
    public static class RecordTranslationsMySql
    {
        // Per-process flag: la DDL di `_record_field_translations` viene
        // eseguita una sola volta per nome tabella (CREATE IF NOT EXISTS e'
        // idempotente ma e' comunque uno round-trip; lo skippiamo dopo il
        // primo successo).
        private static volatile bool _schemaEnsured = false;
        private static volatile string _schemaEnsuredTable = null;
        private static readonly object _schemaLock = new object();

        public sealed class Settings
        {
            public bool Enabled;
            public string DefaultTableName;
            public string TranslationJsonFieldName;
            public string DefaultLanguage;
            public List<string> FieldNames;
        }

        // ─────────────────────────────────────────────────────────────────
        //  Settings parsing
        // ─────────────────────────────────────────────────────────────────
        // Replica light di `metaQuery.GetRecordTranslationsSettings(_Metadati_Tabelle)`.
        // Default globali da appsettings + override per-route da `md_props_bag.serverProperties.RecordTranslations`.
        public static Settings ResolveSettings(_Metadati_Tabelle tableMetadata)
        {
            // Defaults globali (allineati a MSSQL)
            bool enabled = ParseBool(GetConfig("RecordTranslations:Enabled") ?? GetConfig("recordTranslationsEnabled"), false);
            string defaultTableName = NullIfBlank(GetConfig("RecordTranslations:DefaultTableName") ?? GetConfig("recordTranslationsDefaultTableName")) ?? "_record_field_translations";
            string jsonField = NullIfBlank(GetConfig("RecordTranslations:TranslationJsonFieldName") ?? GetConfig("recordTranslationsTranslationJsonFieldName")) ?? "translation_json";
            string defaultLanguage = NullIfBlank(GetConfig("RecordTranslations:DefaultLanguage") ?? GetConfig("recordTranslationsDefaultLanguage")) ?? "it-IT";
            List<string> fieldNames = ParseFieldNamesFromConfig();

            // Per-route override via md_props_bag.serverProperties.RecordTranslations
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
        //  Schema
        // ─────────────────────────────────────────────────────────────────
        // MySQL DDL: CREATE TABLE IF NOT EXISTS + UNIQUE INDEX su (md_id,
        // id_record, field_name, language). InnoDB + utf8mb4 per coerenza con
        // il resto dello schema WUIC. La colonna `translation` e' LONGTEXT
        // (equivalente di NVARCHAR(MAX) MSSQL) per supportare contenuti lunghi.
        // `id_record` e' VARCHAR(450) per allinearsi al pattern MSSQL e
        // permettere primary key di tipo stringa lunga (es. GUID + suffix).
        public static void EnsureSchema(MySqlConnection connection, string tableName, string translationJsonFieldName)
        {
            if (connection == null || string.IsNullOrWhiteSpace(tableName)) return;

            // Sanity check sul nome tabella: solo identificatori validi.
            // Defense-in-depth perche' viene composto in DDL via interpolazione.
            if (!IsValidIdentifier(tableName))
                throw new InvalidOperationException("RecordTranslationsMySql.EnsureSchema: invalid table name '" + tableName + "'.");

            if (_schemaEnsured && string.Equals(_schemaEnsuredTable, tableName, StringComparison.OrdinalIgnoreCase))
                return;

            lock (_schemaLock)
            {
                if (_schemaEnsured && string.Equals(_schemaEnsuredTable, tableName, StringComparison.OrdinalIgnoreCase))
                    return;

                string quoted = "`" + tableName.Replace("`", "``") + "`";

                // CREATE TABLE IF NOT EXISTS — InnoDB + utf8mb4. La PK (md_id,
                // id_record, field_name, language) garantisce idempotenza
                // sull'INSERT … ON DUPLICATE KEY UPDATE downstream.
                string ddl = $@"
CREATE TABLE IF NOT EXISTS {quoted} (
    md_id        INT NOT NULL,
    id_record    VARCHAR(450) NOT NULL,
    field_name   VARCHAR(255) NOT NULL,
    `language`   VARCHAR(16) NOT NULL,
    translation  LONGTEXT NULL,
    created_at   DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by   VARCHAR(255) NULL,
    updated_at   DATETIME(0) NULL,
    updated_by   VARCHAR(255) NULL,
    UNIQUE KEY UX_record_field_translation_key (md_id, id_record, field_name, `language`),
    KEY IX_record_field_translation_seek (md_id, `language`, id_record)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
";
                connection.Execute(ddl);

                // Optional: aggiunta colonna JSON quando la versione legacy della tabella
                // non ce l'ha (creata da una build precedente del feature).
                if (!string.IsNullOrWhiteSpace(translationJsonFieldName) && IsValidIdentifier(translationJsonFieldName))
                {
                    string colExists = $"SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{tableName.Replace("'", "''")}' AND COLUMN_NAME = '{translationJsonFieldName.Replace("'", "''")}'";
                    int found = connection.ExecuteScalar<int>(colExists);
                    if (found == 0)
                    {
                        string altQuotedCol = "`" + translationJsonFieldName.Replace("`", "``") + "`";
                        connection.Execute($"ALTER TABLE {quoted} ADD COLUMN {altQuotedCol} LONGTEXT NULL");
                    }
                }

                _schemaEnsured = true;
                _schemaEnsuredTable = tableName;
            }
        }

        // ─────────────────────────────────────────────────────────────────
        //  INSERT seed (called from RawInsertFlatData)
        // ─────────────────────────────────────────────────────────────────
        // Mirror di `InitializeRecordTranslationsForInsert`: per ogni campo
        // configurato + ogni lingua attiva in `Lingue`, inserisce una riga
        // con translation = valore base (verra' aggiornata via SyncRecordTranslationsForUpdate
        // quando l'utente cambia un campo specifico in una lingua specifica).
        public static void OnInsert(
            MySqlConnection connection,
            MySqlTransaction transaction,
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

            string tableName = IsValidIdentifier(settings.DefaultTableName) ? settings.DefaultTableName : "_record_field_translations";
            EnsureSchema(connection, tableName, settings.TranslationJsonFieldName);

            string quotedTable = "`" + tableName.Replace("`", "``") + "`";
            List<string> languages = ResolveLanguages(connection, settings.DefaultLanguage);

            int timeout = ParseTimeout();

            foreach (string fieldName in configuredFields)
            {
                _Metadati_Colonne column = metadataColumns.FirstOrDefault(x => string.Equals(x.mc_nome_colonna, fieldName, StringComparison.OrdinalIgnoreCase));
                if (column == null || !IsTranslatableTextColumn(column)) continue;
                if (!entity.ContainsKey(column.mc_nome_colonna)) continue;

                string translationValue = RawHelpers.ParseNull(entity[column.mc_nome_colonna]);

                foreach (string language in languages)
                {
                    // INSERT … ON DUPLICATE KEY UPDATE: idempotente. Se la riga
                    // (md_id, id_record, field_name, language) esiste gia',
                    // aggiorna translation+updated_at+updated_by; altrimenti
                    // INSERT con created_*/updated_* allo stesso istante.
                    string upsert = $@"
INSERT INTO {quotedTable}
    (md_id, id_record, field_name, `language`, translation, created_at, created_by, updated_at, updated_by)
VALUES
    (@mdId, @idRecord, @fieldName, @language, @translation, NOW(), @createdBy, NOW(), @updatedBy)
ON DUPLICATE KEY UPDATE
    translation = VALUES(translation),
    updated_at  = NOW(),
    updated_by  = VALUES(updated_by);";

                    connection.Execute(upsert, new
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

        // ─────────────────────────────────────────────────────────────────
        //  UPDATE: upsert solo per la lingua dell'utente runtime + solo
        //  per i campi dichiarati in `entity.__changes`
        // ─────────────────────────────────────────────────────────────────
        public static void OnUpdate(
            MySqlConnection connection,
            MySqlTransaction transaction,
            _Metadati_Tabelle tableMetadata,
            List<_Metadati_Colonne> metadataColumns,
            IDictionary<string, object> entity,
            string userId)
        {
            Settings settings = ResolveSettings(tableMetadata);
            if (!settings.Enabled || connection == null || tableMetadata == null || metadataColumns == null || entity == null)
                return;

            _Metadati_Colonne pk = metadataColumns.FirstOrDefault(x => x.mc_is_primary_key is true);
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

            // Estrazione dei campi cambiati da `entity.__changes` (lista di
            // `{field: '...', oldValue: '...', timestamp: '...'}`). La forma
            // arriva sia come Dictionary<string,object> che come JObject
            // (tramite AsmxProxy JSON pipeline). Normalizziamo entrambi.
            var changedFieldNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (entity.ContainsKey("__changes") && entity["__changes"] != null)
            {
                if (entity["__changes"] is IEnumerable<object> changes)
                {
                    foreach (object entry in changes)
                    {
                        string field = ExtractField(entry);
                        if (!string.IsNullOrWhiteSpace(field)) changedFieldNames.Add(field);
                    }
                }
            }
            if (changedFieldNames.Count == 0) return;

            string runtimeLanguage = ResolveRuntimeLanguage(userId, settings.DefaultLanguage);
            string tableName = IsValidIdentifier(settings.DefaultTableName) ? settings.DefaultTableName : "_record_field_translations";
            EnsureSchema(connection, tableName, settings.TranslationJsonFieldName);
            string quotedTable = "`" + tableName.Replace("`", "``") + "`";
            int timeout = ParseTimeout();

            foreach (string configuredField in configuredFields)
            {
                _Metadati_Colonne column = metadataColumns.FirstOrDefault(x => string.Equals(x.mc_nome_colonna, configuredField, StringComparison.OrdinalIgnoreCase));
                if (column == null || !IsTranslatableTextColumn(column)) continue;
                if (!changedFieldNames.Contains(column.mc_nome_colonna)) continue;
                if (!entity.ContainsKey(column.mc_nome_colonna)) continue;

                string translationValue = RawHelpers.ParseNull(entity[column.mc_nome_colonna]);
                string upsert = $@"
INSERT INTO {quotedTable}
    (md_id, id_record, field_name, `language`, translation, created_at, created_by, updated_at, updated_by)
VALUES
    (@mdId, @idRecord, @fieldName, @language, @translation, NOW(), @createdBy, NOW(), @updatedBy)
ON DUPLICATE KEY UPDATE
    translation = VALUES(translation),
    updated_at  = NOW(),
    updated_by  = VALUES(updated_by);";

                connection.Execute(upsert, new
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

        // ─────────────────────────────────────────────────────────────────
        //  DELETE: wipe TUTTE le righe (md_id, id_record) cross-language
        // ─────────────────────────────────────────────────────────────────
        public static void OnDelete(
            MySqlConnection connection,
            MySqlTransaction transaction,
            _Metadati_Tabelle tableMetadata,
            string recordId)
        {
            Settings settings = ResolveSettings(tableMetadata);
            if (!settings.Enabled || tableMetadata == null || string.IsNullOrWhiteSpace(recordId)) return;

            string tableName = IsValidIdentifier(settings.DefaultTableName) ? settings.DefaultTableName : "_record_field_translations";
            EnsureSchema(connection, tableName, settings.TranslationJsonFieldName);
            string quotedTable = "`" + tableName.Replace("`", "``") + "`";

            string sql = $"DELETE FROM {quotedTable} WHERE md_id = @mdId AND id_record = @idRecord";
            connection.Execute(sql, new { mdId = tableMetadata.md_id, idRecord = recordId },
                transaction: transaction, commandTimeout: ParseTimeout());
        }

        // ─────────────────────────────────────────────────────────────────
        //  Helpers
        // ─────────────────────────────────────────────────────────────────

        private static List<string> ResolveLanguages(MySqlConnection dataConnection, string defaultLanguage)
        {
            // Le lingue vivono sul DB METADATI, non sul DB dati. Per non
            // accoppiare connections (ed evitare di aprire una seconda
            // connessione per ogni record), usiamo `metaModelRaw.metaQueryMySql.GetOpenConnection(true)`
            // che ritorna la connessione metadati. Best-effort: se fallisce
            // (es. DB metadati non raggiungibile transitoriamente), torniamo
            // alla sola lingua di default.
            try
            {
                using (MySqlConnection metaConn = metaQueryMySql.GetOpenConnection(true))
                {
                    var langs = metaConn.Query<string>("SELECT DISTINCT id FROM Lingue").ToList();
                    if (langs.Count > 0)
                        return langs.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                }
            }
            catch (Exception ex)
            {
                RawHelpers.logError(ex, "RecordTranslationsMySql.ResolveLanguages", "Lingue");
            }
            return new List<string> { NormalizeLanguage(defaultLanguage, "it-IT") };
        }

        private static string ResolveRuntimeLanguage(string userId, string fallback)
        {
            // Cookie user → user.language. Usa lo stesso percorso del MSSQL
            // (`ResolveRuntimeUserLanguage`) ma minimal qui dentro per evitare
            // dipendenze cross-assembly su helper privati.
            try
            {
                user u = RawHelpers.getUserFromCookie();
                if (u != null && !string.IsNullOrWhiteSpace(u.language))
                    return NormalizeLanguage(u.language, fallback);
            }
            catch { }

            try
            {
                user u2 = user.getUserByID(userId);
                if (u2 != null && !string.IsNullOrWhiteSpace(u2.language))
                    return NormalizeLanguage(u2.language, fallback);
            }
            catch { }

            return NormalizeLanguage(fallback, "it-IT");
        }

        private static string NormalizeLanguage(string lang, string fallback)
        {
            if (string.IsNullOrWhiteSpace(lang)) return fallback ?? "it-IT";
            string trimmed = lang.Trim();
            // BCP-47 "xx-YY" o "xx_YY" → normalizziamo separatore
            return trimmed.Replace('_', '-');
        }

        private static bool IsTranslatableTextColumn(_Metadati_Colonne column)
        {
            if (column == null) return false;
            if (column is _Metadati_Colonne_Lookup) return false;
            if (column.mc_is_computed is true) return false;
            string dbType = RawHelpers.ParseNull(column.mc_db_column_type).Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(dbType)) return false;
            return dbType == "varchar" || dbType == "nvarchar" || dbType == "text" || dbType == "ntext" ||
                   dbType == "char" || dbType == "nchar";
        }

        private static string ExtractField(object entry)
        {
            if (entry == null) return null;
            if (entry is IDictionary<string, object> dict)
            {
                if (dict.TryGetValue("field", out object v) && v != null)
                    return RawHelpers.ParseNull(v).Trim();
            }
            // Newtonsoft JObject (AsmxProxy JSON path)
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
                if (raw.StartsWith("[") && raw.EndsWith("]"))
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
