using System;
using System.Threading;
using System.Threading.Tasks;

namespace FatturazioneElettronica.Services.Sdi;

/// <summary>
/// Helper condiviso per riconoscere config "vuoto":
/// stringa null/whitespace OR placeholder template (<c>__SET_*__</c>) emesso
/// dal release pipeline (vedi Program.cs:UpsertConnectionString).
/// </summary>
internal static class SdiConfigHelper
{
    public static bool IsSet(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        if (value.StartsWith("__SET_", StringComparison.Ordinal) &&
            value.EndsWith("__", StringComparison.Ordinal)) return false;
        return true;
    }
}

/// <summary>
/// Provider per la trasmissione delle fatture al Sistema di Interscambio (SDI)
/// dell'Agenzia delle Entrate. Diversi vendor offrono servizi di intermediazione
/// SDI (Aruba PEC, FatturePEC, Pec.it, Notarify) ognuno con API e formati
/// diversi. Plug-in pattern: l'app sceglie il provider via
/// <c>Sdi:Provider</c> in appsettings, le credenziali specifiche del provider
/// in <c>Sdi:&lt;ProviderName&gt;:*</c>.
/// </summary>
public interface ISdiProvider
{
    /// <summary>Nome univoco del provider (es. <c>Mock</c>, <c>ArubaPec</c>).</summary>
    string Name { get; }

    /// <summary>True se il provider e' configurato (credenziali presenti).</summary>
    bool IsConfigured { get; }

    /// <summary>
    /// Trasmette il file firmato al SDI tramite il provider.
    /// </summary>
    /// <param name="signedPayload">file CMS firmato CADES-BES (.xml.p7m bytes).</param>
    /// <param name="fileName">nome file SDI (es. <c>IT01234567890_00001.xml.p7m</c>).</param>
    /// <param name="ct">cancellation token.</param>
    /// <returns>Esito trasmissione: success/failure + identificatori SDI per tracking.</returns>
    Task<SdiSubmitResult> SubmitAsync(byte[] signedPayload, string fileName, CancellationToken ct = default);
}

/// <summary>Esito trasmissione SDI.</summary>
public sealed class SdiSubmitResult
{
    /// <summary>True se la trasmissione e' andata a buon fine.</summary>
    public required bool Ok { get; init; }

    /// <summary>
    /// Identificativo univoco assegnato dal SDI (o dal provider) per tracking.
    /// Esempio Aruba: <c>SdI_<numerico></c>. Esempio Mock: <c>WUIC-SIM-<timestamp></c>.
    /// </summary>
    public required string SdiId { get; init; }

    /// <summary>Messaggio diagnostico (codice errore SDI o info success).</summary>
    public string? Message { get; init; }

    /// <summary>Codice errore opzionale (es. SDI 00200=non conforme, 00400=duplicato).</summary>
    public string? ErrorCode { get; init; }

    /// <summary>Provider che ha trasmesso (per audit/tracing).</summary>
    public required string ProviderName { get; init; }
}
