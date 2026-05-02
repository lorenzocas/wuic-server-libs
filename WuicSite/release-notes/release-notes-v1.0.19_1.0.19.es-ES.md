# Notas de la versión — WUIC Framework v1.0.19

**Fecha**: 2 de mayo de 2026
**Versión publicada anterior**: 1.0.7 (26 de abril de 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

En seis días de desarrollo intensivo, WUIC da un salto significativo: del único deploy en Windows IIS a una **plataforma multi-runtime** (Windows + Linux nativo), con un sistema unificado de **gestión tipada de errores**, **crash reporting** centralizado, **autenticación LDAP** y una ronda de **hardening best-effort** sobre la superficie aplicativa.

---

## 🛡️ Seguridad

Hardening best-effort sobre toda la superficie aplicativa: throttling de autenticación, refuerzo de las cabeceras HTTP estándar (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy), gestión environment-aware de CORS y Swagger, reducción de info disclosure en las respuestas de error, gating granular de los endpoints administrativos, controles adicionales en la ruta SQL en runtime. Las configuraciones por defecto ahora son más conservadoras incluso para deploys demo/staging, con override explícito disponible vía `AppSettings`.

---

## 🚨 Crash Reporting (end-to-end)

Nuevo sistema de crash reporting auto-instalado que envía stack traces .NET + JavaScript a un receiver self-hosted.

- **Captura pasiva**: las excepciones unhandled se recogen automáticamente, deduplicadas vía stack canonicalization y encoladas async — sin impacto en la latencia de las request.
- **Receiver privado**: `errors.wuic-framework.com` acepta uploads firmados con RSA license signature (cero API keys que gestionar).
- **Consentimiento RGPD**: opt-in explícito gestionado en `AppSettings`, configurable desde el editor de settings.
- **Activación**: `CrashReporting:Enabled=true` en `appsettings.json` + consentimiento RGPD vía UI.

---

## 🐧 Linux deployment (nuevo)

WUIC ya es instalable en **Ubuntu/Debian** completamente automatizado, con stack soportado:

- .NET runtime + MSSQL Server o MySQL/MariaDB.
- Python 3.12 + entorno RAG.
- Secretos vía systemd credentials.
- nginx reverse proxy con TLS Let's Encrypt.
- Smoke test post-instalación que valida backend, RAG y proxy.

El tarball Linux incluye `appsettings.linux.mssql.json` y `appsettings.linux.mysql.json` preconfigurados para los dos stacks soportados, más un README con el procedimiento paso a paso.

---

## 🔐 Autenticación LDAP

El login WUIC ahora soporta **bind LDAP** como alternativa al DB:

- Configuración mediante la sección `Authentication:Ldap:*` en `appsettings.json` (server, base DN, bind template).
- Auto-aprovisionamiento de usuarios: la fila local se crea/actualiza en el primer login con datos de LDAP.
- Fallback DB: si LDAP no es alcanzable y `Authentication:Ldap:FallbackToDbOnFailure=true`, el login recae en el DB tradicional (admin/admin sigue siendo siempre alcanzable para recovery).

Compatible con Active Directory, OpenLDAP y directorios Novell.

---

## 🗄️ Provider MySQL (Wuic.MySqlProvider 0.8.3)

Soporte MySQL/MariaDB extendido a paridad con el primary MSSQL:

- Cobertura completa de tests funcionales (audit, CRUD client-side, concurrency, conditional styling, import-export, OData, retry, stored procedures, traducciones, validaciones).
- Fix de bugs específicos Linux: collation por defecto, quirks de `JSON_TYPE`, paging hints.

---

## 🚦 Sistema unificado de errores (typed exceptions)

Refactor completo de la gestión de errores aplicativos:

- **`WuicException`** como tipo base para todas las excepciones aplicativas tipadas (parte de la API pública del framework).
- **`WuicErrorCodes`**: catálogo de 27 códigos estables (`errors.auth.unauthenticated`, `errors.metadata.props_bag.malformed`, `errors.db.sql_exception`, `errors.report.render_failed`, etc.).
- **JSON envelope estable** para todas las respuestas de error: `{ ok, errorCode, args, traceId, fallbackMessage }`. Permite al cliente mostrar mensajes localizados en lugar de stack traces técnicos.
- **Traducciones built-in** en IT/EN/DE/ES/FR/JA para todos los códigos conocidos.
- **Mapping automático** de las excepciones runtime conocidas (`SqlException`, `AuthenticationException`, `JsonException`, etc.) a los códigos tipados.

---

## 🐛 Bug fix destacables

- **Gating `isSuperAdmin`**: corregida la verificación de permisos en varios endpoints que previamente confundían `isAdmin` (rol per-user) con `isSuperAdmin` (rol source of truth).
- **OData CRUD**: corregidas serializaciones edge case (Decimal→string, DateTime UTC roundtrip, navigation properties).
- **First-run wizard**: el bootstrap inicial ahora consume correctamente `IConfiguration` (ya no depende del legacy `app.config`).
- **Crash reporting forwarding**: bug del 2026-04-28 resuelto — las excepciones MVC handled ya no eluden el middleware de crash reporter.

---

## 📦 Paquetes actualizados

| Paquete | De | A |
|---|---|---|
| WuicCore | 1.0.13 | 1.0.19 |
| Wuic.Webcore | 1.0.13 | 1.0.19 |
| WuicOData | 1.0.13 | 1.0.19 |
| RuntimeEfCore | 1.0.13 | 1.0.19 |
| Wuic.MySqlProvider | 0.7.x | 0.8.3 |
| wuic-framework-lib (NPM) | 1.0.11 | 1.0.19 |

---

## 🔧 Pasos operativos recomendados para quien actualiza

1. Ejecutar `dotnet ef database update` si se está sobre EF migrations.
2. Verificar `appsettings.json`: el sistema ahora también lee `AppSettings:AllowedOrigins` (array string) y `AppSettings:registrationEnabled` (boolean kill-switch). Defaults seguros si no se especifican.
3. Si se usa LDAP, configurar la sección `Authentication:Ldap:*` en `appsettings.json`.
4. Para deploy Linux: usar el tarball dedicado y seguir el README incluido.
5. Para activar crash reporting outgoing: configurar `CrashReporting:Enabled=true` en `appsettings.json` + aceptar consentimiento RGPD vía UI.
