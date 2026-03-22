SET NOCOUNT ON;

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

DECLARE @workflowKey NVARCHAR(200) = N'wizard';
DECLARE @workflowName NVARCHAR(300) = N'CRM Nuova Opportunita';
DECLARE @graphJson NVARCHAR(MAX);
DECLARE @wgId INT;

SET @graphJson = N'{
  "nodes": [
    {"id":"n_start","label":"Start","type":"start","route":"","action":"","actionType":"","actionScope":"","routeNodeId":"","metadataTargetType":"","x":120,"y":220,"startMenus":[],"startMenuCaption":"Nuova opportunita guidata","startInheritMetadata":true,"startExclusiveMenu":false,"startShowExit":true,"routeMetadata":null},
    {"id":"n_acc","label":"Step 1 - crm_accounts [list]","type":"route","route":"crm_accounts","action":"list","routeSourceType":"route","dashboardDatasources":[],"x":420,"y":220,"routeMetadata":null},
    {"id":"n_cont","label":"Step 2 - crm_contacts [list]","type":"route","route":"crm_contacts","action":"list","routeSourceType":"route","dashboardDatasources":[],"x":730,"y":220,"routeMetadata":null},
    {"id":"n_opp","label":"Step 3 - crm_opportunities [list]","type":"route","route":"crm_opportunities","action":"list","routeSourceType":"route","dashboardDatasources":[],"x":1040,"y":220,"routeMetadata":null},
    {"id":"n_prod","label":"Step 4 - crm_opportunity_products [list]","type":"route","route":"crm_opportunity_products","action":"list","routeSourceType":"route","dashboardDatasources":[],"x":1350,"y":220,"routeMetadata":null},
    {"id":"n_recalc","label":"Action TAB - recalc totals","type":"action","route":"","action":"","actionTypeId":7,"actionType":"generic.client.synchronous.action","routeNodeId":"n_prod","metadataTargetType":"table_action","metadataTargetId":29,"x":1650,"y":220}
  ],
  "connections": [
    {"id":"c1","source":"n_start","sourceOutput":"out","target":"n_acc","targetInput":"in"},
    {"id":"c2","source":"n_acc","sourceOutput":"out","target":"n_cont","targetInput":"in"},
    {"id":"c3","source":"n_cont","sourceOutput":"out","target":"n_opp","targetInput":"in"},
    {"id":"c4","source":"n_opp","sourceOutput":"out","target":"n_prod","targetInput":"in"},
    {"id":"c5","source":"n_prod","sourceOutput":"out","target":"n_recalc","targetInput":"in"},
    {"id":"c6","source":"n_recalc","sourceOutput":"out","target":"n_prod","targetInput":"in"}
  ]
}';

IF EXISTS (SELECT 1 FROM dbo._wuic_workflow_graph WHERE wg_key = @workflowKey)
BEGIN
  UPDATE dbo._wuic_workflow_graph
  SET
    wg_name = @workflowName,
    wg_graph_json = @graphJson,
    wg_updated_by = N'admin',
    wg_updated_on = GETDATE()
  WHERE wg_key = @workflowKey;

  SELECT @wgId = wg_id
  FROM dbo._wuic_workflow_graph
  WHERE wg_key = @workflowKey;
END
ELSE
BEGIN
  INSERT INTO dbo._wuic_workflow_graph
  (
    wg_key,
    wg_name,
    wg_graph_json,
    wg_created_by,
    wg_created_on,
    wg_updated_by,
    wg_updated_on
  )
  VALUES
  (
    @workflowKey,
    @workflowName,
    @graphJson,
    N'admin',
    GETDATE(),
    N'admin',
    GETDATE()
  );

  SELECT @wgId = CAST(SCOPE_IDENTITY() AS INT);
END

DELETE FROM dbo._wuic_workflow_graph_route_metadata
WHERE wg_id = @wgId;

INSERT INTO dbo._wuic_workflow_graph_route_metadata
(
  wg_id,
  node_client_id,
  route_name,
  route_action,
  metadata_json
)
VALUES
(@wgId, N'n_acc',  N'crm_accounts',             N'list', N'{"wizard":"CRM Nuova Opportunita","stepOrder":1,"stepName":"Account","nextRoute":"crm_contacts","mode":"search_or_create"}'),
(@wgId, N'n_cont', N'crm_contacts',             N'list', N'{"wizard":"CRM Nuova Opportunita","stepOrder":2,"stepName":"Contatto","nextRoute":"crm_opportunities","mode":"search_or_create","filterByPreviousRoute":{"sourceRoute":"crm_accounts","sourceField":"account_id","targetField":"account_id"}}'),
(@wgId, N'n_opp',  N'crm_opportunities',        N'list', N'{"wizard":"CRM Nuova Opportunita","stepOrder":3,"stepName":"Opportunita","nextRoute":"crm_opportunity_products","mode":"insert"}'),
(@wgId, N'n_prod', N'crm_opportunity_products', N'list', N'{"wizard":"CRM Nuova Opportunita","stepOrder":4,"stepName":"Prodotti","finalActionKey":"crm_opportunity_products_recalc_totals","mode":"nested_grid"}');

DECLARE @menuUri NVARCHAR(255) = N'#/workflow-runner/wizard';
DECLARE @menuName NVARCHAR(255) = N'crm_new_opportunity_wizard';
DECLARE @menuCaption NVARCHAR(255) = N'Nuova opportunita guidata';
DECLARE @menuParentId INT = 5993;

IF EXISTS (SELECT 1 FROM dbo._metadati__menu WHERE LTRIM(RTRIM(ISNULL(mm_uri_menu, N''))) = @menuUri)
BEGIN
  UPDATE dbo._metadati__menu
  SET
    mm_parent_id = @menuParentId,
    mm_nome_menu = @menuName,
    mm_display_string_menu = @menuCaption,
    mm_tooltip_menu = @menuCaption,
    mm_is_visible_by_default = 1
  WHERE LTRIM(RTRIM(ISNULL(mm_uri_menu, N''))) = @menuUri;
END
ELSE
BEGIN
  DECLARE @nextOrd INT = ISNULL((SELECT MAX(mmordine) FROM dbo._metadati__menu WHERE mm_parent_id = @menuParentId), 0) + 10;
  DECLARE @menuIsIdentity INT = CAST(COLUMNPROPERTY(OBJECT_ID('_metadati__menu'), 'mm_id', 'IsIdentity') AS INT);

  IF @menuIsIdentity = 1
  BEGIN
    INSERT INTO dbo._metadati__menu
    (
      mm_uri_menu,
      mm_tooltip_menu,
      mm_parent_id,
      mm_nome_menu,
      mm_is_visible_by_default,
      mm_display_string_menu,
      mmordine,
      mdid,
      mmpagetitle,
      target1,
      mm_css_class,
      mm_icon,
      mm_props_bag
    )
    VALUES
    (
      @menuUri,
      @menuCaption,
      @menuParentId,
      @menuName,
      1,
      @menuCaption,
      @nextOrd,
      NULL,
      @menuCaption,
      NULL,
      NULL,
      NULL,
      NULL
    );
  END
  ELSE
  BEGIN
    DECLARE @newMenuId INT = (SELECT ISNULL(MAX(mm_id), 0) + 1 FROM dbo._metadati__menu WITH (UPDLOCK, HOLDLOCK));

    INSERT INTO dbo._metadati__menu
    (
      mm_id,
      mm_uri_menu,
      mm_tooltip_menu,
      mm_parent_id,
      mm_nome_menu,
      mm_is_visible_by_default,
      mm_display_string_menu,
      mmordine,
      mdid,
      mmpagetitle,
      target1,
      mm_css_class,
      mm_icon,
      mm_props_bag
    )
    VALUES
    (
      @newMenuId,
      @menuUri,
      @menuCaption,
      @menuParentId,
      @menuName,
      1,
      @menuCaption,
      @nextOrd,
      NULL,
      @menuCaption,
      NULL,
      NULL,
      NULL,
      NULL
    );
  END
END

SELECT TOP 1 wg_id, wg_key, wg_name FROM dbo._wuic_workflow_graph WHERE wg_key = @workflowKey;
SELECT wg_id, node_client_id, route_name, route_action FROM dbo._wuic_workflow_graph_route_metadata WHERE wg_id = @wgId ORDER BY wgrm_id;
SELECT TOP 1 mm_id, mm_parent_id, mm_nome_menu, mm_display_string_menu, mm_uri_menu FROM dbo._metadati__menu WHERE mm_uri_menu = @menuUri;
GO
