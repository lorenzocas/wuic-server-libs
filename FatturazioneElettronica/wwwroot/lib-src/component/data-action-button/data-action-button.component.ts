import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, ViewChild } from '@angular/core';
import { MetaInfo } from '../../class/metaInfo';
import { SplitButtonModule } from 'primeng/splitbutton';
import type { SplitButton } from 'primeng/splitbutton';
import { MenuModule } from 'primeng/menu';
import type { Menu } from 'primeng/menu';
import { TranslationManagerService } from '../../service/translation-manager.service';
// import { DialogService } from 'primeng/dynamicdialog';
import { DataSourceComponent } from '../data-source/data-source.component';

import { WtoolboxService } from '../../service/wtoolbox.service';
import { ConfirmationService, MessageService } from 'primeng/api';
import type { MenuItem } from 'primeng/api';

import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import type { Table } from 'primeng/table';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ParametricDialogComponent } from '../parametric-dialog/parametric-dialog.component';
// import { Table } from 'primeng/table';

@Component({
  selector: 'wuic-data-action-button',
  imports: [SplitButtonModule, MenuModule, FormsModule, TranslateModule],
  templateUrl: './data-action-button.component.html',
  styleUrl: './data-action-button.component.scss'
})
export class DataActionButtonComponent implements AfterViewInit, OnDestroy {
  private static readonly ACTION_KEY_EDIT = 'edit';

  @Input() data: any;
  @Input() metaInfo: MetaInfo;
  @Input() datasource: BehaviorSubject<DataSourceComponent>;

  @Input() filter?: () => void;

  // Workaround for the issue rendering in fullcalendar-event-template
  @Input() simplified: boolean = false;

  @Input() parentField: string;

  @ViewChild("btn") btn: SplitButton;
  @ViewChild("simpleMenu") simpleMenu?: Menu;
  simplifiedMenuOpen = false;

  items: MenuItem[];
  selectedValue: any
  pkName: string;
  inlineItems: any[];
  nonInlineEditingItems: MenuItem[] = [];



  private translationsLoadedSub?: Subscription;

  constructor(private trslSrv: TranslationManagerService, private cd: ChangeDetectorRef, private messageService: MessageService, private confirmationService: ConfirmationService, private router: Router, private http: HttpClient, private metadataProvider: MetadataProviderService) {
    this.metaInfo = new MetaInfo();
  }

  /**
   * Hook di debug locale per ispezionare l'evento click sul pulsante azioni.
   * @param $event Evento UI ricevuto dal template.
   */
  test($event) {
    debugger;
  }

  /**
   * Inizializza il menu azioni in base ai metadati tabella/colonna (`md_editable`, `md_deletable`, `md_inline_edit`, colonne `button`).
   * Calcola anche la PK corrente per le azioni route-based.
   */
  ngAfterViewInit(): void {
    this.translationsLoadedSub?.unsubscribe();
    this.translationsLoadedSub = this.trslSrv.translationsLoaded$.subscribe(() => {
      this.rebuildActionMenus();
    });

    this.rebuildActionMenus();
  }

  ngOnDestroy(): void {
    this.translationsLoadedSub?.unsubscribe();
  }

  private rebuildActionMenus(): void {
    let its = [];
    let inlineIts = [];

    if (this.metaInfo.tableMetadata.md_editable) {
      its.push({
        actionKey: DataActionButtonComponent.ACTION_KEY_EDIT,
        label: this.translateLabel('edit', 'edit'),
        icon: 'pi pi-pencil',
        command: this.edit.bind(this),
        disabled: this.metaInfo.tableMetadata.md_conditional_update_rule ? !this.metaInfo.tableMetadata.md_conditional_update_rule_fn(this.metaInfo, this.data, this.datasource.value, WtoolboxService) : false
      });
    }

    if (this.metaInfo.tableMetadata.md_deletable) {
      its.push({
        label: this.translateLabel('delete', 'delete'),
        icon: 'pi pi-trash',
        command: this.delete.bind(this),
        disabled: this.metaInfo.tableMetadata.md_conditional_delete_rule ? !this.metaInfo.tableMetadata.md_conditional_delete_rule_fn(this.metaInfo, this.data, this.datasource.value, WtoolboxService) : false
      });
    }

    if (this.metaInfo.tableMetadata.md_detail_action) {
      its.push({
        label: this.translateLabel('detail', 'detail'),
        icon: 'pi pi-eye',
        command: this.detail.bind(this)
      });
    }

    if (this.metaInfo.tableMetadata.md_clonable) {
      its.push({
        label: this.translateLabel('clone', 'clone'),
        icon: 'pi pi-clone',
        command: this.clone.bind(this)
      });
    }

    if (this.parentField) {
      its.push({
        label: this.translateLabel('add_grid', 'Add'),
        icon: 'pi pi-plus',
        command: this.addRecord.bind(this)
      });
    }

    this.appendMetadataButtonItems(its);

    if (this.metaInfo.tableMetadata.md_inline_edit) {
      inlineIts.push({
        label: this.translateLabel('save', 'save'),
        icon: 'pi pi-save',
        command: this.save.bind(this),
      });

      inlineIts.push({
        label: this.translateLabel('cancel', 'cancel'),
        icon: 'pi pi-times',
        command: this.cancelEdit.bind(this),
      });
    }

    this.pkName = MetadataProviderService.getPKeys(this.metaInfo.columnMetadata).map(x => x.mc_nome_colonna)[0];

    this.items = its;
    this.inlineItems = inlineIts;
    this.nonInlineEditingItems = (this.items || []).filter((item: any) => String(item?.actionKey || '').toLowerCase() !== DataActionButtonComponent.ACTION_KEY_EDIT);

    this.cd.detectChanges();
    void this.appendRestoreFromChangeMasterActionAsync();
  }

  private translateLabel(key: string, fallback?: string): string {
    const translated = String(this.trslSrv.instant(key) || '').trim();
    if (!translated || translated.toLowerCase() === key.toLowerCase()) {
      return fallback ?? key;
    }
    return translated;
  }

  /**
   * Esegue il comando dell'item selezionato se non disabilitato.
   * @param item Voce menu azione.
   */
  select(item) {
    if (item?.disabled) {
      return;
    }
    item.command();
  }

  /**
   * Aggiunge al menu le azioni dinamiche derivate dalle colonne metadata di tipo `button`.
   * @param target Collezione menu da arricchire.
   */
  private appendMetadataButtonItems(target: MenuItem[]): void {
    const buttonColumns = (this.metaInfo?.columnMetadata || []).filter((col) => col?.mc_ui_column_type === 'button');
    if (!buttonColumns.length) {
      return;
    }

    const record = this.getButtonActionRecord();

    buttonColumns.forEach((col) => {
      const isEnabled = this.isMetadataButtonEnabled(col);
      target.push({
        label: col.mc_button_caption || col.mc_display_string_in_view || col.mc_nome_colonna || 'Button',
        icon: col.mc_button_image || undefined,
        disabled: !isEnabled,
        command: async (event) => {
          await this.executeMetadataButton(col, record, event);
        }
      });
    });
  }

  private getButtonActionRecord(): { [key: string]: BehaviorSubject<any> } {
    if (this.data?.__observable) {
      return this.data.__observable;
    }

    if (this.datasource?.value) {
      return this.datasource.value.getObservable(this.data);
    }

    return DataSourceComponent.getObservable(this.data, this.metaInfo);
  }

  /**
   * Valuta se un bottone metadata e attivo verificando callback azione e condizione visibilita (`mc_button_visibility_condition`).
   * @param col Metadato colonna di tipo button.
   * @returns `true` se il bottone e eseguibile.
   */
  private isMetadataButtonEnabled(col: MetadatiColonna): boolean {
    if (!col?.mc_button_action__fn) {
      return false;
    }

    const visibility = (col.mc_button_visibility_condition || '').toString().trim();
    if (!visibility) {
      return true;
    }

    // skills/typed-localized-exceptions: passa per runUserCallbackSync →
    // typed envelope visibile nel dialog (al posto del solo console.error
    // che lasciava il button silenziosamente nascosto). Fallback a false
    // mantiene il behavior precedente (button hidden on broken predicate).
    const result = WtoolboxService.runUserCallbackSync(
      'mc_button_visibility_condition',
      () => !!new Function('dato, wtoolbox', visibility)(this.data, WtoolboxService),
      [],
      { column: col.mc_nome_colonna, route: this.metaInfo?.tableMetadata?.md_route_name },
      { fallback: false }
    );
    return !!result;
  }

  /**
   * Esegue l'azione custom del bottone metadata, con eventuale conferma (`mc_button_confirm_message`) e gestione errori centralizzata.
   * @param col Metadato colonna button.
   * @param record Record osservabile corrente.
   * @param event Evento UI di invocazione.
   */
  private async executeMetadataButton(col: MetadatiColonna, record: { [key: string]: BehaviorSubject<any> }, event: any): Promise<void> {
    if (!this.isMetadataButtonEnabled(col)) {
      return;
    }

    if (col.mc_button_confirm_message) {
      const confirmed = await WtoolboxService.confirm({
        message: this.trslSrv.instant(col.mc_button_confirm_message),
        header: this.trslSrv.instant('confirmation')
      });

      if (!confirmed) {
        return;
      }
    }

    // Routed through runUserCallback so a throw inside mc_button_action
    // becomes a typed errors.client.user_callback.failed dialog (instead
    // of the raw errors.client.unknown fallback the legacy try/catch +
    // handleError(err) produced).
    await WtoolboxService.runUserCallback(
      'mc_button_action',
      col.mc_button_action__fn,
      [this.datasource?.value, record, event, col, WtoolboxService],
      {
        column: col?.mc_nome_colonna,
        caption: col?.mc_button_caption,
        route:  String(this.metaInfo?.tableMetadata?.md_route_name || ''),
        phase:  'button-click',
      },
      { targetName: 'DataActionButtonComponent.executeMetadataButton' }
    );
  }

  /**
   * Avvia il flusso edit del record corrente:
   * inline edit, popup `EditFormComponent` oppure navigazione route `/{route}/edit/{pk}`.
   */
  edit() {

    let header = this.trslSrv.instant('edit') + ' ' + this.metaInfo.tableMetadata.md_display_string;

    // this.datasource.value.resultInfo.current = this.datasource.value.getObservable(this.data);
    // this.datasource.value.pristine = this.data;

    this.datasource.value.setCurrent(this.data);

    if (this.data.__new) {
      header = this.trslSrv.instant('insert') + ' ' + this.metaInfo.tableMetadata.md_display_string;
    } else {
      if (this.metaInfo.tableMetadata.md_display_formula) {
        header = this.metaInfo.tableMetadata.md_display_formula_fn(this.metaInfo, this.datasource.value.resultInfo.current, this.datasource.value, WtoolboxService);
      }
    }

    if (this.metaInfo.tableMetadata.md_inline_edit) {
      this.data.__observable = this.datasource.value.resultInfo.current;
      this.data.__is_editing = true;
    } else if (this.metaInfo.tableMetadata.md_edit_popup) {
      const ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
        data: {
          datasource: this.datasource,
          isEditForm: true
        },
        header: header,
        styleClass: 'edit-form-content',
        position: 'center',
        closable: true
      });

      ref.onClose.subscribe((result) => {
        if (result) {
          this.datasource.value.fetchData();
        }
      });

    } else {
      const currentRoute = String(
        this.datasource?.value?.route?.value
        || this.metaInfo?.tableMetadata?.md_route_name
        || ''
      ).trim();
      const pkeyValue = this.data?.[this.pkName];

      if (currentRoute && pkeyValue !== undefined && pkeyValue !== null) {
        void this.router.navigate(['/', currentRoute, 'edit', String(pkeyValue)]);
      }
    }
  }

  /**
   * Richiede conferma e, in caso positivo, elimina il record via `datasource.syncData(..., true)` ricaricando la griglia.
   */
  async delete() {

    let resp = await WtoolboxService.confirm({
      message: this.trslSrv.instant('data_action.confirm_delete_message') || 'Are you sure that you want to proceed?',
      header: this.trslSrv.instant('confirmation') || 'Confirmation',
    })

    if (resp) {
      let res = await this.datasource.value.syncData(this.data, this.data, true);

      if (res) {
        this.messageService.add({
          severity: 'info',
          summary: this.trslSrv.instant('data_action.delete_confirmed_summary') || 'Confirmed',
          detail: this.trslSrv.instant('data_action.delete_confirmed_detail') || 'You have accepted'
        });
        this.datasource.value.fetchData();
      }
    } else {

    }
  }

  private canRestoreFromChangeMaster(): boolean {
    const operation = String(this.getRecordFieldIgnoreCase(this.data, ['operation']) || '').trim().toLowerCase();
    const supportedOps = ['delete_logical', 'delete'];
    if (!supportedOps.includes(operation)) {
      return false;
    }

    const targetRoute = String(this.getRecordFieldIgnoreCase(this.data, ['MdRouteName', 'mdroutename', 'md_route_name']) || '').trim();
    const targetPkey = this.getRecordFieldIgnoreCase(this.data, ['Pkey', 'pkey']);

    return !!targetRoute && targetPkey !== undefined && targetPkey !== null && String(targetPkey).trim() !== '';
  }

  private async appendRestoreFromChangeMasterActionAsync(): Promise<void> {
    if (!this.canRestoreFromChangeMaster()) {
      return;
    }

    const targetRoute = String(this.getRecordFieldIgnoreCase(this.data, ['MdRouteName', 'mdroutename', 'md_route_name']) || '').trim();
    const isLogicalDelete = await this.isLogicalDeleteSupportedRoute(targetRoute);
    if (!isLogicalDelete) {
      return;
    }

    const alreadyPresent = (this.items || []).some((x) => String(x?.label || '').trim().toLowerCase() === 'restore');
    if (alreadyPresent) {
      return;
    }

    this.items = [
      ...(this.items || []),
      {
        label: this.trslSrv.instant('restore') || 'Restore',
        icon: 'pi pi-history',
        command: async () => {
          await this.restoreFromChangeMaster();
        }
      }
    ];
    this.nonInlineEditingItems = (this.items || []).filter((item: any) => String(item?.actionKey || '').toLowerCase() !== DataActionButtonComponent.ACTION_KEY_EDIT);

    this.cd.detectChanges();
  }

  private async isLogicalDeleteSupportedRoute(targetRoute: string): Promise<boolean> {
    if (!targetRoute) {
      return false;
    }

    const globalLogicDeleteField = String(WtoolboxService.appSettings?.logicDeleteField || '').trim();
    const targetMetadata = await this.metadataProvider.getMetadati(targetRoute);

    if (!targetMetadata?.length) {
      return false;
    }

    if (globalLogicDeleteField) {
      return targetMetadata.some((c: any) => String(c?.mc_nome_colonna || '').trim().toLowerCase() === globalLogicDeleteField.toLowerCase());
    }

    const tableHasLogicDelete = !!targetMetadata[0]?._Metadati_Tabelle?.md_has_logic_delete;
    const hasLogicDeleteKey = targetMetadata.some((c: any) => !!c?.mc_is_logic_delete_key);
    return tableHasLogicDelete && hasLogicDeleteKey;
  }

  private getRecordFieldIgnoreCase(record: any, candidates: string[]): any {
    if (!record || !Array.isArray(candidates) || !candidates.length) {
      return null;
    }

    const keys = Object.keys(record || {});
    for (const candidate of candidates) {
      const match = keys.find((k) => String(k).toLowerCase() === String(candidate).toLowerCase());
      if (match) {
        return record[match];
      }
    }

    return null;
  }

  private async restoreFromChangeMaster(): Promise<void> {
    const targetRoute = String(this.getRecordFieldIgnoreCase(this.data, ['MdRouteName', 'mdroutename', 'md_route_name']) || '').trim();
    const targetPkeyValue = this.getRecordFieldIgnoreCase(this.data, ['Pkey', 'pkey']);
    const changeMasterId = this.getRecordFieldIgnoreCase(this.data, ['IdChange', 'idchange', 'id_change', 'id']);

    if (!targetRoute || targetPkeyValue === undefined || targetPkeyValue === null || String(targetPkeyValue).trim() === '') {
      WtoolboxService.messageNotificationService.add({
        severity: 'warn',
        summary: this.trslSrv.instant('warning') || 'Warning',
        detail: this.trslSrv.instant('data_action.restore_missing_route_pkey') || 'ChangeMaster row is missing route/pkey information.'
      });
      return;
    }

    const confirmRestore = await WtoolboxService.confirm({
      message: this.trslSrv.format(
        this.trslSrv.instant('data_action.restore_confirm_message') || "Restore logical delete for route '{1}' and key '{2}'?",
        targetRoute,
        targetPkeyValue
      ),
      header: this.trslSrv.instant('confirmation') || 'Confirmation'
    });

    if (!confirmRestore) {
      return;
    }

    const targetMetadata = await this.metadataProvider.getMetadati(targetRoute);
    const pkeys = MetadataProviderService.getPKeys(targetMetadata || []);
    const pkeyName = String(pkeys?.[0]?.mc_nome_colonna || '').trim();

    if (!pkeyName) {
      throw new Error(`Primary key metadata not found for route '${targetRoute}'.`);
    }

    const entity: any = {};
    entity[pkeyName] = targetPkeyValue;
    if (changeMasterId !== undefined && changeMasterId !== null && String(changeMasterId).trim() !== '') {
      entity.__change_master_id = changeMasterId;
    }

    await (this.http.post(
      MetadataProviderService.restoreUri,
      {
        route: targetRoute,
        user_id: '',
        entity
      }
    ).toPromise());

    WtoolboxService.messageNotificationService.add({
      severity: 'success',
      summary: this.trslSrv.instant('restored') || 'Restored',
      detail: this.trslSrv.format(
        this.trslSrv.instant('data_action.restore_success_detail') || "{1} ({2}={3}) restored.",
        targetRoute,
        pkeyName,
        targetPkeyValue
      )
    });

    await this.datasource?.value?.fetchData?.();
  }

  /**
   * Apre il record in modalita sola lettura tramite `EditFormComponent` con `readOnly: true`.
   */
  detail() {
    this.datasource.value.setCurrent(this.data);

    let header = this.trslSrv.instant('insert') + ' ' + this.metaInfo.tableMetadata.md_display_string;

    const ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data: {
        datasource: this.datasource,
        readOnly: true,
        isEditForm: true
      },
      header: header,
      styleClass: 'edit-form-content',
      position: 'center',
      closable: true
    });
  }

  /**
   * Apre `EditFormComponent` in modalita cloning per creare una copia del record corrente.
   */
  clone() {
    let header = this.trslSrv.instant('edit') + ' ' + this.metaInfo.tableMetadata.md_display_string;

    // this.datasource.value.resultInfo.current = this.datasource.value.getObservable(this.data);
    // this.datasource.value.pristine = this.data;

    this.datasource.value.setCurrent(this.data);

    if (this.data.__new) {
      header = this.trslSrv.instant('insert') + ' ' + this.metaInfo.tableMetadata.md_display_string;
    } else {
      if (this.metaInfo.tableMetadata.md_display_formula) {
        header = this.metaInfo.tableMetadata.md_display_formula_fn(this.metaInfo, this.datasource.value.resultInfo.current, this.datasource.value, WtoolboxService);
      }
    }

    const ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data: {
        datasource: this.datasource,
        cloning: true
      },
      header: header,
      // width: '75%',
      // height: '600px',
      styleClass: 'edit-form-content',
      position: 'center',
      closable: true
    });

    ref.onClose.subscribe((result) => {
      if (result) {
        this.datasource.value.fetchData();
      }
    });

  }

  /**
   * Salva modifiche inline sincronizzando il record osservabile con backend e riallineando il modello riga in tabella.
   */
  async save() {
    let pristine = {};
    this.metaInfo.columnMetadata.forEach((meta) => {
      pristine[meta.mc_nome_colonna] = this.data[meta.mc_nome_colonna];
    });

    let ret = await this.datasource.value.syncData(this.data.__observable, pristine, false);
    if (ret) {
      let record = this.datasource.value.getModelFromObservable(this.data.__observable);
      Object.assign(this.data, record);
      this.data.__is_editing = false;

      this.datasource.value.fetchData();
    }
  }

  /**
   * Annulla l'inline edit locale della riga corrente.
   */
  async cancelEdit() {
    this.data.__is_editing = false;
  }

  /**
   * Hook evento click principale (attualmente usato come placeholder/debug).
   * @param $event Evento click.
   */
  onClick($event) {
    // debugger;
  }

  /**
   * Hook richiamato alla chiusura del menu split button.
   * @param $event Evento PrimeNG.
   */
  onMenuHide($event) {
    console.log('onMenuHide');

  }
  /**
   * Hook richiamato all'apertura del menu split button.
   * @param $event Evento PrimeNG.
   */
  onMenuShow($event) {
    // debugger;
    console.log('onMenuShow');
  }
  /**
   * Hook click dropdown del pulsante azioni (punto estensione per custom behavior).
   * @param $event Evento click dropdown.
   */
  onDropdownClick($event) {
    // debugger;
    // console.log('onDropdownClick');
    // this.btn.menu.show($event);

    // $event.stopPropagation();
  }

  /**
   * Ferma la propagazione dell'evento per evitare side effects sul contenitore (es. row click/select).
   * @param $event Evento DOM.
   */
  fix($event) {
    $event.stopPropagation();
  }

  /**
   * Apre/chiude il popup menu in modalita semplificata con overlay appeso al body.
   * Evita clipping dentro i contenitori FullCalendar.
   * @param event Evento click del trigger.
   */
  onSimplifiedMenuClick(event: Event): void {
    event.stopPropagation();
    this.simpleMenu?.toggle(event);
  }

  onSimplifiedMenuShow(): void {
    this.simplifiedMenuOpen = true;
  }

  onSimplifiedMenuHide(): void {
    this.simplifiedMenuOpen = false;
  }

  /**
   * Abilita modalita inline-cell-editing via metadata tabella (con fallback legacy).
   */
  isInlineCellEditingEnabled(): boolean {
    const tableMetadata: any = this.metaInfo?.tableMetadata || {};
    if (Object.prototype.hasOwnProperty.call(tableMetadata, 'md_inline_cell_editing')) {
      return this.toBooleanLoose(tableMetadata.md_inline_cell_editing, false);
    }

    if (Object.prototype.hasOwnProperty.call(tableMetadata, 'd_inline_cell_editing')) {
      return this.toBooleanLoose(tableMetadata.d_inline_cell_editing, false);
    }

    return false;
  }

  /**
   * In inline-cell-editing, anche se la riga e marcata editing, mostra menu standard senza "edit".
   */
  showInlineEditingMenu(): boolean {
    return !!this.data?.__is_editing && !this.isInlineCellEditingEnabled();
  }

  /**
   * Modello menu effettivo da renderizzare nel pulsante azioni.
   */
  getActionMenuModel(): MenuItem[] {
    if (this.showInlineEditingMenu()) {
      return this.inlineItems || [];
    }

    if (!!this.data?.__is_editing && this.isInlineCellEditingEnabled()) {
      return this.nonInlineEditingItems || [];
    }

    return this.items || [];
  }

  private toBooleanLoose(value: any, defaultValue: boolean): boolean {
    if (value === undefined || value === null) {
      return defaultValue;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    const normalized = String(value).trim().toLowerCase();
    if (!normalized) {
      return defaultValue;
    }

    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }

    return defaultValue;
  }

  addRecord() {
    let header = this.trslSrv.instant('insert') + ' ' + this.metaInfo.tableMetadata.md_display_string;

    let defaulted = this.datasource.value.addNewRecord();

    if (this.parentField) {
      const pKeyName = MetadataProviderService.getPKeys(this.metaInfo?.columnMetadata || []).map((x) => x.mc_nome_colonna)[0];

      defaulted[this.parentField].next(this.data[pKeyName]);
    }

    const ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data: {
        record: defaulted,
        pristine: this.datasource.value.pristine,
        metaInfo: this.metaInfo,
        datasource: this.datasource,
        isEditForm: true
      },
      header: header,
      styleClass: 'edit-form-content',
      position: 'center'
    });

    ref.onClose.subscribe((added: any) => {
      if (added) {
        this.datasource.value.fetchData();
      }
    });
  }

}
