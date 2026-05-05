import { HttpClient } from '@angular/common/http';
import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from 'primeng/tabs';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { AuthSessionService } from '../../service/auth-session.service';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { GlobalHandler } from '../../handler/GlobalHandler';

/**
 * Tipo di campo riconosciuto dal renderer. Allineato alla `FieldType` enum
 * del backend `AppSettingsController`.
 */
type FieldType = 'string' | 'bool' | 'int' | 'password' | 'longtext';

/**
 * Livello di impatto di una modifica. Allineato alla `ChangeImpact` enum del
 * backend, in lower-case (serializzazione JSON di ToString().ToLowerInvariant()).
 */
type ChangeImpact = 'hotreload' | 'restart' | 'restartandlogout';

interface AppSettingFieldDef {
  key: string;
  label: string;
  /** Chiave i18n (es. `app_settings.field.logging_loglevel_default`). Emessa dal backend. Null se non tradotta. */
  labelKey?: string | null;
  type: FieldType;
  impact: ChangeImpact;
  description?: string | null;
  /** Chiave i18n description. Null se il field non ha description. */
  descriptionKey?: string | null;
  value: any;
  /**
   * If non-empty, render a `<p-select>` constrained to these values instead
   * of the free-text input dictated by `type`. The backend populates this
   * for enum-like settings (dbms, encriptionMethod, log levels, etc.) so the
   * user can't accidentally write `mssqll` and brick the next backend boot.
   */
  options?: string[] | null;
}

interface AppSettingSection {
  name: string;
  label: string;
  labelKey?: string | null;
  icon: string;
  fields: AppSettingFieldDef[];
}

interface GetSchemaResponse {
  ok: boolean;
  filePath: string;
  sections: AppSettingSection[];
}

interface SaveChange {
  key: string;
  oldValue: any;
  newValue: any;
}

interface SaveResponse {
  ok: boolean;
  appliedCount: number;
  classification: ChangeImpact;
  requireLogout: boolean;
  restartScheduled: boolean;
  restartDelayMs: number;
  filePath: string;
  perFieldImpact: { key: string; impact: ChangeImpact }[];
}

/**
 * Editor visuale per `appsettings.json` organizzato in tab per sezione.
 *
 * Architettura: il componente carica lo schema (campi + valori correnti) da
 * `GET /api/AppSettings/Get`, mantiene un `pristine` snapshot per calcolare il
 * diff, e su "Save & Apply" POSTa solo le modifiche a `POST /api/AppSettings/Save`.
 *
 * Il backend classifica le modifiche in tre livelli (`hotreload`, `restart`,
 * `restartandlogout`) — il componente reagisce di conseguenza:
 * - **hotreload**: mostra toast di successo, aggiorna pristine, end of story.
 * - **restart**: mostra overlay "Backend is restarting...", polla `Health` ogni
 *   500ms fino a che il backend torna su, ricarica lo schema, mostra toast.
 * - **restartandlogout**: come `restart`, ma al ritorno forza il logout
 *   chiamando `AuthSessionService.legacyLogout()` + redirect a `/`.
 *
 * NOTA architetturale: questo NON e' un metadata-bound parametric-dialog perche'
 * `appsettings.json` non ha backing DB e creare una route metadata fittizia con
 * tabella DB virtuale + 50 colonne in `_metadati__colonne` aggiungerebbe ~3x il
 * codice senza alcun vantaggio funzionale. La UI usa lo stesso `<p-tabs>` di
 * PrimeNG che usa il parametric-dialog, quindi visivamente sono indistinguibili.
 */
@Component({
  selector: 'wuic-app-settings-editor',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    PasswordModule,
    SelectModule,
    TextareaModule,
    ToggleSwitchModule,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    ProgressSpinnerModule,
    TagModule,
    TooltipModule,
    TranslateModule,
  ],
  templateUrl: './app-settings-editor.component.html',
  styleUrl: './app-settings-editor.component.scss',
})
export class AppSettingsEditorComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly trslSrv = inject(TranslationManagerService);

  // ----- State -----
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly waitingRestart = signal(false);
  readonly errorMsg = signal<string | null>(null);

  readonly sections = signal<AppSettingSection[]>([]);
  readonly filePath = signal<string>('');

  // Mappa pristine: snapshot dei valori al momento dell'ultimo Get/Save success.
  // Usata per calcolare il diff (== _changes nel linguaggio del datasource WUIC).
  private pristine = new Map<string, any>();

  // Mappa current: lo stato editabile. Bidirezionale via [(ngModel)] sui field.
  // Tenuta separata da pristine per poter computare hasPendingChanges/diff
  // senza scrivere a memoria continuamente.
  current = new Map<string, any>();

  readonly activeTabValue = signal(0);

  /**
   * Chiave localStorage per persistere il tab corrente. Salvato per `name`
   * (stable identifier della sezione, non per index che puo' cambiare se
   * vengono aggiunte/rimosse sezioni). Letto in `loadSchema` per ripristinare
   * il tab dopo refresh / restart-driven reload.
   */
  private static readonly ACTIVE_TAB_LS_KEY = 'wuic_app_settings_editor_active_tab';

  /**
   * Wire-up dal template: persiste il tab corrente su localStorage ad
   * ogni cambio. Salva il `name` della sezione (stabile cross-reload).
   */
  onTabChange(newIndex: number): void {
    this.activeTabValue.set(newIndex);
    try {
      const sec = this.sections()?.[newIndex];
      if (sec?.name) {
        localStorage.setItem(AppSettingsEditorComponent.ACTIVE_TAB_LS_KEY, sec.name);
      }
    } catch { /* localStorage quota / unavailable: ignore */ }
  }

  // Computed: lista dei campi cambiati rispetto al pristine. E' anche cio' che
  // viene inviato al backend come `_changes`. Si aggiorna automaticamente man
  // mano che l'utente edita i field-editor.
  readonly pendingChanges = computed<SaveChange[]>(() => {
    // Force re-eval quando cambia "tick" (vedi nudgeChangeTracker).
    this.changeTick();
    const out: SaveChange[] = [];
    for (const [key, val] of this.current.entries()) {
      const old = this.pristine.get(key);
      if (!this.valuesEqual(old, val)) {
        out.push({ key, oldValue: old, newValue: val });
      }
    }
    return out;
  });

  readonly hasPendingChanges = computed(() => this.pendingChanges().length > 0);
  readonly pendingChangesCount = computed(() => this.pendingChanges().length);

  // Trigger esplicito per ricalcolo del computed (ngModel su Map non triggera
  // signal automaticamente). Bumppato a ogni keyup/change.
  private readonly changeTick = signal(0);

  // ----- Lifecycle -----
  async ngOnInit(): Promise<void> {
    await this.loadSchema();
  }

  // ----- API base URL ----------------------------------------------------
  // Stesso pattern di wuic-rag.service.ts:buildApiBaseUrl. NECESSARIO perche'
  // questo componente vive nella libreria framework, non nell'app host:
  // - sotto WuicTest dev (`ng serve`), il SPA gira su :4200 ma il backend e'
  //   su :5000 e l'app host setta `WtoolboxService.appSettings.api_url =
  //   'http://localhost:5000/api/'` (vedi WuicTest environment.ts). Una path
  //   relativa tipo `/api/AppSettings/Get` verrebbe risolta come
  //   `http://localhost:4200/...` e cadrebbe nel catch-all SPA che ritorna
  //   index.html (-> "Unexpected token '<' is not valid JSON").
  // - sotto IIS / NugetHost in produzione il backend serve anche il
  //   frontend sullo stesso origin, quindi `appSettings.api_url` puo' essere
  //   vuoto e il fallback su `window.location.host` produce l'URL corretto.
  private apiUrl(action: 'Get' | 'Save' | 'Health'): string {
    return `${this.buildApiBaseUrl()}AppSettings/${action}`;
  }

  private buildApiBaseUrl(): string {
    const configured = String((WtoolboxService as any).appSettings?.api_url || '').trim();
    if (configured) {
      return configured.endsWith('/') ? configured : `${configured}/`;
    }
    if (typeof window !== 'undefined' && window.location) {
      return `${window.location.protocol}//${window.location.host}/api/`;
    }
    return '/api/';
  }

  // ----- Loading -----
  private async loadSchema(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      const resp = await firstValueFrom(
        this.http.get<GetSchemaResponse>(this.apiUrl('Get'), { withCredentials: true })
      );
      if (!resp || !resp.ok) {
        throw new Error('Backend ha rifiutato la richiesta (probabile 401 / non admin).');
      }
      this.sections.set(resp.sections || []);
      this.filePath.set(resp.filePath || '');
      this.rebuildMaps(resp.sections || []);

      // Ripristina il tab attivo dal localStorage (per `name`, non index).
      // Senza questa logica ogni reload (incluso quello post-save+restart)
      // resetta a tab 0, perdendo il contesto dell'utente che stava editando
      // la sezione "Sessions & Auth Local" o altre.
      let restoredIndex = 0;
      try {
        const savedName = localStorage.getItem(AppSettingsEditorComponent.ACTIVE_TAB_LS_KEY);
        if (savedName) {
          const idx = (resp.sections || []).findIndex(s => s.name === savedName);
          if (idx >= 0) restoredIndex = idx;
        }
      } catch { /* localStorage unavailable: fallback a 0 */ }
      this.activeTabValue.set(restoredIndex);
    } catch (err: any) {
      const msg = err?.error?.error || err?.message || 'Errore durante il caricamento.';
      this.errorMsg.set(msg);
    } finally {
      this.loading.set(false);
    }
  }

  private rebuildMaps(sections: AppSettingSection[]): void {
    this.pristine.clear();
    this.current.clear();
    for (const sec of sections) {
      for (const f of sec.fields) {
        const v = this.normalizeValueForType(f.value, f.type);
        this.pristine.set(f.key, v);
        this.current.set(f.key, v);
      }
    }
    this.changeTick.update((t) => t + 1);
  }

  // ----- Field rendering helpers -----

  /**
   * Trasforma il valore raw che arriva dal backend in un valore tipizzato
   * stabile per il binding ngModel. Questo evita falsi diff dovuti a
   * confronto string-vs-number o "true"-vs-true.
   */
  private normalizeValueForType(raw: any, type: FieldType): any {
    if (raw == null) {
      switch (type) {
        case 'bool': return false;
        case 'int': return null;
        default: return '';
      }
    }
    switch (type) {
      case 'bool': {
        if (typeof raw === 'boolean') return raw;
        const s = String(raw).toLowerCase();
        return s === 'true' || s === '1';
      }
      case 'int': {
        if (typeof raw === 'number') return raw;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      }
      default:
        return String(raw);
    }
  }

  private valuesEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null && b == null) return true;
    // Normalizza prima del confronto: stringhe vuote vs null, number vs string number.
    if (a == null || b == null) return false;
    return String(a) === String(b);
  }

  /**
   * Bind handler per ngModel sui field. Aggiorna current e bumpa il tick
   * cosi' il computed pendingChanges si rivaluta.
   */
  onFieldChange(key: string, newValue: any): void {
    this.current.set(key, newValue);
    this.changeTick.update((t) => t + 1);
  }

  fieldValue(key: string): any {
    return this.current.get(key);
  }

  /**
   * Ritorna `true` se almeno uno dei changes coinvolge una chiave licenza
   * (`license-email` / `license-payload` / `license-signature`). Usato dal save
   * flow per triggerare un full reload della pagina dopo il save — necessario
   * perche' `LicenseFeatureService` mantiene le feature cached in memoria e
   * non rilegge automaticamente al cambio `IConfigurationRoot` del backend.
   * Match case-insensitive sull'inizio della chiave per coprire i prefissi
   * (es. "AppSettings:license-email", "license-email", "License-Email").
   */
  private changesIncludeLicense(changes: SaveChange[]): boolean {
    if (!Array.isArray(changes) || changes.length === 0) return false;
    return changes.some((c) => {
      const key = String(c?.key || '').toLowerCase();
      return key.includes('license-email')
          || key.includes('license-payload')
          || key.includes('license-signature');
    });
  }

  // Stylistic helpers per le badge di impact.
  impactSeverity(impact: ChangeImpact): 'success' | 'warn' | 'danger' {
    switch (impact) {
      case 'hotreload': return 'success';
      case 'restart': return 'warn';
      case 'restartandlogout': return 'danger';
    }
  }

  impactLabel(impact: ChangeImpact): string {
    switch (impact) {
      case 'hotreload': return this.trslSrv.instant('app_settings.impact.hotreload') || 'hot-reload';
      case 'restart': return this.trslSrv.instant('app_settings.impact.restart') || 'restart';
      case 'restartandlogout': return this.trslSrv.instant('app_settings.impact.restartandlogout') || 'restart + logout';
    }
  }

  /**
   * Risolve un label dato chiave i18n + fallback inglese. Se la chiave non e'
   * in tabella traduzioni (deploy pre-upsert), torna il fallback del backend.
   * Usato sia per sezioni (tLabel(sec.labelKey, sec.label)) sia per field.
   */
  t(key: string | null | undefined, fallback: string | null | undefined): string {
    if (!key) return fallback || '';
    const translated = this.trslSrv.instant(key);
    if (!translated || translated === key) return fallback || key;
    return translated;
  }

  // ----- Crash reporting disclaimer flow (skill crash-reporting Commit 9) -----

  /**
   * Mostra il disclaimer GDPR (solo per opt-IN), poi POSTa
   * `MetaService.crashConsent` per registrare il consenso lato receiver +
   * scrivere in appsettings il toggle + audit fields.
   *
   * Ritorna `true` se l'utente ha confermato E il consent upstream e' andato
   * a buon fine. `false` se l'utente ha annullato o se la rete/upstream ha
   * rifiutato — in entrambi i casi il save deve essere abortito.
   *
   * Per opt-OUT (granted=false): nessun dialog (regola GDPR: withdraw
   * sempre permesso senza friction). Solo POST consent + return ok.
   */
  private async handleCrashReportingConsent(granted: boolean): Promise<boolean> {
    if (granted) {
      const tr = (k: string): string => this.trslSrv.instant(k) || '';
      const html = `
        <div style="max-width:520px; line-height:1.5;">
          <p style="margin:0 0 12px 0;">${this.escapeHtml(tr('crash_reporting.disclaimer.intro'))}</p>
          <p style="margin:0 0 8px 0;"><strong>${this.escapeHtml(tr('crash_reporting.disclaimer.what_we_send'))}</strong></p>
          <p style="margin:0 0 8px 0; opacity:0.9;">${this.escapeHtml(tr('crash_reporting.disclaimer.what_we_dont_send'))}</p>
          <p style="margin:0 0 6px 0; opacity:0.85; font-size:0.9em;">${this.escapeHtml(tr('crash_reporting.disclaimer.where_it_goes'))}</p>
          <p style="margin:0 0 6px 0; opacity:0.85; font-size:0.9em;">${this.escapeHtml(tr('crash_reporting.disclaimer.retention'))}</p>
          <p style="margin:0 0 6px 0; opacity:0.85; font-size:0.9em;">${this.escapeHtml(tr('crash_reporting.disclaimer.legal_basis'))}</p>
          <p style="margin:0 0 6px 0; opacity:0.85; font-size:0.9em;">${this.escapeHtml(tr('crash_reporting.disclaimer.how_to_disable'))}</p>
        </div>
      `;
      const accepted = await WtoolboxService.confirm({
        header: tr('crash_reporting.disclaimer.title'),
        message: html,
        acceptLabel: tr('crash_reporting.disclaimer.button_accept'),
        rejectLabel: tr('crash_reporting.disclaimer.button_cancel'),
        icon: 'pi pi-shield',
      } as any);
      if (!accepted) return false;
    }

    const locale = (this.trslSrv as any)?.getCurrentLang?.()
      || (this.trslSrv as any)?.currentLang
      || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
    try {
      const resp = await firstValueFrom(
        this.http.post<{ ok: boolean; error?: string }>(
          '/api/Meta/AsmxProxy/MetaService.crashConsent',
          { consentGranted: String(granted), disclaimerVersion: '1.0', locale },
          { withCredentials: true }
        )
      );
      if (!resp || resp.ok !== true) {
        const errKey = 'crash_reporting.consent_registered_error';
        const detail = resp?.error ? ` (${resp.error})` : '';
        WtoolboxService.messageNotificationService?.add({
          severity: 'error',
          summary: this.trslSrv.instant(errKey),
          detail,
          life: 6000,
        });
        return false;
      }
      WtoolboxService.messageNotificationService?.add({
        severity: 'success',
        summary: this.trslSrv.instant('crash_reporting.consent_registered_success'),
        detail: '',
        life: 3000,
      });
      return true;
    } catch (e: any) {
      WtoolboxService.messageNotificationService?.add({
        severity: 'error',
        summary: this.trslSrv.instant('crash_reporting.consent_registered_error'),
        detail: String(e?.message || e || ''),
        life: 6000,
      });
      return false;
    }
  }

  /** Minimal HTML escape per inserire testo tradotto in stringhe HTML. */
  private escapeHtml(s: string): string {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ----- Save flow -----

  /**
   * Custom action "Save & Apply": calcola il diff (== _changes), lo POSTa,
   * legge la classification dalla response e reagisce di conseguenza.
   *
   * - hotreload: toast + aggiorna pristine.
   * - restart: overlay + poll Health + reload schema.
   * - restartandlogout: overlay + poll Health + force logout.
   */
  async onSaveAndApply(): Promise<void> {
    const changes = this.pendingChanges();
    if (changes.length === 0 || this.saving()) return;

    // ── Crash reporting disclaimer intercept (skill crash-reporting Commit 9) ──
    // Se l'utente sta togglando `CrashReporting:Enabled` (false→true o viceversa),
    // dobbiamo:
    //  - opt-IN: mostrare il disclaimer GDPR e POSTare /api/crash/consent PRIMA
    //            del save standard. Il backend `crashConsent` scrive Enabled +
    //            DisclaimerAcceptedVersion + DisclaimerAcceptedAt in appsettings
    //            atomicamente, quindi rimuoviamo questi 3 field dal payload save
    //            per evitare doppia scrittura.
    //  - opt-OUT: niente dialog di conferma (regola GDPR: "tornare indietro"
    //            e' sempre permesso senza ulteriori friction). POSTa consent
    //            con granted=false, idem rimuove i 3 field dal save.
    // Se il consent fallisce (network/license/upstream rejected), abortiamo
    // l'intero save e mostriamo un toast di errore.
    const crashEnabledChange = changes.find((c) => String(c.key).toLowerCase() === 'crashreporting:enabled');
    if (crashEnabledChange) {
      const granted = crashEnabledChange.newValue === true || crashEnabledChange.newValue === 'true';
      const proceed = await this.handleCrashReportingConsent(granted);
      if (!proceed) return; // user cancelled or upstream failed
      // Strip the 3 fields written server-side by crashConsent.
      const stripKeys = new Set(['crashreporting:enabled', 'crashreporting:disclaimeracceptedversion', 'crashreporting:disclaimeracceptedat']);
      for (const ch of changes.filter((c) => stripKeys.has(String(c.key).toLowerCase()))) {
        // Sync pristine + clear from current pending diff so save excludes these.
        this.pristine.set(ch.key, this.current.get(ch.key));
      }
      this.changeTick.update((t) => t + 1);
      // After strip, re-evaluate the pending list. If empty, we're done.
      if (this.pendingChanges().length === 0) {
        WtoolboxService.messageNotificationService?.add({
          severity: 'success',
          summary: WtoolboxService.translationService.instant('crash_reporting.consent_registered_success'),
          detail: '',
          life: 3000,
        });
        this.saving.set(false);
        return;
      }
    }

    this.saving.set(true);
    this.errorMsg.set(null);
    try {
      const resp = await firstValueFrom(
        this.http.post<SaveResponse>(this.apiUrl('Save'), { changes }, { withCredentials: true })
      );

      if (!resp || !resp.ok) {
        throw new Error('Save rifiutato dal backend.');
      }

      // Mostra in toast il riassunto
      const detail = `${resp.appliedCount} setting(s) applicati • impact: ${this.impactLabel(resp.classification)}`;
      WtoolboxService.messageNotificationService?.add({
        severity: resp.classification === 'hotreload' ? 'success' : 'warn',
        summary: 'AppSettings salvato',
        detail,
        life: 4000,
      });

      if (resp.classification === 'hotreload') {
        // Caso facile: sync del pristine col current, end of story.
        for (const ch of changes) {
          this.pristine.set(ch.key, this.current.get(ch.key));
        }
        this.changeTick.update((t) => t + 1);
        this.saving.set(false);

        // Licenza: anche se il backend ha classificato come hotreload e ha
        // aggiornato il suo IConfigurationRoot, il LicenseFeatureService
        // frontend non rilegge automaticamente le nuove credenziali —
        // rimarrebbero cached in memoria finche' l'utente non ricarica.
        // Forza un full page reload in modo che il LicenseFeatureService
        // (e tutti i componenti license-gated come rag-chatbot-fab) si
        // riallineino alla licenza appena salvata.
        if (this.changesIncludeLicense(changes)) {
          WtoolboxService.messageNotificationService?.add({
            severity: 'info',
            summary: 'Licenza aggiornata',
            detail: 'Ricarico la pagina per applicare la nuova licenza…',
            life: 1500,
          });
          setTimeout(() => window.location.reload(), 600);
        }
        return;
      }

      // Caso restart e' restart+logout: il backend ha gia' schedulato lo
      // StopApplication, mostriamo overlay e iniziamo a pollare Health.
      this.saving.set(false);
      this.waitingRestart.set(true);

      // Sopprimi popup di errore globali e crash forwarding durante il restart.
      // Senza questo, ogni ERR_CONNECTION_REFUSED sui call HTTP correnti
      // (notification polling, lazy fetch, ecc.) farebbe scattare un
      // dialog "Errore HTTP 0" sotto l'overlay "Riavvio in corso".
      GlobalHandler.setRestartInProgress(true);

      // Aspetta un attimo per dare tempo al server di morire prima di iniziare
      // a pollare (altrimenti il primo ping passa sul vecchio processo).
      await this.sleep(Math.max(800, resp.restartDelayMs + 200));

      // Branch dev vs prod:
      //  - DEV (`dotnet watch`, `resp.isDevWatch === true`): worker termina ma
      //    dotnet-watch non auto-ripartisce su exit normale. Servono il flow
      //    a 4 fasi (poll-fail → grace 30s → bump → poll-up) per innescare il
      //    rebuild via dev-server proxy bypass middleware.
      //  - PROD (IIS/ANCM o NSSM, `isDevWatch === false`): il supervisor
      //    ricicla il worker autonomamente in pochi secondi. Polling classico
      //    (max 60s) e' sufficiente.
      const isDevWatch = (resp as { isDevWatch?: boolean }).isDevWatch === true;
      const backOnline = isDevWatch
        ? await this.waitForRestart(/* maxWaitMs */ 120_000, /* postDownGraceMs */ 30_000)
        : await this.waitForHealthSimple(/* maxWaitMs */ 60_000);
      this.waitingRestart.set(false);
      // Riabilita popup di errore globali appena il restart e' confermato
      // (nuovo worker risponde) o e' scaduto il budget. Da qui in poi
      // qualunque errore HTTP e' "vero" e va mostrato all'utente.
      GlobalHandler.setRestartInProgress(false);

      if (!backOnline) {
        WtoolboxService.messageNotificationService?.add({
          severity: 'error',
          summary: 'Restart non confermato',
          detail: isDevWatch
            ? 'Il backend non risponde al health-check entro 120s. Verifica i log dotnet-watch.'
            : 'Il backend non risponde al health-check entro 60s. Verifica i log del supervisor (IIS/NSSM).',
          life: 8000,
        });
        return;
      }

      if (resp.requireLogout) {
        WtoolboxService.messageNotificationService?.add({
          severity: 'info',
          summary: 'Sessione terminata',
          detail: 'Una o piu modifiche richiedono un nuovo login.',
          life: 5000,
        });
        await this.forceLogout();
        return;
      }

      // Restart-only: ricarica lo schema e aggiorna pristine al nuovo stato.
      await this.loadSchema();

      // Ri-fetch AuthConfig dal nuovo worker per applicare immediatamente i
      // valori freschi di sessionTimeoutMinutes / notifySessionExpirationBefore
      // e altri setting che il meta-menu legge da `Meta/AuthConfig`. Senza
      // questo dispatch il client manterrebbe i valori vecchi finche' non
      // si fa un page reload manuale (banner "sessione scadrà tra X" non
      // si aggiorna mai).
      try {
        window.dispatchEvent(new CustomEvent('wuic:auth-config-refresh'));
      } catch { /* env senza CustomEvent — ignora */ }

      WtoolboxService.messageNotificationService?.add({
        severity: 'success',
        summary: 'Backend riavviato',
        detail: 'Le nuove impostazioni sono attive.',
        life: 4000,
      });

      // Licenza: anche dopo il restart del backend, il frontend ha ancora
      // il LicenseFeatureService con le feature cached dalla vecchia licenza.
      // Un reload pagina garantisce che tutti i componenti license-gated
      // (rag-chatbot-fab, ecc.) vedano la licenza nuova.
      if (this.changesIncludeLicense(changes)) {
        WtoolboxService.messageNotificationService?.add({
          severity: 'info',
          summary: 'Licenza aggiornata',
          detail: 'Ricarico la pagina per applicare la nuova licenza…',
          life: 1500,
        });
        setTimeout(() => window.location.reload(), 600);
      }
    } catch (err: any) {
      const msg = err?.error?.details || err?.error?.error || err?.message || 'Errore durante il save.';
      this.errorMsg.set(msg);
      WtoolboxService.messageNotificationService?.add({
        severity: 'error',
        summary: 'Save fallito',
        detail: msg,
        life: 6000,
      });
      this.saving.set(false);
      this.waitingRestart.set(false);
      // Failsafe: riabilita popup globali anche su exception path, per
      // non lasciare la flag bloccata in caso di errore inatteso nel save.
      GlobalHandler.setRestartInProgress(false);
    }
  }

  async onResetChanges(): Promise<void> {
    if (!this.hasPendingChanges()) return;
    // Rollback locale: ricopia pristine dentro current.
    for (const [key, val] of this.pristine.entries()) {
      this.current.set(key, val);
    }
    this.changeTick.update((t) => t + 1);
  }

  async onReload(): Promise<void> {
    if (this.hasPendingChanges()) {
      const ok = await this.confirmDiscardChanges();
      if (!ok) return;
    }
    await this.loadSchema();
  }

  private async confirmDiscardChanges(): Promise<boolean> {
    // Se WtoolboxService espone un confirmDialog lo useremmo. Per semplicita'
    // qui usiamo confirm nativo solo come fallback rapido — l'utente puo'
    // sostituirlo poi con il dialog dell'app se preferisce.
    return Promise.resolve(window.confirm('Ci sono modifiche non salvate. Vuoi scartarle e ricaricare?'));
  }

  // ----- Restart polling -----

  private sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }

  /**
   * Restart-completion poll con flow a 4 fasi (algoritmo concordato):
   *
   *   1) Phase A — poll Health finche' fallisce. Quando il save di un setting
   *      con impact `restart` ritorna, il vecchio worker e' ancora vivo per
   *      ~800ms-5s prima dello StopApplication. Se non aspettiamo che muoia
   *      davvero, qualunque "200 OK" iniziale e' un FALSE POSITIVE — il vecchio
   *      worker risponde, dismissa il dialog, l'utente naviga e si schianta.
   *
   *   2) Phase B — wait `postDownGraceMs` (default 10s) DOPO la prima failure.
   *      Margine per dotnet-watch di completare lo shutdown e arrivare in
   *      "Waiting for changes" idle state.
   *
   *   3) Phase C — chiama `/api/__dev__/bump-watch-trigger` (Angular dev-server
   *      proxy bypass middleware in `proxy.conf.js`). Il middleware riscrive
   *      `HotReloadTrigger.cs` con un nome metodo unico → rude edit → dotnet-watch
   *      fa rebuild + restart del worker. In IIS/ANCM o dotnet run puro l'endpoint
   *      non esiste, la chiamata fallisce silente, ANCM/NSSM ricicla per conto suo.
   *
   *   4) Phase D — poll Health finche' un nuovo response 200 arriva: nuovo worker up.
   *
   * @param maxWaitMs budget totale in ms (default 90s).
   * @param postDownGraceMs grace post-down (default 10s).
   * @returns true se il restart e' stato completato, false su timeout.
   */
  private async waitForRestart(maxWaitMs: number = 120_000, postDownGraceMs: number = 30_000): Promise<boolean> {
    const start = Date.now();

    // Phase A: poll until calls fail (= old worker dead).
    let workerDownAt = 0;
    while (Date.now() - start < maxWaitMs) {
      try {
        await firstValueFrom(
          this.http.get<{ ok: boolean }>(this.apiUrl('Health'), { withCredentials: true })
        );
        // Still up. Wait.
      } catch {
        workerDownAt = Date.now();
        break;
      }
      await this.sleep(500);
    }
    if (!workerDownAt) {
      // Worker mai sceso: o il save non ha innescato lo StopApplication, o il
      // budget e' scaduto. Lasciamo che il caller decida cosa fare.
      return false;
    }

    // Phase B: 10s grace per dotnet-watch idle state.
    await this.sleep(postDownGraceMs);

    // Phase C: trigger rebuild via dev-server bypass middleware.
    try {
      await firstValueFrom(
        this.http.post<unknown>('/api/__dev__/bump-watch-trigger', {}, { withCredentials: false })
      );
    } catch {
      // Endpoint non esiste in IIS/NSSM o dotnet run puro — il supervisor
      // del processo (ANCM/NSSM) gestisce il restart per conto proprio.
      // Continuiamo comunque al polling Phase D: in tutti gli scenari il
      // worker prima o poi torna up, basta avere pazienza.
    }

    // Phase D: poll until calls respond again (= new worker ready).
    while (Date.now() - start < maxWaitMs) {
      try {
        const r = await firstValueFrom(
          this.http.get<{ ok: boolean }>(this.apiUrl('Health'), { withCredentials: true })
        );
        if (r && r.ok) return true;
      } catch {
        // Continue polling.
      }
      await this.sleep(500);
    }
    return false;
  }

  /**
   * [PROD path] Polling semplice usato sotto IIS/ANCM/NSSM dove il
   * supervisor ricicla il worker autonomamente in pochi secondi.
   * Comportamento identico alla versione legacy: polla finche' Health
   * risponde 200, senza fasi di pre-attesa o trigger esterni.
   *
   * Nota: c'e' un piccolo rischio di falso positivo nel primo ping se il
   * vecchio worker non e' ancora morto (~1-2s di sovrapposizione), ma sotto
   * ANCM/NSSM la finestra e' molto stretta e il caller (`saveAndApply`)
   * gia' fa un `sleep(Math.max(800, restartDelayMs+200))` prima di chiamare
   * questo metodo, coprendo il caso normale.
   */
  private async waitForHealthSimple(maxWaitMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        const r = await firstValueFrom(
          this.http.get<{ ok: boolean }>(this.apiUrl('Health'), { withCredentials: true })
        );
        if (r && r.ok) return true;
      } catch {
        // Connection refused / 502 / 503: continua a pollare.
      }
      await this.sleep(500);
    }
    return false;
  }

  /**
   * Wrapper legacy mantenuto per back-compat: alias di
   * `waitForHealthSimple`. Eventuali consumer storici che chiamavano
   * `waitForHealth(ms)` continuano a vedere il polling semplice (non il
   * 4-phase) — coerente con ambienti prod dove il supervisor gestisce
   * il restart.
   */
  private async waitForHealth(maxWaitMs: number): Promise<boolean> {
    return this.waitForHealthSimple(maxWaitMs);
  }

  private async forceLogout(): Promise<void> {
    try {
      // Stesso pattern di meta-menu.component.ts:logout()
      if (this.authSession.snapshot.enabled) {
        await this.authSession.logout('/');
        return;
      }
      await this.authSession.legacyLogout();
    } catch {
      // ignore — proseguiamo comunque al redirect
    }
    window.location.href = '/';
  }
}
