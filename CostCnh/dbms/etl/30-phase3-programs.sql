-- =============================================================================
-- ETL Phase 3 — Programs + Projects + Initiatives
-- =============================================================================
-- Programs: GUID PK legacy → INT IDENTITY new. Drop RevisionType/RevisionCounter/
-- RevisionReference (sostituiti da Temporal Tables). public_id preserva il GUID
-- legacy come UUID secondario per backward compat con integratori esterni.
-- =============================================================================

DECLARE @phase_id BIGINT, @already_completed BIT;
EXEC [etl].[start_phase] @run_id = <<RUN_ID>>, @phase_number = 3, @phase_name = N'Programs + Projects + Initiatives', @phase_id = @phase_id OUTPUT, @already_completed = @already_completed OUTPUT;
IF @already_completed = 1 BEGIN PRINT '[phase3] already completed'; RETURN; END

DECLARE @t0 DATETIME2(3) = SYSUTCDATETIME();
DECLARE @inserted INT = 0, @rejected INT = 0;

-- ── 3.a core.Programs ───────────────────────────────────────────────────────
-- Sospendi SYSTEM_VERSIONING temporaneamente (NB: re-attivare in fine!).
-- L'INSERT bulk con sys_start/sys_end manuale richiede HIDDEN PERIOD off.
-- ALTER TABLE [core].[program] SET (SYSTEM_VERSIONING = OFF);
-- Per ora INSERT senza preservare history origin: ogni Program riceve sys_start = NOW.
-- Sprint 9.2 può migrare anche la storia da legacy Programs_History se esiste.

;WITH src AS (
    SELECT
        p.[Id]                    AS legacy_id,
        p.[Code]                  AS code,
        p.[Name]                  AS name,
        p.[ShortDescription]      AS short_description,
        p.[LongDescription]       AS long_description,
        p.[Id_Site]               AS legacy_site_id,
        p.[Id_ProgramStatus]      AS legacy_status_id,
        p.[Id_ProjectClass]       AS legacy_class_guid,
        p.[Id_ProjectScenario]    AS legacy_scenario_guid,
        p.[Id_ProgramParent]      AS legacy_parent_guid,
        p.[Comment]               AS comment,
        p.[IsWorking]             AS is_working,
        p.[Private]               AS is_private,
        p.[InheritConversions]    AS inherit_conversions,
        p.[CheckedOut]            AS checked_out,
        p.[LastCheckedOutDate]    AS last_checked_out_at,
        p.[LaunchDate]            AS launch_date,
        p.[StartDate]             AS start_date,
        p.[EndDate]               AS end_date,
        p.[PlanningEndDate]       AS planning_end_date,
        p.[Id_Month_TimeNow]      AS time_now_month_id,
        p.[LastContribute]        AS last_contribute_at,
        p.[CreationDate]          AS created_at,
        p.[LastUpdateDate]        AS updated_at,
        p.[Id_CreationUser]       AS creation_user_guid,
        p.[IsDeleted]             AS deleted_flag
    FROM <<SOURCE_DB>>.[core].[Programs] p
)
INSERT INTO [core].[program]
    (public_id, code, name, short_description, long_description, site_id, program_status_id,
     project_class_id, project_scenario_id, program_parent_id, currency_id,
     is_working, is_private, inherit_conversions, checked_out, last_checked_out_at,
     launch_date, start_date, end_date, planning_end_date, time_now_month_id,
     last_contribute_at, comment_short,
     cancellato, data_creazione, data_modifica)
SELECT
    s.legacy_id,                                                  -- public_id = legacy GUID
    s.code,
    s.name,
    LEFT(s.short_description, 100),
    LEFT(s.long_description, 500),
    site_map.new_id,                                              -- site_id (resolved)
    status_map.new_id,                                            -- program_status_id (resolved)
    class_map.new_id,                                             -- project_class_id (resolved)
    scen_map.new_id,                                              -- project_scenario_id (resolved)
    NULL,                                                          -- program_parent_id: pass 2 dopo full insert
    NULL,                                                          -- currency_id: not in legacy schema (legacy stores at facts level)
    ISNULL(s.is_working, 1),
    ISNULL(s.is_private, 0),
    ISNULL(s.inherit_conversions, 1),
    ISNULL(s.checked_out, 0),
    s.last_checked_out_at,
    s.launch_date,
    s.start_date,
    s.end_date,
    s.planning_end_date,
    s.time_now_month_id,
    s.last_contribute_at,
    LEFT(s.comment, 4000),
    ISNULL(s.deleted_flag, 0),
    ISNULL(s.created_at, SYSUTCDATETIME()),
    s.updated_at
FROM src s
LEFT JOIN [etl].[int_map]  site_map    ON site_map.entity_type = 'site'           AND site_map.legacy_id    = s.legacy_site_id
LEFT JOIN [etl].[int_map]  status_map  ON status_map.entity_type = 'program_status' AND status_map.legacy_id = s.legacy_status_id
LEFT JOIN [etl].[guid_map] class_map   ON class_map.entity_type = 'project_class'  AND class_map.legacy_guid = s.legacy_class_guid
LEFT JOIN [etl].[guid_map] scen_map    ON scen_map.entity_type = 'project_scenario' AND scen_map.legacy_guid = s.legacy_scenario_guid
WHERE site_map.new_id IS NOT NULL   -- skip programs orphani (site unmapped)
  AND NOT EXISTS (SELECT 1 FROM [core].[program] cp WHERE cp.public_id = s.legacy_id);
SET @inserted = @@ROWCOUNT;

-- Populate guid_map post-insert
INSERT INTO [etl].[guid_map] (entity_type, legacy_guid, new_id)
SELECT 'program', cp.public_id, cp.id
FROM [core].[program] cp
WHERE NOT EXISTS (SELECT 1 FROM [etl].[guid_map] m WHERE m.entity_type = 'program' AND m.legacy_guid = cp.public_id);

-- Pass 2: resolve self-ref program_parent_id (via guid_map)
UPDATE p
   SET program_parent_id = pmap.new_id
FROM [core].[program] p
INNER JOIN <<SOURCE_DB>>.[core].[Programs] src ON src.[Id] = p.public_id
INNER JOIN [etl].[guid_map] pmap ON pmap.entity_type = 'program' AND pmap.legacy_guid = src.[Id_ProgramParent]
WHERE src.[Id_ProgramParent] IS NOT NULL AND p.program_parent_id IS NULL;

-- Log programs rejected (site unmapped)
INSERT INTO [etl].[error] (run_id, phase_number, entity_type, legacy_id, error_kind, error_message)
SELECT <<RUN_ID>>, 3, 'program', CONVERT(NVARCHAR(36), p.[Id]),
       'fk_unmapped',
       'Programs.Id_Site=' + CAST(p.[Id_Site] AS NVARCHAR(20)) + ' non mappato in etl.int_map (skipping)'
FROM <<SOURCE_DB>>.[core].[Programs] p
WHERE NOT EXISTS (SELECT 1 FROM [etl].[int_map] m WHERE m.entity_type = 'site' AND m.legacy_id = p.[Id_Site])
  AND NOT EXISTS (SELECT 1 FROM [core].[program] cp WHERE cp.public_id = p.[Id]);
SET @rejected = @@ROWCOUNT;
PRINT '[phase3.a] programs: inserted=' + CAST(@inserted AS NVARCHAR(20)) + ' rejected=' + CAST(@rejected AS NVARCHAR(20));

-- ── 3.b core.Projects ───────────────────────────────────────────────────────
INSERT INTO [core].[project] (public_id, program_id, code, name, description, is_active, sort_order, cancellato, data_creazione)
SELECT
    pj.[Id],
    pmap.new_id,
    LEFT(pj.[Code], 50),
    LEFT(pj.[Name], 500),
    pj.[Description],
    ISNULL(pj.[IsActive], 1),
    ISNULL(pj.[SortOrder], 0),
    ISNULL(pj.[IsDeleted], 0),
    ISNULL(pj.[CreationDate], SYSUTCDATETIME())
FROM <<SOURCE_DB>>.[core].[Projects] pj
INNER JOIN [etl].[guid_map] pmap ON pmap.entity_type = 'program' AND pmap.legacy_guid = pj.[Id_Program]
WHERE NOT EXISTS (SELECT 1 FROM [core].[project] cp WHERE cp.public_id = pj.[Id]);
SET @inserted = @inserted + @@ROWCOUNT;

INSERT INTO [etl].[guid_map] (entity_type, legacy_guid, new_id)
SELECT 'project', cp.public_id, cp.id
FROM [core].[project] cp
WHERE NOT EXISTS (SELECT 1 FROM [etl].[guid_map] m WHERE m.entity_type = 'project' AND m.legacy_guid = cp.public_id);
PRINT '[phase3.b] projects mapped';

-- ── 3.c core.Initiatives ────────────────────────────────────────────────────
INSERT INTO [core].[initiative] (code, name, description, owner_user_id, start_date, end_date, is_active, cancellato)
SELECT
    LEFT(i.[Code], 50), LEFT(i.[Name], 500), i.[Description],
    NULL,                                                          -- owner_user_id: legacy GUID Id_OwnerUser non risolvibile a INT senza user mapping
    i.[StartDate], i.[EndDate],
    ISNULL(i.[IsActive], 1),
    ISNULL(i.[IsDeleted], 0)
FROM <<SOURCE_DB>>.[core].[Initiatives] i
WHERE NOT EXISTS (SELECT 1 FROM [core].[initiative] ci WHERE ci.code = LEFT(i.[Code], 50));
SET @inserted = @inserted + @@ROWCOUNT;

INSERT INTO [etl].[guid_map] (entity_type, legacy_guid, new_id)
SELECT 'initiative', i.[Id], ci.id
FROM <<SOURCE_DB>>.[core].[Initiatives] i
INNER JOIN [core].[initiative] ci ON ci.code = LEFT(i.[Code], 50)
WHERE NOT EXISTS (SELECT 1 FROM [etl].[guid_map] m WHERE m.entity_type = 'initiative' AND m.legacy_guid = i.[Id]);
PRINT '[phase3.c] initiatives mapped';

DECLARE @dur3 INT = DATEDIFF(MILLISECOND, @t0, SYSUTCDATETIME());
EXEC [etl].[complete_phase]
    @phase_id = @phase_id,
    @rows_inserted = @inserted,
    @rows_rejected = @rejected,
    @duration_ms = @dur3;
PRINT '[phase3] DONE — inserted=' + CAST(@inserted AS NVARCHAR(20)) + ' rejected=' + CAST(@rejected AS NVARCHAR(20));
GO
