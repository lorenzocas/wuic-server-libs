using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FatturazioneElettronica.Services.Sdi.Notifications;

/// <summary>
/// Poller notifiche SDI via REST API Notarify. Auth dual-header
/// <c>X-API-Key</c> + <c>X-API-Secret</c> (stesso pattern di
/// <see cref="NotarifySdiProvider"/>). Endpoint:
/// <c>GET {NotificationsEndpoint}?lastId={lastCursor}&amp;limit={N}</c>.
/// </summary>
public sealed class NotarifyNotificationPoller : ISdiNotificationPoller
{
    private readonly NotarifyOptions _opts;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<NotarifyNotificationPoller> _logger;
    private readonly SdiCursorRepository _cursors;

    public NotarifyNotificationPoller(
        IOptions<NotarifyOptions> opts,
        IHttpClientFactory httpFactory,
        ILogger<NotarifyNotificationPoller> logger,
        SdiCursorRepository cursors)
    {
        _opts = opts.Value;
        _httpFactory = httpFactory;
        _logger = logger;
        _cursors = cursors;
    }

    public string Name => "Notarify";
    public bool IsConfigured => SdiConfigHelper.IsSet(_opts.ApiKey)
                            && SdiConfigHelper.IsSet(_opts.ApiSecret)
                            && SdiConfigHelper.IsSet(_opts.NotificationsEndpoint);

    public async Task<IReadOnlyList<RawSdiNotification>> PollAsync(CancellationToken ct = default)
    {
        if (!IsConfigured)
        {
            _logger.LogDebug("NotarifyNotificationPoller: not configured, skip");
            return Array.Empty<RawSdiNotification>();
        }

        var cursor = await _cursors.ReadAsync(Name, ct).ConfigureAwait(false);
        string url = _opts.NotificationsEndpoint
            + (string.IsNullOrEmpty(cursor.LastReceivedId) ? "?" : $"?lastId={Uri.EscapeDataString(cursor.LastReceivedId)}&")
            + $"limit={_opts.NotificationsMaxPerCycle}";

        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Add("X-API-Key", _opts.ApiKey);
        req.Headers.Add("X-API-Secret", _opts.ApiSecret);
        req.Headers.Add("Accept", "application/json");

        var http = _httpFactory.CreateClient("NotarifySdi");
        var resp = await RestNotificationPollerHelper.PollJsonAsync(req, http, Name, _logger, ct)
            .ConfigureAwait(false);

        await _cursors.UpsertAsync(Name, resp.NewCursor, metadataJson: null,
            resp.Status, resp.Message, resp.Items.Count, ct).ConfigureAwait(false);

        _logger.LogInformation("Notarify poll: {Count} notifiche (cursor={Cursor}, status={Status})",
            resp.Items.Count, resp.NewCursor, resp.Status);
        return resp.Items;
    }
}
