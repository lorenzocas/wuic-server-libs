using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace FatturazioneElettronica.Services.Sdi;

/// <summary>
/// Provider di default per dev/test: simula la trasmissione senza chiamate
/// di rete. Genera un <c>sdi_id</c> sintetico <c>WUIC-SIM-&lt;timestamp&gt;</c>
/// e logga il payload per ispezione.
///
/// Selezionato automaticamente quando <c>Sdi:Provider</c> non e' impostato
/// o e' <c>"Mock"</c> in appsettings.json. Mai usare in produzione.
/// </summary>
public sealed class MockSdiProvider : ISdiProvider
{
    private readonly ILogger<MockSdiProvider> _logger;

    public MockSdiProvider(ILogger<MockSdiProvider> logger) => _logger = logger;

    public string Name => "Mock";
    public bool IsConfigured => true; // sempre disponibile

    public Task<SdiSubmitResult> SubmitAsync(byte[] signedPayload, string fileName, CancellationToken ct = default)
    {
        if (signedPayload is null || signedPayload.Length == 0)
            throw new ArgumentException("signedPayload empty", nameof(signedPayload));

        var sdiId = "WUIC-SIM-" + DateTime.UtcNow.ToString("yyyyMMddHHmmss") +
                    "-" + Guid.NewGuid().ToString("N").Substring(0, 8);
        _logger.LogInformation(
            "MockSdiProvider.Submit: filename={FileName}, payloadBytes={Bytes}, sdiId={SdiId}",
            fileName, signedPayload.Length, sdiId);

        return Task.FromResult(new SdiSubmitResult
        {
            Ok = true,
            SdiId = sdiId,
            Message = "Simulazione invio OK (production: configurare ISdiProvider reale)",
            ProviderName = Name
        });
    }
}
