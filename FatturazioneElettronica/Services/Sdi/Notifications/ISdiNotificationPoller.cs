using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace FatturazioneElettronica.Services.Sdi.Notifications;

/// <summary>
/// Sorgente di notifiche SDI. Implementazioni:
/// <list type="bullet">
///   <item><see cref="PecImapNotificationPoller"/>: legge la casella PEC del
///   mittente via IMAP, scarica le email da <c>sdi01@pec.fatturapa.it</c>,
///   estrae l'attachment XML e lo da' in pasto al parser. Per uso con
///   <see cref="DirectPecSdiProvider"/> (free path).</item>
///   <item><c>ProviderWebhook</c> (out of scope per ora): endpoint REST che
///   riceve le notifiche push dal provider commerciale (Aruba/FatturePec).</item>
/// </list>
/// </summary>
public interface ISdiNotificationPoller
{
    /// <summary>True se il poller e' configurato (credenziali presenti).</summary>
    bool IsConfigured { get; }

    /// <summary>Nome univoco del poller per logging/audit.</summary>
    string Name { get; }

    /// <summary>
    /// Esegue un ciclo di poll. Restituisce le notifiche RAW scaricate
    /// (XML + filename). Non aggiorna il DB: il caller le passa al parser
    /// e poi all'applier.
    /// </summary>
    Task<IReadOnlyList<RawSdiNotification>> PollAsync(CancellationToken ct = default);
}

public sealed record RawSdiNotification(
    string Xml,
    string? FileName,
    string? PecMessageId,        // Message-ID PEC ricevuta (per audit / dedup)
    string ProviderSource         // "DirectPec" | "ArubaPec" | ...
);
