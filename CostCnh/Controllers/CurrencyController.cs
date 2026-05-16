using System.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CostCnh.Controllers;

/// <summary>
/// Phase I.2 — Currency runtime API (W0.2 = A, W0.3 = a strict).
///
/// Endpoints:
///   GET  /api/currency/rate?from=X&to=Y&asOfDate=YYYY-MM-DD       — convert preview (TVF)
///   POST /api/currency/convert                                    — strict (RAISERROR on missing)
///   GET  /api/currency/fte-cost?fte=X&role=Y&year=Z&currency=W    — derived cost (TVF)
///   GET  /api/currency/supplier-cost?qty=X&supplier=Y&...         — supplier cost (TVF)
/// </summary>
[ApiController]
[Route("api/currency")]
public class CurrencyController : ControllerBase
{
    private readonly string _dataCs;
    private readonly ILogger<CurrencyController> _log;

    public CurrencyController(IConfiguration cfg, ILogger<CurrencyController> logger)
    {
        _log = logger;
        _dataCs = cfg.GetConnectionString("DataSQLConnection")
                  ?? cfg["AppSettings:connection"]
                  ?? throw new InvalidOperationException("DataSQLConnection mancante");
    }

    // ─── 1. Rate preview (TVF, ritorna null se missing — non-strict) ────────
    [HttpGet("rate")]
    public async Task<IActionResult> GetRate(
        [FromQuery] decimal amount,
        [FromQuery] int from,
        [FromQuery] int to,
        [FromQuery] DateTime asOfDate,
        CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "SELECT TOP 1 converted_amount, effective_rate, exchange_rate_id, valid_from, valid_to FROM [cp].[fn_convert_currency](@a, @f, @t, @d)";
        cmd.Parameters.AddWithValue("@a", amount);
        cmd.Parameters.AddWithValue("@f", from);
        cmd.Parameters.AddWithValue("@t", to);
        cmd.Parameters.AddWithValue("@d", asOfDate.Date);

        await using var rd = await cmd.ExecuteReaderAsync(ct);
        if (await rd.ReadAsync(ct))
        {
            decimal? conv = rd.IsDBNull(0) ? null : rd.GetDecimal(0);
            decimal? rate = rd.IsDBNull(1) ? null : rd.GetDecimal(1);
            bool missing = (from != to && rate == null);
            return Ok(new
            {
                ok = true,
                amount, from, to, asOfDate = asOfDate.Date,
                convertedAmount = conv,
                effectiveRate = rate,
                exchangeRateId = rd.IsDBNull(2) ? null : (object)rd.GetInt32(2),
                validFrom = rd.IsDBNull(3) ? null : (object)rd.GetDateTime(3),
                validTo = rd.IsDBNull(4) ? null : (object)rd.GetDateTime(4),
                missingRate = missing
            });
        }
        return Ok(new { ok = true, amount, from, to, missingRate = true });
    }

    // ─── 2. Strict convert (RAISERROR on missing → 422) ─────────────────────
    public class ConvertRequest
    {
        public decimal Amount { get; set; }
        public int From { get; set; }
        public int To { get; set; }
        public DateTime AsOfDate { get; set; }
    }
    [HttpPost("convert")]
    public async Task<IActionResult> Convert([FromBody] ConvertRequest req, CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[cp].[sp_convert_currency]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@amount", req.Amount);
        cmd.Parameters.AddWithValue("@from_currency_id", req.From);
        cmd.Parameters.AddWithValue("@to_currency_id", req.To);
        cmd.Parameters.AddWithValue("@as_of_date", req.AsOfDate.Date);
        var pConv = cmd.Parameters.Add("@converted", SqlDbType.Decimal); pConv.Precision = 19; pConv.Scale = 4; pConv.Direction = ParameterDirection.Output;
        var pRate = cmd.Parameters.Add("@effective_rate", SqlDbType.Decimal); pRate.Precision = 19; pRate.Scale = 8; pRate.Direction = ParameterDirection.Output;

        try
        {
            await cmd.ExecuteNonQueryAsync(ct);
            return Ok(new
            {
                ok = true,
                convertedAmount = pConv.Value is decimal d ? (decimal?)d : null,
                effectiveRate = pRate.Value is decimal r ? (decimal?)r : null,
            });
        }
        catch (SqlException ex) when (ex.Message.Contains("Missing exchange rate"))
        {
            return StatusCode(422, new { ok = false, code = "MISSING_RATE", error = ex.Message });
        }
    }

    // ─── 3. FTE → Cost catena (TVF) ──────────────────────────────────────────
    [HttpGet("fte-cost")]
    public async Task<IActionResult> FteCost(
        [FromQuery] decimal fte,
        [FromQuery] string role,
        [FromQuery] int year,
        [FromQuery] int currency,
        [FromQuery] int? siteId,
        CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "SELECT TOP 1 computed_hours, computed_cost FROM [cp].[fn_fte_to_cost](@fte, @r, @y, @c, @s)";
        cmd.Parameters.AddWithValue("@fte", fte);
        cmd.Parameters.AddWithValue("@r", role);
        cmd.Parameters.AddWithValue("@y", year);
        cmd.Parameters.AddWithValue("@c", currency);
        cmd.Parameters.AddWithValue("@s", (object?)siteId ?? DBNull.Value);

        await using var rd = await cmd.ExecuteReaderAsync(ct);
        if (await rd.ReadAsync(ct))
        {
            return Ok(new
            {
                ok = true,
                fte, role, year, currency, siteId,
                computedHours = rd.IsDBNull(0) ? null : (object)rd.GetDecimal(0),
                computedCost = rd.IsDBNull(1) ? null : (object)rd.GetDecimal(1),
                missing = rd.IsDBNull(0) || rd.IsDBNull(1)
            });
        }
        return Ok(new { ok = true, fte, role, year, currency, missing = true });
    }
}
