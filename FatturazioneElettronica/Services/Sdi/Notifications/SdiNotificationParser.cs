using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;

namespace FatturazioneElettronica.Services.Sdi.Notifications;

/// <summary>
/// Parser implementation usando System.Xml.Linq (LINQ to XML). Riconosce
/// le 6 root degli XML di notifica SDI:
/// <c>RicevutaConsegna</c>, <c>NotificaMancataConsegna</c>,
/// <c>NotificaScarto</c>, <c>NotificaEsito</c>, <c>AttestazioneTrasmissioneFattura</c>,
/// <c>NotificaDecorrenzaTermini</c>.
/// </summary>
public sealed class SdiNotificationParser : ISdiNotificationParser
{
    private readonly ILogger<SdiNotificationParser> _logger;
    public SdiNotificationParser(ILogger<SdiNotificationParser> logger) => _logger = logger;

    public SdiNotification? Parse(string xml, string? fileName)
    {
        if (string.IsNullOrWhiteSpace(xml)) return null;

        // Tipo notifica dal filename (priorita') OR dal root element name.
        string? typeFromFileName = ExtractTypeFromFileName(fileName);
        XDocument doc;
        try
        {
            doc = XDocument.Parse(xml);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("SdiNotificationParser: XML malformato: {Msg}", ex.Message);
            return null;
        }

        string typeFromRoot = MapRootToType(doc.Root?.Name.LocalName);
        string ntype = typeFromFileName ?? typeFromRoot;

        if (string.IsNullOrEmpty(ntype))
        {
            _logger.LogDebug("SdiNotificationParser: tipo notifica non riconosciuto (root={Root}, file={File})",
                doc.Root?.Name.LocalName, fileName);
            return null;
        }

        // Field extraction tollerante al namespace (fatturapa usa prefisso `ns3:` o `p:` o nessuno).
        // LINQ to XML cerca per LocalName ignorando prefisso.
        string? GetText(string localName) =>
            doc.Descendants().FirstOrDefault(e => e.Name.LocalName == localName)?.Value?.Trim();

        return new SdiNotification(
            NotificationType:    ntype,
            IdentificativoSdi:   GetText("IdentificativoSdI"),
            NomeFile:            GetText("NomeFile"),
            MessageId:           GetText("MessageId"),  // alcune notifiche includono Message-ID di trasmissione originale
            Esito:               GetText("Esito"),       // NE only: EC01/EC02
            CodiceErrore:        GetText("Codice"),      // NS: codice scarto
            DescrizioneErrore:   GetText("Descrizione"), // NS: human-readable
            DataRicezione:       GetText("DataOraRicezione") ?? GetText("DataOraConsegna"),
            RawXml:              xml
        );
    }

    /// <summary>
    /// Estrae il tipo notifica dal filename SDI, formato:
    /// <c>ITcccccccccc_pppppp_TIPO_nnn.xml</c> dove <c>TIPO</c> e' uno tra
    /// RC|MC|NS|NE|AT|DT (vedi spec FatturaPA).
    /// </summary>
    private static string? ExtractTypeFromFileName(string? fileName)
    {
        if (string.IsNullOrEmpty(fileName)) return null;
        // Strip percorso e estensione, poi match sul pattern _XX_
        string name = Path.GetFileNameWithoutExtension(fileName);
        var m = Regex.Match(name, @"_(RC|MC|NS|NE|AT|DT)_", RegexOptions.IgnoreCase);
        return m.Success ? m.Groups[1].Value.ToUpperInvariant() : null;
    }

    /// <summary>Mappa root XML element del messaggio SDI → tipo notifica 2-char.</summary>
    private static string MapRootToType(string? rootName) => (rootName ?? string.Empty) switch
    {
        "RicevutaConsegna"               => "RC",
        "NotificaMancataConsegna"        => "MC",
        "NotificaScarto"                 => "NS",
        "NotificaEsito"                  => "NE",
        "AttestazioneTrasmissioneFattura"=> "AT",
        "NotificaDecorrenzaTermini"      => "DT",
        _                                => string.Empty
    };
}
