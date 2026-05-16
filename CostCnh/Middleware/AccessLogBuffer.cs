using System.Collections.Concurrent;
using System.Data;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Data.SqlClient;

namespace CostCnh.Middleware;

/// <summary>
/// Task 12.1 — Access log writer per audit.access_log (app-local, zero framework changes).
///
/// Pattern: in-process singleton ConcurrentQueue + IAsyncActionFilter globale
/// che enqueue una row per ogni request controller. Flush avviene via
/// scheduler task `costcnh_flush_access_log` (action_type=3 assembly).
///
/// Compliance AGENTS #X: no BackgroundService/Quartz/Hangfire; flush via dbo.scheduler.
/// </summary>
public sealed class AccessLogEntry
{
    public DateTime EventTime { get; init; }
    public int? UserId { get; init; }
    public Guid? SessionId { get; init; }
    public string AppModule { get; init; } = "";
    public string Action { get; init; } = "";
    public string? EntitySchema { get; init; }
    public string? EntityName { get; init; }
    public string? EntityId { get; init; }
    public byte Outcome { get; init; } = 1;
    public byte[]? IpAddress { get; init; }
    public string? PayloadJson { get; init; }
}

public sealed class AccessLogBuffer
{
    private readonly ConcurrentQueue<AccessLogEntry> _queue = new();
    private const int MAX_BUFFER_SIZE = 50_000;

    public int Count => _queue.Count;

    public void Enqueue(AccessLogEntry entry)
    {
        _queue.Enqueue(entry);
        // Cap-and-drop policy: oltre 50k entries, drop the oldest 1000
        if (_queue.Count > MAX_BUFFER_SIZE)
        {
            for (int i = 0; i < 1000; i++) _queue.TryDequeue(out _);
        }
    }

    public int DequeueBatch(List<AccessLogEntry> output, int maxBatch = 1000)
    {
        int n = 0;
        while (n < maxBatch && _queue.TryDequeue(out var e))
        {
            output.Add(e);
            n++;
        }
        return n;
    }
}

/// <summary>
/// Global IAsyncActionFilter che enqueue una entry per ogni controller action.
/// Registrato in DI via `AddControllers(opts => opts.Filters.Add<AccessLogFilter>())`.
/// </summary>
public sealed class AccessLogFilter : IAsyncActionFilter
{
    private readonly AccessLogBuffer _buffer;
    public AccessLogFilter(AccessLogBuffer buffer) { _buffer = buffer; }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var startTime = DateTime.UtcNow;
        var resp = await next();

        // Build entry post-execution
        var http = context.HttpContext;
        var route = (context.ActionDescriptor as ControllerActionDescriptor);
        var module = route?.ControllerName ?? "unknown";
        var action = (route?.ActionName ?? http.Request.Method).ToUpperInvariant();
        byte outcome = (resp.Exception != null || (http.Response.StatusCode >= 400)) ? (byte)0 : (byte)1;

        int? userId = null;
        var userClaim = http.User?.FindFirst("user_id")?.Value;
        if (int.TryParse(userClaim, out var u)) userId = u;

        byte[]? ip = null;
        var remote = http.Connection.RemoteIpAddress;
        if (remote != null)
        {
            try { ip = remote.GetAddressBytes(); } catch { }
        }

        // Entity inference (heuristic da route params)
        string? entityId = null, entityName = null;
        if (context.RouteData?.Values is { } rv)
        {
            foreach (var key in new[] { "id", "programId", "resourceId", "xbsNodeId" })
            {
                if (rv.TryGetValue(key, out var v) && v != null)
                {
                    entityId = v.ToString();
                    entityName = key.Replace("Id", "");
                    break;
                }
            }
        }

        _buffer.Enqueue(new AccessLogEntry
        {
            EventTime = startTime,
            UserId = userId,
            SessionId = null,                 // TODO: estrai da cookie k-user se serve
            AppModule = module,
            Action = action,
            EntitySchema = null,
            EntityName = entityName,
            EntityId = entityId,
            Outcome = outcome,
            IpAddress = ip,
            PayloadJson = null,               // skip payload, vola via flush perf
        });
    }
}

/// <summary>
/// Helper static usato dalla scheduler action per flush-are il buffer al DB.
/// Esegue SqlBulkCopy verso audit.access_log.
/// </summary>
public static class AccessLogFlusher
{
    public static async Task<int> FlushAsync(AccessLogBuffer buffer, string connectionString, CancellationToken ct = default)
    {
        var batch = new List<AccessLogEntry>(1024);
        var n = buffer.DequeueBatch(batch, 1000);
        if (n == 0) return 0;

        var dt = new DataTable();
        dt.Columns.Add("event_time", typeof(DateTime));
        dt.Columns.Add("user_id", typeof(int));
        dt.Columns.Add("session_id", typeof(Guid));
        dt.Columns.Add("app_module", typeof(string));
        dt.Columns.Add("action", typeof(string));
        dt.Columns.Add("entity_schema", typeof(string));
        dt.Columns.Add("entity_name", typeof(string));
        dt.Columns.Add("entity_id", typeof(string));
        dt.Columns.Add("outcome", typeof(byte));
        dt.Columns.Add("ip_address", typeof(byte[]));
        dt.Columns.Add("payload_json", typeof(string));

        foreach (var e in batch)
        {
            dt.Rows.Add(
                e.EventTime,
                (object?)e.UserId ?? DBNull.Value,
                (object?)e.SessionId ?? DBNull.Value,
                e.AppModule,
                e.Action,
                (object?)e.EntitySchema ?? DBNull.Value,
                (object?)e.EntityName ?? DBNull.Value,
                (object?)e.EntityId ?? DBNull.Value,
                e.Outcome,
                (object?)e.IpAddress ?? DBNull.Value,
                (object?)e.PayloadJson ?? DBNull.Value
            );
        }

        await using var cn = new SqlConnection(connectionString);
        await cn.OpenAsync(ct);
        using var bulk = new SqlBulkCopy(cn) { DestinationTableName = "[audit].[access_log]", BatchSize = 1000 };
        foreach (DataColumn col in dt.Columns)
            bulk.ColumnMappings.Add(col.ColumnName, col.ColumnName);
        await bulk.WriteToServerAsync(dt, ct);
        return n;
    }
}
