# Notas de la versión — WUIC Framework v1.2.1

**Fecha**: 31 de mayo de 2026
**Versión publicada anteriormente**: 1.2.0 (27 de mayo de 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Versión de mantenimiento centrada en una clase de bugs latentes que afectaban a los campos `datetime` y `decimal` en escenarios cross-DBMS / cross-locale. La mayoría de los usuarios con workstation en locale italiana se han visto afectados al menos una vez — el componente time de las marcas temporales se truncaba a medianoche en INSERT y UPDATE, y los decimales con separador no invariante producían `ORA-01722` en Oracle cuando la sesión ODP.NET heredaba la cultura italiana de Windows.

Los fixes son transversales a los 4 providers soportados (MSSQL, MySQL, PostgreSQL, Oracle) y todos los tests roundtrip end-to-end pasan tanto en locale de sesión DB inglesa (`en-US`) como italiana (`Italiano dmy`, `lc_time=Italian_Italy.1252`).

---

## 🐛 Correcciones de bugs destacadas

- **Componente `time` truncado en INSERT/UPDATE de campos `DATETIME2` / `DATETIME(n)` / `TIMESTAMP`**: el scaffolder de los metadatos colapsaba todos los tipos temporales del DB origen sobre el único tipo UI `date`. Resultado: una columna de SQL Server `DATETIME2(3)` (o MySQL `DATETIME(3)`, PostgreSQL `timestamp without time zone`, Oracle `TIMESTAMP(0)`) era tratada como pura fecha y el framework emitía `'20261231'` en lugar de `'20261231 23:59:58'` en INSERT/UPDATE — la hora introducida en la UI se perdía al guardar. El scaffolder ahora distingue `date` (fecha pura) de `datetime` (fecha + hora) y el guardado preserva el componente time con precisión al segundo. La precisión sub-segundo (`.fff`) permanece truncada intencionadamente por coherencia con el date-time picker UI que no la expone.

- **Oracle `ORA-01722: número no válido` en campos `NUMBER(p,s)` desde workstation italiana**: los providers emitían los valores numéricos quoted como string en las `INSERT`/`UPDATE` (ej. `VALUES (..., '9876.4321', ...)`). Oracle convertía la string en número usando `NLS_NUMERIC_CHARACTERS` de la sesión, que ODP.NET deriva del thread .NET `CurrentCulture`: en cultura italiana el decimal es `,` y `.` se convierte en separador de grupo → `'9876.4321'` se interpretaba como expresión de grupo inválida. Ahora los valores numéricos (`decimal`, `float`, `double`, `numeric`) se emiten como literales SQL sin quoting: los literales numéricos Oracle usan siempre `.` como punto decimal independientemente de NLS.

- **Oracle `ORA-00904: identificador no válido` en tablas con identificadores quoted-lowercase**: una tabla creada con DDL `CREATE TABLE "my_table" ("id" NUMBER, ...)` (lowercase quoted, case-preserving) no era legible por el framework. La lógica de quoting reconocía los mixed-case y las reserved keywords pero trataba los all-lower como "safe identifier" y los emitía bare (Oracle los case-folda a UPPER), causando el mismatch con el físico `"id"`. Ahora los identificadores all-lowercase se preservan con quoting explícito.

- **Parsing/formatting locale-invariante de fechas y timestamps en el server**: el path de parsing/emit de `DateTime` en Oracle y PostgreSQL usaba el thread `CurrentCulture`. Ahora el parsing intenta primero `InvariantCulture` y hace fallback a `CurrentCulture` solo si es necesario; el formatting para las cláusulas SQL (`TO_TIMESTAMP(...)` / literal `yyyy-MM-dd HH:mm:ss`) usa siempre `InvariantCulture`. Efecto user-visible: el round-trip permanece bit-perfect independientemente del `CultureInfo.CurrentCulture` del proceso backend.

- **Oracle `ORDER BY` sobre PK lowercase**: la cláusula `ORDER BY` añadida automáticamente sobre la clave primaria emitía el nombre de columna sin pasar por la lógica de quoting → producía `ORA-00904` en tablas con PK `"id"` lowercase quoted. Ahora la PK pasa por el mismo quoting que todas las otras columnas.

---

## 🗄️ Compatibilidad DB cross-locale

Los tests de roundtrip end-to-end ahora cubren las siguientes combinaciones provider × sesión DB:

| Provider | Sesión DB probada | Resultado |
|---|---|---|
| MSSQL | `@@LANGUAGE=Italian`, `date_format=dmy`, `Latin1_General_CI_AS` | OK |
| MySQL | `lc_time_names=en_US`, `utf8mb4_0900_ai_ci`, `time_zone=SYSTEM` | OK |
| PostgreSQL | `DateStyle=ISO,DMY`, `lc_time=Italian_Italy.1252` | OK |
| Oracle | `NLS_LANGUAGE=AMERICAN`, `NLS_TERRITORY=AMERICA`, `NLS_NUMERIC_CHARACTERS=.,` | OK |

Las fechas se garantizan invariantes end-to-end (`2026-12-31T23:59:58.000` permanece `2026-12-31T23:59:58.000` independientemente de la sesión DB y CurrentCulture del backend), al igual que los decimales (`9876.4321` permanece `9876.4321`).

---

## 📦 Paquetes actualizados

| Package | De | A |
|---|---|---|
| WuicCore | 1.2.0 | 1.2.1 |
| Wuic.Webcore | 1.2.0 | 1.2.1 |
| WuicOData | 1.2.0 | 1.2.1 |
| RuntimeEfCore | 1.2.0 | 1.2.1 |
| Wuic.MySqlProvider | 1.2.0 | 1.2.1 |
| Wuic.PostgresProvider | 1.2.0 | 1.2.1 |
| Wuic.OracleProvider | 1.2.0 | 1.2.1 |
| wuic-framework-lib (NPM) | 1.2.0 | 1.2.1 |

