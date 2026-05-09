-- 2026-05-08 v2 — sp_get_prezzo_listino: lookup prezzo prodotto da listino
-- con resolution del listino dalla controparte (cliente_id O fornitore_id),
-- validity period match, fallback su prodotti.
--
-- Input:
--   @prodotto_id  INT NOT NULL
--   @cliente_id   INT NULL  : se valorizzato, il listino viene letto da clienti.listino_id
--   @fornitore_id INT NULL  : se @cliente_id e' NULL, listino da fornitori.listino_id
--   @listino_id   INT NULL  : override esplicito (priorita' su cliente/fornitore)
--   @data         DATE NULL : data documento (default = oggi)
--
-- Output (sempre 1 riga):
--   prezzo_vendita   DECIMAL(18,4)
--   prezzo_acquisto  DECIMAL(18,4)
--   sconto_default   DECIMAL(5,2)
--   prezzo_source    VARCHAR(20)  : 'listino' | 'prodotto'
--   listino_id       INT NULL     : id listino effettivamente usato (NULL se source='prodotto')

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE PROCEDURE dbo.sp_get_prezzo_listino
  @prodotto_id  INT,
  @cliente_id   INT  = NULL,
  @fornitore_id INT  = NULL,
  @listino_id   INT  = NULL,
  @data         DATE = NULL
AS
BEGIN
  SET NOCOUNT ON;
  IF @data IS NULL SET @data = CAST(GETDATE() AS DATE);

  -- Risolvi listino_id se non passato esplicitamente.
  IF @listino_id IS NULL
  BEGIN
    IF @cliente_id IS NOT NULL
      SELECT @listino_id = listino_id FROM dbo.clienti WHERE id = @cliente_id;

    IF @listino_id IS NULL AND @fornitore_id IS NOT NULL
      SELECT @listino_id = listino_id FROM dbo.fornitori WHERE id = @fornitore_id;
  END

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
      CAST('listino' AS VARCHAR(20)) AS prezzo_source,
      lp.listino_id
    FROM dbo.listini_prezzi lp
    WHERE lp.id = @lp_id;
  END
  ELSE
  BEGIN
    SELECT
      p.prezzo_vendita,
      p.prezzo_acquisto,
      p.sconto_default,
      CAST('prodotto' AS VARCHAR(20)) AS prezzo_source,
      CAST(NULL AS INT) AS listino_id
    FROM dbo.prodotti p
    WHERE p.id = @prodotto_id;
  END
END;
GO
