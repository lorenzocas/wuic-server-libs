# Notas de la versión — WUIC Framework v1.3.3

**Fecha**: 21 de junio de 2026
**Versión publicada anteriormente**: 1.3.2 (18 de junio de 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Una versión dedicada al **chatbot RAG**: la configuración del modelo LLM se ha simplificado y unificado, ejecutar un modelo local gratuito (Qwen vía Ollama) es ahora una opción de primera clase, y el motor se ha endurecido frente a las particularidades de los modelos locales — de modo que las acciones propuestas en el diseñador y sobre los metadatos funcionan de forma fiable incluso sin un proveedor comercial.

---

## 🤖 Chatbot RAG — configuración LLM unificada

La configuración del proveedor LLM del chatbot se ha consolidado en torno a **una sola clave** y una lista explícita de proveedores.

- `rag-llm-provider` — `anthropic` / `openai` / `openrouter` / `ollama`, **a configurar explícitamente** (sin proveedor por defecto: si está vacío, el chatbot permanece en retrieval-only y no invoca ningún LLM). `ollama` es ahora un valor de primera clase: apunta a un runtime local vía `rag-llm-base-url`, con formato compatible con OpenAI.
- `rag-llm-api-key` — la **única** fuente de la clave, independiente del proveedor elegido. Sustituye al anterior par `llm-api-key` / `anthropic-api-key` (aceptados solo como fallback de migración). El valor especial `agent-sdk` usa el Agent SDK (`claude` CLI) vía subscription en lugar de la API de pago, si está instalado.
- `rag-llm-base-url` — override del endpoint; obligatorio para `ollama` (p. ej. `http://HOST:11434/v1`), opcional para los demás proveedores.
- `rag-llm-default-chat-model` — id del modelo para el proveedor elegido.

Todas las claves siguen en **hot-reload** desde `appsettings.json`: cambiar de proveedor o modelo no requiere reinicio.

## 🧠 LLM local gratuito (Qwen vía Ollama), sin API key

El chatbot puede ahora ejecutarse por completo sobre un **modelo local abierto y gratuito** — por ejemplo **Qwen** (`qwen2.5-coder:32b`) servido por **Ollama** en la propia máquina o en la LAN — sin API key y sin coste por token. Configuración típica en `appsettings.json` -> `AppSettings`:

```
rag-llm-provider           = ollama
rag-llm-base-url           = http://HOST:11434/v1
rag-llm-api-key            = ollama
rag-llm-default-chat-model = qwen2.5-coder:32b
```

En el paquete se incluye una guía completa para montar el servidor Ollama (Windows/Linux, exposición en LAN, tuning del context, arranque persistente).

## ⚙️ Acciones del chatbot fiables incluso con modelos locales

El motor se ha hecho tolerante a las particularidades de los modelos locales, que — a diferencia de los modelos comerciales — a veces no respetan al pie de la letra el formato de las llamadas a herramienta. El chatbot ahora recupera correctamente la acción propuesta incluso cuando el modelo la emite como texto o con escapes JSON no estándar. En la práctica, las acciones sobre el diseñador y sobre los metadatos — botones de tabla (bulk), botones de fila, estilos condicionales, callbacks, inyección de componentes en el diseñador — se proponen y aplican de forma fiable incluso con un LLM local.

## 🐛 Correcciones de errores destacables

- **Diseñador — layout multi-columna**: la inyección de un layout de varias columnas/áreas (p. ej. "3 columnas, cada una con una grid") propuesta por el chatbot ahora rellena correctamente todas las áreas. Antes, tras la primera celda, las siguientes no se resolvían y los componentes quedaban vacíos.
- **Chatbot — whitelist de rutas**: al pedir que se vincule un componente a una ruta con un nombre inexacto (p. ej. "provincie" por "stateprovinces"), el chatbot realiza ahora el match semántico y propone la acción, en lugar de responder erróneamente que la lista de rutas se está cargando.

## 🔧 Actualizaciones operativas recomendadas para quien actualiza

1. Para usar un LLM local gratuito, asignar en `appsettings.json` -> `AppSettings`: `rag-llm-provider=ollama`, `rag-llm-base-url`, `rag-llm-api-key` (valor de marcador, p. ej. `ollama`) y `rag-llm-default-chat-model`.
2. Migrar la clave del chatbot a `rag-llm-api-key`: las anteriores `llm-api-key` y `anthropic-api-key` siguen funcionando como fallback, pero la configuración recomendada usa solo `rag-llm-api-key`.
3. Para usar el Agent SDK vía subscription en lugar de la API de pago, poner `rag-llm-api-key=agent-sdk` (requiere la `claude` CLI instalada).
