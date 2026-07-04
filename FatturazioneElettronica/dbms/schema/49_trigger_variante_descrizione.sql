-- =============================================================================
-- 49_trigger_variante_descrizione.sql — Modulo 1: descrizione_estesa auto
-- =============================================================================
-- Mantiene aggiornata `prodotto_varianti.descrizione_estesa` ogni volta che
-- cambiano i valori attributo di una variante (INSERT/UPDATE/DELETE su
-- `prodotto_varianti_attributi`), invocando la stored gia' esistente
-- `sp_aggiorna_descrizione_variante` (single source of truth per la
-- composizione della descrizione).
--
-- Perche' un trigger e non un ICrudRouteHandler:
--   `prodotto_varianti_attributi` e' una sub-grid della variante, senza route
--   metadata propria -> nessun hook CRUD framework scatta. Il trigger DB
--   (skill app-creation Livello 1.5) cattura TUTTI i path: sub-grid UI,
--   sp_genera_matrice_varianti, INSERT SQL diretti, import.
--
-- Idempotenza: la ricomposizione sovrascrive descrizione_estesa -> ri-eseguire
--   e' un no-op logico. La stored aggiorna solo `prodotto_varianti` (non la
--   tabella attributi) -> nessuna ricorsione del trigger.
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- =====================================================================
-- tr_prodotto_varianti_attributi_descrizione
--   AFTER INSERT, UPDATE, DELETE su prodotto_varianti_attributi
--   -> ricalcola descrizione_estesa per ogni variante toccata.
-- =====================================================================
IF OBJECT_ID('dbo.tr_prodotto_varianti_attributi_descrizione', 'TR') IS NOT NULL
    DROP TRIGGER dbo.tr_prodotto_varianti_attributi_descrizione;
GO
CREATE TRIGGER dbo.tr_prodotto_varianti_attributi_descrizione
ON dbo.prodotto_varianti_attributi
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- inserted + deleted coprono INSERT, DELETE e UPDATE (incluso un eventuale
    -- cambio di variante_id, che sulla PK (variante_id, attributo_id) si
    -- presenta come delete della vecchia + insert della nuova).
    DECLARE @affected TABLE (variante_id INT PRIMARY KEY);
    INSERT INTO @affected (variante_id)
    SELECT variante_id FROM inserted
    UNION
    SELECT variante_id FROM deleted;

    IF NOT EXISTS (SELECT 1 FROM @affected) RETURN;

    DECLARE @vid INT;
    DECLARE c CURSOR LOCAL FAST_FORWARD FOR
        SELECT variante_id FROM @affected;
    OPEN c;
    FETCH NEXT FROM c INTO @vid;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC dbo.sp_aggiorna_descrizione_variante @variante_id = @vid;
        FETCH NEXT FROM c INTO @vid;
    END
    CLOSE c; DEALLOCATE c;
END
GO

PRINT '49_trigger_variante_descrizione.sql applicato: tr_prodotto_varianti_attributi_descrizione (descrizione_estesa auto su INSERT/UPDATE/DELETE attributi)';
GO
