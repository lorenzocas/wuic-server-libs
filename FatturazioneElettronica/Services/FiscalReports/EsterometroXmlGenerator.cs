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
/// Generator Esterometro (Comunicazione fatture transfrontaliere) mensile.
/// Schema XSD: <c>fornituraDF_2017.xsd</c> v1.0 (Agenzia delle Entrate
/// "Comunicazione Dati Fatture Transfrontaliere").
///
/// Dal 1° luglio 2022 e' stato sostituito dall'invio puntuale via SDI di
/// fatture verso/da soggetti UE/extra-UE con TipoDocumento <c>TD17/TD18/TD19</c>
/// e codice destinatario <c>XXXXXXX</c>. Questo generator copre il caso
/// "vecchio stile" per dati storici fino al 30/6/2022 OPPURE come riepilogo
/// per audit interno delle fatture transfrontaliere emesse via SDI.
/// </summary>
public sealed class EsterometroXmlGenerator : IFiscalReportGenerator
{
    private readonly ILogger<EsterometroXmlGenerator> _logger;
    public EsterometroXmlGenerator(ILogger<EsterometroXmlGenerator> logger) => _logger = logger;

    public string Tipo => "ESTEROMETRO";

    private static string DataConn =>
        ConfigurationManager.ConnectionStrings["DataSQLConnection"]?.ConnectionString
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    public async Task<FiscalReportResult> GenerateAsync(
        int anno, string? periodo, string? userId, CancellationToken ct = default)
    {
        // Periodo: M01..M12 (mensile) o Q1..Q4 (trimestrale)
        if (string.IsNullOrEmpty(periodo))
            return Failure("Periodo Esterometro obbligatorio (M01..M12 o Q1..Q4)");

        (DateTime startDate, DateTime endDate) = ParsePeriod(anno, periodo);
        if (startDate == default)
            return Failure($"Periodo invalido: '{periodo}'");

        try
        {
            // Query fatture verso/da estero. Criteri tipici:
            //   - cliente.nazione != 'IT' (vendite intra/extra UE)
            //   - cliente.codice_destinatario = 'XXXXXXX' (codice convenzionale per estero)
            // Usiamo data_documento nel periodo + nazione != IT.
            var operazioni = new List<EsteroOperazione>();
            using (var cn = new SqlConnection(DataConn))
            {
                await cn.OpenAsync(ct).ConfigureAwait(false);
                using var cmd = new SqlCommand(@"
SELECT f.id, f.numero, f.data_documento, f.imponibile, f.iva, f.totale,
       c.ragione_sociale AS cliente_nome,
       c.partita_iva     AS cliente_piva,
       c.codice_fiscale  AS cliente_cf,
       c.nazione         AS cliente_nazione,
       c.indirizzo, c.cap, c.citta, c.provincia
FROM dbo.fatture_inviate f
LEFT JOIN dbo.clienti c ON f.cliente_id = c.id
WHERE COALESCE(f.cancellato, 0) = 0
  AND f.data_documento BETWEEN @startDate AND @endDate
  AND ISNULL(c.nazione, 'IT') <> 'IT'
  AND f.stato IN ('EMESSA', 'PAGATA')
ORDER BY f.data_documento, f.progressivo", cn);
                cmd.Parameters.AddWithValue("@startDate", startDate);
                cmd.Parameters.AddWithValue("@endDate", endDate);
                using var rdr = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
                while (await rdr.ReadAsync(ct).ConfigureAwait(false))
                {
                    operazioni.Add(new EsteroOperazione(
                        Id: rdr.GetInt32(0),
                        Numero: rdr.GetValue(1)?.ToString() ?? "",
                        DataDocumento: rdr.GetDateTime(2),
                        Imponibile: rdr.GetDecimal(3),
                        Iva: rdr.GetDecimal(4),
                        Totale: rdr.GetDecimal(5),
                        ClienteNome: rdr.IsDBNull(6) ? "" : rdr.GetString(6),
                        ClientePiva: rdr.IsDBNull(7) ? "" : rdr.GetString(7),
                        ClienteCf: rdr.IsDBNull(8) ? "" : rdr.GetString(8),
                        ClienteNazione: rdr.IsDBNull(9) ? "" : rdr.GetString(9),
                        Indirizzo: rdr.IsDBNull(10) ? "" : rdr.GetString(10),
                        Cap: rdr.IsDBNull(11) ? "" : rdr.GetString(11),
                        Citta: rdr.IsDBNull(12) ? "" : rdr.GetString(12),
                        Provincia: rdr.IsDBNull(13) ? "" : rdr.GetString(13)
                    ));
                }
            }

            // Build XML schema fornituraDF (semplificato)
            using var ms = new MemoryStream();
            using (var w = XmlWriter.Create(ms, new XmlWriterSettings { Indent = true, Encoding = new UTF8Encoding(false) }))
            {
                w.WriteStartDocument();
                w.WriteStartElement("ns", "DatiFattura", "urn:www.agenziaentrate.gov.it:specificheTecniche:sco:datifattura");
                w.WriteAttributeString("versione", "DAT20");

                w.WriteStartElement("DatiFatturaHeader");
                w.WriteElementString("ProgressivoInvio", $"{anno}{periodo}");
                w.WriteElementString("CodiceFornitura", "DAT20");
                w.WriteEndElement();

                w.WriteStartElement("CessionarioCommittenteDTE"); // dati trasmittente (placeholder)
                w.WriteStartElement("IdentificativiFiscali");
                w.WriteElementString("IdFiscaleIVA",  "00000000000");
                w.WriteEndElement();
                w.WriteEndElement();

                w.WriteStartElement("DTE"); // Documenti Trasmessi Emessi
                foreach (var op in operazioni)
                {
                    w.WriteStartElement("CessionarioCommittente");
                    // Identificativi cliente estero
                    if (!string.IsNullOrEmpty(op.ClientePiva))
                    {
                        w.WriteStartElement("IdentificativiFiscali");
                        w.WriteStartElement("IdFiscaleIVA");
                        w.WriteElementString("IdPaese", op.ClienteNazione);
                        w.WriteElementString("IdCodice", op.ClientePiva);
                        w.WriteEndElement();
                        if (!string.IsNullOrEmpty(op.ClienteCf))
                            w.WriteElementString("CodiceFiscale", op.ClienteCf);
                        w.WriteEndElement();
                    }
                    w.WriteStartElement("AltriDatiIdentificativi");
                    w.WriteStartElement("Denominazione");
                    w.WriteString(op.ClienteNome);
                    w.WriteEndElement();
                    w.WriteStartElement("Sede");
                    w.WriteElementString("Indirizzo", string.IsNullOrEmpty(op.Indirizzo) ? "—" : op.Indirizzo);
                    w.WriteElementString("CAP", string.IsNullOrEmpty(op.Cap) ? "00000" : op.Cap);
                    w.WriteElementString("Comune", string.IsNullOrEmpty(op.Citta) ? "—" : op.Citta);
                    w.WriteElementString("Nazione", op.ClienteNazione);
                    w.WriteEndElement();
                    w.WriteEndElement();
                    w.WriteEndElement(); // CessionarioCommittente

                    w.WriteStartElement("DatiFatturaBodyDTE");
                    w.WriteStartElement("DatiGenerali");
                    w.WriteElementString("TipoDocumento", "TD17"); // TD17 integrazione/autofattura per acquisti UE servizi
                    w.WriteElementString("Data", op.DataDocumento.ToString("yyyy-MM-dd"));
                    w.WriteElementString("Numero", op.Numero);
                    w.WriteEndElement();
                    w.WriteStartElement("DatiRiepilogo");
                    w.WriteElementString("ImponibileImporto", FormatDec(op.Imponibile));
                    w.WriteStartElement("DatiIVA");
                    w.WriteElementString("Imposta", FormatDec(op.Iva));
                    w.WriteElementString("Aliquota", op.Imponibile > 0 ? FormatDec(op.Iva / op.Imponibile * 100) : "0.00");
                    w.WriteEndElement();
                    w.WriteEndElement();
                }
                w.WriteEndElement(); // DTE
                w.WriteEndElement(); // DatiFattura
                w.WriteEndDocument();
            }

            string xml = Encoding.UTF8.GetString(ms.ToArray());
            string fileName = $"ESTEROMETRO_{anno}{periodo}.xml";
            string sha256;
            using (var sha = SHA256.Create())
                sha256 = Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(xml))).ToLowerInvariant();

            string riepilogoJson = JsonSerializer.Serialize(new
            {
                anno,
                periodo,
                periodoDa = startDate,
                periodoA = endDate,
                operazioniCount = operazioni.Count,
                imponibileTotale = operazioni.Sum(o => o.Imponibile),
                ivaTotale = operazioni.Sum(o => o.Iva),
                totaleDocumenti = operazioni.Sum(o => o.Totale)
            });

            int comunicazioneId;
            using (var cn = new SqlConnection(DataConn))
            {
                await cn.OpenAsync(ct).ConfigureAwait(false);
                using var upsert = new SqlCommand(@"
MERGE dbo.comunicazioni_periodiche AS T
USING (SELECT @tipo AS tipo, @anno AS anno, @periodo AS periodo) AS S
   ON T.tipo = S.tipo AND T.anno = S.anno AND T.periodo = S.periodo
WHEN MATCHED THEN
   UPDATE SET nome_file=@fn, xml_payload=@xml, sha256_hash=@sha, stato='GENERATA',
              data_creazione=SYSUTCDATETIME(), utente_creazione=@uid, riepilogo_json=@riep
WHEN NOT MATCHED THEN
   INSERT (tipo, anno, periodo, nome_file, xml_payload, sha256_hash, stato, utente_creazione, riepilogo_json)
   VALUES (@tipo, @anno, @periodo, @fn, @xml, @sha, 'GENERATA', @uid, @riep)
OUTPUT INSERTED.id;
", cn);
                upsert.Parameters.AddWithValue("@tipo", "ESTEROMETRO");
                upsert.Parameters.AddWithValue("@anno", anno);
                upsert.Parameters.AddWithValue("@periodo", periodo);
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
                Message = $"Esterometro {periodo} {anno} generato ({operazioni.Count} operazioni transfrontaliere)"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "EsterometroXmlGenerator.GenerateAsync failed");
            return Failure("Generazione Esterometro fallita: " + ex.Message);
        }
    }

    private static (DateTime start, DateTime end) ParsePeriod(int anno, string periodo)
    {
        if (periodo.Length == 3 && periodo[0] == 'M'
            && int.TryParse(periodo.Substring(1), out int mese)
            && mese >= 1 && mese <= 12)
        {
            var s = new DateTime(anno, mese, 1);
            return (s, s.AddMonths(1).AddDays(-1));
        }
        if (periodo.Length == 2 && periodo[0] == 'Q'
            && int.TryParse(periodo.Substring(1), out int q)
            && q >= 1 && q <= 4)
        {
            var s = new DateTime(anno, (q - 1) * 3 + 1, 1);
            return (s, s.AddMonths(3).AddDays(-1));
        }
        return (default, default);
    }

    private static string FormatDec(decimal v) => v.ToString("F2", System.Globalization.CultureInfo.InvariantCulture);

    private FiscalReportResult Failure(string msg) =>
        new() { Ok = false, Tipo = Tipo, Message = msg };

    private sealed record EsteroOperazione(
        int Id, string Numero, DateTime DataDocumento, decimal Imponibile, decimal Iva, decimal Totale,
        string ClienteNome, string ClientePiva, string ClienteCf, string ClienteNazione,
        string Indirizzo, string Cap, string Citta, string Provincia);
}
