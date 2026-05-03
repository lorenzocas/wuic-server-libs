# Notes de version — WUIC Framework v1.0.19

**Date**: 2 mai 2026
**Version publiée précédente**: 1.0.7 (26 avril 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

En six jours de développement intensif, WUIC fait un saut significatif: du déploiement unique sur Windows IIS à une **plateforme multi-runtime** (Windows + Linux natif), avec un système unifié de **gestion typée des erreurs**, **crash reporting** centralisé, **authentification LDAP**, et un tour de **hardening best-effort** sur la surface applicative.

---

## 🛡️ Sécurité

Hardening best-effort sur toute la surface applicative: throttling de l'authentification, renforcement des en-têtes HTTP standards (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy), gestion environment-aware de CORS et Swagger, réduction de l'info disclosure dans les réponses d'erreur, gating granulaire des endpoints administratifs, contrôles supplémentaires sur le chemin SQL runtime. Les configurations par défaut sont maintenant plus conservatrices même pour les déploiements demo/staging, avec override explicite disponible via `AppSettings`.

---

## 🚨 Crash Reporting (end-to-end)

Nouveau système de crash reporting auto-installé qui envoie les stack traces .NET + JavaScript à un receiver self-hosted.

- **Capture passive**: les exceptions unhandled sont collectées automatiquement, dédupliquées via stack canonicalization et mises en file async — aucun impact sur la latence des requêtes.
- **Receiver privé**: `errors.wuic-framework.com` accepte les uploads signés avec RSA license signature (zéro clé API à gérer).
- **Consentement RGPD**: opt-in explicite géré dans `AppSettings`, configurable depuis l'éditeur de settings.
- **Activation**: `CrashReporting:Enabled=true` dans `appsettings.json` + consentement RGPD via UI.

---

## 🐧 Déploiement Linux (nouveau)

WUIC est désormais installable sur **Ubuntu/Debian** entièrement automatisé, avec stack supporté:

- Runtime .NET + MSSQL Server ou MySQL/MariaDB.
- Python 3.12 + environnement RAG.
- Secrets via systemd credentials.
- Reverse proxy nginx avec TLS Let's Encrypt.
- Smoke test post-installation qui valide backend, RAG et proxy.

Le tarball Linux inclut `appsettings.linux.mssql.json` et `appsettings.linux.mysql.json` préconfigurés pour les deux stacks supportés, plus un README avec la procédure pas à pas.

---

## 🔐 Authentification LDAP

Le login WUIC supporte maintenant le **bind LDAP** comme alternative à la BDD:

- Configuration via la section `Authentication:Ldap:*` dans `appsettings.json` (server, base DN, bind template).
- Auto-provisioning utilisateurs: la ligne locale est créée/mise à jour au premier login avec les données LDAP.
- Fallback BDD: si LDAP est unreachable et `Authentication:Ldap:FallbackToDbOnFailure=true`, le login retombe sur la BDD traditionnelle (admin/admin reste toujours accessible pour la recovery).

Compatible avec Active Directory, OpenLDAP et annuaires Novell.

---

## 🗄️ Provider MySQL (Wuic.MySqlProvider 0.8.3)

Support MySQL/MariaDB étendu à parité avec le primary MSSQL:

- Couverture complète des tests fonctionnels (audit, CRUD client-side, concurrency, conditional styling, import-export, OData, retry, stored procedures, traductions, validations).
- Fix de bugs spécifiques Linux: collation par défaut, quirks de `JSON_TYPE`, paging hints.

---

## 🚦 Système unifié d'erreurs (typed exceptions)

Refactor complet de la gestion des erreurs applicatives:

- **`WuicException`** comme type de base pour toutes les exceptions applicatives typées (partie de l'API publique du framework).
- **`WuicErrorCodes`**: catalogue de 27 codes stables (`errors.auth.unauthenticated`, `errors.metadata.props_bag.malformed`, `errors.db.sql_exception`, `errors.report.render_failed`, etc.).
- **JSON envelope stable** pour toutes les réponses d'erreur: `{ ok, errorCode, args, traceId, fallbackMessage }`. Permet au client d'afficher des messages localisés au lieu de stack traces techniques.
- **Traductions built-in** en IT/EN/DE/ES/FR/JA pour tous les codes connus.
- **Mapping automatique** des exceptions runtime connues (`SqlException`, `AuthenticationException`, `JsonException`, etc.) vers les codes typés.

---

## 📊 Export Excel

Réécriture du path d'export bulk au format `.xlsx` sur pipeline producer/consumer et `OpenXmlWriter` streaming. L'impact concerne surtout les datasets volumineux (dizaines de milliers de lignes et plus).

- Streaming OpenXML à la place du DOM-build incrémental : typiquement 50× plus rapide sur les exports bulk, footprint mémoire contenu même au-delà d'un million de lignes.
- Pipelining DB-read / xlsx-write sur buffer borné : les lectures DB ne sont plus bloquées par le temps de compression de la feuille.
- Notifications de progress agrégées via un canal dédié : plus une task par update, fini le storm WebSocket pendant les exports longs.
- Split automatique sur plusieurs feuilles quand la limite Excel de 1 048 576 lignes par feuille est dépassée. Le message de fin indique le nombre de feuilles générées.

Aucune action requise : le path est actif par défaut pour tous les exports `.xlsx` déclenchés depuis la toolbar de list-grid (Export XLS) et depuis les API server-side.

---

## 🐛 Bug fix notables

- **Gating `isSuperAdmin`**: corrigée la vérification des permissions sur plusieurs endpoints qui confondaient précédemment `isAdmin` (rôle per-user) avec `isSuperAdmin` (rôle source of truth).
- **OData CRUD**: corrigées les sérialisations edge case (Decimal→string, DateTime UTC roundtrip, navigation properties).
- **First-run wizard**: le bootstrap initial consomme maintenant correctement `IConfiguration` (plus de dépendance au legacy `app.config`).
- **Crash reporting forwarding**: bug du 2026-04-28 résolu — les exceptions MVC handled ne contournent plus le middleware crash reporter.

---

## 📦 Paquets mis à jour

| Paquet | De | À |
|---|---|---|
| WuicCore | 1.0.13 | 1.0.19 |
| Wuic.Webcore | 1.0.13 | 1.0.19 |
| WuicOData | 1.0.13 | 1.0.19 |
| RuntimeEfCore | 1.0.13 | 1.0.19 |
| Wuic.MySqlProvider | 0.7.x | 0.8.3 |
| wuic-framework-lib (NPM) | 1.0.11 | 1.0.19 |

---

## 🔧 Étapes opérationnelles recommandées pour ceux qui mettent à jour

1. Exécuter `dotnet ef database update` si on est sur EF migrations.
2. Vérifier `appsettings.json`: le système lit maintenant aussi `AppSettings:AllowedOrigins` (array string) et `AppSettings:registrationEnabled` (boolean kill-switch). Défauts sûrs si non spécifiés.
3. Si on utilise LDAP, configurer la section `Authentication:Ldap:*` dans `appsettings.json`.
4. Pour le déploiement Linux: utiliser le tarball dédié et suivre le README inclus.
5. Pour activer le crash reporting outgoing: définir `CrashReporting:Enabled=true` dans `appsettings.json` + accepter le consentement RGPD via UI.
