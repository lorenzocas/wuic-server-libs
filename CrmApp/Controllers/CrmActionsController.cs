using System.Data;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CrmApp.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CrmActionsController : ControllerBase
{
    private readonly string _dataConnectionString;
    private readonly ILogger<CrmActionsController> _logger;

    public CrmActionsController(IConfiguration configuration, ILogger<CrmActionsController> logger)
    {
        _logger = logger;
        _dataConnectionString = configuration.GetConnectionString("DataSQLConnection")
            ?? configuration["AppSettings:connection"]
            ?? string.Empty;
    }

    [HttpPost("execute/{actionKey}")]
    public async Task<IActionResult> Execute(string actionKey, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_dataConnectionString))
        {
            return BadRequest(new { ok = false, actionKey, message = "DataSQLConnection non configurata." });
        }

        string? routeName = null;
        JsonElement? currentRecord = null;
        JsonElement? selectedRecordKeys = null;

        try
        {
            (routeName, currentRecord, selectedRecordKeys) = await ReadActionPayloadAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Payload JSON non valido per action {ActionKey}", actionKey);
            return BadRequest(new { ok = false, actionKey, message = "Payload JSON non valido." });
        }

        try
        {
            await using var cn = new SqlConnection(_dataConnectionString);
            await cn.OpenAsync(cancellationToken);

            await using var cmd = cn.CreateCommand();
            cmd.CommandType = CommandType.StoredProcedure;
            cmd.CommandText = "dbo.crm_sp_execute_action";
            cmd.CommandTimeout = 180;
            var loggedUserId = ResolveLoggedUserId();
            cmd.Parameters.AddWithValue("@action_key", actionKey);
            cmd.Parameters.AddWithValue("@route_name", (object?)routeName ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@current_record", JsonToString(currentRecord));
            cmd.Parameters.AddWithValue("@selected_record_keys", JsonToString(selectedRecordKeys));
            cmd.Parameters.AddWithValue("@logged_user_id", (object?)loggedUserId ?? DBNull.Value);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return Ok(new { ok = true, actionKey, routeName, message = "Azione eseguita." });
            }

            var ok = reader["ok"] is bool b && b;
            var message = reader["message"]?.ToString() ?? "Azione eseguita.";
            var payloadRaw = reader["payload"]?.ToString();
            object? payload = null;
            if (!string.IsNullOrWhiteSpace(payloadRaw))
            {
                payload = JsonSerializer.Deserialize<object>(payloadRaw!);
            }

            return Ok(new
            {
                ok,
                actionKey,
                routeName,
                message,
                data = payload,
                receivedAtUtc = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Errore in crm action {ActionKey}", actionKey);
            return BadRequest(new { ok = false, actionKey, routeName, message = ex.Message });
        }
    }

    private async Task<(string? routeName, JsonElement? currentRecord, JsonElement? selectedRecordKeys)> ReadActionPayloadAsync(CancellationToken cancellationToken)
    {
        Request.EnableBuffering();
        Request.Body.Position = 0;

        using var reader = new StreamReader(Request.Body, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, leaveOpen: true);
        var rawBody = await reader.ReadToEndAsync(cancellationToken);
        Request.Body.Position = 0;

        if (string.IsNullOrWhiteSpace(rawBody))
        {
            return (null, null, null);
        }

        using var doc = JsonDocument.Parse(rawBody);
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
        {
            return (null, null, null);
        }

        string? routeName = null;
        JsonElement? currentRecord = null;
        JsonElement? selectedRecordKeys = null;

        if (TryGetPropertyIgnoreCase(root, "routeName", out var routeEl) && routeEl.ValueKind == JsonValueKind.String)
        {
            routeName = routeEl.GetString();
        }

        if (TryGetPropertyIgnoreCase(root, "currentRecord", out var currentEl) &&
            currentEl.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined))
        {
            currentRecord = currentEl.Clone();
        }

        if (TryGetPropertyIgnoreCase(root, "selectedRecordKeys", out var selectedEl) &&
            selectedEl.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined))
        {
            selectedRecordKeys = selectedEl.Clone();
        }

        return (routeName, currentRecord, selectedRecordKeys);
    }

    private static bool TryGetPropertyIgnoreCase(JsonElement root, string propertyName, out JsonElement value)
    {
        foreach (var prop in root.EnumerateObject())
        {
            if (string.Equals(prop.Name, propertyName, StringComparison.OrdinalIgnoreCase))
            {
                value = prop.Value;
                return true;
            }
        }
        value = default;
        return false;
    }

    private static string JsonToString(JsonElement? json)
    {
        if (json is null)
        {
            return "{}";
        }

        var val = json.Value;
        if (val.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return "{}";
        }

        return val.GetRawText();
    }

    private int? ResolveLoggedUserId()
    {
        var claimCandidates = new[]
        {
            ClaimTypes.NameIdentifier,
            "nameid",
            "sub",
            "user_id",
            "userid",
            "id"
        };

        foreach (var claimType in claimCandidates)
        {
            var claimValue = User?.FindFirst(claimType)?.Value;
            if (TryParseInt(claimValue, out var parsed))
            {
                return parsed;
            }
        }

        if (Request?.Headers?.TryGetValue("X-User-Id", out var headerVals) == true &&
            TryParseInt(headerVals.ToString(), out var headerUserId))
        {
            return headerUserId;
        }

        return null;
    }

    private static bool TryParseInt(string? value, out int parsed)
    {
        return int.TryParse(value, out parsed);
    }
}
