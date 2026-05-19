using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Data;
using System.Data.SqlClient;
using Microsoft.AspNetCore.Mvc;
using FatturazioneElettronica.Helpers;

namespace FatturazioneElettronica.Controllers;

/// <summary>
/// Block 6 #25: ripristino soft-delete dei record dalla vista vw_cestino.
///
/// Endpoint:
///   POST /api/cestino/restore  body { entita, id_originale }
///
/// Whitelist tabelle accettate (allineata a vw_cestino):
///   clienti, fornitori, prodotti, fatture_inviate, fatture_ricevute,
///   scadenze, movimenti_bancari, email_template, banche, pagamenti.
/// </summary>
[ApiController]
[Route("api/cestino")]
public class CestinoController : ControllerBase
{
    private static string DataConn =>
        WEB_UI_CRAFTER.Helpers.ConfigHelper.ResolveConnectionString("DataSQLConnection")
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    private static readonly System.Collections.Generic.HashSet<string> AllowedEntities = new(StringComparer.OrdinalIgnoreCase)
    {
        "clienti", "fornitori", "prodotti",
        "fatture_inviate", "fatture_ricevute",
        "scadenze", "movimenti_bancari", "email_template",
        "banche", "pagamenti", "codici_iva", "unita_misura"
    };

    public class RestoreRequest
    {
        public string Entita { get; set; } = "";
        public int IdOriginale { get; set; }
    }

    [HttpPost("restore")]
    public IActionResult Restore([FromBody] RestoreRequest req)
    {
        // Restore = operazione amministrativa (riporta in vita un record
        // soft-deleted) → super-admin gate. Pattern: app-creation/SKILL.md
        // Livello 5 - Auth + role-gate.
        var gate = AuthGate.RequireAdmin();
        if (gate != null) return gate;

        if (req == null || string.IsNullOrEmpty(req.Entita) || req.IdOriginale <= 0)
            return BadRequest(new { ok = false, error = "entita e id_originale richiesti" });

        // Whitelist per evitare SQL injection sul nome tabella
        if (!AllowedEntities.Contains(req.Entita))
            return BadRequest(new { ok = false, error = $"entita '{req.Entita}' non in whitelist" });

        try
        {
            using var cn = new SqlConnection(DataConn);
            cn.Open();
            // Tabella safe (whitelist sopra), id parametrizzato
            string sql = $@"
UPDATE dbo.[{req.Entita}]
SET cancellato = 0,
    data_eliminazione = NULL,
    utente_eliminazione = NULL
WHERE id = @id AND cancellato = 1";
            using var cmd = new SqlCommand(sql, cn);
            cmd.Parameters.AddWithValue("@id", req.IdOriginale);
            int rows = cmd.ExecuteNonQuery();
            return Ok(new { ok = rows > 0, restored = rows, entita = req.Entita, id_originale = req.IdOriginale });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }
}
