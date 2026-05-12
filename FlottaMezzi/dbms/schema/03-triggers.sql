-- ============================================================================
-- FlottaMezzi DB Dati - Trigger business
-- DB: FlottaMezzi_Data
-- Pattern: AFTER INSERT/UPDATE con marker idempotenza, SET NOCOUNT ON.
-- ============================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ----------------------------------------------------------------------------
-- tr_rifornimenti_aggiorna_km
-- AFTER INSERT/UPDATE: aggiorna mezzi.km_attuali con MAX(km_veicolo) per il
-- mezzo. Idempotente: ricalcola sempre dal MAX, no marker richiesto.
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.tr_rifornimenti_aggiorna_km', 'TR') IS NOT NULL
    DROP TRIGGER dbo.tr_rifornimenti_aggiorna_km;
GO

CREATE TRIGGER dbo.tr_rifornimenti_aggiorna_km
ON dbo.rifornimenti
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    -- Solo se km_veicolo o cancellato sono cambiati
    IF NOT UPDATE(km_veicolo) AND NOT UPDATE(cancellato) RETURN;

    -- Aggiorna km_attuali = MAX(km_veicolo) tra rifornimenti non cancellati
    -- per ogni mezzo coinvolto in INSERT/UPDATE.
    UPDATE m
       SET m.km_attuali = aggr.max_km,
           m.data_modifica = GETDATE()
      FROM dbo.mezzi m
      INNER JOIN (
          SELECT r.mezzo_id, MAX(r.km_veicolo) AS max_km
            FROM dbo.rifornimenti r
           WHERE r.mezzo_id IN (SELECT mezzo_id FROM inserted)
             AND ISNULL(r.cancellato, 0) = 0
             AND r.km_veicolo IS NOT NULL
           GROUP BY r.mezzo_id
      ) aggr ON aggr.mezzo_id = m.id
     WHERE ISNULL(m.cancellato, 0) = 0
       AND (m.km_attuali IS NULL OR m.km_attuali < aggr.max_km);
END;
GO

PRINT '[ok] trigger tr_rifornimenti_aggiorna_km creato';
GO

-- ----------------------------------------------------------------------------
-- tr_sinistri_stato_mezzo
-- AFTER INSERT: imposta stato_mezzo del mezzo coinvolto a 'in_riparazione'
-- (cerca id corrispondente in stato_mezzo per descrizione).
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.tr_sinistri_stato_mezzo', 'TR') IS NOT NULL
    DROP TRIGGER dbo.tr_sinistri_stato_mezzo;
GO

CREATE TRIGGER dbo.tr_sinistri_stato_mezzo
ON dbo.sinistri
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @stato_id INT;
    SELECT TOP 1 @stato_id = id
      FROM dbo.stato_mezzo
     WHERE descrizione = N'in_riparazione' AND ISNULL(cancellato, 0) = 0;

    IF @stato_id IS NULL RETURN;  -- lookup mancante = no-op silenzioso

    UPDATE m
       SET m.stato_mezzo_id = @stato_id,
           m.data_modifica = GETDATE()
      FROM dbo.mezzi m
     INNER JOIN inserted i ON i.mezzo_id = m.id
     WHERE ISNULL(m.cancellato, 0) = 0
       AND ISNULL(i.cancellato, 0) = 0;
END;
GO

PRINT '[ok] trigger tr_sinistri_stato_mezzo creato';
GO
