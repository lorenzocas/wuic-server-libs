/* ============================================================
   2026-05-09-row-action-download-xml.sql

   Row-action `btn_xml_download` su `fatture_inviate`: scarica
   l'XML FatturaPA della fattura corrente. Endpoint backend
   gia' implementati ([Controllers/SdiController.cs](../Controllers/SdiController.cs)):
     - POST /api/sdi/generateXml  -> genera + scrive su disco + UPDATE file_xml
     - GET  /api/sdi/download/{id} -> stream del file (404 se non generato)

   Comportamento callback:
     1. GET /api/sdi/download/{id}
     2. se 404 -> POST /api/sdi/generateXml {FatturaId} -> retry download
     3. blob -> <a download="..."> -> click (trigger browser download)
     4. toast success/error secondo esito

   Pattern (skill `table-actions`, sezione "Row dropdown action"):
     - mc_ui_column_type='button' + voa_class=6
     - mchideinedit=1 + mchideindetail=1 (colonna virtuale, solo list)
     - mcrealcolumnname uguale a mc_nome_colonna
     - JS body in mcbuttonaction (function literal vietato; serve testo)
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

DECLARE @callback NVARCHAR(MAX) = N'// Row-action "Scarica XML": GET /api/sdi/download/{id}; se 404 genera prima.
const recordId = Number(record?.id?.value ?? record?.id ?? record?.Id?.value ?? record?.Id);
if (!recordId) {
    wtoolbox.messageNotificationService.add({ severity: "warn", summary: "XML", detail: "ID fattura non trovato" });
    return;
}
async function tryDownload() {
    const r = await fetch(`/api/sdi/download/${recordId}`, { credentials: "include" });
    return r;
}
let resp = await tryDownload();
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
            severity: "error", summary: "XML",
            detail: "Generazione XML fallita: " + (txt || gen.status).toString().slice(0, 220)
        });
        return;
    }
    resp = await tryDownload();
}
if (!resp.ok) {
    wtoolbox.messageNotificationService.add({
        severity: "error", summary: "XML",
        detail: "Download fallito (HTTP " + resp.status + ")"
    });
    return;
}
const blob = await resp.blob();
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
const cd = resp.headers.get("Content-Disposition") || "";
const m = /filename="?([^";]+)"?/i.exec(cd);
a.download = (m && m[1]) || ("fattura_" + recordId + ".xml");
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
setTimeout(() => URL.revokeObjectURL(url), 1000);
wtoolbox.messageNotificationService.add({
    severity: "success", summary: "XML", detail: "Download avviato: " + a.download
});';

IF NOT EXISTS (
    SELECT 1 FROM dbo._metadati__colonne
    WHERE md_id = @md_fatture AND mc_nome_colonna = 'btn_xml_download'
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
        N'btn_xml_download',
        N'btn_xml_download',
        N'button',
        6,
        N'XML',
        N'XML',
        1,
        1,
        @callback,
        N'XML',
        N'pi pi-file-import',
        N'Scarica XML FatturaPA',
        0,
        9997
    );
    PRINT 'btn_xml_download inserito';
END
ELSE
BEGIN
    UPDATE dbo._metadati__colonne SET
        mc_ui_column_type = N'button',
        voa_class         = 6,
        mc_display_string_in_view = N'XML',
        mc_display_string_in_edit = N'XML',
        mchideinedit      = 1,
        mchideindetail    = 1,
        mcbuttonaction    = @callback,
        mcbuttoncaption   = N'XML',
        mcbuttonimage     = N'pi pi-file-import',
        mcbuttontooltip   = N'Scarica XML FatturaPA',
        mcbuttonactiontype= 0,
        mcordine          = 9997
    WHERE md_id = @md_fatture AND mc_nome_colonna = 'btn_xml_download';
    PRINT 'btn_xml_download aggiornato';
END

SELECT mc_id, mc_nome_colonna, mc_ui_column_type, voa_class,
       CAST(mcbuttoncaption AS NVARCHAR(50)) AS caption,
       CAST(mcbuttonimage AS NVARCHAR(50)) AS img,
       LEN(CAST(mcbuttonaction AS NVARCHAR(MAX))) AS callback_len
  FROM dbo._metadati__colonne
 WHERE md_id = @md_fatture AND mc_nome_colonna = 'btn_xml_download';
