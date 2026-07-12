# Notas de la versión — WUIC Framework v1.5.0

**Fecha**: 11 de julio de 2026
**Versión publicada anterior**: 1.3.2 (18 de junio de 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Una versión amplia que reúne trabajo en varios frentes. El **chatbot RAG** estrena una configuración LLM simplificada y unificada, con la ejecución de un modelo local gratuito (Qwen vía Ollama) ahora como opción de primera clase y un motor endurecido frente a las particularidades de los modelos locales; un nuevo plugin para **Visual Studio Code**, **WUIC Assistant**, lleva el mismo enfoque agéntico dentro del editor. El nuevo **Scene3D Designer** trae la creación de escenas 3D dentro de la aplicación — materiales PBR, efectos de shader, luces con baking, física y un visor que vincula los objetos a los datos — y el renderizado ahora se puede elegir entre WebGL y **WebGPU**. El **Workflow Designer** incorpora un paquete de creación asistida (plantillas, validación del grafo, diálogos guiados, ayuda en línea) y el **diseñador de dashboards** un conjunto de mejoras de edición.

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

## 🧩 Asistente agéntico en VS Code — WUIC Assistant

El paquete incluye ahora un plugin para **Visual Studio Code**, **WUIC Assistant** (`llm-workspace/plugin/wuic-assistant.vsix`): un asistente que ya conoce las convenciones del framework y opera directamente sobre el proyecto abierto. Genera componentes Angular (cards, dashboards con tiles KPI, list-grids con navegación al formulario de edición), componentes alimentados por un endpoint .NET personalizado, y propone cambios de metadatos (estilos condicionales, acciones de tabla y de fila, lookups). Cada escritura pasa por una vista previa antes de la confirmación.

Usa el mismo RAG local de WUIC a través del servidor MCP `wuic-rag` (arrancado automáticamente) y el grounding ya presente en el proyecto, por lo que no requiere configuración manual del servidor MCP. El modelo LLM es a elección — **local vía Ollama** (Qwen, sin API key) o Anthropic.

Instalación desde el ZIP:

```
code --install-extension llm-workspace/plugin/wuic-assistant.vsix
```

Alternativamente lo instala `install-llm-workspace.ps1`. Luego `Ctrl+Shift+P` -> **WUIC Assistant: Apri Chat**; el proveedor se elige en los ajustes (`wuicAssistant.provider` = `ollama` o `anthropic`).

## 🧊 Scene3D Designer (novedad)

Un nuevo diseñador 3D visual en la ruta `#/scene3d_designer`, publicado en solo lectura a través del Scene3D Viewer (`#/scene3d_viewer/:scene_key`). Permite componer una escena tridimensional y vincular sus objetos a los datos de la aplicación.

- **Paleta e importación**: primitivas (cubo, esfera, plano, cilindro, cono, toro), grupos, luces, cámara, texto 3D y Mesh Repeater (instancias generadas desde los datos). Importación de modelos externos en glTF/GLB, OBJ, FBX, STL y DAE. La paleta es extensible desde metadatos con tipos personalizados.
- **Materiales PBR**: metalness, roughness, emisivo, opacidad, wireframe, flat shading y caras; para el material físico además transmission, IOR, grosor y absorción volumétrica (vidrio de color).
- **Efectos de shader**: un efecto descrito en JSON (respaldado por esquema, con autocompletado y una vista "de estructura") se compila para el renderizador activo; como alternativa, shaders GLSL escritos a mano en el renderizador WebGL.
- **Iluminación**: luces de escena con sombras suaves, baking de la iluminación estática en los colores de vértice (unlit) y — en el renderizador WebGL — un path tracer de vista previa fotorrealista.
- **Animación y física**: controles de transporte para los clips de los activos importados; física opcional por objeto con simulación Play/Stop en el diseñador y autoplay en el visor.
- **Vinculación a datos**: cada objeto se vincula a una ruta WUIC (con registro opcional) y mapea propiedades visuales (etiqueta, color, visibilidad) a columnas; al hacer doble clic en un objeto vinculado en el visor se abre el CRUD del registro.
- **Miniaturas automáticas**: al guardar, la escena se captura desde el canvas y se muestra como vista previa en la lista "Cargar escena", sin configuración ni proceso externo.

Las rutas del diseñador y del visor requieren la función `scene3d-designer`. Las tablas de soporte se crean y actualizan automáticamente en el primer uso, en todas las bases de datos compatibles.

## 🖥️ Renderizador WebGPU (opt-in)

El renderizado de la escena y del visor ahora se puede elegir entre **WebGL** (por defecto) y **WebGPU** (activable desde la barra de herramientas). Cuando WebGPU no está disponible en el navegador, el diseñador permanece en WebGL automáticamente. El modo elegido se guarda con la escena y se restaura al abrir. Con el renderizador WebGPU activo, el baking de luces se ejecuta en la GPU (sombras incluidas), mucho más rápido en escenas densas; los shaders GLSL escritos a mano y el path tracing siguen disponibles en el renderizador WebGL.

## 🔀 Workflow Designer — creación asistida

El diseñador de workflows (`#/workflow-designer`) ahora acompaña la construcción de un proceso desde cero.

- **Plantillas de inicio**: "Nuevo desde plantilla" genera un grafo listo para los patrones comunes (aprobación simple, cola claim/release, cadena por umbrales, tareas paralelas): se eligen la ruta principal y — donde haga falta — el campo de estado, y el grafo, las acciones y las transiciones nacen ya conectados.
- **Validación del grafo**: "Validar grafo" señala los problemas antes de guardar (start sin salidas, nodos inalcanzables, acción sin objetivo, condición vacía, rama muerta, timer o split incompletos, permiso con un rol inexistente). Al hacer clic en un aviso, el canvas encuadra el nodo. Guardar nunca se bloquea: con problemas abiertos aparece un resumen con "Guardar de todos modos".
- **Configuraciones guiadas**: los diálogos de timer y de tareas paralelas usan desplegables y un autocompletado de rutas en lugar de campos de texto libre escritos de memoria.
- **Incorporación y ayuda**: una lista de primeros pasos en un canvas vacío, tooltips descriptivos en la paleta y una "Guía rápida" con una leyenda de las formas y un glosario de conceptos (transición, guarda, permiso, acción interna).

## 🎨 Diseñador de dashboards — edición más rápida

- **Ajuste a la cuadrícula**: se activa desde el menú de acciones del diseñador, muestra la cuadrícula en el canvas y alinea automáticamente el arrastre, el redimensionado y los drops desde la paleta. Al activarlo, los elementos ya presentes en el canvas también se alinean a la cuadrícula.
- **Flujo normal / absoluto**: nuevo flag en el menú de acciones (por defecto: flujo normal, sin cambios para los dashboards existentes). En modo absoluto los elementos soltados se posicionan en las coordenadas del drop, fuera del flujo: redimensionar uno no desplaza los demás. El drop dentro de un contenedor usa el contenedor como referencia de posición, y el runtime reconoce automáticamente los dashboards guardados en este modo.
- **Atajos de teclado**: `Supr`/`Backspace` elimina el elemento seleccionado, las flechas lo desplazan, `Ctrl+Z`/`Ctrl+Y` deshace/rehace. Arrastrando un rectángulo de selección desde un área vacía del canvas se seleccionan varios elementos: las flechas y `Supr` actúan sobre toda la selección.
- **Importación/exportación de JSON y presets**: el dashboard actual se exporta como archivo JSON re-importable (idéntico al contenido persistido), útil para llevar layouts entre entornos. Los presets guardan layouts reutilizables con un nombre y se reaplican con un clic.
- **Mover entre pestañas**: desde el menú contextual de un elemento dentro de una pestaña, *Mover a nueva pestaña* crea una pestaña nueva y migra allí el elemento (bindings y estado preservados); *Mover a otra pestaña* — disponible cuando el tabview tiene varias pestañas — lo mueve a una pestaña existente a elección. La pestaña de destino se activa automáticamente, igual que una pestaña recién soltada.
- **Importar dashboard/preset en un elemento**: desde el menú contextual de un contenedor se importa un dashboard guardado o un preset directamente dentro del elemento; los identificadores de los elementos importados se regeneran y las referencias internas (datasources incluidos) se remapean, sin colisiones con el contenido existente.

## 🐛 Correcciones de errores destacadas

- **Diseñador — layout multi-columna**: la inyección de un layout de varias columnas/áreas (p. ej. "3 columnas, cada una con una grid") propuesta por el chatbot ahora rellena correctamente todas las áreas. Antes, tras la primera celda, las siguientes no se resolvían y los componentes quedaban vacíos.
- **Chatbot — whitelist de rutas**: al pedir que se vincule un componente a una ruta con un nombre inexacto (p. ej. "provincie" por "stateprovinces"), el chatbot realiza ahora el match semántico y propone la acción, en lugar de responder erróneamente que la lista de rutas se está cargando.
- **Visor 3D — navegación entre escenas**: al abrir escenas distintas en secuencia desde el mismo visor, ahora cada una carga su propia escena. Antes el visor podía seguir mostrando la primera escena abierta.
- **Editor JSON con esquema**: el editor de código en modo JSON ofrece ahora una vista "de estructura" (activable con un interruptor) para añadir y quitar propiedades tipadas guiadas por el esquema, sin escribir JSON a mano.

## 🔧 Actualizaciones operativas recomendadas para quienes actualizan

1. Para usar un LLM local gratuito, asignar en `appsettings.json` -> `AppSettings`: `rag-llm-provider=ollama`, `rag-llm-base-url`, `rag-llm-api-key` (valor de marcador, p. ej. `ollama`) y `rag-llm-default-chat-model`.
2. Migrar la clave del chatbot a `rag-llm-api-key`: las anteriores `llm-api-key` y `anthropic-api-key` siguen funcionando como fallback, pero la configuración recomendada usa solo `rag-llm-api-key`.
3. Para el asistente en VS Code, instalar el plugin desde el ZIP: `code --install-extension llm-workspace/plugin/wuic-assistant.vsix` (o dejar que lo instale `install-llm-workspace.ps1`).
4. Para usar el Scene3D Designer, habilite la función `scene3d-designer` en la licencia activa. Las tablas de soporte se crean y migran automáticamente en el primer uso; el renderizador WebGPU es opt-in desde la barra de herramientas, con fallback automático a WebGL.
