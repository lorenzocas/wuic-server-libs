-- ============================================================================
-- Patch dbo.cleanMetadataPreserveDemo
-- Aggiunge cleanup di leftover `_test_col_*` (1521 righe in Kiara_wuic_new
-- template clone). Coerente con la patch su `cleanMetadata`.
-- ============================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

ALTER PROCEDURE [dbo].[cleanMetadataPreserveDemo]
AS
BEGIN

delete from utenti;
DELETE FROM dbo.dom_board where id1 >= 5052;
delete from _error__logs;
delete from [dbo].[_mail_recipients];
delete from [dbo].[_mailing_lists];
delete from [dbo].[_notifications];
delete from [dbo].[_progress_indicator];
delete from [dbo].[scheduler_execution];

delete from [dbo].[TestMaster];

-- Cleanup leftover _test_col_* (template smoke-test dev framework, ~1521 righe).
-- Verificato 2026-05-09 (FlottaMezzi): erano test data del framework lasciati
-- nel template Kiara_wuic_new che fanno scattare errors.client.metadata.lookup_orphan
-- su qualsiasi edit-form aperto.
delete from [dbo].[_metadati__colonne] where mc_nome_colonna LIKE '_test_col[_]%';

delete from ruoli where id_ruolo > 2;

END
GO
