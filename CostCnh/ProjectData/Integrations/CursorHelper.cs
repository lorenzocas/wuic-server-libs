using System.Data;
using Microsoft.Data.SqlClient;

namespace CostCnh.Integrations;

/// <summary>
/// Helper condiviso da tutti i Sender / Poller per:
///   1. UPSERT del cursor row (integrations.provider_cursor_upsert)
///   2. Append dei messaggi nel log (integrations.message_envelope)
/// </summary>
public sealed class CursorHelper
{
    private readonly string _cs;
    public CursorHelper(IConfiguration cfg)
    {
        _cs = cfg.GetConnectionString("DataSQLConnection")
              ?? cfg["AppSettings:connection"]
              ?? throw new InvalidOperationException("DataSQLConnection mancante");
    }

    public async Task UpsertCursorAsync(string system, string provider,
        string pollState, string? lastEtag = null, string? lastMessageId = null,
        string? errorText = null, DateTime? nextEligibleUtc = null,
        string? payloadJson = null, CancellationToken ct = default)
    {
        await using var cn = new SqlConnection(_cs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "[integrations].[provider_cursor_upsert]";
        cmd.CommandType = CommandType.StoredProcedure;
        cmd.Parameters.AddWithValue("@system", system);
        cmd.Parameters.AddWithValue("@provider", provider);
        cmd.Parameters.AddWithValue("@last_etag", (object?)lastEtag ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@last_message_id", (object?)lastMessageId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@poll_state", pollState);
        cmd.Parameters.AddWithValue("@last_error_text", (object?)errorText ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@next_eligible_utc", (object?)nextEligibleUtc ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@payload_json", (object?)payloadJson ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task LogMessageAsync(string system, string direction,
        string? messageId, int? programId,
        string? entitySchema, string? entityName, string? entityId,
        string? payloadJson, byte status, string? outcomeText,
        int? userId = null, CancellationToken ct = default)
    {
        const string sql = @"
INSERT INTO [integrations].[message_envelope]
    (system, direction, message_id, related_entity_schema, related_entity_name, related_entity_id,
     program_id, payload_json, status, outcome_text,
     sent_at_utc, received_at_utc, utente_creazione)
VALUES (@sys, @dir, @mid, @es, @en, @eid, @pid, @pl, @st, @ot,
        CASE WHEN @dir = 'OUT' THEN SYSUTCDATETIME() ELSE NULL END,
        CASE WHEN @dir = 'IN ' THEN SYSUTCDATETIME() ELSE NULL END,
        @uid);";
        await using var cn = new SqlConnection(_cs);
        await cn.OpenAsync(ct);
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("@sys", system);
        cmd.Parameters.AddWithValue("@dir", direction);
        cmd.Parameters.AddWithValue("@mid", (object?)messageId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@es", (object?)entitySchema ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@en", (object?)entityName ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@eid", (object?)entityId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@pid", (object?)programId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@pl", (object?)payloadJson ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@st", status);
        cmd.Parameters.AddWithValue("@ot", (object?)outcomeText ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@uid", (object?)userId ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
