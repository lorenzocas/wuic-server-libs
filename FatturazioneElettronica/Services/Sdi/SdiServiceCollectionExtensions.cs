using System;
using System.Collections.Generic;
using System.Linq;
using FatturazioneElettronica.Services.Sdi.Conservation;
using FatturazioneElettronica.Services.Sdi.Notifications;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace FatturazioneElettronica.Services.Sdi;

/// <summary>
/// DI registration helper per i servizi SDI. Da chiamare in <c>Program.cs</c>
/// via <c>webBuilder.ConfigureServices(s => s.AddSdiServices(config))</c>.
///
/// **Provider auto-selezionato dalla configurazione**: il provider attivo e'
/// quello la cui sottosezione <c>Sdi:&lt;ProviderName&gt;</c> e' compilata
/// (cioe' il provider concreto ritorna <c>IsConfigured=true</c> dopo bind delle
/// options). Esempi:
///
///   ```json
///   "Sdi": {
///     "ArubaPec": { "Username": "...", "Password": "...", "Endpoint": "..." }
///     // → ArubaPecSdiProvider attivo
///   }
///
///   "Sdi": {
///     "FatturePec": { "ApiKey": "...", "Endpoint": "..." }
///     // → FatturePecSdiProvider attivo
///   }
///
///   "Sdi": { }
///   // → MockSdiProvider attivo (fallback dev/test)
///   ```
///
/// Se piu' di una sottosezione e' configurata simultaneamente la pipeline
/// **fallisce all'avvio** con un errore esplicito: avere piu' provider
/// configurati e' ambiguo (l'operatore deve sceglierne uno per environment).
/// Questo previene pasticci tipo "ho copiato config di prod in dev e mando
/// fatture vere al SDI per sbaglio".
/// </summary>
public static class SdiServiceCollectionExtensions
{
    public static IServiceCollection AddSdiServices(this IServiceCollection services, IConfiguration config)
    {
        // Bind options
        services.Configure<SdiSignerOptions>(config.GetSection("Sdi:Signer"));
        services.Configure<DirectPecOptions>(config.GetSection("Sdi:DirectPec"));
        services.Configure<ArubaPecOptions>(config.GetSection("Sdi:ArubaPec"));
        services.Configure<FatturePecOptions>(config.GetSection("Sdi:FatturePec"));
        services.Configure<PecItOptions>(config.GetSection("Sdi:PecIt"));
        services.Configure<NotarifyOptions>(config.GetSection("Sdi:Notarify"));

        // Componenti pipeline
        services.AddSingleton<IXsdValidator, FatturaPaXsdValidator>();
        services.AddSingleton<ISdiSigner, CadesBesSigner>();

        // HttpClientFactory + provider concreti
        services.AddHttpClient("ArubaPecSdi");
        services.AddHttpClient("FatturePecSdi");
        services.AddHttpClient("PecItSdi");
        services.AddHttpClient("NotarifySdi");

        services.AddSingleton<MockSdiProvider>();
        services.AddSingleton<DirectPecSdiProvider>();
        services.AddSingleton<ArubaPecSdiProvider>();
        services.AddSingleton<FatturePecSdiProvider>();
        services.AddSingleton<PecItSdiProvider>();
        services.AddSingleton<NotarifySdiProvider>();

        // Provider factory: auto-selezione basata su `IsConfigured` dei provider
        // concreti. Vedi <see cref="SdiServiceCollectionExtensions"/> per il
        // contratto di selezione (singola sottosezione = quel provider, zero =
        // Mock fallback, multiple = errore ambiguo).
        services.AddSingleton<ISdiProvider>(sp =>
        {
            // Tutti i candidati REALI (escluso Mock — fallback). Ordine arbitrario:
            // se piu' configurati, errore — niente priorita' implicita.
            var candidates = new ISdiProvider[]
            {
                sp.GetRequiredService<DirectPecSdiProvider>(),
                sp.GetRequiredService<ArubaPecSdiProvider>(),
                sp.GetRequiredService<FatturePecSdiProvider>(),
                sp.GetRequiredService<PecItSdiProvider>(),
                sp.GetRequiredService<NotarifySdiProvider>(),
            };

            var configured = candidates.Where(p => p.IsConfigured).ToList();
            var logger = sp.GetService<ILoggerFactory>()?.CreateLogger("Sdi.ProviderFactory");

            if (configured.Count > 1)
            {
                string names = string.Join(", ", configured.Select(p => p.Name));
                throw new InvalidOperationException(
                    $"Sdi: configurazione ambigua — piu' provider configurati simultaneamente ({names}). " +
                    "Compila in appsettings.json una sola sottosezione fra Sdi:DirectPec, Sdi:ArubaPec, " +
                    "Sdi:FatturePec, Sdi:PecIt, Sdi:Notarify (o nessuna per usare MockSdiProvider in dev).");
            }

            if (configured.Count == 1)
            {
                logger?.LogInformation(
                    "Sdi: provider attivo = {Provider} (auto-selezionato da configurazione).",
                    configured[0].Name);
                return configured[0];
            }

            logger?.LogInformation(
                "Sdi: nessun provider reale configurato → fallback MockSdiProvider (dev/test). " +
                "Per produzione, compila Sdi:ArubaPec | FatturePec | PecIt | Notarify in appsettings.");
            return sp.GetRequiredService<MockSdiProvider>();
        });

        services.AddSingleton<SdiSubmissionPipeline>();

        // Notifications subsystem: parser + provider-specific poller + applier
        // + cycle runner.
        //
        // **Schedulazione delegata al framework `scheduler` table** (vedi
        // <c>scripts/2026-05-09-scheduler-tasks-sdi-fiscal.sql</c> per il seed).
        // Il <c>SdiNotificationCycleRunner</c> espone <c>RunOneCycleAsync()</c>
        // chiamato dal framework via <c>POST /api/sdi/notifications/poll-now</c>
        // (action_type='2' nel record scheduler).
        //
        // **Provider symmetry** (regola obbligatoria, verificata 2026-05-09):
        // chi invia (<c>ISdiProvider</c>) ha il suo poller di ritorno
        // (<c>ISdiNotificationPoller</c>) — i 4 provider commerciali ricevono
        // le notifiche SDI sulla loro infrastruttura, NON sulla PEC del
        // mittente. Auto-selezione analoga a <c>ISdiProvider</c>: chi e'
        // configurato (<c>IsConfigured=true</c>) vince. Il poller IMAP della
        // PEC mittente e' usato solo dal path free <see cref="DirectPecSdiProvider"/>.
        services.Configure<PecImapPollerOptions>(config.GetSection("Sdi:Notifications:Imap"));
        services.AddSingleton<ISdiNotificationParser, SdiNotificationParser>();
        services.AddSingleton<SdiNotificationApplier>();
        services.AddSingleton<SdiNotificationCycleRunner>();
        services.AddSingleton<SdiCursorRepository>();

        // Concrete pollers (uno per provider, riusano gli HttpClient dei sender)
        services.AddSingleton<PecImapNotificationPoller>();
        services.AddSingleton<ArubaPecNotificationPoller>();
        services.AddSingleton<FatturePecNotificationPoller>();
        services.AddSingleton<PecItNotificationPoller>();
        services.AddSingleton<NotarifyNotificationPoller>();
        services.AddSingleton<NullNotificationPoller>();

        services.AddSingleton<ISdiNotificationPoller>(sp =>
        {
            // Lista dei poller commerciali REST/SOAP. Il PecImap e' selezionato
            // SOLO se DirectPec sender e' attivo (vedi sotto).
            var commercials = new ISdiNotificationPoller[]
            {
                sp.GetRequiredService<ArubaPecNotificationPoller>(),
                sp.GetRequiredService<FatturePecNotificationPoller>(),
                sp.GetRequiredService<PecItNotificationPoller>(),
                sp.GetRequiredService<NotarifyNotificationPoller>(),
            };

            var configured = commercials.Where(p => p.IsConfigured).ToList();
            var logger = sp.GetService<ILoggerFactory>()?.CreateLogger("Sdi.PollerFactory");

            if (configured.Count > 1)
            {
                string names = string.Join(", ", configured.Select(p => p.Name));
                throw new InvalidOperationException(
                    $"Sdi:NotificationPoller: configurazione ambigua — piu' provider configurati simultaneamente ({names}). " +
                    "Compila in appsettings.json una sola sottosezione fra Sdi:ArubaPec / FatturePec / PecIt / Notarify, " +
                    "oppure usa Sdi:DirectPec + Sdi:Notifications:Imap per il path PEC free.");
            }

            if (configured.Count == 1)
            {
                logger?.LogInformation(
                    "Sdi: poller notifiche attivo = {Poller} (auto-selezionato, simmetrico al sender provider).",
                    configured[0].Name);
                return configured[0];
            }

            // Nessun commerciale configurato: prova il path PEC IMAP free
            // (DirectPec sender ↔ PEC inbox poll).
            var pecImap = sp.GetRequiredService<PecImapNotificationPoller>();
            if (pecImap.IsConfigured)
            {
                logger?.LogInformation(
                    "Sdi: poller notifiche attivo = PecImap (path free DirectPec, IMAP poll della PEC mittente).");
                return pecImap;
            }

            // Nessun poller configurato: fallback no-op (evita errori scheduler in dev).
            logger?.LogInformation(
                "Sdi: nessun poller configurato → NullNotificationPoller. " +
                "Per produzione configurare in appsettings.json la stessa sezione del sender " +
                "(Sdi:ArubaPec / FatturePec / PecIt / Notarify) — credenziali condivise " +
                "+ NotificationsEndpoint. Per path PEC free: Sdi:Notifications:Imap.");
            return sp.GetRequiredService<NullNotificationPoller>();
        });

        // Conservazione sostitutiva 10 anni AgID: filesystem + Aruba/InfoCert partner.
        // Auto-selezione analoga a ISdiProvider: chi e' configurato vince.
        // Filesystem e' sempre disponibile come fallback (gratuito, locale).
        services.Configure<FilesystemConservationOptions>(config.GetSection("Sdi:Conservation:Filesystem"));
        services.Configure<ArubaConservationOptions>(config.GetSection("Sdi:Conservation:Aruba"));
        services.Configure<InfoCertConservationOptions>(config.GetSection("Sdi:Conservation:InfoCert"));
        services.AddHttpClient("Rfc3161Tsa");
        services.AddHttpClient("ArubaConservation");
        services.AddHttpClient("InfoCertConservation");
        services.AddSingleton<FilesystemConservation>();
        services.AddSingleton<ArubaConservationProvider>();
        services.AddSingleton<InfoCertConservationProvider>();
        services.AddSingleton<IDigitalConservation>(sp =>
        {
            var aruba = sp.GetRequiredService<ArubaConservationProvider>();
            var infoCert = sp.GetRequiredService<InfoCertConservationProvider>();
            var configured = new IDigitalConservation[] { aruba, infoCert }
                .Where(c => c.IsConfigured).ToList();
            var logger = sp.GetService<ILoggerFactory>()?.CreateLogger("Sdi.ConservationFactory");

            if (configured.Count > 1)
                throw new InvalidOperationException(
                    $"Sdi:Conservation: piu' provider configurati ({string.Join(", ", configured.Select(c => c.Name))}). " +
                    "Compila in appsettings.json una sola sottosezione fra Sdi:Conservation:Aruba o Sdi:Conservation:InfoCert " +
                    "(o nessuna per usare Filesystem locale).");

            if (configured.Count == 1)
            {
                logger?.LogInformation("Sdi: conservazione attiva = {Provider}", configured[0].Name);
                return configured[0];
            }

            logger?.LogInformation(
                "Sdi: nessun provider conservazione configurato → Filesystem locale (gratuito, AgID-compliant con TSA RFC 3161). " +
                "Per produzione raccomandato Conservatore Accreditato (Aruba/InfoCert).");
            return sp.GetRequiredService<FilesystemConservation>();
        });

        return services;
    }
}
