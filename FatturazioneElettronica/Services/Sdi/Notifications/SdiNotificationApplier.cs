using System;
using System.Collections.Generic;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Data;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using WuicCore.Services.Notifications;

namespace FatturazioneElettronica.Services.Sdi.Notifications;

/// <summary>
/// Applier delle notifiche SDI al DB. Per ogni notifica RAW:
/// <list type="number">
///   <item>Parse via <see cref="ISdiNotificationParser"/></item>
///   <item>INSERT in <c>sdi_notifications</c> (audit trail immutabile)</item>
///   <item>Match con <c>fatture_inviate</c> via <c>IdentificativoSdI</c> /
///   <c>NomeFile</c> / <c>MessageId</c></item>
///   <item>UPDATE <c>fatture_inviate.stato_sdi</c> + <c>sdi_messaggio</c>
///   secondo la mappatura in <see cref="SdiStatusMapper"/></item>
///   <item>**Enqueue notifica per la <c>notification-bell</c> framework**
///   via <see cref="INotificationRepository.EnqueueAsync"/> → stored
///   <c>dbo.sp_enqueue_notification</c> (DB metadati). Destinatario:
///   <c>fatture_inviate.utente_creazione</c> (cioe' chi ha creato/inviato
///   la fattura). Push real-time via <c>NotificationPushService</c> WS.</item>
/// </list>
/// Idempotency: se la notifica e' gia' presente (stesso pec_message_id +
/// notification_type + nome_file), skip dell'insert.
/// </summary>
public sealed class SdiNotificationApplier
{
    private readonly ISdiNotificationParser _parser;
    private readonly ILogger<SdiNotificationApplier> _logger;
    private readonly INotificationRepository _notifyRepo;

    public SdiNotificationApplier(
        ISdiNotificationParser parser,
        ILogger<SdiNotificationApplier> logger,
        INotificationRepository notifyRepo)
    {
        _parser = parser;
        _logger = logger;
        _notifyRepo = notifyRepo;
    }

    private static string DataConn =>
        ConfigurationManager.ConnectionStrings["DataSQLConnection"]?.ConnectionString
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    /// <summary>
    /// Applica una lista di notifiche raw. Restituisce conteggi per audit/log.
    /// </summary>
    public async Task<ApplyResult> ApplyAsync(IReadOnlyList<RawSdiNotification> raws, CancellationToken ct = default)
    {
        int parsed = 0, persisted = 0, applied = 0, skippedDup = 0, errors = 0;

        using var cn = new SqlConnection(DataConn);
        await cn.OpenAsync(ct).ConfigureAwait(false);

        foreach (var raw in raws)
        {
            ct.ThrowIfCancellationRequested();
            var notif = _parser.Parse(raw.Xml, raw.FileName);
            if (notif is null)
            {
                errors++;
                _logger.LogWarning("SdiNotificationApplier: notifica non parsabile (file={File}, pecMsgId={MsgId})",
                    raw.FileName, raw.PecMessageId);
                continue;
            }
            parsed++;

            // Dedup: stesso pec_message_id + nome_file + tipo gia' presente?
            //
            // **NB sulla scelta del campo `@fn`** (verificato 2026-05-09 da test
            // e2e 56): il dedup deve confrontare contro lo stesso valore che
            // l'INSERT scrive nella colonna `nome_file`, cioe' `notif.NomeFile`
            // (campo parsato dall'XML <NomeFile>) — NON `raw.FileName` (filename
            // dell'attachment email/zip), che e' un nome diverso. Esempio:
            //   raw.FileName     = "IT01234567890_RC_00001.xml"
            //   notif.NomeFile   = "IT01234567890_00001.xml.p7m"
            // Usare `raw.FileName` qui falliva il dedup anche per re-scan identici
            // della stessa email PEC.
            using (var dedup = new SqlCommand(@"
SELECT TOP 1 id FROM dbo.sdi_notifications
WHERE notification_type = @t
  AND ((@msg IS NULL AND ricevuta_pec_id IS NULL) OR ricevuta_pec_id = @msg)
  AND ((@fn IS NULL  AND nome_file IS NULL)       OR nome_file = @fn)
", cn))
            {
                dedup.Parameters.AddWithValue("@t",  notif.NotificationType);
                dedup.Parameters.AddWithValue("@msg",(object?)raw.PecMessageId ?? DBNull.Value);
                dedup.Parameters.AddWithValue("@fn", (object?)notif.NomeFile ?? DBNull.Value);
                var dup = await dedup.ExecuteScalarAsync(ct).ConfigureAwait(false);
                if (dup != null && dup != DBNull.Value)
                {
                    skippedDup++;
                    continue;
                }
            }

            // INSERT notifica nell'audit trail
            int notifId;
            using (var ins = new SqlCommand(@"
INSERT INTO dbo.sdi_notifications
  (sdi_identificativo, message_id, notification_type, nome_file, ricevuta_xml, ricevuta_pec_id, provider_source)
OUTPUT INSERTED.id
VALUES (@idsdi, @msg, @type, @file, @xml, @pecid, @prov)
", cn))
            {
                ins.Parameters.AddWithValue("@idsdi", (object?)notif.IdentificativoSdi ?? DBNull.Value);
                ins.Parameters.AddWithValue("@msg",   (object?)notif.MessageId         ?? DBNull.Value);
                ins.Parameters.AddWithValue("@type",  notif.NotificationType);
                ins.Parameters.AddWithValue("@file",  (object?)notif.NomeFile           ?? DBNull.Value);
                ins.Parameters.AddWithValue("@xml",   (object?)notif.RawXml             ?? DBNull.Value);
                ins.Parameters.AddWithValue("@pecid", (object?)raw.PecMessageId         ?? DBNull.Value);
                ins.Parameters.AddWithValue("@prov",  raw.ProviderSource);
                notifId = (int)(await ins.ExecuteScalarAsync(ct).ConfigureAwait(false))!;
            }
            persisted++;

            // Match → fatture_inviate.id (+ utente_creazione per il targeting
            // della notifica bell). Priorita': sdi_id col, poi nome_file.
            (int? fatturaId, int? fatturaOwnerUserId, string? fatturaNumero) =
                await ResolveFatturaInfoAsync(cn, notif, ct).ConfigureAwait(false);
            string? newStato = SdiStatusMapper.MapToStatoSdi(notif);

            if (fatturaId.HasValue && newStato is not null)
            {
                using (var upd = new SqlCommand(@"
UPDATE dbo.fatture_inviate
SET stato_sdi      = @stato,
    sdi_messaggio  = ISNULL(sdi_messaggio + char(10), '') + @msg,
    data_modifica  = GETDATE()
WHERE id = @id
", cn))
                {
                    upd.Parameters.AddWithValue("@stato", newStato);
                    upd.Parameters.AddWithValue("@msg",
                        $"[{notif.NotificationType} {DateTime.UtcNow:yyyy-MM-ddTHH:mm:ss}Z] " +
                        (notif.DescrizioneErrore ?? notif.Esito ?? notif.NotificationType));
                    upd.Parameters.AddWithValue("@id", fatturaId.Value);
                    await upd.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
                }

                using (var mark = new SqlCommand(@"
UPDATE dbo.sdi_notifications
SET applied_to_fattura = 1, applied_at = SYSUTCDATETIME(), fattura_id = @fid
WHERE id = @nid
", cn))
                {
                    mark.Parameters.AddWithValue("@fid", fatturaId.Value);
                    mark.Parameters.AddWithValue("@nid", notifId);
                    await mark.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
                }
                applied++;

                // Push notifica utente via framework `notification-bell`.
                // Best-effort: errori del repo notifiche NON devono bloccare
                // il flusso principale di apply (la notifica SDI e' gia'
                // persistita, l'aggiornamento stato e' gia' applicato).
                await EnqueueBellNotificationAsync(
                    fatturaOwnerUserId, fatturaId.Value, fatturaNumero, newStato, notif, ct)
                    .ConfigureAwait(false);
            }
            else
            {
                using var markErr = new SqlCommand(@"
UPDATE dbo.sdi_notifications
SET applied_error = @err
WHERE id = @nid
", cn);
                markErr.Parameters.AddWithValue("@err",
                    fatturaId is null
                      ? "Fattura non trovata via IdentificativoSdI/NomeFile/MessageId"
                      : $"NotificationType {notif.NotificationType} non aggiorna stato_sdi (info-only)");
                markErr.Parameters.AddWithValue("@nid", notifId);
                await markErr.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
            }
        }

        return new ApplyResult(parsed, persisted, applied, skippedDup, errors);
    }

    /// <summary>
    /// Enqueue di una notifica utente via <c>sp_enqueue_notification</c>
    /// (DB metadati). Il destinatario e' il creatore della fattura
    /// (<c>fatture_inviate.utente_creazione</c>); in assenza di
    /// utente_creazione (legacy o import) la notifica e' silenziata
    /// (logged, non escalated ad admin) per non spammare.
    /// targetJson convention: <c>{"path":"/&lt;route&gt;/edit/&lt;id&gt;"}</c>
    /// (vedi <see cref="WuicCore.Services.Notifications"/> in
    /// <c>RagController.SendNotification</c> per il pattern).
    /// </summary>
    private async Task EnqueueBellNotificationAsync(
        int? ownerUserId, int fatturaId, string? fatturaNumero, string newStato,
        SdiNotification notif, CancellationToken ct)
    {
        if (ownerUserId is null || ownerUserId <= 0)
        {
            _logger.LogDebug(
                "Sdi bell notification skipped: fatture_inviate.utente_creazione mancante per fatturaId={FatturaId}",
                fatturaId);
            return;
        }

        try
        {
            string title = MapStatoToTitle(newStato);
            string detail = !string.IsNullOrWhiteSpace(notif.DescrizioneErrore)
                ? notif.DescrizioneErrore!
                : (!string.IsNullOrWhiteSpace(notif.Esito) ? notif.Esito! : notif.NotificationType);
            string fnLabel = !string.IsNullOrWhiteSpace(fatturaNumero)
                ? $"Fattura {fatturaNumero}"
                : $"Fattura #{fatturaId}";
            string message = $"{title} — {fnLabel}: {Truncate(detail, 120)}";

            string targetJson = BuildJson(w =>
            {
                w.WriteString("path", $"/fatture_inviate/edit/{fatturaId}");
            });

            string payloadJson = BuildJson(w =>
            {
                w.WriteNumber("fatturaId", fatturaId);
                if (!string.IsNullOrWhiteSpace(fatturaNumero))
                    w.WriteString("fatturaNumero", fatturaNumero);
                w.WriteString("statoSdi", newStato);
                w.WriteString("notificationType", notif.NotificationType);
                if (!string.IsNullOrWhiteSpace(notif.IdentificativoSdi))
                    w.WriteString("identificativoSdi", notif.IdentificativoSdi);
                if (!string.IsNullOrWhiteSpace(notif.Esito))
                    w.WriteString("esito", notif.Esito);
                if (!string.IsNullOrWhiteSpace(notif.DescrizioneErrore))
                    w.WriteString("descrizioneErrore", notif.DescrizioneErrore);
            });

            // type = "sdi.<NotificationType>" cosi' il client puo' filtrare/icona.
            string type = $"sdi.{notif.NotificationType.ToLowerInvariant()}";

            int notifId = await _notifyRepo.EnqueueAsync(new EnqueueNotificationRequest
            {
                userId      = ownerUserId.Value,
                type        = type,
                message     = message,
                targetJson  = targetJson,
                payloadJson = payloadJson,
                source      = "SdiNotificationApplier",
                createdBy   = "system"
            }, ct).ConfigureAwait(false);

            _logger.LogInformation(
                "Sdi bell notification enqueued: id={NotifId} userId={UserId} type={Type} fatturaId={FatturaId}",
                notifId, ownerUserId, type, fatturaId);
        }
        catch (Exception ex)
        {
            // Best-effort: NON propagare l'eccezione, l'apply principale
            // e' gia' andato a buon fine.
            _logger.LogWarning(ex,
                "Sdi bell notification enqueue failed (best-effort, ignored). userId={UserId} fatturaId={FatturaId}",
                ownerUserId, fatturaId);
        }
    }

    private static string MapStatoToTitle(string newStato) =>
        // Le costanti corrispondono ai valori restituiti da SdiStatusMapper
        // (uppercase + underscore — vedi ISdiNotificationParser.cs).
        (newStato ?? string.Empty).ToUpperInvariant() switch
        {
            "CONSEGNATA"          => "Fattura consegnata",
            "MANCATA_CONSEGNA"    => "Mancata consegna",
            "SCARTATA"            => "Fattura scartata da SDI",
            "RIFIUTATA"           => "Fattura rifiutata da destinatario",
            "ACCETTATA"           => "Fattura accettata",
            "DECORRENZA_TERMINI"  => "Decorrenza termini",
            _                     => $"Aggiornamento stato SDI ({newStato})"
        };

    private static string Truncate(string s, int max) =>
        string.IsNullOrEmpty(s) || s.Length <= max ? s : s.Substring(0, max - 1) + "…";

    private static string BuildJson(Action<Utf8JsonWriter> write)
    {
        // Stesso pattern usato in RagController.SendNotification per evitare
        // di passare anonymous types al serializer (parameter names strippati
        // da Obfuscar/ILLink in build release → NotSupportedException).
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            write(writer);
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    /// <summary>
    /// Risolve la fattura associata a una notifica SDI e restituisce in
    /// un'unica roundtrip <c>id</c>, <c>utente_creazione</c> e <c>numero</c>
    /// per il targeting della notifica bell. Strategie in cascata (stessa
    /// priorita' della precedente <c>ResolveFatturaIdAsync</c>):
    /// IdentificativoSdI → progressivo da NomeFile → MessageId.
    /// </summary>
    private static async Task<(int? FatturaId, int? OwnerUserId, string? Numero)>
        ResolveFatturaInfoAsync(SqlConnection cn, SdiNotification notif, CancellationToken ct)
    {
        const string selectCols = "id, utente_creazione, CAST(numero AS NVARCHAR(64)) AS numero";

        // Priorita' 1: IdentificativoSdI matcha fatture_inviate.sdi_id
        if (!string.IsNullOrEmpty(notif.IdentificativoSdi))
        {
            var hit = await TryRead(cn, ct,
                $"SELECT TOP 1 {selectCols} FROM dbo.fatture_inviate WHERE sdi_id = @s ORDER BY id DESC",
                ("@s", notif.IdentificativoSdi)).ConfigureAwait(false);
            if (hit.HasValue) return hit.Value;
        }

        // Priorita' 2: NomeFile (es. ITxxx_00001.xml) -> match su progressivo
        if (!string.IsNullOrEmpty(notif.NomeFile))
        {
            var m = System.Text.RegularExpressions.Regex.Match(
                notif.NomeFile, @"_(?<prog>\d+)\.xml", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (m.Success && int.TryParse(m.Groups["prog"].Value, out int prog))
            {
                var hit = await TryRead(cn, ct,
                    $"SELECT TOP 1 {selectCols} FROM dbo.fatture_inviate WHERE progressivo = @p ORDER BY id DESC",
                    ("@p", prog)).ConfigureAwait(false);
                if (hit.HasValue) return hit.Value;
            }
        }

        // Priorita' 3: MessageId (raro)
        if (!string.IsNullOrEmpty(notif.MessageId))
        {
            var hit = await TryRead(cn, ct,
                $"SELECT TOP 1 {selectCols} FROM dbo.fatture_inviate WHERE sdi_id = @s ORDER BY id DESC",
                ("@s", notif.MessageId)).ConfigureAwait(false);
            if (hit.HasValue) return hit.Value;
        }

        return (null, null, null);
    }

    private static async Task<(int FatturaId, int? OwnerUserId, string? Numero)?> TryRead(
        SqlConnection cn, CancellationToken ct, string sql, params (string Name, object Value)[] parms)
    {
        using var cmd = new SqlCommand(sql, cn);
        foreach (var (n, v) in parms) cmd.Parameters.AddWithValue(n, v);
        using var rdr = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
        if (!await rdr.ReadAsync(ct).ConfigureAwait(false)) return null;
        int id      = rdr.GetInt32(0);
        int? owner  = rdr.IsDBNull(1) ? (int?)null : rdr.GetInt32(1);
        string? num = rdr.IsDBNull(2) ? null      : rdr.GetString(2);
        return (id, owner, num);
    }

    public sealed record ApplyResult(int Parsed, int Persisted, int Applied, int SkippedDuplicates, int Errors);
}
