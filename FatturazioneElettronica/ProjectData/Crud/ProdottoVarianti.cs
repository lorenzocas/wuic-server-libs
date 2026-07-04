using System;
using System.Collections.Generic;
using System.Data;
using System.Globalization;
using System.Text;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using Microsoft.Data.SqlClient;
using metaModelRaw;
using WEB_UI_CRAFTER.Helpers;
using WEB_UI_CRAFTER.ProjectData.Servizi;

namespace WEB_UI_CRAFTER.ProjectData.Crud;

/// <summary>
/// Handler CRUD per route `prodotto_varianti` (Modulo 1 — Varianti prodotto).
///
/// Copre la creazione/modifica MANUALE di una singola variante dalla griglia.
/// Il path di massa (cartesiano taglie×colori) resta la stored
/// `sp_genera_matrice_varianti`, invocata da
/// <see cref="FatturazioneElettronica.Controllers.VariantiController"/>.
///
/// Responsabilita':
///   - beforeInsert: valida prodotto_id, auto-genera lo SKU se vuoto
///     (`&lt;codice_prodotto&gt;-V&lt;n&gt;` univoco), marca il prodotto padre
///     `has_varianti = 1`.
///   - beforeDelete: blocca la (soft-)cancellazione se la variante e' gia'
///     referenziata su righe documento, per non lasciare riferimenti orfani.
///
/// NB — l'interfaccia framework espone solo hook `before*` (nessun `afterInsert`):
/// la `descrizione_estesa` viene composta dalla stored
/// `sp_aggiorna_descrizione_variante`, che dipende dai valori attributo inseriti
/// nella sub-grid `prodotto_varianti_attributi` (evento successivo all'insert
/// della variante) — non calcolabile in `beforeInsert`.
/// </summary>
public class ProdottoVarianti : ICrudRouteHandler
{
    public string RouteName => "prodotto_varianti";

    public IReadOnlyCollection<string> RouteAliases => Array.Empty<string>();

    public int Priority => 10;

    public bool Enabled => true;

    private static string DataConn =>
        ConfigHelper.ResolveConnectionString("DataSQLConnection")
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    // Tabelle-riga documento con FK a prodotto_varianti(id) (vedi 45_varianti.sql §6).
    private static readonly string[] RigheTables =
    {
        "fatture_inviate_righe", "fatture_ricevute_righe", "ddt_righe",
        "ordini_righe", "ordini_acquisto_righe", "preventivi_righe", "proforma_righe"
    };

    public void Initialize(IServiceProvider? serviceProvider) { }

    public void OnError(string hookName, Exception exception) { }

    public void beforeInsert(string route, Dictionary<string, object> entity, string userId)
    {
        int prodottoId = GetInt(entity, "prodotto_id");
        if (prodottoId <= 0)
            throw new InvalidOperationException("prodotto_id e' obbligatorio per una variante prodotto.");

        using var conn = new SqlConnection(DataConn);
        conn.Open();

        // Auto-SKU se vuoto: <codice_prodotto>-V<n> con n progressivo fino a SKU libero.
        string sku = (entity.TryGetValue("sku", out var skuObj) ? skuObj?.ToString() : null)?.Trim() ?? "";
        if (sku.Length == 0)
        {
            entity["sku"] = GenerateSku(conn, prodottoId);
        }

        // Marca il prodotto padre come variante-aware (il prodotto esiste gia').
        using (var upd = conn.CreateCommand())
        {
            upd.CommandText =
                "UPDATE dbo.prodotti SET has_varianti = 1, data_modifica = GETDATE() " +
                "WHERE id = @pid AND has_varianti = 0";
            upd.Parameters.Add(new SqlParameter("@pid", prodottoId));
            upd.ExecuteNonQuery();
        }
    }

    public void beforeUpdate(string route, Dictionary<string, object> entity, string userId) { }

    public void beforeDelete(string route, Dictionary<string, object> entity, string userId)
    {
        int varianteId = GetInt(entity, "id");
        if (varianteId <= 0) return;

        using var conn = new SqlConnection(DataConn);
        conn.Open();
        string? referencedBy = FirstReferencingTable(conn, varianteId);
        if (referencedBy != null)
        {
            throw new InvalidOperationException(
                $"Impossibile eliminare la variante: e' referenziata su '{referencedBy}'. " +
                "Rimuovere o riassegnare le righe documento collegate prima di eliminarla.");
        }
    }

    public void beforeRestore(string route, Dictionary<string, object> entity, string userId) { }

    // ---- Helpers -----------------------------------------------------------

    private static int GetInt(Dictionary<string, object> entity, string key)
    {
        if (entity.TryGetValue(key, out var v) && v != null &&
            int.TryParse(v.ToString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var n))
            return n;
        return 0;
    }

    private static string GenerateSku(SqlConnection conn, int prodottoId)
    {
        string codice;
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT codice FROM dbo.prodotti WHERE id = @pid";
            cmd.Parameters.Add(new SqlParameter("@pid", prodottoId));
            codice = (cmd.ExecuteScalar()?.ToString() ?? ("PROD" + prodottoId)).Trim();
        }

        for (int n = 1; n <= 9999; n++)
        {
            string candidate = $"{codice}-V{n}";
            using var probe = conn.CreateCommand();
            probe.CommandText = "SELECT 1 FROM dbo.prodotto_varianti WHERE sku = @sku";
            probe.Parameters.Add(new SqlParameter("@sku", candidate));
            if (probe.ExecuteScalar() == null)
                return candidate;
        }
        // Fallback estremamente improbabile: garantisce comunque unicita' sul tempo.
        return $"{codice}-V{DateTime.Now.Ticks}";
    }

    private static string? FirstReferencingTable(SqlConnection conn, int varianteId)
    {
        var sb = new StringBuilder("SELECT TOP 1 tbl FROM (");
        for (int i = 0; i < RigheTables.Length; i++)
        {
            string t = RigheTables[i];
            if (i > 0) sb.Append(" UNION ALL ");
            sb.Append($"SELECT '{t}' AS tbl WHERE EXISTS (SELECT 1 FROM dbo.{t} WHERE variante_id = @id)");
        }
        sb.Append(") x");

        using var cmd = conn.CreateCommand();
        cmd.CommandText = sb.ToString();
        cmd.Parameters.Add(new SqlParameter("@id", varianteId));
        return cmd.ExecuteScalar()?.ToString();
    }

    // ---- Passthrough (default no-op) --------------------------------------

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
