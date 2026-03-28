using System;
using System.Collections.Generic;
using metaModelRaw;
using WEB_UI_CRAFTER.Helpers;

namespace WEB_UI_CRAFTER.ProjectData.Crud;

/// <summary>
/// Handler CRUD specifico per route 'cities'.
/// Nome classe allineato alla route (resolver: route -> PascalCase).
/// </summary>
public class Cities : ICrudRouteHandler
{
    public string RouteName => "cities";

    public IReadOnlyCollection<string> RouteAliases => Array.Empty<string>();

    public int Priority => 10;

    public bool Enabled => true;

    public void Initialize(IServiceProvider? serviceProvider)
    {
        // opzionale: inizializzazione risorse/servizi
    }

    public void OnError(string hookName, Exception exception)
    {
        // opzionale: logging custom per hook route-level
    }

    public void beforeInsert(string route, Dictionary<string, object> entity, string userId)
    {
        // Esempio:
        // entity["created_by"] = userId;
    }

    public void beforeUpdate(string route, Dictionary<string, object> entity, string userId)
    {
    }

    public void beforeDelete(string route, Dictionary<string, object> entity, string userId)
    {
    }

    public void beforeRestore(string route, Dictionary<string, object> entity, string userId)
    {
    }

    public void customizeInsert(ref string query, string route, Dictionary<string, object> entity, string userId)
    {
    }

    public void customizeUpdate(ref string query, string route, Dictionary<string, object> entity, string userId)
    {
    }

    public void customizeDelete(ref string query, string route, Dictionary<string, object> entity, string userId)
    {
    }

    public void customizeRestore(ref string query, string route, Dictionary<string, object> entity, string userId)
    {
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
    }
}
