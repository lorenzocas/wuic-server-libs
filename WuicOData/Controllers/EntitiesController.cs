using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OData.Deltas;
using Microsoft.AspNetCore.OData.Query;
using Microsoft.AspNetCore.OData.Routing.Controllers;
using Microsoft.AspNetCore.OData.Routing;
using WuicCore.Server.Database;
using WuicCore.Server.Database.Models;
using Microsoft.AspNetCore.OData.Results;
using WuicCore.Server.Api.Infrastructure.Exceptions;
using WuicCore.Server.Api.Infrastructure.Errors;
using WuicCore.Server.Api.Infrastructure.Logging;
using Microsoft.Extensions.Logging;
using System.Threading;
using System.Linq;
using Microsoft.AspNetCore.OData.Extensions;
using Microsoft.AspNetCore.OData.Formatter.Value;
using Microsoft.OData.Edm;
using System.Data.Common;
using Microsoft.OData.UriParser;
using System.Collections.Generic;
using System.Reflection;
using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;
using System.Globalization;
using System.Text.Json;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Storage;
using WuicCore.Server.Api.Models;
using WuicOData.Services;

namespace WuicCore.Controllers
{
    [Route("")]
    public partial class EntitiesController : ODataController
    {
        private readonly ILogger<EntitiesController> _logger;
        private readonly DynamicContext _context;
        private readonly DynamicModelService _dynamicModelService;
        private static readonly JsonSerializerOptions CaseInsensitiveJsonOptions = new()
        {
            PropertyNameCaseInsensitive = true
        };

        public EntitiesController(ILogger<EntitiesController> logger, DynamicContext context, DynamicModelService dynamicModelService)
        {
            _logger = logger;
            _context = context;
            _dynamicModelService = dynamicModelService;
        }

        [HttpGet("odata/{entityset}")]
        public IActionResult Get(string entityset)
        {
            Type t = ResolveEntityType(entityset);

            if (t == null)
                return NotFound($"Unknown entity set '{entityset}' (CLR type not found).");

            var set = GetEntitySet(t);
            if (set is not IQueryable queryable)
                return BadRequest($"Entity set '{entityset}' is not queryable.");

            var forcedTop = TryGetForcedTopFromMetadata(entityset);
            var hasClientQueryOptions = Request.Query.Keys.Any(k =>
                string.Equals(k, "$top", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(k, "$skip", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(k, "$filter", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(k, "$select", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(k, "$orderby", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(k, "$expand", StringComparison.OrdinalIgnoreCase));

            // Keep metadata page size only for plain listing, not for explicit OData-shaped queries.
            if (forcedTop.HasValue && forcedTop.Value > 0 && !hasClientQueryOptions)
            {
                var takeMethod = typeof(Queryable)
                    .GetMethods()
                    .First(m => m.Name == nameof(Queryable.Take) && m.GetParameters().Length == 2)
                    .MakeGenericMethod(t);

                queryable = (IQueryable)takeMethod.Invoke(null, new object[] { queryable, forcedTop.Value });
            }

            try
            {
                var model = Request.GetModel() ?? ApplicationEdmModel.GetEdmModel(_dynamicModelService);
                var queryContext = new ODataQueryContext(model, t, new ODataPath());
                var queryOptions = new ODataQueryOptions(queryContext, Request);
                var settings = new ODataQuerySettings
                {
                    HandleNullPropagation = HandleNullPropagationOption.False
                };

                // Apply non-projection options with OData query machinery.
                var applied = ApplyNonSelectQueryOptions(queryable, queryOptions, settings);

                // On dynamic MVC route the default serializer can hang on OData wrappers for $select.
                // Materialize and project explicitly when only $select is requested.
                if (HasSelectWithoutExpand(queryOptions))
                {
                    var projected = ProjectQueryableToSelectedColumns(applied, t, queryOptions.SelectExpand.RawSelect);
                    return Ok(projected);
                }

                return Ok(applied);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Invalid OData query options for entity set '{EntitySet}'.", entityset);
                return BadRequest($"Invalid OData query options: {ex.Message}");
            }
        }

        [HttpPost("odata/{entityset}")]
        public async Task<IActionResult> Post(string entityset)
        {
            var writeFlags = TryGetWriteFlagsFromMetadata(entityset);
            if (!writeFlags.HasValue || !writeFlags.Value.EnableInsert)
                return Forbid();

            Type t = ResolveEntityType(entityset);
            if (t == null)
                return NotFound($"Unknown entity set '{entityset}' (CLR type not found).");

            var payloadResolution = await ResolvePayloadObjectAsync();
            if (!payloadResolution.Ok)
                return payloadResolution.Error;
            var payload = payloadResolution.Payload;

            var insertResult = await InsertEntityWithSqlAsync(t, payload);
            if (!insertResult.Ok)
                return BadRequest(insertResult.Error);

            return StatusCode(StatusCodes.Status201Created, insertResult.Entity ?? new { inserted = true });
        }

        [HttpPatch("odata/{entityset}({key})")]
        public async Task<IActionResult> Patch(string entityset, string key)
        {
            var writeFlags = TryGetWriteFlagsFromMetadata(entityset);
            if (!writeFlags.HasValue || !writeFlags.Value.EnableEdit)
                return Forbid();

            Type t = ResolveEntityType(entityset);
            if (t == null)
                return NotFound($"Unknown entity set '{entityset}' (CLR type not found).");

            var keyInfo = GetSingleKeyInfo(t);
            if (keyInfo.ErrorResult != null)
                return keyInfo.ErrorResult;

            object convertedKey;
            try
            {
                convertedKey = ConvertKeyValue(key, keyInfo.KeyType);
            }
            catch (Exception ex)
            {
                return BadRequest($"Invalid key '{key}': {ex.Message}");
            }

            var existing = await _context.FindAsync(t, convertedKey);
            if (existing == null)
                return NotFound();

            var payloadResolution = await ResolvePayloadObjectAsync();
            if (!payloadResolution.Ok)
                return payloadResolution.Error;
            var payload = payloadResolution.Payload;

            ApplyJsonObjectToEntity(existing, payload, keyInfo.KeyName);

            await _context.SaveChangesAsync();
            return Ok(existing);
        }

        [HttpDelete("odata/{entityset}({key})")]
        public async Task<IActionResult> Delete(string entityset, string key)
        {
            var writeFlags = TryGetWriteFlagsFromMetadata(entityset);
            if (!writeFlags.HasValue || !writeFlags.Value.EnableDelete)
                return Forbid();

            Type t = ResolveEntityType(entityset);
            if (t == null)
                return NotFound($"Unknown entity set '{entityset}' (CLR type not found).");

            var keyInfo = GetSingleKeyInfo(t);
            if (keyInfo.ErrorResult != null)
                return keyInfo.ErrorResult;

            object convertedKey;
            try
            {
                convertedKey = ConvertKeyValue(key, keyInfo.KeyType);
            }
            catch (Exception ex)
            {
                return BadRequest($"Invalid key '{key}': {ex.Message}");
            }

            var existing = await _context.FindAsync(t, convertedKey);
            if (existing == null)
                return NotFound();

            _context.Remove(existing);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        private Type ResolveEntityType(string entityset)
        {
            // Resolve the CLR type from the EF model first: this works for both
            Type t = _context.Model
                .GetEntityTypes()
                .Select(et => et.ClrType)
                .FirstOrDefault(ct => ct != null && string.Equals(ct.Name, entityset, StringComparison.OrdinalIgnoreCase));

            // Fallback for cases where the entity type is not exposed in the current EF model snapshot.
            t ??= AppDomain.CurrentDomain.GetAssemblies()
                .Select(a => a.GetType($"WuicCore.Server.Database.Models.{entityset}", throwOnError: false, ignoreCase: true))
                .FirstOrDefault(x => x != null);

            return t;
        }

        private object GetEntitySet(Type entityType)
        {
            var method = _context
                .GetType()
                .GetMethods()
                .First(x => x.IsGenericMethod && x.Name == "Set");

            MethodInfo generic = method.MakeGenericMethod(entityType);
            return generic.Invoke(_context, null);
        }

        private (string KeyName, Type KeyType, IActionResult ErrorResult) GetSingleKeyInfo(Type entityType)
        {
            var efEntity = _context.Model.FindEntityType(entityType);
            var pk = efEntity?.FindPrimaryKey();

            if (pk == null || pk.Properties == null || pk.Properties.Count == 0)
                return (null, null, BadRequest($"Entity '{entityType.Name}' has no primary key."));

            if (pk.Properties.Count != 1)
                return (null, null, BadRequest($"Entity '{entityType.Name}' has a composite key, not supported by this endpoint."));

            var keyProp = pk.Properties[0];
            return (keyProp.Name, keyProp.ClrType, null);
        }

        private static object ConvertKeyValue(string key, Type targetType)
        {
            ArgumentNullException.ThrowIfNull(targetType);

            var source = (key ?? string.Empty).Trim();
            var nonNullable = Nullable.GetUnderlyingType(targetType) ?? targetType;

            if (nonNullable == typeof(string))
            {
                if (source.Length >= 2 && source.StartsWith('\'') && source.EndsWith('\''))
                    source = source.Substring(1, source.Length - 2).Replace("''", "'");

                return Uri.UnescapeDataString(source);
            }

            if (nonNullable == typeof(Guid))
            {
                if (source.Length >= 2 && source.StartsWith('\'') && source.EndsWith('\''))
                    source = source.Substring(1, source.Length - 2);

                return Guid.Parse(source);
            }

            if (nonNullable.IsEnum)
                return Enum.Parse(nonNullable, source, ignoreCase: true);

            return Convert.ChangeType(source, nonNullable, CultureInfo.InvariantCulture);
        }

        private static void ApplyJsonObjectToEntity(object entity, JsonElement payload, string skipPropertyName = null)
        {
            if (entity == null || payload.ValueKind != JsonValueKind.Object)
                return;

            var props = entity.GetType()
                .GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .ToDictionary(p => p.Name, p => p, StringComparer.OrdinalIgnoreCase);

            foreach (var item in payload.EnumerateObject())
            {
                if (!props.TryGetValue(item.Name, out var p) || !p.CanWrite)
                    continue;

                if (!string.IsNullOrEmpty(skipPropertyName) &&
                    string.Equals(p.Name, skipPropertyName, StringComparison.OrdinalIgnoreCase))
                    continue;

                // Skip collection/navigation-like assignments in generic payload mapping.
                if (p.PropertyType != typeof(string) &&
                    typeof(System.Collections.IEnumerable).IsAssignableFrom(p.PropertyType))
                    continue;

                try
                {
                    object parsed = JsonSerializer.Deserialize(item.Value.GetRawText(), p.PropertyType, CaseInsensitiveJsonOptions);
                    p.SetValue(entity, parsed);
                }
                catch
                {
                    // Ignore invalid/unsupported fields to keep generic endpoint resilient.
                }
            }
        }

        private static IQueryable ApplyNonSelectQueryOptions(IQueryable source, ODataQueryOptions options, ODataQuerySettings settings)
        {
            IQueryable query = source;

            if (options.Filter != null)
                query = options.Filter.ApplyTo(query, settings);

            if (options.OrderBy != null)
                query = options.OrderBy.ApplyTo(query, settings);

            if (options.Skip != null)
                query = options.Skip.ApplyTo(query, settings);

            if (options.Top != null)
                query = options.Top.ApplyTo(query, settings);

            return query;
        }

        private static bool HasSelectWithoutExpand(ODataQueryOptions options)
        {
            if (options?.SelectExpand == null)
                return false;

            var rawSelect = options.SelectExpand.RawSelect;
            var rawExpand = options.SelectExpand.RawExpand;
            return !string.IsNullOrWhiteSpace(rawSelect) && string.IsNullOrWhiteSpace(rawExpand);
        }

        private static IEnumerable<IDictionary<string, object>> ProjectQueryableToSelectedColumns(IQueryable source, Type entityType, string rawSelect)
        {
            var selected = (rawSelect ?? string.Empty)
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (selected.Count == 0)
                return Array.Empty<IDictionary<string, object>>();

            var props = entityType
                .GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .ToDictionary(p => p.Name, p => p, StringComparer.OrdinalIgnoreCase);

            var rows = source.Cast<object>().ToList();
            var result = new List<IDictionary<string, object>>(rows.Count);

            foreach (var row in rows)
            {
                var item = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                foreach (var column in selected)
                {
                    if (props.TryGetValue(column, out var p))
                        item[column] = p.GetValue(row);
                }

                result.Add(item);
            }

            return result;
        }

        private async Task<(bool Ok, JsonElement Payload, IActionResult Error)> ResolvePayloadObjectAsync()
        {
            Request.EnableBuffering();
            if (Request.Body.CanSeek)
                Request.Body.Position = 0;

            string raw;
            using (var reader = new StreamReader(Request.Body, leaveOpen: true))
            {
                raw = await reader.ReadToEndAsync();
            }

            if (Request.Body.CanSeek)
                Request.Body.Position = 0;

            if (string.IsNullOrWhiteSpace(raw))
                return (false, default, BadRequest("Request body is empty."));

            try
            {
                using var doc = JsonDocument.Parse(raw);
                if (doc.RootElement.ValueKind != JsonValueKind.Object)
                    return (false, default, BadRequest("Payload must be a JSON object."));

                return (true, doc.RootElement.Clone(), null);
            }
            catch (Exception ex)
            {
                return (false, default, BadRequest($"Invalid JSON payload: {ex.Message}"));
            }
        }

        private async Task<(bool Ok, object Entity, string Error)> InsertEntityWithSqlAsync(Type entityType, JsonElement payload)
        {
            var efEntity = _context.Model.FindEntityType(entityType);
            if (efEntity == null)
                return (false, null, $"EF metadata not found for '{entityType.Name}'.");

            var tableName = efEntity.GetTableName();
            var schema = efEntity.GetSchema() ?? "dbo";
            if (string.IsNullOrWhiteSpace(tableName))
                return (false, null, $"Table mapping not found for '{entityType.Name}'.");

            var store = StoreObjectIdentifier.Table(tableName, schema);
            var key = efEntity.FindPrimaryKey();
            var keyProp = key?.Properties?.Count == 1 ? key.Properties[0] : null;
            var keyColumn = keyProp?.GetColumnName(store);

            var blockedColumns = await GetNonInsertableColumnsAsync(schema, tableName);

            var propMap = efEntity.GetProperties()
                .Select(p => new
                {
                    Property = entityType.GetProperty(p.Name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase),
                    PropertyName = p.Name,
                    ColumnName = p.GetColumnName(store)
                })
                .Where(x => x.Property != null && x.Property.CanWrite && !string.IsNullOrWhiteSpace(x.ColumnName))
                .ToDictionary(x => x.PropertyName, x => x, StringComparer.OrdinalIgnoreCase);

            var columns = new List<string>();
            var paramNames = new List<string>();
            var values = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            int i = 0;

            foreach (var item in payload.EnumerateObject())
            {
                if (!propMap.TryGetValue(item.Name, out var mapped))
                    continue;

                if (keyProp != null && string.Equals(mapped.PropertyName, keyProp.Name, StringComparison.OrdinalIgnoreCase))
                    continue;

                if (blockedColumns.Contains(mapped.ColumnName))
                    continue;

                object parsed;
                try
                {
                    parsed = JsonSerializer.Deserialize(item.Value.GetRawText(), mapped.Property.PropertyType, CaseInsensitiveJsonOptions);
                }
                catch
                {
                    continue;
                }

                var pn = $"@p{i++}";
                columns.Add($"[{mapped.ColumnName}]");
                paramNames.Add(pn);
                values[pn] = parsed ?? DBNull.Value;
            }

            if (columns.Count == 0)
                return (false, null, "No insertable fields found in payload.");

            var sql = $"INSERT INTO [{schema}].[{tableName}] ({string.Join(", ", columns)})";
            if (!string.IsNullOrWhiteSpace(keyColumn))
                sql += $" OUTPUT INSERTED.[{keyColumn}]";
            sql += $" VALUES ({string.Join(", ", paramNames)});";

            var conn = (SqlConnection)_context.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync();

            using var cmd = conn.CreateCommand();
            cmd.CommandText = sql;
            var currentTx = _context.Database.CurrentTransaction?.GetDbTransaction();
            if (currentTx is SqlTransaction sqlTx)
                cmd.Transaction = sqlTx;

            foreach (var kv in values)
            {
                var p = cmd.CreateParameter();
                p.ParameterName = kv.Key;
                p.Value = kv.Value;
                cmd.Parameters.Add(p);
            }

            object insertedKey = null;
            if (!string.IsNullOrWhiteSpace(keyColumn))
                insertedKey = await cmd.ExecuteScalarAsync();
            else
                await cmd.ExecuteNonQueryAsync();

            var response = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in payload.EnumerateObject())
                response[item.Name] = item.Value.ValueKind == JsonValueKind.Null ? null : item.Value.ToString();

            if (keyProp != null && insertedKey != null && insertedKey != DBNull.Value)
                response[keyProp.Name] = insertedKey;

            return (true, response, null);
        }

        private async Task<HashSet<string>> GetNonInsertableColumnsAsync(string schema, string tableName)
        {
            var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var conn = (SqlConnection)_context.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync();

            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT c.name
                FROM sys.columns c
                INNER JOIN sys.tables t ON t.object_id = c.object_id
                INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
                WHERE s.name = @schema
                  AND t.name = @table
                  AND (c.generated_always_type <> 0 OR c.is_identity = 1 OR c.is_computed = 1);";

            var pSchema = cmd.CreateParameter();
            pSchema.ParameterName = "@schema";
            pSchema.Value = schema;
            cmd.Parameters.Add(pSchema);

            var pTable = cmd.CreateParameter();
            pTable.ParameterName = "@table";
            pTable.Value = tableName;
            cmd.Parameters.Add(pTable);

            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                if (!await reader.IsDBNullAsync(0))
                    result.Add(reader.GetString(0));
            }

            return result;
        }

        private struct WriteFlags
        {
            public bool EnableInsert { get; set; }
            public bool EnableEdit { get; set; }
            public bool EnableDelete { get; set; }
        }

        private static WriteFlags? TryGetWriteFlagsFromMetadata(string entityset)
        {
            try
            {
                string conStr = WuicOData.Configurator.LoadKonvergenceConnectionString("MetaDataSQLConnection");

                using var connection = new SqlConnection(conStr);
                using var cmd = connection.CreateCommand();
                cmd.CommandText = @"
                        SELECT TOP 1
                            mdserviceenableinsert,
                            mdserviceenableedit,
                            mdserviceenabledelete
                        FROM _metadati__tabelle
                        WHERE mdexposeinwebapi = 1
                          AND (mdroutename = @name OR md_nome_tabella = @name)
                        ORDER BY md_id";

                var p = cmd.CreateParameter();
                p.ParameterName = "@name";
                p.Value = entityset;
                cmd.Parameters.Add(p);

                if (cmd.Connection.State != System.Data.ConnectionState.Open)
                    cmd.Connection.Open();

                using var reader = cmd.ExecuteReader();
                if (!reader.Read())
                    return null;

                return new WriteFlags
                {
                    EnableInsert = !reader.IsDBNull(0) && Convert.ToBoolean(reader.GetValue(0)),
                    EnableEdit = !reader.IsDBNull(1) && Convert.ToBoolean(reader.GetValue(1)),
                    EnableDelete = !reader.IsDBNull(2) && Convert.ToBoolean(reader.GetValue(2))
                };
            }
            catch
            {
                // Fail-safe: if metadata cannot be read, do not enable write operations.
                return null;
            }
        }

        private static int? TryGetForcedTopFromMetadata(string entityset)
        {
            try
            {
                string conStr = WuicOData.Configurator.LoadKonvergenceConnectionString("MetaDataSQLConnection");

                using var connection = new SqlConnection(conStr);
                using var cmd = connection.CreateCommand();
                cmd.CommandText = @"
                        SELECT TOP 1
                            COALESCE(NULLIF(mdservicepagesize, 0), NULLIF(mdpagesize, 0))
                        FROM _metadati__tabelle
                        WHERE mdexposeinwebapi = 1
                        AND (mdroutename = @name OR md_nome_tabella = @name)
                        ORDER BY md_id";

                var p = cmd.CreateParameter();
                p.ParameterName = "@name";
                p.Value = entityset;
                cmd.Parameters.Add(p);

                if (cmd.Connection.State != System.Data.ConnectionState.Open)
                    cmd.Connection.Open();

                var value = cmd.ExecuteScalar();
                if (value == null || value == DBNull.Value)
                    return null;

                return Convert.ToInt32(value);
            }
            catch
            {
                // Metadata lookup is best-effort: OData query must still work without forced top.
                return null;
            }
        }

        //// Get entityset
        //// odata/{datasource}/{entityset}
        //    // Get entity set's EDM type: A collection type.

        //    //Set the SelectExpandClause on OdataFeature to include navigation property set in the $expand

        //    // Create an untyped collection with the EDM collection type.

        //    // Add untyped objects to collection.



        //    //At this point, we should have valid entity segment and entity type.
        //    //If there is invalid entity in the query, then OData routing should return 404 error before executing this api

        //    //Set the SelectExpand Clause on the ODataFeature otherwise  Odata formatter won't show the expand and select properties in the response.

        #region People

        //[EnableQuery]

        //[EnableQuery]













        //        .CurrentValues














        #endregion People

    }
}
