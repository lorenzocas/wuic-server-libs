


CREATE PROCEDURE [dbo].[cleanMetadata]
AS
BEGIN

delete from utenti where id_utente > 100006
delete from dbo._mtdt__cstom__actions__tabelle where mdid not in (select md_id from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) = 1 or coalesce(issystemroute,0) = 1);
delete from [dbo].[_metadati__u_i__stili__tabelle] where [mdid] not in (select md_id from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) = 1 or coalesce(issystemroute,0) = 1);
delete from [dbo].[_mtdt__tnt__trzzzioni__tabelle] where [md_id] not in (select md_id from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) = 1 or coalesce(issystemroute,0) = 1);

delete from [dbo].[_metadati__u_i__stili__colonne] where [mc_id] not in (select mc_id from [dbo].[_metadati__colonne] where [md_id] in (select md_id from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) = 1 or coalesce(issystemroute,0) = 1)); 
delete from [dbo].[_mtdt__tnt__trzzzioni__colonne] where [mc_id] not in (select mc_id from [dbo].[_metadati__colonne] where [md_id] in (select md_id from dbo._metadati__tabelle where coalesce( md_is_system_metadata,0) = 1 or coalesce(issystemroute,0) = 1));

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

--update sys_info set fingerprint = null, lcd1 =null;
--delete from [dbo].[tabella_reticolare];

END
