-- =============================================================================
-- CostCnh — Sprint 9.4 metadata-driven formulas per <wuic-spreadsheet-list-sf>
-- =============================================================================
-- Aggiunge `archetypes.spreadsheet.formulas` al `mdpropsbag` della route
-- `plan_facts` (cp.facts). Il framework legge questi token e applica formule
-- Syncfusion auto-calcolate al dataBound.
--
-- Token sintassi:
--   "<target_column>": "=<expression con {col_name} tokens>"
--
-- I {col_name} vengono sostituiti runtime con address A1-style della
-- colonna corrispondente sulla riga corrente (es. {planned} → C2, D3, ecc.).
--
-- ESEMPI:
--   "balance":      "={planned}-{actual}"                    → C2 - D2
--   "variance_pct": "=IF({planned}=0,0,(({actual}/{planned})-1)*100)"
--   "remaining":    "={planned}-{actual}-{committed}"        → C2 - D2 - E2
-- =============================================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE [CostCnh_Metadata];
GO

DECLARE @md_id INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'plan_facts');
IF @md_id IS NULL
BEGIN
    PRINT '[warn] route plan_facts non trovata — skipping';
    RETURN;
END

DECLARE @current_propsbag NVARCHAR(MAX);
SELECT @current_propsbag = mdpropsbag FROM _metadati__tabelle WHERE md_id = @md_id;

-- Merge formule nel propsbag (preserva altre archetypes config esistenti)
DECLARE @new_propsbag NVARCHAR(MAX);
IF @current_propsbag IS NULL OR LEN(@current_propsbag) = 0 OR ISJSON(@current_propsbag) = 0
BEGIN
    SET @new_propsbag = N'{
  "archetypes": {
    "spreadsheet": {
      "formulas": {
        "balance":   "={planned}-{actual}",
        "remaining": "={planned}-{actual}-{committed}"
      }
    }
  }
}';
END
ELSE
BEGIN
    -- Aggiungi/sostituisce solo archetypes.spreadsheet.formulas (JSON_MODIFY preserva il resto)
    SET @new_propsbag = JSON_MODIFY(
        JSON_MODIFY(@current_propsbag, '$.archetypes.spreadsheet.formulas.balance', '={planned}-{actual}'),
        '$.archetypes.spreadsheet.formulas.remaining', '={planned}-{actual}-{committed}'
    );
END

UPDATE _metadati__tabelle SET mdpropsbag = @new_propsbag WHERE md_id = @md_id;

PRINT '[OK] mdpropsbag patched on plan_facts (md_id=' + CAST(@md_id AS NVARCHAR(10)) + ')';
PRINT 'New mdpropsbag.archetypes.spreadsheet.formulas:';
SELECT JSON_QUERY(mdpropsbag, '$.archetypes.spreadsheet.formulas') AS formulas
FROM _metadati__tabelle WHERE md_id = @md_id;
GO
