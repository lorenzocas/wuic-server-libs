/* ============================================================
   2026-05-09-row-action-invio-sdi-v2.sql

   Aggiorna `btn_invio_sdi` per usare il NUOVO endpoint
   `/api/sdi/submit` (pipeline completa XSD + CADES-BES + provider).

   Comportamento callback:
     1. Skip se gia' INVIATA (idempotency)
     2. Conferma utente (dialog con dettaglio provider configurato)
     3. POST /api/sdi/submit con FatturaId
        Server-side esegue: validazione XSD → firma CADES-BES → trasmissione provider → markAsSent
     4. Toast con esito dettagliato (stage failed, sdi_id, provider name)
     5. Refresh datasource via fetchData()
   ============================================================ */
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Metadata;

DECLARE @md_fatture INT;
SELECT @md_fatture = md_id FROM dbo._metadati__tabelle WHERE mdroutename = 'fatture_inviate';

IF @md_fatture IS NULL
BEGIN
    RAISERROR('Route fatture_inviate non scaffoldata.', 16, 1);
    RETURN;
END

DECLARE @callback NVARCHAR(MAX) = N'// Row-action "Invio SDI": pipeline server-side (XSD + CADES-BES + provider).
// Endpoint: POST /api/sdi/submit { FatturaId } - vedi SdiController.Submit.
const recordId = Number(record?.id?.value ?? record?.id ?? record?.Id?.value ?? record?.Id);
if (!recordId) {
    wtoolbox.messageNotificationService.add({ severity: "warn", summary: "Invio SDI", detail: "ID fattura non trovato" });
    return;
}

const statoSdi = (record?.stato_sdi?.value ?? record?.stato_sdi ?? "").toString().trim().toUpperCase();
if (statoSdi === "INVIATA" || statoSdi === "CONSEGNATA" || statoSdi === "ACCETTATA") {
    wtoolbox.messageNotificationService.add({
        severity: "info", summary: "Invio SDI",
        detail: "Fattura gia\\u0027 inviata a SDI (stato: " + statoSdi + ")."
    });
    return;
}

let confirmed = true;
if (typeof wtoolbox.promptDialog === "function") {
    confirmed = await wtoolbox.promptDialog({
        header: "Invio SDI",
        message: "Trasmissione fattura ID " + recordId + " al Sistema di Interscambio. " +
                 "La pipeline esegue: validazione XSD FatturaPA v1.2, firma CADES-BES, " +
                 "trasmissione al provider configurato (vedi appsettings Sdi:Provider). " +
                 "Procedere?"
    });
}
if (confirmed === false) return;

const resp = await fetch("/api/sdi/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ FatturaId: recordId })
});

let body = null;
try { body = await resp.json(); } catch { body = { ok: false, message: "Response non-JSON" }; }

if (!resp.ok || body?.ok !== true) {
    const stage = body?.stage || "unknown";
    const provider = body?.provider || "?";
    const detail = (body?.message || resp.statusText || "errore") + " (stage: " + stage + ", provider: " + provider + ")";
    // Mostra primi 2 errori XSD se stage=XsdValidation
    if (Array.isArray(body?.xsd_errors) && body.xsd_errors.length > 0) {
        const xsdSummary = body.xsd_errors.slice(0, 2).map(e => "L." + e.lineNumber + ": " + e.message).join(" | ");
        wtoolbox.messageNotificationService.add({
            severity: "error", summary: "Invio SDI: XSD invalido",
            detail: detail + " [" + xsdSummary + "]"
        });
    } else {
        wtoolbox.messageNotificationService.add({
            severity: "error", summary: "Invio SDI fallito (" + stage + ")", detail: detail
        });
    }
    return;
}

if (datasource && typeof datasource.fetchData === "function") {
    await datasource.fetchData();
}

const sdiId = body?.sdi_id || "?";
const provider = body?.provider || "?";
const dbWarn = body?.db_update_failed === true ? " [DB update failed: " + (body?.db_error || "?") + "]" : "";
wtoolbox.messageNotificationService.add({
    severity: "success", summary: "Invio SDI OK",
    detail: "Trasmessa a SDI tramite " + provider + " (sdi_id=" + sdiId + ")" + dbWarn
});';

UPDATE dbo._metadati__colonne SET
    mcbuttonaction    = @callback,
    mcbuttontooltip   = N'Invia fattura al Sistema di Interscambio (pipeline XSD + CADES-BES + provider)'
WHERE md_id = @md_fatture AND mc_nome_colonna = 'btn_invio_sdi';

IF @@ROWCOUNT = 0
BEGIN
    -- prima esecuzione: crea il record (stesso INSERT del v1)
    INSERT INTO dbo._metadati__colonne (
        md_id, mc_nome_colonna, mcrealcolumnname, mc_ui_column_type, voa_class,
        mc_display_string_in_view, mc_display_string_in_edit, mchideinedit, mchideindetail,
        mcbuttonaction, mcbuttoncaption, mcbuttonimage, mcbuttontooltip, mcbuttonactiontype, mcordine
    )
    VALUES (
        @md_fatture, N'btn_invio_sdi', N'btn_invio_sdi', N'button', 6,
        N'Invio SDI', N'Invio SDI', 1, 1,
        @callback, N'Invio SDI', N'pi pi-send',
        N'Invia fattura al Sistema di Interscambio (pipeline XSD + CADES-BES + provider)',
        0, 9996
    );
    PRINT 'btn_invio_sdi inserito (v2)';
END
ELSE
BEGIN
    PRINT 'btn_invio_sdi callback aggiornato a v2 (pipeline endpoint /api/sdi/submit)';
END

SELECT mc_id, mc_nome_colonna,
       LEN(CAST(mcbuttonaction AS NVARCHAR(MAX))) AS callback_len
  FROM dbo._metadati__colonne
 WHERE md_id = @md_fatture AND mc_nome_colonna = 'btn_invio_sdi';
