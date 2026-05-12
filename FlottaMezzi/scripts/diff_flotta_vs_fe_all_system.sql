SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO

-- Diff campo-per-campo tra FlottaMezzi_Metadata e FE su TUTTE le system routes
-- per le 5 properties critiche.
SELECT
  fmt.mdroutename AS route,
  fmc.mc_nome_colonna AS col,
  CASE WHEN ISNULL(fmc.mchideinedit,0)<>ISNULL(fec.mchideinedit,0)
       THEN CONCAT('hide_edit: flotta=', ISNULL(fmc.mchideinedit,0), ' fe=', ISNULL(fec.mchideinedit,0)) END AS diff_hide_edit,
  CASE WHEN ISNULL(fmc.mchideinlist,0)<>ISNULL(fec.mchideinlist,0)
       THEN CONCAT('hide_list: flotta=', ISNULL(fmc.mchideinlist,0), ' fe=', ISNULL(fec.mchideinlist,0)) END AS diff_hide_list,
  CASE WHEN ISNULL(fmc.mc_ui_column_type,'')<>ISNULL(fec.mc_ui_column_type,'')
       THEN CONCAT('col_type: flotta=', ISNULL(fmc.mc_ui_column_type,'NULL'), ' fe=', ISNULL(fec.mc_ui_column_type,'NULL')) END AS diff_col_type,
  CASE WHEN ISNULL(fmc.mcgrantbydefault,0)<>ISNULL(fec.mcgrantbydefault,0)
       THEN CONCAT('grant_def: flotta=', ISNULL(fmc.mcgrantbydefault,0), ' fe=', ISNULL(fec.mcgrantbydefault,0)) END AS diff_grant,
  CASE WHEN ISNULL(fmc.mc_validation_required,0)<>ISNULL(fec.mc_validation_required,0)
       THEN CONCAT('val_req: flotta=', ISNULL(fmc.mc_validation_required,0), ' fe=', ISNULL(fec.mc_validation_required,0)) END AS diff_required
FROM FlottaMezzi_Metadata.dbo._metadati__tabelle fmt
JOIN FlottaMezzi_Metadata.dbo._metadati__colonne fmc ON fmc.md_id = fmt.md_id
JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle fet ON fet.mdroutename = fmt.mdroutename
JOIN FatturazioneElettronica_Metadata.dbo._metadati__colonne fec ON fec.md_id = fet.md_id AND fec.mc_nome_colonna = fmc.mc_nome_colonna
WHERE (fmt.mdroutename LIKE '% metadati %' OR fmt.mdroutename LIKE '_metadati%' OR fmt.mdroutename LIKE '__metadati%')
  AND (
    ISNULL(fmc.mchideinedit,0)<>ISNULL(fec.mchideinedit,0)
    OR ISNULL(fmc.mchideinlist,0)<>ISNULL(fec.mchideinlist,0)
    OR ISNULL(fmc.mc_ui_column_type,'')<>ISNULL(fec.mc_ui_column_type,'')
    OR ISNULL(fmc.mcgrantbydefault,0)<>ISNULL(fec.mcgrantbydefault,0)
    OR ISNULL(fmc.mc_validation_required,0)<>ISNULL(fec.mc_validation_required,0)
  )
ORDER BY fmt.mdroutename, fmc.mc_nome_colonna;
