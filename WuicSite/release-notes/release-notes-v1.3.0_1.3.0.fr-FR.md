# Notes de version — WUIC Framework v1.3.0

**Date** : 3 juin 2026
**Version précédente publiée** : 1.2.1 (31 mai 2026)
**Backend** : .NET 10 + IIS / Linux nginx
**Frontend** : Angular 21

---

Version mineure centrée sur l'intégration du **chatbot RAG** côté framework : historique conversationnel persistant, gestion automatique du contexte, configuration hot-reload depuis `appsettings.json` et schéma cross-DBMS auto-appliqué au premier démarrage. À côté de la feature principale, quelques fixes au scaffolder de metadata et à la robustesse du repository chat sur MySQL/Oracle qui se manifestaient dans les scénarios de provisioning DB neufs.

Le chatbot est le premier composant WUIC avec état côté serveur (`_rag_chat_sessions` + `_rag_chat_messages`) qui s'étend sur les quatre providers supportés sans configuration manuelle du schéma. Le premier `Ask` détecte le provider, applique dans l'ordre les patches SQL incrémentaux et démarre.

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

## 🐛 Corrections notables

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
