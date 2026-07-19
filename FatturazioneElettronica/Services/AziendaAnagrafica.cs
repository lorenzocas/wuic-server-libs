using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Extensions.Configuration;

namespace FatturazioneElettronica.Services;

/// <summary>
/// Anagrafica fiscale dell'azienda emittente/dichiarante: sorgente UNICA per i dati
/// che finiscono nei documenti XML fiscali/SDI (FatturaPA <c>CedentePrestatore</c>,
/// dichiarante di LIPE/CU/Esterometro). Letta dalla sezione <c>"Azienda"</c> di
/// appsettings tramite <see cref="WEB_UI_CRAFTER.Helpers.ConfigHelper.Configuration"/>.
///
/// Prima di questa classe i generatori usavano placeholder hardcoded
/// (<c>"00000000000"</c>, <c>"FatturazioneElettronica Test SRL"</c>, <c>"Via Esempio 1"</c>):
/// in produzione avrebbero prodotto documenti fiscali con dati fittizi. Ora
/// <see cref="FromConfig"/> valida i dati e lancia <see cref="InvalidOperationException"/>
/// se mancano/sono placeholder, cosi' la generazione fallisce in modo esplicito
/// invece di emettere silenziosamente dati non validi.
/// </summary>
public sealed class AziendaAnagrafica
{
    public string PartitaIva { get; set; } = "";
    public string CodiceFiscale { get; set; } = "";
    public string Denominazione { get; set; } = "";
    public string RegimeFiscale { get; set; } = "RF01";
    public string Indirizzo { get; set; } = "";
    public string Cap { get; set; } = "";
    public string Comune { get; set; } = "";
    public string Provincia { get; set; } = "";
    public string Nazione { get; set; } = "IT";
    public string CodiceTrasmittente { get; set; } = "";

    /// <summary>Codice trasmittente SDI: se non configurato, coincide con la P.IVA.</summary>
    public string TrasmittenteOrPartitaIva =>
        string.IsNullOrWhiteSpace(CodiceTrasmittente) ? PartitaIva : CodiceTrasmittente;

    private static readonly string[] PlaceholderValues =
        { "00000000000", "FatturazioneElettronica Test SRL", "Via Esempio 1", "00100" };

    /// <summary>
    /// Carica e valida l'anagrafica azienda dalla sezione <c>"Azienda"</c> di appsettings.
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// Se la configurazione non e' inizializzata, la sezione manca, o i campi
    /// obbligatori sono vuoti o valorizzati con un placeholder.
    /// </exception>
    public static AziendaAnagrafica FromConfig()
    {
        var config = WEB_UI_CRAFTER.Helpers.ConfigHelper.Configuration
            ?? throw new InvalidOperationException(
                "Configurazione applicativa non inizializzata: impossibile leggere la sezione 'Azienda'.");

        var azienda = config.GetSection("Azienda").Get<AziendaAnagrafica>()
            ?? throw new InvalidOperationException(
                "Sezione 'Azienda' mancante in appsettings: configurare i dati fiscali dell'azienda " +
                "emittente (PartitaIva, CodiceFiscale, Denominazione, Indirizzo, Cap, Comune, Provincia) " +
                "prima di generare documenti fiscali/SDI.");

        if (string.IsNullOrWhiteSpace(azienda.RegimeFiscale)) azienda.RegimeFiscale = "RF01";
        if (string.IsNullOrWhiteSpace(azienda.Nazione)) azienda.Nazione = "IT";

        azienda.Validate();
        return azienda;
    }

    private void Validate()
    {
        var missing = new List<string>();

        void Require(string name, string value)
        {
            if (string.IsNullOrWhiteSpace(value) || PlaceholderValues.Contains(value.Trim()))
                missing.Add(name);
        }

        Require(nameof(PartitaIva), PartitaIva);
        Require(nameof(CodiceFiscale), CodiceFiscale);
        Require(nameof(Denominazione), Denominazione);
        Require(nameof(Indirizzo), Indirizzo);
        Require(nameof(Cap), Cap);
        Require(nameof(Comune), Comune);
        Require(nameof(Provincia), Provincia);

        if (missing.Count > 0)
            throw new InvalidOperationException(
                "Dati azienda fiscali mancanti o non validi nella sezione 'Azienda' di appsettings: " +
                string.Join(", ", missing) +
                ". Valorizzare i dati reali dell'azienda emittente prima di generare documenti fiscali/SDI.");
    }
}
