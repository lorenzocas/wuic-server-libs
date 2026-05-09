using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FatturazioneElettronica.Services.Sdi.Notifications;

/// <summary>
/// Poller notifiche SDI via REST API Pec.it. Auth Bearer token (stesso pattern
/// di <see cref="PecItSdiProvider"/>). Endpoint:
/// <c>GET {NotificationsEndpoint}?cursor={lastCursor}&amp;limit={N}</c>.
/// </summary>
public sealed class PecItNotificationPoller : ISdiNotificationPoller
{
    private readonly PecItOptions _opts;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<PecItNotificationPoller> _logger;
    private readonly SdiCursorRepository _cursors;

    public PecItNotificationPoller(
        IOptions<PecItOptions> opts,
        IHttpClientFactory httpFactory,
        ILogger<PecItNotificationPoller> logger,
        SdiCursorRepository cursors)
    {
        _opts = opts.Value;
        _httpFactory = httpFactory;
        _logger = logger;
        _cursors = cursors;
    }

    public string Name => "PecIt";
    public bool IsConfigured => SdiConfigHelper.IsSet(_opts.BearerToken)
                            && SdiConfigHelper.IsSet(_opts.NotificationsEndpoint);

    public async Task<IReadOnlyList<RawSdiNotification>> PollAsync(CancellationToken ct = default)
    {
        if (!IsConfigured)
        {
            _logger.LogDebug("PecItNotificationPoller: not configured, skip");
            return Array.Empty<RawSdiNotification>();
        }

        var cursor = await _cursors.ReadAsync(Name, ct).ConfigureAwait(false);
        string url = _opts.NotificationsEndpoint
            + (string.IsNullOrEmpty(cursor.LastReceivedId) ? "?" : $"?cursor={Uri.EscapeDataString(cursor.LastReceivedId)}&")
            + $"limit={_opts.NotificationsMaxPerCycle}";

        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _opts.BearerToken);
        req.Headers.Add("Accept", "application/json");

        var http = _httpFactory.CreateClient("PecItSdi");
        var resp = await RestNotificationPollerHelper.PollJsonAsync(req, http, Name, _logger, ct)
            .ConfigureAwait(false);

        await _cursors.UpsertAsync(Name, resp.NewCursor, metadataJson: null,
            resp.Status, resp.Message, resp.Items.Count, ct).ConfigureAwait(false);

        _logger.LogInformation("PecIt poll: {Count} notifiche (cursor={Cursor}, status={Status})",
            resp.Items.Count, resp.NewCursor, resp.Status);
        return resp.Items;
    }
}
