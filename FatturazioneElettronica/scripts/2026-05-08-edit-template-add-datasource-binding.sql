-- Patch idempotente: aggiunge [datasource]="datasource" all'attributo bindings
-- del custom <app-document-edit-form> nel md_edit_template di tutte le route
-- documenti. Necessario per propagare la BehaviorSubject del DataSourceComponent
-- al custom component (per chiamare rebasePristineAfterDefaults post-default).
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
USE FatturazioneElettronica_Metadata;

DECLARE @needle  NVARCHAR(200) = N'[metas]="metas"';
DECLARE @replace NVARCHAR(400) = N'[metas]="metas" [datasource]="datasource"';

UPDATE _metadati__tabelle
   SET mdedittemplate = REPLACE(CAST(mdedittemplate AS NVARCHAR(MAX)), @needle, @replace)
 WHERE mdroutename IN ('fatture_inviate','fatture_ricevute','preventivi','ordini','ordini_acquisto','ordini_elettronici','proforma','ddt')
   AND CAST(mdedittemplate AS NVARCHAR(MAX)) LIKE N'%app-document-edit-form%'
   AND CAST(mdedittemplate AS NVARCHAR(MAX)) NOT LIKE N'%[datasource]=%';

SELECT @@ROWCOUNT AS rows_updated;
SELECT mdroutename,
       CASE WHEN CAST(mdedittemplate AS NVARCHAR(MAX)) LIKE N'%[datasource]="datasource"%' THEN 'YES' ELSE 'NO' END AS has_datasource_binding
  FROM _metadati__tabelle
 WHERE mdroutename IN ('fatture_inviate','fatture_ricevute','preventivi','ordini','ordini_acquisto','ordini_elettronici','proforma','ddt');
