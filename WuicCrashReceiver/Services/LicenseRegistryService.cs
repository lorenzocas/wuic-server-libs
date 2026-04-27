using Microsoft.Data.SqlClient;
using System.Collections.Concurrent;
using System.Data;
using WuicCrashReceiver.Models;

namespace WuicCrashReceiver.Services;

/// <summary>
///  Registry centralizzato delle licenze emesse dal vendor (skill license-issuing).
///
///  Source of truth: DB `WuicLicensing` ospitato sulla stessa istanza SQL del
///  receiver. Tabelle:
///    - dbo._wuic_license_customers      (anagrafica per email)
///    - dbo._wuic_license_history        (storico emissioni + revoche)
///
///  Doppio uso del service:
///   1) ADMIN endpoints: register (sync da vendor tool), revoke, list.
///      Gated da AdminAuth in <see cref="WuicCrashReceiver.Program"/>.
///   2) CRASH ingest enrichment: <see cref="FindByPayloadAsync"/> chiamato da
///      <see cref="CrashIngestService"/> per validare la license header
///      contro il registry oltre alla sola firma RSA.
///
///  In-memory cache TTL 5min: lookup ad alta frequenza (1 per ingest) ma
///  tabella che cambia raramente. Cache key: payload_base64 prefix (450 char,
///  vedi computed column license_payload_prefix nel SQL).
/// </summary>
public sealed class LicenseRegistryService
{
    /// <summary>TTL della cache in-memory delle license lookup.</summary>
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    private readonly string _connectionString;
    private readonly ILogger<LicenseRegistryService> _log;
    private readonly ConcurrentDictionary<string, CacheEntry> _byPayloadCache = new(StringComparer.Ordinal);

    public LicenseRegistryService(IConfiguration configuration, ILogger<LicenseRegistryService> log)
    {
        // Hardcoded derivation: il DB `WuicLicensing` e' sempre co-locato con
        // `WuicCrashes` sulla stessa istanza SQL del receiver. Riusiamo la
        // connection string `WuicCrashes` swappando solo il nome catalog →
        // niente seconda chiave da configurare in appsettings, una sola
        // credenziale da ruotare.
        var crashes = configuration.GetConnectionString("WuicCrashes")
            ?? throw new InvalidOperationException("ConnectionStrings:WuicCrashes missing in configuration");
        _connectionString = System.Text.RegularExpressions.Regex.Replace(
            crashes,
            @"Initial\s+Catalog\s*=\s*[^;]+",
            "Initial Catalog=WuicLicensing",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        _log = log;
    }

    public sealed record LicenseLookupResult(
        long Id,
        int CustomerId,
        string Email,
        string Tier,
        DateTime ExpiryUtc,
        DateTime? MaintenanceExpiryUtc,
        bool Revoked,
        DateTime? RevokedAt,
        string? RevokedReason);

    private sealed record CacheEntry(LicenseLookupResult? Value, DateTime FetchedAtUtc);

    /// <summary>
    ///  Cerca una license_history row dato il payload_base64 (cosi' come arriva
    ///  nel header X-Wuic-License-Payload). Chiamato dall'ingest path PER OGNI
    ///  CRASH — quindi cached con TTL 5min per non hammerare il DB.
    ///  Ritorna null se non registrata (licenza emessa con tool che non ha
    ///  syncato al remote, OR licenza falsa con firma valida non issued).
    /// </summary>
    public async Task<LicenseLookupResult?> FindByPayloadAsync(string licensePayloadB64, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(licensePayloadB64)) return null;

        if (_byPayloadCache.TryGetValue(licensePayloadB64, out var cached)
            && DateTime.UtcNow - cached.FetchedAtUtc < CacheTtl)
        {
            return cached.Value;
        }

        // Index: IX_lic_hist_payload_prefix (su computed col `license_payload_prefix`)
        // → rapida prefix-lookup. Poi confermiamo full match nella WHERE.
        const string sql = @"
SELECT TOP 1 h.id, h.customer_id, c.email, h.tier, h.expiry_utc,
       h.maintenance_expiry_utc, h.revoked, h.revoked_at, h.revoked_reason
FROM dbo._wuic_license_history h
INNER JOIN dbo._wuic_license_customers c ON c.id = h.customer_id
WHERE h.license_payload_prefix = LEFT(@payload, 450)
  AND h.license_payload_base64 = @payload
ORDER BY h.id DESC;";

        LicenseLookupResult? result = null;
        try
        {
            await using var cn = new SqlConnection(_connectionString);
            await cn.OpenAsync(ct);
            await using var cmd = new SqlCommand(sql, cn);
            cmd.Parameters.Add("@payload", SqlDbType.NVarChar, -1).Value = licensePayloadB64;
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            if (await rdr.ReadAsync(ct))
            {
                result = new LicenseLookupResult(
                    Id: rdr.GetInt32(0),
                    CustomerId: rdr.GetInt32(1),
                    Email: rdr.GetString(2),
                    Tier: rdr.GetString(3),
                    ExpiryUtc: rdr.GetDateTime(4),
                    MaintenanceExpiryUtc: rdr.IsDBNull(5) ? null : rdr.GetDateTime(5),
                    Revoked: rdr.GetBoolean(6),
                    RevokedAt: rdr.IsDBNull(7) ? null : rdr.GetDateTime(7),
                    RevokedReason: rdr.IsDBNull(8) ? null : rdr.GetString(8));
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "LicenseRegistryService.FindByPayloadAsync failed");
            // Fail-open: se il DB e' temporaneamente unavailable NON blocchiamo
            // gli ingest crash (la firma RSA e' gia' verificata). Il prossimo
            // poll rinfresca la cache.
            return null;
        }

        _byPayloadCache[licensePayloadB64] = new CacheEntry(result, DateTime.UtcNow);
        return result;
    }

    /// <summary>
    ///  Invalida la cache del payload (chiamato dopo register/revoke per
    ///  garantire visibilita' immediata). NB: gli altri istanze receiver
    ///  (load-balancer scenario) hanno cache separate e vedranno il cambio
    ///  solo dopo TTL 5min — accettabile.
    /// </summary>
    public void InvalidateCache(string? payloadB64 = null)
    {
        if (payloadB64 is not null) { _byPayloadCache.TryRemove(payloadB64, out _); }
        else { _byPayloadCache.Clear(); }
    }

    /// <summary>
    ///  Register/upsert chiamato dal vendor tool license-issue.ps1 -SyncRemote.
    ///  Upsert customer + INSERT history. Ritorna l'id sul receiver remote.
    /// </summary>
    public async Task<(bool Ok, string? Error, long? Id, int? CustomerId)> RegisterAsync(
        LicenseRegisterRequest req, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(req.Email)) return (false, "email_missing", null, null);
        if (string.IsNullOrWhiteSpace(req.Tier)) return (false, "tier_missing", null, null);
        if (string.IsNullOrWhiteSpace(req.LicensePayloadBase64)) return (false, "payload_missing", null, null);
        if (string.IsNullOrWhiteSpace(req.LicenseSignatureBase64)) return (false, "signature_missing", null, null);
        if (req.ExpiryUtc is null) return (false, "expiry_missing", null, null);

        try
        {
            await using var cn = new SqlConnection(_connectionString);
            await cn.OpenAsync(ct);
            await using var tx = await cn.BeginTransactionAsync(ct);

            // 1) Upsert customer.
            int customerId;
            const string upsertCustomerSql = @"
MERGE dbo._wuic_license_customers WITH (HOLDLOCK) AS target
USING (VALUES (@email, @name, @notes)) AS src(email, name, notes)
   ON target.email = src.email
WHEN MATCHED THEN
    UPDATE SET customer_name = COALESCE(src.name, target.customer_name),
               notes = COALESCE(src.notes, target.notes),
               updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (email, customer_name, notes) VALUES (src.email, src.name, src.notes)
OUTPUT inserted.id;";
            await using (var cmd = new SqlCommand(upsertCustomerSql, cn, (SqlTransaction)tx))
            {
                cmd.Parameters.Add("@email", SqlDbType.NVarChar, 320).Value = req.Email!.Trim();
                cmd.Parameters.Add("@name", SqlDbType.NVarChar, 200).Value = (object?)req.CustomerName ?? DBNull.Value;
                cmd.Parameters.Add("@notes", SqlDbType.NVarChar, 1000).Value = (object?)req.Notes ?? DBNull.Value;
                customerId = (int)(await cmd.ExecuteScalarAsync(ct))!;
            }

            // 2) INSERT history row.
            const string insertHistorySql = @"
INSERT INTO dbo._wuic_license_history (
    customer_id, tier, features_json, expiry_utc, maintenance_expiry_utc,
    machine_fingerprints_json, license_payload_base64, license_signature_base64,
    notes, issue_type, fingerprint_count, base_price_eur,
    extra_fingerprints_charged, extra_price_eur, total_price_eur
)
OUTPUT inserted.id
VALUES (
    @customerId, @tier, @features, @expiry, @mexpiry,
    @fingerprints, @payload, @signature,
    @notes, @issueType, @fpCount, @basePrice,
    @extraFp, @extraPrice, @totalPrice
);";
            long historyId;
            await using (var cmd = new SqlCommand(insertHistorySql, cn, (SqlTransaction)tx))
            {
                cmd.Parameters.Add("@customerId", SqlDbType.Int).Value = customerId;
                cmd.Parameters.Add("@tier", SqlDbType.NVarChar, 50).Value = req.Tier!;
                cmd.Parameters.Add("@features", SqlDbType.NVarChar, -1).Value = req.FeaturesJson ?? "[]";
                cmd.Parameters.Add("@expiry", SqlDbType.DateTime2).Value = req.ExpiryUtc!.Value;
                cmd.Parameters.Add("@mexpiry", SqlDbType.DateTime2).Value = (object?)req.MaintenanceExpiryUtc ?? DBNull.Value;
                cmd.Parameters.Add("@fingerprints", SqlDbType.NVarChar, -1).Value = req.MachineFingerprintsJson ?? "[]";
                cmd.Parameters.Add("@payload", SqlDbType.NVarChar, -1).Value = req.LicensePayloadBase64!;
                cmd.Parameters.Add("@signature", SqlDbType.NVarChar, -1).Value = req.LicenseSignatureBase64!;
                cmd.Parameters.Add("@notes", SqlDbType.NVarChar, 1000).Value = (object?)req.Notes ?? DBNull.Value;
                cmd.Parameters.Add("@issueType", SqlDbType.NVarChar, 30).Value = req.IssueType ?? "initial";
                cmd.Parameters.Add("@fpCount", SqlDbType.Int).Value = (object?)req.FingerprintCount ?? DBNull.Value;
                cmd.Parameters.Add("@basePrice", SqlDbType.Decimal).Value = (object?)req.BasePriceEur ?? DBNull.Value;
                cmd.Parameters.Add("@extraFp", SqlDbType.Int).Value = req.ExtraFingerprintsCharged ?? 0;
                cmd.Parameters.Add("@extraPrice", SqlDbType.Decimal).Value = (object?)req.ExtraPriceEur ?? DBNull.Value;
                cmd.Parameters.Add("@totalPrice", SqlDbType.Decimal).Value = (object?)req.TotalPriceEur ?? DBNull.Value;
                historyId = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
            }

            await tx.CommitAsync(ct);
            InvalidateCache(req.LicensePayloadBase64);
            _log.LogInformation("License registered: id={Id} customer={Cust} email={Email} tier={Tier}",
                historyId, customerId, req.Email, req.Tier);
            return (true, null, historyId, customerId);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "LicenseRegistryService.RegisterAsync failed (email={Email})", req.Email);
            return (false, "db_error", null, null);
        }
    }

    /// <summary>Revoca la license_history row id. Idempotente.</summary>
    public async Task<(bool Ok, string? Error)> RevokeAsync(long id, string? reason, string? actor, CancellationToken ct = default)
    {
        const string sql = @"
UPDATE dbo._wuic_license_history SET
    revoked = 1,
    revoked_at = COALESCE(revoked_at, SYSUTCDATETIME()),
    revoked_by = COALESCE(revoked_by, @actor),
    revoked_reason = COALESCE(revoked_reason, @reason)
WHERE id = @id;
SELECT license_payload_base64 FROM dbo._wuic_license_history WHERE id = @id;";

        try
        {
            await using var cn = new SqlConnection(_connectionString);
            await cn.OpenAsync(ct);
            await using var cmd = new SqlCommand(sql, cn);
            cmd.Parameters.Add("@id", SqlDbType.BigInt).Value = id;
            cmd.Parameters.Add("@actor", SqlDbType.NVarChar, 256).Value = (object?)actor ?? "admin";
            cmd.Parameters.Add("@reason", SqlDbType.NVarChar, 500).Value = (object?)reason ?? DBNull.Value;
            var payload = (string?)await cmd.ExecuteScalarAsync(ct);
            if (payload is null) return (false, "not_found");
            InvalidateCache(payload);
            _log.LogWarning("License revoked: id={Id} reason={Reason}", id, reason);
            return (true, null);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "LicenseRegistryService.RevokeAsync failed for id={Id}", id);
            return (false, "db_error");
        }
    }

    /// <summary>List paginata per la admin UI.</summary>
    public async Task<LicenseListResponse> ListAsync(
        string? emailFilter, bool includeRevoked, int limit, int offset, CancellationToken ct = default)
    {
        var resp = new LicenseListResponse();
        var sb = new System.Text.StringBuilder();
        sb.Append(@"SELECT h.id, h.customer_id, c.email, c.customer_name, h.tier, h.issue_type,
                          h.issued_at, h.expiry_utc, h.maintenance_expiry_utc, h.revoked,
                          h.revoked_at, h.revoked_reason, h.fingerprint_count, h.total_price_eur
                   FROM dbo._wuic_license_history h
                   INNER JOIN dbo._wuic_license_customers c ON c.id = h.customer_id
                   WHERE 1=1 ");
        var ps = new List<(string Name, object Val, SqlDbType Type)>();
        if (!includeRevoked) sb.Append(" AND h.revoked = 0 ");
        if (!string.IsNullOrWhiteSpace(emailFilter))
        {
            sb.Append(" AND c.email = @email ");
            ps.Add(("@email", emailFilter, SqlDbType.NVarChar));
        }
        sb.Append(" ORDER BY h.issued_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;");
        var listSql = sb.ToString();

        var countSql = string.Concat(@"SELECT COUNT_BIG(*) FROM dbo._wuic_license_history h
                                       INNER JOIN dbo._wuic_license_customers c ON c.id = h.customer_id
                                       WHERE 1=1 ",
                                     includeRevoked ? "" : " AND h.revoked = 0 ",
                                     string.IsNullOrWhiteSpace(emailFilter) ? "" : " AND c.email = @email ");

        try
        {
            await using var cn = new SqlConnection(_connectionString);
            await cn.OpenAsync(ct);
            await using (var cmd = new SqlCommand(countSql, cn))
            {
                foreach (var p in ps) cmd.Parameters.Add(p.Name, p.Type).Value = p.Val;
                resp.Total = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
            }
            await using (var cmd = new SqlCommand(listSql, cn))
            {
                foreach (var p in ps) cmd.Parameters.Add(p.Name, p.Type).Value = p.Val;
                cmd.Parameters.Add("@offset", SqlDbType.Int).Value = Math.Max(0, offset);
                cmd.Parameters.Add("@limit", SqlDbType.Int).Value = Math.Clamp(limit, 1, 200);
                await using var rdr = await cmd.ExecuteReaderAsync(ct);
                while (await rdr.ReadAsync(ct))
                {
                    resp.Rows.Add(new LicenseListRow
                    {
                        Id = rdr.GetInt32(0),
                        CustomerId = rdr.GetInt32(1),
                        Email = rdr.GetString(2),
                        CustomerName = rdr.IsDBNull(3) ? null : rdr.GetString(3),
                        Tier = rdr.GetString(4),
                        IssueType = rdr.GetString(5),
                        IssuedAt = rdr.GetDateTime(6),
                        ExpiryUtc = rdr.GetDateTime(7),
                        MaintenanceExpiryUtc = rdr.IsDBNull(8) ? null : rdr.GetDateTime(8),
                        Revoked = rdr.GetBoolean(9),
                        RevokedAt = rdr.IsDBNull(10) ? null : rdr.GetDateTime(10),
                        RevokedReason = rdr.IsDBNull(11) ? null : rdr.GetString(11),
                        FingerprintCount = rdr.IsDBNull(12) ? null : rdr.GetInt32(12),
                        TotalPriceEur = rdr.IsDBNull(13) ? null : rdr.GetDecimal(13),
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "LicenseRegistryService.ListAsync failed");
            resp.Ok = false;
        }
        return resp;
    }

    /// <summary>
    ///  Registra un push npm/NuGet in `_wuic_versions_history`. Mirror
    ///  remoto di `deploy-release.ps1 :: Register-WuicVersionHistory`.
    ///  Almeno uno tra npmVersion e nugetVersion deve essere non-null
    ///  (CK constraint DB enforced).
    ///  Skill license-issuing.
    /// </summary>
    public async Task<(bool Ok, string? Error, long? Id)> RegisterVersionAsync(
        VersionRegisterRequest req, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(req.NpmVersion) && string.IsNullOrWhiteSpace(req.NugetVersion))
            return (false, "version_missing", null);

        const string sql = @"
INSERT INTO dbo._wuic_versions_history (npm_version, nuget_version, pushed_by, notes)
OUTPUT inserted.id
VALUES (@npm, @nuget, @pushedBy, @notes);";
        try
        {
            await using var cn = new SqlConnection(_connectionString);
            await cn.OpenAsync(ct);
            await using var cmd = new SqlCommand(sql, cn);
            cmd.Parameters.Add("@npm", SqlDbType.NVarChar, 50).Value = (object?)req.NpmVersion ?? DBNull.Value;
            cmd.Parameters.Add("@nuget", SqlDbType.NVarChar, 50).Value = (object?)req.NugetVersion ?? DBNull.Value;
            cmd.Parameters.Add("@pushedBy", SqlDbType.NVarChar, 200).Value = (object?)req.PushedBy ?? DBNull.Value;
            cmd.Parameters.Add("@notes", SqlDbType.NVarChar, 500).Value = (object?)req.Notes ?? DBNull.Value;
            var id = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
            _log.LogInformation("Version registered: id={Id} npm={Npm} nuget={Nuget} by={By}",
                id, req.NpmVersion, req.NugetVersion, req.PushedBy);
            return (true, null, id);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "LicenseRegistryService.RegisterVersionAsync failed");
            return (false, "db_error", null);
        }
    }
}
