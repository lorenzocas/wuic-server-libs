# Release Notes — WUIC Framework v1.2.1

**Date**: 31 May 2026
**Previously published version**: 1.2.0 (27 May 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Maintenance release focused on a class of latent bugs affecting `datetime` and `decimal` fields under cross-DBMS / cross-locale scenarios. Most users on Italian-locale workstations have been hit at least once — the time component of timestamps was being truncated to midnight on INSERT and UPDATE, and decimals with non-invariant separators produced `ORA-01722` on Oracle whenever the ODP.NET session inherited Windows' Italian culture.

The fixes are transverse to the 4 supported providers (MSSQL, MySQL, PostgreSQL, Oracle) and all end-to-end roundtrip tests pass under both English (`en-US`) and Italian (`Italiano dmy`, `lc_time=Italian_Italy.1252`) DB session locales.

---

## 🐛 Notable bug fixes

- **`time` component truncated on INSERT/UPDATE of `DATETIME2` / `DATETIME(n)` / `TIMESTAMP` fields**: the metadata scaffolder collapsed every temporal source-DB type onto the single UI type `date`. As a result, a SQL Server `DATETIME2(3)` column (or MySQL `DATETIME(3)`, PostgreSQL `timestamp without time zone`, Oracle `TIMESTAMP(0)`) was treated as a pure date, and the framework emitted `'20261231'` instead of `'20261231 23:59:58'` on INSERT/UPDATE — the time entered through the UI was lost on save. The scaffolder now distinguishes `date` (pure date) from `datetime` (date + time) and the save preserves the time component down to second precision. Sub-second precision (`.fff`) remains intentionally truncated to keep consistency with the UI date-time picker, which does not expose it.

- **Oracle `ORA-01722: invalid number` on `NUMBER(p,s)` fields from Italian-locale workstations**: the providers were emitting numeric values quoted as strings in `INSERT`/`UPDATE` (e.g. `VALUES (..., '9876.4321', ...)`). Oracle then converted the string to a number using the session's `NLS_NUMERIC_CHARACTERS`, which ODP.NET derives from the .NET thread `CurrentCulture`: under Italian culture the decimal separator is `,` and `.` becomes the group separator → `'9876.4321'` was parsed as an invalid group expression. Numeric values (`decimal`, `float`, `double`, `numeric`) are now emitted as unquoted SQL literals: Oracle numeric literals always use `.` as the decimal point regardless of NLS.

- **Oracle `ORA-00904: invalid identifier` on tables with quoted-lowercase identifiers**: a table created with DDL `CREATE TABLE "my_table" ("id" NUMBER, ...)` (lowercase quoted, case-preserving) was unreadable by the framework. The quoting logic recognised mixed-case and reserved keywords but treated all-lowercase identifiers as "safe" and emitted them bare (Oracle case-folds bare identifiers to UPPER), causing a mismatch with the physical `"id"`. All-lowercase identifiers are now preserved with explicit quoting.

- **Locale-invariant parsing/formatting of dates and timestamps server-side**: the `DateTime` parse/emit path on Oracle and PostgreSQL was using the thread `CurrentCulture`. Parsing now tries `InvariantCulture` first and falls back to `CurrentCulture` only when needed; formatting for SQL clauses (`TO_TIMESTAMP(...)` / `yyyy-MM-dd HH:mm:ss` literal) always uses `InvariantCulture`. User-visible effect: the round-trip remains bit-perfect regardless of the backend process `CultureInfo.CurrentCulture`.

- **Oracle `ORDER BY` on lowercase PK**: the automatic `ORDER BY` clause on the primary key was emitting the column name without going through the quoting logic → `ORA-00904` on tables with PK `"id"` lowercase quoted. The PK now follows the same quoting path as every other column.

---

## 🗄️ Cross-locale DB compatibility

End-to-end roundtrip tests now cover the following provider × DB session combinations:

| Provider | Tested DB session | Result |
|---|---|---|
| MSSQL | `@@LANGUAGE=Italian`, `date_format=dmy`, `Latin1_General_CI_AS` | OK |
| MySQL | `lc_time_names=en_US`, `utf8mb4_0900_ai_ci`, `time_zone=SYSTEM` | OK |
| PostgreSQL | `DateStyle=ISO,DMY`, `lc_time=Italian_Italy.1252` | OK |
| Oracle | `NLS_LANGUAGE=AMERICAN`, `NLS_TERRITORY=AMERICA`, `NLS_NUMERIC_CHARACTERS=.,` | OK |

Date values are asserted invariant end-to-end (`2026-12-31T23:59:58.000` stays `2026-12-31T23:59:58.000` regardless of DB session and backend CurrentCulture), as are decimals (`9876.4321` stays `9876.4321`).

---

## 📦 Updated packages

| Package | From | To |
|---|---|---|
| WuicCore | 1.2.0 | 1.2.1 |
| Wuic.Webcore | 1.2.0 | 1.2.1 |
| WuicOData | 1.2.0 | 1.2.1 |
| RuntimeEfCore | 1.2.0 | 1.2.1 |
| Wuic.MySqlProvider | 1.2.0 | 1.2.1 |
| Wuic.PostgresProvider | 1.2.0 | 1.2.1 |
| Wuic.OracleProvider | 1.2.0 | 1.2.1 |
| wuic-framework-lib (NPM) | 1.2.0 | 1.2.1 |

