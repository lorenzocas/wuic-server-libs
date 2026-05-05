/* ============================================================
   FatturazioneElettronica — Row actions (colonne virtuali button)
   ============================================================
   Pattern WUIC: le "azioni riga" si implementano come **colonna**
   in _metadati__colonne con mc_ui_column_type='button' e
   voa_class=6 (regola scaffolding skill).
   Il callback va in mcbuttonaction (text) e riceve:
     (datasource, metaInfo, record, event, wtoolbox)
   dove `record` e' la riga corrente — quindi possiamo accedere a
   record.id.value per costruire URL parametrizzato.

   Questo script aggiunge una colonna virtuale `print_action` alla
   route `fatture_inviate` che apre il viewer Stimulsoft del report
   `fatture_inviate/Report.mrt` (parametrizzato su @fattura_id).

   Schema verificato 2026-05-05:
     mc_id     -> IDENTITY (auto)
     md_id     -> FK obbligatoria su _metadati__tabelle
     mc_nome_colonna / mc_real_column_name -> nome univoco entro la tabella
     mc_ui_column_type = 'button'
     voa_class = 6
     mcbuttonaction (text)         -> callback JS
     mcbuttoncaption (text)        -> testo bottone (opzionale se solo icona)
     mcbuttonimage (varchar)       -> "pi pi-print"
     mcbuttontooltip (varchar)     -> tooltip
     mcbuttontemplate (varchar)    -> opzionale
     mcbuttonactiontype (int)      -> 0 = navigation custom (ma usiamo callback custom)
     mc_display_string_in_view     -> header colonna in list-grid
   ============================================================ */

SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET NUMERIC_ROUNDABORT OFF;

DECLARE @md_fatture INT;
SELECT @md_fatture = md_id FROM dbo._metadati__tabelle WHERE mdroutename = 'fatture_inviate';

IF @md_fatture IS NULL
BEGIN
    RAISERROR('Route fatture_inviate non scaffoldata.', 16, 1);
    RETURN;
END

/* ---------- print_action button (row-level "Stampa fattura") ---------- */
IF NOT EXISTS (
    SELECT 1 FROM dbo._metadati__colonne
    WHERE md_id = @md_fatture AND mc_nome_colonna = 'print_action'
)
BEGIN
    -- NB sqlColumn vs csProperty (regola 25 AGENTS):
    --   csProperty mc_real_column_name -> sqlColumn mcrealcolumnname
    --   csProperty mc_hide_in_edit     -> sqlColumn mchideinedit
    --   csProperty mc_hide_in_detail   -> sqlColumn mchideindetail
    INSERT INTO dbo._metadati__colonne (
        md_id,
        mc_nome_colonna,
        mcrealcolumnname,
        mc_ui_column_type,
        voa_class,
        mc_display_string_in_view,
        mc_display_string_in_edit,
        mchideinedit,
        mchideindetail,
        mcbuttonaction,
        mcbuttoncaption,
        mcbuttonimage,
        mcbuttontooltip,
        mcbuttonactiontype
    )
    VALUES (
        @md_fatture,
        N'print_action',
        N'print_action',
        N'button',
        6,                                 -- voa_class=6 (button) per regola skill scaffolding
        N'Stampa',                         -- header colonna nel list-grid
        N'Stampa',
        1,                                 -- nascosta nell'edit form (e' solo per la list)
        1,                                 -- nascosta nel detail
        N'// Row-action "Stampa fattura": apre Stimulsoft viewer parametrizzato
const recordId = record?.id?.value ?? record?.Id?.value ?? record?.id ?? record?.Id;
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
const url = `#/${reportRoute}/report-viewer?reportName=${encodeURIComponent(reportName)}&fattura_id=${encodeURIComponent(recordId)}`;
window.location.hash = url;',
        N'',                               -- mcbuttoncaption: vuoto = solo icona
        N'pi pi-print',                    -- mcbuttonimage: PrimeNG icon
        N'Stampa fattura',                 -- tooltip
        0                                  -- mcbuttonactiontype: 0 (custom callback)
    );
END

PRINT 'Row-action "Stampa fattura" (colonna button) inserita su fatture_inviate.';

-- NB: mcbuttonaction e' tipo `text` -> usare DATALENGTH (LEN non supportato su text)
SELECT mc_id, mc_nome_colonna, mc_ui_column_type, voa_class, mcbuttonimage,
       DATALENGTH(mcbuttonaction) AS callback_bytes
FROM dbo._metadati__colonne
WHERE md_id = @md_fatture AND mc_ui_column_type = 'button';
GO
