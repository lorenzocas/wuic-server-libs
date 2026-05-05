import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Injector,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';

import { WtoolboxService } from '../../service/wtoolbox.service';
import { AuthSessionService } from '../../service/auth-session.service';
import { UserInfoService } from '../../service/user-info.service';
import { GlobalHandler } from '../../handler/GlobalHandler';

/**
 * Componente standalone framework che incapsula l'INTERO workflow di firstRun:
 *
 *   1. probe `GET /api/Meta/FirstRunStatus` al boot per decidere visibilita';
 *   2. rendering del form wizard (DBMS, connection string, admin, RAG checkbox);
 *   3. test connessione + caricamento elenco DB (`MetaService.get_database_names`);
 *   4. submit `MetaService.configure_wuic` con tutti i parametri raccolti;
 *   5. polling progress (`GET /api/Meta/FirstRunProgress`) durante l'install;
 *   6. handling specifico dell'errore `METADATA_DB_EXISTS_CONFIRM_REQUIRED:` con
 *      promptDialog di conferma drop+recreate;
 *   7. clear lato client (cookies + sessionStorage + localStorage + indexedDB)
 *      al termine dell'install e wait `waitForBackendReady` prima del redirect;
 *   8. registrazione bundle traduzioni `firstrun.*` (5 lingue) PRIMA che il
 *      template risolva i pipe `| translate`;
 *   9. hook post-login per `MetaService.resumeRagSetupIfPending` (consume del
 *      flag `logs/rag-setup-pending.json` settato dal wizard).
 *
 * **Auto-control**: il componente decide da se' se mostrarsi (firstRun=true) o
 * essere invisibile (firstRun=false). Il consumer si limita a montarlo nel
 * template app shell (`<wuic-first-run-wizard></wuic-first-run-wizard>`) e
 * sottoscrive l'output `(complete)` per refreshare la UI quando il wizard
 * conclude (di solito un full-page reload via location.assign).
 *
 * **Self-contained**: tutti gli helper (parseConnectionString, normalizeDbms,
 * extractErrorMessage, ecc.) sono incapsulati qui dentro. Niente dipendenza
 * dal consumer oltre ai servizi WUIC standard (HttpClient, TranslateService,
 * WtoolboxService per promptDialog + appSettings, AuthSessionService per
 * l'aggancio post-login, UserInfoService per l'id utente del RAG resume).
 */
@Component({
  // Selector "impl" intenzionalmente NON destinato ad uso come element nel
  // template del consumer — il componente viene caricato dinamicamente via
  // ``LazyFirstRunWizardComponent`` (file ``first-run-wizard.lazy.component.ts``)
  // che a sua volta espone il selector pubblico ``wuic-first-run-wizard`` al
  // consumer. Tenere selector diversi evita "Component selector
  // 'wuic-first-run-wizard' is already declared" se il consumer (per errore)
  // importa entrambe le classi nello stesso imports array.
  selector: 'wuic-first-run-wizard-impl',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    SelectModule,
    ProgressBarModule,
    TooltipModule,
    DialogModule
  ],
  templateUrl: './first-run-wizard.component.html',
  styleUrl: './first-run-wizard.component.scss',
  changeDetection: ChangeDetectionStrategy.Default
})
export class WuicFirstRunWizardComponent implements OnInit, OnDestroy {
  /**
   * Emessa quando il flusso firstRun viene rilevato come NON necessario
   * (firstRun=false al boot) OPPURE quando l'install e' completato con
   * successo. Il consumer puo' usarla per inizializzare il resto della UI
   * (carico shell, dynamic imports lazy, ecc.) sapendo che non c'e' overlay
   * a coprire la pagina. In caso di success-with-redirect (caso normale post
   * install) la emit avviene PRIMA del location.assign, ma e' essenzialmente
   * fire-and-forget perche' il browser navighera' via subito dopo.
   */
  @Output() complete = new EventEmitter<void>();

  // ── Visibilita' overlay ─────────────────────────────────────────────────
  /** True quando il backend ha confermato firstRun=true e dobbiamo renderizzare il form. */
  showFirstRunInstall = false;
  /** True durante il bootstrap iniziale (probe FirstRunStatus + setup form). */
  firstRunLoading = true;
  /** True durante la POST configure_wuic (disabilita CTA + input). */
  firstRunInstalling = false;
  /** True durante il "test connessione e carica DB" in flight. */
  firstRunDbLoading = false;
  firstRunConnectionTesting = false;
  /** True dopo che il test connessione e' andato a buon fine. Gate del DB select. */
  firstRunConnectionValid = false;

  // ── Banner errore con dismiss ────────────────────────────────────────────
  private _firstRunError = '';
  firstRunErrorDismissed = false;
  get firstRunError(): string { return this._firstRunError; }
  set firstRunError(value: string) {
    const next = value ?? '';
    if (next !== this._firstRunError) {
      this.firstRunErrorDismissed = false;
    }
    this._firstRunError = next;
  }
  dismissFirstRunError(): void { this.firstRunErrorDismissed = true; }

  // ── Opzioni form (defaultate, restrette dal probe FirstRunStatus) ───────
  firstRunDbmsOptions = [
    { label: 'Microsoft SQL Server', value: 'mssql' },
    { label: 'MySQL', value: 'mysql' },
    { label: 'Oracle', value: 'oracle' },
    { label: 'PostgreSQL', value: 'postgres' }
  ];

  firstRunAdminLanguageOptions = [
    { label: 'Italiano', value: 'it-IT' },
    { label: 'English', value: 'en-US' },
    { label: 'Français', value: 'fr-FR' },
    { label: 'Español', value: 'es-ES' },
    { label: 'Deutsch', value: 'de-DE' }
  ];

  firstRunSetupModeOptions: { label: string; value: string }[] = [
    { label: 'DB esistente', value: 'existing' },
    { label: 'Tutorial WideWorldImporters', value: 'tutorial' }
  ];

  firstRunTutorialAvailable = true;
  firstRunPythonInstalled = true;
  firstRunPythonSupported = true;
  firstRunPythonVersion = '';

  firstRunForm = {
    setupMode: 'existing',
    createTutorialIfMissing: true,
    dbms: 'mssql',
    dataConnectionString: '',
    dataDbName: '',
    tutorialDataDbName: 'WideWorldImporters',
    tutorialMetadataDbName: 'MetadataCRM',
    metadataDbName: 'metadataDB',
    adminUsername: 'admin',
    adminPassword: '',
    adminLanguage: WuicFirstRunWizardComponent.resolveDefaultAdminLanguage(),
    scaffoldExistingDatabase: false,
    installRag: false,
    useCuda: false,
    anthropicApiKey: '',
    // Crash reporting opt-in (skill crash-reporting Commit 8). OFF by default
    // per GDPR: l'utente lo abilita esplicitamente in fase di first-install
    // dopo aver letto il disclaimer (link/expand inline nel template). Se
    // abilitato qui, il backend writer di appsettings setta
    // `CrashReporting.Enabled=true` e `DisclaimerAcceptedVersion="1.0"` +
    // `DisclaimerAcceptedAt=<now>` (audit trail) — equivalente al flusso
    // appsettings-editor (Commit 9), centralizzato cosi' che il primo
    // boot non richieda un secondo round-trip dialog.
    enableCrashReporting: false,
  };

  /**
   * Visibilita' del popup disclaimer GDPR del crash-reporting (apre al check
   * del checkbox nel form). Vedi `crashReportingLabels` per il razionale dei
   * testi hardcoded.
   */
  crashReportingDisclaimerVisible = false;

  /**
   * Labels HARDCODED per il disclaimer GDPR del crash-reporting.
   *
   * Razionale: il first-run wizard e' l'UNICA pagina che gira PRIMA che il
   * DB metadati esista (`MetaDataSQLConnection` ancora a placeholder
   * `__SET_CONNECTION_STRING__`). La `wuic_translation` table NON e'
   * interrogabile in quello stato — qualunque chiave registrata li' viene
   * mostrata grezza dal `TranslationManagerService` (fallback "ritorna la
   * chiave"). Le altre label del wizard funzionano via `ngx-translate`
   * con i dictionary statici bundlati nell'app, ma non abbiamo (al
   * momento) un dictionary GDPR multilingua bundlato — quindi niente
   * fallback. Soluzione: traduzioni inline in TS, switch sulla lingua
   * scelta dall'admin nel select "Lingua admin iniziale".
   *
   * Contratto: `getter` ricalcola al cambio di `firstRunForm.adminLanguage`
   * (che lega il select del wizard). Default 'en-US' se sconosciuta.
   */
  get crashReportingLabels() {
    const dict = this.crashReportingDictionary;
    const key = (this.firstRunForm.adminLanguage || 'en-US') as keyof typeof dict;
    return dict[key] || dict['en-US'];
  }

  /**
   * Dictionary inline italian/english/french/spanish/german. Lingue
   * supportate matchano `getSupportedLanguages` del backend. Bump
   * `disclaimerVersion` (lato backend `CrashReportingOptions.CurrentDisclaimerVersion`)
   * se cambi sostanzialmente i testi qui — invalida i consensi precedenti
   * e forza re-prompt al login successivo.
   */
  private readonly crashReportingDictionary = {
    'it-IT': {
      title: 'Segnalazione errori automatica',
      checkbox_accept: 'Acconsento all\'invio anonimo dei rapporti di errore',
      intro_short: 'WUIC può inviare automaticamente i dettagli tecnici degli errori al server privato del produttore.',
      read_full: 'Leggi tutto',
      intro: 'Per migliorare la stabilità del prodotto, WUIC può inviare automaticamente i dettagli tecnici degli errori che si verificano nella tua applicazione al nostro server privato. Nessun contenuto personale o di business viene trasmesso. La funzione è opzionale e disattivabile in qualsiasi momento.',
      what_we_send: 'Cosa viene inviato:',
      what_we_dont_send: 'Tipo eccezione, messaggio, stack trace, URL della richiesta, versione del framework, fingerprint anonimo della macchina (hash), user-agent del browser.',
      where_it_goes: 'Dove va: server privato del fornitore (errors.wuic-framework.com), accessibile solo dal team di sviluppo del framework.',
      retention: 'Conservazione: massimo 90 giorni, poi cancellazione automatica.',
      legal_basis: 'Base giuridica: consenso esplicito (GDPR art. 6.1.a). Puoi revocarlo in qualsiasi momento.',
      how_to_disable: 'Come disattivare: dal menu Impostazioni → Configurazione applicazione, togli il flag "CrashReporting.Enabled".',
      btn_accept: 'Accetto e attivo',
      btn_decline: 'Rifiuto'
    },
    'en-US': {
      title: 'Automatic error reporting',
      checkbox_accept: 'I consent to anonymous error report transmission',
      intro_short: 'WUIC can automatically send technical error details to the vendor\'s private server.',
      read_full: 'Read full text',
      intro: 'To improve product stability, WUIC can automatically send technical details about errors that occur in your application to our private server. No personal or business content is transmitted. This feature is optional and can be disabled at any time.',
      what_we_send: 'What gets sent:',
      what_we_dont_send: 'Exception type, message, stack trace, request URL, framework version, anonymous machine fingerprint (hash), browser user-agent.',
      where_it_goes: 'Where it goes: vendor\'s private server (errors.wuic-framework.com), accessible only by the framework development team.',
      retention: 'Retention: up to 90 days, then automatic deletion.',
      legal_basis: 'Legal basis: explicit consent (GDPR art. 6.1.a). You can revoke it at any time.',
      how_to_disable: 'How to disable: from Settings → Application configuration, untick the "CrashReporting.Enabled" flag.',
      btn_accept: 'Accept and enable',
      btn_decline: 'Decline'
    },
    'fr-FR': {
      title: 'Signalement automatique des erreurs',
      checkbox_accept: 'J\'accepte la transmission anonyme des rapports d\'erreur',
      intro_short: 'WUIC peut envoyer automatiquement les détails techniques des erreurs au serveur privé du fournisseur.',
      read_full: 'Lire le texte complet',
      intro: 'Pour améliorer la stabilité du produit, WUIC peut envoyer automatiquement les détails techniques des erreurs survenant dans votre application à notre serveur privé. Aucun contenu personnel ou métier n\'est transmis. Cette fonction est optionnelle et désactivable à tout moment.',
      what_we_send: 'Ce qui est envoyé :',
      what_we_dont_send: 'Type d\'exception, message, stack trace, URL de la requête, version du framework, empreinte anonyme de la machine (hash), user-agent du navigateur.',
      where_it_goes: 'Destination : serveur privé du fournisseur (errors.wuic-framework.com), accessible uniquement par l\'équipe de développement.',
      retention: 'Rétention : 90 jours maximum, puis suppression automatique.',
      legal_basis: 'Base juridique : consentement explicite (RGPD art. 6.1.a). Révocable à tout moment.',
      how_to_disable: 'Comment désactiver : Paramètres → Configuration de l\'application, décochez "CrashReporting.Enabled".',
      btn_accept: 'Accepter et activer',
      btn_decline: 'Refuser'
    },
    'es-ES': {
      title: 'Notificación automática de errores',
      checkbox_accept: 'Acepto la transmisión anónima de informes de error',
      intro_short: 'WUIC puede enviar automáticamente los detalles técnicos de los errores al servidor privado del fabricante.',
      read_full: 'Leer texto completo',
      intro: 'Para mejorar la estabilidad del producto, WUIC puede enviar automáticamente los detalles técnicos de los errores que ocurren en su aplicación a nuestro servidor privado. No se transmite ningún contenido personal o de negocio. Esta función es opcional y se puede desactivar en cualquier momento.',
      what_we_send: 'Qué se envía:',
      what_we_dont_send: 'Tipo de excepción, mensaje, stack trace, URL de la solicitud, versión del framework, huella anónima de la máquina (hash), user-agent del navegador.',
      where_it_goes: 'A dónde va: servidor privado del fabricante (errors.wuic-framework.com), accesible solo por el equipo de desarrollo.',
      retention: 'Retención: hasta 90 días, después eliminación automática.',
      legal_basis: 'Base jurídica: consentimiento explícito (RGPD art. 6.1.a). Revocable en cualquier momento.',
      how_to_disable: 'Cómo desactivar: Ajustes → Configuración de la aplicación, desmarque "CrashReporting.Enabled".',
      btn_accept: 'Aceptar y activar',
      btn_decline: 'Rechazar'
    },
    'de-DE': {
      title: 'Automatische Fehlermeldung',
      checkbox_accept: 'Ich willige in die anonyme Übertragung von Fehlerberichten ein',
      intro_short: 'WUIC kann technische Fehlerdetails automatisch an den privaten Server des Anbieters senden.',
      read_full: 'Vollständigen Text lesen',
      intro: 'Zur Verbesserung der Produktstabilität kann WUIC technische Details zu Fehlern in Ihrer Anwendung automatisch an unseren privaten Server senden. Keine persönlichen oder geschäftlichen Inhalte werden übertragen. Diese Funktion ist optional und jederzeit deaktivierbar.',
      what_we_send: 'Was gesendet wird:',
      what_we_dont_send: 'Ausnahmetyp, Nachricht, Stack-Trace, Anfrage-URL, Framework-Version, anonymer Maschinen-Fingerabdruck (Hash), Browser-User-Agent.',
      where_it_goes: 'Wohin: privater Server des Anbieters (errors.wuic-framework.com), nur für das Entwicklungsteam zugänglich.',
      retention: 'Aufbewahrung: max. 90 Tage, dann automatische Löschung.',
      legal_basis: 'Rechtsgrundlage: ausdrückliche Einwilligung (DSGVO Art. 6.1.a). Jederzeit widerrufbar.',
      how_to_disable: 'Deaktivieren: Einstellungen → Anwendungskonfiguration, Flag "CrashReporting.Enabled" deaktivieren.',
      btn_accept: 'Akzeptieren und aktivieren',
      btn_decline: 'Ablehnen'
    }
  };

  /**
   * Click sul checkbox del consenso. Comportamento:
   *   - check (off → on)  : apre il popup disclaimer; il flag viene davvero
   *     attivato SOLO quando l'utente preme "Accetto" nel dialog. Se chiude
   *     o annulla, il flag resta off.
   *   - uncheck (on → off): no popup, opt-out immediato.
   */
  onCrashReportingToggle(newValue: boolean): void {
    if (newValue) {
      // Tenuto false finche' l'utente non conferma nel dialog. Cosi' il
      // checkbox NON appare gia' flaggato mentre l'utente legge il
      // disclaimer — l'attivazione e' un atto esplicito post-lettura.
      this.firstRunForm.enableCrashReporting = false;
      this.crashReportingDisclaimerVisible = true;
    } else {
      this.firstRunForm.enableCrashReporting = false;
    }
  }

  openCrashReportingDisclaimer(): void {
    this.crashReportingDisclaimerVisible = true;
  }

  acceptCrashReporting(): void {
    this.firstRunForm.enableCrashReporting = true;
    this.crashReportingDisclaimerVisible = false;
  }

  declineCrashReporting(): void {
    this.firstRunForm.enableCrashReporting = false;
    this.crashReportingDisclaimerVisible = false;
  }

  firstRunDataDbOptions: { label: string; value: string }[] = [];
  private firstRunRealPath = '';

  /** Stato progress bar polled da `GET /api/Meta/FirstRunProgress`. */
  firstRunProgress: {
    active: boolean;
    phase: string;
    current: number;
    total: number;
    percent: number;
    message: string;
    elapsedMs: number;
    finished: boolean;
    failed: boolean;
    error: string | null;
  } = {
    active: false,
    phase: 'idle',
    current: 0,
    total: 0,
    percent: 0,
    message: '',
    elapsedMs: 0,
    finished: false,
    failed: false,
    error: null
  };

  private firstRunProgressTimer: ReturnType<typeof setInterval> | null = null;
  private authStateSubscription: { unsubscribe: () => void } | null = null;
  private ragResumeChecked = false;

  constructor(
    private http: HttpClient,
    private translate: TranslateService,
    private messageService: MessageService,
    private injector: Injector
  ) {}

  /** Disposer del delegate registrato sul GlobalHandler — vedi ngOnInit. */
  private metadataDbExistsDelegateDisposer?: () => void;
  /** Anti-loop: il prompt e' fire-and-forget; senza guardia, ricliccare
   *  "Sì" ad un secondo trigger lancerebbe re-submit ricorsivi. */
  private metadataDbExistsPromptInFlight = false;

  ngOnInit(): void {
    // Bundle traduzioni firstRun PRIMA che il template renda i pipe `| translate`.
    // Necessario perche' in firstRun il DB metadati e' vuoto e il fetch
    // `MetaService.GetTranslation` ritorna [] (gestito gia' a TranslationManager
    // livello, ma queste sono chiavi dedicate al wizard non presenti nel
    // FIRST_RUN_FALLBACK del manager).
    this.registerFirstRunTranslations();

    // Delegate sul GlobalHandler che intercetta il marker
    // `METADATA_DB_EXISTS_CONFIRM_REQUIRED` lanciato dal server da
    // `MetaService.configure_wuic` quando il metadata DB target esiste gia'.
    // Senza questo, l'introduzione del JsonExceptionFilter (skill exception-
    // handling) wrappa il marker in `args.message` e l'errore arriverebbe
    // all'utente come dialog generico `errors.server.unhandled` invece del
    // prompt di conferma drop+recreate.
    this.metadataDbExistsDelegateDisposer = GlobalHandler.registerDelegate((ctx) => {
      if (!ctx.message?.includes('METADATA_DB_EXISTS_CONFIRM_REQUIRED')) return false;
      // Async fire-and-forget: ritorno true (sopprime il dialog default),
      // poi prompt + retry submit.
      void this.handleMetadataDbExistsPrompt(ctx);
      return true;
    }, { priority: 100 });

    // Hook post-login per consumare `logs/rag-setup-pending.json`.
    const authSession = this.injector.get(AuthSessionService, null);
    if (authSession) {
      this.authStateSubscription = authSession.state$.subscribe((state) => {
        const isAuth = state?.authenticated === true || state?.legacyAuthenticated === true;
        if (!this.ragResumeChecked && isAuth) {
          this.ragResumeChecked = true;
          this.triggerRagSetupResumeIfPending();
        }
      });
    }

    // Probe FirstRunStatus + bootstrap form.
    void this.bootstrapFirstRun();
  }

  ngOnDestroy(): void {
    this.stopFirstRunProgressPolling();
    this.authStateSubscription?.unsubscribe();
    this.metadataDbExistsDelegateDisposer?.();
  }

  /** Mostra il prompt di conferma drop+recreate del metadata DB e, se
   *  l'utente conferma, ri-lancia l'install con dropExistingMetadataDb=true.
   *  Triggered dal delegate sul GlobalHandler quando il server emette il
   *  marker `METADATA_DB_EXISTS_CONFIRM_REQUIRED:<dbName>`.  */
  private async handleMetadataDbExistsPrompt(ctx: { args?: any; message: string }): Promise<void> {
    if (this.metadataDbExistsPromptInFlight) return;
    this.metadataDbExistsPromptInFlight = true;
    try {
      // dbName: prima cerca in args (envelope tipizzato moderno),
      // poi parsea il marker stringa `METADATA_DB_EXISTS_CONFIRM_REQUIRED:<dbName>`,
      // poi fallback al nome dal form.
      let dbName: string = (ctx.args && (ctx.args.dbName || ctx.args.metadataDbName)) || '';
      if (!dbName) {
        const m = /METADATA_DB_EXISTS_CONFIRM_REQUIRED:([^\s|"\\]+)/.exec(ctx.message || '');
        if (m) dbName = m[1];
      }
      if (!dbName) dbName = this.firstRunForm.metadataDbName || 'metadataDB';

      const promptResult = await WtoolboxService.promptDialog('Conferma ricreazione metadata DB', [
        {
          name: 'confirmDrop',
          caption: `Il database metadati '${dbName}' esiste già. Vuoi eliminarlo e ricrearlo?`,
          type: 'dictionary_radio',
          value: 'no',
          required: true,
          dictionaryData: [
            { label: 'No', value: 'no' },
            { label: 'Sì', value: 'yes' }
          ]
        }
      ], '620px', '400px');

      const rawConfirm = promptResult?.confirmDrop;
      let confirmDropValue: any = rawConfirm;
      if (rawConfirm && typeof rawConfirm === 'object' && 'value' in rawConfirm && typeof (rawConfirm as any).value !== 'function') {
        confirmDropValue = (rawConfirm as any).value;
      } else if (rawConfirm && typeof (rawConfirm as any).getValue === 'function') {
        confirmDropValue = (rawConfirm as any).getValue();
      }
      if (confirmDropValue && typeof confirmDropValue === 'object' && 'value' in confirmDropValue) {
        confirmDropValue = (confirmDropValue as any).value;
      }
      const confirmDrop = String(confirmDropValue ?? 'no').toLowerCase() === 'yes';
      if (confirmDrop) {
        await this.submitFirstRunInstallInternal(true);
      }
    } finally {
      this.metadataDbExistsPromptInFlight = false;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //                        STATIC HELPERS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Default della lingua admin basato su `navigator.language`. Mappa su uno
   * dei 5 tag IETF supportati (it/en/fr/es/de). Module-scope statico (chiamato
   * in field-initializer di firstRunForm).
   */
  private static resolveDefaultAdminLanguage(): string {
    const raw = (typeof navigator !== 'undefined' ? (navigator.language || '') : '').toLowerCase();
    if (raw.startsWith('it')) return 'it-IT';
    if (raw.startsWith('en')) return 'en-US';
    if (raw.startsWith('fr')) return 'fr-FR';
    if (raw.startsWith('es')) return 'es-ES';
    if (raw.startsWith('de')) return 'de-DE';
    return 'it-IT';
  }

  // ════════════════════════════════════════════════════════════════════════
  //                        BOOTSTRAP / PROBE
  // ════════════════════════════════════════════════════════════════════════

  private async bootstrapFirstRun(): Promise<void> {
    this.firstRunLoading = true;
    this.firstRunError = '';

    const apiBase = WtoolboxService.appSettings?.api_url || '';
    const globalRoot = WtoolboxService.appSettings?.global_root_url || '';

    try {
      const authenticated = await this.isAuthenticatedQuickly();
      if (authenticated) {
        this.showFirstRunInstall = false;
        this.complete.emit();
        return;
      }

      const publicStatus = await firstValueFrom(this.http.get<any>(`${apiBase}Meta/FirstRunStatus`));
      const settings = this.parseDictionaryResponse(publicStatus);
      const firstRunSetting = settings['firstRun'] ?? settings['first-run'] ?? settings['firstrun'];
      const isFirstRun = this.toBoolean(firstRunSetting);
      this.firstRunRealPath = String(settings['projectDataFolder'] || settings['project-data-folder'] || '').trim();

      const currentDbms = String(settings['dbms'] || '').trim().toLowerCase();
      if (['mssql', 'mysql', 'oracle', 'postgres', 'postgresql'].includes(currentDbms)) {
        this.firstRunForm.dbms = currentDbms === 'postgresql' ? 'postgres' : currentDbms;
      }

      const tutorialFlag = settings['tutorialAvailable'] ?? settings['tutorialavailable'];
      this.firstRunTutorialAvailable = tutorialFlag === undefined ? true : this.toBoolean(tutorialFlag);
      if (!this.firstRunTutorialAvailable) {
        this.firstRunSetupModeOptions = [{ label: 'DB esistente', value: 'existing' }];
        this.firstRunForm.setupMode = 'existing';
      }

      const pythonFlag = settings['pythonInstalled'] ?? settings['pythoninstalled'];
      this.firstRunPythonInstalled = pythonFlag === undefined ? true : this.toBoolean(pythonFlag);
      const pythonSupportedFlag = settings['pythonSupported'] ?? settings['pythonsupported'];
      this.firstRunPythonSupported = pythonSupportedFlag === undefined
        ? this.firstRunPythonInstalled
        : this.toBoolean(pythonSupportedFlag);
      this.firstRunPythonVersion = String(settings['pythonVersion'] || settings['pythonversion'] || '').trim();
      if (!this.firstRunPythonInstalled) {
        this.firstRunForm.installRag = false;
      }

      if (!isFirstRun) {
        this.showFirstRunInstall = false;
        this.complete.emit();
        return;
      }

      // Filter DBMS dropdown to providers actually deployed.
      try {
        const availableResp = await firstValueFrom(this.http.get<any>(`${apiBase}Meta/AvailableDbms`));
        const availableList: Array<{ id: string; label: string }> = availableResp?.dbms || [];
        if (Array.isArray(availableList) && availableList.length > 0) {
          const filtered = availableList.map(entry => {
            const id = String(entry?.id || '').trim().toLowerCase();
            const label = String(entry?.label || id).trim();
            const value = id === 'postgresql' ? 'postgres' : id;
            return { label, value };
          }).filter(opt => !!opt.value);
          if (filtered.length > 0) {
            this.firstRunDbmsOptions = filtered;
            if (!filtered.some(opt => opt.value === this.firstRunForm.dbms)) {
              this.firstRunForm.dbms = filtered[0].value;
            }
          }
        }
      } catch {
        // older backend without AvailableDbms — leave hardcoded list
      }

      this.showFirstRunInstall = true;
      await this.loadDefaultConnectionString(settings);
    } catch {
      // Legacy fallback for environments where Meta/FirstRunStatus is unavailable.
      try {
        const appSettingsResponse = await firstValueFrom(this.http.post<any>(`${globalRoot}MetaService.getAppSettings`, {}));
        const settings = this.parseDictionaryResponse(appSettingsResponse);
        const firstRunSetting = settings['firstRun'] ?? settings['first-run'] ?? settings['firstrun'];
        const isFirstRun = this.toBoolean(firstRunSetting);
        this.firstRunRealPath = String(settings['projectDataFolder'] || settings['project-data-folder'] || '').trim();

        const currentDbms = String(settings['dbms'] || '').trim().toLowerCase();
        if (['mssql', 'mysql', 'oracle', 'postgres', 'postgresql'].includes(currentDbms)) {
          this.firstRunForm.dbms = currentDbms === 'postgresql' ? 'postgres' : currentDbms;
        }

        if (!isFirstRun) {
          this.showFirstRunInstall = false;
          this.complete.emit();
          return;
        }

        this.showFirstRunInstall = true;
        await this.loadDefaultConnectionString(settings);
      } catch {
        this.showFirstRunInstall = false;
        this.complete.emit();
      }
    } finally {
      this.firstRunLoading = false;
    }
  }

  private async isAuthenticatedQuickly(): Promise<boolean> {
    const apiBase = WtoolboxService.appSettings?.api_url || '';
    try {
      const me = await Promise.race<any>([
        firstValueFrom(this.http.get<any>(`${apiBase}Auth/Me`, { withCredentials: true } as any)),
        new Promise((resolve) => setTimeout(() => resolve(null), 750))
      ]);
      return !!me?.authenticated;
    } catch {
      return false;
    }
  }

  private async loadDefaultConnectionString(settings: Record<string, any>): Promise<void> {
    const fallbackConn = String(settings['connection'] || '').trim();
    const fallbackDb = String(settings['DataDBName'] || settings['datadbname'] || '').trim();
    const fallbackMetaDb = String(
      settings['metaDataDBName'] || settings['metadataDbName'] || settings['MetaDataDBName']
        || this.firstRunForm.metadataDbName || 'MetadataCRM'
    ).trim();
    if (fallbackConn && fallbackDb && !/initial\s+catalog\s*=|database\s*=|dbq\s*=/i.test(fallbackConn)) {
      this.firstRunForm.dataConnectionString = `${fallbackConn};initial catalog=${fallbackDb}`;
    } else {
      this.firstRunForm.dataConnectionString = fallbackConn;
    }

    const parsed = this.parseConnectionString(this.firstRunForm.dataConnectionString || '');
    this.firstRunForm.dataDbName = parsed.databaseName || fallbackDb || '';
    this.firstRunForm.metadataDbName = fallbackMetaDb || this.firstRunForm.metadataDbName || 'MetadataCRM';
    this.firstRunForm.tutorialDataDbName = this.firstRunForm.dataDbName || 'WideWorldImporters';
    this.firstRunForm.tutorialMetadataDbName = String(this.firstRunForm.metadataDbName || 'MetadataCRM').trim() || 'MetadataCRM';
  }

  // ════════════════════════════════════════════════════════════════════════
  //                        FORM EVENT HANDLERS
  // ════════════════════════════════════════════════════════════════════════

  onFirstRunConnectionChanged(value: string): void {
    this.firstRunForm.dataConnectionString = value;
    const parsed = this.parseConnectionString(value || '');
    this.firstRunForm.dataDbName = parsed.databaseName || '';
    this.firstRunDataDbOptions = [];
    this.firstRunConnectionValid = false;
  }

  onFirstRunSetupModeChanged(value: string): void {
    const mode = String(value || '').trim().toLowerCase() === 'tutorial' ? 'tutorial' : 'existing';
    this.firstRunForm.setupMode = mode;
    if (mode === 'tutorial') {
      this.firstRunForm.tutorialDataDbName = String(this.firstRunForm.tutorialDataDbName || 'WideWorldImporters').trim();
      this.firstRunForm.tutorialMetadataDbName = String(this.firstRunForm.tutorialMetadataDbName || this.firstRunForm.metadataDbName || 'MetadataCRM').trim();
      this.firstRunForm.dataDbName = this.firstRunForm.tutorialDataDbName;
      this.firstRunForm.metadataDbName = this.firstRunForm.tutorialMetadataDbName;
    }
  }

  onFirstRunDbmsChanged(value: string): void {
    const normalizedDbms = this.normalizeDbms(value);
    this.firstRunForm.dbms = normalizedDbms === 'postgresql' ? 'postgres' : normalizedDbms;

    const parsed = this.parseConnectionString(this.firstRunForm.dataConnectionString || '');
    const preferredDatabaseName = String(this.firstRunForm.dataDbName || parsed.databaseName || '').trim();
    this.firstRunForm.dataConnectionString = this.buildProviderConnectionString(normalizedDbms, {
      dataSource: parsed.dataSource,
      port: parsed.port,
      databaseName: preferredDatabaseName,
      userId: parsed.userId,
      password: parsed.password,
      integratedSecurity: parsed.integratedSecurity && normalizedDbms === 'mssql'
    });
    this.firstRunForm.dataDbName = preferredDatabaseName;

    this.firstRunDataDbOptions = [];
    this.firstRunConnectionValid = false;
  }

  // ════════════════════════════════════════════════════════════════════════
  //                        TEST CONNECTION
  // ════════════════════════════════════════════════════════════════════════

  async testFirstRunConnectionAndLoadDatabases(): Promise<void> {
    this.firstRunError = '';
    this.firstRunConnectionValid = false;
    this.firstRunDataDbOptions = [];

    const dbms = this.normalizeDbms(this.firstRunForm.dbms);
    const rawConnectionString = String(this.firstRunForm.dataConnectionString || '').trim();
    if (!rawConnectionString) {
      this.firstRunError = 'Inserisci la DataSQLConnection prima del test.';
      return;
    }

    const baseConnection = this.buildConnectionWithoutDatabase(rawConnectionString, dbms);
    if (!baseConnection) {
      this.firstRunError = 'DataSQLConnection non valida: impossibile derivare la connessione base.';
      return;
    }

    this.firstRunConnectionTesting = true;
    this.firstRunDbLoading = true;
    try {
      const databases = await this.fetchDatabaseNames(dbms, baseConnection);

      this.firstRunDataDbOptions = databases.map(name => ({ label: name, value: name }));
      this.firstRunConnectionValid = true;
      if (!this.firstRunDataDbOptions.some(x => x.value === this.firstRunForm.dataDbName)) {
        this.firstRunForm.dataDbName = this.firstRunDataDbOptions[0]?.value || this.firstRunForm.dataDbName || '';
      }

      this.messageService.add({
        severity: 'success',
        summary: 'Connessione valida',
        detail: `Connessione riuscita. Trovati ${this.firstRunDataDbOptions.length} database.`
      });
    } catch (error: any) {
      const detail = this.extractErrorMessage(error);
      const canAutoFixCert = dbms === 'mssql' && this.isSqlServerCertificateError(detail);
      if (canAutoFixCert) {
        const fixedDataConnectionString = this.applySqlServerCertificateFix(rawConnectionString);
        const fixedBaseConnection = this.buildConnectionWithoutDatabase(fixedDataConnectionString, dbms);

        if (fixedBaseConnection) {
          try {
            const databases = await this.fetchDatabaseNames(dbms, fixedBaseConnection);
            this.firstRunForm.dataConnectionString = fixedDataConnectionString;
            this.firstRunDataDbOptions = databases.map(name => ({ label: name, value: name }));
            this.firstRunConnectionValid = true;
            if (!this.firstRunDataDbOptions.some(x => x.value === this.firstRunForm.dataDbName)) {
              this.firstRunForm.dataDbName = this.firstRunDataDbOptions[0]?.value || this.firstRunForm.dataDbName || '';
            }
            this.messageService.add({
              severity: 'success',
              summary: 'Connessione corretta automaticamente',
              detail: 'Applicato fix certificati SQL Server (Encrypt=False;TrustServerCertificate=True).'
            });
            return;
          } catch {
            // fall through to original error path
          }
        }
      }

      this.firstRunConnectionValid = false;
      this.firstRunDataDbOptions = [];
      this.firstRunError = detail;
      this.messageService.add({ severity: 'error', summary: 'Connessione non valida', detail });
    } finally {
      this.firstRunDbLoading = false;
      this.firstRunConnectionTesting = false;
    }
  }

  private async fetchDatabaseNames(dbms: string, baseConnection: string): Promise<string[]> {
    const globalRoot = WtoolboxService.appSettings?.global_root_url || '';
    const endpoint = `${globalRoot}MetaService.get_database_names`;
    const payload = await firstValueFrom(this.http.post<any>(endpoint, {
      rdbDBMS: dbms,
      connectionString: baseConnection
    }));

    return this.parseStringArrayResponse(payload)
      .map(x => String(x || '').trim())
      .filter(x => !!x);
  }

  // ════════════════════════════════════════════════════════════════════════
  //                        SUBMIT INSTALL
  // ════════════════════════════════════════════════════════════════════════

  async submitFirstRunInstall(): Promise<void> {
    await this.submitFirstRunInstallInternal(false);
  }

  private async submitFirstRunInstallInternal(confirmDropExistingMetadataDb: boolean): Promise<void> {
    this.firstRunError = '';

    const dbms = this.normalizeDbms(this.firstRunForm.dbms);
    const conn = this.parseConnectionString(this.firstRunForm.dataConnectionString || '');
    const isTutorialMode = this.firstRunForm.setupMode === 'tutorial';
    const selectedDataDbName = String(
      isTutorialMode
        ? (this.firstRunForm.tutorialDataDbName || this.firstRunForm.dataDbName || conn.databaseName || 'WideWorldImporters')
        : (this.firstRunForm.dataDbName || conn.databaseName || '')
    ).trim();
    const selectedMetadataDbName = String(
      isTutorialMode
        ? (this.firstRunForm.tutorialMetadataDbName || this.firstRunForm.metadataDbName || 'MetadataCRM')
        : (this.firstRunForm.metadataDbName || 'metadataDB')
    ).trim();

    if (!conn.integratedSecurity && (!conn.userId || !conn.password)) {
      this.firstRunError = 'Stringa DataSQLConnection non valida: servono almeno user e password (oppure Integrated Security=true su MSSQL).';
      return;
    }
    if (conn.integratedSecurity && dbms !== 'mssql') {
      this.firstRunError = 'Integrated Security è supportata solo su Microsoft SQL Server: per ' + dbms + ' servono user e password.';
      return;
    }
    if (!conn.dataSource) {
      this.firstRunError = 'Stringa DataSQLConnection non valida: manca data source/server/host.';
      return;
    }
    if (!selectedDataDbName) {
      this.firstRunError = 'Seleziona un database dati dalla lista.';
      return;
    }
    if (!this.firstRunConnectionValid) {
      this.firstRunError = 'Testa prima la connessione dati per abilitare il database di destinazione.';
      return;
    }

    const adminUsername = String(this.firstRunForm.adminUsername || '').trim();
    const adminPassword = String(this.firstRunForm.adminPassword || '');
    if (!adminUsername) {
      this.firstRunError = 'Inserisci un username per l\'utente admin iniziale.';
      return;
    }
    if (!adminPassword || adminPassword.length < 4) {
      this.firstRunError = 'Inserisci una password (almeno 4 caratteri) per l\'utente admin iniziale.';
      return;
    }

    const dataBaseConnection = this.buildConnectionWithoutDatabase(this.firstRunForm.dataConnectionString || '', dbms);
    if (!dataBaseConnection) {
      this.firstRunError = 'Stringa DataSQLConnection non valida: impossibile derivare la connessione base senza database.';
      return;
    }

    this.firstRunInstalling = true;
    this.startFirstRunProgressPolling();

    try {
      const globalRoot = WtoolboxService.appSettings?.global_root_url || '';
      const endpoint = `${globalRoot}MetaService.configure_wuic`;
      const realPath = (this.firstRunRealPath || '').trim();

      await firstValueFrom(this.http.post(endpoint, {
        license_email: 'first-run@local',
        rdbDBMS: dbms,
        conn_datasource: conn.dataSource,
        port: conn.port,
        conn_database_name: selectedDataDbName,
        conn_user_id: conn.userId,
        conn_password: conn.password,
        conn_integrated_security: conn.integratedSecurity ? 'true' : 'false',
        conn_data_base_connection_string: dataBaseConnection,
        preScaffoldDB: true,
        rdbDBMSMeta: dbms,
        conn_datasource_meta: conn.dataSource,
        portMeta: conn.port,
        conn_metadata_db_name: selectedMetadataDbName,
        conn_user_id_meta: conn.userId,
        conn_password_meta: conn.password,
        conn_integrated_security_meta: conn.integratedSecurity ? 'true' : 'false',
        psqlPath: '',
        theme: 'default',
        site_url: globalThis.location.origin,
        email_host: '',
        email_port: '',
        email_username: '',
        email_password: '',
        realPath,
        confirmDropExistingMetadataDb: confirmDropExistingMetadataDb ? 'true' : 'false',
        enableTutorialDbProvisioning: (isTutorialMode && this.firstRunForm.createTutorialIfMissing) ? 'true' : 'false',
        tutorialDataDbName: isTutorialMode ? selectedDataDbName : '',
        tutorialMetadataDbName: isTutorialMode ? selectedMetadataDbName : '',
        scaffoldTutorialDatabase: isTutorialMode ? 'true' : 'false',
        scaffoldExistingDatabase: (!isTutorialMode && this.firstRunForm.scaffoldExistingDatabase) ? 'true' : 'false',
        adminUsername,
        adminPassword,
        adminLanguage: this.firstRunForm.adminLanguage,
        installRag: this.firstRunForm.installRag ? 'true' : 'false',
        useCuda: this.firstRunForm.useCuda ? 'true' : 'false',
        anthropicApiKey: (this.firstRunForm.anthropicApiKey || '').trim(),
        // Crash reporting opt-in (skill crash-reporting Commit 8). Quando true,
        // configure_wuic deve scrivere `CrashReporting.Enabled=true`,
        // `DisclaimerAcceptedVersion="1.0"` e `DisclaimerAcceptedAt=<now>` in
        // appsettings.json. Quando false (default), niente da fare — la
        // sezione resta a Enabled=false e l'utente potra' attivarla in
        // seguito dall'appsettings-editor (Commit 9).
        enableCrashReporting: this.firstRunForm.enableCrashReporting ? 'true' : 'false'
      }));

      await this.clearClientStateForFirstRunLogin();
      await this.waitForBackendReady();

      const scaffoldRoute = '/scaffolding/dialog/1556';
      const loginRedirectUrl = `/?redirect=${encodeURIComponent(scaffoldRoute)}&firstRunLogin=1`;
      this.complete.emit();
      globalThis.location.assign(loginRedirectUrl);
      return;
    } catch (error: any) {
      this.firstRunError = this.extractErrorMessage(error);
      // Branch METADATA_DB_EXISTS gestito dal delegate registrato in ngOnInit
      // (`metadataDbExistsDelegateDisposer`): mostra prompt + ri-chiama
      // `submitFirstRunInstallInternal(true)`. Qui sotto saltiamo solo il toast
      // generico in quel caso specifico, per evitare duplicati col prompt.
      if (!confirmDropExistingMetadataDb && this.firstRunError.includes('METADATA_DB_EXISTS_CONFIRM_REQUIRED')) {
        return;
      }
      this.messageService.add({ severity: 'error', summary: 'Installazione fallita', detail: this.firstRunError });
    } finally {
      this.firstRunInstalling = false;
      this.stopFirstRunProgressPolling();
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //                        PROGRESS POLLING
  // ════════════════════════════════════════════════════════════════════════

  private startFirstRunProgressPolling(): void {
    this.stopFirstRunProgressPolling();
    this.firstRunProgress = {
      active: false,
      phase: 'starting',
      current: 0,
      total: 0,
      percent: 0,
      message: 'Inizializzazione...',
      elapsedMs: 0,
      finished: false,
      failed: false,
      error: null
    };
    const apiBase = WtoolboxService.appSettings?.api_url || '';
    this.firstRunProgressTimer = setInterval(async () => {
      try {
        const resp = await firstValueFrom(this.http.get<any>(`${apiBase}Meta/FirstRunProgress`));
        if (resp && typeof resp === 'object') {
          this.firstRunProgress = {
            active: !!resp.active,
            phase: String(resp.phase || 'idle'),
            current: Number(resp.current || 0),
            total: Number(resp.total || 0),
            percent: Number(resp.percent || 0),
            message: String(resp.message || ''),
            elapsedMs: Number(resp.elapsedMs || 0),
            finished: !!resp.finished,
            failed: !!resp.failed,
            error: resp.error || null
          };
        }
      } catch {
        // transient — keep ticking
      }
    }, 500);
  }

  private stopFirstRunProgressPolling(): void {
    if (this.firstRunProgressTimer) {
      clearInterval(this.firstRunProgressTimer);
      this.firstRunProgressTimer = null;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //                        POST-INSTALL CLEANUP + WAIT
  // ════════════════════════════════════════════════════════════════════════

  private async clearClientStateForFirstRunLogin(): Promise<void> {
    try { localStorage.clear(); } catch { /* ignore */ }
    try { sessionStorage.clear(); } catch { /* ignore */ }
    await this.deleteIndexedDbByName('MetaDB');
    await this.deleteIndexedDbByName('WuicClientSideCrudDB');
  }

  private async waitForBackendReady(): Promise<void> {
    const apiBase = WtoolboxService.appSettings?.api_url || '';
    const sentinelUrl = `${apiBase}Meta/FirstRunStatus`;
    const startedAt = Date.now();
    const timeoutMs = 30_000;
    const intervalMs = 500;

    await new Promise((resolve) => setTimeout(resolve, 500));

    while (Date.now() - startedAt < timeoutMs) {
      try {
        await firstValueFrom(this.http.get<any>(sentinelUrl));
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
  }

  private deleteIndexedDbByName(dbName: string): Promise<void> {
    const normalized = String(dbName || '').trim();
    if (!normalized || typeof indexedDB === 'undefined') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      try {
        const request = indexedDB.deleteDatabase(normalized);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  //                        RAG RESUME (POST-LOGIN HOOK)
  // ════════════════════════════════════════════════════════════════════════

  private triggerRagSetupResumeIfPending(): void {
    try {
      const userInfo = this.injector.get(UserInfoService, null);
      const userId = Number(userInfo?.getuserInfo()?.user_id ?? 0);
      if (!userId || userId <= 0) {
        return;
      }
      const globalRoot = WtoolboxService.appSettings?.global_root_url || '';
      const url = `${globalRoot}MetaService.resumeRagSetupIfPending`;
      this.http.post<any>(url, { userId }).subscribe({
        next: (res) => { console.log('[rag-resume]', res); },
        error: (err) => { console.warn('[rag-resume] skipped:', err?.message ?? err); }
      });
    } catch {
      /* best effort */
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //                        CONNECTION-STRING UTILITIES
  // ════════════════════════════════════════════════════════════════════════

  private parseConnectionString(connectionString: string): {
    dataSource: string; port: string; databaseName: string;
    userId: string; password: string; integratedSecurity: boolean;
  } {
    const map = new Map<string, string>();
    (connectionString || '')
      .split(';')
      .map(part => part.trim())
      .filter(part => !!part && part.includes('='))
      .forEach(part => {
        const idx = part.indexOf('=');
        const key = part.substring(0, idx).trim().toLowerCase();
        const value = part.substring(idx + 1).trim();
        map.set(key, value);
      });

    const dataSourceRaw = this.getConnValue(map, ['data source', 'server', 'host', 'datasource', 'addr', 'address']);
    const dbName = this.getConnValue(map, ['initial catalog', 'database', 'dbq', 'service name']);
    const userId = this.getConnValue(map, ['user id', 'uid', 'user', 'username']);
    const password = this.getConnValue(map, ['password', 'pwd']);
    const explicitPort = this.getConnValue(map, ['port']);
    const integratedSecurityRaw = this.getConnValue(map, ['integrated security', 'trusted_connection']).toLowerCase();
    const integratedSecurity =
      integratedSecurityRaw === 'true' || integratedSecurityRaw === 'yes' || integratedSecurityRaw === 'sspi';

    let dataSource = dataSourceRaw;
    let port = explicitPort;
    if (!port && dataSourceRaw.includes(',')) {
      const chunks = dataSourceRaw.split(',');
      dataSource = (chunks[0] || '').trim();
      port = (chunks[1] || '').trim();
    }

    return { dataSource, port, databaseName: dbName, userId, password, integratedSecurity };
  }

  private buildConnectionWithoutDatabase(connectionString: string, normalizedDbms: string): string {
    const dbms = this.normalizeDbms(normalizedDbms);
    try {
      const parts = (connectionString || '')
        .split(';')
        .map(part => part.trim())
        .filter(part => !!part && part.includes('='));

      const keep: string[] = [];
      for (const part of parts) {
        const idx = part.indexOf('=');
        const key = part.substring(0, idx).trim().toLowerCase();
        if (['initial catalog', 'database', 'dbq', 'service name'].includes(key)) continue;
        if (dbms === 'mssql' && (key === 'attachdbfilename' || key === 'initial file name')) continue;
        keep.push(part);
      }
      return keep.join(';');
    } catch {
      return '';
    }
  }

  private buildProviderConnectionString(normalizedDbms: string, conn: {
    dataSource: string; port: string; databaseName: string;
    userId: string; password: string; integratedSecurity?: boolean;
  }): string {
    const dbms = this.normalizeDbms(normalizedDbms);
    const dataSource = String(conn.dataSource || '').trim();
    const port = String(conn.port || '').trim();
    const databaseName = String(conn.databaseName || '').trim();
    const userId = String(conn.userId || '').trim();
    const password = String(conn.password || '').trim();
    const integratedSecurity = !!conn.integratedSecurity;

    const parts: string[] = [];
    if (dbms === 'mssql') {
      let serverValue = dataSource;
      if (serverValue && port && !serverValue.includes(',')) serverValue = `${serverValue},${port}`;
      if (serverValue) parts.push(`data source=${serverValue}`);
      if (integratedSecurity) {
        parts.push('Integrated Security=True');
      } else {
        parts.push('integrated security=False');
        if (userId) parts.push(`User ID=${userId}`);
        if (password) parts.push(`Password=${password}`);
        parts.push('Persist Security Info=true');
      }
      parts.push('Encrypt=False');
      parts.push('TrustServerCertificate=True');
      if (databaseName) parts.push(`initial catalog=${databaseName}`);
      return parts.join(';');
    }
    if (dbms === 'mysql' || dbms === 'postgresql') {
      if (dataSource) parts.push(`server=${dataSource}`);
      if (userId) parts.push(`user id=${userId}`);
      if (password) parts.push(`password=${password}`);
      parts.push('persist security info=True');
      if (databaseName) parts.push(`database=${databaseName}`);
      if (port) parts.push(`Port=${port}`);
      return parts.join(';');
    }
    if (dbms === 'oracle') {
      if (dataSource) parts.push(`data source=${dataSource}`);
      if (userId) parts.push(`User ID=${userId}`);
      if (password) parts.push(`Password=${password}`);
      if (databaseName) parts.push(`service name=${databaseName}`);
      if (port) parts.push(`Port=${port}`);
      return parts.join(';');
    }
    return String(this.firstRunForm.dataConnectionString || '').trim();
  }

  private isSqlServerCertificateError(detail: string): boolean {
    const message = String(detail || '').toLowerCase();
    return message.includes('ssl provider')
      || (message.includes('certificate') && message.includes('chain'))
      || (message.includes('certific') && message.includes('catena'))
      || message.includes('trustservercertificate');
  }

  private applySqlServerCertificateFix(connectionString: string): string {
    const segments = (connectionString || '').split(';').map(p => p.trim()).filter(p => !!p);
    const filtered: string[] = [];
    for (const part of segments) {
      const idx = part.indexOf('=');
      if (idx <= 0) { filtered.push(part); continue; }
      const key = part.substring(0, idx).trim().toLowerCase();
      if (key === 'encrypt' || key === 'trustservercertificate') continue;
      filtered.push(part);
    }
    filtered.push('Encrypt=False');
    filtered.push('TrustServerCertificate=True');
    return filtered.join(';');
  }

  private getConnValue(map: Map<string, string>, keys: string[]): string {
    for (const k of keys) {
      const value = map.get(k.toLowerCase());
      if (value !== undefined) return value;
    }
    return '';
  }

  // ════════════════════════════════════════════════════════════════════════
  //                        GENERIC PARSE / NORMALIZE
  // ════════════════════════════════════════════════════════════════════════

  private parseDictionaryResponse(payload: any): Record<string, any> {
    const raw = this.unwrapPayload(payload);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch { return {}; }
    }
    return {};
  }

  private parseStringArrayResponse(payload: any): string[] {
    const raw = this.unwrapPayload(payload);
    if (Array.isArray(raw)) return raw.map(x => String(x ?? ''));
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(x => String(x ?? '')) : [];
      } catch { return []; }
    }
    return [];
  }

  private unwrapPayload(payload: any): any {
    if (payload && typeof payload === 'object') {
      if ('d' in payload) return payload.d;
      if ('value' in payload) return payload.value;
    }
    return payload;
  }

  private normalizeDbms(value: string): string {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'postgres') return 'postgresql';
    return v;
  }

  private toBoolean(value: any): boolean {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'si';
  }

  private extractErrorMessage(error: any): string {
    const fromBackend = error?.error;
    if (typeof fromBackend === 'string' && fromBackend.trim()) return fromBackend;

    if (fromBackend && typeof fromBackend === 'object') {
      const parts: string[] = [];
      const detail = fromBackend.message || fromBackend.error || fromBackend.title;
      if (detail) parts.push(String(detail));
      const rootMessage = (fromBackend as any).rootMessage;
      if (rootMessage && (!detail || !String(detail).includes(String(rootMessage)))) {
        parts.push(String(rootMessage));
      }
      // ── New typed-exception envelope (skill exception-handling) ────────
      // Server's JsonExceptionFilter wraps unhandled exceptions in:
      //   { ok:false, errorCode, fallbackMessage, args: { type, message, ... }, traceId }
      // Senza questi pickup, marker grezzi tipo `METADATA_DB_EXISTS_CONFIRM_REQUIRED:`
      // (lanciati come `throw new InvalidOperationException(marker)` lato server)
      // restano sepolti in `args.message` → il flow `if (firstRunError.includes(marker))`
      // del wizard non trova mai il match e perde il prompt di overwrite.
      const argsMsg = (fromBackend as any).args?.message;
      if (argsMsg && !parts.some(p => p.includes(String(argsMsg)))) {
        parts.push(String(argsMsg));
      }
      const fallbackMsg = (fromBackend as any).fallbackMessage;
      if (fallbackMsg && !parts.some(p => p.includes(String(fallbackMsg)))) {
        parts.push(String(fallbackMsg));
      }
      if (parts.length > 0) return parts.join(' | ');
    }
    return String(error?.message || 'Errore sconosciuto durante il first-run setup.');
  }

  // ════════════════════════════════════════════════════════════════════════
  //                        I18N BUNDLES (firstrun.* keys)
  // ════════════════════════════════════════════════════════════════════════

  private registerFirstRunTranslations(): void {
    const bundles: Record<string, any> = {
      'it-IT': { firstrun: { rag: {
        installTooltip:
          'PREREQUISITO: Python 3.12 installato e sul PATH del worker IIS.\n\n' +
          'Se la checkbox è disabilitata: Python non è stato rilevato.\n' +
          'Per installarlo (ONE-CLICK):\n' +
          '• Vai nella cartella del deploy (dove c\'è WuicCore.dll)\n' +
          '• Right-click su rag-setup.ps1 → "Esegui come amministratore"\n' +
          '• Lo script si auto-eleva via UAC, estrae Python 3.12 embeddable (niente MSI, bypass GPO DisableMSI), installa pip, aggiorna PATH, fa iisreset\n' +
          '• Ricarica il form (Ctrl+F5) → la checkbox si abilita\n\n' +
          'Python >= 3.13 accettato ma non testato (wheels torch più stabili su 3.12).\n\n' +
          'Quando Python è presente, l\'install RAG parte in BACKGROUND appena finita la creazione DB. ' +
          'Puoi loggarti subito e usare il resto dell\'app; riceverai notifiche nel bell in alto ai 4 step + 1 finale (cliccabile per aprire il chatbot).\n\n' +
          'Tempi tipici (rete ~50-100 Mbps):\n' +
          '• First run CPU: 4-8 minuti (download torch ~200 MB)\n' +
          '• First run GPU CUDA: 18-32 minuti (download torch ~2.5 GB)\n' +
          '• Rerun con venv già presente: <20 sec\n\n' +
          'Cold start del server dopo setup: ~13 sec.',
        cudaTooltip:
          'Download: ~2.5 GB (vs ~200 MB versione CPU)\n' +
          'Tempo aggiuntivo: +15-25 min su rete standard\n' +
          'Performance runtime: ~10-20× più veloce su embedding search + rerank.\n\n' +
          'Richiede: GPU NVIDIA + driver CUDA 12.x installati lato sistema.',
        apiKeyTooltip:
          'Senza chiave: modalità retrieval-only (ricerca snippet dal codebase).\n' +
          'Con chiave: chat LLM con sintesi via Claude.\n\n' +
          'La chiave viene salvata come env var del processo server (non nel DB).\n' +
          'Puoi impostarla anche post-install rilanciando: pwsh rag-setup.ps1 -Start -AnthropicApiKey "sk-ant-...".'
      }}},
      'en-US': { firstrun: { rag: {
        installTooltip:
          'PREREQUISITE: Python 3.12 installed and on the IIS worker PATH.\n\n' +
          'If this checkbox is disabled: Python was not detected.\n' +
          'To install (ONE-CLICK):\n' +
          '• Go to the deploy folder (where WuicCore.dll is)\n' +
          '• Right-click on rag-setup.ps1 → "Run as administrator"\n' +
          '• The script self-elevates via UAC, extracts Python 3.12 embeddable (no MSI, bypasses GPO DisableMSI), installs pip, updates PATH, runs iisreset\n' +
          '• Reload the form (Ctrl+F5) → the checkbox enables automatically\n\n' +
          'Python >= 3.13 is accepted but not tested (torch wheels are most stable on 3.12).\n\n' +
          'When Python is present, RAG install runs in BACKGROUND as soon as DB setup completes. ' +
          'You can log in right away and use the rest of the app; you will receive notifications in the top bell ' +
          'for 4 steps + 1 final (clickable to open the chatbot).\n\n' +
          'Typical timings (network ~50-100 Mbps):\n' +
          '• First run CPU: 4-8 minutes (torch download ~200 MB)\n' +
          '• First run GPU CUDA: 18-32 minutes (torch download ~2.5 GB)\n' +
          '• Rerun with existing venv: <20 sec\n\n' +
          'Server cold start after setup: ~13 sec.',
        cudaTooltip:
          'Download: ~2.5 GB (vs ~200 MB CPU version)\n' +
          'Extra time: +15-25 min on standard network\n' +
          'Runtime performance: ~10-20× faster on embedding search + rerank.\n\n' +
          'Requires: NVIDIA GPU + CUDA 12.x drivers installed system-wide.',
        apiKeyTooltip:
          'Without key: retrieval-only mode (codebase snippet search).\n' +
          'With key: LLM chat with synthesis via Claude.\n\n' +
          'The key is stored as a server process env var (not in DB).\n' +
          'Can also be set post-install by re-running: pwsh rag-setup.ps1 -Start -AnthropicApiKey "sk-ant-...".'
      }}},
      'fr-FR': { firstrun: { rag: {
        installTooltip:
          'PRÉREQUIS : Python 3.12 installé et sur le PATH du worker IIS.\n\n' +
          'Si la case est désactivée : Python n\'a pas été détecté.\n' +
          'Pour l\'installer (ONE-CLICK) :\n' +
          '• Allez dans le dossier du deploy (où se trouve WuicCore.dll)\n' +
          '• Right-click sur rag-setup.ps1 → "Exécuter en tant qu\'administrateur"\n' +
          '• Le script s\'auto-élève via UAC, extrait Python 3.12 embeddable (sans MSI, contourne la GPO DisableMSI), installe pip, met à jour PATH, lance iisreset\n' +
          '• Rechargez le formulaire (Ctrl+F5) → la case s\'active automatiquement\n\n' +
          'Python >= 3.13 accepté mais non testé (wheels torch plus stables sur 3.12).\n\n' +
          'Quand Python est présent, l\'install RAG tourne en ARRIÈRE-PLAN dès la fin du setup BDD. ' +
          'Vous pouvez vous connecter immédiatement ; vous recevrez des notifications ' +
          'dans la cloche en haut pour 4 étapes + 1 finale (cliquable pour ouvrir le chatbot).\n\n' +
          'Temps typiques (réseau ~50-100 Mbps) :\n' +
          '• Premier run CPU : 4-8 minutes (téléchargement torch ~200 Mo)\n' +
          '• Premier run GPU CUDA : 18-32 minutes (téléchargement torch ~2,5 Go)\n' +
          '• Rerun avec venv existant : <20 sec\n\n' +
          'Cold start du serveur après setup : ~13 sec.',
        cudaTooltip:
          'Téléchargement : ~2,5 Go (vs ~200 Mo version CPU)\n' +
          'Temps supplémentaire : +15-25 min sur réseau standard\n' +
          'Performance runtime : ~10-20× plus rapide en recherche embedding + rerank.\n\n' +
          'Requiert : GPU NVIDIA + pilotes CUDA 12.x installés au niveau système.',
        apiKeyTooltip:
          'Sans clé : mode retrieval-only (recherche de snippets dans le codebase).\n' +
          'Avec clé : chat LLM avec synthèse via Claude.\n\n' +
          'La clé est stockée comme variable env du processus serveur (pas dans la BDD).\n' +
          'Peut aussi être définie post-install en relançant : pwsh rag-setup.ps1 -Start -AnthropicApiKey "sk-ant-...".'
      }}},
      'es-ES': { firstrun: { rag: {
        installTooltip:
          'PRERREQUISITO: Python 3.12 instalado y en el PATH del worker IIS.\n\n' +
          'Si la casilla está deshabilitada: Python no fue detectado.\n' +
          'Para instalarlo (ONE-CLICK):\n' +
          '• Ve a la carpeta del deploy (donde está WuicCore.dll)\n' +
          '• Click derecho en rag-setup.ps1 → "Ejecutar como administrador"\n' +
          '• El script se auto-eleva vía UAC, extrae Python 3.12 embeddable (sin MSI, evita la GPO DisableMSI), instala pip, actualiza PATH, ejecuta iisreset\n' +
          '• Recarga el formulario (Ctrl+F5) → la casilla se habilita automáticamente\n\n' +
          'Python >= 3.13 aceptado pero no testado (wheels torch más estables en 3.12).\n\n' +
          'Con Python presente, la instalación RAG corre en SEGUNDO PLANO apenas termina el setup BD. ' +
          'Puedes iniciar sesión inmediatamente; recibirás notificaciones ' +
          'en la campana superior para 4 pasos + 1 final (cliqueable para abrir el chatbot).\n\n' +
          'Tiempos típicos (red ~50-100 Mbps):\n' +
          '• First run CPU: 4-8 minutos (descarga torch ~200 MB)\n' +
          '• First run GPU CUDA: 18-32 minutos (descarga torch ~2,5 GB)\n' +
          '• Rerun con venv ya presente: <20 seg\n\n' +
          'Cold start del servidor tras setup: ~13 seg.',
        cudaTooltip:
          'Descarga: ~2,5 GB (vs ~200 MB versión CPU)\n' +
          'Tiempo adicional: +15-25 min en red estándar\n' +
          'Rendimiento runtime: ~10-20× más rápido en embedding search + rerank.\n\n' +
          'Requiere: GPU NVIDIA + drivers CUDA 12.x instalados a nivel sistema.',
        apiKeyTooltip:
          'Sin clave: modo retrieval-only (búsqueda de snippets del codebase).\n' +
          'Con clave: chat LLM con síntesis vía Claude.\n\n' +
          'La clave se guarda como env var del proceso servidor (no en BD).\n' +
          'Puede establecerse también post-install relanzando: pwsh rag-setup.ps1 -Start -AnthropicApiKey "sk-ant-...".'
      }}},
      'de-DE': { firstrun: { rag: {
        installTooltip:
          'VORAUSSETZUNG: Python 3.12 installiert und im PATH des IIS-Workers.\n\n' +
          'Falls die Checkbox deaktiviert ist: Python wurde nicht erkannt.\n' +
          'Zum Installieren (ONE-CLICK):\n' +
          '• Gehen Sie in den Deploy-Ordner (wo WuicCore.dll liegt)\n' +
          '• Rechtsklick auf rag-setup.ps1 → "Als Administrator ausführen"\n' +
          '• Das Skript hebt sich via UAC selbst an, extrahiert Python 3.12 embeddable (kein MSI, umgeht die GPO DisableMSI), installiert pip, aktualisiert PATH, führt iisreset aus\n' +
          '• Laden Sie das Formular neu (Strg+F5) → die Checkbox wird automatisch aktiviert\n\n' +
          'Python >= 3.13 akzeptiert, aber nicht getestet (Torch-Wheels am stabilsten auf 3.12).\n\n' +
          'Wenn Python vorhanden ist, läuft die RAG-Installation im HINTERGRUND, sobald das DB-Setup fertig ist. ' +
          'Sie können sich sofort anmelden; Sie erhalten Benachrichtigungen ' +
          'in der oberen Glocke für 4 Schritte + 1 Abschluss (klickbar zum Öffnen des Chatbots).\n\n' +
          'Typische Dauer (Netz ~50-100 Mbps):\n' +
          '• First Run CPU: 4-8 Minuten (Torch-Download ~200 MB)\n' +
          '• First Run GPU CUDA: 18-32 Minuten (Torch-Download ~2,5 GB)\n' +
          '• Rerun mit bestehendem venv: <20 Sek\n\n' +
          'Server-Cold-Start nach Setup: ~13 Sek.',
        cudaTooltip:
          'Download: ~2,5 GB (vs ~200 MB CPU-Version)\n' +
          'Zusätzliche Zeit: +15-25 Min in Standard-Netz\n' +
          'Runtime-Performance: ~10-20× schneller bei Embedding-Search + Rerank.\n\n' +
          'Erfordert: NVIDIA-GPU + systemweit installierte CUDA-12.x-Treiber.',
        apiKeyTooltip:
          'Ohne Schlüssel: Retrieval-only-Modus (Snippet-Suche im Codebase).\n' +
          'Mit Schlüssel: LLM-Chat mit Synthese via Claude.\n\n' +
          'Der Schlüssel wird als Env-Var des Server-Prozesses gespeichert (nicht in DB).\n' +
          'Kann auch nach der Installation gesetzt werden via: pwsh rag-setup.ps1 -Start -AnthropicApiKey "sk-ant-...".'
      }}}
    };

    for (const [lang, strings] of Object.entries(bundles)) {
      this.translate.setTranslation(lang, strings, true);
    }

    if (!this.translate.getDefaultLang()) {
      const browserLang = (navigator.language || 'it-IT');
      const resolvedLang = Object.keys(bundles).find(l => l.toLowerCase() === browserLang.toLowerCase())
        || Object.keys(bundles).find(l => l.startsWith(browserLang.substring(0, 2)))
        || 'it-IT';
      this.translate.setDefaultLang(resolvedLang);
      void this.translate.use(resolvedLang);
    }
  }
}
