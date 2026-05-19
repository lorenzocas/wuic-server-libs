-- =============================================================================
-- ETL 97 — Legacy CustomAttributes / Values / Lookup / Mapping / Permission
-- =============================================================================
-- AGGIORNATO 2026-05-16 dopo Phase I.1 (CA full parity 5-layer):
--   1. core.custom_attribute        ← legacy core.CustomAttributes
--   2. core.custom_attribute_mapping ← legacy core.CustomAttributesMapping
--   3. core.custom_lookup           ← legacy core.CustomLookup
--   4. core.custom_value (multi)    ← legacy core.CustomValues + N entity-link tables
--   5. core.custom_attribute_permission ← legacy core.CustomAttributesMappingPermissionsUsers
--
-- Naming convention: usa etl.int_map (allineato a framework ETL). Sostituito
-- ETL._id_map_<entity> con WHERE etl.int_map.entity_type = <entity>.
--
-- Placeholders:
--   <<RUN_ID>>     — int, etl.run.id corrente
--   <<SOURCE_DB>>  — es. [Cost_Offhighway_Test]
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

DECLARE @phase_id BIGINT, @already_completed BIT;
EXEC [etl].[start_phase] @run_id = <<RUN_ID>>, @phase_number = 97,
     @phase_name = N'Custom Attributes / Values / Lookup',
     @phase_id = @phase_id OUTPUT, @already_completed = @already_completed OUTPUT;
IF @already_completed = 1
BEGIN
    PRINT '[phase97] already completed (run_id=<<RUN_ID>>) — skipping';
    RETURN;
END

DECLARE @t0 DATETIME2(3) = SYSUTCDATETIME();
DECLARE @inserted INT = 0;

-- Probe: source DB ha le CustomAttributes tables? Se no, complete_phase con 0 rows.
IF NOT EXISTS (
    SELECT 1 FROM <<SOURCE_DB>>.sys.tables t
    INNER JOIN <<SOURCE_DB>>.sys.schemas s ON s.schema_id = t.schema_id
    WHERE s.name = 'core' AND t.name = 'CustomAttributes'
)
BEGIN
    PRINT '[97] source has no core.CustomAttributes — skipping CA migration entirely';
    INSERT INTO [etl].[error] (run_id, phase_number, entity_type, legacy_id, error_kind, error_message)
    VALUES (<<RUN_ID>>, 97, 'custom_attribute', '0', 'missing_source',
            'Source DB has no core.CustomAttributes table. CA migration skipped (no legacy data).');
    EXEC [etl].[complete_phase] @phase_id = @phase_id, @rows_inserted = 0;
    PRINT '[phase97] DONE (no source data)';
    RETURN;
END

-- ─── 1. CustomAttributes ──────────────────────────────────────────────────────
PRINT '[97] Step 1 — core.CustomAttributes → core.custom_attribute';

INSERT INTO [core].[custom_attribute] (
    context, code, display_name, description, value_type,
    allow_multiple, has_lookup, is_required, is_readonly, is_erasable,
    edit_order, mode, external_system, external_code,
    data_creazione, utente_creazione
)
SELECT
    LOWER(src.[Context]),
    src.[Id],
    ISNULL(src.[Name], src.[Id]),
    src.[Descr],
    CASE src.[ValueType]
        WHEN 'varchar'        THEN 'text'
        WHEN 'smalldatetime'  THEN 'date'
        WHEN 'number'         THEN 'number'
        WHEN 'boolean'        THEN 'bool'
        WHEN 'currency'       THEN 'currency'
        WHEN 'structure'      THEN 'structure'
        ELSE 'text'
    END,
    ISNULL(src.[AllowMultipleValues], 0),
    ISNULL(src.[HasLookup], 0),
    ISNULL(src.[IsRequired], 0),
    ISNULL(src.[Readonly], 0),
    ISNULL(src.[Erasable], 1),
    ISNULL(src.[EditOrder], 0),
    0,                                                 -- mode default (Code+Descr)
    'BMD',                                             -- external system reference
    src.[Id],                                          -- external_code = legacy Id
    SYSUTCDATETIME(), 1
FROM <<SOURCE_DB>>.[core].[CustomAttributes] src
WHERE NOT EXISTS (
    SELECT 1 FROM [core].[custom_attribute] tgt
     WHERE tgt.context = LOWER(src.[Context]) AND tgt.code = src.[Id]
);
SET @inserted = @inserted + @@ROWCOUNT;

-- Map (Context, Id_legacy) → custom_attribute.id (BIGINT in int_map per uniformità)
INSERT INTO [etl].[int_map] (entity_type, legacy_id, new_id)
SELECT 'custom_attribute',
       CAST(CHECKSUM(src.[Context] + ':' + src.[Id]) AS BIGINT) AS legacy_id_hash,
       ca.id
FROM <<SOURCE_DB>>.[core].[CustomAttributes] src
INNER JOIN [core].[custom_attribute] ca ON ca.context = LOWER(src.[Context]) AND ca.code = src.[Id]
WHERE NOT EXISTS (
    SELECT 1 FROM [etl].[int_map] m
     WHERE m.entity_type = 'custom_attribute'
       AND m.legacy_id = CAST(CHECKSUM(src.[Context] + ':' + src.[Id]) AS BIGINT)
);

PRINT CONCAT('  CustomAttributes migrated: ', @inserted, ' rows');

-- ─── 2. CustomAttributesMapping (per Site × ProjectClass scoping) ─────────────
PRINT '[97] Step 2 — core.CustomAttributesMapping → core.custom_attribute_mapping';
SET @inserted = 0;

INSERT INTO [core].[custom_attribute_mapping] (
    custom_attribute_id, site_id, project_class_id, tree_kind_id,
    label_loc, is_required_override, is_readonly_override,
    year_from, year_to, time_based_ref, is_visible, edit_order_override,
    data_creazione, utente_creazione
)
SELECT
    ca.id,
    site_map.new_id,                                   -- mapped legacy site → new site_id (NULL se non mapped)
    class_map.new_id,                                  -- mapped legacy project_class → new project_class_id
    NULL,                                              -- tree_kind_id legacy non aveva mapping su mapping (XBS_Reltype era post-Mapping)
    src.[Label],
    src.[IsRequiredOverride],
    src.[ReadonlyOverride],
    src.[YearFrom],
    src.[YearTo],
    src.[TimeBasedRef],
    ISNULL(src.[IsVisible], 1),
    src.[EditOrderOverride],
    SYSUTCDATETIME(), 1
FROM <<SOURCE_DB>>.[core].[CustomAttributesMapping] src
INNER JOIN <<SOURCE_DB>>.[core].[CustomAttributes] csrc ON csrc.[Id] = src.[CustomAttribute_Id]
INNER JOIN [core].[custom_attribute] ca ON ca.context = LOWER(csrc.[Context]) AND ca.code = csrc.[Id]
LEFT JOIN [etl].[int_map] site_map ON site_map.entity_type = 'site' AND site_map.legacy_id = src.[Id_Site]
LEFT JOIN [etl].[int_map] class_map ON class_map.entity_type = 'project_class' AND class_map.legacy_id = src.[Id_ProjectClass]
WHERE NOT EXISTS (
    SELECT 1 FROM [core].[custom_attribute_mapping] tgt
     WHERE tgt.custom_attribute_id = ca.id
       AND ISNULL(tgt.site_id, -1) = ISNULL(site_map.new_id, -1)
       AND ISNULL(tgt.project_class_id, -1) = ISNULL(class_map.new_id, -1)
);
SET @inserted = @@ROWCOUNT;

-- Map (legacy Mapping.Id) → new mapping.id
INSERT INTO [etl].[int_map] (entity_type, legacy_id, new_id)
SELECT 'custom_attribute_mapping', src.[Id], cam.id
FROM <<SOURCE_DB>>.[core].[CustomAttributesMapping] src
INNER JOIN <<SOURCE_DB>>.[core].[CustomAttributes] csrc ON csrc.[Id] = src.[CustomAttribute_Id]
INNER JOIN [core].[custom_attribute] ca ON ca.context = LOWER(csrc.[Context]) AND ca.code = csrc.[Id]
LEFT JOIN [etl].[int_map] site_map ON site_map.entity_type = 'site' AND site_map.legacy_id = src.[Id_Site]
LEFT JOIN [etl].[int_map] class_map ON class_map.entity_type = 'project_class' AND class_map.legacy_id = src.[Id_ProjectClass]
INNER JOIN [core].[custom_attribute_mapping] cam
        ON cam.custom_attribute_id = ca.id
       AND ISNULL(cam.site_id, -1) = ISNULL(site_map.new_id, -1)
       AND ISNULL(cam.project_class_id, -1) = ISNULL(class_map.new_id, -1)
WHERE NOT EXISTS (SELECT 1 FROM [etl].[int_map] m WHERE m.entity_type = 'custom_attribute_mapping' AND m.legacy_id = src.[Id]);

PRINT CONCAT('  CustomAttributesMapping migrated: ', @inserted, ' rows');

-- ─── 3. CustomLookup ──────────────────────────────────────────────────────────
PRINT '[97] Step 3 — core.CustomLookup → core.custom_lookup';
SET @inserted = 0;

INSERT INTO [core].[custom_lookup] (
    custom_attribute_id, code, value, descr, sort_order, external_id,
    data_creazione, utente_creazione
)
SELECT
    ca.id, src.[Code], src.[Value], src.[Descr],
    ISNULL(src.[SortOrder], 0),
    CAST(src.[Id] AS NVARCHAR(80)),
    SYSUTCDATETIME(), 1
FROM <<SOURCE_DB>>.[core].[CustomLookup] src
INNER JOIN [core].[custom_attribute] ca
        ON ca.context = LOWER(src.[Context]) AND ca.code = src.[Code]
WHERE NOT EXISTS (
    SELECT 1 FROM [core].[custom_lookup] tgt
     WHERE tgt.custom_attribute_id = ca.id AND tgt.code = src.[Code]
);
SET @inserted = @@ROWCOUNT;

INSERT INTO [etl].[int_map] (entity_type, legacy_id, new_id)
SELECT 'custom_lookup', src.[Id], cl.id
FROM <<SOURCE_DB>>.[core].[CustomLookup] src
INNER JOIN [core].[custom_attribute] ca
        ON ca.context = LOWER(src.[Context]) AND ca.code = src.[Code]
INNER JOIN [core].[custom_lookup] cl
        ON cl.custom_attribute_id = ca.id AND cl.code = src.[Code]
WHERE NOT EXISTS (SELECT 1 FROM [etl].[int_map] m WHERE m.entity_type = 'custom_lookup' AND m.legacy_id = src.[Id]);

PRINT CONCAT('  CustomLookup migrated: ', @inserted, ' rows');

-- ─── 4. CustomValues + N entity-link tables ───────────────────────────────────
-- Pattern: per ogni link table legacy, JOIN su CustomValues + JOIN etl.int_map
-- per risolvere legacy entity_id (INT/GUID) in new entity_id (varia per tabella).
PRINT '[97] Step 4 — core.CustomValues + 5 entity-link tables';
SET @inserted = 0;

-- 4a) ProgramCustomValues → entity_schema='core', entity_name='program'
INSERT INTO [core].[custom_value] (
    custom_attribute_id, entity_schema, entity_name, entity_id,
    value_text, value_number, value_date, value_bool, custom_lookup_id,
    year_num, ref_object_id,
    data_creazione, utente_creazione
)
SELECT
    ca.id, 'core', 'program', CAST(prog_map.new_id AS NVARCHAR(64)),
    src.[Value], src.[DecimalValue], NULL, NULL,
    cl.id, src.[RefYear], src.[RefObject],
    SYSUTCDATETIME(), 1
FROM <<SOURCE_DB>>.[core].[ProgramCustomValues] pcv
INNER JOIN <<SOURCE_DB>>.[core].[CustomValues] src ON src.[Id] = pcv.[IdCustomValue]
INNER JOIN <<SOURCE_DB>>.[core].[CustomAttributes] cal ON cal.[Id] = src.[IdCustomAttributes]
INNER JOIN [core].[custom_attribute] ca ON ca.context = LOWER(cal.[Context]) AND ca.code = cal.[Id]
LEFT JOIN [core].[custom_lookup] cl ON cl.custom_attribute_id = ca.id AND cl.code = src.[Value]
INNER JOIN [etl].[int_map] prog_map ON prog_map.entity_type = 'program' AND prog_map.legacy_id = pcv.[IdProgram];
SET @inserted = @inserted + @@ROWCOUNT;

-- 4b) HumanResourcesCustomValues → entity_schema='wf', entity_name='resource'
INSERT INTO [core].[custom_value] (
    custom_attribute_id, entity_schema, entity_name, entity_id,
    value_text, value_number, custom_lookup_id, year_num, ref_object_id,
    data_creazione, utente_creazione
)
SELECT
    ca.id, 'wf', 'resource', CAST(res_map.new_id AS NVARCHAR(64)),
    src.[Value], src.[DecimalValue], cl.id, src.[RefYear], src.[RefObject],
    SYSUTCDATETIME(), 1
FROM <<SOURCE_DB>>.[core].[HumanResourcesCustomValues] hrcv
INNER JOIN <<SOURCE_DB>>.[core].[CustomValues] src ON src.[Id] = hrcv.[IdCustomValue]
INNER JOIN <<SOURCE_DB>>.[core].[CustomAttributes] cal ON cal.[Id] = src.[IdCustomAttributes]
INNER JOIN [core].[custom_attribute] ca ON ca.context = LOWER(cal.[Context]) AND ca.code = cal.[Id]
LEFT JOIN [core].[custom_lookup] cl ON cl.custom_attribute_id = ca.id AND cl.code = src.[Value]
INNER JOIN [etl].[int_map] res_map ON res_map.entity_type = 'resource' AND res_map.legacy_id = hrcv.[IdHumanResource];
SET @inserted = @inserted + @@ROWCOUNT;

-- 4c) ProjectScenarioCustomValues → entity_schema='core', entity_name='project_scenario'
INSERT INTO [core].[custom_value] (
    custom_attribute_id, entity_schema, entity_name, entity_id,
    value_text, value_number, custom_lookup_id, year_num, ref_object_id,
    data_creazione, utente_creazione
)
SELECT
    ca.id, 'core', 'project_scenario', CAST(scn_map.new_id AS NVARCHAR(64)),
    src.[Value], src.[DecimalValue], cl.id, src.[RefYear], src.[RefObject],
    SYSUTCDATETIME(), 1
FROM <<SOURCE_DB>>.[core].[ProjectScenarioCustomValues] pscv
INNER JOIN <<SOURCE_DB>>.[core].[CustomValues] src ON src.[Id] = pscv.[IdCustomValue]
INNER JOIN <<SOURCE_DB>>.[core].[CustomAttributes] cal ON cal.[Id] = src.[IdCustomAttributes]
INNER JOIN [core].[custom_attribute] ca ON ca.context = LOWER(cal.[Context]) AND ca.code = cal.[Id]
LEFT JOIN [core].[custom_lookup] cl ON cl.custom_attribute_id = ca.id AND cl.code = src.[Value]
INNER JOIN [etl].[int_map] scn_map ON scn_map.entity_type = 'project_scenario' AND scn_map.legacy_id = pscv.[IdProjectScenario];
SET @inserted = @inserted + @@ROWCOUNT;

-- 4d) XBS_ObjectsCustomValues → entity_schema='xbs', entity_name='node'
INSERT INTO [core].[custom_value] (
    custom_attribute_id, entity_schema, entity_name, entity_id,
    value_text, value_number, custom_lookup_id, year_num, ref_object_id,
    data_creazione, utente_creazione
)
SELECT
    ca.id, 'xbs', 'node', CAST(xn_map.new_id AS NVARCHAR(64)),
    src.[Value], src.[DecimalValue], cl.id, src.[RefYear], src.[RefObject],
    SYSUTCDATETIME(), 1
FROM <<SOURCE_DB>>.[facts].[XBS_ObjectsCustomValues] xocv
INNER JOIN <<SOURCE_DB>>.[core].[CustomValues] src ON src.[Id] = xocv.[IdCustomValue]
INNER JOIN <<SOURCE_DB>>.[core].[CustomAttributes] cal ON cal.[Id] = src.[IdCustomAttributes]
INNER JOIN [core].[custom_attribute] ca ON ca.context = LOWER(cal.[Context]) AND ca.code = cal.[Id]
LEFT JOIN [core].[custom_lookup] cl ON cl.custom_attribute_id = ca.id AND cl.code = src.[Value]
INNER JOIN [etl].[int_map] xn_map ON xn_map.entity_type = 'xbs_node' AND xn_map.legacy_id = xocv.[IdXBSObject];
SET @inserted = @inserted + @@ROWCOUNT;

-- 4e) Programs_XBS_ObjectsCustomValues → entity_schema='core', entity_name='program_xbs_node'
--     entity_id = composite "program_id:xbs_node_id" (notation custom per junction 3-way)
INSERT INTO [core].[custom_value] (
    custom_attribute_id, entity_schema, entity_name, entity_id,
    value_text, value_number, custom_lookup_id, year_num, ref_object_id,
    data_creazione, utente_creazione
)
SELECT
    ca.id, 'core', 'program_xbs_node',
    CONCAT(prog_map.new_id, ':', xn_map.new_id),
    src.[Value], src.[DecimalValue], cl.id, src.[RefYear], src.[RefObject],
    SYSUTCDATETIME(), 1
FROM <<SOURCE_DB>>.[facts].[Programs_XBS_ObjectsCustomValues] pxcv
INNER JOIN <<SOURCE_DB>>.[core].[CustomValues] src ON src.[Id] = pxcv.[IdCustomValue]
INNER JOIN <<SOURCE_DB>>.[core].[CustomAttributes] cal ON cal.[Id] = src.[IdCustomAttributes]
INNER JOIN [core].[custom_attribute] ca ON ca.context = LOWER(cal.[Context]) AND ca.code = cal.[Id]
LEFT JOIN [core].[custom_lookup] cl ON cl.custom_attribute_id = ca.id AND cl.code = src.[Value]
INNER JOIN [etl].[int_map] prog_map ON prog_map.entity_type = 'program' AND prog_map.legacy_id = pxcv.[IdProgram]
INNER JOIN [etl].[int_map] xn_map ON xn_map.entity_type = 'xbs_node' AND xn_map.legacy_id = pxcv.[IdXBSObject];
SET @inserted = @inserted + @@ROWCOUNT;

PRINT CONCAT('  CustomValues migrated total: ', @inserted, ' rows across 5 entity types');

-- ─── 5. CustomAttributesMappingPermissionsUsers ───────────────────────────────
PRINT '[97] Step 5 — core.CustomAttributesMappingPermissionsUsers → core.custom_attribute_permission';
SET @inserted = 0;

-- NB: presuppone etl.int_map populato con entity_type='user' (deve essere generato
-- da una Phase precedente — vedi 10-phase1-anagrafica step utenti).
-- Se user_map non c'è per qualche row, applichiamo NULL user_id (= permission applies to all users).
-- Audit le righe skippate via etl.error.
INSERT INTO [core].[custom_attribute_permission] (
    custom_attribute_mapping_id, user_id, role_code, action,
    value_whitelist_json, data_creazione, utente_creazione
)
SELECT
    map_map.new_id,
    user_map.new_id,                                   -- NULL se user non mappato (= all users)
    NULL,                                              -- role_code: legacy ha user_id only
    LOWER(src.[Action]),
    -- legacy whitelist via ProgramsPermissions sub-table: serializza come JSON array
    (SELECT JSON_QUERY('[' + STRING_AGG('"' + STRING_ESCAPE(pp.[Value], 'json') + '"', ',') + ']')
       FROM <<SOURCE_DB>>.[core].[CustomAttributesMappingProgramsPermissions] pp
       WHERE pp.[Id_PermissionUser] = src.[Id]) AS value_whitelist_json,
    SYSUTCDATETIME(), 1
FROM <<SOURCE_DB>>.[core].[CustomAttributesMappingPermissionsUsers] src
INNER JOIN [etl].[int_map] map_map ON map_map.entity_type = 'custom_attribute_mapping' AND map_map.legacy_id = src.[Id_Mapping]
LEFT JOIN [etl].[int_map] user_map ON user_map.entity_type = 'user' AND user_map.legacy_id = src.[Id_User]
WHERE NOT EXISTS (
    SELECT 1 FROM [core].[custom_attribute_permission] tgt
     WHERE tgt.custom_attribute_mapping_id = map_map.new_id
       AND ISNULL(tgt.user_id, -1) = ISNULL(user_map.new_id, -1)
       AND tgt.action = LOWER(src.[Action])
);
SET @inserted = @@ROWCOUNT;

-- Audit rows con user non risolto
INSERT INTO [etl].[error] (run_id, phase_number, entity_type, legacy_id, error_kind, error_message)
SELECT <<RUN_ID>>, 97, 'custom_attribute_permission',
       CAST(src.[Id] AS NVARCHAR(100)), 'fk_unmapped',
       CONCAT('user_id ', src.[Id_User], ' not mapped in etl.int_map → permission applied to all users (NULL user_id)')
FROM <<SOURCE_DB>>.[core].[CustomAttributesMappingPermissionsUsers] src
LEFT JOIN [etl].[int_map] user_map ON user_map.entity_type = 'user' AND user_map.legacy_id = src.[Id_User]
WHERE user_map.new_id IS NULL;

PRINT CONCAT('  CustomAttributesMappingPermissionsUsers migrated: ', @inserted, ' rows (rows w/o user_map applied as NULL user_id = all users)');

-- ─── Phase complete ──────────────────────────────────────────────────────────
DECLARE @summary NVARCHAR(MAX) = (SELECT
    (SELECT COUNT(*) FROM [core].[custom_attribute]) AS attrs,
    (SELECT COUNT(*) FROM [core].[custom_attribute_mapping]) AS mappings,
    (SELECT COUNT(*) FROM [core].[custom_lookup]) AS lookups,
    (SELECT COUNT(*) FROM [core].[custom_value]) AS values_total,
    (SELECT COUNT(DISTINCT entity_name) FROM [core].[custom_value]) AS distinct_entity_types,
    (SELECT COUNT(*) FROM [core].[custom_attribute_permission]) AS permissions,
    DATEDIFF(MILLISECOND, @t0, SYSUTCDATETIME()) AS elapsed_ms
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

EXEC [etl].[complete_phase] @phase_id = @phase_id, @rows_inserted = @inserted, @last_error = NULL;
PRINT '[phase97] summary: ' + @summary;
PRINT '[phase97] Custom Attributes migration completed';
GO
