using System;
using System.Data;
using System.Data.SqlClient;
using System.Security.Authentication;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using FlottaMezzi.Helpers;
using WEB_UI_CRAFTER.Helpers;

namespace FlottaMezzi.Controllers;

/// <summary>
/// Endpoint geolocalizzazione mezzi.
/// Update GPS device-driven (es. da app mobile autista o tracker hardware).
/// </summary>
[ApiController]
[Route("api/Geolocation/[action]")]
public class GeolocationController : ControllerBase
{
    private readonly IConfiguration _config;

    public GeolocationController(IConfiguration config)
    {
        _config = config;
    }

    /// <summary>
    /// Aggiorna posizione GPS del mezzo. Auth + ruolo gestore_flotta o autista.
    /// Body: { mezzo_id, latitudine, longitudine }
    /// </summary>
    [HttpPost]
    public IActionResult UpdatePosition([FromBody] UpdatePositionRequest req)
    {
        // 1) Auth
        string user_id;
        try { user_id = RawHelpers.authenticate(); }
        catch (AuthenticationException) { return Unauthorized(new { ok = false, error = "auth required" }); }

        // 2) Role gate
        try { RoleGate.Require(user_id, "admin", "gestore_flotta", "autista"); }
        catch (AuthenticationException ex) { return StatusCode(403, new { ok = false, error = ex.Message }); }

        // 3) Validazione input
        if (req == null || req.mezzo_id <= 0)
            return BadRequest(new { ok = false, error = "mezzo_id required" });
        if (req.latitudine < -90 || req.latitudine > 90)
            return BadRequest(new { ok = false, error = "latitudine fuori range" });
        if (req.longitudine < -180 || req.longitudine > 180)
            return BadRequest(new { ok = false, error = "longitudine fuori range" });

        // 4) UPDATE su DB Dati
        var cs = _config.GetConnectionString("DataSQLConnection");
        using var cn = new SqlConnection(cs);
        cn.Open();
        using var cmd = cn.CreateCommand();
        cmd.CommandText = @"
UPDATE dbo.mezzi
   SET latitudine = @lat,
       longitudine = @lng,
       data_ultima_posizione = GETDATE(),
       data_modifica = GETDATE(),
       utente_modifica = @uid
 WHERE id = @id AND ISNULL(cancellato, 0) = 0";
        cmd.Parameters.AddWithValue("@lat", req.latitudine);
        cmd.Parameters.AddWithValue("@lng", req.longitudine);
        cmd.Parameters.AddWithValue("@id", req.mezzo_id);
        cmd.Parameters.AddWithValue("@uid", int.TryParse(user_id, out var uid) ? uid : (object)DBNull.Value);
        var rows = cmd.ExecuteNonQuery();
        if (rows == 0)
            return NotFound(new { ok = false, error = $"mezzo {req.mezzo_id} non trovato o cancellato" });

        return Ok(new { ok = true, mezzo_id = req.mezzo_id, updated_rows = rows });
    }
}

public class UpdatePositionRequest
{
    public int mezzo_id { get; set; }
    public double latitudine { get; set; }
    public double longitudine { get; set; }
}
