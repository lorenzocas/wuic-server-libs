# Notes de version — WUIC Framework v1.2.1

**Date** : 31 mai 2026
**Version précédemment publiée** : 1.2.0 (27 mai 2026)
**Backend** : .NET 10 + IIS / Linux nginx
**Frontend** : Angular 21

---

Release de maintenance centrée sur une classe de bugs latents qui affectaient les champs `datetime` et `decimal` dans des scénarios cross-DBMS / cross-locale. La plupart des utilisateurs sur workstation en locale italienne ont été touchés au moins une fois — la composante time des timestamps était tronquée à minuit lors de INSERT et UPDATE, et les décimaux avec séparateur non invariant produisaient `ORA-01722` sur Oracle dès que la session ODP.NET héritait de la culture italienne de Windows.

Les fixes sont transverses aux 4 providers supportés (MSSQL, MySQL, PostgreSQL, Oracle) et tous les tests roundtrip end-to-end passent au vert aussi bien en locale de session DB anglaise (`en-US`) qu'italienne (`Italiano dmy`, `lc_time=Italian_Italy.1252`).

---

## 🐛 Corrections de bugs notables

- **Composante `time` tronquée lors de INSERT/UPDATE de champs `DATETIME2` / `DATETIME(n)` / `TIMESTAMP`** : le scaffolder des métadonnées collapsait tous les types temporels de la DB source sur l'unique type UI `date`. Conséquence : une colonne SQL Server `DATETIME2(3)` (ou MySQL `DATETIME(3)`, PostgreSQL `timestamp without time zone`, Oracle `TIMESTAMP(0)`) était traitée comme date pure et le framework émettait `'20261231'` au lieu de `'20261231 23:59:58'` lors de INSERT/UPDATE — l'heure saisie via l'UI était perdue à l'enregistrement. Le scaffolder distingue maintenant `date` (date pure) de `datetime` (date + heure) et l'enregistrement préserve la composante time à la seconde près. La précision sub-seconde (`.fff`) reste tronquée intentionnellement pour rester cohérente avec le date-time picker UI qui ne l'expose pas.

- **Oracle `ORA-01722 : nombre non valide` sur champs `NUMBER(p,s)` depuis une workstation italienne** : les providers émettaient les valeurs numériques quoted en string dans les `INSERT`/`UPDATE` (ex. `VALUES (..., '9876.4321', ...)`). Oracle convertissait ensuite la string en nombre en utilisant `NLS_NUMERIC_CHARACTERS` de la session, qu'ODP.NET dérive de la `CurrentCulture` du thread .NET : en culture italienne le séparateur décimal est `,` et `.` devient le séparateur de groupe → `'9876.4321'` était interprété comme expression de groupe invalide. Les valeurs numériques (`decimal`, `float`, `double`, `numeric`) sont désormais émises comme literals SQL non quoted : les literals numériques Oracle utilisent toujours `.` comme point décimal indépendamment de NLS.

- **Oracle `ORA-00904 : identificateur invalide` sur tables avec identificateurs quoted-lowercase** : une table créée avec DDL `CREATE TABLE "my_table" ("id" NUMBER, ...)` (lowercase quoted, case-preserving) n'était pas lisible par le framework. La logique de quoting reconnaissait les mixed-case et les reserved keywords mais traitait les all-lower comme "safe identifier" et les émettait bare (Oracle case-folde les identificateurs bare en UPPER), provoquant un mismatch avec le physique `"id"`. Les identificateurs all-lowercase sont désormais préservés avec un quoting explicite.

- **Parsing/formatting locale-invariant des dates et timestamps côté serveur** : le path parse/emit de `DateTime` sur Oracle et PostgreSQL utilisait la `CurrentCulture` du thread. Le parsing essaie maintenant d'abord `InvariantCulture` et ne retombe sur `CurrentCulture` qu'en cas de besoin ; le formatting pour les clauses SQL (`TO_TIMESTAMP(...)` / literal `yyyy-MM-dd HH:mm:ss`) utilise toujours `InvariantCulture`. Effet user-visible : le round-trip reste bit-perfect indépendamment du `CultureInfo.CurrentCulture` du process backend.

- **Oracle `ORDER BY` sur PK lowercase** : la clause `ORDER BY` ajoutée automatiquement sur la clé primaire émettait le nom de colonne sans passer par la logique de quoting → produisait `ORA-00904` sur les tables avec PK `"id"` lowercase quoted. La PK passe maintenant par le même quoting que toutes les autres colonnes.

---

## 🗄️ Compatibilité DB cross-locale

Les tests roundtrip end-to-end couvrent désormais les combinaisons provider × session DB suivantes :

| Provider | Session DB testée | Résultat |
|---|---|---|
| MSSQL | `@@LANGUAGE=Italian`, `date_format=dmy`, `Latin1_General_CI_AS` | OK |
| MySQL | `lc_time_names=en_US`, `utf8mb4_0900_ai_ci`, `time_zone=SYSTEM` | OK |
| PostgreSQL | `DateStyle=ISO,DMY`, `lc_time=Italian_Italy.1252` | OK |
| Oracle | `NLS_LANGUAGE=AMERICAN`, `NLS_TERRITORY=AMERICA`, `NLS_NUMERIC_CHARACTERS=.,` | OK |

Les dates sont garanties invariantes end-to-end (`2026-12-31T23:59:58.000` reste `2026-12-31T23:59:58.000` indépendamment de la session DB et de la CurrentCulture backend), tout comme les décimaux (`9876.4321` reste `9876.4321`).

---

## 📦 Packages mis à jour

| Package | De | À |
|---|---|---|
| WuicCore | 1.2.0 | 1.2.1 |
| Wuic.Webcore | 1.2.0 | 1.2.1 |
| WuicOData | 1.2.0 | 1.2.1 |
| RuntimeEfCore | 1.2.0 | 1.2.1 |
| Wuic.MySqlProvider | 1.2.0 | 1.2.1 |
| Wuic.PostgresProvider | 1.2.0 | 1.2.1 |
| Wuic.OracleProvider | 1.2.0 | 1.2.1 |
| wuic-framework-lib (NPM) | 1.2.0 | 1.2.1 |

