-- DIAG hot patch: replace `*ngIf="getMetaColumn('codice') as editField"` with `*ngIf="true as editField"`
-- to isolate whether the NgIf+as syntax fails or it's getMetaColumn return value related.
USE FatturazioneElettronica_Metadata;
GO

DECLARE @t NVARCHAR(MAX) = (SELECT mdedittemplate FROM dbo._metadati__tabelle WHERE mdroutename = 'fornitori');
DECLARE @needle NVARCHAR(200) = '*ngIf="getMetaColumn(''codice'') as editField"';
DECLARE @repl NVARCHAR(200) = '*ngIf="true as editField"';
PRINT 'before len=' + CAST(LEN(@t) AS NVARCHAR);
PRINT 'needle pos=' + CAST(CHARINDEX(@needle, @t) AS NVARCHAR);

DECLARE @n NVARCHAR(MAX) = REPLACE(@t, @needle, @repl);
UPDATE dbo._metadati__tabelle SET mdedittemplate = @n WHERE mdroutename = 'fornitori';

SELECT LEN(mdedittemplate) AS new_len,
       CHARINDEX('true as editField', mdedittemplate) AS true_pos,
       CHARINDEX(@needle, mdedittemplate) AS orig_pos_after_replace
FROM dbo._metadati__tabelle WHERE mdroutename = 'fornitori';
GO
