-- =============================================================================
-- Phase I.1 — Custom Attributes full parity (W0.1 = A)
-- =============================================================================
-- Replica architettura 5-layer del legacy Cost_CNH:
--   1. core.custom_attribute            (definitions: context, value_type, flags)
--   2. core.custom_attribute_mapping    (per Site x ProjectClass scoping + time-based)
--   3. core.custom_value (esistente, estesa) — multi-value + year_num + lookup link
--   4. core.custom_lookup               (lookup options + trigger cascade rename)
--   5. core.custom_attribute_permission (per-(mapping, user, action) + value whitelist)
--
-- + core.sp_register_custom_attribute (bootstrap auto-discovery, replace di CustomAttributesManager.Register legacy)
-- + index strategy ottimizzato per il pattern di accesso atteso
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

-- ─── 1. core.custom_attribute (definitions) ───────────────────────────────────
IF OBJECT_ID(N'[core].[custom_attribute]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[custom_attribute] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_custom_attribute PRIMARY KEY CLUSTERED,
        context                 VARCHAR(64) NOT NULL,           -- 'program','project','resource','scenario','xbs_node','program_xbs'
        code                    VARCHAR(64) NOT NULL,           -- attribute code (es. 'Risk_Level','WBS','WT_Manager')
        display_name            NVARCHAR(200) NOT NULL,
        description             NVARCHAR(500) NULL,
        value_type              VARCHAR(20) NOT NULL,           -- 'text','number','date','bool','lookup','currency','structure'
        allow_multiple          BIT NOT NULL CONSTRAINT DF_custom_attribute_multi DEFAULT (0),
        has_lookup              BIT NOT NULL CONSTRAINT DF_custom_attribute_has_lookup DEFAULT (0),
        is_required             BIT NOT NULL CONSTRAINT DF_custom_attribute_required DEFAULT (0),
        is_readonly             BIT NOT NULL CONSTRAINT DF_custom_attribute_readonly DEFAULT (0),
        is_erasable             BIT NOT NULL CONSTRAINT DF_custom_attribute_erasable DEFAULT (1),
        edit_order              INT NOT NULL CONSTRAINT DF_custom_attribute_edit_order DEFAULT (0),
        is_time_based           BIT NOT NULL CONSTRAINT DF_custom_attribute_time_based DEFAULT (0),
        is_rates_available      BIT NOT NULL CONSTRAINT DF_custom_attribute_rates DEFAULT (0),
        mode                    TINYINT NOT NULL CONSTRAINT DF_custom_attribute_mode DEFAULT (0), -- 0=Code+Descr, 1=Code, 2=Descr
        -- Hooks for external system sync (es. BMD)
        external_system         VARCHAR(40) NULL,               -- 'BMD','SAP', NULL = local
        external_code           VARCHAR(80) NULL,
        -- 7 audit
        cancellato              BIT NOT NULL CONSTRAINT DF_custom_attribute_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_custom_attribute_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_custom_attribute_context_code UNIQUE (context, code),
        CONSTRAINT CK_custom_attribute_value_type CHECK (value_type IN ('text','number','date','bool','lookup','currency','structure')),
        CONSTRAINT CK_custom_attribute_mode CHECK (mode IN (0,1,2))
    );
    CREATE INDEX ix_custom_attribute_context ON [core].[custom_attribute](context, cancellato) WHERE cancellato = 0;
    CREATE INDEX ix_custom_attribute_external ON [core].[custom_attribute](external_system, external_code) WHERE external_system IS NOT NULL;
    PRINT '[71-CA] core.custom_attribute created';
END
GO

-- ─── 2. core.custom_attribute_mapping (per Site × ProjectClass scoping) ──────
IF OBJECT_ID(N'[core].[custom_attribute_mapping]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[custom_attribute_mapping] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_custom_attribute_mapping PRIMARY KEY CLUSTERED,
        custom_attribute_id     INT NOT NULL CONSTRAINT FK_cam_attribute REFERENCES [core].[custom_attribute](id),
        site_id                 INT NULL CONSTRAINT FK_cam_site REFERENCES [core].[site](id),
        project_class_id        INT NULL CONSTRAINT FK_cam_project_class REFERENCES [core].[project_class](id),
        tree_kind_id            TINYINT NULL CONSTRAINT FK_cam_tree_kind REFERENCES [xbs].[tree_kind](id),
        label_loc               NVARCHAR(200) NULL,            -- override del display_name per questo scope (es. localizzazione site-specific)
        is_required_override    BIT NULL,                       -- override is_required del custom_attribute
        is_readonly_override    BIT NULL,
        year_from               INT NULL,
        year_to                 INT NULL,
        time_based_ref          NVARCHAR(80) NULL,             -- ref a entita' temporale (es. 'program.year')
        is_visible              BIT NOT NULL CONSTRAINT DF_cam_visible DEFAULT (1),
        edit_order_override     INT NULL,
        -- 7 audit
        cancellato              BIT NOT NULL CONSTRAINT DF_cam_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_cam_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_cam_unique UNIQUE (custom_attribute_id, site_id, project_class_id, tree_kind_id)
    );
    -- Fast lookup: "dato il custom_attribute_id, in quale scope (site/class) e' visibile?"
    CREATE INDEX ix_cam_attribute ON [core].[custom_attribute_mapping](custom_attribute_id) WHERE cancellato = 0;
    -- Fast resolve: "per questo site+project_class, quali CA sono visibili?"
    CREATE INDEX ix_cam_scope ON [core].[custom_attribute_mapping](site_id, project_class_id, tree_kind_id, custom_attribute_id) WHERE cancellato = 0 AND is_visible = 1;
    PRINT '[71-CA] core.custom_attribute_mapping created';
END
GO

-- ─── 3. core.custom_value (re-create con extension: multi-value + year + ref_object) ─
-- NB: drop esistente perche' UNIQUE constraint impedisce multi-value
IF OBJECT_ID(N'[core].[custom_value]', N'U') IS NOT NULL
BEGIN
    DROP TABLE [core].[custom_value];
    PRINT '[71-CA] core.custom_value (legacy minimal) dropped';
END
GO

CREATE TABLE [core].[custom_value] (
    id                      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_custom_value PRIMARY KEY CLUSTERED,
    custom_attribute_id     INT NOT NULL CONSTRAINT FK_cv_attribute REFERENCES [core].[custom_attribute](id),
    entity_schema           SYSNAME NOT NULL,
    entity_name             SYSNAME NOT NULL,
    entity_id               NVARCHAR(64) NOT NULL,
    -- Polymorphic value cols
    value_text              NVARCHAR(4000) NULL,
    value_number            DECIMAL(19,4) NULL,
    value_date              DATE NULL,
    value_bool              BIT NULL,
    -- Lookup link
    custom_lookup_id        INT NULL,                          -- FK aggiunto dopo CREATE custom_lookup
    -- Time-based / ref-based
    year_num                INT NULL,                          -- NULL = non time-based
    ref_object_id           UNIQUEIDENTIFIER NULL,             -- ref polymorphic (es. xbs_node, project_scenario)
    -- 7 audit
    cancellato              BIT NOT NULL CONSTRAINT DF_cv_cancellato DEFAULT (0),
    data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_cv_data_creazione DEFAULT (SYSUTCDATETIME()),
    utente_creazione        INT NULL,
    data_modifica           DATETIME2(3) NULL,
    utente_modifica         INT NULL,
    data_eliminazione       DATETIME2(3) NULL,
    utente_eliminazione     INT NULL
);

-- NO UNIQUE su (entity, attribute): permette allow_multiple=1 + time-based.
-- L'unicita' logica è enforced a livello applicativo se allow_multiple=0.

-- Fast lookup primario: "dato (entity, attribute), trova value/i"
CREATE INDEX ix_cv_entity_attr
    ON [core].[custom_value](entity_schema, entity_name, entity_id, custom_attribute_id)
    INCLUDE (value_text, value_number, value_date, value_bool, custom_lookup_id, year_num)
    WHERE cancellato = 0
    WITH (DATA_COMPRESSION = PAGE);

-- Fast lookup: "tutti i CV di un attribute" (per CA-cleanup, reporting cross-entity)
CREATE INDEX ix_cv_attribute
    ON [core].[custom_value](custom_attribute_id, entity_schema, entity_name)
    WHERE cancellato = 0
    WITH (DATA_COMPRESSION = PAGE);

-- Time-based scan
CREATE INDEX ix_cv_year
    ON [core].[custom_value](custom_attribute_id, year_num)
    WHERE cancellato = 0 AND year_num IS NOT NULL;

-- Lookup-id JOIN
CREATE INDEX ix_cv_lookup
    ON [core].[custom_value](custom_lookup_id, custom_attribute_id)
    WHERE cancellato = 0 AND custom_lookup_id IS NOT NULL;

PRINT '[71-CA] core.custom_value (full parity) re-created with 4 NC indexes';
GO

-- ─── 4. core.custom_lookup (lookup options + cascade trigger) ────────────────
IF OBJECT_ID(N'[core].[custom_lookup]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[custom_lookup] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_custom_lookup PRIMARY KEY CLUSTERED,
        custom_attribute_id     INT NOT NULL CONSTRAINT FK_cl_attribute REFERENCES [core].[custom_attribute](id),
        code                    NVARCHAR(80) NOT NULL,         -- es. 'HIGH'
        value                   NVARCHAR(400) NOT NULL,        -- es. 'High risk'
        descr                   NVARCHAR(1000) NULL,           -- es. 'Risk level critical, requires CEO approval'
        sort_order              INT NOT NULL CONSTRAINT DF_cl_sort DEFAULT (0),
        is_active               BIT NOT NULL CONSTRAINT DF_cl_active DEFAULT (1),
        -- External sync (BMD)
        external_id             NVARCHAR(80) NULL,
        -- 7 audit
        cancellato              BIT NOT NULL CONSTRAINT DF_cl_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_cl_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_cl_attr_code UNIQUE (custom_attribute_id, code)
    );
    CREATE INDEX ix_cl_attribute ON [core].[custom_lookup](custom_attribute_id, is_active, sort_order) WHERE cancellato = 0;
    PRINT '[71-CA] core.custom_lookup created';
END
GO

-- Aggiunge FK su custom_value.custom_lookup_id ora che custom_lookup esiste
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_cv_lookup'
)
BEGIN
    ALTER TABLE [core].[custom_value]
        ADD CONSTRAINT FK_cv_lookup FOREIGN KEY (custom_lookup_id) REFERENCES [core].[custom_lookup](id);
    PRINT '[71-CA] FK custom_value.custom_lookup_id added';
END
GO

-- Trigger cascade rename: quando si modifica custom_lookup.value/descr, aggiorna
-- denormalizzato value_text in custom_value (per CV che linkano via custom_lookup_id).
IF OBJECT_ID(N'[core].[tr_custom_lookup_cascade_rename]', N'TR') IS NOT NULL
    DROP TRIGGER [core].[tr_custom_lookup_cascade_rename];
GO
CREATE TRIGGER [core].[tr_custom_lookup_cascade_rename]
ON [core].[custom_lookup]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(value) AND NOT UPDATE(descr) RETURN;

    UPDATE cv SET
        cv.value_text = i.value,
        cv.data_modifica = SYSUTCDATETIME()
    FROM [core].[custom_value] cv
    INNER JOIN inserted i ON cv.custom_lookup_id = i.id
    WHERE ISNULL(cv.cancellato, 0) = 0;
END
GO
PRINT '[71-CA] tr_custom_lookup_cascade_rename created';
GO

-- ─── 5. core.custom_attribute_permission ──────────────────────────────────────
IF OBJECT_ID(N'[core].[custom_attribute_permission]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[custom_attribute_permission] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_cap PRIMARY KEY CLUSTERED,
        custom_attribute_mapping_id INT NOT NULL CONSTRAINT FK_cap_mapping REFERENCES [core].[custom_attribute_mapping](id),
        user_id                 INT NULL,                       -- NULL = applies to all users
        role_code               NVARCHAR(50) NULL,              -- NULL = applies to all roles
        action                  VARCHAR(20) NOT NULL,           -- 'read','write','delete'
        value_whitelist_json    NVARCHAR(MAX) NULL,             -- JSON array di custom_lookup.code consentiti (NULL = all)
        cancellato              BIT NOT NULL CONSTRAINT DF_cap_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_cap_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        CONSTRAINT CK_cap_action CHECK (action IN ('read','write','delete'))
    );
    CREATE INDEX ix_cap_mapping_user ON [core].[custom_attribute_permission](custom_attribute_mapping_id, user_id) WHERE cancellato = 0;
    CREATE INDEX ix_cap_mapping_role ON [core].[custom_attribute_permission](custom_attribute_mapping_id, role_code) WHERE cancellato = 0 AND role_code IS NOT NULL;
    PRINT '[71-CA] core.custom_attribute_permission created';
END
GO

-- ─── 6. core.sp_register_custom_attribute (bootstrap auto-discovery) ─────────
IF OBJECT_ID(N'[core].[sp_register_custom_attribute]', N'P') IS NOT NULL
    DROP PROCEDURE [core].[sp_register_custom_attribute];
GO
CREATE PROCEDURE [core].[sp_register_custom_attribute]
    @context VARCHAR(64),
    @code VARCHAR(64),
    @value_type VARCHAR(20) = 'text',
    @display_name NVARCHAR(200) = NULL,
    @has_lookup BIT = 0,
    @allow_multiple BIT = 0,
    @is_required BIT = 0,
    @user_id INT = NULL,
    @new_id INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- Idempotent: se gia' presente con stesso (context, code) ritorna l'id esistente
    SELECT @new_id = id
      FROM [core].[custom_attribute]
     WHERE context = @context AND code = @code AND ISNULL(cancellato, 0) = 0;
    IF @new_id IS NOT NULL RETURN;

    INSERT INTO [core].[custom_attribute] (
        context, code, display_name, value_type,
        has_lookup, allow_multiple, is_required,
        data_creazione, utente_creazione
    ) VALUES (
        @context, @code, ISNULL(@display_name, @code), @value_type,
        @has_lookup, @allow_multiple, @is_required,
        SYSUTCDATETIME(), @user_id
    );
    SET @new_id = SCOPE_IDENTITY();
END
GO
PRINT '[71-CA] core.sp_register_custom_attribute created';
GO

-- ─── 7. core.fn_resolve_custom_attributes (inline TVF) ───────────────────────
-- Ritorna la lista degli attribute applicabili a una entity in uno scope (site, project_class).
-- USAGE: SELECT * FROM core.fn_resolve_custom_attributes('program', NULL, NULL, NULL);
IF OBJECT_ID(N'[core].[fn_resolve_custom_attributes]', N'IF') IS NOT NULL
    DROP FUNCTION [core].[fn_resolve_custom_attributes];
GO
CREATE FUNCTION [core].[fn_resolve_custom_attributes] (
    @context VARCHAR(64),
    @site_id INT = NULL,
    @project_class_id INT = NULL,
    @tree_kind_id TINYINT = NULL
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT
        ca.id              AS attribute_id,
        ca.context,
        ca.code,
        ca.display_name,
        ca.description,
        ca.value_type,
        ca.allow_multiple,
        ca.has_lookup,
        ca.is_required,
        ca.is_readonly,
        ca.edit_order,
        ca.is_time_based,
        ca.mode,
        ca.external_system,
        ca.external_code,
        cam.id             AS mapping_id,
        cam.label_loc,
        cam.year_from,
        cam.year_to,
        cam.is_visible,
        ISNULL(cam.edit_order_override, ca.edit_order) AS effective_order
      FROM [core].[custom_attribute] ca
      LEFT JOIN [core].[custom_attribute_mapping] cam
             ON cam.custom_attribute_id = ca.id
            AND ISNULL(cam.cancellato, 0) = 0
            AND (cam.site_id IS NULL OR cam.site_id = @site_id)
            AND (cam.project_class_id IS NULL OR cam.project_class_id = @project_class_id)
            AND (cam.tree_kind_id IS NULL OR cam.tree_kind_id = @tree_kind_id)
     WHERE ca.context = @context
       AND ISNULL(ca.cancellato, 0) = 0
       AND ISNULL(cam.is_visible, 1) = 1;
GO
PRINT '[71-CA] core.fn_resolve_custom_attributes (inline TVF) created';
GO

-- ─── 8. core.fn_get_custom_values (inline TVF: leggi i CV per una entity) ────
IF OBJECT_ID(N'[core].[fn_get_custom_values]', N'IF') IS NOT NULL
    DROP FUNCTION [core].[fn_get_custom_values];
GO
CREATE FUNCTION [core].[fn_get_custom_values] (
    @entity_schema SYSNAME,
    @entity_name SYSNAME,
    @entity_id NVARCHAR(64),
    @year_num INT = NULL
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT
        cv.id           AS cv_id,
        ca.id           AS attribute_id,
        ca.code         AS attribute_code,
        ca.display_name AS attribute_label,
        ca.value_type,
        ca.has_lookup,
        ca.allow_multiple,
        cv.value_text,
        cv.value_number,
        cv.value_date,
        cv.value_bool,
        cv.custom_lookup_id,
        cl.code         AS lookup_code,
        cl.value        AS lookup_value,
        cl.descr        AS lookup_descr,
        cv.year_num,
        cv.ref_object_id
      FROM [core].[custom_value] cv
      INNER JOIN [core].[custom_attribute] ca ON ca.id = cv.custom_attribute_id AND ISNULL(ca.cancellato, 0) = 0
      LEFT JOIN [core].[custom_lookup] cl ON cl.id = cv.custom_lookup_id AND ISNULL(cl.cancellato, 0) = 0
     WHERE cv.entity_schema = @entity_schema
       AND cv.entity_name = @entity_name
       AND cv.entity_id = @entity_id
       AND ISNULL(cv.cancellato, 0) = 0
       AND (@year_num IS NULL OR cv.year_num IS NULL OR cv.year_num = @year_num);
GO
PRINT '[71-CA] core.fn_get_custom_values (inline TVF) created';
GO

PRINT '[71-CA] === Phase I.1 part 1 (custom attributes) deployed ===';
PRINT '  - core.custom_attribute (definitions)';
PRINT '  - core.custom_attribute_mapping (site x class scoping)';
PRINT '  - core.custom_value (multi-value + time-based, 4 NC indexes)';
PRINT '  - core.custom_lookup (+ cascade trigger)';
PRINT '  - core.custom_attribute_permission';
PRINT '  - core.sp_register_custom_attribute';
PRINT '  - core.fn_resolve_custom_attributes (inline TVF)';
PRINT '  - core.fn_get_custom_values (inline TVF)';
GO
