using System.Data;
using System.Text.Json;
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
    public async Task<IActionResult> Execute(string actionKey, [FromBody] CrmActionRequest? request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_dataConnectionString))
        {
            return BadRequest(new { ok = false, actionKey, message = "DataSQLConnection non configurata." });
        }

        request ??= new CrmActionRequest();

        try
        {
            await using var cn = new SqlConnection(_dataConnectionString);
            await cn.OpenAsync(cancellationToken);

            await using var cmd = cn.CreateCommand();
            cmd.CommandType = CommandType.StoredProcedure;
            cmd.CommandText = "dbo.crm_sp_execute_action";
            cmd.CommandTimeout = 180;
            cmd.Parameters.AddWithValue("@action_key", actionKey);
            cmd.Parameters.AddWithValue("@route_name", (object?)request.RouteName ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@current_record", JsonToString(request.CurrentRecord));
            cmd.Parameters.AddWithValue("@selected_record_keys", JsonToString(request.SelectedRecordKeys));

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return Ok(new { ok = true, actionKey, routeName = request.RouteName, message = "Azione eseguita." });
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
                routeName = request.RouteName,
                message,
                data = payload,
                receivedAtUtc = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Errore in crm action {ActionKey}", actionKey);
            return BadRequest(new { ok = false, actionKey, routeName = request.RouteName, message = ex.Message });
        }
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
}

public sealed class CrmActionRequest
{
    public string? ActionKey { get; set; }
    public string? RouteName { get; set; }
    public string? ActionLabel { get; set; }
    public JsonElement? CurrentRecord { get; set; }
    public JsonElement? SelectedRecordKeys { get; set; }
}
