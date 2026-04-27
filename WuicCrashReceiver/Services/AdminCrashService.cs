using Microsoft.Data.SqlClient;
using System.Data;
using System.Text;
using WuicCrashReceiver.Models;

namespace WuicCrashReceiver.Services;

/// <summary>
///  Query e mutazioni admin sulla tabella <c>_wuic_crash_reports</c>
///  (skill crash-reporting Commit 10). Single-purpose: list paginata con
///  filtri, detail row completa, resolve (mark read).
///
///  Tutti i metodi sono parametrizzati (no string-concat) per evitare SQL
///  injection — il filter shape e' DTO-bound, non passa per JSON arbitrario.
/// </summary>
public sealed class AdminCrashService
{
    private const int MaxPageSize = 200;

    private readonly string _connectionString;
    private readonly ILogger<AdminCrashService> _log;

    public AdminCrashService(IConfiguration configuration, ILogger<AdminCrashService> log)
    {
        _connectionString = configuration.GetConnectionString("WuicCrashes")
            ?? throw new InvalidOperationException("ConnectionStrings:WuicCrashes missing");
        _log = log;
    }

    public async Task<AdminListResponse> ListAsync(AdminListFilters f, CancellationToken ct = default)
    {
        var pageSize = Math.Clamp(f.PageSize, 1, MaxPageSize);
        var page = Math.Max(1, f.Page);
        var offset = (page - 1) * pageSize;

        // Build WHERE dinamicamente, ma SOLO con clausole parametrizzate.
        var where = new StringBuilder("WHERE 1=1");
        var parms = new List<(string Name, object Value, SqlDbType Type)>();
        if (!string.IsNullOrWhiteSpace(f.ErrorCode))
        {
            where.Append(" AND error_code = @errorCode");
            parms.Add(("@errorCode", f.ErrorCode, SqlDbType.NVarChar));
        }
        if (!string.IsNullOrWhiteSpace(f.ClientId))
        {
            where.Append(" AND client_id = @clientId");
            parms.Add(("@clientId", f.ClientId.Trim().ToLowerInvariant(), SqlDbType.NVarChar));
        }
        if (f.Resolved is int r && (r == 0 || r == 1))
        {
            where.Append(" AND resolved = @resolved");
            parms.Add(("@resolved", r, SqlDbType.Bit));
        }
        if (f.Since is DateTime since)
        {
            where.Append(" AND last_seen >= @since");
            parms.Add(("@since", since, SqlDbType.DateTime2));
        }

        var listSql = $@"
SELECT id, client_id, client_tier, release_tag, source, type, message, error_code,
       is_typed, stack_hash, first_seen, last_seen, occurrences, resolved, license_expired_at_ingest
FROM dbo._wuic_crash_reports
{where}
ORDER BY last_seen DESC
OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;";

        var countSql = $@"SELECT COUNT_BIG(*) FROM dbo._wuic_crash_reports {where};";

        var resp = new AdminListResponse { Page = page, PageSize = pageSize };
        try
        {
            await using var cn = new SqlConnection(_connectionString);
            await cn.OpenAsync(ct);

            // Total count first (cheap).
            await using (var cmd = new SqlCommand(countSql, cn))
            {
                foreach (var p in parms) cmd.Parameters.Add(p.Name, p.Type).Value = p.Value;
                var totalScalar = await cmd.ExecuteScalarAsync(ct);
                resp.Total = totalScalar is long lng ? lng : Convert.ToInt64(totalScalar);
            }

            // Page rows.
            await using (var cmd = new SqlCommand(listSql, cn))
            {
                foreach (var p in parms) cmd.Parameters.Add(p.Name, p.Type).Value = p.Value;
                cmd.Parameters.Add("@offset", SqlDbType.Int).Value = offset;
                cmd.Parameters.Add("@pageSize", SqlDbType.Int).Value = pageSize;
                await using var rdr = await cmd.ExecuteReaderAsync(ct);
                while (await rdr.ReadAsync(ct))
                {
                    resp.Rows.Add(MapListRow(rdr));
                }
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "AdminCrashService.ListAsync failed");
            resp.Ok = false;
        }
        return resp;
    }

    public async Task<AdminCrashDetail?> GetDetailAsync(long id, CancellationToken ct = default)
    {
        const string sql = @"
SELECT id, client_id, client_tier, release_tag, source, type, message, error_code,
       is_typed, stack_hash, first_seen, last_seen, occurrences, resolved, license_expired_at_ingest,
       stack_raw, url, user_id, user_agent, breadcrumbs, extra, args_json,
       machine_fingerprint, resolved_at, resolved_by, notes
FROM dbo._wuic_crash_reports
WHERE id = @id;";

        try
        {
            await using var cn = new SqlConnection(_connectionString);
            await cn.OpenAsync(ct);
            await using var cmd = new SqlCommand(sql, cn);
            cmd.Parameters.Add("@id", SqlDbType.BigInt).Value = id;
            await using var rdr = await cmd.ExecuteReaderAsync(ct);
            if (!await rdr.ReadAsync(ct)) return null;

            var detail = new AdminCrashDetail();
            FillListRow(rdr, detail);
            detail.StackRaw = rdr.IsDBNull(15) ? "" : rdr.GetString(15);
            detail.Url = rdr.IsDBNull(16) ? null : rdr.GetString(16);
            detail.UserId = rdr.IsDBNull(17) ? null : rdr.GetString(17);
            detail.UserAgent = rdr.IsDBNull(18) ? null : rdr.GetString(18);
            detail.Breadcrumbs = rdr.IsDBNull(19) ? null : rdr.GetString(19);
            detail.Extra = rdr.IsDBNull(20) ? null : rdr.GetString(20);
            detail.ArgsJson = rdr.IsDBNull(21) ? null : rdr.GetString(21);
            detail.MachineFingerprint = rdr.IsDBNull(22) ? null : rdr.GetString(22);
            detail.ResolvedAt = rdr.IsDBNull(23) ? null : rdr.GetDateTime(23);
            detail.ResolvedBy = rdr.IsDBNull(24) ? null : rdr.GetString(24);
            detail.Notes = rdr.IsDBNull(25) ? null : rdr.GetString(25);
            return detail;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "AdminCrashService.GetDetailAsync failed for id={Id}", id);
            return null;
        }
    }

    public async Task<bool> SetResolvedAsync(long id, AdminResolveRequest req, CancellationToken ct = default)
    {
        const string sql = @"
UPDATE dbo._wuic_crash_reports SET
    resolved = @resolved,
    resolved_at = CASE WHEN @resolved = 1 THEN SYSUTCDATETIME() ELSE NULL END,
    resolved_by = CASE WHEN @resolved = 1 THEN @resolvedBy ELSE NULL END,
    notes = COALESCE(@notes, notes)
WHERE id = @id;";

        try
        {
            await using var cn = new SqlConnection(_connectionString);
            await cn.OpenAsync(ct);
            await using var cmd = new SqlCommand(sql, cn);
            cmd.Parameters.Add("@id", SqlDbType.BigInt).Value = id;
            cmd.Parameters.Add("@resolved", SqlDbType.Bit).Value = req.Resolved ? 1 : 0;
            cmd.Parameters.Add("@resolvedBy", SqlDbType.NVarChar, 128).Value = (object?)req.ResolvedBy ?? DBNull.Value;
            cmd.Parameters.Add("@notes", SqlDbType.NVarChar, -1).Value = (object?)req.Notes ?? DBNull.Value;
            var rows = await cmd.ExecuteNonQueryAsync(ct);
            return rows > 0;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "AdminCrashService.SetResolvedAsync failed for id={Id}", id);
            return false;
        }
    }

    private static AdminCrashListRow MapListRow(SqlDataReader rdr)
    {
        var row = new AdminCrashListRow();
        FillListRow(rdr, row);
        return row;
    }

    private static void FillListRow(SqlDataReader rdr, AdminCrashListRow row)
    {
        row.Id = rdr.GetInt64(0);
        row.ClientId = rdr.GetString(1);
        row.ClientTier = rdr.GetString(2);
        row.ReleaseTag = rdr.GetString(3);
        row.Source = rdr.GetString(4);
        row.Type = rdr.GetString(5);
        row.Message = rdr.GetString(6);
        row.ErrorCode = rdr.IsDBNull(7) ? null : rdr.GetString(7);
        row.IsTyped = rdr.GetBoolean(8);
        row.StackHash = rdr.GetString(9);
        row.FirstSeen = rdr.GetDateTime(10);
        row.LastSeen = rdr.GetDateTime(11);
        row.Occurrences = rdr.GetInt32(12);
        row.Resolved = rdr.GetBoolean(13);
        row.LicenseExpiredAtIngest = rdr.GetBoolean(14);
    }
}
