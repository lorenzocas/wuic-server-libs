using Microsoft.Data.SqlClient;

namespace CrmApp.Realtime;

public sealed class CrmNotificationSqlDependencyWatcher : IHostedService, IDisposable
{
    private readonly IConfiguration _configuration;
    private readonly ICrmNotificationRepository _repository;
    private readonly ICrmNotificationPushService _push;
    private readonly ILogger<CrmNotificationSqlDependencyWatcher> _logger;
    private readonly object _sync = new();

    private string _connectionString = string.Empty;
    private SqlDependency? _dependency;
    private bool _started;

    public CrmNotificationSqlDependencyWatcher(
        IConfiguration configuration,
        ICrmNotificationRepository repository,
        ICrmNotificationPushService push,
        ILogger<CrmNotificationSqlDependencyWatcher> logger)
    {
        _configuration = configuration;
        _repository = repository;
        _push = push;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _connectionString = _configuration.GetConnectionString("DataSQLConnection")
            ?? _configuration["AppSettings:connection"]
            ?? string.Empty;

        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            _logger.LogWarning("CrmNotificationSqlDependencyWatcher disabled: empty DataSQLConnection.");
            return Task.CompletedTask;
        }

        try
        {
            SqlDependency.Start(_connectionString);
            _started = true;
            RegisterDependency();
            _logger.LogInformation("CrmNotificationSqlDependencyWatcher started.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unable to start SqlDependency for crm_notifications.");
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        CleanupDependency();

        if (_started)
        {
            try
            {
                SqlDependency.Stop(_connectionString);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "SqlDependency.Stop failed.");
            }
        }

        return Task.CompletedTask;
    }

    private void RegisterDependency()
    {
        lock (_sync)
        {
            CleanupDependency();

            using var cn = new SqlConnection(_connectionString);
            using var cmd = cn.CreateCommand();
            cmd.CommandText = @"
SELECT notification_id, user_id, is_read, created_at
FROM dbo.crm_notifications
WHERE is_read = 0";

            _dependency = new SqlDependency(cmd);
            _dependency.OnChange += OnDependencyChange;

            cn.Open();
            using var reader = cmd.ExecuteReader();
            while (reader.Read()) { }
        }
    }

    private async void OnDependencyChange(object sender, SqlNotificationEventArgs e)
    {
        try
        {
            _logger.LogInformation("crm_notifications changed ({Type}/{Info}/{Source}).", e.Type, e.Info, e.Source);
            RegisterDependency();

            var users = await _repository.GetUsersWithUnreadAsync();
            foreach (var userId in users)
            {
                var snapshot = await _repository.GetUnreadAsync(userId);
                await _push.SendSnapshotToUserAsync(userId, snapshot);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error broadcasting crm_notifications changes.");
        }
    }

    private void CleanupDependency()
    {
        if (_dependency is not null)
        {
            _dependency.OnChange -= OnDependencyChange;
            _dependency = null;
        }
    }

    public void Dispose()
    {
        CleanupDependency();
    }
}
