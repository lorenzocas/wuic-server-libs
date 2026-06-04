# Notas de la versión — WUIC Framework v1.3.0

**Fecha**: 3 de junio de 2026
**Versión anterior publicada**: 1.2.1 (31 de mayo de 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Versión menor centrada en la integración del **chatbot RAG** en el lado del framework: historial de conversación persistente, gestión automática del contexto, configuración hot-reload desde `appsettings.json` y esquema cross-DBMS aplicado automáticamente al primer arranque. Junto a la feature principal, algunos fixes al scaffolder de metadatos y a la robustez del repositorio de chat sobre MySQL/Oracle que aparecían en escenarios de aprovisionamiento de DB nuevas.

El chatbot es el primer componente WUIC con estado en el servidor (`_rag_chat_sessions` + `_rag_chat_messages`) que se extiende a los cuatro providers soportados sin configuración manual del esquema. El primer `Ask` detecta el provider, aplica en orden los parches SQL incrementales y arranca.

---

## 🤖 Chatbot RAG — gestión del contexto end-to-end

El componente `<wuic-rag-chatbot>` ahora persiste múltiples sesiones por usuario, con historial completo de la conversación, summarization automática del contexto y configuración vía `appsettings.json`. La feature es opt-in: sin `anthropic-api-key` configurada el chatbot permanece inactivo.

**Sesiones**

- Historial de conversación persistido por usuario. La sesión sobrevive a los reload del navegador y a los cambios de route.
- Popup de selección de sesiones ordenadas por `updated_at` descendente, con título derivado del primer prompt (truncado a 100 caracteres + tooltip completo).
- Renombre inline con persistencia inmediata.

**Gestión automática del contexto**

- **Visual cue % en el header del chatbot**: un círculo de color que indica el consumo de la ventana de contexto del modelo (verde <60% / amarillo 60-80% / naranja 80-90% / rojo >90%). El valor proviene de los tokens realmente consumidos por la API de Anthropic y se persiste por turno, así sobrevive al reload.
- **Auto-compact pre-Ask**: cuando la conversación supera el umbral configurable (default 30 turns) y hay al menos 10 turns aún no resumidos, el backend lanza un compact best-effort en background antes del siguiente Ask. El resumen actualizado se inyecta en el system prompt de los turns futuros.
- **Compact bajo demanda**: el usuario puede forzar un compact vía slash command `/compact` o haciendo clic en el círculo cue.
- **Memory facts**: el modelo mismo puede "pinear" hechos high-priority vía tool use (`remember_fact`/`forget_fact`). Los hechos permanecen en el system prompt incluso tras un compact (máx. 20, eviction FIFO).
- **Follow-up questions**: el modelo sugiere hasta 3 preguntas de seguimiento, renderizadas como chips clicables debajo de la respuesta. Click = rellena el input box (no envía automáticamente).

**Configuración `appsettings.json`**

- `anthropic-api-key` — API key de Anthropic, **hot-reload**. No hard-coded, nunca commitear al repo.
- `anthropic-default-chat-model` — `claude-haiku-4-5-20251001` (200k, default) / `claude-sonnet-4-5-20250929` / `claude-opus-4-5`. Determina la ventana de contexto y el driver del visual cue.
- `anthropic-auto-compact-threshold` — entero >=0, default `30`. Poniendo `0` se deshabilita el auto-compact (sigue disponible el `/compact` manual).

**Auto-migración cross-DBMS**

El esquema del chat history (5 patches incrementales) se aplica de forma idempotente en el primer `Ask`, sobre el provider configurado (MSSQL / MySQL / PostgreSQL / Oracle). Ningún paso DBA requerido en instalaciones existentes.

---

## 🐛 Correcciones notables

- **Scaffolder de metadatos — distinción `date` vs `datetime` consolidada**: completado el follow-up del fix introducido en 1.2.1 sobre los tipos temporales generados. El parser de tipos origen cubre ahora también variantes DDL atípicas (MySQL `DATETIME(0)` sin precision, PostgreSQL `timestamp` desnudo sin time-zone qualifier, Oracle `TIMESTAMP(n)` con precision explícita) — todas siguen mapeando correctamente al UI type `datetime` preservando el componente time al guardar.

- **Suggest en campos metadata — `mc_suggest_value_callback` ahora normaliza el return value**: el callback configurable desde DB podía devolver una promise o un valor síncrono, pero el parser runtime solo aceptaba el caso síncrono. Resultado: el suggest fallaba silenciosamente en callbacks async. La normalización ahora espera `Promise.resolve(callback(...))` de forma uniforme.

- **Repositorio chat — `Guid` cross-driver**: el driver MySQL.Data materializa una columna `CHAR(36)` como `Guid` cuando el flag `OldGuids` es `false` (default a partir de la versión 6.6 del connector), provocando `InvalidCastException` en `GetString`. Mismo riesgo en Oracle con storage `RAW(16)`. La lectura del correlation id tiene ahora una cascada de fallback (`GetGuid` → `GetString` → `GetValue` con switch sobre runtime type) — robusta en los cuatro providers independientemente de la configuración del driver.

- **Repositorio chat — conexión MySQL no abierta**: el gateway MySQL retornaba una `new MySqlConnection(cs)` sin llamar a `Open()`, asimétrico respecto a los gateways PostgreSQL y Oracle. El primer `ExecuteNonQueryAsync` del schema auto-apply fallaba con "Connection must be valid and open". Añadido un `OpenConnectionToConnectionString` simétrico, alineado con los otros providers.

---

## 📦 Paquetes actualizados

| Package | De | A |
|---|---|---|
| WuicCore | 1.2.1 | 1.3.0 |
| Wuic.Webcore | 1.2.1 | 1.3.0 |
| WuicOData | 1.2.1 | 1.3.0 |
| RuntimeEfCore | 1.2.1 | 1.3.0 |
| Wuic.MySqlProvider | 1.2.1 | 1.3.0 |
| Wuic.PostgresProvider | 1.2.1 | 1.3.0 |
| Wuic.OracleProvider | 1.2.1 | 1.3.0 |
| wuic-framework-lib (NPM) | 1.2.1 | 1.3.0 |

---

## 🔧 Actualizaciones operativas recomendadas

1. Para **habilitar el chatbot RAG**, añadir a `appsettings.json` la clave `anthropic-api-key` (y opcionalmente `anthropic-default-chat-model` y `anthropic-auto-compact-threshold`). El backend relee las claves en hot-reload — no necesita restart.
2. **Ningún paso DBA requerido** en instalaciones existentes: en el primer `Ask` del chatbot, el esquema del chat history (`_rag_chat_sessions` + `_rag_chat_messages` con todas las columnas) se aplica idempotente en el provider configurado en `MetaDataSQLConnection`. La auto-migración cubre instalaciones nuevas y parcialmente migradas.
3. Si la instalación corre sobre **MySQL / PostgreSQL / Oracle**, verificar que la connection string apunta al provider correcto y que el usuario tiene privilegios `ALTER TABLE` sobre el schema de metadata (necesarios una sola vez, en el primer arranque).
4. Para **monitorear el consumo de la ventana de contexto**, el círculo cue % en el header del chatbot es el driver visual inmediato. Por encima del 80% conviene un compact manual (`/compact` o click sobre el cue) para reducir la latencia de los turns siguientes.
