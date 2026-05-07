-- ====================================================================
-- 25_vw_anagrafica_unificata.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Workflow #24: Anagrafica unificata cliente↔fornitore.
--
-- View `vw_anagrafica_unificata`: UNION delle anagrafiche clienti + fornitori
-- con discriminator `tipo` (CLIENTE / FORNITORE / ENTRAMBI) per identificare
-- soggetti che appaiono in entrambe le tabelle (matching su partita_iva).
--
-- Pattern framework-first (per richiesta utente 2026-05-06):
--   - SOLO view SQL + scaffolding metadata via `scaffolding.scaffoldView`
--   - NESSUN componente Angular custom (route renderizzata dal list-grid
--     archetype standard del framework)
--   - read-only (le viste non sono editable; per modificare il record
--     l'utente naviga al cliente/fornitore originale via lookup)
--
-- ID composito: usato `cliente_id * 1000000 + fornitore_id` per garantire
-- unicita' tra le 3 categorie. Per CLIENTE-only: `cliente_id`. Per
-- FORNITORE-only: `fornitore_id + 100000000`. Per ENTRAMBI:
-- `cliente_id * 1000000 + fornitore_id + 200000000` (mai > INT max).
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.vw_anagrafica_unificata', 'V') IS NOT NULL DROP VIEW dbo.vw_anagrafica_unificata;
GO

CREATE VIEW dbo.vw_anagrafica_unificata
AS
WITH
clienti_attivi AS (
    SELECT id, codice, ragione_sociale, partita_iva, codice_fiscale,
           tipo_soggetto, indirizzo, cap, citta, provincia, nazione,
           email, pec, telefono
    FROM dbo.clienti
    WHERE ISNULL(cancellato, 0) = 0
),
fornitori_attivi AS (
    SELECT id, codice, ragione_sociale, partita_iva, codice_fiscale,
           tipo_soggetto, indirizzo, cap, citta, provincia, nazione,
           email, pec, telefono
    FROM dbo.fornitori
    WHERE ISNULL(cancellato, 0) = 0
),
-- Soggetti che sono SIA clienti SIA fornitori (matching su partita_iva non-null)
entrambi AS (
    SELECT c.id AS cliente_id, f.id AS fornitore_id, c.partita_iva
    FROM clienti_attivi c
    INNER JOIN fornitori_attivi f
      ON c.partita_iva = f.partita_iva AND c.partita_iva IS NOT NULL
)
-- Set 1: ENTRAMBI (un soggetto fa cliente E fornitore — riga unica)
SELECT
    (e.cliente_id * 1000000 + e.fornitore_id + 200000000) AS id,
    'ENTRAMBI'                AS tipo,
    e.cliente_id              AS cliente_id,
    e.fornitore_id            AS fornitore_id,
    c.codice                  AS codice_cliente,
    f.codice                  AS codice_fornitore,
    c.ragione_sociale,
    c.partita_iva,
    c.codice_fiscale,
    c.tipo_soggetto,
    c.indirizzo, c.cap, c.citta, c.provincia, c.nazione,
    c.email, c.pec, c.telefono
FROM entrambi e
JOIN clienti_attivi   c ON c.id = e.cliente_id
JOIN fornitori_attivi f ON f.id = e.fornitore_id

UNION ALL

-- Set 2: CLIENTE only (escludi quelli gia' presenti in entrambi)
SELECT
    c.id                      AS id,
    'CLIENTE'                 AS tipo,
    c.id                      AS cliente_id,
    NULL                      AS fornitore_id,
    c.codice                  AS codice_cliente,
    NULL                      AS codice_fornitore,
    c.ragione_sociale,
    c.partita_iva,
    c.codice_fiscale,
    c.tipo_soggetto,
    c.indirizzo, c.cap, c.citta, c.provincia, c.nazione,
    c.email, c.pec, c.telefono
FROM clienti_attivi c
WHERE NOT EXISTS (
    SELECT 1 FROM entrambi e WHERE e.cliente_id = c.id
)

UNION ALL

-- Set 3: FORNITORE only
SELECT
    (f.id + 100000000)        AS id,
    'FORNITORE'               AS tipo,
    NULL                      AS cliente_id,
    f.id                      AS fornitore_id,
    NULL                      AS codice_cliente,
    f.codice                  AS codice_fornitore,
    f.ragione_sociale,
    f.partita_iva,
    f.codice_fiscale,
    f.tipo_soggetto,
    f.indirizzo, f.cap, f.citta, f.provincia, f.nazione,
    f.email, f.pec, f.telefono
FROM fornitori_attivi f
WHERE NOT EXISTS (
    SELECT 1 FROM entrambi e WHERE e.fornitore_id = f.id
);
GO

PRINT 'vw_anagrafica_unificata creata (UNION clienti + fornitori, 3 categorie tipo=CLIENTE|FORNITORE|ENTRAMBI).';
GO

-- Verifica
SELECT tipo, COUNT(*) AS n FROM dbo.vw_anagrafica_unificata GROUP BY tipo ORDER BY tipo;
GO
