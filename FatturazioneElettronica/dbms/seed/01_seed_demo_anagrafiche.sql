-- ====================================================================
-- 01_seed_demo_anagrafiche.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Seed di anagrafiche demo realistiche per popolare le dashboard
-- (#17 cash-flow, #18 top clienti, #19 aging crediti, ecc.) con dati
-- significativi senza dipendere dai test e2e (che si cancellano dopo).
--
-- Idempotente: usa MERGE su `codice` come business key.
--
-- Convenzione codici: DEMO_CLI_NN, DEMO_FOR_NN
-- (NON usare prefisso _e2e_ per non confonderli con dati di test).
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- ─────────── CLIENTI demo ───────────
;WITH src(codice, ragione_sociale, partita_iva, citta, provincia, email, telefono) AS (
  SELECT * FROM (VALUES
    ('DEMO_CLI_01', 'Acme Forniture S.r.l.',          '04302440960', 'Milano',   'MI', 'info@acme-forniture.it',     '02 1234567'),
    ('DEMO_CLI_02', 'Bianchi & Figli S.p.A.',         '08106710158', 'Roma',     'RM', 'amministrazione@bianchi.it', '06 9876543'),
    ('DEMO_CLI_03', 'Costruzioni Verdi S.r.l.',       '03245678901', 'Torino',   'TO', 'verdi@costruzioniverdi.it',  '011 555888'),
    ('DEMO_CLI_04', 'Delta Servizi S.r.l.',           '12345678901', 'Bologna',  'BO', 'commerciale@deltaservizi.it','051 333444'),
    ('DEMO_CLI_05', 'Edilizia Romana S.p.A.',         '23456789012', 'Roma',     'RM', 'edilizia@edilromana.it',     '06 7777888'),
    ('DEMO_CLI_06', 'Ferrari Macchinari S.r.l.',      '34567890123', 'Modena',   'MO', 'macchinari@ferrari-mac.it',  '059 222333'),
    ('DEMO_CLI_07', 'Galassia Trasporti S.r.l.',      '45678901234', 'Genova',   'GE', 'logistica@galassiatrasp.it', '010 444555'),
    ('DEMO_CLI_08', 'Hotel Belvedere S.r.l.',         '56789012345', 'Firenze',  'FI', 'reception@hotelbelvedere.it','055 666777'),
    ('DEMO_CLI_09', 'Industrial Solutions S.p.A.',    '67890123456', 'Brescia',  'BS', 'sales@industrialsol.it',     '030 888999'),
    ('DEMO_CLI_10', 'Lombardo Costruzioni S.r.l.',    '78901234567', 'Bergamo',  'BG', 'info@lombardocost.it',       '035 111222'),
    ('DEMO_CLI_11', 'Marini Impianti S.r.l.',         '89012345678', 'Verona',   'VR', 'impianti@marini.it',         '045 555000'),
    ('DEMO_CLI_12', 'Quadrifoglio Ristorazione',      '90123456789', 'Padova',   'PD', 'ordini@quadrifoglio.it',     '049 333000')
  ) AS s(codice, ragione_sociale, partita_iva, citta, provincia, email, telefono)
)
MERGE dbo.clienti AS tgt
USING src ON tgt.codice = src.codice
WHEN MATCHED THEN UPDATE SET
    ragione_sociale = src.ragione_sociale,
    partita_iva = src.partita_iva,
    codice_fiscale = src.partita_iva,
    citta = src.citta,
    provincia = src.provincia,
    email = src.email,
    telefono = src.telefono,
    tipo_soggetto = 'AZIENDA',
    nazione = 'IT',
    indirizzo = 'Via Roma 1',
    cap = '00100',
    cancellato = 0
WHEN NOT MATCHED THEN INSERT (
    codice, ragione_sociale, tipo_soggetto, partita_iva, codice_fiscale,
    indirizzo, cap, citta, provincia, nazione, email, telefono,
    pec, codice_destinatario, cancellato
) VALUES (
    src.codice, src.ragione_sociale, 'AZIENDA', src.partita_iva, src.partita_iva,
    'Via Roma 1', '00100', src.citta, src.provincia, 'IT', src.email, src.telefono,
    src.codice + '@pec.example.it', '0000000', 0
);
PRINT 'CLIENTI demo seed completato.';
GO

-- ─────────── FORNITORI demo ───────────
;WITH src(codice, ragione_sociale, partita_iva, citta, provincia, iban) AS (
  SELECT * FROM (VALUES
    ('DEMO_FOR_01', 'Cartiera del Garda S.p.A.',     '11122233344', 'Brescia',  'BS', 'IT60X0542811101000000123456'),
    ('DEMO_FOR_02', 'Plastica Adriatica S.r.l.',     '22233344455', 'Pesaro',   'PU', 'IT60X0542811101000000234567'),
    ('DEMO_FOR_03', 'Metalli Industriali S.p.A.',    '33344455566', 'Brescia',  'BS', 'IT60X0542811101000000345678'),
    ('DEMO_FOR_04', 'Energia Verde Italia S.r.l.',   '44455566677', 'Roma',     'RM', 'IT60X0542811101000000456789'),
    ('DEMO_FOR_05', 'TecnoSoft Italia S.p.A.',       '55566677788', 'Milano',   'MI', 'IT60X0542811101000000567890'),
    ('DEMO_FOR_06', 'Logistica Express S.r.l.',      '66677788899', 'Bologna',  'BO', 'IT60X0542811101000000678901'),
    ('DEMO_FOR_07', 'Materiali Edili Veneto',        '77788899900', 'Padova',   'PD', 'IT60X0542811101000000789012'),
    ('DEMO_FOR_08', 'Chimica Padana S.r.l.',         '88899900011', 'Cremona',  'CR', 'IT60X0542811101000000890123')
  ) AS s(codice, ragione_sociale, partita_iva, citta, provincia, iban)
)
MERGE dbo.fornitori AS tgt
USING src ON tgt.codice = src.codice
WHEN MATCHED THEN UPDATE SET
    ragione_sociale = src.ragione_sociale,
    partita_iva = src.partita_iva,
    codice_fiscale = src.partita_iva,
    citta = src.citta,
    provincia = src.provincia,
    iban = src.iban,
    tipo_soggetto = 'AZIENDA',
    nazione = 'IT',
    cancellato = 0
WHEN NOT MATCHED THEN INSERT (
    codice, ragione_sociale, tipo_soggetto, partita_iva, codice_fiscale,
    indirizzo, cap, citta, provincia, nazione, iban, cancellato
) VALUES (
    src.codice, src.ragione_sociale, 'AZIENDA', src.partita_iva, src.partita_iva,
    'Via Industria 5', '20100', src.citta, src.provincia, 'IT', src.iban, 0
);
PRINT 'FORNITORI demo seed completato.';
GO

PRINT 'Totale anagrafiche demo: 12 clienti + 8 fornitori.';
GO
