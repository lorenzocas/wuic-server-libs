---
title: "FlottaMezzi: a free fleet management app with geolocation, maintenance deadlines and cost rollups"
slug: flottamezzi-free-fleet-management
date: 2026-05-15
author: Lorenzo Castrico
description: "FlottaMezzi is the third free app on WUIC: anagrafica mezzi, manutenzioni programmate con alert scadenze (bollo, revisione, assicurazione, tagliando), tracking geolocation via OBD/GPS feed, aggregazione costi per mezzo / driver / periodo, reportistica. Free as-shipped, runs on your own SQL Server."
tags: fleet-management, geolocation, free-apps, wuic, transport, logistics
---

`FlottaMezzi` is the third and final app in our free distribution lineup. It targets the problem space that mid-size logistics / construction / service companies handle in Excel until someone reaches their limit: tracking what mezzi (cars, vans, trucks, escavatori, muletti — anything with a license plate or a serial) the company owns, what's due on each of them, where they are right now if they're moving, and what each one is costing per month.

This post covers what's in the box, who tends to install this kind of thing, and the same licensing rule that applies to the other two free apps.

## What ships in the free distribution

Download is `FlottaMezzi-iis-v1.0.0-with-dbs.zip` on the [Downloads page](/downloads). Inside:

### Anagrafica & ownership

- **Mezzi** — targa, telaio, marca/modello, anno, classe (auto, furgone, autocarro, semirimorchio, attrezzatura), assegnatario, sede di parcheggio. Multi-azienda (se hai più P.IVA che condividono la flotta)
- **Drivers / autisti** — anagrafica, patente con data scadenza, CQC, ADR, tessera tachigrafa
- **Documenti del mezzo** — libretto, carta di circolazione, contratto noleggio/leasing, polizza assicurativa, certificato revisione — ognuno con data emissione + data scadenza

### Scadenze automatiche

The piece that triggers an ROI conversation:

- **Bollo annuale** — calcolato dalla regione di immatricolazione + cv fiscali
- **Revisione** — biennale per auto < 3.5 t, annuale per veicoli commerciali pesanti, tachigrafico ogni 2 anni
- **Assicurazione** — RCA + ARD, scadenza polizza
- **Tagliando** — basato su km percorsi (manuale: leggi km al pieno) o tempo (es. ogni 12 mesi)
- **Patente / CQC / ADR autista** — scadenze personali, non del mezzo

The `FlottaJobsController.CheckScadenze` endpoint is a scheduled job (row in `scheduler` table, runs daily at 06:00) that scans `_mezzi_scadenze` and:

1. Sends an email to the assegnatario + responsabile flotta 30 / 14 / 7 / 1 giorni before each deadline
2. Pushes a notification in-app via `INotificationRepository.EnqueueAsync` (the notification bell in the menubar lights up)
3. Logs the alert in `_mezzi_alert_log`

You can configure the lead-time intervals (30/14/7/1 vs 60/30/15 vs whatever) in `appsettings.json:FlottaMezzi:LeadTimes`.

### Geolocation

`GeolocationController.UpdatePosition` accepts position updates from any device that can POST a JSON payload:

```json
{ "mezzoId": 42, "lat": 45.4642, "lng": 9.1900, "speed": 60, "heading": 180, "timestamp": "2026-05-15T14:30:00Z" }
```

Source can be an OBD-II dongle (Teltonika FMB003, Queclink GV57), a smartphone app, an ELD-style fleet tracker. The endpoint inserts into `_mezzi_positions` (time-series, partitioned by month). The UI has a `map-list` widget (Google Maps + clustering) showing current position of every active mezzo, last-known if offline > 10 min, and a per-mezzo route playback.

We DO NOT ship a hardware integration in the free distribution — you bring your own device that POSTs to our endpoint. The contract is documented; any device that can hit `POST /api/Geolocation/UpdatePosition` with a bearer token works.

### Aggregazione costi

`FlottaJobsController.AggregaCosti` is another scheduled job (weekly). Reads:

- **Costi diretti** — manutenzioni, ricambi, carburante (import CSV dalle fuel card), assicurazione (rata mensile), bollo (rata annuale ammortizzata)
- **Costi indiretti** — leasing/noleggio, parcheggi, multe pagate dall'azienda
- **Km percorsi** — dal feed geolocation o lettura manuale al rifornimento

Produces:

- **Costo €/km per mezzo** — vista mensile e cumulativa
- **Costo €/km per driver** — utile per identificare guidatori che bruciano carburante o danneggiano i mezzi
- **Costo €/giorno di servizio** — diviso classe mezzo, utile per pricing dei lavori (es. *"quanto mi costa tenere un escavatore in cantiere?"*)
- **TCO** (Total Cost of Ownership) per mezzo su orizzonte 5 anni — utile per la decisione *"questo Iveco lo tengo o lo cambio?"*

Reports in `ReportingController`:

- **ReportCostiMezzo** — PDF/Excel, periodo selezionabile, dettaglio per voce di costo
- Drill-down dalla dashboard alla singola voce di spesa

### Dashboard

`/dashboard` shows:

- KPI tile: mezzi attivi / in officina / fermi
- Tabella scadenze imminenti (prossimi 30 giorni)
- Map widget con posizione live (richiede geolocation feed configurato)
- Chart costi mensili per categoria
- Top 5 mezzi per costo €/km (ultimi 3 mesi)

## Who installs this kind of app

It pays off if:

- You have **15+ veicoli** o attrezzature — sotto questo threshold un Excel + un Google Calendar + un'agenda della segretaria copre tutto
- Hai **multi-sede o cantieri mobili** — quando sai dove sta ogni mezzo in tempo reale eviti il "vado io a prenderlo, dove l'avete lasciato?"
- Operi in un settore **regolato** (trasporto merci pesanti, ADR, rifiuti) dove le scadenze documentali sono auditate
- Vuoi **smettere di pagare** €5–€15 per mezzo per mese al gestionale verticale (Targa Telematics, Vodafone Automotive Fleet, Wialon hosted) — la spesa mensile per 50 mezzi è €250–€750, l'app gira gratis su un server tuo

Non pay off se:
- Hai 5 mezzi o meno
- Vuoi white-glove SaaS, no infrastructure to manage — in quel caso prendi un servizio cloud
- Hai bisogno di integrazione nativa con DKV/Eni Card/UTA Card per import automatico carburante — il free ships con import CSV manuale; le integrazioni native sono nella roadmap commerciale

## Install

Stesso flusso degli altri free apps:

1. Download `FlottaMezzi-iis-v1.0.0-with-dbs.zip` da [Downloads](/downloads)
2. Unzip in `C:\inetpub\wwwroot\Flotta`
3. Restore i due `.bak` (`FlottaMezzi_Data` + `_Metadata`) su SQL Server 2022+
4. Edit `appsettings.json` per le 2 connection string (e opzionalmente la Google Maps API key se vuoi la mappa custom; senza chiave la mappa funziona ma con tile marcata "for development purposes")
5. IIS site, app pool No Managed Code, browse, login `admin_test / Test123!`

Per il feed geolocation: il device tracker deve fare `POST /api/Geolocation/UpdatePosition` con un bearer token. Il token si configura in `appsettings.json:FlottaMezzi:GeolocationApiKey`. Se non hai ancora un device, puoi simulare con `curl` + uno script bash per testare la mappa.

## License rule

Identica agli altri due free app:

> **FlottaMezzi è free as-shipped. Se ricompili l'app da sorgente serve una licenza WUIC.**

Lo ZIP free ti dà il binary pronto (`FlottaMezzi.dll`) con la `.lic` host-binding embedded che autorizza il runtime framework. Lo ZIP source ti dà il C# dell'app — ma ricompilarlo localmente produce un binary con identità diversa (PKT strong-name diverso, nessuna `WUIC.HostBindingLicense` embedded — non distribuiamo né la .snk né la chiave RSA privata che firma la .lic), quindi il framework smette di riconoscere l'host come autorizzato e cade sul controllo fingerprint standard.

Puoi estendere FlottaMezzi senza ricompilare il binary: aggiungi metadata via SQL, custom components Angular, custom report Stimulsoft, job schedulati nella tabella `scheduler`, configura un'API key geolocation diversa via `appsettings.json`. Aggiungere un controller nuovo (es. `FuelCardController.cs` per integrare DKV) richiede invece ricompilare `FlottaMezzi.dll`, quindi quello supera la soglia licenza.

Vedi [Pricing](/pricing) — Developer tier €600/anno per i sorgenti del framework + il diritto di distribuire binari FlottaMezzi ricompilati dentro i tuoi prodotti (integrazioni native fuel card, dongle OBD-II white-label, conservazione regolamentata dei dati tachigrafici).
