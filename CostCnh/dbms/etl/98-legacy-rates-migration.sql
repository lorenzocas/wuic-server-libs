-- =============================================================================
-- ETL 98 — Legacy Rates migration (exchange / FTE / hourly / supplier / calendar)
-- =============================================================================
-- Migrazione delle tabelle rate Phase I.1 + I.11.12:
--   1. cp.exchange_rate         ← legacy cnh.ExchangeRates (o equivalente)
--   2. cp.fte_hours             ← legacy core.HoursPerFTE (per role × year)
--   3. cp.hours_currency        ← legacy core.HourlyRates (per currency × year)
--   4. cp.supplier_rate         ← legacy core.SupplierRates / cnh.SupplierRates
--   5. cp.resource_calendar     ← legacy core.SiteCalendars + working_hours_per_day
--
-- NB: NON migra cp.rate_catalog (nuova tabella post-cutover, popolata
-- da Task 12.7 quando arriverà).
--
-- Placeholders:
--   <<RUN_ID>>     — int, etl.run.id corrente
--   <<SOURCE_DB>>  — es. [Cost_Offhighway_Test]
--
-- Idempotente: ogni UPSERT skippa rows già migrate via natural key.
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
EXEC [etl].[start_phase] @run_id = <<RUN_ID>>, @phase_number = 98,
     @phase_name = N'Legacy rates migration',
     @phase_id = @phase_id OUTPUT, @already_completed = @already_completed OUTPUT;
IF @already_completed = 1
BEGIN
    PRINT '[phase98] already completed (run_id=<<RUN_ID>>) — skipping';
    RETURN;
END

DECLARE @t0 DATETIME2(3) = SYSUTCDATETIME();
DECLARE @inserted INT = 0;

-- ─── 1. cp.exchange_rate ──────────────────────────────────────────────────────
-- Legacy schema: cnh.ExchangeRates(FromCurrency, ToCurrency, Year, Month, Rate)
-- → new schema: cp.exchange_rate(from_currency_id, to_currency_id, valid_from DATE,
--                                valid_to DATE, rate DECIMAL(19,8), source NVARCHAR(60))
PRINT '[98] Step 1 — Legacy ExchangeRates → cp.exchange_rate';
SET @inserted = 0;

IF EXISTS (SELECT 1 FROM <<SOURCE_DB>>.sys.tables WHERE name = 'ExchangeRates')
BEGIN
    INSERT INTO [cp].[exchange_rate] (
        from_currency_id, to_currency_id, valid_from, valid_to, rate, source,
        data_creazione, utente_creazione
    )
    SELECT
        cur_from.[new_id],
        cur_to.[new_id],
        DATEFROMPARTS(src.[Year], ISNULL(src.[Month], 1), 1) AS valid_from,
        -- valid_to = first day of NEXT month (or NULL if last record for pair)
        DATEFROMPARTS(src.[Year], ISNULL(src.[Month], 1), 1) AS valid_to,  -- placeholder, computed below
        src.[Rate],
        ISNULL(src.[Source], 'legacy-import'),
        SYSUTCDATETIME(), 1
    FROM <<SOURCE_DB>>.[cnh].[ExchangeRates] src
    INNER JOIN [etl].[int_map] cur_from ON cur_from.entity_type = 'currency' AND cur_from.legacy_id = src.[FromCurrencyId]
    INNER JOIN [etl].[int_map] cur_to   ON cur_to.entity_type   = 'currency' AND cur_to.legacy_id   = src.[ToCurrencyId]
    WHERE NOT EXISTS (
        SELECT 1 FROM [cp].[exchange_rate] tgt
         WHERE tgt.from_currency_id = cur_from.[new_id]
           AND tgt.to_currency_id = cur_to.[new_id]
           AND tgt.valid_from = DATEFROMPARTS(src.[Year], ISNULL(src.[Month], 1), 1)
    );
    SET @inserted = @inserted + @@ROWCOUNT;

    -- Post-process: aggiorna valid_to = MIN(valid_from successivo) per stessa pair
    WITH ranked AS (
        SELECT er.id, er.from_currency_id, er.to_currency_id, er.valid_from,
               LEAD(er.valid_from) OVER (
                   PARTITION BY er.from_currency_id, er.to_currency_id
                   ORDER BY er.valid_from
               ) AS next_valid_from
          FROM [cp].[exchange_rate] er
         WHERE er.source = 'legacy-import'
    )
    UPDATE er SET valid_to = ranked.next_valid_from
      FROM [cp].[exchange_rate] er
      INNER JOIN ranked ON ranked.id = er.id;

    PRINT CONCAT('  ExchangeRates migrated: ', @inserted, ' rows');
END
ELSE
BEGIN
    PRINT '  [skip] <<SOURCE_DB>>.cnh.ExchangeRates not present';
    -- Fallback: ECB seed se non c'è source
    IF NOT EXISTS (SELECT 1 FROM [cp].[exchange_rate])
    BEGIN
        DECLARE @eur INT = (SELECT TOP 1 id FROM [core].[currency] WHERE code = 'EUR');
        DECLARE @usd INT = (SELECT TOP 1 id FROM [core].[currency] WHERE code = 'USD');
        DECLARE @cny INT = (SELECT TOP 1 id FROM [core].[currency] WHERE code = 'CNY');
        IF @eur IS NOT NULL AND @usd IS NOT NULL
        BEGIN
            INSERT INTO [cp].[exchange_rate](from_currency_id, to_currency_id, valid_from, valid_to, rate, source, data_creazione, utente_creazione) VALUES
                (@eur, @usd, '2026-01-01', NULL, 1.08, 'ECB-seed-fallback', SYSUTCDATETIME(), 1),
                (@usd, @eur, '2026-01-01', NULL, 0.9259, 'ECB-seed-fallback', SYSUTCDATETIME(), 1);
            IF @cny IS NOT NULL
            INSERT INTO [cp].[exchange_rate](from_currency_id, to_currency_id, valid_from, valid_to, rate, source, data_creazione, utente_creazione) VALUES
                (@eur, @cny, '2026-01-01', NULL, 7.84, 'ECB-seed-fallback', SYSUTCDATETIME(), 1),
                (@cny, @eur, '2026-01-01', NULL, 0.1276, 'ECB-seed-fallback', SYSUTCDATETIME(), 1);
            PRINT '  [fallback] EUR/USD/CNY rates seeded';
        END
    END
END

-- ─── 2. cp.fte_hours ──────────────────────────────────────────────────────────
-- Legacy schema: core.HoursPerFTE(Id_Role, Year, HoursPerFTE) o similmente
PRINT '[98] Step 2 — Legacy HoursPerFTE → cp.fte_hours';
SET @inserted = 0;

IF EXISTS (SELECT 1 FROM <<SOURCE_DB>>.sys.tables WHERE name = 'HoursPerFTE' AND schema_id = SCHEMA_ID('core'))
BEGIN
    INSERT INTO [cp].[fte_hours] (role_code, year_num, hours_per_fte, notes, data_creazione, utente_creazione)
    SELECT
        role.[Code],
        src.[Year],
        src.[HoursPerFTE],
        N'Migrated from legacy core.HoursPerFTE',
        SYSUTCDATETIME(), 1
    FROM <<SOURCE_DB>>.[core].[HoursPerFTE] src
    INNER JOIN <<SOURCE_DB>>.[core].[Roles] role ON role.[Id] = src.[Id_Role]
    WHERE NOT EXISTS (
        SELECT 1 FROM [cp].[fte_hours] tgt
         WHERE tgt.role_code = role.[Code] AND tgt.year_num = src.[Year]
    );
    SET @inserted = @@ROWCOUNT;
    PRINT CONCAT('  fte_hours migrated: ', @inserted, ' rows');
END
ELSE
    PRINT '  [skip] HoursPerFTE not present';

-- ─── 3. cp.hours_currency ─────────────────────────────────────────────────────
-- Legacy: core.HourlyRates(Id_Currency, Year, HourlyRate) or cnh.HourlyRates
PRINT '[98] Step 3 — Legacy HourlyRates → cp.hours_currency';
SET @inserted = 0;

IF EXISTS (SELECT 1 FROM <<SOURCE_DB>>.sys.tables WHERE name = 'HourlyRates' AND schema_id = SCHEMA_ID('core'))
BEGIN
    INSERT INTO [cp].[hours_currency] (currency_id, year_num, hourly_rate, notes, data_creazione, utente_creazione)
    SELECT
        cur.[new_id],
        src.[Year],
        src.[HourlyRate],
        N'Migrated from legacy core.HourlyRates',
        SYSUTCDATETIME(), 1
    FROM <<SOURCE_DB>>.[core].[HourlyRates] src
    INNER JOIN [etl].[int_map] cur ON cur.entity_type = 'currency' AND cur.legacy_id = src.[Id_Currency]
    WHERE NOT EXISTS (
        SELECT 1 FROM [cp].[hours_currency] tgt
         WHERE tgt.currency_id = cur.[new_id] AND tgt.year_num = src.[Year]
    );
    SET @inserted = @@ROWCOUNT;
    PRINT CONCAT('  hours_currency migrated: ', @inserted, ' rows');
END
ELSE
    PRINT '  [skip] HourlyRates not present';

-- ─── 4. cp.supplier_rate ──────────────────────────────────────────────────────
-- Legacy: cnh.SupplierRates(SupplierCode, SupplierName, Id_Currency, Year, Rate, MarkupPct)
PRINT '[98] Step 4 — Legacy SupplierRates → cp.supplier_rate';
SET @inserted = 0;

IF EXISTS (SELECT 1 FROM <<SOURCE_DB>>.sys.tables WHERE name = 'SupplierRates')
BEGIN
    INSERT INTO [cp].[supplier_rate] (
        supplier_code, supplier_name, currency_id, year_num, rate, markup_pct, notes,
        data_creazione, utente_creazione
    )
    SELECT
        src.[SupplierCode],
        src.[SupplierName],
        cur.[new_id],
        src.[Year],
        src.[Rate],
        src.[MarkupPct],
        N'Migrated from legacy cnh.SupplierRates',
        SYSUTCDATETIME(), 1
    FROM <<SOURCE_DB>>.[cnh].[SupplierRates] src
    INNER JOIN [etl].[int_map] cur ON cur.entity_type = 'currency' AND cur.legacy_id = src.[Id_Currency]
    WHERE NOT EXISTS (
        SELECT 1 FROM [cp].[supplier_rate] tgt
         WHERE tgt.supplier_code = src.[SupplierCode] AND tgt.year_num = src.[Year]
    );
    SET @inserted = @@ROWCOUNT;
    PRINT CONCAT('  supplier_rate migrated: ', @inserted, ' rows');
END
ELSE
    PRINT '  [skip] SupplierRates not present';

-- ─── 5. cp.resource_calendar (+ working_hours_per_day) ────────────────────────
-- Legacy: core.SiteCalendars(Id_Site, Year, Month, WorkingDays, HolidayDays, [HoursPerDay])
-- working_hours_per_day default 8.00 se legacy non lo ha
PRINT '[98] Step 5 — Legacy SiteCalendars → cp.resource_calendar';
SET @inserted = 0;

IF EXISTS (SELECT 1 FROM <<SOURCE_DB>>.sys.tables WHERE name = 'SiteCalendars')
BEGIN
    INSERT INTO [cp].[resource_calendar] (
        site_id, year_num, month_num, working_days, holiday_days, working_hours_per_day,
        notes, data_creazione, utente_creazione
    )
    SELECT
        site.[new_id],
        src.[Year],
        src.[Month],
        ISNULL(src.[WorkingDays], 0),
        ISNULL(src.[HolidayDays], 0),
        ISNULL(
            (SELECT HoursPerDay FROM <<SOURCE_DB>>.[core].[SiteCalendars] sc2
              WHERE sc2.[Id] = src.[Id] AND COL_LENGTH('<<SOURCE_DB>>.core.SiteCalendars', 'HoursPerDay') IS NOT NULL),
            8.00
        ) AS working_hours_per_day,
        N'Migrated from legacy core.SiteCalendars',
        SYSUTCDATETIME(), 1
    FROM <<SOURCE_DB>>.[core].[SiteCalendars] src
    INNER JOIN [etl].[int_map] site ON site.entity_type = 'site' AND site.legacy_id = src.[Id_Site]
    WHERE NOT EXISTS (
        SELECT 1 FROM [cp].[resource_calendar] tgt
         WHERE tgt.site_id = site.[new_id]
           AND tgt.year_num = src.[Year]
           AND ISNULL(tgt.month_num, 0) = ISNULL(src.[Month], 0)
    );
    SET @inserted = @@ROWCOUNT;
    PRINT CONCAT('  resource_calendar migrated: ', @inserted, ' rows (working_hours_per_day default 8.00 dove mancante)');
END
ELSE
    PRINT '  [skip] SiteCalendars not present';

-- ─── Verification summary ────────────────────────────────────────────────────
DECLARE @summary NVARCHAR(MAX) = (SELECT
    (SELECT COUNT(*) FROM [cp].[exchange_rate]) AS exchange_rate_total,
    (SELECT COUNT(*) FROM [cp].[fte_hours]) AS fte_hours_total,
    (SELECT COUNT(*) FROM [cp].[hours_currency]) AS hours_currency_total,
    (SELECT COUNT(*) FROM [cp].[supplier_rate]) AS supplier_rate_total,
    (SELECT COUNT(*) FROM [cp].[resource_calendar]) AS resource_calendar_total,
    (SELECT COUNT(*) FROM [cp].[resource_calendar] WHERE working_hours_per_day <> 8.00) AS rc_non_default_hours,
    DATEDIFF(MILLISECOND, @t0, SYSUTCDATETIME()) AS elapsed_ms
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

EXEC [etl].[complete_phase] @phase_id = @phase_id, @rows_inserted = @inserted, @last_error = NULL;
PRINT '[phase98] summary: ' + @summary;
PRINT '[phase98] Legacy rates migration completed';
GO
