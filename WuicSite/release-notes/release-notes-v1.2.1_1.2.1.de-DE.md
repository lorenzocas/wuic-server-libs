# Release Notes — WUIC Framework v1.2.1

**Datum**: 31. Mai 2026
**Zuvor veröffentlichte Version**: 1.2.0 (27. Mai 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Wartungs-Release, fokussiert auf eine Klasse latenter Bugs, die `datetime`- und `decimal`-Felder in DBMS- und kulturübergreifenden Szenarien betrafen. Die meisten Anwender auf Workstations mit italienischer Locale waren mindestens einmal betroffen — die Zeitkomponente von Zeitstempeln wurde bei INSERT und UPDATE auf Mitternacht gekürzt, und Dezimalzahlen mit nicht-invariantem Trennzeichen erzeugten `ORA-01722` auf Oracle, sobald die ODP.NET-Session die italienische Windows-Kultur erbte.

Die Fixes betreffen alle 4 unterstützten Provider (MSSQL, MySQL, PostgreSQL, Oracle) und sämtliche End-to-End-Roundtrip-Tests laufen sowohl in englischer (`en-US`) als auch italienischer (`Italiano dmy`, `lc_time=Italian_Italy.1252`) DB-Sitzungs-Locale grün.

---

## 🐛 Bemerkenswerte Bugfixes

- **`time`-Komponente bei INSERT/UPDATE von `DATETIME2` / `DATETIME(n)` / `TIMESTAMP`-Feldern abgeschnitten**: Der Metadaten-Scaffolder fasste alle temporalen Quell-DB-Typen unter dem einzigen UI-Typ `date` zusammen. Folge: Eine SQL-Server-Spalte `DATETIME2(3)` (oder MySQL `DATETIME(3)`, PostgreSQL `timestamp without time zone`, Oracle `TIMESTAMP(0)`) wurde als reines Datum behandelt, und das Framework gab `'20261231'` statt `'20261231 23:59:58'` bei INSERT/UPDATE aus — die im UI eingegebene Uhrzeit ging beim Speichern verloren. Der Scaffolder unterscheidet jetzt `date` (reines Datum) von `datetime` (Datum + Uhrzeit), und das Speichern bewahrt die Zeitkomponente sekundengenau. Sub-Sekunden-Präzision (`.fff`) bleibt bewusst abgeschnitten, um Konsistenz mit dem UI-Datums-Zeit-Picker zu wahren, der sie nicht zugänglich macht.

- **Oracle `ORA-01722: ungültige Zahl` auf `NUMBER(p,s)`-Feldern von Workstations mit italienischer Locale**: Die Provider gaben numerische Werte als String-quoted in `INSERT`/`UPDATE` aus (z. B. `VALUES (..., '9876.4321', ...)`). Oracle konvertierte die Zeichenkette dann in eine Zahl mit dem Sitzungs-`NLS_NUMERIC_CHARACTERS`, das ODP.NET aus der .NET-Thread-`CurrentCulture` ableitet: Unter italienischer Kultur ist das Dezimaltrennzeichen `,` und `.` wird zum Gruppen-Trennzeichen → `'9876.4321'` wurde als ungültiger Gruppen-Ausdruck interpretiert. Numerische Werte (`decimal`, `float`, `double`, `numeric`) werden jetzt als nicht-quoted SQL-Literale emittiert: Oracle-Numerik-Literale verwenden immer `.` als Dezimalpunkt, unabhängig von NLS.

- **Oracle `ORA-00904: ungültiger Bezeichner` auf Tabellen mit quoted-lowercase-Bezeichnern**: Eine mit DDL `CREATE TABLE "my_table" ("id" NUMBER, ...)` erstellte Tabelle (lowercase-quoted, case-preserving) war vom Framework nicht lesbar. Die Quoting-Logik erkannte Mixed-Case und reservierte Schlüsselwörter, behandelte All-Lowercase-Bezeichner jedoch als "sicher" und gab sie unquoted aus (Oracle case-foldet bare Bezeichner zu UPPER), was zu einem Mismatch mit dem physischen `"id"` führte. All-Lowercase-Bezeichner werden jetzt mit explizitem Quoting bewahrt.

- **Locale-invariantes Parsing/Formatting von Daten und Zeitstempeln server-seitig**: Der `DateTime`-Parse-/Emit-Pfad auf Oracle und PostgreSQL nutzte die Thread-`CurrentCulture`. Das Parsing versucht jetzt zuerst `InvariantCulture` und fällt nur bei Bedarf auf `CurrentCulture` zurück; das Formatting für SQL-Klauseln (`TO_TIMESTAMP(...)` / `yyyy-MM-dd HH:mm:ss`-Literal) verwendet immer `InvariantCulture`. Nutzer-sichtbarer Effekt: Der Round-trip bleibt bit-perfect, unabhängig von `CultureInfo.CurrentCulture` des Backend-Prozesses.

- **Oracle `ORDER BY` auf Lowercase-PK**: Die automatisch hinzugefügte `ORDER BY`-Klausel auf dem Primärschlüssel emittierte den Spaltennamen, ohne die Quoting-Logik zu durchlaufen → `ORA-00904` auf Tabellen mit PK `"id"` lowercase-quoted. Der PK folgt jetzt demselben Quoting-Pfad wie jede andere Spalte.

---

## 🗄️ Cross-Locale-DB-Kompatibilität

Die End-to-End-Roundtrip-Tests decken jetzt folgende Provider × DB-Session-Kombinationen ab:

| Provider | Getestete DB-Session | Ergebnis |
|---|---|---|
| MSSQL | `@@LANGUAGE=Italian`, `date_format=dmy`, `Latin1_General_CI_AS` | OK |
| MySQL | `lc_time_names=en_US`, `utf8mb4_0900_ai_ci`, `time_zone=SYSTEM` | OK |
| PostgreSQL | `DateStyle=ISO,DMY`, `lc_time=Italian_Italy.1252` | OK |
| Oracle | `NLS_LANGUAGE=AMERICAN`, `NLS_TERRITORY=AMERICA`, `NLS_NUMERIC_CHARACTERS=.,` | OK |

Datumswerte werden als invariant end-to-end abgesichert (`2026-12-31T23:59:58.000` bleibt `2026-12-31T23:59:58.000`, unabhängig von DB-Session und Backend-CurrentCulture), ebenso Dezimalwerte (`9876.4321` bleibt `9876.4321`).

---

## 📦 Aktualisierte Pakete

| Package | Von | Auf |
|---|---|---|
| WuicCore | 1.2.0 | 1.2.1 |
| Wuic.Webcore | 1.2.0 | 1.2.1 |
| WuicOData | 1.2.0 | 1.2.1 |
| RuntimeEfCore | 1.2.0 | 1.2.1 |
| Wuic.MySqlProvider | 1.2.0 | 1.2.1 |
| Wuic.PostgresProvider | 1.2.0 | 1.2.1 |
| Wuic.OracleProvider | 1.2.0 | 1.2.1 |
| wuic-framework-lib (NPM) | 1.2.0 | 1.2.1 |

