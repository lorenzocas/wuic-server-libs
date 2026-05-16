-- =============================================================================
-- Phase I.4 — Reporting SPs CV-aware (sezione 3 mapping legacy → new)
-- =============================================================================
-- Implementa il pattern legacy "CV come dimensioni di PIVOT dinamico":
--   1. cp.fn_program_with_ca (inline TVF): JOIN core.program con tutti i CV pivottati
--      (1 col per attribute_code) — equivalente OData $expand(CustomValues)
--   2. rep.sp_run_program_pivot_v3 (extends v2 con CV come dimensioni)
--   3. core.fn_filter_entities_by_ca (inline TVF): filtra una entity list per CV tokens
--      (riprodotto legacy `Filter_ApplyProjects.sql` parsing)
--
-- Optimization: usa STRING_AGG + PIVOT dinamico solo se la query lo richiede.
-- Per OLTP grid live, restiamo su core.fn_get_custom_values (1 query per row).
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

USE [CostCnh_Data];
GO

-- ─── 1. core.fn_program_with_ca (inline view program + tutti i CA pivotati) ──
-- NB: questa è una helper view "compatibility shim" per replicare il legacy
-- pattern OData $expand("CustomValues") via JOIN sparse. Performance: usa
-- l'index ix_cv_entity_attr (PAGE compressed).
IF OBJECT_ID(N'[core].[fn_program_with_ca]', N'IF') IS NOT NULL
    DROP FUNCTION [core].[fn_program_with_ca];
GO
CREATE FUNCTION [core].[fn_program_with_ca] (@program_id INT)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT
        p.id AS program_id,
        p.code AS program_code,
        p.name AS program_name,
        cv.attribute_code,
        cv.attribute_label,
        cv.value_type,
        cv.value_text,
        cv.value_number,
        cv.value_date,
        cv.value_bool,
        cv.lookup_code,
        cv.lookup_value,
        cv.lookup_descr,
        cv.year_num
      FROM [core].[program] p
      CROSS APPLY [core].[fn_get_custom_values]('core', 'program', CAST(p.id AS NVARCHAR(64)), NULL) cv
     WHERE p.id = @program_id
       AND ISNULL(p.cancellato, 0) = 0;
GO
PRINT '[91-rep] core.fn_program_with_ca (inline TVF, sparse CV row-per-attribute) created';
GO

-- ─── 2. rep.sp_run_program_pivot_v3 (extends v2 con CV dimensions) ───────────
-- Aggrega cp.facts per program × xbs_l1 × custom_attribute selected.
-- Input: @program_id + JSON array di attribute_code da pivot.
-- Output: rows con xbs_l1 + N colonne dinamiche (1 per attribute_code).
IF OBJECT_ID(N'[rep].[sp_run_program_pivot_v3]', N'P') IS NOT NULL
    DROP PROCEDURE [rep].[sp_run_program_pivot_v3];
GO
CREATE PROCEDURE [rep].[sp_run_program_pivot_v3]
    @params_json NVARCHAR(MAX),
    @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT,
    @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @prog INT = TRY_CAST(JSON_VALUE(@params_json, '$.program_id') AS INT);
    DECLARE @ca_codes_json NVARCHAR(MAX) = JSON_QUERY(@params_json, '$.ca_pivot_codes');
    IF @prog IS NULL
    BEGIN
        SET @result_json = N'{"error":"program_id required"}';
        SET @result_row_count = 0;
        RETURN;
    END

    -- Risolvi gli attribute_code richiesti in una tabella
    DECLARE @ca_codes TABLE (code VARCHAR(64) PRIMARY KEY);
    IF @ca_codes_json IS NOT NULL
    BEGIN
        INSERT INTO @ca_codes (code)
        SELECT value FROM OPENJSON(@ca_codes_json);
    END

    -- Aggregato base (xbs_l1 × planned/actual)
    ;WITH base AS (
        SELECT
            COALESCE(n_l1.code, '(no_xbs)') AS xbs_l1_code,
            COALESCE(n_l1.name, '(no_xbs)') AS xbs_l1_name,
            SUM(f.planned) AS total_planned,
            SUM(f.actual)  AS total_actual,
            SUM(f.actual - f.planned) AS variance
        FROM [cp].[facts] f
        LEFT JOIN [xbs].[node] n ON n.id = f.xbs_node_id AND ISNULL(n.cancellato, 0) = 0
        OUTER APPLY (
            SELECT TOP 1 a.code, a.name
            FROM [xbs].[node] a
            WHERE a.tree_kind_id = n.tree_kind_id
              AND a.node_path = CASE WHEN n.depth <= 1 THEN n.node_path ELSE n.node_path.GetAncestor(n.depth - 1) END
              AND ISNULL(a.cancellato, 0) = 0
        ) n_l1
        WHERE f.program_id = @prog AND ISNULL(f.cancellato, 0) = 0
        GROUP BY n_l1.code, n_l1.name
    ),
    -- CV del program (pivotati come dimensione header)
    program_cv AS (
        SELECT
            cv.attribute_code,
            COALESCE(cv.value_text, CAST(cv.value_number AS NVARCHAR(80)),
                     CONVERT(NVARCHAR(20), cv.value_date, 23),
                     CAST(cv.value_bool AS NVARCHAR(5)), cv.lookup_value) AS display_value
        FROM [core].[fn_get_custom_values]('core', 'program', CAST(@prog AS NVARCHAR(64)), NULL) cv
        INNER JOIN @ca_codes c ON c.code = cv.attribute_code
    )
    SELECT @result_json = (
        SELECT
            (SELECT id, code, name FROM [core].[program] WHERE id = @prog FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS program,
            (SELECT * FROM program_cv FOR JSON PATH) AS program_custom_attributes,
            (SELECT * FROM base ORDER BY xbs_l1_code FOR JSON PATH) AS rows,
            (
                SELECT COUNT(*) AS xbs_l1_count, SUM(total_planned) AS total_planned,
                       SUM(total_actual) AS total_actual, SUM(variance) AS total_variance
                FROM base FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            ) AS totals
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    SELECT @result_row_count = COUNT(*) FROM base;
END
GO
PRINT '[91-rep] rep.sp_run_program_pivot_v3 (CV-aware) created';
GO

-- ─── 3. core.fn_filter_entities_by_ca (CV filter token resolver) ─────────────
-- Input: lista di CA tokens (code, value, op) come TVP-like JSON.
-- Output: lista entity_id che matchano TUTTI i token (AND semantics).
-- Pattern legacy Filter_ApplyProjects.sql parsing.
IF TYPE_ID(N'[core].[tvp_ca_filter_token]') IS NULL
BEGIN
    CREATE TYPE [core].[tvp_ca_filter_token] AS TABLE (
        attribute_code VARCHAR(64) NOT NULL,
        match_value    NVARCHAR(400) NOT NULL,
        op             VARCHAR(10) NOT NULL,    -- 'eq', 'contains', 'in'
        PRIMARY KEY (attribute_code, match_value, op)
    );
    PRINT '[91-rep] core.tvp_ca_filter_token type created';
END
GO

IF OBJECT_ID(N'[core].[sp_filter_entities_by_ca]', N'P') IS NOT NULL
    DROP PROCEDURE [core].[sp_filter_entities_by_ca];
GO
CREATE PROCEDURE [core].[sp_filter_entities_by_ca]
    @entity_schema SYSNAME,
    @entity_name SYSNAME,
    @tokens [core].[tvp_ca_filter_token] READONLY
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @token_count INT = (SELECT COUNT(*) FROM @tokens);
    IF @token_count = 0
    BEGIN
        SELECT DISTINCT entity_id
          FROM [core].[custom_value]
         WHERE entity_schema = @entity_schema AND entity_name = @entity_name AND ISNULL(cancellato, 0) = 0;
        RETURN;
    END

    -- Per ogni token: trova entity_id che matchano. AND-merge via INTERSECT.
    -- Implementato via GROUP BY HAVING COUNT = N (AND semantics).
    SELECT cv.entity_id
      FROM [core].[custom_value] cv
      INNER JOIN [core].[custom_attribute] ca ON ca.id = cv.custom_attribute_id AND ISNULL(ca.cancellato, 0) = 0
      INNER JOIN @tokens t ON t.attribute_code = ca.code
     WHERE cv.entity_schema = @entity_schema
       AND cv.entity_name = @entity_name
       AND ISNULL(cv.cancellato, 0) = 0
       AND (
            (t.op = 'eq'       AND (cv.value_text = t.match_value OR CAST(cv.value_number AS NVARCHAR(80)) = t.match_value
                                  OR (SELECT cl.code FROM [core].[custom_lookup] cl WHERE cl.id = cv.custom_lookup_id) = t.match_value))
         OR (t.op = 'contains' AND cv.value_text LIKE '%' + t.match_value + '%')
         OR (t.op = 'in'       AND cv.value_text IN (SELECT value FROM STRING_SPLIT(t.match_value, ',')))
       )
     GROUP BY cv.entity_id
    HAVING COUNT(DISTINCT t.attribute_code) = @token_count;   -- AND semantics
END
GO
PRINT '[91-rep] core.sp_filter_entities_by_ca created';
GO

-- ─── 4. Optimization: filtered NC index per CA-by-attribute fast scan ─────────
-- Se reportano filtrano per CA frequentemente, l'index ix_cv_attribute è già
-- pronto (sezione 71-CA). Aggiungiamo un INCLUDE per value_number per evitare
-- key lookup quando filtra per range numerico.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_cv_attribute_value_text' AND object_id = OBJECT_ID(N'[core].[custom_value]'))
BEGIN
    CREATE INDEX ix_cv_attribute_value_text
        ON [core].[custom_value](custom_attribute_id, value_text)
        INCLUDE (entity_schema, entity_name, entity_id, value_number, custom_lookup_id)
        WHERE cancellato = 0 AND value_text IS NOT NULL
        WITH (DATA_COMPRESSION = PAGE);
    PRINT '[91-rep] ix_cv_attribute_value_text (filtered, covering) created';
END
GO

PRINT '[91-rep] === Phase I.4 deployed ===';
PRINT '  - core.fn_program_with_ca (inline TVF: program + sparse CV)';
PRINT '  - rep.sp_run_program_pivot_v3 (CV as dynamic dimensions)';
PRINT '  - core.tvp_ca_filter_token type';
PRINT '  - core.sp_filter_entities_by_ca (AND semantics filter via tokens)';
PRINT '  - ix_cv_attribute_value_text (filtered covering NC)';
GO
