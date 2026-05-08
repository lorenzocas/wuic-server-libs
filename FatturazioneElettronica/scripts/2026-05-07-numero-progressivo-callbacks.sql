-- =============================================================================
-- Patch metadata: numero auto-composto + progressivo da numeratore + data oggi
-- =============================================================================
-- Per ogni route documento commerciale (fatture_inviate, fatture_ricevute,
-- preventivi, ordini, ordini_acquisto, ordini_elettronici, ddt, proforma):
--
--   - mc_logic_editable=0 su `numero` (composto runtime via callback)
--   - mc_default_value_callback su `data_documento` (= oggi)
--   - mc_default_value_callback su `anno` (= anno corrente)
--   - mc_default_value_callback su `progressivo`/`progressivo_interno` (chiama
--     sp_next_progressivo via MetaService.getFlatDataFromStored)
--   - mcslctionchangedcustomfunction su `progressivo`/`anno`/`serie` (ricomputa
--     numero come "[serie ]<progressivo>/<anno>")
--
-- Idempotente.
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
-- Helpers SQL (le callback JS sono stringhe in mcdefaultvaluecallback / mcslctionchangedcustomfunction)
-- ---------------------------------------------------------------------------

-- Callback "data oggi" (sync)
DECLARE @cb_today NVARCHAR(MAX) = N'record.data_documento = new Date();';

-- Callback "anno corrente" (sync)
DECLARE @cb_year_now NVARCHAR(MAX) = N'record.anno = new Date().getFullYear();';

-- Callback "ricomposizione numero" (sync, post-change su progressivo/anno/serie)
-- record qui e' gia' BehaviorSubject map -> usare .value e .next()
DECLARE @cb_compose_numero NVARCHAR(MAX) = N'
const prog = record.progressivo && record.progressivo.value;
const anno = record.anno && record.anno.value;
const serie = (record.serie && record.serie.value) || '''';
if (prog != null && prog !== '''' && anno != null && anno !== '''') {
  const newNum = (serie ? serie + '' '' : '''') + prog + ''/'' + anno;
  if (record.numero && record.numero.next) record.numero.next(newNum);
}';

-- Callback "ricomposizione numero" — varianti per route con `numero_fornitore` / `numero_pa` / `progressivo_interno`
DECLARE @cb_compose_numero_ric NVARCHAR(MAX) = N'
// fatture_ricevute: numero_fornitore non e'' auto-calcolato (input manuale)
// quindi qui aggiorniamo solo l''anno se cambia. No-op intenzionale.
';

-- Builder progressivo da stored. Sostituire $$ROUTE$$ a runtime.
DECLARE @cb_progressivo_template NVARCHAR(MAX) = N'
const anno = (record.anno && record.anno.value) || new Date().getFullYear();
const serie = (record.serie && record.serie.value) || '''';
const url = wtoolbox.appSettings.global_root_url + ''MetaService.getFlatDataFromStored'';
const body = {
  stored: ''sp_next_progressivo'',
  parameters: [
    { Name: ''@route'', Value: ''$$ROUTE$$'' },
    { Name: ''@anno'',  Value: anno },
    { Name: ''@serie'', Value: serie }
  ],
  __pageIndex: 0, __pageSize: 1, __sortField: '''', __sortDir: ''''
};
wtoolbox.http.post(url, body).subscribe(function(r){
  let next = 1;
  try {
    const arr = (r && (r.data || r)) || [];
    if (arr[0] && arr[0].next_progressivo != null) next = arr[0].next_progressivo;
  } catch (_e) {}
  if (record.progressivo && record.progressivo.next) {
    record.progressivo.next(next);
  } else {
    record.progressivo = next;
  }
  // Ricomponi numero: se record.numero e'' BS lo aggiorna, se no lo setta
  const composed = (serie ? serie + '' '' : '''') + next + ''/'' + anno;
  if (record.numero && record.numero.next) record.numero.next(composed);
  else record.numero = composed;
});
';

-- ---------------------------------------------------------------------------
-- Macro update per ROUTE singola: route, progCol, hasSerie
-- ---------------------------------------------------------------------------

DECLARE @route VARCHAR(50);
DECLARE @progCol VARCHAR(50);
DECLARE @hasSerie BIT;
DECLARE @cb_progressivo NVARCHAR(MAX);
DECLARE @md_id INT;

-- Tabella temp con il mapping
IF OBJECT_ID('tempdb..#routes') IS NOT NULL DROP TABLE #routes;
CREATE TABLE #routes (route VARCHAR(50), progCol VARCHAR(50), hasSerie BIT, hasAuto BIT);
INSERT INTO #routes VALUES
  ('fatture_inviate',     'progressivo',          1, 1),
  ('fatture_ricevute',    'progressivo_interno',  0, 0), -- numero_fornitore manuale, no auto-compose
  ('preventivi',          'progressivo',          0, 1),
  ('ordini',              'progressivo',          0, 1),
  ('ordini_acquisto',     'progressivo',          0, 1),
  ('ordini_elettronici',  'progressivo_interno',  0, 0), -- numero_pa input manuale
  ('ddt',                 'progressivo',          0, 1),
  ('proforma',            'progressivo',          0, 1);

DECLARE rcur CURSOR LOCAL FOR
  SELECT route, progCol, hasSerie, hasAuto FROM #routes;
DECLARE @hasAuto BIT;
OPEN rcur;
FETCH NEXT FROM rcur INTO @route, @progCol, @hasSerie, @hasAuto;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @md_id = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = @route);
  IF @md_id IS NOT NULL
  BEGIN
    -- mc_logic_editable = 0 su 'numero' (solo route con auto-compose)
    IF @hasAuto = 1
    BEGIN
      UPDATE _metadati__colonne SET mc_logic_editable = 0
       WHERE md_id = @md_id AND mc_nome_colonna = 'numero';
    END

    -- data_documento default = oggi
    UPDATE _metadati__colonne SET mcdefaultvaluecallback = @cb_today
     WHERE md_id = @md_id AND mc_nome_colonna = 'data_documento';

    -- anno default = anno corrente
    UPDATE _metadati__colonne SET mcdefaultvaluecallback = @cb_year_now
     WHERE md_id = @md_id AND mc_nome_colonna = 'anno';

    -- progressivo default = sp_next_progressivo (con sostituzione $$ROUTE$$)
    SET @cb_progressivo = REPLACE(@cb_progressivo_template, N'$$ROUTE$$', @route);
    UPDATE _metadati__colonne SET mcdefaultvaluecallback = @cb_progressivo
     WHERE md_id = @md_id AND mc_nome_colonna = @progCol;

    -- selection_changed su progressivo/anno (ricompone numero solo per route auto)
    IF @hasAuto = 1
    BEGIN
      UPDATE _metadati__colonne SET mcslctionchangedcustomfunction = @cb_compose_numero
       WHERE md_id = @md_id AND mc_nome_colonna IN ('progressivo','anno');
      IF @hasSerie = 1
        UPDATE _metadati__colonne SET mcslctionchangedcustomfunction = @cb_compose_numero
         WHERE md_id = @md_id AND mc_nome_colonna = 'serie';
    END
  END
  FETCH NEXT FROM rcur INTO @route, @progCol, @hasSerie, @hasAuto;
END
CLOSE rcur; DEALLOCATE rcur;

DROP TABLE #routes;

-- Verifica
SELECT t.mdroutename, c.mc_nome_colonna,
       ISNULL(c.mc_logic_editable,1) AS le,
       LEN(ISNULL(c.mcdefaultvaluecallback,'')) AS dvc_len,
       LEN(ISNULL(c.mcslctionchangedcustomfunction,'')) AS scc_len
  FROM _metadati__colonne c
  JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE t.mdroutename IN ('fatture_inviate','preventivi','ordini','ddt','proforma','ordini_acquisto','fatture_ricevute','ordini_elettronici')
   AND c.mc_nome_colonna IN ('numero','numero_fornitore','numero_pa','serie','progressivo','progressivo_interno','anno','data_documento')
 ORDER BY t.mdroutename, c.mcordine;
