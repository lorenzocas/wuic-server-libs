using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace FatturazioneElettronica.Services.Sdi;

/// <summary>
/// Orchestratore della pipeline di invio SDI. Esegue in ordine:
/// <list type="number">
///   <item>Validazione XSD del payload XML (FatturaPA v1.2)</item>
///   <item>Firma CADES-BES (CMS PKCS#7) → file <c>.xml.p7m</c></item>
///   <item>Trasmissione al provider configurato</item>
/// </list>
/// Ogni step puo' fallire con motivazione tipizzata; il caller (controller)
/// decide se aggiornare il DB con l'esito (markAsSent) o ritornare errore.
/// </summary>
public sealed class SdiSubmissionPipeline
{
    private readonly IXsdValidator _validator;
    private readonly ISdiSigner _signer;
    private readonly ISdiProvider _provider;
    private readonly ILogger<SdiSubmissionPipeline> _logger;

    public SdiSubmissionPipeline(
        IXsdValidator validator,
        ISdiSigner signer,
        ISdiProvider provider,
        ILogger<SdiSubmissionPipeline> logger)
    {
        _validator = validator;
        _signer = signer;
        _provider = provider;
        _logger = logger;
    }

    public async Task<SdiPipelineResult> RunAsync(string xmlPayload, string fileName, CancellationToken ct = default)
    {
        // STEP 1: validazione XSD
        var xsd = _validator.Validate(xmlPayload);
        if (!xsd.IsValid)
        {
            _logger.LogWarning("SdiSubmissionPipeline: XSD validation failed ({ErrorCount} errors). First: {First}",
                xsd.Errors.Count, xsd.Errors.FirstOrDefault()?.Message);
            return new SdiPipelineResult
            {
                Stage = SdiPipelineStage.XsdValidation,
                Ok = false,
                Message = "Validazione XSD FatturaPA fallita: " +
                          string.Join("; ", xsd.Errors.Take(5).Select(e => $"line {e.LineNumber}: {e.Message}")),
                XsdErrors = xsd.Errors,
                XsdWarnings = xsd.Warnings,
                ProviderName = _provider.Name
            };
        }

        // STEP 2: firma CADES-BES
        byte[] signed;
        if (!_signer.IsConfigured)
        {
            // Signer non configurato: pipeline funziona MA solo con provider Mock
            // (production: signer obbligatorio per FPR12).
            if (_provider.Name != "Mock")
            {
                return new SdiPipelineResult
                {
                    Stage = SdiPipelineStage.Signing,
                    Ok = false,
                    Message = "Firma CADES-BES non configurata: settare Sdi:Signer:Pkcs12Path/Password " +
                              "in appsettings.json. Provider " + _provider.Name + " richiede payload firmato.",
                    ProviderName = _provider.Name
                };
            }
            // Con provider Mock, ammesso passare l'XML non-firmato (per dev/test).
            _logger.LogWarning("SdiSubmissionPipeline: signer non configurato, provider=Mock → skip firma (DEV ONLY)");
            signed = System.Text.Encoding.UTF8.GetBytes(xmlPayload);
            // file estensione .xml (non .xml.p7m) per chiarire che NON e' firmato
            fileName = Path.ChangeExtension(fileName, ".xml");
        }
        else
        {
            try
            {
                signed = _signer.SignCadesBes(xmlPayload);
                // Convenzione SDI: file firmato ha estensione `.xml.p7m`
                if (!fileName.EndsWith(".xml.p7m", StringComparison.OrdinalIgnoreCase))
                    fileName = fileName.EndsWith(".xml", StringComparison.OrdinalIgnoreCase)
                             ? fileName + ".p7m"
                             : fileName + ".xml.p7m";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "SdiSubmissionPipeline: signing failed");
                return new SdiPipelineResult
                {
                    Stage = SdiPipelineStage.Signing,
                    Ok = false,
                    Message = "Firma CADES-BES fallita: " + ex.Message,
                    ProviderName = _provider.Name
                };
            }
        }

        // STEP 3: trasmissione provider
        try
        {
            var sub = await _provider.SubmitAsync(signed, fileName, ct).ConfigureAwait(false);
            return new SdiPipelineResult
            {
                Stage = SdiPipelineStage.Submission,
                Ok = sub.Ok,
                SdiId = sub.SdiId,
                ErrorCode = sub.ErrorCode,
                Message = sub.Message ?? (sub.Ok ? "Trasmesso" : "Trasmissione fallita"),
                ProviderName = sub.ProviderName,
                SignedFileName = fileName,
                SignedBytes = signed.Length
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SdiSubmissionPipeline: provider {Provider} threw", _provider.Name);
            return new SdiPipelineResult
            {
                Stage = SdiPipelineStage.Submission,
                Ok = false,
                Message = $"Provider {_provider.Name} ha lanciato eccezione: " + ex.Message,
                ProviderName = _provider.Name
            };
        }
    }
}

public enum SdiPipelineStage
{
    XsdValidation,
    Signing,
    Submission
}

public sealed class SdiPipelineResult
{
    public required SdiPipelineStage Stage { get; init; }
    public required bool Ok { get; init; }
    public string? SdiId { get; init; }
    public string? ErrorCode { get; init; }
    public required string Message { get; init; }
    public required string ProviderName { get; init; }
    public string? SignedFileName { get; init; }
    public int SignedBytes { get; init; }
    public IReadOnlyList<XsdValidationIssue>? XsdErrors { get; init; }
    public IReadOnlyList<XsdValidationIssue>? XsdWarnings { get; init; }
}
