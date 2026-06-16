# Notas de la versión — WUIC Framework v1.3.2

**Fecha**: 14 de junio de 2026
**Versión publicada anterior**: 1.3.0 (11 de junio de 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Una versión de consolidación sobre el **chatbot RAG** introducido en 1.3.0: el modelo conversacional ya no está atado a Anthropic — cualquier endpoint compatible con OpenAI, incluidos runtimes locales como Ollama con modelos abiertos (Qwen), es ahora configurable y funciona sin API key. Junto a esto, una serie de correcciones en el instalador de first-run, en el paquete de fuentes y en el scaffolding de metadatos que aparecían en instalaciones nuevas, además de un workspace listo para los asistentes de IA de programación.

---

## 🤖 Chatbot RAG — proveedor de LLM flexible (incluido local y gratuito)

El modelo conversacional del chatbot es ahora independiente del proveedor. Además de Anthropic, se soportan endpoints **compatibles con OpenAI**, lo que incluye runtimes locales (p. ej. Ollama): se pueden ejecutar modelos abiertos y gratuitos como **Qwen** en la propia máquina, **sin API key y sin coste por token**.

- `rag-llm-provider` — `anthropic` (por defecto) / `openai` / `openrouter`. Selecciona el dialecto wire del proveedor.
- `rag-llm-base-url` — override del endpoint; al indicar la URL de un servidor local (p. ej. `http://localhost:11434/v1` para Ollama) el chatbot habla con el modelo en local.
- `rag-llm-default-chat-model` — id del modelo para el proveedor elegido (p. ej. un modelo Qwen en Ollama).
- `llm-api-key` — clave del proveedor activo; para runtimes locales que no la validan basta un valor de marcador (p. ej. `ollama`). La histórica `anthropic-api-key` sigue siendo válida cuando `rag-llm-provider=anthropic` (sin migración).

Todas las claves se recargan en **hot-reload** desde `appsettings.json`: cambiar de proveedor o modelo no requiere reinicio.

**Retrieval más preciso** — se ha afinado el re-ranking de los resultados: el chatbot cita fuentes más pertinentes en las consultas en lenguaje natural.

**Notificaciones de setup** — en el primer uso el motor .NET descarga los modelos ONNX bajo demanda. El administrador recibe ahora en la campana las notificaciones de **inicio / listo / error** de la descarga, en los cuatro proveedores de BD, incluso cuando la inicialización la dispara una petición sin usuario autenticado.

**Aceleración GPU automática** — en una máquina con GPU NVIDIA el motor usa la GPU sin instalar CUDA: en el primer arranque, además de los modelos ONNX, descarga bajo demanda también el runtime CUDA 12 + cuDNN 9 necesario (~1,8 GB, una sola vez, solo si hay GPU) y lo configura por sí mismo. Sin GPU → CPU, sin descarga adicional. Override manual con `rag-engine-cuda-path`.

---

## 🧩 Workspace listo para asistentes de IA de programación

Las aplicaciones generadas con el framework incluyen ahora una **colección de archivos markdown de contexto** (descripción del proyecto, convenciones, reglas operativas) en la raíz del workspace. Estos archivos hacen que los asistentes de IA agénticos — **Continue**, **Cline**, Cursor y similares — conozcan de inmediato la estructura y las convenciones de WUIC, sin instalar ninguna extensión propietaria. Cualquier cliente que lea el contexto del workspace se comporta como un asistente "WUIC-native".

---

## 🐛 Correcciones destacadas

- **Instalador de first-run — ruta por script SQL (non-BAK)**: al aprovisionar la BD de metadatos mediante el script SQL incremental (alternativa al restore desde un `.bak`), el parser de los lotes separados por `GO` gestionaba mal algunos separadores, provocando el fallo de la creación del esquema en instalaciones nuevas. El splitter se ha corregido y las instalaciones por script se completan correctamente.

- **Paquete de fuentes — motor RAG .NET no encontrado en runtime**: en el paquete de fuentes (`-src-`) el motor `WuicRagEngine.dll` se colocaba en la raíz del paquete, mientras que el ejecutable, arrancado desde `bin/`, lo buscaba junto a sí mismo — el chatbot RAG no arrancaba ("WuicRagEngine.dll no encontrado"). El loader busca ahora la carpeta `rag-engine/` en varias ubicaciones (salida de build, content-root, working directory) y encuentra el motor en ambos layouts de deploy.

- **First-run — persistencia de la API key del chatbot**: la clave LLM introducida en el asistente de primera instalación se escribe ahora en el `appsettings.json` canónico que realmente lee el runtime. Antes, en algunos layouts, podía acabar en una copia que el proceso nunca lee, dejando el chatbot sin clave justo tras la instalación.

- **Scaffolding de metadatos — diagnóstico y robustez**: el scaffolding de los metadatos de ciertas tablas podía fallar con un mensaje genérico ("Unable to scaffold metadata table") que ocultaba la causa real. El error SQL efectivo se propaga ahora hasta el llamador, y el caso que lo provocaba está resuelto.

- **Paquete de fuentes — notificaciones en tiempo real en dev**: en el paquete `-src-`, el proxy del dev-server (`ng serve`) no reenviaba las conexiones WebSocket al backend; el canal de notificaciones (`/ws`) entraba en timeout y las actualizaciones solo aparecían al recargar la página manualmente. El proxy ahora reenvía también los WebSocket: las notificaciones llegan en tiempo real.

---

## 📦 Paquetes actualizados

| Paquete | De | A |
|---|---|---|
| WuicCore | 1.3.0 | 1.3.2 |
| Wuic.Webcore | 1.3.0 | 1.3.2 |
| WuicOData | 1.3.0 | 1.3.2 |
| RuntimeEfCore | 1.3.0 | 1.3.2 |
| Wuic.MySqlProvider | 1.3.0 | 1.3.2 |
| Wuic.PostgresProvider | 1.3.0 | 1.3.2 |
| Wuic.OracleProvider | 1.3.0 | 1.3.2 |
| wuic-framework-lib (NPM) | 1.3.0 | 1.3.2 |

---

## 🔧 Acciones operativas recomendadas para quien actualiza

1. Para ejecutar el chatbot con un **modelo local y gratuito** (p. ej. Qwen vía Ollama): poner `rag-llm-provider=openai`, `rag-llm-base-url` en el endpoint local (p. ej. `http://localhost:11434/v1`) y `rag-llm-default-chat-model` en el id del modelo; asignar a `llm-api-key` un marcador (p. ej. `ollama`) si el runtime no la valida. Sin reinicio: las claves son hot-reload.
2. Para seguir en Anthropic no hay que hacer nada: `anthropic-api-key` sigue funcionando con `rag-llm-provider=anthropic` (por defecto).
3. El paquete de **fuentes (`-src-`) es más ligero**: ya no incluye las DLL de framework redundantes en la raíz, que `dotnet build` vuelve a crear a partir de los paquetes NuGet. Descargar el nuevo `-src-` no requiere ninguna acción.
4. En el **primer uso del chatbot** con el motor .NET, el administrador verá en la campana el progreso de la descarga de los modelos ONNX. Esperar la notificación "listo" antes del primer `Ask`.
5. Las **apps nuevas** generadas incluyen automáticamente los archivos de contexto para asistentes de IA en la raíz del workspace; para las apps existentes pueden regenerarse.
