using System;
using ConfigurationManager = System.Configuration.ConfigurationManager;
using System.Data;
using System.IO;
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
/// Generator LIPE (Liquidazione Periodica IVA) trimestrale.
/// Schema XSD: <c>fornituraIvp_2018.xsd</c> v1.0 (Agenzia delle Entrate
/// "Comunicazioni IVA — Liquidazione Periodica").
///
/// Aggregato letto dalla stored <c>sp_aggregato_lipe(@anno, @trimestre)</c>:
/// imponibile/IVA vendite + imponibile/IVA acquisti + saldo IVA del trimestre.
/// </summary>
public sealed class LipeXmlGenerator : IFiscalReportGenerator
{
    private readonly ILogger<LipeXmlGenerator> _logger;
    public LipeXmlGenerator(ILogger<LipeXmlGenerator> logger) => _logger = logger;

    public string Tipo => "LIPE";

    private static string DataConn =>
        WEB_UI_CRAFTER.Helpers.ConfigHelper.ResolveConnectionString("DataSQLConnection")
        ?? throw new InvalidOperationException("DataSQLConnection non configurata");

    public async Task<FiscalReportResult> GenerateAsync(
        int anno, string? periodo, string? userId, CancellationToken ct = default)
    {
        // Periodo richiesto in formato Q1..Q4
        if (string.IsNullOrEmpty(periodo) || periodo.Length != 2 || periodo[0] != 'Q'
            || !int.TryParse(periodo.Substring(1), out int trimestre)
            || trimestre < 1 || trimestre > 4)
            return Failure($"Periodo LIPE invalido: '{periodo}' (atteso Q1..Q4)");

        try
        {
            // Dati dichiarante dalla sezione "Azienda" di appsettings (fail esplicito se placeholder).
            var azienda = FatturazioneElettronica.Services.AziendaAnagrafica.FromConfig();

            // Aggrega via stored
            decimal vendImp = 0, vendIva = 0, acqImp = 0, acqIva = 0;
            int vendCount = 0, acqCount = 0;
            decimal saldoIva = 0; DateTime? perDa = null, perA = null;

            using (var cn = new SqlConnection(DataConn))
            {
                await cn.OpenAsync(ct).ConfigureAwait(false);
                using var cmd = new SqlCommand("dbo.sp_aggregato_lipe", cn) { CommandType = CommandType.StoredProcedure };
                cmd.Parameters.AddWithValue("@anno", anno);
                cmd.Parameters.AddWithValue("@trimestre", trimestre);
                using var rdr = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);

                // Result-set 1: VENDITE
                if (await rdr.ReadAsync(ct).ConfigureAwait(false))
                {
                    vendImp = rdr.IsDBNull(1) ? 0 : Convert.ToDecimal(rdr.GetValue(1));
                    vendIva = rdr.IsDBNull(2) ? 0 : Convert.ToDecimal(rdr.GetValue(2));
                    vendCount = rdr.IsDBNull(3) ? 0 : Convert.ToInt32(rdr.GetValue(3));
                }
                // Result-set 2: ACQUISTI
                await rdr.NextResultAsync(ct).ConfigureAwait(false);
                if (await rdr.ReadAsync(ct).ConfigureAwait(false))
                {
                    acqImp = rdr.IsDBNull(1) ? 0 : Convert.ToDecimal(rdr.GetValue(1));
                    acqIva = rdr.IsDBNull(2) ? 0 : Convert.ToDecimal(rdr.GetValue(2));
                    acqCount = rdr.IsDBNull(3) ? 0 : Convert.ToInt32(rdr.GetValue(3));
                }
                // Result-set 3: SALDO
                await rdr.NextResultAsync(ct).ConfigureAwait(false);
                if (await rdr.ReadAsync(ct).ConfigureAwait(false))
                {
                    saldoIva = rdr.IsDBNull(3) ? 0 : Convert.ToDecimal(rdr.GetValue(3));
                    perDa = rdr.IsDBNull(4) ? null : Convert.ToDateTime(rdr.GetValue(4));
                    perA = rdr.IsDBNull(5) ? null : Convert.ToDateTime(rdr.GetValue(5));
                }
            }

            // Build XML: schema fornituraIvp_2018.xsd v1.0 (semplificato; production
            // include CodiceFiscale dichiarante, IdentificativoProduttore software, ecc.).
            // Pattern minimo: Fornitura → Frontespizio + Comunicazione/DatiContabili
            using var ms = new MemoryStream();
            var xs = new XmlWriterSettings { Indent = true, Encoding = new UTF8Encoding(false) };
            using (var w = XmlWriter.Create(ms, xs))
            {
                w.WriteStartDocument();
                w.WriteStartElement("iv", "Fornitura", "urn:www.agenziaentrate.gov.it:specificheTecniche:sco:ivp");
                w.WriteAttributeString("identificativoSoftware", "WUIC-FE-LIPE");

                // Frontespizio (dichiarante — dati azienda da config, sezione "Azienda")
                w.WriteStartElement("Frontespizio");
                w.WriteElementString("CodiceFornitura", "IVP18");
                w.WriteElementString("CFDichiarante", azienda.CodiceFiscale);
                w.WriteEndElement();

                // Comunicazione
                w.WriteStartElement("Comunicazione");
                w.WriteAttributeString("identificativo", $"{anno}{trimestre:00}001");
                w.WriteStartElement("Frontespizio");
                w.WriteStartElement("CodiceFiscale");
                w.WriteString(azienda.CodiceFiscale);
                w.WriteEndElement();
                w.WriteElementString("AnnoImposta", anno.ToString());
                w.WriteEndElement(); // Frontespizio

                w.WriteStartElement("DatiContabili");
                w.WriteStartElement("Modulo");
                w.WriteElementString("NumeroModulo", "1");
                w.WriteElementString("Trimestre", trimestre.ToString());
                w.WriteElementString("TotaleOperazioniAttive", FormatDec(vendImp));
                w.WriteElementString("TotaleOperazioniPassive", FormatDec(acqImp));
                w.WriteElementString("IvaEsigibile", FormatDec(vendIva));
                w.WriteElementString("IvaDetratta", FormatDec(acqIva));
                w.WriteElementString("IvaDovuta", saldoIva > 0 ? FormatDec(saldoIva) : "0");
                w.WriteElementString("IvaCredito", saldoIva < 0 ? FormatDec(-saldoIva) : "0");
                w.WriteEndElement(); // Modulo
                w.WriteEndElement(); // DatiContabili

                w.WriteEndElement(); // Comunicazione
                w.WriteEndElement(); // Fornitura
                w.WriteEndDocument();
            }

            string xml = Encoding.UTF8.GetString(ms.ToArray());
            string fileName = $"LIPE_{anno}Q{trimestre}.xml";
            string sha256;
            using (var sha = SHA256.Create())
                sha256 = Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(xml))).ToLowerInvariant();

            string riepilogoJson = JsonSerializer.Serialize(new
            {
                anno, trimestre, periodoDa = perDa, periodoA = perA,
                vendite = new { imponibile = vendImp, iva = vendIva, count = vendCount },
                acquisti = new { imponibile = acqImp, iva = acqIva, count = acqCount },
                saldoIva
            });

            // Persist (idempotent upsert per (tipo, anno, periodo))
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
                upsert.Parameters.AddWithValue("@tipo", "LIPE");
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
                Message = $"LIPE Q{trimestre} {anno} generato (vendite imp={vendImp:N2}, IVA dovuta={Math.Max(0, saldoIva):N2})"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "LipeXmlGenerator.GenerateAsync failed");
            return Failure("Generazione LIPE fallita: " + ex.Message);
        }
    }

    private static string FormatDec(decimal v) => v.ToString("F2", System.Globalization.CultureInfo.InvariantCulture);

    private FiscalReportResult Failure(string msg) =>
        new() { Ok = false, Tipo = Tipo, Message = msg };
}
