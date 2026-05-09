using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MailKit;
using MailKit.Net.Imap;
using MailKit.Search;
using MailKit.Security;
using MimeKit;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FatturazioneElettronica.Services.Sdi.Notifications;

/// <summary>Configurazione poller IMAP (sezione <c>Sdi:NotificationPoller:Imap</c>).</summary>
public sealed class PecImapPollerOptions
{
    public string ImapHost { get; set; } = string.Empty;       // es. imaps.pec.aruba.it
    public int ImapPort { get; set; } = 993;
    public bool EnableSsl { get; set; } = true;
    public string Username { get; set; } = string.Empty;        // PEC mittente (di solito uguale a SmtpUsername DirectPec)
    public string Password { get; set; } = string.Empty;
    public string MailboxName { get; set; } = "INBOX";          // di solito INBOX, alcune PEC usano sotto-cartelle
    /// <summary>Marca le email scaricate come "lette" (\Seen flag) post-poll. Default true.</summary>
    public bool MarkAsRead { get; set; } = true;
    /// <summary>Filtra solo email da `sdi01@pec.fatturapa.it` (default true).</summary>
    public bool OnlyFromSdiAddress { get; set; } = true;
    public string SdiSenderAddress { get; set; } = "sdi01@pec.fatturapa.it";
    /// <summary>Max email per ciclo (rate limit, default 50).</summary>
    public int MaxPerCycle { get; set; } = 50;
}

/// <summary>
/// Poller IMAP delle notifiche SDI sulla casella PEC del mittente.
/// Pattern: SDI risponde alle PEC inviate (via <see cref="DirectPecSdiProvider"/>)
/// con email contenenti gli XML AT/RC/NS/MC/NE/DT come allegato singolo
/// (formato `.xml` o `.zip` con dentro l'XML).
/// </summary>
public sealed class PecImapNotificationPoller : ISdiNotificationPoller
{
    private readonly PecImapPollerOptions _opts;
    private readonly ILogger<PecImapNotificationPoller> _logger;

    public PecImapNotificationPoller(IOptions<PecImapPollerOptions> opts, ILogger<PecImapNotificationPoller> logger)
    {
        _opts = opts.Value;
        _logger = logger;
    }

    public string Name => "PecImap";
    public bool IsConfigured => SdiConfigHelper.IsSet(_opts.ImapHost)
                            && SdiConfigHelper.IsSet(_opts.Username)
                            && SdiConfigHelper.IsSet(_opts.Password);

    public async Task<IReadOnlyList<RawSdiNotification>> PollAsync(CancellationToken ct = default)
    {
        if (!IsConfigured)
        {
            _logger.LogDebug("PecImapNotificationPoller: not configured, skip cycle");
            return Array.Empty<RawSdiNotification>();
        }

        var results = new List<RawSdiNotification>();

        using var client = new ImapClient();
        try
        {
            await client.ConnectAsync(_opts.ImapHost, _opts.ImapPort,
                _opts.EnableSsl ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.None,
                ct).ConfigureAwait(false);
            await client.AuthenticateAsync(_opts.Username, _opts.Password, ct).ConfigureAwait(false);

            var folder = client.Inbox;
            if (!string.Equals(_opts.MailboxName, "INBOX", StringComparison.OrdinalIgnoreCase))
            {
                folder = await client.GetFolderAsync(_opts.MailboxName, ct).ConfigureAwait(false);
            }
            await folder.OpenAsync(FolderAccess.ReadWrite, ct).ConfigureAwait(false);

            // Filtra: messaggi NOT seen (non letti) ricevuti negli ultimi 30 giorni.
            // OPZIONE: filtra per sender = SdiSenderAddress se configurato.
            SearchQuery query = SearchQuery.NotSeen;
            if (DateTime.UtcNow.Year > 2020)
                query = query.And(SearchQuery.DeliveredAfter(DateTime.UtcNow.AddDays(-30)));
            if (_opts.OnlyFromSdiAddress && SdiConfigHelper.IsSet(_opts.SdiSenderAddress))
                query = query.And(SearchQuery.FromContains(_opts.SdiSenderAddress));

            var uids = (await folder.SearchAsync(query, ct).ConfigureAwait(false))
                .Take(Math.Max(1, _opts.MaxPerCycle))
                .ToList();

            _logger.LogInformation("PecImap poll: {Count} messaggi candidati su {Folder}", uids.Count, folder.FullName);

            foreach (var uid in uids)
            {
                ct.ThrowIfCancellationRequested();
                try
                {
                    var msg = await folder.GetMessageAsync(uid, ct).ConfigureAwait(false);
                    var extracted = ExtractNotificationsFromMessage(msg);
                    results.AddRange(extracted);

                    if (_opts.MarkAsRead)
                        await folder.AddFlagsAsync(uid, MessageFlags.Seen, silent: true, ct).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "PecImap: errore processing UID={Uid}", uid);
                    // continua con i successivi - 1 messaggio rotto non blocca il ciclo
                }
            }

            await client.DisconnectAsync(quit: true, ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "PecImapNotificationPoller: ciclo fallito");
        }

        return results;
    }

    /// <summary>
    /// Estrae XML notifiche dalle attachment del MimeMessage.
    /// SDI usa due formati per gli allegati:
    ///   1. <c>.xml</c> direct (singolo XML notifica)
    ///   2. <c>.zip</c> contenente uno o piu' .xml (alcuni provider PEC zippano)
    /// </summary>
    private List<RawSdiNotification> ExtractNotificationsFromMessage(MimeMessage msg)
    {
        var results = new List<RawSdiNotification>();
        string? pecMsgId = msg.MessageId;

        foreach (var attachment in msg.Attachments)
        {
            if (attachment is not MimePart part) continue;
            string fileName = part.FileName ?? string.Empty;

            using var ms = new MemoryStream();
            part.Content.DecodeTo(ms);
            byte[] bytes = ms.ToArray();

            if (fileName.EndsWith(".xml", StringComparison.OrdinalIgnoreCase))
            {
                string xml = System.Text.Encoding.UTF8.GetString(bytes);
                results.Add(new RawSdiNotification(xml, fileName, pecMsgId, "DirectPec"));
            }
            else if (fileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
            {
                using var zipMs = new MemoryStream(bytes);
                using var zip = new ZipArchive(zipMs, ZipArchiveMode.Read);
                foreach (var entry in zip.Entries.Where(e => e.Name.EndsWith(".xml", StringComparison.OrdinalIgnoreCase)))
                {
                    using var entryStream = entry.Open();
                    using var sr = new StreamReader(entryStream, System.Text.Encoding.UTF8);
                    string xml = sr.ReadToEnd();
                    results.Add(new RawSdiNotification(xml, entry.Name, pecMsgId, "DirectPec"));
                }
            }
            // ignora altri formati (.p7m segnalibri info dell'AdE, ecc.)
        }

        return results;
    }
}
