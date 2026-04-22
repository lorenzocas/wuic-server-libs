import { AfterContentInit, ChangeDetectorRef, Component, forwardRef, Injector, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { utility } from './classes/utility';
import { CommonModule, NgClass, NgComponentOutlet, NgFor, NgIf, NgStyle } from '@angular/common';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { ProgressBarModule } from 'primeng/progressbar';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';

import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Subscription } from 'rxjs';

import { environment as appSettings } from './environments/environment';
import { DialogService } from 'primeng/dynamicdialog';


import { PrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import Lara from '@primeuix/themes/lara';
import Nora from '@primeuix/themes/nora';

/**
 * Default della lingua admin basato su `navigator.language`. Mappa su uno dei 5
 * tag supportati (it-IT / en-US / fr-FR / es-ES / de-DE) matchando il prefisso
 * linguistico (es. "fr", "fr-CA" → fr-FR). Fallback: 'it-IT'.
 * Dichiarata come funzione module-scope (non metodo di classe) per essere
 * utilizzabile nel field-initializer di `firstRunForm` senza incorrere in
 * TS2339 (all'inizializzazione i metodi statici della classe non sono ancora
 * accessibili via `typeof ClassName` in strict mode).
 */
function resolveDefaultAdminLanguage(): string {
  const raw = (typeof navigator !== 'undefined' ? (navigator.language || '') : '').toLowerCase();
  if (raw.startsWith('it')) return 'it-IT';
  if (raw.startsWith('en')) return 'en-US';
  if (raw.startsWith('fr')) return 'fr-FR';
  if (raw.startsWith('es')) return 'es-ES';
  if (raw.startsWith('de')) return 'de-DE';
  return 'it-IT';
}
import Material from '@primeuix/themes/material';
import { updatePrimaryPalette, usePreset } from '@primeuix/styled';
import { WtoolboxService, MetadataProviderService, GlobalHandler, CustomException, TranslationManagerService, AuthSessionService, UserInfoService, getThemeOptions, PRIMARY_PALETTES, ThemeOption, LicenseFeatureService } from './wuic-bridges/core';
import { ImageWrapperComponent } from './wuic-bridges/ui';
import { WuicRagChatbotFabComponent } from './wuic-bridges/public';
import { CustomListComponent } from './component/custom-list/custom-list.component';

// import { CustomTextFieldComponent } from './component/field/custom-text-field/custom-text-field.component';
// import { CustomListComponent } from './component/custom-list/custom-list.component';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, NgComponentOutlet, ToggleSwitchModule, SelectModule, CheckboxModule, ProgressBarModule, FormsModule, DialogModule, ButtonModule, TranslateModule, TooltipModule, ToastModule, ConfirmDialogModule, WuicRagChatbotFabComponent],
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
  // #document = inject(DOCUMENT);
  isDarkMode = false;

  visible: boolean = false;
  currentException: CustomException;

  isBusy: BehaviorSubject<boolean> = WtoolboxService.isBusy;
  busyVisible: boolean = false;
  private busySub?: Subscription;
  showFirstRunInstall = false;
  firstRunLoading = true;
  firstRunInstalling = false;
  firstRunDbLoading = false;
  firstRunConnectionTesting = false;
  firstRunConnectionValid = false;
  firstRunError = '';
  firstRunDbmsOptions = [
    { label: 'Microsoft SQL Server', value: 'mssql' },
    { label: 'MySQL', value: 'mysql' },
    { label: 'Oracle', value: 'oracle' },
    { label: 'PostgreSQL', value: 'postgres' }
  ];
  // Opzioni lingua admin iniziale. I valori sono i 5 tag IETF supportati dal framework
  // WUIC (ngx-translate carica `./assets/i18n/<tag>.json`). Il backend
  // InsertFirstRunAdminUser accetta SOLO questi 5 valori, altrimenti fallback a 'it-IT'.
  firstRunAdminLanguageOptions = [
    { label: 'Italiano', value: 'it-IT' },
    { label: 'English', value: 'en-US' },
    { label: 'Français', value: 'fr-FR' },
    { label: 'Español', value: 'es-ES' },
    { label: 'Deutsch', value: 'de-DE' }
  ];
  // Default both modes; bootstrapFirstRun() narrows the list to just "DB esistente"
  // when the backend reports tutorialAvailable=false (i.e. the deploy zip variant
  // ships only minimal-metadata.<dbms>.sql, not the WideWorldImporters tutorial bundle).
  firstRunSetupModeOptions: { label: string; value: string }[] = [
    { label: 'DB esistente', value: 'existing' },
    { label: 'Tutorial WideWorldImporters', value: 'tutorial' }
  ];
  // Mirrors the backend FirstRunStatus.tutorialAvailable flag (file-existence probe of
  // tutorial-data.<dbms>.sql + tutorial-metadata.<dbms>.sql, > 1 KB to exclude stubs).
  // Drives the *visibility* of the tutorial option in firstRunSetupModeOptions; the form
  // value is forced to 'existing' when this is false so submit can never accidentally
  // hit a tutorial code path with no scripts on disk.
  firstRunTutorialAvailable = true;

  // Mirrors backend FirstRunStatus python pre-flight (tri-state):
  //   - firstRunPythonInstalled: true se Python >= 3.12 e' sul PATH del worker IIS
  //   - firstRunPythonSupported: true SOLO se Python 3.12.x (versione testata; 3.13+
  //                              ha pythonInstalled=true ma pythonSupported=false)
  //   - firstRunPythonVersion:   "3.12.10" / "3.13.1" / ecc
  //
  // UI logic sulla checkbox "Installa RAG":
  //   installed=false  -> disabled + banner ambra (download link py 3.12)
  //   installed+supported -> enabled + small verde "Python 3.12.x rilevato"
  //   installed ma non supported -> enabled + banner giallo leggero
  //     "rilevato X.Y non testato, wheel torch potrebbero richiedere 3.12"
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
    // Lingua di default dell'utente admin creato dal wizard. Scritta nel campo
    // `utenti.language` (varchar(6)) durante configure_wuic → InsertFirstRunAdminUser.
    // Al primo login il frontend legge questo valore via `UserInfoService.getuserInfo().lingua`
    // e applica il set locale a ngx-translate. Default: detect da browser (navigator.language)
    // con fallback a 'it-IT'. Valori validi: 'it-IT' | 'en-US' | 'fr-FR' | 'es-ES' | 'de-DE'.
    adminLanguage: resolveDefaultAdminLanguage(),
    scaffoldExistingDatabase: false,
    // ── RAG Chatbot (opzionale) ──────────────────────────────────────
    // Se `installRag = true` il backend configure_wuic invoca
    // `scripts/rag-setup.ps1` al termine dell'install DB/metadata.
    // Lo script fa winget install Python 3.12 (se manca), crea .venv,
    // installa torch + dipendenze + server deps, e avvia il server
    // FastAPI su :8765. Ogni fase viene riflessa nel
    // FirstRunProgressTracker (quindi la progress bar mostra i 4 step
    // extra oltre a quelli dell'install base).
    installRag: false,
    // Se `useCuda = true` il ps1 riceve `-CudaVersion 12.1` (default
    // stabile per torch). Installa torch GPU (~2.5 GB) invece della
    // versione CPU (~200 MB). Valido solo con GPU NVIDIA + driver CUDA.
    useCuda: false,
    // API key Anthropic passata al server RAG come env var. Senza, il
    // server usa solo modalita' "retrieval" (ricerca snippet, no LLM).
    anthropicApiKey: ''
  };
  firstRunDataDbOptions: { label: string; value: string }[] = [];
  private firstRunRealPath = '';

  // Progress state polled from GET /api/Meta/FirstRunProgress every ~500ms while
  // the configure_wuic POST is in flight. Mirrors the shape written to
  // firstrun-progress.json by MetaService.FirstRunProgressTracker. The wizard UI
  // renders a <p-progressBar> bound to `firstRunProgress.percent` and a label
  // built from `phase` + `message` + elapsed seconds. The "active" flag is the
  // master switch that decides whether to show the bar at all — false when the
  // backend hasn't written a session yet (pre-POST or post-Cleanup).
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
  // Opaque handle to the setInterval timer so we can clear it in the finally
  // block of submitFirstRunInstallInternal regardless of success or failure.
  private firstRunProgressTimer: ReturnType<typeof setInterval> | null = null;
  selectedTheme = 'aura-blue';
  availableThemes: ThemeOption[] = getThemeOptions();

  unreadNotificationsCount = 0;
  // notifications: CrmNotificationItem[] = [];
  private loggedUserId: number | null = null;
  private notificationsRealtimeUserId: number | null = null;
  private authSession: AuthSessionService | null = null;
  metaMenuComponent: any = null;
  notificationBellComponent: any = null;
  // @ViewChild('spreadsheet') spreadsheet: any;

  constructor(public messageService: MessageService, public confirmationService: ConfirmationService, private http: HttpClient, private dialogSrv: DialogService, private translationService: TranslationManagerService, public globalHandler: GlobalHandler, private primeng: PrimeNG,
    // private notificationRealtime: CrmNotificationRealtimeService, private router: Router,
    private injector: Injector,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef
  ) {

    WtoolboxService.messageNotificationService = messageService;
    WtoolboxService.confirmationService = confirmationService;
    WtoolboxService.http = http
    WtoolboxService.appSettings = appSettings;
    WtoolboxService.dialogService = dialogSrv;
    WtoolboxService.translationService = translationService;
    WtoolboxService.errorHandler = this.globalHandler;

    GlobalHandler.messageNotification.subscribe((data: any) => {
      this.currentException = data.exception;
      this.visible = data.show;
    });

    this.authSession = this.injector.get(AuthSessionService);

    // Hook post-login per il resume del RAG setup pending.
    //
    // Storia (2026-04-19 v2): il first-run wizard non lancia piu' il ps1
    // rag-setup direttamente (la vecchia v1 con Task.Run in configure_wuic
    // moriva per il recycle IIS post-wizard, vedi MetaService.configure_wuic
    // region "RAG Chatbot (DEFERRED al primo login post-wizard)"). Adesso
    // configure_wuic scrive solo un flag JSON (`logs/rag-setup-pending.json`).
    // Quando l'admin si logga per la prima volta POST-RECYCLE, qui rileviamo
    // `authenticated=true` e chiamiamo `MetaService.resumeRagSetupIfPending`
    // che consuma il flag + lancia il Task.Run sul worker fresco (stabile per
    // l'intero idleTimeout del pool).
    //
    // Idempotenza: il flag viene rinominato a `.consumed` dentro il backend
    // prima di lanciare il Task.Run, quindi login successivi (o parallel tab)
    // trovano `no-pending` o `already-consumed` e sono no-op.
    //
    // Una sola chiamata per sessione frontend: `ragResumeChecked` flag interno.
    // Controlliamo ENTRAMBI i flag di autenticazione: `authenticated` (cookie-auth
    // moderna, `enableCookieAuthentication=true`) E `legacyAuthenticated` (flusso
    // legacy `MetaService.login` con cookie k-user). WuicTest gira in legacy mode
    // di default, quindi senza questo OR la subscription non scatterebbe mai.
    this.authSession.state$.subscribe((state) => {
      const isAuth = state?.authenticated === true || state?.legacyAuthenticated === true;
      if (!this.ragResumeChecked && isAuth) {
        this.ragResumeChecked = true;
        this.triggerRagSetupResumeIfPending();
      }
    });

    //custom functions
    WtoolboxService.myFunctions['utility'] = new utility();
    void this.configureWidgetRuntimeMetadata();

  }

  /**
   * Flag di idempotenza: al primo evento `authenticated=true` chiamiamo
   * `MetaService.resumeRagSetupIfPending` una volta sola per lifetime della
   * SPA. Evita N chiamate ridondanti su page reload o state$ re-emit.
   */
  private ragResumeChecked = false;

  /**
   * POST non-bloccante a `MetaService.resumeRagSetupIfPending` con l'id_utente
   * dell'utente appena autenticato. Se non c'e' un flag RAG pending (caso
   * normale, post first-run senza checkbox RAG o su qualsiasi login successivo),
   * il backend risponde `{status:"no-pending"}` e non fa nulla. Se c'e', parte
   * il Task.Run del ps1 e arrivano le notifiche di progresso nel bell.
   *
   * Errori silenziati: questo e' un trigger opportunistico, non deve impattare
   * il flusso di login. Al massimo l'admin dovra' fare il RAG setup manualmente.
   */
  private triggerRagSetupResumeIfPending(): void {
    try {
      const userId = Number(this.injector.get(UserInfoService)?.getuserInfo()?.user_id ?? 0);
      if (!userId || userId <= 0) {
        return;
      }
      const url = `${appSettings.global_root_url}MetaService.resumeRagSetupIfPending`;
      // Body: oggetto con property `userId` che matcha il nome del parametro
      // C# del metodo sul backend. AsmxProxy lega le property del body JSON per
      // nome al signature dei parametri — passare un intero bare (post(url, 42))
      // non lega nulla e l'endpoint fallirebbe silenziosamente.
      this.http.post<any>(url, { userId }).subscribe({
        next: (res) => {
          // Log minimo per diagnosi — il frontend non agisce sul risultato (le
          // notifiche RAG arrivano via il bell, non da qui).
          // eslint-disable-next-line no-console
          console.log('[rag-resume]', res);
        },
        error: (err) => {
          // eslint-disable-next-line no-console
          console.warn('[rag-resume] skipped:', err?.message ?? err);
        }
      });
    } catch {
      /* best effort — nessun throw sui trigger post-login */
    }
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
        {
          key: 'eq',
          value: 'equals'
        },
        {
          key: 'ne',
          value: 'not equals'
        },
        {
          key: 'lt',
          value: 'less than'
        },
        {
          key: 'le',
          value: 'less than or equals'
        },
        {
          key: 'gt',
          value: 'greater than'
        },
        {
          key: 'ge',
          value: 'greater than or equals'
        },
        {
          key: 'contains',
          value: 'contains'
        },
        {
          key: 'notcontains',
          value: 'not contains'
        },
        {
          key: 'startswith',
          value: 'starts with'
        },
        {
          key: 'endswith',
          value: 'ends with'
        }
        ,
        {
          key: 'isnull',
          value: 'null'
        }
      ],
      menuParams: {
        ulWith: "1200px",
        liWidth: "33%",
        itemCountThreshold: 6
      },
      gridRowImports: [ButtonModule, TableModule, CommonModule, NgClass, NgStyle, FormsModule, ui.LazyDataActionButtonComponent, ui.LazyDataSourceComponent, ui.VisibleFieldListPipe, ui.CallbackPipe, ui.CallbackPipe2, ui.IsSelectedRowPipe, ui.FormatGridViewValuePipe, ui.GetSrcUploadPreviewPipe, ui.LazyFieldEditorComponent, ui.LazyImageWrapperComponent, ImageWrapperComponent],
      dynamicFormImports: [CommonModule, ui.LazyDataActionButtonComponent, ui.LazyDataSourceComponent, ui.VisibleFieldListPipe, TableModule, ButtonModule, ui.LazyFieldEditorComponent, ImageWrapperComponent],
      //      gridRowTemplate: `
      //     <td *ngIf="metaInfo.tableMetadata.md_nested_grid_routes" pFrozenColumn [frozen]="true" alignFrozen="left">
      //        <button type="button" class="p-button p-button-text p-button-rounded p-button-sm p-0" [pRowToggler]="rowData" [attr.aria-label]="'Espandi riga'">
      //          <i class="pi" [ngClass]="{'pi-chevron-down': expanded, 'pi-chevron-right': !expanded }"></i>
      //        </button>
      //     </td>
      //     <td *ngIf="metaInfo.tableMetadata.md_multiple_selection" pFrozenColumn [frozen]="true" alignFrozen="left">
      //      <input class="p-checkbox-box" type="checkbox" style="margin-left: 15px" (click)="rowSelect(rowData, $event, dt)" [checked]="dt.selection | isSelectedRow : rowData : metaInfo" [attr.aria-label]="'Seleziona riga'" />
      //     </td>
      //     <td *ngIf="metaInfo.tableMetadata.md_editable || metaInfo.tableMetadata.md_deletable || metaInfo.tableMetadata.md_detail_action || metaInfo.tableMetadata.md_clonable || metaInfo.tableMetadata.md_inline_edit">
      //         <ng-container >
      //         <wuic-data-action-button-lazy *ngIf="(actionButtonRowIsVisible || actionButtonRowIsVisible(rowIndex)) || !isListVirtualizationEnabled()" [data]="rowData" [metaInfo]="metaInfo" [datasource]="datasource"></wuic-data-action-button-lazy>
      //         </ng-container>
      //     </td>
      //     <td *ngFor="let col of columns | visibleFieldList" [ngClass]="getCellClasses(col.metaColumn, rowData)" (click)="onRowSelect($event, rowData)" (focusout)="onCellFocusOut($event, rowData, col.metaColumn)">
      //         <wuic-field-editor-lazy *ngIf="rowData.__is_editing && !col.metaColumn.mc_hide_in_edit" [record]="rowData.__observable" [field]="col.metaColumn" [metaInfo]="metaInfo" [datasource]="datasource" [onInlineCellValueChange]="onInlineCellEditorValueChange"></wuic-field-editor-lazy>
      //         <ng-container *ngIf="!rowData.__is_editing">
      //           <ng-container [ngSwitch]="col.metaColumn.mc_nome_colonna">
      //             <ng-container *ngSwitchDefault>
      //               <span *ngIf="col.metaColumn.mc_ui_column_type != 'upload' && col.metaColumn.mc_ui_column_type != 'color' && !col.metaColumn.mc_logic_allow_navigation" class='list-grid-cell-text-content'>
      //                 {{ rowData | formatGridViewValue: col.metaColumn }}
      //               </span>

      //               <a *ngIf="col.metaColumn.mc_logic_allow_navigation" [href]="'#/' + col.metaColumn.mc_ui_lookup_entity_name + '/list/' + col.metaColumn.mc_ui_lookup_dataValueField + '||eq||' + rowData[col.metaColumn.mc_nome_colonna]" [attr.target]="col.metaColumn.mc_logic_navigate_new_window ? '_blank' : null">{{ rowData | formatGridViewValue: col.metaColumn }}</a>

      //               <wuic-image-wrapper-lazy *ngIf="col.metaColumn.mc_ui_column_type == 'upload' && rowData[col.field] && col.metaColumn.isImageUpload" [preview]="true" [src]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData : true" [alt]="rowData[col.field]" [previewImageSrc]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData" [alt]="rowData[col.field]" [width]="col.metaColumn.thumbWidth ? col.metaColumn.thumbWidth : 50" [height]="col.metaColumn.thumbHeight ? col.metaColumn.thumbHeight : 50"></wuic-image-wrapper-lazy>

      //               <a *ngIf="col.metaColumn.mc_ui_column_type == 'upload' && rowData[col.field] && !col.metaColumn.isImageUpload" [href]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData" target="_blank"><img [src]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData : true" height="50" width="50" /></a>

      //               <div *ngIf="col.metaColumn.mc_ui_column_type == 'color' && rowData[col.field]" class="grid-color-cell" [ngStyle]="{backgroundColor: rowData[col.field]}"></div>
      //             </ng-container>
      //           </ng-container>
      //         </ng-container>
      //     </td>
      // `,
      // schedulerEventTemplate: `<div class="scheduler-item"><wuic-data-action-button-lazy [data]="rowData.extendedProps" [metaInfo]="metaInfo" [datasource]="datasource" [simplified]="true"></wuic-data-action-button-lazy><span class="item-description">{{rowData.title}}</span> </div>`,
      // mapEventTemplate: `<div class="map-info"><span class="map-info-title" [innerHTML]="rowData | callback2: getDescription"></span><br/><wuic-data-action-button-lazy [data]="rowData.record" [metaInfo]="metaInfo" [datasource]="datasource" [simplified]="true"></wuic-data-action-button-lazy></div>`,
      // treeItemTemplate: `<table><tr><td><wuic-data-action-button-lazy [data]="rowData.data" [metaInfo]="metaInfo" [datasource]="datasource"></wuic-data-action-button-lazy></td><td><b>{{ rowData.label }}</b></td></tr></table>`
    });

    // Example of databound widget / action registration at runtime:
    // MetadataProviderService.customRepeaterComponents = [forwardRef(() => CustomListComponent)]
    MetadataProviderService.widgetDefinition.archetypes['customlist'] = { component: CustomListComponent, designerOptions: null };

    //// Example of databound widget override at runtime:
    //MetadataProviderService.widgetDefinition.archetypes['list'] = { markup: '<span>CIAO</span>', component: null, designerOptions: null };

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

    //// Example of editor widget override:
    // MetadataProviderService.widgetMap['text'] = { component: CustomTextFieldComponent };

    // // Example of editor widget registration:
    // MetadataProviderService.widgetMap['my-text'] = { component: CustomTextFieldComponent };

    //Example of custom designer bindable-component and tool registration:
    MetadataProviderService.customDesignerComponents = [CustomListComponent]
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
    // Force CD: dynamic import resolve avviene in una microtask zone-patched,
    // ma in alcune condizioni (prima emissione router, race con
    // showFirstRunInstall che ri-monta il subtree dell'app shell) il change
    // non viene propagato al template prima che Angular entri in stabile.
    // Risultato: al refresh della pagina il metaMenuComponent resta null nel
    // render anche se la property e' popolata, e il menu orizzontale non
    // appare. detectChanges forza il re-eval di *ngIf="metaMenuComponent"
    // dopo l'assignment. Idempotente/economico (CD locale sul componente).
    this.cdr.detectChanges();
  }

  ngAfterContentInit(): void {
  }

  ngOnDestroy(): void {
    this.busySub?.unsubscribe();
    // this.notificationRealtime.disconnect();
  }

  ngOnInit(): void {
    // First-run translations (bundled, NO backend call) — registrate prima che il
    // wizard di installazione si mostri. Motivazione: il first-run gira con DB non
    // ancora inizializzato, quindi TranslationManagerService.loadTranslations()
    // (che POST-a su MetaService.GetTranslation) fallisce o ritorna vuoto. Per i
    // testi critici del wizard — tooltip con tempi di setup RAG — bundlamo qui le
    // traduzioni delle 5 lingue gestite cosi' il pipe `| translate` risolve
    // comunque, a prescindere dalla disponibilita' del backend.
    //
    // `merge=true` (3o argomento di setTranslation) preserva eventuali chiavi gia'
    // caricate dal backend senza sovrascriverle: se in futuro `firstrun.rag.*` sara'
    // in DB, quel valore viene mantenuto e prevale su questo bundle.
    this.registerFirstRunTranslations();

    this.busySub?.unsubscribe();
    this.busySub = this.isBusy.subscribe((v) => {
      queueMicrotask(() => { this.busyVisible = !!v; });
    });

    // Pre-load license status so *wuicFeature directives and FeatureRouteGuard
    // have an up-to-date snapshot as soon as possible after the first render.
    // Moved from app.config.ts provideAppInitializer because that caused NG0200
    // circular DI (HTTP call inside APP_INITIALIZER triggers authExpiredInterceptor
    // → inject(AuthSessionService) before the root injector is fully built).
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

    this.bootstrapFirstRun();
    this.patchConfirmDialogA11y();
    // this.initNotificationsRealtime();
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

  /**
   * Registra le traduzioni bundle-side per i testi del first-run wizard (e in
   * particolare i tooltip con i tempi stimati di setup RAG). Si chiama in
   * ngOnInit, prima che il template risolva i `| translate` pipe.
   *
   * Deve contenere le stesse lingue gestite dal framework lato docs/menu: it-IT,
   * en-US, fr-FR, es-ES, de-DE. Lingue non gestite ricadono sul fallback
   * `defaultLang` di ngx-translate (impostato da TranslationManagerService).
   */
  private registerFirstRunTranslations(): void {
    const bundles: Record<string, any> = {
      'it-IT': {
        firstrun: {
          rag: {
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
          }
        }
      },
      'en-US': {
        firstrun: {
          rag: {
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
          }
        }
      },
      'fr-FR': {
        firstrun: {
          rag: {
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
          }
        }
      },
      'es-ES': {
        firstrun: {
          rag: {
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
          }
        }
      },
      'de-DE': {
        firstrun: {
          rag: {
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
          }
        }
      }
    };

    for (const [lang, strings] of Object.entries(bundles)) {
      // merge=true: preserva eventuali chiavi gia' caricate dal backend
      this.translate.setTranslation(lang, strings, true);
    }

    // Sanity: se ngx-translate non ha default lang impostato (DB offline al
    // first-run), puntiamo a una lingua derivata dal browser, cadendo su it-IT.
    if (!this.translate.getDefaultLang()) {
      const browserLang = (navigator.language || 'it-IT');
      const resolvedLang = Object.keys(bundles).find(l => l.toLowerCase() === browserLang.toLowerCase())
        || Object.keys(bundles).find(l => l.startsWith(browserLang.substring(0, 2)))
        || 'it-IT';
      this.translate.setDefaultLang(resolvedLang);
      void this.translate.use(resolvedLang);
    }
  }

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
    if (!conn.userId || !conn.password) {
      this.firstRunError = 'Stringa DataSQLConnection non valida: servono almeno user e password.';
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
      const endpoint = `${appSettings.global_root_url}MetaService.configure_wuic`;
      const realPath = (this.firstRunRealPath || '').trim();

      await firstValueFrom(this.http.post(endpoint, {
        license_email: 'first-run@local',
        rdbDBMS: dbms,
        conn_datasource: conn.dataSource,
        port: conn.port,
        conn_database_name: selectedDataDbName,
        conn_user_id: conn.userId,
        conn_password: conn.password,
        conn_data_base_connection_string: dataBaseConnection,
        preScaffoldDB: true,
        rdbDBMSMeta: dbms,
        conn_datasource_meta: conn.dataSource,
        portMeta: conn.port,
        conn_metadata_db_name: selectedMetadataDbName,
        conn_user_id_meta: conn.userId,
        conn_password_meta: conn.password,
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
        // Auto-scaffold the existing data DB only when the operator opted in via the
        // "Esegui scaffold automatico" checkbox AND we are NOT in tutorial mode (the
        // tutorial bootstrap script already ships fully populated metadata tables).
        scaffoldExistingDatabase: (!isTutorialMode && this.firstRunForm.scaffoldExistingDatabase) ? 'true' : 'false',
        adminUsername,
        adminPassword,
        // Tag IETF della lingua iniziale (es. 'it-IT'). Scritta su utenti.language
        // dall'InsertFirstRunAdminUser; il frontend la applica a ngx-translate al
        // primo login via UserInfoService.getuserInfo().lingua.
        adminLanguage: this.firstRunForm.adminLanguage,
        // Opzione RAG: il backend, se `installRag === 'true'`, esegue
        // scripts/rag-setup.ps1 (winget Python + venv + deps + avvio server)
        // dopo l'install DB/metadata, riflettendo le 4 fasi nel progress
        // tracker. `useCuda` e `anthropicApiKey` passati come flag al ps1.
        installRag: this.firstRunForm.installRag ? 'true' : 'false',
        useCuda: this.firstRunForm.useCuda ? 'true' : 'false',
        anthropicApiKey: (this.firstRunForm.anthropicApiKey || '').trim()
      }));

      await this.clearClientStateForFirstRunLogin();

      // The successful configure_wuic call flips AppSettings.firstRun -> false in
      // appsettings.json on disk. ASP.NET Core's IConfigurationRoot has reloadOnChange=true
      // (Program.cs), so the file watcher fires and ANCM (in-process hosting model)
      // restarts the worker process. During those 1-3 seconds the IIS site responds
      // 503 "Application Shutting Down" to every request. If we redirect to /login
      // immediately the user lands on a 503 error page that looks like a deploy failure.
      //
      // Sentinel poll: hammer the anonymous /api/Meta/FirstRunStatus endpoint (which
      // doesn't need a session and is already used by the bootstrap flow) until it
      // returns 200 again. That confirms the worker is back up and the next page load
      // will succeed. Cap the wait at ~30s; after the cap we redirect anyway and let
      // the user retry manually if the restart took longer than expected.
      //
      // IMPORTANTE: NON flippare showFirstRunInstall = false prima di waitForBackendReady,
      // altrimenti nei 1-3s di restart del worker l'app torna alla shell normale e mostra
      // la login page con URL pulito. L'utente pensa che il setup sia finito, inizia a
      // digitare username/password, e poi viene un location.assign che fa full reload →
      // form svuotato. Lasciando la UI di install visibile (con il progress al 100%)
      // l'utente non prova a loggarsi prematuramente.
      await this.waitForBackendReady();

      const scaffoldRoute = '/scaffolding/dialog/1556';
      const loginRedirectUrl = `/?redirect=${encodeURIComponent(scaffoldRoute)}&firstRunLogin=1`;
      globalThis.location.assign(loginRedirectUrl);
      return;
    } catch (error: any) {
      this.firstRunError = this.extractErrorMessage(error);

      if (!confirmDropExistingMetadataDb && this.firstRunError.includes('METADATA_DB_EXISTS_CONFIRM_REQUIRED')) {
        const metadataDbName = selectedMetadataDbName || 'metadataDB';
        const promptResult = await WtoolboxService.promptDialog('Conferma ricreazione metadata DB', [
          {
            name: 'confirmDrop',
            caption: `Il database metadati '${metadataDbName}' esiste già. Vuoi eliminarlo e ricrearlo?`,
            type: 'dictionary_radio',
            value: 'no',
            required: true,
            dictionaryData: [
              { label: 'No', value: 'no' },
              { label: 'Sì', value: 'yes' }
            ]
          }
        ], '620px');

        // promptDialog returns the parametric-dialog `record` object as-is. Each field is
        // wrapped in a `BehaviorSubject<any>` (see WtoolboxService.promptDialog: `record[field
        // .name] = new BehaviorSubject<any>(field.value)`), so a naive `String(promptResult
        // .confirmDrop)` would yield "[object Object]" and the check would always fall back
        // to "No". Unwrap the BehaviorSubject explicitly. Also handle the case where
        // promptResult is undefined (operator clicked Cancel) or where the value got mapped
        // to a `{ value: ..., label: ... }` dictionary item shape by the field editor.
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
          return;
        }
      }

      this.messageService.add({ severity: 'error', summary: 'Installazione fallita', detail: this.firstRunError });
    } finally {
      this.firstRunInstalling = false;
      this.stopFirstRunProgressPolling();
    }
  }

  /**
   * Starts a ~500ms polling loop against the public
   * `GET /api/Meta/FirstRunProgress` endpoint and mirrors the file-backed
   * state written by MetaService.FirstRunProgressTracker into
   * `this.firstRunProgress`. The <p-progressBar> in the wizard overlay is
   * bound to this field and updates live as the backend streams through
   * the bootstrap script batches.
   *
   * Transient network errors (worker ANCM restart at the end of
   * configure_wuic, momentary DB lock, etc.) are swallowed — the next
   * tick will retry. The loop is stopped in the finally block of
   * submitFirstRunInstallInternal so it never outlives the HTTP POST.
   */
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
    this.firstRunProgressTimer = setInterval(async () => {
      try {
        const resp = await firstValueFrom(this.http.get<any>(`${appSettings.api_url}Meta/FirstRunProgress`));
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
        // Silently ignore transient failures. The polling loop keeps ticking
        // and will recover on the next successful response. If the backend is
        // down long enough for the configure_wuic POST itself to fail, the
        // outer error handler surfaces the real error to the user.
      }
    }, 500);
  }

  private stopFirstRunProgressPolling(): void {
    if (this.firstRunProgressTimer) {
      clearInterval(this.firstRunProgressTimer);
      this.firstRunProgressTimer = null;
    }
  }

  private async clearClientStateForFirstRunLogin(): Promise<void> {
    try {
      localStorage.clear();
    } catch {
      // Ignore storage cleanup errors to avoid blocking first-run flow.
    }

    try {
      sessionStorage.clear();
    } catch {
      // Ignore storage cleanup errors to avoid blocking first-run flow.
    }

    await this.deleteIndexedDbByName('MetaDB');
    await this.deleteIndexedDbByName('WuicClientSideCrudDB');
  }

  /**
   * Polls an anonymous backend endpoint (/api/Meta/FirstRunStatus) until it returns
   * a successful response, then resolves. Used after `MetaService.configure_wuic`
   * flips firstRun=false in appsettings.json: ASP.NET Core's reloadOnChange watcher
   * triggers an in-process worker restart, IIS responds 503 for ~1-3 seconds, and we
   * must wait for the worker to be back up before redirecting the user to /login —
   * otherwise they land on a "503 Application Shutting Down" error page that looks
   * like a deploy failure. Capped at ~30s to avoid an infinite loop if the restart
   * itself crashes; on timeout we redirect anyway and let the browser surface the
   * real error from the next page load.
   */
  private async waitForBackendReady(): Promise<void> {
    const sentinelUrl = `${appSettings.api_url}Meta/FirstRunStatus`;
    const startedAt = Date.now();
    const timeoutMs = 30_000;
    const intervalMs = 500;

    // Optimistic small delay so we don't hit the very first 503 in the log.
    await new Promise((resolve) => setTimeout(resolve, 500));

    while (Date.now() - startedAt < timeoutMs) {
      try {
        // 200 = worker is back up. Any non-2xx (incl. 503 during restart) throws.
        await firstValueFrom(this.http.get<any>(sentinelUrl));
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
    // Timeout: redirect anyway. The next page load will surface whatever error is
    // really happening (if any).
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

  private async bootstrapFirstRun(): Promise<void> {
    this.firstRunLoading = true;
    this.firstRunError = '';

    try {
      // NOTE: we used to short-circuit here on `hasLegacyAuthCookie()` (presence of the
      // `k-user` cookie) as an optimization to skip the Auth/Me roundtrip. That was wrong:
      // a stale `k-user` cookie left over from a previous session — in particular from a
      // local dev session, which is exactly the situation a developer hits the very first
      // time they open a fresh deploy on the same machine — would silently bypass the
      // first-run wizard and route them straight to the (broken) login page. The cookie
      // itself proves NOTHING about server-side session validity; only Auth/Me does.
      // So always ask the server. The cost is one ~200-500 ms HTTP call on cold start,
      // which is acceptable since this code path runs once per page load.
      const authenticated = await this.isAuthenticatedQuickly();
      if (authenticated) {
        // First-run setup is a pre-login flow; skip checks once the session is authenticated.
        this.showFirstRunInstall = false;
        return;
      }

      // Public endpoint: works before login and allows showing first-run overlay immediately.
      const publicStatus = await firstValueFrom(this.http.get<any>(`${appSettings.api_url}Meta/FirstRunStatus`));
      const settings = this.parseDictionaryResponse(publicStatus);

      const firstRunSetting = settings['firstRun'] ?? settings['first-run'] ?? settings['firstrun'];
      const isFirstRun = this.toBoolean(firstRunSetting);
      this.firstRunRealPath = String(settings['projectDataFolder'] || settings['project-data-folder'] || '').trim();

      const currentDbms = String(settings['dbms'] || '').trim().toLowerCase();
      if (['mssql', 'mysql', 'oracle', 'postgres', 'postgresql'].includes(currentDbms)) {
        this.firstRunForm.dbms = currentDbms === 'postgresql' ? 'postgres' : currentDbms;
      }

      // Backend reports whether the tutorial bootstrap scripts (tutorial-data /
      // tutorial-metadata) are physically present in the deploy and not placeholder
      // stubs. If they're missing (no-tutorial zip variant), strip "Tutorial
      // WideWorldImporters" from the setup mode dropdown so the operator can only
      // pick "DB esistente". If the field is absent (older backend), assume the
      // tutorial IS available and let the runtime resolver fail loudly if it isn't.
      const tutorialFlag = settings['tutorialAvailable'] ?? settings['tutorialavailable'];
      this.firstRunTutorialAvailable = tutorialFlag === undefined ? true : this.toBoolean(tutorialFlag);
      if (!this.firstRunTutorialAvailable) {
        this.firstRunSetupModeOptions = [{ label: 'DB esistente', value: 'existing' }];
        this.firstRunForm.setupMode = 'existing';
      }

      // Pre-flight Python check. Il backend prova `python --version` sul PATH del
      // worker IIS e ritorna pythonInstalled=true se la 3.12.x e' presente.
      // In quel caso il RAG setup salta lo step 1/4 (install) e va diretto al
      // venv; in caso contrario dobbiamo obbligare l'operatore a preinstallare
      // Python (l'auto-install fallisce su Windows Server non-admin).
      // Se il backend e' vecchio e non ritorna il flag, fallback permissivo (true)
      // per mantenere backward-compat.
      const pythonFlag = settings['pythonInstalled'] ?? settings['pythoninstalled'];
      this.firstRunPythonInstalled = pythonFlag === undefined ? true : this.toBoolean(pythonFlag);
      const pythonSupportedFlag = settings['pythonSupported'] ?? settings['pythonsupported'];
      this.firstRunPythonSupported = pythonSupportedFlag === undefined
        ? this.firstRunPythonInstalled // backend vecchio: se installato, lo trattiamo come supported
        : this.toBoolean(pythonSupportedFlag);
      this.firstRunPythonVersion = String(settings['pythonVersion'] || settings['pythonversion'] || '').trim();
      if (!this.firstRunPythonInstalled) {
        // Forza off la checkbox: se l'operatore aveva spuntato e poi reload dello
        // status lo vede mancante, non vogliamo lasciare uno stato inconsistente.
        this.firstRunForm.installRag = false;
      }

      if (!isFirstRun) {
        this.showFirstRunInstall = false;
        return;
      }

      // Filter the DBMS dropdown to only the providers actually available on this deploy.
      // mssql is implicit (Microsoft.Data.SqlClient is a hard dep of WuicCore); the optional
      // drop-in providers (mysql.dll, postgresql.dll, oracle.dll) need to be physically
      // present in the publish output for the wizard to offer them. The backend probes the
      // candidate folders and returns the matching list — see MetaController.AvailableDbms.
      try {
        const availableResp = await firstValueFrom(this.http.get<any>(`${appSettings.api_url}Meta/AvailableDbms`));
        const availableList: Array<{ id: string; label: string }> = availableResp?.dbms || [];
        if (Array.isArray(availableList) && availableList.length > 0) {
          // Backend uses 'postgresql' as the canonical id; the frontend internally uses
          // 'postgres' as the form value (mapped to 'postgresql' before calling APIs in
          // normalizeDbms). Translate here so the dropdown values match firstRunForm.dbms.
          const filtered = availableList.map(entry => {
            const id = String(entry?.id || '').trim().toLowerCase();
            const label = String(entry?.label || id).trim();
            const value = id === 'postgresql' ? 'postgres' : id;
            return { label, value };
          }).filter(opt => !!opt.value);
          if (filtered.length > 0) {
            this.firstRunDbmsOptions = filtered;
            // Snap the form to the first available option if the current selection is no
            // longer valid (e.g. backend says only mssql is available but the form had
            // dbms='mysql' from a previous session).
            if (!filtered.some(opt => opt.value === this.firstRunForm.dbms)) {
              this.firstRunForm.dbms = filtered[0].value;
            }
          }
        }
      } catch {
        // If the AvailableDbms endpoint is missing (older backend) or fails, leave the
        // hardcoded list — the user will see all four entries and the backend will reject
        // with a clear error if the chosen provider isn't actually deployed.
      }

      this.showFirstRunInstall = true;
      await this.loadDefaultConnectionString(settings);
    } catch {
      try {
        // Legacy fallback for environments where Meta/FirstRunStatus is unavailable.
        const appSettingsResponse = await firstValueFrom(this.http.post<any>(`${appSettings.global_root_url}MetaService.getAppSettings`, {}));
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
          return;
        }

        this.showFirstRunInstall = true;
        await this.loadDefaultConnectionString(settings);
      } catch {
        // If install status cannot be resolved, keep normal app flow.
        this.showFirstRunInstall = false;
      }
    } finally {
      this.firstRunLoading = false;
    }
  }

  private async isAuthenticatedQuickly(): Promise<boolean> {
    try {
      const me = await Promise.race<any>([
        firstValueFrom(this.http.get<any>(`${appSettings.api_url}Auth/Me`, { withCredentials: true })),
        new Promise((resolve) => setTimeout(() => resolve(null), 750))
      ]);
      return !!me?.authenticated;
    } catch {
      // Never block startup when auth endpoints are unavailable.
      return false;
    }
  }

  private async loadDefaultConnectionString(settings: Record<string, any>): Promise<void> {
    // During first-run the user is not authenticated yet, so avoid admin-only APIs (MetaService.getConnections).
    const fallbackConn = String(settings['connection'] || '').trim();
    const fallbackDb = String(settings['DataDBName'] || settings['datadbname'] || '').trim();
    const fallbackMetaDb = String(settings['metaDataDBName'] || settings['metadataDbName'] || settings['MetaDataDBName'] || this.firstRunForm.metadataDbName || 'MetadataCRM').trim();
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
      password: parsed.password
    });
    this.firstRunForm.dataDbName = preferredDatabaseName;

    this.firstRunDataDbOptions = [];
    this.firstRunConnectionValid = false;
  }

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
            // Fall through to the original error handling below.
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
    const endpoint = `${appSettings.global_root_url}MetaService.get_database_names`;
    const payload = await firstValueFrom(this.http.post<any>(endpoint, {
      rdbDBMS: dbms,
      connectionString: baseConnection
    }));

    return this.parseStringArrayResponse(payload)
      .map(x => String(x || '').trim())
      .filter(x => !!x);
  }

  private parseConnectionsResponse(payload: any): any[] {
    const raw = this.unwrapPayload(payload);
    if (Array.isArray(raw)) {
      return raw;
    }

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    return [];
  }

  private parseDictionaryResponse(payload: any): Record<string, any> {
    const raw = this.unwrapPayload(payload);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, any>;
    }

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        return {};
      }
    }

    return {};
  }

  private parseStringArrayResponse(payload: any): string[] {
    const raw = this.unwrapPayload(payload);
    if (Array.isArray(raw)) {
      return raw.map(x => String(x ?? ''));
    }

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(x => String(x ?? '')) : [];
      } catch {
        return [];
      }
    }

    return [];
  }

  private unwrapPayload(payload: any): any {
    if (payload && typeof payload === 'object') {
      if ('d' in payload) {
        return payload.d;
      }
      if ('value' in payload) {
        return payload.value;
      }
    }

    return payload;
  }

  private normalizeDbms(value: string): string {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'postgres') {
      return 'postgresql';
    }

    return v;
  }

  private toBoolean(value: any): boolean {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'si';
  }

  private parseConnectionString(connectionString: string): {
    dataSource: string;
    port: string;
    databaseName: string;
    userId: string;
    password: string;
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

    let dataSource = dataSourceRaw;
    let port = explicitPort;
    if (!port && dataSourceRaw.includes(',')) {
      const chunks = dataSourceRaw.split(',');
      dataSource = (chunks[0] || '').trim();
      port = (chunks[1] || '').trim();
    }

    return {
      dataSource,
      port,
      databaseName: dbName,
      userId,
      password
    };
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
        if (['initial catalog', 'database', 'dbq', 'service name'].includes(key)) {
          continue;
        }

        // Avoid carrying attached file DB definitions in first-run base connection.
        if (dbms === 'mssql' && (key === 'attachdbfilename' || key === 'initial file name')) {
          continue;
        }

        keep.push(part);
      }

      return keep.join(';');
    } catch {
      return '';
    }
  }

  private buildProviderConnectionString(normalizedDbms: string, conn: {
    dataSource: string;
    port: string;
    databaseName: string;
    userId: string;
    password: string;
  }): string {
    const dbms = this.normalizeDbms(normalizedDbms);
    const dataSource = String(conn.dataSource || '').trim();
    const port = String(conn.port || '').trim();
    const databaseName = String(conn.databaseName || '').trim();
    const userId = String(conn.userId || '').trim();
    const password = String(conn.password || '').trim();

    const parts: string[] = [];

    if (dbms === 'mssql') {
      let serverValue = dataSource;
      if (serverValue && port && !serverValue.includes(',')) {
        serverValue = `${serverValue},${port}`;
      }

      if (serverValue) {
        parts.push(`data source=${serverValue}`);
      }
      parts.push('integrated security=False');
      if (userId) {
        parts.push(`User ID=${userId}`);
      }
      if (password) {
        parts.push(`Password=${password}`);
      }
      parts.push('Persist Security Info=true');
      parts.push('Encrypt=False');
      parts.push('TrustServerCertificate=True');
      if (databaseName) {
        parts.push(`initial catalog=${databaseName}`);
      }

      return parts.join(';');
    }

    if (dbms === 'mysql' || dbms === 'postgresql') {
      if (dataSource) {
        parts.push(`server=${dataSource}`);
      }
      if (userId) {
        parts.push(`user id=${userId}`);
      }
      if (password) {
        parts.push(`password=${password}`);
      }
      parts.push('persist security info=True');
      if (databaseName) {
        parts.push(`database=${databaseName}`);
      }
      if (port) {
        parts.push(`Port=${port}`);
      }

      return parts.join(';');
    }

    if (dbms === 'oracle') {
      if (dataSource) {
        parts.push(`data source=${dataSource}`);
      }
      if (userId) {
        parts.push(`User ID=${userId}`);
      }
      if (password) {
        parts.push(`Password=${password}`);
      }
      if (databaseName) {
        parts.push(`service name=${databaseName}`);
      }
      if (port) {
        parts.push(`Port=${port}`);
      }

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
    const segments = (connectionString || '')
      .split(';')
      .map(part => part.trim())
      .filter(part => !!part);

    const filtered: string[] = [];
    for (const part of segments) {
      const idx = part.indexOf('=');
      if (idx <= 0) {
        filtered.push(part);
        continue;
      }

      const key = part.substring(0, idx).trim().toLowerCase();
      if (key === 'encrypt' || key === 'trustservercertificate') {
        continue;
      }

      filtered.push(part);
    }

    filtered.push('Encrypt=False');
    filtered.push('TrustServerCertificate=True');
    return filtered.join(';');
  }

  private getConnValue(map: Map<string, string>, keys: string[]): string {
    for (const k of keys) {
      const value = map.get(k.toLowerCase());
      if (value !== undefined) {
        return value;
      }
    }

    return '';
  }

  private extractErrorMessage(error: any): string {
    const fromBackend = error?.error;
    if (typeof fromBackend === 'string' && fromBackend.trim()) {
      return fromBackend;
    }

    if (fromBackend && typeof fromBackend === 'object') {
      // The AsmxProxy invocation envelope wraps the real exception in a few different
      // fields: `message` is the long "AsmxProxy invocation failed..." outer message,
      // `rootMessage` is the inner exception's Message (e.g.
      // "METADATA_DB_EXISTS_CONFIRM_REQUIRED:metadataDB"), `rootType` is its CLR type.
      // Some callers (notably the firstRun wizard) need to detect specific token strings
      // in the inner message to drive UX, so we concatenate the two — `rootMessage` is
      // appended even when `message` is present, otherwise the wizard never sees the
      // real cause and the "exists, drop and recreate?" dialog never opens.
      const parts: string[] = [];
      const detail = fromBackend.message || fromBackend.error || fromBackend.title;
      if (detail) parts.push(String(detail));
      const rootMessage = (fromBackend as any).rootMessage;
      if (rootMessage && (!detail || !String(detail).includes(String(rootMessage)))) {
        parts.push(String(rootMessage));
      }
      if (parts.length > 0) {
        return parts.join(' | ');
      }
    }

    return String(error?.message || 'Errore sconosciuto durante il first-run setup.');
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
    const linkElement = document.querySelector('html') as HTMLElement;
    if (linkElement.classList.contains('theme-dark')) {
      linkElement.classList.remove('theme-dark');
      this.isDarkMode = false;
      localStorage.setItem(AppComponent.ThemeModeStorageKey, 'light');
    } else {
      linkElement.classList.add('theme-dark');
      this.isDarkMode = true;
      localStorage.setItem(AppComponent.ThemeModeStorageKey, 'dark');
    }
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
}




















