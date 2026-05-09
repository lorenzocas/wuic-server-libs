-- =============================================================================
-- Patch: aggiorna print_action callback per usare Report.mrt (nuovo layout
-- Aruba PEC FPR-style con logo WUIC nel footer) invece di Report_NEW.mrt.
--
-- Vedi: scripts/generate-fattura-report.py
--       Reports/fatture_inviate/Report.mrt
-- =============================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Metadata;

DECLARE @callback NVARCHAR(MAX) = N'// Row-action "Stampa fattura": apre Stimulsoft viewer parametrizzato.
// Layout Aruba PEC FPR-style con logo WUIC, generato da scripts/generate-fattura-report.py.
// Il client report-viewer legge solo formato "parameters=name||eq||value"
// (vedi report-viewer.component.ts:123). NON usare "fattura_id=N" diretto.
const recordId = (record && record.id && record.id.value) ?? (record && record.Id && record.Id.value) ?? (record && record.id) ?? (record && record.Id);
if (!recordId) {
    wtoolbox.messageNotificationService.add({
        severity: "warn",
        summary: "Stampa fattura",
        detail: "Record non valido: id non trovato."
    });
    return;
}
const reportRoute = "fatture_inviate";
const reportName  = "Report.mrt";
const params = "fattura_id||eq||" + recordId;
const url = "#/" + reportRoute + "/report-viewer?reportName=" + encodeURIComponent(reportName) + "&parameters=" + encodeURIComponent(params);
window.location.hash = url;';

UPDATE _metadati__colonne
   SET mcbuttonaction = @callback
 WHERE mc_id = 39940;  -- print_action su fatture_inviate

SELECT mc_id, mc_nome_colonna,
       LEN(CAST(mcbuttonaction AS NVARCHAR(MAX))) AS callback_len,
       CHARINDEX('Report.mrt', CAST(mcbuttonaction AS NVARCHAR(MAX))) AS report_mrt_pos
  FROM _metadati__colonne WHERE mc_id = 39940;
