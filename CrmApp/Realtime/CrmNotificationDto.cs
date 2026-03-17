namespace CrmApp.Realtime;

public sealed class CrmNotificationItem
{
    public int NotificationId { get; set; }
    public int UserId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public int? EntityId { get; set; }
    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class CrmNotificationSnapshot
{
    public int UserId { get; set; }
    public int UnreadCount { get; set; }
    public List<CrmNotificationItem> Notifications { get; set; } = new();
}
