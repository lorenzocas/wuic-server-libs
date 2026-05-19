# Notas de la versión — WUIC Framework v1.2.0

**Fecha**: 19 de mayo de 2026
**Versión publicada anterior**: 1.1.0 (13 de mayo de 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Esta versión extiende el framework a dos nuevos DBMS — PostgreSQL y Oracle — y corrige un bug del filtro de Spreadsheet que aparecía en rutas con server-side operations habilitadas cuando la columna era de tipo lookup.

- **Proveedor PostgreSQL** y **Proveedor Oracle**: ambos instalables como drop-in (`postgresql.dll` / `oracle.dll` junto a `WuicCore.dll`), utilizables como data store o como metadata store, con paridad de features respecto a MSSQL y MySQL.
- **Filtro Spreadsheet en columnas lookup** en modo server-side: el popup ahora muestra los descriptores de la lookup (p. ej., `Woodgrove Bank Crandon Lakes`) y aplica el filtro usando el ID de clave foránea, eliminando el error SQL que generaban los proveedores con tipado estricto.

---

## 🗄️ Proveedor PostgreSQL

Drop-in compatible con PostgreSQL 14+ (probado en 16). Instalación: colocar `postgresql.dll` junto a `WuicCore.dll` en el physical path del sitio IIS, o en el directorio de publish del binario Linux. El wizard de setup `firstRun` expone automáticamente "PostgreSQL" en el dropdown DBMS cuando detecta la DLL.

**Cobertura funcional.** Todas las superficies core del framework operan nativamente sobre PG con la misma semántica que las versiones MSSQL/MySQL: CRUD, server-side paging, sorting, grouping, agregaciones, lookup autocomplete, OData, scheduled jobs, audit, notificaciones, retry policy, concurrencia optimista, validations, callbacks/events, importación/exportación XLS, exportación PDF, multi-tenant.

**Tipos PG-específicos soportados.** `boolean` (mapeado automáticamente desde/hacia el almacenamiento interno `smallint` usado para paridad con MSSQL/MySQL), `varchar`/`text`, `numeric`, `integer`/`bigint`, `timestamp`, `date`, `bytea` (upload binario), `geometry` (PostGIS — visualización en mapas vía `ST_AsText`).

**Archivos preconfigurados en el paquete.**

- `appsettings.postgres.json` / `appsettings.linux.postgres.json` / `appsettings.multi-tenant.postgres.json` — entornos self-contained listos, activables con `ASPNETCORE_ENVIRONMENT=postgres`.
- `dbms/scripts/first-run/*.postgres.sql` — bootstrap de metadata + DDL/DML del tutorial WideWorldImporters.

## 🗄️ Proveedor Oracle

Drop-in compatible con Oracle 19c / 21c / Free 23c. Instalación `oracle.dll` con el mismo procedimiento del proveedor PostgreSQL; "Oracle" aparece automáticamente en el dropdown firstRun.

**Cobertura funcional.** Idéntica a PostgreSQL — todas las superficies core con la misma semántica que las versiones MSSQL/MySQL.

**Longitud de identificadores.** Oracle 11g/12.1 (máx. 30 caracteres) aún no está soportado — los alias lookup generados por el framework exceden el límite. Oracle 12.2+ (128 caracteres) es el mínimo soportado.

**Archivos preconfigurados en el paquete.**

- `appsettings.oracle.json` / `appsettings.linux.oracle.json` / `appsettings.multi-tenant.oracle.json`.
- `dbms/scripts/first-run/*.oracle.sql` — bootstrap de metadata + tutorial.

---

## 🐛 Bug fixes destacados

- **Filtro popup Spreadsheet en columnas lookup cuando `md_server_side_operations=true`**: el popup de columna funnel de `<wuic-list-spreadsheet>` en una columna `lookupByID` mostraba IDs numéricos desnudos (p. ej., `1, 4, 5`) en lugar de los descriptores (p. ej., `Woodgrove Bank Crandon Lakes`). En PG/Oracle la aplicación del filtro generaba un error SQL (`42601 ilike %%` en PostgreSQL, `ORA-00904` en Oracle) porque el cliente transmitía la cadena descriptora contra la columna FK numérica. El servidor ahora emite el descriptor joinado (`<entity>___<dataTextField>__<colName>`) junto al FK ID y el cliente visualiza el descriptor en el popup pero transmite el ID raw como filter value: el `WHERE col = <id>` permanece numérico y cross-DBMS-safe. No se requiere acción del lado consumer.

---

## 📦 Paquetes actualizados

| Package | De | A |
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

## 🔧 Actualizaciones operativas recomendadas para quien actualiza

1. **Para usuarios de MSSQL o MySQL**: ninguna acción requerida. El fix del filtro Spreadsheet se aplica a todos los proveedores de forma transparente tras el primer refresh del cliente.
2. **Para activar PostgreSQL**: copiar `postgresql.dll` (junto con sus dependencias de runtime — `Npgsql.dll`, `Npgsql.EntityFrameworkCore.PostgreSQL.dll`, `Microsoft.Extensions.Logging.Abstractions.dll`) al physical path del sitio IIS o al directorio de publish Linux, reiniciar el backend. Seleccionar PostgreSQL en el wizard firstRun, o apuntar `ASPNETCORE_ENVIRONMENT=postgres` para usar `appsettings.postgres.json` preconfigurado.
3. **Para activar Oracle**: mismo procedimiento — `oracle.dll` + `Oracle.EntityFrameworkCore.dll` + `Oracle.ManagedDataAccess.dll`. Verificar que la versión del DB target sea ≥ 12.2 (constraint de longitud de identificadores).
4. **Cache del cliente**: tras la actualización, un hard refresh del navegador (`Ctrl+F5`) es suficiente para alinear el cliente con el nuevo contrato del filtro popup. No se requiere invalidación de metadata en el servidor.
