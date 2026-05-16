-- =============================================================================
-- ETL Phase 1 — Anagrafica master (Sites, Currencies, ProgramStatuses,
--                  ProjectClasses, ProjectScenarios, UnitMeasures, Dim_Time)
-- =============================================================================
-- Placeholders:
--   <<RUN_ID>>     — int, etl.run.id corrente
--   <<SOURCE_DB>>  — es. [Cost_Offhighway_Test] (when on same instance) o
--                   nome 4-part [LinkedSrv].[Cost_Offhighway_Test] (cross-server)
--
-- Idempotente: ogni UPSERT skippa rows gia' mappate in etl.guid_map / etl.int_map.
-- =============================================================================

DECLARE @phase_id BIGINT, @already_completed BIT;
EXEC [etl].[start_phase] @run_id = <<RUN_ID>>, @phase_number = 1, @phase_name = N'Anagrafica master', @phase_id = @phase_id OUTPUT, @already_completed = @already_completed OUTPUT;
IF @already_completed = 1
BEGIN
    PRINT '[phase1] already completed (run_id=<<RUN_ID>>) — skipping';
    RETURN;
END

DECLARE @t0 DATETIME2(3) = SYSUTCDATETIME();
DECLARE @inserted INT = 0, @skipped INT = 0;

-- ── 1.a core.Sites (legacy INT PK → new core.site INT IDENTITY) ─────────────
-- NB: verificare colonne reali in <SOURCE_DB>.core.Sites:
--     Id, Code, Name, ModuleId obbligatori (vedi data/configuration/6.Sites.sql);
--     IsDeleted, BusinessUnit_Id, CountryISO, CurrencyCode, IsActive opzionali.
INSERT INTO [core].[site] (code, name, business_unit_id, country_iso, currency_code, is_active)
SELECT s.[Code], s.[Name],
       ISNULL(s.[BusinessUnit_Id], 1),                            -- default Off-Highway se manca
       s.[CountryISO], s.[CurrencyCode],
       ISNULL(s.[IsActive], 1)
FROM <<SOURCE_DB>>.[core].[Sites] s
WHERE ISNULL(s.[IsDeleted], 0) = 0
  AND NOT EXISTS (SELECT 1 FROM [core].[site] cs WHERE cs.code = s.[Code]);
SET @inserted = @inserted + @@ROWCOUNT;

INSERT INTO [etl].[int_map] (entity_type, legacy_id, new_id)
SELECT 'site', s.[Id], cs.id
FROM <<SOURCE_DB>>.[core].[Sites] s
INNER JOIN [core].[site] cs ON cs.code = s.[Code]
WHERE NOT EXISTS (SELECT 1 FROM [etl].[int_map] m WHERE m.entity_type = 'site' AND m.legacy_id = s.[Id]);
PRINT '[phase1] sites mapped';

-- ── 1.b core.Currencies ─────────────────────────────────────────────────────
INSERT INTO [core].[currency] (code, name, symbol, is_active)
SELECT c.[Code], c.[Name], c.[Symbol], ISNULL(c.[IsActive], 1)
FROM <<SOURCE_DB>>.[core].[Currencies] c
WHERE ISNULL(c.[IsDeleted], 0) = 0
  AND NOT EXISTS (SELECT 1 FROM [core].[currency] cc WHERE cc.code = c.[Code]);
SET @inserted = @inserted + @@ROWCOUNT;
INSERT INTO [etl].[int_map] (entity_type, legacy_id, new_id)
SELECT 'currency', c.[Id], cc.id
FROM <<SOURCE_DB>>.[core].[Currencies] c
INNER JOIN [core].[currency] cc ON cc.code = c.[Code]
WHERE NOT EXISTS (SELECT 1 FROM [etl].[int_map] m WHERE m.entity_type = 'currency' AND m.legacy_id = c.[Id]);
PRINT '[phase1] currencies mapped';

-- ── 1.c core.ProgramStatuses ────────────────────────────────────────────────
INSERT INTO [core].[program_status] (code, name, is_terminal, sort_order)
SELECT ps.[Code], ps.[Name], ISNULL(ps.[IsTerminal], 0), ISNULL(ps.[SortOrder], 0)
FROM <<SOURCE_DB>>.[core].[ProgramStatuses] ps
WHERE NOT EXISTS (SELECT 1 FROM [core].[program_status] cps WHERE cps.code = ps.[Code]);
SET @inserted = @inserted + @@ROWCOUNT;
INSERT INTO [etl].[int_map] (entity_type, legacy_id, new_id)
SELECT 'program_status', ps.[Id], cps.id
FROM <<SOURCE_DB>>.[core].[ProgramStatuses] ps
INNER JOIN [core].[program_status] cps ON cps.code = ps.[Code]
WHERE NOT EXISTS (SELECT 1 FROM [etl].[int_map] m WHERE m.entity_type = 'program_status' AND m.legacy_id = ps.[Id]);
PRINT '[phase1] program_statuses mapped';

-- ── 1.d core.ProjectClasses (GUID PK legacy → INT IDENTITY new) ─────────────
INSERT INTO [core].[project_class] (code, name, description)
SELECT pc.[Code], pc.[Name], pc.[Description]
FROM <<SOURCE_DB>>.[core].[ProjectClasses] pc
WHERE ISNULL(pc.[IsDeleted], 0) = 0
  AND NOT EXISTS (SELECT 1 FROM [core].[project_class] cpc WHERE cpc.code = pc.[Code]);
SET @inserted = @inserted + @@ROWCOUNT;
INSERT INTO [etl].[guid_map] (entity_type, legacy_guid, new_id)
SELECT 'project_class', pc.[Id], cpc.id
FROM <<SOURCE_DB>>.[core].[ProjectClasses] pc
INNER JOIN [core].[project_class] cpc ON cpc.code = pc.[Code]
WHERE NOT EXISTS (SELECT 1 FROM [etl].[guid_map] m WHERE m.entity_type = 'project_class' AND m.legacy_guid = pc.[Id]);
PRINT '[phase1] project_classes mapped';

-- ── 1.e core.ProjectScenarios ───────────────────────────────────────────────
INSERT INTO [core].[project_scenario] (code, name, kind, is_active)
SELECT ps.[Code], ps.[Name],
       CASE ps.[Kind] WHEN 'Working' THEN 1 WHEN 'Frozen' THEN 2 WHEN 'Budget' THEN 3 WHEN 'Baseline' THEN 4 ELSE 1 END,
       ISNULL(ps.[IsActive], 1)
FROM <<SOURCE_DB>>.[core].[ProjectScenarios] ps
WHERE ISNULL(ps.[IsDeleted], 0) = 0
  AND NOT EXISTS (SELECT 1 FROM [core].[project_scenario] cps WHERE cps.code = ps.[Code]);
SET @inserted = @inserted + @@ROWCOUNT;
INSERT INTO [etl].[guid_map] (entity_type, legacy_guid, new_id)
SELECT 'project_scenario', ps.[Id], cps.id
FROM <<SOURCE_DB>>.[core].[ProjectScenarios] ps
INNER JOIN [core].[project_scenario] cps ON cps.code = ps.[Code]
WHERE NOT EXISTS (SELECT 1 FROM [etl].[guid_map] m WHERE m.entity_type = 'project_scenario' AND m.legacy_guid = ps.[Id]);
PRINT '[phase1] project_scenarios mapped';

-- ── 1.f core.UnitMeasures → cp.unit_measure ─────────────────────────────────
INSERT INTO [cp].[unit_measure] (code, name, symbol, kind)
SELECT u.[Code], u.[Name], u.[Symbol],
       CASE u.[Kind] WHEN 'Monetary' THEN 1 WHEN 'Hours' THEN 2 WHEN 'Count' THEN 3 ELSE 4 END
FROM <<SOURCE_DB>>.[core].[UnitMeasures] u
WHERE NOT EXISTS (SELECT 1 FROM [cp].[unit_measure] cu WHERE cu.code = u.[Code]);
SET @inserted = @inserted + @@ROWCOUNT;
INSERT INTO [etl].[int_map] (entity_type, legacy_id, new_id)
SELECT 'unit_measure', u.[Id], cu.id
FROM <<SOURCE_DB>>.[core].[UnitMeasures] u
INNER JOIN [cp].[unit_measure] cu ON cu.code = u.[Code]
WHERE NOT EXISTS (SELECT 1 FROM [etl].[int_map] m WHERE m.entity_type = 'unit_measure' AND m.legacy_id = u.[Id]);
PRINT '[phase1] unit_measures mapped';

-- ── 1.g facts.Dim_Time → core.dim_time (no FK, only month_id PK) ────────────
INSERT INTO [core].[dim_time] (month_id, first_day, last_day, is_fiscal_year_start)
SELECT dt.[MonthId], dt.[FirstDay], dt.[LastDay], ISNULL(dt.[IsFiscalYearStart], 0)
FROM <<SOURCE_DB>>.[facts].[Dim_Time] dt
WHERE NOT EXISTS (SELECT 1 FROM [core].[dim_time] cdt WHERE cdt.month_id = dt.[MonthId]);
SET @inserted = @inserted + @@ROWCOUNT;
PRINT '[phase1] dim_time merged';

-- ── 1.h Users migration ────────────────────────────────────────────────────
-- Target: CostCnh_Metadata.dbo.utenti (framework user table).
-- Source priority:
--   1. <SOURCE_DB>.core.Users     — custom Cost_CNH legacy user table (preferred)
--   2. <SOURCE_DB>.dbo.aspnet_Users + aspnet_Membership — SqlMembershipProvider standard
--
-- Pattern:
--   - Natural key = username (per evitare duplicate con seed admin/admin_test*)
--   - Password: copia hash legacy as-is (no conversion). Utenti legacy continueranno
--     a poter loggare con vecchia password se l'auth provider supporta lo schema hash legacy.
--     Se schema hash incompatibile, force-reset al primo login va deciso dall'admin
--     (script post-migration `seed-roles-users.ps1 --reset-legacy-passwords`).
--   - etl.int_map(entity_type='user', legacy_id=int OR CHECKSUM(guid), new_id=id_utente).
-- =============================================================================
PRINT '[phase1] Step 1.h — users migration';
DECLARE @user_inserted INT = 0;

-- Variant 1: source DB ha core.Users (custom table Cost_CNH legacy)
IF EXISTS (SELECT 1 FROM <<SOURCE_DB>>.sys.tables t INNER JOIN <<SOURCE_DB>>.sys.schemas s ON s.schema_id = t.schema_id
            WHERE s.name = 'core' AND t.name = 'Users')
BEGIN
    PRINT '  source: <<SOURCE_DB>>.core.Users (custom legacy table)';

    -- INSERT new users (skip se username già esistente da seed admin/admin_test/etc.)
    INSERT INTO [CostCnh_Metadata].[dbo].[utenti] (
        username, password, email, cancellato
    )
    SELECT
        src.[Username],
        ISNULL(src.[Password], '*MIGRATED_NO_PASSWORD*'),   -- placeholder se source ha hash incompatibile
        src.[Email],
        ISNULL(src.[IsDeleted], 0)
    FROM <<SOURCE_DB>>.[core].[Users] src
    WHERE src.[Username] IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM [CostCnh_Metadata].[dbo].[utenti] tgt
           WHERE tgt.username = src.[Username]
      );
    SET @user_inserted = @@ROWCOUNT;

    -- Map: legacy users have INT id (Cost_CNH) OR GUID (più antico). Probe column type.
    -- Per uniformità con etl.int_map (BIGINT legacy_id), se GUID usa CHECKSUM hash.
    IF COL_LENGTH('<<SOURCE_DB>>.core.Users', 'Id') IS NOT NULL
    BEGIN
        DECLARE @user_id_is_int BIT = (
            SELECT CASE WHEN system_type_id IN (56, 127) THEN 1 ELSE 0 END   -- 56=int, 127=bigint
              FROM <<SOURCE_DB>>.sys.columns
             WHERE object_id = OBJECT_ID('<<SOURCE_DB>>.core.Users') AND name = 'Id'
        );

        IF @user_id_is_int = 1
        BEGIN
            -- INT/BIGINT Id → map diretto
            INSERT INTO [etl].[int_map] (entity_type, legacy_id, new_id)
            SELECT 'user', src.[Id], u.[id_utente]
            FROM <<SOURCE_DB>>.[core].[Users] src
            INNER JOIN [CostCnh_Metadata].[dbo].[utenti] u ON u.username = src.[Username]
            WHERE NOT EXISTS (
                SELECT 1 FROM [etl].[int_map] m
                 WHERE m.entity_type = 'user' AND m.legacy_id = src.[Id]
            );
        END
        ELSE
        BEGIN
            -- GUID Id → CHECKSUM hash come synthetic legacy_id; usa anche guid_map
            INSERT INTO [etl].[guid_map] (entity_type, legacy_guid, new_id)
            SELECT 'user', src.[Id], u.[id_utente]
            FROM <<SOURCE_DB>>.[core].[Users] src
            INNER JOIN [CostCnh_Metadata].[dbo].[utenti] u ON u.username = src.[Username]
            WHERE NOT EXISTS (
                SELECT 1 FROM [etl].[guid_map] m
                 WHERE m.entity_type = 'user' AND m.legacy_guid = src.[Id]
            );
            -- Sync anche in int_map via CHECKSUM per consumer ETL (CA permissions)
            INSERT INTO [etl].[int_map] (entity_type, legacy_id, new_id)
            SELECT 'user', CAST(CHECKSUM(CAST(src.[Id] AS NVARCHAR(40))) AS BIGINT), u.[id_utente]
            FROM <<SOURCE_DB>>.[core].[Users] src
            INNER JOIN [CostCnh_Metadata].[dbo].[utenti] u ON u.username = src.[Username]
            WHERE NOT EXISTS (
                SELECT 1 FROM [etl].[int_map] m
                 WHERE m.entity_type = 'user'
                   AND m.legacy_id = CAST(CHECKSUM(CAST(src.[Id] AS NVARCHAR(40))) AS BIGINT)
            );
        END
    END
END
-- Variant 2: source has aspnet_Users (SqlMembershipProvider standard)
ELSE IF EXISTS (SELECT 1 FROM <<SOURCE_DB>>.sys.tables t INNER JOIN <<SOURCE_DB>>.sys.schemas s ON s.schema_id = t.schema_id
                 WHERE s.name = 'dbo' AND t.name = 'aspnet_Users')
BEGIN
    PRINT '  source: <<SOURCE_DB>>.dbo.aspnet_Users (SqlMembershipProvider standard)';

    INSERT INTO [CostCnh_Metadata].[dbo].[utenti] (
        username, password, email, cancellato
    )
    SELECT
        au.[UserName],
        ISNULL(am.[Password], '*MIGRATED_ASPNET_HASH*'),    -- aspnet hash format, framework deve riconoscere o reset
        am.[Email],
        CASE WHEN am.[IsLockedOut] = 1 THEN 1 ELSE 0 END
    FROM <<SOURCE_DB>>.[dbo].[aspnet_Users] au
    LEFT JOIN <<SOURCE_DB>>.[dbo].[aspnet_Membership] am ON am.[UserId] = au.[UserId]
    WHERE au.[UserName] IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM [CostCnh_Metadata].[dbo].[utenti] tgt
           WHERE tgt.username = au.[UserName]
      );
    SET @user_inserted = @@ROWCOUNT;

    -- aspnet UserId è GUID → guid_map + checksum int_map (synthetic per CA permissions)
    INSERT INTO [etl].[guid_map] (entity_type, legacy_guid, new_id)
    SELECT 'user', au.[UserId], u.[id_utente]
    FROM <<SOURCE_DB>>.[dbo].[aspnet_Users] au
    INNER JOIN [CostCnh_Metadata].[dbo].[utenti] u ON u.username = au.[UserName]
    WHERE NOT EXISTS (
        SELECT 1 FROM [etl].[guid_map] m
         WHERE m.entity_type = 'user' AND m.legacy_guid = au.[UserId]
    );

    INSERT INTO [etl].[int_map] (entity_type, legacy_id, new_id)
    SELECT 'user', CAST(CHECKSUM(CAST(au.[UserId] AS NVARCHAR(40))) AS BIGINT), u.[id_utente]
    FROM <<SOURCE_DB>>.[dbo].[aspnet_Users] au
    INNER JOIN [CostCnh_Metadata].[dbo].[utenti] u ON u.username = au.[UserName]
    WHERE NOT EXISTS (
        SELECT 1 FROM [etl].[int_map] m
         WHERE m.entity_type = 'user'
           AND m.legacy_id = CAST(CHECKSUM(CAST(au.[UserId] AS NVARCHAR(40))) AS BIGINT)
    );
END
ELSE
BEGIN
    PRINT '  [warn] No legacy user table found (core.Users / dbo.aspnet_Users). Skipping user ETL.';
    PRINT '  [warn] CA permissions ETL (script 97 step 5) userà fallback NULL user_id (= applies to all).';
    -- Audit nel log etl.error per traccia
    INSERT INTO [etl].[error] (run_id, phase_id, entity_type, legacy_id, error_message)
    VALUES (<<RUN_ID>>, @phase_id, 'user', 0, 'No legacy user source table found. CA permissions ETL will use NULL user_id fallback.');
END

SET @inserted = @inserted + @user_inserted;
PRINT '  [phase1] users migrated: ' + CAST(@user_inserted AS NVARCHAR(20)) + ' rows (skipped if username already in target)';

-- ── 1.i Users → Roles mapping (utenti_ruoli) ────────────────────────────────
-- Legacy: core.UserRoles(Id_User, Id_Role) OR aspnet_UsersInRoles.
-- Target: utenti_ruoli(id_utente, id_ruolo). Resolve role via natural key (rolename → id_ruolo).
PRINT '[phase1] Step 1.i — user → role mapping';
DECLARE @role_inserted INT = 0;

IF EXISTS (SELECT 1 FROM <<SOURCE_DB>>.sys.tables t INNER JOIN <<SOURCE_DB>>.sys.schemas s ON s.schema_id = t.schema_id
            WHERE s.name = 'core' AND t.name = 'UserRoles')
BEGIN
    INSERT INTO [CostCnh_Metadata].[dbo].[utenti_ruoli] (id_utente, id_ruolo)
    SELECT DISTINCT u.[id_utente], r.[id_ruolo]
    FROM <<SOURCE_DB>>.[core].[UserRoles] src
    INNER JOIN <<SOURCE_DB>>.[core].[Users] usrc ON usrc.[Id] = src.[Id_User]
    INNER JOIN <<SOURCE_DB>>.[core].[Roles] rsrc ON rsrc.[Id] = src.[Id_Role]
    INNER JOIN [CostCnh_Metadata].[dbo].[utenti] u ON u.username = usrc.[Username]
    INNER JOIN [CostCnh_Metadata].[dbo].[ruoli] r ON r.[ruolo_des] =rsrc.[Name]
    WHERE NOT EXISTS (
        SELECT 1 FROM [CostCnh_Metadata].[dbo].[utenti_ruoli] ur
         WHERE ur.id_utente = u.[id_utente] AND ur.id_ruolo = r.[id_ruolo]
    );
    SET @role_inserted = @@ROWCOUNT;
END
ELSE IF EXISTS (SELECT 1 FROM <<SOURCE_DB>>.sys.tables t INNER JOIN <<SOURCE_DB>>.sys.schemas s ON s.schema_id = t.schema_id
                 WHERE s.name = 'dbo' AND t.name = 'aspnet_UsersInRoles')
BEGIN
    INSERT INTO [CostCnh_Metadata].[dbo].[utenti_ruoli] (id_utente, id_ruolo)
    SELECT DISTINCT u.[id_utente], r.[id_ruolo]
    FROM <<SOURCE_DB>>.[dbo].[aspnet_UsersInRoles] aur
    INNER JOIN <<SOURCE_DB>>.[dbo].[aspnet_Users] au ON au.[UserId] = aur.[UserId]
    INNER JOIN <<SOURCE_DB>>.[dbo].[aspnet_Roles] ar ON ar.[RoleId] = aur.[RoleId]
    INNER JOIN [CostCnh_Metadata].[dbo].[utenti] u ON u.username = au.[UserName]
    INNER JOIN [CostCnh_Metadata].[dbo].[ruoli] r ON r.[ruolo_des] =ar.[RoleName]
    WHERE NOT EXISTS (
        SELECT 1 FROM [CostCnh_Metadata].[dbo].[utenti_ruoli] ur
         WHERE ur.id_utente = u.[id_utente] AND ur.id_ruolo = r.[id_ruolo]
    );
    SET @role_inserted = @@ROWCOUNT;
END
ELSE
    PRINT '  [skip] No legacy UserRoles source found';

SET @inserted = @inserted + @role_inserted;
PRINT '  [phase1] user-role bindings migrated: ' + CAST(@role_inserted AS NVARCHAR(20));

DECLARE @dur INT = DATEDIFF(MILLISECOND, @t0, SYSUTCDATETIME());
EXEC [etl].[complete_phase]
    @phase_id = @phase_id,
    @rows_inserted = @inserted,
    @duration_ms = @dur;
PRINT '[phase1] DONE — rows_inserted=' + CAST(@inserted AS NVARCHAR(20));
GO
