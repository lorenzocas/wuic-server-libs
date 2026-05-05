import { forwardRef, Inject, Injectable, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Lingua } from '../class/lingua';
// import { AuthService } from './auth.service';
import { Translation } from '../class/translation';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { UserInfoService } from './user-info.service';
import { WtoolboxService } from './wtoolbox.service';
import { TranslateService } from '@ngx-translate/core';
// import { CookieService } from 'ngx-cookie-service';

@Injectable({
  providedIn: 'root'
})
export class TranslationManagerService {
  /**
   * Cache key base. La key effettiva in localStorage e' `translation_<locale>`
   * (es. `translation_it-IT`) — ora che il backend ritorna solo la lingua richiesta,
   * la cache DEVE essere per-locale, altrimenti un refresh dopo cambio lingua
   * trova la cache della lingua precedente e non carica la nuova.
   */
  private readonly translationCacheKeyBase = 'translation';
  private get translationCacheKey(): string {
    return `${this.translationCacheKeyBase}_${this.resolveCurrentLocale()}`;
  }
  private readonly likelyMojibakePattern = /Ã.|Â.|â[\u0080-\u00BF]/;

  httpOptions = {
    withCredentials: true
  };

  public translationTable: Translation[];
  public translationsLoaded$ = new BehaviorSubject<boolean>(false);
  private loadPromise?: Promise<void>;
  private backendRetryTimer?: any;
  private firstRunStatusChecked = false;
  private firstRunStatusValue = false;

  /**
   * Dedup set per i warning "Missing translation resource". Senza questo
   * Angular ChangeDetection invoca `instant(key)` ad ogni ciclo per ogni
   * tooltip presente nel template → la stessa chiave logga 100s di volte
   * al secondo intasando la console DevTools. Limitiamo a 1 log per chiave
   * + locale (poi pruning dopo `updateTranslations`).
   */
  private readonly _missingResourceLogged = new Set<string>();

  /**
   * Guard contro reload-storm quando `instant()` rileva un mismatch
   * lang-cache (table caricata per lang X, runtime cerca lang Y).
   * Senza questo flag il primo render dopo cambio lingua scatenerebbe
   * N reload paralleli (uno per ogni binding template che ha bisogno
   * del missing key).
   */
  private _langMismatchReloadInFlight = false;

  /**
   * Bundle minimo di traduzioni hardcoded per il SOLO scenario firstRun (DB
   * metadati ancora non inizializzato → tabella `_wuic_translations` non
   * esiste → backend ``MetaService.GetTranslation`` ritorna `[]` → il gate
   * `hasEssentialLoginKeys()` resterebbe `false` per sempre → meta-menu
   * mostrerebbe lo spinner "Loading..." in eterno, oscurando il form di
   * configurazione iniziale renderizzato dal consumer app.component.
   *
   * Le 4 chiavi qui presenti sono ESATTAMENTE quelle controllate da
   * `hasEssentialLoginKeys()`. Se il form firstRun fallisce e l'utente fa
   * logout, vede comunque un login form decente (non "auth.username" raw).
   * Lingue: 5 (it-IT, en-US, fr-FR, es-ES, de-DE) allineate al fallback
   * di `getLingue()`. Valori estratti da `dbms/scripts/mysql.sql` seed
   * (rimangono fonte di verita' canonica per le traduzioni runtime).
   */
  private static readonly FIRST_RUN_FALLBACK: Translation[] = [
    { Language: 'it-IT', Resource: 'auth.username', Translation1: 'Username', Id: 0 },
    { Language: 'en-US', Resource: 'auth.username', Translation1: 'Username', Id: 0 },
    { Language: 'fr-FR', Resource: 'auth.username', Translation1: "Nom d'utilisateur", Id: 0 },
    { Language: 'es-ES', Resource: 'auth.username', Translation1: 'Nombre de usuario', Id: 0 },
    { Language: 'de-DE', Resource: 'auth.username', Translation1: 'Benutzername', Id: 0 },
    { Language: 'it-IT', Resource: 'auth.password', Translation1: 'Password', Id: 0 },
    { Language: 'en-US', Resource: 'auth.password', Translation1: 'Password', Id: 0 },
    { Language: 'fr-FR', Resource: 'auth.password', Translation1: 'Mot de passe', Id: 0 },
    { Language: 'es-ES', Resource: 'auth.password', Translation1: 'Contraseña', Id: 0 },
    { Language: 'de-DE', Resource: 'auth.password', Translation1: 'Passwort', Id: 0 },
    { Language: 'it-IT', Resource: 'auth.login', Translation1: 'Login', Id: 0 },
    { Language: 'en-US', Resource: 'auth.login', Translation1: 'Login', Id: 0 },
    { Language: 'fr-FR', Resource: 'auth.login', Translation1: 'Connexion', Id: 0 },
    { Language: 'es-ES', Resource: 'auth.login', Translation1: 'Iniciar sesión', Id: 0 },
    { Language: 'de-DE', Resource: 'auth.login', Translation1: 'Anmelden', Id: 0 },
    { Language: 'it-IT', Resource: 'auth.status.login_required', Translation1: 'Login richiesto', Id: 0 },
    { Language: 'en-US', Resource: 'auth.status.login_required', Translation1: 'Login required', Id: 0 },
    { Language: 'fr-FR', Resource: 'auth.status.login_required', Translation1: 'Connexion requise', Id: 0 },
    { Language: 'es-ES', Resource: 'auth.status.login_required', Translation1: 'Inicio de sesión requerido', Id: 0 },
    { Language: 'de-DE', Resource: 'auth.status.login_required', Translation1: 'Anmeldung erforderlich', Id: 0 }
  ];

  constructor(
    private http: HttpClient,
    // @Inject(forwardRef(() => HttpClient)) private http: HttpClient,
    private inj: Injector,
    private authSrv: UserInfoService,
    private ngxTranslate: TranslateService) {
    this.translationTable = [];
    this.setEndPoint();
  }

  /**
   * Entry point di bootstrap traduzioni: garantisce che la tabella traduzioni sia caricata prima dell'uso del servizio.
   */
  async setEndPoint() {
    await this.ensureTranslationsLoaded();
  }

  /**
   * Carica le traduzioni da localStorage (`translation`) o da backend quando necessario, normalizza encoding e aggiorna ngx-translate.
   * Usa deduplica richieste in-flight per evitare download concorrenti della stessa tabella.
   * @param forceReload Se `true` ignora cache/memoizzazione e ricarica da backend.
   */
  ensureTranslationsLoaded(forceReload = false): Promise<void> {
    // Cleanup one-shot della chiave cache legacy `'translation'` (era globale;
    // ora la cache e' per-locale `translation_<locale>`). Lasciare la legacy
    // potrebbe far sembrare che ci sia cache valida e saltare lo schema nuovo.
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(this.translationCacheKeyBase) !== null) {
        localStorage.removeItem(this.translationCacheKeyBase);
      }
    } catch { /* no-op: private mode / quota */ }

    if (forceReload) {
      localStorage.removeItem(this.translationCacheKey);
      this.translationTable = [];
      this.loadPromise = undefined;
      this.translationsLoaded$.next(false);
      if (this.backendRetryTimer) {
        clearTimeout(this.backendRetryTimer);
        this.backendRetryTimer = undefined;
      }
    }

    if (!this.loadPromise) {
      const currentLoad = this.loadTranslations();
      this.loadPromise = currentLoad;

      void currentLoad.finally(() => {
        // Allow retries when the backend endpoint was not ready yet or a retry was scheduled.
        if (this.backendRetryTimer || !WtoolboxService.appSettings?.global_root_url) {
          if (this.loadPromise === currentLoad) {
            this.loadPromise = undefined;
          }
        }
      });
    }

    return this.loadPromise;
  }

  /**
   * Cache dei codici lingua distinti presenti in `_wuic_translations` lato server.
   * Popolata da `loadSupportedLanguages()` (fire-and-forget al bootstrap) e riusata
   * synchronously da `getLingue()`. Se vuota → fallback hardcoded.
   */
  private cachedSupportedLanguages: string[] | null = null;
  private loadSupportedLanguagesPromise?: Promise<void>;

  /**
   * Fetch asincrono della lista lingue supportate dal backend
   * (`MetaService.GetSupportedLanguages` → `SELECT DISTINCT language FROM _wuic_translations`).
   * Aggiorna `cachedSupportedLanguages` cosi' il prossimo `getLingue()` ritorna la
   * lista DB-driven invece del fallback.
   */
  private loadSupportedLanguages(): Promise<void> {
    if (this.loadSupportedLanguagesPromise) return this.loadSupportedLanguagesPromise;
    const globalRootUrl = WtoolboxService.appSettings?.global_root_url;
    if (!globalRootUrl) return Promise.resolve();
    this.loadSupportedLanguagesPromise = (async () => {
      try {
        const rows = await (this.http.post<string[]>(`${globalRootUrl}MetaService.GetSupportedLanguages`, {}, this.httpOptions).toPromise());
        if (Array.isArray(rows) && rows.length) {
          this.cachedSupportedLanguages = rows.map(r => String(r || '').trim()).filter(r => !!r);
        }
      } catch {
        // swallow: fallback hardcoded copre questo caso
      }
    })();
    return this.loadSupportedLanguagesPromise;
  }

  /**
   * Espone la lista lingue supportate dal framework, usata da selettori lingua.
   * Priorita' sorgente:
   *   1. Backend fetch cache (`cachedSupportedLanguages`, populated via `loadSupportedLanguages()`).
   *   2. Lingue "scoperte" in `translationTable` (valido se contiene >1 lingua — con cache per-locale
   *      di solito ne contiene 1 soltanto, quindi questo ramo e' raramente utile).
   *   3. Fallback hardcoded: it-IT, en-US, fr-FR, es-ES, de-DE (le 5 lingue effettivamente
   *      gestite dal progetto WUIC, vedi skill `ui-localization`).
   * @returns Collezione codici lingua disponibili (`it-IT`, `en-US`, ...).
   */
  getLingue(): Array<Lingua> {
    // Fire-and-forget: al prossimo getLingue() avremo la lista DB-driven.
    void this.loadSupportedLanguages();

    const langCodeToLingua = (id: string): Lingua => ({
      id,
      // Convenzione UI: mostra il codice PAESE (dopo il trattino) quando presente.
      // `it-IT` → `IT`, `en-US` → `US`, `pt-BR` → `BR`, etc. Fallback al prefisso
      // lingua se la stringa non ha regione.
      lingua: (id.split('-')[1] || id.split('-')[0] || id).toUpperCase()
    });

    if (this.cachedSupportedLanguages && this.cachedSupportedLanguages.length) {
      return this.cachedSupportedLanguages.map(langCodeToLingua);
    }

    const discovered = Array.from(new Set((this.translationTable || []).map(x => String(x?.Language || '').trim()).filter(x => !!x)));
    if (discovered.length > 1) {
      return discovered.map(langCodeToLingua);
    }

    // Hardcoded fallback allineato alle 5 lingue gestite dalla skill `ui-localization`:
    // it-IT, en-US, fr-FR, es-ES, de-DE. Sostituito il vecchio set (it/en/pt/tr) che
    // conteneva pt-PT e tr-TR — lingue MAI tradotte nel progetto.
    return [
      { id: 'it-IT', lingua: 'IT' },
      { id: 'en-US', lingua: 'US' },
      { id: 'fr-FR', lingua: 'FR' },
      { id: 'es-ES', lingua: 'ES' },
      { id: 'de-DE', lingua: 'DE' }
    ];
  }

  /**
   * Nuke di tutto lo stato client persistito (cookies del current origin,
   * sessionStorage, localStorage) — chiamato dal branch firstRun di
   * loadTranslations al PRIMO load post-install / post-restart con firstRun=true.
   *
   * Cancella:
   *   - Tutti i cookies del current origin (via expire-in-the-past su path=/).
   *     Quelli con flag HttpOnly non sono toccabili da JS — verranno
   *     sovrascritti dal Set-Cookie del prossimo login con valore fresco.
   *   - L'intero sessionStorage (incluso il `k-user-memory` che ha la copia
   *     dell'admin precedente, principale colpevole del bug 401 cross-session).
   *   - L'intero localStorage (translation cache `translation_<locale>`,
   *     theme `wuic-selected-theme`, `wuic-theme-mode`, lingua override
   *     `wuic-selected-language`, ecc.).
   *
   * Idempotente: gira a ogni page load mentre firstRun=true; quando il wizard
   * completa e firstRun→false, non viene piu' invocato. Tutte le operazioni
   * sono in try/catch separati: storage non disponibile / private mode
   * non blocca il flusso.
   */
  private static clearClientStateForFirstRun(): void {
    try {
      if (typeof document !== 'undefined') {
        const allCookies = document.cookie.split(';');
        for (const cookie of allCookies) {
          const eqIdx = cookie.indexOf('=');
          const name = (eqIdx > -1 ? cookie.substring(0, eqIdx) : cookie).trim();
          if (!name) continue;
          // Expire on root path AND on the document path (some cookies are
          // path-scoped and need explicit domain match to be cleared).
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
        }
      }
    } catch { /* best-effort */ }
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.clear();
      }
    } catch { /* best-effort */ }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
      }
    } catch { /* best-effort */ }
    // IndexedDB (incluso Dexie): enumera tutti i DB del current origin e
    // dropparli. Necessario perche' il framework / consumer puo' avere
    // schemi Dexie con dati utente (es. record cache, draft form data,
    // workflow state) che sopravvivono a localStorage.clear() e
    // sessionStorage.clear(). API ``indexedDB.databases()`` e'
    // supportata da Chromium 71+ / Firefox 126+; in browser troppo
    // vecchi e' undefined → fallback fire-and-forget no-op.
    try {
      if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
        // Fire-and-forget: non aspettiamo la promise (non vogliamo bloccare
        // la translation pipeline). Se il delete fallisce per qualunque
        // motivo (lock attivo, blocked, ecc.) il pessimo case e' che
        // resta lo stato vecchio — nient'altro si rompe.
        void indexedDB.databases().then(dbs => {
          for (const db of (dbs || [])) {
            if (db && db.name) {
              try { indexedDB.deleteDatabase(db.name); } catch { /* best-effort */ }
            }
          }
        }).catch(() => { /* best-effort */ });
      }
    } catch { /* best-effort */ }
  }

  /**
   * Probe del backend ``GET /api/Meta/FirstRunStatus`` (no-auth, esposto da
   * MetaController.cs:540). Restituisce true se l'app sta partendo in stato
   * di prima installazione (DB metadati vuoto, ``appsettings.AppSettings.firstRun=true``).
   * Risultato cached per istanza del servizio per evitare polling ripetuto.
   * Resilient: qualsiasi errore (network, 404, malformed JSON) ritorna false
   * (assumiamo modalita' normale per non bloccare il flusso standard).
   */
  private async checkFirstRunStatus(): Promise<boolean> {
    if (this.firstRunStatusChecked) return this.firstRunStatusValue;
    const metaUrl = WtoolboxService.appSettings?.meta_url;
    if (!metaUrl) return false; // appSettings non ancora pronto: ritenta al prossimo loadTranslations
    try {
      const status = await firstValueFrom(
        this.http.get<any>(`${metaUrl}FirstRunStatus`, this.httpOptions)
      );
      this.firstRunStatusValue = !!status?.firstRun;
      this.firstRunStatusChecked = true;
      return this.firstRunStatusValue;
    } catch {
      // Endpoint non raggiungibile / errore generico: assumiamo not-firstRun.
      // Non cachiamo per dare possibilita' al prossimo retry di vedere il backend.
      return false;
    }
  }

  /**
   * Carica i dati richiesti dal flusso runtime del servizio.
   * Legge/scrive dati persistenti su storage browser.
   */
  async loadTranslations() {

    // Branch firstRun: in prima installazione il DB metadati e' vuoto e
    // ``MetaService.GetTranslation`` ritorna [] → il gate
    // ``hasEssentialLoginKeys()`` resterebbe false → meta-menu mostrerebbe
    // lo spinner "Loading..." in eterno, oscurando il form di configurazione
    // iniziale renderizzato dal consumer ``app.component``. Bypassiamo il
    // backend e usiamo il bundle hardcoded ``FIRST_RUN_FALLBACK`` (4 chiavi
    // essenziali × 5 lingue) per sbloccare il render. NON scriviamo in
    // localStorage (la cache deve riflettere il backend reale, una volta
    // che il firstRun sara' completato).
    if (await this.checkFirstRunStatus()) {
      // Defensive nuke di cookie + sessionStorage + localStorage al rilevamento
      // firstRun. Razionale: precedenti tentativi di install (admin user_id
      // diverso, theme settings, translation cache, k-user-memory, ecc.) lasciano
      // stato client che dopo la wizard contamina il flusso di auth (cookie con
      // user_id stale → 401 "Sessione scaduta" al primo getMenuByUserId). Cancellare
      // qui garantisce che ogni firstRun parta da stato client vuoto, allineato
      // al server appena re-installato. Idempotente: gira a ogni page load mentre
      // firstRun=true; quando il wizard completa e firstRun→false, questo branch
      // non scatta piu'. NB: cookies HttpOnly non sono cancellabili da JS — quelli
      // li copre la prossima Set-Cookie del login con valore fresco.
      TranslationManagerService.clearClientStateForFirstRun();

      this.translationTable = this.normalizeTranslations(TranslationManagerService.FIRST_RUN_FALLBACK);
      this.syncNgxTranslate();
      this.translationsLoaded$.next(true);
      return;
    }

    const translationData = localStorage.getItem(this.translationCacheKey);
    if (translationData) {
      try {
        const cached = JSON.parse(translationData);
        const cachedNormalized = this.normalizeTranslations(cached);

        // Se la cache e' vuota (es. una sessione precedente ha cached il
        // backend in firstRun mode che ritornava [], oppure un primo fetch
        // post-install ha trovato la tabella _wuic_translations vuota)
        // NON usare la cache: short-circuitare con [] terrebbe lo spinner
        // bloccato per sempre. Bypassa al backend per riprovare con stato
        // fresco (e se pure il backend ritorna empty/incompleto, il blocco
        // catch poco sotto mergia il bundle FIRST_RUN_FALLBACK).
        const cachedHasEssentials = this.tableHasEssentialLoginKeys(cachedNormalized);
        if (cachedNormalized.length === 0 || !cachedHasEssentials) {
          // Drop cache stantia + fallthrough al backend call.
          localStorage.removeItem(this.translationCacheKey);
        } else {
          this.translationTable = cachedNormalized;
          this.syncNgxTranslate();
          this.translationsLoaded$.next(true);
          this.persistCacheIfComplete();
          return;
        }
      } catch {
        localStorage.removeItem(this.translationCacheKey);
      }
    }

    const globalRootUrl = WtoolboxService.appSettings?.global_root_url;
    if (!globalRootUrl) {
      // App settings may be initialized after service construction.
      if (!this.backendRetryTimer) {
        this.backendRetryTimer = setTimeout(() => {
          this.backendRetryTimer = undefined;
          void this.ensureTranslationsLoaded();
        }, 300);
      }
      return;
    }

    try {
      // Risolvi la lingua corrente PRIMA di chiamare il backend:
      //   1. override esplicito localStorage (cambio via language selector in menu bar);
      //   2. user.lingua.id (default DB — settato al login);
      //   3. navigator.language (browser);
      //   4. 'it-IT' (hard fallback).
      // Il backend `MetaService.GetTranslation` ora accetta il parametro `locale` e filtra
      // le righe a quella sola lingua: payload circa 5x piu' piccolo (era: tutte le 5 lingue
      // sempre). Il client non ha piu' bisogno di indicizzare in memoria tabella polyglot.
      const resolvedLocale = this.resolveCurrentLocale();
      // tslint:disable-next-line: max-line-length
      const rawRows = await (this.http.post(`${globalRootUrl}MetaService.GetTranslation`, { locale: resolvedLocale }, this.httpOptions).toPromise() as Promise<Array<any>>);
      this.translationTable = this.normalizeTranslations(rawRows.map(x => <Translation>{ Language: x.language, Resource: x.resource, Translation1: x.translation, Id: x.id }));
      // Persist cache SOLO se non vuoto e con essenziali → evita di salvare
      // [] o tabelle parziali che al prossimo refresh ci farebbero short-circuit
      // con cache stale (bug osservato in firstRun + post-install dove backend
      // ritornava empty per qualche secondo). Cache stale = spinner forever.
      this.persistCacheIfComplete();
      this.syncNgxTranslate();
      // Gate su chiavi essenziali del login: se il backend ritorna tabella vuota
      // o senza `auth.*`, MERGIA il bundle ``FIRST_RUN_FALLBACK`` (4 chiavi × 5
      // lingue) cosi' il login form rendera' label decenti invece dei placeholder
      // grezzi. NON re-tenta in loop il backend: se la tabella `_wuic_translations`
      // e' presente ma senza i seed essenziali (es. minimal-metadata.mssql.sql
      // appena eseguito che non popola le auth.*), il loop continuerebbe per
      // sempre senza che lo stato lato server cambi. Il fallback bundled
      // unblocca il render immediato; al prossimo login/refresh la cache
      // localStorage verra' rinfrescata se nel frattempo qualcuno ha popolato
      // le traduzioni reali.
      if (!this.hasEssentialLoginKeys()) {
        const fallbackByKey = new Map<string, Translation>();
        for (const t of TranslationManagerService.FIRST_RUN_FALLBACK) {
          fallbackByKey.set(`${t.Language}|${t.Resource}`, t);
        }
        // Aggiungi le entry del fallback che NON sono gia' presenti nella tabella backend.
        for (const existing of this.translationTable) {
          fallbackByKey.delete(`${existing.Language}|${existing.Resource}`);
        }
        if (fallbackByKey.size > 0) {
          const merged = this.translationTable.concat(Array.from(fallbackByKey.values()));
          this.translationTable = this.normalizeTranslations(merged);
          this.syncNgxTranslate();
        }
      }
      this.translationsLoaded$.next(true);
    } catch (err) {
      // Errore HTTP (network/5xx): mantieni il retry loop originale — un transient
      // glitch (worker recycle, timeout, ecc.) si risolve da solo entro qualche
      // secondo. Usare il bundle qui sarebbe troppo aggressivo: il bundle ha solo
      // 4 chiavi (login form) ma tutta la restante UI mostrerebbe placeholder
      // grezzi. Meglio tenere lo spinner e ri-tentare.
      this.translationsLoaded$.next(false);
      if (!this.backendRetryTimer) {
        this.backendRetryTimer = setTimeout(() => {
          this.backendRetryTimer = undefined;
          void this.ensureTranslationsLoaded();
        }, 1000);
      }
    }

  }

  /**
   * Controlla che la translationTable contenga le chiavi indispensabili per
   * renderizzare il form di login senza chiavi grezze visibili. Se anche una
   * sola manca nella lingua utente (o come fallback nelle lingue disponibili),
   * ritorna false e il gate `translationsLoaded$` resta false → il meta-menu
   * continua a mostrare lo spinner invece del form rotto.
   */
  private hasEssentialLoginKeys(): boolean {
    return this.tableHasEssentialLoginKeys(this.translationTable);
  }

  /**
   * Variante stateless di `hasEssentialLoginKeys`: opera su una tabella
   * passata, senza dipendere da `this.translationTable`. Usata per validare
   * la cache localStorage PRIMA di adottarla come state corrente.
   */
  private tableHasEssentialLoginKeys(table: Translation[]): boolean {
    const essentialKeys = [
      'auth.username',
      'auth.password',
      'auth.login',
      'auth.status.login_required'
    ];
    const t = table || [];
    if (t.length === 0) return false;
    for (const key of essentialKeys) {
      const found = t.some(r => r.Resource === key && !!r.Translation1);
      if (!found) return false;
    }
    return true;
  }

  /**
   * Persisti la translationTable corrente in localStorage SOLO se non vuota
   * e con le chiavi essenziali presenti. Evita di scrivere `[]` o tabelle
   * parziali che al prossimo refresh causerebbero short-circuit con cache
   * stale (== spinner forever, == bug ricorrente lato firstRun / post-install).
   *
   * Se la tabella corrente non passa il check, NON tocca la cache esistente
   * (potrebbe essere stata popolata correttamente da una sessione precedente
   * — meglio preservarla che sovrascriverla con [] perche' il backend e'
   * temporaneamente vuoto durante la transizione firstRun→normal).
   */
  private persistCacheIfComplete(): void {
    if (!this.tableHasEssentialLoginKeys(this.translationTable)) return;
    try {
      localStorage.setItem(this.translationCacheKey, JSON.stringify(this.translationTable));
    } catch {
      // private mode / quota — non-fatal, runtime continua col table in memoria.
    }
  }

  /**
   * localStorage key per persistere l'override di lingua scelto dall'utente
   * via menu in alto. Letto al boot da `syncNgxTranslate` con priorita' > di
   * `userInfo.lingua.id` (server-side default). Scritto da `useLanguage()`
   * ad ogni cambio manuale. Permette di mantenere la scelta tra refresh /
   * tab reopen senza dover chiamare il server (la persistenza server-side via
   * `MetaService.setCurrentUserLanguage` resta in piedi parallelamente per
   * sync cross-device, ma localStorage e' la source of truth client per il
   * tab corrente).
   */
  private static readonly LANG_OVERRIDE_STORAGE_KEY = 'wuic-selected-language';

  /**
   * Sincronizza le risorse interne con `@ngx-translate/core`, scegliendo lingua utente/fallback tra quelle disponibili.
   *
   * Priorita' di scelta lingua (prima match vince):
   *   1. localStorage `wuic-selected-language` -> override esplicito utente
   *      (cambio via menu in alto, persistito client-side).
   *   2. `userInfo.lingua.id` -> default lingua dell'utente dal DB.
   *   3. `navigator.language` -> lingua del browser.
   *   4. `it-IT` -> hard fallback.
   */
  private syncNgxTranslate() {
    const storedOverride = this.readLanguageOverride();
    // Fallback `language` per shape `{ language: "it-IT" }` (vedi
    // resolveCurrentLocale per il razionale).
    const userInfo: any = this.authSrv.getuserInfo() || {};
    const userLang = storedOverride || userInfo?.lingua?.id || userInfo?.language || navigator.language || 'it-IT';
    const supportedLangs = Array.from(new Set((this.translationTable || []).map(x => x.Language).filter(x => !!x)));

    supportedLangs.forEach(lang => {
      this.ngxTranslate.setTranslation(lang, this.getResourcesByLang(lang), true);
    });

    if (supportedLangs.length > 0) {
      this.ngxTranslate.setDefaultLang(supportedLangs.includes('it-IT') ? 'it-IT' : supportedLangs[0]);
    }

    const resolvedLang = this.resolveSupportedLang(userLang, supportedLangs);
    if (resolvedLang) {
      void this.ngxTranslate.use(resolvedLang);
    } else if (supportedLangs.length > 0) {
      void this.ngxTranslate.use(supportedLangs[0]);
    }
  }

  /**
   * Legge l'override di lingua dal localStorage. Ritorna stringa vuota se
   * assente o non valido (es. localStorage disponibile ma vuoto, oppure
   * env senza localStorage come SSR).
   */
  private readLanguageOverride(): string {
    try {
      if (typeof localStorage === 'undefined') return '';
      const v = localStorage.getItem(TranslationManagerService.LANG_OVERRIDE_STORAGE_KEY);
      return (v ?? '').trim();
    } catch {
      return '';
    }
  }

  /**
   * Persiste in localStorage la scelta di lingua. Chiamato da `useLanguage()`
   * dopo che ngxTranslate ha confermato il cambio.
   */
  private writeLanguageOverride(languageId: string): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const trimmed = String(languageId || '').trim();
      if (!trimmed) {
        localStorage.removeItem(TranslationManagerService.LANG_OVERRIDE_STORAGE_KEY);
        return;
      }
      localStorage.setItem(TranslationManagerService.LANG_OVERRIDE_STORAGE_KEY, trimmed);
    } catch {
      // QuotaExceeded / SecurityError (private mode) → no-op, fallback al
      // default user al prossimo refresh.
    }
  }

  private resolveSupportedLang(lang: string, supported: string[]): string | undefined {
    if (supported.includes(lang)) return lang;
    const prefix = lang.split('-')[0].toLowerCase();
    return supported.find(s => s.toLowerCase().startsWith(prefix + '-'));
  }

  /**
   * Risolve il BCP-47 locale corrente da usare per filtrare le traduzioni lato backend.
   * Priorita' (prima match vince):
   *   1. `wuic-selected-language` in localStorage (override esplicito da language selector);
   *   2. `userInfo.lingua.id` (default DB dello user);
   *   3. `navigator.language` (lingua del browser);
   *   4. `'it-IT'` (hard fallback).
   * Non tenta resolveSupportedLang perche' qui non conosciamo ancora la tabella dei
   * supportati (non e' ancora caricata): il backend ritornera' lista vuota se la lingua
   * non esiste in DB, e il retry downstream gestira' il fallback a scelta lingua
   * alternativa in una chiamata successiva.
   */
  private resolveCurrentLocale(): string {
    const override = this.readLanguageOverride();
    if (override) return override;
    // The login response shape can vary: classic shape exposes
    // `lingua: { id: "it-IT" }` (object); newer/lean shape exposes
    // just `language: "it-IT"` (string). Read both — the framework
    // mapping `_Metadati_methods.GetUserInfo` historically populated
    // both but on stripped builds (and on demo deploys created via
    // applyE2eTestSetup) `language` is the only one returned. Without
    // this fallback, browser-language locale was used → translations
    // loaded for en-US instead of the user's it-IT default.
    const userInfo: any = this.authSrv.getuserInfo() || {};
    const userLang = userInfo?.lingua?.id || userInfo?.language;
    if (userLang && typeof userLang === 'string') return String(userLang).trim();
    if (typeof navigator !== 'undefined' && navigator.language) return String(navigator.language).trim();
    return 'it-IT';
  }

  /**
   * Cambia la lingua attiva di ngxTranslate.
   *
   * @param languageId  Lingua richiesta (es. "en-US", "it-IT").
   * @param persist     Se true, salva la scelta in localStorage come override
   *                    client-side: sopravvive a refresh / riapertura tab.
   *                    Default `false` per evitare che invocazioni interne
   *                    (boot, applyUserLanguageToTranslations dopo login) sovrascrivano
   *                    una scelta gia' salvata dell'utente con la sua lingua
   *                    di default DB. SOLO il chiamante "user-driven" deve
   *                    passare `true` (vedi meta-menu.component.ts dove l'utente
   *                    sceglie la lingua dal dropdown in alto).
   */
  /**
   * Ritorna la lingua attualmente attiva in ngxTranslate. E' la fonte di
   * verita' UI: copre sia il default user che l'override localStorage che
   * cambi runtime via `useLanguage()`.
   *
   * Usata da componenti UI (meta-menu) per renderizzare la bandiera lingua
   * corrente: leggendo `userInfo.lingua.id` la bandiera resterebbe sempre
   * sul default DB user anche dopo override client-side.
   */
  getCurrentLang(): string {
    return this.ngxTranslate.currentLang || this.ngxTranslate.getDefaultLang() || '';
  }

  /**
   * Observable che emette ad ogni cambio lingua. Usato dai componenti che
   * costruiscono PrimeNG MenuItem array (label cached al momento della
   * costruzione via `instant()`) per ribuilarsi al cambio lingua: senza
   * subscribe, le label restano sulla lingua "fotografata" alla prima call
   * di `refresh<Menu>Items()` invece di seguire la lingua attiva.
   *
   * Esempio uso (list-grid.component.ts):
   *   this.langChangeSub = this.trslSrv.onLangChange$.subscribe(() => {
   *     this.refreshSaveStateMenuItems();
   *   });
   */
  get onLangChange$() {
    return this.ngxTranslate.onLangChange;
  }

  async useLanguage(languageId: string, persist: boolean = false): Promise<string> {
    // Non gate-iamo il cambio lingua sul caricamento della tabella in-memory:
    // con cache per-locale la tabella contiene solo 1 lingua alla volta, quindi
    // la validazione "supported" basata su translationTable non e' piu'
    // rappresentativa (rifiuterebbe ogni lingua diversa dalla corrente).
    // Il languageId arriva dalla UI che popola il selector dalle lingue
    // effettivamente supportate dal backend; ci fidiamo. Se il backend non ha
    // traduzioni per quella lingua, l'utente vedra' raw keys — feedback
    // immediato per tradurre le entry mancanti con la skill ui-localization.
    const resolved = String(languageId || '').trim()
      || this.authSrv.getuserInfo()?.lingua?.id
      || 'it-IT';

    await firstValueFrom(this.ngxTranslate.use(resolved));
    if (persist) {
      this.writeLanguageOverride(resolved);
      // Cambio lingua: NON sovrascrivere / NON wipe-are la cache di altre lingue.
      // Con cache per-locale (`translation_<locale>`) ogni lingua vive
      // indipendentemente in localStorage. Qui resettiamo solo lo stato in-memory
      // (translationTable + loadPromise) cosi' `ensureTranslationsLoaded(false)`:
      //   - `translationCacheKey` getter ritorna ora `translation_<new_locale>`;
      //   - loadTranslations() legge quella key: se presente → riusa senza HTTP;
      //     altrimenti fetch backend con `locale=<new_locale>` + cache.
      // Le cache delle lingue precedenti restano intatte per riuso futuro.
      this.translationTable = [];
      this.loadPromise = undefined;
      this.translationsLoaded$.next(false);
      if (this.backendRetryTimer) {
        clearTimeout(this.backendRetryTimer);
        this.backendRetryTimer = undefined;
      }
      await this.ensureTranslationsLoaded();
    }
    return resolved;
  }

  /**
   * Restituisce la traduzione istantanea della risorsa richiesta tramite tabella gia caricata.
   * @param resource Chiave risorsa da tradurre.
   */
  instant(resource: string) {
    return this.getTranslation(resource);
  }

  /**
   * Applica placeholder formatting stile `{0}`, `{1}`, ... alla stringa passata.
   * @param stringa Template da formattare.
   */
  format(stringa: string, ...args: any[]) {
    return stringa.replace(/{(\d+)}/g, function (match, number) {
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
        ;
    });
  };

  /**
   * Costruisce il dizionario risorse `{ Resource: Translation1 }` per una lingua specifica (o lingua utente corrente).
   * @param lang Lingua richiesta; se omessa usa lingua utente corrente.
   */
  getResourcesByLang(lang?: string) {
    const self = this;
    let resObj: any = {};
    // Priorita': override localStorage > ngxTranslate.currentLang > user DB > browser.
    // Senza override + currentLang priority, dopo cambio lingua manuale e
    // refresh, instant() rispondeva ancora con la lingua DB user (sintomo:
    // bandiera US ma menu in italiano).
    const _ui: any = self.authSrv.getuserInfo() || {};
    const rawLang = self.readLanguageOverride()
      || self.ngxTranslate.currentLang
      || _ui?.lingua?.id
      || _ui?.language
      || navigator.language;
    const allLangs = Array.from(new Set((self.translationTable || []).map(x => x.Language).filter(x => !!x)));
    const currentLang = self.resolveSupportedLang(rawLang, allLangs) || rawLang;

    const ress = (self.translationTable || []).filter(x => !lang ? x.Language === currentLang : x.Language === lang);

    ress.forEach(r => {
      resObj[r.Resource] = r.Translation1;
    });

    return resObj;
  }

  /**
   * Restituisce la traduzione per una chiave risorsa con fallback progressivi:
   * lingua corrente, ricerca case-insensitive, lingua italiana, quindi chiave originale.
   * @param value Valore input da convertire/normalizzare.
   */
  getTranslation(value: string) {
    const self = this;
    if (self.translationTable?.length > 0 && !localStorage.getItem(this.translationCacheKey)) {
      self.translationTable = [];
      self.translationsLoaded$.next(false);
      void self.ensureTranslationsLoaded();
    }

    if ((!self.translationTable || self.translationTable.length === 0) && !self.translationsLoaded$.value) {
      void self.ensureTranslationsLoaded();
    }

    const user = self.authSrv.getuserInfo();

    // Priorita' come in getResourcesByLang: override localStorage prima di
    // tutto, poi ngxTranslate.currentLang (riflette `useLanguage()` runtime),
    // poi user DB, poi browser. Senza questo, dopo override en-US le call
    // instant() ritornavano ancora la traduzione it-IT (default user DB).
    const rawLang = self.readLanguageOverride()
      || self.ngxTranslate.currentLang
      || (user && user.lingua && user.lingua.id ? user.lingua.id : (user && user.language ? user.language : navigator.language));
    const allLangs = Array.from(new Set((self.translationTable || []).map(x => x.Language).filter(x => !!x)));
    const lang = self.resolveSupportedLang(rawLang, allLangs) || rawLang;
    let langRows = (self.translationTable || []).filter(x => x.Language === lang);

    // Cache desync detection: la translationTable e' stata caricata da
    // `loadTranslations()` con `resolveCurrentLocale()` = X, ma `rawLang`
    // qui (precedence diversa, vede `ngxTranslate.currentLang`) restituisce
    // Y != X. Senza fix, OGNI binding di tooltip/label ritornerebbe la
    // chiave grezza + log "Missing" per la lang Y. Soluzioni:
    //   1. trigger un reload async (one-shot) cosi' la prossima ChangeDetection
    //      avra' la cache giusta;
    //   2. nel frattempo fallback alle righe di QUALSIASI lang presente in
    //      cache cosi' il render non resta con la key grezza.
    if (langRows.length === 0 && (self.translationTable || []).length > 0 && !self._langMismatchReloadInFlight) {
      self._langMismatchReloadInFlight = true;
      console.debug(`[i18n] cache desync: table loaded for other lang, requested='${lang}'. Triggering reload.`);
      void self.loadTranslations().finally(() => { self._langMismatchReloadInFlight = false; });
    }
    if (langRows.length === 0) {
      // Fallback: qualunque lang disponibile in cache (preferibilmente
      // quella con piu' righe). Mostra una traduzione "sbagliata" ma
      // leggibile invece della key grezza fino al reload.
      langRows = self.translationTable || [];
    }

    const match = langRows.find(x => x.Language === lang && x.Resource === value)
      || langRows.find(x => x.Resource === value)
      || langRows.find(x => (x.Resource || '').toLowerCase() === (value || '').toLowerCase());
    if (match) {
      return match.Translation1;
    }
    else {
      // Dedup: una sola log-line per chiave+lang. Senza questo
      // Angular ChangeDetection re-invoca instant() ad ogni ciclo
      // per ogni binding template, intasando la console DevTools
      // con N chiamate al secondo della stessa chiave mancante.
      const dedupKey = `${lang}:${value}`;
      if (!self._missingResourceLogged.has(dedupKey)) {
        self._missingResourceLogged.add(dedupKey);
        // Diagnostica utile: indica quante row sono caricate per la
        // lang corrente, per distinguere "cache vuota" da "chiave
        // veramente assente". `console.debug` invece di `console.log`
        // → silenzioso in production console (visible solo con
        // "Verbose" abilitato in DevTools).
        console.debug(
          `[i18n] missing key '${value}' for lang='${lang}' (langRows=${langRows.length}, totalTable=${(self.translationTable || []).length})`
        );
      }

      return value;
    }
  }

  /**
   * Esegue l'operazione dati implementata da `updateTranslations`.
   * Legge/scrive dati persistenti su storage browser.
   * @param translationObj Dizionario chiave->valore traduzioni da fondere nella cache corrente.
   */
  updateTranslations(translationObj: any) {
    const metaUrl = WtoolboxService.appSettings?.meta_url;
    if (!metaUrl) {
      return Promise.reject('WtoolboxService.appSettings.meta_url is not initialized');
    }

    return this.http.post(`${metaUrl}ModifyTranslation`,
      { Translations: translationObj.map((x: any) => <any>{ id: x.Id, language: x.Language, resource: x.Resource, translation: x.Translation1 }) }, this.httpOptions).toPromise()
      .then(result => {
        localStorage.removeItem(this.translationCacheKey);
        this.translationTable = [];
        this.translationsLoaded$.next(false);
        return result;
      });
  }

  /**
   * Normalizza il payload in una forma coerente per i passaggi successivi.
   * @param rows Righe grezze traduzioni provenienti da backend o cache locale.
   * @returns Valore restituito dal metodo (Translation[]).
   */
  private normalizeTranslations(rows: any[]): Translation[] {
    const list = Array.isArray(rows) ? rows : [];
    return list.map((row: any) => {
      const item = <Translation>{
        Language: row?.Language ?? row?.language,
        Resource: row?.Resource ?? row?.resource,
        Translation1: row?.Translation1 ?? row?.translation,
        Id: row?.Id ?? row?.id
      };

      item.Language = this.repairMojibake(item.Language);
      item.Resource = this.repairMojibake(item.Resource);
      item.Translation1 = this.repairMojibake(item.Translation1);
      return item;
    });
  }

  /**
   * Tenta la correzione di stringhe mojibake (UTF-8/Latin-1) tipiche di sorgenti legacy prima dell'uso in UI.
   * @param value Valore input da convertire/normalizzare.
   * @returns Valore riparato  oppure input originale.
   */
  private repairMojibake(value: any): any {
    if (typeof value !== 'string' || !value || !this.likelyMojibakePattern.test(value)) {
      return value;
    }

    try {
      return decodeURIComponent(escape(value));
    } catch {
      return value;
    }
  }

}
