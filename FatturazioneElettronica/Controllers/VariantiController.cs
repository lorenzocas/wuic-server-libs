using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Text.Json;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Controller livello 5 (decision-ladder skill app-creation): operazioni
/// custom su varianti prodotto che vanno oltre il CRUD standard.
///
/// Endpoint:
///   POST /api/varianti/generate-matrix    Genera cartesiano taglie×colori×...
///                                         via sp_genera_matrice_varianti
///   GET  /api/varianti/by-sku/{sku}       Lookup variante per SKU (scanner barcode)
///   POST /api/varianti/bulk-prezzi        Bulk update override prezzo_vendita_override /
///                                         prezzo_acquisto_override
///   GET  /api/varianti/risolvi-prezzo     Cascade pricing resolution
///                                         (listino_variante > listino_prodotto > master)
///
/// CRUD standard (insert/update/delete righe `prodotto_varianti`) e' gestito
/// dal framework via metadata route + ICrudRouteHandler in
/// `ProjectData/Crud/ProdottoVarianti.cs` (validazioni custom + auto-SKU).
/// </summary>
[ApiController]
[Route("api/varianti")]
public class VariantiController : ControllerBase
{
    private static string DataConn =>
        WEB_UI_CRAFTER.Helpers.ConfigHelper.ResolveConnectionString("DataSQLConnection")
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    /// <summary>
    /// Genera il cartesiano di varianti per un prodotto.
    /// </summary>
    /// <remarks>
    /// Body JSON esempio:
    /// {
    ///   "prodotto_id": 4,
    ///   "attributi": [
    ///     { "attributo_id": 1, "valori_id": [1, 2, 3] },
    ///     { "attributo_id": 2, "valori_id": [10, 20] }
    ///   ]
    /// }
    /// Restituisce: { "inserted": &lt;N varianti inserite&gt; }
    ///
    /// SKU auto-generato dalla stored: `&lt;codice_prodotto&gt;-&lt;val1&gt;-&lt;val2&gt;-...`.
    /// `prodotti.has_varianti` viene settato a 1 dalla stored.
    /// Idempotente: SKU duplicati vengono skippati silenziosamente.
    /// </remarks>
    [HttpPost("generate-matrix")]
    public IActionResult GenerateMatrix([FromBody] GenerateMatrixRequest req)
    {
        if (req == null || req.prodotto_id <= 0 || req.attributi == null || req.attributi.Count == 0)
            return BadRequest(new { error = "prodotto_id e attributi[] richiesti" });

        // Serializza attributi come JSON per la stored
        var attributiJson = JsonSerializer.Serialize(req.attributi);

        using var conn = new SqlConnection(DataConn);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.CommandText = "dbo.sp_genera_matrice_varianti";
        cmd.Parameters.Add(new SqlParameter("@prodotto_id", req.prodotto_id));
        cmd.Parameters.Add(new SqlParameter("@attributi_json", attributiJson));
        cmd.Parameters.Add(new SqlParameter("@utente_id", (object?)req.utente_id ?? DBNull.Value));
        var outParam = new SqlParameter("@inserted", SqlDbType.Int) { Direction = ParameterDirection.Output };
        cmd.Parameters.Add(outParam);
        cmd.ExecuteNonQuery();
        int inserted = (int)(outParam.Value ?? 0);
        return Ok(new { inserted, prodotto_id = req.prodotto_id });
    }

    /// <summary>
    /// Lookup variante per SKU univoco. Usato dagli scanner barcode / cassa POS.
    /// 404 se SKU non trovato o variante cancellata.
    /// </summary>
    [HttpGet("by-sku/{sku}")]
    public IActionResult BySku([FromRoute] string sku)
    {
        if (string.IsNullOrWhiteSpace(sku)) return BadRequest(new { error = "sku richiesto" });

        using var conn = new SqlConnection(DataConn);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT pv.id, pv.prodotto_id, pv.sku, pv.barcode, pv.descrizione_estesa,
                   pv.prezzo_vendita_override, pv.prezzo_acquisto_override,
                   pv.peso_grammi, pv.immagine_url,
                   p.codice AS prodotto_codice, p.descrizione AS prodotto_descrizione,
                   p.prezzo_vendita AS prodotto_prezzo_vendita,
                   p.prezzo_acquisto AS prodotto_prezzo_acquisto
            FROM dbo.prodotto_varianti pv
            JOIN dbo.prodotti p ON p.id = pv.prodotto_id
            WHERE pv.sku = @sku AND pv.cancellato = 0";
        cmd.Parameters.Add(new SqlParameter("@sku", sku));
        using var r = cmd.ExecuteReader();
        if (!r.Read()) return NotFound(new { error = "SKU non trovato", sku });

        return Ok(new
        {
            id = r.GetInt32(0),
            prodotto_id = r.GetInt32(1),
            sku = r.GetString(2),
            barcode = r.IsDBNull(3) ? null : r.GetString(3),
            descrizione_estesa = r.IsDBNull(4) ? null : r.GetString(4),
            prezzo_vendita_override = r.IsDBNull(5) ? (decimal?)null : r.GetDecimal(5),
            prezzo_acquisto_override = r.IsDBNull(6) ? (decimal?)null : r.GetDecimal(6),
            peso_grammi = r.IsDBNull(7) ? (int?)null : r.GetInt32(7),
            immagine_url = r.IsDBNull(8) ? null : r.GetString(8),
            prodotto_codice = r.GetString(9),
            prodotto_descrizione = r.GetString(10),
            prodotto_prezzo_vendita = r.IsDBNull(11) ? (decimal?)null : r.GetDecimal(11),
            prodotto_prezzo_acquisto = r.IsDBNull(12) ? (decimal?)null : r.GetDecimal(12),
        });
    }

    /// <summary>
    /// Bulk update degli override prezzo per N varianti in una sola transazione.
    /// Body: { "varianti": [{ "id": 5, "prezzo_vendita_override": 19.90, "prezzo_acquisto_override": null }, ...] }
    /// Pass null per "non toccare" un campo (SQL COALESCE).
    /// </summary>
    [HttpPost("bulk-prezzi")]
    public IActionResult BulkPrezzi([FromBody] BulkPrezziRequest req)
    {
        if (req?.varianti == null || req.varianti.Count == 0)
            return BadRequest(new { error = "varianti[] richiesto" });

        using var conn = new SqlConnection(DataConn);
        conn.Open();
        using var tx = conn.BeginTransaction();
        int updated = 0;
        try
        {
            foreach (var v in req.varianti)
            {
                using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
                    UPDATE dbo.prodotto_varianti
                       SET prezzo_vendita_override  = COALESCE(@pv, prezzo_vendita_override),
                           prezzo_acquisto_override = COALESCE(@pa, prezzo_acquisto_override),
                           data_modifica = GETDATE()
                     WHERE id = @id AND cancellato = 0";
                cmd.Parameters.Add(new SqlParameter("@id", v.id));
                cmd.Parameters.Add(new SqlParameter("@pv", (object?)v.prezzo_vendita_override ?? DBNull.Value));
                cmd.Parameters.Add(new SqlParameter("@pa", (object?)v.prezzo_acquisto_override ?? DBNull.Value));
                updated += cmd.ExecuteNonQuery();
            }
            tx.Commit();
            return Ok(new { updated });
        }
        catch (Exception ex)
        {
            tx.Rollback();
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Cascade pricing resolution. Wrapper su sp_risolvi_prezzo_variante.
    /// Query params: prodotto_id (req), variante_id (opt), cliente_id (opt), data (opt YYYY-MM-DD).
    /// Ritorna: { prezzo_vendita, prezzo_acquisto, sconto_default, fonte, listino_id }
    /// dove fonte ∈ {LISTINO_VARIANTE, LISTINO_PRODOTTO, MASTER_VARIANTE, MASTER_PRODOTTO}.
    /// </summary>
    [HttpGet("risolvi-prezzo")]
    public IActionResult RisolviPrezzo(
        [FromQuery] int prodotto_id,
        [FromQuery] int? variante_id,
        [FromQuery] int? cliente_id,
        [FromQuery] DateTime? data)
    {
        if (prodotto_id <= 0) return BadRequest(new { error = "prodotto_id richiesto" });

        using var conn = new SqlConnection(DataConn);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.CommandText = "dbo.sp_risolvi_prezzo_variante";
        cmd.Parameters.Add(new SqlParameter("@prodotto_id", prodotto_id));
        cmd.Parameters.Add(new SqlParameter("@variante_id", (object?)variante_id ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@cliente_id", (object?)cliente_id ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@data_riferimento", (object?)data ?? DBNull.Value));
        using var r = cmd.ExecuteReader();
        if (!r.Read()) return Ok(new { fonte = (string?)null });
        return Ok(new
        {
            prezzo_vendita = r.IsDBNull(0) ? (decimal?)null : r.GetDecimal(0),
            prezzo_acquisto = r.IsDBNull(1) ? (decimal?)null : r.GetDecimal(1),
            sconto_default = r.IsDBNull(2) ? (decimal?)null : r.GetDecimal(2),
            fonte = r.IsDBNull(3) ? null : r.GetString(3),
            listino_id = r.IsDBNull(4) ? (int?)null : r.GetInt32(4),
        });
    }

    public sealed class GenerateMatrixRequest
    {
        public int prodotto_id { get; set; }
        public int? utente_id { get; set; }
        public List<AttributoBlock>? attributi { get; set; }
    }

    public sealed class AttributoBlock
    {
        public int attributo_id { get; set; }
        public List<int>? valori_id { get; set; }
    }

    public sealed class BulkPrezziRequest
    {
        public List<VariantePrezzoOverride>? varianti { get; set; }
    }

    public sealed class VariantePrezzoOverride
    {
        public int id { get; set; }
        public decimal? prezzo_vendita_override { get; set; }
        public decimal? prezzo_acquisto_override { get; set; }
    }
}
