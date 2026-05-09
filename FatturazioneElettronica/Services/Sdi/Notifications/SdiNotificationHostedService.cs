using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace FatturazioneElettronica.Services.Sdi.Notifications;

/// <summary>
/// Orchestratore "1 ciclo" del poll notifiche SDI. **NON e' un BackgroundService**:
/// la schedulazione e' demandata al framework <c>scheduler</c> table (gestita
/// da <c>WuicCore.Services.Scheduler.SchedulerHostedService</c>).
///
/// Pattern di scheduling: in <c>scheduler</c> tabella (DB metadati) viene
/// inserito un task con <c>action_type='2'</c> (webservice) che chiama
/// <c>POST /api/sdi/notifications/poll-now</c> ogni N minuti. Vedi
/// <c>scripts/2026-05-09-scheduler-tasks-sdi-fiscal.sql</c> per il seed.
///
/// Vantaggi:
/// <list type="bullet">
///   <item>Singola fonte di verita' per le schedulazioni (centralizzato in DB)</item>
///   <item>Operatore puo' modificare interval/abilitazione/next_execution senza redeploy</item>
///   <item>Tracking automatico via <c>scheduler_execution</c> per audit</item>
///   <item>Email notifica eccezioni via <c>notify_exception_mail</c>
///   gia' presente nel framework</item>
/// </list>
/// </summary>
public sealed class SdiNotificationCycleRunner
{
    private readonly IServiceProvider _sp;
    private readonly ILogger<SdiNotificationCycleRunner> _logger;

    public SdiNotificationCycleRunner(IServiceProvider sp, ILogger<SdiNotificationCycleRunner> logger)
    {
        _sp = sp;
        _logger = logger;
    }

    /// <summary>
    /// Esegue un singolo ciclo poll → parse → apply. Invocato:
    /// <list type="bullet">
    ///   <item>dal framework <c>scheduler</c> via webservice call (production)</item>
    ///   <item>dall'endpoint manuale <c>POST /api/sdi/notifications/poll-now</c> (test/admin)</item>
    /// </list>
    /// </summary>
    public async Task<SdiNotificationApplier.ApplyResult> RunOneCycleAsync(CancellationToken ct)
    {
        using var scope = _sp.CreateScope();
        var poller = scope.ServiceProvider.GetRequiredService<ISdiNotificationPoller>();
        var applier = scope.ServiceProvider.GetRequiredService<SdiNotificationApplier>();

        if (!poller.IsConfigured)
        {
            _logger.LogDebug("Poller {Name} not configured, skip", poller.Name);
            return new SdiNotificationApplier.ApplyResult(0, 0, 0, 0, 0);
        }

        var raws = await poller.PollAsync(ct).ConfigureAwait(false);
        if (raws.Count == 0)
            return new SdiNotificationApplier.ApplyResult(0, 0, 0, 0, 0);

        var result = await applier.ApplyAsync(raws, ct).ConfigureAwait(false);
        _logger.LogInformation("Sdi notifications cycle: parsed={P} persisted={S} applied={A} dup={D} err={E}",
            result.Parsed, result.Persisted, result.Applied, result.SkippedDuplicates, result.Errors);
        return result;
    }
}
