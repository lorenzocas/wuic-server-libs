using Microsoft.Data.SqlClient;
using System.Text.Json;
using WuicCrashReceiver.Models;

namespace WuicCrashReceiver.Services;

/// <summary>
///  Insert-or-update di un crash report con dedup MERGE (chiave logica:
///  client_id + release + stack_hash). Se lo stesso bug rientra:
///   - <c>occurrences</c> += 1
///   - <c>last_seen</c> = NOW
///  Altrimenti inserisce una nuova row.
///
///  Tutte le decisioni autoritative (client_id, tier, license_expired) si
///  prendono dalla license verificata (non dal body) — il client non puo'
///  spoofare il proprio account o il proprio tier.
/// </summary>
public sealed class CrashIngestService
{
    private const int MAX_MESSAGE_LEN = 2000;
    private const int MAX_STACK_LEN = 64 * 1024; // 64 KB
    private const int MAX_BREADCRUMBS_LEN = 32 * 1024;
    private const int MAX_EXTRA_LEN = 8 * 1024;

    private readonly string _connectionString;
    private readonly ILogger<CrashIngestService> _log;
    private readonly AllowlistFilter _allowlist;

    public CrashIngestService(
        IConfiguration configuration,
        ILogger<CrashIngestService> log,
        AllowlistFilter allowlist)
    {
        _connectionString = configuration.GetConnectionString("WuicCrashes")
            ?? throw new InvalidOperationException("ConnectionStrings:WuicCrashes missing");
        _log = log;
        _allowlist = allowlist;
    }

    public sealed record IngestOutcome(bool Ok, string? Error, long? Id, int? Occurrences, string? StackHash);

    /// <summary>
    ///  Ingest entry point. License gia' verificata a monte dall'endpoint —
    ///  qui ci limitiamo a usarne i campi (email, tier, expiry) come source of
    ///  truth per <c>client_id</c>, <c>client_tier</c>, <c>license_expired_at_ingest</c>.
    /// </summary>
    public async Task<IngestOutcome> IngestAsync(
        CrashReportPayload payload,
        LicenseSignatureVerifier.LicensePayload license,
        bool licenseExpiredAtIngest,
        CancellationToken ct = default)
    {
        // 1. Validation server-side. type/message/stack_raw obbligatori.
        if (string.IsNullOrWhiteSpace(payload.Type))
            return new IngestOutcome(false, "type_missing", null, null, null);
        if (string.IsNullOrWhiteSpace(payload.Message))
            return new IngestOutcome(false, "message_missing", null, null, null);
        if (string.IsNullOrWhiteSpace(payload.StackRaw))
            return new IngestOutcome(false, "stack_missing", null, null, null);

        // 2. Trim hard cap su tutti i campi user-controlled per evitare bombe payload.
        string type = Truncate(payload.Type, 256);
        string message = Truncate(payload.Message, MAX_MESSAGE_LEN);
        string stackRaw = Truncate(payload.StackRaw, MAX_STACK_LEN);
        string source = NormalizeSource(payload.Source);
        string release = Truncate(string.IsNullOrWhiteSpace(payload.Release) ? "unknown" : payload.Release!, 64);
        string? machineFingerprint = TruncateOrNull(payload.MachineFingerprint, 128);
        string? url = TruncateOrNull(payload.Url, 1000);
        string? userId = TruncateOrNull(payload.UserId, 128);
        string? userAgent = TruncateOrNull(payload.UserAgent, 500);
        string? breadcrumbsJson = SerializeOrNull(payload.Breadcrumbs, MAX_BREADCRUMBS_LEN);
        string? extraJson = SerializeOrNull(payload.Extra, MAX_EXTRA_LEN);

        // 3. Calcolo stack_hash server-side. Se il client ne fornisce uno e
        //    matcha il nostro, lo usiamo (compat con dedup ottimistico client).
        //    Altrimenti SEMPRE quello che calcoliamo qui.
        string canonical = StackCanonicalizer.Canonicalize(stackRaw);
        string serverHash = StackCanonicalizer.ComputeHash(canonical);
        string stackHash = !string.IsNullOrWhiteSpace(payload.StackHash) && payload.StackHash.Equals(serverHash, StringComparison.OrdinalIgnoreCase)
            ? payload.StackHash.ToLowerInvariant()
            : serverHash;

        // 4. License-derived authoritative fields.
        string clientId = license.Email.Trim().ToLowerInvariant();
        string clientTier = (license.Tier ?? "developer").Trim().ToLowerInvariant();

        // 4b. Typed-error fields (Commit 8b: B+M3).
        string? errorCode = TruncateOrNull(payload.ErrorCode, 128);
        bool isTyped = payload.IsTyped || !string.IsNullOrWhiteSpace(errorCode);
        string? argsJson = SerializeOrNull(payload.Args, 4 * 1024);

        // 4c. Server hard filter (allowlist + sample + rate-limit).
        var decision = await _allowlist.EvaluateAsync(clientId, errorCode, stackHash, ct);
        if (!decision.Allow)
        {
            _log.LogDebug("Crash dropped by allowlist: client={Client} code={Code} reason={Reason}",
                clientId, errorCode ?? "<unhandled>", decision.RejectReason);
            return new IngestOutcome(false, decision.RejectReason ?? "filtered", null, null, stackHash);
        }

        // 5. MERGE.
        const string sql = @"
MERGE dbo._wuic_crash_reports WITH (HOLDLOCK) AS target
USING (SELECT
    @client_id AS client_id,
    @release_tag AS release_tag,
    @stack_hash AS stack_hash) AS src
   ON  target.client_id    = src.client_id
   AND target.release_tag  = src.release_tag
   AND target.stack_hash   = src.stack_hash
WHEN MATCHED THEN UPDATE SET
    last_seen   = SYSUTCDATETIME(),
    occurrences = target.occurrences + 1,
    -- refresh dei campi soft-mutable (URL/UA cambiano fra occurrences,
    --  vogliamo l'ultima visione per il triage):
    url         = COALESCE(@url, target.url),
    user_agent  = COALESCE(@user_agent, target.user_agent),
    user_id     = COALESCE(@user_id, target.user_id),
    breadcrumbs = COALESCE(@breadcrumbs, target.breadcrumbs),
    extra       = COALESCE(@extra, target.extra),
    -- typed-error fields: refresh args (latest values), errorCode/isTyped immutabili
    args_json   = COALESCE(@args_json, target.args_json),
    license_expired_at_ingest = CASE WHEN @license_expired = 1 THEN 1 ELSE target.license_expired_at_ingest END
WHEN NOT MATCHED THEN
    INSERT (client_id, client_tier, machine_fingerprint, release_tag, source,
            type, message, stack_hash, stack_raw, url, user_id, user_agent,
            breadcrumbs, extra, license_expired_at_ingest,
            error_code, args_json, is_typed)
    VALUES (@client_id, @client_tier, @machine_fingerprint, @release_tag, @source,
            @type, @message, @stack_hash, @stack_raw, @url, @user_id, @user_agent,
            @breadcrumbs, @extra, @license_expired,
            @error_code, @args_json, @is_typed)
OUTPUT inserted.id, inserted.occurrences;
";

        try
        {
            await using var cn = new SqlConnection(_connectionString);
            await cn.OpenAsync(ct);
            await using var cmd = new SqlCommand(sql, cn);
            cmd.Parameters.AddWithValue("@client_id", clientId);
            cmd.Parameters.AddWithValue("@client_tier", clientTier);
            cmd.Parameters.AddWithValue("@machine_fingerprint", (object?)machineFingerprint ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@release_tag", release);
            cmd.Parameters.AddWithValue("@source", source);
            cmd.Parameters.AddWithValue("@type", type);
            cmd.Parameters.AddWithValue("@message", message);
            cmd.Parameters.AddWithValue("@stack_hash", stackHash);
            cmd.Parameters.AddWithValue("@stack_raw", stackRaw);
            cmd.Parameters.AddWithValue("@url", (object?)url ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@user_id", (object?)userId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@user_agent", (object?)userAgent ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@breadcrumbs", (object?)breadcrumbsJson ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@extra", (object?)extraJson ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@license_expired", licenseExpiredAtIngest ? 1 : 0);
            cmd.Parameters.AddWithValue("@error_code", (object?)errorCode ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@args_json", (object?)argsJson ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@is_typed", isTyped ? 1 : 0);

            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            if (!await rdr.ReadAsync(ct))
                return new IngestOutcome(false, "merge_no_output", null, null, stackHash);

            long id = rdr.GetInt64(0);
            int occurrences = rdr.GetInt32(1);
            return new IngestOutcome(true, null, id, occurrences, stackHash);
        }
        catch (SqlException ex)
        {
            _log.LogError(ex, "CrashIngestService DB error (clientId={ClientId}, release={Release}, stackHash={StackHash})",
                clientId, release, stackHash);
            return new IngestOutcome(false, "db_error", null, null, stackHash);
        }
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s.Substring(0, max);
    private static string? TruncateOrNull(string? s, int max) =>
        string.IsNullOrEmpty(s) ? null : Truncate(s!, max);

    private static string NormalizeSource(string? s)
    {
        var n = (s ?? "").Trim().ToLowerInvariant();
        return n switch
        {
            ".net" or "net" or "csharp" or "dotnet" => ".net",
            "js" or "javascript" or "ts" or "typescript" => "js",
            _ => "unknown",
        };
    }

    private static string? SerializeOrNull(object? value, int maxLen)
    {
        if (value is null) return null;
        try
        {
            string json = JsonSerializer.Serialize(value);
            return json.Length <= maxLen ? json : json.Substring(0, maxLen);
        }
        catch
        {
            return null;
        }
    }
}
