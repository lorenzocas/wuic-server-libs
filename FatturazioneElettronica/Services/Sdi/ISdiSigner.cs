using System;

namespace FatturazioneElettronica.Services.Sdi;

/// <summary>
/// Firma digitale CADES-BES per fatture PA. SDI richiede CADES-BES per
/// FPR12 (fattura tra privati). Output: file <c>.xml.p7m</c> contenente
/// il payload XML originale incapsulato nel CMS SignedData (PKCS#7).
/// </summary>
public interface ISdiSigner
{
    /// <summary>
    /// Restituisce <c>true</c> se il signer e' configurato (certificato
    /// caricato, chiave privata accessibile). Quando <c>false</c>, la
    /// pipeline SDI **deve** rigettare i tentativi di invio con un errore
    /// chiaro all'utente che spiega come configurare le credenziali.
    /// </summary>
    bool IsConfigured { get; }

    /// <summary>
    /// Firma il payload XML producendo CMS SignedData (CADES-BES).
    /// </summary>
    /// <param name="xmlPayload">XML FatturaPA UTF-8 da firmare.</param>
    /// <returns>Bytes del CMS SignedData (.p7m). Da scrivere su disco
    /// con estensione <c>.xml.p7m</c> e inviare al provider SDI.</returns>
    /// <exception cref="InvalidOperationException">se non configurato
    /// (chiave privata non disponibile).</exception>
    byte[] SignCadesBes(string xmlPayload);
}
