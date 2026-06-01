-- =============================================================================
-- 2026-05-17 â€” Azioni tabella + azioni riga per Modulo Varianti + Magazzino
-- =============================================================================
-- Pattern: skill `table-actions/SKILL.md`.
--
-- IMPORTANTE â€” nomi SQL reali (verificati 2026-05-17 via INFORMATION_SCHEMA):
--   `_mtdt__cstom__actions__tabelle`:
--     id1, mdid (no underscore!), ordine1, buttoncaption, buttonimage,
--     buttontemplate, actioncallback, disablecallback, md_action_type
--   `_metadati__colonne` (subset usato per row buttons):
--     md_id (con underscore), mc_nome_colonna, mc_ui_column_type,
--     mc_display_string_in_view, voa_class (no mc_ prefix!),
--     mcbuttonaction, mcbuttonimage, mcbuttoncaption, mcbuttontooltip,
--     mcordine, mchideinedit, mchideinlist, mchideinexport
--
-- Le azioni implementate:
--   TOOLBAR (bulk):
--     1) prodotti           - "Genera matrice varianti" (UN solo prodotto selezionato)
--     2) magazzini          - "Movimento manuale rapido"
--     3) magazzino_giacenze - "Inventario fisico (conteggio)"
--     4) magazzino_giacenze - "Riconcilia snapshot da event log"
--
--   ROW (dropdown):
--     5) prodotto_varianti        - "Apri prodotto padre"
--     6) prodotto_attributi_valori- "Apri attributo padre"
--     7) magazzino_giacenze       - "Vedi storico movimenti"
--     8) magazzino_movimenti      - "Crea rettifica opposta"
--     9) magazzini                - "Vedi giacenze del magazzino"
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;

USE FatturazioneElettronica_Metadata;

-- =====================================================================
-- A) Abilita selezione multipla (mdmultipleselection=1) dove serve
--    NB: nome SQL col reale = `mdmultipleselection` (verificare se diverso)
-- =====================================================================
-- (Se la colonna esiste e mdmultipleselection<>1, settarla a 1 sulle 3 route
--  che useranno bulk actions.)
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_NAME='_metadati__tabelle' AND COLUMN_NAME='mdmultipleselection')
BEGIN
    UPDATE _metadati__tabelle SET mdmultipleselection = 1
    WHERE mdroutename IN ('prodotti','magazzini','magazzino_giacenze')
      AND ISNULL(mdmultipleselection, 0) <> 1;
END

-- =====================================================================
-- B) TOOLBAR ACTIONS (_mtdt__cstom__actions__tabelle)
-- =====================================================================

-- 1) prodotti - "Genera matrice varianti"
DECLARE @md_prodotti INT = (SELECT TOP 1 md_id FROM _metadati__tabelle WHERE mdroutename='prodotti');
IF @md_prodotti IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM _mtdt__cstom__actions__tabelle
    WHERE mdid=@md_prodotti AND buttoncaption=N'Genera matrice varianti'
)
BEGIN
    INSERT INTO _mtdt__cstom__actions__tabelle (id1, mdid, ordine1, buttoncaption, buttonimage, actioncallback)
    VALUES ((SELECT ISNULL(MAX(id1),0)+1 FROM _mtdt__cstom__actions__tabelle), @md_prodotti, 100, N'Genera matrice varianti', 'pi pi-th-large', N'
async function(datasource, metaInfo, record, event, wtoolbox) {
  const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
  if (selected.length !== 1) {
    wtoolbox.messageNotificationService.add({severity: "warn", summary: "Selezione richiesta", detail: "Seleziona esattamente UN prodotto"});
    return;
  }
  const prodottoId = Number(selected[0].id?.value ?? selected[0].id);
  const attrJson = await wtoolbox.promptDialog({header: "Genera matrice varianti", message: "Inserisci JSON [{attributo_id, valori_id:[..]}, ...]", value: "[{\"attributo_id\":1,\"valori_id\":[1,2,3]}]"});
  if (!attrJson) return;
  let attributi;
  try { attributi = JSON.parse(attrJson); } catch (e) {
    wtoolbox.messageNotificationService.add({severity: "error", summary: "JSON invalido", detail: e.message}); return;
  }
  const r = await fetch("/api/varianti/generate-matrix", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({prodotto_id: prodottoId, attributi})});
  const j = await r.json();
  if (r.ok) {
    wtoolbox.messageNotificationService.add({severity:"success", summary:"Varianti generate", detail: j.inserted + " nuove varianti create"});
    if (datasource && datasource.fetchData) await datasource.fetchData();
  } else {
    wtoolbox.messageNotificationService.add({severity:"error", summary:"Errore", detail: j.error || "unknown"});
  }
}');
    PRINT 'INSERT toolbar: prodotti / Genera matrice varianti';
END

-- 2) magazzini - "Movimento manuale rapido"
DECLARE @md_magazzini INT = (SELECT TOP 1 md_id FROM _metadati__tabelle WHERE mdroutename='magazzini');
IF @md_magazzini IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM _mtdt__cstom__actions__tabelle
    WHERE mdid=@md_magazzini AND buttoncaption=N'Movimento manuale'
)
BEGIN
    INSERT INTO _mtdt__cstom__actions__tabelle (id1, mdid, ordine1, buttoncaption, buttonimage, actioncallback)
    VALUES ((SELECT ISNULL(MAX(id1),0)+1 FROM _mtdt__cstom__actions__tabelle), @md_magazzini, 100, N'Movimento manuale', 'pi pi-plus-circle', N'
async function(datasource, metaInfo, record, event, wtoolbox) {
  const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
  if (selected.length !== 1) {
    wtoolbox.messageNotificationService.add({severity:"warn", summary:"Selezione richiesta", detail:"Seleziona un magazzino"});
    return;
  }
  const magazzino_id = Number(selected[0].id?.value ?? selected[0].id);
  const tipo = await wtoolbox.promptDialog({header:"Tipo movimento", message:"CARICO | SCARICO | RETTIFICA", value:"CARICO"});
  if (!tipo) return;
  const prodIdRaw = await wtoolbox.promptDialog({header:"Prodotto ID", message:"ID numerico del prodotto", value:""});
  if (!prodIdRaw) return;
  const qtaRaw = await wtoolbox.promptDialog({header:"Quantita", message:"Quantita (positiva, il segno lo applica il server)", value:"1"});
  if (!qtaRaw) return;
  const body = {magazzino_id, prodotto_id: Number(prodIdRaw), tipo_movimento: String(tipo).trim().toUpperCase(), quantita: Number(qtaRaw)};
  const r = await fetch("/api/magazzino/movimento-manuale", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body)});
  const j = await r.json();
  if (r.ok) {
    wtoolbox.messageNotificationService.add({severity:"success", summary:"Movimento inserito", detail:"id="+j.id+" qta="+j.quantita_applicata});
  } else {
    wtoolbox.messageNotificationService.add({severity:"error", summary:"Errore", detail: j.error || "unknown"});
  }
}');
    PRINT 'INSERT toolbar: magazzini / Movimento manuale';
END

-- 3) magazzino_giacenze - "Inventario fisico"
DECLARE @md_giacenze INT = (SELECT TOP 1 md_id FROM _metadati__tabelle WHERE mdroutename='magazzino_giacenze');
IF @md_giacenze IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM _mtdt__cstom__actions__tabelle
    WHERE mdid=@md_giacenze AND buttoncaption=N'Inventario fisico'
)
BEGIN
    INSERT INTO _mtdt__cstom__actions__tabelle (id1, mdid, ordine1, buttoncaption, buttonimage, actioncallback)
    VALUES ((SELECT ISNULL(MAX(id1),0)+1 FROM _mtdt__cstom__actions__tabelle), @md_giacenze, 100, N'Inventario fisico', 'pi pi-check-square', N'
async function(datasource, metaInfo, record, event, wtoolbox) {
  const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];
  if (!selected.length) { wtoolbox.messageNotificationService.add({severity:"warn", summary:"Selezione vuota", detail:"Seleziona le righe giacenza da rettificare"}); return; }
  const magazzino_id = Number(selected[0].magazzino_id?.value ?? selected[0].magazzino_id);
  const righe = [];
  for (const row of selected) {
    const pid = Number(row.prodotto_id?.value ?? row.prodotto_id);
    const vid = row.variante_id?.value ?? row.variante_id;
    const cur = Number(row.quantita_disponibile?.value ?? row.quantita_disponibile);
    const reale = await wtoolbox.promptDialog({header:"Conteggio reale", message: "prodotto "+pid+" (giacenza attuale "+cur+")", value: String(cur)});
    if (reale === null || reale === undefined) continue;
    righe.push({prodotto_id: pid, variante_id: (vid==null||vid==="") ? null : Number(vid), quantita_reale: Number(reale)});
  }
  if (!righe.length) return;
  const r = await fetch("/api/magazzino/inventario-fisico", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({magazzino_id, righe})});
  const j = await r.json();
  if (r.ok) {
    wtoolbox.messageNotificationService.add({severity:"success", summary:"Inventario applicato", detail: j.rettifiche_applicate + " rettifiche"});
    if (datasource && datasource.fetchData) await datasource.fetchData();
  } else {
    wtoolbox.messageNotificationService.add({severity:"error", summary:"Errore", detail: j.error || "unknown"});
  }
}');
    PRINT 'INSERT toolbar: magazzino_giacenze / Inventario fisico';
END

-- 4) magazzino_giacenze - "Riconcilia snapshot"
IF @md_giacenze IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM _mtdt__cstom__actions__tabelle
    WHERE mdid=@md_giacenze AND buttoncaption=N'Riconcilia snapshot'
)
BEGIN
    INSERT INTO _mtdt__cstom__actions__tabelle (id1, mdid, ordine1, buttoncaption, buttonimage, actioncallback)
    VALUES ((SELECT ISNULL(MAX(id1),0)+1 FROM _mtdt__cstom__actions__tabelle), @md_giacenze, 110, N'Riconcilia snapshot', 'pi pi-refresh', N'
async function(datasource, metaInfo, record, event, wtoolbox) {
  const ok = await wtoolbox.promptDialog({header:"Conferma", message:"Ricalcolare giacenze da magazzino_movimenti? L''operazione e'' idempotente."});
  if (ok === false || ok === null) return;
  const r = await fetch("/api/magazzino/riconcilia-snapshot", {method:"POST"});
  const j = await r.json();
  if (r.ok) {
    wtoolbox.messageNotificationService.add({severity:"success", summary:"Snapshot riconciliato", detail:""});
    if (datasource && datasource.fetchData) await datasource.fetchData();
  } else {
    wtoolbox.messageNotificationService.add({severity:"error", summary:"Errore", detail: j.error || "unknown"});
  }
}');
    PRINT 'INSERT toolbar: magazzino_giacenze / Riconcilia snapshot';
END

-- =====================================================================
-- C) ROW ACTIONS (_metadati__colonne con voa_class=6 + mc_ui_column_type=button)
-- =====================================================================

-- 5) prodotto_varianti - "Apri prodotto padre"
DECLARE @md_varianti INT = (SELECT TOP 1 md_id FROM _metadati__tabelle WHERE mdroutename='prodotto_varianti');
IF @md_varianti IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM _metadati__colonne
    WHERE md_id=@md_varianti AND mc_nome_colonna='btn_apri_prodotto_padre'
)
BEGIN
    INSERT INTO _metadati__colonne (md_id, mc_nome_colonna, mc_ui_column_type, mc_display_string_in_view, voa_class, mcbuttonaction, mcbuttonimage, mcordine, mchideinedit, mchideinexport)
    VALUES (@md_varianti, 'btn_apri_prodotto_padre', 'button', N'Prodotto padre', 6, N'
async function(datasource, record, event, field, wtoolbox) {
  const prodId = Number(record.prodotto_id?.value ?? record.prodotto_id);
  if (!prodId) return;
  window.location.hash = "#/prodotti/edit/" + prodId;
}', 'pi pi-external-link', 990, 1, 1);
    PRINT 'INSERT row-action: prodotto_varianti / Apri prodotto padre';
END

-- 6) prodotto_attributi_valori - "Apri attributo padre"
DECLARE @md_pav INT = (SELECT TOP 1 md_id FROM _metadati__tabelle WHERE mdroutename='prodotto_attributi_valori');
IF @md_pav IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM _metadati__colonne
    WHERE md_id=@md_pav AND mc_nome_colonna='btn_apri_attributo_padre'
)
BEGIN
    INSERT INTO _metadati__colonne (md_id, mc_nome_colonna, mc_ui_column_type, mc_display_string_in_view, voa_class, mcbuttonaction, mcbuttonimage, mcordine, mchideinedit, mchideinexport)
    VALUES (@md_pav, 'btn_apri_attributo_padre', 'button', N'Attributo padre', 6, N'
async function(datasource, record, event, field, wtoolbox) {
  const attrId = Number(record.attributo_id?.value ?? record.attributo_id);
  if (!attrId) return;
  window.location.hash = "#/prodotto_attributi/edit/" + attrId;
}', 'pi pi-external-link', 990, 1, 1);
    PRINT 'INSERT row-action: prodotto_attributi_valori / Apri attributo padre';
END

-- 7) magazzino_giacenze - "Vedi storico movimenti"
IF @md_giacenze IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM _metadati__colonne
    WHERE md_id=@md_giacenze AND mc_nome_colonna='btn_storico_movimenti'
)
BEGIN
    INSERT INTO _metadati__colonne (md_id, mc_nome_colonna, mc_ui_column_type, mc_display_string_in_view, voa_class, mcbuttonaction, mcbuttonimage, mcordine, mchideinedit, mchideinexport)
    VALUES (@md_giacenze, 'btn_storico_movimenti', 'button', N'Storico movimenti', 6, N'
async function(datasource, record, event, field, wtoolbox) {
  const prodId = Number(record.prodotto_id?.value ?? record.prodotto_id);
  const magId = Number(record.magazzino_id?.value ?? record.magazzino_id);
  if (!prodId) return;
  const filterInfo = encodeURIComponent(JSON.stringify({
    filterModel: {
      prodotto_id: { type:"equals", filter: prodId },
      magazzino_id:{ type:"equals", filter: magId }
    }
  }));
  window.location.hash = "#/magazzino_movimenti/list?filterInfo=" + filterInfo;
}', 'pi pi-history', 990, 1, 1);
    PRINT 'INSERT row-action: magazzino_giacenze / Storico movimenti';
END

-- 8) magazzino_movimenti - "Crea rettifica opposta"
DECLARE @md_movim INT = (SELECT TOP 1 md_id FROM _metadati__tabelle WHERE mdroutename='magazzino_movimenti');
IF @md_movim IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM _metadati__colonne
    WHERE md_id=@md_movim AND mc_nome_colonna='btn_rettifica_opposta'
)
BEGIN
    INSERT INTO _metadati__colonne (md_id, mc_nome_colonna, mc_ui_column_type, mc_display_string_in_view, voa_class, mcbuttonaction, mcbuttonimage, mcordine, mchideinedit, mchideinexport)
    VALUES (@md_movim, 'btn_rettifica_opposta', 'button', N'Rettifica opposta', 6, N'
async function(datasource, record, event, field, wtoolbox) {
  const magId = Number(record.magazzino_id?.value ?? record.magazzino_id);
  const prodId = Number(record.prodotto_id?.value ?? record.prodotto_id);
  const varIdRaw = record.variante_id?.value ?? record.variante_id;
  const qta = Number(record.quantita?.value ?? record.quantita);
  if (!magId || !prodId || !qta) return;
  const ok = await wtoolbox.promptDialog({header:"Crea rettifica opposta", message:"Confermi RETTIFICA di "+(-qta)+" su prodotto "+prodId+"?"});
  if (ok === false || ok === null) return;
  const body = {magazzino_id: magId, prodotto_id: prodId, variante_id: (varIdRaw==null||varIdRaw==="") ? null : Number(varIdRaw), tipo_movimento:"RETTIFICA", quantita: -qta, causale:"STORNO movimento "+Number(record.id?.value ?? record.id)};
  const r = await fetch("/api/magazzino/movimento-manuale", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body)});
  const j = await r.json();
  if (r.ok) {
    wtoolbox.messageNotificationService.add({severity:"success", summary:"Rettifica creata", detail:"id="+j.id});
    if (datasource && datasource.fetchData) await datasource.fetchData();
  } else {
    wtoolbox.messageNotificationService.add({severity:"error", summary:"Errore", detail: j.error || "unknown"});
  }
}', 'pi pi-undo', 990, 1, 1);
    PRINT 'INSERT row-action: magazzino_movimenti / Rettifica opposta';
END

-- 9) magazzini - "Vedi giacenze del magazzino"
IF @md_magazzini IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM _metadati__colonne
    WHERE md_id=@md_magazzini AND mc_nome_colonna='btn_vedi_giacenze'
)
BEGIN
    INSERT INTO _metadati__colonne (md_id, mc_nome_colonna, mc_ui_column_type, mc_display_string_in_view, voa_class, mcbuttonaction, mcbuttonimage, mcordine, mchideinedit, mchideinexport)
    VALUES (@md_magazzini, 'btn_vedi_giacenze', 'button', N'Vedi giacenze', 6, N'
async function(datasource, record, event, field, wtoolbox) {
  const magId = Number(record.id?.value ?? record.id);
  if (!magId) return;
  const filterInfo = encodeURIComponent(JSON.stringify({
    filterModel: { magazzino_id: { type:"equals", filter: magId } }
  }));
  window.location.hash = "#/magazzino_giacenze/list?filterInfo=" + filterInfo;
}', 'pi pi-list', 990, 1, 1);
    PRINT 'INSERT row-action: magazzini / Vedi giacenze';
END

PRINT '2026-05-17-magazzino-varianti-actions.sql applicato.';
