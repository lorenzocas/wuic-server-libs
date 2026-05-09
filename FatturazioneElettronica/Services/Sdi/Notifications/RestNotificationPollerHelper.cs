using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace FatturazioneElettronica.Services.Sdi.Notifications;

/// <summary>
/// Helper condiviso dai 3 poller REST commerciali (FatturePec, PecIt,
/// Notarify): chiama l'endpoint, si aspetta un JSON con shape:
/// <code>
/// {
///   "items": [
///     { "id": "...", "fileName": "...", "xml": "&lt;XML_chiaro&gt;" },
///     { "id": "...", "fileName": "...", "xmlBase64": "...." },  // alternativa
///     ...
///   ],
///   "nextCursor": "..."
/// }
/// </code>
/// Tollerante a vari naming alternativi: <c>notifications</c>/<c>data</c> per
/// il wrapper array, <c>id</c>/<c>notificationId</c>, <c>xml</c>/<c>payload</c>/
/// <c>content</c>, <c>xmlBase64</c>/<c>payloadBase64</c>.
///
/// Cursor: legge <c>nextCursor</c> o <c>lastId</c> dal JSON; in fallback usa
/// l'<c>id</c> piu' recente fra gli item ricevuti.
/// </summary>
public static class RestNotificationPollerHelper
{
    public sealed record PollResponse(
        IReadOnlyList<RawSdiNotification> Items,
        string? NewCursor,
        string Status,
        string? Message);

    public static async Task<PollResponse> PollJsonAsync(
        HttpRequestMessage req,
        HttpClient http,
        string providerName,
        ILogger logger,
        CancellationToken ct)
    {
        var items = new List<RawSdiNotification>();
        string? newCursor = null;
        string status = "OK";
        string? message = null;

        try
        {
            using var resp = await http.SendAsync(req, ct).ConfigureAwait(false);
            string body = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            if (!resp.IsSuccessStatusCode)
            {
                return new PollResponse(items, null, "FAIL",
                    $"HTTP {(int)resp.StatusCode}: {Truncate(body, 400)}");
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            // Estrai array items: prova varie naming convention
            JsonElement arr = default;
            if (TryGetProp(root, "items", out arr) ||
                TryGetProp(root, "notifications", out arr) ||
                TryGetProp(root, "data", out arr))
            { /* arr already set */ }
            else if (root.ValueKind == JsonValueKind.Array)
                arr = root;

            if (arr.ValueKind == JsonValueKind.Array)
            {
                foreach (var el in arr.EnumerateArray())
                {
                    ct.ThrowIfCancellationRequested();
                    string? id = TryGetString(el, "id") ?? TryGetString(el, "notificationId");
                    string? fileName = TryGetString(el, "fileName") ?? TryGetString(el, "filename");

                    string? xml = TryGetString(el, "xml")
                                ?? TryGetString(el, "payload")
                                ?? TryGetString(el, "content");

                    if (string.IsNullOrEmpty(xml))
                    {
                        string? b64 = TryGetString(el, "xmlBase64")
                                   ?? TryGetString(el, "payloadBase64")
                                   ?? TryGetString(el, "contentBase64");
                        if (!string.IsNullOrEmpty(b64))
                        {
                            foreach (var (decoded, fn) in DecodeBase64Payload(b64, fileName))
                                items.Add(new RawSdiNotification(decoded, fn, id, providerName));
                            continue;
                        }
                    }

                    if (!string.IsNullOrEmpty(xml))
                        items.Add(new RawSdiNotification(xml, fileName, id, providerName));
                }
            }

            newCursor = TryGetString(root, "nextCursor") ?? TryGetString(root, "lastId");
            if (string.IsNullOrEmpty(newCursor))
            {
                // fallback: id piu' alto (ordinamento lessicografico — works per ID monotonici numerici stringificati)
                foreach (var it in items)
                    if (!string.IsNullOrEmpty(it.PecMessageId) &&
                        (newCursor is null || string.CompareOrdinal(it.PecMessageId, newCursor) > 0))
                        newCursor = it.PecMessageId;
            }

            if (items.Count == 0) status = "EMPTY";
        }
        catch (Exception ex)
        {
            status = "FAIL";
            message = ex.Message;
            logger.LogError(ex, "{Provider} poll: ciclo REST fallito", providerName);
        }

        return new PollResponse(items, newCursor, status, message);
    }

    private static bool TryGetProp(JsonElement el, string name, out JsonElement value)
    {
        if (el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out value))
            return true;
        value = default;
        return false;
    }

    private static string? TryGetString(JsonElement el, string name)
    {
        if (el.ValueKind != JsonValueKind.Object) return null;
        if (!el.TryGetProperty(name, out var v)) return null;
        return v.ValueKind switch
        {
            JsonValueKind.String => v.GetString(),
            JsonValueKind.Number => v.GetRawText(),
            _ => null
        };
    }

    private static IEnumerable<(string Xml, string? FileName)> DecodeBase64Payload(string b64, string? hintFileName)
    {
        byte[] bytes;
        try { bytes = Convert.FromBase64String(b64.Trim()); }
        catch { yield break; }

        // ZIP magic header "PK\3\4"
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

        // Plain XML (UTF-8)
        yield return (Encoding.UTF8.GetString(bytes), hintFileName);
    }

    private static string Truncate(string s, int max) =>
        string.IsNullOrEmpty(s) || s.Length <= max ? s : s.Substring(0, max - 1) + "…";
}
