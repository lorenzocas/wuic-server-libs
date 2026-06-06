# Notes de version — WUIC Framework v1.3.0

**Date** : 3 juin 2026
**Version précédente publiée** : 1.2.1 (31 mai 2026)
**Backend** : .NET 10 + IIS / Linux nginx
**Frontend** : Angular 21

---

Version mineure centrée sur l'intégration du **chatbot RAG** côté framework : historique conversationnel persistant, gestion automatique du contexte, configuration hot-reload depuis `appsettings.json` et schéma cross-DBMS auto-appliqué au premier démarrage. À côté de la feature principale, quelques fixes au scaffolder de metadata et à la robustesse du repository chat sur MySQL/Oracle qui se manifestaient dans les scénarios de provisioning DB neufs.

Le chatbot est le premier composant WUIC avec état côté serveur (`_rag_chat_sessions` + `_rag_chat_messages`) qui s'étend sur les quatre providers supportés sans configuration manuelle du schéma. Le premier `Ask` détecte le provider, applique dans l'ordre les patches SQL incrémentaux et démarre. Avec cette release le stack de serving peut également tourner **nativement sur .NET** (moteur ONNX in-process), rendant le déploiement chez le client indépendant de Python.

---

## 🤖 Chatbot RAG — gestion du contexte end-to-end

Le composant `<wuic-rag-chatbot>` persiste désormais plusieurs sessions par utilisateur, avec historique complet de la conversation, summarization automatique du contexte et configuration via `appsettings.json`. La feature est opt-in : sans `anthropic-api-key` configurée, le chatbot reste inactif.

**Sessions**

- Historique conversationnel persisté par utilisateur. La session survit aux reloads du navigateur et aux changements de route.
- Popup de sélection des sessions ordonnées par `updated_at` décroissant, avec titre dérivé du premier prompt (tronqué à 100 caractères + tooltip complet).
- Renommage inline avec persistance immédiate.

**Gestion automatique du contexte**

- **Visual cue % dans le header du chatbot** : un cercle coloré qui indique la consommation de la fenêtre de contexte du modèle (vert <60% / jaune 60-80% / orange 80-90% / rouge >90%). La valeur provient des tokens réellement consommés par l'API Anthropic et est persistée par tour, donc elle survit au reload.
- **Auto-compact pre-Ask** : quand la conversation dépasse le seuil configurable (défaut 30 tours) et qu'au moins 10 tours ne sont pas encore résumés, le backend lance un compact best-effort en arrière-plan avant le prochain Ask. Le résumé mis à jour est injecté dans le system prompt pour les tours futurs.
- **Compact à la demande** : l'utilisateur peut forcer un compact via le slash command `/compact` ou en cliquant sur le cercle cue.
- **Memory facts** : le modèle lui-même peut "épingler" des faits high-priority via tool use (`remember_fact`/`forget_fact`). Les faits restent dans le system prompt même après un compact (max 20, eviction FIFO).
- **Follow-up questions** : le modèle suggère jusqu'à 3 questions de suivi, rendues comme des chips cliquables sous la réponse. Clic = pré-remplit l'input box (n'envoie pas automatiquement).

**Configuration `appsettings.json`**

- `anthropic-api-key` — clé API Anthropic, **hot-reload**. Non hard-coded, ne jamais committer dans le repo.
- `anthropic-default-chat-model` — `claude-haiku-4-5-20251001` (200k, défaut) / `claude-sonnet-4-5-20250929` / `claude-opus-4-5`. Détermine la fenêtre de contexte et le driver du visual cue.
- `anthropic-auto-compact-threshold` — entier >=0, défaut `30`. Mettre à `0` pour désactiver l'auto-compact (le `/compact` manuel reste disponible).

**Auto-migration cross-DBMS**

Le schéma chat history (5 patches incrémentaux) est appliqué de manière idempotente au premier `Ask`, sur le provider configuré (MSSQL / MySQL / PostgreSQL / Oracle). Aucun step DBA requis sur les installations existantes.

---

## 🛠️ Actions que le chatbot peut appliquer au projet

Au-delà de répondre en langage naturel, le chatbot peut **proposer des modifications concrètes** au projet sous forme de chips d'action avec un bouton "Appliquer". Chaque chip indique ce qu'il va faire (route cible, code généré, justification) et l'utilisateur décide de l'appliquer ou non. Rien n'est exécuté sans un clic explicite.

Types d'action supportés :

- **Actions toolbar et de ligne** — ajoute des boutons personnalisés à la toolbar d'une `<wuic-list-grid>` ou à l'action d'une ligne unique, avec des callbacks JavaScript générés. Exemples : "ajoute une action qui exporte les lignes sélectionnées en CSV", "mets un bouton Approuver sur chaque ligne".
- **Styles conditionnels de ligne et de colonne** — applique des classes CSS à une ligne ou à une cellule individuelle selon une condition JS. Exemples : "surligne en rouge les lignes avec échéance dépassée", "mets un fond vert sur la cellule `statut` quand elle vaut 'OK'".
- **Formule d'affichage de colonne** — remplace la représentation d'une colonne en liste par un template HTML/Angular personnalisé (badge, icône, lien, pourcentage coloré). Exemple : "affiche `priorité` comme un badge vert/jaune/rouge".
- **Formule du titre de formulaire** — calcule dynamiquement le titre du formulaire d'édition d'un enregistrement à partir de son contenu. Exemple : "le titre doit être `Client {raison_sociale}`".
- **Valeur par défaut et validation personnalisée** — génère des callbacks pour les valeurs par défaut à l'ouverture du formulaire (pré-remplissage de champs) ou pour la validation complexe (cross-field, regex personnalisés). Exemples : "default `date_creation` = aujourd'hui", "valide que `email` se termine par @entreprise.fr".
- **Selection-changed et lifecycle callbacks** — hooks sur les événements du formulaire (changement de sélection d'enregistrement, before-save, after-save, after-delete) pour des side-effects personnalisés : refresh des datasources liés, notifications, audit log applicatif.
- **Modifications de metadata** — applique des modifications directes aux metadata de table/colonne (caption, tri, masquer en list/edit, validations de base) sans passer par l'éditeur de metadata manuel.
- **Snippets SQL dans les metadata (super-admin)** — écrit des fragments SQL bruts dans les champs de metadata qui sont concaténés à l'exécution dans les requêtes auto-générées : JOIN personnalisé sur la route, clause SELECT personnalisée sur une colonne, formule de colonne calculée, expression d'affichage de lookup. Exemples : "calcule `total` sur `orders` comme `price` × `quantity`", "ajoute un join à `payments` sur `invoice_id`". Le chatbot connaît le dialecte du provider actif (mssql/mysql/postgres/oracle) et génère du SQL avec le quoting/syntaxe corrects. Opération gated D3 : nécessite des privilèges super-admin côté backend, avec audit log automatique sur `_error__logs` pour chaque application.

### 🎨 Action nouvelle : layout designer depuis le langage naturel

Quand l'utilisateur se trouve sur la page **Designer** d'un dashboard, le chatbot expose une nouvelle famille d'actions qui agit directement sur le canvas du designer (pas sur les metadata persistés).

Patterns de prompt supportés :

- "ajoute une grid liée à la route `cities`" → injecte `DATASOURCE` + `DATAREPEATER` configurés et liés ;
- "crée un layout tabulaire 2×2" → injecte une `<table>` 2×2 avec des cellules prêtes à recevoir d'autres composants ;
- "mets un splitter vertical avec 3 zones" → injecte un `SPLITTER` configuré ;
- "change la couleur du panneau en haut à droite en rouge" → modifie la propriété `backgroundColor` du composant identifié ;
- "ajoute une colonne à la table" / "supprime la ligne 2" → modifie `cols`/`rows` du composant `TABLE` sélectionné ;
- "supprime le KPI Chiffre d'affaires" → supprime un composant du canvas par son nom.

Le chatbot connaît le catalogue complet des 31 outils du designer (groupes HTML, DATA, CONTAINER) et leurs propriétés éditables. Quand l'utilisateur mentionne une route metadata avec un nom approximatif ("provincies" au lieu de "stateprovinces"), le chatbot fait du fuzzy-match contre les routes disponibles dans le projet et affiche le vrai nom résolu dans la justification de l'action.

Les modifications restent sur le canvas du designer jusqu'au clic sur "Enregistrer le dashboard" — pas d'écritures BDD automatiques, le résultat visuel est toujours vérifié avant le commit. L'undo/redo du designer couvre également les actions injectées par le chatbot.

---

## ⚙️ Moteur RAG natif .NET (déploiement sans Python)

Le stack de serving du chatbot RAG peut désormais tourner **entièrement sur .NET**, sans serveur Python séparé ni virtual environment sur la machine cible. Les modèles de retrieval (embeddings + reranker) sont chargés in-process via ONNX Runtime, avec accélération GPU (CUDA) détectée automatiquement et fallback transparent sur CPU.

- Activation via `appsettings.json` : `rag-use-dotnet-engine=true` sélectionne le moteur .NET ; la valeur par défaut `false` conserve le comportement précédent.
- `rag-engine-device` (`auto` / `cpu` / `cuda`) choisit le device d'inférence ; `rag-engine-profile` contrôle le niveau de rédaction des sources citées dans les réponses.
- Au premier démarrage les artefacts nécessaires (modèles ONNX + index) sont téléchargés on-demand, ainsi le paquet de base reste léger.

Résultat pratique : le déploiement chez le client est **.NET uniquement** — aucune installation Python ni dépendances natives supplémentaires au-delà du runtime .NET. L'appel au modèle conversationnel et la pipeline de retrieval et d'actions sont identiques entre les deux moteurs.

---

## 🐛 Corrections notables

- **Documentation des callbacks alignée sur le runtime** : le recueil de callbacks décrivait des signatures ne correspondant pas au comportement réel dans deux cas. Le default value callback écrit la valeur dans le record (`record[field.mc_nome_colonna] = ...`) et le `return` est ignoré ; la validation custom reçoit `(record, field, vr, wtoolbox)` et communique le résultat avec un `return` booléen (`false` bloque la sauvegarde) plus `vr.message` pour le texte affiché. Les exemples précédents, basés sur `validateResult(...)` et sur un `return` pour le default value, produisaient des callbacks qui ne s'appliquaient pas. Documentation corrigée dans les cinq langues.

- **Fiabilité des actions proposées par le chatbot** : pour les requêtes d'action le chatbot émet désormais de façon déterministe la chip d'action correspondante, et réessaie automatiquement en cas de rate-limit transitoire du modèle conversationnel au lieu de dégrader silencieusement vers une réponse texte uniquement.

- **Scaffolder de metadata — distinction `date` vs `datetime` consolidée** : follow-up du fix introduit en 1.2.1 sur les types temporels générés. Le parser des types source couvre désormais aussi les variantes DDL atypiques (MySQL `DATETIME(0)` sans precision, PostgreSQL `timestamp` nu sans qualifieur time-zone, Oracle `TIMESTAMP(n)` avec precision explicite) — tous continuent à mapper correctement vers le UI type `datetime` en préservant la composante time à la sauvegarde.

- **Suggest sur champs metadata — `mc_suggest_value_callback` normalise désormais le return value** : le callback configurable côté DB pouvait retourner une promise ou une valeur synchrone, mais le parser runtime n'acceptait que le cas synchrone. Résultat : le suggest échouait silencieusement dans les callbacks async. La normalisation attend désormais `Promise.resolve(callback(...))` de manière uniforme.

- **Repository chat — `Guid` cross-driver** : le driver MySQL.Data matérialise une colonne `CHAR(36)` comme `Guid` quand le flag `OldGuids` est `false` (défaut à partir de la version 6.6 du connector), provoquant `InvalidCastException` sur `GetString`. Même risque sur Oracle avec storage `RAW(16)`. La lecture du correlation id a désormais une cascade de fallback (`GetGuid` → `GetString` → `GetValue` avec switch sur runtime type) — robuste sur les quatre providers indépendamment de la configuration du driver.

- **Repository chat — connexion MySQL non ouverte** : le gateway MySQL retournait une `new MySqlConnection(cs)` sans appeler `Open()`, asymétrique par rapport aux gateways PostgreSQL et Oracle. Le premier `ExecuteNonQueryAsync` du schema auto-apply échouait avec "Connection must be valid and open". Ajout d'un `OpenConnectionToConnectionString` symétrique, aligné avec les autres providers.

---

## 📦 Paquets mis à jour

| Package | De | À |
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

## 🔧 Mises à jour opérationnelles recommandées

1. Pour **activer le chatbot RAG**, ajouter à `appsettings.json` la clé `anthropic-api-key` (et optionnellement `anthropic-default-chat-model` et `anthropic-auto-compact-threshold`). Le backend relit les clés en hot-reload — pas besoin de restart.
2. **Aucun step DBA requis** sur les installations existantes : au premier `Ask` du chatbot, le schéma chat history (`_rag_chat_sessions` + `_rag_chat_messages` avec toutes les colonnes) est appliqué idempotente sur le provider configuré dans `MetaDataSQLConnection`. L'auto-migration couvre les installations neuves et partiellement migrées.
3. Si l'installation tourne sur **MySQL / PostgreSQL / Oracle**, vérifier que la connection string pointe vers le provider correct et que l'utilisateur dispose des privilèges `ALTER TABLE` sur le schéma metadata (nécessaires une seule fois, au premier démarrage).
4. Pour **monitorer la consommation de la fenêtre de contexte**, le cercle cue % dans le header du chatbot est le driver visuel immédiat. Au-delà de 80%, il vaut la peine de lancer un compact manuel (`/compact` ou clic sur le cue) pour réduire la latence des tours suivants.
5. Pour faire tourner le chatbot RAG **sans Python** sur la machine cible, définir `rag-use-dotnet-engine=true` dans `appsettings.json` (optionnellement `rag-engine-device` et `rag-engine-profile`). Au premier démarrage les artefacts d'inférence sont téléchargés automatiquement.
