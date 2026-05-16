-- Revert del hot-patch diagnostico: ripristina `*ngIf="getMetaColumn('codice') as editField"`.
USE FatturazioneElettronica_Metadata;
GO

DECLARE @t NVARCHAR(MAX) = (SELECT mdedittemplate FROM dbo._metadati__tabelle WHERE mdroutename = 'fornitori');
DECLARE @needle NVARCHAR(200) = '*ngIf="true as editField"';
DECLARE @repl NVARCHAR(200) = '*ngIf="getMetaColumn(''codice'') as editField"';
PRINT 'before len=' + CAST(LEN(@t) AS NVARCHAR);
PRINT 'needle pos=' + CAST(CHARINDEX(@needle, @t) AS NVARCHAR);

DECLARE @n NVARCHAR(MAX) = REPLACE(@t, @needle, @repl);
UPDATE dbo._metadati__tabelle SET mdedittemplate = @n WHERE mdroutename = 'fornitori';

SELECT LEN(mdedittemplate) AS new_len,
       CHARINDEX('getMetaColumn(''codice'') as editField', mdedittemplate) AS orig_pos,
       CHARINDEX('true as editField', mdedittemplate) AS diag_pos_after_revert
FROM dbo._metadati__tabelle WHERE mdroutename = 'fornitori';
GO
