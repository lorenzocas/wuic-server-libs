using System.Collections.Generic;

namespace FatturazioneElettronica.Services.Sdi;

/// <summary>
/// Validatore XSD per FatturaPA. Verifica che un payload XML sia conforme
/// allo schema FatturaPA v1.2 (Schema_VFPR12.xsd) prima dell'invio al SDI.
/// SDI rigetta payload non conformi con codice errore 00200 ("File non
/// conforme al formato"), quindi e' essenziale validare lato client.
/// </summary>
public interface IXsdValidator
{
    /// <summary>
    /// Valida l'XML contro lo schema FatturaPA v1.2.
    /// </summary>
    /// <param name="xml">payload XML da validare (UTF-8 encoded string).</param>
    /// <returns>
    /// <see cref="XsdValidationResult"/> con <c>IsValid=true</c> se conforme,
    /// altrimenti lista di errori XSD (line/column/message) per diagnostica.
    /// </returns>
    XsdValidationResult Validate(string xml);
}

/// <summary>Esito validazione XSD.</summary>
public sealed class XsdValidationResult
{
    public bool IsValid { get; init; }
    public IReadOnlyList<XsdValidationIssue> Errors { get; init; } = [];
    public IReadOnlyList<XsdValidationIssue> Warnings { get; init; } = [];

    public static XsdValidationResult Ok() => new() { IsValid = true };
    public static XsdValidationResult Failed(IReadOnlyList<XsdValidationIssue> errors) =>
        new() { IsValid = false, Errors = errors };
}

/// <summary>Singolo errore/warning emerso durante la validazione XSD.</summary>
public sealed record XsdValidationIssue(
    string Severity,        // "Error" | "Warning"
    int LineNumber,
    int LinePosition,
    string Message,
    string? SourceUri = null);
