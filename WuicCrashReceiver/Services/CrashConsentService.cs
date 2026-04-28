using Microsoft.Data.SqlClient;
using WuicCrashReceiver.Models;

namespace WuicCrashReceiver.Services;

/// <summary>
///  Persiste il consenso GDPR del cliente per il crash reporting (skill
///  crash-reporting Commit 9). Append-only su <c>_wuic_crash_consents</c>:
///  ogni toggle e' una row indipendente, mai UPDATE — lo storico e' l'audit
///  trail richiesto da GDPR art. 7 (dimostrabilita' del consenso).
/// </summary>
public sealed class CrashConsentService
{
    private readonly string _connectionString;
    private readonly ILogger<CrashConsentService> _log;

    public CrashConsentService(IConfiguration configuration, ILogger<CrashConsentService> log)
    {
        _connectionString = configuration.GetConnectionString("WuicCrashes")
            ?? throw new InvalidOperationException("ConnectionStrings:WuicCrashes missing");
        _log = log;
    }

    public sealed record ConsentOutcome(bool Ok, string? Error, long? Id);

    public async Task<ConsentOutcome> RecordAsync(
        ConsentRequest req,
        LicenseSignatureVerifier.LicensePayload license,
        string? clientIp,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(license.Email))
            return new ConsentOutcome(false, "license_email_missing", null);
        if (string.IsNullOrWhiteSpace(req.DisclaimerVersion))
            return new ConsentOutcome(false, "disclaimer_version_missing", null);

        // license-derived authoritative fields.
        string clientId = license.Email.Trim().ToLowerInvariant();
        string licenseEmail = license.Email.Trim();
        string disclaimerVersion = Truncate(req.DisclaimerVersion!, 16);
        string? locale = TruncateOrNull(req.Locale, 10);
        string? machineFingerprint = TruncateOrNull(req.MachineFingerprint, 128);
        string? userAgent = TruncateOrNull(req.UserAgent, 500);
        string? clientIpTruncated = TruncateOrNull(clientIp, 64);

        const string sql = @"
INSERT INTO dbo._wuic_crash_consents
    (client_id, license_email, consent_granted, consent_locale,
     consent_disclaimer_version, machine_fingerprint, client_ip, user_agent)
OUTPUT inserted.id
VALUES
    (@client_id, @license_email, @consent_granted, @locale,
     @version, @fp, @ip, @ua);";

        try
        {
            await using var cn = new SqlConnection(_connectionString);
            await cn.OpenAsync(ct);
            await using var cmd = new SqlCommand(sql, cn);
            cmd.Parameters.AddWithValue("@client_id", clientId);
            cmd.Parameters.AddWithValue("@license_email", licenseEmail);
            cmd.Parameters.AddWithValue("@consent_granted", req.ConsentGranted ? 1 : 0);
            cmd.Parameters.AddWithValue("@locale", (object?)locale ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@version", disclaimerVersion);
            cmd.Parameters.AddWithValue("@fp", (object?)machineFingerprint ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@ip", (object?)clientIpTruncated ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@ua", (object?)userAgent ?? DBNull.Value);
            var result = await cmd.ExecuteScalarAsync(ct);
            long id = result is long l ? l : Convert.ToInt64(result);
            _log.LogInformation(
                "Consent recorded: id={Id} client={Client} granted={Granted} version={Version} locale={Locale}",
                id, clientId, req.ConsentGranted, disclaimerVersion, locale ?? "?");
            return new ConsentOutcome(true, null, id);
        }
        catch (SqlException ex)
        {
            _log.LogError(ex, "CrashConsentService DB error (client={Client})", clientId);
            return new ConsentOutcome(false, "db_error", null);
        }
    }

    /// <summary>
    ///  Determina se il client ha attualmente il consenso GDPR per il
    ///  crash reporting. Strategia: leggi la riga PIU' RECENTE per
    ///  <c>client_id</c> ordinata per <c>consent_timestamp DESC, id DESC</c>
    ///  (tie-breaker su id se due toggle nello stesso ms) e ritorna
    ///  <c>granted == 1</c>.
    ///
    ///  ── Razionale ───────────────────────────────────────────────────
    ///  La tabella e' append-only per audit GDPR art. 7 (storico
    ///  immutabile dei consensi). Quindi un cliente che ha fatto
    ///  opt-in (granted=1) e poi opt-out (granted=0) ha 2 righe:
    ///  l'ULTIMA dice lo stato corrente. Senza l'<c>ORDER BY</c>
    ///  potremmo prendere una riga vecchia.
    ///
    ///  ── Casi ────────────────────────────────────────────────────────
    ///   - Nessuna riga per clientId          → false (mai consentito)
    ///   - Ultima riga ha granted=1           → true  (opt-in attivo)
    ///   - Ultima riga ha granted=0           → false (opt-out attivo)
    ///   - DB irraggiungibile / SQL error     → fail-open (true) +
    ///       LogError. Razionale: meglio accettare crash temp con DB
    ///       down che droppare 100% del traffico telemetria.
    /// </summary>
    public async Task<bool> IsConsentGrantedAsync(string clientId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(clientId)) return false;
        const string sql = @"
SELECT TOP 1 consent_granted
FROM dbo._wuic_crash_consents
WHERE client_id = @client_id
ORDER BY consent_timestamp DESC, id DESC;";
        try
        {
            await using var cn = new SqlConnection(_connectionString);
            await cn.OpenAsync(ct);
            await using var cmd = new SqlCommand(sql, cn);
            cmd.Parameters.AddWithValue("@client_id", clientId);
            var result = await cmd.ExecuteScalarAsync(ct);
            if (result is null || result == DBNull.Value) return false;
            // bit column → ritorna come bool/byte/int a seconda del provider
            return result switch
            {
                bool b => b,
                int i => i != 0,
                byte by => by != 0,
                _ => Convert.ToInt32(result) != 0,
            };
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "IsConsentGrantedAsync DB error for client={Client} — fail-open accept", clientId);
            return true; // fail-open: vedi razionale nel doc-comment
        }
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s.Substring(0, max);
    private static string? TruncateOrNull(string? s, int max) =>
        string.IsNullOrEmpty(s) ? null : Truncate(s!, max);
}
