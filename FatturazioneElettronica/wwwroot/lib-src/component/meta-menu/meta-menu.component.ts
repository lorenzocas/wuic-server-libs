import { AsyncPipe } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MenubarModule } from 'primeng/menubar';
import type { MegaMenuItem, MenuItem } from 'primeng/api';
import type { Menubar } from 'primeng/menubar';
import { MetadataProviderService } from '../../service/metadata-provider.service';

import { MegaMenuModule } from 'primeng/megamenu';
import { ContextMenuModule } from 'primeng/contextmenu';
import { DialogModule } from 'primeng/dialog';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { LicenseFeatureService } from '../../service/license-feature.service';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subscription, firstValueFrom } from 'rxjs';
import { AuthSessionService, AuthSessionState } from '../../service/auth-session.service';
import { DataSourceComponent } from '../data-source/data-source.component';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { TranslateModule } from '@ngx-translate/core';
import { UserInfoService } from '../../service/user-info.service';
import { WorkflowRuntimeMenuService } from '../../service/workflow-runtime-menu.service';
import { ParametricDialogComponent } from '../parametric-dialog/parametric-dialog.component';
import { Lingua } from '../../class/lingua';

@Component({
  selector: 'wuic-meta-menu',
  imports: [MenubarModule, MegaMenuModule, ContextMenuModule, DialogModule, DataSourceComponent, RouterModule, FormsModule, AsyncPipe, TranslateModule],
  templateUrl: './meta-menu.component.html',
  styleUrl: './meta-menu.component.css'
})
export class MetaMenuComponent implements OnInit, AfterViewInit, OnDestroy {
  /**
   * Collezione dati per items, consumata dal rendering e dalle operazioni del componente.
   */
  items: MenuItem[] = [];
  /**
   * Collezione dati per base items, consumata dal rendering e dalle operazioni del componente.
   */
  private baseItems: MenuItem[] = [];
  /**
   * Collezione dati per runtime items, consumata dal rendering e dalle operazioni del componente.
   */
  private runtimeItems: MenuItem[] = [];
  /**
   * Proprieta di stato del componente per runtime menu exclusive, usata dalla logica interna e dal template.
   */
  private runtimeMenuExclusive = false;
  /**
   * Proprieta di stato del componente per runtime menu sub, usata dalla logica interna e dal template.
   */
  private runtimeMenuSub?: Subscription;
  private authStateSub?: Subscription;
  private authConfigRefreshHandler: (() => void) | null = null;
  /**
   * Proprieta di stato del componente per menu updated sub, usata dalla logica interna e dal template.
   */
  private menuUpdatedSub?: Subscription;
  /**
   * Collezione dati per mega items, consumata dal rendering e dalle operazioni del componente.
   */
  megaItems: MegaMenuItem[];

  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per menu.
   */
  @ViewChild('menubar') menu: Menubar;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per menu metadata ds.
   */
  @ViewChild('menuMetadataDs') menuMetadataDs: DataSourceComponent;

  /**
   * Collezione dati per mega items2, consumata dal rendering e dalle operazioni del componente.
   */
  megaItems2: { label: string; icon: string; items: { label: string; items: { label: string; }[]; }[][]; }[];
  /**
   * Proprieta di stato del componente per observer, usata dalla logica interna e dal template.
   */
  observer: MutationObserver;
  /**
   * Proprieta di stato del componente per target node, usata dalla logica interna e dal template.
   */
  targetNode: Element;
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a config.
   */
  config: MutationObserverInit;
  /**
   * Stream osservabile per auth state$, usato per propagare aggiornamenti reattivi nel componente.
   */
  authState$: Observable<AuthSessionState>;
  /**
   * Stream osservabile che emette `true` quando le traduzioni sono state caricate
   * (da cache localStorage o da backend). Finche' `false`, il form di login viene
   * nascosto e mostriamo uno spinner: altrimenti l'utente vedrebbe la schermata
   * col placeholder grezzo `auth.username` / `auth.password` invece dei label
   * tradotti, che e' un'esperienza confusa.
   */
  translationsLoaded$: Observable<boolean>;
  /**
   * Proprieta di stato del componente per auth return url, usata dalla logica interna e dal template.
   */
  authReturnUrl = window.location.href;
  /**
   * Proprieta di stato del componente per login username, usata dalla logica interna e dal template.
   */
  loginUsername = '';
  /**
   * Proprieta di stato del componente per login password, usata dalla logica interna e dal template.
   */
  loginPassword = '';
  /**
   * Proprieta di stato del componente per post login redirect route, usata dalla logica interna e dal template.
   */
  private postLoginRedirectRoute = '';
  private defaultSiteRoute = '';
  /**
   * Proprieta di stato del componente per meta menu route, usata dalla logica interna e dal template.
   */
  metaMenuRoute = MetadataProviderService.metaMenuRoute || " metadati  menu";
  /**
   * Collezione dati per context items, consumata dal rendering e dalle operazioni del componente.
   */
  contextItems: MenuItem[] = [];
  /**
   * Proprieta di stato del componente per menu admin methods, usata dalla logica interna e dal template.
   */
  menuAdminMethods: Set<string> = new Set<string>();
  /**
   * Identificativo tecnico per dragged menu id, usato in matching, lookup o routing interno.
   */
  draggedMenuId: number | null = null;
  /**
   * Proprieta di stato del componente per move dialog visible, usata dalla logica interna e dal template.
   */
  moveDialogVisible = false;
  /**
   * Proprieta di stato del componente per pending move, usata dalla logica interna e dal template.
   */
  pendingMove: { sourceId: number; targetId: number; targetLabel?: string } | null = null;
  /**
   * Proprieta di stato del componente per drag in progress, usata dalla logica interna e dal template.
   */
  dragInProgress = false;

  captchaEnabled = false;
  captchaSiteKey = '';
  captchaToken = '';
  private captchaWidgetId: number | null = null;

  registrationEnabled = false;
  authView: 'login' | 'register' | 'forgotPassword' | 'resetPassword' = 'login';
  registerUsername = '';
  registerEmail = '';
  registerPassword = '';
  registerMessage = '';
  registerError = '';
  forgotEmail = '';
  forgotMessage = '';
  forgotError = '';
  resetToken = '';
  resetEmail = '';
  resetNewPassword = '';
  resetMessage = '';
  resetError = '';
  userLanguageSwitchEnabled = false;
  userLanguageMenuVisible = false;
  userLanguages: Lingua[] = [];

  /**
   * Inietta i servizi usati dal componente per autenticazione, traduzioni, profilo utente,
   * metadata menu e runtime menu; espone inoltre `authState$` per il binding nel template.
   * @param metaSrv Servizio metadata che carica menu utente e metodi amministrativi.
   * @param authSession Servizio che gestisce sessione auth moderna/legacy e stato corrente.
   * @param trslSrv Servizio traduzioni usato per label fallback/risorse i18n.
   * @param userInfo Servizio helper per verificare i ruoli utente (es. admin).
   * @param workflowRuntimeMenu Stream dei menu runtime da fondere con il menu base.
   */
  constructor(
    private metaSrv: MetadataProviderService,
    private authSession: AuthSessionService,
    private trslSrv: TranslationManagerService,
    private userInfo: UserInfoService,
    private workflowRuntimeMenu: WorkflowRuntimeMenuService,
    private http: HttpClient,
    private ngZone: NgZone,
    private router: Router,
    private licenseFeature: LicenseFeatureService,
    private elementRef: ElementRef
  ) {
    this.authState$ = this.authSession.state$;
    this.translationsLoaded$ = this.trslSrv.translationsLoaded$.asObservable();
  }

  /**
   * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
   */
  ngAfterViewInit(): void {
    this.ensureMenuObserver();
    this.makeMenubarHamburgerCrawlable();
  }

  /**
   * Costruisce un href crawlable per l'item leaf del menubar. La sorgente
   * `item.route` puo' avere o non avere leading `/` (dipende dalla forma
   * con cui e' stata persistita in metadata). Garantiamo un singolo `/`
   * iniziale per evitare path malformati come `//foo/list` (Lighthouse
   * potrebbe accettarli ma e' inutile sporcare l'URL). Ritorna `null` se
   * `route` e' falsy: il template Angular `[href]` con `null` rimuove
   * l'attributo, ma per leaf items con route truthy questo path produce
   * sempre una stringa valida.
   */
  getMenuItemHref(item: any): string | null {
    const route = item?.route;
    if (route === undefined || route === null || route === '') {
      return null;
    }
    const norm = String(route).replace(/^\/+/, '');
    return '/' + norm;
  }

  /**
   * Patch runtime per Lighthouse SEO `crawlable-anchors`: PrimeNG `<p-menubar>`
   * renderizza il menu hamburger mobile come `<a class="p-menubar-button">`
   * SENZA `href` (visibile solo a viewport mobile via `display: none` desktop).
   * Lighthouse flagga questo `<a>` come "Links not crawlable" anche se in
   * pratica e' un button toggle, non un link. Non possiamo modificare PrimeNG
   * (in node_modules) ne' fornire un template custom (`p-menubar` non lo
   * espone). Soluzione: dopo la prima render PrimeNG, settiamo runtime
   * `href="#<aria-controls-target>"` (il `<ul>` del menu, sempre presente
   * con id stabile generato da PrimeNG), che soddisfa l'audit SEO. Il
   * default browser action `<a>` (scroll all'anchor) viene neutralizzato
   * con `preventDefault` aggiuntivo cosi' resta l'unico effetto il
   * `(click)="menuButtonClick()"` PrimeNG che apre/chiude il menu mobile.
   */
  private makeMenubarHamburgerCrawlable(): void {
    // Il `<a class="p-menubar-button">` PrimeNG renderizza in modo async
    // rispetto a `ngAfterViewInit` del meta-menu (la `aria-controls` id
    // viene generata dopo che il menubarSub child si registra). Usiamo
    // un MutationObserver che attende l'apparizione e applica il patch
    // una sola volta. Se gia' presente, fix immediato.
    const tryPatch = (): boolean => {
      const host = this.elementRef?.nativeElement as HTMLElement | undefined;
      if (!host) return false;
      const btn = host.querySelector('a.p-menubar-button') as HTMLAnchorElement | null;
      if (!btn) return false;
      if (btn.getAttribute('href')) return true; // gia' patchato
      const ariaControls = btn.getAttribute('aria-controls');
      const targetId = ariaControls || 'wuic-menu';
      btn.setAttribute('href', '#' + targetId);
      btn.addEventListener('click', (ev) => ev.preventDefault());
      return true;
    };
    if (tryPatch()) return;
    // Observer: osserva mutazioni nel host fino a quando il button appare.
    try {
      const host = this.elementRef?.nativeElement as HTMLElement | undefined;
      if (!host) return;
      const obs = new MutationObserver(() => {
        if (tryPatch()) {
          obs.disconnect();
        }
      });
      obs.observe(host, { childList: true, subtree: true });
      // Timeout safety: stop observing dopo 10s anche se non patched
      setTimeout(() => obs.disconnect(), 10000);
    } catch { /* non bloccare l'init per un fallimento del patch SEO */ }
  }

  /**
   * Returns the current license tier in a normalized form for template bindings:
   *   - 'professional'  → valid license with tier=professional
   *   - 'developer'     → valid license with tier=developer
   *   - 'trial'         → invalid/missing/expired license (graceful fallback UX)
   *   - 'custom'        → valid license with custom tier (rare, shown as "Custom")
   */
  getLicenseTier(): 'professional' | 'developer' | 'custom' | 'trial' {
    const snap = this.licenseFeature.snapshot();
    if (!snap || !snap.licenseValid) return 'trial';
    const tier = (snap.tier ?? '').trim().toLowerCase();
    if (tier === 'professional' || tier === 'developer' || tier === 'custom') return tier;
    return 'trial';
  }

  /** Short label shown inside the header badge. */
  getLicenseBadgeLabel(): string {
    switch (this.getLicenseTier()) {
      case 'professional': return 'Pro';
      case 'developer':    return 'Dev';
      case 'custom':       return 'Custom';
      case 'trial':        return 'Trial';
    }
  }

  /** PrimeIcon class matching the tier. */
  getLicenseIconClass(): string {
    switch (this.getLicenseTier()) {
      case 'professional': return 'pi pi-star-fill';
      case 'developer':    return 'pi pi-wrench';
      case 'custom':       return 'pi pi-cog';
      case 'trial':        return 'pi pi-exclamation-triangle';
    }
  }

  /**
   * Tooltip describing license status + relevant expiry info. Kept as a plain
   * string (no complex template) so it works on the native `title` attribute.
   * Localizzato via `this.t(key, fallbackItaliano)`; chiavi sotto `license.tooltip.*`
   * popolate per it-IT/en-US/es-ES/fr-FR/de-DE da
   * scripts/upsert-wuic-translations.ps1.
   */
  getLicenseTooltip(): string {
    const snap = this.licenseFeature.snapshot();
    if (!snap) return this.t('license.tooltip.loading', 'Licenza: in caricamento...');

    const tier = this.getLicenseTier();
    const lines: string[] = [];

    if (tier === 'trial') {
      lines.push(this.t('license.tooltip.trial_inactive', 'Licenza non attiva (modalita trial)'));
      if (snap.licenseReason) lines.push(this.t('license.tooltip.reason', 'Motivo') + ': ' + snap.licenseReason);
    } else {
      lines.push(this.t('license.tooltip.tier', 'Tier') + ': ' + this.getLicenseBadgeLabel());
      if (snap.licenseEmail) lines.push(this.t('license.tooltip.email', 'Intestatario') + ': ' + snap.licenseEmail);
    }

    if (snap.licenseExpiryUtc) {
      const d = new Date(snap.licenseExpiryUtc);
      if (!isNaN(d.getTime())) lines.push(this.t('license.tooltip.expiry', 'Scadenza') + ': ' + d.toISOString().slice(0, 10));
    }
    if (snap.maintenanceExpiryUtc) {
      const d = new Date(snap.maintenanceExpiryUtc);
      if (!isNaN(d.getTime())) lines.push(this.t('license.tooltip.maintenance', 'Manutenzione') + ': ' + d.toISOString().slice(0, 10));
    }
    if (Array.isArray(snap.features) && snap.features.length > 0) {
      lines.push(this.t('license.tooltip.features', 'Feature') + ': ' + snap.features.join(', '));
    }

    // DBMS line \u2014 mostra dati e metadati DBMS quando definiti e potenzialmente
    // diversi (allowMultipleDBMS). Se identici, una sola voce 'DBMS: mysql'.
    // Se uno dei due e' empty (deploy parziale / firstRun pending) non lo
    // emette per evitare voci tipo 'DBMS: mysql + ' a meta'.
    const dataDbms = (snap.dataDbms ?? '').trim();
    const metaDbms = (snap.metaDbms ?? '').trim();
    if (dataDbms && metaDbms && dataDbms === metaDbms) {
      lines.push(this.t('license.tooltip.dbms', 'DBMS') + ': ' + dataDbms);
    } else if (dataDbms || metaDbms) {
      const parts: string[] = [];
      if (dataDbms) parts.push(this.t('license.tooltip.dbms_data', 'dati') + '=' + dataDbms);
      if (metaDbms) parts.push(this.t('license.tooltip.dbms_meta', 'meta') + '=' + metaDbms);
      lines.push(this.t('license.tooltip.dbms', 'DBMS') + ': ' + parts.join(', '));
    }

    return lines.join(' \u2022 ');
  }

  /**
   * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
   */
  ngOnDestroy(): void {
    this.setDragState(false);
    this.runtimeMenuSub?.unsubscribe();
    this.menuUpdatedSub?.unsubscribe();
    this.authStateSub?.unsubscribe();
    this.observer?.disconnect();
    this.userLanguageMenuVisible = false;
    try {
      if (this.authConfigRefreshHandler) {
        window.removeEventListener('wuic:auth-config-refresh', this.authConfigRefreshHandler);
        this.authConfigRefreshHandler = null;
      }
    } catch {}
  }

  /**
   * Esegue il comando associato alla voce PrimeNG, passando l'evento originale e l'item
   * nel payload atteso da `MenuItem.command`.
   * @param item Voce menu cliccata; se non espone `command` il metodo termina senza effetti.
   * @param event Evento DOM del click, inoltrato come `originalEvent`.
   */
  async onMenuItemClick(item: any, event?: Event) {
    const hasRoute = !!String(item?.route || '').trim();
    if (hasRoute) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      this.closeMenuOverlay();

      const canNavigate = await this.confirmNavigationWithPendingChanges();
      if (!canNavigate) {
        return;
      }

      const route = String(item?.route || '').trim();
      const queryParams = item?.queryParams || undefined;
      const query = queryParams ? new URLSearchParams(queryParams).toString() : '';
      const targetUrl = query ? `${route}?${query}` : route;
      await this.router.navigateByUrl(targetUrl);
      return;
    }

    if (typeof item?.command !== 'function') {
      return;
    }

    this.closeMenuOverlay();
    item.command({
      originalEvent: event,
      item
    });
  }

  private closeMenuOverlay(): void {
    const menuAny = this.menu as any;
    if (menuAny && typeof menuAny.hide === 'function') {
      menuAny.hide();
      return;
    }

    if (typeof document === 'undefined') {
      return;
    }

    const target = document.body || document.documentElement;
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }

  private async confirmNavigationWithPendingChanges(): Promise<boolean> {
    const pendingDatasources = DataSourceComponent.getLiveInstances()
      .filter((ds) => !!ds && typeof ds.hasPendingChanges === 'function' && ds.hasPendingChanges());

    if (!pendingDatasources.length) {
      return true;
    }

    for (const datasource of pendingDatasources) {
      if (typeof datasource.confirmProceedWithPendingChanges === 'function') {
        const canProceed = await datasource.confirmProceedWithPendingChanges('navigate');
        if (!canProceed) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Forza la visibilità del primo submenu quando riceve focus su una voce menubar, evitando
   * che il popup rimanga nascosto in alcune transizioni CSS/DOM del componente PrimeNG.
   * @param $event Evento focus proveniente dall'elemento menu.
   */
  onFocus($event) {
    if ($event.currentTarget) {
      let subMenus = $event.currentTarget.parentElement.parentElement.getElementsByTagName("ul");

      if (subMenus && subMenus.length) {
        let i = setInterval(() => {
          if (subMenus[0].style.display != "none") {
            subMenus[0].style.display = "block";
            clearInterval(i);
          }
        }, 10);
      }
    }

  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  async ngOnInit() {
    let self = this;
    this.bootstrapRedirectLoginFromQuery();
    this.bootstrapResetPasswordFromQuery();
    this.loadAuthConfig();

    // Listener globale per re-caricare AuthConfig on-demand. Usato da
    // app-settings-editor dopo il restart del backend per applicare i nuovi
    // valori (sessionTimeoutMinutes, notifySessionExpirationBefore, ecc.)
    // senza richiedere page reload.
    this.authConfigRefreshHandler = () => { void this.loadAuthConfig(); };
    try { window.addEventListener('wuic:auth-config-refresh', this.authConfigRefreshHandler); } catch {}
    this.runtimeMenuSub = this.workflowRuntimeMenu.runtimeMenus$.subscribe((state) => {
      this.runtimeItems = Array.isArray(state?.items) ? [...state.items] : [];
      this.runtimeMenuExclusive = !!state?.exclusive;
      this.applyMergedMenuItems();
    });
    this.authSession.setReturnUrl(this.authReturnUrl);
    await this.authSession.initialize();
    await this.syncMenuAdminMethods();
    await this.loadMenuIfAllowed();

    // Safety-net: al refresh pagina c'e' una race tra authSession.initialize,
    // UserInfoService population e il primo loadMenuIfAllowed. Se il menu e'
    // rimasto vuoto dopo l'init MA ora auth+user sono OK, rilanciamo un
    // force-refresh. Covera: user_id=0 al primo tick, legacyAuth che arriva
    // dopo init, cache localStorage vuota/stale al boot.
    this.authStateSub?.unsubscribe();
    this.authStateSub = this.authSession.state$.subscribe(async (st) => {
      if (!st) return;
      const authed = (st.enabled && st.authenticated) || (!st.enabled && st.legacyAuthenticated);
      if (!authed) return;
      const uid = self.userInfo?.getuserInfo?.()?.user_id;
      if (!uid || uid <= 0) return;
      if (self.baseItems && self.baseItems.length > 0) return;
      // Menu vuoto + utente autenticato + user_id valido → ricarica.
      try { await self.loadMenuIfAllowed(true); } catch { /* best effort */ }
    });

    this.menuUpdatedSub?.unsubscribe();
    this.menuUpdatedSub = WtoolboxService.menuUpdated.subscribe(async (updated) => {
      if (updated) {
        await this.loadMenuIfAllowed(true);

        self.ensureMenuObserver();
      }
    });
  }

  /**
   * Aggiorna nel servizio auth l'URL di ritorno da usare dopo login/logout.
   */
  onAuthReturnUrlChanged() {
    this.authSession.setReturnUrl(this.authReturnUrl);
  }

  /**
   * Avvia il login OIDC/social demandando al servizio auth il redirect verso provider.
   */
  loginWithGoogle() {
    this.authSession.login(this.authReturnUrl);
  }

  /**
   * Esegue logout in modalità moderna quando abilitata; in modalità legacy invoca `legacyLogout`
   * e forza il redirect alla root applicativa.
   */
  async logout() {
    if (this.authSession.snapshot.enabled) {
      await this.authSession.logout('/');
      return;
    }

    await this.authSession.legacyLogout();
    window.location.href = '/';
  }

  /**
   * Ricarica stato sessione, permessi admin menu e contenuto menu in sequenza.
   */
  async refreshAuthSession() {
    await this.authSession.refreshAll();
    this.authSession.resetSessionTimer();
    await this.syncMenuAdminMethods();
    await this.loadMenuIfAllowed();
  }

  /**
   * Esegue login legacy con username/password. In caso di successo resetta la password,
   * sincronizza permessi/menu e applica l'eventuale redirect richiesto via query/hash.
   */
  async loginLegacy() {
    if (this.captchaEnabled && !this.captchaToken) {
      return;
    }
    const ok = await this.authSession.legacyLogin(this.loginUsername, this.loginPassword, this.captchaToken || undefined);
    if (this.captchaEnabled) {
      this.captchaToken = '';
      this.resetCaptchaWidget();
    }
    if (ok) {
      this.loginPassword = '';
      const redirectRoute = this.postLoginRedirectRoute
        || this.defaultSiteRoute;
      this.postLoginRedirectRoute = '';
      await this.syncMenuAdminMethods();
      await this.loadMenuIfAllowed();

      if (redirectRoute) {
        globalThis.location.href = redirectRoute;
      }
    }
  }

  /**
   * Re-carica la AuthConfig dal backend. Chiamato in `ngOnInit` al boot e
   * (via global event `wuic:auth-config-refresh`) dopo il restart del
   * backend per applicare immediatamente nuovi `sessionTimeoutMinutes`,
   * `notifySessionExpirationBefore`, `enableUserLanguageSwitch` e altri
   * setting hot-reload-relevant senza richiedere page reload.
   *
   * Esposto come `public` cosi' altri componenti (es. app-settings-editor
   * post-save) possono triggerarlo direttamente quando hanno il riferimento
   * al meta-menu, oppure dispatcciare l'evento globale.
   */
  public async loadAuthConfig() {
    try {
      const apiUrl = WtoolboxService.appSettings?.api_url || `${globalThis.location.origin}/api/`;
      const cfg = await firstValueFrom(this.http.get<any>(`${apiUrl}Meta/AuthConfig`));
      if (cfg?.captchaEnabled && cfg?.captchaSiteKey) {
        this.captchaEnabled = true;
        this.captchaSiteKey = cfg.captchaSiteKey;
        this.loadRecaptchaScript();
      }
      this.registrationEnabled = !!cfg?.registrationEnabled;
      if (cfg?.defaultSiteRoute) {
        this.defaultSiteRoute = cfg.defaultSiteRoute;
      }
      if (cfg?.sessionTimeoutMinutes) {
        this.authSession.setSessionTimeout(cfg.sessionTimeoutMinutes, cfg.notifySessionExpirationBefore);
      }
      const runtimeFlag = cfg?.enableUserLanguageSwitch ?? cfg?.userLanguageSwitchEnabled;
      const appSettingsFlag = WtoolboxService.appSettings?.enableUserLanguageSwitch;
      this.userLanguageSwitchEnabled = !!(runtimeFlag ?? appSettingsFlag);
      if (this.userLanguageSwitchEnabled) {
        this.userLanguages = this.trslSrv.getLingue();
      }
      // Propaga il flag `recordTranslationsEnabled` a WtoolboxService.appSettings
      // cosi' il resto del framework (meta-menu al cambio lingua, datasource
      // componenti che vogliono sapere se fare join con la tabella traduzioni
      // record) lo legge centralmente senza ri-chiamare AuthConfig.
      WtoolboxService.appSettings = {
        ...(WtoolboxService.appSettings || {}),
        recordTranslationsEnabled: !!cfg?.recordTranslationsEnabled
      };
    } catch { }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.userLanguageMenuVisible = false;
  }

  toggleUserLanguageMenu(event?: Event): void {
    if (!this.userLanguageSwitchEnabled) {
      return;
    }

    event?.preventDefault?.();
    event?.stopPropagation?.();
    this.userLanguageMenuVisible = !this.userLanguageMenuVisible;
    if (this.userLanguageMenuVisible) {
      this.userLanguages = this.trslSrv.getLingue();
    }
  }

  isCurrentUserLanguage(langId: string): boolean {
    const userLang = this.getCurrentUserLanguageId();
    return String(userLang || '').toLowerCase() === String(langId || '').toLowerCase();
  }

  getCurrentUserLanguageId(): string {
    // Prima la lingua effettivamente attiva in ngxTranslate (riflette
    // override localStorage + cambi runtime via useLanguage()). Senza
    // questa preferenza, dopo refresh con override 'en-US' la bandiera
    // mostrava ancora la lingua DB user (es. it-IT) perche' leggevamo
    // solo da userInfo.
    const fromTranslate = this.trslSrv.getCurrentLang();
    if (fromTranslate) return fromTranslate;
    return this.userInfo.getuserInfo()?.lingua?.id || this.userInfo.getuserInfo()?.language || 'it-IT';
  }

  getCurrentUserLanguageFlagSrc(): string {
    return this.getLanguageFlagSrc(this.getCurrentUserLanguageId());
  }

  getLanguageFlagSrc(langId: string): string {
    const normalized = this.normalizeLanguageId(langId);
    return `/assets/icons/flags/${normalized}.svg`;
  }

  onLanguageFlagLoadError(event: Event): void {
    const target = event?.target as HTMLImageElement | null;
    if (!target) {
      return;
    }

    if (target.dataset['flagFallbackLoaded'] === '1') {
      return;
    }

    target.dataset['flagFallbackLoaded'] = '1';
    target.src = '/assets/icons/flags/default.svg';
  }

  async onSelectUserLanguage(langId: string, event?: Event): Promise<void> {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (!this.userLanguageSwitchEnabled) {
      return;
    }

    const requested = String(langId || '').trim();
    if (!requested) {
      return;
    }

    const currentLang = this.getCurrentUserLanguageId();
    if (String(currentLang).toLowerCase() === requested.toLowerCase()) {
      this.userLanguageMenuVisible = false;
      return;
    }

    // persist:true → la scelta viene salvata in localStorage e sopravvive al
    // refresh/riapertura tab. La chiamata di sync user-language al boot
    // (auth-session.service:applyUserLanguageToTranslations) usa il default
    // `persist:false` per non sovrascrivere un override gia' salvato.
    const normalizedLanguage = await this.trslSrv.useLanguage(requested, true);
    this.userInfo.setUserLanguage(normalizedLanguage);
    WtoolboxService.appSettings = { ...(WtoolboxService.appSettings || {}), locale: normalizedLanguage };
    this.userLanguageMenuVisible = false;

    await this.persistCurrentUserLanguage(normalizedLanguage);
    // Refresh condizionale dei datasource al cambio lingua. Due fonti decidono:
    //  - Flag GLOBALE `RecordTranslations.Enabled` in appsettings (propagato
    //    via AuthConfig → `WtoolboxService.appSettings.recordTranslationsEnabled`).
    //  - Override PER-ROUTE in `tableMetadata.md_props_bag.serverProperties.
    //    RecordTranslations.Enabled` del datasource della route corrente.
    // Se uno dei due e' true → refresh del solo datasource della route
    // corrente. Se entrambi false → skip refresh (nessun dato cambia al
    // variare della lingua, le label vengono dalla pipe `translate` che si
    // aggiorna autonomamente da `_wuic_translations`).
    // Il gate finale sta dentro `refreshDatasourceForLanguageChange()` che
    // ispeziona entrambe le fonti per ogni DS candidato.
    await this.refreshDatasourceForLanguageChange();
  }

  private normalizeLanguageId(langId: string): string {
    const raw = String(langId || '').trim();
    if (!raw) {
      return 'default';
    }

    return raw.replace('_', '-');
  }

  private async persistCurrentUserLanguage(languageId: string): Promise<void> {
    try {
      const apiUrl = WtoolboxService.appSettings?.global_root_url || `${globalThis.location.origin}/api/Meta/AsmxProxy/`;
      await firstValueFrom(this.http.post<any>(`${apiUrl}MetaService.setCurrentUserLanguage`, { language: languageId }));
    } catch {
      // cookie update is enough for immediate UI/runtime behavior
    }
  }

  private async refreshDatasourceForLanguageChange(): Promise<void> {
    const live = DataSourceComponent.getLiveInstances();
    if (!live.length) {
      return;
    }

    // Filtra al/ai datasource della route correntemente visualizzata — esclusi
    // i DS metadata interni (stili, autorizzazioni, ecc.) che non variano per
    // lingua. Prima (2026-04-24) il loop girava su tutti i live → refreshava
    // ~15-20 tabelle a ogni cambio lingua. Ora: solo la route corrente.
    const currentRoute = this.resolveCurrentRouteFromUrl();
    const targets = currentRoute
      ? live.filter(ds => {
          const dsRoute = String(ds?.route?.value || ds?.hardcodedRoute || '').trim().toLowerCase();
          return dsRoute && dsRoute === currentRoute;
        })
      : [];

    if (!targets.length) {
      return;
    }

    // Gate record-translations: refreshamo il DS SOLO se il backend
    // effettivamente rende risultati lingua-dipendenti. Due fonti, OR logico:
    //  (1) `md_props_bag.serverProperties.RecordTranslations.Enabled` del DS
    //      (override per-route) — ha precedenza e puo' anche DISABILITARE
    //      quando il global e' true (raro ma supportato dal server-side
    //      resolution chain documentata in translations-data).
    //  (2) Flag globale `WtoolboxService.appSettings.recordTranslationsEnabled`
    //      (propagato al bootstrap via AuthConfig).
    // Il controllo e' per-DS perche' nulla impedisce che la stessa pagina
    // abbia piu' DS con policy diverse (es. main list + nested dettaglio).
    const globalEnabled = !!WtoolboxService.appSettings?.recordTranslationsEnabled;
    const needsRefresh = (ds: any): boolean => {
      const bag = ds?.metaInfo?.tableMetadata?.md_props_bag;
      let rawBag: any = bag;
      if (typeof rawBag === 'string') {
        try { rawBag = JSON.parse(rawBag); } catch { rawBag = null; }
      }
      const perRoute = rawBag?.serverProperties?.RecordTranslations?.Enabled
        ?? rawBag?.serverProperties?.recordTranslations?.enabled;
      // Override per-route: se esplicitamente settato (true o false) vince sul globale.
      if (typeof perRoute === 'boolean') return perRoute;
      // Altrimenti fallback al globale.
      return globalEnabled;
    };

    const toRefresh = targets.filter(needsRefresh);
    if (!toRefresh.length) {
      return;
    }

    await Promise.allSettled(toRefresh.map(async (ds) => {
      if (!ds || typeof ds.getSchemaAndData !== 'function') {
        return;
      }
      try {
        await ds.getSchemaAndData(false);
      } catch {
        // non blocchiamo il cambio lingua per singoli datasource non ricaricabili
      }
    }));
  }

  /**
   * Estrae il nome route dalla URL corrente. Format Angular hash-based:
   * `#/<route>/<action>[?query]` → ritorna `<route>` lowercase.
   * Ritorna stringa vuota se non decodificabile (landing page, ecc.).
   */
  private resolveCurrentRouteFromUrl(): string {
    const url = String(this.router?.url || '').trim();
    if (!url) return '';
    // router.url e' gia' senza la parte prima di '#/' (Angular hash router).
    // Esempio: '/cities/list?pageInfo=...'
    const pathOnly = url.split('?')[0].split('#')[0];
    const segments = pathOnly.split('/').filter(s => !!s);
    if (!segments.length) return '';
    return segments[0].toLowerCase();
  }

  private loadRecaptchaScript() {
    if (document.getElementById('recaptcha-script')) return;
    const script = document.createElement('script');
    script.id = 'recaptcha-script';
    script.src = 'https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoaded&render=explicit';
    script.async = true;
    script.defer = true;
    (globalThis as any).onRecaptchaLoaded = () => this.tryRenderCaptchaWidget();
    document.head.appendChild(script);
  }

  private tryRenderCaptchaWidget() {
    const container = document.getElementById('wuic-captcha-container');
    if (!container || !(globalThis as any).grecaptcha) {
      setTimeout(() => this.tryRenderCaptchaWidget(), 200);
      return;
    }
    if (this.captchaWidgetId !== null) return;
    this.captchaWidgetId = (globalThis as any).grecaptcha.render(container, {
      sitekey: this.captchaSiteKey,
      callback: (token: string) => { this.ngZone.run(() => this.captchaToken = token); },
      'expired-callback': () => { this.ngZone.run(() => this.captchaToken = ''); }
    });
  }

  private resetCaptchaWidget() {
    if (this.captchaWidgetId !== null && (globalThis as any).grecaptcha) {
      (globalThis as any).grecaptcha.reset(this.captchaWidgetId);
    }
  }

  private bootstrapResetPasswordFromQuery() {
    const token = this.getParamFromUrl('token');
    const email = this.getParamFromUrl('email');
    if (token && email) {
      this.authView = 'resetPassword';
      this.resetToken = token;
      this.resetEmail = decodeURIComponent(email);
    }
  }

  switchAuthView(view: 'login' | 'register' | 'forgotPassword') {
    this.authView = view;
    this.registerMessage = '';
    this.registerError = '';
    this.forgotMessage = '';
    this.forgotError = '';
    this.captchaToken = '';
    this.resetCaptchaWidget();
  }

  async submitRegistration() {
    this.registerMessage = '';
    this.registerError = '';
    if (!this.registerUsername || !this.registerEmail || !this.registerPassword) return;
    if (this.captchaEnabled && !this.captchaToken) return;

    try {
      const apiUrl = WtoolboxService.appSettings?.global_root_url || `${globalThis.location.origin}/api/Meta/AsmxProxy/`;
      const payload: any = {
        username: this.registerUsername,
        email: this.registerEmail,
        password: this.registerPassword,
        captchaToken: this.captchaToken || null
      };
      const raw = await firstValueFrom(this.http.post<any>(`${apiUrl}MetaService.register`, payload));
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw?.d ? (typeof raw.d === 'string' ? JSON.parse(raw.d) : raw.d) : raw);
      this.registerMessage = parsed?.message || this.t('auth.register.success', 'Registrazione completata');
      this.registerUsername = '';
      this.registerEmail = '';
      this.registerPassword = '';
    } catch (error: any) {
      this.registerError = error?.error?.rootMessage || error?.error?.message || error?.message || this.t('auth.register.error', 'Errore durante la registrazione');
    }
    if (this.captchaEnabled) {
      this.captchaToken = '';
      this.resetCaptchaWidget();
    }
  }

  async submitForgotPassword() {
    this.forgotMessage = '';
    this.forgotError = '';
    if (!this.forgotEmail) return;

    try {
      const apiUrl = WtoolboxService.appSettings?.global_root_url || `${globalThis.location.origin}/api/Meta/AsmxProxy/`;
      const raw = await firstValueFrom(this.http.post<any>(`${apiUrl}MetaService.requestPasswordReset`, { email: this.forgotEmail }));
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw?.d ? (typeof raw.d === 'string' ? JSON.parse(raw.d) : raw.d) : raw);
      this.forgotMessage = parsed?.message || this.t('auth.forgot.success', "Se l'email esiste, riceverai un link per il reset");
    } catch (error: any) {
      this.forgotError = error?.error?.rootMessage || error?.error?.message || error?.message || this.t('auth.forgot.error', 'Errore durante la richiesta');
    }
  }

  async submitResetPassword() {
    this.resetMessage = '';
    this.resetError = '';
    if (!this.resetNewPassword || !this.resetToken || !this.resetEmail) return;

    try {
      const apiUrl = WtoolboxService.appSettings?.global_root_url || `${globalThis.location.origin}/api/Meta/AsmxProxy/`;
      const raw = await firstValueFrom(this.http.post<any>(`${apiUrl}MetaService.resetPassword`, {
        email: this.resetEmail,
        token: this.resetToken,
        newPassword: this.resetNewPassword
      }));
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw?.d ? (typeof raw.d === 'string' ? JSON.parse(raw.d) : raw.d) : raw);
      this.resetMessage = parsed?.message || this.t('auth.reset.success', 'Password reimpostata con successo');
      this.resetNewPassword = '';
    } catch (error: any) {
      this.resetError = error?.error?.rootMessage || error?.error?.message || error?.message || this.t('auth.reset.error', 'Errore durante il reset');
    }
  }

  /**
   * Legge parametri `redirect` e `firstRunLogin` da URL (query o hash-query), normalizza
   * la route locale e precompila credenziali admin di primo avvio quando richiesto.
   */
  private bootstrapRedirectLoginFromQuery() {
    const redirectRoute = this.normalizeLocalRoute(this.getParamFromUrl('redirect'));
    if (!redirectRoute) {
      return;
    }

    this.postLoginRedirectRoute = redirectRoute;
    this.authReturnUrl = redirectRoute;

    const firstRunLogin = this.toBoolean(this.getParamFromUrl('firstRunLogin'));
    if (firstRunLogin) {
      const firstRunAdmin = this.getFirstRunAdminCredential();
      this.loginUsername = firstRunAdmin.username;
      this.loginPassword = firstRunAdmin.password;
    }
  }

  /**
   * Recupera un parametro URL prima da `location.search`, poi (fallback) dalla query contenuta
   * nell'hash routing (`#/route?...`).
   * @param paramName Nome parametro da leggere.
   * @returns Valore del parametro oppure stringa vuota se non presente.
   */
  private getParamFromUrl(paramName: string): string {
    const searchParams = new URLSearchParams(globalThis.location.search || '');
    const fromSearch = searchParams.get(paramName);
    if (fromSearch && fromSearch.trim().length > 0) {
      return fromSearch;
    }

    const hash = String(globalThis.location.hash || '');
    const queryIndex = hash.indexOf('?');
    if (queryIndex < 0) {
      return '';
    }

    const hashQuery = hash.substring(queryIndex + 1);
    const hashParams = new URLSearchParams(hashQuery);
    return hashParams.get(paramName) || '';
  }

  /**
   * Converte un valore testuale/etereo in booleano accettando varianti comuni di vero.
   * @param value Valore da normalizzare (`1`, `true`, `yes`, `si`).
   * @returns `true` se il valore rappresenta vero, altrimenti `false`.
   */
  private toBoolean(value: any): boolean {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'si';
  }

  /**
   * Normalizza una route di redirect accettando path locali assoluti o URL same-origin.
   * Scarta URL esterni per evitare redirect fuori dominio.
   * @param rawRoute Route/URL grezzo letto da query/hash.
   * @returns Route locale normalizzata (`/path?...`) o stringa vuota se non valida.
   */
  private normalizeLocalRoute(rawRoute: string | null): string {
    const trimmed = String(rawRoute || '').trim();
    if (!trimmed) {
      return '';
    }

    if (trimmed.startsWith('/')) {
      return trimmed;
    }

    try {
      const parsed = new URL(trimmed, globalThis.location.origin);
      if (parsed.origin !== globalThis.location.origin) {
        return '';
      }

      return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
    } catch {
      return '';
    }
  }

  /**
   * Restituisce le credenziali admin di bootstrap usate nel flusso `firstRunLogin`.
   * @returns Oggetto credenziali con username/password uguali ad `admin`.
   */
  private getFirstRunAdminCredential(): { username: string; password: string } {
    const admin = String.fromCodePoint(97, 100, 109, 105, 110);
    return { username: admin, password: admin };
  }

  /**
   * Determina se il menu deve rimanere nascosto perché è richiesta autenticazione.
   * In modalità moderna: `enabled && !authenticated`; in legacy: `!enabled && !legacyAuthenticated`.
   * @param state Snapshot corrente della sessione auth.
   * @returns `true` quando l'utente non è autenticato per la modalità attiva.
   */
  requiresAuthentication(state: AuthSessionState) {
    return (state.enabled && !state.authenticated) || (!state.enabled && !state.legacyAuthenticated);
  }

  /**
   * Decide se mostrare la barra di autenticazione.
   * È visibile sempre con auth moderna abilitata, oppure in legacy finché non autenticato.
   * @param state Snapshot corrente della sessione auth.
   * @returns `true` quando la barra auth deve essere visualizzata.
   */
  showAuthBar(state: AuthSessionState) {
    return state.enabled || !state.legacyAuthenticated;
  }

  /**
   * Verifica se l'utente della sessione corrente ha ruolo amministratore.
   * @param auth Stato auth opzionale da passare al controllo ruolo.
   * @returns `true` se l'utente è admin.
   */
  isAdminRole(auth?: any) {
    return this.userInfo.isAuthAdmin(auth);
  }

  /**
   * Abilita il menu contestuale solo per admin, su voci con `mm_id` e quando sono
   * disponibili metodi server di amministrazione menu.
   * @param auth Stato auth corrente.
   * @param item Voce menu target.
   * @returns `true` se il context menu può essere aperto.
   */
  canOpenMenuContext(auth: AuthSessionState, item: any) {
    return this.isAdminRole(auth) && !!item?.mm_id && this.menuAdminMethods.size > 0;
  }

  /**
   * Verifica se è consentito il drag&drop della voce: utente admin, voce valida e
   * disponibilità di almeno uno tra `reorderMenu` o `nestMenu`.
   * @param auth Stato auth corrente.
   * @param item Voce menu target.
   * @returns `true` se il drag è permesso.
   */
  canDragMenu(auth: AuthSessionState, item: any) {
    const canReorder = this.hasMenuAdminMethod('reorderMenu');
    const canNest = this.hasMenuAdminMethod('nestMenu');
    return this.isAdminRole(auth) && !!item?.mm_id && (canReorder || canNest);
  }

  /**
   * Intercetta il click destro su voce menu, costruisce le azioni contestuali disponibili
   * per quella voce e apre il context menu PrimeNG.
   * @param event Evento mouse di apertura context menu.
   * @param item Voce menu selezionata.
   * @param auth Stato auth corrente.
   * @param contextMenu Istanza context menu PrimeNG usata per la visualizzazione.
   */
  onMenuContext(event: MouseEvent, item: any, auth: AuthSessionState, contextMenu: any) {
    if (!this.canOpenMenuContext(auth, item)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.contextItems = this.buildContextItems(item);
    if (!this.contextItems.length) {
      return;
    }

    contextMenu.show(event);
  }

  /**
   * Avvia il drag della voce menu salvando l'id sorgente e impostando il payload
   * `application/x-wuic-menu-id` per il drop handler.
   * @param event Evento dragstart.
   * @param item Voce menu trascinata.
   * @param auth Stato auth corrente.
   */
  onMenuDragStart(event: DragEvent, item: any, auth: AuthSessionState) {
    if (!this.canDragMenu(auth, item)) {
      return;
    }

    event.stopPropagation();
    this.draggedMenuId = Number(item.mm_id);
    this.setDragState(true);
    if (event.dataTransfer) {
      // Prevent browser default link-drag payload (e.g. text/uri-list), which may open side panels.
      event.dataTransfer.clearData();
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-wuic-menu-id', this.draggedMenuId.toString());
      event.dataTransfer.setData('text/plain', this.draggedMenuId.toString());
    }
  }

  /**
   * Abilita il drop su una voce menu impostando `dropEffect = move`.
   * @param event Evento dragover.
   * @param item Voce menu target.
   * @param auth Stato auth corrente.
   */
  onMenuDragOver(event: DragEvent, item: any, auth: AuthSessionState) {
    if (!this.canDragMenu(auth, item)) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  /**
   * Chiude lo stato di drag ripulendo id sorgente e classe CSS globale di trascinamento.
   */
  onMenuDragEnd() {
    this.draggedMenuId = null;
    this.setDragState(false);
  }

  /**
   * Gestisce il drop: ricava source/target id, valida i casi non ammessi (self/drop su discendente)
   * e apre il dialog di conferma per scegliere la modalità di spostamento.
   * @param event Evento drop.
   * @param item Voce menu destinazione.
   * @param auth Stato auth corrente.
   */
  async onMenuDrop(event: DragEvent, item: any, auth: AuthSessionState) {
    if (!this.canDragMenu(auth, item)) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    const sourceId = this.draggedMenuId
      || Number(event.dataTransfer?.getData('application/x-wuic-menu-id'))
      || Number(event.dataTransfer?.getData('text/plain'));
    this.draggedMenuId = null;
    this.setDragState(false);

    const targetId = Number(item?.mm_id);
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }

    if (this.isDescendant(sourceId, targetId)) {
      WtoolboxService.messageNotificationService.add({
        severity: 'warn',
        summary: this.t('warning', 'Warning'),
        detail: this.t('menu.move.invalid_descendant', 'Operazione non valida: non puoi spostare una voce dentro un suo discendente.')
      });
      return;
    }

    this.pendingMove = { sourceId, targetId, targetLabel: item?.label };
    this.moveDialogVisible = true;
  }

  /**
   * Carica il menu utente solo se l'utente risulta autenticato per la modalità attiva;
   * altrimenti svuota il menu locale e interrompe il flusso.
   */
  private async loadMenuIfAllowed(forceRefresh: boolean = false) {
    const state = this.authSession.snapshot as AuthSessionState;
    const mustHideMenu = this.requiresAuthentication(state);

    if (mustHideMenu) {
      this.baseItems = [];
      this.items = [];
      return;
    }

    const loaded = await this.metaSrv.getMenuByUserID(forceRefresh);
    // Attendi che LicenseFeatureService abbia lo snapshot: se chiamiamo
    // filterMenuByLicenseFeatures prima del primo load, tutte le voci gated
    // vengono escluse anche con licenza valida → menu monco al refresh.
    await this.licenseFeature.ready();
    this.baseItems = this.filterMenuByLicenseFeatures(loaded);
    this.applyMergedMenuItems();
    setTimeout(() => this.ensureMenuObserver());
  }

  /**
   * Removes menu entries pointing to routes that require a license feature not
   * included in the current license. Works recursively on nested items. The
   * `route` shape of menu items comes from `mm_uri_menu` and matches the
   * Angular route templates (e.g. `workflow-designer`, `<route>/spreadsheet`,
   * `<route>/pivot-builder`, `<route>/dashboard`, `rag-chatbot`).
   *
   * UX layer only — server-side `SanitizeBoardContent` + `[RequireFeature]`
   * are the authoritative gates.
   */
  private filterMenuByLicenseFeatures(items: MenuItem[]): MenuItem[] {
    if (!Array.isArray(items) || items.length === 0) return items ?? [];

    const self = this;
    const isRouteAllowed = (route: string | undefined): boolean => {
      if (!route) return true;
      const normalized = route.replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
      if (!normalized) return true;

      // Exact-match dedicated routes → mapped to features directly.
      const dedicatedMap: Record<string, string> = {
        'workflow-designer': 'workflow-designer',
        'designer': 'dashboard-designer',
        'rag-chatbot': 'rag-chatbot',
        'pivot-builder': 'pivot-grid',
      };
      if (dedicatedMap[normalized] !== undefined) {
        return self.licenseFeature.has(dedicatedMap[normalized]);
      }

      // `<route>/<archetype>` patterns.
      const parts = normalized.split('/');
      if (parts.length >= 2) {
        const archetype = parts[1];
        // Route-suffix based features (report-designer, dashboard, pivot-builder):
        const suffixMap: Record<string, string> = {
          'report-designer': 'report-designer',
          'dashboard': 'dashboard-designer',
          'pivot-builder': 'pivot-grid',
        };
        if (suffixMap[archetype] !== undefined) {
          return self.licenseFeature.has(suffixMap[archetype]);
        }
        // Archetype-only (spreadsheet, pivot-grid, etc.)
        return self.licenseFeature.isArchetypeAllowed(archetype);
      }

      return true;
    };

    const recurse = (list: MenuItem[]): MenuItem[] => {
      const out: MenuItem[] = [];
      for (const item of list ?? []) {
        const route = (item as unknown as { route?: string }).route;
        if (!isRouteAllowed(route)) continue;

        const children = (item as MenuItem).items as MenuItem[] | undefined;
        if (Array.isArray(children) && children.length > 0) {
          const filteredChildren = recurse(children);
          // Hide empty parent branches (no children left AND no own route).
          if (filteredChildren.length === 0 && !route) continue;
          out.push({ ...(item as MenuItem), items: filteredChildren });
        } else {
          out.push(item);
        }
      }
      return out;
    };

    return recurse(items);
  }

  /**
   * Ricompone `items` unendo menu base e runtime; quando `runtimeMenuExclusive` è attivo
   * mostra solo le voci runtime.
   */
  private applyMergedMenuItems(): void {
    const merged = this.runtimeMenuExclusive
      ? [...(this.runtimeItems || [])]
      : [
        ...(this.baseItems || []),
        ...(this.runtimeItems || [])
      ];
    this.items = this.decorateMenuItemsWithCrawlableUrl(merged);
  }

  /**
   * Popola `url` ricorsivamente sulle MenuItem che hanno `route` valorizzata.
   * PrimeNG usa `url` per emettere `<a href="...">`; senza url emette `<a>`
   * vuoto, che Lighthouse flagga come "Links are not crawlable" (SEO audit).
   *
   * Comportamento click invariato: `onMenuItemClick` continua a fare
   * `preventDefault()` sull'evento e a navigare via `router.navigateByUrl`
   * per preservare il guard `confirmNavigationWithPendingChanges`. L'`href`
   * serve SOLO per il crawling statico + accessibilita' (tasto destro ->
   * "Apri in nuova scheda", screen reader, ecc.).
   *
   * Le voci senza `route` (separator, voci comando puro, lingua, logout)
   * restano intatte.
   */
  private decorateMenuItemsWithCrawlableUrl(items: MenuItem[]): MenuItem[] {
    if (!Array.isArray(items) || items.length === 0) return items ?? [];
    return items.map((item) => {
      const route = (item as unknown as { route?: string })?.route;
      const children = (item as MenuItem).items as MenuItem[] | undefined;
      const decoratedChildren = Array.isArray(children) && children.length > 0
        ? this.decorateMenuItemsWithCrawlableUrl(children)
        : children;
      const normalizedRoute = typeof route === 'string' ? route.trim().replace(/^#?\/*/, '') : '';
      const url = normalizedRoute ? `#/${normalizedRoute}` : (item as MenuItem).url;
      return {
        ...(item as MenuItem),
        ...(url !== (item as MenuItem).url ? { url } : {}),
        ...(decoratedChildren !== children ? { items: decoratedChildren } : {})
      } as MenuItem;
    });
  }

  /**
   * Sincronizza i metodi admin disponibili per il menu (`addMenu`, `removeMenu`, `reorderMenu`, `nestMenu`).
   * Se l'utente non è admin o la chiamata fallisce, azzera permessi e context menu.
   */
  private async syncMenuAdminMethods() {
    const state = this.authSession.snapshot as AuthSessionState;
    if (!this.isAdminRole(state)) {
      this.menuAdminMethods.clear();
      this.contextItems = [];
      return;
    }

    try {
      const methods = await this.metaSrv.getMenuAdminMethods();
      this.menuAdminMethods = new Set((methods || []).map(x => (x || '').toString()));
    } catch {
      this.menuAdminMethods.clear();
      this.contextItems = [];
    }
  }

  /**
   * Verifica la presenza di un metodo amministrativo nel set locale sincronizzato dal server.
   * @param methodName Nome metodo admin da verificare.
   * @returns `true` se il metodo è disponibile.
   */
  hasMenuAdminMethod(methodName: string) {
    return this.menuAdminMethods.has(methodName);
  }

  /**
   * Costruisce le voci del menu contestuale per la voce selezionata.
   * Inserisce sempre "Apri metadata voce", aggiunge il gruppo "Aggiungi voce"
   * (prima/dentro/dopo) solo se e disponibile `addMenu`, e aggiunge "Rimuovi voce"
   * solo se e disponibile `removeMenu`.
   * @param item Voce menu su cui applicare le azioni contestuali.
   * @returns Elenco `MenuItem[]` mostrato dal context menu.
   */
  private buildContextItems(item: any): MenuItem[] {
    const result: MenuItem[] = [];

    result.push({
      label: this.t('menu.context.open_metadata', 'Apri metadata voce'),
      icon: 'pi pi-pencil',
      command: () => this.openMenuMetadata(item)
    });

    if (this.hasMenuAdminMethod('addMenu')) {
      result.push({
        label: this.t('menu.context.add_item', 'Aggiungi voce'),
        icon: 'pi pi-plus',
        items: [
          {
            label: this.t('menu.context.insert_before', 'Inserisci prima'),
            icon: 'pi pi-arrow-up',
            command: () => this.addMenuEntry(item, 'before')
          },
          {
            label: this.t('menu.context.insert_inside', 'Inserisci dentro'),
            icon: 'pi pi-arrow-right',
            command: () => this.addMenuEntry(item, 'inside')
          },
          {
            label: this.t('menu.context.insert_after', 'Inserisci dopo'),
            icon: 'pi pi-arrow-down',
            command: () => this.addMenuEntry(item, 'after')
          }
        ]
      });
    }

    if (this.hasMenuAdminMethod('removeMenu')) {
      result.push({
        label: this.t('menu.context.remove_item', 'Rimuovi voce'),
        icon: 'pi pi-trash',
        command: () => this.removeMenuEntry(item)
      });
    }

    return result;
  }

  /**
   * Apre l'editor metadata della voce menu: filtra datasource su `mm_id`, carica record corrente
   * e mostra `EditFormComponent` in dialog; alla chiusura positiva notifica refresh menu.
   * @param item Voce menu di cui aprire i metadati.
   */
  private async openMenuMetadata(item: any) {
    if (!item?.mm_id) {
      return;
    }

    if (!this.menuMetadataDs) {
      return;
    }

    this.menuMetadataDs.filterInfo = {
      logic: 'AND',
      filters: [{ field: 'mm_id', value: item.mm_id.toString(), operatore: 'eq' }]
    };

    const payload = await this.menuMetadataDs.fetchData();
    let record = payload?.resultInfo?.current;

    if (!record && payload?.resultInfo?.dato?.length) {
      record = payload.resultInfo.dato[0];
    }

    if (!record) {
      return;
    }

    const model = this.menuMetadataDs.getModelFromObservable(record);
    this.menuMetadataDs.setCurrent(model);

    const ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data: {
        datasource: new BehaviorSubject<DataSourceComponent>(this.menuMetadataDs),
        isEditForm: true
      },
      header: `${this.trslSrv.instant('edit')} ${this.trslSrv.instant('metadata')}: ${item.label || item.mm_id}`,
      styleClass: 'edit-form-content',
      position: 'center',
      closable: true
    });

    ref.onClose.subscribe((result) => {
      if (result) {
        WtoolboxService.menuUpdated.next(true);
      }
    });
  }

  /**
   * Trova il nodo target nel tree menu e restituisce il suo contesto strutturale:
   * id del parent e lista ordinata degli id fratelli nel contenitore corrente.
   * @param targetId Id del nodo target.
   * @returns Contesto `{ parentId, siblingIds }` o `null` se il nodo non esiste.
   */
  private getNodeContext(targetId: number): { parentId: number | null; siblingIds: number[] } | null {
    const visit = (nodes: any[], parent?: any): { parentId: number | null; siblingIds: number[] } | null => {
      if (!nodes?.length) {
        return null;
      }

      for (const node of nodes) {
        if (Number(node?.mm_id) === Number(targetId)) {
          const siblings = parent?.items || this.items;
          const parentId = parent?.mm_id != null ? Number(parent.mm_id) : null;
          return {
            parentId: Number.isFinite(parentId as number) ? parentId : null,
            siblingIds: (siblings || [])
              .map((x: any) => Number(x?.mm_id))
              .filter((x: number) => Number.isFinite(x))
          };
        }

        const nested = visit(node.items || [], node);
        if (nested) {
          return nested;
        }
      }

      return null;
    };

    return visit(this.items as any[]);
  }

  /**
   * Verifica se `targetId` appartiene al sottoalbero del nodo `sourceId`.
   * Usato per impedire spostamenti ciclici (un nodo dentro un proprio discendente).
   * @param sourceId Id nodo sorgente.
   * @param targetId Id nodo destinazione.
   * @returns `true` se il target è discendente della sorgente.
   */
  private isDescendant(sourceId: number, targetId: number): boolean {
    const findNode = (nodes: any[], id: number): any | null => {
      for (const node of nodes || []) {
        if (Number(node?.mm_id) === id) {
          return node;
        }

        const nested = findNode(node.items || [], id);
        if (nested) {
          return nested;
        }
      }

      return null;
    };

    const sourceNode = findNode(this.items as any[], sourceId);
    if (!sourceNode) {
      return false;
    }

    const hasDescendant = (node: any, id: number): boolean => {
      for (const child of node?.items || []) {
        if (Number(child?.mm_id) === id) {
          return true;
        }

        if (hasDescendant(child, id)) {
          return true;
        }
      }

      return false;
    };

    return hasDescendant(sourceNode, targetId);
  }

  /**
   * Annulla uno spostamento pendente chiudendo il dialog e ripristinando stato drag.
   */
  cancelPendingMove() {
    this.moveDialogVisible = false;
    this.pendingMove = null;
    this.setDragState(false);
  }

  /**
   * Conferma lo spostamento pendente e invoca l'API corretta:
   * `nestMenu` per `inside`, `reorderMenu` per `before/after` con contesto fratelli.
   * @param action Modalità di posizionamento rispetto al target.
   */
  async executePendingMove(action: 'before' | 'after' | 'inside') {
    if (!this.pendingMove) {
      this.cancelPendingMove();
      return;
    }

    const { sourceId, targetId } = this.pendingMove;

    if (action === 'inside') {
      if (!this.hasMenuAdminMethod('nestMenu')) {
        this.cancelPendingMove();
        return;
      }

      await this.metaSrv.nestMenu(sourceId, targetId);
      this.cancelPendingMove();
      WtoolboxService.menuUpdated.next(true);
      return;
    }

    if (!this.hasMenuAdminMethod('reorderMenu')) {
      this.cancelPendingMove();
      return;
    }

    const targetContext = this.getNodeContext(targetId);
    if (!targetContext) {
      this.cancelPendingMove();
      return;
    }

    await this.metaSrv.reorderMenu(
      sourceId,
      targetId,
      action === 'after',
      targetContext.parentId || 0,
      targetContext.siblingIds
    );

    this.cancelPendingMove();
    WtoolboxService.menuUpdated.next(true);
  }

  /**
   * Aggiorna il flag interno di drag e applica/rimuove la classe globale body
   * usata dagli stili durante il trascinamento.
   * @param active `true` per entrare in stato drag, `false` per uscirne.
   */
  private setDragState(active: boolean) {
    this.dragInProgress = active;
    if (active) {
      document.body.classList.add('wuic-menu-dragging');
    } else {
      document.body.classList.remove('wuic-menu-dragging');
    }
  }

  /**
   * Crea una nuova voce menu prima/dentro/dopo il target usando l'API metadata,
   * poi ricarica il menu e apre subito l'editor del nuovo record.
   * @param item Voce menu target.
   * @param mode Posizione di inserimento: `before`, `inside`, `after`.
   */
  private async addMenuEntry(item: any, mode: 'before' | 'inside' | 'after') {
    if (!item?.mm_id) {
      return;
    }

    const targetId = Number(item.mm_id);
    const before = mode === 'before';
    const nested = mode === 'inside';
    const siblingIds = nested ? [] : (this.getNodeContext(targetId)?.siblingIds || []);
    const newId = await this.metaSrv.addMenu(targetId, before, nested, siblingIds);

    if (!newId) {
      return;
    }

    WtoolboxService.menuUpdated.next(true);
    await this.openMenuMetadata({ mm_id: newId, label: this.t('menu.new_item', 'Nuovo Menu') });
  }

  /**
   * Rimuove la voce menu dopo conferma utente e notifica il refresh del menubar.
   * @param item Voce menu da eliminare.
   */
  private async removeMenuEntry(item: any) {
    if (!item?.mm_id) {
      return;
    }

    const confirmed = await WtoolboxService.confirm({
      message: this.tf('menu.delete_confirm', 'Rimuovere la voce "{0}"?', item.label)
    });
    if (!confirmed) {
      return;
    }

    await this.metaSrv.removeMenu(Number(item.mm_id), false);
    WtoolboxService.menuUpdated.next(true);
  }

  /**
   * Restituisce la traduzione della risorsa o il fallback quando la chiave non è risolta.
   * @param resource Chiave i18n.
   * @param fallback Testo fallback.
   * @returns Testo tradotto o fallback.
   */
  private t(resource: string, fallback: string): string {
    const translated = this.trslSrv.instant(resource);
    if (!translated || translated === resource) {
      return fallback;
    }
    return translated;
  }

  /**
   * Traduce una risorsa e sostituisce i placeholder posizionali `{0}`, `{1}`, ...
   * con i valori passati in `args`.
   * @param resource Chiave i18n.
   * @param fallback Testo fallback.
   * @param args Argomenti per sostituzione placeholder.
   * @returns Stringa formattata finale.
   */
  private tf(resource: string, fallback: string, ...args: any[]): string {
    const template = this.t(resource, fallback);
    return template.replace(/\{(\d+)\}/g, (match, idx) => {
      const value = args[Number(idx)];
      return value !== undefined && value !== null ? String(value) : match;
    });
  }

  /**
   * Inizializza e riaggancia il `MutationObserver` sul menubar per adattare layout di submenu
   * quando vengono evidenziati: larghezza ul/li, float e offset sui livelli annidati.
   * Esegue solo se `menuParams` è configurato nel widget definition.
   */
  private ensureMenuObserver() {
    if (!MetadataProviderService.widgetDefinition.menuParams) {
      return;
    }

    if (!this.config) {
      this.config = {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['data-p-highlight', 'aria-expanded', 'class']
      };
    }

    if (!this.observer) {
      this.observer = new MutationObserver((mutationList, observer) => {
        const hasRelevantChange = mutationList.some(m =>
          (m.type === 'attributes' && (
            m.attributeName === 'data-p-highlight'
            || m.attributeName === 'class'
            || m.attributeName === 'aria-expanded'
          ))
          || (m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0))
        );
        if (hasRelevantChange) {
          this.scheduleSubmenuColumnLayout();
        }
      });
    }

    this.targetNode = document.getElementsByTagName("p-menubar")[0] as Element;

    if (!(this.targetNode instanceof Node)) {
      return;
    }

    try {
      this.observer.disconnect();
    } catch { }

    this.observer.observe(this.targetNode, this.config);

  }

  private submenuLayoutScheduled = false;
  private submenuLayoutRunning = false;

  private scheduleSubmenuColumnLayout() {
    if (this.submenuLayoutScheduled) {
      return;
    }

    this.submenuLayoutScheduled = true;
    requestAnimationFrame(() => {
      this.submenuLayoutScheduled = false;
      this.applySubmenuColumnLayout();
    });
  }

  private applySubmenuColumnLayout() {
    if (this.submenuLayoutRunning) {
      return;
    }
    this.submenuLayoutRunning = true;

    try {
      let mnu = this.menu?.el?.nativeElement;
      if (!mnu || !MetadataProviderService.widgetDefinition.menuParams) return;

      const submenuSelector = 'li.p-menubar-item > ul.p-menubar-submenu';
      const uls = Array.from(mnu.querySelectorAll(submenuSelector)) as HTMLElement[];
      const threshold = MetadataProviderService.widgetDefinition.menuParams.itemCountThreshold;
      const shiftStep = Number.parseFloat(String(MetadataProviderService.widgetDefinition.menuParams.liWidth || '100')) || 100;
      const nestedOffsetByParent = new Map<HTMLElement, number>();
      const viewportPadding = 8;
      const viewportWidth = globalThis.innerWidth || document.documentElement.clientWidth || 0;
      const isMobileViewport = viewportWidth <= 768;
      const isMobileMenuOpen = mnu.classList?.contains('p-menubar-mobile-active') === true;

      uls.forEach((ul) => {
        const ownerMenuItem = ul.parentElement as HTMLElement | null;
        const isExpanded = ownerMenuItem?.getAttribute('aria-expanded') === 'true';
        const isHighlighted = ownerMenuItem?.getAttribute('data-p-highlight') === 'true';
        const hasCustomLayout = ul.getAttribute('data-wuic-submenu-layout') === '1';
        const nodes = Array.from(ul.children)
          .filter((x) => x instanceof HTMLElement && x.tagName.toLowerCase() === 'li') as HTMLElement[];

        const resetSubmenuStyles = () => {
          ul.style.width = '';
          ul.style.marginLeft = '';
          ul.style.flexWrap = '';
          ul.style.overflow = '';
          ul.removeAttribute('data-wuic-submenu-layout');
          nodes.forEach((li) => {
            li.style.width = '';
            li.style.float = '';
          });
        };

        // In modalità hamburger/mobile il layout custom a colonne non deve mai essere applicato:
        // PrimeNG gestisce già stacking verticale, e i width/floating desktop introducono overflow.
        if (isMobileViewport || isMobileMenuOpen) {
          if (hasCustomLayout) {
            resetSubmenuStyles();
          }
          return;
        }

        // Tocca solo submenu realmente aperti dal menubar.
        if (!isExpanded || !isHighlighted) {
          if (hasCustomLayout) {
            resetSubmenuStyles();
          }
          return;
        }

        if (hasCustomLayout) {
          resetSubmenuStyles();
        }
        if (nodes.length <= threshold) {
          return;
        }

        const nestedLevel = ul.closest('ul.p-menubar-submenu ul.p-menubar-submenu') ? 2 : 1;
        ul.style.width = MetadataProviderService.widgetDefinition.menuParams.ulWith;
        ul.style.display = 'block';
        ul.style.overflow = 'hidden';
        ul.setAttribute('data-wuic-submenu-layout', '1');

        if (nestedLevel === 2) {
          const parentSubmenu = ownerMenuItem?.closest('ul.p-menubar-submenu') as HTMLElement | null;
          if (parentSubmenu) {
            const currentOffset = nestedOffsetByParent.get(parentSubmenu) || 0;
            ul.style.marginLeft = (-currentOffset * shiftStep) + 'px';
            nestedOffsetByParent.set(parentSubmenu, currentOffset + 1);
          }
        }

        nodes.forEach((li) => {
          li.style.width = MetadataProviderService.widgetDefinition.menuParams.liWidth;
          li.style.float = 'left';
        });

        // Evita overflow orizzontale: se il submenu esce dal viewport a destra,
        // sposta progressivamente a sinistra tramite margin-left.
        const rect = ul.getBoundingClientRect();
        const rightOverflow = rect.right - (viewportWidth - viewportPadding);
        const leftOverflow = viewportPadding - rect.left;
        let marginLeft = Number.parseFloat(ul.style.marginLeft || '0');
        if (!Number.isFinite(marginLeft)) {
          marginLeft = 0;
        }

        if (rightOverflow > 0) {
          marginLeft -= rightOverflow;
        }
        if (leftOverflow > 0) {
          marginLeft += leftOverflow;
        }

        if (rightOverflow > 0 || leftOverflow > 0) {
          ul.style.marginLeft = `${marginLeft}px`;
        }
      });
    } finally {
      this.submenuLayoutRunning = false;
    }
  }
}


