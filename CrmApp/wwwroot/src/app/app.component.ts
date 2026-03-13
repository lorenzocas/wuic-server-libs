import { AfterContentInit, Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { utility } from './classes/utility';
import { AsyncPipe, NgClass, NgFor, NgIf, NgStyle } from '@angular/common';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TranslateModule } from '@ngx-translate/core';

import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';

import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

import { environment as appSettings } from './environments/environment';
import { DialogService } from 'primeng/dynamicdialog';


import { PrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import Lara from '@primeng/themes/lara';
import Nora from '@primeng/themes/nora';
import Material from '@primeng/themes/material';
import { updatePrimaryPalette, usePreset } from '@primeuix/styled';
import { LazyMetaMenuComponent } from 'wuic-framework-lib';
import { WtoolboxService } from 'wuic-framework-lib';
import { MetadataProviderService } from 'wuic-framework-lib';
import { GlobalHandler } from 'wuic-framework-lib';
import { LazyDataSourceComponent } from 'wuic-framework-lib';
import { LazyDataActionButtonComponent } from 'wuic-framework-lib';
import { CallbackPipe } from 'wuic-framework-lib';
import { IsSelectedRowPipe } from 'wuic-framework-lib';
import { VisibleFieldListPipe } from 'wuic-framework-lib';
import { CustomException } from 'wuic-framework-lib';
import { TranslationManagerService } from 'wuic-framework-lib';
import { FormatGridViewValuePipe } from 'wuic-framework-lib';
import { LazyFieldEditorComponent } from 'wuic-framework-lib';
import { CallbackPipe2 } from 'wuic-framework-lib';
import { GetSrcUploadPreviewPipe } from 'wuic-framework-lib';
import { LazyImageWrapperComponent } from 'wuic-framework-lib';
import {
  loadBooleanEditorComponent,
  loadButtonEditorComponent,
  loadCodeAreaEditorComponent,
  loadColorEditorComponent,
  loadDateEditorComponent,
  loadDictionaryEditorComponent,
  loadHtmlEditorComponent,
  loadLookupEditorComponent,
  loadNumberEditorComponent,
  loadPropertyArrayEditorComponent,
  loadPropertyObjectEditorComponent,
  loadTextAreaEditorComponent,
  loadTextEditorComponent,
  loadTreeViewSelectorComponent,
  loadUploadEditorComponent
} from 'wuic-framework-lib';

@Component({
  selector: 'app-root',
  imports: [AsyncPipe, RouterOutlet, LazyMetaMenuComponent, ToggleSwitchModule, SelectModule, FormsModule, DialogModule, ButtonModule, TranslateModule, ToastModule, ConfirmDialogModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  providers: [MessageService, ConfirmationService, DialogService, GlobalHandler]
})
export class AppComponent implements OnInit, AfterContentInit {
  private static readonly ThemeStorageKey = 'wuic-selected-theme';
  private static readonly ThemeModeStorageKey = 'wuic-theme-mode';
  private readonly primaryPalettes: Record<string, Record<string, string>> = {
    blue: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554' },
    emerald: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22' },
    violet: { 50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065' },
    amber: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03' },
    cyan: { 50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75', 900: '#164e63', 950: '#083344' },
    teal: { 50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e' },
    indigo: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81', 950: '#1e1b4b' },
    rose: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337', 950: '#4c0519' },
    pink: { 50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899', 600: '#db2777', 700: '#be185d', 800: '#9d174d', 900: '#831843', 950: '#500724' },
    lime: { 50: '#f7fee7', 100: '#ecfccb', 200: '#d9f99d', 300: '#bef264', 400: '#a3e635', 500: '#84cc16', 600: '#65a30d', 700: '#4d7c0f', 800: '#3f6212', 900: '#365314', 950: '#1a2e05' }
  };
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

  isBusy: BehaviorSubject<boolean>;
  fixBusy: boolean = false;
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
  firstRunForm = {
    dbms: 'mssql',
    dataConnectionString: '',
    dataDbName: '',
    metadataDbName: 'metadataDB'
  };
  firstRunDataDbOptions: { label: string; value: string }[] = [];
  private firstRunRealPath = '';
  selectedTheme = 'aura-blue';
  availableThemes = [
    { label: 'Aura Blue', value: 'aura-blue', preset: 'aura', primary: 'blue' },
    { label: 'Aura Emerald', value: 'aura-emerald', preset: 'aura', primary: 'emerald' },
    { label: 'Aura Violet', value: 'aura-violet', preset: 'aura', primary: 'violet' },
    { label: 'Aura Amber', value: 'aura-amber', preset: 'aura', primary: 'amber' },
    { label: 'Aura Cyan', value: 'aura-cyan', preset: 'aura', primary: 'cyan' },
    { label: 'Aura Teal', value: 'aura-teal', preset: 'aura', primary: 'teal' },
    { label: 'Aura Indigo', value: 'aura-indigo', preset: 'aura', primary: 'indigo' },
    { label: 'Aura Rose', value: 'aura-rose', preset: 'aura', primary: 'rose' },
    { label: 'Lara Blue', value: 'lara-blue', preset: 'lara', primary: 'blue' },
    { label: 'Lara Emerald', value: 'lara-emerald', preset: 'lara', primary: 'emerald' },
    { label: 'Lara Violet', value: 'lara-violet', preset: 'lara', primary: 'violet' },
    { label: 'Lara Amber', value: 'lara-amber', preset: 'lara', primary: 'amber' },
    { label: 'Lara Cyan', value: 'lara-cyan', preset: 'lara', primary: 'cyan' },
    { label: 'Lara Teal', value: 'lara-teal', preset: 'lara', primary: 'teal' },
    { label: 'Lara Indigo', value: 'lara-indigo', preset: 'lara', primary: 'indigo' },
    { label: 'Lara Pink', value: 'lara-pink', preset: 'lara', primary: 'pink' },
    { label: 'Nora Blue', value: 'nora-blue', preset: 'nora', primary: 'blue' },
    { label: 'Nora Emerald', value: 'nora-emerald', preset: 'nora', primary: 'emerald' },
    { label: 'Nora Rose', value: 'nora-rose', preset: 'nora', primary: 'rose' },
    { label: 'Nora Lime', value: 'nora-lime', preset: 'nora', primary: 'lime' },
    { label: 'Material Blue', value: 'material-blue', preset: 'material', primary: 'blue' },
    { label: 'Material Violet', value: 'material-violet', preset: 'material', primary: 'violet' },
    { label: 'Material Teal', value: 'material-teal', preset: 'material', primary: 'teal' },
    { label: 'Material Amber', value: 'material-amber', preset: 'material', primary: 'amber' }
  ];

  // @ViewChild('spreadsheet') spreadsheet: any;

  constructor(public messageService: MessageService, public confirmationService: ConfirmationService, private http: HttpClient, private dialogSrv: DialogService, private translationService: TranslationManagerService, public globalHandler: GlobalHandler, private primeng: PrimeNG) {

    WtoolboxService.messageNotificationService = messageService;
    WtoolboxService.confirmationService = confirmationService;
    WtoolboxService.http = http
    WtoolboxService.appSettings = appSettings;
    WtoolboxService.dialogService = dialogSrv;
    WtoolboxService.translationService = translationService;
    WtoolboxService.errorHandler = this.globalHandler;

    GlobalHandler.messageNotification.subscribe((data) => {
      this.currentException = data.exception;
      this.visible = data.show;
    });

    //custom functions
    WtoolboxService.myFunctions['utility'] = new utility();

    //customizable
    Object.assign(MetadataProviderService.widgetDefinition, {
      gridRowImports: [ButtonModule, TableModule, NgFor, NgIf, NgClass, NgStyle, FormsModule, LazyDataActionButtonComponent, LazyDataSourceComponent, VisibleFieldListPipe, CallbackPipe, CallbackPipe2, IsSelectedRowPipe, FormatGridViewValuePipe, GetSrcUploadPreviewPipe, LazyFieldEditorComponent, LazyImageWrapperComponent],
      dynamicFormImports: [NgFor, NgIf, LazyDataActionButtonComponent, LazyDataSourceComponent, VisibleFieldListPipe, TableModule, ButtonModule, LazyFieldEditorComponent]
      // menuParams: {
      //   ulWith: "1200px",
      //   liWidth: "33%",
      //   itemCountThreshold: 6
      // },
      // defaultHeight: "70px",
      // defaultWidth: "100%",
      // defaultFilterWidth: "100px",
      // fieldLabelInline: false,
      // formColumns: 2,
      // lookupServerPageCount: 10,
      //     gridRowTemplate: `
      //     <td *ngIf="metaInfo.tableMetadata.md_nested_grid_routes">
      //        <i (click)="toggleRow(rowData, $event, dt)" class="pi" [ngClass]="{'pi-chevron-down': expanded, 'pi-chevron-right': !expanded }"></i>
      //     </td>
      //     <td *ngIf="metaInfo.tableMetadata.md_multiple_selection">
      //      <!-- <p-tableCheckbox [value]="rowData" /> -->
      //      <input class="p-checkbox-box" type="checkbox" style="margin-left: 15px" (click)="rowSelect(rowData, $event, dt)" [checked]="dt.selection | isSelectedRow : rowData : metaInfo" />
      //     </td>
      //     <td>
      //         <wuic-data-action-button [data]="rowData" [metaInfo]="metaInfo" [datasource]="datasource"></wuic-data-action-button>
      //     </td>
      //     <td *ngFor="let col of columns | visibleFieldList">
      //         <wuic-field-editor *ngIf="rowData.__is_editing" [record]="rowData.__observable" [field]="col.metaColumn" [metaInfo]="metaInfo"></wuic-field-editor>
      //         <ng-container *ngIf="!rowData.__is_editing">
      //           <span *ngIf="col.metaColumn.mc_ui_column_type != 'upload' && col.metaColumn.mc_ui_column_type != 'color'" class='list-grid-cell-text-content'>{{ rowData | formatGridViewValue: col.metaColumn }}</span>
      //           <wuic-image-wrapper *ngIf="col.metaColumn.mc_ui_column_type == 'upload' && rowData[col.field] && col.metaColumn.isImageUpload" [preview]="true" [src]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData : true" [alt]="rowData[col.field]" [previewImageSrc]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData" [alt]="rowData[col.field]" [width]="col.metaColumn.thumbWidth ? col.metaColumn.thumbWidth : 50" [height]="col.metaColumn.thumbHeight ? col.metaColumn.thumbHeight : 50"></wuic-image-wrapper>

      //           <a *ngIf="col.metaColumn.mc_ui_column_type == 'upload' && rowData[col.field] && !col.metaColumn.isImageUpload" [href]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData" target="_blank"><img [src]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData : true" height="50" width="50" /></a>

      //           <div *ngIf="col.metaColumn.mc_ui_column_type == 'color'" [ngStyle]="{backgroundColor: rowData[col.field], width:'20px', height:'20px'}"></div>
      //         </ng-container>
      //     </td>
      // `,
      // schedulerEventTemplate: `<div class="scheduler-item"><wuic-data-action-button [data]="rowData.extendedProps" [simplified]="true" [metaInfo]="metaInfo" [datasource]="datasource" [simplified]="true"></wuic-data-action-button><span class="item-description">{{rowData.title}}</span> </div>`,
      // mapEventTemplate: `<div class="map-info"><span class="map-info-title">{{ rowData | callback2: getDescription }}</span><br/><wuic-data-action-button [data]="rowData" [metaInfo]="metaInfo" [datasource]="datasource" [simplified]="true"></wuic-data-action-button></div>`,
      // treeItemTemplate: `<table><tr><td><wuic-data-action-button [data]="rowData.data" [metaInfo]="metaInfo" [datasource]="datasource"></wuic-data-action-button></td><td><b>{{ rowData.label }}</b></td></tr></table>`
    });

    //customizable
    Object.assign(MetadataProviderService.widgetMap, {
      'text': { loader: loadTextEditorComponent, width: '300px' },
      'txt_area': { loader: loadTextAreaEditorComponent, width: '300px', height: '150px' },
      'number': { loader: loadNumberEditorComponent, width: '300px' },
      'number_boolean': { loader: loadBooleanEditorComponent },
      'boolean': { loader: loadBooleanEditorComponent },
      'lookupByID': { loader: loadLookupEditorComponent, width: '300px' },
      'multiple_check': { loader: loadLookupEditorComponent, width: '300px' },
      'button': { loader: loadButtonEditorComponent },
      'number_slider': { loader: loadNumberEditorComponent },
      'date': { loader: loadDateEditorComponent, width: '300px' },
      'datetime': { loader: loadDateEditorComponent, width: '300px' },
      'time': { loader: loadDateEditorComponent, width: '300px' },
      'dictionary': { loader: loadDictionaryEditorComponent, width: '300px' },
      'dictionary_radio': { loader: loadDictionaryEditorComponent },
      'html_area': { loader: loadHtmlEditorComponent },
      'upload': { loader: loadUploadEditorComponent },
      'code_editor': { loader: loadCodeAreaEditorComponent },
      'color': { loader: loadColorEditorComponent, width: '300px' },
      'point': { loader: loadTextEditorComponent, width: '300px' },
      'polygon': { loader: loadTextEditorComponent, width: '300px' },
      'geometry': { loader: loadTextAreaEditorComponent, width: '300px' },
      'tree': { loader: loadTreeViewSelectorComponent, width: '100%' },
      'field-editor': { component: LazyFieldEditorComponent, hide: true },
      'objectArray': { loader: loadPropertyArrayEditorComponent, hide: true },
      'objectProp': { loader: loadPropertyObjectEditorComponent, hide: true },
    });

  }

  ngAfterContentInit(): void {
    this.isBusy = WtoolboxService.isBusy;
    this.fixBusy = true;
  }

  ngOnInit(): void {
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
  }

  async submitFirstRunInstall(): Promise<void> {
    await this.submitFirstRunInstallInternal(false);
  }

  private async submitFirstRunInstallInternal(confirmDropExistingMetadataDb: boolean): Promise<void> {
    this.firstRunError = '';

    const dbms = this.normalizeDbms(this.firstRunForm.dbms);
    const conn = this.parseConnectionString(this.firstRunForm.dataConnectionString || '');
    const selectedDataDbName = String(this.firstRunForm.dataDbName || conn.databaseName || '').trim();
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

    const dataBaseConnection = this.buildConnectionWithoutDatabase(this.firstRunForm.dataConnectionString || '', dbms);
    if (!dataBaseConnection) {
      this.firstRunError = 'Stringa DataSQLConnection non valida: impossibile derivare la connessione base senza database.';
      return;
    }

    this.firstRunInstalling = true;

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
        conn_metadata_db_name: (this.firstRunForm.metadataDbName || 'metadataDB').trim(),
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
        confirmDropExistingMetadataDb: confirmDropExistingMetadataDb ? 'true' : 'false'
      }));

      this.showFirstRunInstall = false;
      await this.clearClientStateForFirstRunLogin();
      const scaffoldRoute = '/scaffolding/dialog/1556';
      const loginRedirectUrl = `/?redirect=${encodeURIComponent(scaffoldRoute)}&firstRunLogin=1`;
      globalThis.location.assign(loginRedirectUrl);
      return;
    } catch (error: any) {
      this.firstRunError = this.extractErrorMessage(error);

      if (!confirmDropExistingMetadataDb && this.firstRunError.includes('METADATA_DB_EXISTS_CONFIRM_REQUIRED')) {
        const metadataDbName = (this.firstRunForm.metadataDbName || 'metadataDB').trim();
        const confirmDrop = globalThis.confirm(`Il database metadati '${metadataDbName}' esiste gia. Vuoi eliminarlo e ricrearlo?`);
        if (confirmDrop) {
          await this.submitFirstRunInstallInternal(true);
          return;
        }
      }

      this.messageService.add({ severity: 'error', summary: 'Installazione fallita', detail: this.firstRunError });
    } finally {
      this.firstRunInstalling = false;
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
      if (this.hasLegacyAuthCookie()) {
        this.showFirstRunInstall = false;
        return;
      }

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

      if (!isFirstRun) {
        this.showFirstRunInstall = false;
        return;
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

  private hasLegacyAuthCookie(): boolean {
    const cookie = String(globalThis.document?.cookie || '');
    return cookie.split(';').some((part) => part.trim().startsWith('k-user='));
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
    if (fallbackConn && fallbackDb && !/initial\s+catalog\s*=|database\s*=|dbq\s*=/i.test(fallbackConn)) {
      this.firstRunForm.dataConnectionString = `${fallbackConn};initial catalog=${fallbackDb}`;
    } else {
      this.firstRunForm.dataConnectionString = fallbackConn;
    }

    const parsed = this.parseConnectionString(this.firstRunForm.dataConnectionString || '');
    this.firstRunForm.dataDbName = parsed.databaseName || fallbackDb || '';
  }

  onFirstRunConnectionChanged(value: string): void {
    this.firstRunForm.dataConnectionString = value;
    const parsed = this.parseConnectionString(value || '');
    this.firstRunForm.dataDbName = parsed.databaseName || '';
    this.firstRunDataDbOptions = [];
    this.firstRunConnectionValid = false;
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
      const detail = fromBackend.message || fromBackend.error || fromBackend.title;
      if (detail) {
        return String(detail);
      }
    }

    return String(error?.message || 'Errore sconosciuto durante il first-run setup.');
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
      return;
    }

    const preset = this.themePresets[selected.preset];
    if (!preset) {
      return;
    }

    usePreset(preset);

    const palette = this.primaryPalettes[selected.primary];
    if (palette) {
      updatePrimaryPalette(palette);
    }
  }
}


