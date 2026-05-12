using System;
using System.Data;
using System.Data.SqlClient;
using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace FlottaMezzi.Controllers;

/// <summary>
/// Endpoint loopback chiamati dallo scheduler framework (action_type='2' HTTP).
/// Tutti gli endpoint sono idempotenti e safe da chiamare ripetutamente.
/// Auth: NON richiesta perche' chiamati da SchedulerHostedService interno
/// allo stesso processo (loopback). Per prudenza in deploy esposti su rete
/// pubblica, aggiungere IP-allowlist o shared-secret header.
/// </summary>
[ApiController]
[Route("api/flotta/[action]")]
public class FlottaJobsController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly ILogger<FlottaJobsController> _logger;

    public FlottaJobsController(IConfiguration config, ILogger<FlottaJobsController> logger)
    {
        _config = config;
        _logger = logger;
    }

    /// <summary>
    /// Job giornaliero: scansiona scadenze imminenti (patenti, assicurazioni, revisioni)
    /// nei prossimi 30gg e ritorna riepilogo. Idempotente.
    /// In una versione completa: enqueue notifiche bell via INotificationRepository.
    /// </summary>
    [HttpPost]
    public IActionResult CheckScadenze()
    {
        var cs = _config.GetConnectionString("DataSQLConnection");
        var result = new Dictionary<string, int>
        {
            ["patenti_30gg"] = 0,
            ["assicurazioni_30gg"] = 0,
            ["revisioni_30gg"] = 0,
            ["scadute"] = 0
        };

        try
        {
            using var cn = new SqlConnection(cs);
            cn.Open();
            using var cmd = cn.CreateCommand();
            cmd.CommandText = @"
SELECT 'patenti_30gg' AS k, COUNT(*) AS n FROM dbo.conducenti
 WHERE ISNULL(cancellato,0)=0 AND scadenza_patente IS NOT NULL
   AND scadenza_patente >= CAST(GETDATE() AS DATE)
   AND scadenza_patente <= DATEADD(day, 30, CAST(GETDATE() AS DATE))
UNION ALL
SELECT 'assicurazioni_30gg', COUNT(*) FROM dbo.contratti_assicurativi
 WHERE ISNULL(cancellato,0)=0 AND data_scadenza IS NOT NULL
   AND data_scadenza >= CAST(GETDATE() AS DATE)
   AND data_scadenza <= DATEADD(day, 30, CAST(GETDATE() AS DATE))
UNION ALL
SELECT 'revisioni_30gg', COUNT(*) FROM dbo.revisioni
 WHERE ISNULL(cancellato,0)=0 AND scadenza_prossima IS NOT NULL
   AND scadenza_prossima >= CAST(GETDATE() AS DATE)
   AND scadenza_prossima <= DATEADD(day, 30, CAST(GETDATE() AS DATE))
UNION ALL
SELECT 'scadute', COUNT(*) FROM (
    SELECT scadenza_patente AS d FROM dbo.conducenti WHERE ISNULL(cancellato,0)=0 AND scadenza_patente IS NOT NULL
    UNION ALL SELECT data_scadenza FROM dbo.contratti_assicurativi WHERE ISNULL(cancellato,0)=0 AND data_scadenza IS NOT NULL
    UNION ALL SELECT scadenza_prossima FROM dbo.revisioni WHERE ISNULL(cancellato,0)=0 AND scadenza_prossima IS NOT NULL
) u WHERE u.d < CAST(GETDATE() AS DATE);";
            using var rdr = cmd.ExecuteReader();
            while (rdr.Read())
            {
                var k = rdr.GetString(0);
                var n = rdr.GetInt32(1);
                result[k] = n;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "CheckScadenze failed");
            return StatusCode(500, new { ok = false, error = ex.Message });
        }

        _logger.LogInformation("CheckScadenze completato: {Result}", string.Join(", ", result));
        return Ok(new { ok = true, scan_at = DateTime.UtcNow, result });
    }

    /// <summary>
    /// Job mensile: trigger ricalcolo aggregati costi.
    /// In versione completa: chiama una stored sp_aggrega_costi_mensile su DB Dati.
    /// Per ora: ritorna count dai 3 source (manutenzioni, rifornimenti, sinistri) ultimi 30gg.
    /// </summary>
    [HttpPost]
    public IActionResult AggregaCosti()
    {
        var cs = _config.GetConnectionString("DataSQLConnection");
        try
        {
            using var cn = new SqlConnection(cs);
            cn.Open();
            using var cmd = cn.CreateCommand();
            cmd.CommandText = @"
SELECT
  (SELECT ISNULL(SUM(costo), 0) FROM dbo.manutenzioni WHERE ISNULL(cancellato,0)=0 AND data >= DATEADD(day,-30,CAST(GETDATE() AS DATE))) AS manutenzioni_30gg,
  (SELECT ISNULL(SUM(costo_totale), 0) FROM dbo.rifornimenti WHERE ISNULL(cancellato,0)=0 AND data >= DATEADD(day,-30,CAST(GETDATE() AS DATE))) AS rifornimenti_30gg,
  (SELECT ISNULL(SUM(costo_stimato), 0) FROM dbo.sinistri WHERE ISNULL(cancellato,0)=0 AND data >= DATEADD(day,-30,CAST(GETDATE() AS DATE))) AS sinistri_30gg";
            using var rdr = cmd.ExecuteReader();
            decimal m = 0, r = 0, s = 0;
            if (rdr.Read())
            {
                m = rdr.GetDecimal(0);
                r = rdr.GetDecimal(1);
                s = rdr.GetDecimal(2);
            }
            return Ok(new { ok = true, scan_at = DateTime.UtcNow,
                            manutenzioni_30gg = m, rifornimenti_30gg = r, sinistri_30gg = s,
                            totale = m + r + s });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AggregaCosti failed");
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }
}
