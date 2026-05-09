using System.Collections.Generic;

namespace FatturazioneElettronica.Services.Sdi.Notifications;

/// <summary>
/// Parser delle notifiche XML emesse dal Sistema di Interscambio (SDI)
/// dell'Agenzia delle Entrate dopo l'invio di una fattura. Schema notifiche:
/// <c>https://www.fatturapa.gov.it/export/documenti/messaggi/v1.0/MessaggiTypes_v1.0.xsd</c>.
///
/// Tipi notifica (codice 3-char nel filename: <c>IT&lt;CF&gt;_&lt;progressivo&gt;_&lt;TIPO&gt;_&lt;n&gt;.xml</c>):
/// <list type="bullet">
///   <item><b>RC</b> = Ricevuta di Consegna — fattura recapitata al destinatario</item>
///   <item><b>MC</b> = Mancata Consegna — destinatario irraggiungibile (5 gg)</item>
///   <item><b>NS</b> = Notifica di Scarto — fattura rigettata da SDI (codice errore)</item>
///   <item><b>NE</b> = Notifica Esito (PA only) — committente accetta o rifiuta</item>
///   <item><b>AT</b> = Attestazione Trasmissione — info, dopo MC se decorrenza termini</item>
///   <item><b>DT</b> = Decorrenza Termini — committente PA non ha risposto entro 15gg</item>
/// </list>
/// </summary>
public interface ISdiNotificationParser
{
    /// <summary>
    /// Estrae i dati strutturati da una notifica XML SDI.
    /// </summary>
    /// <param name="xml">payload XML della notifica.</param>
    /// <param name="fileName">nome file (per estrazione tipo dal naming convention SDI).</param>
    /// <returns>Dati notifica strutturati o <c>null</c> se XML non riconosciuto.</returns>
    SdiNotification? Parse(string xml, string? fileName);
}

/// <summary>Notifica SDI parsata.</summary>
public sealed record SdiNotification(
    string NotificationType,         // RC | MC | NS | NE | AT | DT
    string? IdentificativoSdi,       // identificativo univoco assegnato da SDI alla fattura
    string? NomeFile,                // nome file fattura originale (es. ITxxx_00001.xml)
    string? MessageId,               // Message-ID di trasmissione (per match invio DirectPec)
    string? Esito,                   // per NE: 'EC01'=accettata, 'EC02'=rifiutata
    string? CodiceErrore,            // per NS: codice scarto (00200, 00400, ...)
    string? DescrizioneErrore,       // descrizione human-readable
    string? DataRicezione,           // data ricezione SDI
    string RawXml                    // payload originale per audit
);

/// <summary>Mappa NotificationType → nuovo stato_sdi (CASE WHEN logic).</summary>
public static class SdiStatusMapper
{
    /// <summary>
    /// Restituisce il nuovo stato_sdi target per una notifica, o null se la
    /// notifica e' meramente informativa (AT non altera stato).
    /// </summary>
    public static string? MapToStatoSdi(SdiNotification notif)
    {
        return notif.NotificationType switch
        {
            "RC" => "CONSEGNATA",
            "MC" => "MANCATA_CONSEGNA",
            "NS" => "SCARTATA",
            "NE" => notif.Esito switch
            {
                "EC01" => "ACCETTATA",
                "EC02" => "RIFIUTATA",
                _      => null  // esito sconosciuto, non aggiornare
            },
            "DT" => "DECORRENZA_TERMINI",
            "AT" => null,  // attestazione trasmissione - non altera stato_sdi
            _    => null
        };
    }
}
