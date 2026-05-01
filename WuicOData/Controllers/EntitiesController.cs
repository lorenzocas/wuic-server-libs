using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OData.Deltas;
using Microsoft.AspNetCore.OData.Query;
using Microsoft.AspNetCore.OData.Routing.Controllers;
using Microsoft.AspNetCore.OData.Routing;
using WuicCore.Server.Database;
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

                // $count=true opt-in OData v4 inline-count.
                //
                // Se il client passa `$count=true` ritorniamo il wrapper OData v4
                // standard `{ "value": [...], "@odata.count": N }`, dove N e' il
                // totale calcolato sull'IQueryable dopo `$filter`/`$orderby` ma
                // PRIMA di `$skip`/`$top` (cosi' il pager UI ha il count reale
                // del dataset filtrato, non solo della pagina corrente).
                //
                // Opt-in esplicito: tutte le request *senza* $count continuano a
                // ricevere il plain array `[...]` (shape storica). Questo evita
                // di rompere i consumer client legacy (DataProviderOdataService,
                // data-provider-webservice, ecc.) che leggono `response as any[]`
                // direttamente. Il nuovo wrapper viene usato solo dai consumer
                // nuovi (es. Pattern 3c example) che esplicitamente richiedono
                // $count=true e sanno de-wrappare.
                var wantsCount = queryOptions.Count != null && queryOptions.Count.Value;

                if (wantsCount)
                {
                    // 1) $filter + $orderby sulla query base (no paging ancora).
                    var filtered = ApplyFilterAndOrderBy(queryable, queryOptions, settings);

                    // 2) count sul filtrato (prima di skip/top).
                    var totalCount = CountIQueryable(filtered, t);

                    // 3) $skip + $top per ottenere la pagina richiesta.
                    var paged = ApplySkipAndTop(filtered, queryOptions, settings);

                    // 4) $expand -> `.Include(navProp)` EF Core. Lo facciamo
                    //    DOPO skip/top per ridurre il numero di JOIN al solo
                    //    sottoinsieme della pagina (EF traduce in LEFT JOIN
                    //    sul subquery paginata).
                    paged = ApplyOdataExpandAsEfInclude(paged, t, queryOptions);

                    object valueArray;
                    if (HasSelectWithoutExpand(queryOptions))
                    {
                        valueArray = ProjectQueryableToSelectedColumns(paged, t, queryOptions.SelectExpand.RawSelect);
                    }
                    else
                    {
                        // Materializza esplicitamente per evitare che il
                        // serializer provi a valutare l'IQueryable dopo aver
                        // emesso il wrapper (causerebbe doppie enumerazioni).
                        valueArray = MaterializeIQueryable(paged, t);
                    }

                    return Ok(new Dictionary<string, object>
                    {
                        ["@odata.count"] = totalCount,
                        ["value"] = valueArray
                    });
                }

                // Apply non-projection options with OData query machinery.
                var applied = ApplyNonSelectQueryOptions(queryable, queryOptions, settings);

                // On dynamic MVC route the default serializer can hang on OData wrappers for $select.
                // Materialize and project explicitly when only $select is requested.
                if (HasSelectWithoutExpand(queryOptions))
                {
                    var projected = ProjectQueryableToSelectedColumns(applied, t, queryOptions.SelectExpand.RawSelect);
                    return Ok(projected);
                }

                // $expand -> `.Include(navProp)` EF Core (caso non-wrapped).
                applied = ApplyOdataExpandAsEfInclude(applied, t, queryOptions);

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
            // Resolve the CLR type FIRST so we can derive the real SQL table
            // name to look up metadata flags. The OData EntitySet name is
            // PascalCase (e.g. "E2eOdataDemo") via MetadataModelGenerator.ToPascalCase,
            // but `_metadati__tabelle.mdroutename` / `md_nome_tabella` use the
            // original SQL table name (`_e2e_odata_demo`). Without this step
            // TryGetWriteFlagsFromMetadata cannot find the row → returns null
            // → CUD is silently denied.
            Type t = ResolveEntityType(entityset);
            if (t == null)
                return NotFound($"Unknown entity set '{entityset}' (CLR type not found).");

            var lookupName = ResolveMetadataLookupName(t, entityset);
            var writeFlags = TryGetWriteFlagsFromMetadata(lookupName);
            if (!writeFlags.HasValue || !writeFlags.Value.EnableInsert)
                // Use plain StatusCode(403) instead of Forbid() because
                // WUIC does not register an ASP.NET authentication scheme
                // by default (uses the custom k-user middleware in
                // Startup.cs:HydrateLegacyPrincipalFromKUserCookie). When
                // Forbid() falls through to AuthenticationService.ForbidAsync
                // it throws "No authenticationScheme was specified, and
                // there was no DefaultForbidScheme found", masking the real
                // 403 response with an HTTP 500.
                return StatusCode(StatusCodes.Status403Forbidden, new { error = "insert_disabled", entityset, lookupName, hint = "Set _metadati__tabelle.mdserviceenableinsert = 1 + mdexposeinwebapi = 1 for this route." });

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
            Type t = ResolveEntityType(entityset);
            if (t == null)
                return NotFound($"Unknown entity set '{entityset}' (CLR type not found).");

            var lookupName = ResolveMetadataLookupName(t, entityset);
            var writeFlags = TryGetWriteFlagsFromMetadata(lookupName);
            if (!writeFlags.HasValue || !writeFlags.Value.EnableEdit)
                // See Post() comment above for the StatusCode vs Forbid() rationale.
                return StatusCode(StatusCodes.Status403Forbidden, new { error = "edit_disabled", entityset, lookupName, hint = "Set _metadati__tabelle.mdserviceenableedit = 1 + mdexposeinwebapi = 1 for this route." });

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
            Type t = ResolveEntityType(entityset);
            if (t == null)
                return NotFound($"Unknown entity set '{entityset}' (CLR type not found).");

            var lookupName = ResolveMetadataLookupName(t, entityset);
            var writeFlags = TryGetWriteFlagsFromMetadata(lookupName);
            if (!writeFlags.HasValue || !writeFlags.Value.EnableDelete)
                // See Post() comment above for the StatusCode vs Forbid() rationale.
                return StatusCode(StatusCodes.Status403Forbidden, new { error = "delete_disabled", entityset, lookupName, hint = "Set _metadati__tabelle.mdserviceenabledelete = 1 + mdexposeinwebapi = 1 for this route." });

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

        /// <summary>
        /// Compute the name to use when looking up `_metadati__tabelle.mdroutename`
        /// / `md_nome_tabella` for write-flag enforcement. The OData EntitySet
        /// name is PascalCase (e.g. `E2eOdataDemo`) but the metadata DB stores
        /// the original SQL table name (e.g. `_e2e_odata_demo`). We extract the
        /// table name from the EF Core model first, then fall back to the
        /// entityset string itself if the EF model is unavailable for some
        /// reason (defensive — should not happen in practice).
        /// </summary>
        private string ResolveMetadataLookupName(Type clrType, string entityset)
        {
            try
            {
                var efEntity = _context?.Model?.FindEntityType(clrType);
                var tableName = efEntity?.GetTableName();
                if (!string.IsNullOrWhiteSpace(tableName))
                {
                    return tableName;
                }
            }
            catch
            {
                // Best effort — fall through to entityset.
            }
            return entityset;
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

        // Helpers per il supporto $count=true inline-count (OData v4 wrapper).
        // Splittiamo le 4 query options in due fasi separate perche' il count
        // deve essere calcolato DOPO filter+orderby ma PRIMA di skip+top.
        //
        // Nota: OrderBy non cambia il count, ma lo applichiamo comunque prima
        // del count per coerenza con la shape dell'IQueryable (alcuni provider
        // EF Core ottimizzano meglio quando orderby e' gia' presente).

        /// <summary>
        /// Traduce l'OData `$expand=navProp,...` in EF Core
        /// `.Include(clrPropName)` ripetute. Necessario perche' il dynamic
        /// context di WUIC restituisce `IQueryable` non-generic, e la
        /// serializzazione downstream (`Ok(queryable)`) non usa l'OData
        /// formatter che gestirebbe le select-expand wrapper — usa il
        /// System.Text.Json default. Con `.Include()` EF genera LEFT JOIN
        /// verso la tabella nav, EF materializza l'entita' popolata nella
        /// nav property, e il serializer JSON emette il sub-oggetto in linea
        /// (camelCase come le scalar grazie alla convenzione default del
        /// formatter + `EnableLowerCamelCase()` nell'EDM per la validazione
        /// del nome nav).
        ///
        /// Mapping name camelCase (EDM) -> PascalCase (CLR):
        ///   `$expand=stateProvince` -> `.Include("StateProvince")`
        ///
        /// Limitazioni attuali:
        ///   - solo top-level expand (niente nested `$expand=a($expand=b)`);
        ///   - sub-options OData dopo la nav name (es. `stateProvince($select=..)`)
        ///     vengono strippate — Include include l'intera entita'.
        ///   - nav property non esistente sull'entita': skippata silenziosamente
        ///     per evitare errori 500; l'OData layer l'avrebbe gia' validata
        ///     ma meglio essere difensivi se il client passa un nome sbagliato.
        /// </summary>
        private static IQueryable ApplyOdataExpandAsEfInclude(IQueryable source, Type entityType, ODataQueryOptions options)
        {
            var rawExpand = options?.SelectExpand?.RawExpand;
            if (string.IsNullOrWhiteSpace(rawExpand))
                return source;

            var navs = rawExpand
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(s =>
                {
                    var parenIdx = s.IndexOf('(');
                    var name = parenIdx >= 0 ? s.Substring(0, parenIdx).Trim() : s.Trim();
                    // Slash-separated nested expand in OData sintassi: lo passo
                    // raw a Include (EF Core accetta path come "A.B" ma OData
                    // usa "A/B"); riscriviamo il separator.
                    return name.Replace('/', '.');
                })
                .Where(s => s.Length > 0)
                .Select(CapitalizeFirstSegment)
                .ToList();

            if (navs.Count == 0)
                return source;

            var includeMethod = typeof(Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions)
                .GetMethods()
                .First(m => m.Name == nameof(Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.Include)
                         && m.GetParameters().Length == 2
                         && m.GetParameters()[1].ParameterType == typeof(string))
                .MakeGenericMethod(entityType);

            var current = source;
            foreach (var nav in navs)
            {
                // Defensive: skip se la prima segment non corrisponde a una
                // public instance property del tipo. EF throw-erebbe a
                // enumeration-time con un messaggio poco chiaro altrimenti.
                var firstSegment = nav.Split('.')[0];
                var propInfo = entityType.GetProperty(firstSegment, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
                if (propInfo == null)
                    continue;

                current = (IQueryable)includeMethod.Invoke(null, new object[] { current, nav });
            }
            return current;
        }

        /// <summary>
        /// Capitalizza la prima lettera di ogni segmento separato da `.` per
        /// convertire l'OData EDM camelCase nei nomi CLR PascalCase.
        /// Es: `stateProvince.country` -> `StateProvince.Country`.
        /// </summary>
        private static string CapitalizeFirstSegment(string dotted)
        {
            if (string.IsNullOrEmpty(dotted)) return dotted;
            var segments = dotted.Split('.');
            for (int i = 0; i < segments.Length; i++)
            {
                var s = segments[i];
                if (!string.IsNullOrEmpty(s) && char.IsLower(s[0]))
                    segments[i] = char.ToUpperInvariant(s[0]) + s.Substring(1);
            }
            return string.Join('.', segments);
        }

        private static IQueryable ApplyFilterAndOrderBy(IQueryable source, ODataQueryOptions options, ODataQuerySettings settings)
        {
            IQueryable query = source;

            if (options.Filter != null)
                query = options.Filter.ApplyTo(query, settings);

            if (options.OrderBy != null)
                query = options.OrderBy.ApplyTo(query, settings);

            return query;
        }

        private static IQueryable ApplySkipAndTop(IQueryable source, ODataQueryOptions options, ODataQuerySettings settings)
        {
            IQueryable query = source;

            if (options.Skip != null)
                query = options.Skip.ApplyTo(query, settings);

            if (options.Top != null)
                query = options.Top.ApplyTo(query, settings);

            return query;
        }

        private static long CountIQueryable(IQueryable source, Type entityType)
        {
            // Queryable.LongCount<T>(IQueryable<T>) via reflection: source e'
            // non-generico ma l'IQueryable<T> sottostante matcha entityType.
            // Usiamo LongCount invece di Count per supportare dataset >2B righe
            // (edge case realistico su entity grandi es. audit log).
            var longCountMethod = typeof(Queryable)
                .GetMethods()
                .First(m => m.Name == nameof(Queryable.LongCount) && m.GetParameters().Length == 1)
                .MakeGenericMethod(entityType);

            return (long)longCountMethod.Invoke(null, new object[] { source });
        }

        private static object MaterializeIQueryable(IQueryable source, Type entityType)
        {
            // Enumerable.ToList<T>(IEnumerable<T>) via reflection per forzare
            // l'esecuzione SQL e restituire una List<T> serializzabile JSON.
            // Senza questa materializzazione esplicita il wrapper
            // { "@odata.count": N, "value": IQueryable } puo' comportarsi male
            // col serializer OData (che prova a invocare di nuovo le query
            // options sull'IQueryable value, generando SQL spurio o errori).
            var toListMethod = typeof(Enumerable)
                .GetMethods()
                .First(m => m.Name == nameof(Enumerable.ToList) && m.GetParameters().Length == 1)
                .MakeGenericMethod(entityType);

            return toListMethod.Invoke(null, new object[] { source });
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
            // BUG FIX 2026-04-30: Pomelo MySQL maps tables under `Schema = null`
            // (MySQL has no schema concept). The previous fallback to "dbo" broke
            // `StoreObjectIdentifier.Table(tableName, "dbo")` because the EF
            // metadata key was `("_e2e_odata_demo", null)`, so `p.GetColumnName(store)`
            // returned null for every property → propMap stayed empty → INSERT
            // bailed with "No insertable fields". Preserve the EF-reported schema
            // (which is null for MySQL); fall back to "dbo" only when the EF
            // metadata explicitly sets a schema we want to honor (MSSQL path).
            var efSchema = efEntity.GetSchema();
            var schema = efSchema; // null on MySQL, real schema on MSSQL/Postgres
            if (string.IsNullOrWhiteSpace(tableName))
                return (false, null, $"Table mapping not found for '{entityType.Name}'.");

            var store = string.IsNullOrEmpty(schema)
                ? StoreObjectIdentifier.Table(tableName)
                : StoreObjectIdentifier.Table(tableName, schema);
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

                // PK handling: skippa la PK SOLO se e' server-generated (IDENTITY,
                // temporal AS_ROW_START/END, computed). `blockedColumns` contiene
                // gia' tutte queste casistiche via sys.columns flags
                // (is_identity=1, generated_always_type<>0, is_computed=1), quindi
                // non serve un check separato sulla PK.
                //
                // Prima c'era uno skip incondizionato della colonna PK, che
                // assumeva implicitamente IDENTITY e rompeva INSERT su qualsiasi
                // tabella con PK non-identity (es. `Application.Cities.CityID` in
                // WideWorldImporters, dove la PK e' int NOT NULL ma non-identity
                // ma ha un `DEFAULT NEXT VALUE FOR <sequence>`): se il client
                // non fornisce la PK vogliamo che SQL usi la sequence, se la
                // fornisce vogliamo rispettarla.
                if (blockedColumns.Contains(mapped.ColumnName))
                    continue;

                // Valori JSON null -> NON includere la colonna nella INSERT,
                // cosi' SQL applica il `DEFAULT` lato DB (sequence, newid(),
                // getutcdate(), costante, ecc.). Includere esplicitamente
                // `@p = NULL` in VALUES bypassa il DEFAULT e fallisce per
                // colonne NOT NULL con default (es. Cities.CityID dove la PK
                // e' NOT NULL ma viene popolata dalla sequence via DEFAULT).
                // Le colonne NOT NULL senza DEFAULT e senza valore nel payload
                // faranno comunque fallire l'INSERT lato SQL (comportamento
                // coerente — il caller avrebbe dovuto validarle lato UI).
                if (item.Value.ValueKind == JsonValueKind.Null)
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

                // Difensivo: se dopo la deserializzazione il valore e' ancora
                // null (es. "0001-01-01T00:00:00" su DateTime? puo' deserializzare
                // a null in alcuni edge case), skippiamo per lo stesso motivo
                // della regola "JsonValueKind.Null" sopra.
                if (parsed == null)
                    continue;

                var pn = $"@p{i++}";
                columns.Add($"[{mapped.ColumnName}]");
                paramNames.Add(pn);
                values[pn] = parsed;
            }

            if (columns.Count == 0)
                return (false, null, "No insertable fields found in payload.");

            // Per-DBMS dispatch (BUG FIX 2026-04-30): the path below was MSSQL-only
            // (T-SQL bracket quoting + `OUTPUT INSERTED` + cast to SqlConnection).
            // On MySQL, dispatch to `Wuic.MySqlProvider/MySqlOdataConfigurator.InsertEntity`
            // via reflection (same pattern as TryConfigureMySql / TryGetWriteFlags).
            // The MySQL helper uses backtick quoting + `LAST_INSERT_ID()` to fetch
            // the auto-generated PK in the same connection.
            var dbms = (WuicOData.Configurator.GetCachedConfiguration()?["AppSettings:dbms"] ?? "mssql").Trim().ToLowerInvariant();
            object insertedKey = null;
            if (dbms == "mysql")
            {
                string dataConnStr = WuicOData.Configurator.LoadKonvergenceConnectionString("DataSQLConnection");
                // For MySQL, the schema concept is the database name itself.
                // EF metadata's `GetSchema()` may return "dbo" by default — we
                // honor an explicit non-"dbo" value (rare) but otherwise fall
                // back to the connection-string `Database=…`.
                string mysqlDbName = (schema != null && schema != "dbo" ? schema : ExtractDatabaseFromConnectionString(dataConnStr));
                var mysqlColumns = columns.Select(c => "`" + c.Trim('[', ']').Replace("`", "``") + "`").ToArray();
                try
                {
                    insertedKey = WuicOData.Configurator.InvokeMySqlOdataMethod<object>(
                        "InsertEntity",
                        dataConnStr, mysqlDbName, tableName,
                        mysqlColumns, paramNames.ToArray(), values, keyColumn);
                }
                catch (Exception ex)
                {
                    return (false, null, "MySQL insert failed: " + ex.Message + (ex.InnerException != null ? " | " + ex.InnerException.Message : ""));
                }
            }
            else
            {
                // MSSQL fallback: bracket-qualify with default "dbo" when EF
                // doesn't report a schema (legacy MSSQL behavior preserved).
                var mssqlSchema = string.IsNullOrEmpty(schema) ? "dbo" : schema;
                var sql = $"INSERT INTO [{mssqlSchema}].[{tableName}] ({string.Join(", ", columns)})";
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

                if (!string.IsNullOrWhiteSpace(keyColumn))
                    insertedKey = await cmd.ExecuteScalarAsync();
                else
                    await cmd.ExecuteNonQueryAsync();
            }

            var response = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in payload.EnumerateObject())
                response[item.Name] = item.Value.ValueKind == JsonValueKind.Null ? null : item.Value.ToString();

            if (keyProp != null && insertedKey != null && insertedKey != DBNull.Value)
                response[keyProp.Name] = insertedKey;

            return (true, response, null);
        }

        // Inline parser for the `Database=<name>` (or `Initial Catalog=<name>`)
        // segment of a connection string. Used by the MySQL insert dispatch
        // when EF's GetSchema() returns the default "dbo" placeholder and we
        // need the actual MySQL database name for the `\`db\`.\`table\`` prefix.
        private static string ExtractDatabaseFromConnectionString(string cs)
        {
            if (string.IsNullOrEmpty(cs)) return null;
            foreach (var raw in cs.Split(';'))
            {
                var part = raw?.Trim();
                if (string.IsNullOrEmpty(part)) continue;
                int eq = part.IndexOf('=');
                if (eq <= 0) continue;
                string k = part.Substring(0, eq).Trim();
                string v = part.Substring(eq + 1).Trim();
                if (string.IsNullOrEmpty(v)) continue;
                if (k.Equals("database", StringComparison.OrdinalIgnoreCase) ||
                    k.Equals("initial catalog", StringComparison.OrdinalIgnoreCase))
                {
                    return v;
                }
            }
            return null;
        }

        private async Task<HashSet<string>> GetNonInsertableColumnsAsync(string schema, string tableName)
        {
            var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // Per-DBMS dispatch (vedi InsertEntityWithSqlAsync): on MySQL the
            // sys.* catalog is unavailable; query information_schema.columns
            // via the MySQL provider helper for `auto_increment` + `GENERATED`.
            var dbms = (WuicOData.Configurator.GetCachedConfiguration()?["AppSettings:dbms"] ?? "mssql").Trim().ToLowerInvariant();
            if (dbms == "mysql")
            {
                string dataConnStr = WuicOData.Configurator.LoadKonvergenceConnectionString("DataSQLConnection");
                string mysqlDbName = (schema != null && schema != "dbo" ? schema : ExtractDatabaseFromConnectionString(dataConnStr));
                var arr = WuicOData.Configurator.InvokeMySqlOdataMethod<string[]>(
                    "GetNonInsertableColumns", dataConnStr, mysqlDbName, tableName);
                if (arr != null)
                {
                    foreach (var c in arr) result.Add(c);
                }
                return result;
            }

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

                // Per-DBMS dispatch (BUG FIX 2026-04-30): on a MySQL host this
                // method was returning null silently because SqlConnection +
                // `SELECT TOP 1` are MSSQL-only and the catch block swallowed
                // the resulting MySqlException, blocking every CUD on
                // `/odata/<EntitySet>`. Dispatch to the MySQL sibling in
                // `Wuic.MySqlProvider/MySqlOdataConfigurator` via reflection
                // (same pattern as WuicOData/Configurator.TryConfigureMySql).
                var dbms = (WuicOData.Configurator.GetCachedConfiguration()?["AppSettings:dbms"] ?? "mssql").Trim().ToLowerInvariant();
                if (dbms == "mysql")
                {
                    var arr = WuicOData.Configurator.InvokeMySqlOdataMethod<bool[]>("TryGetWriteFlags", conStr, entityset);
                    if (arr == null) return null;
                    return new WriteFlags { EnableInsert = arr[0], EnableEdit = arr[1], EnableDelete = arr[2] };
                }

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

                // Per-DBMS dispatch (vedi sibling TryGetWriteFlagsFromMetadata).
                var dbms = (WuicOData.Configurator.GetCachedConfiguration()?["AppSettings:dbms"] ?? "mssql").Trim().ToLowerInvariant();
                if (dbms == "mysql")
                {
                    return WuicOData.Configurator.InvokeMySqlOdataMethod<int?>("TryGetForcedTop", conStr, entityset);
                }

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
