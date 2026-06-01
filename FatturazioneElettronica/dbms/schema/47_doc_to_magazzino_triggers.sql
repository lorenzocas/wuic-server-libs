-- =============================================================================
-- 47_doc_to_magazzino_triggers.sql — Trigger doc → magazzino_movimenti
-- =============================================================================
-- File separato da 04_triggers.sql (22 trigger totali) per:
--   - non interferire con la pipeline totali documento (race AFTER INSERT)
--   - facile disabilitare il modulo magazzino senza toccare i trigger doc
--
-- Scope MVP iter 1:
--   1. tr_ddt_righe_to_mag         AFTER INSERT  -> SCARICO automatico
--   2. tr_fatture_ricevute_righe_to_mag  SKIPPED (manca prodotto_id sulla riga)
--   3. tr_fatture_inviate_righe_to_mag   SKIPPED in MVP — fatture inviate
--      sono di norma POST-DDT: il DDT ha gia' scaricato. Per fatture
--      standalone (no DDT precedente) usare /api/magazzino/movimento-manuale.
--
-- Idempotenza: il trigger su ddt_righe controlla che non esista gia' un
--   movimento con (documento_tipo='ddt', documento_id, documento_riga_id)
--   per quella riga -> ri-eseguire INSERT sulla stessa riga doc e' no-op.
--
-- Default magazzino: usa magazzini.predefinito = 1 (seedato a 'PRINCIPALE').
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
-- tr_ddt_righe_to_mag — AFTER INSERT su ddt_righe
--   Per ogni riga inserita:
--     - skip se prodotto_id IS NULL (riga descrittiva senza prodotto catalog)
--     - skip se prodotto.has_varianti=1 AND variante_id IS NULL (ambiguo:
--       il client deve sempre passare variante quando il prodotto e' variante-aware)
--     - skip se gia' esiste un movimento per questa riga doc (idempotency)
--     - INSERT SCARICO con quantita negativa nel magazzino predefinito
-- =====================================================================
IF OBJECT_ID('dbo.tr_ddt_righe_to_mag', 'TR') IS NOT NULL
    DROP TRIGGER dbo.tr_ddt_righe_to_mag;
GO
CREATE TRIGGER dbo.tr_ddt_righe_to_mag
ON dbo.ddt_righe
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @magazzino_pref INT = (
        SELECT TOP 1 id FROM dbo.magazzini
        WHERE predefinito = 1 AND attivo = 1 AND cancellato = 0
        ORDER BY id
    );

    IF @magazzino_pref IS NULL RETURN; -- modulo magazzino non configurato → no-op

    INSERT INTO dbo.magazzino_movimenti
        (magazzino_id, prodotto_id, variante_id, tipo_movimento,
         quantita, prezzo_unitario, valore_movimento,
         causale, documento_tipo, documento_id, documento_riga_id,
         data_movimento, utente_id)
    SELECT
        @magazzino_pref,
        i.prodotto_id,
        i.variante_id,
        'SCARICO',
        -ABS(i.quantita),                                   -- negativa per scarico
        i.prezzo_unitario,
        -ABS(i.quantita) * ISNULL(i.prezzo_unitario, 0),
        'AUTO_DDT:' + CAST(i.ddt_id AS NVARCHAR(20)) + ':' + CAST(i.id AS NVARCHAR(20)),
        'ddt',
        i.ddt_id,
        i.id,
        GETDATE(),
        NULL
    FROM inserted i
    JOIN dbo.prodotti p ON p.id = i.prodotto_id
    WHERE i.prodotto_id IS NOT NULL
      AND i.quantita IS NOT NULL
      AND i.quantita <> 0
      -- guard variante-aware: skip se prodotto richiede variante ma manca
      AND NOT (p.has_varianti = 1 AND i.variante_id IS NULL)
      -- idempotency: skip se esiste gia' movimento per (ddt, riga)
      AND NOT EXISTS (
          SELECT 1 FROM dbo.magazzino_movimenti m
          WHERE m.documento_tipo = 'ddt'
            AND m.documento_id = i.ddt_id
            AND m.documento_riga_id = i.id
      );
END
GO

PRINT '47_doc_to_magazzino_triggers.sql applicato: tr_ddt_righe_to_mag (SCARICO auto su INSERT)';
GO
