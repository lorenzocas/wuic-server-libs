using System.Collections.Generic;
using metaModelRaw;
using WEB_UI_CRAFTER.Helpers;

namespace WEB_UI_CRAFTER.ProjectData.Servizi;

/// <summary>
/// Hook host-side opzionale per personalizzare pipeline CRUD del framework.
/// I metodi vengono invocati via reflection da KonvergenceCore quando presenti.
/// </summary>
public class UtilityHost
{
    public void beforeInsert(string route, Dictionary<string, object> entity, string userId)
    {
        // Esempio: default valori per route specifiche
        // if (route == "my_route" && !entity.ContainsKey("created_by")) entity["created_by"] = userId;
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
        // Esempio:
        // if (route == "my_route") query += " -- host customizeInsert";
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
        SerializableDictionary<string, object> currentRecord = null,
        FilterInfos filterInfo = null,
        List<SortInfo> sortInfo = null,
        PageInfo pageInfo = null)
    {
        // Esempio:
        // if (tableMetadata?.md_route_name == "my_route") whereClause += " AND 1=1";
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
        FilterInfos filterInfo = null,
        List<SortInfo> sortInfo = null,
        PageInfo pageInfo = null)
    {
    }
}
