-- =============================================================================
-- CostCnh_Data — xbs schema: hierarchy via HIERARCHYID
-- =============================================================================
-- Sostituisce facts.XBS_Objects (modello rigido 5-level) con una sola tabella
-- a profondita' variabile. Una singola FK `xbs_node_id` su cp.facts invece di
-- 5 colonne Id_XBS_Objects_1..5 + 5 VARBINARY mask.
--
-- Vantaggi:
--   - depth variabile (non piu' hard-coded a 5)
--   - ancestor query in O(log N) via hierarchyid.IsDescendantOf
--   - una FK invece di 5 → join semplificato, FK validation 5x piu' veloce
--   - indici depth-first + breadth-first nativi
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

-- ── xbs.tree_kind (lookup) ───────────────────────────────────────────────────
-- Discriminator per multi-hierarchy (XBS, WBS, OBS, CBS, ...)
IF OBJECT_ID(N'[xbs].[tree_kind]', N'U') IS NULL
BEGIN
    CREATE TABLE [xbs].[tree_kind] (
        id                      TINYINT NOT NULL CONSTRAINT PK_tree_kind PRIMARY KEY CLUSTERED,
        code                    VARCHAR(10) NOT NULL,                          -- XBS / WBS / OBS / CBS
        name                    NVARCHAR(60) NOT NULL,
        description             NVARCHAR(MAX) NULL,
        CONSTRAINT UQ_tree_kind_code UNIQUE (code)
    );
    INSERT INTO [xbs].[tree_kind](id, code, name, description) VALUES
        (1, 'XBS', N'Cost Breakdown Structure', N'Cost categorization (es. material, labor, overhead)'),
        (2, 'WBS', N'Work Breakdown Structure', N'Work decomposition (deliverables, work packages)'),
        (3, 'OBS', N'Organizational Breakdown', N'Org units / responsibility breakdown'),
        (4, 'CBS', N'Calendar Breakdown',     N'Time-based segments (es. quarterly, phase)');
    PRINT '[20-xbs] xbs.tree_kind created + 4 seed rows';
END
GO

-- ── xbs.node ─────────────────────────────────────────────────────────────────
-- Tabella unica per TUTTE le gerarchie. Replace 5-level rigid model.
-- Sample insert pattern:
--   DECLARE @root HIERARCHYID = hierarchyid::GetRoot();   -- '/'
--   DECLARE @l1   HIERARCHYID = @root.GetDescendant(NULL, NULL);   -- '/1/'
--   DECLARE @l2   HIERARCHYID = @l1.GetDescendant(NULL, NULL);     -- '/1/1/'
-- Ancestor query:
--   SELECT * FROM xbs.node WHERE node_path.IsDescendantOf(@ancestor) = 1;
IF OBJECT_ID(N'[xbs].[node]', N'U') IS NULL
BEGIN
    CREATE TABLE [xbs].[node] (
        id                      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_xbs_node PRIMARY KEY NONCLUSTERED,
        public_id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_xbs_node_public_id DEFAULT (NEWSEQUENTIALID()),
        node_path               HIERARCHYID NOT NULL,
        depth                   AS node_path.GetLevel() PERSISTED,
        tree_kind_id            TINYINT NOT NULL CONSTRAINT FK_xbs_node_tree_kind REFERENCES [xbs].[tree_kind](id),
        site_id                 INT NULL CONSTRAINT FK_xbs_node_site REFERENCES [core].[site](id),   -- NULL = global
        program_id              INT NULL CONSTRAINT FK_xbs_node_program REFERENCES [core].[program](id),  -- NULL = template
        code                    VARCHAR(64) NOT NULL,
        name                    NVARCHAR(256) NOT NULL,
        description             NVARCHAR(MAX) NULL,
        is_leaf                 BIT NOT NULL CONSTRAINT DF_xbs_node_is_leaf DEFAULT (0),
        sort_order              INT NOT NULL CONSTRAINT DF_xbs_node_sort_order DEFAULT (0),
        -- 7 audit
        cancellato              BIT NOT NULL CONSTRAINT DF_xbs_node_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_xbs_node_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        sys_start               DATETIME2(3) GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
        sys_end                 DATETIME2(3) GENERATED ALWAYS AS ROW END   HIDDEN NOT NULL,
        PERIOD FOR SYSTEM_TIME (sys_start, sys_end),
        CONSTRAINT UQ_xbs_node_public_id UNIQUE (public_id)
    ) WITH (
        SYSTEM_VERSIONING = ON (
            HISTORY_TABLE = [xbs].[node_history],
            DATA_CONSISTENCY_CHECK = ON
        )
    );

    -- Depth-first traversal (clustered = optimal physical order)
    CREATE UNIQUE CLUSTERED INDEX cix_xbs_node_path ON [xbs].[node](node_path);

    -- Breadth-first (per livello: utile per indented list e aggregation per depth)
    CREATE INDEX ix_xbs_node_breadth ON [xbs].[node](depth, node_path) WHERE cancellato = 0;

    -- Lookup by code dentro (tree_kind, program/site)
    CREATE INDEX ix_xbs_node_code ON [xbs].[node](tree_kind_id, program_id, site_id, code) INCLUDE (id, name) WHERE cancellato = 0;

    -- FK supporting
    CREATE INDEX ix_xbs_node_program ON [xbs].[node](program_id) WHERE cancellato = 0 AND program_id IS NOT NULL;
    CREATE INDEX ix_xbs_node_site ON [xbs].[node](site_id) WHERE cancellato = 0 AND site_id IS NOT NULL;

    PRINT '[20-xbs] xbs.node created with SYSTEM_VERSIONING + hierarchyid clustered index + 4 NC indexes';
END
GO

-- ── xbs.node_attribute (EAV opzionale per attributi sparsi) ──────────────────
-- Sostituisce le legacy decine di colonne `CustomAttributes/CustomValues`
-- quando i valori sono sparsi/dinamici. Per attributi sempre-presenti
-- meglio aggiungere colonne dirette su xbs.node.
IF OBJECT_ID(N'[xbs].[node_attribute]', N'U') IS NULL
BEGIN
    CREATE TABLE [xbs].[node_attribute] (
        node_id                 BIGINT NOT NULL CONSTRAINT FK_xbs_node_attribute_node REFERENCES [xbs].[node](id) ON DELETE CASCADE,
        attribute_code          VARCHAR(64) NOT NULL,
        value_text              NVARCHAR(4000) NULL,
        value_number            DECIMAL(19,4) NULL,
        value_date              DATE NULL,
        value_bool              BIT NULL,
        data_modifica           DATETIME2(3) NOT NULL CONSTRAINT DF_xbs_node_attribute_data_modifica DEFAULT (SYSUTCDATETIME()),
        utente_modifica         INT NULL,
        CONSTRAINT PK_xbs_node_attribute PRIMARY KEY CLUSTERED (node_id, attribute_code)
    );
    PRINT '[20-xbs] xbs.node_attribute created (EAV sparse)';
END
GO

PRINT '[20-xbs-hierarchy] DONE';
GO
