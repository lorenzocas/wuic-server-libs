-- ====================================================================
-- 26_movimenti_banca.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Workflow #21: Import movimenti bancari + matching automatico con scadenze.
--
-- Tabella `movimenti_banca`: registro movimenti importati da estratto conto
-- (import via Excel/CSV usando il bottone framework "Import XLS" gia'
-- presente sulla list-grid).
--
-- Pattern framework-first:
--   - tabella scaffolded → la route automaticamente espone:
--     - list-grid con CRUD
--     - bottone "Import / Export XLS" (componente wuic-import-export-button)
--     - filtri + search + sort
--   - custom action "Concilia con scadenze" su `_mtdt__cstom__actions__tabelle`
--     chiama `sp_match_movimenti_con_scadenze(@max_giorni)` per matching
--   - NESSUN componente Angular custom necessario
--
-- Schema:
--   - data_movimento: data valuta dal estratto conto
--   - importo: positivo = entrata (incasso), negativo = uscita (pagamento)
--   - causale_banca: descrizione testuale dal estratto conto (free text)
--   - banca_id: FK alla banca di origine (per multi-banca)
--   - scadenza_id: FK alla scadenza matchata (NULL se non ancora conciliato)
--   - stato: NUOVO | CONCILIATO | IGNORATO
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'movimenti_banca')
BEGIN
    CREATE TABLE dbo.movimenti_banca (
        id              INT IDENTITY(1,1) PRIMARY KEY,
        data_movimento  DATE          NOT NULL,
        data_valuta     DATE          NULL,
        importo         DECIMAL(19,4) NOT NULL,    -- + entrata, - uscita
        causale_banca   NVARCHAR(500) NOT NULL,    -- free text estratto conto
        riferimento     NVARCHAR(100) NULL,        -- numero op. / codice CRO
        banca_id        INT           NULL,
        scadenza_id     INT           NULL,        -- FK matchata (NULL = non conciliato)
        stato           NVARCHAR(20)  NOT NULL DEFAULT 'NUOVO', -- NUOVO|CONCILIATO|IGNORATO
        note            NVARCHAR(500) NULL,
        cancellato      BIT           NOT NULL DEFAULT 0,
        data_creazione  DATETIME      NOT NULL DEFAULT GETDATE(),
        data_modifica   DATETIME      NULL,
        CONSTRAINT FK_mov_banca_banca    FOREIGN KEY (banca_id)    REFERENCES dbo.banche(id),
        CONSTRAINT FK_mov_banca_scadenza FOREIGN KEY (scadenza_id) REFERENCES dbo.scadenze(id),
        CONSTRAINT CK_mov_banca_stato CHECK (stato IN ('NUOVO','CONCILIATO','IGNORATO'))
    );
    CREATE INDEX IX_mov_banca_data ON dbo.movimenti_banca(data_movimento);
    CREATE INDEX IX_mov_banca_stato ON dbo.movimenti_banca(stato);
    CREATE INDEX IX_mov_banca_scadenza ON dbo.movimenti_banca(scadenza_id);
    PRINT 'movimenti_banca creata.';
END
ELSE PRINT 'movimenti_banca gia esistente.';
GO

-- SP matching: associa movimenti NUOVO a scadenze APERTA con importo+date match
IF OBJECT_ID('dbo.sp_match_movimenti_con_scadenze', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_match_movimenti_con_scadenze;
GO

CREATE PROCEDURE dbo.sp_match_movimenti_con_scadenze
    @max_giorni      INT = 30,         -- finestra +/- gg attorno data_movimento
    @auto_marca_pagata BIT = 1         -- se 1, marca scadenza PAGATA dopo match
AS
BEGIN
    SET NOCOUNT ON;

    -- Tabella per tracking risultati (per output finale)
    DECLARE @processed TABLE (
        movimento_id INT,
        scadenza_id INT,
        match_kind NVARCHAR(20)
    );

    -- ENTRATE (importo > 0) → scadenze INCASSO con stesso importo
    -- Match SOLO se UNA sola scadenza candidate (no ambiguita').
    INSERT INTO @processed (movimento_id, scadenza_id, match_kind)
    SELECT m.id, candidates.scad_id, 'INCASSO'
    FROM dbo.movimenti_banca m
    CROSS APPLY (
        SELECT TOP 2 s.id AS scad_id
        FROM dbo.scadenze s
        WHERE ISNULL(s.cancellato, 0) = 0
          AND s.tipo = 'INCASSO'
          AND s.stato IN ('APERTA','PARZIALE')
          AND ABS(s.importo - s.importo_pagato - m.importo) < 0.01
          AND ABS(DATEDIFF(DAY, s.data_scadenza, m.data_movimento)) <= @max_giorni
    ) candidates
    WHERE ISNULL(m.cancellato, 0) = 0
      AND m.stato = 'NUOVO'
      AND m.importo > 0
      AND m.scadenza_id IS NULL
      -- Solo se UNA sola scadenza candidate
      AND (SELECT COUNT(*) FROM dbo.scadenze s2
           WHERE ISNULL(s2.cancellato,0)=0 AND s2.tipo='INCASSO'
             AND s2.stato IN ('APERTA','PARZIALE')
             AND ABS(s2.importo - s2.importo_pagato - m.importo) < 0.01
             AND ABS(DATEDIFF(DAY, s2.data_scadenza, m.data_movimento)) <= @max_giorni) = 1;

    -- USCITE (importo < 0) → scadenze PAGAMENTO con importo abs match
    INSERT INTO @processed (movimento_id, scadenza_id, match_kind)
    SELECT m.id, candidates.scad_id, 'PAGAMENTO'
    FROM dbo.movimenti_banca m
    CROSS APPLY (
        SELECT TOP 2 s.id AS scad_id
        FROM dbo.scadenze s
        WHERE ISNULL(s.cancellato, 0) = 0
          AND s.tipo = 'PAGAMENTO'
          AND s.stato IN ('APERTA','PARZIALE')
          AND ABS(s.importo - s.importo_pagato - ABS(m.importo)) < 0.01
          AND ABS(DATEDIFF(DAY, s.data_scadenza, m.data_movimento)) <= @max_giorni
    ) candidates
    WHERE ISNULL(m.cancellato, 0) = 0
      AND m.stato = 'NUOVO'
      AND m.importo < 0
      AND m.scadenza_id IS NULL
      AND (SELECT COUNT(*) FROM dbo.scadenze s2
           WHERE ISNULL(s2.cancellato,0)=0 AND s2.tipo='PAGAMENTO'
             AND s2.stato IN ('APERTA','PARZIALE')
             AND ABS(s2.importo - s2.importo_pagato - ABS(m.importo)) < 0.01
             AND ABS(DATEDIFF(DAY, s2.data_scadenza, m.data_movimento)) <= @max_giorni) = 1;

    -- Aggiorna movimenti
    UPDATE m SET
        m.scadenza_id = p.scadenza_id,
        m.stato = 'CONCILIATO',
        m.data_modifica = GETDATE()
    FROM dbo.movimenti_banca m
    JOIN @processed p ON p.movimento_id = m.id;

    -- Auto marca scadenza PAGATA (se richiesto)
    IF @auto_marca_pagata = 1
    BEGIN
        UPDATE s SET
            s.stato = 'PAGATA',
            s.importo_pagato = s.importo,
            s.data_pagamento = ISNULL(s.data_pagamento, m.data_movimento)
        FROM dbo.scadenze s
        JOIN @processed p ON p.scadenza_id = s.id
        JOIN dbo.movimenti_banca m ON m.id = p.movimento_id;
    END

    -- Output: stats per il caller
    SELECT
        COUNT(*) AS num_matched,
        SUM(CASE WHEN match_kind='INCASSO' THEN 1 ELSE 0 END) AS num_incassi,
        SUM(CASE WHEN match_kind='PAGAMENTO' THEN 1 ELSE 0 END) AS num_pagamenti
    FROM @processed;
END;
GO

PRINT 'sp_match_movimenti_con_scadenze creata.';
GO
