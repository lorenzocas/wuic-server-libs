# Notes de version — WUIC Framework v1.3.3

**Date** : 21 juin 2026
**Version précédemment publiée** : 1.3.2 (18 juin 2026)
**Backend** : .NET 10 + IIS / Linux nginx
**Frontend** : Angular 21

---

Une version dédiée au **chatbot RAG** : la configuration du modèle LLM a été simplifiée et unifiée, l'exécution d'un modèle local gratuit (Qwen via Ollama) est désormais une option de premier ordre, et le moteur a été durci face aux particularités des modèles locaux — de sorte que les actions proposées sur le designer et sur les métadonnées fonctionnent de manière fiable même sans fournisseur commercial. Le paquet inclut par ailleurs un nouveau plugin **Visual Studio Code**, **WUIC Assistant**, qui apporte la même approche agentique dans l'éditeur.

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

## 🐛 Corrections de bugs notables

- **Designer — layout multi-colonnes** : l'injection d'un layout multi-colonnes/multi-zones (ex. "3 colonnes, chacune avec une grille") proposée par le chatbot remplit désormais correctement toutes les zones. Auparavant, après la première cellule, les suivantes n'étaient pas résolues et les composants restaient vides.
- **Chatbot — whitelist des routes** : lorsqu'on demande de lier un composant à une route au nom inexact (ex. "provincie" pour "stateprovinces"), le chatbot effectue désormais le match sémantique et propose l'action, au lieu de répondre à tort que la liste des routes est en cours de chargement.

## 🔧 Mises à jour opérationnelles recommandées pour qui met à jour

1. Pour utiliser un LLM local gratuit, renseigner dans `appsettings.json` -> `AppSettings` : `rag-llm-provider=ollama`, `rag-llm-base-url`, `rag-llm-api-key` (valeur indicative, ex. `ollama`) et `rag-llm-default-chat-model`.
2. Migrer la clé du chatbot vers `rag-llm-api-key` : les anciennes `llm-api-key` et `anthropic-api-key` continuent de fonctionner en fallback, mais la configuration recommandée n'utilise que `rag-llm-api-key`.
3. Pour utiliser l'Agent SDK via subscription au lieu de l'API à l'usage, définir `rag-llm-api-key=agent-sdk` (nécessite la `claude` CLI installée).
4. Pour l'assistant dans VS Code, installer le plugin depuis le ZIP : `code --install-extension llm-workspace/plugin/wuic-assistant.vsix` (ou le laisser installer par `install-llm-workspace.ps1`).
