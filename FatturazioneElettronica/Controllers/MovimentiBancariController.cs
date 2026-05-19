using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using FatturazioneElettronica.Helpers;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Workflow #21B (Block 5): Import movimenti bancari da formati standard CBI Italia.
///
/// Endpoints:
///   POST /api/movimenti-bancari/import-cbi-xml
///     body: multipart/form-data con file XML CBI (BankToCustomerStatement / camt.053)
///   POST /api/movimenti-bancari/import-mt940
///     body: multipart/form-data con file MT940 plain-text (SWIFT)
///
/// Parser:
///   - CBI XML (camt.053): standard ISO 20022 Banking. Cerca elementi
///     `&lt;Ntry&gt;` (entry) con sotto-elementi `&lt;BookgDt&gt;`, `&lt;ValDt&gt;`,
///     `&lt;Amt&gt;`, `&lt;CdtDbtInd&gt;` (CRDT/DBIT), `&lt;AddtlNtryInf&gt;`,
///     `&lt;RltdPties&gt;/&lt;Cdtr&gt;|&lt;Dbtr&gt;`.
///   - MT940: parser line-based, transaction line `:61:` (data + amount + ref),
///     descrizione `:86:`. Standard SWIFT messaging.
///
/// Output: { ok, batch_id, banca_id, rows_imported, errors[] }
/// </summary>
[ApiController]
[Route("api/movimenti-bancari")]
public class MovimentiBancariController : ControllerBase
{
    private static string DataConn =>
        WEB_UI_CRAFTER.Helpers.ConfigHelper.ResolveConnectionString("DataSQLConnection")
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    public class ImportResult
    {
        public bool ok { get; set; }
        public string? batch_id { get; set; }
        public int? banca_id { get; set; }
        public int rows_imported { get; set; }
        public List<string> errors { get; set; } = new();
        public string? message { get; set; }
    }

    /// <summary>
    /// Import CBI XML (camt.053 / camt.054 ISO 20022).
    /// </summary>
    [HttpPost("import-cbi-xml")]
    [Consumes("multipart/form-data")]
    [Microsoft.AspNetCore.Mvc.ApiExplorerSettings(IgnoreApi = true)]
    public async Task<IActionResult> ImportCbiXml(IFormFile? file)
    {
        // Import movimenti banca = scrittura su DB Dati → auth obbligatoria.
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        if (file == null || file.Length == 0)
            return BadRequest(new ImportResult { ok = false, message = "Nessun file caricato" });

        var rows = new List<MovimentoRow>();
        var errors = new List<string>();

        try
        {
            using var stream = file.OpenReadStream();
            var doc = await Task.Run(() => XDocument.Load(stream));

            // ISO 20022 namespace varia per release; cattura "Ntry" indipendentemente dal ns.
            var entries = doc.Descendants()
                .Where(e => e.Name.LocalName == "Ntry")
                .ToList();

            if (entries.Count == 0)
            {
                errors.Add("Nessun elemento <Ntry> trovato nel file. Verificare che sia un CBI XML camt.053/054 valido.");
                return Ok(new ImportResult { ok = false, errors = errors, message = errors[0] });
            }

            foreach (var entry in entries)
            {
                try
                {
                    string GetLocal(string name) =>
                        entry.Descendants().FirstOrDefault(e => e.Name.LocalName == name)?.Value?.Trim() ?? "";

                    var bookgDt = GetLocal("BookgDt");      // booking date container
                    var bookgDtVal = entry.Descendants()
                        .FirstOrDefault(e => e.Name.LocalName == "BookgDt")
                        ?.Descendants().FirstOrDefault(e => e.Name.LocalName == "Dt")?.Value
                        ?? bookgDt;

                    var valDtVal = entry.Descendants()
                        .FirstOrDefault(e => e.Name.LocalName == "ValDt")
                        ?.Descendants().FirstOrDefault(e => e.Name.LocalName == "Dt")?.Value
                        ?? "";

                    var amtVal = entry.Descendants().FirstOrDefault(e => e.Name.LocalName == "Amt")?.Value ?? "0";
                    var cdtDbtInd = GetLocal("CdtDbtInd");  // "CRDT" o "DBIT"
                    var addInfo = GetLocal("AddtlNtryInf");

                    // Controparte: cerca Cdtr o Dbtr a seconda del segno
                    string controparteName = "";
                    string ibanControparte = "";
                    var rltdPties = entry.Descendants().FirstOrDefault(e => e.Name.LocalName == "RltdPties");
                    if (rltdPties != null)
                    {
                        var partyName = cdtDbtInd == "CRDT" ? "Dbtr" : "Cdtr";
                        var party = rltdPties.Descendants().FirstOrDefault(e => e.Name.LocalName == partyName);
                        if (party != null)
                        {
                            controparteName = party.Descendants()
                                .FirstOrDefault(e => e.Name.LocalName == "Nm")?.Value?.Trim() ?? "";
                        }
                        var rltdAccts = entry.Descendants().FirstOrDefault(e => e.Name.LocalName == "RltdAgts")
                            ?? entry.Descendants().FirstOrDefault(e => e.Name.LocalName == "DbtrAcct")
                            ?? entry.Descendants().FirstOrDefault(e => e.Name.LocalName == "CdtrAcct");
                        if (rltdAccts != null)
                        {
                            ibanControparte = rltdAccts.Descendants()
                                .FirstOrDefault(e => e.Name.LocalName == "IBAN")?.Value?.Trim() ?? "";
                        }
                    }

                    var refer = entry.Descendants().FirstOrDefault(e => e.Name.LocalName == "EndToEndId")?.Value?.Trim()
                              ?? entry.Descendants().FirstOrDefault(e => e.Name.LocalName == "AcctSvcrRef")?.Value?.Trim()
                              ?? "";

                    if (!DateTime.TryParse(bookgDtVal, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var dataOp))
                    {
                        errors.Add($"Riga skippata: data booking '{bookgDtVal}' non valida");
                        continue;
                    }
                    DateTime? dataValuta = null;
                    if (!string.IsNullOrEmpty(valDtVal) &&
                        DateTime.TryParse(valDtVal, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var dv))
                        dataValuta = dv;

                    if (!decimal.TryParse(amtVal, NumberStyles.Any, CultureInfo.InvariantCulture, out var importo))
                    {
                        errors.Add($"Riga skippata: importo '{amtVal}' non valido");
                        continue;
                    }
                    if (cdtDbtInd == "DBIT") importo = -importo;  // DBIT = uscita

                    rows.Add(new MovimentoRow
                    {
                        DataOperazione = dataOp.Date,
                        DataValuta = dataValuta?.Date,
                        Importo = importo,
                        Causale = (cdtDbtInd == "CRDT" ? "ACCREDITO" : "ADDEBITO"),
                        Descrizione = addInfo,
                        IbanControparte = ibanControparte,
                        NomeControparte = controparteName,
                        Riferimento = refer
                    });
                }
                catch (Exception ex)
                {
                    errors.Add($"Errore parsing riga: {ex.Message}");
                }
            }
        }
        catch (Exception ex)
        {
            return BadRequest(new ImportResult { ok = false, message = $"XML non valido: {ex.Message}" });
        }

        return await PersistRows(rows, errors);
    }

    /// <summary>
    /// Import MT940 plain text (SWIFT statement).
    /// </summary>
    [HttpPost("import-mt940")]
    [Consumes("multipart/form-data")]
    [Microsoft.AspNetCore.Mvc.ApiExplorerSettings(IgnoreApi = true)]
    public async Task<IActionResult> ImportMt940(IFormFile? file)
    {
        // Import movimenti banca = scrittura su DB Dati → auth obbligatoria.
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        if (file == null || file.Length == 0)
            return BadRequest(new ImportResult { ok = false, message = "Nessun file caricato" });

        var rows = new List<MovimentoRow>();
        var errors = new List<string>();

        using var sr = new StreamReader(file.OpenReadStream());
        string? line;
        MovimentoRow? current = null;
        var descAccum = new System.Text.StringBuilder();
        while ((line = await sr.ReadLineAsync()) != null)
        {
            // :61: transaction line — fmt :61:YYMMDDMMDDC1234,56NTRFNONREF
            if (line.StartsWith(":61:"))
            {
                if (current != null)
                {
                    if (descAccum.Length > 0) { current.Descrizione = descAccum.ToString(); descAccum.Clear(); }
                    rows.Add(current);
                }
                current = ParseMt940Line61(line.Substring(4), errors);
            }
            else if (line.StartsWith(":86:") && current != null)
            {
                if (descAccum.Length > 0) descAccum.Append(' ');
                descAccum.Append(line.Substring(4).Trim());
            }
            else if ((line.StartsWith(' ') || string.IsNullOrWhiteSpace(line) == false && current != null && !line.StartsWith(":")) && descAccum.Length > 0)
            {
                descAccum.Append(' ');
                descAccum.Append(line.Trim());
            }
        }
        if (current != null)
        {
            if (descAccum.Length > 0) current.Descrizione = descAccum.ToString();
            rows.Add(current);
        }

        return await PersistRows(rows, errors);
    }

    private static MovimentoRow? ParseMt940Line61(string body, List<string> errors)
    {
        // YYMMDD (booking) + MMDD (valuta opt) + D/C/RC/RD + amount (decimal w/ comma) + ...
        try
        {
            if (body.Length < 7) return null;
            var booking = DateTime.ParseExact(body.Substring(0, 6), "yyMMdd", CultureInfo.InvariantCulture);
            int idx = 6;
            DateTime? valuta = null;
            if (body.Length >= 10 && char.IsDigit(body[6]) && char.IsDigit(body[7]) && char.IsDigit(body[8]) && char.IsDigit(body[9]))
            {
                var mmdd = body.Substring(6, 4);
                var year = booking.Year;
                if (DateTime.TryParseExact($"{year:0000}{mmdd}", "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var v))
                    valuta = v;
                idx = 10;
            }
            // Indicator: C (credit), D (debit), RC (return credit), RD (return debit)
            char ind = body[idx];
            int signMul = (ind == 'C' || ind == 'R' && body[idx + 1] == 'D') ? 1 : -1;
            if (body[idx] == 'R') idx += 2; else idx += 1;
            // Amount: digits + comma + digits, until next non-digit/comma char
            int endAmt = idx;
            while (endAmt < body.Length && (char.IsDigit(body[endAmt]) || body[endAmt] == ',' || body[endAmt] == '.')) endAmt++;
            var amtStr = body.Substring(idx, endAmt - idx).Replace(",", ".");
            if (!decimal.TryParse(amtStr, NumberStyles.Any, CultureInfo.InvariantCulture, out var amt))
            {
                errors.Add($"MT940 :61: importo non parsabile: '{amtStr}'");
                return null;
            }
            return new MovimentoRow
            {
                DataOperazione = booking,
                DataValuta = valuta,
                Importo = amt * signMul,
                Causale = signMul > 0 ? "ACCREDITO" : "ADDEBITO",
                Descrizione = "",
                IbanControparte = "",
                NomeControparte = "",
                Riferimento = ""
            };
        }
        catch (Exception ex)
        {
            errors.Add($"MT940 :61: parse error: {ex.Message}");
            return null;
        }
    }

    private async Task<IActionResult> PersistRows(List<MovimentoRow> rows, List<string> errors)
    {
        if (rows.Count == 0)
            return Ok(new ImportResult { ok = false, errors = errors, message = "Nessun movimento valido nel file" });

        // Risolve banca: predefinita -> prima attiva
        int? bancaId = null;
        using var cn = new SqlConnection(DataConn);
        await cn.OpenAsync();
        using (var cmd = new SqlCommand(@"
            SELECT TOP 1 id FROM dbo.banche WHERE ISNULL(cancellato,0)=0 AND ISNULL(predefinita,0)=1 ORDER BY id;
        ", cn))
        {
            var r = await cmd.ExecuteScalarAsync();
            if (r != null && r != DBNull.Value) bancaId = Convert.ToInt32(r);
        }
        if (bancaId == null)
        {
            using var cmd = new SqlCommand("SELECT TOP 1 id FROM dbo.banche WHERE ISNULL(cancellato,0)=0 ORDER BY id;", cn);
            var r = await cmd.ExecuteScalarAsync();
            if (r != null && r != DBNull.Value) bancaId = Convert.ToInt32(r);
        }
        if (bancaId == null)
            return BadRequest(new ImportResult { ok = false, message = "Nessuna banca configurata" });

        var batchId = Guid.NewGuid().ToString("N").ToLowerInvariant();
        int inserted = 0;
        foreach (var row in rows)
        {
            try
            {
                using var ins = new SqlCommand(@"
                    INSERT INTO dbo.movimenti_bancari
                        (banca_id, data_operazione, data_valuta, importo,
                         causale, descrizione, iban_controparte, nome_controparte,
                         riferimento, import_batch_id, match_status, created_at)
                    VALUES (@banca, @dop, @dval, @imp, @cau, @des, @iban, @nom, @rif, @batch, 'UNMATCHED', GETDATE());
                ", cn);
                ins.Parameters.AddWithValue("@banca", bancaId.Value);
                ins.Parameters.AddWithValue("@dop", row.DataOperazione);
                ins.Parameters.AddWithValue("@dval", (object?)row.DataValuta ?? DBNull.Value);
                ins.Parameters.AddWithValue("@imp", row.Importo);
                ins.Parameters.AddWithValue("@cau", (object?)Trunc(row.Causale, 50) ?? DBNull.Value);
                ins.Parameters.AddWithValue("@des", (object?)row.Descrizione ?? DBNull.Value);
                ins.Parameters.AddWithValue("@iban", (object?)Trunc(row.IbanControparte, 34) ?? DBNull.Value);
                ins.Parameters.AddWithValue("@nom", (object?)Trunc(row.NomeControparte, 300) ?? DBNull.Value);
                ins.Parameters.AddWithValue("@rif", (object?)Trunc(row.Riferimento, 200) ?? DBNull.Value);
                ins.Parameters.AddWithValue("@batch", batchId);
                await ins.ExecuteNonQueryAsync();
                inserted++;
            }
            catch (Exception ex)
            {
                errors.Add($"INSERT errore: {ex.Message}");
            }
        }

        return Ok(new ImportResult
        {
            ok = true,
            batch_id = batchId,
            banca_id = bancaId,
            rows_imported = inserted,
            errors = errors,
            message = $"{inserted} movimenti importati nel batch {batchId}."
        });
    }

    private static string? Trunc(string? s, int max) =>
        string.IsNullOrEmpty(s) ? null : (s.Length <= max ? s : s.Substring(0, max));

    private class MovimentoRow
    {
        public DateTime DataOperazione { get; set; }
        public DateTime? DataValuta { get; set; }
        public decimal Importo { get; set; }
        public string? Causale { get; set; }
        public string? Descrizione { get; set; }
        public string? IbanControparte { get; set; }
        public string? NomeControparte { get; set; }
        public string? Riferimento { get; set; }
    }
}
