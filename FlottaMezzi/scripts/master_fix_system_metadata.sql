SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO

-- ============================================================================
-- Master fix system metadata: allinea Kiara_wuic_new + FlottaMezzi_Metadata
-- a FatturazioneElettronica_Metadata (canonical) sulle 5 properties:
-- mchideinedit, mchideinlist, mc_ui_column_type, mcgrantbydefault, mc_validation_required.
--
-- Scope: tutte le system route (` metadati %`, `_metadati_*`, `__metadati_*`).
--
-- Esclude (Cat 2 — preferenze FE-specifiche, NON portare avanti):
--   1) ` metadati  colonne` / `mc_logic_cascade_filteringParent` / mchideinlist
--   2) `_metadati_condition_item` / `FK_CG_Id` / mc_validation_required
--   3) ` metadati  colonne` / `mc_id` / mcgrantbydefault
-- ============================================================================

DECLARE @target NVARCHAR(100);
DECLARE @sql NVARCHAR(MAX);

DECLARE targets CURSOR LOCAL FOR
  SELECT v FROM (VALUES (N'Kiara_wuic_new'), (N'FlottaMezzi_Metadata')) t(v);

OPEN targets;
FETCH NEXT FROM targets INTO @target;
WHILE @@FETCH_STATUS = 0
BEGIN
  PRINT N'--- Target: ' + @target + N' ---';

  -- 1) mchideinedit
  SET @sql = N'
UPDATE tc SET tc.mchideinedit = sec.mchideinedit
FROM ' + QUOTENAME(@target) + N'.dbo._metadati__colonne tc
JOIN ' + QUOTENAME(@target) + N'.dbo._metadati__tabelle tt ON tt.md_id = tc.md_id
JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle set_t ON set_t.mdroutename = tt.mdroutename
JOIN FatturazioneElettronica_Metadata.dbo._metadati__colonne sec ON sec.md_id = set_t.md_id AND sec.mc_nome_colonna = tc.mc_nome_colonna
WHERE (tt.mdroutename LIKE ''% metadati %'' OR tt.mdroutename LIKE ''_metadati%'' OR tt.mdroutename LIKE ''__metadati%'')
  AND ISNULL(tc.mchideinedit,0) <> ISNULL(sec.mchideinedit,0);';
  EXEC sp_executesql @sql;
  PRINT '  mchideinedit updated rows: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

  -- 2) mchideinlist (escludendo Cat 2: mc_logic_cascade_filteringParent)
  SET @sql = N'
UPDATE tc SET tc.mchideinlist = sec.mchideinlist
FROM ' + QUOTENAME(@target) + N'.dbo._metadati__colonne tc
JOIN ' + QUOTENAME(@target) + N'.dbo._metadati__tabelle tt ON tt.md_id = tc.md_id
JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle set_t ON set_t.mdroutename = tt.mdroutename
JOIN FatturazioneElettronica_Metadata.dbo._metadati__colonne sec ON sec.md_id = set_t.md_id AND sec.mc_nome_colonna = tc.mc_nome_colonna
WHERE (tt.mdroutename LIKE ''% metadati %'' OR tt.mdroutename LIKE ''_metadati%'' OR tt.mdroutename LIKE ''__metadati%'')
  AND ISNULL(tc.mchideinlist,0) <> ISNULL(sec.mchideinlist,0)
  AND NOT (tt.mdroutename = '' metadati  colonne'' AND tc.mc_nome_colonna = ''mc_logic_cascade_filteringParent'');';
  EXEC sp_executesql @sql;
  PRINT '  mchideinlist updated rows: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

  -- 3) mc_ui_column_type
  SET @sql = N'
UPDATE tc SET tc.mc_ui_column_type = sec.mc_ui_column_type
FROM ' + QUOTENAME(@target) + N'.dbo._metadati__colonne tc
JOIN ' + QUOTENAME(@target) + N'.dbo._metadati__tabelle tt ON tt.md_id = tc.md_id
JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle set_t ON set_t.mdroutename = tt.mdroutename
JOIN FatturazioneElettronica_Metadata.dbo._metadati__colonne sec ON sec.md_id = set_t.md_id AND sec.mc_nome_colonna = tc.mc_nome_colonna
WHERE (tt.mdroutename LIKE ''% metadati %'' OR tt.mdroutename LIKE ''_metadati%'' OR tt.mdroutename LIKE ''__metadati%'')
  AND ISNULL(tc.mc_ui_column_type,'''') <> ISNULL(sec.mc_ui_column_type,'''');';
  EXEC sp_executesql @sql;
  PRINT '  mc_ui_column_type updated rows: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

  -- 4) mcgrantbydefault (escludendo Cat 2: mc_id)
  SET @sql = N'
UPDATE tc SET tc.mcgrantbydefault = sec.mcgrantbydefault
FROM ' + QUOTENAME(@target) + N'.dbo._metadati__colonne tc
JOIN ' + QUOTENAME(@target) + N'.dbo._metadati__tabelle tt ON tt.md_id = tc.md_id
JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle set_t ON set_t.mdroutename = tt.mdroutename
JOIN FatturazioneElettronica_Metadata.dbo._metadati__colonne sec ON sec.md_id = set_t.md_id AND sec.mc_nome_colonna = tc.mc_nome_colonna
WHERE (tt.mdroutename LIKE ''% metadati %'' OR tt.mdroutename LIKE ''_metadati%'' OR tt.mdroutename LIKE ''__metadati%'')
  AND ISNULL(tc.mcgrantbydefault,0) <> ISNULL(sec.mcgrantbydefault,0)
  AND NOT (tt.mdroutename = '' metadati  colonne'' AND tc.mc_nome_colonna = ''mc_id'');';
  EXEC sp_executesql @sql;
  PRINT '  mcgrantbydefault updated rows: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

  -- 5) mc_validation_required (escludendo Cat 2: FK_CG_Id)
  SET @sql = N'
UPDATE tc SET tc.mc_validation_required = sec.mc_validation_required
FROM ' + QUOTENAME(@target) + N'.dbo._metadati__colonne tc
JOIN ' + QUOTENAME(@target) + N'.dbo._metadati__tabelle tt ON tt.md_id = tc.md_id
JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle set_t ON set_t.mdroutename = tt.mdroutename
JOIN FatturazioneElettronica_Metadata.dbo._metadati__colonne sec ON sec.md_id = set_t.md_id AND sec.mc_nome_colonna = tc.mc_nome_colonna
WHERE (tt.mdroutename LIKE ''% metadati %'' OR tt.mdroutename LIKE ''_metadati%'' OR tt.mdroutename LIKE ''__metadati%'')
  AND ISNULL(tc.mc_validation_required,0) <> ISNULL(sec.mc_validation_required,0)
  AND NOT (tt.mdroutename = ''_metadati_condition_item'' AND tc.mc_nome_colonna = ''FK_CG_Id'');';
  EXEC sp_executesql @sql;
  PRINT '  mc_validation_required updated rows: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

  FETCH NEXT FROM targets INTO @target;
END
CLOSE targets;
DEALLOCATE targets;

PRINT '';
PRINT '=== Sanity post-fix: residual diffs (excluding the 3 Cat 2 cases) ==='
SELECT 'Kiara' AS db, COUNT(*) AS residual_diffs
FROM Kiara_wuic_new.dbo._metadati__tabelle kt
JOIN Kiara_wuic_new.dbo._metadati__colonne kc ON kc.md_id = kt.md_id
JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle fet ON fet.mdroutename = kt.mdroutename
JOIN FatturazioneElettronica_Metadata.dbo._metadati__colonne fec ON fec.md_id = fet.md_id AND fec.mc_nome_colonna = kc.mc_nome_colonna
WHERE (kt.mdroutename LIKE '% metadati %' OR kt.mdroutename LIKE '_metadati%' OR kt.mdroutename LIKE '__metadati%')
  AND NOT (kt.mdroutename = ' metadati  colonne' AND kc.mc_nome_colonna IN ('mc_logic_cascade_filteringParent','mc_id'))
  AND NOT (kt.mdroutename = '_metadati_condition_item' AND kc.mc_nome_colonna = 'FK_CG_Id')
  AND (
    ISNULL(kc.mchideinedit,0)<>ISNULL(fec.mchideinedit,0)
    OR ISNULL(kc.mchideinlist,0)<>ISNULL(fec.mchideinlist,0)
    OR ISNULL(kc.mc_ui_column_type,'')<>ISNULL(fec.mc_ui_column_type,'')
    OR ISNULL(kc.mcgrantbydefault,0)<>ISNULL(fec.mcgrantbydefault,0)
    OR ISNULL(kc.mc_validation_required,0)<>ISNULL(fec.mc_validation_required,0)
  )
UNION ALL
SELECT 'FlottaMezzi', COUNT(*)
FROM FlottaMezzi_Metadata.dbo._metadati__tabelle fmt
JOIN FlottaMezzi_Metadata.dbo._metadati__colonne fmc ON fmc.md_id = fmt.md_id
JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle fet ON fet.mdroutename = fmt.mdroutename
JOIN FatturazioneElettronica_Metadata.dbo._metadati__colonne fec ON fec.md_id = fet.md_id AND fec.mc_nome_colonna = fmc.mc_nome_colonna
WHERE (fmt.mdroutename LIKE '% metadati %' OR fmt.mdroutename LIKE '_metadati%' OR fmt.mdroutename LIKE '__metadati%')
  AND NOT (fmt.mdroutename = ' metadati  colonne' AND fmc.mc_nome_colonna IN ('mc_logic_cascade_filteringParent','mc_id'))
  AND NOT (fmt.mdroutename = '_metadati_condition_item' AND fmc.mc_nome_colonna = 'FK_CG_Id')
  AND (
    ISNULL(fmc.mchideinedit,0)<>ISNULL(fec.mchideinedit,0)
    OR ISNULL(fmc.mchideinlist,0)<>ISNULL(fec.mchideinlist,0)
    OR ISNULL(fmc.mc_ui_column_type,'')<>ISNULL(fec.mc_ui_column_type,'')
    OR ISNULL(fmc.mcgrantbydefault,0)<>ISNULL(fec.mcgrantbydefault,0)
    OR ISNULL(fmc.mc_validation_required,0)<>ISNULL(fec.mc_validation_required,0)
  );
