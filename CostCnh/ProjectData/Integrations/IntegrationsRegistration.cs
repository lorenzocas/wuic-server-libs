using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;

namespace CostCnh.Integrations;

/// <summary>
/// Extension method per registrare TUTTE le coppie Sender/Poller con
/// keyed services (Stub + Http) e un resolver che sceglie l'implementazione
/// in base a <c>Integrations:&lt;Sys&gt;:Provider</c> di <c>appsettings.json</c>.
///
/// In <c>Program.cs</c>:
///   <code>builder.Services.AddCostCnhIntegrations(builder.Configuration);</code>
///
/// Per cambiare provider runtime: aggiornare appsettings.json e restart backend
/// (no rebuild richiesto).
/// </summary>
public static class IntegrationsRegistration
{
    public static IServiceCollection AddCostCnhIntegrations(this IServiceCollection services, IConfiguration cfg)
    {
        services.AddSingleton<CursorHelper>();

        // HttpClient base (singleton typed) — reuse per tutti i provider HTTP
        services.AddHttpClient();

        // Keyed registrations: "Stub" + "Http" per ogni interface
        services.AddKeyedScoped<ISapSender, SapStubSender>("Stub");
        services.AddKeyedScoped<ISapSender, SapHttpSender>("Http");
        services.AddKeyedScoped<ISapNotificationPoller, SapStubPoller>("Stub");
        services.AddKeyedScoped<ISapNotificationPoller, SapHttpPoller>("Http");

        services.AddKeyedScoped<IBpmSender, BpmStubSender>("Stub");
        services.AddKeyedScoped<IBpmSender, BpmHttpSender>("Http");
        services.AddKeyedScoped<IBpmNotificationPoller, BpmStubPoller>("Stub");
        services.AddKeyedScoped<IBpmNotificationPoller, BpmHttpPoller>("Http");

        services.AddKeyedScoped<ITimesheetSender, TimesheetStubSender>("Stub");
        services.AddKeyedScoped<ITimesheetSender, TimesheetHttpSender>("Http");
        services.AddKeyedScoped<ITimesheetNotificationPoller, TimesheetStubPoller>("Stub");
        services.AddKeyedScoped<ITimesheetNotificationPoller, TimesheetHttpPoller>("Http");

        services.AddKeyedScoped<IMacRequestSender, MacStubSender>("Stub");
        services.AddKeyedScoped<IMacRequestSender, MacHttpSender>("Http");
        services.AddKeyedScoped<IMacResponsePoller, MacStubPoller>("Stub");
        services.AddKeyedScoped<IMacResponsePoller, MacHttpPoller>("Http");

        // Resolver dispatches in base alla config: Integrations:<Sys>:Provider
        services.AddScoped<IntegrationProviderResolver>();

        return services;
    }
}

/// <summary>
/// Risolve l'implementazione corretta in base a
/// <c>appsettings.json:Integrations:&lt;Sys&gt;:Provider</c> (default "Stub").
/// </summary>
public sealed class IntegrationProviderResolver
{
    private readonly IServiceProvider _sp;
    private readonly IConfiguration _cfg;
    public IntegrationProviderResolver(IServiceProvider sp, IConfiguration cfg) { _sp = sp; _cfg = cfg; }

    private string ResolveKey(string system)
        => _cfg[$"Integrations:{Capitalize(system)}:Provider"] ?? "Stub";

    public ISapSender Sap() => _sp.GetRequiredKeyedService<ISapSender>(ResolveKey("sap"));
    public ISapNotificationPoller SapPoller() => _sp.GetRequiredKeyedService<ISapNotificationPoller>(ResolveKey("sap"));

    public IBpmSender Bpm() => _sp.GetRequiredKeyedService<IBpmSender>(ResolveKey("bpm"));
    public IBpmNotificationPoller BpmPoller() => _sp.GetRequiredKeyedService<IBpmNotificationPoller>(ResolveKey("bpm"));

    public ITimesheetSender Timesheet() => _sp.GetRequiredKeyedService<ITimesheetSender>(ResolveKey("timesheet"));
    public ITimesheetNotificationPoller TimesheetPoller() => _sp.GetRequiredKeyedService<ITimesheetNotificationPoller>(ResolveKey("timesheet"));

    public IMacRequestSender Mac() => _sp.GetRequiredKeyedService<IMacRequestSender>(ResolveKey("mac"));
    public IMacResponsePoller MacPoller() => _sp.GetRequiredKeyedService<IMacResponsePoller>(ResolveKey("mac"));

    private static string Capitalize(string s) => string.IsNullOrEmpty(s) ? s : char.ToUpperInvariant(s[0]) + s.Substring(1);
}
