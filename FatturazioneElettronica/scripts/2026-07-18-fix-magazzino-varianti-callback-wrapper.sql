-- =============================================================================
-- 2026-07-18 — FIX callback wrapper Magazzino/Varianti (bug SyntaxError runtime)
-- =============================================================================
-- Le 9 azioni introdotte da 2026-05-17-magazzino-varianti-actions.sql salvavano
-- in `actioncallback` / `mcbuttonaction` l'INTERO wrapper
--   async function(datasource, metaInfo, record, event, wtoolbox) { ...corpo... }
-- Il framework compila il callback inlinando il testo come CORPO dentro
-- `new AsyncFunction('datasource, ...', buildAsyncBody(text))`
-- (data-source: rehydrateRuntimeTableActionCallbacks; colonne:
--  metadata-provider mc_button_action__fn). Un `async function(...)` anonimo
-- inlinato come statement produce:
--   SyntaxError: Function statements require a function name
-- → le 4 toolbar action falliscono (console.error "Invalid table action
--   callback") e i 5 row-button diventano no-op (`mc_button_action__fn = () => {}`).
-- Le action che funzionano (es. "Marca pagate") salvano SOLO il corpo.
--
-- FIX: rimuovere il wrapper lasciando solo il corpo (testo tra il primo '{'
-- della funzione e l'ultimo '}'). Idempotente: la guardia LIKE '%async
-- function(%' fa sì che una seconda esecuzione non tocchi i callback già
-- corretti (il corpo non contiene piu' 'async function(').
--
-- Colonne `actioncallback`/`mcbuttonaction` sono di tipo `text` → CAST a
-- nvarchar(max) per gli operatori stringa (REPLACE/CHARINDEX/SUBSTRING su text
-- danno errore). DATALENGTH/2 = conteggio caratteri (robusto ai trailing
-- whitespace, a differenza di LEN che li tronca); l'ultima '}' si localizza con
-- REVERSE (verificato: tutti i callback finiscono esattamente con '}').
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Metadata;

-- 1) TOOLBAR actions (_mtdt__cstom__actions__tabelle.actioncallback)
UPDATE _mtdt__cstom__actions__tabelle
SET actioncallback = CAST(
    SUBSTRING(
        CAST(actioncallback AS nvarchar(max)),
        CHARINDEX(N'{', CAST(actioncallback AS nvarchar(max))) + 1,
        ((DATALENGTH(CAST(actioncallback AS nvarchar(max))) / 2)
            - CHARINDEX(N'}', REVERSE(CAST(actioncallback AS nvarchar(max)))) + 1)
            - CHARINDEX(N'{', CAST(actioncallback AS nvarchar(max))) - 1
    ) AS nvarchar(max))
WHERE buttoncaption IN (N'Genera matrice varianti', N'Movimento manuale', N'Inventario fisico', N'Riconcilia snapshot')
  AND CAST(actioncallback AS nvarchar(max)) LIKE N'%async function(%';
PRINT 'Toolbar callback wrapper stripped: ' + CAST(@@ROWCOUNT AS varchar(10)) + ' righe';

-- 2) ROW actions (_metadati__colonne.mcbuttonaction)
UPDATE _metadati__colonne
SET mcbuttonaction = CAST(
    SUBSTRING(
        CAST(mcbuttonaction AS nvarchar(max)),
        CHARINDEX(N'{', CAST(mcbuttonaction AS nvarchar(max))) + 1,
        ((DATALENGTH(CAST(mcbuttonaction AS nvarchar(max))) / 2)
            - CHARINDEX(N'}', REVERSE(CAST(mcbuttonaction AS nvarchar(max)))) + 1)
            - CHARINDEX(N'{', CAST(mcbuttonaction AS nvarchar(max))) - 1
    ) AS nvarchar(max))
WHERE mc_nome_colonna IN ('btn_apri_prodotto_padre', 'btn_apri_attributo_padre', 'btn_storico_movimenti', 'btn_rettifica_opposta', 'btn_vedi_giacenze')
  AND CAST(mcbuttonaction AS nvarchar(max)) LIKE N'%async function(%';
PRINT 'Row-button callback wrapper stripped: ' + CAST(@@ROWCOUNT AS varchar(10)) + ' righe';

PRINT '2026-07-18-fix-magazzino-varianti-callback-wrapper.sql applicato.';
