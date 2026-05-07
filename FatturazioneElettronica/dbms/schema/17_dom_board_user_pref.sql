-- ====================================================================
-- 17_dom_board_user_pref.sql  (DB Metadati: FatturazioneElettronica_Metadata)
-- ====================================================================
-- Workflow #15: Dashboard widget configurabili per utente.
--
-- Tabella `dom_board_user_pref` per memorizzare preferenze layout/widget
-- per coppia (user_id, board_route). Il `layout_json` e' un payload
-- libero JSON (nascondi/mostra widget, riordino, dimensioni).
--
-- Endpoint REST esposti da BoardPrefController:
--   GET  /api/board-pref?route=<route>          -> { ok, layout_json|null }
--   POST /api/board-pref { route, layout_json } -> { ok, saved }
--   DELETE /api/board-pref?route=<route>        -> { ok, deleted }
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.dom_board_user_pref', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.dom_board_user_pref (
        user_id      INT             NOT NULL,
        board_route  NVARCHAR(200)   NOT NULL,
        layout_json  NVARCHAR(MAX)   NOT NULL,
        updated_at   DATETIME        NOT NULL CONSTRAINT DF_dom_board_user_pref_updated DEFAULT (GETDATE()),
        CONSTRAINT PK_dom_board_user_pref PRIMARY KEY CLUSTERED (user_id, board_route)
    );
    PRINT 'dom_board_user_pref creata.';
END
ELSE
    PRINT 'dom_board_user_pref gia esistente.';
GO
