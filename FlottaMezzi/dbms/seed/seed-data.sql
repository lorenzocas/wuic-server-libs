-- ============================================================================
-- FlottaMezzi - Dati di prova
-- DB: FlottaMezzi_Data
-- Idempotente (skip se gia' popolato).
-- ============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- ----------------------------------------------------------------------------
-- 1) Lookup: tipo_mezzo, stato_mezzo, tipo_manutenzione
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.tipo_mezzo WHERE descrizione = N'Auto')
INSERT INTO dbo.tipo_mezzo (descrizione, icon_name) VALUES
    (N'Auto', N'pi-car'),
    (N'Furgone', N'pi-truck'),
    (N'Camion', N'pi-truck'),
    (N'Motociclo', N'pi-bolt');

IF NOT EXISTS (SELECT 1 FROM dbo.stato_mezzo WHERE descrizione = N'attivo')
INSERT INTO dbo.stato_mezzo (descrizione, colore_css) VALUES
    (N'attivo',         N'#22c55e'),
    (N'fermo',          N'#94a3b8'),
    (N'in_riparazione', N'#f59e0b'),
    (N'dismesso',       N'#ef4444');

IF NOT EXISTS (SELECT 1 FROM dbo.tipo_manutenzione WHERE descrizione = N'Tagliando ordinario')
INSERT INTO dbo.tipo_manutenzione (descrizione) VALUES
    (N'Tagliando ordinario'),
    (N'Riparazione straordinaria'),
    (N'Cambio gomme'),
    (N'Revisione');

PRINT '[ok] lookup seedati';

-- ----------------------------------------------------------------------------
-- 2) Conducenti (5 nominativi placeholder, no PII reali)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.conducenti WHERE codice_fiscale = N'RSSMRA80A01H501Z')
INSERT INTO dbo.conducenti (nome, cognome, codice_fiscale, numero_patente, categoria_patente, scadenza_patente, telefono, email)
VALUES
    (N'Mario',     N'Rossi',     N'RSSMRA80A01H501Z', N'IT0123456789', N'B', DATEADD(day, 60,  CAST(GETDATE() AS DATE)), N'+39 333 1234567', N'mario.rossi@flotta.local'),
    (N'Giulia',    N'Bianchi',   N'BNCGLI85B41F205X', N'IT0234567890', N'B', DATEADD(day, 25,  CAST(GETDATE() AS DATE)), N'+39 333 2345678', N'giulia.bianchi@flotta.local'),
    (N'Luca',      N'Verdi',     N'VRDLCU75C15G273Y', N'IT0345678901', N'C', DATEADD(day, 200, CAST(GETDATE() AS DATE)), N'+39 333 3456789', N'luca.verdi@flotta.local'),
    (N'Anna',      N'Neri',      N'NREANN90D45L219W', N'IT0456789012', N'B', DATEADD(day, -10, CAST(GETDATE() AS DATE)), N'+39 333 4567890', N'anna.neri@flotta.local'),
    (N'Pietro',    N'Gialli',    N'GLLPTR82E20H501V', N'IT0567890123', N'D', DATEADD(day, 365, CAST(GETDATE() AS DATE)), N'+39 333 5678901', N'pietro.gialli@flotta.local');

PRINT '[ok] 5 conducenti seedati';

-- ----------------------------------------------------------------------------
-- 3) Mezzi (5 veicoli mix tipologie, alcuni con coordinate GPS)
-- ----------------------------------------------------------------------------
DECLARE @auto INT = (SELECT id FROM dbo.tipo_mezzo WHERE descrizione = N'Auto');
DECLARE @fur  INT = (SELECT id FROM dbo.tipo_mezzo WHERE descrizione = N'Furgone');
DECLARE @cam  INT = (SELECT id FROM dbo.tipo_mezzo WHERE descrizione = N'Camion');
DECLARE @att  INT = (SELECT id FROM dbo.stato_mezzo WHERE descrizione = N'attivo');
DECLARE @ferm INT = (SELECT id FROM dbo.stato_mezzo WHERE descrizione = N'fermo');
DECLARE @rip  INT = (SELECT id FROM dbo.stato_mezzo WHERE descrizione = N'in_riparazione');

DECLARE @c_mario INT  = (SELECT id FROM dbo.conducenti WHERE codice_fiscale = N'RSSMRA80A01H501Z');
DECLARE @c_giulia INT = (SELECT id FROM dbo.conducenti WHERE codice_fiscale = N'BNCGLI85B41F205X');
DECLARE @c_luca INT   = (SELECT id FROM dbo.conducenti WHERE codice_fiscale = N'VRDLCU75C15G273Y');

IF NOT EXISTS (SELECT 1 FROM dbo.mezzi WHERE targa = N'AB123CD')
INSERT INTO dbo.mezzi (targa, tipo_mezzo_id, marca, modello, anno, telaio, alimentazione, km_attuali, stato_mezzo_id, data_immatricolazione, conducente_assegnato_id, latitudine, longitudine, data_ultima_posizione)
VALUES
    (N'AB123CD', @auto, N'FIAT',    N'Panda',    2022, N'TELAIO000001', N'Benzina', 35000, @att,  '2022-03-15', @c_mario,  41.9028, 12.4964, GETDATE()),  -- Roma
    (N'EF456GH', @fur,  N'IVECO',   N'Daily',    2020, N'TELAIO000002', N'Diesel',  85000, @att,  '2020-06-20', @c_giulia, 45.4642, 9.1900,  GETDATE()),  -- Milano
    (N'IL789MN', @cam,  N'MAN',     N'TGX',      2019, N'TELAIO000003', N'Diesel', 250000, @rip,  '2019-09-10', @c_luca,   40.8518, 14.2681, DATEADD(hour,-2,GETDATE())),  -- Napoli
    (N'OP012QR', @auto, N'TOYOTA',  N'Yaris',    2023, N'TELAIO000004', N'Ibrida',  18000, @att,  '2023-01-10', NULL,      45.0703, 7.6869,  DATEADD(hour,-12,GETDATE())), -- Torino
    (N'ST345UV', @auto, N'VW',      N'Golf',     2018, N'TELAIO000005', N'Diesel', 120000, @ferm, '2018-11-05', NULL,      NULL,    NULL,    NULL);

PRINT '[ok] 5 mezzi seedati';

-- ----------------------------------------------------------------------------
-- 4) Manutenzioni (6 record, mix di mezzi)
-- ----------------------------------------------------------------------------
DECLARE @m1 INT = (SELECT id FROM dbo.mezzi WHERE targa = N'AB123CD');
DECLARE @m2 INT = (SELECT id FROM dbo.mezzi WHERE targa = N'EF456GH');
DECLARE @m3 INT = (SELECT id FROM dbo.mezzi WHERE targa = N'IL789MN');
DECLARE @m4 INT = (SELECT id FROM dbo.mezzi WHERE targa = N'OP012QR');
DECLARE @m5 INT = (SELECT id FROM dbo.mezzi WHERE targa = N'ST345UV');

DECLARE @t_ord INT = (SELECT id FROM dbo.tipo_manutenzione WHERE descrizione = N'Tagliando ordinario');
DECLARE @t_str INT = (SELECT id FROM dbo.tipo_manutenzione WHERE descrizione = N'Riparazione straordinaria');
DECLARE @t_gom INT = (SELECT id FROM dbo.tipo_manutenzione WHERE descrizione = N'Cambio gomme');

IF NOT EXISTS (SELECT 1 FROM dbo.manutenzioni WHERE descrizione = N'Tagliando 30000km AB123CD')
INSERT INTO dbo.manutenzioni (mezzo_id, tipo_manutenzione_id, data, km_alla_manutenzione, descrizione, costo, officina, fattura_numero)
VALUES
    (@m1, @t_ord, DATEADD(day,-90,CAST(GETDATE() AS DATE)),  30000, N'Tagliando 30000km AB123CD', 380.00, N'Officina Centrale Roma', N'FT/2026/001'),
    (@m2, @t_str, DATEADD(day,-30,CAST(GETDATE() AS DATE)),  82000, N'Riparazione frizione',     1850.00, N'AutoMilano Service',     N'FT/2026/045'),
    (@m3, @t_str, DATEADD(day,-5, CAST(GETDATE() AS DATE)), 248000, N'Riparazione cambio',       4500.00, N'TruckCenter Napoli',     N'FT/2026/078'),
    (@m4, @t_ord, DATEADD(day,-15,CAST(GETDATE() AS DATE)),  15000, N'Tagliando 15000km',         220.00, N'Toyota Center Torino',   N'FT/2026/082'),
    (@m1, @t_gom, DATEADD(day,-180,CAST(GETDATE() AS DATE)), 25000, N'Cambio gomme invernali',    480.00, N'GommaShop',              N'FT/2025/345'),
    (@m5, @t_ord, DATEADD(day,-200,CAST(GETDATE() AS DATE)), 115000, N'Tagliando 110000km',       420.00, N'VW Service',             N'FT/2025/210');

PRINT '[ok] 6 manutenzioni seedate';

-- ----------------------------------------------------------------------------
-- 5) Rifornimenti (10 record recenti per popolare chart)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.rifornimenti WHERE distributore = N'Q8 Roma Tuscolano')
INSERT INTO dbo.rifornimenti (mezzo_id, conducente_id, data, litri, costo_totale, prezzo_litro, km_veicolo, distributore, note)
VALUES
    (@m1, @c_mario,  DATEADD(day,-1, GETDATE()), 38.00, 68.40,  1.800, 35100, N'Q8 Roma Tuscolano',     NULL),
    (@m1, @c_mario,  DATEADD(day,-12, GETDATE()), 35.50, 63.55, 1.790, 34800, N'IP Roma EUR',           NULL),
    (@m1, @c_mario,  DATEADD(day,-25, GETDATE()), 40.00, 71.60, 1.790, 34400, N'Eni Roma Magliana',     NULL),
    (@m2, @c_giulia, DATEADD(day,-2, GETDATE()), 75.00, 142.50, 1.900, 85200, N'Q8 Milano Linate',      NULL),
    (@m2, @c_giulia, DATEADD(day,-18, GETDATE()), 80.00, 152.00, 1.900, 84500, N'IP Milano Cermenate',  NULL),
    (@m3, @c_luca,   DATEADD(day,-7, GETDATE()), 200.00, 380.00, 1.900, 250200, N'TruckStop Napoli',    NULL),
    (@m3, @c_luca,   DATEADD(day,-21, GETDATE()), 195.00, 370.50, 1.900, 248800, N'TruckStop Salerno',  NULL),
    (@m4, NULL,      DATEADD(day,-3, GETDATE()), 30.00, 50.00,  1.667, 18100, N'Toyota Center Torino', N'Carburante ibrido'),
    (@m4, NULL,      DATEADD(day,-20, GETDATE()), 28.00, 47.00, 1.679, 17600, N'Q8 Torino Lingotto',    NULL),
    (@m5, NULL,      DATEADD(day,-60, GETDATE()), 45.00, 81.00, 1.800, 119500, N'Eni Bologna Ovest',    NULL);

PRINT '[ok] 10 rifornimenti seedati';

-- ----------------------------------------------------------------------------
-- 6) Contratti assicurativi (5, alcuni con scadenza imminente)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.contratti_assicurativi WHERE numero_polizza = N'GEN/2025/001')
INSERT INTO dbo.contratti_assicurativi (mezzo_id, compagnia, numero_polizza, data_inizio, data_scadenza, costo_annuo, tipo_copertura, broker, note)
VALUES
    (@m1, N'Generali', N'GEN/2025/001', '2025-03-15', DATEADD(day, 25,  CAST(GETDATE() AS DATE)), 720.00, N'RC + Furto/Incendio', N'BrokerA', NULL),
    (@m2, N'Allianz',  N'ALL/2025/108', '2025-06-20', DATEADD(day, 200, CAST(GETDATE() AS DATE)),1850.00, N'RC + Kasko',          N'BrokerA', NULL),
    (@m3, N'Unipol',   N'UNI/2024/233', '2024-09-10', DATEADD(day, -5,  CAST(GETDATE() AS DATE)),3200.00, N'RC + Kasko',          N'BrokerB', N'In rinnovo'),
    (@m4, N'Reale',    N'REA/2026/012', '2026-01-10', DATEADD(day, 280, CAST(GETDATE() AS DATE)), 580.00, N'RC',                  NULL,       NULL),
    (@m5, N'Zurich',   N'ZUR/2024/058', '2024-11-05', DATEADD(day, 95,  CAST(GETDATE() AS DATE)), 650.00, N'RC',                  N'BrokerC', NULL);

PRINT '[ok] 5 contratti assicurativi seedati';

-- ----------------------------------------------------------------------------
-- 7) Revisioni (3)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.revisioni WHERE centro_revisione = N'Centro Revisione Roma Sud')
INSERT INTO dbo.revisioni (mezzo_id, data, esito, scadenza_prossima, centro_revisione, costo, note)
VALUES
    (@m1, DATEADD(day,-30,CAST(GETDATE() AS DATE)), N'OK', DATEADD(year, 2, DATEADD(day,-30,CAST(GETDATE() AS DATE))), N'Centro Revisione Roma Sud', 79.00, NULL),
    (@m3, DATEADD(day,-60,CAST(GETDATE() AS DATE)), N'OK', DATEADD(day, 28, CAST(GETDATE() AS DATE)),                  N'Revisioni Napoli',          250.00, N'In scadenza tra 28gg'),
    (@m5, DATEADD(day,-300,CAST(GETDATE() AS DATE)), N'OK', DATEADD(day, -15, CAST(GETDATE() AS DATE)),                N'Revisioni Bologna',         79.00, N'SCADUTA - urgente');

PRINT '[ok] 3 revisioni seedate';

-- ----------------------------------------------------------------------------
-- 8) Sinistri (2)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.sinistri WHERE numero_pratica = N'PRAT/2026/01')
INSERT INTO dbo.sinistri (mezzo_id, conducente_id, data, descrizione, controparte, costo_stimato, stato_pratica, numero_pratica)
VALUES
    (@m3, @c_luca,  DATEADD(day,-7, GETDATE()), N'Tamponamento posteriore in autostrada', N'Veicolo terzo (assicurazione XYZ)', 4500.00, N'Aperta',  N'PRAT/2026/01'),
    (@m2, @c_giulia, DATEADD(day,-45, GETDATE()), N'Graffio nel parcheggio',             N'Sconosciuto',                         350.00, N'Chiusa',  N'PRAT/2026/02');

PRINT '[ok] 2 sinistri seedati';

PRINT '=== Seed dati completato ===';
GO

-- Riepilogo
SELECT 'mezzi' AS tab, COUNT(*) AS n FROM dbo.mezzi WHERE ISNULL(cancellato,0)=0
UNION ALL SELECT 'conducenti', COUNT(*) FROM dbo.conducenti WHERE ISNULL(cancellato,0)=0
UNION ALL SELECT 'manutenzioni', COUNT(*) FROM dbo.manutenzioni WHERE ISNULL(cancellato,0)=0
UNION ALL SELECT 'rifornimenti', COUNT(*) FROM dbo.rifornimenti WHERE ISNULL(cancellato,0)=0
UNION ALL SELECT 'contratti_assicurativi', COUNT(*) FROM dbo.contratti_assicurativi WHERE ISNULL(cancellato,0)=0
UNION ALL SELECT 'revisioni', COUNT(*) FROM dbo.revisioni WHERE ISNULL(cancellato,0)=0
UNION ALL SELECT 'sinistri', COUNT(*) FROM dbo.sinistri WHERE ISNULL(cancellato,0)=0
ORDER BY tab;
GO
