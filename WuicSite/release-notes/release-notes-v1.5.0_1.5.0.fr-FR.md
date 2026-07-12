# Notes de version — WUIC Framework v1.5.0

**Date**: 11 juillet 2026
**Version précédente publiée**: 1.3.2 (18 juin 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Une version large qui rassemble des travaux sur plusieurs fronts. Le **chatbot RAG** dispose d'une configuration LLM simplifiée et unifiée, l'exécution d'un modèle local gratuit (Qwen via Ollama) devient une option de premier ordre et le moteur a été durci face aux particularités des modèles locaux ; un nouveau plugin **Visual Studio Code**, **WUIC Assistant**, apporte la même approche agentique dans l'éditeur. Le nouveau **Scene3D Designer** amène la création de scènes 3D dans l'application — matériaux PBR, effets de shader, lumières avec baking, physique et une visionneuse qui lie les objets aux données — et le rendu se choisit désormais entre WebGL et **WebGPU**. Le **Workflow Designer** reçoit un ensemble d'aide à la création (modèles de départ, validation du graphe, boîtes de dialogue guidées, aide en ligne), et le **Designer de dashboards** un ensemble d'améliorations d'édition.

---

## 🤖 Chatbot RAG — configuration LLM unifiée

La configuration du fournisseur LLM du chatbot a été consolidée autour d'**une seule clé** et d'une liste explicite de fournisseurs.

- `rag-llm-provider` — `anthropic` / `openai` / `openrouter` / `ollama`, **à définir explicitement** (aucun fournisseur par défaut : si vide, le chatbot reste en retrieval-only et n'invoque aucun LLM). `ollama` est désormais une valeur de premier ordre : pointe vers un runtime local via `rag-llm-base-url`, au format compatible OpenAI.
- `rag-llm-api-key` — la source **unique** de la clé, indépendante du fournisseur choisi. Remplace l'ancien couple `llm-api-key` / `anthropic-api-key` (acceptés uniquement comme fallback de migration). La valeur spéciale `agent-sdk` utilise l'Agent SDK (`claude` CLI) via subscription au lieu de l'API à l'usage, si installé.
- `rag-llm-base-url` — override de l'endpoint ; obligatoire pour `ollama` (ex. `http://HOST:11434/v1`), optionnel pour les autres fournisseurs.
- `rag-llm-default-chat-model` — id du modèle pour le fournisseur choisi.

Toutes les clés restent en **hot-reload** depuis `appsettings.json` : changer de fournisseur ou de modèle ne nécessite aucun redémarrage.

## 🧠 LLM local gratuit (Qwen via Ollama), sans clé API

Le chatbot peut désormais tourner entièrement sur un **modèle local ouvert et gratuit** — par exemple **Qwen** (`qwen2.5-coder:32b`) servi par **Ollama** sur sa propre machine ou sur le LAN — sans clé API et sans coût par token. Configuration typique dans `appsettings.json` -> `AppSettings` :

```
rag-llm-provider           = ollama
rag-llm-base-url           = http://HOST:11434/v1
rag-llm-api-key            = ollama
rag-llm-default-chat-model = qwen2.5-coder:32b
```

Un guide complet pour monter le serveur Ollama (Windows/Linux, exposition LAN, tuning du context, démarrage persistant) est inclus dans le paquet.

## ⚙️ Actions du chatbot fiables même avec des modèles locaux

Le moteur a été rendu tolérant aux particularités des modèles locaux qui — contrairement aux modèles commerciaux — ne respectent parfois pas à la lettre le format des appels d'outil. Le chatbot récupère désormais correctement l'action proposée même lorsque le modèle l'émet sous forme de texte ou avec des escapes JSON non standard. En pratique, les actions sur le designer et sur les métadonnées — boutons de table (bulk), boutons de ligne, styles conditionnels, callbacks, injection de composants dans le designer — sont proposées et appliquées de manière fiable même avec un LLM local.

## 🧩 Assistant agentique dans VS Code — WUIC Assistant

Le paquet inclut désormais un plugin pour **Visual Studio Code**, **WUIC Assistant** (`llm-workspace/plugin/wuic-assistant.vsix`) : un assistant qui connaît déjà les conventions du framework et opère directement sur le projet ouvert. Il génère des composants Angular (cards, dashboards avec tuiles KPI, list-grids avec navigation vers le formulaire d'édition), des composants alimentés par un endpoint .NET personnalisé, et propose des modifications de métadonnées (styles conditionnels, actions de table et de ligne, lookups). Chaque écriture passe par un aperçu avant confirmation.

Il utilise le même RAG local WUIC via le serveur MCP `wuic-rag` (démarré automatiquement) et le grounding déjà présent dans le projet, sans configuration manuelle du serveur MCP. Le modèle LLM est au choix — **local via Ollama** (Qwen, sans clé API) ou Anthropic.

Installation depuis le ZIP :

```
code --install-extension llm-workspace/plugin/wuic-assistant.vsix
```

Sinon, `install-llm-workspace.ps1` l'installe. Puis `Ctrl+Shift+P` -> **WUIC Assistant: Apri Chat** ; le fournisseur se choisit dans les paramètres (`wuicAssistant.provider` = `ollama` ou `anthropic`).

## 🧊 Scene3D Designer (nouveauté)

Un nouveau concepteur 3D visuel sur la route `#/scene3d_designer`, publié en lecture seule via le Scene3D Viewer (`#/scene3d_viewer/:scene_key`). Il permet de composer une scène tridimensionnelle et d'en lier les objets aux données de l'application.

- **Palette et import**: primitives (cube, sphère, plan, cylindre, cône, tore), groupes, lumières, caméra, texte 3D et Mesh Repeater (instances générées à partir des données). Import de modèles externes en glTF/GLB, OBJ, FBX, STL et DAE. La palette est extensible depuis les métadonnées avec des types personnalisés.
- **Matériaux PBR**: metalness, roughness, émissif, opacité, wireframe, flat shading et faces ; pour le matériau physique également transmission, IOR, épaisseur et absorption volumétrique (verre coloré).
- **Effets de shader**: un effet décrit en JSON (adossé à un schéma, avec complétion et une vue « structure ») est compilé pour le renderer actif ; sinon, des shaders GLSL écrits à la main sur le renderer WebGL.
- **Éclairage**: lumières de scène avec ombres douces, baking de l'éclairage statique dans les couleurs de sommet (unlit) et — sur le renderer WebGL — un path tracer d'aperçu photoréaliste.
- **Animation et physique**: contrôles de transport pour les clips des assets importés ; physique optionnelle par objet avec simulation Play/Stop dans le concepteur et lecture automatique dans la visionneuse.
- **Liaison aux données**: chaque objet se lie à une route WUIC (avec enregistrement optionnel) et mappe des propriétés visuelles (libellé, couleur, visibilité) sur des colonnes ; un double-clic sur un objet lié dans la visionneuse ouvre le CRUD de l'enregistrement.
- **Miniatures automatiques**: à l'enregistrement, la scène est capturée depuis le canvas et affichée en aperçu dans la liste « Charger la scène », sans configuration ni processus externe.

Les routes du concepteur et de la visionneuse nécessitent la fonctionnalité `scene3d-designer`. Les tables de support sont créées et mises à jour automatiquement à la première utilisation, sur toutes les bases de données prises en charge.

## 🖥️ Renderer WebGPU (opt-in)

Le rendu de la scène et de la visionneuse se choisit désormais entre **WebGL** (par défaut) et **WebGPU** (activable depuis la barre d'outils). Quand WebGPU n'est pas disponible dans le navigateur, le concepteur reste automatiquement sur WebGL. Le mode choisi est enregistré avec la scène et restauré à l'ouverture. Avec le renderer WebGPU actif, le baking des lumières s'exécute sur le GPU (ombres comprises), bien plus rapide sur les scènes denses ; les shaders GLSL écrits à la main et le path tracing restent disponibles sur le renderer WebGL.

## 🔀 Workflow Designer — création assistée

Le concepteur de workflows (`#/workflow-designer`) accompagne désormais la construction d'un processus de zéro.

- **Modèles de départ**: « Nouveau depuis modèle » génère un graphe prêt pour les schémas courants (approbation simple, file claim/release, chaîne par seuils, tâches parallèles) : on choisit la route principale et — le cas échéant — le champ d'état, et le graphe, les actions et les transitions naissent déjà reliés.
- **Validation du graphe**: « Valider le graphe » signale les problèmes avant l'enregistrement (start sans sortie, nœuds inaccessibles, action sans cible, condition vide, branche morte, timer ou split incomplets, permission avec un rôle inexistant). Cliquer sur un signalement cadre le nœud sur le canvas. L'enregistrement n'est jamais bloqué : en cas de problèmes ouverts, un récapitulatif apparaît avec « Enregistrer quand même ».
- **Configurations guidées**: les boîtes de dialogue de timer et de tâches parallèles utilisent des menus déroulants et une autocomplétion des routes au lieu de champs libres saisis de mémoire.
- **Prise en main et aide**: une liste des premières étapes sur un canvas vide, des info-bulles descriptives sur la palette et un « Guide rapide » avec une légende des formes et un glossaire des concepts (transition, garde, permission, action interne).

## 🎨 Designer de dashboards — édition plus rapide

- **Alignement sur la grille** : activable depuis le menu d'actions du designer, il affiche la grille sur le canvas et aligne automatiquement le glissement, le redimensionnement et les drops depuis la palette. À l'activation, les éléments déjà présents sur le canvas sont eux aussi alignés sur la grille.
- **Flux normal / absolu** : nouveau flag dans le menu d'actions (par défaut : flux normal, aucun changement pour les dashboards existants). En mode absolu, les éléments déposés se positionnent aux coordonnées du drop, hors du flux : en redimensionner un ne déplace pas les autres. Le drop dans un conteneur utilise le conteneur comme référence de position, et le runtime reconnaît automatiquement les dashboards enregistrés dans ce mode.
- **Raccourcis clavier** : `Suppr`/`Backspace` supprime l'élément sélectionné, les flèches le déplacent, `Ctrl+Z`/`Ctrl+Y` annule/rétablit. En traçant un rectangle de sélection depuis une zone vide du canvas, on sélectionne plusieurs éléments : les flèches et `Suppr` agissent sur toute la sélection.
- **Import/export JSON et presets** : le dashboard courant s'exporte en fichier JSON ré-importable (identique au contenu persisté), utile pour transférer des layouts entre environnements. Les presets enregistrent des layouts réutilisables sous un nom et se réappliquent en un clic.
- **Déplacer entre onglets** : depuis le menu contextuel d'un élément dans un onglet, *Déplacer vers un nouvel onglet* crée un nouvel onglet et y migre l'élément (bindings et état préservés) ; *Déplacer vers un autre onglet* — disponible quand la tabview a plusieurs onglets — le déplace vers un onglet existant au choix. L'onglet de destination est activé automatiquement, tout comme un onglet fraîchement déposé.
- **Importer un dashboard/preset dans un élément** : depuis le menu contextuel d'un conteneur, on importe un dashboard enregistré ou un preset directement dans l'élément ; les identifiants des éléments importés sont régénérés et les références internes (datasources comprises) remappées, sans collision avec le contenu existant.

## 🐛 Corrections de bugs notables

- **Designer — layout multi-colonnes** : l'injection d'un layout multi-colonnes/multi-zones (ex. "3 colonnes, chacune avec une grille") proposée par le chatbot remplit désormais correctement toutes les zones. Auparavant, après la première cellule, les suivantes n'étaient pas résolues et les composants restaient vides.
- **Chatbot — whitelist des routes** : lorsqu'on demande de lier un composant à une route au nom inexact (ex. "provincie" pour "stateprovinces"), le chatbot effectue désormais le match sémantique et propose l'action, au lieu de répondre à tort que la liste des routes est en cours de chargement.
- **Visionneuse 3D — navigation entre scènes**: en ouvrant des scènes différentes à la suite depuis la même visionneuse, chacune charge désormais sa propre scène. Auparavant, la visionneuse pouvait continuer d'afficher la première scène ouverte.
- **Éditeur JSON adossé à un schéma**: l'éditeur de code en mode JSON propose désormais une vue « structure » (activable par un interrupteur) pour ajouter et retirer des propriétés typées guidées par le schéma, sans écrire de JSON à la main.

## 🔧 Mises à jour opérationnelles recommandées pour les mises à niveau

1. Pour utiliser un LLM local gratuit, renseigner dans `appsettings.json` -> `AppSettings` : `rag-llm-provider=ollama`, `rag-llm-base-url`, `rag-llm-api-key` (valeur indicative, ex. `ollama`) et `rag-llm-default-chat-model`.
2. Migrer la clé du chatbot vers `rag-llm-api-key` : les anciennes `llm-api-key` et `anthropic-api-key` continuent de fonctionner en fallback, mais la configuration recommandée n'utilise que `rag-llm-api-key`.
3. Pour l'assistant dans VS Code, installer le plugin depuis le ZIP : `code --install-extension llm-workspace/plugin/wuic-assistant.vsix` (ou le laisser installer par `install-llm-workspace.ps1`).
4. Pour utiliser le Scene3D Designer, activez la fonctionnalité `scene3d-designer` dans la licence active. Les tables de support sont créées et migrées automatiquement à la première utilisation ; le renderer WebGPU est en opt-in depuis la barre d'outils, avec repli automatique vers WebGL.
