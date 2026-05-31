# Release Notes — WUIC Framework v1.2.1

**Data**: 31 maggio 2026
**Versione precedente pubblicata**: 1.2.0 (27 maggio 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Release di manutenzione focalizzata su una classe di bug latenti che si manifestavano sui campi `datetime` e `decimal` in scenari cross-DBMS / cross-locale. La maggior parte degli utenti su workstation IT ne è già stata toccata almeno una volta — il componente time delle date veniva troncato a mezzanotte su INSERT e UPDATE, e i decimali con separatore non invariante producevano `ORA-01722` su Oracle quando la sessione ODP.NET ereditava la cultura italiana di Windows.

I fix sono trasversali ai 4 provider supportati (MSSQL, MySQL, PostgreSQL, Oracle) e tutti i test di round-trip end-to-end risultano verdi nelle locale di sessione DB inglese (`en-US`) e italiana (`Italiano dmy`, `lc_time=Italian_Italy.1252`).

---

## 🐛 Bug fix degni di nota

- **Componente `time` troncato su INSERT/UPDATE di campi `DATETIME2` / `DATETIME(n)` / `TIMESTAMP`**: lo scaffolder dei metadati collassava tutti i tipi temporali del DB sorgente sul singolo tipo UI `date`. Risultato: una colonna SQL Server `DATETIME2(3)` (o MySQL `DATETIME(3)`, PostgreSQL `timestamp without time zone`, Oracle `TIMESTAMP(0)`) veniva trattata come pura data e il framework emetteva `'20261231'` invece di `'20261231 23:59:58'` su INSERT/UPDATE — l'orario inserito a UI si perdeva al salvataggio. Lo scaffolder ora distingue `date` (data pura) da `datetime` (data + ora) e il salvataggio preserva il componente time con precisione al secondo. La precisione sotto-secondo (`.fff`) resta troncata intenzionalmente per coerenza col date-time picker UI che non la espone.

- **Oracle `ORA-01722: valore stringa non valido` su campi `NUMBER(p,s)` da workstation italiana**: i provider emettevano i valori numerici quotati come stringa nelle `INSERT`/`UPDATE` (es. `VALUES (..., '9876.4321', ...)`). Oracle convertiva la stringa in numero usando `NLS_NUMERIC_CHARACTERS` della sessione, che ODP.NET deriva dalla `CurrentCulture` del thread .NET: in culture italiana il decimal è `,` e `.` diventa group separator → `'9876.4321'` veniva interpretato come gruppo invalido. Ora i valori numerici (`decimal`, `float`, `double`, `numeric`) sono emessi come literal SQL non quotati: i literal numerici Oracle usano sempre `.` come decimal point indipendentemente da NLS.

- **Oracle `ORA-00904: identificativo non valido` su tabelle con identificatori quoted-lowercase**: una tabella creata con DDL `CREATE TABLE "my_table" ("id" NUMBER, ...)` (lowercase quoted, case-preserving) non era leggibile dal framework. La logica di quoting riconosceva i mixed-case e i reserved keywords ma trattava gli all-lower come "safe identifier" e li emetteva bare (Oracle li case-folda a UPPER), causando il mismatch con la fisica `"id"`. Ora gli identificatori all-lowercase vengono preservati con quoting esplicito.

- **Locale-invariant parsing/formatting di date e timestamp lato server**: il path di parsing/emit di `DateTime` su Oracle e PostgreSQL usava la `CurrentCulture` del thread. Ora il parsing tenta prima `InvariantCulture` e fa fallback a `CurrentCulture` solo se serve; il formatting per le clausole SQL (`TO_TIMESTAMP(...)` / literal `yyyy-MM-dd HH:mm:ss`) usa sempre `InvariantCulture`. Effetto utente: il round-trip rimane bit-perfect indipendentemente da `CultureInfo.CurrentCulture` del processo backend.

- **Oracle `ORDER BY` su PK lowercase**: la clausola `ORDER BY` aggiunta automaticamente sulla chiave primaria emetteva il nome colonna senza passare per la logica di quoting → produceva `ORA-00904` su tabelle con PK `"id"` lowercase quoted. Ora la PK passa per lo stesso quoting di tutte le altre colonne.

---

## 🗄️ Compatibilità DB cross-locale

I test di roundtrip end-to-end coprono ora le seguenti combinazioni provider × sessione DB:

| Provider | Sessione DB testata | Esito |
|---|---|---|
| MSSQL | `@@LANGUAGE=Italiano`, `date_format=dmy`, `Latin1_General_CI_AS` | OK |
| MySQL | `lc_time_names=en_US`, `utf8mb4_0900_ai_ci`, `time_zone=SYSTEM` | OK |
| PostgreSQL | `DateStyle=ISO,DMY`, `lc_time=Italian_Italy.1252` | OK |
| Oracle | `NLS_LANGUAGE=AMERICAN`, `NLS_TERRITORY=AMERICA`, `NLS_NUMERIC_CHARACTERS=.,` | OK |

Le date sono asserite invarianti (`2026-12-31T23:59:58.000` resta `2026-12-31T23:59:58.000` end-to-end indipendentemente da sessione DB e CurrentCulture del backend), così come i decimali (`9876.4321` resta `9876.4321`).

---

## 📦 Pacchetti aggiornati

| Package | Da | A |
|---|---|---|
| WuicCore | 1.2.0 | 1.2.1 |
| Wuic.Webcore | 1.2.0 | 1.2.1 |
| WuicOData | 1.2.0 | 1.2.1 |
| RuntimeEfCore | 1.2.0 | 1.2.1 |
| Wuic.MySqlProvider | 1.2.0 | 1.2.1 |
| Wuic.PostgresProvider | 1.2.0 | 1.2.1 |
| Wuic.OracleProvider | 1.2.0 | 1.2.1 |
| wuic-framework-lib (NPM) | 1.2.0 | 1.2.1 |

