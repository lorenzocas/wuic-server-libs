# Notes de version — WUIC Framework v1.1.0

**Date** : 13 mai 2026
**Version précédente publiée** : 1.0.20 (12 mai 2026)
**Backend** : .NET 10 + IIS / Linux nginx
**Frontend** : Angular 21

---

Saut mineur : cette version introduit deux capacités structurelles qui modifient le modèle de déploiement du framework.

- **Multi-tenant** : une seule instance KonvergenceCore route les données et les métadonnées de N entreprises sur N connexions BD différentes. Configuration tenant par tenant via les colonnes `Aziende.Connessione_DB_Dati` / `Aziende.CONNESSIONE_DB_Meta` ; routage transparent au niveau applicatif via `TenantContext` (AsyncLocal, survit aux frontières Task/scheduler).
- **Localisation du menu par langue** : les entrées de menu (`mm_display_string_menu`) ne contiennent plus de libellés italiens codés en dur, mais des clés stables avec namespace `menu.<scope>.<slug>`, résolues à l'exécution par la pipe `translate` d'Angular contre `_wuic_translations`. Le changement de langue depuis le sélecteur utilisateur met à jour toutes les entrées sans F5.

---

## 🌐 Gestion multi-tenant

Une seule installation du framework peut désormais servir plusieurs entreprises (« tenants ») avec des données et métadonnées physiquement isolées sur des BD différentes, sans nécessiter de répliquer l'application ni de partitionner les reverse-proxies par hôte.

**Modèle de données.** Le routage tenant→connexions est défini sur deux colonnes de la BD de métadonnées primaire :

- `Aziende.Connessione_DB_Dati` — nom d'une entrée dans `ConnectionStrings` pour la BD applicative du tenant
- `Aziende.CONNESSIONE_DB_Meta` — nom d'une entrée dans `ConnectionStrings` pour la BD de métadonnées du tenant

Les colonnes contiennent le **nom** de l'entrée, pas la chaîne littérale. La rotation des credentials se fait en éditant `appsettings.<env>.json`, sans toucher à la BD.

**Activation.** Flag dans `appsettings.json` (section `AppSettings`) :

```json
"multiConnectionEnabled": "true"
```

Avec le flag `false` (par défaut) le comportement reste single-tenant, identique aux versions précédentes. Avec le flag `true` chaque requête HTTP authentifiée résout l'`AziendaId` depuis l'utilisateur connecté et route `GetOpenConnection` vers les connection strings du tenant correspondant.

**Routage transparent.** Tous les points d'accès BD du framework (`MetaService.*`, scheduler, scaffolding, AsmxProxy CRUD, callbacks personnalisés) consultent `TenantScope.CurrentAziendaId` via `AsyncLocal`, propagé par le middleware HTTP post-authentification. Les jobs en arrière-plan et les callbacks personnalisés déclarent explicitement le tenant avec `using (TenantScope.Push(aziendaId)) { ... }` lorsqu'ils s'exécutent en dehors du contexte de requête.

**Cache tenant-aware.** Les clés `Application[]` côté serveur et les caches locaux de métadonnées sont automatiquement suffixés par `AziendaId` lorsque le flag est actif, évitant le bleed de métadonnées entre tenants.

**Routage de login.** La table `_login_index(username_hash, id_azienda)` sur la BD primaire mappe username → tenant pour le fallback de `MetaService.login` : après authentification, le cookie `k-user` porte `azienda_id` dans le payload et le middleware crée le `TenantScope` correct à chaque requête suivante.

**Propagation de scaffold.** L'action « Scaffold table » propage de manière idempotente les métadonnées de la table à tous les tenants listés dans `Aziende`. La propagation s'exécute avec un `TenantScope` explicite sur chaque cible et est idempotente : ré-exécutable, n'applique que les changements manquants.

**Fichiers préconfigurés dans le package :**

- `appsettings.multi-tenant.mssql.json` / `appsettings.multi-tenant.mysql.json` — environnement self-contained avec 6 connection strings d'exemple (1 primary + 5 tenants) et `multiConnectionEnabled=true`. Activer avec `ASPNETCORE_ENVIRONMENT=multi-tenant.mssql`.
- `dbms/scripts/multi_tenant_aziende_connessioni_mssql.sql` / `_mysql.sql` — DDL pour ajouter les deux colonnes à `Aziende` sur des BD existantes.

---

## 🗺️ Localisation du menu par langue

Les entrées de menu sont désormais traduites dynamiquement selon la langue de l'utilisateur, sans avoir besoin de dupliquer les enregistrements `_metadati__menu` par locale.

**Architecture.** Le champ `mm_display_string_menu` de `_metadati__menu` contient une **clé stable** avec namespace (`menu.admin.roles`, `menu.crm.opportunities`, `menu.fleet.vehicles`, ...). Le template du composant menu Angular applique la pipe `translate` sur `item.label` et la clé est résolue à l'exécution depuis le dictionnaire `_wuic_translations` filtré par la langue courante.

**Schéma de clé.**

```
menu.<scope>.<slug>
   │       └── slug snake_case (ex. column_styles, opportunities)
   └── scope = root | admin | demo | crm | fleet | invoice
```

- `menu.root.*` — parents top-level (Administration, Application, Accueil, ...)
- `menu.admin.*` — 36 entrées système partagées (Rôles, Designer, Styles colonne, Workflow Designer, ...)
- `menu.demo.*` — contenu démo WideWorldImporters
- `menu.crm.*` / `menu.fleet.*` / `menu.invoice.*` — entrées spécifiques au domaine du tenant

**Avantage par rapport au modèle précédent.**

- L'ancien modèle utilisait le texte italien du libellé comme clé de traduction (`Aziende`, `Customers`, `Ruoli`). Cela causait des case-mismatches silencieux (`Ruoli` vs `ruoli`, `Stili Tabella` vs `Stili tabella`) car la pipe `translate` est case-sensitive alors que `_wuic_translations` a une collation case-insensitive : le premier MERGE qui entrait fixait le casing pour toujours, et les INSERTs ultérieurs avec casing divergent devenaient des no-ops silencieux.
- Le nouveau modèle à clés stables est case-déterminé (tout en minuscules par convention), namespacé par scope, et n'entre plus en collision avec d'autres ressources qui pourraient utiliser le même texte italien (ex. un libellé de bouton « Ruoli » dans un dropdown est une clé différente de `menu.admin.roles`).

**5 langues supportées.** `it-IT`, `en-US`, `fr-FR`, `es-ES`, `de-DE`. Les traductions vivent dans `_wuic_translations` (format standard : `language`, `resource`, `translation`). Le changement de langue depuis le dropdown utilisateur en haut à droite relit le dictionnaire pour la nouvelle langue et redessine le menu sans F5.

**Fallback à l'exécution.** Langue courante → en-US → it-IT → clé brute. Si vous voyez `menu.admin.roles` littéral à l'écran cela signifie que la clé n'a pas été seedée dans aucune des 5 langues.

**Les anciennes clés italiennes dans `_wuic_translations` ne sont pas touchées** par la mise à jour : elles peuvent être consommées par d'autres points de l'app (`instant('Aziende')` en code-behind, headers de list-grid, page titles) et restent valides.

---

## 🐛 Corrections de bugs notables

- **Task kill DLL lockers — hot reload `dotnet watch`** : le task de nettoyage des processus avant le redémarrage du backend (`backend: kill dll lockers`) ne détectait pas `WuicCore.exe` (l'exécutable natif émis par .NET 8+) et perdait le verrou sur le DLL au rebuild suivant (`MSB3026: file is being used by another process`). Détection réécrite avec la Restart Manager API (`rstrtmgr.dll`) comme source autoritative, fallback CommandLine étendu à `<Assembly>.exe` en plus de `dotnet.exe`, kill récursif de l'arbre de processus. Les tasks `backend: stop running` / `backend crmapp: stop running` / `backend wuictest: stop running` utilisent désormais aussi le helper partagé `scripts/stop-dotnet-app-processes.ps1` qui gère à la fois Debug et Release.

---

## 📦 Packages mis à jour

| Package | De | À |
|---|---|---|
| WuicCore | 1.0.20 | 1.1.0 |
| Wuic.Webcore | 1.0.20 | 1.1.0 |
| WuicOData | 1.0.20 | 1.1.0 |
| RuntimeEfCore | 1.0.20 | 1.1.0 |
| wuic-framework-lib (NPM) | 1.0.20 | 1.1.0 |

---

## 🔧 Mises à jour opérationnelles recommandées pour ceux qui mettent à jour

1. **Pour ceux qui veulent activer le multi-tenant** (opt-in) : appliquer le script DDL `dbms/scripts/multi_tenant_aziende_connessioni_mssql.sql` (ou `_mysql.sql`) pour ajouter les colonnes `Connessione_DB_Dati` et `CONNESSIONE_DB_Meta` à `Aziende`. Renseigner les lignes `Aziende` avec les noms des entrées ConnectionStrings de `appsettings.json`. Définir `AppSettings.multiConnectionEnabled = "true"`. Redémarrer le backend.
2. **Pour ceux qui restent single-tenant** : aucune action requise. Sans `multiConnectionEnabled=true` le routage tenant est désactivé et le comportement est bit-identique à la 1.0.20.
3. **Localisation du menu — refresh des métadonnées** : après la mise à jour, exécuter une fois `POST /api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime` pour recharger le dictionnaire menu côté client. Alternativement, se déconnecter et se reconnecter.
4. **Localisation du menu — migration d'un projet existant** : pour les projets venant d'une version précédente avec libellés italiens dans `_metadati__menu.mm_display_string_menu`, appliquer deux étapes SQL idempotentes : (a) `UPDATE _metadati__menu SET mm_display_string_menu = '<menu.scope.slug>' WHERE mm_display_string_menu = '<ancien libellé>'` pour chaque entrée, selon le schéma `menu.<scope>.<slug>` documenté ci-dessus ; (b) `INSERT/MERGE INTO _wuic_translations (language, resource, translation)` 5 lignes par nouvelle clé (une par langue). Les anciennes lignes dans `_wuic_translations` avec resource = texte italien restent dans la BD et peuvent toujours être consommées par d'autres callers (`instant()`, headers de list-grid).
5. **Hot reload backend en dev** : si vous développez avec `dotnet watch` ou avec le launcher `Backend: KonvergenceCore (Hot Reload Watch)`, le task `backend: kill dll lockers` requiert désormais `pwsh` 7+ (plus Windows PowerShell 5.x). Le script C# inline pour Restart Manager utilise la syntaxe `Dictionary<,>` correctement parsée seulement en PS 7+.
