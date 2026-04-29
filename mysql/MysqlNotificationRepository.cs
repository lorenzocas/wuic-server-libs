using System;
using System.Collections.Generic;
using System.Data;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using MySql.Data.MySqlClient;
using WuicCore.Services.Notifications;

// Global namespace (no `namespace { }` blocco) per allinearsi al pattern del
// drop-in `mysqlDataProvider` — il loader `RawHelpers.GetOrCreateProviderInstance`
// cerca il tipo via `assembly.GetType("mysql" + classSuffix)` senza qualifica
// di namespace.

/// <summary>
/// Drop-in MySQL implementation di <c>INotificationRepository</c> caricata
/// dal progetto mysql.dll (deploy IIS standalone). Serve come provider-specific
/// counterpart di <c>NotificationRepository</c> (MSSQL-only) in KonvergenceCore.
///
/// Si registra in DI via <c>Startup.cs</c> usando il pattern
/// <c>RawHelpers.GetProviderInstance&lt;INotificationRepository&gt;("mysql", ...)</c>
/// quando <c>AppSettings.meta-dbms = mysql</c>. Se la mysql.dll non e'
/// presente sul deploy, Startup ricade automaticamente sul repository MSSQL.
/// </summary>
public sealed class mysqlNotificationRepository : INotificationRepository
{
        private readonly string _metaConnectionString;

        public mysqlNotificationRepository(IConfiguration configuration = null)
        {
            _metaConnectionString =
                System.Configuration.ConfigurationManager.ConnectionStrings["MetaDataSQLConnection"]?.ConnectionString
                ?? string.Empty;

            if (string.IsNullOrWhiteSpace(_metaConnectionString) && configuration != null)
            {
                _metaConnectionString =
                    configuration.GetConnectionString("MetaDataSQLConnection")
                    ?? configuration["ConnectionStrings:MetaDataSQLConnection"]
                    ?? string.Empty;
            }
        }

        // ════════════════════════════════════════════════════════════════════
        // DB layer (MySQL-only)
        // ════════════════════════════════════════════════════════════════════

        private async Task<MySqlConnection> CreateOpenConnectionAsync(CancellationToken ct)
        {
            var cn = new MySqlConnection(_metaConnectionString);
            await cn.OpenAsync(ct);
            return cn;
        }

        private static MySqlCommand BuildCommand(MySqlConnection cn, string sql, params (string name, object value)[] parameters)
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
                "SELECT COUNT(1) FROM _notifications WHERE user_id = @user_id AND is_read = 0 AND deleted_at IS NULL",
                ("user_id", userId)))
            {
                object scalar = await countCmd.ExecuteScalarAsync(cancellationToken);
                snapshot.UnreadCount = scalar == null || scalar == DBNull.Value ? 0 : Convert.ToInt32(scalar);
            }

            const string listSql = @"SELECT id, user_id, `type`, `message`,
                                            IFNULL(target_json, '') AS target_json,
                                            IFNULL(payload_json, '') AS payload_json,
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

            await using (var updCmd = BuildCommand(cn,
                "UPDATE _notifications SET is_read = 1, read_at = IFNULL(read_at, UTC_TIMESTAMP(6)) WHERE id = @id AND deleted_at IS NULL",
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
                "UPDATE _notifications SET is_read = 1, read_at = IFNULL(read_at, UTC_TIMESTAMP(6)) WHERE user_id = @user_id AND is_read = 0 AND deleted_at IS NULL",
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
                "UPDATE _notifications SET deleted_at = UTC_TIMESTAMP(6) WHERE user_id = @user_id AND is_read = 1 AND deleted_at IS NULL",
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
                "UPDATE _notifications SET deleted_at = UTC_TIMESTAMP(6) WHERE id = @id AND deleted_at IS NULL",
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
            const string sql = @"UPDATE _notifications
                                 SET is_read = 1,
                                     read_at = IFNULL(read_at, UTC_TIMESTAMP(6)),
                                     deleted_at = UTC_TIMESTAMP(6)
                                 WHERE user_id = @user_id
                                   AND deleted_at IS NULL
                                   AND (
                                         JSON_UNQUOTE(JSON_EXTRACT(IFNULL(payload_json, '{}'), '$.progressGuid')) = @guid
                                         OR JSON_UNQUOTE(JSON_EXTRACT(IFNULL(target_json, '{}'), '$.progressGuid')) = @guid
                                         OR JSON_UNQUOTE(JSON_EXTRACT(IFNULL(target_json, '{}'), '$.exportProgressGuid')) = @guid
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
                "SELECT DISTINCT user_id FROM _notifications WHERE is_read = 0 AND deleted_at IS NULL AND user_id IS NOT NULL");
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
            // sp_enqueue_notification (MySQL): CALL sp_name(p1, p2, ...). Vedi
            // [scripts/notifications/create-sp-mysql.sql](../../KonvergenceCore/scripts/notifications/create-sp-mysql.sql)
            // per la definizione della SP (insert + RETURN LAST_INSERT_ID()).
            const string sql = "CALL sp_enqueue_notification(@user_id, @type, @message, @target_json, @payload_json, @source, @created_by)";
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
