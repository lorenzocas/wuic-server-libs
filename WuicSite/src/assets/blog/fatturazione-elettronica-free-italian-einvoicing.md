---
title: "FatturazioneElettronica: a free Italian e-invoicing app with SDI integration"
slug: fatturazione-elettronica-free-italian-einvoicing
date: 2026-05-15
author: Lorenzo Castrico
description: "FatturazioneElettronica is a self-hosted FatturaPA / SDI integration: invoice editor, CADES-BES signature, XSD validation, four interchangeable SDI providers (DirectPec free, ArubaPec / FatturePec / PecIt commercial), conservation pipeline. Free distribution, MIT-friendly bundling rule, runs on your own SQL Server."
tags: einvoicing, fatturapa, sdi, italy, cades-bes, free-apps
---

The second of our three free apps tackles the most regulated piece of Italian B2B paperwork: **electronic invoicing through SDI** (Sistema di Interscambio). If you're invoicing in Italy, you already know the constraints — the invoice must be FatturaPA v1.2 XML, signed CADES-BES with a qualified certificate, sent to SDI, the SDI replies asynchronously with AT/RC/NS/MC/NE/DT receipts, and you have to keep both the invoice and the receipts in *conservazione a norma* for 10 years.

You can pay an intermediary €10–€30/month per partita IVA to handle all of it. Or you can run our `FatturazioneElettronica` app on your own server and pay a few euros a year for a PEC mailbox. This post is about what's in the free distribution and why we made it free.

## What ships in the free distribution

The `FatturazioneElettronica-iis-v1.0.0-with-dbs.zip` archive on the [Downloads page](/downloads) is a complete .NET 10 + Angular 21 app, IIS-ready. Inside:

### Editor & data model

- **Anagrafica clienti / fornitori** — including PIVA validation, codice fiscale, codice destinatario SDI, indirizzo PEC
- **Listini articoli** — multi-listino, unità di misura, IVA per riga
- **Fattura editor** — header (data, numero, divisa, riferimenti), righe articoli (con scaglioni IVA, sconti per riga e a piè di fattura), totali calcolati live, allegati PDF/JPG/EML
- **Documenti collegati** — DDT, preventivi, ordini, fattura accompagnatoria
- **Movimenti bancari** — import CSV + riconciliazione manuale con le fatture emesse / ricevute

### SDI provider abstraction

The interesting part. We have **four** interchangeable providers behind `ISdiProvider`, auto-selected at startup based on which subsection of `appsettings.json:Sdi` is configured:

- **`DirectPec`** (FREE) — sends the signed XML directly to SDI by sending an email from your own PEC mailbox to `sdi01@pec.fatturapa.it`. Costs whatever your PEC provider charges (Aruba PEC ~€5–€30/year). No middleman. The IMAP poller in `DirectPecSdiProvider.cs` polls the same PEC inbox for the SDI responses (AT/RC/NS/MC/NE/DT) and parses them into your local `_sdi_notifications` table
- **`ArubaPec`** — commercial intermediary (Aruba's "Fatturazione Elettronica" SOAP endpoint, `wstest.fatturazione.aruba.it/services/invoice`). Pay-per-invoice
- **`FatturePec`** — commercial intermediary (REST API at `api.fatturepec.com`)
- **`PecIt`** — commercial intermediary (REST at `api.pec.it`)
- **`Notarify`** — commercial intermediary
- **`MockSdiProvider`** — used in dev / e2e tests when none of the above are configured. Echoes back a synthetic AT receipt after 2 seconds

The free path (`DirectPec`) is the one to use if you want zero per-invoice cost. It works because SDI accepts invoices from any qualified PEC sender, not just from intermediaries. You can read the full provider matrix in [`Services/Sdi/`](https://github.com/...) in the source distribution.

### Signature & validation

- **`CadesBesSigner.cs`** — CADES-BES detached signature on the XML payload using a PKCS#12 certificate (`.p12`). Production: AgID qualified cert. Dev: `scripts/generate-dev-sdi-cert.ps1` produces a self-signed one (SDI rejects it but at least your XSD validator is happy)
- **`FatturaPaXsdValidator.cs`** — validates against `Schema_VFPR12.xsd` + `xmldsig-core-schema.xsd` (FatturaPA v1.2 from agenziaentrate.gov.it). Catches malformed XML before SDI rejects it with a NS notification (and burns one of your daily quota slots)

### Conservation

`Services/Conservation/` implements *conservazione a norma* — the legal 10-year retention requirement. The app exports a `pacchetto di archiviazione` quarterly: ZIP containing the original XML, the signed `.p7m`, the SDI receipts, an `IndiceSDI.xml`, a manifest file. You can hand the ZIP to a Conservatore Accreditato (Aruba, Namirial, InfoCert) or store it yourself with appropriate WORM media — the legal responsibility is yours, the format we ship is the one those conservators accept.

### Fiscal reports

`Services/FiscalReports/` produces:

- **Registro IVA vendite** + **Registro IVA acquisti** — Excel/PDF, filtri per periodo, totale imponibile/IVA per aliquota
- **Liquidazione IVA** — monthly / quarterly, calcolo a debito/credito, F24
- **Esterometro** (LIPE) — for clients/suppliers outside Italy
- **Spesometro** — historical, still shipped for back-compat

## Who is this for

It pays off if you're:

- A **commercialista** with 20–200 partite IVA clienti — saves the per-PIVA intermediary fee, keeps the data on your hardware
- A **mid-size company** that already runs an ERP but wants the e-invoicing module on-prem (e.g. compliance team prefers it not in someone else's cloud)
- A **software house** building a vertical (e-commerce, retail, autoricambi) and needs e-invoicing plumbing — drop our `Services/Sdi/` namespace into your app, replace our UI with yours

It does NOT pay off if you have <5 invoices/month — for that volume, an Aruba "Fatturazione Elettronica Easy" subscription at €4/month is cheaper than the operational cost of running a server.

## Install

Same as the other free apps:

1. Download `FatturazioneElettronica-iis-v1.0.0-with-dbs.zip` from [Downloads](/downloads)
2. Unzip into `C:\inetpub\wwwroot\EInvoice`
3. Restore the two `.bak` files (`FatturazioneElettronica_Data` + `_Metadata`) — SQL Server 2022+
4. Edit `appsettings.json`:
   - `ConnectionStrings`
   - `Sdi:Signer:Pkcs12Path` + `Pkcs12Password` (your qualified PKCS#12 cert, OR the dev cert from `generate-dev-sdi-cert.ps1`)
   - One of `Sdi:DirectPec` / `Sdi:ArubaPec` / `Sdi:FatturePec` (auto-selected — configure exactly one)
5. IIS site, no managed code app pool, browse, log in as `admin_test / Test123!`

We run this exact distribution at [einvoice.wuic-framework.com](https://einvoice.wuic-framework.com/) as our own dogfood instance.

## License rule

Same as the other free apps. Quoting:

> **FatturazioneElettronica is free as-shipped. If you rebuild the app from source you need a WUIC license.**

The free ZIP gives you the running binary (`FatturazioneElettronica.dll`) with an embedded host-binding `.lic` resource that authorizes the framework runtime. The source ZIP gives you the C# source of the app — but recompiling it locally produces a different binary identity (different strong-name PKT, no embedded `WUIC.HostBindingLicense` resource — we don't ship the .snk or the RSA private key that signs the .lic), so the framework runtime stops recognizing the host as authorized and falls back to the standard machine-fingerprint license check.

You can extend FatturazioneElettronica without recompiling the binary: add new metadata (rows in `_metadati__tabelle` / `_metadati__colonne`), add new Angular components in the frontend tree, add scheduled jobs (rows in the `scheduler` table), configure a different SDI provider via `appsettings.json` (the four built-in providers are picked automatically based on which subsection is configured — no code change needed to switch from `MockSdi` to `DirectPec` to `ArubaPec`). Writing a brand new SDI provider (implement `ISdiProvider`) however requires recompiling `FatturazioneElettronica.dll`, so that crosses the license line.

See [Pricing](/pricing) — Developer tier €600/year unlocks both the framework source and the right to ship recompiled FatturazioneElettronica binaries.
