import { AfterContentInit, ChangeDetectorRef, Component, forwardRef, Injector, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { filter } from 'rxjs/operators';
import { utility } from './classes/utility';
import { CommonModule, NgClass, NgComponentOutlet, NgFor, NgIf, NgStyle } from '@angular/common';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { FieldsetModule } from 'primeng/fieldset';

import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Subscription } from 'rxjs';

import { environment as appSettings } from './environments/environment';
import { DialogService } from 'primeng/dynamicdialog';

import { PrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import Lara from '@primeuix/themes/lara';
import Nora from '@primeuix/themes/nora';
import Material from '@primeuix/themes/material';
import { updatePrimaryPalette, usePreset } from '@primeuix/styled';

import {
  WtoolboxService, MetadataProviderService, GlobalHandler, CustomException,
  TranslationManagerService, AuthSessionService, getThemeOptions,
  PRIMARY_PALETTES, ThemeOption, LicenseFeatureService
} from './wuic-bridges/core';
import { ImageWrapperComponent } from './wuic-bridges/ui';
import { WuicRagChatbotFabComponent, LazyFirstRunWizardComponent } from './wuic-bridges/public';
import { CustomListComponent } from './component/custom-list/custom-list.component';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule, RouterOutlet, NgComponentOutlet, ToggleSwitchModule, SelectModule,
    FormsModule, DialogModule, ButtonModule, TranslateModule, TooltipModule, ToastModule,
    ConfirmDialogModule, FieldsetModule, WuicRagChatbotFabComponent, LazyFirstRunWizardComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  providers: [MessageService, ConfirmationService, DialogService, GlobalHandler]
})
export class AppComponent implements OnInit, AfterContentInit, OnDestroy {
  private static readonly ThemeStorageKey = 'wuic-selected-theme';
  private static readonly ThemeModeStorageKey = 'wuic-theme-mode';
  private readonly themePresets: Record<string, any> = {
    aura: Aura,
    lara: Lara,
    nora: Nora,
    material: Material
  };
  title = 'wuic-test';
  isDarkMode = false;

  visible: boolean = false;
  currentException: CustomException;

  isBusy: BehaviorSubject<boolean> = WtoolboxService.isBusy;
  busyVisible: boolean = false;
  private busySub?: Subscription;

  selectedTheme = 'aura-blue';
  availableThemes: ThemeOption[] = getThemeOptions();

  unreadNotificationsCount = 0;
  private loggedUserId: number | null = null;
  private notificationsRealtimeUserId: number | null = null;
  private authSession: AuthSessionService | null = null;
  metaMenuComponent: any = null;
  notificationBellComponent: any = null;

  constructor(
    public messageService: MessageService,
    public confirmationService: ConfirmationService,
    private http: HttpClient,
    private dialogSrv: DialogService,
    private translationService: TranslationManagerService,
    public globalHandler: GlobalHandler,
    private primeng: PrimeNG,
    private injector: Injector,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private metaTagService: Meta,
    private titleService: Title,
    private activatedRoute: ActivatedRoute
  ) {
    WtoolboxService.messageNotificationService = messageService;
    WtoolboxService.confirmationService = confirmationService;
    WtoolboxService.http = http;
    WtoolboxService.appSettings = appSettings;
    WtoolboxService.dialogService = dialogSrv;
    WtoolboxService.translationService = translationService;
    WtoolboxService.errorHandler = this.globalHandler;

    GlobalHandler.messageNotification.subscribe((data: any) => {
      this.currentException = data.exception;
      this.visible = data.show;
      // Test/debug only: expose the last rendered exception so e2e probes
      // can verify which fields the dialog received without DOM scraping.
      try { (window as any).__wuicLastDialogException = data.exception; } catch { /* noop */ }
    });

    this.authSession = this.injector.get(AuthSessionService);

    // Custom functions
    WtoolboxService.myFunctions['utility'] = new utility();
    void this.configureWidgetRuntimeMetadata();
  }

  /**
   * Hook chiamato dal `<wuic-first-run-wizard>` quando il flusso firstRun
   * conclude (sia perche' firstRun=false al boot, sia post-install success).
   * Attualmente no-op: il wizard si auto-controlla visibilita' via overlay
   * fixed-position con z-index 900, sotto cui il resto della shell continua
   * a renderizzare in parallelo. Hook esposto per future estensioni del
   * consumer (es. trigger di refresh metadata o invalidate cache).
   */
  onFirstRunComplete(): void {
    // no-op
  }

  private async configureWidgetRuntimeMetadata(): Promise<void> {
    const ui = await import('./wuic-bridges/ui');
    const loaders = await import('./wuic-bridges/widget-loaders');
    const advancedLoaders = () => import('./wuic-bridges/widget-loaders-advanced');

    Object.assign(MetadataProviderService.widgetDefinition, {
      defaultHeight: "70px",
      defaultWidth: "100%",
      defaultFilterWidth: "200px",
      filterOperators: [
        { key: 'eq', value: 'equals' },
        { key: 'ne', value: 'not equals' },
        { key: 'lt', value: 'less than' },
        { key: 'le', value: 'less than or equals' },
        { key: 'gt', value: 'greater than' },
        { key: 'ge', value: 'greater than or equals' },
        { key: 'contains', value: 'contains' },
        { key: 'notcontains', value: 'not contains' },
        { key: 'startswith', value: 'starts with' },
        { key: 'endswith', value: 'ends with' },
        { key: 'isnull', value: 'null' }
      ],
      menuParams: {
        ulWith: "1200px",
        liWidth: "33%",
        itemCountThreshold: 6
      },
      gridRowImports: [ButtonModule, TableModule, CommonModule, NgClass, NgStyle, FormsModule, ui.LazyDataActionButtonComponent, ui.LazyDataSourceComponent, ui.VisibleFieldListPipe, ui.CallbackPipe, ui.CallbackPipe2, ui.IsSelectedRowPipe, ui.FormatGridViewValuePipe, ui.GetSrcUploadPreviewPipe, ui.LazyFieldEditorComponent, ui.LazyImageWrapperComponent, ImageWrapperComponent, ui.WuicFrozenColumnDirective, ui.WuicRowTogglerDirective],
      dynamicFormImports: [CommonModule, ui.LazyDataActionButtonComponent, ui.LazyDataSourceComponent, ui.VisibleFieldListPipe, TableModule, ButtonModule, ui.LazyFieldEditorComponent, ImageWrapperComponent],
    });

    MetadataProviderService.widgetDefinition.archetypes['customlist'] = { component: CustomListComponent, designerOptions: null };

    Object.assign(MetadataProviderService.widgetMap, {
      'text': { loader: loaders.loadTextEditorComponent, width: '300px' },
      'txt_area': { loader: loaders.loadTextAreaEditorComponent, width: '300px', height: '150px' },
      'number': { loader: loaders.loadNumberEditorComponent, width: '300px' },
      'number_boolean': { loader: loaders.loadBooleanEditorComponent },
      'boolean': { loader: loaders.loadBooleanEditorComponent },
      'lookupByID': { loader: loaders.loadLookupEditorComponent, width: '300px' },
      'multiple_check': { loader: loaders.loadLookupEditorComponent, width: '300px' },
      'button': { loader: loaders.loadButtonEditorComponent },
      'number_slider': { loader: loaders.loadNumberEditorComponent },
      'date': { loader: loaders.loadDateEditorComponent, width: '300px' },
      'datetime': { loader: loaders.loadDateEditorComponent, width: '300px' },
      'time': { loader: loaders.loadDateEditorComponent, width: '300px' },
      'dictionary': { loader: loaders.loadDictionaryEditorComponent, width: '300px' },
      'dictionary_radio': { loader: loaders.loadDictionaryEditorComponent },
      'html_area': { loader: () => advancedLoaders().then(m => m.loadHtmlEditorComponent()) },
      'upload': { loader: () => advancedLoaders().then(m => m.loadUploadEditorComponent()) },
      'code_editor': { loader: () => advancedLoaders().then(m => m.loadCodeAreaEditorComponent()) },
      'color': { loader: () => advancedLoaders().then(m => m.loadColorEditorComponent()), width: '300px' },
      'point': { loader: loaders.loadTextEditorComponent, width: '300px' },
      'polygon': { loader: loaders.loadTextEditorComponent, width: '300px' },
      'geometry': { loader: loaders.loadTextAreaEditorComponent, width: '300px' },
      'tree': { loader: () => advancedLoaders().then(m => m.loadTreeViewSelectorComponent()), width: '100%' },
      'field-editor': { component: ui.LazyFieldEditorComponent, hide: true },
      'objectArray': { loader: () => advancedLoaders().then(m => m.loadPropertyArrayEditorComponent()), hide: true },
      'objectProp': { loader: () => advancedLoaders().then(m => m.loadPropertyObjectEditorComponent()), hide: true },
    });

    MetadataProviderService.customDesignerComponents = [CustomListComponent];
    MetadataProviderService.customDesignerTools = [
      {
        group: 'DATA',
        toolId: -1,
        name: 'TOOL_X',
        tag: `<app-custom-list [attr.id]="uniqueName" [attr.title]="uniqueName" [datasource]="inputs.datasource?.component"></app-custom-list>`,
        icon: 'pi pi-window-maximize',
        inputProps: {
          datasource: {
            'type': 'dropped-component-list',
            filter: 'DATASOURCE',
            asyncPath: 'component',
            serializable: { prop: 'uniqueName' }
          },
          componentRef: { type: 'dropped-component', hide: true, serializable: false },
        },
        inputs: {
          componentRef: null,
          datasource: null
        }
      }
    ];
  }

  private async loadShellWidgets(): Promise<void> {
    const [ui, notifications] = await Promise.all([
      import('./wuic-bridges/ui'),
      import('./wuic-bridges/notifications')
    ]);

    this.metaMenuComponent = ui.LazyMetaMenuComponent;
    this.notificationBellComponent = notifications.NotificationBellComponent;
    this.cdr.detectChanges();
  }

  ngAfterContentInit(): void {
  }

  ngOnDestroy(): void {
    this.busySub?.unsubscribe();
  }

  /**
   * Costruisce e scrive la meta description dalla route corrente per SEO.
   *
   * Priorita':
   *   1. `route.data.description` — descrizione curata staticamente
   *   2. Fallback humanize: per route metadata-driven `<route>/<action>`
   *      (BoundedRepeater generico per qualsiasi tabella) costruiamo
   *      "<Route> <Action> | WUIC Framework...".
   *
   * Cap a 155 char per rispettare il limite Google SERP.
   */
  private updateMetaDescriptionForCurrentRoute(): void {
    let r = this.activatedRoute.snapshot;
    while (r.firstChild) r = r.firstChild;
    const curated = (r?.data as any)?.description as string | undefined;

    const humanize = (s: string) => String(s || '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    let content: string;
    if (curated && curated.trim().length > 0) {
      const params = (r?.params as any) || {};
      content = curated.trim().replace(/\{(\w+)\}/g, (match, key) => {
        const value = params?.[key];
        return value ? humanize(value) : match;
      });
      content = content.replace(/\s+/g, ' ').trim();
    } else {
      const url = (this.router.url || '/').split('?')[0].split('#')[0];
      const segments = url.split('/').filter(Boolean);
      const routePart = segments.length > 0
        ? segments.slice(0, 2).map(humanize).join(' — ')
        : 'Home';
      content = `${routePart} | WUIC Framework — Piattaforma low-code per gestione dati, dashboard e workflow.`;
    }
    const capped = content.length > 155 ? content.slice(0, 152) + '...' : content;
    this.metaTagService.updateTag({ name: 'description', content: capped });
  }

  ngOnInit(): void {
    // SEO: aggiorna `<meta name="description">` dinamicamente a ogni NavigationEnd.
    this.updateMetaDescriptionForCurrentRoute();
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.updateMetaDescriptionForCurrentRoute());

    this.busySub?.unsubscribe();
    this.busySub = this.isBusy.subscribe((v) => {
      queueMicrotask(() => { this.busyVisible = !!v; });
    });

    // Pre-load license status so *wuicFeature directives and FeatureRouteGuard
    // have an up-to-date snapshot as soon as possible after the first render.
    void this.injector.get(LicenseFeatureService).refresh();

    void this.loadShellWidgets();
    const savedTheme = localStorage.getItem(AppComponent.ThemeStorageKey);
    if (savedTheme && this.availableThemes.some(t => t.value === savedTheme)) {
      this.selectedTheme = savedTheme;
    }
    const savedThemeMode = localStorage.getItem(AppComponent.ThemeModeStorageKey);
    if (savedThemeMode === 'dark') {
      document.documentElement.classList.add('theme-dark');
      this.isDarkMode = true;
    } else if (savedThemeMode === 'light') {
      document.documentElement.classList.remove('theme-dark');
      this.isDarkMode = false;
    } else {
      const darkEnabled = document.documentElement.classList.contains('theme-dark') ||
        document.body?.classList?.contains('theme-dark') === true;
      if (darkEnabled) {
        document.documentElement.classList.add('theme-dark');
        this.isDarkMode = true;
      } else {
        document.documentElement.classList.remove('theme-dark');
        this.isDarkMode = false;
      }
    }

    // Persist effective startup values so downstream consumers can always read them.
    localStorage.setItem(AppComponent.ThemeStorageKey, this.selectedTheme);
    localStorage.setItem(AppComponent.ThemeModeStorageKey, this.isDarkMode ? 'dark' : 'light');

    this.applyThemePreset(this.selectedTheme);

    this.primeng.zIndex = {
      modal: 1100,    // dialog, sidebar
      overlay: 1200,  // dropdown, overlaypanel
      menu: 1300,     // overlay menus
      tooltip: 1400   // tooltip
    };

    this.patchConfirmDialogA11y();
  }

  private patchConfirmDialogA11y(): void {
    const apply = () => {
      const dialogs = Array.from(document.querySelectorAll('p-confirmdialog p-dialog[role=\"alertdialog\"]')) as HTMLElement[];
      dialogs.forEach((dialog) => {
        if (!dialog.getAttribute('aria-label')) {
          dialog.setAttribute('aria-label', 'Conferma');
        }
        if (!dialog.getAttribute('title')) {
          dialog.setAttribute('title', 'Conferma');
        }
      });
    };

    queueMicrotask(apply);
    setTimeout(apply, 250);
    setTimeout(apply, 1200);
  }

  get showRightHeaderBlock(): boolean {
    const state = this.authSession?.snapshot;
    if (state?.authenticated || state?.legacyAuthenticated) {
      return true;
    }
    return !!this.resolveUserIdFromCookie();
  }

  private resolveUserIdFromCookie(): number | null {
    const rawCookies = String(document?.cookie || '');
    const token = rawCookies.split(';').map(x => x.trim()).find(x => x.startsWith('k-user='));
    const encoded = token
      ? token.substring('k-user='.length)
      : (localStorage.getItem('k-user') || sessionStorage.getItem('k-user') || '');

    if (!encoded) {
      return null;
    }

    try {
      const decoded = decodeURIComponent(encoded);
      const parsed = JSON.parse(decoded);
      const id = Number(parsed?.user_id ?? 0);
      return Number.isFinite(id) && id > 0 ? id : null;
    } catch {
      return null;
    }
  }

  toggleLightDark() {
    // Guard: quando un tema ad alto contrasto e' selezionato, la variante
    // chiaro/scuro e' determinata dalla scelta del tema stesso nel dropdown.
    if (this.isHighContrastTheme()) {
      return;
    }
    const root = document?.documentElement;
    const body = document?.body;
    if (root?.classList.contains('theme-dark')) {
      root?.classList.remove('theme-dark');
      body?.classList.remove('theme-dark');
      this.isDarkMode = false;
      localStorage.setItem(AppComponent.ThemeModeStorageKey, 'light');
    } else {
      root?.classList.add('theme-dark');
      body?.classList.add('theme-dark');
      this.isDarkMode = true;
      localStorage.setItem(AppComponent.ThemeModeStorageKey, 'dark');
    }
  }

  /**
   * True quando il tema correntemente selezionato e' una variante accessibility
   * ad alto contrasto. Usato dal template per disabilitare il toggle dark/light.
   */
  isHighContrastTheme(): boolean {
    const selected = this.availableThemes.find(t => t.value === this.selectedTheme);
    return !!selected?.isHighContrast;
  }

  onThemeChange(themeName: string) {
    if (!themeName) {
      return;
    }
    this.selectedTheme = themeName;
    localStorage.setItem(AppComponent.ThemeStorageKey, themeName);
    this.applyThemePreset(themeName);
  }

  private applyThemePreset(themeName: string) {
    const selected = this.availableThemes.find(t => t.value === themeName);
    if (!selected) {
      this.setHighContrastMode(false);
      return;
    }

    const preset = this.themePresets[selected.preset];
    if (!preset) {
      this.setHighContrastMode(false);
      return;
    }

    // CRITICO: applica `theme-dark` PRIMA di `usePreset()`. Quando PrimeNG
    // installa il preset ricalcola le CSS var dark/light basandosi sul
    // matching del `darkModeSelector: '.theme-dark'`.
    if (selected.isHighContrast && selected.highContrastMode) {
      const root = document?.documentElement;
      const body = document?.body;
      const wantsDark = selected.highContrastMode === 'dark';
      if (wantsDark) {
        root?.classList.add('theme-dark');
        body?.classList.add('theme-dark');
        this.isDarkMode = true;
        localStorage.setItem(AppComponent.ThemeModeStorageKey, 'dark');
      } else {
        root?.classList.remove('theme-dark');
        body?.classList.remove('theme-dark');
        this.isDarkMode = false;
        localStorage.setItem(AppComponent.ThemeModeStorageKey, 'light');
      }
    }

    usePreset(preset);

    const palette = PRIMARY_PALETTES[selected.primary];
    if (palette) {
      updatePrimaryPalette(palette);
    }

    this.setHighContrastMode(!!selected.isHighContrast);
  }

  private setHighContrastMode(enabled: boolean): void {
    const root = document?.documentElement;
    const body = document?.body;
    root?.classList.toggle('theme-high-contrast', enabled);
    body?.classList.toggle('theme-high-contrast', enabled);
    if (enabled) {
      root?.setAttribute('data-contrast-mode', 'high');
      body?.setAttribute('data-contrast-mode', 'high');
    } else {
      root?.removeAttribute('data-contrast-mode');
      body?.removeAttribute('data-contrast-mode');
    }
  }

  // ─────────────────────────── Error dialog helpers ───────────────────────────
  // The currentException carries optional fields populated by the SQL passthrough
  // branch of GlobalHandler (skill typed-localized-exceptions section 4-bis):
  //   kind: 'sql-passthrough'
  //   body, sqlDetails, query, parameters, innerExceptions, labels
  // Plain (legacy) exceptions only have `title` + `stackTrace` and the SQL
  // sections are hidden via the *ngIf in the template.

  formatParameters(params: Record<string, unknown> | undefined): string {
    if (!params || typeof params !== 'object') return '';
    try {
      return Object.entries(params)
        .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
        .join('\n');
    } catch {
      return '';
    }
  }

  formatSqlDetails(d: any): string {
    if (!d) return '';
    const parts: string[] = [];
    if (d.number    !== undefined && d.number    !== null) parts.push(`Number: ${d.number}`);
    if (d.state     !== undefined && d.state     !== null) parts.push(`State: ${d.state}`);
    if (d.class     !== undefined && d.class     !== null) parts.push(`Class: ${d.class}`);
    if (d.line      !== undefined && d.line      !== null) parts.push(`Line: ${d.line}`);
    if (d.procedure)                                       parts.push(`Procedure: ${d.procedure}`);
    if (d.server)                                          parts.push(`Server: ${d.server}`);
    if (d.database)                                        parts.push(`DB: ${d.database}`);
    return parts.join('  ·  ');
  }

  /**
   * Copy a self-contained text blob with everything the user might paste
   * into a ticket / DBA chat: message, query, parameters, stack.
   */
  copyErrorDetails(): void {
    const e: any = this.currentException;
    if (!e) return;
    const sections: string[] = [];
    if (e.title) sections.push(`# ${e.title}`);
    if (e.body)  sections.push(e.body);
    const det = this.formatSqlDetails(e.sqlDetails);
    if (det)     sections.push(det);
    if (e.query) sections.push('-- Query --\n' + e.query);
    const pars = this.formatParameters(e.parameters);
    if (pars)    sections.push('-- Parameters --\n' + pars);
    if (e.stackTrace) sections.push('-- Stack --\n' + e.stackTrace);
    if (e.traceId)    sections.push(`traceId: ${e.traceId}`);
    const text = sections.join('\n\n');
    try {
      navigator?.clipboard?.writeText(text);
    } catch { /* clipboard unavailable, e.g. in headless without permission */ }
  }
}
