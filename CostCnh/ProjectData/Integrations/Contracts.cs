using System.Threading;
using System.Threading.Tasks;

namespace CostCnh.Integrations;

/// <summary>
/// Provider Symmetry contracts (Sprint 4 - Livello 5 + Livello 7 della
/// decision ladder app-creation). Per ogni integrazione esterna definiamo
/// una coppia simmetrica:
///   - <c>I*Sender</c>        : invio outbound (es. SAP cost data upload)
///   - <c>I*NotificationPoller</c> : polling inbound (es. SAP esiti async)
///
/// Le implementazioni concrete sono registrate via
/// <c>services.AddKeyedScoped&lt;I*Sender, *HttpSender&gt;("Http")</c> e
/// risolte runtime in base a <c>Integrations:&lt;Sys&gt;:Provider</c> di
/// <c>appsettings.json</c>. Lo stub provider e' sempre disponibile per
/// development / e2e.
/// </summary>

public sealed record IntegrationResult(
    bool Ok,
    string? MessageId,
    string? OutcomeText,
    int NewMessagesCount = 0);

public interface ISapSender
{
    Task<IntegrationResult> SendCostDataAsync(int programId, string payloadJson, CancellationToken ct);
}
public interface ISapNotificationPoller
{
    Task<IntegrationResult> PollOnceAsync(CancellationToken ct);
}

public interface IBpmSender
{
    Task<IntegrationResult> SendWorkflowEventAsync(string eventKind, string payloadJson, CancellationToken ct);
}
public interface IBpmNotificationPoller
{
    Task<IntegrationResult> PollOnceAsync(CancellationToken ct);
}

public interface ITimesheetSender
{
    Task<IntegrationResult> SendTimesheetExportAsync(int month_id, string payloadJson, CancellationToken ct);
}
public interface ITimesheetNotificationPoller
{
    Task<IntegrationResult> PollOnceAsync(CancellationToken ct);
}

public interface IMacRequestSender
{
    Task<IntegrationResult> SendMacRequestAsync(int programId, string payloadJson, CancellationToken ct);
}
public interface IMacResponsePoller
{
    Task<IntegrationResult> PollOnceAsync(CancellationToken ct);
}
