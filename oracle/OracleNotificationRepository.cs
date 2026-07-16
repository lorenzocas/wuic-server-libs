using System;
using System.Collections.Generic;
using System.Data;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Oracle.ManagedDataAccess.Client;
using WEB_UI_CRAFTER.Helpers;
using WuicCore.Services.Notifications;

// Global namespace (no `namespace { }` blocco) per allinearsi al pattern del
// drop-in `oracleDataProvider` — il loader `RawHelpers.GetOrCreateProviderInstance`
// cerca il tipo via `assembly.GetType("oracle" + classSuffix)` senza qualifica
// di namespace.

/// <summary>
/// Drop-in Oracle implementation di <c>INotificationRepository</c> caricata
/// dal progetto oracle.dll (deploy IIS standalone). Sibling del MSSQL
/// <c>NotificationRepository</c> e del MySQL <c>mysqlNotificationRepository</c>.
///
/// Si registra in DI via <c>Startup.cs</c> usando il pattern
/// <c>RawHelpers.GetProviderInstance&lt;INotificationRepository&gt;("oracle", ...)</c>
/// quando <c>AppSettings.meta-dbms = oracle</c>. Se la oracle.dll non e'
/// presente sul deploy, Startup ricade automaticamente sul repository MSSQL.
/// </summary>
public sealed class oracleNotificationRepository : INotificationRepository
{
    /// <summary>Nome del bind parameter Oracle per l'id utente (usato come :user_id nelle query).</summary>
    private const string UserIdParam = "user_id";

    private readonly IConfiguration _configuration;

    public oracleNotificationRepository(IConfiguration configuration = null)
    {
        _configuration = configuration;
    }

    // Letta FRESH ad ogni accesso, NON cache-ata al costruttore: durante il
    // first-run la MetaDataSQLConnection e' il placeholder `__SET_CONNECTION_STRING__`,
    // riscritta da configure_wuic e ricaricata da IConfiguration (reloadOnChange).
    // Cache-arla terrebbe il placeholder finche' il backend non si riavvia -> il
    // watcher notifiche non si connetterebbe mai senza restart. Il placeholder e'
    // trattato come "non pronto" (vuoto) cosi' il polling loop ritenta e si aggancia
    // appena la connection e' reale. Vedi NotificationRepository (impl MSSQL).
    private string MetaConnectionString
    {
        get
        {
            string cs = ConfigHelper.ResolveConnectionString("MetaDataSQLConnection");
            if (string.IsNullOrWhiteSpace(cs) && _configuration != null)
            {
                cs = _configuration.GetConnectionString("MetaDataSQLConnection")
                     ?? _configuration["ConnectionStrings:MetaDataSQLConnection"];
            }
            if (string.IsNullOrWhiteSpace(cs) || cs.Contains("__SET_CONNECTION_STRING__"))
            {
                return string.Empty;
            }
            return cs;
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // DB layer (Oracle-only)
    // ════════════════════════════════════════════════════════════════════

    private async Task<OracleConnection> CreateOpenConnectionAsync(CancellationToken ct)
    {
        var cn = new OracleConnection(MetaConnectionString);
        await cn.OpenAsync(ct);
        return cn;
    }

    private static OracleCommand BuildCommand(OracleConnection cn, string sql, params (string name, object value)[] parameters)
    {
        var cmd = cn.CreateCommand();
        cmd.CommandText = sql;
        cmd.CommandType = CommandType.Text;
        // BindByName: Oracle.ManagedDataAccess lega di default i parametri per
        // POSIZIONE, non per nome. Senza questo flag il riuso dello stesso
        // :param in piu' clausole (es. WHERE user_id = :user_id ... AND ... :user_id)
        // crea collisioni. Aderiamo allo stesso pattern degli altri repo Oracle del repo.
        cmd.BindByName = true;
        foreach (var (name, value) in parameters)
        {
            var p = cmd.CreateParameter();
            // Strip leading : or @ — internamente Oracle.ManagedDataAccess registra
            // il parameter name senza prefisso; nello SQL si usa :name.
            string n = name;
            if (n.StartsWith(":", StringComparison.Ordinal) || n.StartsWith("@", StringComparison.Ordinal))
                n = n.Substring(1);
            p.ParameterName = n;
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
        if (string.IsNullOrWhiteSpace(MetaConnectionString) || userId <= 0) return snapshot;

        await using var cn = await CreateOpenConnectionAsync(cancellationToken);

        await using (var countCmd = BuildCommand(cn,
            "SELECT COUNT(1) FROM \"_notifications\" WHERE user_id = :user_id AND is_read = 0 AND deleted_at IS NULL",
            (UserIdParam, userId)))
        {
            object scalar = await countCmd.ExecuteScalarAsync(cancellationToken);
            snapshot.UnreadCount = scalar == null || scalar == DBNull.Value ? 0 : Convert.ToInt32(scalar);
        }

        // Oracle 12c+: FETCH FIRST N ROWS ONLY al posto di LIMIT.
        // NVL(target_json, '') in Oracle, equivalente di IFNULL(...) MySQL.
        const string listSql = @"SELECT id, user_id, type, message,
                                        NVL(target_json, '') AS target_json,
                                        NVL(payload_json, '') AS payload_json,
                                        is_read, created_at, read_at
                                 FROM ""_notifications""
                                 WHERE user_id = :user_id AND deleted_at IS NULL
                                 ORDER BY created_at DESC, id DESC
                                 FETCH FIRST :take ROWS ONLY";

        await using (var listCmd = BuildCommand(cn, listSql, (UserIdParam, userId), ("take", take)))
        {
            await using var reader = await listCmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                snapshot.Notifications.Add(new NotificationItem
                {
                    Id = reader.GetInt32(0),
                    UserId = reader.GetInt32(1),
                    Type = await reader.IsDBNullAsync(2, cancellationToken) ? string.Empty : reader.GetString(2),
                    Message = await reader.IsDBNullAsync(3, cancellationToken) ? string.Empty : reader.GetString(3),
                    TargetJson = await reader.IsDBNullAsync(4, cancellationToken) ? string.Empty : reader.GetString(4),
                    PayloadJson = await reader.IsDBNullAsync(5, cancellationToken) ? string.Empty : reader.GetString(5),
                    IsRead = !await reader.IsDBNullAsync(6, cancellationToken) && Convert.ToBoolean(reader.GetValue(6)),
                    CreatedAt = await reader.IsDBNullAsync(7, cancellationToken) ? DateTime.MinValue : DateTime.SpecifyKind(reader.GetDateTime(7), DateTimeKind.Utc),
                    ReadAt = await reader.IsDBNullAsync(8, cancellationToken) ? (DateTime?)null : DateTime.SpecifyKind(reader.GetDateTime(8), DateTimeKind.Utc)
                });
            }
        }
        return snapshot;
    }

    public async Task<int?> MarkReadAsync(int notificationId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(MetaConnectionString) || notificationId <= 0) return null;
        await using var cn = await CreateOpenConnectionAsync(cancellationToken);

        int? userId;
        await using (var selCmd = BuildCommand(cn,
            "SELECT user_id FROM \"_notifications\" WHERE id = :id AND deleted_at IS NULL",
            ("id", notificationId)))
        {
            object scalar = await selCmd.ExecuteScalarAsync(cancellationToken);
            userId = scalar == null || scalar == DBNull.Value ? (int?)null : Convert.ToInt32(scalar);
        }

        // Oracle: SYS_EXTRACT_UTC(SYSTIMESTAMP) e' l'equivalente di UTC_TIMESTAMP(6) MySQL.
        // NVL preserva il read_at esistente se non null.
        await using (var updCmd = BuildCommand(cn,
            "UPDATE \"_notifications\" SET is_read = 1, read_at = NVL(read_at, SYS_EXTRACT_UTC(SYSTIMESTAMP)) WHERE id = :id AND deleted_at IS NULL",
            ("id", notificationId)))
        {
            await updCmd.ExecuteNonQueryAsync(cancellationToken);
        }
        return userId;
    }

    public async Task<NotificationSnapshot> MarkAllReadAsync(int userId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(MetaConnectionString) || userId <= 0)
            return new NotificationSnapshot { UserId = userId };

        await using var cn = await CreateOpenConnectionAsync(cancellationToken);
        await using (var cmd = BuildCommand(cn,
            "UPDATE \"_notifications\" SET is_read = 1, read_at = NVL(read_at, SYS_EXTRACT_UTC(SYSTIMESTAMP)) WHERE user_id = :user_id AND is_read = 0 AND deleted_at IS NULL",
            (UserIdParam, userId)))
        {
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        return await GetUnreadAsync(userId, cancellationToken: cancellationToken);
    }

    public async Task<NotificationSnapshot> ClearReadAsync(int userId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(MetaConnectionString) || userId <= 0)
            return new NotificationSnapshot { UserId = userId };

        await using var cn = await CreateOpenConnectionAsync(cancellationToken);
        await using (var cmd = BuildCommand(cn,
            "UPDATE \"_notifications\" SET deleted_at = SYS_EXTRACT_UTC(SYSTIMESTAMP) WHERE user_id = :user_id AND is_read = 1 AND deleted_at IS NULL",
            (UserIdParam, userId)))
        {
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        return await GetUnreadAsync(userId, cancellationToken: cancellationToken);
    }

    public async Task<int?> DeleteReadAsync(int notificationId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(MetaConnectionString) || notificationId <= 0) return null;
        await using var cn = await CreateOpenConnectionAsync(cancellationToken);

        int? userId; bool isRead;
        await using (var selCmd = BuildCommand(cn,
            "SELECT user_id, is_read FROM \"_notifications\" WHERE id = :id AND deleted_at IS NULL",
            ("id", notificationId)))
        {
            await using var rdr = await selCmd.ExecuteReaderAsync(cancellationToken);
            if (!await rdr.ReadAsync(cancellationToken)) return null;
            userId = await rdr.IsDBNullAsync(0, cancellationToken) ? (int?)null : rdr.GetInt32(0);
            isRead = !await rdr.IsDBNullAsync(1, cancellationToken) && Convert.ToBoolean(rdr.GetValue(1));
        }
        if (userId == null || !isRead) return userId;

        await using (var updCmd = BuildCommand(cn,
            "UPDATE \"_notifications\" SET deleted_at = SYS_EXTRACT_UTC(SYSTIMESTAMP) WHERE id = :id AND deleted_at IS NULL",
            ("id", notificationId)))
        {
            await updCmd.ExecuteNonQueryAsync(cancellationToken);
        }
        return userId;
    }

    public async Task<NotificationSnapshot> DismissProgressAsync(int userId, string progressGuid, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(MetaConnectionString) || userId <= 0)
            return new NotificationSnapshot { UserId = userId };
        string guid = (progressGuid ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(guid))
            return await GetUnreadAsync(userId, cancellationToken: cancellationToken);

        await using var cn = await CreateOpenConnectionAsync(cancellationToken);
        // Oracle 19c+ JSON: usiamo JSON_VALUE (RETURNING VARCHAR2 default) per
        // navigare i 3 path. JSON_VALUE ritorna NULL su path mancante → semantica
        // identica al MySQL JSON_UNQUOTE(JSON_EXTRACT(...)) = @guid case.
        const string sql = @"UPDATE ""_notifications""
                             SET is_read = 1,
                                 read_at = NVL(read_at, SYS_EXTRACT_UTC(SYSTIMESTAMP)),
                                 deleted_at = SYS_EXTRACT_UTC(SYSTIMESTAMP)
                             WHERE user_id = :user_id
                               AND deleted_at IS NULL
                               AND (
                                     JSON_VALUE(NVL(payload_json, '{}'), '$.progressGuid') = :guid
                                     OR JSON_VALUE(NVL(target_json, '{}'), '$.progressGuid') = :guid
                                     OR JSON_VALUE(NVL(target_json, '{}'), '$.exportProgressGuid') = :guid
                                   )";
        await using (var cmd = BuildCommand(cn, sql, (UserIdParam, userId), ("guid", guid)))
        {
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        return await GetUnreadAsync(userId, cancellationToken: cancellationToken);
    }

    public async Task<List<int>> GetUsersWithUnreadAsync(CancellationToken cancellationToken = default)
    {
        var users = new List<int>();
        if (string.IsNullOrWhiteSpace(MetaConnectionString)) return users;

        await using var cn = await CreateOpenConnectionAsync(cancellationToken);
        await using var cmd = BuildCommand(cn,
            "SELECT DISTINCT user_id FROM \"_notifications\" WHERE is_read = 0 AND deleted_at IS NULL AND user_id IS NOT NULL");
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            if (!await reader.IsDBNullAsync(0, cancellationToken)) users.Add(reader.GetInt32(0));
        }
        return users;
    }

    public async Task<int> EnqueueAsync(EnqueueNotificationRequest request, CancellationToken cancellationToken = default)
    {
        if (request == null || request.userId <= 0) return 0;
        if (string.IsNullOrWhiteSpace(MetaConnectionString))
            throw new InvalidOperationException("MetaDataSQLConnection is empty.");

        await using var cn = await CreateOpenConnectionAsync(cancellationToken);
        // sp_enqueue_notification (Oracle): la SP e' definita con un OUT param
        // numerico per restituire l'ID inserito. Vedi
        // scripts/notifications/create-sp-oracle.sql per il DDL.
        // Anonymous PL/SQL block per chiamare la SP con :out parameter.
        const string sql = @"BEGIN
                                 sp_enqueue_notification(
                                     :user_id, :type, :message,
                                     :target_json, :payload_json,
                                     :source, :created_by, :out_id);
                             END;";

        await using var cmd = cn.CreateCommand();
        cmd.CommandText = sql;
        cmd.CommandType = CommandType.Text;
        cmd.BindByName = true;

        cmd.Parameters.Add(new OracleParameter(UserIdParam,    OracleDbType.Int32)   { Value = request.userId });
        cmd.Parameters.Add(new OracleParameter("type",         OracleDbType.Varchar2) { Value = (object)request.type ?? DBNull.Value });
        cmd.Parameters.Add(new OracleParameter("message",      OracleDbType.Clob)     { Value = (object)request.message ?? DBNull.Value });
        cmd.Parameters.Add(new OracleParameter("target_json",  OracleDbType.Clob)     { Value = (object)request.targetJson ?? DBNull.Value });
        cmd.Parameters.Add(new OracleParameter("payload_json", OracleDbType.Clob)     { Value = (object)request.payloadJson ?? DBNull.Value });
        cmd.Parameters.Add(new OracleParameter("source",       OracleDbType.Varchar2) { Value = (object)request.source ?? DBNull.Value });
        cmd.Parameters.Add(new OracleParameter("created_by",   OracleDbType.Varchar2) { Value = (object)request.createdBy ?? DBNull.Value });
        var outParam = new OracleParameter("out_id", OracleDbType.Int32)
        {
            Direction = ParameterDirection.Output
        };
        cmd.Parameters.Add(outParam);

        await cmd.ExecuteNonQueryAsync(cancellationToken);
        object raw = outParam.Value;
        return raw == null || raw == DBNull.Value ? 0 : Convert.ToInt32(raw.ToString());
    }

    public string GetConnectionString() => MetaConnectionString;
}
