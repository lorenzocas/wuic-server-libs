using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FatturazioneElettronica.Services.Sdi.Notifications;

/// <summary>
/// Poller delle notifiche SDI via SOAP web-service Aruba (operazione
/// <c>getNotifications</c>). Auth con WSSE UsernameToken (stesso pattern di
/// <see cref="ArubaPecSdiProvider"/>). Restituisce un envelope SOAP che
/// contiene 0..N notifiche, ciascuna con XML AT/RC/NS/MC/NE/DT in chiaro
/// oppure base64 wrappato.
///
/// **Cursor**: usa <c>SdiCursorRepository</c> per persistere il
/// <c>lastReceivedId</c> tra cicli (riduce roundtrip / evita rate limit
/// breach). Il provider Aruba accetta un parametro <c>fromId</c> opzionale:
/// se valorizzato, restituisce solo notifiche con id > fromId.
///
/// **Disclaimer**: il dettaglio del payload SOAP varia con le versioni
/// dell'API Aruba. Il parser sotto cerca elementi con name che contiene
/// <c>notification</c> e dentro un nodo XML dello SDI. Verificare contro
/// la documentazione corrente prima di portare in produzione.
/// </summary>
public sealed class ArubaPecNotificationPoller : ISdiNotificationPoller
{
    private readonly ArubaPecOptions _opts;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<ArubaPecNotificationPoller> _logger;
    private readonly SdiCursorRepository _cursors;

    public ArubaPecNotificationPoller(
        IOptions<ArubaPecOptions> opts,
        IHttpClientFactory httpFactory,
        ILogger<ArubaPecNotificationPoller> logger,
        SdiCursorRepository cursors)
    {
        _opts = opts.Value;
        _httpFactory = httpFactory;
        _logger = logger;
        _cursors = cursors;
    }

    public string Name => "ArubaPec";
    public bool IsConfigured => SdiConfigHelper.IsSet(_opts.Username)
                            && SdiConfigHelper.IsSet(_opts.Password)
                            && SdiConfigHelper.IsSet(_opts.NotificationsEndpoint);

    public async Task<IReadOnlyList<RawSdiNotification>> PollAsync(CancellationToken ct = default)
    {
        if (!IsConfigured)
        {
            _logger.LogDebug("ArubaPecNotificationPoller: not configured, skip");
            return Array.Empty<RawSdiNotification>();
        }

        var cursor = await _cursors.ReadAsync(Name, ct).ConfigureAwait(false);
        string? fromId = cursor.LastReceivedId;
        var results = new List<RawSdiNotification>();
        string? newLastId = fromId;
        string status = "OK";
        string? message = null;

        try
        {
            string envelope =
                "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:web=\"http://www.aruba.it/services/notifications\">" +
                "<soapenv:Header>" +
                "<wsse:Security xmlns:wsse=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd\">" +
                "<wsse:UsernameToken>" +
                $"<wsse:Username>{Escape(_opts.Username)}</wsse:Username>" +
                $"<wsse:Password Type=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText\">{Escape(_opts.Password)}</wsse:Password>" +
                "</wsse:UsernameToken>" +
                "</wsse:Security>" +
                "</soapenv:Header>" +
                "<soapenv:Body>" +
                "<web:getNotifications>" +
                (string.IsNullOrEmpty(fromId) ? "" : $"<fromId>{Escape(fromId)}</fromId>") +
                $"<maxResults>{_opts.NotificationsMaxPerCycle}</maxResults>" +
                "</web:getNotifications>" +
                "</soapenv:Body>" +
                "</soapenv:Envelope>";

            using var req = new HttpRequestMessage(HttpMethod.Post, _opts.NotificationsEndpoint)
            {
                Content = new StringContent(envelope, Encoding.UTF8, "text/xml")
            };
            req.Headers.Add("SOAPAction", _opts.NotificationsSoapAction);

            var http = _httpFactory.CreateClient("ArubaPecSdi");
            using var resp = await http.SendAsync(req, ct).ConfigureAwait(false);
            string body = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);

            if (!resp.IsSuccessStatusCode)
            {
                status = "FAIL";
                message = $"HTTP {(int)resp.StatusCode}: {Truncate(body, 400)}";
                _logger.LogWarning("ArubaPec poll: {Msg}", message);
                return results;
            }

            // Parse SOAP envelope. Cerca tutti gli elementi <notification> (qualunque ns).
            // Per ognuno: <id>, <fileName>, <xml> (XML chiaro o base64 di un .zip).
            var doc = XDocument.Parse(body, LoadOptions.PreserveWhitespace);
            foreach (var notif in doc.Descendants().Where(e =>
                string.Equals(e.Name.LocalName, "notification", StringComparison.OrdinalIgnoreCase)))
            {
                ct.ThrowIfCancellationRequested();
                string? id = ChildText(notif, "id") ?? ChildText(notif, "notificationId");
                string? fileName = ChildText(notif, "fileName") ?? ChildText(notif, "filename");
                string? raw = ChildText(notif, "xml") ?? ChildText(notif, "payload") ?? ChildText(notif, "content");
                if (string.IsNullOrEmpty(raw)) continue;

                // Heuristica: se sembra base64 di un .zip, decomprimi; altrimenti XML chiaro.
                foreach (var (xml, fn) in DecodePayload(raw, fileName))
                {
                    results.Add(new RawSdiNotification(xml, fn, id, "ArubaPec"));
                }

                if (!string.IsNullOrEmpty(id) &&
                    (newLastId is null || string.CompareOrdinal(id, newLastId) > 0))
                {
                    newLastId = id;
                }
            }

            if (results.Count == 0) status = "EMPTY";
            _logger.LogInformation("ArubaPec poll: {Count} notifiche scaricate (lastId={LastId})",
                results.Count, newLastId);
        }
        catch (Exception ex)
        {
            status = "FAIL";
            message = ex.Message;
            _logger.LogError(ex, "ArubaPecNotificationPoller: ciclo fallito");
        }

        await _cursors.UpsertAsync(Name, newLastId, metadataJson: null, status, message,
            results.Count, ct).ConfigureAwait(false);

        return results;
    }

    private static IEnumerable<(string Xml, string? FileName)> DecodePayload(string raw, string? hintFileName)
    {
        string trimmed = raw.Trim();

        // 1) Stringa che inizia con '<' → XML in chiaro
        if (trimmed.StartsWith("<", StringComparison.Ordinal))
        {
            yield return (trimmed, hintFileName);
            yield break;
        }

        // 2) Tenta base64 → potrebbe essere un .zip o un XML
        byte[] bytes;
        try { bytes = Convert.FromBase64String(trimmed); }
        catch { yield break; }

        // 2a) Heuristic: zip header "PK\3\4"
        if (bytes.Length >= 4 && bytes[0] == 0x50 && bytes[1] == 0x4B && bytes[2] == 0x03 && bytes[3] == 0x04)
        {
            using var ms = new MemoryStream(bytes);
            using var zip = new ZipArchive(ms, ZipArchiveMode.Read);
            foreach (var entry in zip.Entries)
            {
                if (!entry.Name.EndsWith(".xml", StringComparison.OrdinalIgnoreCase)) continue;
                using var es = entry.Open();
                using var sr = new StreamReader(es, Encoding.UTF8);
                yield return (sr.ReadToEnd(), entry.Name);
            }
            yield break;
        }

        // 2b) altrimenti XML in UTF-8
        yield return (Encoding.UTF8.GetString(bytes), hintFileName);
    }

    private static string? ChildText(XElement parent, string localName)
    {
        var c = parent.Descendants().FirstOrDefault(e =>
            string.Equals(e.Name.LocalName, localName, StringComparison.OrdinalIgnoreCase));
        return c?.Value;
    }

    private static string Escape(string v) =>
        new XText(v).ToString(SaveOptions.DisableFormatting);

    private static string Truncate(string s, int max) =>
        string.IsNullOrEmpty(s) || s.Length <= max ? s : s.Substring(0, max - 1) + "…";
}

