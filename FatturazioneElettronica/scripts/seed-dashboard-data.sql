SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;

-- Seed dati per popolare le 4 dashboard analytics (cashflow / aging crediti / aging debiti / top clienti)
-- Idempotente: cancella prima i record con causale='[SEED-DASH]'.

DELETE s FROM dbo.scadenze s
  INNER JOIN dbo.fatture_inviate f ON f.id = s.fattura_inviata_id
  WHERE f.causale = '[SEED-DASH]';
DELETE s FROM dbo.scadenze s
  INNER JOIN dbo.fatture_ricevute f ON f.id = s.fattura_ricevuta_id
  WHERE f.causale = '[SEED-DASH]';
DELETE FROM dbo.fatture_inviate WHERE causale = '[SEED-DASH]';
DELETE FROM dbo.fatture_ricevute WHERE causale = '[SEED-DASH]';

DECLARE @oggi DATE = CAST(GETDATE() AS DATE);
DECLARE @anno INT = YEAR(@oggi);
DECLARE @progBase INT = 9000 + DATEPART(DAYOFYEAR, GETDATE());
DECLARE @progBaseR INT = 7000 + DATEPART(DAYOFYEAR, GETDATE());

-- =================================================================
-- STAGING: definizione fatture (cliente_id, totale, dayOffset, prog)
-- =================================================================
DECLARE @fatt_in TABLE (cliente_id INT, totale DECIMAL(18,2), dayOffset INT, prog INT, imponibile DECIMAL(18,2), iva DECIMAL(18,2));
INSERT INTO @fatt_in VALUES
  (1,    4880.00,  -10, @progBase,    4000.00,  880.00),  -- CLI001 Verdi
  (104,  6100.00,  -50, @progBase+1,  5000.00, 1100.00),  -- DEMO_CLI_01 Acme
  (105,  9150.00,  -80, @progBase+2,  7500.00, 1650.00),  -- DEMO_CLI_02 Bianchi
  (106,  3660.00, -120, @progBase+3,  3000.00,  660.00),  -- DEMO_CLI_03 Costruzioni
  (107,  7320.00,  -25, @progBase+4,  6000.00, 1320.00),  -- DEMO_CLI_04 Delta
  (108, 14640.00,  -45, @progBase+5, 12000.00, 2640.00);  -- DEMO_CLI_05 Edilizia

INSERT INTO dbo.fatture_inviate (numero, serie, progressivo, anno, data_documento, cliente_id, causale, bollo_valore, imponibile, iva, totale, stato, cancellato, data_creazione)
SELECT CAST(prog AS VARCHAR), '', prog, @anno, DATEADD(DAY, dayOffset, @oggi), cliente_id, '[SEED-DASH]', 0, imponibile, iva, totale, 'EMESSA', 0, GETDATE()
FROM @fatt_in;

-- =================================================================
-- SCADENZE ATTIVE (INCASSO) — distribuzione 5 bucket aging
-- (cliente_id, prog_fattura, dayOffset_scadenza, importo, rata_n, rata_tot)
-- =================================================================
DECLARE @scad_in TABLE (cliente_id INT, prog INT, scadOffset INT, importo DECIMAL(18,2), rataN INT, rataT INT);
INSERT INTO @scad_in VALUES
  -- CLI001: 4880 → 2000 NON scad + 1500 0-30 + 1380 >90
  (1,   @progBase,    +20, 2000.00, 1, 3),
  (1,   @progBase,    -15, 1500.00, 2, 3),
  (1,   @progBase,   -100, 1380.00, 3, 3),
  -- Acme: 6100 → 3000 NON + 2000 31-60 + 1100 NON
  (104, @progBase+1,  +30, 3000.00, 1, 3),
  (104, @progBase+1,  -45, 2000.00, 2, 3),
  (104, @progBase+1,  +60, 1100.00, 3, 3),
  -- Bianchi: 9150 → 5000 NON + 2500 61-90 + 1650 >90
  (105, @progBase+2,  +45, 5000.00, 1, 3),
  (105, @progBase+2,  -75, 2500.00, 2, 3),
  (105, @progBase+2, -110, 1650.00, 3, 3),
  -- Costruzioni: 3660 → tutto >90
  (106, @progBase+3, -120, 3660.00, 1, 1),
  -- Delta: 7320 → 4000 NON + 2000 0-30 + 1320 NON
  (107, @progBase+4,  +15, 4000.00, 1, 3),
  (107, @progBase+4,  -10, 2000.00, 2, 3),
  (107, @progBase+4,  +75, 1320.00, 3, 3),
  -- Edilizia: 14640 → 8000 NON + 4000 31-60 + 2640 NON
  (108, @progBase+5,  +25, 8000.00, 1, 3),
  (108, @progBase+5,  -40, 4000.00, 2, 3),
  (108, @progBase+5,  +50, 2640.00, 3, 3);

-- NB: il trigger `tr_fatture_inviate_numerazione` riassegna progressivo/numero
-- in modo automatico, quindi NON posso usare quelli per il join. Uso cliente_id
-- + causale (ogni cliente ha esattamente 1 fattura [SEED-DASH]).
INSERT INTO dbo.scadenze (tipo, fattura_inviata_id, cliente_id, data_scadenza, importo, importo_pagato, stato, rata_n, rata_totale, cancellato, data_creazione)
SELECT 'INCASSO', f.id, s.cliente_id, DATEADD(DAY, s.scadOffset, @oggi), s.importo, 0, 'APERTA', s.rataN, s.rataT, 0, GETDATE()
FROM @scad_in s
INNER JOIN dbo.fatture_inviate f ON f.cliente_id = s.cliente_id AND f.causale = '[SEED-DASH]';

-- =================================================================
-- FATTURE RICEVUTE (DEBITI)
-- =================================================================
DECLARE @fatt_ric TABLE (fornitore_id INT, totale DECIMAL(18,2), dayOffset INT, prog INT, imponibile DECIMAL(18,2), iva DECIMAL(18,2));
INSERT INTO @fatt_ric VALUES
  (4,  1830.00,    -8, @progBaseR,   1500.00, 330.00),  -- FOR001 Energia
  (5,   976.00,   -15, @progBaseR+1,  800.00, 176.00),  -- FOR002 Telecom
  (6,   244.00,  -130, @progBaseR+2,  200.00,  44.00),  -- FOR003 Bianchi
  (12, 3050.00,   -50, @progBaseR+3, 2500.00, 550.00),  -- DEMO_FOR_01 Cartiera
  (13, 4880.00,   -75, @progBaseR+4, 4000.00, 880.00),  -- DEMO_FOR_02 Plastica
  (14, 7320.00,  -110, @progBaseR+5, 6000.00,1320.00);  -- DEMO_FOR_03 Metalli

INSERT INTO dbo.fatture_ricevute (numero_fornitore, progressivo_interno, anno, data_documento, data_ricezione, fornitore_id, causale, imponibile, iva, totale)
SELECT 'F-' + CAST(prog AS VARCHAR), prog, @anno, DATEADD(DAY, dayOffset, @oggi), DATEADD(DAY, dayOffset, @oggi), fornitore_id, '[SEED-DASH]', imponibile, iva, totale
FROM @fatt_ric;

DECLARE @scad_ric TABLE (fornitore_id INT, prog INT, scadOffset INT, importo DECIMAL(18,2), rataN INT, rataT INT);
INSERT INTO @scad_ric VALUES
  -- Energia: 1830 → 500 NON + 1000 0-30 + 330 NON
  (4,  @progBaseR,    +18,  500.00, 1, 3),
  (4,  @progBaseR,    -20, 1000.00, 2, 3),
  (4,  @progBaseR,    +50,  330.00, 3, 3),
  -- Telecom: 976 → tutto NON
  (5,  @progBaseR+1,  +12,  976.00, 1, 1),
  -- Bianchi: 244 → >90 (urgente)
  (6,  @progBaseR+2, -125,  244.00, 1, 1),
  -- Cartiera: 3050 → 1500 NON + 1000 31-60 + 550 NON
  (12, @progBaseR+3,  +25, 1500.00, 1, 3),
  (12, @progBaseR+3,  -50, 1000.00, 2, 3),
  (12, @progBaseR+3,  +60,  550.00, 3, 3),
  -- Plastica: 4880 → 2500 NON + 1500 61-90 + 880 NON
  (13, @progBaseR+4,  +35, 2500.00, 1, 3),
  (13, @progBaseR+4,  -80, 1500.00, 2, 3),
  (13, @progBaseR+4,  +70,  880.00, 3, 3),
  -- Metalli: 7320 → 4000 NON + 2000 >90 + 1320 NON
  (14, @progBaseR+5,  +28, 4000.00, 1, 3),
  (14, @progBaseR+5, -100, 2000.00, 2, 3),
  (14, @progBaseR+5,  +85, 1320.00, 3, 3);

INSERT INTO dbo.scadenze (tipo, fattura_ricevuta_id, fornitore_id, data_scadenza, importo, importo_pagato, stato, rata_n, rata_totale, cancellato, data_creazione)
SELECT 'PAGAMENTO', f.id, s.fornitore_id, DATEADD(DAY, s.scadOffset, @oggi), s.importo, 0, 'APERTA', s.rataN, s.rataT, 0, GETDATE()
FROM @scad_ric s
INNER JOIN dbo.fatture_ricevute f ON f.fornitore_id = s.fornitore_id AND f.causale = '[SEED-DASH]';

-- Verifica
PRINT '--- Riepilogo seed ---';
SELECT 'fatture_inviate'  AS tabella, COUNT(*) AS n FROM dbo.fatture_inviate WHERE causale='[SEED-DASH]'
UNION ALL SELECT 'fatture_ricevute', COUNT(*) FROM dbo.fatture_ricevute WHERE causale='[SEED-DASH]'
UNION ALL SELECT 'scadenze_attive', COUNT(*) FROM dbo.scadenze s INNER JOIN dbo.fatture_inviate f ON f.id=s.fattura_inviata_id WHERE f.causale='[SEED-DASH]'
UNION ALL SELECT 'scadenze_passive', COUNT(*) FROM dbo.scadenze s INNER JOIN dbo.fatture_ricevute f ON f.id=s.fattura_ricevuta_id WHERE f.causale='[SEED-DASH]';
