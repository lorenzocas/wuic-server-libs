-- =============================================================================
-- Patch: punta md_edit_template + md_detail_template delle 4 master documenti
--        commerciali al componente custom condiviso <app-document-edit-form>
--        (registrato in dynamicFormImports di app.component.ts).
--
-- Ogni route passa input diversi per:
--  - documentFields, controparteTitle, controparteFields
--  - pagamentoFields | statoFields (alternativi)
--  - calcoloTitle, calcoloFields
--  - statoSdiFields (solo fatture)
--  - scadenzeNestedIndex (solo fatture_inviate)
--  - readOnly (false per edit, true per detail)
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Metadata;

-- ---------------------------------------------------------------------------
-- fatture_inviate (cliente, pagamento+banca, calcolo fattura, stato_sdi, scadenze)
-- ---------------------------------------------------------------------------
DECLARE @fi_edit  NVARCHAR(MAX) = N'<app-document-edit-form
  [record]="record" [metaInfo]="metaInfo" [metas]="metas" [readOnly]="false"
  [documentFields]="[''numero'',''serie'',''progressivo'',''anno'',''data_documento'']"
  controparteTitle="Dati cliente"
  [controparteFields]="[''cliente_id'',''causale'',''riferimento_ordine'']"
  pagamentoTitle="Dati pagamento"
  [pagamentoFields]="[''pagamento_id'',''banca_id'']"
  calcoloTitle="Calcolo fattura"
  [calcoloFields]="[''imponibile'',''iva'',''bollo_valore'',''sconto_globale_perc'',''totale'']"
  [statoSdiFields]="[''stato'',''stato_sdi'',''sdi_id'',''sdi_messaggio'']"
  [scadenzeNestedIndex]="1"
  [noteFields]="[''note'']"></app-document-edit-form>';
DECLARE @fi_det   NVARCHAR(MAX) = REPLACE(@fi_edit, N'[readOnly]="false"', N'[readOnly]="true"');
UPDATE _metadati__tabelle SET mdedittemplate = @fi_edit, mddetailtemplate = @fi_det
 WHERE mdroutename = 'fatture_inviate';

-- ---------------------------------------------------------------------------
-- fatture_ricevute (fornitore, pagamento, calcolo + iva indetraibile, stato_sdi)
-- ---------------------------------------------------------------------------
DECLARE @fr_edit  NVARCHAR(MAX) = N'<app-document-edit-form
  [record]="record" [metaInfo]="metaInfo" [metas]="metas" [readOnly]="false"
  [documentFields]="[''numero_fornitore'',''progressivo_interno'',''anno'',''data_documento'',''data_ricezione'']"
  controparteTitle="Dati fornitore"
  [controparteFields]="[''fornitore_id'',''causale'']"
  pagamentoTitle="Dati pagamento"
  [pagamentoFields]="[''pagamento_id'']"
  calcoloTitle="Calcolo fattura"
  [calcoloFields]="[''imponibile'',''iva'',''iva_indetraibile'',''totale'']"
  [statoSdiFields]="[''stato'',''stato_sdi'']"
  [noteFields]="[''note'']"></app-document-edit-form>';
DECLARE @fr_det   NVARCHAR(MAX) = REPLACE(@fr_edit, N'[readOnly]="false"', N'[readOnly]="true"');
UPDATE _metadati__tabelle SET mdedittemplate = @fr_edit, mddetailtemplate = @fr_det
 WHERE mdroutename = 'fatture_ricevute';

-- ---------------------------------------------------------------------------
-- preventivi (cliente, oggetto, no pagamento, stato semplice + calcolo)
-- ---------------------------------------------------------------------------
DECLARE @pr_edit  NVARCHAR(MAX) = N'<app-document-edit-form
  [record]="record" [metaInfo]="metaInfo" [metas]="metas" [readOnly]="false"
  [documentFields]="[''numero'',''progressivo'',''anno'',''data_documento'',''data_validita'']"
  controparteTitle="Dati cliente"
  [controparteFields]="[''cliente_id'',''oggetto'']"
  [pagamentoFields]="null"
  statoTitle="Stato"
  [statoFields]="[''stato'']"
  calcoloTitle="Calcolo"
  [calcoloFields]="[''imponibile'',''iva'',''totale'']"
  [noteFields]="[''note'']"></app-document-edit-form>';
DECLARE @pr_det   NVARCHAR(MAX) = REPLACE(@pr_edit, N'[readOnly]="false"', N'[readOnly]="true"');
UPDATE _metadati__tabelle SET mdedittemplate = @pr_edit, mddetailtemplate = @pr_det
 WHERE mdroutename = 'preventivi';

-- ---------------------------------------------------------------------------
-- ordini (cliente, riferimento_cliente, no pagamento, stato semplice + calcolo)
-- ---------------------------------------------------------------------------
DECLARE @or_edit  NVARCHAR(MAX) = N'<app-document-edit-form
  [record]="record" [metaInfo]="metaInfo" [metas]="metas" [readOnly]="false"
  [documentFields]="[''numero'',''progressivo'',''anno'',''data_documento'',''data_consegna'']"
  controparteTitle="Dati cliente"
  [controparteFields]="[''cliente_id'',''riferimento_cliente'']"
  [pagamentoFields]="null"
  statoTitle="Stato"
  [statoFields]="[''stato'']"
  calcoloTitle="Calcolo"
  [calcoloFields]="[''imponibile'',''iva'',''totale'']"
  [noteFields]="[''note'']"></app-document-edit-form>';
DECLARE @or_det   NVARCHAR(MAX) = REPLACE(@or_edit, N'[readOnly]="false"', N'[readOnly]="true"');
UPDATE _metadati__tabelle SET mdedittemplate = @or_edit, mddetailtemplate = @or_det
 WHERE mdroutename = 'ordini';

-- Verifica
SELECT mdroutename, LEN(mdedittemplate) AS edit_len, LEN(mddetailtemplate) AS detail_len
  FROM _metadati__tabelle
 WHERE mdroutename IN ('fatture_inviate','fatture_ricevute','preventivi','ordini')
 ORDER BY mdroutename;
