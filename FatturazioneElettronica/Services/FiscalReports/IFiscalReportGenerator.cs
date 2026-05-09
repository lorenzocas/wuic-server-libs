using System.Threading;
using System.Threading.Tasks;

namespace FatturazioneElettronica.Services.FiscalReports;

/// <summary>
/// Generator di comunicazioni periodiche fiscali (LIPE, Esterometro, CU)
/// da trasmettere all'Agenzia delle Entrate.
/// </summary>
public interface IFiscalReportGenerator
{
    /// <summary>Tipo report: LIPE | ESTEROMETRO | CU.</summary>
    string Tipo { get; }

    /// <summary>
    /// Genera il file XML conforme allo schema AdE per il periodo specificato.
    /// Salva la riga in <c>comunicazioni_periodiche</c> con stato='GENERATA'.
    /// </summary>
    /// <param name="anno">anno di riferimento (es. 2026)</param>
    /// <param name="periodo">trimestre (Q1..Q4) o mese (M01..M12), null per CU annuale</param>
    /// <param name="userId">audit GDPR</param>
    Task<FiscalReportResult> GenerateAsync(
        int anno, string? periodo, string? userId, CancellationToken ct = default);
}

public sealed class FiscalReportResult
{
    public required bool Ok { get; init; }
    public required string Tipo { get; init; }
    public int? ComunicazioneId { get; init; }
    public string? FileName { get; init; }
    public string? Sha256 { get; init; }
    public int XmlBytes { get; init; }
    public string? RiepilogoJson { get; init; }
    public required string Message { get; init; }
}
