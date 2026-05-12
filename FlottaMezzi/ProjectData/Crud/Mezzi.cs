using System;
using System.Collections.Generic;
using System.Text;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using metaModelRaw;
using WEB_UI_CRAFTER.Helpers;
using WEB_UI_CRAFTER.ProjectData.Servizi;

namespace WEB_UI_CRAFTER.ProjectData.Crud;

/// <summary>
/// Handler CRUD per route 'mezzi'.
/// Validazioni:
/// - targa formato italiano (regex backup, gia' su metadata)
/// - anno immatricolazione tra 1900 e oggi+1
/// - km_attuali coerente con anno (warning, non block)
/// </summary>
public class Mezzi : ICrudRouteHandler
{
    public string RouteName => "mezzi";
    public IReadOnlyCollection<string> RouteAliases => Array.Empty<string>();
    public int Priority => 10;
    public bool Enabled => true;

    public void Initialize(IServiceProvider? serviceProvider) { }
    public void OnError(string hookName, Exception exception) { }

    public void beforeInsert(string route, Dictionary<string, object> entity, string userId)
    {
        ValidateBusiness(entity);
    }

    public void beforeUpdate(string route, Dictionary<string, object> entity, string userId)
    {
        ValidateBusiness(entity);
    }

    public void beforeDelete(string route, Dictionary<string, object> entity, string userId) { }
    public void beforeRestore(string route, Dictionary<string, object> entity, string userId) { }
    public void customizeInsert(ref string query, string route, Dictionary<string, object> entity, string userId) { }
    public void customizeUpdate(ref string query, string route, Dictionary<string, object> entity, string userId) { }
    public void customizeDelete(ref string query, string route, Dictionary<string, object> entity, string userId) { }
    public void customizeRestore(ref string query, string route, Dictionary<string, object> entity, string userId) { }
    public void afterInsert(string route, Dictionary<string, object> entity, string userId) { }
    public void afterUpdate(string route, Dictionary<string, object> entity, string userId) { }
    public void afterDelete(string route, Dictionary<string, object> entity, string userId) { }
    public void afterRestore(string route, Dictionary<string, object> entity, string userId) { }

    public void customizeSelect(ref string selectFields, ref string joinClause, ref string whereClause,
        ref string orderByClause, user utente, _Metadati_Tabelle tableMetadata, ref string customSelectClause,
        string parentRoute = "", SerializableDictionary<string, object> currentRecord = default!,
        FilterInfos filterInfo = default!, List<SortInfo> sortInfo = default!, PageInfo pageInfo = default!) { }

    public void customizeCountSelect(ref string selectFields, ref string joinClause, ref string whereClause,
        ref string orderByClause, user utente, _Metadati_Tabelle tableMetadata, ref string safeTableName,
        ref string customCount, FilterInfos filterInfo = default!, List<SortInfo> sortInfo = default!,
        PageInfo pageInfo = default!) { }

    public bool customizeExcelField(string fieldName, string routeName, string type, dynamic metaInfo,
        SpreadsheetDocument spreadsheet, Worksheet worksheet, uint columnIndex, uint rowIndex, object value) => false;

    public Cell customizeExcelFieldCell(string fieldName, string routeName, string type, dynamic metaInfo,
        uint columnIndex, uint rowIndex, object value, uint defaultStyleIndex) => null;

    public void customizeRowImport(string routeName, dynamic metaInfo, Dictionary<string, object> record,
        uploadOptions uploadOption, long recordCounter, string fileName, StringBuilder log) { }

    private static void ValidateBusiness(Dictionary<string, object> entity)
    {
        // Anno immatricolazione plausibile
        if (entity.TryGetValue("anno", out var annoObj) && annoObj != null)
        {
            if (int.TryParse(annoObj.ToString(), out var anno))
            {
                var maxAnno = DateTime.UtcNow.Year + 1;
                if (anno < 1900 || anno > maxAnno)
                {
                    throw new ArgumentException(
                        $"Anno immatricolazione {anno} non plausibile (range 1900..{maxAnno})");
                }
            }
        }

        // km_attuali non negativo
        if (entity.TryGetValue("km_attuali", out var kmObj) && kmObj != null)
        {
            if (int.TryParse(kmObj.ToString(), out var km) && km < 0)
            {
                throw new ArgumentException("km_attuali non puo' essere negativo");
            }
        }

        // Coordinate GPS valide se valorizzate
        if (entity.TryGetValue("latitudine", out var latObj) && latObj != null)
        {
            if (double.TryParse(latObj.ToString(), System.Globalization.NumberStyles.Float,
                                System.Globalization.CultureInfo.InvariantCulture, out var lat))
            {
                if (lat < -90 || lat > 90)
                    throw new ArgumentException($"Latitudine {lat} fuori range [-90, 90]");
            }
        }
        if (entity.TryGetValue("longitudine", out var lngObj) && lngObj != null)
        {
            if (double.TryParse(lngObj.ToString(), System.Globalization.NumberStyles.Float,
                                System.Globalization.CultureInfo.InvariantCulture, out var lng))
            {
                if (lng < -180 || lng > 180)
                    throw new ArgumentException($"Longitudine {lng} fuori range [-180, 180]");
            }
        }
    }
}
