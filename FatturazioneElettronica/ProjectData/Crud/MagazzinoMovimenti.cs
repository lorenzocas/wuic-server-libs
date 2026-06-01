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
/// Handler CRUD per route `magazzino_movimenti` — IMMUTABILITY GATE.
///
/// `magazzino_movimenti` e' un event log append-only: una volta inserito un
/// movimento, **non puo' essere ne' modificato ne' cancellato**. Le correzioni
/// vanno fatte emettendo un NUOVO movimento di tipo `RETTIFICA` con quantita'
/// uguale e opposta (o tramite l'endpoint POST /api/magazzino/inventario-fisico).
///
/// Pattern analogo a `dbo.conservazione_index`: sealed audit log.
/// </summary>
public class MagazzinoMovimenti : ICrudRouteHandler
{
    public string RouteName => "magazzino_movimenti";

    public IReadOnlyCollection<string> RouteAliases => Array.Empty<string>();

    public int Priority => 10;

    public bool Enabled => true;

    public void Initialize(IServiceProvider? serviceProvider) { }

    public void OnError(string hookName, Exception exception) { }

    public void beforeInsert(string route, Dictionary<string, object> entity, string userId)
    {
        // Validazione semantica: tipo_movimento ∈ enum + quantita coerente col segno
        if (entity.TryGetValue("tipo_movimento", out var tipoObj))
        {
            var tipo = (tipoObj?.ToString() ?? "").Trim();
            var validTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "CARICO", "SCARICO", "RETTIFICA",
                "TRASFERIMENTO_OUT", "TRASFERIMENTO_IN",
                "RISERVA", "RILASCIO_RISERVA"
            };
            if (!validTypes.Contains(tipo))
            {
                throw new InvalidOperationException(
                    $"tipo_movimento '{tipo}' non valido. Valori ammessi: " + string.Join(", ", validTypes));
            }

            // Segno
            if (entity.TryGetValue("quantita", out var qObj) && qObj != null)
            {
                if (decimal.TryParse(qObj.ToString(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var q))
                {
                    if (q == 0)
                        throw new InvalidOperationException("quantita deve essere diversa da 0");
                    bool wantsPositive = tipo.Equals("CARICO", StringComparison.OrdinalIgnoreCase)
                                       || tipo.Equals("TRASFERIMENTO_IN", StringComparison.OrdinalIgnoreCase)
                                       || tipo.Equals("RILASCIO_RISERVA", StringComparison.OrdinalIgnoreCase);
                    bool wantsNegative = tipo.Equals("SCARICO", StringComparison.OrdinalIgnoreCase)
                                       || tipo.Equals("TRASFERIMENTO_OUT", StringComparison.OrdinalIgnoreCase)
                                       || tipo.Equals("RISERVA", StringComparison.OrdinalIgnoreCase);
                    if (wantsPositive && q < 0) entity["quantita"] = Math.Abs(q);
                    else if (wantsNegative && q > 0) entity["quantita"] = -q;
                }
            }
        }
    }

    public void beforeUpdate(string route, Dictionary<string, object> entity, string userId)
    {
        // SEALED: nessun update consentito su event log.
        throw new InvalidOperationException(
            "magazzino_movimenti e' un event log immutable: UPDATE non consentito. " +
            "Per correggere un movimento, emettere un nuovo movimento di tipo RETTIFICA " +
            "con quantita uguale e opposta (o usare POST /api/magazzino/inventario-fisico).");
    }

    public void beforeDelete(string route, Dictionary<string, object> entity, string userId)
    {
        // SEALED: nessuna delete consentita.
        throw new InvalidOperationException(
            "magazzino_movimenti e' un event log immutable: DELETE non consentito. " +
            "Per stornare un movimento, emettere un nuovo movimento di tipo RETTIFICA " +
            "con quantita uguale e opposta.");
    }

    public void beforeRestore(string route, Dictionary<string, object> entity, string userId)
    {
        // SEALED: niente da restorare (non c'e' soft-delete).
        throw new InvalidOperationException(
            "magazzino_movimenti e' un event log immutable: RESTORE non applicabile.");
    }

    public void customizeInsert(ref string query, string route, Dictionary<string, object> entity, string userId) { }

    public void customizeUpdate(ref string query, string route, Dictionary<string, object> entity, string userId) { }

    public void customizeDelete(ref string query, string route, Dictionary<string, object> entity, string userId) { }

    public void customizeRestore(ref string query, string route, Dictionary<string, object> entity, string userId) { }

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
    { }

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
    { }

    public bool customizeExcelField(
        string fieldName,
        string routeName,
        string type,
        dynamic metaInfo,
        SpreadsheetDocument spreadsheet,
        Worksheet worksheet,
        uint columnIndex,
        uint rowIndex,
        object value)
    {
        return false;
    }

    public Cell customizeExcelFieldCell(
        string fieldName,
        string routeName,
        string type,
        dynamic metaInfo,
        uint columnIndex,
        uint rowIndex,
        object value,
        uint defaultStyleIndex)
    {
        return null!;
    }

    public void customizeRowImport(
        string routeName,
        dynamic metaInfo,
        Dictionary<string, object> record,
        uploadOptions uploadOption,
        long recordCounter,
        string fileName,
        StringBuilder log)
    { }
}
