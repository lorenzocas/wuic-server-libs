/* ============================================================
   FatturazioneElettronica — Custom actions per i 3 report
   ============================================================
   Inserisce 3 righe in _mtdt__cstom__actions__tabelle.
   Schema reale (verificato 2026-05-05):
     id1 (PK, NON IDENTITY -> assegnare manualmente MAX+1)
     mdid (FK su _metadati__tabelle.md_id)
     actioncallback (text) -> JS che riceve (datasource, metaInfo, record, event, wtoolbox)
     buttoncaption, buttonimage (PrimeNG icon), buttontemplate
     ordine1, disablecallback, md_action_type (0=navigation pero' usiamo callback custom)

   Le 3 actions:
     A) Stampa elenco clienti          -> route 'clienti', table-level
     B) Stampa fatturato per mese      -> route 'fatture_inviate', table-level
     C) Stampa singola fattura         -> route 'fatture_inviate', record-aware
                                          (richiede selezione riga in grid)

   Nota: la tabella ha solo "table actions"; la distinzione tabella/riga
   e' implicita nel callback (se usa 'record' e' record-aware, altrimenti
   e' table-pure). Se record-aware e l'utente non ha selezionato riga,
   il callback mostra un toast warning.
   ============================================================ */

SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET NUMERIC_ROUNDABORT OFF;

DECLARE @md_clienti INT, @md_fatture INT;
SELECT @md_clienti = md_id FROM dbo._metadati__tabelle WHERE mdroutename = 'clienti';
SELECT @md_fatture = md_id FROM dbo._metadati__tabelle WHERE mdroutename = 'fatture_inviate';

IF @md_clienti IS NULL OR @md_fatture IS NULL
BEGIN
    RAISERROR('Route clienti o fatture_inviate non scaffoldate.', 16, 1);
    RETURN;
END

DECLARE @next_id INT = (SELECT ISNULL(MAX(id1), 0) FROM dbo._mtdt__cstom__actions__tabelle);

/* ---------- A) Stampa elenco clienti (table-level) ---------- */
IF NOT EXISTS (SELECT 1 FROM dbo._mtdt__cstom__actions__tabelle
               WHERE mdid = @md_clienti AND buttoncaption = N'Stampa elenco')
BEGIN
    SET @next_id = @next_id + 1;
    INSERT INTO dbo._mtdt__cstom__actions__tabelle
        (id1, mdid, buttoncaption, buttonimage, ordine1, md_action_type, actioncallback)
    VALUES (
        @next_id, @md_clienti, N'Stampa elenco', N'pi pi-print', 1, 0,
        N'// Stampa elenco clienti — apre Stimulsoft viewer
const reportRoute = "clienti";
const reportName  = "Report.mrt";
const url = `#/${reportRoute}/report-viewer?reportName=${encodeURIComponent(reportName)}`;
window.location.hash = url;'
    );
END

/* ---------- B) Stampa fatturato per mese (table-level) ---------- */
IF NOT EXISTS (SELECT 1 FROM dbo._mtdt__cstom__actions__tabelle
               WHERE mdid = @md_fatture AND buttoncaption = N'Stampa fatturato')
BEGIN
    SET @next_id = @next_id + 1;
    INSERT INTO dbo._mtdt__cstom__actions__tabelle
        (id1, mdid, buttoncaption, buttonimage, ordine1, md_action_type, actioncallback)
    VALUES (
        @next_id, @md_fatture, N'Stampa fatturato', N'pi pi-chart-bar', 1, 0,
        N'// Stampa fatturato aggregato per mese
const reportRoute = "fatturato";
const reportName  = "Report.mrt";
const url = `#/${reportRoute}/report-viewer?reportName=${encodeURIComponent(reportName)}`;
window.location.hash = url;'
    );
END

/* NB: la "stampa singola fattura" NON e' una table-action ma una
   ROW-action: si implementa come **colonna virtuale di tipo `button`**
   in _metadati__colonne (vedi 07_print_buttons.sql). */

PRINT 'Table-actions report inserite (clienti + fatturato).';

SELECT a.id1, t.mdroutename, a.buttoncaption, a.buttonimage, a.ordine1
FROM dbo._mtdt__cstom__actions__tabelle a
JOIN dbo._metadati__tabelle t ON t.md_id = a.mdid
WHERE t.mdroutename IN ('clienti','fatture_inviate')
ORDER BY t.mdroutename, a.ordine1;
GO
