# Google Ads — campagne WUIC Framework

Materiale pronto-da-incollare per il lancio ads previsto dal piano Visibilità
W9–12. **Budget totale: 500 €/mese** su 3 campagne.

> Stato: la parte TECNICA è già in codebase e deployata ma **dormiente**
> (`src/app/services/analytics.config.ts` con `ADS_CONVERSION_ID` placeholder).
> Si accende incollando l'ID conversione — vedi §2.

## 0) Prerequisiti (una tantum, da fare nell'account Google Ads)

1. Crea l'account Google Ads (fatturazione + fuso Europe/Rome + valuta EUR).
2. **Collega Search Console** (verifica dominio wuic-framework.com già fatta per la sitemap).
3. NON attivare le "raccomandazioni automatiche" (auto-apply): applicano keyword
   broad e budget senza controllo. Impostazioni → Raccomandazioni → disattiva auto-apply.

## 1) Conversion actions da creare (Strumenti → Conversioni → +Nuova → Sito web)

Crea 4 azioni **manuali** (non "importate da GA4": qui NON usiamo GA4).
Per ognuna: categoria, valore, conteggio, finestra.

| Nome azione | Categoria | Conteggio | Valore | Note |
|---|---|---|---|---|
| `sandbox_open` | Altro (Lead) | Uno | 5 € | apre la demo live — segnale di interesse alto |
| `download_click` | Download | Uno | 15 € | scarica il pacchetto — intento forte |
| `buy_click` | Inizio checkout | Ogni | 60 € | apre il flusso d'acquisto (≈10% di 600 €) |
| `start_cta` | Altro | Uno | 2 € | CTA sulla landing — micro-conversione, NON usarla per l'ottimizzazione |

**Ottimizza su `download_click` + `buy_click`** (metti `sandbox_open` come
secondaria: "Osserva"). `start_cta` serve solo a leggere il funnel.

Dopo averle create, copia l'**ID conversione** (`AW-XXXXXXXXXX`, uguale per tutte)
e i **label** di ciascuna (la parte dopo lo slash in `AW-123.../AbCd_EfGh`).

## 2) Accendere il tracking nel sito (2 minuti)

In `WuicSite/src/app/services/analytics.config.ts`:

```ts
export const ADS_CONVERSION_ID = 'AW-1234567890';        // <- il tuo ID
export const CONVERSION_LABELS: Record<string, string> = {
  sandbox_open:   'AbCd_EfGhIjKl',                        // <- label dell'azione
  download_click: 'MnOp_QrStUvWx',
  buy_click:      'YzAb_CdEfGhIj',
  start_cta:      'KlMn_OpQrStUv',
};
```

Poi deploy del sito. Da quel momento:
- Consent Mode v2 parte in `denied` (EU-first) e passa a `granted` solo se
  l'utente accetta la categoria marketing nel cookie banner — già implementato;
- le conversioni si agganciano da sole ai goal già cablati (`/start`, `/pricing`).

**Verifica**: apri `/start?m=competitor`, accetta i cookie, clicca "Try the live
sandbox" → in Google Ads la conversione appare entro ~3 ore (Strumenti →
Conversioni → colonna "Tutte le conv.").

## 3) Le 3 campagne

Dettaglio keyword + annunci: [campaigns.md](campaigns.md).

| # | Campagna | Budget/mese | Geo | Obiettivo |
|---|---|---|---|---|
| **A** | Competitor EN | 200 € (~6,6 €/g) | US, UK, DE, NL, SE, DK, NO, FI | Intercettare chi cerca alternative self-hosted a Retool & co. |
| **B** | Categoria EN | 150 € (~5 €/g) | idem A | Chi cerca la categoria (internal tools / CRUD generator / low-code .NET) |
| **C** | Italia | 150 € (~5 €/g) | Italia | Software house e PMI IT, in italiano |

**Impostazioni comuni** (valgono per tutte e tre):
- Tipo: **Rete di ricerca** (Search). **Disattiva "Rete Display"** e i partner di ricerca (spendono senza intento).
- Strategia: parti con **CPC manuale avanzato** o *Massimizza clic con CPC max 1,50 €*
  per le prime 2–3 settimane (servono dati), poi passa a **Massimizza conversioni**
  quando hai ≥15 conversioni/mese.
- Lingua: A/B inglese · C italiano.
- Targeting località: **"Presenza: persone che si trovano nell'area"** (NON "interesse":
  eviti click da fuori area).
- Rotazione annunci: ottimizza per i clic migliori.
- Programmazione: lun–ven 08:00–20:00 (ora locale target). Il B2B nel weekend spreca.
- Estensioni: vedi §4.

## 4) Asset comuni (Estensioni → a livello account)

**Sitelink** (max 25 char titolo / 35 char descrizione):
| Titolo | Descrizione | URL |
|---|---|---|
| Live demo, no signup | Try the framework in your browser | /sandbox |
| Pricing — flat, no seat | €600–1,200/year, yours to keep | /pricing |
| vs Retool & Budibase | Honest feature comparison | /comparison |
| Download & install | Windows or Linux, 10 minutes | /downloads |

**Callout** (25 char): `No per-seat pricing` · `Self-hosted, your servers` · `.NET 10 + Angular 21` · `Windows & Linux` · `Free apps included` · `No cloud lock-in`

**Snippet strutturati** — intestazione "Tipi": `CRM` · `E-invoicing` · `Fleet management` · `Dashboards` · `Reports` · `Workflows`

## 5) Negative keyword list condivisa (Strumenti → Elenchi negativi)

Crea UN elenco `WUIC – global negatives` e collegalo a tutte e 3 le campagne:

```
free                    (broad: cercano solo gratis)
crack, torrent, nulled
tutorial, course, learn, certification
jobs, salary, career, hiring, freelance
what is, meaning, definition, wikipedia
github, open source alternative to
review, reviews, reddit          (informazionali; li copriamo con l'organico)
python, php, java, laravel, django, wordpress   (stack non nostro)
salesforce, sap, dynamics        (enterprise, non il nostro target)
excel, google sheets, airtable, notion          (foglio-di-calcolo, altro problema)
```

> Nota: `airtable`/`notion` come **negative** perché chi li cerca vuole un
> foglio-di-calcolo cloud, non un framework installabile: click costoso e
> irrilevante. `retool`/`budibase`/`appsmith` invece li vogliamo (campagna A).

## 6) Checklist di lancio

- [ ] Account creato, fatturazione ok, auto-apply raccomandazioni **disattivato**
- [ ] 4 conversion actions create (§1)
- [ ] `analytics.config.ts` compilato + **deploy del sito** (§2)
- [ ] Elenco negative condiviso creato e collegato (§5)
- [ ] Campagne A, B, C create da [campaigns.md](campaigns.md)
- [ ] Estensioni sitelink/callout/snippet a livello account (§4)
- [ ] Test conversione end-to-end (§2) **prima** di alzare i budget
- [ ] Promemoria a +7 giorni: leggere il **report Termini di ricerca** e aggiungere negative

## 7) Cosa guardare dopo il lancio (e quando intervenire)

| Quando | Cosa | Azione |
|---|---|---|
| Giorno 3 | Termini di ricerca | Aggiungi negative su tutto ciò che non è intento commerciale |
| Giorno 7 | CTR per ad group | CTR < 2% → riscrivi le headline (message match debole) |
| Giorno 14 | Costo per conversione | > 60 € → riduci le keyword broad, tieni le phrase/exact |
| Giorno 30 | Confronto A vs B vs C | Sposta budget sulla campagna col miglior costo/conversione |

**Aspettativa realistica** con 500 €/mese: ~300–600 clic/mese totali, e
**pochissime** conversioni forti (download/acquisto) — l'obiettivo dei primi 30
giorni è **imparare quali query convertono**, non fare fatturato. Non giudicare
il canale prima di 30 giorni e 2 cicli di pulizia negative.
