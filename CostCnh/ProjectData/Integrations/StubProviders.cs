using System.Text.Json;

namespace CostCnh.Integrations;

/// <summary>
/// Stub providers per development / e2e: simulano successo immediato,
/// scrivono al log envelope + cursor, NON colpiscono sistemi esterni.
/// </summary>
public sealed class SapStubSender : ISapSender
{
    private readonly CursorHelper _h;
    public SapStubSender(CursorHelper h) => _h = h;

    public async Task<IntegrationResult> SendCostDataAsync(int programId, string payloadJson, CancellationToken ct)
    {
        var mid = $"SAP-STUB-{Guid.NewGuid():N}";
        await _h.LogMessageAsync("sap", "OUT", mid, programId, "core", "program", programId.ToString(), payloadJson, 1, "stub-accepted", ct: ct);
        return new IntegrationResult(true, mid, "stub-accepted");
    }
}
public sealed class SapStubPoller : ISapNotificationPoller
{
    private readonly CursorHelper _h;
    public SapStubPoller(CursorHelper h) => _h = h;
    public async Task<IntegrationResult> PollOnceAsync(CancellationToken ct)
    {
        await _h.UpsertCursorAsync("sap", "Stub", "idle", lastMessageId: $"SAP-STUB-POLL-{DateTime.UtcNow:yyyyMMddHHmmss}", nextEligibleUtc: DateTime.UtcNow.AddMinutes(5), ct: ct);
        return new IntegrationResult(true, null, "stub-poll-noop", 0);
    }
}

public sealed class BpmStubSender : IBpmSender
{
    private readonly CursorHelper _h;
    public BpmStubSender(CursorHelper h) => _h = h;
    public async Task<IntegrationResult> SendWorkflowEventAsync(string eventKind, string payloadJson, CancellationToken ct)
    {
        var mid = $"BPM-STUB-{Guid.NewGuid():N}";
        await _h.LogMessageAsync("bpm", "OUT", mid, null, null, null, eventKind, payloadJson, 1, "stub-accepted", ct: ct);
        return new IntegrationResult(true, mid, "stub-accepted");
    }
}
public sealed class BpmStubPoller : IBpmNotificationPoller
{
    private readonly CursorHelper _h;
    public BpmStubPoller(CursorHelper h) => _h = h;
    public async Task<IntegrationResult> PollOnceAsync(CancellationToken ct)
    {
        await _h.UpsertCursorAsync("bpm", "Stub", "idle", nextEligibleUtc: DateTime.UtcNow.AddMinutes(15), ct: ct);
        return new IntegrationResult(true, null, "stub-poll-noop", 0);
    }
}

public sealed class TimesheetStubSender : ITimesheetSender
{
    private readonly CursorHelper _h;
    public TimesheetStubSender(CursorHelper h) => _h = h;
    public async Task<IntegrationResult> SendTimesheetExportAsync(int month_id, string payloadJson, CancellationToken ct)
    {
        var mid = $"TS-STUB-{month_id}-{Guid.NewGuid():N}";
        await _h.LogMessageAsync("timesheet", "OUT", mid, null, "core", "dim_time", month_id.ToString(), payloadJson, 1, "stub-accepted", ct: ct);
        return new IntegrationResult(true, mid, "stub-accepted");
    }
}
public sealed class TimesheetStubPoller : ITimesheetNotificationPoller
{
    private readonly CursorHelper _h;
    public TimesheetStubPoller(CursorHelper h) => _h = h;
    public async Task<IntegrationResult> PollOnceAsync(CancellationToken ct)
    {
        await _h.UpsertCursorAsync("timesheet", "Stub", "idle", nextEligibleUtc: DateTime.UtcNow.AddHours(6), ct: ct);
        return new IntegrationResult(true, null, "stub-poll-noop", 0);
    }
}

public sealed class MacStubSender : IMacRequestSender
{
    private readonly CursorHelper _h;
    public MacStubSender(CursorHelper h) => _h = h;
    public async Task<IntegrationResult> SendMacRequestAsync(int programId, string payloadJson, CancellationToken ct)
    {
        var mid = $"MAC-STUB-{programId}-{Guid.NewGuid():N}";
        await _h.LogMessageAsync("mac", "OUT", mid, programId, "core", "program", programId.ToString(), payloadJson, 2, "stub-pending-ack", ct: ct);
        return new IntegrationResult(true, mid, "stub-pending-ack");
    }
}
public sealed class MacStubPoller : IMacResponsePoller
{
    private readonly CursorHelper _h;
    public MacStubPoller(CursorHelper h) => _h = h;
    public async Task<IntegrationResult> PollOnceAsync(CancellationToken ct)
    {
        await _h.UpsertCursorAsync("mac", "Stub", "idle", nextEligibleUtc: DateTime.UtcNow.AddMinutes(10), ct: ct);
        return new IntegrationResult(true, null, "stub-poll-noop", 0);
    }
}
