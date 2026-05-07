-- ====================================================================
-- 34_vw_cestino.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Block 6 #25: vista cestino UNION dei record soft-deleted (cancellato=1)
-- delle tabelle critiche.
--
-- Layout: 1 riga per record cancellato con info uniformata
-- (entita / id / codice / descrizione / data_eliminazione / utente).
-- L'id virtuale e' synth da entita+id originale per garantire unicita'
-- nella vista (10 entita * max 100M record = 10^9 spazio).
--
-- Custom action "Ripristina" sulla list (md_action_type=row): chiama
-- backend `RestoreController.RestoreRecord` che fa
-- `UPDATE <tabella> SET cancellato=0, data_eliminazione=NULL,
-- utente_eliminazione=NULL WHERE id=<originale>`.
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

USE FatturazioneElettronica_Data;
GO

IF OBJECT_ID('dbo.vw_cestino', 'V') IS NOT NULL DROP VIEW dbo.vw_cestino;
GO

CREATE VIEW dbo.vw_cestino
AS
-- entita_offset assegnato per stabilizzare id virtuale + sort.
-- 0=clienti, 1=fornitori, 2=prodotti, 3=fatture_inviate, 4=fatture_ricevute,
-- 5=scadenze, 6=movimenti_bancari, 7=email_template, 8=banche, 9=pagamenti.
-- id virtuale = entita_offset * 100000000 + id originale.
SELECT (0 * 100000000 + id) AS id, 'clienti' AS entita, id AS id_originale,
       codice AS codice, ragione_sociale AS descrizione,
       data_eliminazione, utente_eliminazione
FROM dbo.clienti WHERE ISNULL(cancellato, 0) = 1
UNION ALL
SELECT (1 * 100000000 + id), 'fornitori', id, codice, ragione_sociale,
       data_eliminazione, utente_eliminazione
FROM dbo.fornitori WHERE ISNULL(cancellato, 0) = 1
UNION ALL
SELECT (2 * 100000000 + id), 'prodotti', id, codice,
       CAST(ISNULL(descrizione, '') AS NVARCHAR(300)),
       data_eliminazione, utente_eliminazione
FROM dbo.prodotti WHERE ISNULL(cancellato, 0) = 1
UNION ALL
SELECT (3 * 100000000 + id), 'fatture_inviate', id, ISNULL(numero, CAST(id AS VARCHAR)),
       CAST('Fattura ' + ISNULL(numero, '') + ' del ' + CONVERT(NVARCHAR(10), data_documento, 103) AS NVARCHAR(300)),
       data_eliminazione, utente_eliminazione
FROM dbo.fatture_inviate WHERE ISNULL(cancellato, 0) = 1
UNION ALL
SELECT (4 * 100000000 + id), 'fatture_ricevute', id, ISNULL(numero_fornitore, CAST(id AS VARCHAR)),
       CAST('Fattura ricevuta ' + ISNULL(numero_fornitore, '') + ' del ' + CONVERT(NVARCHAR(10), data_documento, 103) AS NVARCHAR(300)),
       data_eliminazione, utente_eliminazione
FROM dbo.fatture_ricevute WHERE ISNULL(cancellato, 0) = 1
UNION ALL
SELECT (5 * 100000000 + id), 'scadenze', id, CAST(id AS VARCHAR),
       CAST('Scadenza ' + tipo + ' ' + CONVERT(NVARCHAR(10), data_scadenza, 103) + ' € ' + CAST(importo AS NVARCHAR(20)) AS NVARCHAR(300)),
       data_eliminazione, utente_eliminazione
FROM dbo.scadenze WHERE ISNULL(cancellato, 0) = 1
UNION ALL
SELECT (6 * 100000000 + id), 'movimenti_bancari', id, CAST(id AS VARCHAR),
       CAST(ISNULL(causale, '') + ' ' + CAST(importo AS NVARCHAR(20)) + ' del ' + CONVERT(NVARCHAR(10), data_operazione, 103) AS NVARCHAR(300)),
       data_eliminazione, utente_eliminazione
FROM dbo.movimenti_bancari WHERE ISNULL(cancellato, 0) = 1
UNION ALL
SELECT (7 * 100000000 + id), 'email_template', id, codice, descrizione,
       data_eliminazione, utente_eliminazione
FROM dbo.email_template WHERE ISNULL(cancellato, 0) = 1
UNION ALL
SELECT (8 * 100000000 + id), 'banche', id, CAST(id AS VARCHAR), descrizione,
       data_eliminazione, utente_eliminazione
FROM dbo.banche WHERE ISNULL(cancellato, 0) = 1
UNION ALL
SELECT (9 * 100000000 + id), 'pagamenti', id, ISNULL(codice_sdi, CAST(id AS VARCHAR)), descrizione,
       data_eliminazione, utente_eliminazione
FROM dbo.pagamenti WHERE ISNULL(cancellato, 0) = 1;
GO

PRINT 'vw_cestino creata (UNION 10 tabelle critiche con cancellato=1).';
SELECT entita, COUNT(*) AS n FROM dbo.vw_cestino GROUP BY entita ORDER BY entita;
GO
