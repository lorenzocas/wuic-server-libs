-- 2026-05-08 — Aggiunge [importSourceTypes] al template fatture_inviate
-- per abilitare lo splitbutton "Crea da..." (visibile solo in Insert mode).
--
-- I tipi sorgente per una fattura attiva sono: preventivo, ordine, DDT,
-- proforma. Per ognuno: route della testata + route delle righe + nome FK
-- sulle righe verso la testata.
--
-- L'import-flow:
--  1. user apre nuova fattura (__new=true)
--  2. clicca splitbutton + sceglie tipo doc
--  3. dialog si apre con list-grid del tipo scelto
--  4. user seleziona doc → testata corrente popolata + righe clonate __new=true
--  5. save batch persiste tutto

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

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
  [noteFields]="[''note'']"
  statoEditableValue="BOZZA" statoFieldName="stato"
  [importSourceTypes]="[
    { label: ''Da preventivo'', route: ''preventivi'', rowsRoute: ''preventivi_righe'', fkField: ''preventivo_id'' },
    { label: ''Da ordine'',     route: ''ordini'',     rowsRoute: ''ordini_righe'',     fkField: ''ordine_id'' },
    { label: ''Da DDT'',        route: ''ddt'',        rowsRoute: ''ddt_righe'',        fkField: ''ddt_id'' },
    { label: ''Da proforma'',   route: ''proforma'',   rowsRoute: ''proforma_righe'',   fkField: ''proforma_id'' }
  ]"></app-document-edit-form>';

UPDATE _metadati__tabelle
   SET mdedittemplate = @fi,
       mddetailtemplate = REPLACE(@fi, N'[readOnly]="false"', N'[readOnly]="true"')
 WHERE mdroutename = 'fatture_inviate';
GO

-- Verifica
SELECT mdroutename,
       CASE WHEN CAST(mdedittemplate AS NVARCHAR(MAX)) LIKE N'%importSourceTypes%' THEN 'YES' ELSE 'NO' END AS hasImport
  FROM _metadati__tabelle
 WHERE mdroutename = 'fatture_inviate';
GO
