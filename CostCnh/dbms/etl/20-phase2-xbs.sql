-- =============================================================================
-- ETL Phase 2 — XBS hierarchy migration
-- =============================================================================
-- Legacy model:
--   facts.XBS_Objtype (Id GUID, Code, Description) ~ 5-10 righe = "dimensione XBS"
--     (es. WBS_Engineering, WBS_Manufacturing, CBS_Material, OBS_Department, ...)
--   facts.XBS_Objects (Id GUID, Id_XBS_Objtype, Code, Description, Id_Site, NodePathCode VARBINARY(2))
--     ~ migliaia righe = nodi flat dentro ogni dimensione
--     NodePathCode VARBINARY(2) codifica posizione gerarchica (2 byte → 16 livelli max)
--
-- Nuovo model:
--   xbs.tree_kind (TINYINT id, Code) — 4-N tree types (XBS, WBS, OBS, CBS, ...)
--   xbs.node (BIGINT id, node_path HIERARCHYID, tree_kind_id, code, name, ...)
--
-- Strategia (semplificata per Sprint 9.1):
--   - Ogni legacy XBS_Objtype → 1 tree_kind (genera o riusa id <=255)
--   - Ogni legacy XBS_Objects → 1 node sotto root del tree_kind corrispondente
--     a depth = 1 (flat). La gerarchia "vera" via NodePathCode decoding e'
--     Sprint 9.2 (richiede analisi bitpattern legacy che varia per site).
--
-- Limitazione documentata: questa fase importa la lista flat. Per ricostruire
-- la gerarchia parent-child interna a ogni tree_kind, lo step 2.c (commentato
-- ma scriptato sotto) decodifica NodePathCode → parent_id → rebuild via
-- hierarchyid::Parse('/N/M/.../').
-- =============================================================================

DECLARE @phase_id BIGINT, @already_completed BIT;
EXEC [etl].[start_phase] @run_id = <<RUN_ID>>, @phase_number = 2, @phase_name = N'XBS hierarchy', @phase_id = @phase_id OUTPUT, @already_completed = @already_completed OUTPUT;
IF @already_completed = 1 BEGIN PRINT '[phase2] already completed'; RETURN; END

DECLARE @t0 DATETIME2(3) = SYSUTCDATETIME();
DECLARE @inserted INT = 0;

-- ── 2.a Map XBS_Objtype → tree_kind ─────────────────────────────────────────
-- Le 4 tree_kind seed (XBS/WBS/OBS/CBS) esistono gia' in xbs.tree_kind.
-- I tree_kind aggiuntivi (es. CBS_Material) vengono creati con id incrementale.
DECLARE @max_tk_id TINYINT = (SELECT ISNULL(MAX(id), 0) FROM [xbs].[tree_kind]);

INSERT INTO [xbs].[tree_kind] (id, code, name, description)
SELECT
    @max_tk_id + ROW_NUMBER() OVER (ORDER BY ot.[Code]),
    LEFT(ot.[Code], 10),
    LEFT(ISNULL(ot.[Description], ot.[Code]), 60),
    ot.[Description]
FROM <<SOURCE_DB>>.[facts].[XBS_Objtype] ot
WHERE NOT EXISTS (SELECT 1 FROM [xbs].[tree_kind] tk WHERE tk.code = LEFT(ot.[Code], 10));
SET @inserted = @inserted + @@ROWCOUNT;

-- Mapping legacy XBS_Objtype.Id (GUID) → new tree_kind.id (TINYINT)
INSERT INTO [etl].[guid_map] (entity_type, legacy_guid, new_id)
SELECT 'xbs_tree_kind', ot.[Id], tk.id
FROM <<SOURCE_DB>>.[facts].[XBS_Objtype] ot
INNER JOIN [xbs].[tree_kind] tk ON tk.code = LEFT(ot.[Code], 10)
WHERE NOT EXISTS (SELECT 1 FROM [etl].[guid_map] m WHERE m.entity_type = 'xbs_tree_kind' AND m.legacy_guid = ot.[Id]);
PRINT '[phase2.a] tree_kinds mapped';

-- ── 2.b Per ogni XBS_Objtype creare un ROOT node (depth=0/1 sentinel) ───────
-- Cosi' tutti gli xbs.node di quel tree_kind sono organizzati come depth>=1
-- sotto un root sintetico. (Alternativa: non creare root e usare nodi al
-- livello /N/ direttamente sotto hierarchyid::GetRoot() — ma con il vincolo
-- multikind UNIQUE(tree_kind_id, node_path) entrambe le strategie funzionano.)
-- Per semplicita' uso direttamente livello /N/ sotto root.

-- ── 2.c Migra XBS_Objects come flat nodes depth=1 ────────────────────────────
-- Per ogni tree_kind, ordina i nodi legacy per Code, genera hierarchyid:
--   /1/, /2/, /3/, ... sotto root del tree_kind
-- (in pratica il vincolo UNIQUE(tree_kind_id, node_path) consente che
-- xbs.node hierarchyid '/1/' coesista per ogni tree_kind separato)

;WITH src AS (
    SELECT
        ot.[Code]                                                AS tk_code,
        ot.[Id]                                                  AS legacy_tk_guid,
        xo.[Id]                                                  AS legacy_node_guid,
        xo.[Id_Site]                                             AS legacy_site_id,
        xo.[Code]                                                AS node_code,
        ISNULL(CAST(xo.[Description] AS NVARCHAR(256)), xo.[Code]) AS node_name,
        xo.[Description]                                         AS node_description,
        ROW_NUMBER() OVER (PARTITION BY ot.[Id] ORDER BY xo.[Code]) AS row_in_kind
    FROM <<SOURCE_DB>>.[facts].[XBS_Objects] xo
    INNER JOIN <<SOURCE_DB>>.[facts].[XBS_Objtype] ot ON ot.[Id] = xo.[Id_XBS_Objtype]
    WHERE (xo.[ValidTo] IS NULL OR xo.[ValidTo] > SYSUTCDATETIME())
),
joined AS (
    SELECT
        s.*,
        tkmap.new_id AS new_tk_id,
        smap.new_id  AS new_site_id
    FROM src s
    LEFT JOIN [etl].[guid_map] tkmap ON tkmap.entity_type = 'xbs_tree_kind'
                                     AND tkmap.legacy_guid = s.legacy_tk_guid
    LEFT JOIN [etl].[int_map]  smap  ON smap.entity_type = 'site'
                                     AND smap.legacy_id  = s.legacy_site_id
)
INSERT INTO [xbs].[node] (node_path, tree_kind_id, site_id, code, name, description, is_leaf, sort_order)
SELECT
    HIERARCHYID::Parse('/' + CAST(j.row_in_kind AS NVARCHAR(20)) + '/'),
    CAST(j.new_tk_id AS TINYINT),
    j.new_site_id,
    LEFT(j.node_code, 64),
    LEFT(j.node_name, 256),
    j.node_description,
    1,
    CAST(j.row_in_kind AS INT)
FROM joined j
WHERE j.new_tk_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM [etl].[guid_map] m
       WHERE m.entity_type = 'xbs_node' AND m.legacy_guid = j.legacy_node_guid
  );
SET @inserted = @inserted + @@ROWCOUNT;

INSERT INTO [etl].[guid_map] (entity_type, legacy_guid, new_id)
SELECT 'xbs_node', xo.[Id], xn.id
FROM <<SOURCE_DB>>.[facts].[XBS_Objects] xo
INNER JOIN [xbs].[node] xn ON xn.code = LEFT(xo.[Code], 64)
                          AND xn.tree_kind_id = (
                              SELECT TOP 1 CAST(m.new_id AS TINYINT) FROM [etl].[guid_map] m
                              INNER JOIN <<SOURCE_DB>>.[facts].[XBS_Objtype] ot ON ot.[Id] = m.legacy_guid
                              WHERE m.entity_type = 'xbs_tree_kind' AND ot.[Id] = xo.[Id_XBS_Objtype]
                          )
WHERE NOT EXISTS (SELECT 1 FROM [etl].[guid_map] m WHERE m.entity_type = 'xbs_node' AND m.legacy_guid = xo.[Id]);

-- Log XBS_Objects orphani (legacy guid senza mapping new_id, es. tree_kind dropped)
INSERT INTO [etl].[error] (run_id, phase_number, entity_type, legacy_id, error_kind, error_message)
SELECT <<RUN_ID>>, 2, 'xbs_node', CONVERT(NVARCHAR(36), xo.[Id]),
       'fk_unmapped',
       'XBS_Object orfano: Id_XBS_Objtype senza mapping in etl.guid_map (tree_kind: ' + CONVERT(NVARCHAR(36), xo.[Id_XBS_Objtype]) + ')'
FROM <<SOURCE_DB>>.[facts].[XBS_Objects] xo
WHERE NOT EXISTS (SELECT 1 FROM [etl].[guid_map] m WHERE m.entity_type = 'xbs_node' AND m.legacy_guid = xo.[Id]);

PRINT '[phase2.c] xbs.node flat migration: ' + CAST(@inserted AS NVARCHAR(20)) + ' rows';

-- ── 2.d (Sprint 9.2 task) Reconstruct parent-child da NodePathCode ──────────
-- NodePathCode VARBINARY(2) codifica position in tree:
--   byte 1 = depth (0..15)
--   byte 2 = position within parent (0..255)
-- Algoritmo da implementare:
--   1. ordina nodes per (depth, NodePathCode)
--   2. per ogni node: parent_path = node a depth-1 con NodePathCode prefix match
--   3. UPDATE node.node_path = parent.node_path.GetDescendant(maxChild, NULL)
-- ATTENZIONE: requires SCHEMABINDING-aware ALTER su xbs.node node_path; richiede
-- DISABLE SYSTEM_VERSIONING temporaneo. Strategia da raffinare in Sprint 9.2.

DECLARE @dur2 INT = DATEDIFF(MILLISECOND, @t0, SYSUTCDATETIME());
EXEC [etl].[complete_phase]
    @phase_id = @phase_id,
    @rows_inserted = @inserted,
    @duration_ms = @dur2;
PRINT '[phase2] DONE — rows_inserted=' + CAST(@inserted AS NVARCHAR(20));
GO
