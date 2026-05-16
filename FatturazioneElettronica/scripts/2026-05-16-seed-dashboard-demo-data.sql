-- =============================================================================
-- 2026-05-16 — Seed dati demo per le 4 dashboard finanze
--   - aging_crediti      → richiede scadenze INCASSO + clienti attivi
--   - aging_debiti       → richiede scadenze PAGAMENTO + fornitori attivi
--   - cashflow_forecast  → richiede scadenze APERTA con data BETWEEN today AND +90gg
--   - top_clienti        → richiede fatture_inviate anno corrente + clienti attivi
--
-- Le viste filtrano `cancellato = 0` su clienti/fornitori (vincolo che resta).
-- Quindi i clienti / fornitori seed sono tutti `cancellato = 0, attivo = 1`.
--
-- Idempotenza: marker testuale `[SEED-DASHBOARDS]` nel campo `note` di ogni riga
-- inserita; ogni IF NOT EXISTS controlla la presenza del marker (o del codice
-- univoco) prima dell'INSERT.
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

DECLARE @SEED_MARKER NVARCHAR(50) = N'[SEED-DASHBOARDS]';
DECLARE @today DATE = CAST(GETDATE() AS DATE);

-- =====================================================================
-- 0) CLEANUP — rimuovi righe seed precedenti (idempotenza forte)
-- L'ordine rispetta le FK: scadenze → fatture → anagrafica.
-- Il trigger `tr_fatture_inviate_numerazione` riscrive `fatture_inviate.numero`
-- (es. 'SEED-INV-100' -> '2/2026'), quindi non possiamo usare il numero come
-- chiave di idempotenza. Usiamo SEMPRE il marker su `note`.
-- =====================================================================
DELETE FROM dbo.scadenze         WHERE note = @SEED_MARKER;
DELETE FROM dbo.fatture_inviate  WHERE note = @SEED_MARKER;
DELETE FROM dbo.fatture_ricevute WHERE note = @SEED_MARKER;
DELETE FROM dbo.clienti          WHERE note = @SEED_MARKER;
DELETE FROM dbo.fornitori        WHERE note = @SEED_MARKER;

-- =====================================================================
-- 1) CLIENTI attivi (5)
-- =====================================================================
DECLARE @clienti TABLE (codice VARCHAR(20), ragione VARCHAR(200), piva VARCHAR(20), citta VARCHAR(100));
INSERT INTO @clienti VALUES
 ('CLI100','Alfa Costruzioni S.r.l.','01234567890','Milano'),
 ('CLI101','Beta Forniture S.p.A.','01234567891','Torino'),
 ('CLI102','Gamma Distribuzione S.n.c.','01234567892','Roma'),
 ('CLI103','Delta Servizi S.r.l.','01234567893','Napoli'),
 ('CLI104','Epsilon Logistica S.r.l.','01234567894','Bologna');

INSERT INTO dbo.clienti (codice, ragione_sociale, tipo_soggetto, partita_iva, nazione, citta, attivo, cancellato, data_creazione, note)
SELECT c.codice, c.ragione, 'AZIENDA', c.piva, 'IT', c.citta, 1, 0, GETDATE(), @SEED_MARKER
FROM @clienti c
WHERE NOT EXISTS (SELECT 1 FROM dbo.clienti x WHERE x.codice = c.codice);

-- =====================================================================
-- 2) FORNITORI attivi (5)
-- =====================================================================
DECLARE @fornitori TABLE (codice VARCHAR(20), ragione VARCHAR(200), piva VARCHAR(20), citta VARCHAR(100));
INSERT INTO @fornitori VALUES
 ('FOR100','Omega Materie Prime S.p.A.','09876543210','Milano'),
 ('FOR101','Sigma Trasporti S.r.l.','09876543211','Bologna'),
 ('FOR102','Tau Energia S.r.l.','09876543212','Roma'),
 ('FOR103','Phi Ufficio S.r.l.','09876543213','Firenze'),
 ('FOR104','Psi Manutenzioni S.n.c.','09876543214','Padova');

INSERT INTO dbo.fornitori (codice, ragione_sociale, tipo_soggetto, partita_iva, nazione, citta, attivo, cancellato, data_creazione, note)
SELECT f.codice, f.ragione, 'AZIENDA', f.piva, 'IT', f.citta, 1, 0, GETDATE(), @SEED_MARKER
FROM @fornitori f
WHERE NOT EXISTS (SELECT 1 FROM dbo.fornitori x WHERE x.codice = f.codice);

-- =====================================================================
-- 3) FATTURE INVIATE anno corrente (5)
-- numero univoco con prefix 'SEED-' per evitare collisione con i progressivi reali
-- =====================================================================
DECLARE @anno INT = YEAR(@today);

DECLARE @fatt_inv TABLE (numero VARCHAR(20), cliente_codice VARCHAR(20), data_doc DATE, imponibile DECIMAL(18,4), iva DECIMAL(18,4), totale DECIMAL(18,4));
INSERT INTO @fatt_inv VALUES
 ('SEED-INV-100','CLI100', DATEADD(DAY,-100,@today), 5000.00, 1100.00, 6100.00),
 ('SEED-INV-101','CLI101', DATEADD(DAY,-80, @today), 3500.00,  770.00, 4270.00),
 ('SEED-INV-102','CLI102', DATEADD(DAY,-50, @today), 2000.00,  440.00, 2440.00),
 ('SEED-INV-103','CLI103', DATEADD(DAY,-30, @today), 8000.00, 1760.00, 9760.00),
 ('SEED-INV-104','CLI104', DATEADD(DAY,-10, @today), 1500.00,  330.00, 1830.00);

INSERT INTO dbo.fatture_inviate (numero, anno, data_documento, cliente_id, bollo_valore, imponibile, iva, totale, stato, cancellato, data_creazione, note)
SELECT fi.numero, @anno, fi.data_doc, c.id, 0, fi.imponibile, fi.iva, fi.totale, 'EMESSA', 0, GETDATE(), @SEED_MARKER
FROM @fatt_inv fi
JOIN dbo.clienti c ON c.codice = fi.cliente_codice AND ISNULL(c.cancellato,0)=0
WHERE NOT EXISTS (SELECT 1 FROM dbo.fatture_inviate x WHERE x.numero = fi.numero AND x.anno = @anno);

-- =====================================================================
-- 4) FATTURE RICEVUTE anno corrente (5)
-- =====================================================================
DECLARE @fatt_ric TABLE (numero_for VARCHAR(40), prog_int INT, fornitore_codice VARCHAR(20), data_doc DATE, imponibile DECIMAL(18,4), iva DECIMAL(18,4), totale DECIMAL(18,4));
INSERT INTO @fatt_ric VALUES
 ('SEED-FORN-A-100', 9100, 'FOR100', DATEADD(DAY,-95,@today), 2500.00, 550.00, 3050.00),
 ('SEED-FORN-A-101', 9101, 'FOR101', DATEADD(DAY,-70,@today),  900.00, 198.00, 1098.00),
 ('SEED-FORN-A-102', 9102, 'FOR102', DATEADD(DAY,-45,@today), 4000.00, 880.00, 4880.00),
 ('SEED-FORN-A-103', 9103, 'FOR103', DATEADD(DAY,-20,@today),  700.00, 154.00,  854.00),
 ('SEED-FORN-A-104', 9104, 'FOR104', DATEADD(DAY,-5, @today), 1200.00, 264.00, 1464.00);

INSERT INTO dbo.fatture_ricevute (numero_fornitore, progressivo_interno, anno, data_documento, data_ricezione, fornitore_id, imponibile, iva, totale, iva_indetraibile, stato, cancellato, data_creazione, note)
SELECT fr.numero_for, fr.prog_int, @anno, fr.data_doc, fr.data_doc, f.id, fr.imponibile, fr.iva, fr.totale, 0, 'REGISTRATA', 0, GETDATE(), @SEED_MARKER
FROM @fatt_ric fr
JOIN dbo.fornitori f ON f.codice = fr.fornitore_codice AND ISNULL(f.cancellato,0)=0
WHERE NOT EXISTS (SELECT 1 FROM dbo.fatture_ricevute x WHERE x.numero_fornitore = fr.numero_for AND x.fornitore_id = f.id AND x.anno = @anno);

-- =====================================================================
-- 5) SCADENZE INCASSO (8) — distribuite su buckets aging
-- giorni_offset rispetto a @today; bucket attivo:
--   +30, +50, +75 (NON_SCADUTO; alcune nel cashflow_forecast 0..+90)
--   -5, -20       (SCADUTO_0_30)
--   -45           (SCADUTO_31_60)
--   -75           (SCADUTO_61_90)
--   -120          (SCADUTO_OVER_90)
-- =====================================================================
-- Nota: il trigger `tr_fatture_inviate_numerazione` riscrive `fatture_inviate.numero`
-- da 'SEED-INV-100' a '<progressivo>/<anno>' dopo l'INSERT, quindi il join
-- per `numero` qui sotto fallirebbe. Identifico la fattura seed via cliente_id
-- + note=@SEED_MARKER (univoco perche' una fattura seed per cliente).
DECLARE @scad_inc TABLE (cliente_codice VARCHAR(20), giorni INT, importo DECIMAL(18,4));
INSERT INTO @scad_inc VALUES
 ('CLI100',  30, 6100.00),   -- non scaduto, cashflow +30
 ('CLI101',  50, 4270.00),   -- non scaduto, cashflow +50
 ('CLI102',  75, 2440.00),   -- non scaduto, cashflow +75
 ('CLI103',  -5, 4880.00),   -- 0-30
 ('CLI104', -20, 1830.00),   -- 0-30
 ('CLI100', -45, 3000.00),   -- 31-60 (rata 2)
 ('CLI101', -75, 1500.00),   -- 61-90
 ('CLI102',-120, 1000.00);   -- over 90

INSERT INTO dbo.scadenze (tipo, fattura_inviata_id, cliente_id, data_scadenza, importo, importo_pagato, stato, rata_n, rata_totale, cancellato, data_creazione, note)
SELECT 'INCASSO', fi.id, c.id, DATEADD(DAY, s.giorni, @today), s.importo, 0, 'APERTA', 1, 1, 0, GETDATE(), @SEED_MARKER
FROM @scad_inc s
JOIN dbo.clienti c          ON c.codice = s.cliente_codice
JOIN dbo.fatture_inviate fi ON fi.cliente_id = c.id AND fi.note = @SEED_MARKER AND fi.anno = @anno
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.scadenze x
    WHERE x.fattura_inviata_id = fi.id
      AND x.tipo = 'INCASSO'
      AND x.note = @SEED_MARKER
      AND x.data_scadenza = DATEADD(DAY, s.giorni, @today)
      AND x.importo = s.importo
);

-- =====================================================================
-- 6) SCADENZE PAGAMENTO (8) — distribuite su buckets aging_debiti
-- =====================================================================
DECLARE @scad_pag TABLE (fornitore_codice VARCHAR(20), fattura_numero VARCHAR(40), giorni INT, importo DECIMAL(18,4));
INSERT INTO @scad_pag VALUES
 ('FOR100','SEED-FORN-A-100',  25, 3050.00),  -- non scaduto, cashflow +25
 ('FOR101','SEED-FORN-A-101',  45, 1098.00),  -- non scaduto, cashflow +45
 ('FOR102','SEED-FORN-A-102',  80, 4880.00),  -- non scaduto, cashflow +80
 ('FOR103','SEED-FORN-A-103',  -8,  854.00),  -- 0-30
 ('FOR104','SEED-FORN-A-104', -25, 1464.00),  -- 0-30
 ('FOR100','SEED-FORN-A-100', -50, 2000.00),  -- 31-60 (rata 2)
 ('FOR101','SEED-FORN-A-101', -80,  500.00),  -- 61-90
 ('FOR102','SEED-FORN-A-102',-130,  800.00);  -- over 90

INSERT INTO dbo.scadenze (tipo, fattura_ricevuta_id, fornitore_id, data_scadenza, importo, importo_pagato, stato, rata_n, rata_totale, cancellato, data_creazione, note)
SELECT 'PAGAMENTO', fr.id, f.id, DATEADD(DAY, s.giorni, @today), s.importo, 0, 'APERTA', 1, 1, 0, GETDATE(), @SEED_MARKER
FROM @scad_pag s
JOIN dbo.fornitori f         ON f.codice = s.fornitore_codice
JOIN dbo.fatture_ricevute fr ON fr.numero_fornitore = s.fattura_numero AND fr.fornitore_id = f.id AND fr.anno = @anno
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.scadenze x
    WHERE x.fattura_ricevuta_id = fr.id
      AND x.tipo = 'PAGAMENTO'
      AND x.note = @SEED_MARKER
      AND x.data_scadenza = DATEADD(DAY, s.giorni, @today)
      AND x.importo = s.importo
);

-- =====================================================================
-- Verifica counts: cosa vedono le 4 dashboard
-- =====================================================================
SELECT 'clienti_seed'            AS what, COUNT(*) AS n FROM dbo.clienti           WHERE note = @SEED_MARKER
UNION ALL SELECT 'fornitori_seed',         COUNT(*) FROM dbo.fornitori        WHERE note = @SEED_MARKER
UNION ALL SELECT 'fatt_inv_seed',          COUNT(*) FROM dbo.fatture_inviate  WHERE note = @SEED_MARKER
UNION ALL SELECT 'fatt_ric_seed',          COUNT(*) FROM dbo.fatture_ricevute WHERE note = @SEED_MARKER
UNION ALL SELECT 'scad_inc_seed',          COUNT(*) FROM dbo.scadenze         WHERE note = @SEED_MARKER AND tipo='INCASSO'
UNION ALL SELECT 'scad_pag_seed',          COUNT(*) FROM dbo.scadenze         WHERE note = @SEED_MARKER AND tipo='PAGAMENTO'
UNION ALL SELECT 'vw_aging_crediti_base',  COUNT(*) FROM dbo.vw_aging_crediti_base
UNION ALL SELECT 'vw_aging_crediti_clienti', COUNT(*) FROM dbo.vw_aging_crediti_clienti
UNION ALL SELECT 'vw_aging_debiti_base',   COUNT(*) FROM dbo.vw_aging_debiti_base
UNION ALL SELECT 'vw_aging_debiti_fornitori', COUNT(*) FROM dbo.vw_aging_debiti_fornitori
UNION ALL SELECT 'vw_cashflow_giornaliero',COUNT(*) FROM dbo.vw_cashflow_giornaliero
UNION ALL SELECT 'vw_top_clienti_anno',    COUNT(*) FROM dbo.vw_top_clienti_anno;
GO
