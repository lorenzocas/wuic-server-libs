-- 2026-05-08 — Stored procedure: lookup prezzo prodotto da listino con
-- validity period + fallback su prodotti.prezzo_vendita/prezzo_acquisto.
--
-- Input:
--   @prodotto_id  INT NOT NULL  : id prodotto
--   @listino_id   INT NULL      : id listino (preso da clienti.listino_id /
--                                 fornitori.listino_id; NULL se controparte
--                                 non ha listino assegnato)
--   @data         DATE NOT NULL : data documento (per validity period match)
--
-- Output (sempre 1 riga):
--   prezzo_vendita   DECIMAL(18,4)  : prezzo da listino o fallback prodotti
--   prezzo_acquisto  DECIMAL(18,4)
--   sconto_default   DECIMAL(5,2)
--   prezzo_source    VARCHAR(20)    : 'listino' | 'prodotto'
--
-- Logica:
--   1) Se @listino_id IS NULL → fallback diretto.
--   2) Cerca riga listini_prezzi con prodotto match, attivo, validity period
--      (valid_from <= @data AND (valid_to IS NULL OR valid_to >= @data)).
--      Se piu' di una match (override temporali sovrapposti), prende la
--      piu' recente (max valid_from poi max id).
--   3) Se nessun match → fallback prodotti.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.sp_get_prezzo_listino', 'P') IS NOT NULL
  DROP PROCEDURE dbo.sp_get_prezzo_listino;
GO

CREATE PROCEDURE dbo.sp_get_prezzo_listino
  @prodotto_id INT,
  @listino_id  INT = NULL,
  @data        DATE = NULL
AS
BEGIN
  SET NOCOUNT ON;
  IF @data IS NULL SET @data = CAST(GETDATE() AS DATE);

  DECLARE @lp_id INT = NULL;
  IF @listino_id IS NOT NULL
  BEGIN
    SELECT TOP 1 @lp_id = id
    FROM dbo.listini_prezzi
    WHERE listino_id = @listino_id
      AND prodotto_id = @prodotto_id
      AND attivo = 1
      AND cancellato = 0
      AND valid_from <= @data
      AND (valid_to IS NULL OR valid_to >= @data)
    ORDER BY valid_from DESC, id DESC;
  END

  IF @lp_id IS NOT NULL
  BEGIN
    SELECT
      lp.prezzo_vendita,
      lp.prezzo_acquisto,
      lp.sconto_default,
      CAST('listino' AS VARCHAR(20)) AS prezzo_source
    FROM dbo.listini_prezzi lp
    WHERE lp.id = @lp_id;
  END
  ELSE
  BEGIN
    SELECT
      p.prezzo_vendita,
      p.prezzo_acquisto,
      p.sconto_default,
      CAST('prodotto' AS VARCHAR(20)) AS prezzo_source
    FROM dbo.prodotti p
    WHERE p.id = @prodotto_id;
  END
END;
GO

-- Smoke test (no rows in listini_prezzi yet → returns prodotti row).
DECLARE @first_prod INT = (SELECT TOP 1 id FROM dbo.prodotti);
EXEC dbo.sp_get_prezzo_listino @prodotto_id = @first_prod, @listino_id = NULL, @data = NULL;
GO
