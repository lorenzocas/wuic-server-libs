/* ============================================================
   FatturazioneElettronica — FIX trigger numerazione
   ============================================================
   Bug rilevato 2026-05-05 dalla suite e2e (test 09):
     i 6 trigger INSTEAD OF di numerazione non gestivano
     `inserted.anno IS NULL` — quando il framework client invia un
     payload senza `anno`, `numero` finiva NULL e violava UNIQUE.

   Fix: COALESCE(inserted.anno, YEAR(data_documento), YEAR(GETDATE()))
   prima di calcolare max progressivo + comporre numero.
   ============================================================ */

USE FatturazioneElettronica_Data;
SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET NUMERIC_ROUNDABORT OFF;
GO

/* ---- fatture_inviate ---- */
IF OBJECT_ID('dbo.tr_fatture_inviate_numerazione', 'TR') IS NOT NULL DROP TRIGGER dbo.tr_fatture_inviate_numerazione;
GO
CREATE TRIGGER dbo.tr_fatture_inviate_numerazione
ON dbo.fatture_inviate INSTEAD OF INSERT
AS BEGIN
  SET NOCOUNT ON;
  ;WITH src AS (
    SELECT i.*,
      COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) AS eff_anno,
      ISNULL(i.serie, '') AS eff_serie,
      ROW_NUMBER() OVER (PARTITION BY COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())), ISNULL(i.serie,'') ORDER BY (SELECT 1)) AS rn,
      ISNULL((SELECT MAX(progressivo) FROM dbo.fatture_inviate fx
              WHERE fx.anno = COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE()))
                AND ISNULL(fx.serie,'') = ISNULL(i.serie,'') AND fx.cancellato = 0), 0) AS max_prog
    FROM inserted i
  )
  INSERT INTO dbo.fatture_inviate (
    numero, serie, progressivo, anno, data_documento,
    cliente_id, pagamento_id, banca_id, causale, riferimento_ordine,
    bollo_valore, sconto_globale_perc, imponibile, iva, totale,
    stato, stato_sdi, sdi_id, sdi_messaggio, file_xml, note,
    cancellato, data_creazione, data_modifica, utente_creazione, utente_modifica
  )
  SELECT
    CASE WHEN s.eff_serie = ''
         THEN CAST(s.max_prog + s.rn AS VARCHAR(20)) + '/' + CAST(s.eff_anno AS VARCHAR(4))
         ELSE s.eff_serie + '-' + CAST(s.max_prog + s.rn AS VARCHAR(20)) + '/' + CAST(s.eff_anno AS VARCHAR(4))
    END,
    s.serie, s.max_prog + s.rn, s.eff_anno,
    s.data_documento, s.cliente_id, s.pagamento_id, s.banca_id, s.causale, s.riferimento_ordine,
    ISNULL(s.bollo_valore, 0), s.sconto_globale_perc, ISNULL(s.imponibile, 0), ISNULL(s.iva, 0), ISNULL(s.totale, 0),
    ISNULL(s.stato, 'BOZZA'), s.stato_sdi, s.sdi_id, s.sdi_messaggio, s.file_xml, s.note,
    ISNULL(s.cancellato, 0), ISNULL(s.data_creazione, GETDATE()), s.data_modifica, s.utente_creazione, s.utente_modifica
  FROM src s;
END;
GO

/* ---- preventivi ---- */
IF OBJECT_ID('dbo.tr_preventivi_numerazione', 'TR') IS NOT NULL DROP TRIGGER dbo.tr_preventivi_numerazione;
GO
CREATE TRIGGER dbo.tr_preventivi_numerazione ON dbo.preventivi INSTEAD OF INSERT
AS BEGIN
  SET NOCOUNT ON;
  ;WITH src AS (
    SELECT i.*,
      COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) AS eff_anno,
      ROW_NUMBER() OVER (PARTITION BY COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) ORDER BY (SELECT 1)) AS rn,
      ISNULL((SELECT MAX(progressivo) FROM dbo.preventivi fx
              WHERE fx.anno = COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) AND fx.cancellato = 0), 0) AS max_prog
    FROM inserted i
  )
  INSERT INTO dbo.preventivi (numero, progressivo, anno, data_documento, data_validita,
    cliente_id, oggetto, imponibile, iva, totale, stato, note,
    cancellato, data_creazione, data_modifica)
  SELECT CAST(s.max_prog + s.rn AS VARCHAR(20)) + '/' + CAST(s.eff_anno AS VARCHAR(4)),
    s.max_prog + s.rn, s.eff_anno, s.data_documento, s.data_validita,
    s.cliente_id, s.oggetto, ISNULL(s.imponibile, 0), ISNULL(s.iva, 0), ISNULL(s.totale, 0),
    ISNULL(s.stato, 'BOZZA'), s.note,
    ISNULL(s.cancellato, 0), ISNULL(s.data_creazione, GETDATE()), s.data_modifica
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
    SELECT i.*,
      COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) AS eff_anno,
      ROW_NUMBER() OVER (PARTITION BY COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) ORDER BY (SELECT 1)) AS rn,
      ISNULL((SELECT MAX(progressivo) FROM dbo.ordini fx
              WHERE fx.anno = COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) AND fx.cancellato = 0), 0) AS max_prog
    FROM inserted i
  )
  INSERT INTO dbo.ordini (numero, progressivo, anno, data_documento, data_consegna,
    cliente_id, riferimento_cliente, imponibile, iva, totale, stato, note,
    cancellato, data_creazione, data_modifica)
  SELECT CAST(s.max_prog + s.rn AS VARCHAR(20)) + '/' + CAST(s.eff_anno AS VARCHAR(4)),
    s.max_prog + s.rn, s.eff_anno, s.data_documento, s.data_consegna,
    s.cliente_id, s.riferimento_cliente, ISNULL(s.imponibile, 0), ISNULL(s.iva, 0), ISNULL(s.totale, 0),
    ISNULL(s.stato, 'APERTO'), s.note,
    ISNULL(s.cancellato, 0), ISNULL(s.data_creazione, GETDATE()), s.data_modifica
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
    SELECT i.*,
      COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) AS eff_anno,
      ROW_NUMBER() OVER (PARTITION BY COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) ORDER BY (SELECT 1)) AS rn,
      ISNULL((SELECT MAX(progressivo) FROM dbo.ddt fx
              WHERE fx.anno = COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) AND fx.cancellato = 0), 0) AS max_prog
    FROM inserted i
  )
  INSERT INTO dbo.ddt (numero, progressivo, anno, data_documento, cliente_id,
    causale_trasporto, aspetto_beni, n_colli, peso_lordo, porto, vettore, data_ora_trasporto,
    stato, fattura_id, note, cancellato, data_creazione, data_modifica)
  SELECT CAST(s.max_prog + s.rn AS VARCHAR(20)) + '/' + CAST(s.eff_anno AS VARCHAR(4)),
    s.max_prog + s.rn, s.eff_anno, s.data_documento, s.cliente_id,
    s.causale_trasporto, s.aspetto_beni, s.n_colli, s.peso_lordo, s.porto, s.vettore, s.data_ora_trasporto,
    ISNULL(s.stato, 'EMESSO'), s.fattura_id, s.note,
    ISNULL(s.cancellato, 0), ISNULL(s.data_creazione, GETDATE()), s.data_modifica
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
    SELECT i.*,
      COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) AS eff_anno,
      ROW_NUMBER() OVER (PARTITION BY COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) ORDER BY (SELECT 1)) AS rn,
      ISNULL((SELECT MAX(progressivo) FROM dbo.proforma fx
              WHERE fx.anno = COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) AND fx.cancellato = 0), 0) AS max_prog
    FROM inserted i
  )
  INSERT INTO dbo.proforma (numero, progressivo, anno, data_documento, cliente_id,
    imponibile, iva, totale, stato, fattura_id, note, cancellato, data_creazione)
  SELECT CAST(s.max_prog + s.rn AS VARCHAR(20)) + '/' + CAST(s.eff_anno AS VARCHAR(4)),
    s.max_prog + s.rn, s.eff_anno, s.data_documento, s.cliente_id,
    ISNULL(s.imponibile, 0), ISNULL(s.iva, 0), ISNULL(s.totale, 0),
    ISNULL(s.stato, 'EMESSA'), s.fattura_id, s.note,
    ISNULL(s.cancellato, 0), ISNULL(s.data_creazione, GETDATE())
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
    SELECT i.*,
      COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) AS eff_anno,
      ROW_NUMBER() OVER (PARTITION BY COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) ORDER BY (SELECT 1)) AS rn,
      ISNULL((SELECT MAX(progressivo) FROM dbo.ordini_acquisto fx
              WHERE fx.anno = COALESCE(i.anno, YEAR(i.data_documento), YEAR(GETDATE())) AND fx.cancellato = 0), 0) AS max_prog
    FROM inserted i
  )
  INSERT INTO dbo.ordini_acquisto (numero, progressivo, anno, data_documento, data_consegna,
    fornitore_id, riferimento, imponibile, iva, totale, stato, note,
    cancellato, data_creazione, data_modifica)
  SELECT CAST(s.max_prog + s.rn AS VARCHAR(20)) + '/' + CAST(s.eff_anno AS VARCHAR(4)),
    s.max_prog + s.rn, s.eff_anno, s.data_documento, s.data_consegna,
    s.fornitore_id, s.riferimento, ISNULL(s.imponibile, 0), ISNULL(s.iva, 0), ISNULL(s.totale, 0),
    ISNULL(s.stato, 'APERTO'), s.note,
    ISNULL(s.cancellato, 0), ISNULL(s.data_creazione, GETDATE()), s.data_modifica
  FROM src s;
END;
GO

PRINT '6 trigger numerazione FIXED (COALESCE su anno + ISNULL su altri default).';
GO
