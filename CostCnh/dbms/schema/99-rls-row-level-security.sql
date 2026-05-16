-- =============================================================================
-- Task 3.3 — Row-Level Security su cp.facts / fc.facts / wf.allocation
-- =============================================================================
-- Filtering predicate basato su business_unit_id di core.program (JOIN su site).
-- User → BU mapping in core.user_business_unit (many-to-many).
-- SESSION_CONTEXT('user_id') settato dal backend per richiesta.
-- Backward-compat: utenti senza mapping = full visibility (admin).
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

-- ─── 1. User → BU mapping ────────────────────────────────────────────────────
IF OBJECT_ID(N'[core].[user_business_unit]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[user_business_unit] (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_user_business_unit PRIMARY KEY CLUSTERED,
        user_id INT NOT NULL,
        business_unit_id INT NOT NULL,
        granted_at_utc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        granted_by_user_id INT NULL,
        is_active BIT NOT NULL DEFAULT 1,
        CONSTRAINT UQ_ubu_user_bu UNIQUE (user_id, business_unit_id)
    );
    CREATE INDEX ix_ubu_user ON [core].[user_business_unit](user_id, is_active) INCLUDE (business_unit_id);
    PRINT '[99-rls] core.user_business_unit created';
END
GO

-- ─── 2. Security predicate function ───────────────────────────────────────────
-- Ritorna 1 se user può vedere quel business_unit (o se admin / sysadmin / no mapping).
IF OBJECT_ID(N'[core].[fn_user_can_see_bu]', N'IF') IS NOT NULL
    DROP FUNCTION [core].[fn_user_can_see_bu];
GO
CREATE FUNCTION [core].[fn_user_can_see_bu](@business_unit_id INT)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT 1 AS can_see
     WHERE
        -- 1. SUSER_NAME() is sysadmin/db_owner -> always visible
        IS_SRVROLEMEMBER('sysadmin') = 1
        OR IS_MEMBER('db_owner') = 1
        -- 2. SESSION_CONTEXT user has NO mapping at all (legacy / admin fallback)
        OR NOT EXISTS (
            SELECT 1 FROM [core].[user_business_unit] ubu
             WHERE ubu.user_id = CAST(SESSION_CONTEXT(N'user_id') AS INT)
               AND ubu.is_active = 1
        )
        -- 3. SESSION_CONTEXT user has explicit mapping for THIS bu
        OR EXISTS (
            SELECT 1 FROM [core].[user_business_unit] ubu
             WHERE ubu.user_id = CAST(SESSION_CONTEXT(N'user_id') AS INT)
               AND ubu.business_unit_id = @business_unit_id
               AND ubu.is_active = 1
        );
GO
PRINT '[99-rls] core.fn_user_can_see_bu created (inline TVF, 3-tier policy)';
GO

-- ─── 3. Predicate function su cp.facts (via JOIN program → site) ──────────────
-- INLINE TVF (no scalar UDF anti-pattern): JOIN nella WHERE del predicate.
IF OBJECT_ID(N'[core].[fn_rls_cp_facts]', N'IF') IS NOT NULL
    DROP FUNCTION [core].[fn_rls_cp_facts];
GO
CREATE FUNCTION [core].[fn_rls_cp_facts](@program_id INT)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT 1 AS can_see
     WHERE EXISTS (
         SELECT 1
           FROM [core].[program] p
           INNER JOIN [core].[site] s ON s.id = p.site_id
           CROSS APPLY [core].[fn_user_can_see_bu](s.business_unit_id) pred
          WHERE p.id = @program_id
     );
GO
PRINT '[99-rls] core.fn_rls_cp_facts created (predicate via program → site → BU)';
GO

-- ─── 4. CREATE SECURITY POLICY ───────────────────────────────────────────────
-- Drop esistente se presente
IF EXISTS (SELECT 1 FROM sys.security_policies WHERE name = 'sp_cp_facts_bu_rls')
    DROP SECURITY POLICY [core].[sp_cp_facts_bu_rls];
GO

CREATE SECURITY POLICY [core].[sp_cp_facts_bu_rls]
    ADD FILTER PREDICATE [core].[fn_rls_cp_facts](program_id) ON [cp].[facts],
    ADD FILTER PREDICATE [core].[fn_rls_cp_facts](program_id) ON [fc].[facts],
    ADD FILTER PREDICATE [core].[fn_rls_cp_facts](program_id) ON [wf].[allocation]
    WITH (STATE = ON);
GO
PRINT '[99-rls] SECURITY POLICY sp_cp_facts_bu_rls ENABLED on cp.facts, fc.facts, wf.allocation';
GO

-- ─── 5. Helper SP per backend: set SESSION_CONTEXT('user_id') ─────────────────
IF OBJECT_ID(N'[core].[sp_set_session_user]', N'P') IS NOT NULL
    DROP PROCEDURE [core].[sp_set_session_user];
GO
CREATE PROCEDURE [core].[sp_set_session_user]
    @user_id INT
AS
BEGIN
    SET NOCOUNT ON;
    EXEC sp_set_session_context @key = N'user_id', @value = @user_id, @read_only = 0;
END
GO
PRINT '[99-rls] core.sp_set_session_user created';
GO

-- ─── 6. Smoke test ────────────────────────────────────────────────────────────
PRINT '';
PRINT '[99-rls] === Smoke test RLS ===';
-- Test 1: user senza mapping → vede tutto (legacy fallback)
EXEC core.sp_set_session_user @user_id = 999;
DECLARE @count1 INT;
SELECT @count1 = COUNT(*) FROM [cp].[facts];
PRINT '  User 999 (no mapping) sees ' + CAST(@count1 AS VARCHAR) + ' cp.facts rows (expect full visibility, legacy fallback)';

-- Test 2: insert mapping per user 1 → BU 1 only, then check filtering
INSERT INTO [core].[user_business_unit] (user_id, business_unit_id) VALUES (1001, 1);
EXEC core.sp_set_session_user @user_id = 1001;
DECLARE @count2 INT;
SELECT @count2 = COUNT(*) FROM [cp].[facts];
PRINT '  User 1001 (BU 1 only) sees ' + CAST(@count2 AS VARCHAR) + ' cp.facts rows (expect filtered to BU=1)';

-- Cleanup test mapping
DELETE FROM [core].[user_business_unit] WHERE user_id = 1001;
PRINT '';
PRINT '[99-rls] === Task 3.3 deployed ===';
PRINT '  Backend: call core.sp_set_session_user BEFORE every query session.';
PRINT '  Pattern: middleware o per-request hook che fa SET SESSION CONTEXT.';
GO
