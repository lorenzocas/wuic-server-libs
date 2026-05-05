/* ============================================================
   FatturazioneElettronica — Seed dati di prova lookup base
   ============================================================
   Idempotente via NOT EXISTS check su 'codice'.
   Eseguire DOPO 04_triggers.sql.
   ============================================================ */

SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;

/* ---------- Codici IVA standard italiani ---------- */
INSERT INTO dbo.codici_iva (codice, descrizione, aliquota, natura_sdi, indetraibile)
SELECT v.codice, v.descrizione, v.aliquota, v.natura_sdi, v.indetraibile
FROM (VALUES
  ('22',     'Aliquota ordinaria 22%',                 22.00, NULL,   0),
  ('10',     'Aliquota ridotta 10%',                   10.00, NULL,   0),
  ('5',      'Aliquota ridotta 5%',                     5.00, NULL,   0),
  ('4',      'Aliquota minima 4%',                      4.00, NULL,   0),
  ('0-N1',   'Escluso ex art. 15 (N1)',                 0.00, 'N1',   0),
  ('0-N2.1', 'Non soggetto art. 7-7septies (N2.1)',     0.00, 'N2.1', 0),
  ('0-N2.2', 'Non soggetto - altri casi (N2.2)',        0.00, 'N2.2', 0),
  ('0-N3.1', 'Non imponibile - esportazioni (N3.1)',    0.00, 'N3.1', 0),
  ('0-N3.5', 'Non imponibile - dichiarazione intento (N3.5)', 0.00, 'N3.5', 0),
  ('0-N4',   'Esente art. 10 (N4)',                     0.00, 'N4',   0),
  ('0-N6.1', 'Reverse charge - cessione rottami (N6.1)',0.00, 'N6.1', 0),
  ('0-N7',   'IVA assolta in altro stato UE (N7)',      0.00, 'N7',   0)
) v(codice, descrizione, aliquota, natura_sdi, indetraibile)
WHERE NOT EXISTS (SELECT 1 FROM dbo.codici_iva c WHERE c.codice = v.codice);

/* ---------- Unita' di misura standard ---------- */
INSERT INTO dbo.unita_misura (codice, descrizione)
SELECT v.codice, v.descrizione FROM (VALUES
  ('pz', 'Pezzi'),
  ('kg', 'Chilogrammi'),
  ('g',  'Grammi'),
  ('lt', 'Litri'),
  ('ml', 'Millilitri'),
  ('m',  'Metri'),
  ('m2', 'Metri quadri'),
  ('m3', 'Metri cubi'),
  ('h',  'Ore'),
  ('gg', 'Giorni'),
  ('cad','Cadauno'),
  ('a corpo','A corpo'),
  ('conf','Confezione'),
  ('km', 'Chilometri')
) v(codice, descrizione)
WHERE NOT EXISTS (SELECT 1 FROM dbo.unita_misura u WHERE u.codice = v.codice);

/* ---------- Modalita' di pagamento (codifica SDI) ---------- */
INSERT INTO dbo.pagamenti (codice_sdi, descrizione, giorni_scadenza, tipo_scadenza, n_rate)
SELECT v.codice_sdi, v.descrizione, v.giorni, v.tipo, v.rate FROM (VALUES
  ('MP01', 'Contanti',                                  0,   'DF', 1),
  ('MP02', 'Assegno',                                   0,   'DF', 1),
  ('MP05', 'Bonifico bancario',                         30,  'DF', 1),
  ('MP05', 'Bonifico bancario 30gg DF',                 30,  'DF', 1),
  ('MP05', 'Bonifico bancario 60gg DF',                 60,  'DF', 1),
  ('MP05', 'Bonifico bancario 30gg FM',                 30,  'FM', 1),
  ('MP05', 'Bonifico bancario 60gg FM',                 60,  'FM', 1),
  ('MP05', 'Bonifico 30/60/90gg FM',                    30,  'FM', 3),
  ('MP08', 'Carta di credito',                          0,   'DF', 1),
  ('MP12', 'RIBA 30gg DF',                              30,  'DF', 1),
  ('MP12', 'RIBA 60gg DF',                              60,  'DF', 1),
  ('MP19', 'SEPA Direct Debit',                         0,   'DF', 1),
  ('MP23', 'PagoPA',                                    0,   'DF', 1)
) v(codice_sdi, descrizione, giorni, tipo, rate)
WHERE NOT EXISTS (SELECT 1 FROM dbo.pagamenti p WHERE p.descrizione = v.descrizione);

PRINT 'Seed lookup applicato.';
