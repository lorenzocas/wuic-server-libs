using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace FatturazioneElettronica.Services.FiscalReports;

/// <summary>
/// DI registration per i FiscalReportGenerator (LIPE, Esterometro, CU).
/// Da chiamare in Program.cs accanto a AddSdiServices.
/// </summary>
public static class FiscalReportsServiceCollectionExtensions
{
    public static IServiceCollection AddFiscalReportsServices(this IServiceCollection services, IConfiguration config)
    {
        services.AddSingleton<LipeXmlGenerator>();
        services.AddSingleton<EsterometroXmlGenerator>();
        services.AddSingleton<CuXmlGenerator>();

        // Optional: factory dispatch by tipo string (per futuro endpoint generico)
        services.AddSingleton<IReadOnlyDictionary<string, IFiscalReportGenerator>>(sp =>
            new Dictionary<string, IFiscalReportGenerator>(System.StringComparer.OrdinalIgnoreCase)
            {
                ["LIPE"]        = sp.GetRequiredService<LipeXmlGenerator>(),
                ["ESTEROMETRO"] = sp.GetRequiredService<EsterometroXmlGenerator>(),
                ["CU"]          = sp.GetRequiredService<CuXmlGenerator>(),
            });

        return services;
    }
}
