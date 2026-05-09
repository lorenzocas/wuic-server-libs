/* ============================================================
   2026-05-09-row-action-invio-sdi.sql

   Row-action `btn_invio_sdi` su `fatture_inviate`: invia la fattura
   al Sistema di Interscambio (SDI). Endpoint backend gia' implementati
   ([Controllers/SdiController.cs](../Controllers/SdiController.cs)):
     - POST /api/sdi/generateXml  -> genera XML FatturaPA + UPDATE file_xml
     - POST /api/sdi/markAsSent   -> aggiorna stato_sdi=INVIATA, sdi_id, stato BOZZA->EMESSA

   ATTENZIONE - Limiti produzione (gia' documentati in SdiController.cs:28-33):
   L'endpoint markAsSent SIMULA l'invio (UPDATE DB con sdi_id sintetico).
   Per produzione vanno integrati:
     - Firma digitale CADES-BES prima dell'invio (richiesta SDI per FPR12).
       Lib BouncyCastle + key vault.
     - Validazione XSD FatturaPA v1.2 prima del markAsSent (rigetto SDI
       se XML non conforme).
     - Plug-in provider SDI (ISdiProvider con impl Aruba PEC, FatturePEC,
       Pec.it, Notarify) + appsettings credentials.

   Comportamento callback:
     1. Conferma utente (esplicita la simulazione)
     2. Skip se gia' INVIATA (idempotency)
     3. Genera XML se mancante (POST /api/sdi/generateXml)
     4. POST /api/sdi/markAsSent con sdi_id sintetico `WUIC-SIM-<timestamp>`
     5. Refresh datasource via fetchData() (NON refresh())
     6. Toast con nota "invio simulato"
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

DECLARE @callback NVARCHAR(MAX) = N'// Row-action "Invio SDI": genera XML (se mancante) + markAsSent.
// SIMULAZIONE - vedi SdiController.cs per i gap produzione (firma CADES-BES,
// validazione XSD v1.2, integrazione provider Aruba PEC/FatturePEC/...).
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

// Conferma esplicita - la wording chiarisce la simulazione
let confirmed = true;
if (typeof wtoolbox.promptDialog === "function") {
    confirmed = await wtoolbox.promptDialog({
        header: "Invio SDI (simulazione)",
        message: "Invio simulato della fattura ID " + recordId + " al Sistema di Interscambio. " +
                 "PRODUZIONE richiede: firma CADES-BES, validazione XSD v1.2, provider PEC. " +
                 "Procedere con la simulazione?"
    });
}
if (confirmed === false) return;

// Step 1: assicurati che l'XML sia stato generato
let resp = await fetch(`/api/sdi/download/${recordId}`, { credentials: "include" });
if (resp.status === 404) {
    const gen = await fetch("/api/sdi/generateXml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ FatturaId: recordId })
    });
    if (!gen.ok) {
        const txt = await gen.text();
        wtoolbox.messageNotificationService.add({
            severity: "error", summary: "Invio SDI",
            detail: "Generazione XML fallita: " + (txt || gen.status).toString().slice(0, 220)
        });
        return;
    }
}

// Step 2: markAsSent (simulazione invio + aggiornamento DB)
const sdiId = "WUIC-SIM-" + Date.now();
const mark = await fetch("/api/sdi/markAsSent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
        FatturaId: recordId,
        SdiId: sdiId,
        SdiMessaggio: "Invio simulato via row action (production: firma CADES + provider PEC)"
    })
});
if (!mark.ok) {
    const txt = await mark.text();
    wtoolbox.messageNotificationService.add({
        severity: "error", summary: "Invio SDI",
        detail: "markAsSent fallito (HTTP " + mark.status + "): " + txt.toString().slice(0, 220)
    });
    return;
}

// Step 3: refresh grid - canonical method e' fetchData(), NON refresh()
if (datasource && typeof datasource.fetchData === "function") {
    await datasource.fetchData();
}

wtoolbox.messageNotificationService.add({
    severity: "success", summary: "Invio SDI",
    detail: "Fattura ID " + recordId + " marcata come INVIATA (sdi_id=" + sdiId + "). Simulazione - production gap: firma CADES-BES, XSD validation, provider PEC."
});';

IF NOT EXISTS (
    SELECT 1 FROM dbo._metadati__colonne
    WHERE md_id = @md_fatture AND mc_nome_colonna = 'btn_invio_sdi'
)
BEGIN
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
        mcbuttonactiontype,
        mcordine
    )
    VALUES (
        @md_fatture,
        N'btn_invio_sdi',
        N'btn_invio_sdi',
        N'button',
        6,
        N'Invio SDI',
        N'Invio SDI',
        1,
        1,
        @callback,
        N'Invio SDI',
        N'pi pi-send',
        N'Invia fattura al Sistema di Interscambio (simulazione)',
        0,
        9996
    );
    PRINT 'btn_invio_sdi inserito';
END
ELSE
BEGIN
    UPDATE dbo._metadati__colonne SET
        mc_ui_column_type = N'button',
        voa_class         = 6,
        mc_display_string_in_view = N'Invio SDI',
        mc_display_string_in_edit = N'Invio SDI',
        mchideinedit      = 1,
        mchideindetail    = 1,
        mcbuttonaction    = @callback,
        mcbuttoncaption   = N'Invio SDI',
        mcbuttonimage     = N'pi pi-send',
        mcbuttontooltip   = N'Invia fattura al Sistema di Interscambio (simulazione)',
        mcbuttonactiontype= 0,
        mcordine          = 9996
    WHERE md_id = @md_fatture AND mc_nome_colonna = 'btn_invio_sdi';
    PRINT 'btn_invio_sdi aggiornato';
END

SELECT mc_id, mc_nome_colonna, mc_ui_column_type, voa_class,
       CAST(mcbuttoncaption AS NVARCHAR(50)) AS caption,
       CAST(mcbuttonimage AS NVARCHAR(50)) AS img,
       LEN(CAST(mcbuttonaction AS NVARCHAR(MAX))) AS callback_len
  FROM dbo._metadati__colonne
 WHERE md_id = @md_fatture AND mc_nome_colonna = 'btn_invio_sdi';
