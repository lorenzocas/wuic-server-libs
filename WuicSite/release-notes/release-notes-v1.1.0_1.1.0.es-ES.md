# Notas de la versión — WUIC Framework v1.1.0

**Fecha**: 13 de mayo de 2026
**Versión publicada anteriormente**: 1.0.20 (12 de mayo de 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Salto a minor: esta versión introduce dos capacidades estructurales que cambian el modelo de despliegue del framework.

- **Multi-tenant**: una única instancia del framework enruta datos y metadatos de N empresas hacia N conexiones de BD distintas. Configuración por tenant en las columnas `Aziende.Connessione_DB_Dati` / `Aziende.CONNESSIONE_DB_Meta`; enrutamiento transparente a nivel de aplicación mediante `TenantContext` (AsyncLocal, sobrevive a los límites de Task/scheduler).
- **Localización del menú por idioma**: las entradas del menú (`mm_display_string_menu`) ya no contienen etiquetas italianas codificadas, sino claves estables con namespace `menu.<scope>.<slug>`, resueltas en tiempo de ejecución por la pipe `translate` de Angular contra `_wuic_translations`. Cambiar idioma desde el selector de usuario actualiza todas las entradas sin F5.

---

## 🌐 Gestión multi-tenant

Una sola instalación del framework puede ahora servir a varias empresas ("tenants") con datos y metadatos físicamente aislados en BD diferentes, sin necesidad de replicar la aplicación ni particionar reverse-proxies por host.

**Modelo de datos.** El enrutamiento tenant→conexiones se define sobre dos columnas de la BD de metadatos primaria:

- `Aziende.Connessione_DB_Dati` — nombre de una entrada en `ConnectionStrings` para la BD de aplicación del tenant
- `Aziende.CONNESSIONE_DB_Meta` — nombre de una entrada en `ConnectionStrings` para la BD de metadatos del tenant

Las columnas contienen el **nombre** de la entrada, no la cadena literal. La rotación de credenciales se hace editando `appsettings.<env>.json`, sin tocar la BD.

**Activación.** Flag en `appsettings.json` (sección `AppSettings`):

```json
"multiConnectionEnabled": "true"
```

Con el flag `false` (por defecto) el comportamiento permanece single-tenant, idéntico a las versiones anteriores. Con el flag `true` cada petición HTTP autenticada resuelve el `AziendaId` desde el usuario autenticado y enruta `GetOpenConnection` hacia las connection strings del tenant correspondiente.

**Enrutamiento transparente.** Todos los puntos de acceso a BD del framework (`MetaService.*`, scheduler, scaffolding, AsmxProxy CRUD, callbacks personalizados) consultan `TenantScope.CurrentAziendaId` mediante `AsyncLocal`, propagado por el middleware HTTP tras la autenticación. Los jobs en background y los callbacks personalizados declaran el tenant explícitamente con `using (TenantScope.Push(aziendaId)) { ... }` cuando se ejecutan fuera del contexto de petición.

**Caché tenant-aware.** Las claves `Application[]` del lado servidor y las cachés locales de metadatos se sufijan automáticamente con `AziendaId` cuando el flag está activo, evitando el bleed de metadatos entre tenants.

**Enrutamiento de login.** La tabla `_login_index(username_hash, id_azienda)` en la BD primaria mapea username → tenant para el fallback de `MetaService.login`: tras la autenticación, la cookie `k-user` lleva `azienda_id` como parte del payload y el middleware crea el `TenantScope` correcto en cada petición posterior.

**Propagación de scaffold.** La acción "Scaffold tabla" propaga de forma idempotente los metadatos de la tabla a todos los tenants listados en `Aziende`. La propagación se ejecuta con un `TenantScope` explícito sobre cada destino y es idempotente: re-ejecutable, aplica solo los cambios faltantes.

**Archivos preconfigurados en el paquete:**

- `appsettings.multi-tenant.mssql.json` / `appsettings.multi-tenant.mysql.json` — entorno self-contained con 6 connection strings de ejemplo (1 primary + 5 tenants) y `multiConnectionEnabled=true`. Activar con `ASPNETCORE_ENVIRONMENT=multi-tenant.mssql`.
- `dbms/scripts/multi_tenant_aziende_connessioni_mssql.sql` / `_mysql.sql` — DDL para añadir las dos columnas a `Aziende` en BD existentes.

---

## 🗺️ Localización del menú por idioma

Las entradas del menú se traducen ahora dinámicamente según el idioma del usuario, sin necesidad de duplicar registros de `_metadati__menu` por locale.

**Arquitectura.** El campo `mm_display_string_menu` de `_metadati__menu` contiene una **clave estable** con namespace (`menu.admin.roles`, `menu.crm.opportunities`, `menu.fleet.vehicles`, ...). La plantilla del componente menú de Angular aplica la pipe `translate` sobre `item.label` y la clave se resuelve en tiempo de ejecución desde el diccionario `_wuic_translations` filtrado por el idioma actual.

**Esquema de clave.**

```
menu.<scope>.<slug>
   │       └── slug snake_case (p. ej. column_styles, opportunities)
   └── scope = root | admin | demo | crm | fleet | invoice
```

- `menu.root.*` — parents top-level (Administración, Aplicación, Inicio, ...)
- `menu.admin.*` — 36 entradas de sistema compartidas (Roles, Designer, Estilos de columna, Workflow Designer, ...)
- `menu.demo.*` — contenido demo WideWorldImporters
- `menu.crm.*` / `menu.fleet.*` / `menu.invoice.*` — entradas específicas del dominio del tenant

**Ventaja respecto al modelo anterior.**

- El modelo antiguo usaba el texto italiano de la etiqueta como clave de traducción (`Aziende`, `Customers`, `Ruoli`). Esto causaba case-mismatches silenciosos (`Ruoli` vs `ruoli`, `Stili Tabella` vs `Stili tabella`) porque la pipe `translate` es case-sensitive mientras que `_wuic_translations` tiene una collation case-insensitive: el primer MERGE que entraba fijaba el casing para siempre, y los INSERTs posteriores con casing divergente se convertían en no-ops silenciosos.
- El nuevo modelo con claves estables es case-determinado (todo en minúsculas por convención), con namespacing por scope, y ya no colisiona con otros recursos que pudieran usar el mismo texto italiano (p. ej. una etiqueta de botón "Ruoli" en un dropdown es una clave diferente de `menu.admin.roles`).

**5 idiomas soportados.** `it-IT`, `en-US`, `fr-FR`, `es-ES`, `de-DE`. Las traducciones viven en `_wuic_translations` (formato estándar: `language`, `resource`, `translation`). Cambiar idioma desde el dropdown de usuario arriba a la derecha relee el diccionario para el nuevo idioma y repinta el menú sin F5.

**Fallback de runtime.** Idioma actual → en-US → it-IT → clave raw. Si ves `menu.admin.roles` literal en pantalla significa que la clave no ha sido seedada en ninguno de los 5 idiomas.

**Las claves italianas antiguas en `_wuic_translations` no se tocan** con la actualización: pueden ser consumidas por otros puntos de la app (`instant('Aziende')` en code-behind, headers de list-grid, page titles) y siguen siendo válidas.

---

## 🐛 Correcciones de errores destacadas

- **Formularios de edición dinámicos — Tabs y widgets en plantillas `md_edit_template` en producción**: en builds de producción las plantillas HTML personalizadas asociadas a una ruta vía `md_edit_template` no renderizaban correctamente los Tabs de PrimeNG 21 (las labels aparecían como texto plano concatenado sin el chrome del componente) y los field-editors mostraban solo placeholders `<!---->` en lugar de inputs. Causa: el compilador runtime usado por el framework para plantillas dinámicas requiere la enumeración explícita de los componentes standalone disponibles en la plantilla, y `MetadataProviderService.widgetDefinition.dynamicFormImports` estaba incompleto. Añadidos a la baseline `TabsModule` + `Tabs`/`TabList`/`Tab`/`TabPanels`/`TabPanel`, `FieldsetModule`, `DataRepeaterComponent`, `DataSourceComponent`, `ImageWrapperComponent`. No se requiere acción en las apps consumer una vez actualizado el paquete `wuic-framework-lib`.

---

## 🎁 Aplicaciones gratuitas ahora disponibles

A partir de esta versión, tres aplicaciones completas se distribuyen **gratis** sobre el framework — disponibles en la sección "Free apps" de la página [Downloads](/downloads):

- **CrmApp** — CRM B2B autoalojado: registro de clientes, pipeline de oportunidades con kanban drag-and-drop, actividades (llamadas / reuniones / emails), dashboard por rol. ([Leer el artículo](/blog/crmapp-free-crm-on-wuic))
- **FatturazioneElettronica** — Facturación electrónica italiana: editor de facturas FatturaPA v1.2, firma CADES-BES, validación XSD, 4 proveedores SDI intercambiables (DirectPec gratuito vía PEC, ArubaPec / FatturePec / PecIt comerciales), conservación legal, registros IVA y liquidación. ([Leer el artículo](/blog/fatturazione-elettronica-free-italian-einvoicing))
- **FlottaMezzi** — Gestión de flotas: registro de vehículos / conductores, vencimientos automáticos (impuesto / ITV / seguro / mantenimiento / carnet), feed geolocalización OBD/GPS, mapa en vivo, agregación de costes €/km por vehículo y por conductor, reporting TCO. ([Leer el artículo](/blog/flottamezzi-free-fleet-management))

Cada aplicación se distribuye en tres formatos: ZIP IIS con DB tutorial (lista para restaurar), ZIP IIS sin DB, ZIP código fuente.

**Modelo de licencia.** Las apps gratuitas son **GRATIS tal como se distribuyen** — el binario `<App>.dll` del ZIP lleva un recurso `host-binding-license` embebido que autoriza el runtime framework sin claves externas. Solo si **recompilas la aplicación desde el código fuente** (por ejemplo para añadir un nuevo controlador o cambiar una signature pública) necesitas una licencia WUIC Developer o Professional: la recompilación produce un binario con identidad diferente, pierde el bundling, y el framework cae al control de licencia fingerprint estándar.

Extender las apps gratuitas sin recompilar el binario está cubierto por el bundling: añadir metadata vía SQL, componentes Angular en el wwwroot, jobs en la tabla `scheduler`, hooks personalizados vía `appsettings.json:customCrudHookClass`.

---

## 📦 Paquetes actualizados

| Package | De | A |
|---|---|---|
| WuicCore | 1.0.20 | 1.1.0 |
| Wuic.Webcore | 1.0.20 | 1.1.0 |
| WuicOData | 1.0.20 | 1.1.0 |
| RuntimeEfCore | 1.0.20 | 1.1.0 |
| wuic-framework-lib (NPM) | 1.0.20 | 1.1.0 |

---

## 🔧 Actualizaciones operativas recomendadas para quien actualiza

1. **Para quien quiere activar multi-tenant** (opt-in): aplicar el script DDL `dbms/scripts/multi_tenant_aziende_connessioni_mssql.sql` (o `_mysql.sql`) para añadir las columnas `Connessione_DB_Dati` y `CONNESSIONE_DB_Meta` a `Aziende`. Poblar las filas de `Aziende` con los nombres de las entradas de ConnectionStrings de `appsettings.json`. Configurar `AppSettings.multiConnectionEnabled = "true"`. Reiniciar el backend.
2. **Para quien permanece en single-tenant**: ninguna acción requerida. Sin `multiConnectionEnabled=true` el routing tenant está desactivado y el comportamiento es bit-idéntico a la 1.0.20.
3. **Localización del menú — refresh de metadatos**: tras la actualización, ejecutar una vez `POST /api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime` para recargar el diccionario del menú en el cliente. Alternativamente, cerrar sesión y volver a entrar.
4. **Localización del menú — migración de un proyecto existente**: para proyectos que vienen de una versión anterior con etiquetas italianas en `_metadati__menu.mm_display_string_menu`, aplicar dos pasos SQL idempotentes: (a) `UPDATE _metadati__menu SET mm_display_string_menu = '<menu.scope.slug>' WHERE mm_display_string_menu = '<etiqueta antigua>'` para cada entrada, siguiendo el esquema `menu.<scope>.<slug>` documentado arriba; (b) `INSERT/MERGE INTO _wuic_translations (language, resource, translation)` 5 filas por nueva clave (una por idioma). Las filas antiguas en `_wuic_translations` con resource = texto italiano permanecen en BD y pueden ser consumidas por otros callers (`instant()`, headers de list-grid).
5. **Hot reload de backend en dev**: si desarrollas con `dotnet watch`, el task `backend: kill dll lockers` requiere ahora `pwsh` 7+ (ya no Windows PowerShell 5.x). El script C# inline para Restart Manager usa sintaxis `Dictionary<,>` parseada correctamente solo en PS 7+.
