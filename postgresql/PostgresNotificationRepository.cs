using System;
using System.Collections.Generic;
using System.Data;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Npgsql;
using WEB_UI_CRAFTER.Helpers;
using WuicCore.Services.Notifications;

// Global namespace (no `namespace { }` blocco) per allinearsi al pattern del
// drop-in `postgresqlDataProvider` — il loader `RawHelpers.GetOrCreateProviderInstance`
// cerca il tipo via `assembly.GetType("postgresql" + classSuffix)` senza qualifica
// di namespace.

/// <summary>
/// Drop-in PostgreSQL implementation di <c>INotificationRepository</c> caricata
/// dal progetto postgresql.dll (deploy IIS standalone). Sibling del MSSQL
/// <c>NotificationRepository</c> e del MySQL <c>mysqlNotificationRepository</c>.
///
/// Si registra in DI via <c>Startup.cs</c> usando il pattern
/// <c>RawHelpers.GetProviderInstance&lt;INotificationRepository&gt;("postgresql", ...)</c>
/// quando <c>AppSettings.meta-dbms = postgresql</c>. Se la postgresql.dll non
/// e' presente sul deploy, Startup ricade automaticamente sul repository MSSQL.
/// </summary>
public sealed class postgresqlNotificationRepository : INotificationRepository
{
    private readonly string _metaConnectionString;

    public postgresqlNotificationRepository(IConfiguration configuration = null)
    {
        _metaConnectionString = ConfigHelper.ResolveConnectionString("MetaDataSQLConnection") ?? string.Empty;

        if (string.IsNullOrWhiteSpace(_metaConnectionString) && configuration != null)
        {
            _metaConnectionString =
                configuration.GetConnectionString("MetaDataSQLConnection")
                ?? configuration["ConnectionStrings:MetaDataSQLConnection"]
                ?? string.Empty;
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // DB layer (PostgreSQL-only)
    // ════════════════════════════════════════════════════════════════════

    private async Task<NpgsqlConnection> CreateOpenConnectionAsync(CancellationToken ct)
    {
        var cn = new NpgsqlConnection(_metaConnectionString);
        await cn.OpenAsync(ct);
        return cn;
    }

    private static NpgsqlCommand BuildCommand(NpgsqlConnection cn, string sql, params (string name, object value)[] parameters)
    {
        var cmd = cn.CreateCommand();
        cmd.CommandText = sql;
        cmd.CommandType = CommandType.Text;
        foreach (var (name, value) in parameters)
        {
            var p = cmd.CreateParameter();
            p.ParameterName = name.StartsWith("@", StringComparison.Ordinal) ? name : "@" + name;
            p.Value = value ?? DBNull.Value;
            cmd.Parameters.Add(p);
        }
        return cmd;
    }

    // ════════════════════════════════════════════════════════════════════
    // INotificationRepository
    // ════════════════════════════════════════════════════════════════════

    public async Task<NotificationSnapshot> GetUnreadAsync(int userId, int take = 10, CancellationToken cancellationToken = default)
    {
        var snapshot = new NotificationSnapshot { UserId = userId };
        if (string.IsNullOrWhiteSpace(_metaConnectionString) || userId <= 0) return snapshot;

        await using var cn = await CreateOpenConnectionAsync(cancellationToken);

        await using (var countCmd = BuildCommand(cn,
            "SELECT COUNT(1) FROM _notifications WHERE user_id = @user_id AND is_read = false AND deleted_at IS NULL",
            ("user_id", userId)))
        {
            object scalar = await countCmd.ExecuteScalarAsync(cancellationToken);
            snapshot.UnreadCount = scalar == null || scalar == DBNull.Value ? 0 : Convert.ToInt32(scalar);
        }

        // PG: COALESCE invece di IFNULL; LIMIT supportato nativamente; "type"
        // e "message" sono parole non riservate ma li virgolettiamo per
        // coerenza con MySQL (che usa i backtick per is_read non riservato).
        const string listSql = @"SELECT id, user_id, ""type"", ""message"",
                                        COALESCE(target_json, '') AS target_json,
                                        COALESCE(payload_json, '') AS payload_json,
                                        is_read, created_at, read_at
                                 FROM _notifications
                                 WHERE user_id = @user_id AND deleted_at IS NULL
                                 ORDER BY created_at DESC, id DESC
                                 LIMIT @take";

        await using (var listCmd = BuildCommand(cn, listSql, ("take", take), ("user_id", userId)))
        {
            await using var reader = await listCmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                snapshot.Notifications.Add(new NotificationItem
                {
                    Id = reader.GetInt32(0),
                    UserId = reader.GetInt32(1),
                    Type = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                    Message = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                    TargetJson = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                    PayloadJson = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                    IsRead = !reader.IsDBNull(6) && Convert.ToBoolean(reader.GetValue(6)),
                    CreatedAt = reader.IsDBNull(7) ? DateTime.MinValue : DateTime.SpecifyKind(reader.GetDateTime(7), DateTimeKind.Utc),
                    ReadAt = reader.IsDBNull(8) ? (DateTime?)null : DateTime.SpecifyKind(reader.GetDateTime(8), DateTimeKind.Utc)
                });
            }
        }
        return snapshot;
    }

    public async Task<int?> MarkReadAsync(int notificationId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_metaConnectionString) || notificationId <= 0) return null;
        await using var cn = await CreateOpenConnectionAsync(cancellationToken);

        int? userId;
        await using (var selCmd = BuildCommand(cn,
            "SELECT user_id FROM _notifications WHERE id = @id AND deleted_at IS NULL",
            ("id", notificationId)))
        {
            object scalar = await selCmd.ExecuteScalarAsync(cancellationToken);
            userId = scalar == null || scalar == DBNull.Value ? (int?)null : Convert.ToInt32(scalar);
        }

        // PG: (NOW() AT TIME ZONE 'UTC')::timestamp e' l'equivalente del MySQL UTC_TIMESTAMP(6).
        // Cast finale a timestamp (without tz) per coerenza con created_at/read_at storage.
        await using (var updCmd = BuildCommand(cn,
            "UPDATE _notifications SET is_read = true, read_at = COALESCE(read_at, (NOW() AT TIME ZONE 'UTC')::timestamp) WHERE id = @id AND deleted_at IS NULL",
            ("id", notificationId)))
        {
            await updCmd.ExecuteNonQueryAsync(cancellationToken);
        }
        return userId;
    }

    public async Task<NotificationSnapshot> MarkAllReadAsync(int userId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_metaConnectionString) || userId <= 0)
            return new NotificationSnapshot { UserId = userId };

        await using var cn = await CreateOpenConnectionAsync(cancellationToken);
        await using (var cmd = BuildCommand(cn,
            "UPDATE _notifications SET is_read = true, read_at = COALESCE(read_at, (NOW() AT TIME ZONE 'UTC')::timestamp) WHERE user_id = @user_id AND is_read = false AND deleted_at IS NULL",
            ("user_id", userId)))
        {
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        return await GetUnreadAsync(userId, cancellationToken: cancellationToken);
    }

    public async Task<NotificationSnapshot> ClearReadAsync(int userId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_metaConnectionString) || userId <= 0)
            return new NotificationSnapshot { UserId = userId };

        await using var cn = await CreateOpenConnectionAsync(cancellationToken);
        await using (var cmd = BuildCommand(cn,
            "UPDATE _notifications SET deleted_at = (NOW() AT TIME ZONE 'UTC')::timestamp WHERE user_id = @user_id AND is_read = true AND deleted_at IS NULL",
            ("user_id", userId)))
        {
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        return await GetUnreadAsync(userId, cancellationToken: cancellationToken);
    }

    public async Task<int?> DeleteReadAsync(int notificationId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_metaConnectionString) || notificationId <= 0) return null;
        await using var cn = await CreateOpenConnectionAsync(cancellationToken);

        int? userId; bool isRead;
        await using (var selCmd = BuildCommand(cn,
            "SELECT user_id, is_read FROM _notifications WHERE id = @id AND deleted_at IS NULL",
            ("id", notificationId)))
        {
            await using var rdr = await selCmd.ExecuteReaderAsync(cancellationToken);
            if (!await rdr.ReadAsync(cancellationToken)) return null;
            userId = rdr.IsDBNull(0) ? (int?)null : rdr.GetInt32(0);
            isRead = !rdr.IsDBNull(1) && Convert.ToBoolean(rdr.GetValue(1));
        }
        if (userId == null || !isRead) return userId;

        await using (var updCmd = BuildCommand(cn,
            "UPDATE _notifications SET deleted_at = (NOW() AT TIME ZONE 'UTC')::timestamp WHERE id = @id AND deleted_at IS NULL",
            ("id", notificationId)))
        {
            await updCmd.ExecuteNonQueryAsync(cancellationToken);
        }
        return userId;
    }

    public async Task<NotificationSnapshot> DismissProgressAsync(int userId, string progressGuid, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_metaConnectionString) || userId <= 0)
            return new NotificationSnapshot { UserId = userId };
        string guid = (progressGuid ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(guid))
            return await GetUnreadAsync(userId, cancellationToken: cancellationToken);

        await using var cn = await CreateOpenConnectionAsync(cancellationToken);
        // PG JSON: operator `->>` estrae il campo come text. Cast esplicito
        // a json gestisce il caso in cui payload_json sia memorizzato come
        // text (varchar) invece che jsonb. Se il deploy usa jsonb il cast
        // diventa no-op e il piano usa il GIN index quando disponibile.
        const string sql = @"UPDATE _notifications
                             SET is_read = true,
                                 read_at = COALESCE(read_at, (NOW() AT TIME ZONE 'UTC')::timestamp),
                                 deleted_at = (NOW() AT TIME ZONE 'UTC')::timestamp
                             WHERE user_id = @user_id
                               AND deleted_at IS NULL
                               AND (
                                     (COALESCE(payload_json, '{}')::json ->> 'progressGuid') = @guid
                                     OR (COALESCE(target_json, '{}')::json ->> 'progressGuid') = @guid
                                     OR (COALESCE(target_json, '{}')::json ->> 'exportProgressGuid') = @guid
                                   )";
        await using (var cmd = BuildCommand(cn, sql, ("user_id", userId), ("guid", guid)))
        {
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        return await GetUnreadAsync(userId, cancellationToken: cancellationToken);
    }

    public async Task<List<int>> GetUsersWithUnreadAsync(CancellationToken cancellationToken = default)
    {
        var users = new List<int>();
        if (string.IsNullOrWhiteSpace(_metaConnectionString)) return users;

        await using var cn = await CreateOpenConnectionAsync(cancellationToken);
        await using var cmd = BuildCommand(cn,
            "SELECT DISTINCT user_id FROM _notifications WHERE is_read = false AND deleted_at IS NULL AND user_id IS NOT NULL");
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            if (!reader.IsDBNull(0)) users.Add(reader.GetInt32(0));
        }
        return users;
    }

    public async Task<int> EnqueueAsync(EnqueueNotificationRequest request, CancellationToken cancellationToken = default)
    {
        if (request == null || request.userId <= 0) return 0;
        if (string.IsNullOrWhiteSpace(_metaConnectionString))
            throw new InvalidOperationException("MetaDataSQLConnection is empty.");

        await using var cn = await CreateOpenConnectionAsync(cancellationToken);
        // sp_enqueue_notification (Postgres): definita come FUNCTION che ritorna
        // l'ID inserito. Si chiama con `SELECT fn(...)` (non `CALL`, che e' per
        // PROCEDURE void). Vedi scripts/notifications/create-sp-postgres.sql per il DDL.
        const string sql = "SELECT sp_enqueue_notification(@user_id, @type, @message, @target_json, @payload_json, @source, @created_by)";
        await using var cmd = BuildCommand(cn, sql,
            ("user_id",      request.userId),
            ("type",         request.type ?? string.Empty),
            ("message",      request.message ?? string.Empty),
            ("target_json",  request.targetJson ?? string.Empty),
            ("payload_json", request.payloadJson ?? string.Empty),
            ("source",       request.source ?? string.Empty),
            ("created_by",   request.createdBy ?? string.Empty));

        object scalar = await cmd.ExecuteScalarAsync(cancellationToken);
        return scalar == null || scalar == DBNull.Value ? 0 : Convert.ToInt32(scalar);
    }

    public string GetConnectionString() => _metaConnectionString;
}
