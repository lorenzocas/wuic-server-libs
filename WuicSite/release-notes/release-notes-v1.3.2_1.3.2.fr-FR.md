# Notes de version — WUIC Framework v1.3.2

**Date** : 14 juin 2026
**Version publiée précédente** : 1.3.0 (11 juin 2026)
**Backend** : .NET 10 + IIS / Linux nginx
**Frontend** : Angular 21

---

Une version de consolidation autour du **chatbot RAG** introduit en 1.3.0 : le modèle conversationnel n'est plus lié à Anthropic — tout endpoint compatible OpenAI, y compris les runtimes locaux comme Ollama avec des modèles ouverts (Qwen), est désormais configurable et tourne sans clé API. À côté de cela, une série de correctifs sur l'installateur de first-run, le paquet sources et le scaffolding des métadonnées qui se manifestaient sur les installations neuves, ainsi qu'un workspace prêt pour les assistants IA de développement.

---

## 🤖 Chatbot RAG — fournisseur LLM flexible (y compris local et gratuit)

Le modèle conversationnel du chatbot est désormais indépendant du fournisseur. Outre Anthropic, les endpoints **compatibles OpenAI** sont pris en charge, ce qui inclut les runtimes locaux (p. ex. Ollama) : on peut exécuter des modèles ouverts et gratuits comme **Qwen** sur sa propre machine, **sans clé API et sans coût par token**.

- `rag-llm-provider` — `anthropic` (par défaut) / `openai` / `openrouter`. Sélectionne le dialecte wire du fournisseur.
- `rag-llm-base-url` — override de l'endpoint ; en l'indiquant vers l'URL d'un serveur local (p. ex. `http://localhost:11434/v1` pour Ollama), le chatbot dialogue avec le modèle en local.
- `rag-llm-default-chat-model` — id du modèle pour le fournisseur choisi (p. ex. un modèle Qwen sur Ollama).
- `llm-api-key` — clé du fournisseur actif ; pour les runtimes locaux qui ne la valident pas, une valeur de remplacement (p. ex. `ollama`) suffit. L'historique `anthropic-api-key` reste valide quand `rag-llm-provider=anthropic` (aucune migration).

Toutes les clés sont en **hot-reload** depuis `appsettings.json` : changer de fournisseur ou de modèle ne nécessite aucun redémarrage.

**Retrieval plus précis** — le re-ranking des résultats a été affiné : le chatbot cite des sources plus pertinentes sur les requêtes en langage naturel.

**Notifications de setup** — au premier usage, le moteur .NET télécharge les modèles ONNX à la demande. L'administrateur reçoit désormais dans la cloche les notifications de **démarrage / prêt / erreur** du téléchargement, sur les quatre fournisseurs de BD, même lorsque l'initialisation est déclenchée par une requête sans utilisateur connecté.

**Accélération GPU automatique** — sur une machine avec GPU NVIDIA, le moteur utilise le GPU sans installer CUDA : au premier lancement, en plus des modèles ONNX, il télécharge à la demande le runtime CUDA 12 + cuDNN 9 nécessaire (~1,8 Go, une seule fois, uniquement si un GPU est présent) et le configure lui-même. Sans GPU → CPU, aucun téléchargement supplémentaire. Override manuel avec `rag-engine-cuda-path`.

---

## 🧩 Workspace prêt pour les assistants IA de développement

Les applications générées avec le framework incluent désormais une **collection de fichiers markdown de contexte** (description du projet, conventions, règles opérationnelles) à la racine du workspace. Ces fichiers rendent les assistants IA agentiques — **Continue**, **Cline**, Cursor et similaires — immédiatement conscients de la structure et des conventions WUIC, sans installer d'extension propriétaire. Tout client qui lit le contexte du workspace se comporte comme un assistant « WUIC-native ».

---

## 🐛 Correctifs notables

- **Installateur de first-run — chemin par script SQL (non-BAK)** : lors du provisioning de la BD de métadonnées via le script SQL incrémental (alternative au restore depuis un `.bak`), le parser des lots séparés par `GO` traitait mal certains séparateurs, faisant échouer la création du schéma sur les installations neuves. Le splitter a été corrigé et les installations par script se terminent correctement.

- **Paquet sources — moteur RAG .NET introuvable au runtime** : dans le paquet sources (`-src-`), le moteur `WuicRagEngine.dll` était placé à la racine du paquet, tandis que l'exécutable, lancé depuis `bin/`, le cherchait à côté de lui — le chatbot RAG ne démarrait pas (« WuicRagEngine.dll introuvable »). Le loader recherche désormais le dossier `rag-engine/` à plusieurs emplacements (sortie de build, content-root, répertoire courant) et trouve le moteur dans les deux layouts de déploiement.

- **First-run — persistance de la clé API du chatbot** : la clé LLM saisie dans l'assistant de première installation est désormais écrite dans le `appsettings.json` canonique réellement lu par le runtime. Auparavant, dans certains layouts, elle pouvait atterrir dans une copie que le processus ne lit jamais, laissant le chatbot sans clé juste après l'installation.

- **Scaffolding des métadonnées — diagnostic et robustesse** : le scaffolding des métadonnées de certaines tables pouvait échouer avec un message générique (« Unable to scaffold metadata table ») qui masquait la cause réelle. L'erreur SQL effective remonte désormais jusqu'à l'appelant, et le cas qui la provoquait est résolu.

- **Paquet sources — notifications temps réel en dev** : dans le paquet `-src-`, le proxy du dev-server (`ng serve`) ne transférait pas les connexions WebSocket au backend ; le canal de notifications (`/ws`) tombait en timeout et les mises à jour n'apparaissaient qu'après un rechargement manuel de la page. Le proxy transfère désormais aussi les WebSockets : les notifications arrivent en temps réel.

---

## 📦 Paquets mis à jour

| Paquet | De | À |
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

## 🔧 Actions opérationnelles recommandées pour la mise à jour

1. Pour faire tourner le chatbot avec un **modèle local et gratuit** (p. ex. Qwen via Ollama) : définir `rag-llm-provider=openai`, `rag-llm-base-url` sur l'endpoint local (p. ex. `http://localhost:11434/v1`) et `rag-llm-default-chat-model` sur l'id du modèle ; renseigner `llm-api-key` avec une valeur de remplacement (p. ex. `ollama`) si le runtime ne la valide pas. Aucun redémarrage : les clés sont en hot-reload.
2. Pour rester sur Anthropic, aucune action n'est nécessaire : `anthropic-api-key` continue de fonctionner avec `rag-llm-provider=anthropic` (par défaut).
3. Le paquet **sources (`-src-`) est plus léger** : il n'inclut plus les DLL de framework redondantes à la racine, recréées par `dotnet build` à partir des paquets NuGet. Télécharger le nouveau `-src-` ne demande aucune action.
4. Au **premier usage du chatbot** avec le moteur .NET, l'administrateur verra dans la cloche la progression du téléchargement des modèles ONNX. Attendre la notification « prêt » avant le premier `Ask`.
5. Les **nouvelles apps** générées incluent automatiquement les fichiers de contexte pour assistants IA à la racine du workspace ; pour les apps existantes, ils peuvent être régénérés.
