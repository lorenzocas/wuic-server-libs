using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;

namespace CostCnh.Integrations;

/// <summary>
/// HTTP provider skeleton — base URL letta da
/// <c>appsettings.json:Integrations:&lt;Sys&gt;:BaseUrl</c>.
/// Per ora ciascun *HttpSender e' un POST naive verso baseUrl; le HTTP
/// auth-strategy (OAuth client_creds / mTLS / API key in header) andranno
/// implementate per-sistema quando ci sara' un endpoint reale di staging.
/// </summary>

internal abstract class HttpProviderBase
{
    protected readonly HttpClient Http;
    protected readonly CursorHelper Cursor;
    protected readonly ILogger Log;
    protected readonly string SystemName;
    protected readonly string BaseUrl;

    protected HttpProviderBase(HttpClient http, CursorHelper cursor, ILogger log, IConfiguration cfg, string system)
    {
        Http = http;
        Cursor = cursor;
        Log = log;
        SystemName = system;
        BaseUrl = cfg[$"Integrations:{Capitalize(system)}:BaseUrl"]
                  ?? throw new InvalidOperationException($"Integrations:{Capitalize(system)}:BaseUrl mancante in appsettings.json");
    }
    private static string Capitalize(string s) => string.IsNullOrEmpty(s) ? s : char.ToUpperInvariant(s[0]) + s.Substring(1);
}

internal sealed class SapHttpSender : HttpProviderBase, ISapSender
{
    public SapHttpSender(HttpClient http, CursorHelper cursor, ILogger<SapHttpSender> log, IConfiguration cfg)
        : base(http, cursor, log, cfg, "sap") { }

    public async Task<IntegrationResult> SendCostDataAsync(int programId, string payloadJson, CancellationToken ct)
    {
        try
        {
            using var content = new StringContent(payloadJson, System.Text.Encoding.UTF8, "application/json");
            using var resp = await Http.PostAsync($"{BaseUrl}/cost-data/{programId}", content, ct);
            var body = await resp.Content.ReadAsStringAsync(ct);
            var ok = resp.IsSuccessStatusCode;
            var mid = resp.Headers.TryGetValues("X-Message-Id", out var h) ? string.Join(",", h) : Guid.NewGuid().ToString("N");
            await Cursor.LogMessageAsync("sap", "OUT", mid, programId, "core", "program", programId.ToString(), payloadJson, (byte)(ok ? 1 : 0), $"{(int)resp.StatusCode} {resp.ReasonPhrase}", ct: ct);
            return new IntegrationResult(ok, mid, body.Length > 500 ? body.Substring(0, 500) : body);
        }
        catch (Exception ex)
        {
            await Cursor.LogMessageAsync("sap", "OUT", null, programId, "core", "program", programId.ToString(), payloadJson, 0, ex.Message, ct: ct);
            return new IntegrationResult(false, null, ex.Message);
        }
    }
}

internal sealed class SapHttpPoller : HttpProviderBase, ISapNotificationPoller
{
    public SapHttpPoller(HttpClient http, CursorHelper cursor, ILogger<SapHttpPoller> log, IConfiguration cfg)
        : base(http, cursor, log, cfg, "sap") { }

    public async Task<IntegrationResult> PollOnceAsync(CancellationToken ct)
    {
        try
        {
            using var resp = await Http.GetAsync($"{BaseUrl}/notifications/poll", ct);
            var body = await resp.Content.ReadAsStringAsync(ct);
            await Cursor.UpsertCursorAsync("sap", "Http", resp.IsSuccessStatusCode ? "idle" : "error",
                lastEtag: resp.Headers.TryGetValues("ETag", out var et) ? string.Join(",", et) : null,
                errorText: resp.IsSuccessStatusCode ? null : $"{(int)resp.StatusCode}",
                nextEligibleUtc: DateTime.UtcNow.AddMinutes(5),
                ct: ct);
            return new IntegrationResult(resp.IsSuccessStatusCode, null, body.Length > 200 ? body.Substring(0, 200) : body);
        }
        catch (Exception ex)
        {
            await Cursor.UpsertCursorAsync("sap", "Http", "error", errorText: ex.Message, nextEligibleUtc: DateTime.UtcNow.AddMinutes(5), ct: ct);
            return new IntegrationResult(false, null, ex.Message);
        }
    }
}

// BPM / Timesheet / MAC mirror della stessa shape — placeholder con call POST naive
internal sealed class BpmHttpSender(HttpClient http, CursorHelper cursor, ILogger<BpmHttpSender> log, IConfiguration cfg)
    : HttpProviderBase(http, cursor, log, cfg, "bpm"), IBpmSender
{
    public async Task<IntegrationResult> SendWorkflowEventAsync(string eventKind, string payloadJson, CancellationToken ct)
    {
        try
        {
            using var content = new StringContent(payloadJson, System.Text.Encoding.UTF8, "application/json");
            using var resp = await Http.PostAsync($"{BaseUrl}/events/{eventKind}", content, ct);
            await Cursor.LogMessageAsync("bpm", "OUT", null, null, null, null, eventKind, payloadJson, (byte)(resp.IsSuccessStatusCode ? 1 : 0), $"{(int)resp.StatusCode}", ct: ct);
            return new IntegrationResult(resp.IsSuccessStatusCode, null, null);
        }
        catch (Exception ex) { return new IntegrationResult(false, null, ex.Message); }
    }
}
internal sealed class BpmHttpPoller(HttpClient http, CursorHelper cursor, ILogger<BpmHttpPoller> log, IConfiguration cfg)
    : HttpProviderBase(http, cursor, log, cfg, "bpm"), IBpmNotificationPoller
{
    public async Task<IntegrationResult> PollOnceAsync(CancellationToken ct)
    {
        try { _ = await Http.GetAsync($"{BaseUrl}/notifications", ct); await Cursor.UpsertCursorAsync("bpm", "Http", "idle", nextEligibleUtc: DateTime.UtcNow.AddMinutes(15), ct: ct); return new IntegrationResult(true, null, null); }
        catch (Exception ex) { await Cursor.UpsertCursorAsync("bpm", "Http", "error", errorText: ex.Message, ct: ct); return new IntegrationResult(false, null, ex.Message); }
    }
}

internal sealed class TimesheetHttpSender(HttpClient http, CursorHelper cursor, ILogger<TimesheetHttpSender> log, IConfiguration cfg)
    : HttpProviderBase(http, cursor, log, cfg, "timesheet"), ITimesheetSender
{
    public async Task<IntegrationResult> SendTimesheetExportAsync(int month_id, string payloadJson, CancellationToken ct)
    {
        try
        {
            using var content = new StringContent(payloadJson, System.Text.Encoding.UTF8, "application/json");
            using var resp = await Http.PostAsync($"{BaseUrl}/exports/{month_id}", content, ct);
            await Cursor.LogMessageAsync("timesheet", "OUT", null, null, "core", "dim_time", month_id.ToString(), payloadJson, (byte)(resp.IsSuccessStatusCode ? 1 : 0), $"{(int)resp.StatusCode}", ct: ct);
            return new IntegrationResult(resp.IsSuccessStatusCode, null, null);
        }
        catch (Exception ex) { return new IntegrationResult(false, null, ex.Message); }
    }
}
internal sealed class TimesheetHttpPoller(HttpClient http, CursorHelper cursor, ILogger<TimesheetHttpPoller> log, IConfiguration cfg)
    : HttpProviderBase(http, cursor, log, cfg, "timesheet"), ITimesheetNotificationPoller
{
    public async Task<IntegrationResult> PollOnceAsync(CancellationToken ct)
    {
        try { _ = await Http.GetAsync($"{BaseUrl}/notifications", ct); await Cursor.UpsertCursorAsync("timesheet", "Http", "idle", nextEligibleUtc: DateTime.UtcNow.AddHours(6), ct: ct); return new IntegrationResult(true, null, null); }
        catch (Exception ex) { await Cursor.UpsertCursorAsync("timesheet", "Http", "error", errorText: ex.Message, ct: ct); return new IntegrationResult(false, null, ex.Message); }
    }
}

internal sealed class MacHttpSender(HttpClient http, CursorHelper cursor, ILogger<MacHttpSender> log, IConfiguration cfg)
    : HttpProviderBase(http, cursor, log, cfg, "mac"), IMacRequestSender
{
    public async Task<IntegrationResult> SendMacRequestAsync(int programId, string payloadJson, CancellationToken ct)
    {
        try
        {
            using var content = new StringContent(payloadJson, System.Text.Encoding.UTF8, "application/json");
            using var resp = await Http.PostAsync($"{BaseUrl}/requests/{programId}", content, ct);
            await Cursor.LogMessageAsync("mac", "OUT", null, programId, "core", "program", programId.ToString(), payloadJson, (byte)(resp.IsSuccessStatusCode ? 2 : 0), $"{(int)resp.StatusCode}", ct: ct);
            return new IntegrationResult(resp.IsSuccessStatusCode, null, null);
        }
        catch (Exception ex) { return new IntegrationResult(false, null, ex.Message); }
    }
}
internal sealed class MacHttpPoller(HttpClient http, CursorHelper cursor, ILogger<MacHttpPoller> log, IConfiguration cfg)
    : HttpProviderBase(http, cursor, log, cfg, "mac"), IMacResponsePoller
{
    public async Task<IntegrationResult> PollOnceAsync(CancellationToken ct)
    {
        try { _ = await Http.GetAsync($"{BaseUrl}/responses", ct); await Cursor.UpsertCursorAsync("mac", "Http", "idle", nextEligibleUtc: DateTime.UtcNow.AddMinutes(10), ct: ct); return new IntegrationResult(true, null, null); }
        catch (Exception ex) { await Cursor.UpsertCursorAsync("mac", "Http", "error", errorText: ex.Message, ct: ct); return new IntegrationResult(false, null, ex.Message); }
    }
}
