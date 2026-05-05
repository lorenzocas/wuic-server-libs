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

export function newCliente(overrides = {}) {
  const u = _uniq();
  return {
    // _e2e_cl<6>_<2> = max 16 char (margin under 20)
    codice: `${PREFIX}cl${RUN_ID.slice(0, 6)}${u}`,
    ragione_sociale: `Cliente E2E Test ${RUN_ID}`,
    tipo_soggetto: 'AZIENDA',
    partita_iva: '12345678901',
    codice_fiscale: '12345678901',
    indirizzo: 'Via E2E 1',
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
  return {
    codice: `${PREFIX}fr${RUN_ID.slice(0, 6)}${u}`,
    ragione_sociale: `Fornitore E2E Test ${RUN_ID}`,
    tipo_soggetto: 'AZIENDA',
    partita_iva: '98765432109',
    indirizzo: 'Via Fornitore 1',
    cap: '00100',
    citta: 'Roma',
    provincia: 'RM',
    nazione: 'IT',
    ...overrides
  };
}

export function newProdotto(overrides = {}) {
  const u = _uniq();
  return {
    codice: `${PREFIX}pr${RUN_ID.slice(0, 6)}${u}`,
    descrizione: `Prodotto E2E Test ${RUN_ID}`,
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
