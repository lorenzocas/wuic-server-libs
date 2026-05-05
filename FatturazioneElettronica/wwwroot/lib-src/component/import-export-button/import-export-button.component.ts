import { ChangeDetectorRef, Component, ElementRef, HostListener, Input, ViewChild } from '@angular/core';
import type { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { Menu, MenuModule } from 'primeng/menu';
import { DialogModule } from 'primeng/dialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TranslateModule } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { DataProviderMetaService } from '../../service/data-provider-meta.service';
import { DataProviderService } from '../../service/data-provider.service';
import { NotificationRealtimeService } from '../../service/notification-realtime.service';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { UserInfoService } from '../../service/user-info.service';
import { WtoolboxService } from '../../service/wtoolbox.service';

@Component({
  selector: 'wuic-import-export-button',
  imports: [ButtonModule, MenuModule, DialogModule, ProgressBarModule, FormsModule, InputTextModule, TranslateModule],
  templateUrl: './import-export-button.component.html',
  styleUrl: './import-export-button.component.scss'
})
export class ImportExportButtonComponent {
  @Input() routeName = '';
  @Input() tableMetadata: any = null;
  /**
   * Callback opzionale fornito dal componente host (list-grid, spreadsheet-list-sf, ...)
   * per leggere il `filterInfo` corrente del datasource al momento del click su Export.
   *
   * Razionale: prima del fix, l'export leggeva il filtro SOLO dalla query string
   * (`?filterInfo=...`), che NON viene aggiornata quando l'utente filtra in-grid via
   * intestazioni di colonna o filter-bar — la URL resta `/cities/list` mentre lo stato
   * filtri vive in `datasource.value.filterInfo`. Risultato: l'XLS scaricato conteneva
   * SEMPRE l'intero dataset ignorando il filtro applicato.
   *
   * Il provider e' una funzione (non un binding `@Input() filterInfo: any`) per garantire
   * che venga letto il valore CORRENTE al click, non quello catturato all'ultima CD.
   * Fallback (provider non bindato): `parseFilterInfoFromQueryString()` per back-compat
   * con eventuali host esterni che non passano il provider.
   */
  @Input() filterInfoProvider?: () => any;
  @ViewChild('importFileInput') importFileInputRef?: ElementRef<HTMLInputElement>;
  private popupMenuItemsCache: MenuItem[] = [];
  private popupMenuItemsCacheKey = '';

  importDialogVisible = false;
  importDialogBusy = false;
  private importSelectedFile: File | null = null;
  importSelectedFileName = '';
  private importSkipSettings = false;
  importOptionsForm: {
    import_type: string;
    commit_level: string;
    use_column_captions: string;
    use_descriptive_fkey: boolean;
    separator: string;
    allowedExtensions: string[];
  } = {
      import_type: 'I',
      commit_level: 'R',
      use_column_captions: 'C',
      use_descriptive_fkey: true,
      separator: ';',
      allowedExtensions: ['xls', 'xlsx']
    };
  importProgressDialogVisible = false;
  importInProgress = false;
  importProgressValue = 0;
  importProgressDetail = '';
  importProgressGuid = '';
  importControlBusy = false;
  private importProgressWsSubscription?: Subscription;
  private importBackgroundMode = false;
  private importMonitoringOnly = false;
  private lastHandledImportResumeGuid = '';
  private importBackgroundNotifiedGuids = new Set<string>();
  private importCancelRequested = false;
  private importStopAndCommitRequested = false;

  exportProgressDialogVisible = false;
  exportProgressValue = 0;
  exportProgressDetail = '';
  exportProgressTotalRecords = 0;
  exportProgressExportedRecords = 0;
  exportProgressGuid = '';
  exportInProgress = false;
  exportControlBusy = false;
  private exportProgressWsSubscription?: Subscription;
  private exportCancelRequested = false;
  private exportStopAndDownloadRequested = false;
  private exportBackgroundMode = false;
  private exportMonitoringOnly = false;
  private lastHandledExportResumeGuid = '';
  private exportBackgroundNotifiedGuids = new Set<string>();

  constructor(
    private route: ActivatedRoute,
    private dataSrv: DataProviderService,
    private dataMetaSrv: DataProviderMetaService,
    private notificationRealtime: NotificationRealtimeService,
    private trslSrv: TranslationManagerService,
    private userInfo: UserInfoService,
    private cdr: ChangeDetectorRef
  ) { }

  private t(key: string, fallback: string): string {
    const translated = this.trslSrv?.instant?.(key);
    return translated && translated !== key ? translated : fallback;
  }

  get canExportXls(): boolean {
    return !this.tableMetadata?.md_hide_export_xls;
  }

  get canImportXls(): boolean {
    return !!this.tableMetadata?.md_importable;
  }

  get label(): string {
    if (this.canExportXls && this.canImportXls) {
      return this.t('import_export.button_label_both', 'Import / Export XLS');
    }
    if (this.canExportXls) {
      return this.t('import_export.button_label_export', 'Export XLS');
    }
    if (this.canImportXls) {
      return this.t('import_export.button_label_import', 'Import XLS');
    }
    return '';
  }

  get icon(): string {
    if (this.canExportXls && this.canImportXls) {
      return 'pi pi-exchange';
    }
    if (this.canExportXls) {
      return 'pi pi-external-link';
    }
    if (this.canImportXls) {
      return 'pi pi-upload';
    }
    return '';
  }

  get hasAnyAction(): boolean {
    return this.canExportXls || this.canImportXls;
  }

  get hasBothActions(): boolean {
    return this.canExportXls && this.canImportXls;
  }

  get popupMenuItems(): MenuItem[] {
    const key = `${this.canExportXls ? 1 : 0}|${this.canImportXls ? 1 : 0}`;
    if (this.popupMenuItemsCacheKey === key) {
      return this.popupMenuItemsCache;
    }

    const items: MenuItem[] = [];
    if (this.canExportXls) {
      items.push({
        label: this.t('import_export.menu_export', 'Export XLS'),
        icon: 'pi pi-external-link',
        command: () => this.exportXls()
      });
    }
    if (this.canImportXls) {
      items.push({
        label: this.t('import_export.menu_import', 'Import XLS/XLSX'),
        icon: 'pi pi-upload',
        command: () => this.openImportFilePicker()
      });
    }

    this.popupMenuItemsCache = items;
    this.popupMenuItemsCacheKey = key;
    return this.popupMenuItemsCache;
  }

  toggleMenu(event: any, menu: Menu): void {
    const domEvent = event?.originalEvent || event;
    menu.toggle(domEvent);
  }

  onPrimaryClick(): void {
    if (this.canExportXls && !this.canImportXls) {
      void this.exportXls();
      return;
    }
    if (this.canImportXls && !this.canExportXls) {
      this.openImportFilePicker();
    }
  }

  private parseFilterInfoFromQueryString(): any {
    const raw = this.route.snapshot?.queryParamMap?.get('filterInfo');
    if (!raw) {
      return { logic: 'AND', filters: [] };
    }
    try {
      return JSON.parse(raw);
    } catch {
      try {
        return JSON.parse(decodeURIComponent(raw));
      } catch {
        return { logic: 'AND', filters: [] };
      }
    }
  }

  async exportXls(): Promise<void> {
    if (this.exportInProgress || !this.canExportXls) {
      return;
    }

    const routeName = String(this.routeName || this.tableMetadata?.md_route_name || '');
    if (!routeName) {
      return;
    }

    const progressGuid = WtoolboxService.uuidv4 ? WtoolboxService.uuidv4() : `${Date.now()}`;
    this.exportInProgress = true;
    this.exportProgressGuid = progressGuid;
    this.exportProgressTotalRecords = 0;
    this.exportProgressExportedRecords = 0;
    this.exportProgressValue = 0;
    this.exportProgressDetail = this.t('import_export.export_preparing', 'Preparazione export...');
    this.exportControlBusy = false;
    this.exportCancelRequested = false;
    this.exportStopAndDownloadRequested = false;
    this.exportBackgroundMode = false;
    this.exportMonitoringOnly = false;
    this.exportProgressDialogVisible = true;
    void this.notificationRealtime.connect(this.userInfo?.getuserInfo?.()?.user_id);
    this.startExportProgressPolling(progressGuid);

    try {
      // Provider host (list-grid, spreadsheet-list-sf) ha la verita' sul filtro
      // corrente live; query string e' fallback per host esterni che non lo bindano.
      const filterInfo = this.filterInfoProvider
        ? (this.filterInfoProvider() ?? { logic: 'AND', filters: [] })
        : this.parseFilterInfoFromQueryString();
      const res: any = await this.dataSrv.exportXls(routeName, filterInfo, progressGuid);
      if (this.exportCancelRequested) {
        return;
      }

      this.exportProgressValue = 100;
      this.exportProgressDetail = this.t('import_export.completed', 'Completato');
      const exportedFile = String(res?.file || '').trim();
      if (exportedFile) {
        const filePath = WtoolboxService.appSettings.file_path + exportedFile;
        window.open(filePath, '_blank');
      }
    } catch (err: any) {
      if (!this.exportCancelRequested) {
        WtoolboxService.messageNotificationService?.add?.({
          severity: 'error',
          summary: this.t('import_export.summary_export', 'Export'),
          detail: String(err?.message || err || this.t('import_export.error_export_xls', 'Errore durante export XLS.'))
        });
      }
    } finally {
      this.stopExportProgressPolling();
      this.exportInProgress = false;
      this.exportMonitoringOnly = false;
      this.exportControlBusy = false;
      this.exportCancelRequested = false;
      this.exportStopAndDownloadRequested = false;
      if (!this.exportBackgroundMode) {
        setTimeout(() => {
          this.exportProgressDialogVisible = false;
        }, 500);
      }
      this.exportBackgroundMode = false;
    }
  }

  async continueExportInBackground(): Promise<void> {
    if ((!this.exportInProgress && !this.exportMonitoringOnly) || this.exportControlBusy) {
      return;
    }
    const guid = String(this.exportProgressGuid || '').trim();
    if (!guid) {
      return;
    }

    this.exportBackgroundMode = true;
    this.exportProgressDialogVisible = false;
    this.stopExportProgressPolling();

    const currentRoute = String(this.routeName || this.tableMetadata?.md_route_name || '');
    const safeRoute = currentRoute ? `/${currentRoute}/list` : '/';
    const total = Math.max(0, Number(this.exportProgressTotalRecords || 0));
    const userId = Number(this.userInfo?.getuserInfo?.()?.user_id || 0);
    const targetJson = JSON.stringify({
      path: `${safeRoute}?exportProgressGuid=${encodeURIComponent(guid)}&exportProgressTotal=${total}`
    });
    const payloadJson = JSON.stringify({
      progressGuid: guid,
      route: currentRoute,
      totalRecords: total
    });
    const detail = currentRoute
      ? this.trslSrv.format(
        this.t('import_export.export_background_route_{0}', 'Export {0} in background. Clicca per riaprire il progress.'),
        currentRoute
      )
      : this.t('import_export.export_background', 'Export in background. Clicca per riaprire il progress.');

    const shouldSendBackgroundNotification = !this.exportMonitoringOnly
      && !this.exportBackgroundNotifiedGuids.has(guid);
    if (shouldSendBackgroundNotification) {
      try {
        if (userId > 0) {
          await this.notificationRealtime.enqueue({
            userId,
            type: 'info',
            message: detail,
            targetJson,
            payloadJson,
            source: 'import-export-button.export.background',
            createdBy: String(userId)
          });
        }
      } catch {
      }
      this.exportBackgroundNotifiedGuids.add(guid);
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'info',
        summary: this.t('import_export.summary_export', 'Export'),
        detail
      });
    }
  }

  async cancelExportTaskFromDialog(): Promise<void> {
    if ((!this.exportInProgress && !this.exportMonitoringOnly) || this.exportControlBusy) {
      return;
    }
    this.exportControlBusy = true;
    this.exportCancelRequested = true;
    this.exportStopAndDownloadRequested = false;
    this.exportMonitoringOnly = false;
    const guid = this.exportProgressGuid;
    const userId = Number(this.userInfo?.getuserInfo?.()?.user_id || 0);
    this.stopExportProgressPolling();
    this.exportProgressDialogVisible = false;
    try {
      await this.dataMetaSrv.cancelExportTask(guid);
      await this.notificationRealtime.dismissProgressNotification(guid, userId);
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'info',
        summary: this.t('import_export.summary_export', 'Export'),
        detail: this.t('import_export.export_cancel_requested', 'Annullamento export richiesto.')
      });
    } finally {
      this.exportControlBusy = false;
    }
  }

  async stopExportAndDownloadPartialFromDialog(): Promise<void> {
    if ((!this.exportInProgress && !this.exportMonitoringOnly) || this.exportControlBusy) {
      return;
    }
    this.exportControlBusy = true;
    this.exportCancelRequested = false;
    this.exportStopAndDownloadRequested = true;
    this.exportMonitoringOnly = false;
    const guid = this.exportProgressGuid;
    const userId = Number(this.userInfo?.getuserInfo?.()?.user_id || 0);
    this.stopExportProgressPolling();
    this.exportProgressDialogVisible = false;
    try {
      await this.dataMetaSrv.stopExportAndDownloadTask(guid);
      await this.notificationRealtime.dismissProgressNotification(guid, userId);
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'info',
        summary: this.t('import_export.summary_export', 'Export'),
        detail: this.t('import_export.export_stop_partial_requested', 'Richiesta stop e download parziale inviata.')
      });
    } finally {
      this.exportControlBusy = false;
    }
  }

  private startExportProgressPolling(progressGuid: string): void {
    this.stopExportProgressPolling();
    const guid = String(progressGuid || '').trim();
    if (!guid) {
      return;
    }
    this.exportProgressWsSubscription = this.notificationRealtime.progressEvents$.subscribe((evt: any) => {
      const evtGuid = String(evt?.guid || '').trim();
      if (!evtGuid || evtGuid !== guid) {
        return;
      }
      const progress = Number(evt?.progress);
      if (!Number.isFinite(progress)) {
        return;
      }
      const totalFromEvent = Number(evt?.totalRecords);
      if (this.exportProgressTotalRecords <= 0 && Number.isFinite(totalFromEvent) && totalFromEvent > 0) {
        this.exportProgressTotalRecords = Math.floor(totalFromEvent);
      }
      this.applyExportProgressValue(progress);
    });
  }

  private stopExportProgressPolling(): void {
    this.exportProgressWsSubscription?.unsubscribe();
    this.exportProgressWsSubscription = undefined;
  }

  private applyExportProgressValue(progress: number): void {
    const normalized = Math.max(0, Math.min(100, Number(progress || 0)));
    this.exportProgressValue = normalized;
    if (this.exportProgressTotalRecords > 0) {
      const exported = Math.min(
        this.exportProgressTotalRecords,
        Math.max(0, Math.round((normalized / 100) * this.exportProgressTotalRecords))
      );
      this.exportProgressExportedRecords = exported;
      this.exportProgressDetail = `${exported} / ${this.exportProgressTotalRecords}`;
    } else {
      this.exportProgressDetail = `${normalized.toFixed(2)}%`;
    }
    if (normalized >= 100 && this.exportMonitoringOnly) {
      this.exportMonitoringOnly = false;
    }
    // Force CD synchronously. detectChanges() (vs markForCheck) propagates the new
    // [value] binding all the way into the p-progressbar OnPush subtree IMMEDIATELY
    // — markForCheck only flags dirty-and-wait, which leaves the dialog frozen if
    // the next macrotask is far away (the WS subscriber arrives via ngZone.run
    // but no other event triggers the next CD pass). User-confirmed: window resize
    // unblocked the dialog; that's CD running on the resize event but not on the WS.
    try { this.cdr.detectChanges(); } catch { /* host destroyed mid-export */ }
  }

  @HostListener('window:wuic-export-progress-resume', ['$event'])
  onExportProgressResumeEvent(event: Event): void {
    const customEvent = event as CustomEvent<any>;
    const detail: any = customEvent?.detail || {};
    const guid = String(detail?.guid || '').trim();
    const totalRaw = Number(detail?.total || 0);
    const total = Number.isFinite(totalRaw) && totalRaw > 0 ? Math.floor(totalRaw) : 0;
    const progressRaw = Number(detail?.progress);
    const initialProgress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, progressRaw)) : null;
    if (!guid) {
      return;
    }
    this.resumeExportProgress(guid, total, initialProgress);
  }

  private resumeExportProgress(guid: string, total: number, initialProgress?: number | null): void {
    this.lastHandledExportResumeGuid = guid;
    this.exportProgressGuid = guid;
    this.exportProgressTotalRecords = total;
    const normalizedInitial = Number.isFinite(Number(initialProgress))
      ? Math.max(0, Math.min(100, Number(initialProgress)))
      : 0;
    this.exportProgressExportedRecords = 0;
    this.exportProgressValue = normalizedInitial;
    if (normalizedInitial > 0) {
      this.applyExportProgressValue(normalizedInitial);
    } else {
      this.exportProgressDetail = total > 0 ? `0 / ${total}` : this.t('import_export.export_monitoring', 'Monitoraggio export...');
    }
    this.exportControlBusy = false;
    this.exportCancelRequested = false;
    this.exportStopAndDownloadRequested = false;
    this.exportMonitoringOnly = true;
    this.exportBackgroundMode = false;
    this.exportProgressDialogVisible = true;
    this.startExportProgressPolling(guid);
  }

  private getImportConfigFromMetadata(): any {
    return (this.tableMetadata?.extraProps as any)?.import || {};
  }

  openImportFilePicker(): void {
    if (!this.canImportXls) {
      return;
    }
    const importCfg = this.getImportConfigFromMetadata();
    const rawAllowed = Array.isArray(importCfg?.allowedExtensions) ? importCfg.allowedExtensions : ['xls', 'xlsx'];
    const allowedExtensions = rawAllowed
      .map((x: any) => String(x || '').trim().toLowerCase().replace(/^\./, ''))
      .filter((x: string) => !!x);
    this.importOptionsForm = {
      import_type: String(importCfg?.import_type || 'I').trim() || 'I',
      commit_level: String(importCfg?.commit_level || 'R').trim() || 'R',
      use_column_captions: String(importCfg?.use_column_captions || 'C').trim() || 'C',
      use_descriptive_fkey: importCfg?.use_descriptive_fkey === undefined ? true : !!importCfg?.use_descriptive_fkey,
      separator: String(importCfg?.separator || ';') || ';',
      allowedExtensions: allowedExtensions.length ? allowedExtensions : ['xls', 'xlsx']
    };
    this.importSkipSettings = !!importCfg?.skipsettings;
    this.importSelectedFile = null;
    this.importSelectedFileName = '';
    this.importDialogBusy = false;
    if (this.importSkipSettings) {
      this.importDialogVisible = false;
      this.triggerImportFileSelection();
      return;
    }
    this.importDialogVisible = true;
  }

  triggerImportFileSelection(): void {
    this.importFileInputRef?.nativeElement?.click();
  }

  clearImportFileSelection(): void {
    if (this.importFileInputRef?.nativeElement) {
      this.importFileInputRef.nativeElement.value = '';
    }
  }

  onImportFileSelected(event: Event): void {
    const input = event?.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      this.importSelectedFile = null;
      this.importSelectedFileName = '';
      return;
    }
    this.importSelectedFile = file;
    this.importSelectedFileName = String(file.name || '');
    if (this.importSkipSettings) {
      void this.confirmImportDialog();
    }
  }

  async confirmImportDialog(): Promise<void> {
    if (this.importDialogBusy) {
      return;
    }
    const file = this.importSelectedFile;
    if (!file) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'warn',
        summary: this.t('import_export.summary_import', 'Import'),
        detail: this.t('import_export.select_file_before_confirm', 'Seleziona un file prima di confermare.')
      });
      return;
    }

    const fileName = String(file.name || '');
    const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
    const allowedSet = new Set((this.importOptionsForm.allowedExtensions || []).map(x => String(x || '').toLowerCase().replace(/^\./, '')));
    if (!allowedSet.has(fileExt)) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'warn',
        summary: this.t('import_export.summary_import', 'Import'),
        detail: this.trslSrv.format(
          this.t('import_export.extension_not_allowed_{0}', 'Estensione non consentita. Ammesse: {0}'),
          Array.from(allowedSet).join(', ')
        )
      });
      return;
    }

    this.importDialogBusy = true;
    try {
      const routeName = String(this.routeName || this.tableMetadata?.md_route_name || '');
      if (!routeName) {
        throw new Error(this.t('import_export.error_missing_route', 'Route corrente non disponibile per import.'));
      }
      const progressGuid = WtoolboxService.uuidv4 ? WtoolboxService.uuidv4() : `${Date.now()}`;
      this.importInProgress = true;
      this.importProgressGuid = progressGuid;
      this.importProgressValue = 0;
      this.importProgressDetail = this.t('import_export.import_progress_zero', '0%');
      this.importControlBusy = false;
      this.importCancelRequested = false;
      this.importStopAndCommitRequested = false;
      this.importBackgroundMode = false;
      this.importMonitoringOnly = false;
      this.importDialogVisible = false;
      this.importProgressDialogVisible = true;
      this.startImportProgressPolling(progressGuid);

      const userId = this.userInfo?.getuserInfo?.()?.user_id;
      void this.notificationRealtime.connect(userId);
      const uploadEndpoint = String(
        WtoolboxService.appSettings?.upload_handler
        || `${String(WtoolboxService.appSettings?.api_url || '/api/').replace(/\/?$/, '/')}UploadImage`
      ).trim();

      const formData = new FormData();
      formData.append('uploadEditor[]', file, fileName);
      const appendOpt = (name: string, value: any) => {
        const normalized = value === undefined || value === null ? '' : String(value);
        formData.append(name, normalized);
      };
      appendOpt('isImageUpload', false);
      appendOpt('isDBUpload', false);
      appendOpt('isMultipleUpload', false);
      appendOpt('IsZippedUpload', false);
      appendOpt('AllowWebCamShot', false);
      appendOpt('AllowWebCamVideo', false);
      appendOpt('UseRecordIDAsSubfolder', false);
      appendOpt('key_field_name', '');
      appendOpt('UseRootNameAsSubfolder', false);
      appendOpt('DefaultUploadRootPath', '');
      appendOpt('MultipleUploadTableRoute', '');
      appendOpt('MultipleUploadBlobFieldName', '');
      appendOpt('MultipleUploadBlobThumbFieldName', '');
      appendOpt('MultipleUploadFilePathFieldName', '');
      appendOpt('MultipleUploadFileTitleFieldName', '');
      appendOpt('MultipleUploadFileNameFieldName', '');
      appendOpt('MultipleUploadFileSizeFieldName', '');
      appendOpt('MultipleUploadFileTypeFieldName', '');
      appendOpt('MultipleUploadFileIconPathFieldName', '');
      appendOpt('createThumb', false);
      appendOpt('thumbWidth', '');
      appendOpt('thumbHeight', '');
      appendOpt('customUploadHandlerPath', '');
      appendOpt('upload_secure', false);
      appendOpt('data_id', WtoolboxService.uuidv4());
      appendOpt('user_id', userId);
      appendOpt('route_name', routeName);
      appendOpt('mc_nome_colonna', '');
      appendOpt('record', '{}');
      appendOpt('returnMessage', '');
      appendOpt('invoke_import_file', true);
      appendOpt('import_progress_guid', progressGuid);
      appendOpt('fyle_type', fileExt === 'xlsx' ? 'X' : 'X');
      appendOpt('import_type', this.importOptionsForm.import_type || 'I');
      appendOpt('commit_level', this.importOptionsForm.commit_level || 'R');
      appendOpt('use_column_captions', this.importOptionsForm.use_column_captions || 'C');
      appendOpt('use_descriptive_fkey', this.importOptionsForm.use_descriptive_fkey ?? true);
      appendOpt('separator', this.importOptionsForm.separator || ';');
      appendOpt('route_context_json', JSON.stringify(WtoolboxService.buildCrudRouteContext(routeName, 'import', 'ImportExportButton.importFile')));

      const response = await fetch(uploadEndpoint, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        throw new Error(`Import fallito (${response.status}).`);
      }

      const first = Array.isArray(payload) ? payload[0] : payload;
      const backendError = String(first?.error || '').trim();
      if (backendError) {
        throw new Error(backendError);
      }

      const backendMessage = String(first?.uploadOpt?.returnMessage || '').trim();
      const backendHasError = /exception|error|object reference/i.test(backendMessage);
      WtoolboxService.messageNotificationService?.add?.({
        severity: backendHasError ? 'error' : (this.importCancelRequested || this.importStopAndCommitRequested ? 'info' : 'success'),
        summary: this.t('import_export.summary_import', 'Import'),
        detail: backendMessage || this.t('import_export.import_completed', 'Import completato.')
      });

      const currentRoute = String(this.routeName || this.tableMetadata?.md_route_name || '');
      const safeRoute = currentRoute ? `/${currentRoute}/list` : '/';
      const notifyUserId = Number(this.userInfo?.getuserInfo?.()?.user_id || 0);
      if (notifyUserId > 0) {
        await this.notificationRealtime.enqueue({
          userId: notifyUserId,
          type: 'Import',
          message: backendMessage || this.t('import_export.import_completed', 'Import completato.'),
          targetJson: JSON.stringify({ path: safeRoute })
        });
      }
    } catch (err: any) {
      if (!this.importCancelRequested) {
        WtoolboxService.messageNotificationService?.add?.({
          severity: 'error',
          summary: this.t('import_export.summary_import', 'Import'),
          detail: String(err?.message || err || this.t('import_export.error_import_xlsx', 'Errore durante import XLS/XLSX.'))
        });
      }
    } finally {
      if (!this.importBackgroundMode) {
        this.stopImportProgressPolling();
      }
      this.importInProgress = false;
      this.importMonitoringOnly = false;
      this.importDialogBusy = false;
      this.importControlBusy = false;
      this.importSkipSettings = false;
      this.importSelectedFile = null;
      this.importSelectedFileName = '';
      this.importCancelRequested = false;
      this.importStopAndCommitRequested = false;
      if (!this.importBackgroundMode) {
        setTimeout(() => {
          this.importProgressDialogVisible = false;
        }, 350);
      }
      this.importBackgroundMode = false;
      this.clearImportFileSelection();
    }
  }

  async continueImportInBackground(): Promise<void> {
    if ((!this.importInProgress && !this.importMonitoringOnly) || this.importControlBusy) {
      return;
    }
    const guid = String(this.importProgressGuid || '').trim();
    if (!guid) {
      return;
    }

    this.importBackgroundMode = true;
    this.importProgressDialogVisible = false;
    this.stopImportProgressPolling();

    const currentRoute = String(this.routeName || this.tableMetadata?.md_route_name || '');
    const safeRoute = currentRoute ? `/${currentRoute}/list` : '/';
    const userId = Number(this.userInfo?.getuserInfo?.()?.user_id || 0);
    const targetJson = JSON.stringify({
      path: `${safeRoute}?importProgressGuid=${encodeURIComponent(guid)}`,
      importProgressGuid: guid
    });
    const payloadJson = JSON.stringify({
      progressGuid: guid,
      route: currentRoute,
      operation: 'import'
    });
    const detail = currentRoute
      ? this.trslSrv.format(
        this.t('import_export.import_background_route_{0}', 'Import {0} in background. Clicca per riaprire il progress.'),
        currentRoute
      )
      : this.t('import_export.import_background', 'Import in background. Clicca per riaprire il progress.');

    const shouldSendBackgroundNotification = !this.importMonitoringOnly
      && !this.importBackgroundNotifiedGuids.has(guid);
    if (shouldSendBackgroundNotification) {
      try {
        if (userId > 0) {
          await this.notificationRealtime.enqueue({
            userId,
            type: 'info',
            message: detail,
            targetJson,
            payloadJson,
            source: 'import-export-button.import.background',
            createdBy: String(userId)
          });
        }
      } catch {
      }
      this.importBackgroundNotifiedGuids.add(guid);
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'info',
        summary: this.t('import_export.summary_import', 'Import'),
        detail
      });
    }
  }

  async cancelImportTaskFromDialog(): Promise<void> {
    if ((!this.importInProgress && !this.importMonitoringOnly) || this.importControlBusy) {
      return;
    }
    this.importControlBusy = true;
    this.importCancelRequested = true;
    this.importStopAndCommitRequested = false;
    this.importMonitoringOnly = false;
    const guid = this.importProgressGuid;
    const userId = Number(this.userInfo?.getuserInfo?.()?.user_id || 0);
    this.stopImportProgressPolling();
    this.importProgressDialogVisible = false;
    try {
      await this.dataMetaSrv.cancelImportTask(guid);
      await this.notificationRealtime.dismissProgressNotification(guid, userId);
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'info',
        summary: this.t('import_export.summary_import', 'Import'),
        detail: this.t('import_export.import_cancel_rollback_requested', 'Annullamento import richiesto (rollback completo).')
      });
    } finally {
      this.importControlBusy = false;
    }
  }

  async stopImportAndCommitFromDialog(): Promise<void> {
    if ((!this.importInProgress && !this.importMonitoringOnly) || this.importControlBusy) {
      return;
    }
    this.importControlBusy = true;
    this.importCancelRequested = false;
    this.importStopAndCommitRequested = true;
    this.importMonitoringOnly = false;
    const guid = this.importProgressGuid;
    const userId = Number(this.userInfo?.getuserInfo?.()?.user_id || 0);
    this.stopImportProgressPolling();
    this.importProgressDialogVisible = false;
    try {
      await this.dataMetaSrv.stopImportAndCommitTask(guid);
      await this.notificationRealtime.dismissProgressNotification(guid, userId);
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'info',
        summary: this.t('import_export.summary_import', 'Import'),
        detail: this.t('import_export.import_stop_commit_requested', 'Richiesta stop con commit parziale inviata.')
      });
    } finally {
      this.importControlBusy = false;
    }
  }

  private startImportProgressPolling(progressGuid: string): void {
    this.stopImportProgressPolling();
    const guid = String(progressGuid || '').trim();
    if (!guid) {
      return;
    }
    this.importProgressWsSubscription = this.notificationRealtime.progressEvents$.subscribe((evt: any) => {
      const evtGuid = String(evt?.guid || '').trim();
      if (!evtGuid || evtGuid !== guid) {
        return;
      }
      const progress = Number(evt?.progress);
      if (!Number.isFinite(progress)) {
        return;
      }
      this.applyImportProgressValue(progress);
      if (this.importProgressValue >= 100 && this.importMonitoringOnly) {
        this.importMonitoringOnly = false;
      }
    });
  }

  @HostListener('window:wuic-import-progress-resume', ['$event'])
  onImportProgressResumeEvent(event: Event): void {
    const customEvent = event as CustomEvent<any>;
    const detail: any = customEvent?.detail || {};
    const guid = String(detail?.guid || '').trim();
    const progressRaw = Number(detail?.progress);
    const initialProgress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, progressRaw)) : null;
    const alreadyTrackingSameGuid =
      this.lastHandledImportResumeGuid === guid
      && this.importProgressDialogVisible
      && String(this.importProgressGuid || '').trim() === guid;
    if (!guid || alreadyTrackingSameGuid) {
      return;
    }
    this.resumeImportProgress(guid, initialProgress);
  }

  private resumeImportProgress(guid: string, initialProgress?: number | null): void {
    this.lastHandledImportResumeGuid = guid;
    this.importProgressGuid = guid;
    const normalizedInitial = Number.isFinite(Number(initialProgress))
      ? Math.max(0, Math.min(100, Number(initialProgress)))
      : 0;
    this.importProgressValue = normalizedInitial;
    if (normalizedInitial > 0) {
      this.applyImportProgressValue(normalizedInitial);
    } else {
      this.importProgressDetail = this.t('import_export.import_monitoring', 'Monitoraggio import...');
    }
    this.importControlBusy = false;
    this.importCancelRequested = false;
    this.importStopAndCommitRequested = false;
    this.importMonitoringOnly = true;
    this.importBackgroundMode = false;
    this.importProgressDialogVisible = true;
    this.startImportProgressPolling(guid);
  }

  private applyImportProgressValue(progress: number): void {
    this.importProgressValue = Math.max(0, Math.min(100, Number(progress || 0)));
    this.importProgressDetail = `${this.importProgressValue.toFixed(2)}%`;
  }

  private stopImportProgressPolling(): void {
    this.importProgressWsSubscription?.unsubscribe();
    this.importProgressWsSubscription = undefined;
  }
}
