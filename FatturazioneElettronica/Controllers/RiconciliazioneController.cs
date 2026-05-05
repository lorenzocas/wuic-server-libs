using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using System.IO;
using Microsoft.AspNetCore.Mvc;

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
    public IActionResult Unmatched()
    {
        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var cmd = new SqlCommand(@"
SELECT TOP 200 id, data_operazione, importo, causale, descrizione, nome_controparte, riferimento
FROM dbo.movimenti_bancari
WHERE match_status = 'UNMATCHED'
ORDER BY data_operazione DESC", cn);
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
