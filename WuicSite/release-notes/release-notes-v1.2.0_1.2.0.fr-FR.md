# Notes de version — WUIC Framework v1.2.0

**Date**: 19 mai 2026
**Version publiée précédente**: 1.1.0 (13 mai 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Cette version étend le framework à deux nouveaux SGBD — PostgreSQL et Oracle — et corrige un bug du filtre Spreadsheet qui apparaissait sur les routes avec server-side operations activées lorsque la colonne était de type lookup.

- **Provider PostgreSQL** et **Provider Oracle**: tous deux installables en drop-in (`postgresql.dll` / `oracle.dll` à côté de `WuicCore.dll`), utilisables comme data store ou comme metadata store, avec parité fonctionnelle vis-à-vis de MSSQL et MySQL.
- **Filtre Spreadsheet sur colonnes lookup** en mode server-side: le popup affiche maintenant les descripteurs de la lookup (par ex. `Woodgrove Bank Crandon Lakes`) et applique le filtre en utilisant l'ID de clé étrangère, éliminant l'erreur SQL que les providers à typage strict produisaient.

---

## 🗄️ Provider PostgreSQL

Drop-in compatible avec PostgreSQL 14+ (testé sur 16). Installation: déposer `postgresql.dll` à côté de `WuicCore.dll` dans le physical path du site IIS, ou dans le répertoire de publish du binaire Linux. Le wizard de setup `firstRun` expose automatiquement "PostgreSQL" dans le dropdown DBMS dès qu'il détecte la DLL.

**Couverture fonctionnelle.** Toutes les surfaces core du framework opèrent nativement sur PG avec la même sémantique que les versions MSSQL/MySQL: CRUD, server-side paging, sorting, grouping, agrégations, lookup autocomplete, OData, scheduled jobs, audit, notifications, retry policy, concurrence optimiste, validations, callbacks/events, import/export XLS, export PDF, multi-tenant.

**Types PG-spécifiques supportés.** `boolean` (mappé automatiquement depuis/vers le stockage interne `smallint` utilisé pour la parité avec MSSQL/MySQL), `varchar`/`text`, `numeric`, `integer`/`bigint`, `timestamp`, `date`, `bytea` (upload binaire), `geometry` (PostGIS — affichage cartographique via `ST_AsText`).

**Fichiers préconfigurés dans le paquet.**

- `appsettings.postgres.json` / `appsettings.linux.postgres.json` / `appsettings.multi-tenant.postgres.json` — environnements self-contained prêts à l'emploi, activables avec `ASPNETCORE_ENVIRONMENT=postgres`.
- `dbms/scripts/first-run/*.postgres.sql` — bootstrap metadata + DDL/DML tutoriel WideWorldImporters.

## 🗄️ Provider Oracle

Drop-in compatible avec Oracle 19c / 21c / Free 23c. Installation `oracle.dll` selon le même procédé que le provider PostgreSQL; "Oracle" apparaît automatiquement dans le dropdown firstRun.

**Couverture fonctionnelle.** Identique à PostgreSQL — toutes les surfaces core avec la même sémantique que les versions MSSQL/MySQL.

**Longueur des identifiants.** Oracle 11g/12.1 (30 caractères max) n'est pas encore supporté — les alias lookup générés par le framework dépassent la limite. Oracle 12.2+ (128 caractères) est le plancher de support.

**Fichiers préconfigurés dans le paquet.**

- `appsettings.oracle.json` / `appsettings.linux.oracle.json` / `appsettings.multi-tenant.oracle.json`.
- `dbms/scripts/first-run/*.oracle.sql` — bootstrap metadata + tutoriel.

---

## 🐛 Corrections notables

- **Filtre popup Spreadsheet sur colonnes lookup quand `md_server_side_operations=true`**: le popup colonne funnel de `<wuic-list-spreadsheet>` sur une colonne `lookupByID` affichait des IDs numériques nus (par ex. `1, 4, 5`) au lieu des descripteurs (par ex. `Woodgrove Bank Crandon Lakes`). Sur PG/Oracle l'application du filtre produisait une erreur SQL (`42601 ilike %%` sur PostgreSQL, `ORA-00904` sur Oracle) parce que le client transmettait la chaîne descriptive contre la colonne FK numérique. Le serveur émet désormais le descripteur joint (`<entity>___<dataTextField>__<colName>`) à côté de l'ID FK et le client affiche le descripteur dans le popup mais transmet l'ID raw comme filter value: le `WHERE col = <id>` reste numérique et cross-SGBD-safe. Aucune action requise côté consumer.

---

## 📦 Paquets mis à jour

| Package | De | À |
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

## 🔧 Mises à jour opérationnelles recommandées pour ceux qui mettent à jour

1. **Pour les utilisateurs MSSQL ou MySQL**: aucune action requise. Le fix du filtre Spreadsheet s'applique à tous les providers de manière transparente après le premier refresh du client.
2. **Pour activer PostgreSQL**: copier `postgresql.dll` (ainsi que ses dépendances runtime — `Npgsql.dll`, `Npgsql.EntityFrameworkCore.PostgreSQL.dll`, `Microsoft.Extensions.Logging.Abstractions.dll`) dans le physical path du site IIS ou dans le répertoire de publish Linux, redémarrer le backend. Sélectionner PostgreSQL dans le wizard firstRun, ou pointer `ASPNETCORE_ENVIRONMENT=postgres` pour utiliser `appsettings.postgres.json` préconfiguré.
3. **Pour activer Oracle**: même procédure — `oracle.dll` + `Oracle.EntityFrameworkCore.dll` + `Oracle.ManagedDataAccess.dll`. Vérifier que la version du DB cible est ≥ 12.2 (contrainte de longueur des identifiants).
4. **Cache client**: après la mise à jour, un hard refresh du navigateur (`Ctrl+F5`) suffit à aligner le client avec le nouveau contrat du filtre popup. Aucune invalidation de metadata côté serveur requise.
