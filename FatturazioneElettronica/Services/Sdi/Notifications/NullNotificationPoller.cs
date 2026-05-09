using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace FatturazioneElettronica.Services.Sdi.Notifications;

/// <summary>
/// No-op poller selezionato dalla DI auto-selection quando nessun provider
/// reale e' configurato (e.g. dev con <see cref="MockSdiProvider"/> attivo).
/// Ritorna sempre empty senza errori. Evita di propagare eccezioni dallo
/// scheduler quando l'app non e' ancora configurata.
/// </summary>
public sealed class NullNotificationPoller : ISdiNotificationPoller
{
    private readonly ILogger<NullNotificationPoller> _logger;
    public NullNotificationPoller(ILogger<NullNotificationPoller> logger) { _logger = logger; }

    public string Name => "Null";
    public bool IsConfigured => true;  // sempre "configurato" per evitare skip log warning

    public Task<IReadOnlyList<RawSdiNotification>> PollAsync(CancellationToken ct = default)
    {
        _logger.LogDebug("NullNotificationPoller: nessun provider SDI reale configurato, skip ciclo");
        return Task.FromResult<IReadOnlyList<RawSdiNotification>>(Array.Empty<RawSdiNotification>());
    }
}
