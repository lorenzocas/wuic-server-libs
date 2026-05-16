using System.Data;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CostCnh.Controllers;

/// <summary>
/// MAC (Master Approval / Cost) integration endpoint.
/// Pattern background async (uguale a ReportingController):
///   POST /api/mac/send/{requestId}
///     → INSERT audit.outbox event 'mac_send' + payload con request_id
///     → return immediato outboxId
///     → costcnh_outbox_dispatch claima + HandleMacSendAsync esegue
///        IMacRequestSender (Stub | Http via Provider Symmetry resolver)
///        + UPDATE mac.request.status=1 + INotificationRepository notifica
/// </summary>
[ApiController]
[Route("api/mac")]
public class MacController : ControllerBase
{
    private readonly string _dataCs;
    private readonly ILogger<MacController> _log;

    public MacController(IConfiguration cfg, ILogger<MacController> logger)
    {
        _log = logger;
        _dataCs = cfg.GetConnectionString("DataSQLConnection")
                  ?? cfg["AppSettings:connection"]
                  ?? throw new InvalidOperationException("DataSQLConnection mancante");
    }

    [HttpPost("send/{requestId:int}")]
    public async Task<IActionResult> SendRequest(int requestId, CancellationToken ct)
    {
        await using var cn = new SqlConnection(_dataCs);
        await cn.OpenAsync(ct);

        int status = -1;
        string? subject = null;
        await using (var chk = cn.CreateCommand())
        {
            chk.CommandText = "SELECT status, subject FROM [mac].[request] WHERE id = @id AND ISNULL(cancellato,0)=0";
            chk.Parameters.AddWithValue("@id", requestId);
            await using var rd = await chk.ExecuteReaderAsync(ct);
            if (await rd.ReadAsync(ct))
            {
                status = rd.GetByte(0);
                subject = rd.GetString(1);
            }
        }
        if (status < 0) return NotFound(new { ok = false, error = $"MAC request {requestId} non trovata" });
        if (status >= 1) return BadRequest(new { ok = false, error = $"MAC request {requestId} gia' inviata (status={status})" });

        int? recipientUserId = ResolveCurrentUserId();

        await using var tx = (SqlTransaction)await cn.BeginTransactionAsync(ct);
        try
        {
            long outboxId;
            await using (var enq = cn.CreateCommand())
            {
                enq.Transaction = tx;
                enq.CommandText = "[audit].[outbox_enqueue]";
                enq.CommandType = CommandType.StoredProcedure;
                enq.Parameters.AddWithValue("@event_kind", "mac_send");
                enq.Parameters.AddWithValue("@entity_schema", "mac");
                enq.Parameters.AddWithValue("@entity_name", "request");
                enq.Parameters.AddWithValue("@entity_id", requestId.ToString());
                enq.Parameters.AddWithValue("@payload_json", JsonSerializer.Serialize(new
                {
                    request_id = requestId,
                    recipient_user_id = recipientUserId
                }));
                enq.Parameters.AddWithValue("@enqueued_by_user_id", (object?)recipientUserId ?? DBNull.Value);
                var idParam = enq.Parameters.Add("@id", SqlDbType.BigInt);
                idParam.Direction = ParameterDirection.Output;
                await enq.ExecuteNonQueryAsync(ct);
                outboxId = Convert.ToInt64(idParam.Value);
            }

            await using (var upd = cn.CreateCommand())
            {
                upd.Transaction = tx;
                upd.CommandText = "UPDATE [mac].[request] SET outbox_id = @ob WHERE id = @id";
                upd.Parameters.AddWithValue("@ob", outboxId);
                upd.Parameters.AddWithValue("@id", requestId);
                await upd.ExecuteNonQueryAsync(ct);
            }
            await tx.CommitAsync(ct);

            _log.LogInformation("MAC request {Id} enqueued for send (outboxId={OutId})", requestId, outboxId);
            return Ok(new
            {
                ok = true,
                requestId,
                outboxId,
                message = $"Invio richiesta MAC '{subject}' avviato. Riceverai notifica al completamento."
            });
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync(ct);
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }

    private int? ResolveCurrentUserId()
    {
        if (Request?.Headers?.TryGetValue("X-User-Id", out var headerVals) == true &&
            int.TryParse(headerVals.ToString(), out var hid)) return hid;
        if (Request?.Cookies?.TryGetValue("k-user", out var ckRaw) == true && !string.IsNullOrEmpty(ckRaw))
        {
            try
            {
                var decoded = Uri.UnescapeDataString(ckRaw);
                using var doc = JsonDocument.Parse(decoded);
                if (doc.RootElement.TryGetProperty("user_id", out var uidEl))
                {
                    var raw = uidEl.ValueKind == JsonValueKind.String ? uidEl.GetString() : uidEl.GetRawText();
                    if (int.TryParse(raw, out var parsed)) return parsed;
                }
            }
            catch { }
        }
        return null;
    }
}
