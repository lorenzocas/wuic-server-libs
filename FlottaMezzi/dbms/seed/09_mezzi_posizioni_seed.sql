SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DELETE FROM dbo.mezzi_posizioni;
DBCC CHECKIDENT ('dbo.mezzi_posizioni', RESEED, 0);
GO

-- Percorso AB123CD (Roma, 2026-05-09): 12 punti, giro centro storico
INSERT INTO dbo.mezzi_posizioni (mezzo_id, timestamp_pos, latitudine, longitudine, velocita_kmh, note) VALUES
(1, '2026-05-09T08:00:00', 41.9028, 12.4964, 0,    'Partenza Colosseo'),
(1, '2026-05-09T08:15:00', 41.9009, 12.4833, 32.5, 'Via dei Fori Imperiali'),
(1, '2026-05-09T08:30:00', 41.8967, 12.4828, 28.0, 'Piazza Venezia'),
(1, '2026-05-09T08:50:00', 41.8989, 12.4769, 22.0, 'Pantheon'),
(1, '2026-05-09T09:10:00', 41.9009, 12.4769, 18.5, 'Piazza Navona'),
(1, '2026-05-09T09:40:00', 41.9022, 12.4583, 35.0, 'Castel Sant\Angelo'),
(1, '2026-05-09T10:30:00', 41.9105, 12.4777, 40.0, 'Piazza del Popolo'),
(1, '2026-05-09T11:30:00', 41.9056, 12.4833, 30.0, 'Trevi'),
(1, '2026-05-09T13:00:00', 41.9028, 12.4964, 0,    'Sosta pranzo Colosseo'),
(1, '2026-05-09T15:00:00', 41.8867, 12.4853, 38.0, 'Circo Massimo'),
(1, '2026-05-09T16:30:00', 41.8836, 12.4729, 25.0, 'Aventino'),
(1, '2026-05-09T18:00:00', 41.9028, 12.4964, 0,    'Rientro Colosseo');

-- Percorso EF456GH (Milano, 2026-05-09): 10 punti
INSERT INTO dbo.mezzi_posizioni (mezzo_id, timestamp_pos, latitudine, longitudine, velocita_kmh, note) VALUES
(2, '2026-05-09T07:30:00', 45.4642, 9.1900, 0,    'Partenza Duomo'),
(2, '2026-05-09T08:00:00', 45.4719, 9.1889, 28.0, 'Brera'),
(2, '2026-05-09T08:45:00', 45.4781, 9.1875, 35.0, 'Garibaldi'),
(2, '2026-05-09T09:30:00', 45.4861, 9.1908, 42.0, 'Porta Nuova'),
(2, '2026-05-09T11:00:00', 45.4781, 9.2306, 50.0, 'Lambrate'),
(2, '2026-05-09T12:30:00', 45.4628, 9.2089, 32.0, 'Stazione Centrale'),
(2, '2026-05-09T14:00:00', 45.4528, 9.1842, 30.0, 'Corso Buenos Aires'),
(2, '2026-05-09T15:30:00', 45.4500, 9.1747, 22.5, 'Porta Venezia'),
(2, '2026-05-09T17:00:00', 45.4581, 9.1739, 18.0, 'San Babila'),
(2, '2026-05-09T18:30:00', 45.4642, 9.1900, 0,    'Rientro Duomo');

-- Percorso IL789MN (Napoli, 2026-05-09): 9 punti
INSERT INTO dbo.mezzi_posizioni (mezzo_id, timestamp_pos, latitudine, longitudine, velocita_kmh, note) VALUES
(3, '2026-05-09T07:45:00', 40.8518, 14.2681, 0,    'Partenza Plebiscito'),
(3, '2026-05-09T08:30:00', 40.8456, 14.2569, 28.0, 'Castel dell\Ovo'),
(3, '2026-05-09T09:30:00', 40.8331, 14.2425, 38.0, 'Mergellina'),
(3, '2026-05-09T11:00:00', 40.8478, 14.2778, 32.0, 'Spaccanapoli'),
(3, '2026-05-09T12:30:00', 40.8533, 14.2792, 25.0, 'Duomo'),
(3, '2026-05-09T14:00:00', 40.8631, 14.2839, 40.0, 'Capodimonte'),
(3, '2026-05-09T15:30:00', 40.8569, 14.2722, 35.0, 'Vomero'),
(3, '2026-05-09T17:00:00', 40.8542, 14.2700, 22.0, 'Toledo'),
(3, '2026-05-09T18:00:00', 40.8518, 14.2681, 0,    'Rientro Plebiscito');

-- Percorso OP012QR (Torino, 2026-05-09): 8 punti
INSERT INTO dbo.mezzi_posizioni (mezzo_id, timestamp_pos, latitudine, longitudine, velocita_kmh, note) VALUES
(4, '2026-05-09T08:15:00', 45.0703, 7.6869, 0,    'Partenza Piazza Castello'),
(4, '2026-05-09T09:00:00', 45.0639, 7.6805, 30.0, 'Via Roma'),
(4, '2026-05-09T10:00:00', 45.0550, 7.6783, 35.0, 'Porta Nuova'),
(4, '2026-05-09T11:30:00', 45.0700, 7.6611, 42.0, 'Politecnico'),
(4, '2026-05-09T13:00:00', 45.0769, 7.6783, 28.0, 'Quadrilatero'),
(4, '2026-05-09T15:00:00', 45.0894, 7.6822, 40.0, 'Borgo Po'),
(4, '2026-05-09T17:00:00', 45.0731, 7.6856, 25.0, 'Piazza Vittorio'),
(4, '2026-05-09T18:30:00', 45.0703, 7.6869, 0,    'Rientro Piazza Castello');

SELECT mezzo_id, COUNT(*) AS punti FROM dbo.mezzi_posizioni GROUP BY mezzo_id ORDER BY mezzo_id;
