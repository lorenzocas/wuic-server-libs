-- =============================================================================
-- Phase I.5 — PowerEdit CA facets dynamic columns
-- =============================================================================
-- Permette di esporre come "facet aggiuntivo" del PowerEdit grid le measure
-- numeriche custom (es. "ROI", "Margin %") definite come custom_attribute
-- con value_type='number' e context='xbs_node' o 'program_xbs'.
--
-- Pattern: per ogni CA registered nel context, la SP load aggiunge una colonna
-- aggregata SUM(value_number) per (program, year, xbs_node). Il client può
-- richiedere quali CA facet aggiungere via @ca_facet_codes_json.
--
-- LIMITATION: i CA facet aggiuntivi NON sono materializzati in cp.facts_pivot
-- (sarebbe esplosione cardinality). Restano on-the-fly via JOIN.
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

-- ─── cp.sp_load_power_edit_with_ca_facets ─────────────────────────────────────
-- Wrapper di sp_load_power_edit che aggiunge N colonne dinamiche CA facet.
-- Ritorna 2 result set:
--   (1) standard pivot rows (come sp_load_power_edit)
--   (2) CA facet values: 1 row per (xbs_node_id, attribute_code, value_number)
-- Il client può fare LEFT JOIN client-side per visualizzare CA come colonne aggiuntive.
IF OBJECT_ID(N'[cp].[sp_load_power_edit_with_ca_facets]', N'P') IS NOT NULL
    DROP PROCEDURE [cp].[sp_load_power_edit_with_ca_facets];
GO
CREATE PROCEDURE [cp].[sp_load_power_edit_with_ca_facets]
    @program_id INT,
    @year_num INT,
    @ca_facet_codes_json NVARCHAR(MAX) = NULL,   -- es. '["ROI","Margin"]'
    @project_scenario_id INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Result set 1: standard pivot
    EXEC [cp].[sp_load_power_edit]
        @program_id = @program_id,
        @year_num = @year_num,
        @project_scenario_id = @project_scenario_id;

    -- Result set 2: CA facet values (solo se richiesti)
    IF @ca_facet_codes_json IS NULL OR @ca_facet_codes_json = '' RETURN;

    DECLARE @ca_codes TABLE (code VARCHAR(64) PRIMARY KEY);
    INSERT INTO @ca_codes (code)
    SELECT value FROM OPENJSON(@ca_facet_codes_json);

    -- Risolvi attribute_id per i code richiesti
    DECLARE @ca_ids TABLE (attribute_id INT, code VARCHAR(64), value_type VARCHAR(20));
    INSERT INTO @ca_ids
    SELECT ca.id, ca.code, ca.value_type
      FROM [core].[custom_attribute] ca
      INNER JOIN @ca_codes c ON c.code = ca.code
     WHERE ca.context IN ('xbs_node', 'program_xbs', 'program')
       AND ISNULL(ca.cancellato, 0) = 0;

    -- Per ogni leaf xbs_node nel scope (program, year), aggrega CV
    -- (entity_schema='xbs', entity_name='node', entity_id=xbs_node_id).
    SELECT
        fp.xbs_node_id,
        ca.attribute_id,
        ca.code AS attribute_code,
        ca.value_type,
        SUM(ISNULL(cv.value_number, 0)) AS value_number_sum,
        MAX(cv.value_text) AS value_text_first,
        COUNT(*) AS cv_count
      FROM [cp].[facts_pivot] fp
      INNER JOIN @ca_ids ca ON 1 = 1
      LEFT JOIN [core].[custom_value] cv
             ON cv.custom_attribute_id = ca.attribute_id
            AND cv.entity_schema = 'xbs'
            AND cv.entity_name = 'node'
            AND cv.entity_id = CAST(fp.xbs_node_id AS NVARCHAR(64))
            AND ISNULL(cv.cancellato, 0) = 0
            AND (cv.year_num IS NULL OR cv.year_num = @year_num)
     WHERE fp.program_id = @program_id
       AND fp.year_num = @year_num
       AND fp.is_leaf = 1   -- facet solo per leaf (no rollup)
     GROUP BY fp.xbs_node_id, ca.attribute_id, ca.code, ca.value_type;
END
GO
PRINT '[97-I.5] cp.sp_load_power_edit_with_ca_facets (CV facet wrapper) created';
GO

-- ─── cp.sp_save_power_edit_ca_facet (save CV value for xbs_node from PowerEdit) ─
IF OBJECT_ID(N'[cp].[sp_save_power_edit_ca_facet]', N'P') IS NOT NULL
    DROP PROCEDURE [cp].[sp_save_power_edit_ca_facet];
GO
CREATE PROCEDURE [cp].[sp_save_power_edit_ca_facet]
    @xbs_node_id BIGINT,
    @attribute_code VARCHAR(64),
    @year_num INT = NULL,
    @value_number DECIMAL(19,4) = NULL,
    @value_text NVARCHAR(4000) = NULL,
    @user_id INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @attribute_id INT;
    SELECT @attribute_id = id FROM [core].[custom_attribute]
     WHERE code = @attribute_code AND ISNULL(cancellato, 0) = 0;
    IF @attribute_id IS NULL
    BEGIN
        RAISERROR('Custom attribute code not found: %s', 16, 1, @attribute_code);
        RETURN;
    END

    -- UPSERT sul CV (entity = xbs.node)
    MERGE [core].[custom_value] AS tgt
    USING (SELECT @attribute_id AS aid, @xbs_node_id AS xnid, @year_num AS yr) AS src
       ON tgt.custom_attribute_id = src.aid
      AND tgt.entity_schema = 'xbs'
      AND tgt.entity_name = 'node'
      AND tgt.entity_id = CAST(src.xnid AS NVARCHAR(64))
      AND ISNULL(tgt.year_num, 0) = ISNULL(src.yr, 0)
      AND ISNULL(tgt.cancellato, 0) = 0
    WHEN MATCHED THEN
        UPDATE SET value_number = @value_number, value_text = @value_text,
                   data_modifica = SYSUTCDATETIME(), utente_modifica = @user_id
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (custom_attribute_id, entity_schema, entity_name, entity_id,
                value_number, value_text, year_num, data_creazione, utente_creazione)
        VALUES (@attribute_id, 'xbs', 'node', CAST(@xbs_node_id AS NVARCHAR(64)),
                @value_number, @value_text, @year_num, SYSUTCDATETIME(), @user_id);
END
GO
PRINT '[97-I.5] cp.sp_save_power_edit_ca_facet (UPSERT custom_value for xbs.node) created';
GO

PRINT '[97-I.5] === Phase I.5 deployed ===';
PRINT '  - cp.sp_load_power_edit_with_ca_facets (wrapper + 2nd result set CV facet)';
PRINT '  - cp.sp_save_power_edit_ca_facet (UPSERT CV for xbs.node from PowerEdit)';
GO
