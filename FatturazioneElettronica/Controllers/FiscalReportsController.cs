using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using FatturazioneElettronica.Helpers;
using FatturazioneElettronica.Services.FiscalReports;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Controller per le comunicazioni periodiche fiscali all'Agenzia delle Entrate:
///   - LIPE (Liquidazione Periodica IVA), trimestrale
///   - Esterometro (fatture transfrontaliere), mensile/trimestrale
///   - CU (Certificazione Unica collaboratori), annuale
///
/// Pattern endpoint:
///   POST /api/fiscal/lipe/generate?anno=2026&periodo=Q1
///   POST /api/fiscal/esterometro/generate?anno=2026&periodo=M03
///   POST /api/fiscal/cu/generate?anno=2025
///   GET  /api/fiscal/list?tipo=LIPE  (lista comunicazioni esistenti)
///   GET  /api/fiscal/{id}/download   (download XML generato)
/// </summary>
[ApiController]
[Route("api/fiscal")]
public class FiscalReportsController : ControllerBase
{
    private static string DataConn =>
        WEB_UI_CRAFTER.Helpers.ConfigHelper.ResolveConnectionString("DataSQLConnection")
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    [HttpPost("lipe/generate")]
    public async Task<IActionResult> GenerateLipe(
        [FromQuery] int anno,
        [FromQuery] string periodo,
        [FromServices] LipeXmlGenerator gen,
        CancellationToken ct)
    {
        var gate = AuthGate.RequireAdmin(out var userId);
        if (gate != null) return gate;
        if (anno < 2000 || anno > 2100)
            return BadRequest(new { ok = false, error = "Anno invalido (atteso 2000-2100)" });

        var r = await gen.GenerateAsync(anno, periodo, userId, ct).ConfigureAwait(false);
        return ToJson(r);
    }

    [HttpPost("esterometro/generate")]
    public async Task<IActionResult> GenerateEsterometro(
        [FromQuery] int anno,
        [FromQuery] string periodo,
        [FromServices] EsterometroXmlGenerator gen,
        CancellationToken ct)
    {
        var gate = AuthGate.RequireAdmin(out var userId);
        if (gate != null) return gate;

        var r = await gen.GenerateAsync(anno, periodo, userId, ct).ConfigureAwait(false);
        return ToJson(r);
    }

    [HttpPost("cu/generate")]
    public async Task<IActionResult> GenerateCu(
        [FromQuery] int anno,
        [FromServices] CuXmlGenerator gen,
        CancellationToken ct)
    {
        var gate = AuthGate.RequireAdmin(out var userId);
        if (gate != null) return gate;

        var r = await gen.GenerateAsync(anno, periodo: null, userId: userId, ct).ConfigureAwait(false);
        return ToJson(r);
    }

    // -----------------------------------------------------------------------
    // Endpoint "auto-due" chiamati dal framework `scheduler` (action_type='2').
    // Calcolano internamente il periodo fiscale corrente e generano solo se
    // (a) il periodo precedente e' chiuso e (b) la comunicazione non e' gia'
    // stata generata. Idempotenti — safe da chiamare daily.
    // -----------------------------------------------------------------------

    /// <summary>
    /// Genera la LIPE del trimestre piu' recente chiuso, se non gia' presente.
    /// Calendario: Q1 (gen-mar) → deadline 31 mag, Q2 (apr-giu) → 16 set,
    /// Q3 (lug-set) → 30 nov, Q4 (ott-dic) → ult. feb anno+1.
    /// </summary>
    [HttpPost("lipe/generate-due")]
    public async Task<IActionResult> GenerateLipeDue(
        [FromServices] LipeXmlGenerator gen,
        CancellationToken ct)
    {
        // Per scheduler chi non ha sessione utente: bypass admin gate.
        // L'endpoint e' chiamato esclusivamente loopback dallo scheduler interno.
        var (anno, periodo) = ComputeMostRecentClosedQuarter(DateTime.Now);
        if (AlreadyGenerated("LIPE", anno, periodo))
            return Ok(new { ok = true, skipped = true, reason = "already_generated", anno, periodo });

        var r = await gen.GenerateAsync(anno, periodo, userId: "scheduler", ct).ConfigureAwait(false);
        return ToJson(r);
    }

    /// <summary>
    /// Genera l'Esterometro del mese piu' recente chiuso, se non gia' presente.
    /// Deadline: fine del mese successivo a quello di riferimento.
    /// </summary>
    [HttpPost("esterometro/generate-due")]
    public async Task<IActionResult> GenerateEsterometroDue(
        [FromServices] EsterometroXmlGenerator gen,
        CancellationToken ct)
    {
        var now = DateTime.Now;
        // Mese precedente rispetto a oggi.
        var prev = new DateTime(now.Year, now.Month, 1).AddMonths(-1);
        int anno = prev.Year;
        string periodo = $"M{prev.Month:00}";

        if (AlreadyGenerated("ESTEROMETRO", anno, periodo))
            return Ok(new { ok = true, skipped = true, reason = "already_generated", anno, periodo });

        var r = await gen.GenerateAsync(anno, periodo, userId: "scheduler", ct).ConfigureAwait(false);
        return ToJson(r);
    }

    /// <summary>
    /// Genera la CU dell'anno solare precedente, se non gia' presente.
    /// Deadline: 16 marzo. Daily call dopo il 1 gennaio si auto-skippa una
    /// volta che la comunicazione e' stata generata.
    /// </summary>
    [HttpPost("cu/generate-due")]
    public async Task<IActionResult> GenerateCuDue(
        [FromServices] CuXmlGenerator gen,
        CancellationToken ct)
    {
        int anno = DateTime.Now.Year - 1;
        if (AlreadyGenerated("CU", anno, periodo: null))
            return Ok(new { ok = true, skipped = true, reason = "already_generated", anno });

        var r = await gen.GenerateAsync(anno, periodo: null, userId: "scheduler", ct).ConfigureAwait(false);
        return ToJson(r);
    }

    private static (int anno, string periodo) ComputeMostRecentClosedQuarter(DateTime now)
    {
        // Trimestre corrente in cui ci troviamo.
        int currentQ = (now.Month - 1) / 3 + 1;
        int prevQ = currentQ == 1 ? 4 : currentQ - 1;
        int anno = currentQ == 1 ? now.Year - 1 : now.Year;
        return (anno, "Q" + prevQ);
    }

    private bool AlreadyGenerated(string tipo, int anno, string? periodo)
    {
        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var cmd = new SqlCommand(@"
SELECT COUNT(1) FROM dbo.comunicazioni_periodiche
WHERE tipo = @tipo AND anno = @anno
  AND ((@periodo IS NULL AND periodo IS NULL) OR periodo = @periodo)", cn);
        cmd.Parameters.AddWithValue("@tipo", tipo);
        cmd.Parameters.AddWithValue("@anno", anno);
        cmd.Parameters.AddWithValue("@periodo", (object?)periodo ?? DBNull.Value);
        var c = (int)(cmd.ExecuteScalar() ?? 0);
        return c > 0;
    }

    [HttpGet("list")]
    public IActionResult List([FromQuery] string? tipo)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var cmd = new SqlCommand(@"
SELECT id, tipo, anno, periodo, nome_file, sha256_hash, stato, sdi_id,
       data_creazione, data_invio, riepilogo_json
FROM dbo.comunicazioni_periodiche
WHERE @tipo IS NULL OR tipo = @tipo
ORDER BY anno DESC, periodo DESC, id DESC", cn);
        cmd.Parameters.AddWithValue("@tipo", (object?)tipo ?? DBNull.Value);

        var rows = new List<Dictionary<string, object?>>();
        using var rdr = cmd.ExecuteReader();
        while (rdr.Read())
        {
            var d = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < rdr.FieldCount; i++)
                d[rdr.GetName(i)] = rdr.IsDBNull(i) ? null : rdr.GetValue(i);
            rows.Add(d);
        }
        return Ok(new { ok = true, items = rows });
    }

    [HttpGet("{id:int}/download")]
    public IActionResult Download(int id)
    {
        var gate = AuthGate.RequireAuth();
        if (gate != null) return gate;

        using var cn = new SqlConnection(DataConn);
        cn.Open();
        using var cmd = new SqlCommand(
            "SELECT nome_file, xml_payload FROM dbo.comunicazioni_periodiche WHERE id=@id", cn);
        cmd.Parameters.AddWithValue("@id", id);
        using var rdr = cmd.ExecuteReader();
        if (!rdr.Read())
            return NotFound(new { ok = false, error = "Comunicazione non trovata" });

        string fileName = rdr.GetString(0);
        string xml = rdr.IsDBNull(1) ? "" : rdr.GetString(1);
        var bytes = System.Text.Encoding.UTF8.GetBytes(xml);
        return File(bytes, "application/xml", fileName);
    }

    private IActionResult ToJson(FiscalReportResult r)
    {
        // Parse riepilogoJson via JsonElement con cast esplicito a object?
        // (il ternary ?: rifiuta null vs JsonElement come tipi diversi).
        object? riepilogoObj = null;
        if (r.RiepilogoJson is not null)
        {
            try { riepilogoObj = System.Text.Json.JsonDocument.Parse(r.RiepilogoJson).RootElement.Clone(); }
            catch { riepilogoObj = r.RiepilogoJson; }
        }

        return r.Ok
            ? Ok(new
            {
                ok = true,
                tipo = r.Tipo,
                comunicazione_id = r.ComunicazioneId,
                file_name = r.FileName,
                sha256 = r.Sha256,
                xml_bytes = r.XmlBytes,
                riepilogo = riepilogoObj,
                message = r.Message
            })
            : BadRequest(new { ok = false, tipo = r.Tipo, error = r.Message });
    }
}
