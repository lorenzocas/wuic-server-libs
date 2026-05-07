-- ====================================================================
-- 02_seed_demo_prodotti.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Seed di prodotti/servizi demo realistici per popolare l'anagrafica
-- prodotti (oggi vuota). Idempotente: MERGE su `codice` business key.
--
-- Distribuzione:
--   - 8 prodotti (BENE) categoria Forniture/Materiali, IVA 22%
--   - 8 servizi (SERVIZIO) categoria Consulenza/Manutenzione, IVA 22%
--   - 2 prodotti agroalimentari IVA 10%
--   - 1 prodotto editoriale IVA 4%
--
-- Codici categoria: usano lookup su codici_iva (id) + unita_misura (id)
-- gia' seedati dallo schema base.
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- Lookup IDs (resilienti se gli ID sono diversi tra istanze)
DECLARE @iva22 INT = (SELECT TOP 1 id FROM dbo.codici_iva WHERE aliquota = 22.00);
DECLARE @iva10 INT = (SELECT TOP 1 id FROM dbo.codici_iva WHERE aliquota = 10.00);
DECLARE @iva4  INT = (SELECT TOP 1 id FROM dbo.codici_iva WHERE aliquota = 4.00);

DECLARE @um_pz  INT = (SELECT TOP 1 id FROM dbo.unita_misura WHERE codice = 'pz');
DECLARE @um_h   INT = (SELECT TOP 1 id FROM dbo.unita_misura WHERE codice = 'h');
DECLARE @um_kg  INT = (SELECT TOP 1 id FROM dbo.unita_misura WHERE codice = 'kg');
DECLARE @um_corpo INT = (SELECT TOP 1 id FROM dbo.unita_misura WHERE codice = 'a corpo');

;WITH src(codice, descrizione, tipo, categoria, unita_misura_id, codice_iva_id, prezzo_vendita, prezzo_acquisto) AS (
  SELECT * FROM (VALUES
    -- BENI 22%
    ('PROD001', 'Notebook business 15"',           'BENE', 'Hardware',          @um_pz,    @iva22,  890.00,  680.00),
    ('PROD002', 'Monitor 27" 4K',                  'BENE', 'Hardware',          @um_pz,    @iva22,  420.00,  320.00),
    ('PROD003', 'Stampante laser multifunzione',   'BENE', 'Hardware',          @um_pz,    @iva22,  350.00,  260.00),
    ('PROD004', 'Toner stampante laser',           'BENE', 'Materiali consumo', @um_pz,    @iva22,   85.00,   55.00),
    ('PROD005', 'Carta A4 risma 500 fogli',        'BENE', 'Forniture ufficio', @um_pz,    @iva22,    6.50,    4.20),
    ('PROD006', 'Sedia ergonomica direzionale',    'BENE', 'Arredamento',       @um_pz,    @iva22,  295.00,  220.00),
    ('PROD007', 'Scrivania regolabile elettrica',  'BENE', 'Arredamento',       @um_pz,    @iva22,  680.00,  510.00),
    ('PROD008', 'Cavo HDMI 2m certificato',        'BENE', 'Materiali consumo', @um_pz,    @iva22,   15.00,    8.00),

    -- SERVIZI 22%
    ('SRV001',  'Consulenza ICT - Senior',         'SERVIZIO', 'Consulenza',     @um_h,     @iva22,  120.00, NULL),
    ('SRV002',  'Consulenza ICT - Junior',         'SERVIZIO', 'Consulenza',     @um_h,     @iva22,   75.00, NULL),
    ('SRV003',  'Manutenzione mensile sistemi',    'SERVIZIO', 'Manutenzione',   @um_corpo, @iva22,  450.00, NULL),
    ('SRV004',  'Backup off-site cloud annuo',     'SERVIZIO', 'Cloud',          @um_corpo, @iva22,  890.00, NULL),
    ('SRV005',  'Formazione aziendale 1 giornata', 'SERVIZIO', 'Formazione',     @um_corpo, @iva22,  680.00, NULL),
    ('SRV006',  'Audit sicurezza informatica',     'SERVIZIO', 'Sicurezza',      @um_corpo, @iva22, 1500.00, NULL),
    ('SRV007',  'Sviluppo software custom',        'SERVIZIO', 'Sviluppo',       @um_h,     @iva22,   95.00, NULL),
    ('SRV008',  'Hosting cloud annuale',           'SERVIZIO', 'Cloud',          @um_corpo, @iva22,  390.00, NULL),

    -- BENI agroalimentari 10%
    ('FOOD001', 'Olio extravergine oliva 1L',      'BENE', 'Alimentari',        @um_pz,    @iva10,   12.50,    7.80),
    ('FOOD002', 'Pasta artigianale kg',            'BENE', 'Alimentari',        @um_kg,    @iva10,    8.20,    5.10),

    -- BENE editoriale 4%
    ('BOOK001', 'Manuale tecnico illustrato',      'BENE', 'Editoria',          @um_pz,    @iva4,    35.00,   18.00)
  ) AS s(codice, descrizione, tipo, categoria, unita_misura_id, codice_iva_id, prezzo_vendita, prezzo_acquisto)
)
MERGE dbo.prodotti AS tgt
USING src ON tgt.codice = src.codice
WHEN MATCHED THEN UPDATE SET
    descrizione = src.descrizione,
    tipo = src.tipo,
    categoria = src.categoria,
    unita_misura_id = src.unita_misura_id,
    codice_iva_id = src.codice_iva_id,
    prezzo_vendita = src.prezzo_vendita,
    prezzo_acquisto = src.prezzo_acquisto,
    attivo = 1,
    cancellato = 0
WHEN NOT MATCHED THEN INSERT (
    codice, descrizione, tipo, categoria,
    unita_misura_id, codice_iva_id, prezzo_vendita, prezzo_acquisto,
    attivo, cancellato
) VALUES (
    src.codice, src.descrizione, src.tipo, src.categoria,
    src.unita_misura_id, src.codice_iva_id, src.prezzo_vendita, src.prezzo_acquisto,
    1, 0
);
PRINT 'PRODOTTI demo seed completato (19 prodotti/servizi).';
GO
