-- ====================================================================
-- 19_user_saved_searches.sql  (DB Metadati: FatturazioneElettronica_Metadata)
-- ====================================================================
-- Workflow #19: Saved Searches per utente.
--
-- Tabella `user_saved_searches`: una utente puo' salvare combinazioni di
-- filtri (filterInfo JSON) per una data route, riapplicabili in 1 click
-- dalla list-grid via FAB "Filtri salvati".
--
-- Endpoint REST esposti da SavedSearchController (DB Metadati):
--   GET    /api/saved-searches?route=<r>&user_id=<id>     -> { ok, results: [...] }
--   POST   /api/saved-searches { route, user_id, label, filter_json } -> { ok, id }
--   DELETE /api/saved-searches/{id}?user_id=<id>          -> { ok, deleted }
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.user_saved_searches', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.user_saved_searches (
        id              INT IDENTITY(1,1) PRIMARY KEY,
        user_id         INT             NOT NULL,
        route           NVARCHAR(200)   NOT NULL,
        label           NVARCHAR(200)   NOT NULL,
        filter_json     NVARCHAR(MAX)   NOT NULL,
        created_at      DATETIME        NOT NULL CONSTRAINT DF_user_saved_searches_created DEFAULT (GETDATE()),
        updated_at      DATETIME        NULL
    );
    CREATE INDEX IX_uss_user_route ON dbo.user_saved_searches(user_id, route);
    PRINT 'user_saved_searches creata.';
END
ELSE
    PRINT 'user_saved_searches gia esistente.';
GO
