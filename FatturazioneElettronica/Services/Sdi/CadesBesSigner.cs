using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Org.BouncyCastle.Cms;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Pkcs;
using Org.BouncyCastle.Utilities.Collections;
using Org.BouncyCastle.X509;

namespace FatturazioneElettronica.Services.Sdi;

/// <summary>
/// Configurazione signer letta da <c>Sdi:Signer</c> in appsettings.json.
/// </summary>
public sealed class SdiSignerOptions
{
    /// <summary>Path del file PKCS#12 (.p12 o .pfx) col certificato + chiave privata.</summary>
    public string Pkcs12Path { get; set; } = string.Empty;

    /// <summary>Password del file PKCS#12.</summary>
    public string Pkcs12Password { get; set; } = string.Empty;

    /// <summary>
    /// Algoritmo di digest. Default <c>SHA256withRSA</c> (richiesto da SDI per FPR12).
    /// Altri valori possibili: <c>SHA1withRSA</c> (legacy, sconsigliato).
    /// </summary>
    public string SignatureAlgorithm { get; set; } = "SHA256withRSA";
}

/// <summary>
/// Implementazione CADES-BES via BouncyCastle CMS SignedData.
/// </summary>
public sealed class CadesBesSigner : ISdiSigner
{
    private readonly SdiSignerOptions _opts;
    private readonly ILogger<CadesBesSigner> _logger;
    private readonly object _lock = new();
    private (X509Certificate cert, AsymmetricKeyParameter privateKey, IList<X509Certificate> chain)? _loaded;
    private readonly bool _hasConfig;

    public CadesBesSigner(IOptions<SdiSignerOptions> opts, ILogger<CadesBesSigner> logger)
    {
        _opts = opts.Value;
        _logger = logger;
        _hasConfig = !string.IsNullOrWhiteSpace(_opts.Pkcs12Path) && File.Exists(_opts.Pkcs12Path);
    }

    public bool IsConfigured => _hasConfig;

    public byte[] SignCadesBes(string xmlPayload)
    {
        if (!_hasConfig)
            throw new InvalidOperationException(
                "CadesBesSigner non configurato: imposta Sdi:Signer:Pkcs12Path + Pkcs12Password " +
                "in appsettings.json. Per dev usare cert auto-firmato (vedi scripts/generate-dev-cert.ps1).");

        if (string.IsNullOrEmpty(xmlPayload))
            throw new ArgumentException("xmlPayload empty", nameof(xmlPayload));

        var (cert, privateKey, chain) = LoadCertOnce();

        try
        {
            // CmsSignedDataGenerator costruisce il SignedData CADES.
            // Encapsulated=true: il payload XML viene incluso DENTRO il CMS
            // (formato canonico SDI per .xml.p7m). Encapsulated=false e'
            // usato solo per detached signature (separate file), che SDI
            // accetta ma e' meno comune.
            //
            // BouncyCastle 2.x: AddSigner vuole l'OID del digest, non il nome
            // friendly tipo "SHA256withRSA" (che era valido in 1.x). Mapping
            // stringhe friendly -> OID + passthrough se gia' OID.
            string digestOid = MapDigestNameToOid(_opts.SignatureAlgorithm);
            var generator = new CmsSignedDataGenerator();
            generator.AddSigner(privateKey, cert, digestOid);
            // BouncyCastle 2.x API: CollectionUtilities.CreateStore sostituisce
            // X509StoreFactory.Create + X509CollectionStoreParameters (legacy 1.x).
            generator.AddCertificates(CollectionUtilities.CreateStore<X509Certificate>(chain));

            byte[] payloadBytes = Encoding.UTF8.GetBytes(xmlPayload);
            var msg = new CmsProcessableByteArray(payloadBytes);
            var signed = generator.Generate(msg, encapsulate: true);

            byte[] result = signed.GetEncoded();
            _logger.LogInformation(
                "CadesBesSigner: firmato payload {Bytes}b → CMS {OutBytes}b (cert subject={Subject})",
                payloadBytes.Length, result.Length, cert.SubjectDN);
            return result;
        }
        catch (CmsException ex)
        {
            throw new InvalidOperationException("CADES-BES signing failed: " + ex.Message, ex);
        }
    }

    /// <summary>
    /// Mappa nomi friendly (`SHA256withRSA`, `SHA512withRSA`, ...) → OID del
    /// digest accettati da BouncyCastle 2.x <c>CmsSignedDataGenerator.AddSigner</c>.
    /// L'algoritmo di firma reale (RSA) e' implicito dal tipo della chiave
    /// privata caricata. Stringhe gia' in formato OID passano invariate.
    /// </summary>
    private static string MapDigestNameToOid(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return CmsSignedGenerator.DigestSha256;
        return name.Trim().ToUpperInvariant() switch
        {
            "SHA256" or "SHA256WITHRSA" or "SHA-256" => CmsSignedGenerator.DigestSha256,
            "SHA384" or "SHA384WITHRSA" or "SHA-384" => CmsSignedGenerator.DigestSha384,
            "SHA512" or "SHA512WITHRSA" or "SHA-512" => CmsSignedGenerator.DigestSha512,
            "SHA1"   or "SHA1WITHRSA"   or "SHA-1"   => CmsSignedGenerator.DigestSha1,
            _ => name  // assume OID gia' fornito (es. "2.16.840.1.101.3.4.2.1")
        };
    }

    private (X509Certificate cert, AsymmetricKeyParameter privateKey, IList<X509Certificate> chain) LoadCertOnce()
    {
        if (_loaded.HasValue) return _loaded.Value;

        lock (_lock)
        {
            if (_loaded.HasValue) return _loaded.Value;

            using var fs = File.OpenRead(_opts.Pkcs12Path);
            var store = new Pkcs12StoreBuilder().Build();
            store.Load(fs, (_opts.Pkcs12Password ?? string.Empty).ToCharArray());

            // Trova il primo alias con chiave privata (PKCS#12 puo' avere
            // multiple entries; SDI richiede signing con cert qualificato
            // dell'emittente). Per dev/test e' OK il primo trovato.
            string? keyAlias = null;
            foreach (string alias in store.Aliases.Cast<string>())
            {
                if (store.IsKeyEntry(alias)) { keyAlias = alias; break; }
            }
            if (keyAlias is null)
                throw new InvalidOperationException(
                    $"PKCS#12 in {_opts.Pkcs12Path} non contiene chiavi private.");

            var keyEntry = store.GetKey(keyAlias);
            var certEntries = store.GetCertificateChain(keyAlias);
            if (certEntries is null || certEntries.Length == 0)
                throw new InvalidOperationException(
                    $"PKCS#12 alias '{keyAlias}': certificate chain assente.");

            var cert = certEntries[0].Certificate;
            var chain = certEntries.Select(e => e.Certificate).ToList();

            _loaded = (cert, keyEntry.Key, chain);
            _logger.LogInformation(
                "CadesBesSigner: cert caricato (subject={Subject}, issuer={Issuer}, validFrom={From}, validTo={To})",
                cert.SubjectDN, cert.IssuerDN, cert.NotBefore, cert.NotAfter);
            return _loaded.Value;
        }
    }
}
