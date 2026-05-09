using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Xml;
using System.Xml.Schema;
using Microsoft.Extensions.Logging;

namespace FatturazioneElettronica.Services.Sdi;

/// <summary>
/// Validatore XSD per FatturaPA v1.2.x. Carica `Schema_VFPR12.xsd` +
/// `xmldsig-core-schema.xsd` da <c>Services/Sdi/Schemas/v1.2/</c> in
/// publish output e li applica via <see cref="XmlReader"/> con
/// <see cref="XmlReaderSettings.ValidationType"/>=Schema.
/// </summary>
public sealed class FatturaPaXsdValidator : IXsdValidator
{
    private readonly XmlSchemaSet _schemas;
    private readonly ILogger<FatturaPaXsdValidator> _logger;

    public FatturaPaXsdValidator(ILogger<FatturaPaXsdValidator> logger)
    {
        _logger = logger;
        _schemas = LoadSchemas();
    }

    public XsdValidationResult Validate(string xml)
    {
        if (string.IsNullOrWhiteSpace(xml))
            return XsdValidationResult.Failed([new XsdValidationIssue("Error", 0, 0, "XML payload is empty.")]);

        var errors = new List<XsdValidationIssue>();
        var warnings = new List<XsdValidationIssue>();

        var settings = new XmlReaderSettings
        {
            ValidationType = ValidationType.Schema,
            Schemas = _schemas,
            ValidationFlags =
                XmlSchemaValidationFlags.ProcessSchemaLocation
                | XmlSchemaValidationFlags.ReportValidationWarnings
        };

        settings.ValidationEventHandler += (sender, e) =>
        {
            var bag = e.Severity == XmlSeverityType.Error ? errors : warnings;
            bag.Add(new XsdValidationIssue(
                Severity: e.Severity == XmlSeverityType.Error ? "Error" : "Warning",
                LineNumber: e.Exception?.LineNumber ?? 0,
                LinePosition: e.Exception?.LinePosition ?? 0,
                Message: e.Message ?? string.Empty,
                SourceUri: e.Exception?.SourceUri));
        };

        try
        {
            using var sr = new StringReader(xml);
            using var reader = XmlReader.Create(sr, settings);
            while (reader.Read()) { /* drain */ }
        }
        catch (XmlException ex)
        {
            // XML mal-formato (parser fail prima ancora del schema check)
            errors.Add(new XsdValidationIssue("Error", ex.LineNumber, ex.LinePosition,
                $"XML malformed: {ex.Message}"));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "FatturaPaXsdValidator: unexpected exception");
            errors.Add(new XsdValidationIssue("Error", 0, 0, $"XSD validator crashed: {ex.Message}"));
        }

        return errors.Count == 0
            ? new XsdValidationResult { IsValid = true, Warnings = warnings }
            : new XsdValidationResult { IsValid = false, Errors = errors, Warnings = warnings };
    }

    private XmlSchemaSet LoadSchemas()
    {
        var set = new XmlSchemaSet();
        // Cartella Schemas e' copiata accanto al binary in publish output
        // (vedi <Content Include="Services\Sdi\Schemas\**\*.xsd"> in csproj).
        string baseDir = AppContext.BaseDirectory;
        string schemaDir = Path.Combine(baseDir, "Services", "Sdi", "Schemas", "v1.2");
        string mainXsd = Path.Combine(schemaDir, "Schema_VFPR12.xsd");
        string dsigXsd = Path.Combine(schemaDir, "xmldsig-core-schema.xsd");

        if (!Directory.Exists(schemaDir) || !File.Exists(mainXsd) || !File.Exists(dsigXsd))
        {
            _logger.LogWarning("FatturaPA XSD non trovati in {SchemaDir}. " +
                "Validazione XSD ritornera' sempre 'failed' fino a deploy schemas.", schemaDir);
            return set;
        }

        // L'XSD principale importa xmldsig-core-schema.xsd via schemaLocation
        // relativo (vedi patch in Schema_VFPR12.xsd:8). Il resolver di .NET
        // risolve correttamente l'import quando carichiamo via Add() con il
        // path completo del file principale.
        try
        {
            // dsig PRIMA del main (l'import lo richiede gia' presente)
            using (var fs = File.OpenRead(dsigXsd))
                set.Add("http://www.w3.org/2000/09/xmldsig#", XmlReader.Create(fs));
            using (var fs = File.OpenRead(mainXsd))
                set.Add("http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2",
                        XmlReader.Create(fs));
            set.Compile();
            _logger.LogDebug("FatturaPA XSD schemas loaded successfully from {SchemaDir}", schemaDir);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "FatturaPaXsdValidator: schema load failed");
        }

        return set;
    }
}
