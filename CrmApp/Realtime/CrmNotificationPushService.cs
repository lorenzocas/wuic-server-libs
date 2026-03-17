using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace CrmApp.Realtime;

public interface ICrmNotificationPushService
{
    Task RegisterAndRunAsync(int userId, WebSocket socket, CancellationToken cancellationToken);
    Task SendSnapshotToUserAsync(int userId, CrmNotificationSnapshot snapshot, CancellationToken cancellationToken = default);
}

public sealed class CrmNotificationPushService(ICrmNotificationRepository repository, ILogger<CrmNotificationPushService> logger) : ICrmNotificationPushService
{
    private readonly ConcurrentDictionary<int, ConcurrentDictionary<string, WebSocket>> _sockets = new();

    public async Task RegisterAndRunAsync(int userId, WebSocket socket, CancellationToken cancellationToken)
    {
        var key = Guid.NewGuid().ToString("N");
        var userSockets = _sockets.GetOrAdd(userId, _ => new ConcurrentDictionary<string, WebSocket>());
        userSockets[key] = socket;

        try
        {
            var initial = await repository.GetUnreadAsync(userId, cancellationToken: cancellationToken);
            await SendSnapshotToSocketAsync(socket, initial, cancellationToken);

            var buffer = new byte[1024];
            while (!cancellationToken.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    break;
                }
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "WebSocket notification channel closed with error for user {UserId}", userId);
        }
        finally
        {
            if (_sockets.TryGetValue(userId, out var current))
            {
                current.TryRemove(key, out _);
                if (current.IsEmpty)
                {
                    _sockets.TryRemove(userId, out _);
                }
            }

            if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
            {
                try
                {
                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "closed", CancellationToken.None);
                }
                catch
                {
                }
            }

            socket.Dispose();
        }
    }

    public async Task SendSnapshotToUserAsync(int userId, CrmNotificationSnapshot snapshot, CancellationToken cancellationToken = default)
    {
        if (!_sockets.TryGetValue(userId, out var userSockets) || userSockets.IsEmpty)
        {
            return;
        }

        foreach (var kv in userSockets.ToArray())
        {
            var socket = kv.Value;
            if (socket.State != WebSocketState.Open)
            {
                userSockets.TryRemove(kv.Key, out _);
                continue;
            }

            await SendSnapshotToSocketAsync(socket, snapshot, cancellationToken);
        }
    }

    private static async Task SendSnapshotToSocketAsync(WebSocket socket, CrmNotificationSnapshot snapshot, CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(new
        {
            type = "snapshot",
            userId = snapshot.UserId,
            unreadCount = snapshot.UnreadCount,
            notifications = snapshot.Notifications
        });

        var bytes = Encoding.UTF8.GetBytes(payload);
        await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, cancellationToken);
    }
}
