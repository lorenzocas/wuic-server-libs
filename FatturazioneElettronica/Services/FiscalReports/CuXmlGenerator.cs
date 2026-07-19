using System;
using System.Collections.Generic;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

namespace FatturazioneElettronica.Services.FiscalReports;

/// <summary>
/// Generator CU (Certificazione Unica) annuale per redditi corrisposti
/// a collaboratori (lavoratori autonomi, dipendenti). Schema XSD AdE
/// <c>fornituraCU.xsd</c> v1.0 (Comunicazione Unica annuale).
///
/// Il CU certifica i redditi che l'azienda ha corrisposto nell'anno
/// fiscale precedente. Per imprese che hanno collaboratori, va inviato
/// entro il 16 marzo di ogni anno.
///
/// **Source dati**: query sui pagamenti a collaboratori.
/// In assenza di una tabella `collaboratori` dedicata, lo scaffold qui
/// produce un XML vuoto (header only) che l'operatore deve riempire
/// con dati reali integrandoli da payroll/sistema HR.
/// </summary>
public sealed class CuXmlGenerator : IFiscalReportGenerator
{
    private readonly ILogger<CuXmlGenerator> _logger;
    public CuXmlGenerator(ILogger<CuXmlGenerator> logger) => _logger = logger;

    public string Tipo => "CU";

    private static string DataConn =>
        WEB_UI_CRAFTER.Helpers.ConfigHelper.ResolveConnectionString("DataSQLConnection")
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    public async Task<FiscalReportResult> GenerateAsync(
        int anno, string? periodo, string? userId, CancellationToken ct = default)
    {
        // CU e' annuale, ignora `periodo` (deve essere null o vuoto).
        if (!string.IsNullOrEmpty(periodo))
            _logger.LogWarning("CuXmlGenerator: periodo='{P}' ignorato (CU e' annuale)", periodo);

        try
        {
            // Dati sostituto d'imposta dalla sezione "Azienda" di appsettings (fail esplicito se placeholder).
            var azienda = FatturazioneElettronica.Services.AziendaAnagrafica.FromConfig();

            // Aggregato collaboratori: query opzionale su tabelle payroll.
            // Pattern: se esiste `dbo.collaboratori_pagamenti` con (anno, codice_fiscale,
            // nome, compenso_lordo, ritenuta), iteriamo. Altrimenti CU vuoto (header only).
            var collaboratori = new List<CuRecord>();
            using (var cn = new SqlConnection(DataConn))
            {
                await cn.OpenAsync(ct).ConfigureAwait(false);
                bool tableExists = false;
                using (var check = new SqlCommand(
                    "SELECT COUNT(*) FROM sys.tables WHERE name='collaboratori_pagamenti'", cn))
                {
                    var r = await check.ExecuteScalarAsync(ct).ConfigureAwait(false);
                    tableExists = (r != null && Convert.ToInt32(r) > 0);
                }

                if (tableExists)
                {
                    using var cmd = new SqlCommand(@"
SELECT codice_fiscale, nome, cognome,
       SUM(compenso_lordo) AS lordo,
       SUM(ritenuta_acconto) AS ritenuta
FROM dbo.collaboratori_pagamenti
WHERE anno = @anno
GROUP BY codice_fiscale, nome, cognome", cn);
                    cmd.Parameters.AddWithValue("@anno", anno);
                    using var rdr = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
                    while (await rdr.ReadAsync(ct).ConfigureAwait(false))
                    {
                        collaboratori.Add(new CuRecord(
                            CodiceFiscale: rdr.IsDBNull(0) ? "" : rdr.GetString(0),
                            Nome: rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                            Cognome: rdr.IsDBNull(2) ? "" : rdr.GetString(2),
                            CompensoLordo: rdr.IsDBNull(3) ? 0 : rdr.GetDecimal(3),
                            Ritenuta: rdr.IsDBNull(4) ? 0 : rdr.GetDecimal(4)
                        ));
                    }
                }
            }

            // Build XML
            using var ms = new MemoryStream();
            using (var w = XmlWriter.Create(ms, new XmlWriterSettings { Indent = true, Encoding = new UTF8Encoding(false) }))
            {
                w.WriteStartDocument();
                w.WriteStartElement("ns", "FornituraCU", "urn:www.agenziaentrate.gov.it:specificheTecniche:sco:cu");
                w.WriteAttributeString("identificativoSoftware", "WUIC-FE-CU");
                w.WriteAttributeString("annoImposta", anno.ToString());

                w.WriteStartElement("Frontespizio");
                w.WriteElementString("CFSostitutoImposta", azienda.CodiceFiscale);
                w.WriteElementString("AnnoFornitura", anno.ToString());
                w.WriteEndElement();

                w.WriteStartElement("Comunicazioni");
                int progressivo = 1;
                foreach (var c in collaboratori)
                {
                    w.WriteStartElement("Comunicazione");
                    w.WriteAttributeString("progressivo", progressivo.ToString("0000000"));

                    w.WriteStartElement("DatiAnagraficiPercipiente");
                    w.WriteElementString("CodiceFiscale", c.CodiceFiscale);
                    w.WriteElementString("Cognome", c.Cognome);
                    w.WriteElementString("Nome", c.Nome);
                    w.WriteEndElement();

                    w.WriteStartElement("DatiCertificazioneLavoroAutonomo");
                    w.WriteElementString("CausalePagamento", "A"); // A = prestazione lavoro autonomo abituale
                    w.WriteElementString("AmmontareLordoCorrisposto", FormatDec(c.CompensoLordo));
                    w.WriteElementString("RitenuteAcconto", FormatDec(c.Ritenuta));
                    w.WriteEndElement();

                    w.WriteEndElement(); // Comunicazione
                    progressivo++;
                }
                w.WriteEndElement(); // Comunicazioni

                w.WriteEndElement(); // FornituraCU
                w.WriteEndDocument();
            }

            string xml = Encoding.UTF8.GetString(ms.ToArray());
            string fileName = $"CU_{anno}.xml";
            string sha256;
            using (var sha = SHA256.Create())
                sha256 = Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(xml))).ToLowerInvariant();

            string riepilogoJson = JsonSerializer.Serialize(new
            {
                anno,
                collaboratoriCount = collaboratori.Count,
                lordoTotale = collaboratori.Sum(c => c.CompensoLordo),
                ritenuteTotali = collaboratori.Sum(c => c.Ritenuta),
                noteSchema = collaboratori.Count == 0
                    ? "Nessuna tabella collaboratori_pagamenti trovata - CU header-only. Integrare con payroll/HR per popolarlo."
                    : null
            });

            int comunicazioneId;
            using (var cn = new SqlConnection(DataConn))
            {
                await cn.OpenAsync(ct).ConfigureAwait(false);
                using var upsert = new SqlCommand(@"
MERGE dbo.comunicazioni_periodiche AS T
USING (SELECT @tipo AS tipo, @anno AS anno) AS S
   ON T.tipo = S.tipo AND T.anno = S.anno AND T.periodo IS NULL
WHEN MATCHED THEN
   UPDATE SET nome_file=@fn, xml_payload=@xml, sha256_hash=@sha, stato='GENERATA',
              data_creazione=SYSUTCDATETIME(), utente_creazione=@uid, riepilogo_json=@riep
WHEN NOT MATCHED THEN
   INSERT (tipo, anno, periodo, nome_file, xml_payload, sha256_hash, stato, utente_creazione, riepilogo_json)
   VALUES (@tipo, @anno, NULL, @fn, @xml, @sha, 'GENERATA', @uid, @riep)
OUTPUT INSERTED.id;
", cn);
                upsert.Parameters.AddWithValue("@tipo", "CU");
                upsert.Parameters.AddWithValue("@anno", anno);
                upsert.Parameters.AddWithValue("@fn", fileName);
                upsert.Parameters.AddWithValue("@xml", xml);
                upsert.Parameters.AddWithValue("@sha", sha256);
                upsert.Parameters.AddWithValue("@uid", (object?)userId ?? DBNull.Value);
                upsert.Parameters.AddWithValue("@riep", riepilogoJson);
                comunicazioneId = (int)(await upsert.ExecuteScalarAsync(ct).ConfigureAwait(false))!;
            }

            return new FiscalReportResult
            {
                Ok = true,
                Tipo = Tipo,
                ComunicazioneId = comunicazioneId,
                FileName = fileName,
                Sha256 = sha256,
                XmlBytes = xml.Length,
                RiepilogoJson = riepilogoJson,
                Message = collaboratori.Count == 0
                    ? $"CU {anno} generato (header-only — tabella collaboratori_pagamenti assente)"
                    : $"CU {anno} generato ({collaboratori.Count} collaboratori, lordo totale={collaboratori.Sum(c => c.CompensoLordo):N2})"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "CuXmlGenerator.GenerateAsync failed");
            return Failure("Generazione CU fallita: " + ex.Message);
        }
    }

    private static string FormatDec(decimal v) => v.ToString("F2", System.Globalization.CultureInfo.InvariantCulture);

    private FiscalReportResult Failure(string msg) =>
        new() { Ok = false, Tipo = Tipo, Message = msg };

    private sealed record CuRecord(string CodiceFiscale, string Nome, string Cognome, decimal CompensoLordo, decimal Ritenuta);
}
