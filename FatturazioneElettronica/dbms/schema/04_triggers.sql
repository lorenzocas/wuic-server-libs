/* ============================================================
   FatturazioneElettronica — Trigger SQL: numerazione + totali
   ============================================================
   - Numerazione progressiva auto-assegnata su INSERT testata
     (per le entita' con UNIQUE INDEX su anno+serie/progressivo).
   - Ricalcolo imponibile/iva/totale sulla testata quando le
     righe vengono inserite/aggiornate/cancellate.
   Eseguire DOPO 03_movimenti.sql.
   ============================================================ */

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

/* ============================================================
   1) NUMERAZIONE PROGRESSIVA (INSTEAD OF INSERT)
   Pattern: per ogni insert calcola progressivo = MAX+1 in
   transazione, costruisce numero composto, poi insert reale.
   ============================================================ */

/* ---- fatture_inviate ---- */
IF OBJECT_ID('dbo.tr_fatture_inviate_numerazione', 'TR') IS NOT NULL
  DROP TRIGGER dbo.tr_fatture_inviate_numerazione;
GO
CREATE TRIGGER dbo.tr_fatture_inviate_numerazione
ON dbo.fatture_inviate
INSTEAD OF INSERT
AS
BEGIN
  SET NOCOUNT ON;
  -- assegna progressivo + numero per ogni riga inserita
  ;WITH src AS (
    SELECT i.*,
      ROW_NUMBER() OVER (PARTITION BY i.anno, ISNULL(i.serie,'') ORDER BY (SELECT 1)) AS rn,
      ISNULL((SELECT MAX(progressivo) FROM dbo.fatture_inviate fx
              WHERE fx.anno = i.anno AND ISNULL(fx.serie,'') = ISNULL(i.serie,'') AND fx.cancellato = 0), 0) AS max_prog
    FROM inserted i
  )
  INSERT INTO dbo.fatture_inviate (
    numero, serie, progressivo, anno, data_documento,
    cliente_id, pagamento_id, banca_id, causale, riferimento_ordine,
    bollo_valore, sconto_globale_perc, imponibile, iva, totale,
    stato, stato_sdi, sdi_id, sdi_messaggio, file_xml, note,
    cancellato, data_creazione, data_modifica,
    utente_creazione, utente_modifica
  )
  SELECT
    CASE WHEN ISNULL(s.serie,'') = ''
         THEN CAST(s.max_prog + s.rn AS VARCHAR(20)) + '/' + CAST(s.anno AS VARCHAR(4))
         ELSE s.serie + '-' + CAST(s.max_prog + s.rn AS VARCHAR(20)) + '/' + CAST(s.anno AS VARCHAR(4))
    END,
    s.serie,
    s.max_prog + s.rn,
    s.anno,
    s.data_documento,
    s.cliente_id, s.pagamento_id, s.banca_id, s.causale, s.riferimento_ordine,
    s.bollo_valore, s.sconto_globale_perc, s.imponibile, s.iva, s.totale,
    s.stato, s.stato_sdi, s.sdi_id, s.sdi_messaggio, s.file_xml, s.note,
    s.cancellato, ISNULL(s.data_creazione, GETDATE()), s.data_modifica,
    s.utente_creazione, s.utente_modifica
  FROM src s;
END;
GO

/* ---- helper macro: simile pattern per le altre testate ----
   Per le testate con sola coppia (anno, progressivo) (no serie):
   preventivi, ordini, ordini_elettronici, ddt, proforma,
   ordini_acquisto, fatture_ricevute (uses progressivo_interno).
   ============================================================ */

/* ---- preventivi ---- */
IF OBJECT_ID('dbo.tr_preventivi_numerazione', 'TR') IS NOT NULL
  DROP TRIGGER dbo.tr_preventivi_numerazione;
GO
CREATE TRIGGER dbo.tr_preventivi_numerazione
ON dbo.preventivi INSTEAD OF INSERT
AS
BEGIN
  SET NOCOUNT ON;
  ;WITH src AS (
    SELECT i.*,
      ROW_NUMBER() OVER (PARTITION BY i.anno ORDER BY (SELECT 1)) AS rn,
      ISNULL((SELECT MAX(progressivo) FROM dbo.preventivi fx
              WHERE fx.anno = i.anno AND fx.cancellato = 0), 0) AS max_prog
    FROM inserted i
  )
  INSERT INTO dbo.preventivi (numero, progressivo, anno, data_documento, data_validita,
    cliente_id, oggetto, imponibile, iva, totale, stato, note,
    cancellato, data_creazione, data_modifica)
  SELECT CAST(s.max_prog + s.rn AS VARCHAR(20)) + '/' + CAST(s.anno AS VARCHAR(4)),
    s.max_prog + s.rn, s.anno, s.data_documento, s.data_validita,
    s.cliente_id, s.oggetto, s.imponibile, s.iva, s.totale, s.stato, s.note,
    s.cancellato, ISNULL(s.data_creazione, GETDATE()), s.data_modifica
  FROM src s;
END;
GO

/* ---- ordini ---- */
IF OBJECT_ID('dbo.tr_ordini_numerazione', 'TR') IS NOT NULL DROP TRIGGER dbo.tr_ordini_numerazione;
GO
CREATE TRIGGER dbo.tr_ordini_numerazione ON dbo.ordini INSTEAD OF INSERT
AS BEGIN
  SET NOCOUNT ON;
  ;WITH src AS (
    SELECT i.*, ROW_NUMBER() OVER (PARTITION BY i.anno ORDER BY (SELECT 1)) AS rn,
      ISNULL((SELECT MAX(progressivo) FROM dbo.ordini fx WHERE fx.anno = i.anno AND fx.cancellato = 0), 0) AS max_prog
    FROM inserted i
  )
  INSERT INTO dbo.ordini (numero, progressivo, anno, data_documento, data_consegna,
    cliente_id, riferimento_cliente, imponibile, iva, totale, stato, note,
    cancellato, data_creazione, data_modifica)
  SELECT CAST(s.max_prog + s.rn AS VARCHAR(20)) + '/' + CAST(s.anno AS VARCHAR(4)),
    s.max_prog + s.rn, s.anno, s.data_documento, s.data_consegna,
    s.cliente_id, s.riferimento_cliente, s.imponibile, s.iva, s.totale, s.stato, s.note,
    s.cancellato, ISNULL(s.data_creazione, GETDATE()), s.data_modifica
  FROM src s;
END;
GO

/* ---- ddt ---- */
IF OBJECT_ID('dbo.tr_ddt_numerazione', 'TR') IS NOT NULL DROP TRIGGER dbo.tr_ddt_numerazione;
GO
CREATE TRIGGER dbo.tr_ddt_numerazione ON dbo.ddt INSTEAD OF INSERT
AS BEGIN
  SET NOCOUNT ON;
  ;WITH src AS (
    SELECT i.*, ROW_NUMBER() OVER (PARTITION BY i.anno ORDER BY (SELECT 1)) AS rn,
      ISNULL((SELECT MAX(progressivo) FROM dbo.ddt fx WHERE fx.anno = i.anno AND fx.cancellato = 0), 0) AS max_prog
    FROM inserted i
  )
  INSERT INTO dbo.ddt (numero, progressivo, anno, data_documento, cliente_id,
    causale_trasporto, aspetto_beni, n_colli, peso_lordo, porto, vettore, data_ora_trasporto,
    stato, fattura_id, note, cancellato, data_creazione, data_modifica)
  SELECT CAST(s.max_prog + s.rn AS VARCHAR(20)) + '/' + CAST(s.anno AS VARCHAR(4)),
    s.max_prog + s.rn, s.anno, s.data_documento, s.cliente_id,
    s.causale_trasporto, s.aspetto_beni, s.n_colli, s.peso_lordo, s.porto, s.vettore, s.data_ora_trasporto,
    s.stato, s.fattura_id, s.note, s.cancellato, ISNULL(s.data_creazione, GETDATE()), s.data_modifica
  FROM src s;
END;
GO

/* ---- proforma ---- */
IF OBJECT_ID('dbo.tr_proforma_numerazione', 'TR') IS NOT NULL DROP TRIGGER dbo.tr_proforma_numerazione;
GO
CREATE TRIGGER dbo.tr_proforma_numerazione ON dbo.proforma INSTEAD OF INSERT
AS BEGIN
  SET NOCOUNT ON;
  ;WITH src AS (
    SELECT i.*, ROW_NUMBER() OVER (PARTITION BY i.anno ORDER BY (SELECT 1)) AS rn,
      ISNULL((SELECT MAX(progressivo) FROM dbo.proforma fx WHERE fx.anno = i.anno AND fx.cancellato = 0), 0) AS max_prog
    FROM inserted i
  )
  INSERT INTO dbo.proforma (numero, progressivo, anno, data_documento, cliente_id,
    imponibile, iva, totale, stato, fattura_id, note, cancellato, data_creazione)
  SELECT CAST(s.max_prog + s.rn AS VARCHAR(20)) + '/' + CAST(s.anno AS VARCHAR(4)),
    s.max_prog + s.rn, s.anno, s.data_documento, s.cliente_id,
    s.imponibile, s.iva, s.totale, s.stato, s.fattura_id, s.note,
    s.cancellato, ISNULL(s.data_creazione, GETDATE())
  FROM src s;
END;
GO

/* ---- ordini_acquisto ---- */
IF OBJECT_ID('dbo.tr_ordini_acquisto_numerazione', 'TR') IS NOT NULL DROP TRIGGER dbo.tr_ordini_acquisto_numerazione;
GO
CREATE TRIGGER dbo.tr_ordini_acquisto_numerazione ON dbo.ordini_acquisto INSTEAD OF INSERT
AS BEGIN
  SET NOCOUNT ON;
  ;WITH src AS (
    SELECT i.*, ROW_NUMBER() OVER (PARTITION BY i.anno ORDER BY (SELECT 1)) AS rn,
      ISNULL((SELECT MAX(progressivo) FROM dbo.ordini_acquisto fx WHERE fx.anno = i.anno AND fx.cancellato = 0), 0) AS max_prog
    FROM inserted i
  )
  INSERT INTO dbo.ordini_acquisto (numero, progressivo, anno, data_documento, data_consegna,
    fornitore_id, riferimento, imponibile, iva, totale, stato, note,
    cancellato, data_creazione, data_modifica)
  SELECT CAST(s.max_prog + s.rn AS VARCHAR(20)) + '/' + CAST(s.anno AS VARCHAR(4)),
    s.max_prog + s.rn, s.anno, s.data_documento, s.data_consegna,
    s.fornitore_id, s.riferimento, s.imponibile, s.iva, s.totale, s.stato, s.note,
    s.cancellato, ISNULL(s.data_creazione, GETDATE()), s.data_modifica
  FROM src s;
END;
GO

/* ============================================================
   2) RICALCOLO TOTALI (testata dalla somma righe)
   Trigger AFTER INSERT/UPDATE/DELETE su ogni tabella *_righe.
   ============================================================ */

IF OBJECT_ID('dbo.tr_fatture_inviate_righe_totali', 'TR') IS NOT NULL DROP TRIGGER dbo.tr_fatture_inviate_righe_totali;
GO
CREATE TRIGGER dbo.tr_fatture_inviate_righe_totali ON dbo.fatture_inviate_righe
AFTER INSERT, UPDATE, DELETE
AS BEGIN
  SET NOCOUNT ON;
  DECLARE @ids TABLE(fattura_id INT PRIMARY KEY);
  INSERT INTO @ids(fattura_id) SELECT DISTINCT fattura_id FROM inserted UNION SELECT DISTINCT fattura_id FROM deleted;

  UPDATE f SET
    f.imponibile = ISNULL(t.imp, 0),
    f.iva        = ISNULL(t.iva, 0),
    f.totale     = ISNULL(t.imp, 0) + ISNULL(t.iva, 0) + ISNULL(f.bollo_valore, 0)
  FROM dbo.fatture_inviate f
  INNER JOIN @ids ids ON ids.fattura_id = f.id
  OUTER APPLY (
    SELECT SUM(r.imponibile_riga) AS imp, SUM(r.iva_riga) AS iva
    FROM dbo.fatture_inviate_righe r WHERE r.fattura_id = f.id
  ) t;
END;
GO

IF OBJECT_ID('dbo.tr_fatture_ricevute_righe_totali', 'TR') IS NOT NULL DROP TRIGGER dbo.tr_fatture_ricevute_righe_totali;
GO
CREATE TRIGGER dbo.tr_fatture_ricevute_righe_totali ON dbo.fatture_ricevute_righe
AFTER INSERT, UPDATE, DELETE
AS BEGIN
  SET NOCOUNT ON;
  DECLARE @ids TABLE(fattura_id INT PRIMARY KEY);
  INSERT INTO @ids(fattura_id) SELECT DISTINCT fattura_id FROM inserted UNION SELECT DISTINCT fattura_id FROM deleted;
  UPDATE f SET
    f.imponibile = ISNULL(t.imp, 0), f.iva = ISNULL(t.iva, 0),
    f.totale = ISNULL(t.imp, 0) + ISNULL(t.iva, 0)
  FROM dbo.fatture_ricevute f INNER JOIN @ids ids ON ids.fattura_id = f.id
  OUTER APPLY (SELECT SUM(r.imponibile_riga) AS imp, SUM(r.iva_riga) AS iva
               FROM dbo.fatture_ricevute_righe r WHERE r.fattura_id = f.id) t;
END;
GO

IF OBJECT_ID('dbo.tr_preventivi_righe_totali', 'TR') IS NOT NULL DROP TRIGGER dbo.tr_preventivi_righe_totali;
GO
CREATE TRIGGER dbo.tr_preventivi_righe_totali ON dbo.preventivi_righe
AFTER INSERT, UPDATE, DELETE
AS BEGIN
  SET NOCOUNT ON;
  DECLARE @ids TABLE(preventivo_id INT PRIMARY KEY);
  INSERT INTO @ids(preventivo_id) SELECT DISTINCT preventivo_id FROM inserted UNION SELECT DISTINCT preventivo_id FROM deleted;
  UPDATE p SET
    p.imponibile = ISNULL(t.imp, 0), p.iva = ISNULL(t.iva, 0),
    p.totale = ISNULL(t.imp, 0) + ISNULL(t.iva, 0)
  FROM dbo.preventivi p INNER JOIN @ids ids ON ids.preventivo_id = p.id
  OUTER APPLY (SELECT SUM(r.imponibile_riga) AS imp, SUM(r.iva_riga) AS iva
               FROM dbo.preventivi_righe r WHERE r.preventivo_id = p.id) t;
END;
GO

IF OBJECT_ID('dbo.tr_ordini_righe_totali', 'TR') IS NOT NULL DROP TRIGGER dbo.tr_ordini_righe_totali;
GO
CREATE TRIGGER dbo.tr_ordini_righe_totali ON dbo.ordini_righe
AFTER INSERT, UPDATE, DELETE
AS BEGIN
  SET NOCOUNT ON;
  DECLARE @ids TABLE(ordine_id INT PRIMARY KEY);
  INSERT INTO @ids(ordine_id) SELECT DISTINCT ordine_id FROM inserted UNION SELECT DISTINCT ordine_id FROM deleted;
  UPDATE o SET
    o.imponibile = ISNULL(t.imp, 0), o.iva = ISNULL(t.iva, 0),
    o.totale = ISNULL(t.imp, 0) + ISNULL(t.iva, 0)
  FROM dbo.ordini o INNER JOIN @ids ids ON ids.ordine_id = o.id
  OUTER APPLY (SELECT SUM(r.imponibile_riga) AS imp, SUM(r.iva_riga) AS iva
               FROM dbo.ordini_righe r WHERE r.ordine_id = o.id) t;
END;
GO

IF OBJECT_ID('dbo.tr_proforma_righe_totali', 'TR') IS NOT NULL DROP TRIGGER dbo.tr_proforma_righe_totali;
GO
CREATE TRIGGER dbo.tr_proforma_righe_totali ON dbo.proforma_righe
AFTER INSERT, UPDATE, DELETE
AS BEGIN
  SET NOCOUNT ON;
  DECLARE @ids TABLE(proforma_id INT PRIMARY KEY);
  INSERT INTO @ids(proforma_id) SELECT DISTINCT proforma_id FROM inserted UNION SELECT DISTINCT proforma_id FROM deleted;
  UPDATE p SET
    p.imponibile = ISNULL(t.imp, 0), p.iva = ISNULL(t.iva, 0),
    p.totale = ISNULL(t.imp, 0) + ISNULL(t.iva, 0)
  FROM dbo.proforma p INNER JOIN @ids ids ON ids.proforma_id = p.id
  OUTER APPLY (SELECT SUM(r.imponibile_riga) AS imp, SUM(r.iva_riga) AS iva
               FROM dbo.proforma_righe r WHERE r.proforma_id = p.id) t;
END;
GO

IF OBJECT_ID('dbo.tr_ordini_acquisto_righe_totali', 'TR') IS NOT NULL DROP TRIGGER dbo.tr_ordini_acquisto_righe_totali;
GO
CREATE TRIGGER dbo.tr_ordini_acquisto_righe_totali ON dbo.ordini_acquisto_righe
AFTER INSERT, UPDATE, DELETE
AS BEGIN
  SET NOCOUNT ON;
  DECLARE @ids TABLE(ordine_id INT PRIMARY KEY);
  INSERT INTO @ids(ordine_id) SELECT DISTINCT ordine_id FROM inserted UNION SELECT DISTINCT ordine_id FROM deleted;
  UPDATE o SET
    o.imponibile = ISNULL(t.imp, 0), o.iva = ISNULL(t.iva, 0),
    o.totale = ISNULL(t.imp, 0) + ISNULL(t.iva, 0)
  FROM dbo.ordini_acquisto o INNER JOIN @ids ids ON ids.ordine_id = o.id
  OUTER APPLY (SELECT SUM(r.imponibile_riga) AS imp, SUM(r.iva_riga) AS iva
               FROM dbo.ordini_acquisto_righe r WHERE r.ordine_id = o.id) t;
END;
GO

PRINT 'Trigger numerazione + totali applicati.';
GO
