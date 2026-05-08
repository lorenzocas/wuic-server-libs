-- =============================================================================
-- Patch: aggiunge [routeName], [progressivoField], [autoComposeNumero], [hasSerie]
--        ai template <app-document-edit-form> delle 4 master + 4 estese
--        (ddt, proforma, ordini_acquisto, ordini_elettronici).
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Metadata;

-- fatture_inviate (autoCompose=true, hasSerie=true, progressivo)
DECLARE @fi NVARCHAR(MAX) = N'<app-document-edit-form
  [record]="record" [metaInfo]="metaInfo" [metas]="metas" [readOnly]="false"
  routeName="fatture_inviate" progressivoField="progressivo"
  [autoComposeNumero]="true" [hasSerie]="true"
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
UPDATE _metadati__tabelle SET mdedittemplate=@fi, mddetailtemplate=REPLACE(@fi,N'[readOnly]="false"',N'[readOnly]="true"')
 WHERE mdroutename='fatture_inviate';

-- fatture_ricevute (autoCompose=false: numero_fornitore manuale)
DECLARE @fr NVARCHAR(MAX) = N'<app-document-edit-form
  [record]="record" [metaInfo]="metaInfo" [metas]="metas" [readOnly]="false"
  routeName="fatture_ricevute" progressivoField="progressivo_interno"
  [autoComposeNumero]="false" [hasSerie]="false"
  [documentFields]="[''numero_fornitore'',''progressivo_interno'',''anno'',''data_documento'',''data_ricezione'']"
  controparteTitle="Dati fornitore"
  [controparteFields]="[''fornitore_id'',''causale'']"
  pagamentoTitle="Dati pagamento"
  [pagamentoFields]="[''pagamento_id'']"
  calcoloTitle="Calcolo fattura"
  [calcoloFields]="[''imponibile'',''iva'',''iva_indetraibile'',''totale'']"
  [statoSdiFields]="[''stato'',''stato_sdi'']"
  [noteFields]="[''note'']"></app-document-edit-form>';
UPDATE _metadati__tabelle SET mdedittemplate=@fr, mddetailtemplate=REPLACE(@fr,N'[readOnly]="false"',N'[readOnly]="true"')
 WHERE mdroutename='fatture_ricevute';

-- preventivi
DECLARE @pr NVARCHAR(MAX) = N'<app-document-edit-form
  [record]="record" [metaInfo]="metaInfo" [metas]="metas" [readOnly]="false"
  routeName="preventivi" progressivoField="progressivo"
  [autoComposeNumero]="true" [hasSerie]="false"
  [documentFields]="[''numero'',''progressivo'',''anno'',''data_documento'',''data_validita'']"
  controparteTitle="Dati cliente"
  [controparteFields]="[''cliente_id'',''oggetto'']"
  [pagamentoFields]="null"
  statoTitle="Stato"
  [statoFields]="[''stato'']"
  calcoloTitle="Calcolo"
  [calcoloFields]="[''imponibile'',''iva'',''totale'']"
  [noteFields]="[''note'']"></app-document-edit-form>';
UPDATE _metadati__tabelle SET mdedittemplate=@pr, mddetailtemplate=REPLACE(@pr,N'[readOnly]="false"',N'[readOnly]="true"')
 WHERE mdroutename='preventivi';

-- ordini
DECLARE @or NVARCHAR(MAX) = N'<app-document-edit-form
  [record]="record" [metaInfo]="metaInfo" [metas]="metas" [readOnly]="false"
  routeName="ordini" progressivoField="progressivo"
  [autoComposeNumero]="true" [hasSerie]="false"
  [documentFields]="[''numero'',''progressivo'',''anno'',''data_documento'',''data_consegna'']"
  controparteTitle="Dati cliente"
  [controparteFields]="[''cliente_id'',''riferimento_cliente'']"
  [pagamentoFields]="null"
  statoTitle="Stato"
  [statoFields]="[''stato'']"
  calcoloTitle="Calcolo"
  [calcoloFields]="[''imponibile'',''iva'',''totale'']"
  [noteFields]="[''note'']"></app-document-edit-form>';
UPDATE _metadati__tabelle SET mdedittemplate=@or, mddetailtemplate=REPLACE(@or,N'[readOnly]="false"',N'[readOnly]="true"')
 WHERE mdroutename='ordini';

SELECT mdroutename, LEN(mdedittemplate) AS edit_len, LEN(mddetailtemplate) AS detail_len
  FROM _metadati__tabelle
 WHERE mdroutename IN ('fatture_inviate','fatture_ricevute','preventivi','ordini')
 ORDER BY mdroutename;
