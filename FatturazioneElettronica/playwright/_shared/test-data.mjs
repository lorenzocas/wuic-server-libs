/**
 * Generatori di test data deterministici.
 * Usano un prefisso `_e2e_` cosi' i test possono pulire automaticamente
 * dopo l'esecuzione (DELETE WHERE codice LIKE '_e2e_%').
 */

// RUN_ID corto (max 8 char) per stare dentro VARCHAR(20) di `codice`
// quando combinato col prefisso "_e2e_<TT>" (TT = type 2 char).
const RUN_ID = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-2);

// Counter monotonico per generare codici univoci INTRA-run quando lo stesso
// generator e' chiamato piu' volte (es. test 01 e test 08 entrambi creano
// clienti). Senza questo, tutti i clienti avrebbero codice identico
// `_e2e_cl<RUN_ID>` e l'INSERT dopo il primo fallirebbe con UNIQUE
// violation su `codice`. Il suffisso e' base36 a 4 char (`__<NN>`) cosi' il
// codice resta entro VARCHAR(20): `_e2e_cl<6>__<2>` = max 17 char.
let _seq = 0;
function _uniq() { return (_seq++).toString(36).padStart(2, '0').slice(-2); }

export const PREFIX = '_e2e_';

/**
 * Pool di nomi fantasia realistici per dati di test piu' leggibili nei chart/screenshot.
 * Tutti gli elementi mantengono il prefisso `_e2e_` su `codice` (per cleanup), ma la
 * `ragione_sociale` e' un nome italiano plausibile invece di "TC_TOP_A_504394_AAA".
 */
export const NOMI_AZIENDE_FANTASY = [
  'Acme Forniture S.r.l.',
  'Bianchi & Figli S.p.A.',
  'Costruzioni Verdi S.r.l.',
  'Delta Servizi S.r.l.',
  'Edilizia Romana S.p.A.',
  'Ferrari Macchinari S.r.l.',
  'Galassia Trasporti S.r.l.',
  'Hotel Belvedere S.r.l.',
  'Industrial Solutions S.p.A.',
  'Lombardo Costruzioni S.r.l.',
  'Marini Impianti S.r.l.',
  'Nautilus Marine S.r.l.',
  'Officina Meccanica Toscana',
  'Panini Distribuzione S.r.l.',
  'Quadrifoglio Ristorazione',
  'Rossi Costruzioni S.p.A.',
  'Studio Legale Bianchi',
  'Trasporti Adriatici S.r.l.',
  'Unione Viticoltori S.r.l.',
  'Vesuvio Forniture S.r.l.',
  'Wellness Center Roma',
  'Xenon Elettronica S.r.l.',
  'Yacht Club Liguria',
  'Zaffiro Gioielli S.r.l.'
];
export const NOMI_FORNITORI_FANTASY = [
  'Cartiera del Garda S.p.A.',
  'Plastica Adriatica S.r.l.',
  'Metalli Industriali S.p.A.',
  'Energia Verde Italia S.r.l.',
  'TecnoSoft Italia S.p.A.',
  'Logistica Express S.r.l.',
  'Materiali Edili Veneto',
  'Chimica Padana S.r.l.'
];

let _nomeAziendaIdx = 0;
let _nomeFornitoreIdx = 0;

/** Restituisce un nome fantasy diverso ogni call (round-robin sul pool). */
export function nextNomeAzienda() {
  const n = NOMI_AZIENDE_FANTASY[_nomeAziendaIdx % NOMI_AZIENDE_FANTASY.length];
  _nomeAziendaIdx++;
  return n;
}
export function nextNomeFornitore() {
  const n = NOMI_FORNITORI_FANTASY[_nomeFornitoreIdx % NOMI_FORNITORI_FANTASY.length];
  _nomeFornitoreIdx++;
  return n;
}

/**
 * Variante di `newCliente()` che usa un nome fantasy realistico (es.
 * "Acme Forniture S.r.l.") invece del placeholder "Cliente E2E Test xxx".
 *
 * Marker visivo: " (e2e)" suffisso alla ragione_sociale → identifica le
 * righe di test nei chart/screenshot in modo discreto.
 * Cleanup primary: `codice LIKE '_e2e_%'` (sempre presente).
 * Cleanup fallback (se cleanup primario fallisce per FK): `ragione_sociale LIKE '% (e2e)'`.
 */
export function newClienteRealistico(overrides = {}) {
  const u = _uniq();
  const nome = nextNomeAzienda();
  return {
    codice: `${PREFIX}cl${RUN_ID.slice(0, 6)}${u}`,
    ragione_sociale: `${nome} (e2e)`,
    tipo_soggetto: 'AZIENDA',
    partita_iva: '12345678901',
    codice_fiscale: '12345678901',
    indirizzo: 'Via Roma 1',
    cap: '00100',
    citta: 'Roma',
    provincia: 'RM',
    nazione: 'IT',
    pec: `e2e_${RUN_ID}@pec.example.it`,
    codice_destinatario: '0000000',
    email: `e2e_${RUN_ID}@example.it`,
    ...overrides
  };
}

export function newFornitoreRealistico(overrides = {}) {
  const u = _uniq();
  const nome = nextNomeFornitore();
  return {
    codice: `${PREFIX}fr${RUN_ID.slice(0, 6)}${u}`,
    ragione_sociale: `${nome} (e2e)`,
    tipo_soggetto: 'AZIENDA',
    partita_iva: '98765432109',
    indirizzo: 'Via Industria 5',
    cap: '00100',
    citta: 'Milano',
    provincia: 'MI',
    nazione: 'IT',
    ...overrides
  };
}

export function newCliente(overrides = {}) {
  const u = _uniq();
  // Default usa nome fantasy realistico (vedi pool NOMI_AZIENDE_FANTASY).
  // Per nomi custom passa override `ragione_sociale`. Tutti i test devono
  // sempre suffissare " (e2e)" per identificare le righe nei chart/UI.
  const nome = nextNomeAzienda();
  return {
    codice: `${PREFIX}cl${RUN_ID.slice(0, 6)}${u}`,
    ragione_sociale: `${nome} (e2e)`,
    tipo_soggetto: 'AZIENDA',
    partita_iva: '12345678901',
    codice_fiscale: '12345678901',
    indirizzo: 'Via Roma 1',
    cap: '00100',
    citta: 'Roma',
    provincia: 'RM',
    nazione: 'IT',
    pec: `e2e_${RUN_ID}@pec.example.it`,
    codice_destinatario: '0000000',
    email: `e2e_${RUN_ID}@example.it`,
    ...overrides
  };
}

export function newFornitore(overrides = {}) {
  const u = _uniq();
  const nome = nextNomeFornitore();
  return {
    codice: `${PREFIX}fr${RUN_ID.slice(0, 6)}${u}`,
    ragione_sociale: `${nome} (e2e)`,
    tipo_soggetto: 'AZIENDA',
    partita_iva: '98765432109',
    indirizzo: 'Via Industria 5',
    cap: '00100',
    citta: 'Milano',
    provincia: 'MI',
    nazione: 'IT',
    ...overrides
  };
}

// Pool descrittivi prodotti (anche qui niente "Prodotto E2E Test xxx").
export const NOMI_PRODOTTI_FANTASY = [
  'Servizio consulenza ore',
  'Manutenzione mensile',
  'Licenza software annuale',
  'Materiale ufficio',
  'Formazione una giornata',
  'Pacchetto base',
  'Supporto tecnico premium',
  'Hosting cloud annuo',
  'Installazione apparato',
  'Trasporto e consegna'
];
let _nomeProdottoIdx = 0;
function nextNomeProdotto() {
  const n = NOMI_PRODOTTI_FANTASY[_nomeProdottoIdx % NOMI_PRODOTTI_FANTASY.length];
  _nomeProdottoIdx++;
  return n;
}

export function newProdotto(overrides = {}) {
  const u = _uniq();
  return {
    codice: `${PREFIX}pr${RUN_ID.slice(0, 6)}${u}`,
    descrizione: `${nextNomeProdotto()} (e2e)`,
    tipo: 'BENE',
    prezzo_vendita: 100.0,
    ...overrides
  };
}

export function newFatturaInviata(clienteId, overrides = {}) {
  return {
    data_documento: new Date().toISOString().slice(0, 10),
    cliente_id: clienteId,
    causale: `Fattura E2E ${RUN_ID}`,
    stato: 'BOZZA',
    // anno + numero + progressivo: assegnati dal trigger SQL
    imponibile: 0,
    iva: 0,
    totale: 0,
    ...overrides
  };
}

export function newRigaFattura(fatturaId, codiceIvaId, unitaMisuraId, overrides = {}) {
  return {
    fattura_id: fatturaId,
    riga: 1,
    descrizione: `Riga E2E ${RUN_ID}`,
    quantita: 1,
    prezzo_unitario: 100.0,
    sconto_perc: 0,
    codice_iva_id: codiceIvaId,
    unita_misura_id: unitaMisuraId,
    imponibile_riga: 100.0,
    iva_riga: 22.0,
    totale_riga: 122.0,
    ...overrides
  };
}

export function newScadenza(fatturaInviataId, clienteId, overrides = {}) {
  return {
    tipo: 'INCASSO',
    fattura_inviata_id: fatturaInviataId,
    cliente_id: clienteId,
    data_scadenza: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
    importo: 122.0,
    importo_pagato: 0,
    stato: 'APERTA',
    rata_n: 1,
    rata_totale: 1,
    ...overrides
  };
}

export { RUN_ID };
