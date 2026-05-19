# Release Notes — WUIC Framework v1.2.0

**Data**: 19 maggio 2026
**Versione precedente pubblicata**: 1.1.0 (13 maggio 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Questa release estende il framework a due nuovi DBMS — PostgreSQL e Oracle — e corregge un bug del filtro Spreadsheet che si manifestava quando una route con server-side operations attive aveva colonne lookup.

- **Provider PostgreSQL** e **Provider Oracle**: entrambi installabili come drop-in (`postgresql.dll` / `oracle.dll` accanto a `WuicCore.dll`), utilizzabili sia come data store sia come metadata store, con feature parity con MSSQL e MySQL.
- **Filtro Spreadsheet su colonne lookup** in modalità server-side: il popup ora mostra i descrittivi delle lookup (es. `Woodgrove Bank Crandon Lakes`) e applica il filtro usando l'ID di chiave esterna, eliminando l'errore SQL che si presentava su provider con typing stretto.

---

## 🗄️ Provider PostgreSQL

Drop-in compatibile con PostgreSQL 14+ (testato su 16). Installazione: `postgresql.dll` accanto a `WuicCore.dll` nella physical path del sito IIS, o nella directory di publish del binario Linux. Il setup wizard `firstRun` espone automaticamente "PostgreSQL" nel dropdown DBMS quando rileva la presenza della DLL.

**Coverage funzionale.** Tutte le superfici core del framework operano nativamente su PG con la stessa semantica delle release MSSQL/MySQL: CRUD, server-side paging, sorting, grouping, aggregazioni, autocomplete lookup, OData, scheduled jobs, audit, notifiche, retry policy, ottimistic concurrency, validations, callbacks/events, import/export XLS, import/export PDF, multi-tenant.

**Tipi PG-specific supportati.** `boolean` (mappato automaticamente da/per `smallint` storage interno usato per parity con MSSQL/MySQL), `varchar`/`text`, `numeric`, `integer`/`bigint`, `timestamp`, `date`, `bytea` (upload binari), `geometry` (PostGIS — visualizzazione su mappe via `ST_AsText`).

**File preconfigurati nel pacchetto.**

- `appsettings.postgres.json` / `appsettings.linux.postgres.json` / `appsettings.multi-tenant.postgres.json` — environment self-contained pronti, attivabili con `ASPNETCORE_ENVIRONMENT=postgres`.
- `dbms/scripts/first-run/*.postgres.sql` — bootstrap metadata + tutorial WideWorldImporters DDL/DML.

## 🗄️ Provider Oracle

Drop-in compatibile con Oracle 19c / 21c / Free 23c. Installazione `oracle.dll` con la stessa modalità del provider PostgreSQL; "Oracle" appare nel dropdown firstRun automaticamente.

**Coverage funzionale.** Identica a PostgreSQL — tutte le superfici core con la stessa semantica delle release MSSQL/MySQL.

**Identifier length.** Oracle 11g/12.1 (max 30 char) non è ancora supportato — i lookup alias generati dal framework eccedono il limite. Oracle 12.2+ (128 char) è il floor di supporto.

**File preconfigurati nel pacchetto.**

- `appsettings.oracle.json` / `appsettings.linux.oracle.json` / `appsettings.multi-tenant.oracle.json`.
- `dbms/scripts/first-run/*.oracle.sql` — bootstrap metadata + tutorial.

---

## 🐛 Bug fix degni di nota

- **Filtro popup Spreadsheet su colonne lookup quando `md_server_side_operations=true`**: il popup colonna funnel di `<wuic-list-spreadsheet>` su una colonna `lookupByID` mostrava ID numerici nudi (es. `1, 4, 5`) invece dei descrittivi (es. `Woodgrove Bank Crandon Lakes`). Su PG/Oracle l'applicazione del filtro generava un errore SQL (`42601 ilike %%` su PostgreSQL, `ORA-00904` su Oracle) perché il client trasmetteva la stringa descrittiva contro la colonna FK numerica. Ora il server emette il descrittivo joinato (`<entity>___<dataTextField>__<colName>`) accanto al FK ID e il client visualizza il descrittivo nel popup ma trasmette l'ID raw come filter value: la `WHERE col = <id>` rimane numerica e cross-DBMS-safe. Nessuna azione richiesta lato consumer.

---

## 📦 Pacchetti aggiornati

| Package | Da | A |
|---|---|---|
| WuicCore | 1.1.0 | 1.2.0 |
| Wuic.Webcore | 1.1.0 | 1.2.0 |
| WuicOData | 1.1.0 | 1.2.0 |
| RuntimeEfCore | 1.1.0 | 1.2.0 |
| Wuic.MySqlProvider | 1.1.0 | 1.2.0 |
| Wuic.PostgresProvider | — | 1.2.0 |
| Wuic.OracleProvider | — | 1.2.0 |
| wuic-framework-lib (NPM) | 1.1.0 | 1.2.0 |

---

## 🔧 Aggiornamenti operativi raccomandati per chi aggiorna

1. **Per chi resta su MSSQL o MySQL**: nessuna azione richiesta. Il fix del filtro Spreadsheet si applica a tutti i provider in modo trasparente al primo refresh del client.
2. **Per attivare PostgreSQL**: copiare `postgresql.dll` (insieme alle sue dipendenze runtime — `Npgsql.dll`, `Npgsql.EntityFrameworkCore.PostgreSQL.dll`, `Microsoft.Extensions.Logging.Abstractions.dll`) nella physical path del sito IIS o nella directory di publish Linux, riavviare il backend. Selezionare PostgreSQL nel wizard firstRun oppure puntare `ASPNETCORE_ENVIRONMENT=postgres` per usare `appsettings.postgres.json` preconfigurato.
3. **Per attivare Oracle**: stessa procedura — `oracle.dll` + `Oracle.EntityFrameworkCore.dll` + `Oracle.ManagedDataAccess.dll`. Verificare che la versione del DB target sia ≥ 12.2 (vincolo identifier length).
4. **Cache client**: dopo l'aggiornamento, un hard refresh del browser (`Ctrl+F5`) è sufficiente per allineare il client al nuovo contratto del filtro popup. Nessuna invalidazione metadata server richiesta.
