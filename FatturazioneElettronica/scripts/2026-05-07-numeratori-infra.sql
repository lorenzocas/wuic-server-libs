-- =============================================================================
-- Infrastruttura numeratori per documenti commerciali
-- =============================================================================
-- Tabella per gestire numerazione progressiva separata per:
--   - route (fatture_inviate, preventivi, ordini, ddt, proforma, ordini_acquisto,
--     ordini_elettronici, fatture_ricevute)
--   - serie/sezionale (es. FPR/FPA su fatture_inviate; '' su altre)
--   - anno
--
-- Stored procedure `sp_next_progressivo` ritorna il prossimo progressivo
-- disponibile (NON consuma il numero) per uso lato client come default
-- value callback. Il consumo effettivo avviene al save server-side.
--
-- Idempotente: solo IF NOT EXISTS / CREATE OR ALTER.
-- =============================================================================

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Data;
GO

-- ---------------------------------------------------------------------------
-- numeratori: tabella stato corrente progressivi
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='numeratori')
BEGIN
  CREATE TABLE numeratori (
    id INT IDENTITY PRIMARY KEY,
    route VARCHAR(50) NOT NULL,
    serie VARCHAR(20) NOT NULL DEFAULT '',
    anno INT NOT NULL,
    ultimo_progressivo INT NOT NULL DEFAULT 0,
    data_creazione DATETIME NOT NULL DEFAULT GETDATE(),
    data_modifica DATETIME NULL,
    CONSTRAINT UQ_numeratori_route_serie_anno UNIQUE (route, serie, anno)
  );
END
GO

-- ---------------------------------------------------------------------------
-- sp_next_progressivo: ritorna il prossimo progressivo SENZA consumarlo.
-- Calcola MAX(progressivo) effettivamente usato + 1, dove progressivo viene
-- letto sia dalla tabella documenti reali sia dal numeratore. NON aggiorna
-- la tabella numeratori (sara' aggiornata al save).
--
-- Parametri:
--   @route VARCHAR(50)  - nome route (es. 'fatture_inviate')
--   @serie VARCHAR(20)  - sezionale (default '')
--   @anno  INT          - anno target
--
-- Ritorno:
--   single row con 1 colonna: next_progressivo (INT)
-- ---------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE sp_next_progressivo
  @route VARCHAR(50),
  @serie VARCHAR(20) = '',
  @anno  INT = NULL
AS
BEGIN
  SET ANSI_NULLS ON;
  SET QUOTED_IDENTIFIER ON;
  SET NOCOUNT ON;

  IF @anno IS NULL SET @anno = YEAR(GETDATE());
  IF @serie IS NULL SET @serie = '';

  DECLARE @max_used INT = 0;
  DECLARE @max_reserved INT = 0;
  DECLARE @sql NVARCHAR(MAX);
  DECLARE @progressivo_col SYSNAME;
  DECLARE @serie_col       SYSNAME;
  DECLARE @table_name      SYSNAME;

  -- Mapping route -> tabella + colonne
  IF @route = 'fatture_inviate'      BEGIN SET @table_name='fatture_inviate';      SET @progressivo_col='progressivo';          SET @serie_col='serie'; END
  ELSE IF @route = 'fatture_ricevute'BEGIN SET @table_name='fatture_ricevute';     SET @progressivo_col='progressivo_interno';  SET @serie_col=NULL;    END
  ELSE IF @route = 'preventivi'      BEGIN SET @table_name='preventivi';           SET @progressivo_col='progressivo';          SET @serie_col=NULL;    END
  ELSE IF @route = 'ordini'          BEGIN SET @table_name='ordini';               SET @progressivo_col='progressivo';          SET @serie_col=NULL;    END
  ELSE IF @route = 'ordini_acquisto' BEGIN SET @table_name='ordini_acquisto';      SET @progressivo_col='progressivo';          SET @serie_col=NULL;    END
  ELSE IF @route = 'ordini_elettronici' BEGIN SET @table_name='ordini_elettronici'; SET @progressivo_col='progressivo_interno'; SET @serie_col=NULL;    END
  ELSE IF @route = 'ddt'             BEGIN SET @table_name='ddt';                  SET @progressivo_col='progressivo';          SET @serie_col=NULL;    END
  ELSE IF @route = 'proforma'        BEGIN SET @table_name='proforma';             SET @progressivo_col='progressivo';          SET @serie_col=NULL;    END
  ELSE
  BEGIN
    SELECT 1 AS next_progressivo;
    RETURN;
  END

  -- Max(progressivo) realmente usato in tabella documenti (per anno + serie)
  IF @serie_col IS NOT NULL
    SET @sql = N'SELECT @res = ISNULL(MAX(' + QUOTENAME(@progressivo_col) + N'),0) FROM ' + QUOTENAME(@table_name)
             + N' WHERE anno = @anno AND ISNULL(' + QUOTENAME(@serie_col) + N','''') = @serie';
  ELSE
    SET @sql = N'SELECT @res = ISNULL(MAX(' + QUOTENAME(@progressivo_col) + N'),0) FROM ' + QUOTENAME(@table_name)
             + N' WHERE anno = @anno';

  EXEC sp_executesql @sql,
       N'@anno INT, @serie VARCHAR(20), @res INT OUTPUT',
       @anno=@anno, @serie=@serie, @res=@max_used OUTPUT;

  -- Max(progressivo) eventualmente gia' "riservato" sul numeratore
  SELECT @max_reserved = ISNULL(MAX(ultimo_progressivo), 0)
    FROM numeratori
   WHERE route = @route AND serie = @serie AND anno = @anno;

  -- next = max(reale, riservato) + 1
  SELECT next_progressivo =
    CASE WHEN @max_used > @max_reserved THEN @max_used + 1
         ELSE @max_reserved + 1 END;
END
GO

-- ---------------------------------------------------------------------------
-- Test sanity
-- ---------------------------------------------------------------------------
EXEC sp_next_progressivo @route = 'fatture_inviate', @serie = '',    @anno = 2026;
EXEC sp_next_progressivo @route = 'preventivi',      @anno = 2026;
EXEC sp_next_progressivo @route = 'ordini',          @anno = 2026;
GO
