using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FatturazioneElettronica.Services.Sdi.Notifications;

/// <summary>
/// Poller delle notifiche SDI via REST API FatturePEC. Auth header
/// <c>X-API-Key</c> (stesso pattern di <see cref="FatturePecSdiProvider"/>).
/// Endpoint: <c>GET {NotificationsEndpoint}?since={lastCursor}&amp;limit={N}</c>.
/// Vedi <see cref="RestNotificationPollerHelper"/> per la deserializzazione
/// JSON (tollerante a vari naming).
/// </summary>
public sealed class FatturePecNotificationPoller : ISdiNotificationPoller
{
    private readonly FatturePecOptions _opts;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<FatturePecNotificationPoller> _logger;
    private readonly SdiCursorRepository _cursors;

    public FatturePecNotificationPoller(
        IOptions<FatturePecOptions> opts,
        IHttpClientFactory httpFactory,
        ILogger<FatturePecNotificationPoller> logger,
        SdiCursorRepository cursors)
    {
        _opts = opts.Value;
        _httpFactory = httpFactory;
        _logger = logger;
        _cursors = cursors;
    }

    public string Name => "FatturePec";
    public bool IsConfigured => SdiConfigHelper.IsSet(_opts.ApiKey)
                            && SdiConfigHelper.IsSet(_opts.NotificationsEndpoint);

    public async Task<IReadOnlyList<RawSdiNotification>> PollAsync(CancellationToken ct = default)
    {
        if (!IsConfigured)
        {
            _logger.LogDebug("FatturePecNotificationPoller: not configured, skip");
            return Array.Empty<RawSdiNotification>();
        }

        var cursor = await _cursors.ReadAsync(Name, ct).ConfigureAwait(false);
        string url = _opts.NotificationsEndpoint
            + (string.IsNullOrEmpty(cursor.LastReceivedId) ? "?" : $"?since={Uri.EscapeDataString(cursor.LastReceivedId)}&")
            + $"limit={_opts.NotificationsMaxPerCycle}";

        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Add("X-API-Key", _opts.ApiKey);
        req.Headers.Add("Accept", "application/json");

        var http = _httpFactory.CreateClient("FatturePecSdi");
        var resp = await RestNotificationPollerHelper.PollJsonAsync(req, http, Name, _logger, ct)
            .ConfigureAwait(false);

        await _cursors.UpsertAsync(Name, resp.NewCursor, metadataJson: null,
            resp.Status, resp.Message, resp.Items.Count, ct).ConfigureAwait(false);

        _logger.LogInformation("FatturePec poll: {Count} notifiche (cursor={Cursor}, status={Status})",
            resp.Items.Count, resp.NewCursor, resp.Status);
        return resp.Items;
    }
}
