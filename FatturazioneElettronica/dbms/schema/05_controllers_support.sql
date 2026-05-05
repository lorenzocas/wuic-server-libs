/* ============================================================
   FatturazioneElettronica — Tabelle + Stored a supporto dei
   controller .NET custom (livello 5 decision-ladder).

   Tabelle:
     - email_log              (log invio email da EmailController)
     - movimenti_bancari      (estratto conto importato da CSV)
   Stored:
     - sp_sdi_get_fattura_payload   (estrae dati fattura per export XML SDI)
     - sp_email_log_register        (registra invio email)
     - sp_match_movimenti_scadenze  (match automatico movimenti vs scadenze)
     - sp_lipe_aggregate_quarter    (aggregazione IVA trimestrale per LIPE)
     - sp_esterometro_period        (operazioni non SDI per periodo)
   ============================================================ */

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

/* ---------- email_log ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'email_log')
BEGIN
  CREATE TABLE dbo.email_log (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    fattura_id        INT           NULL,
    recipient_to      VARCHAR(500)  NOT NULL,
    recipient_cc      VARCHAR(500)  NULL,
    subject           VARCHAR(500)  NOT NULL,
    body              VARCHAR(MAX)  NULL,
    attachment_paths  VARCHAR(MAX)  NULL,           -- JSON array di path
    status            VARCHAR(20)   NOT NULL DEFAULT 'PENDING',  -- PENDING|SENT|FAILED
    smtp_response     VARCHAR(MAX)  NULL,
    sent_at           DATETIME      NULL,
    created_at        DATETIME      NOT NULL DEFAULT GETDATE(),
    utente_creazione  INT           NULL,
    CONSTRAINT FK_email_log_fattura FOREIGN KEY (fattura_id) REFERENCES dbo.fatture_inviate(id)
  );
  CREATE INDEX IX_email_log_status ON dbo.email_log(status);
  CREATE INDEX IX_email_log_fattura ON dbo.email_log(fattura_id);
END
GO

/* ---------- movimenti_bancari (estratto conto) ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'movimenti_bancari')
BEGIN
  CREATE TABLE dbo.movimenti_bancari (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    banca_id          INT           NOT NULL,
    data_operazione   DATE          NOT NULL,
    data_valuta       DATE          NULL,
    importo           DECIMAL(19,4) NOT NULL,         -- positivo=accredito, negativo=addebito
    causale           VARCHAR(50)   NULL,             -- BONIFICO|RIBA|ADDEBITO|...
    descrizione       VARCHAR(500)  NULL,
    iban_controparte  VARCHAR(34)   NULL,
    nome_controparte  VARCHAR(300)  NULL,
    riferimento       VARCHAR(200)  NULL,
    scadenza_id       INT           NULL,             -- match con scadenze
    match_score       DECIMAL(5,2)  NULL,             -- 0..100 confidence
    match_status      VARCHAR(20)   NOT NULL DEFAULT 'UNMATCHED', -- UNMATCHED|AUTO|MANUAL|REJECTED
    import_batch_id   VARCHAR(50)   NULL,
    created_at        DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_mov_banca    FOREIGN KEY (banca_id)    REFERENCES dbo.banche(id),
    CONSTRAINT FK_mov_scadenza FOREIGN KEY (scadenza_id) REFERENCES dbo.scadenze(id)
  );
  CREATE INDEX IX_mov_data ON dbo.movimenti_bancari(data_operazione);
  CREATE INDEX IX_mov_status ON dbo.movimenti_bancari(match_status);
END
GO

/* ============================================================
   STORED PROCEDURES
   ============================================================ */

/* ---------- sp_sdi_get_fattura_payload ----------
   Estrae tutti i dati necessari a costruire l'XML FatturaPA
   per una fattura inviata. Ritorna 3 result set:
     1) testata fattura + dati cedente/cessionario
     2) righe fattura
     3) totali IVA per aliquota
*/
IF OBJECT_ID('dbo.sp_sdi_get_fattura_payload', 'P') IS NOT NULL
  DROP PROCEDURE dbo.sp_sdi_get_fattura_payload;
GO
CREATE PROCEDURE dbo.sp_sdi_get_fattura_payload
    @fattura_id INT
AS
BEGIN
    SET NOCOUNT ON;

    -- 1) Testata
    SELECT
        f.id, f.numero, f.serie, f.progressivo, f.anno, f.data_documento,
        f.causale, f.bollo_valore, f.imponibile, f.iva, f.totale,
        f.stato, f.stato_sdi,
        c.codice            AS cliente_codice,
        c.ragione_sociale   AS cliente_ragione_sociale,
        c.partita_iva       AS cliente_piva,
        c.codice_fiscale    AS cliente_cf,
        c.indirizzo         AS cliente_indirizzo,
        c.cap               AS cliente_cap,
        c.citta             AS cliente_citta,
        c.provincia         AS cliente_provincia,
        c.nazione           AS cliente_nazione,
        c.codice_destinatario AS cliente_cod_destinatario,
        c.pec               AS cliente_pec,
        p.codice_sdi        AS pagamento_codice_sdi,
        p.descrizione       AS pagamento_descrizione,
        b.iban              AS banca_iban,
        b.bic_swift         AS banca_bic
    FROM dbo.fatture_inviate f
    JOIN dbo.clienti c          ON c.id = f.cliente_id
    LEFT JOIN dbo.pagamenti p   ON p.id = f.pagamento_id
    LEFT JOIN dbo.banche b      ON b.id = f.banca_id
    WHERE f.id = @fattura_id;

    -- 2) Righe
    SELECT
        r.riga, r.descrizione, r.quantita, r.prezzo_unitario, r.sconto_perc,
        r.imponibile_riga, r.iva_riga, r.totale_riga,
        ci.codice  AS codice_iva,
        ci.aliquota,
        ci.natura_sdi,
        um.codice  AS um_codice
    FROM dbo.fatture_inviate_righe r
    JOIN dbo.codici_iva ci          ON ci.id = r.codice_iva_id
    LEFT JOIN dbo.unita_misura um   ON um.id = r.unita_misura_id
    WHERE r.fattura_id = @fattura_id
    ORDER BY r.riga;

    -- 3) Totali per aliquota (richiesto da DatiRiepilogo SDI)
    SELECT
        ci.aliquota,
        ci.natura_sdi,
        SUM(r.imponibile_riga) AS imponibile,
        SUM(r.iva_riga) AS iva
    FROM dbo.fatture_inviate_righe r
    JOIN dbo.codici_iva ci ON ci.id = r.codice_iva_id
    WHERE r.fattura_id = @fattura_id
    GROUP BY ci.aliquota, ci.natura_sdi
    ORDER BY ci.aliquota;
END
GO

/* ---------- sp_email_log_register ---------- */
IF OBJECT_ID('dbo.sp_email_log_register', 'P') IS NOT NULL
  DROP PROCEDURE dbo.sp_email_log_register;
GO
CREATE PROCEDURE dbo.sp_email_log_register
    @fattura_id        INT = NULL,
    @recipient_to      VARCHAR(500),
    @recipient_cc      VARCHAR(500) = NULL,
    @subject           VARCHAR(500),
    @body              VARCHAR(MAX),
    @attachment_paths  VARCHAR(MAX) = NULL,
    @status            VARCHAR(20) = 'PENDING',
    @smtp_response     VARCHAR(MAX) = NULL,
    @utente_creazione  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.email_log
        (fattura_id, recipient_to, recipient_cc, subject, body,
         attachment_paths, status, smtp_response,
         sent_at, utente_creazione)
    VALUES
        (@fattura_id, @recipient_to, @recipient_cc, @subject, @body,
         @attachment_paths, @status, @smtp_response,
         CASE WHEN @status = 'SENT' THEN GETDATE() ELSE NULL END,
         @utente_creazione);

    SELECT CAST(SCOPE_IDENTITY() AS INT) AS id;
END
GO

/* ---------- sp_match_movimenti_scadenze ----------
   Match automatico: per ogni movimento UNMATCHED cerca una scadenza
   APERTA con stesso importo (entro tolleranza 0.01€) e data scadenza
   entro ±N giorni dalla data movimento. In caso di match assegna
   scadenza_id, match_score, match_status='AUTO', e crea riga in
   prima_nota collegata.
*/
IF OBJECT_ID('dbo.sp_match_movimenti_scadenze', 'P') IS NOT NULL
  DROP PROCEDURE dbo.sp_match_movimenti_scadenze;
GO
CREATE PROCEDURE dbo.sp_match_movimenti_scadenze
    @giorni_tolleranza INT = 7,
    @tolleranza_importo DECIMAL(19,4) = 0.01
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @matched INT = 0;

    -- Per ogni movimento unmatched, trova candidato scadenza con migliore confidence
    ;WITH candidates AS (
        SELECT
            m.id AS movimento_id,
            s.id AS scadenza_id,
            ABS(DATEDIFF(DAY, m.data_operazione, s.data_scadenza)) AS giorni_diff,
            ABS(ABS(m.importo) - (s.importo - s.importo_pagato)) AS importo_diff,
            ROW_NUMBER() OVER (
                PARTITION BY m.id
                ORDER BY ABS(ABS(m.importo) - (s.importo - s.importo_pagato)),
                         ABS(DATEDIFF(DAY, m.data_operazione, s.data_scadenza))
            ) AS rn
        FROM dbo.movimenti_bancari m
        JOIN dbo.scadenze s ON
            ABS(ABS(m.importo) - (s.importo - s.importo_pagato)) <= @tolleranza_importo
            AND ABS(DATEDIFF(DAY, m.data_operazione, s.data_scadenza)) <= @giorni_tolleranza
            AND s.stato IN ('APERTA','PARZIALE')
            AND s.cancellato = 0
            -- INCASSO -> movimento positivo, PAGAMENTO -> negativo
            AND (
                (s.tipo = 'INCASSO'   AND m.importo > 0) OR
                (s.tipo = 'PAGAMENTO' AND m.importo < 0)
            )
        WHERE m.match_status = 'UNMATCHED'
    )
    UPDATE m
    SET m.scadenza_id = c.scadenza_id,
        m.match_score = CAST(100 - (c.giorni_diff * 5) AS DECIMAL(5,2)),
        m.match_status = 'AUTO'
    FROM dbo.movimenti_bancari m
    JOIN candidates c ON c.movimento_id = m.id AND c.rn = 1;

    SET @matched = @@ROWCOUNT;

    -- Per ogni match nuovo, registra in prima_nota e aggiorna scadenza
    INSERT INTO dbo.prima_nota
        (data_movimento, tipo, causale, descrizione, importo,
         banca_id, scadenza_id, fattura_inviata_id, fattura_ricevuta_id, riferimento_doc)
    SELECT
        m.data_operazione,
        CASE WHEN s.tipo = 'INCASSO' THEN 'ENTRATA' ELSE 'USCITA' END,
        ISNULL(m.causale, 'Riconciliazione bancaria'),
        m.descrizione,
        ABS(m.importo),
        m.banca_id,
        m.scadenza_id,
        s.fattura_inviata_id,
        s.fattura_ricevuta_id,
        m.riferimento
    FROM dbo.movimenti_bancari m
    JOIN dbo.scadenze s ON s.id = m.scadenza_id
    WHERE m.match_status = 'AUTO'
      AND NOT EXISTS (SELECT 1 FROM dbo.prima_nota pn WHERE pn.scadenza_id = m.scadenza_id);

    -- Aggiorna scadenza come PAGATA (assumendo match completo)
    UPDATE s
    SET s.importo_pagato = s.importo,
        s.stato = 'PAGATA',
        s.data_pagamento = m.data_operazione
    FROM dbo.scadenze s
    JOIN dbo.movimenti_bancari m ON m.scadenza_id = s.id
    WHERE m.match_status = 'AUTO' AND s.stato IN ('APERTA','PARZIALE');

    SELECT @matched AS matched_count;
END
GO

/* ---------- sp_lipe_aggregate_quarter ----------
   Aggregazione IVA per LIPE (Liquidazione IVA Periodica).
   Restituisce per il trimestre dato:
     - totale_iva_a_debito (IVA su fatture inviate)
     - totale_iva_a_credito (IVA su fatture ricevute detraibile)
     - saldo_iva (debito - credito)
   Riferimento: Provv. AdE 27/03/2020 e succ.
*/
IF OBJECT_ID('dbo.sp_lipe_aggregate_quarter', 'P') IS NOT NULL
  DROP PROCEDURE dbo.sp_lipe_aggregate_quarter;
GO
CREATE PROCEDURE dbo.sp_lipe_aggregate_quarter
    @anno INT,
    @trimestre INT      -- 1..4
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @data_inizio DATE = DATEFROMPARTS(@anno, ((@trimestre - 1) * 3) + 1, 1);
    DECLARE @data_fine   DATE = EOMONTH(DATEFROMPARTS(@anno, @trimestre * 3, 1));

    DECLARE @iva_debito DECIMAL(19,4)   = 0;
    DECLARE @iva_credito DECIMAL(19,4)  = 0;
    DECLARE @imponibile_op_attive DECIMAL(19,4) = 0;
    DECLARE @imponibile_op_passive DECIMAL(19,4) = 0;

    SELECT
        @imponibile_op_attive = ISNULL(SUM(imponibile), 0),
        @iva_debito           = ISNULL(SUM(iva), 0)
    FROM dbo.fatture_inviate
    WHERE data_documento BETWEEN @data_inizio AND @data_fine
      AND cancellato = 0
      AND stato IN ('EMESSA','CONSEGNATA');

    SELECT
        @imponibile_op_passive = ISNULL(SUM(imponibile), 0),
        @iva_credito           = ISNULL(SUM(iva - iva_indetraibile), 0)
    FROM dbo.fatture_ricevute
    WHERE data_documento BETWEEN @data_inizio AND @data_fine
      AND cancellato = 0
      AND stato IN ('REGISTRATA','PAGATA');

    SELECT
        @anno                    AS anno,
        @trimestre               AS trimestre,
        @data_inizio             AS data_inizio,
        @data_fine               AS data_fine,
        @imponibile_op_attive    AS imponibile_op_attive,
        @imponibile_op_passive   AS imponibile_op_passive,
        @iva_debito              AS iva_debito,
        @iva_credito             AS iva_credito,
        (@iva_debito - @iva_credito) AS saldo_iva,
        CASE WHEN @iva_debito > @iva_credito THEN 'A_VERSARE' ELSE 'A_CREDITO' END AS tipo_saldo;
END
GO

/* ---------- sp_esterometro_period ----------
   Operazioni con controparti estere (non transitate via SDI).
   Pattern: clienti/fornitori con nazione != 'IT' nel periodo.
*/
IF OBJECT_ID('dbo.sp_esterometro_period', 'P') IS NOT NULL
  DROP PROCEDURE dbo.sp_esterometro_period;
GO
CREATE PROCEDURE dbo.sp_esterometro_period
    @anno INT,
    @mese INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @data_inizio DATE = DATEFROMPARTS(@anno, @mese, 1);
    DECLARE @data_fine   DATE = EOMONTH(@data_inizio);

    -- Operazioni attive (verso clienti esteri)
    SELECT 'ATTIVA' AS tipo,
           f.numero AS doc_numero,
           f.data_documento,
           c.partita_iva AS controparte_piva,
           c.ragione_sociale AS controparte_nome,
           c.nazione,
           f.imponibile, f.iva, f.totale
    FROM dbo.fatture_inviate f
    JOIN dbo.clienti c ON c.id = f.cliente_id
    WHERE c.nazione <> 'IT'
      AND f.data_documento BETWEEN @data_inizio AND @data_fine
      AND f.cancellato = 0
    UNION ALL
    -- Operazioni passive (da fornitori esteri)
    SELECT 'PASSIVA' AS tipo,
           f.numero_fornitore AS doc_numero,
           f.data_documento,
           fo.partita_iva AS controparte_piva,
           fo.ragione_sociale AS controparte_nome,
           fo.nazione,
           f.imponibile, f.iva, f.totale
    FROM dbo.fatture_ricevute f
    JOIN dbo.fornitori fo ON fo.id = f.fornitore_id
    WHERE fo.nazione <> 'IT'
      AND f.data_documento BETWEEN @data_inizio AND @data_fine
      AND f.cancellato = 0
    ORDER BY tipo, data_documento;
END
GO

PRINT 'Tabelle email_log + movimenti_bancari + 5 stored procedures applicate.';
GO
