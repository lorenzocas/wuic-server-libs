SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO

-- Diff campo-per-campo delle system routes metadata-of-metadata fra
-- Kiara_wuic_new (template) e FatturazioneElettronica_Metadata (canonical
-- production app), per le routes ` metadati  *` e `_metadati_*` e `__metadati_*`.

-- 1) System routes presenti in entrambi (intersezione)
PRINT '=== 1) Sanity counts per system route ==='
SELECT
  ISNULL(k.mdroutename, fe.mdroutename) AS route,
  k.cnt AS kiara_cols,
  fe.cnt AS fe_cols,
  ISNULL(fe.cnt,0) - ISNULL(k.cnt,0) AS delta
FROM (
  SELECT t.mdroutename, COUNT(*) AS cnt
  FROM Kiara_wuic_new.dbo._metadati__tabelle t
  JOIN Kiara_wuic_new.dbo._metadati__colonne c ON c.md_id = t.md_id
  WHERE t.mdroutename LIKE '% metadati %' OR t.mdroutename LIKE '_metadati%' OR t.mdroutename LIKE '__metadati%'
  GROUP BY t.mdroutename
) k
FULL OUTER JOIN (
  SELECT t.mdroutename, COUNT(*) AS cnt
  FROM FatturazioneElettronica_Metadata.dbo._metadati__tabelle t
  JOIN FatturazioneElettronica_Metadata.dbo._metadati__colonne c ON c.md_id = t.md_id
  WHERE t.mdroutename LIKE '% metadati %' OR t.mdroutename LIKE '_metadati%' OR t.mdroutename LIKE '__metadati%'
  GROUP BY t.mdroutename
) fe ON fe.mdroutename = k.mdroutename
ORDER BY route;

PRINT '=== 2) Field-by-field differences (mchideinedit / mc_ui_column_type / mchideinlist / mcgrantbydefault / mc_validation_required) ==='
SELECT
  kt.mdroutename AS route,
  kc.mc_nome_colonna AS col,
  CASE WHEN ISNULL(kc.mchideinedit,0)<>ISNULL(fec.mchideinedit,0)
       THEN CONCAT('hide_in_edit: kiara=', ISNULL(kc.mchideinedit,0), ' fe=', ISNULL(fec.mchideinedit,0)) ELSE NULL END AS diff_hide_edit,
  CASE WHEN ISNULL(kc.mchideinlist,0)<>ISNULL(fec.mchideinlist,0)
       THEN CONCAT('hide_in_list: kiara=', ISNULL(kc.mchideinlist,0), ' fe=', ISNULL(fec.mchideinlist,0)) ELSE NULL END AS diff_hide_list,
  CASE WHEN ISNULL(kc.mc_ui_column_type,'')<>ISNULL(fec.mc_ui_column_type,'')
       THEN CONCAT('col_type: kiara=', ISNULL(kc.mc_ui_column_type,'NULL'), ' fe=', ISNULL(fec.mc_ui_column_type,'NULL')) ELSE NULL END AS diff_col_type,
  CASE WHEN ISNULL(kc.mcgrantbydefault,0)<>ISNULL(fec.mcgrantbydefault,0)
       THEN CONCAT('grant_default: kiara=', ISNULL(kc.mcgrantbydefault,0), ' fe=', ISNULL(fec.mcgrantbydefault,0)) ELSE NULL END AS diff_grant,
  CASE WHEN ISNULL(kc.mc_validation_required,0)<>ISNULL(fec.mc_validation_required,0)
       THEN CONCAT('val_required: kiara=', ISNULL(kc.mc_validation_required,0), ' fe=', ISNULL(fec.mc_validation_required,0)) ELSE NULL END AS diff_required
FROM Kiara_wuic_new.dbo._metadati__tabelle kt
JOIN Kiara_wuic_new.dbo._metadati__colonne kc ON kc.md_id = kt.md_id
JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle fet ON fet.mdroutename = kt.mdroutename
JOIN FatturazioneElettronica_Metadata.dbo._metadati__colonne fec ON fec.md_id = fet.md_id AND fec.mc_nome_colonna = kc.mc_nome_colonna
WHERE (kt.mdroutename LIKE '% metadati %' OR kt.mdroutename LIKE '_metadati%' OR kt.mdroutename LIKE '__metadati%')
  AND (
    ISNULL(kc.mchideinedit,0)<>ISNULL(fec.mchideinedit,0)
    OR ISNULL(kc.mchideinlist,0)<>ISNULL(fec.mchideinlist,0)
    OR ISNULL(kc.mc_ui_column_type,'')<>ISNULL(fec.mc_ui_column_type,'')
    OR ISNULL(kc.mcgrantbydefault,0)<>ISNULL(fec.mcgrantbydefault,0)
    OR ISNULL(kc.mc_validation_required,0)<>ISNULL(fec.mc_validation_required,0)
  )
ORDER BY kt.mdroutename, kc.mc_nome_colonna;

PRINT '=== 3) Cols presenti in FE ma MANCANTI in Kiara (orphan cols) ==='
SELECT fet.mdroutename AS route, fec.mc_nome_colonna AS col_only_in_fe
FROM FatturazioneElettronica_Metadata.dbo._metadati__tabelle fet
JOIN FatturazioneElettronica_Metadata.dbo._metadati__colonne fec ON fec.md_id = fet.md_id
LEFT JOIN Kiara_wuic_new.dbo._metadati__tabelle kt ON kt.mdroutename = fet.mdroutename
LEFT JOIN Kiara_wuic_new.dbo._metadati__colonne kc ON kc.md_id = kt.md_id AND kc.mc_nome_colonna = fec.mc_nome_colonna
WHERE (fet.mdroutename LIKE '% metadati %' OR fet.mdroutename LIKE '_metadati%' OR fet.mdroutename LIKE '__metadati%')
  AND kc.mc_id IS NULL
ORDER BY fet.mdroutename, fec.mc_nome_colonna;

PRINT '=== 4) Cols presenti in Kiara ma MANCANTI in FE ==='
SELECT kt.mdroutename AS route, kc.mc_nome_colonna AS col_only_in_kiara
FROM Kiara_wuic_new.dbo._metadati__tabelle kt
JOIN Kiara_wuic_new.dbo._metadati__colonne kc ON kc.md_id = kt.md_id
LEFT JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle fet ON fet.mdroutename = kt.mdroutename
LEFT JOIN FatturazioneElettronica_Metadata.dbo._metadati__colonne fec ON fec.md_id = fet.md_id AND fec.mc_nome_colonna = kc.mc_nome_colonna
WHERE (kt.mdroutename LIKE '% metadati %' OR kt.mdroutename LIKE '_metadati%' OR kt.mdroutename LIKE '__metadati%')
  AND fec.mc_id IS NULL
ORDER BY kt.mdroutename, kc.mc_nome_colonna;
