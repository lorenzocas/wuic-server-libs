-- ============================================================================
-- Patch dbo.cleanMetadata
-- Aggiunge cleanup di leftover `_test_col_*` (1521 righe in Kiara_wuic_new
-- template clone) sulla route metadata _metadati__colonne. Verificato 2026-05-09:
-- erano test data del dev framework lasciati nel template, non coperti dalla
-- versione originale di cleanMetadata.
--
-- La DELETE va prima della pulizia route business (riga 22 del corpo originale),
-- ma il filtro mc_nome_colonna LIKE '_test_col[_]%' la rende isolata: si puo'
-- mettere ovunque senza interferire.
-- ============================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

ALTER PROCEDURE [dbo].[cleanMetadata]
AS
BEGIN

delete from utenti where id_utente > 100006
delete from dbo._mtdt__cstom__actions__tabelle where mdid not in (select md_id from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) = 1 or coalesce(issystemroute,0) = 1);
delete from [dbo].[_metadati__u_i__stili__tabelle] where [mdid] not in (select md_id from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) = 1 or coalesce(issystemroute,0) = 1);
delete from [dbo].[_mtdt__tnt__trzzzioni__tabelle] where [md_id] not in (select md_id from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) = 1 or coalesce(issystemroute,0) = 1);

delete from [dbo].[_metadati__u_i__stili__colonne] where [mc_id] not in (select mc_id from [dbo].[_metadati__colonne] where [md_id] in (select md_id from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) = 1 or coalesce(issystemroute,0) = 1));
delete from [dbo].[_mtdt__tnt__trzzzioni__colonne] where [mc_id] not in (select mc_id from [dbo].[_metadati__colonne] where [md_id] in (select md_id from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) = 1 or coalesce(issystemroute,0) = 1));

-- Cleanup leftover _test_col_* (template smoke-test dev framework, ~1521 righe).
-- Non coperti dalla DELETE su _metadati__tabelle perche' appartengono alla
-- route system _metadati__colonne (md_is_system_metadata=1) -> orfani permanenti.
delete from [dbo].[_metadati__colonne] where mc_nome_colonna LIKE '_test_col[_]%';

delete from dbo.definizione__universi;
delete from dbo.universi;

delete from [dbo].[scheduler_execution];
delete from [dbo].[scheduler]

delete from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) =0 and coalesce(issystemroute,0) = 0;

delete from [dbo].[_mtdt__tnt__trizzazioni__menus];
DELETE FROM dbo._metadati__menu WHERE mm_id>1000 and (mdid not in (select md_id from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) = 1 or coalesce(issystemroute,0) = 1) or mdid is null)
and mm_parent_id <> 750;

delete from [dbo].[_metadati_condition_item] where FK_CG_Id not in (select cg_id from [dbo].[_metadati_condition_group] where md_id in (select md_id from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) = 1 or coalesce(issystemroute,0) = 1));
delete from [dbo].[_metadati_condition_action_item] where FK_CAG_Id not in (select cag_id from [dbo].[_metadati_condition_action_group] where FK_CG_Id in (select cg_id from [dbo].[_metadati_condition_group] where md_id in (select md_id from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) = 1 or coalesce(issystemroute,0) = 1)));

delete from [dbo].[_metadati_condition_action_group] where FK_CG_Id not in (select cg_id from [dbo].[_metadati_condition_group] where md_id in (select md_id from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) = 1 or coalesce(issystemroute,0) = 1));
delete from [dbo].[_metadati_condition_group] where md_id not in (select md_id from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) = 1 or coalesce(issystemroute,0) = 1);


delete from dbo.tabella_reticolare;
DELETE FROM dom_board_sheet;
DELETE FROM dbo.dom_board;
DELETE FROM dbo.definizione__universi;
DELETE FROM dbo.universi;
delete from _error__logs;
delete from [dbo].[_metadati__wizard];
delete from [dbo].[_metadati__wizard__tabelle];
delete from [dbo].[_routing__table];
delete from [dbo].[aziende];

delete from ruoli where id_ruolo > 2;

END
GO
