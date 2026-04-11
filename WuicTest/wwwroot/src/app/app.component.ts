import { AfterContentInit, Component, forwardRef, Injector, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { utility } from './classes/utility';
import { AsyncPipe, CommonModule, NgClass, NgComponentOutlet, NgFor, NgIf, NgStyle } from '@angular/common';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { ProgressBarModule } from 'primeng/progressbar';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TranslateModule } from '@ngx-translate/core';

import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';

import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Subscription } from 'rxjs';

import { environment as appSettings } from './environments/environment';
import { DialogService } from 'primeng/dynamicdialog';


import { PrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import Lara from '@primeng/themes/lara';
import Nora from '@primeng/themes/nora';
import Material from '@primeng/themes/material';
import { updatePrimaryPalette, usePreset } from '@primeuix/styled';
import { WtoolboxService, MetadataProviderService, GlobalHandler, CustomException, TranslationManagerService, AuthSessionService, getThemeOptions, PRIMARY_PALETTES, ThemeOption } from './wuic-bridges/core';
import { ImageWrapperComponent } from './wuic-bridges/ui';
import { CustomListComponent } from './component/custom-list/custom-list.component';

// import { CustomTextFieldComponent } from './component/field/custom-text-field/custom-text-field.component';
// import { CustomListComponent } from './component/custom-list/custom-list.component';

@Component({
  selector: 'app-root',
  imports: [AsyncPipe, CommonModule, RouterOutlet, NgComponentOutlet, ToggleSwitchModule, SelectModule, CheckboxModule, ProgressBarModule, FormsModule, DialogModule, ButtonModule, TranslateModule, ToastModule, ConfirmDialogModule],
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
    scaffoldExistingDatabase: false
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
    private injector: Injector
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

    //custom functions
    WtoolboxService.myFunctions['utility'] = new utility();
    void this.configureWidgetRuntimeMetadata();

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
  }

  ngAfterContentInit(): void {
  }

  ngOnDestroy(): void {
    this.busySub?.unsubscribe();
    // this.notificationRealtime.disconnect();
  }

  ngOnInit(): void {
    this.busySub?.unsubscribe();
    this.busySub = this.isBusy.subscribe((v) => {
      queueMicrotask(() => { this.busyVisible = !!v; });
    });
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
        adminPassword
      }));

      this.showFirstRunInstall = false;
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




















