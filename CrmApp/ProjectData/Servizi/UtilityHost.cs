using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text;
using metaModelRaw;
using WEB_UI_CRAFTER.Helpers;
using WEB_UI_CRAFTER.ProjectData.Crud;
using WEB_UI_CRAFTER.Services;

namespace WEB_UI_CRAFTER.ProjectData.Servizi;

/// <summary>
/// Dispatcher host-side: delega gli hook CRUD a handler route-level nel namespace WEB_UI_CRAFTER.ProjectData.Crud.
/// Strategia:
/// - match primario su RouteName / RouteAliases
/// - fallback su convenzione nome classe (route -> nome classe/PascalCase)
/// - selezione per Priority (decrescente)
/// - fallback no-op se nessun handler disponibile
/// </summary>
public class UtilityHost : IUtilityHost
{
    private static readonly ConcurrentDictionary<string, ICrudRouteHandler?> HandlerCache = new(StringComparer.OrdinalIgnoreCase);

    private static readonly Lazy<IReadOnlyList<ICrudRouteHandler>> RegisteredHandlers =
        new(DiscoverHandlers, isThreadSafe: true);

    public void beforeInsert(string route, Dictionary<string, object> entity, string userId)
    {
        var handler = ResolveRouteHandler(route);
        if (handler == null)
        {
            return;
        }

        try
        {
            handler.beforeInsert(route, entity, userId);
        }
        catch (Exception ex)
        {
            HandleHookError(handler, nameof(beforeInsert), ex);
            throw;
        }
    }

    public void beforeUpdate(string route, Dictionary<string, object> entity, string userId)
    {
        var handler = ResolveRouteHandler(route);
        if (handler == null)
        {
            return;
        }

        try
        {
            handler.beforeUpdate(route, entity, userId);
        }
        catch (Exception ex)
        {
            HandleHookError(handler, nameof(beforeUpdate), ex);
            throw;
        }
    }

    public void beforeDelete(string route, Dictionary<string, object> entity, string userId)
    {
        var handler = ResolveRouteHandler(route);
        if (handler == null)
        {
            return;
        }

        try
        {
            handler.beforeDelete(route, entity, userId);
        }
        catch (Exception ex)
        {
            HandleHookError(handler, nameof(beforeDelete), ex);
            throw;
        }
    }

    public void beforeRestore(string route, Dictionary<string, object> entity, string userId)
    {
        var handler = ResolveRouteHandler(route);
        if (handler == null)
        {
            return;
        }

        try
        {
            handler.beforeRestore(route, entity, userId);
        }
        catch (Exception ex)
        {
            HandleHookError(handler, nameof(beforeRestore), ex);
            throw;
        }
    }

    public void customizeInsert(ref string query, string route, Dictionary<string, object> entity, string userId)
    {
        var handler = ResolveRouteHandler(route);
        if (handler == null)
        {
            return;
        }

        try
        {
            handler.customizeInsert(ref query, route, entity, userId);
        }
        catch (Exception ex)
        {
            HandleHookError(handler, nameof(customizeInsert), ex);
            throw;
        }
    }

    public void customizeUpdate(ref string query, string route, Dictionary<string, object> entity, string userId)
    {
        var handler = ResolveRouteHandler(route);
        if (handler == null)
        {
            return;
        }

        try
        {
            handler.customizeUpdate(ref query, route, entity, userId);
        }
        catch (Exception ex)
        {
            HandleHookError(handler, nameof(customizeUpdate), ex);
            throw;
        }
    }

    public void customizeDelete(ref string query, string route, Dictionary<string, object> entity, string userId)
    {
        var handler = ResolveRouteHandler(route);
        if (handler == null)
        {
            return;
        }

        try
        {
            handler.customizeDelete(ref query, route, entity, userId);
        }
        catch (Exception ex)
        {
            HandleHookError(handler, nameof(customizeDelete), ex);
            throw;
        }
    }

    public void customizeRestore(ref string query, string route, Dictionary<string, object> entity, string userId)
    {
        var handler = ResolveRouteHandler(route);
        if (handler == null)
        {
            return;
        }

        try
        {
            handler.customizeRestore(ref query, route, entity, userId);
        }
        catch (Exception ex)
        {
            HandleHookError(handler, nameof(customizeRestore), ex);
            throw;
        }
    }

    public void customizeSelect(
        ref string selectFields,
        ref string joinClause,
        ref string whereClause,
        ref string orderByClause,
        user utente,
        _Metadati_Tabelle tableMetadata,
        ref string customSelectClause,
        string parentRoute = "",
        SerializableDictionary<string, object> currentRecord = default!,
        FilterInfos filterInfo = default!,
        List<SortInfo> sortInfo = default!,
        PageInfo pageInfo = default!)
    {
        string route = ResolveRouteName(tableMetadata?.md_route_name, parentRoute);
        var handler = ResolveRouteHandler(route);
        if (handler == null)
        {
            return;
        }

        try
        {
            handler.customizeSelect(
                ref selectFields,
                ref joinClause,
                ref whereClause,
                ref orderByClause,
                utente,
                tableMetadata,
                ref customSelectClause,
                parentRoute,
                currentRecord,
                filterInfo,
                sortInfo,
                pageInfo);
        }
        catch (Exception ex)
        {
            HandleHookError(handler, nameof(customizeSelect), ex);
            throw;
        }
    }

    public void customizeCountSelect(
        ref string selectFields,
        ref string joinClause,
        ref string whereClause,
        ref string orderByClause,
        user utente,
        _Metadati_Tabelle tableMetadata,
        ref string safeTableName,
        ref string customCount,
        FilterInfos filterInfo = default!,
        List<SortInfo> sortInfo = default!,
        PageInfo pageInfo = default!)
    {
        string route = ResolveRouteName(tableMetadata?.md_route_name, null);
        var handler = ResolveRouteHandler(route);
        if (handler == null)
        {
            return;
        }

        try
        {
            handler.customizeCountSelect(
                ref selectFields,
                ref joinClause,
                ref whereClause,
                ref orderByClause,
                utente,
                tableMetadata,
                ref safeTableName,
                ref customCount,
                filterInfo,
                sortInfo,
                pageInfo);
        }
        catch (Exception ex)
        {
            HandleHookError(handler, nameof(customizeCountSelect), ex);
            throw;
        }
    }


    public bool customizeExcelField(
        string fieldName,
        string routeName,
        string type,
        dynamic metaInfo,
        DocumentFormat.OpenXml.Packaging.SpreadsheetDocument spreadsheet,
        DocumentFormat.OpenXml.Spreadsheet.Worksheet worksheet,
        uint columnIndex,
        uint rowIndex,
        object value)
    {
        // Fallback host: nessuna customizzazione excel route-level.
        return false;
    }

    public DocumentFormat.OpenXml.Spreadsheet.Cell customizeExcelFieldCell(
        string fieldName,
        string routeName,
        string type,
        dynamic metaInfo,
        uint columnIndex,
        uint rowIndex,
        object value,
        uint defaultStyleIndex)
    {
        // Fallback host: nessuna customizzazione cell route-level. Ritorna null
        // per delegare al chiamante il rendering default sul fast streaming path.
        return null;
    }

    public void customizeRowImport(
        string routeName,
        dynamic metaInfo,
        Dictionary<string, object> record,
        uploadOptions uploadOption,
        long recordCounter,
        string fileName,
        StringBuilder log)
    {
        // Fallback host: nessuna customizzazione import route-level.
    }
    private static ICrudRouteHandler? ResolveRouteHandler(string route)
    {
        string normalizedRoute = NormalizeRoute(route);
        if (string.IsNullOrWhiteSpace(normalizedRoute))
        {
            return null;
        }

        return HandlerCache.GetOrAdd(normalizedRoute, SelectHandlerForRoute);
    }

    private static ICrudRouteHandler? SelectHandlerForRoute(string normalizedRoute)
    {
        var enabledHandlers = RegisteredHandlers.Value.Where(h => h.Enabled).ToList();

        var explicitMatch = enabledHandlers
            .Where(h => MatchesRoute(h, normalizedRoute))
            .OrderByDescending(h => h.Priority)
            .ThenBy(h => h.GetType().FullName, StringComparer.Ordinal)
            .FirstOrDefault();

        if (explicitMatch != null)
        {
            return explicitMatch;
        }

        Type? conventionalType = ResolveHandlerType(typeof(UtilityHost).Assembly, normalizedRoute);
        if (conventionalType == null)
        {
            return null;
        }

        return enabledHandlers.FirstOrDefault(h => h.GetType() == conventionalType);
    }

    private static bool MatchesRoute(ICrudRouteHandler handler, string normalizedRoute)
    {
        string primary = NormalizeRoute(handler.RouteName);
        if (!string.IsNullOrWhiteSpace(primary) && string.Equals(primary, normalizedRoute, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (handler.RouteAliases != null)
        {
            foreach (string alias in handler.RouteAliases)
            {
                if (string.Equals(NormalizeRoute(alias), normalizedRoute, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static IReadOnlyList<ICrudRouteHandler> DiscoverHandlers()
    {
        Assembly assembly = typeof(UtilityHost).Assembly;
        const string namespacePrefix = "WEB_UI_CRAFTER.ProjectData.Crud";

        var instances = new List<ICrudRouteHandler>();

        var candidateTypes = assembly
            .GetTypes()
            .Where(t =>
                t.IsClass &&
                !t.IsAbstract &&
                string.Equals(t.Namespace, namespacePrefix, StringComparison.Ordinal) &&
                typeof(ICrudRouteHandler).IsAssignableFrom(t));

        foreach (var type in candidateTypes)
        {
            try
            {
                if (Activator.CreateInstance(type) is ICrudRouteHandler handler)
                {
                    handler.Initialize(serviceProvider: null);
                    instances.Add(handler);
                }
            }
            catch
            {
                // no-op: handler non istanziabile => ignorato
            }
        }

        return instances;
    }

    private static void HandleHookError(ICrudRouteHandler handler, string hookName, Exception exception)
    {
        try
        {
            handler.OnError(hookName, exception);
        }
        catch
        {
            // no-op: non nascondere errore originale
        }
    }

    private static Type? ResolveHandlerType(Assembly assembly, string normalizedRoute)
    {
        const string namespacePrefix = "WEB_UI_CRAFTER.ProjectData.Crud";

        Type[] candidates = assembly
            .GetTypes()
            .Where(t =>
                t.IsClass &&
                !t.IsAbstract &&
                string.Equals(t.Namespace, namespacePrefix, StringComparison.Ordinal) &&
                typeof(ICrudRouteHandler).IsAssignableFrom(t))
            .ToArray();

        Type? exact = candidates.FirstOrDefault(t =>
            string.Equals(t.Name, normalizedRoute, StringComparison.OrdinalIgnoreCase));
        if (exact != null)
        {
            return exact;
        }

        string pascal = ToPascalCase(normalizedRoute);
        return candidates.FirstOrDefault(t =>
            string.Equals(t.Name, pascal, StringComparison.OrdinalIgnoreCase));
    }

    private static string ResolveRouteName(string? routeFromMetadata, string? parentRoute)
    {
        string normalized = NormalizeRoute(routeFromMetadata);
        if (!string.IsNullOrWhiteSpace(normalized))
        {
            return normalized;
        }

        return NormalizeRoute(parentRoute);
    }

    private static string NormalizeRoute(string? route)
    {
        return (route ?? string.Empty).Trim().ToLowerInvariant();
    }

    private static string ToPascalCase(string route)
    {
        if (string.IsNullOrWhiteSpace(route))
        {
            return string.Empty;
        }

        var sb = new StringBuilder(route.Length);
        bool upper = true;

        foreach (char ch in route)
        {
            if (ch == '_' || ch == '-' || char.IsWhiteSpace(ch))
            {
                upper = true;
                continue;
            }

            sb.Append(upper ? char.ToUpperInvariant(ch) : char.ToLowerInvariant(ch));
            upper = false;
        }

        return sb.ToString();
    }
}

