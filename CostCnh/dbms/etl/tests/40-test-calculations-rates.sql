-- =============================================================================
-- E2E Test — Calculations: rates + currency conversions + FTE-to-cost
-- =============================================================================
-- Pattern: insert controlled SEED data → call computation TVF/SP → assert numeric
-- result con tolerance. Cleanup post-scenario via savepoint OR DELETE WHERE flag.
--
-- Placeholders:
--   <<TEST_RUN_ID>>   — BIGINT
-- =============================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE [CostCnh_Data];
GO

DECLARE @tr BIGINT = <<TEST_RUN_ID>>;
DECLARE @c1 DECIMAL(38,4), @c2 DECIMAL(38,4), @c3 DECIMAL(38,4);

-- ─── Setup test currencies (idempotent insert) ───────────────────────────────
DECLARE @eur INT, @usd INT, @cny INT, @gbp INT;
SELECT @eur = id FROM [core].[currency] WHERE code = 'EUR';
SELECT @usd = id FROM [core].[currency] WHERE code = 'USD';
SELECT @cny = id FROM [core].[currency] WHERE code = 'CNY';

IF @eur IS NULL OR @usd IS NULL
BEGIN
    INSERT INTO [tt].[test_result] (test_run_id, category, test_name, status, message)
    VALUES (@tr, 'calculations', 'rates setup', 'skip', 'EUR/USD missing in core.currency — cannot run calc tests');
    PRINT '[calc] skipping: EUR/USD not in core.currency';
    RETURN;
END

-- NOTE: usiamo year 2099 per isolare i test da rates reali esistenti nel DB
-- (anno futuro lontano, no conflitti UNIQUE su (from, to, valid_from)).

-- ─── A. Same-currency conversion = identity ──────────────────────────────────
SELECT TOP 1 @c1 = converted_amount FROM [cp].[fn_convert_currency](100.0000, @eur, @eur, '2099-06-01');
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='calculations',
     @test_name=N'fn_convert_currency: same-currency EUR→EUR returns input',
     @expected=100.0000, @actual=@c1, @tolerance=0.0001;

SELECT TOP 1 @c1 = converted_amount FROM [cp].[fn_convert_currency](999.9999, @usd, @usd, '2099-12-31');
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='calculations',
     @test_name=N'fn_convert_currency: same-currency USD→USD returns input',
     @expected=999.9999, @actual=@c1, @tolerance=0.0001;

-- ─── B. NULL input → NULL output ─────────────────────────────────────────────
SELECT TOP 1 @c1 = ISNULL(converted_amount, -999999) FROM [cp].[fn_convert_currency](NULL, @eur, @usd, '2099-06-01');
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='calculations',
     @test_name=N'fn_convert_currency: NULL amount → NULL result (-999999 marker)',
     @expected=-999999, @actual=@c1, @tolerance=0.0001;

-- ─── C. Known rate verification (year 2099 to avoid conflicts) ───────────────
-- Insert isolated test rates (use marker source='_test_calc_' for cleanup)
DELETE FROM [cp].[exchange_rate] WHERE source = '_test_calc_';

INSERT INTO [cp].[exchange_rate] (from_currency_id, to_currency_id, valid_from, valid_to, rate, source, data_creazione, utente_creazione) VALUES
    (@eur, @usd, '2098-01-01', '2099-01-01', 1.10, '_test_calc_', SYSUTCDATETIME(), 1),
    (@eur, @usd, '2099-01-01', NULL,         1.08, '_test_calc_', SYSUTCDATETIME(), 1),
    (@usd, @eur, '2099-01-01', NULL,         0.9259, '_test_calc_', SYSUTCDATETIME(), 1);

-- C.1 — 100 EUR @ 2099-06-01 (1.08 rate) → 108 USD
SELECT TOP 1 @c1 = converted_amount FROM [cp].[fn_convert_currency](100.0000, @eur, @usd, '2099-06-01');
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='calculations',
     @test_name=N'fn_convert_currency: 100 EUR @ 2099-06-01 (rate 1.08) → 108 USD',
     @expected=108.0000, @actual=@c1, @tolerance=0.0001;

-- C.2 — 100 EUR @ 2098-06-01 (1.10 rate) → 110 USD (historic rate)
SELECT TOP 1 @c1 = converted_amount FROM [cp].[fn_convert_currency](100.0000, @eur, @usd, '2098-06-01');
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='calculations',
     @test_name=N'fn_convert_currency: 100 EUR @ 2098-06-01 (historic rate 1.10) → 110 USD',
     @expected=110.0000, @actual=@c1, @tolerance=0.0001;

-- C.3 — Date pre-test-range → fallback su rate reale del DB (1.10 ECB), test conservativo
-- Verifichiamo solo che NOT NULL (rate DB esistente per data passata, ma cancellabile)
-- → Skip per assertion strict; test soft solo per F/G dipendenze.
SELECT TOP 1 @c1 = ISNULL(converted_amount, -999999) FROM [cp].[fn_convert_currency](100.0000, @eur, @usd, '1900-01-01');
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='calculations',
     @test_name=N'fn_convert_currency: very-old date (1900) returns NULL marker (no rate covers it)',
     @expected=-999999, @actual=@c1, @tolerance=0.0001;

-- ─── D. Round-trip: EUR→USD→EUR should approximately equal original ──────────
SELECT TOP 1 @c1 = converted_amount FROM [cp].[fn_convert_currency](1000.0000, @eur, @usd, '2099-06-01');   -- 1080
SELECT TOP 1 @c2 = converted_amount FROM [cp].[fn_convert_currency](@c1, @usd, @eur, '2099-06-01');         -- 1080*0.9259≈1000
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='calculations',
     @test_name=N'fn_convert_currency: round-trip EUR→USD→EUR ≈ original (rates inverse)',
     @expected=1000.0000, @actual=@c2, @tolerance=1.0000;     -- allow 1.0 unit tolerance per rounding

-- ─── E. Strict missing-rate via sp_convert_currency (RAISERROR W0.3) ─────────
-- Test che sp_convert_currency lancia errore se rate missing
DECLARE @missing_err NVARCHAR(400) = NULL;
DECLARE @out_c DECIMAL(19,4), @out_r DECIMAL(19,8);
BEGIN TRY
    EXEC [cp].[sp_convert_currency] @amount=100, @from_currency_id=@eur, @to_currency_id=999, -- invalid target
        @as_of_date='2026-01-01', @converted=@out_c OUTPUT, @effective_rate=@out_r OUTPUT;
END TRY
BEGIN CATCH
    SET @missing_err = ERROR_MESSAGE();
END CATCH;
DECLARE @raised BIGINT = CASE WHEN @missing_err LIKE 'Missing exchange rate%' THEN 1 ELSE 0 END;
EXEC [tt].[assert_equal] @run_id=@tr, @category='calculations',
     @test_name=N'sp_convert_currency: RAISERROR strict on missing rate (W0.3=a)',
     @expected=1, @actual=@raised;

-- ─── F. fn_fte_to_cost — controlled scenario ──────────────────────────────────
-- Setup: role TEST_FTE, year 2026, currency EUR, no site (legacy path fte_hours).
-- Insert: fte_hours(TEST_FTE, 2026, 2000), hours_currency(EUR, 2026, 50).
-- Expected: fte=50% × 2000 = 1000 hours × 50 = 50000 cost.
DELETE FROM [cp].[fte_hours] WHERE role_code = 'TEST_FTE';
DELETE FROM [cp].[hours_currency] WHERE currency_id = @eur AND year_num = 2099;  -- isolate test year

INSERT INTO [cp].[fte_hours] (role_code, year_num, hours_per_fte, notes, data_creazione, utente_creazione)
    VALUES ('TEST_FTE', 2099, 2000.00, '_test_calc_', SYSUTCDATETIME(), 1);
INSERT INTO [cp].[hours_currency] (currency_id, year_num, hourly_rate, notes, data_creazione, utente_creazione)
    VALUES (@eur, 2099, 50.0000, '_test_calc_', SYSUTCDATETIME(), 1);

DECLARE @hrs DECIMAL(11,2), @cost DECIMAL(19,4);
SELECT TOP 1 @hrs = computed_hours, @cost = computed_cost
  FROM [cp].[fn_fte_to_cost](50.00, 'TEST_FTE', 2099, @eur, NULL);
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='calculations',
     @test_name=N'fn_fte_to_cost: fte=50%, hours_per_fte=2000 → computed_hours=1000',
     @expected=1000.00, @actual=@hrs, @tolerance=0.01;
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='calculations',
     @test_name=N'fn_fte_to_cost: 1000h × 50/h → 50000 cost',
     @expected=50000.00, @actual=@cost, @tolerance=0.01;

-- F.2 — Vary FTE percentage
SELECT TOP 1 @cost = computed_cost FROM [cp].[fn_fte_to_cost](100.00, 'TEST_FTE', 2099, @eur, NULL);
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='calculations',
     @test_name=N'fn_fte_to_cost: fte=100% → 100000 cost (double of fte=50%)',
     @expected=100000.00, @actual=@cost, @tolerance=0.01;

SELECT TOP 1 @cost = computed_cost FROM [cp].[fn_fte_to_cost](25.00, 'TEST_FTE', 2099, @eur, NULL);
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='calculations',
     @test_name=N'fn_fte_to_cost: fte=25% → 25000 cost (linear scale)',
     @expected=25000.00, @actual=@cost, @tolerance=0.01;

-- F.3 — Resource calendar path (priority over fte_hours)
DELETE FROM [cp].[resource_calendar] WHERE year_num = 2099 AND notes = '_test_calc_';
DECLARE @testSite INT = (SELECT TOP 1 id FROM [core].[site]);
-- 12 months × 20 working_days × 9 hours_per_day = 2160 hours/year
INSERT INTO [cp].[resource_calendar] (site_id, year_num, month_num, working_days, holiday_days, working_hours_per_day, notes, data_creazione, utente_creazione)
SELECT @testSite, 2099, m.month_num, 20, 0, 9.00, '_test_calc_', SYSUTCDATETIME(), 1
  FROM (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12)) AS m(month_num);

SELECT TOP 1 @hrs = computed_hours, @cost = computed_cost
  FROM [cp].[fn_fte_to_cost](50.00, 'TEST_FTE', 2099, @eur, @testSite);
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='calculations',
     @test_name=N'fn_fte_to_cost: resource_calendar priority (12×20×9 = 2160h)',
     @expected=1080.00, @actual=@hrs, @tolerance=0.01;   -- 50% × 2160 = 1080
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='calculations',
     @test_name=N'fn_fte_to_cost: 1080h × 50/h = 54000 cost (via resource_calendar)',
     @expected=54000.00, @actual=@cost, @tolerance=0.01;

-- ─── G. fn_supplier_cost — controlled scenario ───────────────────────────────
DELETE FROM [cp].[supplier_rate] WHERE supplier_code = '_TEST_SUP_';

INSERT INTO [cp].[supplier_rate] (supplier_code, supplier_name, currency_id, year_num, rate, markup_pct, notes, data_creazione, utente_creazione)
    VALUES ('_TEST_SUP_', 'Test Supplier', @eur, 2099, 100.0000, 10.00, '_test_calc_', SYSUTCDATETIME(), 1);

-- EUR→USD rate per 2099-06-01 già esistente dal blocco C (rate=1.08); riusiamolo.

DECLARE @raw DECIMAL(19,4), @conv DECIMAL(19,4);
SELECT TOP 1 @raw = raw_cost, @conv = converted_cost
  FROM [cp].[fn_supplier_cost](10.0000, '_TEST_SUP_', 2099, @usd, '2099-06-01');

-- Expected: raw = 10 * 100 * 1.10 = 1100 EUR; converted = 1100 * 1.08 = 1188 USD
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='calculations',
     @test_name=N'fn_supplier_cost: qty=10 × rate=100 × markup=1.10 → raw_cost=1100 EUR',
     @expected=1100.00, @actual=@raw, @tolerance=0.01;
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='calculations',
     @test_name=N'fn_supplier_cost: 1100 EUR × rate=1.08 (from C-block) → 1188 USD',
     @expected=1188.00, @actual=@conv, @tolerance=0.01;

-- ─── Cleanup test seed ───────────────────────────────────────────────────────
DELETE FROM [cp].[exchange_rate]    WHERE source = '_test_calc_';
DELETE FROM [cp].[fte_hours]        WHERE notes = '_test_calc_' OR role_code = 'TEST_FTE';
DELETE FROM [cp].[hours_currency]   WHERE notes = '_test_calc_';
DELETE FROM [cp].[supplier_rate]    WHERE supplier_code = '_TEST_SUP_';
DELETE FROM [cp].[resource_calendar] WHERE notes = '_test_calc_';

PRINT '[tt-calculations-rates] all asserts executed for run_id=' + CAST(@tr AS NVARCHAR(10));
GO
