using System.Threading;
using System.Threading.Tasks;

namespace FatturazioneElettronica.Services.Sdi.Conservation;

/// <summary>
/// Servizio di conservazione sostitutiva digitale a norma AgID. Sigilla un
/// pacchetto fattura (XML/p7m + metadati) producendo una prova di integrita'
/// + un timestamp digitale RFC 3161 + un riferimento di storage per il
/// retrieval in qualunque momento entro i 10 anni di retention obbligatoria.
///
/// Implementazioni:
/// <list type="bullet">
///   <item><see cref="FilesystemConservation"/>: storage locale + TSA pubblico.
///   Costo zero ma responsabilita' in carico all'azienda (backup, audit).</item>
///   <item><c>ArubaConservationProvider</c>: API Aruba Conservazione Sostitutiva
///   (a pagamento, ma scarica responsabilita').</item>
///   <item><c>InfoCertConservationProvider</c>: API InfoCert LegalDoc.</item>
/// </list>
/// </summary>
public interface IDigitalConservation
{
    string Name { get; }
    bool IsConfigured { get; }

    /// <summary>
    /// Sigilla il pacchetto in conservazione. Side-effects:
    /// <list type="number">
    ///   <item>Salva il file (filesystem locale o upload provider)</item>
    ///   <item>Calcola SHA-256 del payload</item>
    ///   <item>Richiede timestamp digitale RFC 3161 al TSA configurato</item>
    ///   <item>INSERT in <c>conservazione_index</c> con tutti i metadati</item>
    /// </list>
    /// </summary>
    /// <param name="fatturaId">id fattura in <c>fatture_inviate</c></param>
    /// <param name="fileName">nome file canonico SDI (es. ITxxx_00001.xml.p7m)</param>
    /// <param name="payload">bytes del file da conservare (.xml o .xml.p7m firmato)</param>
    /// <param name="userId">chi ha lanciato la sigillatura (audit GDPR)</param>
    /// <param name="metadataJson">JSON metadati estratti dalla fattura (cedente/cessionario/anno/totale) per ricerca futura</param>
    Task<ConservationResult> SealAsync(
        int fatturaId,
        string fileName,
        byte[] payload,
        string? userId,
        string? metadataJson,
        CancellationToken ct = default);

    /// <summary>
    /// Verifica integrita' di un pacchetto gia' sigillato: re-hash del file
    /// + match con sha256_hash in DB + verifica firma TSA token (se filesystem).
    /// Per provider remoti (Aruba/InfoCert) chiama l'API verify del provider.
    /// </summary>
    Task<VerifyResult> VerifyAsync(int conservationIndexId, CancellationToken ct = default);
}

public sealed class ConservationResult
{
    public required bool Ok { get; init; }
    public required string ProviderName { get; init; }
    public int? ConservationIndexId { get; init; }
    public string? StorageLocation { get; init; }
    public string? Sha256Hash { get; init; }
    public bool TimestampObtained { get; init; }
    public string? TsaUrl { get; init; }
    public required string Message { get; init; }
}

public sealed class VerifyResult
{
    public required bool Ok { get; init; }
    public required string Message { get; init; }
    public string? Sha256Expected { get; init; }
    public string? Sha256Actual { get; init; }
    public bool TimestampValid { get; init; }
}
