SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.sp_global_search', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_global_search;
GO

CREATE PROCEDURE dbo.sp_global_search
    @q NVARCHAR(200),
    @top INT = 5
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @qLike NVARCHAR(202) = N'%' + ISNULL(@q, '') + N'%';
    IF LEN(ISNULL(@q,'')) < 2 RETURN;

    DECLARE @results TABLE (
        entity_type NVARCHAR(40), id INT, primary_label NVARCHAR(500),
        secondary_label NVARCHAR(500), route NVARCHAR(100), score INT
    );

    INSERT INTO @results
    SELECT TOP (@top) 'cliente', id, ragione_sociale,
           ISNULL(codice + N' • ' + ISNULL(partita_iva, N''), codice),
           'clienti',
           CASE WHEN codice LIKE @qLike THEN 100
                WHEN ragione_sociale LIKE @qLike THEN 80 ELSE 50 END
    FROM dbo.clienti
    WHERE ISNULL(cancellato,0)=0
      AND (codice LIKE @qLike OR ragione_sociale LIKE @qLike OR partita_iva LIKE @qLike)
    ORDER BY CASE WHEN codice LIKE @qLike THEN 100
                  WHEN ragione_sociale LIKE @qLike THEN 80 ELSE 50 END DESC;

    INSERT INTO @results
    SELECT TOP (@top) 'fornitore', id, ragione_sociale,
           ISNULL(codice + N' • ' + ISNULL(partita_iva, N''), codice),
           'fornitori',
           CASE WHEN codice LIKE @qLike THEN 100
                WHEN ragione_sociale LIKE @qLike THEN 80 ELSE 50 END
    FROM dbo.fornitori
    WHERE ISNULL(cancellato,0)=0
      AND (codice LIKE @qLike OR ragione_sociale LIKE @qLike OR partita_iva LIKE @qLike)
    ORDER BY CASE WHEN codice LIKE @qLike THEN 100
                  WHEN ragione_sociale LIKE @qLike THEN 80 ELSE 50 END DESC;

    INSERT INTO @results
    SELECT TOP (@top) 'fattura_inviata', f.id,
           ISNULL(f.numero, N'#' + CAST(f.id AS NVARCHAR(20))),
           ISNULL(c.ragione_sociale, N'') + N' • ' + ISNULL(f.causale, N''),
           'fatture_inviate',
           CASE WHEN f.numero LIKE @qLike THEN 100
                WHEN f.causale LIKE @qLike THEN 70 ELSE 50 END
    FROM dbo.fatture_inviate f
    LEFT JOIN dbo.clienti c ON c.id = f.cliente_id
    WHERE ISNULL(f.cancellato,0)=0
      AND (f.numero LIKE @qLike OR f.causale LIKE @qLike)
    ORDER BY CASE WHEN f.numero LIKE @qLike THEN 100
                  WHEN f.causale LIKE @qLike THEN 70 ELSE 50 END DESC;

    INSERT INTO @results
    SELECT TOP (@top) 'preventivo', p.id,
           ISNULL(p.numero, N'#' + CAST(p.id AS NVARCHAR(20))),
           ISNULL(c.ragione_sociale, N'') + N' • ' + ISNULL(p.oggetto, N''),
           'preventivi',
           CASE WHEN p.numero LIKE @qLike THEN 100
                WHEN p.oggetto LIKE @qLike THEN 70 ELSE 50 END
    FROM dbo.preventivi p
    LEFT JOIN dbo.clienti c ON c.id = p.cliente_id
    WHERE ISNULL(p.cancellato,0)=0
      AND (p.numero LIKE @qLike OR p.oggetto LIKE @qLike)
    ORDER BY CASE WHEN p.numero LIKE @qLike THEN 100
                  WHEN p.oggetto LIKE @qLike THEN 70 ELSE 50 END DESC;

    SELECT entity_type, id, primary_label, secondary_label, route, score
    FROM @results
    ORDER BY score DESC, entity_type;
END;
GO

PRINT 'sp_global_search creata.';
GO
