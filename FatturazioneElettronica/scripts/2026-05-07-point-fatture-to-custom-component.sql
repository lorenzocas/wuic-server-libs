-- =============================================================================
-- Patch: punta md_edit_template + md_detail_template di fatture_inviate al
--       custom component <app-fattura-inviata-edit-form> (registrato in
--       dynamicFormImports di app.component.ts del progetto host).
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Metadata;

UPDATE _metadati__tabelle
   SET mdedittemplate   = '<app-fattura-inviata-edit-form [record]="record" [metaInfo]="metaInfo" [metas]="metas" [readOnly]="false"></app-fattura-inviata-edit-form>',
       mddetailtemplate = '<app-fattura-inviata-edit-form [record]="record" [metaInfo]="metaInfo" [metas]="metas" [readOnly]="true"></app-fattura-inviata-edit-form>'
 WHERE mdroutename = 'fatture_inviate';

SELECT mdroutename, LEN(mdedittemplate) AS edit_len, LEN(mddetailtemplate) AS detail_len
  FROM _metadati__tabelle
 WHERE mdroutename = 'fatture_inviate';
