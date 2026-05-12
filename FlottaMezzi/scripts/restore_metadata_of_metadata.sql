SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Restore visibility (mchideinedit) + widget type (mc_ui_column_type) on the
-- metadata-of-metadata system routes (` metadati  tabelle` and ` metadati  colonne`)
-- from FatturazioneElettronica_Metadata as canonical source.
-- Causa probabile: scaffolding manuale post-clone ha alterato i flag.

DECLARE @routes TABLE (route NVARCHAR(200));
INSERT INTO @routes VALUES (' metadati  tabelle'), (' metadati  colonne');

-- 1) mchideinedit
UPDATE fm
SET fm.mchideinedit = fe.mchideinedit
FROM FlottaMezzi_Metadata.dbo._metadati__colonne fm
JOIN FlottaMezzi_Metadata.dbo._metadati__tabelle fmt ON fmt.md_id = fm.md_id
JOIN @routes r ON r.route = fmt.mdroutename
JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle fet ON fet.mdroutename = fmt.mdroutename
JOIN FatturazioneElettronica_Metadata.dbo._metadati__colonne fe ON fe.md_id = fet.md_id AND fe.mc_nome_colonna = fm.mc_nome_colonna
WHERE ISNULL(fm.mchideinedit, 0) <> ISNULL(fe.mchideinedit, 0);

-- 2) mc_ui_column_type (catches md_props_bag → code_editor, ecc.)
UPDATE fm
SET fm.mc_ui_column_type = fe.mc_ui_column_type
FROM FlottaMezzi_Metadata.dbo._metadati__colonne fm
JOIN FlottaMezzi_Metadata.dbo._metadati__tabelle fmt ON fmt.md_id = fm.md_id
JOIN @routes r ON r.route = fmt.mdroutename
JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle fet ON fet.mdroutename = fmt.mdroutename
JOIN FatturazioneElettronica_Metadata.dbo._metadati__colonne fe ON fe.md_id = fet.md_id AND fe.mc_nome_colonna = fm.mc_nome_colonna
WHERE ISNULL(fm.mc_ui_column_type, '') <> ISNULL(fe.mc_ui_column_type, '');

-- Sanity post-fix
SELECT 'visible_in_edit' AS metric, COUNT(*) AS n
FROM FlottaMezzi_Metadata.dbo._metadati__colonne c
JOIN FlottaMezzi_Metadata.dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename IN (' metadati  tabelle',' metadati  colonne') AND ISNULL(c.mchideinedit,0)=0;
