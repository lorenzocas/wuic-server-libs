using CrmApp.Realtime;
using Microsoft.AspNetCore.Mvc;

namespace CrmApp.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class CrmNotificationsController(
    ICrmNotificationRepository repository,
    ICrmNotificationPushService push,
    ILogger<CrmNotificationsController> logger) : ControllerBase
{
    [HttpGet("unread/{userId:int}")]
    public async Task<IActionResult> GetUnread(int userId, CancellationToken cancellationToken)
    {
        if (userId <= 0)
        {
            return BadRequest(new { ok = false, message = "userId non valido." });
        }

        try
        {
            var snapshot = await repository.GetUnreadAsync(userId, cancellationToken: cancellationToken);
            return Ok(new { ok = true, data = snapshot });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Errore get unread notifications per user {UserId}", userId);
            return BadRequest(new { ok = false, message = ex.Message });
        }
    }

    [HttpPost("markread/{notificationId:int}")]
    public async Task<IActionResult> MarkRead(int notificationId, CancellationToken cancellationToken)
    {
        if (notificationId <= 0)
        {
            return BadRequest(new { ok = false, message = "notificationId non valido." });
        }

        try
        {
            var userId = await repository.MarkReadAsync(notificationId, cancellationToken);
            if (userId is null || userId <= 0)
            {
                return NotFound(new { ok = false, message = "Notifica non trovata." });
            }

            var snapshot = await repository.GetUnreadAsync(userId.Value, cancellationToken: cancellationToken);
            await push.SendSnapshotToUserAsync(userId.Value, snapshot, cancellationToken);

            return Ok(new { ok = true, data = snapshot });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Errore mark read notification {NotificationId}", notificationId);
            return BadRequest(new { ok = false, message = ex.Message });
        }
    }
}
