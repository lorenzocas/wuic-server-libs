using System;
using System.Collections.Generic;
using System.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Controller livello 5 (decision-ladder skill app-creation): operazioni su
/// magazzino che vanno oltre il CRUD standard delle 3 tabelle
/// (`magazzini`, `magazzino_movimenti`, `magazzino_giacenze`).
///
/// Endpoint principali:
///   POST /api/magazzino/movimento-manuale       CARICO/SCARICO/RETTIFICA libero
///   POST /api/magazzino/trasferimento           Coppia atomica OUT+IN cross-mag
///   GET  /api/magazzino/disponibilita           Aggregato cross-magazzini
///                                               (?prodotto_id=&amp;variante_id=)
///   POST /api/magazzino/inventario-fisico       Conteggio reale → RETTIFICA differenza
///   GET  /api/magazzino/storico                 Time-series movimenti
///                                               (?prodotto_id=&amp;from=&amp;to=)
///   POST /api/magazzino/alert-sotto-scorta      Re-check + bell (loopback scheduler)
///   POST /api/magazzino/riconcilia-snapshot     Rebuild snapshot da event log (loopback)
///
/// Tutti gli endpoint scrivono via `magazzino_movimenti` (event log immutable);
/// la `magazzino_giacenze` viene aggiornata automaticamente dal trigger
/// `tr_magazzino_movimenti_giacenza` AFTER INSERT.
/// </summary>
[ApiController]
[Route("api/magazzino")]
public class MagazzinoController : ControllerBase
{
    private static string DataConn =>
        WEB_UI_CRAFTER.Helpers.ConfigHelper.ResolveConnectionString("DataSQLConnection")
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    /// <summary>
    /// Movimento manuale: CARICO o SCARICO o RETTIFICA su (magazzino, prodotto, variante).
    /// </summary>
    [HttpPost("movimento-manuale")]
    public IActionResult MovimentoManuale([FromBody] MovimentoRequest req)
    {
        if (req == null || req.magazzino_id <= 0 || req.prodotto_id <= 0
            || string.IsNullOrWhiteSpace(req.tipo_movimento) || req.quantita == 0)
            return BadRequest(new { error = "magazzino_id, prodotto_id, tipo_movimento, quantita richiesti (quantita != 0)" });

        // Validazione segno per coerenza semantica
        var qty = req.quantita;
        if (req.tipo_movimento == "CARICO" && qty < 0) qty = Math.Abs(qty);
        if (req.tipo_movimento == "SCARICO" && qty > 0) qty = -qty;

        using var conn = new SqlConnection(DataConn);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO dbo.magazzino_movimenti
                (magazzino_id, prodotto_id, variante_id, tipo_movimento,
                 quantita, prezzo_unitario, valore_movimento, causale,
                 documento_tipo, documento_id, documento_riga_id,
                 data_movimento, utente_id, note)
            OUTPUT INSERTED.id
            VALUES
                (@magazzino_id, @prodotto_id, @variante_id, @tipo_movimento,
                 @quantita, @prezzo_unitario, @valore_movimento, @causale,
                 'MANUALE', NULL, NULL,
                 GETDATE(), @utente_id, @note)";
        cmd.Parameters.Add(new SqlParameter("@magazzino_id", req.magazzino_id));
        cmd.Parameters.Add(new SqlParameter("@prodotto_id", req.prodotto_id));
        cmd.Parameters.Add(new SqlParameter("@variante_id", (object?)req.variante_id ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@tipo_movimento", req.tipo_movimento));
        cmd.Parameters.Add(new SqlParameter("@quantita", qty));
        cmd.Parameters.Add(new SqlParameter("@prezzo_unitario", (object?)req.prezzo_unitario ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@valore_movimento", (object?)(req.prezzo_unitario.HasValue ? qty * req.prezzo_unitario.Value : (decimal?)null) ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@causale", (object?)req.causale ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@utente_id", (object?)req.utente_id ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@note", (object?)req.note ?? DBNull.Value));
        var newId = (long?)cmd.ExecuteScalar() ?? 0;
        return Ok(new { id = newId, quantita_applicata = qty });
    }

    /// <summary>
    /// Trasferimento atomico tra due magazzini: emette coppia
    /// TRASFERIMENTO_OUT (mag origine, qty negativa) + TRASFERIMENTO_IN
    /// (mag destinazione, qty positiva). Single transaction.
    /// </summary>
    [HttpPost("trasferimento")]
    public IActionResult Trasferimento([FromBody] TrasferimentoRequest req)
    {
        if (req == null || req.from_magazzino_id <= 0 || req.to_magazzino_id <= 0
            || req.prodotto_id <= 0 || req.quantita <= 0)
            return BadRequest(new { error = "from_magazzino_id, to_magazzino_id, prodotto_id, quantita (>0) richiesti" });
        if (req.from_magazzino_id == req.to_magazzino_id)
            return BadRequest(new { error = "magazzino origine e destinazione devono differire" });

        using var conn = new SqlConnection(DataConn);
        conn.Open();
        using var tx = conn.BeginTransaction();
        try
        {
            string causale = $"TRASFERIMENTO_{Guid.NewGuid():N}";

            // OUT
            using (var cmd = conn.CreateCommand())
            {
                cmd.Transaction = tx;
                cmd.CommandText = @"
                    INSERT INTO dbo.magazzino_movimenti
                        (magazzino_id, prodotto_id, variante_id, tipo_movimento, quantita, causale, documento_tipo, data_movimento, utente_id)
                    VALUES (@m, @p, @v, 'TRASFERIMENTO_OUT', -@q, @c, 'MANUALE', GETDATE(), @u)";
                cmd.Parameters.Add(new SqlParameter("@m", req.from_magazzino_id));
                cmd.Parameters.Add(new SqlParameter("@p", req.prodotto_id));
                cmd.Parameters.Add(new SqlParameter("@v", (object?)req.variante_id ?? DBNull.Value));
                cmd.Parameters.Add(new SqlParameter("@q", req.quantita));
                cmd.Parameters.Add(new SqlParameter("@c", causale));
                cmd.Parameters.Add(new SqlParameter("@u", (object?)req.utente_id ?? DBNull.Value));
                cmd.ExecuteNonQuery();
            }
            // IN
            using (var cmd = conn.CreateCommand())
            {
                cmd.Transaction = tx;
                cmd.CommandText = @"
                    INSERT INTO dbo.magazzino_movimenti
                        (magazzino_id, prodotto_id, variante_id, tipo_movimento, quantita, causale, documento_tipo, data_movimento, utente_id)
                    VALUES (@m, @p, @v, 'TRASFERIMENTO_IN', @q, @c, 'MANUALE', GETDATE(), @u)";
                cmd.Parameters.Add(new SqlParameter("@m", req.to_magazzino_id));
                cmd.Parameters.Add(new SqlParameter("@p", req.prodotto_id));
                cmd.Parameters.Add(new SqlParameter("@v", (object?)req.variante_id ?? DBNull.Value));
                cmd.Parameters.Add(new SqlParameter("@q", req.quantita));
                cmd.Parameters.Add(new SqlParameter("@c", causale));
                cmd.Parameters.Add(new SqlParameter("@u", (object?)req.utente_id ?? DBNull.Value));
                cmd.ExecuteNonQuery();
            }
            tx.Commit();
            return Ok(new { causale, from = req.from_magazzino_id, to = req.to_magazzino_id, quantita = req.quantita });
        }
        catch (Exception ex) { tx.Rollback(); return StatusCode(500, new { error = ex.Message }); }
    }

    /// <summary>
    /// Aggregato cross-magazzini per (prodotto, variante). Variante NULL = stock generico.
    /// Wrapper di sp_calcola_disponibilita_per_variante o _aggregata.
    /// </summary>
    [HttpGet("disponibilita")]
    public IActionResult Disponibilita([FromQuery] int prodotto_id, [FromQuery] int? variante_id)
    {
        if (prodotto_id <= 0) return BadRequest(new { error = "prodotto_id richiesto" });

        using var conn = new SqlConnection(DataConn);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandType = CommandType.StoredProcedure;
        if (variante_id.HasValue)
        {
            cmd.CommandText = "dbo.sp_calcola_disponibilita_per_variante";
            cmd.Parameters.Add(new SqlParameter("@prodotto_id", prodotto_id));
            cmd.Parameters.Add(new SqlParameter("@variante_id", variante_id.Value));
        }
        else
        {
            cmd.CommandText = "dbo.sp_calcola_disponibilita_aggregata";
            cmd.Parameters.Add(new SqlParameter("@prodotto_id", prodotto_id));
        }
        using var r = cmd.ExecuteReader();
        if (!r.Read()) return Ok(new { quantita_disponibile_totale = 0, quantita_libera_totale = 0 });
        var dict = new Dictionary<string, object?>();
        for (int i = 0; i < r.FieldCount; i++)
            dict[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i);
        return Ok(dict);
    }

    /// <summary>
    /// Inventario fisico: dato il conteggio reale (per riga prodotto+variante),
    /// emette movimenti RETTIFICA per la differenza con la giacenza corrente.
    /// </summary>
    [HttpPost("inventario-fisico")]
    public IActionResult InventarioFisico([FromBody] InventarioRequest req)
    {
        if (req == null || req.magazzino_id <= 0 || req.righe == null || req.righe.Count == 0)
            return BadRequest(new { error = "magazzino_id + righe[] richiesti" });

        using var conn = new SqlConnection(DataConn);
        conn.Open();
        using var tx = conn.BeginTransaction();
        int rettifiche = 0;
        try
        {
            foreach (var riga in req.righe)
            {
                // Read current giacenza
                decimal current = 0;
                using (var rd = conn.CreateCommand())
                {
                    rd.Transaction = tx;
                    rd.CommandText = @"
                        SELECT ISNULL(quantita_disponibile, 0)
                        FROM dbo.magazzino_giacenze
                        WHERE magazzino_id = @m AND prodotto_id = @p
                          AND ((@v IS NULL AND variante_id IS NULL) OR variante_id = @v)
                          AND cancellato = 0";
                    rd.Parameters.Add(new SqlParameter("@m", req.magazzino_id));
                    rd.Parameters.Add(new SqlParameter("@p", riga.prodotto_id));
                    rd.Parameters.Add(new SqlParameter("@v", (object?)riga.variante_id ?? DBNull.Value));
                    var raw = rd.ExecuteScalar();
                    if (raw != null && raw != DBNull.Value) current = Convert.ToDecimal(raw);
                }

                decimal delta = riga.quantita_reale - current;
                if (delta == 0) continue;

                using (var ins = conn.CreateCommand())
                {
                    ins.Transaction = tx;
                    ins.CommandText = @"
                        INSERT INTO dbo.magazzino_movimenti
                            (magazzino_id, prodotto_id, variante_id, tipo_movimento, quantita,
                             causale, documento_tipo, data_movimento, utente_id, note)
                        VALUES
                            (@m, @p, @v, 'RETTIFICA', @q,
                             'INVENTARIO_FISICO', 'MANUALE', GETDATE(), @u, @n)";
                    ins.Parameters.Add(new SqlParameter("@m", req.magazzino_id));
                    ins.Parameters.Add(new SqlParameter("@p", riga.prodotto_id));
                    ins.Parameters.Add(new SqlParameter("@v", (object?)riga.variante_id ?? DBNull.Value));
                    ins.Parameters.Add(new SqlParameter("@q", delta));
                    ins.Parameters.Add(new SqlParameter("@u", (object?)req.utente_id ?? DBNull.Value));
                    ins.Parameters.Add(new SqlParameter("@n", $"Conteggio {riga.quantita_reale} vs giacenza {current}"));
                    ins.ExecuteNonQuery();
                    rettifiche++;
                }
            }
            tx.Commit();
            return Ok(new { rettifiche_applicate = rettifiche });
        }
        catch (Exception ex) { tx.Rollback(); return StatusCode(500, new { error = ex.Message }); }
    }

    /// <summary>
    /// Storico movimenti per prodotto in finestra temporale. Per chart time-series.
    /// </summary>
    [HttpGet("storico")]
    public IActionResult Storico(
        [FromQuery] int prodotto_id,
        [FromQuery] int? variante_id,
        [FromQuery] int? magazzino_id,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        if (prodotto_id <= 0) return BadRequest(new { error = "prodotto_id richiesto" });
        var dtFrom = from ?? DateTime.Today.AddMonths(-3);
        var dtTo = to ?? DateTime.Today.AddDays(1);

        using var conn = new SqlConnection(DataConn);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT id, magazzino_id, prodotto_id, variante_id, tipo_movimento,
                   quantita, prezzo_unitario, valore_movimento, causale,
                   documento_tipo, documento_id, documento_riga_id,
                   data_movimento
            FROM dbo.magazzino_movimenti
            WHERE prodotto_id = @p
              AND (@v IS NULL OR variante_id = @v OR (variante_id IS NULL AND @v IS NULL))
              AND (@m IS NULL OR magazzino_id = @m)
              AND data_movimento >= @from AND data_movimento < @to
            ORDER BY data_movimento DESC, id DESC";
        cmd.Parameters.Add(new SqlParameter("@p", prodotto_id));
        cmd.Parameters.Add(new SqlParameter("@v", (object?)variante_id ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@m", (object?)magazzino_id ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@from", dtFrom));
        cmd.Parameters.Add(new SqlParameter("@to", dtTo));
        var rows = new List<Dictionary<string, object?>>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            var d = new Dictionary<string, object?>();
            for (int i = 0; i < r.FieldCount; i++)
                d[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i);
            rows.Add(d);
        }
        return Ok(new { count = rows.Count, rows });
    }

    /// <summary>
    /// Re-check delle giacenze sotto-scorta. Chiamato dallo scheduler
    /// `fe_magazzino_alert_sotto_scorta` (daily 08:00). Ritorna l'elenco
    /// righe sotto-scorta (per bell notification client / mailing).
    /// MVP iter1: ritorna solo il dataset, le notifiche bell vanno aggiunte
    /// nell'iter2 quando INotificationRepository.EnqueueAsync sara' wired.
    /// </summary>
    [HttpPost("alert-sotto-scorta")]
    public IActionResult AlertSottoScorta()
    {
        using var conn = new SqlConnection(DataConn);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT g.id AS giacenza_id, g.magazzino_id, m.codice AS magazzino_codice,
                   g.prodotto_id, p.codice AS prodotto_codice, p.descrizione,
                   g.variante_id, pv.sku AS variante_sku,
                   g.quantita_disponibile, g.quantita_riservata,
                   g.livello_riordino, g.livello_target
            FROM dbo.magazzino_giacenze g
            JOIN dbo.magazzini m ON m.id = g.magazzino_id
            JOIN dbo.prodotti  p ON p.id = g.prodotto_id
            LEFT JOIN dbo.prodotto_varianti pv ON pv.id = g.variante_id
            WHERE g.cancellato = 0
              AND g.livello_riordino IS NOT NULL
              AND (g.quantita_disponibile - g.quantita_riservata) <= g.livello_riordino";
        var rows = new List<Dictionary<string, object?>>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            var d = new Dictionary<string, object?>();
            for (int i = 0; i < r.FieldCount; i++)
                d[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i);
            rows.Add(d);
        }
        return Ok(new { count = rows.Count, sotto_scorta = rows });
    }

    /// <summary>
    /// Rebuild idempotente di magazzino_giacenze ricalcolando da magazzino_movimenti.
    /// Chiamato dallo scheduler `fe_magazzino_riconcilia_giacenze` (weekly Sun 03:00).
    /// Bit-equal output: ri-eseguire e' no-op se non sono arrivati movimenti nuovi.
    /// </summary>
    [HttpPost("riconcilia-snapshot")]
    public IActionResult RiconciliaSnapshot([FromQuery] int? magazzino_id)
    {
        using var conn = new SqlConnection(DataConn);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.CommandText = "dbo.sp_warmup_giacenze_da_movimenti";
        cmd.Parameters.Add(new SqlParameter("@magazzino_id", (object?)magazzino_id ?? DBNull.Value));
        cmd.ExecuteNonQuery();
        return Ok(new { reconciled = true, magazzino_id });
    }

    // ===================== DTO =====================
    public sealed class MovimentoRequest
    {
        public int magazzino_id { get; set; }
        public int prodotto_id { get; set; }
        public int? variante_id { get; set; }
        public string? tipo_movimento { get; set; }
        public decimal quantita { get; set; }
        public decimal? prezzo_unitario { get; set; }
        public string? causale { get; set; }
        public int? utente_id { get; set; }
        public string? note { get; set; }
    }

    public sealed class TrasferimentoRequest
    {
        public int from_magazzino_id { get; set; }
        public int to_magazzino_id { get; set; }
        public int prodotto_id { get; set; }
        public int? variante_id { get; set; }
        public decimal quantita { get; set; }
        public int? utente_id { get; set; }
    }

    public sealed class InventarioRequest
    {
        public int magazzino_id { get; set; }
        public int? utente_id { get; set; }
        public List<InventarioRiga>? righe { get; set; }
    }

    public sealed class InventarioRiga
    {
        public int prodotto_id { get; set; }
        public int? variante_id { get; set; }
        public decimal quantita_reale { get; set; }
    }
}
