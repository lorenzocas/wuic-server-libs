using System;
using System.Data;
using System.Data.SqlClient;
using System.Collections.Generic;
using System.Security.Authentication;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using FlottaMezzi.Helpers;
using WEB_UI_CRAFTER.Helpers;

namespace FlottaMezzi.Controllers;

/// <summary>
/// Endpoint reporting: aggregazioni costi per mezzo + libretto PDF.
/// Auth obbligatoria + ruolo gestore_flotta o admin.
/// </summary>
[ApiController]
[Route("api/Reporting/[action]")]
public class ReportingController : ControllerBase
{
    private readonly IConfiguration _config;

    public ReportingController(IConfiguration config) { _config = config; }

    /// <summary>
    /// Report aggregato costi per mezzo nel range periodo richiesto.
    /// Body: { mezzo_id?, anno_da?, anno_a? }. Se mezzo_id=0 ritorna totali per tutti i mezzi.
    /// </summary>
    [HttpPost]
    public IActionResult ReportCostiMezzo([FromBody] ReportCostiRequest req)
    {
        string user_id;
        try { user_id = RawHelpers.authenticate(); }
        catch (AuthenticationException) { return Unauthorized(new { ok = false, error = "auth required" }); }

        try { RoleGate.Require(user_id, "admin", "gestore_flotta", "readonly"); }
        catch (AuthenticationException ex) { return StatusCode(403, new { ok = false, error = ex.Message }); }

        var cs = _config.GetConnectionString("DataSQLConnection");
        var rows = new List<object>();
        using (var cn = new SqlConnection(cs))
        {
            cn.Open();
            using var cmd = cn.CreateCommand();
            cmd.CommandText = @"
SELECT m.id AS mezzo_id, m.targa, m.marca + ' ' + m.modello AS mezzo,
       ISNULL(SUM(CASE WHEN src='M' THEN importo ELSE 0 END), 0) AS costo_manutenzioni,
       ISNULL(SUM(CASE WHEN src='R' THEN importo ELSE 0 END), 0) AS costo_carburante,
       ISNULL(SUM(CASE WHEN src='S' THEN importo ELSE 0 END), 0) AS costo_sinistri,
       ISNULL(SUM(importo), 0) AS costo_totale
  FROM dbo.mezzi m
  LEFT JOIN (
    SELECT mezzo_id, costo AS importo, 'M' AS src, data FROM dbo.manutenzioni WHERE ISNULL(cancellato,0)=0
    UNION ALL
    SELECT mezzo_id, costo_totale, 'R', CAST(data AS DATE) FROM dbo.rifornimenti WHERE ISNULL(cancellato,0)=0
    UNION ALL
    SELECT mezzo_id, costo_stimato, 'S', CAST(data AS DATE) FROM dbo.sinistri WHERE ISNULL(cancellato,0)=0
  ) c ON c.mezzo_id = m.id
   AND (@anno_da IS NULL OR YEAR(c.data) >= @anno_da)
   AND (@anno_a IS NULL OR YEAR(c.data) <= @anno_a)
 WHERE ISNULL(m.cancellato,0)=0
   AND (@mezzo_id = 0 OR m.id = @mezzo_id)
 GROUP BY m.id, m.targa, m.marca, m.modello
 ORDER BY costo_totale DESC";
            cmd.Parameters.AddWithValue("@mezzo_id", req?.mezzo_id ?? 0);
            cmd.Parameters.AddWithValue("@anno_da", (object?)req?.anno_da ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@anno_a", (object?)req?.anno_a ?? DBNull.Value);
            using var rdr = cmd.ExecuteReader();
            while (rdr.Read())
            {
                rows.Add(new
                {
                    mezzo_id = rdr.GetInt32(0),
                    targa = rdr.GetString(1),
                    mezzo = rdr.IsDBNull(2) ? "" : rdr.GetString(2),
                    costo_manutenzioni = rdr.GetDecimal(3),
                    costo_carburante = rdr.GetDecimal(4),
                    costo_sinistri = rdr.GetDecimal(5),
                    costo_totale = rdr.GetDecimal(6)
                });
            }
        }

        return Ok(new { ok = true, count = rows.Count, results = rows });
    }
}

public class ReportCostiRequest
{
    public int mezzo_id { get; set; }
    public int? anno_da { get; set; }
    public int? anno_a { get; set; }
}
