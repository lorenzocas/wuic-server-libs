using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using System.IO;
using Microsoft.AspNetCore.Mvc;
using FatturazioneElettronica.Helpers;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Controller livello 5: riconciliazione bancaria.
///
/// Endpoint:
///   POST /api/riconciliazione/importCsv      -> upload CSV estratto conto
///   POST /api/riconciliazione/matchAuto      -> match automatico vs scadenze
///   POST /api/riconciliazione/confirmMatch   -> conferma match manuale
///   GET  /api/riconciliazione/unmatched      -> lista movimenti non matchati
///
/// Stored: dbo.sp_match_movimenti_scadenze
///
/// Formato CSV atteso (header obbligatorio):
///   data_operazione,data_valuta,importo,causale,descrizione,iban_controparte,nome_controparte,riferimento
///
/// Formato date: yyyy-MM-dd. Importo: decimale punto separatore (es. 1234.56),
/// negativo per addebiti.
/// </summary>
[ApiController]
[Route("api/riconciliazione")]
public class RiconciliazioneController : ControllerBase
{
    private static string DataConn =>
        ConfigurationManager.ConnectionStrings["DataSQLConnection"]?.ConnectionString
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    public class ImportCsvRequest
    {
        public int BancaId { get; set; }
        public string CsvContent { get; set; } = "";  // contenuto file in chiaro
        public string? BatchId { get; set; }
    }

    public class MatchAutoRequest
    {
        public int GiorniTolleranza { get; set; } = 7;
        public decimal TolleranzaImporto { get; set; } = 0.01m;
    }

    public class ConfirmMatchRequest
    {
        public int MovimentoId { get; set; }
        public int ScadenzaId { get; set; }
    }

    [HttpPost("importCsv")]
    public IActionResult ImportCsv([FromBody] ImportCsvRequest req)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        if (req.BancaId <= 0) return BadRequest(new { ok = false, error = "banca_id mancante" });
        if (string.IsNullOrWhiteSpace(req.CsvContent)) return BadRequest(new { ok = false, error = "csv_content vuoto" });

        var batchId = req.BatchId ?? Guid.NewGuid().ToString("N");
        int inserted = 0, errors = 0;
        var errorList = new List<string>();

        using var cn = new SqlConnection(DataConn);
        cn.Open();

        using var rdr = new StringReader(req.CsvContent);
        string? header = rdr.ReadLine();
        if (string.IsNullOrEmpty(header))
            return BadRequest(new { ok = false, error = "Header CSV mancante" });
        var colIndex = ParseHeader(header);

        string? line;
        int lineNum = 1;
        while ((line = rdr.ReadLine()) != null)
        {
            lineNum++;
            if (string.IsNullOrWhiteSpace(line)) continue;
            try
            {
                var cols = line.Split(',');
                using var cmd = new SqlCommand(@"
INSERT INTO dbo.movimenti_bancari
  (banca_id, data_operazione, data_valuta, importo, causale, descrizione,
   iban_controparte, nome_controparte, riferimento, import_batch_id)
VALUES (@banca_id, @data_op, @data_val, @imp, @causale, @descr,
        @iban, @nome, @rif, @batch)", cn);
                cmd.Parameters.AddWithValue("@banca_id", req.BancaId);
                cmd.Parameters.AddWithValue("@data_op",  ParseDate(GetCol(cols, colIndex, "data_operazione")));
                cmd.Parameters.AddWithValue("@data_val", (object?)ParseDateNullable(GetCol(cols, colIndex, "data_valuta")) ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@imp",      ParseDecimal(GetCol(cols, colIndex, "importo")));
                cmd.Parameters.AddWithValue("@causale",  (object?)GetCol(cols, colIndex, "causale") ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@descr",    (object?)GetCol(cols, colIndex, "descrizione") ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@iban",     (object?)GetCol(cols, colIndex, "iban_controparte") ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@nome",     (object?)GetCol(cols, colIndex, "nome_controparte") ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@rif",      (object?)GetCol(cols, colIndex, "riferimento") ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@batch",    batchId);
                cmd.ExecuteNonQuery();
                inserted++;
            }
            catch (Exception ex)
            {
                errors++;
                if (errorList.Count < 10) errorList.Add($"line {lineNum}: {ex.Message}");
            }
        }

        return Ok(new {
            ok = errors == 0,
            batch_id = batchId,
            inserted = inserted,
            errors = errors,
            error_samples = errorList
        });
    }

    [HttpPost("matchAuto")]
    public IActionResult MatchAuto([FromBody] MatchAutoRequest? req)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        req ??= new MatchAutoRequest();
        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var cmd = new SqlCommand("dbo.sp_match_movimenti_scadenze", cn) { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@giorni_tolleranza", req.GiorniTolleranza);
        cmd.Parameters.AddWithValue("@tolleranza_importo", req.TolleranzaImporto);
        var matched = Convert.ToInt32(cmd.ExecuteScalar());
        return Ok(new { ok = true, matched = matched });
    }

    [HttpPost("confirmMatch")]
    public IActionResult ConfirmMatch([FromBody] ConfirmMatchRequest req)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        if (req.MovimentoId <= 0 || req.ScadenzaId <= 0)
            return BadRequest(new { ok = false, error = "movimento_id o scadenza_id mancante" });

        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var tx = cn.BeginTransaction();
        try
        {
            using (var cmd = new SqlCommand(@"
UPDATE dbo.movimenti_bancari SET scadenza_id=@s, match_status='MANUAL', match_score=100 WHERE id=@m;
UPDATE dbo.scadenze SET importo_pagato=importo, stato='PAGATA', data_pagamento=GETDATE() WHERE id=@s;", cn, tx))
            {
                cmd.Parameters.AddWithValue("@m", req.MovimentoId);
                cmd.Parameters.AddWithValue("@s", req.ScadenzaId);
                cmd.ExecuteNonQuery();
            }
            tx.Commit();
            return Ok(new { ok = true });
        }
        catch (Exception ex)
        {
            tx.Rollback();
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }

    [HttpGet("unmatched")]
    public IActionResult Unmatched([FromQuery] string? batchId = null)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var cmd = new SqlCommand(@"
SELECT TOP 200 id, data_operazione, importo, causale, descrizione, nome_controparte, riferimento, import_batch_id
FROM dbo.movimenti_bancari
WHERE match_status = 'UNMATCHED'
  AND (@batch IS NULL OR import_batch_id = @batch)
ORDER BY data_operazione DESC", cn);
        cmd.Parameters.AddWithValue("@batch", (object?)batchId ?? DBNull.Value);
        using var rdr = cmd.ExecuteReader();
        var rows = new List<Dictionary<string, object?>>();
        while (rdr.Read())
        {
            var d = new Dictionary<string, object?>();
            for (int i = 0; i < rdr.FieldCount; i++)
                d[rdr.GetName(i)] = rdr.IsDBNull(i) ? null : rdr.GetValue(i);
            rows.Add(d);
        }
        return Ok(new { ok = true, count = rows.Count, rows });
    }

    /// <summary>
    /// Per popup riconciliazione post-upload (#21C): per ogni movimento UNMATCHED
    /// del batch, propone fino a 3 scadenze candidate matchando per importo
    /// (delta &lt;= @tolImporto) + data (entro @tolGiorni). Front-end mostra
    /// la scadenza con score piu' alto come "default", l'utente puo' cambiarla
    /// o saltare. Score = 100 - (delta_importo*1000 + delta_giorni).
    /// </summary>
    public class SuggestionsRequest
    {
        public string? batch_id { get; set; }
        public int tolGiorni { get; set; } = 7;
        public decimal tolImporto { get; set; } = 0.50m;
    }

    [HttpPost("suggestions")]
    public IActionResult Suggestions([FromBody] SuggestionsRequest req)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        if (req == null) req = new SuggestionsRequest();
        using var cn = new SqlConnection(DataConn);
        cn.Open();

        // 1) Take UNMATCHED movements (filtered by batch if provided)
        var movimenti = new List<Dictionary<string, object?>>();
        using (var cmd = new SqlCommand(@"
SELECT TOP 200 id, data_operazione, importo, causale, descrizione, nome_controparte, riferimento, import_batch_id
FROM dbo.movimenti_bancari
WHERE match_status='UNMATCHED'
  AND (@batch IS NULL OR import_batch_id = @batch)
ORDER BY data_operazione DESC", cn))
        {
            cmd.Parameters.AddWithValue("@batch", (object?)req.batch_id ?? DBNull.Value);
            using var rdr = cmd.ExecuteReader();
            while (rdr.Read())
            {
                var d = new Dictionary<string, object?>();
                for (int i = 0; i < rdr.FieldCount; i++)
                    d[rdr.GetName(i)] = rdr.IsDBNull(i) ? null : rdr.GetValue(i);
                movimenti.Add(d);
            }
        }

        var result = new List<object>();
        foreach (var mov in movimenti)
        {
            var movId = Convert.ToInt32(mov["id"]);
            var dataOp = Convert.ToDateTime(mov["data_operazione"]);
            var importo = Convert.ToDecimal(mov["importo"]);
            // Movimento positivo = incasso → cerca scadenza INCASSO (cliente)
            // Movimento negativo = pagamento → cerca scadenza PAGAMENTO (fornitore)
            var tipoCercato = importo >= 0 ? "INCASSO" : "PAGAMENTO";
            var importoAbs = Math.Abs(importo);

            var candidates = new List<Dictionary<string, object?>>();
            using (var cmd = new SqlCommand(@"
SELECT TOP 5 s.id, s.tipo, s.data_scadenza, s.importo, s.importo_pagato,
       s.cliente_id, s.fornitore_id, s.fattura_inviata_id, s.fattura_ricevuta_id,
       COALESCE(c.ragione_sociale, fo.ragione_sociale, '') AS controparte,
       COALESCE(fi.numero, fr.numero_fornitore, '') AS numero_fattura,
       ABS(DATEDIFF(day, s.data_scadenza, @dataOp)) AS delta_giorni,
       ABS(s.importo - s.importo_pagato - @importoAbs) AS delta_importo
FROM dbo.scadenze s
LEFT JOIN dbo.clienti c ON c.id = s.cliente_id
LEFT JOIN dbo.fornitori fo ON fo.id = s.fornitore_id
LEFT JOIN dbo.fatture_inviate fi ON fi.id = s.fattura_inviata_id
LEFT JOIN dbo.fatture_ricevute fr ON fr.id = s.fattura_ricevuta_id
WHERE s.tipo = @tipo
  AND ISNULL(s.cancellato,0) = 0
  AND s.stato IN ('APERTA', 'PARZIALE')
  AND ABS(DATEDIFF(day, s.data_scadenza, @dataOp)) <= @tolGiorni
  AND ABS(s.importo - s.importo_pagato - @importoAbs) <= @tolImporto
ORDER BY ABS(s.importo - s.importo_pagato - @importoAbs), ABS(DATEDIFF(day, s.data_scadenza, @dataOp))", cn))
            {
                cmd.Parameters.AddWithValue("@tipo", tipoCercato);
                cmd.Parameters.AddWithValue("@dataOp", dataOp);
                cmd.Parameters.AddWithValue("@importoAbs", importoAbs);
                cmd.Parameters.AddWithValue("@tolGiorni", req.tolGiorni);
                cmd.Parameters.AddWithValue("@tolImporto", req.tolImporto);
                using var rdr = cmd.ExecuteReader();
                while (rdr.Read())
                {
                    var d = new Dictionary<string, object?>();
                    for (int i = 0; i < rdr.FieldCount; i++)
                        d[rdr.GetName(i)] = rdr.IsDBNull(i) ? null : rdr.GetValue(i);
                    candidates.Add(d);
                }
            }

            result.Add(new
            {
                movimento = mov,
                candidates = candidates
            });
        }

        return Ok(new { ok = true, total = result.Count, items = result });
    }

    /// <summary>
    /// Apply bulk matches: lista di {movimento_id, scadenza_id} → confirm tutti in transazione.
    /// </summary>
    public class BulkApplyRequest
    {
        public List<MatchPair>? pairs { get; set; }
        public class MatchPair
        {
            public int movimento_id { get; set; }
            public int scadenza_id { get; set; }
        }
    }

    [HttpPost("bulkApply")]
    public IActionResult BulkApply([FromBody] BulkApplyRequest req)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        if (req?.pairs == null || req.pairs.Count == 0)
            return BadRequest(new { ok = false, error = "Nessuna coppia da applicare" });

        int applied = 0;
        var errors = new List<string>();
        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var tx = cn.BeginTransaction();
        try
        {
            foreach (var p in req.pairs)
            {
                if (p.movimento_id <= 0 || p.scadenza_id <= 0) continue;
                using var cmd = new SqlCommand(@"
UPDATE dbo.movimenti_bancari SET scadenza_id=@s, match_status='MANUAL', match_score=100 WHERE id=@m;
UPDATE dbo.scadenze SET importo_pagato=importo, stato='PAGATA', data_pagamento=GETDATE() WHERE id=@s;", cn, tx);
                cmd.Parameters.AddWithValue("@m", p.movimento_id);
                cmd.Parameters.AddWithValue("@s", p.scadenza_id);
                applied += cmd.ExecuteNonQuery();
            }
            tx.Commit();
            return Ok(new { ok = true, applied = applied / 2 });
        }
        catch (Exception ex)
        {
            tx.Rollback();
            return StatusCode(500, new { ok = false, error = ex.Message, applied = 0 });
        }
    }

    // ── helpers parsing CSV ────────────────────────────────────────────

    private static Dictionary<string, int> ParseHeader(string header)
    {
        var cols = header.Split(',');
        var idx = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < cols.Length; i++) idx[cols[i].Trim()] = i;
        return idx;
    }

    private static string? GetCol(string[] cols, Dictionary<string, int> idx, string name)
    {
        if (!idx.TryGetValue(name, out var i)) return null;
        if (i >= cols.Length) return null;
        var v = cols[i].Trim();
        return string.IsNullOrEmpty(v) ? null : v;
    }

    private static DateTime ParseDate(string? s) =>
        DateTime.ParseExact(s ?? throw new ArgumentException("data mancante"), "yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static DateTime? ParseDateNullable(string? s) =>
        string.IsNullOrEmpty(s) ? null : DateTime.ParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static decimal ParseDecimal(string? s) =>
        decimal.Parse(s ?? "0", CultureInfo.InvariantCulture);
}
