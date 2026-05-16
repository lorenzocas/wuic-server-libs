-- =============================================================================
-- Phase I.6 — Upload pipelines CA-aware
-- =============================================================================
-- Replica il pattern legacy `CustomAttributesManager.Register` lato runtime:
-- quando uno xlsx upload trova una colonna che NON corrisponde a una colonna
-- nativa della tabella target, la auto-registra come custom_attribute e popola
-- il custom_value della entity.
--
-- Pattern:
--   1. Upload Excel arriva su staging table (uploads.staging_<route>)
--   2. SP cp.sp_process_upload_with_ca: legge headers staging, classifica
--      ogni colonna come 'native' o 'ca' (controllo contro INFORMATION_SCHEMA)
--   3. Per ogni colonna 'ca': sp_register_custom_attribute (idempotent)
--   4. Per ogni row staging: INSERT/UPDATE entity nativa + INSERT/UPDATE custom_value
--
-- Esempio target route: programs upload con custom columns 'Risk_Level',
-- 'Product_Family' (non in core.program) → auto-registrate + valori inseriti.
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

-- ─── uploads.sp_classify_columns ──────────────────────────────────────────────
-- Input: schema/table target + lista headers staging.
-- Output: row per header con 'is_native' BIT (1=existing column, 0=must become CA).
IF OBJECT_ID(N'[uploads].[sp_classify_columns]', N'P') IS NOT NULL
    DROP PROCEDURE [uploads].[sp_classify_columns];
GO
IF SCHEMA_ID('uploads') IS NULL EXEC('CREATE SCHEMA uploads');
GO
CREATE PROCEDURE [uploads].[sp_classify_columns]
    @target_schema SYSNAME,
    @target_table  SYSNAME,
    @headers_json  NVARCHAR(MAX)         -- JSON array di header name dello xlsx
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @native_cols TABLE (col_name SYSNAME PRIMARY KEY);
    INSERT INTO @native_cols
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @target_schema AND TABLE_NAME = @target_table;

    SELECT
        h.[value] AS header_name,
        CASE WHEN nc.col_name IS NOT NULL THEN 1 ELSE 0 END AS is_native
      FROM OPENJSON(@headers_json) h
      LEFT JOIN @native_cols nc ON nc.col_name = h.[value];
END
GO
PRINT '[91-up] uploads.sp_classify_columns created';
GO

-- ─── uploads.sp_bootstrap_custom_attributes ──────────────────────────────────
-- Input: context + lista (header_name, value_type, has_lookup) per header NON-native.
-- Effetto: chiama core.sp_register_custom_attribute per ognuno (idempotent).
-- Output: nessuno (le definitions sono ora in core.custom_attribute).
IF OBJECT_ID(N'[uploads].[sp_bootstrap_custom_attributes]', N'P') IS NOT NULL
    DROP PROCEDURE [uploads].[sp_bootstrap_custom_attributes];
GO
CREATE PROCEDURE [uploads].[sp_bootstrap_custom_attributes]
    @context VARCHAR(64),
    @attributes_json NVARCHAR(MAX),      -- es '[{"code":"Risk_Level","value_type":"text"},...]'
    @user_id INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @attrs TABLE (code VARCHAR(64), value_type VARCHAR(20), has_lookup BIT);
    INSERT INTO @attrs (code, value_type, has_lookup)
    SELECT
        JSON_VALUE(value, '$.code'),
        ISNULL(JSON_VALUE(value, '$.value_type'), 'text'),
        TRY_CAST(JSON_VALUE(value, '$.has_lookup') AS BIT)
      FROM OPENJSON(@attributes_json);

    DECLARE @code VARCHAR(64), @vt VARCHAR(20), @hl BIT, @new_id INT;
    DECLARE attr_cursor CURSOR LOCAL FAST_FORWARD FOR
      SELECT code, value_type, ISNULL(has_lookup, 0) FROM @attrs;
    OPEN attr_cursor;
    FETCH NEXT FROM attr_cursor INTO @code, @vt, @hl;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [core].[sp_register_custom_attribute]
            @context = @context, @code = @code, @value_type = @vt,
            @has_lookup = @hl, @user_id = @user_id, @new_id = @new_id OUTPUT;
        FETCH NEXT FROM attr_cursor INTO @code, @vt, @hl;
    END
    CLOSE attr_cursor; DEALLOCATE attr_cursor;
END
GO
PRINT '[91-up] uploads.sp_bootstrap_custom_attributes created';
GO

-- ─── uploads.sp_apply_cv_from_staging ────────────────────────────────────────
-- Input: una tabella staging con righe (entity_id, attribute_code, value_text/number/...)
-- Output: INSERT/UPDATE batch su core.custom_value.
-- Pattern: chiamata DOPO sp_bootstrap_custom_attributes (definitions esistono).
IF TYPE_ID(N'[uploads].[tvp_cv_staging]') IS NULL
BEGIN
    CREATE TYPE [uploads].[tvp_cv_staging] AS TABLE (
        entity_id      NVARCHAR(64)  NOT NULL,
        attribute_code VARCHAR(64)   NOT NULL,
        value_text     NVARCHAR(4000) NULL,
        value_number   DECIMAL(19,4) NULL,
        value_date     DATE NULL,
        value_bool     BIT NULL,
        year_num       INT NULL,
        PRIMARY KEY (entity_id, attribute_code)
    );
END
GO

IF OBJECT_ID(N'[uploads].[sp_apply_cv_from_staging]', N'P') IS NOT NULL
    DROP PROCEDURE [uploads].[sp_apply_cv_from_staging];
GO
CREATE PROCEDURE [uploads].[sp_apply_cv_from_staging]
    @entity_schema SYSNAME,
    @entity_name SYSNAME,
    @context VARCHAR(64),
    @staging [uploads].[tvp_cv_staging] READONLY,
    @user_id INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;
    -- MERGE: per ogni (entity_id, attribute_code) cerca custom_value esistente, UPDATE o INSERT
    MERGE [core].[custom_value] AS tgt
    USING (
        SELECT s.entity_id, s.attribute_code, s.value_text, s.value_number, s.value_date, s.value_bool, s.year_num,
               ca.id AS attribute_id
          FROM @staging s
          INNER JOIN [core].[custom_attribute] ca
                  ON ca.context = @context AND ca.code = s.attribute_code
                 AND ISNULL(ca.cancellato, 0) = 0
    ) AS src
       ON tgt.custom_attribute_id = src.attribute_id
      AND tgt.entity_schema = @entity_schema
      AND tgt.entity_name = @entity_name
      AND tgt.entity_id = src.entity_id
      AND ISNULL(tgt.year_num, 0) = ISNULL(src.year_num, 0)
      AND ISNULL(tgt.cancellato, 0) = 0
    WHEN MATCHED THEN
        UPDATE SET value_text = src.value_text,
                   value_number = src.value_number,
                   value_date = src.value_date,
                   value_bool = src.value_bool,
                   data_modifica = SYSUTCDATETIME(),
                   utente_modifica = @user_id
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (custom_attribute_id, entity_schema, entity_name, entity_id,
                value_text, value_number, value_date, value_bool, year_num,
                data_creazione, utente_creazione)
        VALUES (src.attribute_id, @entity_schema, @entity_name, src.entity_id,
                src.value_text, src.value_number, src.value_date, src.value_bool, src.year_num,
                SYSUTCDATETIME(), @user_id);
    COMMIT TRANSACTION;
END
GO
PRINT '[91-up] uploads.sp_apply_cv_from_staging created';
GO

PRINT '[91-up] === Phase I.6 deployed ===';
PRINT '  - uploads.sp_classify_columns (separates native vs CA)';
PRINT '  - uploads.sp_bootstrap_custom_attributes (idempotent register via JSON array)';
PRINT '  - uploads.tvp_cv_staging type';
PRINT '  - uploads.sp_apply_cv_from_staging (MERGE batch)';
GO
