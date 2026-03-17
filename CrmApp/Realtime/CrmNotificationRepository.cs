using System.Data;
using Microsoft.Data.SqlClient;

namespace CrmApp.Realtime;

public interface ICrmNotificationRepository
{
    Task<CrmNotificationSnapshot> GetUnreadAsync(int userId, int take = 10, CancellationToken cancellationToken = default);
    Task<int?> MarkReadAsync(int notificationId, CancellationToken cancellationToken = default);
    Task<List<int>> GetUsersWithUnreadAsync(CancellationToken cancellationToken = default);
}

public sealed class CrmNotificationRepository(IConfiguration configuration) : ICrmNotificationRepository
{
    private readonly string _dataConnectionString = configuration.GetConnectionString("DataSQLConnection")
        ?? configuration["AppSettings:connection"]
        ?? string.Empty;

    public async Task<CrmNotificationSnapshot> GetUnreadAsync(int userId, int take = 10, CancellationToken cancellationToken = default)
    {
        var snapshot = new CrmNotificationSnapshot { UserId = userId };

        if (string.IsNullOrWhiteSpace(_dataConnectionString) || userId <= 0)
        {
            return snapshot;
        }

        await using var cn = new SqlConnection(_dataConnectionString);
        await cn.OpenAsync(cancellationToken);

        await using (var cmdCount = cn.CreateCommand())
        {
            cmdCount.CommandText = @"SELECT COUNT(1) FROM dbo.crm_notifications WHERE user_id = @user_id AND is_read = 0";
            cmdCount.Parameters.AddWithValue("@user_id", userId);
            snapshot.UnreadCount = Convert.ToInt32(await cmdCount.ExecuteScalarAsync(cancellationToken) ?? 0);
        }

        await using (var cmdItems = cn.CreateCommand())
        {
            cmdItems.CommandText = @"
SELECT TOP (@take)
    notification_id,
    user_id,
    [type],
    [message],
    entity_type,
    entity_id,
    is_read,
    created_at
FROM dbo.crm_notifications
WHERE user_id = @user_id
ORDER BY created_at DESC, notification_id DESC;";
            cmdItems.Parameters.AddWithValue("@take", take);
            cmdItems.Parameters.AddWithValue("@user_id", userId);

            await using var reader = await cmdItems.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                snapshot.Notifications.Add(new CrmNotificationItem
                {
                    NotificationId = reader.GetInt32(0),
                    UserId = reader.GetInt32(1),
                    Type = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                    Message = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                    EntityType = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                    EntityId = reader.IsDBNull(5) ? null : reader.GetInt32(5),
                    IsRead = !reader.IsDBNull(6) && reader.GetBoolean(6),
                    CreatedAt = reader.IsDBNull(7) ? DateTime.UtcNow : reader.GetDateTime(7)
                });
            }
        }

        return snapshot;
    }

    public async Task<int?> MarkReadAsync(int notificationId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_dataConnectionString) || notificationId <= 0)
        {
            return null;
        }

        await using var cn = new SqlConnection(_dataConnectionString);
        await cn.OpenAsync(cancellationToken);

        await using var cmd = cn.CreateCommand();
        cmd.CommandText = @"
DECLARE @user_id INT;
SELECT @user_id = user_id FROM dbo.crm_notifications WHERE notification_id = @notification_id;
UPDATE dbo.crm_notifications SET is_read = 1 WHERE notification_id = @notification_id;
SELECT @user_id;";
        cmd.Parameters.AddWithValue("@notification_id", notificationId);

        var scalar = await cmd.ExecuteScalarAsync(cancellationToken);
        if (scalar is null || scalar == DBNull.Value)
        {
            return null;
        }

        return Convert.ToInt32(scalar);
    }

    public async Task<List<int>> GetUsersWithUnreadAsync(CancellationToken cancellationToken = default)
    {
        var users = new List<int>();
        if (string.IsNullOrWhiteSpace(_dataConnectionString))
        {
            return users;
        }

        await using var cn = new SqlConnection(_dataConnectionString);
        await cn.OpenAsync(cancellationToken);

        await using var cmd = cn.CreateCommand();
        cmd.CommandText = @"SELECT DISTINCT user_id FROM dbo.crm_notifications WHERE is_read = 0 AND user_id IS NOT NULL";

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            users.Add(reader.GetInt32(0));
        }

        return users;
    }

    public string GetConnectionString() => _dataConnectionString;
}
