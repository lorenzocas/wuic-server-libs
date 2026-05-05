import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { Menubar, MenubarModule } from 'primeng/menubar';
import { DataSourceComponent } from '../data-source/data-source.component';
import { MetaInfo } from '../../class/metaInfo';
// import { DialogService } from 'primeng/dynamicdialog';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { BehaviorSubject, Subscription } from 'rxjs';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { Router } from '@angular/router';
import { UserInfoService } from '../../service/user-info.service';
import { TranslateModule } from '@ngx-translate/core';
import { ParametricDialogComponent } from '../parametric-dialog/parametric-dialog.component';

@Component({
  selector: 'wuic-metadata-editor',
  imports: [MenubarModule, DataSourceComponent, TranslateModule],
  templateUrl: './metadata-editor.component.html',
  styleUrl: './metadata-editor.component.css',
  // OnPush: componente mountato su ogni route admin WUIC tramite
  // BoundedRepeaterComponent. Con Default ogni evento DOM globale
  // triggerava ricalcolo di isDeletableMenuItem(item) per ogni voce
  // del menu gerarchico (decine di items con submenu annidati) →
  // freeze visibile su click del FAB / interazioni in altre parti
  // dell'app. Con OnPush il subtree viene re-checked solo quando:
  //   - cambiano @Input (datasource, hardcodedDatasource)
  //   - si chiama cdr.markForCheck() (dopo mutations di items/viewReady)
  //   - evento originato dal subtree stesso
  //
  // isDeletableMenuItem(item) e' sostituito nel template dalla property
  // `item.deletable` precomputata tramite decorateMenuItems() dopo ogni
  // assignment/rebuild di this.items.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetadataEditorComponent implements AfterViewInit, OnInit, OnDestroy {

  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource: BehaviorSubject<DataSourceComponent>
  /**
   * Input dal componente padre per hardcoded datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedDatasource: DataSourceComponent;
  /**
   * Input dal componente padre per save callback; usata nella configurazione e nel rendering del componente.
   */
  @Input() saveCallback: Function;
  /**
   * Input dal componente padre per hide reports; usata nella configurazione e nel rendering del componente.
   */
  @Input() hideReports: boolean = false;
  /**
   * Input dal componente padre per hide related table actions; usata nella configurazione e nel rendering del componente.
   */
  @Input() hideRelatedTableActions: boolean = false;
  /**
   * Input dal componente padre per hide related column actions; usata nella configurazione e nel rendering del componente.
   */
  @Input() hideRelatedColumnActions: boolean = false;

  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per datasource tabelle.
   */
  @ViewChild('metadataMenubar') metadataMenubar?: Menubar;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per datasource tabelle.
   */
  @ViewChild('datasourceTabelle') datasourceTabelle: DataSourceComponent;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per datasource colonne.
   */
  @ViewChild('datasourceColonne') datasourceColonne: DataSourceComponent;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata custom actions.
   */
  @ViewChild('datasourceRelatedMetadataCustomActions') datasourceRelatedMetadataCustomActions: DataSourceComponent;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata auth table.
   */
  @ViewChild('datasourceRelatedMetadataAuthTable') datasourceRelatedMetadataAuthTable: DataSourceComponent;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata auth column.
   */
  @ViewChild('datasourceRelatedMetadataAuthColumn') datasourceRelatedMetadataAuthColumn: DataSourceComponent;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata table styles.
   */
  @ViewChild('datasourceRelatedMetadataTableStyles') datasourceRelatedMetadataTableStyles: DataSourceComponent;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata column styles.
   */
  @ViewChild('datasourceRelatedMetadataColumnStyles') datasourceRelatedMetadataColumnStyles: DataSourceComponent;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata condition groups/items.
   */
  @ViewChild('datasourceRelatedMetadataConditionGroup') datasourceRelatedMetadataConditionGroup: DataSourceComponent;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata condition items.
   */
  @ViewChild('datasourceRelatedMetadataConditionItem') datasourceRelatedMetadataConditionItem: DataSourceComponent;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata condition action groups.
   */
  @ViewChild('datasourceRelatedMetadataConditionActionGroup') datasourceRelatedMetadataConditionActionGroup: DataSourceComponent;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata condition action items.
   */
  @ViewChild('datasourceRelatedMetadataConditionAction') datasourceRelatedMetadataConditionAction: DataSourceComponent;
  /**
   * Proprieta di stato del componente per datasource related metadata compat, usata dalla logica interna e dal template.
   */
  private datasourceRelatedMetadataCompat?: DataSourceComponent;

  // Backward-compatible alias kept for existing tests/consumers.
  /**
   * Espone un datasource di metadati correlati compatibile con versioni precedenti, preferendo il datasource compat se impostato.
   * @returns Primo datasource disponibile tra compat/custom-actions/auth/style.
   */
  get datasourceRelatedMetadata(): DataSourceComponent {
    return this.datasourceRelatedMetadataCompat
      || this.datasourceRelatedMetadataCustomActions
      || this.datasourceRelatedMetadataAuthTable
      || this.datasourceRelatedMetadataAuthColumn
      || this.datasourceRelatedMetadataTableStyles
      || this.datasourceRelatedMetadataColumnStyles
      || this.datasourceRelatedMetadataConditionGroup
      || this.datasourceRelatedMetadataConditionItem
      || this.datasourceRelatedMetadataConditionActionGroup
      || this.datasourceRelatedMetadataConditionAction;
  }
  /**
   * Imposta il datasource compatibile legacy usato come alias dai consumer esistenti.
   * @param value Datasource da usare come sorgente primaria per i metadati correlati.
   */
  set datasourceRelatedMetadata(value: DataSourceComponent) {
    this.datasourceRelatedMetadataCompat = value;
  }

  /**
   * Collezione dati per items, consumata dal rendering e dalle operazioni del componente.
   */
  items: MenuItem[] | undefined;
  /**
   * Metadati completi della route corrente (tabella, colonne, regole) usati per costruire UI e logica runtime.
   */
  metaInfo: MetaInfo;
  /**
   * Proprieta di stato del componente per ref, usata dalla logica interna e dal template.
   */
  ref: import("primeng/dynamicdialog").DynamicDialogRef<ParametricDialogComponent>;
  /**
   * Proprieta di stato del componente per meta custom actions route, usata dalla logica interna e dal template.
   */
  readonly metaCustomActionsRoute = MetadataProviderService.metatableActionRoute || '_Metadati_Custom_Actions_Tabelle';
  /**
   * Proprieta di stato del componente per meta auth table route, usata dalla logica interna e dal template.
   */
  readonly metaAuthTableRoute = MetadataProviderService.metatableAuthRoute || '_Metadati_Utenti_Autorizzazioni_Tabelle';
  /**
   * Proprieta di stato del componente per meta auth column route, usata dalla logica interna e dal template.
   */
  readonly metaAuthColumnRoute = MetadataProviderService.metatableColumnAuthRoute || '_Metadati_Utenti_Autorizzazioni_Colonne';
  /**
   * Configurazione di presentazione per meta table style route, usata nel rendering del componente.
   */
  readonly metaTableStyleRoute = MetadataProviderService.metatableStyleRoute || '_Metadati_UI_Stili_Tabelle';
  /**
   * Configurazione di presentazione per meta column style route, usata nel rendering del componente.
   */
  readonly metaColumnStyleRoute = MetadataProviderService.metatableColumnStyleRoute || '_Metadati_UI_Stili_Colonne';
  /**
   * Configurazione route metadata condition group/item usata nelle sezioni "Metadati correlati".
   */
  readonly metaConditionGroupRoute = '_metadati_condition_group';
  /**
   * Configurazione route metadata condition item usata nelle sezioni "Metadati correlati".
   */
  readonly metaConditionItemRoute = '_metadati_condition_item';
  /**
   * Configurazione route metadata condition action group usata nelle sezioni "Metadati correlati".
   */
  readonly metaConditionActionGroupRoute = '_metadati_condition_action_group';
  /**
   * Configurazione route metadata condition action item usata nelle sezioni "Metadati correlati".
   */
  readonly metaConditionActionRoute = '_metadati_condition_action_item';
  /**
   * Proprieta di stato del componente per fetch info sub, usata dalla logica interna e dal template.
   */
  private fetchInfoSub?: Subscription;
  /**
   * Proprieta di stato del componente per translations sub, usata dalla logica interna e dal template.
   */
  private translationsSub?: Subscription;
  /**
   * Proprieta di stato del componente per view ready, usata dalla logica interna e dal template.
   */
  private viewReady = false;
  /**
   * Proprieta di stato del componente per extended menu refresh seq, usata dalla logica interna e dal template.
   */
  private extendedMenuRefreshSeq = 0;
  /**
   * Proprieta di stato del componente per report menu refresh seq, usata dalla logica interna e dal template.
   */
  private reportMenuRefreshSeq = 0;
  /**
   * Observer usato per intercettare apertura/chiusura submenu e ricalcolare il posizionamento verticale.
   */
  private submenuPositionObserver?: MutationObserver;
  /**
   * Handle requestAnimationFrame per evitare ricalcoli ridondanti.
   */
  private submenuPositionRaf: number | null = null;
  /**
   * Identificativo tecnico per role description by id, usato in matching, lookup o routing interno.
   */
  private roleDescriptionById = new Map<string, string>();

  /**
   * Inietta servizi di traduzione, metadata API, routing e profilo utente usati nelle azioni menu editor.
   * @param trslSrv Servizio traduzioni per etichette menu e messaggi conferma.
   * @param metaSrv Servizio metadata per CRUD colonne/report/relazioni.
   * @param router Router Angular usato per apertura report designer.
   * @param userInfoSrv Servizio utente usato per controlli ruolo/permessi.
   */
  constructor(
    private trslSrv: TranslationManagerService,
    private metaSrv: MetadataProviderService,
    private router: Router,
    private userInfoSrv: UserInfoService,
    private hostEl: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef
  ) {
  }

  /**
   * Pre-computa la property `deletable` su ogni voce menu (ricorsivo sui
   * submenu). Sostituisce `isDeletableMenuItem(item)` chiamato dal template
   * che con OnPush non gira sempre (e anche con Default girava su ogni CD:
   * overhead O(N_items) per click globale sull'app).
   *
   * Da chiamare dopo OGNI assignment/mutation di `this.items`.
   * Idempotente: ricalcola sempre dal source (`info`, `canDelete`) quindi
   * sicuro se chiamato piu' volte sulla stessa gerarchia.
   */
  private decorateMenuItems(items: any): void {
    if (!Array.isArray(items)) return;
    for (const it of items) {
      if (!it) continue;
      const target = it.item || it;
      // Preserva `deletable=true` esplicito quando presente con un `deleteCommand`
      // custom (es. report items): in quel caso il delete e' guidato dal callback,
      // non dal flusso `info+canDelete` legacy.
      if (target?.deletable === true && typeof target?.deleteCommand === 'function') {
        // already set by caller, keep
      } else {
        target.deletable = !!(target?.info && target?.canDelete);
      }
      if (Array.isArray(it.items)) {
        this.decorateMenuItems(it.items);
      }
    }
  }

  /**
   * Helper: chiamare dopo QUALSIASI mutation di `this.items` (o dei suoi
   * submenu). Aggiorna la property `deletable` su tutta la gerarchia e
   * segnala ad Angular (OnPush) che il subtree va re-checkato al prossimo
   * tick. Evita di ripetere decorateMenuItems + markForCheck ovunque.
   */
  private commitItems(): void {
    this.decorateMenuItems(this.items);
    this.cdr.markForCheck();
  }

  /**
   * Pulisce la cache localStorage preservando la cache traduzioni per evitare
   * perdita temporanea delle label localizzate dopo salvataggi metadata.
   */
  private clearLocalStoragePreservingTranslation(): void {
    const translationSnapshot = localStorage.getItem('translation');
    localStorage.clear();
    if (translationSnapshot !== null && translationSnapshot !== undefined) {
      localStorage.setItem('translation', translationSnapshot);
    }
  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  ngOnInit(): void {
    void this.trslSrv.ensureTranslationsLoaded();
    this.translationsSub = this.trslSrv.translationsLoaded$.subscribe((loaded) => {
      if (loaded && this.metaInfo) {
        this.rebuildMenuItems();
      }
    });

    if (this.hardcodedDatasource) {
      this.datasource = new BehaviorSubject<DataSourceComponent>(this.hardcodedDatasource);
      this.subscribeToDS();
    } else if (this.datasource && this.datasource.value) {
      this.subscribeToDS();
    } else {
      this.datasource.subscribe((ds) => {
        if (ds) {
          this.subscribeToDS();
        }
      });
    }
  }

  /**
   * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
   */
  ngOnDestroy(): void {
    this.fetchInfoSub?.unsubscribe();
    this.translationsSub?.unsubscribe();
    this.submenuPositionObserver?.disconnect();
    if (this.submenuPositionRaf != null) {
      cancelAnimationFrame(this.submenuPositionRaf);
      this.submenuPositionRaf = null;
    }
    window.removeEventListener('resize', this.onViewportChanged);
    window.removeEventListener('scroll', this.onViewportChanged, true);
  }

  /**
   * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
   */
  ngAfterViewInit() {
    this.viewReady = true;
    this.bindSubmenuAutoPositioning();
    if (this.metaInfo) {
      this.rebuildMenuItems();
    }
    this.makeMenubarHamburgerCrawlable();
  }

  /**
   * Patch runtime per Lighthouse SEO `crawlable-anchors`: il `<p-menubar>`
   * usato qui (`.metadata-editor`) renderizza il proprio menu hamburger
   * mobile come `<a class="p-menubar-button">` SENZA `href`. Stessa logica
   * gia' applicata in `meta-menu.component.ts` ma scoped al p-menubar di
   * questo componente. Settiamo runtime `href="#<aria-controls-target>"`
   * cosi' Lighthouse considera il link crawlable. Il default browser
   * scroll-to-anchor e' neutralizzato con `preventDefault`; il (click)
   * PrimeNG continua ad aprire/chiudere il menu mobile.
   */
  private makeMenubarHamburgerCrawlable(): void {
    const tryPatch = (): boolean => {
      const host = this.hostEl?.nativeElement;
      if (!host) return false;
      const btn = host.querySelector('a.p-menubar-button') as HTMLAnchorElement | null;
      if (!btn) return false;
      if (btn.getAttribute('href')) return true;
      const ariaControls = btn.getAttribute('aria-controls');
      const targetId = ariaControls || 'wuic-metadata-editor-menu';
      btn.setAttribute('href', '#' + targetId);
      btn.addEventListener('click', (ev) => ev.preventDefault());
      return true;
    };
    if (tryPatch()) return;
    try {
      const host = this.hostEl?.nativeElement;
      if (!host) return;
      const obs = new MutationObserver(() => {
        if (tryPatch()) {
          obs.disconnect();
        }
      });
      obs.observe(host, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 10000);
    } catch { /* no-op */ }
  }

  private readonly onViewportChanged = () => {
    this.scheduleSubmenuReposition();
  };

  private bindSubmenuAutoPositioning(): void {
    const host = this.hostEl?.nativeElement;
    if (!host) {
      return;
    }

    this.submenuPositionObserver?.disconnect();
    this.submenuPositionObserver = new MutationObserver(() => {
      this.scheduleSubmenuReposition();
    });
    // PrimeNG menubar uses appendTo="body", so submenus are not guaranteed to
    // stay under component host: observe body for submenu style changes.
    this.submenuPositionObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style']
    });

    window.addEventListener('resize', this.onViewportChanged, { passive: true });
    window.addEventListener('scroll', this.onViewportChanged, true);
    this.scheduleSubmenuReposition();
  }

  private scheduleSubmenuReposition(): void {
    if (this.submenuPositionRaf != null) {
      cancelAnimationFrame(this.submenuPositionRaf);
    }

    this.submenuPositionRaf = requestAnimationFrame(() => {
      this.submenuPositionRaf = null;
      this.repositionVisibleSubmenus();
    });
  }

  private repositionVisibleSubmenus(): void {
    const submenus = Array.from(document.querySelectorAll('body .p-menubar.metadata-editor .p-menubar-submenu')) as HTMLElement[];
    const viewportPadding = 12;
    const minMenuHeight = 64;

    submenus.forEach((submenu) => {
      const computed = window.getComputedStyle(submenu);
      const isVisible = computed.display !== 'none' && computed.visibility !== 'hidden' && submenu.offsetParent !== null;
      if (!isVisible) {
        submenu.classList.remove('wuic-open-upward');
        submenu.style.removeProperty('top');
        submenu.style.removeProperty('left');
        submenu.style.removeProperty('bottom');
        submenu.style.removeProperty('transform');
        submenu.style.removeProperty('max-height');
        return;
      }

      const parent = submenu.parentElement as HTMLElement | null;
      const isTopLevelSubmenu = !!parent
        && parent.classList.contains('p-menubar-item')
        && !!parent.parentElement
        && parent.parentElement.classList.contains('p-menubar-root-list');

      if (!isTopLevelSubmenu) {
        submenu.classList.remove('wuic-open-upward');
        submenu.style.removeProperty('top');
        submenu.style.removeProperty('left');
        submenu.style.removeProperty('bottom');
        submenu.style.removeProperty('transform');
        submenu.style.removeProperty('max-height');
        return;
      }

      const rect = submenu.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportMaxHeight = Math.max(minMenuHeight, viewportHeight - (viewportPadding * 2));
      submenu.style.setProperty('max-height', `${Math.round(viewportMaxHeight)}px`, 'important');

      // Reset manual offset before recalculating.
      submenu.style.removeProperty('transform');
      const boundedRect = submenu.getBoundingClientRect();

      let shiftY = 0;
      if (boundedRect.bottom > viewportHeight - viewportPadding) {
        shiftY -= (boundedRect.bottom - (viewportHeight - viewportPadding));
      }
      if ((boundedRect.top + shiftY) < viewportPadding) {
        shiftY += (viewportPadding - (boundedRect.top + shiftY));
      }

      submenu.classList.remove('wuic-open-upward');
      if (Math.abs(shiftY) > 0.5) {
        submenu.style.setProperty('transform', `translateY(${Math.round(shiftY)}px)`, 'important');
      }
    });
  }

  /**
   * Normalizza il payload menu PrimeNG restituendo sempre il vero item (`item.item` oppure `item`).
   */
  private unwrapMenuItem(item: any): any {
    return item?.item || item;
  }

  /**
   * Verifica se la voce menu rappresenta un elemento correlato cancellabile (`info` presente e `canDelete=true`).
   */
  isDeletableMenuItem(item: any): boolean {
    const target = this.unwrapMenuItem(item);
    return !!(target?.info && target?.canDelete);
  }

  /**
   * Gestisce il click voce menu: blocca default, esegue `command` se definito, altrimenti apre l'editor sul record associato.
   */
  onMenuItemClick(event: Event, item: any): void {
    const targetItem = this.unwrapMenuItem(item);
    const hasChildren = Array.isArray(targetItem?.items) && targetItem.items.length > 0;
    if (hasChildren) {
      // Parent menu entries must be handled by PrimeNG to keep submenu open/close state stable.
      // Reposition on the next frame(s) once PrimeNG has opened the branch.
      this.scheduleSubmenuReposition();
      [0, 80, 180, 320].forEach((delay) => {
        setTimeout(() => this.scheduleSubmenuReposition(), delay);
      });
      return;
    }

    event?.preventDefault?.();
    event?.stopPropagation?.();
    this.closeMetadataMenu(event);
    if (targetItem?.disabled) {
      return;
    }
    if (typeof targetItem?.command === 'function') {
      targetItem.command({ originalEvent: event, item: targetItem });
      return;
    }

    void this.openEditor(targetItem);
  }

  /**
   * Gestisce il click su elimina voce correlata e delega la cancellazione dopo validazione `canDelete`.
   */
  async onMenuItemDeleteClick(event: Event, item: any): Promise<void> {
    const targetItem = this.unwrapMenuItem(item);
    event?.preventDefault?.();
    event?.stopPropagation?.();
    this.closeMetadataMenu(event);

    // Custom delete callback (es. report items) — ha priorita' sul flusso
    // legacy info+canDelete dei related metadata records.
    if (typeof targetItem?.deleteCommand === 'function') {
      await targetItem.deleteCommand();
      return;
    }

    if (!targetItem?.canDelete || !targetItem?.info) {
      return;
    }
    await this.deleteRelatedMetadataItem(targetItem);
  }

  private closeMetadataMenu(event?: Event): void {
    try {
      this.metadataMenubar?.hide?.(event, false);
    } catch {
      // Best-effort UX improvement: do not block item action if menu hide fails.
    }
  }

  /**
   * Si sottoscrive a `fetchInfo$`, aggiorna `metaInfo` e ricostruisce le voci menu quando cambiano i metadati.
   */
  private subscribeToDS() {
    if (!this.datasource.value?.fetchInfo$) {
      this.datasource.next(this.datasource.value['value']);
    }

    this.fetchInfoSub?.unsubscribe();
    this.fetchInfoSub = this.datasource?.value?.fetchInfo$?.subscribe((info) => {
      if (info) {
        this.metaInfo = info.metaInfo;
        this.rebuildMenuItems();
      }
    });
  }

  /**
   * Ricostruisce il menubar metadata (tabella/colonne + azioni schema/report) in base allo stato corrente e ai flag di visibilita.
   */
  private rebuildMenuItems(): void {
    if (!this.metaInfo) {
      return;
    }

    this.items = [
      {
        label: this.t('metadata', 'Metadata')
      }
    ];

    if (!this.hideReports) {
      this.items.push({
        id: 'reports-root',
        label: this.t('reports', 'Reports'),
        items: [
          {
            id: 'create-report',
            label: this.t('report.create', 'Create report')
          }
        ]
      });
    }

    const columnItems: any[] = (this.metaInfo.columnMetadata || [])
      .filter((item) => item?.mc_ui_column_type !== 'button')
      .map((item) => {
        return {
          label: item.mc_display_string_in_view,
          command: (x) => {
            this.openEditor(x.item);
          },
          info: item
        };
      });

    columnItems.unshift({
      label: this.t('table.metadata', 'Table metadata') + ' - ' + this.metaInfo.tableMetadata.md_display_string,
      command: (x) => {
        this.openEditor(x.item);
      },
      info: this.metaInfo.tableMetadata
    });

    columnItems.unshift({
      label: this.t('metadata.menu.insert_column', 'Insert column'),
      id: 'insert-column',
      command: async () => {
        await this.openInsertColumnEditor();
      }
    });
    columnItems.unshift({
      label: this.t('metadata.menu.sync_from_schema', 'Sync metadata from schema'),
      id: 'sync-metadata-from-schema',
      command: async () => {
        await this.syncMetadataFromSchema();
      }
    });
    columnItems.unshift({
      label: this.t('metadata.menu.remove_column_schema', 'Remove column (schema + metadata)'),
      id: 'remove-column-schema',
      command: async () => {
        await this.removeColumn(true);
      }
    });
    columnItems.unshift({
      label: this.t('metadata.menu.remove_column_metadata', 'Remove column (metadata)'),
      id: 'remove-column-metadata',
      command: async () => {
        await this.removeColumn(false);
      }
    });

    this.items[0].items = columnItems;
    this.commitItems();
    if (this.viewReady) {
      void this.refreshExtendedMetadataMenuItems();
      void this.refreshReportMenuItems();
    }
  }

  /**
   * Restituisce la traduzione risorsa o fallback quando la chiave non e risolta.
   */
  private t(resource: string, fallback: string): string {
    const translated = this.trslSrv.instant(resource);
    if (!translated || translated === resource) {
      return fallback;
    }
    return translated;
  }

  /**
   * Genera un nome report univoco con timestamp (`Report_YYYYMMDD_HHMMSS.mrt`).
   */
  private buildNewReportName(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `Report_${timestamp}.mrt`;
  }

  /**
   * Risolve il route name attivo preferendo datasource.route e fallback su `metaInfo.tableMetadata.md_route_name`.
   */
  private getCurrentRouteName(): string {
    const fromDatasource = this.datasource?.value?.route?.value;
    const fromMeta = this.metaInfo?.tableMetadata?.md_route_name;
    return (fromDatasource || fromMeta || '').toString().trim();
  }

  /**
   * Naviga al report designer della route corrente, creando un nome report nuovo se non fornito.
   */
  private openReportDesigner(reportName?: string): void {
    const routeName = this.getCurrentRouteName();
    if (!routeName) {
      return;
    }

    const targetReportName = reportName || this.buildNewReportName();
    void this.router.navigateByUrl(
      '/' + routeName + '/report-designer?reportName=' + encodeURIComponent(targetReportName)
    );
  }

  /**
   * Ricarica la sezione Reports menu da server con protezione race tramite `reportMenuRefreshSeq`.
   */
  private async refreshReportMenuItems(): Promise<void> {
    if (this.hideReports) {
      return;
    }

    const refreshSeq = ++this.reportMenuRefreshSeq;
    const reportRoot = this.items?.find(x => x.id === 'reports-root');
    const routeName = this.getCurrentRouteName();
    if (!reportRoot || !routeName) {
      return;
    }

    const baseItems: MenuItem[] = [
      {
        id: 'create-report',
        label: this.t('report.create', 'Create report'),
        command: () => this.openReportDesigner()
      },
      { separator: true },
      {
        id: 'edit-reports-title',
        label: this.t('report.edit_reports', 'Edit reports'),
        disabled: true
      }
    ];

    try {
      const reports = await this.metaSrv.getReportList(routeName);
      if (refreshSeq !== this.reportMenuRefreshSeq || routeName !== this.getCurrentRouteName()) {
        return;
      }
      // Edit-report items: label clickabile = apri designer, icona `×` rossa
      // a destra (renderizzata dal template `#item` quando `deletable=true`)
      // = cancellazione con conferma. Riusiamo il pattern gia' esistente per
      // i custom actions/auth/styles invece di nidificare submenu (il template
      // override non renderizza p-menubar-submenu).
      const editItems: MenuItem[] = (reports || []).map((r) => {
        const displayName = String(r.name || '').replace(/\.mrt$/i, '');
        const fileName = String(r.name || '');
        return {
          id: 'edit-report',
          label: this.t('report.edit_prefix', 'Edit') + ': ' + displayName,
          reportName: fileName,
          deletable: true,
          deleteCommand: () => { void this.confirmAndDeleteReport(fileName, displayName); },
          command: () => this.openReportDesigner(fileName)
        } as any;
      });

      if (editItems.length) {
        baseItems.push(...editItems);
      } else {
        baseItems.push({
          id: 'no-report-found',
          label: this.t('report.none_found', 'No reports found'),
          disabled: true
        });
      }
    } catch {
      if (refreshSeq !== this.reportMenuRefreshSeq || routeName !== this.getCurrentRouteName()) {
        return;
      }
      baseItems.push({
        id: 'no-report-found',
        label: this.t('report.none_found', 'No reports found'),
        disabled: true
      });
    }

    reportRoot.items = baseItems;
    this.items = [...(this.items || [])];
    this.commitItems();
  }

  /**
   * Chiede conferma e poi cancella il report `.mrt` via `MetaService.removeReport`.
   * Il backend e' admin-only (ritorna `false` per non-admin); il refresh del menu
   * post-eliminazione passa per `getReportList` (cache invalidata dal service).
   */
  private deleteReportInFlight = new Set<string>();
  private async confirmAndDeleteReport(reportFileName: string, reportDisplayName: string): Promise<void> {
    const routeName = this.getCurrentRouteName();
    if (!routeName || !reportFileName) {
      return;
    }
    // Re-entrancy guard: evita doppia conferma/delete sullo stesso .mrt se
    // il click sull'icona `×` propaga (template render p-menubar puo' emettere
    // l'evento due volte in alcune varianti di build/hot-reload).
    const key = routeName + ' ' + reportFileName;
    if (this.deleteReportInFlight.has(key)) {
      return;
    }
    this.deleteReportInFlight.add(key);

    const messageTpl = this.trslSrv.instant('report.confirm.delete_{0}');
    const message = messageTpl && messageTpl !== 'report.confirm.delete_{0}'
      ? this.trslSrv.format(messageTpl, reportDisplayName)
      : `Eliminare il report "${reportDisplayName}"? L'operazione non e' annullabile.`;
    const confirmed = await WtoolboxService.confirm({
      message,
      header: this.trslSrv.instant('confirmation')
    });
    if (!confirmed) {
      this.deleteReportInFlight.delete(key);
      return;
    }

    try {
      const ok = await this.metaSrv.removeReport(routeName, reportFileName);
      if (!ok) {
        WtoolboxService.messageNotificationService.add({
          severity: 'error',
          summary: this.t('report.delete_failed', 'Report deletion failed'),
          detail: this.t('report.delete_failed_admin_only', 'Admin privileges required.')
        });
        return;
      }
      WtoolboxService.messageNotificationService.add({
        severity: 'success',
        summary: this.t('report.delete_ok', 'Report deleted'),
        detail: reportDisplayName
      });
    } catch (err: any) {
      WtoolboxService.messageNotificationService.add({
        severity: 'error',
        summary: this.t('report.delete_failed', 'Report deletion failed'),
        detail: err?.message || String(err)
      });
    } finally {
      // Forza refresh anche se il backend ha fallito (potrebbe aver cancellato il file ma fallito sul cleanup metadata).
      this.deleteReportInFlight.delete(key);
      await this.refreshReportMenuItems();
    }
  }

  /**
   * Ricarica le sezioni metadati estesi (azioni custom, autorizzazioni, stili) e aggiorna dinamicamente il menu.
   */
  private async refreshExtendedMetadataMenuItems(): Promise<void> {
    const refreshSeq = ++this.extendedMenuRefreshSeq;
    if (!this.items || !this.items.length || !this.metaInfo?.tableMetadata || !this.viewReady) {
      return;
    }

    const currentMdId = Number(this.metaInfo?.tableMetadata?.md_id);
    this.items = this.items.filter(x => x.id !== 'related-metadata-root');
    const relatedRoot: MenuItem = {
      id: 'related-metadata-root',
      label: this.t('related.metadata', 'Related metadata'),
      items: [{
        label: this.t('loading', 'Loading...'),
        disabled: true
      }]
    };
    if (this.items.length >= 1) {
      this.items.splice(1, 0, relatedRoot);
    } else {
      this.items.unshift(relatedRoot);
    }
    this.items = [...this.items];
    this.commitItems();

    const tableMetadata = this.metaInfo.tableMetadata as any;
    const tableCustomActions = (tableMetadata._Metadati_Custom_Actions_Tabelles || []) as any[];
    const tableStyles = this.getNestedTableStyles(tableMetadata);
    const nestedTableAuths = this.getNestedTableAuthorizations(tableMetadata);

    const columnStyles = this.getNestedColumnStyles(this.metaInfo.columnMetadata || []);
    const nestedColumnAuths = this.getNestedColumnAuthorizations(this.metaInfo.columnMetadata || []);
    const columnActions = (this.metaInfo.columnMetadata || []).filter((x: any) => x?.mc_ui_column_type === 'button');
    const conditionRows = this.getNestedConditionItems(tableMetadata);
    const contextRouteName = String(this.metaInfo?.tableMetadata?.md_route_name || '').trim();
    const conditionGroups = this.getDistinctConditionGroups(conditionRows);
    const conditionItems = this.extractConcreteConditionItems(conditionRows).map((row: any) => ({
      ...row,
      __context_route_name: contextRouteName
    }));
    const conditionGroupIds = this.getConditionGroupIdSet(conditionRows);
    const allConditionActionRows = this.getNestedConditionActions(conditionRows);
    const nestedConditionActionGroups = this.filterRowsByConditionGroupIds(
      this.getDistinctConditionActionGroups(conditionRows, allConditionActionRows),
      conditionGroupIds,
      ['FK_CG_Id', 'CG_Id']
    );
    const conditionActionGroupIds = this.getConditionActionGroupIdSet(nestedConditionActionGroups);
    const conditionActions = this.filterRowsByConditionActionGroupIds(
      this.extractConcreteConditionActionItems(allConditionActionRows),
      conditionActionGroupIds,
      ['FK_CAG_Id', 'CAG_Id']
    );
    const conditionActionGroups = nestedConditionActionGroups;
    await this.hydrateRoleDescriptionCache(
      [...nestedTableAuths, ...nestedColumnAuths],
      [this.metaAuthTableRoute, this.metaAuthColumnRoute]
    );

    const tableAuths = this.selectRelevantTableAuthorizations(nestedTableAuths, Number(tableMetadata.md_id));
    const columnAuths = this.selectRelevantColumnAuthorizations(nestedColumnAuths);

    if (
      refreshSeq !== this.extendedMenuRefreshSeq ||
      currentMdId !== Number(this.metaInfo?.tableMetadata?.md_id)
    ) {
      return;
    }

    const relatedItems: MenuItem[] = [];
    if (!this.hideRelatedTableActions) {
      this.appendRelatedMetadataSection(
        relatedItems,
        this.t('related.table_actions', 'Table Actions'),
        this.toMenuItems(tableCustomActions, x => x.button_caption || `Id ${x.Id}`, {
          id: 'insert-meta-custom-actions',
          label: this.trslSrv.instant('insert'),
          command: async () => {
            await this.openInsertRelatedMetadata(this.getRelatedMetadataDatasource(this.metaCustomActionsRoute), { md_id: this.metaInfo?.tableMetadata?.md_id }, this.metaCustomActionsRoute);
          }
        }, true, 'Id', 'Id', this.metaCustomActionsRoute)
      );
    }
    if (!this.hideRelatedColumnActions) {
      this.appendRelatedMetadataSection(
        relatedItems,
        this.t('related.column_actions', 'Column Actions'),
        this.toMenuItems(
          columnActions,
          (x: any) => x?.mc_button_caption || x?.mc_display_string_in_view || x?.mc_nome_colonna || `Id ${x?.mc_id || '-'}`,
          {
            id: 'insert-meta-column-actions',
            label: this.trslSrv.instant('insert'),
            command: async () => {
              await this.openInsertColumnActionMetadata();
            }
          },
          true,
          'mc_id',
          'mc_id',
          MetadataProviderService.metaColumnRoute || ' metadati  colonne'
        )
      );
    }
    this.appendRelatedMetadataSection(
      relatedItems,
      this.t('related.table_authorizations', 'Table authorizations'),
      this.toMenuItems(tableAuths, x => this.formatTableAuthorizationLabel(x), {
        id: 'insert-meta-auth-table',
        label: this.trslSrv.instant('insert'),
        command: async () => {
          await this.openInsertRelatedMetadata(this.getRelatedMetadataDatasource(this.metaAuthTableRoute), { md_id: this.metaInfo?.tableMetadata?.md_id }, this.metaAuthTableRoute);
        }
      }, true, 'muat_id', 'muat_id', this.metaAuthTableRoute)
    );
    this.appendRelatedMetadataSection(
      relatedItems,
      this.t('related.column_authorizations', 'Column authorizations'),
      this.toMenuItems(columnAuths, x => this.formatColumnAuthorizationLabel(x), {
        id: 'insert-meta-auth-column',
        label: this.trslSrv.instant('insert'),
        command: async () => {
          await this.openInsertRelatedMetadata(this.getRelatedMetadataDatasource(this.metaAuthColumnRoute), {}, this.metaAuthColumnRoute);
        }
      }, true, 'muac_id', 'muac_id', this.metaAuthColumnRoute)
    );
    this.appendRelatedMetadataSection(
      relatedItems,
      this.t('related.table_styles', 'Table styles'),
      this.toMenuItems(tableStyles, x => this.formatTableStyleLabel(x), {
        id: 'insert-meta-styles-table',
        label: this.trslSrv.instant('insert'),
        command: async () => {
          await this.openInsertRelatedMetadata(this.getRelatedMetadataDatasource(this.metaTableStyleRoute), { md_id: this.metaInfo?.tableMetadata?.md_id }, this.metaTableStyleRoute);
        }
      }, true, 'must_id', 'must_id', this.metaTableStyleRoute)
    );
    this.appendRelatedMetadataSection(
      relatedItems,
      this.t('related.column_styles', 'Column styles'),
      this.toMenuItems(columnStyles, x => `${x.__column_name || 'column'} - ${x.musc_attribute_name || ''}`.trim(), {
        id: 'insert-meta-styles-column',
        label: this.trslSrv.instant('insert'),
        command: async () => {
          await this.openInsertRelatedMetadata(this.getRelatedMetadataDatasource(this.metaColumnStyleRoute), {}, this.metaColumnStyleRoute);
        }
      }, true, 'musc_id', 'musc_id', this.metaColumnStyleRoute)
    );
    this.appendRelatedMetadataSection(
      relatedItems,
      this.t('related.condition_groups', 'Condition groups'),
      this.toMenuItems(conditionGroups, x => this.formatConditionGroupLabel(x), {
        id: 'insert-meta-condition-group',
        label: this.trslSrv.instant('insert'),
        command: async () => {
          await this.openInsertRelatedMetadata(
            this.getRelatedMetadataDatasource(this.metaConditionGroupRoute),
            { md_id: this.metaInfo?.tableMetadata?.md_id },
            this.metaConditionGroupRoute
          );
        }
      }, true, 'CG_Id', 'CG_Id', this.metaConditionGroupRoute)
    );
    this.appendRelatedMetadataSection(
      relatedItems,
      this.t('related.condition_items', 'Condition items'),
      this.toMenuItems(conditionItems, x => this.formatConditionItemLabel(x), {
        id: 'insert-meta-condition-item',
        label: this.trslSrv.instant('insert'),
        command: async () => {
          const seedFkCgId = this.pickFirstDefined(conditionRows[0], ['FK_CG_Id', 'CG_Id']);
          await this.openInsertRelatedMetadata(
            this.getRelatedMetadataDatasource(this.metaConditionItemRoute),
            { FK_CG_Id: seedFkCgId, __user_id: this.userInfoSrv.getuserInfo()?.user_id, __context_route_name: contextRouteName },
            this.metaConditionItemRoute
          );
        }
      }, true, 'CI_Id', 'CI_Id', this.metaConditionItemRoute)
    );
    this.appendRelatedMetadataSection(
      relatedItems,
      this.t('related.condition_action_groups', 'Condition action groups'),
      this.toMenuItems(conditionActionGroups, x => this.formatConditionActionGroupLabel(x), {
        id: 'insert-meta-condition-action-group',
        label: this.trslSrv.instant('insert'),
        command: async () => {
          const seedFkCgId = this.pickFirstDefined(conditionRows[0], ['FK_CG_Id', 'CG_Id']);
          await this.openInsertRelatedMetadata(
            this.getRelatedMetadataDatasource(this.metaConditionActionGroupRoute),
            { FK_CG_Id: seedFkCgId, __user_id: this.userInfoSrv.getuserInfo()?.user_id },
            this.metaConditionActionGroupRoute
          );
        }
      }, true, 'CAG_Id', 'CAG_Id', this.metaConditionActionGroupRoute)
    );
    this.appendRelatedMetadataSection(
      relatedItems,
      this.t('related.condition_action_items', 'Condition action items'),
      this.toMenuItems(conditionActions, x => this.formatConditionActionLabel(x), {
        id: 'insert-meta-condition-action',
        label: this.trslSrv.instant('insert'),
        command: async () => {
          const firstActionGroup = nestedConditionActionGroups[0] || null;
          const seedFkCagId = this.pickFirstDefined(firstActionGroup, ['CAG_Id', 'FK_CAG_Id']);
          await this.openInsertRelatedMetadata(
            this.getRelatedMetadataDatasource(this.metaConditionActionRoute),
            {
              FK_CAG_Id: seedFkCagId,
              __user_id: this.userInfoSrv.getuserInfo()?.user_id
            },
            this.metaConditionActionRoute
          );
        }
      }, true, 'CAI_Id', 'CAI_Id', this.metaConditionActionRoute)
    );
    if (relatedItems.length && relatedItems[relatedItems.length - 1]?.separator) {
      relatedItems.pop();
    }

    relatedRoot.items = relatedItems;
    this.items = [...this.items];
    this.commitItems();
  }

  /**
   * Converte una collezione record in `MenuItem[]` preservando label, comandi e metadati necessari alle azioni UI.
   */
  private toMenuItems(
    records: any[],
    labelResolver: (x: any) => string,
    insertItem?: MenuItem,
    allowDelete: boolean = false,
    deleteKey?: string,
    editorKey?: string,
    editorRoute?: string
  ): MenuItem[] {
    const items: MenuItem[] = [];
    if (insertItem) {
      const insertSeparatorId = 'related-meta-insert-separator-' + String(insertItem?.id || 'default');
      items.push(insertItem, { id: insertSeparatorId, separator: true } as any);
    }

    if (!records?.length) {
      items.push({ label: this.t('records.none_found', 'No records found'), disabled: true });
      return items;
    }

    records.forEach((row) => {
      const baseLabel = labelResolver(row) || this.t('record', 'Record');
      items.push({
        id: 'related-meta-record-item',
        label: baseLabel,
        command: (x) => {
          this.openEditor(x.item);
        },
        info: row,
        canDelete: allowDelete,
        deleteKey: deleteKey,
        editorKey: editorKey,
        editorRoute: editorRoute
      } as any);
    });

    return items;
  }

  /**
   * Definisce la mappa tra chiavi record (`mc_id`, `muat_id`, `Id`, ...) e datasource
   * da usare per aprire l'editor corretto.
   * L'ordine e rilevante per i fallback quando la chiave compare in piu sezioni.
   * @returns Elenco strategie di risoluzione editor.
   */
  private getEditorStrategies(): Array<{ key: string, ds: DataSourceComponent, route?: string }> {
    return [
      { key: 'CAG_Id', ds: this.getRelatedMetadataDatasource(this.metaConditionActionGroupRoute), route: this.metaConditionActionGroupRoute },
      { key: 'CAI_Id', ds: this.getRelatedMetadataDatasource(this.metaConditionActionRoute), route: this.metaConditionActionRoute },
      { key: 'CI_Id', ds: this.getRelatedMetadataDatasource(this.metaConditionItemRoute), route: this.metaConditionItemRoute },
      { key: 'CG_Id', ds: this.getRelatedMetadataDatasource(this.metaConditionGroupRoute), route: this.metaConditionGroupRoute },
      { key: 'musc_id', ds: this.getRelatedMetadataDatasource(this.metaColumnStyleRoute), route: this.metaColumnStyleRoute },
      { key: 'must_id', ds: this.getRelatedMetadataDatasource(this.metaTableStyleRoute), route: this.metaTableStyleRoute },
      { key: 'muac_id', ds: this.getRelatedMetadataDatasource(this.metaAuthColumnRoute), route: this.metaAuthColumnRoute },
      { key: 'muat_id', ds: this.getRelatedMetadataDatasource(this.metaAuthTableRoute), route: this.metaAuthTableRoute },
      { key: 'Id', ds: this.getRelatedMetadataDatasource(this.metaCustomActionsRoute), route: this.metaCustomActionsRoute },
      { key: 'mc_id', ds: this.datasourceColonne, route: ' metadati  colonne' },
      { key: 'md_id', ds: this.datasourceTabelle, route: ' metadati  tabelle' }
    ];
  }

  /**
   * Restituisce il datasource relativo alla sezione richiesta (custom actions/auth/style) se disponibile.
   */
  private getRelatedMetadataDatasource(route: string): DataSourceComponent {
    const normalizedRoute = this.normalizeKey(route || '');
    if (normalizedRoute === this.normalizeKey(this.metaCustomActionsRoute)) {
      return this.datasourceRelatedMetadataCustomActions || this.datasourceRelatedMetadataCompat;
    }
    if (normalizedRoute === this.normalizeKey(this.metaAuthTableRoute)) {
      return this.datasourceRelatedMetadataAuthTable || this.datasourceRelatedMetadataCompat;
    }
    if (normalizedRoute === this.normalizeKey(this.metaAuthColumnRoute)) {
      return this.datasourceRelatedMetadataAuthColumn || this.datasourceRelatedMetadataCompat;
    }
    if (normalizedRoute === this.normalizeKey(this.metaTableStyleRoute)) {
      return this.datasourceRelatedMetadataTableStyles || this.datasourceRelatedMetadataCompat;
    }
    if (normalizedRoute === this.normalizeKey(this.metaColumnStyleRoute)) {
      return this.datasourceRelatedMetadataColumnStyles || this.datasourceRelatedMetadataCompat;
    }
    if (normalizedRoute === this.normalizeKey(this.metaConditionGroupRoute)) {
      return this.datasourceRelatedMetadataConditionGroup || this.datasourceRelatedMetadataCompat;
    }
    if (normalizedRoute === this.normalizeKey(this.metaConditionItemRoute)) {
      return this.datasourceRelatedMetadataConditionItem || this.datasourceRelatedMetadataCompat;
    }
    if (normalizedRoute === this.normalizeKey(this.metaConditionActionGroupRoute)) {
      return this.datasourceRelatedMetadataConditionActionGroup || this.datasourceRelatedMetadataCompat;
    }
    if (normalizedRoute === this.normalizeKey(this.metaConditionActionRoute)) {
      return this.datasourceRelatedMetadataConditionAction || this.datasourceRelatedMetadataCompat;
    }
    return this.datasourceRelatedMetadata;
  }

  /**
   * Seleziona la strategia editor partendo dalla chiave record e, se presente,
   * dalla route preferita della sezione.
   * @param key Nome chiave identificativa presente nel record.
   * @param route Route metadata attesa per disambiguare strategie con stessa chiave.
   * @returns Strategia selezionata oppure `null` se non trovata.
   */
  private getEditorStrategyByKey(key: string, route?: string): { key: string, ds: DataSourceComponent, route?: string } | null {
    const normalizedKey = this.normalizeKey(key);
    const byKey = this.getEditorStrategies().filter((s) => this.normalizeKey(s.key) === normalizedKey);
    if (!byKey.length) {
      return null;
    }

    const normalizedRoute = this.normalizeKey(String(route || ''));
    if (normalizedRoute) {
      const byRoute = byKey.find((s) => this.normalizeKey(String(s.route || '')) === normalizedRoute);
      if (byRoute) {
        return byRoute;
      }
    }

    return byKey[0] || null;
  }

  /**
   * Arricchisce il record menu (`info`) con i dati completi trovati nelle collezioni
   * annidate di `metaInfo` della sezione corrispondente (auth/stili/custom actions).
   * @param info Record base proveniente dalla voce menu.
   * @param editorKey Chiave identita della sezione (es. `muac_id`, `must_id`).
   * @returns Record mergeato con priorita ai dati provenienti dalla sorgente annidata.
   */
  private hydrateContextRecordFromSection(info: any, editorKey: string): any {
    const base = this.deepUnwrapModelValue(info) || {};
    const normalizedEditorKey = this.normalizeKey(editorKey);
    if (!normalizedEditorKey || !this.metaInfo) {
      return base;
    }

    const strategy = this.getEditorStrategyByKey(editorKey);
    const idValue = this.pickFirstDefined(base, [strategy?.key || editorKey]);
    if (idValue === undefined || idValue === null || idValue === '') {
      return base;
    }
    const targetId = String(idValue);

    const conditionRows = this.getNestedConditionItems(this.metaInfo.tableMetadata);
    const conditionActions = this.getNestedConditionActions(conditionRows);
    const sourcesByKey: { [key: string]: any[] } = {
      [this.normalizeKey('CAG_Id')]: this.getDistinctConditionActionGroups(conditionRows, conditionActions),
      [this.normalizeKey('CAI_Id')]: conditionActions,
      [this.normalizeKey('CI_Id')]: this.extractConcreteConditionItems(conditionRows),
      [this.normalizeKey('CG_Id')]: this.getDistinctConditionGroups(conditionRows),
      [this.normalizeKey('musc_id')]: this.getNestedColumnStyles(this.metaInfo.columnMetadata || []),
      [this.normalizeKey('must_id')]: this.getNestedTableStyles(this.metaInfo.tableMetadata),
      [this.normalizeKey('muac_id')]: this.getNestedColumnAuthorizations(this.metaInfo.columnMetadata || []),
      [this.normalizeKey('muat_id')]: this.getNestedTableAuthorizations(this.metaInfo.tableMetadata),
      [this.normalizeKey('Id')]: (this.metaInfo.tableMetadata as any)?._Metadati_Custom_Actions_Tabelles || []
    };

    const sourceRows = sourcesByKey[normalizedEditorKey] || [];
    const sourceIdKey = strategy?.key || editorKey;
    const exact = sourceRows.find((row: any) =>
      String(this.pickFirstDefined(row, [sourceIdKey]) ?? '') === targetId
    );

    return exact ? Object.assign({}, this.deepUnwrapModelValue(exact) || {}, base) : base;
  }

  /**
* Risolge il valore finale in `resolveEditorContext` combinando contesto runtime e regole locali.
* @param info Parametro utilizzato dal metodo nel flusso elaborativo.
* @param opts Flag che abilita/disabilita rami della logica.
* @returns Promise che conclude l'operazione asincrona di `resolveEditorContext` restituendo un valore di tipo `Promise<{ ds: DataSourceComponent; record: any } | null>`.
*/
  private async resolveEditorContext(
    info: any,
    opts?: { preferredKeys?: string[]; strictPreferred?: boolean }
  ): Promise<{ ds: DataSourceComponent; record: any } | null> {
    if (!info) {
      return null;
    }

    const allStrategies = this.getEditorStrategies();
    const preferred = (opts?.preferredKeys || []).map((k) => this.normalizeKey(k));
    const preferredStrategies = preferred.length
      ? allStrategies.filter((s) => preferred.indexOf(this.normalizeKey(s.key)) >= 0)
      : [];
    const fallbackStrategies = preferred.length
      ? allStrategies.filter((s) => preferred.indexOf(this.normalizeKey(s.key)) < 0)
      : allStrategies;
    const strategies = opts?.strictPreferred && preferred.length
      ? preferredStrategies
      : [...preferredStrategies, ...fallbackStrategies];

    for (const strategy of strategies) {
      const strategyValue = this.pickFirstDefined(info, [strategy.key]);
      if ((strategyValue === undefined || strategyValue === null || strategyValue === '') || !strategy.ds) {
        continue;
      }

      await this.ensureDatasourceSchema(strategy.ds, strategy.route);
      const keyColumn =
        strategy.ds?.metaInfo?.columnMetadata?.find((c: any) => this.normalizeKey(c?.mc_nome_colonna) === this.normalizeKey(String(strategy.key)))?.mc_nome_colonna
        || String(strategy.key);
      const target = String(strategyValue);
      strategy.ds.filterInfo = { logic: 'AND', filters: [{ field: keyColumn, value: target, operatore: 'eq' }] };
      const payload = await strategy.ds.fetchData();
      const record = (payload?.resultInfo?.dato || []).find((x: any) => {
        const candidate = this.pickFirstDefined(x, [keyColumn, strategy.key]);
        return String(candidate ?? '') === target;
      });
      if (record) {
        return { ds: strategy.ds, record };
      }
    }

    return null;
  }

  /**
 * Esegue una operazione di persistenza/sincronizzazione mantenendo coerente lo stato locale usando i metadati per determinare chiavi, campi e comportamento runtime, allineando i record al formato atteso dai componenti del framework, coordinando chiamate verso servizi applicativi.
 * @param item Record/elemento su cui il metodo applica trasformazioni, validazioni o aggiornamenti.
 */
  private async deleteRelatedMetadataItem(item: any): Promise<void> {
    const info = item?.info;
    const label = item?.label;
    const deleteKey = item?.deleteKey;
    const confirmed = await WtoolboxService.confirm({
      message: this.trslSrv.format(
        this.t('related.delete_confirm', 'Delete "{0}"?'),
        label || this.t('record', 'record')
      ),
      header: this.trslSrv.instant('confirmation')
    });
    if (!confirmed) {
      return;
    }

    const strategy = deleteKey ? this.getEditorStrategyByKey(String(deleteKey), String(item?.editorRoute || '')) : null;
    if (strategy?.ds && deleteKey) {
      const targetValue = this.pickFirstDefined(info, [String(deleteKey)]);
      if (targetValue === undefined || targetValue === null || targetValue === '') {
        return;
      }

      if (!this.isDesignerMemoryOnlyMode()) {
        await this.ensureDatasourceSchema(strategy.ds, strategy.route);
      }

      const normalizedRecord = this.deepUnwrapModelValue(info) || {};
      const dsColumnName =
        strategy.ds?.metaInfo?.columnMetadata?.find((c: any) => this.normalizeKey(c?.mc_nome_colonna) === this.normalizeKey(String(deleteKey)))?.mc_nome_colonna
        || String(deleteKey);
      normalizedRecord[dsColumnName] = targetValue;

      if (!this.isDesignerMemoryOnlyMode()) {
        await strategy.ds.syncData(normalizedRecord, normalizedRecord, true);
      }
      await this.notifyDeleteToSaveCallback(dsColumnName, targetValue, normalizedRecord, deleteKey);
      if (this.isDesignerMemoryOnlyMode()) {
        await this.refreshDesignerMenuAfterMutation();
      } else {
        await this.reloadMetadataEditorState();
      }
      return;
    }

    const preferredKeys = deleteKey ? [String(deleteKey)] : [];
    const context = this.isDesignerMemoryOnlyMode()
      ? await this.resolveLocalEditorContext(info, { preferredKeys, strictPreferred: preferredKeys.length > 0 })
      : await this.resolveEditorContext(info, { preferredKeys, strictPreferred: preferredKeys.length > 0 });
    if (!context?.ds || !context.record) {
      return;
    }

    const normalizedRecord = this.normalizeRecordForDelete(context.ds, context.record);
    if (!normalizedRecord) {
      return;
    }

    const deleteKeyName = deleteKey || this.resolveFirstIdentityKey(normalizedRecord) || '';
    const deleteValue = deleteKeyName ? this.pickFirstDefined(normalizedRecord, [deleteKeyName]) : undefined;
    if (!this.isDesignerMemoryOnlyMode()) {
      await context.ds.syncData(normalizedRecord, normalizedRecord, true);
    }
    if (deleteKeyName && deleteValue !== undefined) {
      await this.notifyDeleteToSaveCallback(deleteKeyName, deleteValue, normalizedRecord, deleteKeyName);
    }
    if (this.isDesignerMemoryOnlyMode()) {
      await this.refreshDesignerMenuAfterMutation();
    } else {
      await this.reloadMetadataEditorState();
    }
  }

  /**
   * Notifica al callback esterno un delete logico passando il record normalizzato e il tipo di sezione.
   */
  private async notifyDeleteToSaveCallback(
    keyName: string,
    keyValue: any,
    sourceRecord: any,
    editorKey?: string
  ): Promise<void> {
    if (typeof this.saveCallback !== 'function' || !keyName) {
      return;
    }

    const payload: any = { __deleted: true };
    payload[String(keyName)] = keyValue;
    const original = this.deepUnwrapModelValue(sourceRecord || {}) || {};
    original[String(keyName)] = keyValue;
    await Promise.resolve(this.saveCallback(payload, original, editorKey || String(keyName)));
  }

  /**
   * Individua la prima chiave identitaria valorizzata in un record usando
   * l'ordine di priorita delle chiavi note del metadata editor.
   * @param record Record da analizzare.
   * @returns Nome chiave trovata oppure stringa vuota.
   */
  private resolveFirstIdentityKey(record: any): string {
    const candidates = ['CAI_Id', 'CI_Id', 'CG_Id', 'CAG_Id', 'Id', 'id', 'muat_id', 'muac_id', 'must_id', 'musc_id', 'mc_id', 'md_id'];
    const found = candidates.find((key) => {
      const value = this.pickFirstDefined(record, [key]);
      return value !== undefined && value !== null && value !== '';
    });
    return found || '';
  }

  /**
   * Normalizza il record da eliminare rimuovendo wrapper/model proxies e mantenendo solo valori serializzabili.
   */
  private normalizeRecordForDelete(ds: DataSourceComponent, record: any): any {
    if (!record) {
      return null;
    }

    const model = ds?.getModelFromObservable ? ds.getModelFromObservable(record) : record;
    return this.deepUnwrapModelValue(model);
  }

  /**
   * Esegue unwrap ricorsivo di oggetti/array modello per ottenere valori plain JS.
   */
  private deepUnwrapModelValue(value: any, seen?: WeakMap<object, any>): any {
    const unwrapped = this.unwrapValue(value);
    if (!unwrapped || typeof unwrapped !== 'object') {
      return unwrapped;
    }

    const visited = seen || new WeakMap<object, any>();
    if (visited.has(unwrapped)) {
      return visited.get(unwrapped);
    }

    if (Array.isArray(unwrapped)) {
      const normalizedArray: any[] = [];
      visited.set(unwrapped, normalizedArray);
      unwrapped.forEach((item) => {
        normalizedArray.push(this.deepUnwrapModelValue(item, visited));
      });
      return normalizedArray;
    }

    const normalized: any = {};
    visited.set(unwrapped, normalized);
    Object.keys(unwrapped).forEach((key) => {
      normalized[key] = this.deepUnwrapModelValue(unwrapped[key], visited);
    });
    return normalized;
  }

  /**
   * Aggiunge al menubar una sezione di metadati correlati con voci, pulsanti inserimento e azioni delete contestuali.
   */
  private appendRelatedMetadataSection(target: MenuItem[], title: string, sectionItems: MenuItem[]): void {
    const normalizedTitle = title.replace(/\s+/g, '-').toLowerCase();
    target.push({
      id: 'related-meta-section-' + normalizedTitle,
      label: title,
      disabled: true
    } as any);
    target.push(...(sectionItems || []));
    target.push({ id: 'related-meta-section-separator-' + normalizedTitle, separator: true } as any);
  }

  /**
   * Restituisce il primo valore non vuoto cercando una lista chiavi con varianti
   * di naming (case, underscore/no-underscore) e mapping su chiavi normalizzate.
   * @param row Oggetto sorgente.
   * @param keys Chiavi candidate in ordine di precedenza.
   * @returns Primo valore significativo trovato, altrimenti `undefined`.
   */
  private pickFirstDefined(row: any, keys: string[]): any {
    if (!row || !keys?.length) {
      return undefined;
    }

    const keyMap = new Map<string, string>();
    Object.keys(row).forEach((k) => keyMap.set(this.normalizeKey(k), k));

    for (const key of keys) {
      const candidates = [
        key,
        key.toLowerCase(),
        key.toUpperCase(),
        key.replace(/_/g, ''),
        key.replace(/_/g, '').toLowerCase(),
        key.replace(/_/g, '').toUpperCase()
      ];

      for (const candidate of candidates) {
        const mappedKey = row?.[candidate] !== undefined ? candidate : keyMap.get(this.normalizeKey(candidate));
        if (!mappedKey) {
          continue;
        }

        const value = this.unwrapValue(row[mappedKey]);
        if (value !== undefined && value !== null && value !== '') {
          return value;
        }
      }
    }
    return undefined;
  }

  /**
   * Compone l'etichetta leggibile per una regola di autorizzazione tabella (ruolo + descrizione + target).
   */
  private formatTableAuthorizationLabel(row: any): string {
    const authId = this.pickFirstDefined(row, ['muat_id']);
    const userId = this.pickFirstDefined(row, ['utente_id', 'UTENTE_ID', 'user_id', 'USER_ID']);
    const userName = this.getUserDescription(row, userId);
    const roleId = this.pickFirstDefined(row, ['id_ruolo', 'ruolo_id']);
    const roleDescription = this.getRoleDescription(row, roleId);
    const companyId = this.pickFirstDefined(row, ['azienda_id', 'AZIENDA_ID', 'company_id', 'COMPANY_ID']);
    const actionId = this.pickFirstDefined(row, ['action_id']);

    const subject = roleDescription
      ? `Role ${roleDescription}`
      : roleId
        ? `Role ${roleId}`
        : userName
          ? `User ${userName}`
          : userId
            ? `User ${userId}`
            : companyId != null
              ? `Company ${companyId}`
              : actionId
                ? `Action ${actionId}`
                : `Id ${authId ?? '-'}`;

    const perms = this.formatAuthorizationPermissions(row);
    const overrideRecordRestriction = this.toBool(this.pickFirstDefined(row, ['muat_override_record_restriction']));
    const extras = overrideRecordRestriction ? ' | override restriction' : '';

    return `${subject} | ${perms}${extras}`;
  }

  /**
   * Converte i flag CRUD dell'autorizzazione in testo compatto (R/W/C/D) per la label menu.
   */
  private formatAuthorizationPermissions(row: any): string {
    const view = this.toTriStateFlag(this.pickFirstDefined(row, ['muat_view']));
    const edit = this.toTriStateFlag(this.pickFirstDefined(row, ['muat_edit']));
    const insert = this.toTriStateFlag(this.pickFirstDefined(row, ['muat_insert']));
    const del = this.toTriStateFlag(this.pickFirstDefined(row, ['muat_delete']));
    return `V:${view} E:${edit} I:${insert} D:${del}`;
  }

  /**
   * Compone la label di autorizzazione colonna includendo nome campo e ruolo associato.
   */
  private formatColumnAuthorizationLabel(row: any): string {
    const authId = this.pickFirstDefined(row, ['muac_id', 'MUAC_ID', 'id']);
    const columnName = this.pickFirstDefined(row, ['mc_nome_colonna', '__column_name']) || 'column';
    const userId = this.pickFirstDefined(row, ['utente_id', 'UTENTE_ID', 'user_id', 'USER_ID']);
    const userName = this.getUserDescription(row, userId);
    const roleId = this.pickFirstDefined(row, ['id_ruolo', 'ruolo_id']);
    const roleDescription = this.getRoleDescription(row, roleId);
    const companyId = this.pickFirstDefined(row, ['azienda_id', 'AZIENDA_ID', 'company_id', 'COMPANY_ID']);
    const actionId = this.pickFirstDefined(row, ['action_id']);

    const subject = roleDescription
      ? `Role ${roleDescription}`
      : roleId
        ? `Role ${roleId}`
        : userName
          ? `User ${userName}`
          : userId
            ? `User ${userId}`
            : companyId != null
              ? `Company ${companyId}`
              : actionId
                ? `Action ${actionId}`
                : `Id ${authId ?? '-'}`;

    const perms = this.formatColumnAuthorizationPermissions(row);
    return `${columnName} | ${subject} | ${perms}`;
  }

  /**
   * Formatta i permessi colonna in stringa sintetica per visualizzazione menu.
   */
  private formatColumnAuthorizationPermissions(row: any): string {
    const view = this.toTriStateFlag(this.pickFirstDefined(row, ['muac_view']));
    const editable = this.toTriStateFlag(this.pickFirstDefined(row, ['muac_editable']));
    const required = this.toTriStateFlag(this.pickFirstDefined(row, ['muac_validation_required']));
    return `V:${view} E:${editable} R:${required}`;
  }

  /**
   * Compone l'etichetta di uno stile tabella mostrando nome stile e target di applicazione.
   */
  private formatTableStyleLabel(row: any): string {
    const cssClass = (this.pickFirstDefined(row, ['must_attribute_name']) || '').toString().trim();
    return cssClass || 'style';
  }

  /**
   * Compone la label per i condition groups.
   */
  private formatConditionGroupLabel(row: any): string {
    const groupName = String(this.pickFirstDefined(row, ['CG_Name']) || '').trim();
    const groupId = this.pickFirstDefined(row, ['CG_Id']);
    return groupName || `Group ${groupId ?? '-'}`;
  }

  /**
   * Compone la label per i condition items.
   */
  private formatConditionItemLabel(row: any): string {
    const groupName = String(this.pickFirstDefined(row, ['CG_Name']) || '').trim();
    const left = String(this.pickFirstDefined(row, ['CI_Comparison_Left_Field']) || '').trim();
    const operator = String(this.pickFirstDefined(row, ['CI_Comparison_Operator']) || '').trim();
    const right = String(this.pickFirstDefined(row, ['CI_Comparison_Right_Field']) || '').trim();
    const formula = String(this.pickFirstDefined(row, ['CI_Formula']) || '').trim();
    const itemId = this.pickFirstDefined(row, ['CI_Id']);
    const main = [left, operator, right].filter((x) => !!x).join(' ');
    const expression = main || formula || `CI ${itemId ?? '-'}`;
    return groupName ? `${groupName} | ${expression}` : expression;
  }

  /**
   * Compone la label per i condition action groups.
   */
  private formatConditionActionGroupLabel(row: any): string {
    const actionGroupName = String(this.pickFirstDefined(row, ['CAG_Name']) || '').trim();
    const parentGroupName = String(this.pickFirstDefined(row, ['CG_Name']) || '').trim();
    const actionGroupId = this.pickFirstDefined(row, ['CAG_Id']);
    const base = actionGroupName || `Action group ${actionGroupId ?? '-'}`;
    return parentGroupName ? `${parentGroupName} | ${base}` : base;
  }

  /**
   * Compone la label per i condition action items.
   */
  private formatConditionActionLabel(row: any): string {
    const actionGroup = String(this.pickFirstDefined(row, ['CAG_Name']) || '').trim();
    const targetField = String(this.pickFirstDefined(row, ['CAI_Target_Field']) || '').trim();
    const targetAction = String(this.pickFirstDefined(row, ['CAI_Target_Action']) || '').trim();
    const actionId = this.pickFirstDefined(row, ['CAI_Id']);
    const main = [targetField, targetAction].filter((x) => !!x).join(' -> ');
    const fallback = main || `Action ${actionId ?? '-'}`;
    return actionGroup ? `${actionGroup} | ${fallback}` : fallback;
  }

  /**
   * Normalizza un valore in flag tri-state (`true`/`false`/`null`) usato dai formatter permessi.
   */
  private toTriStateFlag(value: any): string {
    if (value === undefined || value === null || value === '') {
      return '-';
    }
    return this.toBool(value) ? 'Y' : 'N';
  }

  /**
   * Converte input eterogenei (`1/0`, `true/false`, stringhe) in boolean coerente.
   */
  private toBool(value: any): boolean {
    value = this.unwrapValue(value);
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    const normalized = String(value).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'y' || normalized === 'yes';
  }

  /**
   * Normalizza una chiave per confronti robusti: lowercase e rimozione caratteri non alfanumerici.
   * @param key Chiave originale.
   * @returns Chiave normalizzata.
   */
  private normalizeKey(key: string): string {
    return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Estrae il valore effettivo da wrapper modello (`value`, `_value`, observable wrappers).
   */
  private unwrapValue(value: any): any {
    if (value && typeof value === 'object' && typeof value.next === 'function' && 'value' in value) {
      return value.value;
    }
    return value;
  }

  /**
   * Estrae una descrizione utente leggibile da campi diretti, alias lookup o oggetti lookup
   * annidati, evitando valori vuoti o uguali all'id utente.
   * @param row Riga autorizzazione da cui ricavare il testo utente.
   * @param userId Id utente usato come filtro per evitare label non informative.
   * @returns Descrizione utente oppure `undefined`.
   */
  private getUserDescription(row: any, userId: any): string | undefined {
    const direct = this.pickFirstDefined(row, [
      'utente',
      'user',
      'username',
      'user_name',
      'utente_nome',
      'utente_descrizione',
      'user_description',
      'display_name',
      'nome_utente'
    ]);
    if (this.hasMeaningfulRoleText(direct, userId)) {
      return String(direct);
    }

    const lookupObjCandidates = Object.keys(row || {}).filter((k) => /(?:utente_?id|user_?id)__lookup_obj$/i.test(k));
    for (const key of lookupObjCandidates) {
      const lookupObj = this.unwrapValue(row[key]);
      if (!lookupObj || typeof lookupObj !== 'object') {
        continue;
      }

      const fromObj = this.pickFirstDefined(lookupObj, [
        'utente',
        'user',
        'username',
        'user_name',
        'display_name',
        'nome',
        'name',
        'label',
        'title'
      ]);
      if (this.hasMeaningfulRoleText(fromObj, userId)) {
        return String(fromObj);
      }
    }

    const lookupAliasCandidates = Object.keys(row || {}).filter((k) => /__(?:utente_?id|user_?id)$/i.test(k));
    for (const key of lookupAliasCandidates) {
      const aliasValue = this.unwrapValue(row[key]);
      if (this.hasMeaningfulRoleText(aliasValue, userId)) {
        return String(aliasValue);
      }
    }

    return undefined;
  }

  /**
   * Ricava la descrizione ruolo usando cache locale, campo diretto `ruolo_des`
   * o oggetto lookup annidato associato al ruolo.
   * @param row Riga sorgente.
   * @param roleId Id ruolo corrente.
   * @returns Descrizione ruolo oppure `undefined`.
   */
  private getRoleDescription(row: any, roleId: any): string | undefined {
    const cacheKey = roleId !== undefined && roleId !== null ? String(roleId).trim() : '';
    if (cacheKey && this.roleDescriptionById.has(cacheKey)) {
      return this.roleDescriptionById.get(cacheKey);
    }

    const direct = this.unwrapValue(row?.ruolo_des);
    if (this.hasMeaningfulRoleText(direct, roleId)) {
      return String(direct);
    }

    const lookupObjCandidates = Object.keys(row || {}).filter((k) => /(?:ruolo_?id|role_?id)__lookup_obj$/i.test(k));
    for (const key of lookupObjCandidates) {
      const lookupObj = this.unwrapValue(row[key]);
      if (!lookupObj || typeof lookupObj !== 'object') {
        continue;
      }

      const fromObj = this.unwrapValue(lookupObj?.ruolo_des);
      if (this.hasMeaningfulRoleText(fromObj, roleId)) {
        return String(fromObj);
      }
    }

    return undefined;
  }

  /**
   * Carica e cachea le descrizioni ruolo da datasource lookup per arricchire le label autorizzazioni.
   */
  private async hydrateRoleDescriptionCache(rows: any[], roleLookupRoutes: string[] = []): Promise<void> {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      return;
    }

    // First pass: harvest role descriptions already present in current payload.
    list.forEach((row) => {
      const roleId = this.pickFirstDefined(row, ['id_ruolo', 'ruolo_id']);
      if (roleId === undefined || roleId === null || roleId === '') {
        return;
      }
      const key = String(roleId).trim();
      if (!key || this.roleDescriptionById.has(key)) {
        return;
      }

      const desc = this.unwrapValue(row?.ruolo_des);
      if (this.hasMeaningfulRoleText(desc, roleId)) {
        this.roleDescriptionById.set(key, String(desc));
      }
    });

    const missingRoleIds = Array.from(
      new Set(
        list
          .map((row) => this.pickFirstDefined(row, ['id_ruolo', 'ruolo_id']))
          .filter((x) => x !== undefined && x !== null && x !== '')
          .map((x) => String(x).trim())
          .filter((x) => !!x && !this.roleDescriptionById.has(x))
      )
    );
    if (!missingRoleIds.length) {
      return;
    }

    try {
      const endpoint = MetadataProviderService.GetUserListTestUri
        || (WtoolboxService.appSettings?.global_root_url || '').toString() + 'MetaService.GetUserListTest';
      if (!endpoint) {
        return;
      }

      const raw = await WtoolboxService.http.post<any>(endpoint, {}).toPromise();
      const parsed = this.parseMaybeSerialized(raw);
      const users = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.res)
          ? parsed.res
          : Array.isArray(parsed?.result)
            ? parsed.result
            : Array.isArray(parsed?.d)
              ? parsed.d
              : [];

      users.forEach((u: any) => {
        const roleId = this.pickFirstDefined(u, ['ruolo_id']);
        const roleName = this.unwrapValue(u?.ruolo_des);

        if (roleId === undefined || roleId === null || roleId === '') {
          return;
        }
        if (!this.hasMeaningfulRoleText(roleName, roleId)) {
          return;
        }

        const key = String(roleId).trim();
        if (!key || this.roleDescriptionById.has(key)) {
          return;
        }
        this.roleDescriptionById.set(key, String(roleName));
      });
    } catch {
      // Best-effort enrichment only.
    }

    const stillMissingRoleIds = Array.from(
      new Set(
        missingRoleIds
          .map((x) => String(x || '').trim())
          .filter((x) => !!x && !this.roleDescriptionById.has(x))
      )
    );
    if (!stillMissingRoleIds.length) {
      return;
    }

    await this.hydrateRoleDescriptionsFromLookupRoutes(stillMissingRoleIds, roleLookupRoutes);
  }

  /**
   * Interroga le route lookup configurate e aggiorna la mappa `roleDescriptionById` con fallback robusto.
   */
  private async hydrateRoleDescriptionsFromLookupRoutes(roleIds: string[], routes: string[]): Promise<void> {
    const missingRoleIds = (Array.isArray(roleIds) ? roleIds : [])
      .map((x) => String(x || '').trim())
      .filter((x) => !!x && !this.roleDescriptionById.has(x));
    if (!missingRoleIds.length) {
      return;
    }

    const routeList = Array.from(
      new Set(
        (Array.isArray(routes) ? routes : [])
          .map((x) => String(x || '').trim())
          .filter((x) => !!x)
      )
    );
    if (!routeList.length) {
      return;
    }

    const endpoint = (WtoolboxService.appSettings?.global_root_url || '').toString() + 'MetaService.getLookupListByRoute';
    if (!endpoint) {
      return;
    }

    for (const route of routeList) {
      if (!missingRoleIds.some((x) => !this.roleDescriptionById.has(x))) {
        return;
      }

      try {
        const metas = await this.metaSrv.getMetadati(route);
        if (!Array.isArray(metas) || !metas.length) {
          continue;
        }

        const roleField = metas.find((mc: any) => this.isRoleLookupField(mc));
        const roleFieldMcId = Number(roleField?.mc_id);
        if (!Number.isFinite(roleFieldMcId) || roleFieldMcId <= 0) {
          continue;
        }

        const raw = await WtoolboxService.http.post<any>(endpoint, { mc_id: roleFieldMcId }).toPromise();
        const parsed = this.parseMaybeSerialized(raw);
        const items = this.extractLookupItems(parsed);
        if (!items.length) {
          continue;
        }

        const missingSet = new Set(
          missingRoleIds
            .map((x) => String(x || '').trim())
            .filter((x) => !!x)
        );

        for (const item of items) {
          const value = this.pickLookupValue(item, roleField);
          const text = this.pickLookupText(item, roleField, value);
          if (!value || !text) {
            continue;
          }
          // Accept only values that are actually missing role ids for this page/context.
          if (!missingSet.has(String(value).trim())) {
            continue;
          }

          const key = String(value).trim();
          if (!key || this.roleDescriptionById.has(key)) {
            continue;
          }
          this.roleDescriptionById.set(key, text);
        }
      } catch {
        // Best-effort enrichment only.
      }
    }
  }

  /**
* Valuta la condizione gestita da `isRoleLookupField` restituendo un esito utile al flusso.
* @param field Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Esito booleano della verifica/esecuzione effettuata da `isRoleLookupField`.
*/
  private isRoleLookupField(field: any): boolean {
    const columnName = this.normalizeKey(String(field?.mc_nome_colonna || ''));
    const displayName = this.normalizeKey(String(field?.mc_display_string_in_edit || field?.mc_display_string_in_view || ''));
    const containsRole = columnName.includes('ruolo') || columnName.includes('role') || displayName.includes('ruolo') || displayName.includes('role');
    if (!containsRole) {
      return false;
    }

    const isLookup = String(field?.mc_ui_column_type || '').toLowerCase() === 'lookupbyid';
    const looksLikeRoleId = columnName.includes('id_ruolo');
    return isLookup || looksLikeRoleId;
  }

  /**
   * Estrae l'array item da payload lookup supportando risposte serializzate o strutture annidate.
   */
  private extractLookupItems(value: any): any[] {
    const parsed = this.parseMaybeSerialized(value);
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.res)
        ? parsed.res
        : Array.isArray(parsed?.result)
          ? parsed.result
          : Array.isArray(parsed?.d)
            ? parsed.d
            : [];
    if (!Array.isArray(list) || !list.length) {
      return [];
    }
    return list;
  }

  /**
   * Risolve la chiave valore dell'item lookup cercando i campi convenzionali disponibili.
   */
  private pickLookupValue(item: any, roleField: any): string | undefined {
    const valueField = String(roleField?.mc_ui_lookup_dataValueField || '').trim();
    const value = this.pickFirstDefined(item, [
      valueField,
      'value',
      'id',
      'key',
      'ID',
      'Value'
    ]);
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    return String(value).trim();
  }

  /**
   * Risolve il testo descrittivo dell'item lookup cercando i campi label convenzionali.
   */
  private pickLookupText(item: any, _roleField: any, roleId: any): string | undefined {
    const text = this.unwrapValue(item?.ruolo_des);
    if (!this.hasMeaningfulRoleText(text, roleId)) {
      return undefined;
    }
    return String(text).trim();
  }

  /**
   * Verifica che un testo sia utilizzabile come label ruolo/utente:
   * non nullo, non vuoto e diverso dall'id tecnico.
   * @param value Testo candidato.
   * @param roleId Id tecnico da scartare quando coincide col testo.
   * @returns `true` se il testo e significativo.
   */
  private hasMeaningfulRoleText(value: any, roleId: any): boolean {
    if (value === undefined || value === null) {
      return false;
    }

    const text = String(value).trim();
    if (!text) {
      return false;
    }

    if (roleId !== undefined && roleId !== null && text === String(roleId).trim()) {
      return false;
    }

    return true;
  }

  /**
   * Filtra e ordina le autorizzazioni colonna pertinenti al metadata corrente.
   */
  private selectRelevantColumnAuthorizations(rows: any[]): any[] {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      return [];
    }
    const validRows = list.filter((row) => {
      const authId = Number(this.pickFirstDefined(row, ['muac_id']));
      return Number.isFinite(authId) && authId !== 0;
    });
    if (!validRows.length) {
      return [];
    }
    if (this.shouldShowAllAuthorizationsForMetadataEditor()) {
      return [...validRows].sort((a, b) => {
        const aCol = String(this.pickFirstDefined(a, ['mc_nome_colonna', '__column_name']) || '');
        const bCol = String(this.pickFirstDefined(b, ['mc_nome_colonna', '__column_name']) || '');
        const byCol = aCol.localeCompare(bCol);
        if (byCol !== 0) {
          return byCol;
        }
        const aId = Number(this.pickFirstDefined(a, ['muac_id']));
        const bId = Number(this.pickFirstDefined(b, ['muac_id']));
        return aId - bId;
      });
    }

    const user = this.userInfoSrv.getuserInfo();
    const userId = Number(user?.user_id);
    const roleId = String(user?.role_id ?? '').trim();
    const companyId = this.pickFirstDefined(user, ['company_id', 'azienda_id', 'companyid']);

    const groupMap = new Map<number, any[]>();
    validRows.forEach((row) => {
      const mcId = Number(this.pickFirstDefined(row, ['mc_id']));
      if (!Number.isFinite(mcId) || mcId <= 0) {
        return;
      }
      if (!groupMap.has(mcId)) {
        groupMap.set(mcId, []);
      }
      groupMap.get(mcId)!.push(row);
    });

    const result: any[] = [];
    groupMap.forEach((groupRows) => {
      const scored = groupRows.map((row) => {
        const score = this.computeAuthorizationScore(row, userId, roleId, companyId, 'column');
        return { row, score };
      });

      scored.sort((a, b) => b.score - a.score);
      if (scored.length) {
        result.push(scored[0].row);
      }
    });

    return result;
  }

  /**
   * Filtra e ordina le autorizzazioni tabella pertinenti al contesto editor corrente.
   */
  private selectRelevantTableAuthorizations(rows: any[], currentMdId: number): any[] {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      return [];
    }

    const validRows = list.filter((row) => {
      const authId = Number(this.pickFirstDefined(row, ['muat_id']));
      return Number.isFinite(authId) && authId !== 0;
    });
    const byRoute = Number.isFinite(currentMdId) && currentMdId > 0
      ? validRows.filter((row) => Number(this.pickFirstDefined(row, ['md_id'])) === currentMdId)
      : validRows;

    const candidates = byRoute.length ? byRoute : validRows;
    if (this.shouldShowAllAuthorizationsForMetadataEditor()) {
      return [...candidates].sort((a, b) => {
        const aId = Number(this.pickFirstDefined(a, ['muat_id']));
        const bId = Number(this.pickFirstDefined(b, ['muat_id']));
        return aId - bId;
      });
    }
    const user = this.userInfoSrv.getuserInfo();
    const userId = Number(user?.user_id);
    const roleId = String(user?.role_id ?? '').trim();
    const companyId = this.pickFirstDefined(user, ['company_id', 'azienda_id', 'companyid']);

    const scored = candidates.map((row) => {
      const score = this.computeAuthorizationScore(row, userId, roleId, companyId, 'table');
      return { row, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.length ? [scored[0].row] : [];
  }

  /**
   * Determina se mostrare tutte le autorizzazioni (solo admin) invece del subset contestuale.
   */
  private shouldShowAllAuthorizationsForMetadataEditor(): boolean {
    try {
      return !!this.userInfoSrv?.isCurrentUserAdmin?.();
    } catch {
      return false;
    }
  }

  /**
   * Legge dal metadata tabella la collezione annidata di autorizzazioni tabella,
   * gestendo varianti storiche del nome relazione.
   * @param tableMetadata Metadati tabella correnti.
   * @returns Lista autorizzazioni tabella.
   */
  private getNestedTableAuthorizations(tableMetadata: any): any[] {
    if (!tableMetadata || typeof tableMetadata !== 'object') {
      return [];
    }

    const candidates = [
      '_Metadati_Utenti_Autorizzazioni_Tabelles',
      '_Metadati_Utenti_Autorizzazioni_Tabelle',
      '_Metadati_Autorizzazioni_Tabelles',
      '_Metadati_Autorizzazioni_Tabelle'
    ];
    const keys = Object.keys(tableMetadata || {});
    for (const candidate of candidates) {
      const direct = tableMetadata[candidate];
      if (Array.isArray(direct) && direct.length) {
        return direct;
      }

      const normalizedCandidate = this.normalizeKey(candidate);
      const matchedKey = keys.find((k) => this.normalizeKey(k) === normalizedCandidate);
      if (matchedKey && Array.isArray(tableMetadata[matchedKey]) && tableMetadata[matchedKey].length) {
        return tableMetadata[matchedKey];
      }
    }

    return [];
  }

  /**
   * Legge dal metadata tabella la collezione annidata degli stili tabella,
   * gestendo varianti storiche del nome relazione.
   * @param tableMetadata Metadati tabella correnti.
   * @returns Lista stili tabella.
   */
  private getNestedTableStyles(tableMetadata: any): any[] {
    if (!tableMetadata || typeof tableMetadata !== 'object') {
      return [];
    }

    const candidates = [
      '_Metadati_UI_Stili_Tabelles',
      '_Metadati_UI_Stili_Tabelle',
      '_Metadati_Stili_Tabelles',
      '_Metadati_Stili_Tabelle'
    ];
    const keys = Object.keys(tableMetadata || {});
    for (const candidate of candidates) {
      const direct = tableMetadata[candidate];
      if (Array.isArray(direct) && direct.length) {
        return direct;
      }

      const normalizedCandidate = this.normalizeKey(candidate);
      const matchedKey = keys.find((k) => this.normalizeKey(k) === normalizedCandidate);
      if (matchedKey && Array.isArray(tableMetadata[matchedKey]) && tableMetadata[matchedKey].length) {
        return tableMetadata[matchedKey];
      }
    }

    return [];
  }

  /**
   * Estrae e appiattisce gli stili annidati delle colonne, aggiungendo il campo
   * tecnico `__column_name` per la visualizzazione nel menu.
   * @param columns Elenco metadati colonna.
   * @returns Lista stili colonna flatten.
   */
  private getNestedColumnStyles(columns: any[]): any[] {
    const list = Array.isArray(columns) ? columns : [];
    const result: any[] = [];
    list.forEach((col: any) => {
      const styles = this.getNestedRelationArray(col, [
        '_Metadati_UI_Stili_Colonnes',
        '_Metadati_UI_Stili_Colonne',
        '_Metadati_Stili_Colonnes',
        '_Metadati_Stili_Colonne'
      ]);
      styles.forEach((s) => result.push({ ...s, __column_name: col?.mc_nome_colonna }));
    });
    return result;
  }

  /**
   * Estrae e appiattisce le autorizzazioni annidate delle colonne, aggiungendo
   * `__column_name` come supporto alla label.
   * @param columns Elenco metadati colonna.
   * @returns Lista autorizzazioni colonna flatten.
   */
  private getNestedColumnAuthorizations(columns: any[]): any[] {
    const list = Array.isArray(columns) ? columns : [];
    const result: any[] = [];
    list.forEach((col: any) => {
      const auths = this.getNestedRelationArray(col, [
        '_Metadati_Utenti_Autorizzazioni_Colonnes',
        '_Metadati_Utenti_Autorizzazioni_Colonne',
        '_Metadati_Autorizzazioni_Colonnes',
        '_Metadati_Autorizzazioni_Colonne'
      ]);
      auths.forEach((a) => result.push({ ...a, __column_name: col?.mc_nome_colonna }));
    });
    return result;
  }

  /**
   * Estrae i condition items annidati sul metadata tabella.
   */
  private getNestedConditionItems(tableMetadata: any): any[] {
    if (!tableMetadata || typeof tableMetadata !== 'object') {
      return [];
    }

    const groups = this.getNestedRelationArray(tableMetadata, [
      '_Metadati_Condition_Groups',
      '_Metadati_Condition_Group',
      '_metadati_condition_group'
    ]);
    return Array.isArray(groups) ? groups : [];
  }

  /**
   * Restituisce i gruppi condizione distinti a partire dai condition items.
   */
  private getDistinctConditionGroups(conditionItems: any[]): any[] {
    const list = Array.isArray(conditionItems) ? conditionItems : [];
    const byGroupId = new Map<string, any>();

    list.forEach((row) => {
      const groupId = this.pickFirstDefined(row, ['CG_Id']);
      if (groupId === undefined || groupId === null || groupId === '') {
        return;
      }
      const key = String(groupId);
      if (!byGroupId.has(key)) {
        byGroupId.set(key, {
          CG_Id: groupId,
          CG_Name: this.pickFirstDefined(row, ['CG_Name']),
          md_id: this.pickFirstDefined(row, ['md_id'])
        });
      }
    });

    return Array.from(byGroupId.values());
  }

  /**
   * Restituisce l'insieme degli id gruppo condizione validi nel contesto corrente.
   */
  private getConditionGroupIdSet(conditionRows: any[]): Set<string> {
    return new Set<string>(
      (Array.isArray(conditionRows) ? conditionRows : [])
        .map((row: any) => String(this.pickFirstDefined(row, ['CG_Id']) ?? '').trim())
        .filter((id) => !!id)
    );
  }

  /**
   * Restituisce l'insieme degli id gruppo azione condizione (CAG_Id) validi nel contesto corrente.
   */
  private getConditionActionGroupIdSet(actionGroups: any[]): Set<string> {
    return new Set<string>(
      (Array.isArray(actionGroups) ? actionGroups : [])
        .map((row: any) => String(this.pickFirstDefined(row, ['CAG_Id']) ?? '').trim())
        .filter((id) => !!id)
    );
  }

  /**
   * Filtra righe action/action-group mantenendo solo quelle collegate ai `CG_Id` correnti.
   * Se non ci sono gruppi condizione nel contesto corrente, restituisce sempre lista vuota.
   */
  private filterRowsByConditionGroupIds(rows: any[], cgIds: Set<string>, fkKeys: string[]): any[] {
    const list = Array.isArray(rows) ? rows : [];
    if (!cgIds?.size) {
      return [];
    }

    const keys = Array.isArray(fkKeys) && fkKeys.length ? fkKeys : ['FK_CG_Id', 'CG_Id'];
    return list.filter((row: any) => {
      const linkedId = String(this.pickFirstDefined(row, keys) ?? '').trim();
      return !!linkedId && cgIds.has(linkedId);
    });
  }

  /**
   * Filtra righe action-item mantenendo solo quelle collegate ai `CAG_Id` correnti.
   */
  private filterRowsByConditionActionGroupIds(rows: any[], cagIds: Set<string>, fkKeys: string[]): any[] {
    const list = Array.isArray(rows) ? rows : [];
    if (!cagIds?.size) {
      return [];
    }

    const keys = Array.isArray(fkKeys) && fkKeys.length ? fkKeys : ['FK_CAG_Id', 'CAG_Id'];
    return list.filter((row: any) => {
      const linkedId = String(this.pickFirstDefined(row, keys) ?? '').trim();
      return !!linkedId && cagIds.has(linkedId);
    });
  }

  /**
   * Filtra i condition item reali: evita righe "phantom" generate da LEFT JOIN (es. CI_Id = 0).
   */
  private extractConcreteConditionItems(conditionRows: any[]): any[] {
    const list = Array.isArray(conditionRows) ? conditionRows : [];
    return list.filter((row: any) => {
      const ciId = Number(this.pickFirstDefined(row, ['CI_Id']));
      if (Number.isFinite(ciId) && ciId > 0) {
        return true;
      }

      const left = String(this.pickFirstDefined(row, ['CI_Comparison_Left_Field']) || '').trim();
      const op = String(this.pickFirstDefined(row, ['CI_Comparison_Operator']) || '').trim();
      const right = String(this.pickFirstDefined(row, ['CI_Comparison_Right_Field']) || '').trim();
      const formula = String(this.pickFirstDefined(row, ['CI_Formula']) || '').trim();
      return !!left || !!op || !!right || !!formula;
    });
  }

  /**
   * Estrae e appiattisce i condition action item annidati nei condition group/item.
   */
  private getNestedConditionActions(conditionItems: any[]): any[] {
    const list = Array.isArray(conditionItems) ? conditionItems : [];
    const result: any[] = [];
    const seen = new Set<string>();

    list.forEach((item: any) => {
      const actions = this.getNestedRelationArray(item, [
        'ConditionActions',
        '_Metadati_Condition_Action_Items',
        '_Metadati_Condition_Action_Item',
        '_metadati_condition_action_item'
      ]);

      actions.forEach((action: any) => {
        const normalizedAction = {
          ...action,
          __group_name: this.pickFirstDefined(item, ['CG_Name']),
          CG_Id: this.pickFirstDefined(item, ['CG_Id']),
          FK_CG_Id: this.pickFirstDefined(action, ['FK_CG_Id']) ?? this.pickFirstDefined(item, ['CG_Id']),
          CAG_Name: this.pickFirstDefined(action, ['CAG_Name']) || this.pickFirstDefined(item, ['CG_Name'])
        };

        const caiId = String(this.pickFirstDefined(normalizedAction, ['CAI_Id']) ?? '').trim();
        const dedupeKey = caiId
          ? `cai:${caiId}`
          : [
            String(this.pickFirstDefined(normalizedAction, ['FK_CAG_Id', 'CAG_Id']) ?? '').trim(),
            String(this.pickFirstDefined(normalizedAction, ['CAI_Target_Field']) ?? '').trim(),
            String(this.pickFirstDefined(normalizedAction, ['CAI_Target_Action']) ?? '').trim(),
            String(this.pickFirstDefined(normalizedAction, ['CAI_Formula']) ?? '').trim()
          ].join('|');

        if (seen.has(dedupeKey)) {
          return;
        }
        seen.add(dedupeKey);
        result.push(normalizedAction);
      });
    });

    return result;
  }

  /**
   * Restituisce i condition action groups distinti a partire dagli action item.
   */
  private getDistinctConditionActionGroups(conditionRows: any[], conditionActions: any[]): any[] {
    const groups = Array.isArray(conditionRows) ? conditionRows : [];
    const actions = Array.isArray(conditionActions) ? conditionActions : [];
    const byActionGroupId = new Map<string, any>();

    const pushGroup = (row: any, parent?: any) => {
      const actionGroupId = this.pickFirstDefined(row, ['CAG_Id']);
      if (actionGroupId === undefined || actionGroupId === null || actionGroupId === '') {
        return;
      }

      const key = String(actionGroupId);
      if (!byActionGroupId.has(key)) {
        byActionGroupId.set(key, {
          CAG_Id: actionGroupId,
          CAG_Name: this.pickFirstDefined(row, ['CAG_Name']),
          FK_CG_Id: this.pickFirstDefined(row, ['FK_CG_Id']) ?? this.pickFirstDefined(parent, ['CG_Id']),
          CG_Name: this.pickFirstDefined(row, ['CG_Name']) ?? this.pickFirstDefined(parent, ['CG_Name'])
        });
      }
    };

    groups.forEach((groupRow: any) => {
      const nestedActionGroups = this.getNestedRelationArray(groupRow, [
        'ConditionActionGroups',
        '_Metadati_Condition_Action_Groups',
        '_Metadati_Condition_Action_Group',
        '_metadati_condition_action_group'
      ]);
      nestedActionGroups.forEach((ag: any) => pushGroup(ag, groupRow));
    });

    actions.forEach((actionRow: any) => pushGroup(actionRow));

    return Array.from(byActionGroupId.values());
  }

  /**
   * Filtra i condition action item reali, escludendo i soli action-group (CAG) senza CAI.
   */
  private extractConcreteConditionActionItems(actionRows: any[]): any[] {
    const list = Array.isArray(actionRows) ? actionRows : [];
    return list.filter((row: any) => {
      const caiId = String(this.pickFirstDefined(row, ['CAI_Id']) ?? '').trim();
      if (caiId) {
        return true;
      }

      const targetField = String(this.pickFirstDefined(row, ['CAI_Target_Field']) || '').trim();
      const targetAction = String(this.pickFirstDefined(row, ['CAI_Target_Action']) || '').trim();
      const formula = String(this.pickFirstDefined(row, ['CAI_Formula']) || '').trim();
      return !!targetField || !!targetAction || !!formula;
    });
  }

  /**
   * Recupera una relazione annidata dal record sorgente provando piu nomi candidati,
   * anche tramite confronto normalizzato della chiave.
   * @param source Oggetto che contiene le relazioni annidate.
   * @param candidates Nomi relazione possibili in ordine di priorita.
   * @returns Prima collezione valida trovata, altrimenti array vuoto.
   */
  private getNestedRelationArray(source: any, candidates: string[]): any[] {
    if (!source || typeof source !== 'object' || !Array.isArray(candidates) || !candidates.length) {
      return [];
    }
    const keys = Object.keys(source || {});
    for (const candidate of candidates) {
      const direct = source[candidate];
      if (Array.isArray(direct) && direct.length) {
        return direct;
      }
      const normalizedCandidate = this.normalizeKey(candidate);
      const matchedKey = keys.find((k) => this.normalizeKey(k) === normalizedCandidate);
      if (matchedKey && Array.isArray(source[matchedKey]) && source[matchedKey].length) {
        return source[matchedKey];
      }
    }
    return [];
  }

  /**
   * Calcola un punteggio di ordinamento priorita per presentare prima le regole autorizzative piu rilevanti.
   */
  private computeAuthorizationScore(
    row: any,
    currentUserId: number,
    currentRoleId: string,
    currentCompanyId: any,
    kind: 'table' | 'column'
  ): number {
    const rowUserId = Number(this.pickFirstDefined(row, ['utente_id', 'user_id']));
    const rowRoleId = String(this.pickFirstDefined(row, ['id_ruolo', 'ruolo_id']) ?? '').trim();
    const rowCompanyId = this.pickFirstDefined(row, ['azienda_id', 'AZIENDA_ID', 'company_id', 'COMPANY_ID']);
    const rowHasUser = Number.isFinite(rowUserId) && rowUserId > 0;
    const rowHasRole = !!rowRoleId;
    const rowHasCompany = rowCompanyId !== undefined && rowCompanyId !== null && rowCompanyId !== '';
    const normalizedCurrentCompanyId = currentCompanyId !== undefined && currentCompanyId !== null ? String(currentCompanyId) : '';
    const normalizedRowCompanyId = rowHasCompany ? String(rowCompanyId) : '';

    const roleMatch = !!currentRoleId && rowRoleId === currentRoleId;
    const userMatch = Number.isFinite(currentUserId) && currentUserId > 0 && rowHasUser && rowUserId === currentUserId;
    const companyMatch = !!normalizedCurrentCompanyId && normalizedRowCompanyId === normalizedCurrentCompanyId;
    const globalRule = !rowHasUser && !rowHasRole && !rowHasCompany;

    let score = 0;
    // Deterministic specificity order: Role > User > Company > Global.
    if (roleMatch) {
      score += 400;
    } else if (userMatch) {
      score += 300;
    } else if (companyMatch) {
      score += 200;
    } else if (globalRule) {
      score += 100;
    }

    // Penalize unrelated scoped rows so they do not beat global defaults.
    if (!roleMatch && rowHasRole) {
      score -= 40;
    }
    if (!userMatch && rowHasUser) {
      score -= 30;
    }
    if (!companyMatch && rowHasCompany) {
      score -= 20;
    }

    // Prefer labels with resolved role/user descriptions when available.
    if (rowHasRole) {
      score += this.getRoleDescription(row, rowRoleId) ? 6 : 0;
    }
    if (rowHasUser) {
      score += this.getUserDescription(row, rowUserId) ? 3 : 0;
    }

    const authIdField = kind === 'table' ? ['muat_id'] : ['muac_id'];
    const authId = Number(this.pickFirstDefined(row, authIdField));
    if (Number.isFinite(authId)) {
      score += Math.min(authId, 9999) / 1000000;
    }

    return score;
  }

  /**
   * Assicura che il datasource abbia una route valida prima di operazioni CRUD/navigation.
   */
  private ensureDatasourceRoute(ds: DataSourceComponent, routeOverride?: string): boolean {
    if (!ds) {
      return false;
    }

    const targetRoute = (routeOverride || ds.hardcodedRoute || '').toString();
    if (routeOverride) {
      ds.hardcodedRoute = routeOverride;
    }
    const routeChanged = !!targetRoute && ds.route?.value !== targetRoute;
    if (routeChanged) {
      (ds as any)._suppressNextRouteFetch = true;
      ds.route.next(targetRoute);
    }
    return routeChanged;
  }

  /**
   * Garantisce che lo schema datasource sia caricato prima di aprire editor o operazioni su colonne.
   */
  private async ensureDatasourceSchema(ds: DataSourceComponent, routeOverride?: string): Promise<void> {
    const routeChanged = this.ensureDatasourceRoute(ds, routeOverride);
    const missingSchema = !ds?.metaInfo?.tableMetadata;
    const missingCurrentRecord = !ds?.resultInfo?.current;
    if (!(routeChanged || missingSchema || missingCurrentRecord)) {
      return;
    }

    try {
      await ds.getSchemaAndData(true);
    } catch (error: any) {
      if (this.isMetadataNotFoundRouteError(error)) {
        const targetRoute = String(routeOverride || ds?.hardcodedRoute || ds?.route?.value || '').trim();
        console.warn('[metadata-editor] metadata route not found, skipping datasource schema load', {
          route: targetRoute,
          error: String(error?.message || error || '')
        });
        return;
      }
      throw error;
    }
  }

  private isMetadataNotFoundRouteError(error: any): boolean {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('metadata not found for route');
  }

  /**
   * Ricarica metadati e ricostruisce il menu editor dopo operazioni che cambiano schema/configurazione.
   */
  private async reloadMetadataEditorState(): Promise<void> {
    await this.invalidateMetadataCaches();
    this.roleDescriptionById.clear();
    await this.datasource.value.getSchemaAndData();
    if (this.metaInfo) {
      this.rebuildMenuItems();
      if (this.viewReady) {
        await this.refreshExtendedMetadataMenuItems();
      }
    }
  }

  /**
   * Costruisce una chiave stabile editor a partire dalla route normalizzata corrente.
   */
  private getEditorKeyFromRoute(route?: string): string | undefined {
    const normalizedRoute = this.normalizeKey(String(route || ''));
    if (!normalizedRoute) {
      return undefined;
    }
    const strategies = this.getEditorStrategies();
    const match = strategies.find((s) => this.normalizeKey(String(s.route || '')) === normalizedRoute);
    return match?.key;
  }

  /**
   * Apre `EditFormComponent` sul datasource/record richiesto e gestisce il refresh al close con esito positivo.
   */
  private openEditDialog(ds: DataSourceComponent, header: string, editorKey?: string): void {
    const isConditionItemEditor = this.normalizeKey(String(editorKey || '')) === this.normalizeKey('CI_Id');
    if (isConditionItemEditor) {
      WtoolboxService.metadataEditorContextRouteName = String(this.metaInfo?.tableMetadata?.md_route_name || '').trim();
    }

    const boundSaveCallback = this.saveCallback
      ? ((data: any, original: any) => this.saveCallback.bind(this)(data, original, editorKey || ''))
      : null;
    const data = {
      datasource: new BehaviorSubject<DataSourceComponent>(ds),
      saveCallback: boundSaveCallback,
      inMemoryMode: this.isDesignerMemoryOnlyMode(),
      isEditForm: true,
    };

    this.ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data,
      header,
      styleClass: 'edit-form-content',
      position: 'center',
      closable: true
    });

    if (this.ref) {
      this.ref.onClose.subscribe(async (result) => {
        if (result !== undefined) {
          if (this.saveCallback) {
            this.rebuildMenuItems();
            if (this.viewReady) {
              await this.refreshExtendedMetadataMenuItems();
            }
          } else {
            await this.reloadMetadataEditorState();
          }
        }
      });
    }
  }

  /**
   * Pubblica lo stato datasource aggiornato verso i subscriber interni/esterni del metadata editor.
   */
  private publishDatasourceState(ds: DataSourceComponent): void {
    if (!ds?.fetchInfo$) {
      return;
    }

    ds.fetchInfo$.next({
      resultInfo: ds.resultInfo,
      metaInfo: ds.metaInfo,
      filterDescriptor: ds.filterDescriptor,
      groupInfo: ds.groupInfo,
      sortInfo: ds.sortInfo,
      aggregationInfo: ds.aggregationInfo
    } as any);
  }

  /**
* Risolge il valore finale in `resolveLocalEditorContext` combinando contesto runtime e regole locali.
* @param info Parametro utilizzato dal metodo nel flusso elaborativo.
* @param opts Flag che abilita/disabilita rami della logica.
* @returns Promise che conclude l'operazione asincrona di `resolveLocalEditorContext` restituendo un valore di tipo `Promise<{ ds: DataSourceComponent; record: any } | null>`.
*/
  private async resolveLocalEditorContext(
    info: any,
    opts?: { preferredKeys?: string[]; strictPreferred?: boolean }
  ): Promise<{ ds: DataSourceComponent; record: any } | null> {
    if (!info) {
      return null;
    }

    const allStrategies = this.getEditorStrategies();
    const preferred = (opts?.preferredKeys || []).map((k) => this.normalizeKey(k));
    const preferredStrategies = preferred.length
      ? allStrategies.filter((s) => preferred.indexOf(this.normalizeKey(s.key)) >= 0)
      : [];
    const fallbackStrategies = preferred.length
      ? allStrategies.filter((s) => preferred.indexOf(this.normalizeKey(s.key)) < 0)
      : allStrategies;
    const strategies = opts?.strictPreferred && preferred.length
      ? preferredStrategies
      : [...preferredStrategies, ...fallbackStrategies];

    for (const strategy of strategies) {
      const strategyValue = this.pickFirstDefined(info, [strategy.key]);
      if (strategyValue === undefined || strategyValue === null || strategyValue === '' || !strategy.ds) {
        continue;
      }

      if (!strategy.ds?.metaInfo?.tableMetadata) {
        await this.ensureDatasourceSchema(strategy.ds, strategy.route);
      }

      const localModel = this.deepUnwrapModelValue(info) || {};
      const keyColumn =
        strategy.ds?.metaInfo?.columnMetadata?.find((c: any) => this.normalizeKey(c?.mc_nome_colonna) === this.normalizeKey(String(strategy.key)))?.mc_nome_colonna
        || String(strategy.key);
      if (localModel[keyColumn] === undefined) {
        localModel[keyColumn] = strategyValue;
      }

      strategy.ds.setCurrent(localModel);
      return { ds: strategy.ds, record: localModel };
    }

    return null;
  }

  /**
   * True quando l'editor lavora nel contesto designer (memory-only su JSON serializzato).
   */
  private isDesignerMemoryOnlyMode(): boolean {
    return typeof this.saveCallback === 'function';
  }

  /**
   * Aggiorna il menu senza forzare reload/invalidazione database nel contesto designer.
   */
  private async refreshDesignerMenuAfterMutation(): Promise<void> {
    this.rebuildMenuItems();
    if (this.viewReady) {
      await this.refreshExtendedMetadataMenuItems();
    }
  }

  /**
   * Apre la dialog di inserimento per la sezione correlata richiesta preimpostando i campi contesto.
   */
  private async openInsertRelatedMetadata(ds: DataSourceComponent, seed: any, routeOverride?: string): Promise<void> {
    if (!ds) {
      return;
    }

    const preparedSeed = { ...(seed || {}) };
    await this.ensureDatasourceSchema(ds, routeOverride);
    this.applyCurrentRouteColumnLookupFilter(ds, routeOverride, preparedSeed);
    ds.addNewRecord(preparedSeed);
    const editorKey = this.getEditorKeyFromRoute(routeOverride || ds?.hardcodedRoute);
    this.openEditDialog(ds, this.trslSrv.instant('insert'), editorKey);
  }

  /**
* Applica aggiornamenti di stato tramite `applyCurrentRouteColumnLookupFilter` mantenendo coerenti UI e dati.
* @param ds Parametro utilizzato dal metodo nel flusso elaborativo.
*/
  private applyCurrentRouteColumnLookupFilter(ds: DataSourceComponent, routeOverride?: string, seed?: any): void {
    const currentMdId = Number(this.metaInfo?.tableMetadata?.md_id);
    if (!Number.isFinite(currentMdId) || currentMdId <= 0 || !ds?.metaInfo?.columnMetadata?.length) {
      return;
    }

    const normalize = (value: any) => String(value || '').toLowerCase().replace(/[\s_]/g, '');
    const targetLookupRoute = normalize(MetadataProviderService.metaColumnRoute || ' metadati  colonne');

    const filterPayload = {
      logic: 'AND',
      filters: [{ field: 'md_id', value: String(currentMdId), operatore: 'eq' }]
    };

    (ds.metaInfo.columnMetadata || []).forEach((field: any) => {
      if (!field || field.mc_ui_column_type !== 'lookupByID') {
        return;
      }

      const lookupRoute = normalize(field.mc_ui_lookup_entity_name || field.mc_lookup_route || '');
      const isMetadataColumnLookup =
        lookupRoute === targetLookupRoute ||
        lookupRoute.indexOf('metadaticolonne') >= 0;
      if (!isMetadataColumnLookup) {
        return;
      }

      const currentExtras = field.extras || {};
      const lookup = currentExtras.lookup || {};
      field.extras = {
        ...currentExtras,
        lookup: {
          ...lookup,
          filter: filterPayload
        }
      };
    });

    const normalizeRoute = (value: any) => String(value || '').toLowerCase().replace(/[\s_]/g, '');
    const currentRoute = normalizeRoute(routeOverride || ds?.hardcodedRoute);
    const conditionItemRoute = normalizeRoute(this.metaConditionItemRoute);
    const conditionActionGroupRoute = normalizeRoute(this.metaConditionActionGroupRoute);
    const conditionActionRoute = normalizeRoute(this.metaConditionActionRoute);
    const isConditionEditorRoute =
      currentRoute === conditionItemRoute ||
      currentRoute === conditionActionGroupRoute ||
      currentRoute === conditionActionRoute;

    if (!this.isDesignerMemoryOnlyMode() || !isConditionEditorRoute) {
      return;
    }

    const hasFkCgField = (ds.metaInfo.columnMetadata || [])
      .some((field: any) => this.normalizeKey(field?.mc_nome_colonna) === this.normalizeKey('FK_CG_Id'));
    const hasFkCagField = (ds.metaInfo.columnMetadata || [])
      .some((field: any) => this.normalizeKey(field?.mc_nome_colonna) === this.normalizeKey('FK_CAG_Id'));

    const conditionGroups = this.getDistinctConditionGroups(this.getNestedConditionItems(this.metaInfo?.tableMetadata))
      .filter((group: any) => {
        const id = this.pickFirstDefined(group, ['CG_Id']);
        return id !== undefined && id !== null && String(id) !== '';
      });

    const conditionRows = this.getNestedConditionItems(this.metaInfo?.tableMetadata);
    const allConditionActions = this.getNestedConditionActions(conditionRows);
    const conditionActionGroups = this.getDistinctConditionActionGroups(conditionRows, allConditionActions);

    const normalizedGroupEntries = (conditionGroups || []).map((group: any) => {
      const id = this.pickFirstDefined(group, ['CG_Id']);
      const label = String(this.pickFirstDefined(group, ['CG_Name']) || this.formatConditionGroupLabel(group) || id);
      return {
        value: id,
        text: label.replaceAll('||', '|').replaceAll('@@', '@')
      };
    });
    const normalizedActionGroupEntries = (conditionActionGroups || [])
      .filter((group: any) => {
        const id = this.pickFirstDefined(group, ['CAG_Id', 'FK_CAG_Id']);
        return id !== undefined && id !== null && String(id) !== '';
      })
      .map((group: any) => {
        const id = this.pickFirstDefined(group, ['CAG_Id', 'FK_CAG_Id']);
        const label = String(
          this.pickFirstDefined(group, ['CAG_Name']) ||
          this.formatConditionActionGroupLabel(group) ||
          id
        );
        return {
          value: id,
          fkCgId: this.pickFirstDefined(group, ['FK_CG_Id', 'CG_Id']),
          text: label.replaceAll('||', '|').replaceAll('@@', '@')
        };
      });

    const targetSeed = seed || {};
    if (hasFkCgField && (targetSeed.FK_CG_Id === undefined || targetSeed.FK_CG_Id === null || targetSeed.FK_CG_Id === '') &&
      targetSeed.CG_Id !== undefined && targetSeed.CG_Id !== null && String(targetSeed.CG_Id) !== '') {
      targetSeed.FK_CG_Id = targetSeed.CG_Id;
    }
    const fallbackFkCgId = normalizedGroupEntries[0]?.value;
    if (hasFkCgField && (targetSeed.FK_CG_Id === undefined || targetSeed.FK_CG_Id === null || targetSeed.FK_CG_Id === '') && fallbackFkCgId !== undefined && fallbackFkCgId !== null && String(fallbackFkCgId) !== '') {
      targetSeed.FK_CG_Id = fallbackFkCgId;
    }
    if (hasFkCagField && (targetSeed.FK_CAG_Id === undefined || targetSeed.FK_CAG_Id === null || targetSeed.FK_CAG_Id === '') &&
      targetSeed.CAG_Id !== undefined && targetSeed.CAG_Id !== null && String(targetSeed.CAG_Id) !== '') {
      targetSeed.FK_CAG_Id = targetSeed.CAG_Id;
    }
    if (hasFkCagField && (targetSeed.FK_CAG_Id === undefined || targetSeed.FK_CAG_Id === null || targetSeed.FK_CAG_Id === '') && normalizedActionGroupEntries.length) {
      const matchByCg = normalizedActionGroupEntries.find((entry: any) =>
        targetSeed.FK_CG_Id !== undefined && targetSeed.FK_CG_Id !== null && String(entry.fkCgId ?? '') === String(targetSeed.FK_CG_Id)
      );
      const fallbackActionGroup = matchByCg || normalizedActionGroupEntries[0];
      if (fallbackActionGroup?.value !== undefined && fallbackActionGroup?.value !== null && String(fallbackActionGroup.value) !== '') {
        targetSeed.FK_CAG_Id = fallbackActionGroup.value;
      }
    }

    const dictionaryValue = normalizedGroupEntries
      .map((entry: any) => `${entry.value}@@${entry.text}`)
      .join('||');
    const actionGroupDictionaryValue = normalizedActionGroupEntries
      .map((entry: any) => `${entry.value}@@${entry.text}`)
      .join('||');

    (ds.metaInfo.columnMetadata || []).forEach((field: any) => {
      if (!field) {
        return;
      }
      const normalizedField = this.normalizeKey(field.mc_nome_colonna);
      if (normalizedField !== this.normalizeKey('FK_CG_Id') && normalizedField !== this.normalizeKey('FK_CAG_Id')) {
        return;
      }

      field.mc_ui_column_type = 'dictionary';
      field.mc_dictionary_value =
        normalizedField === this.normalizeKey('FK_CAG_Id')
          ? actionGroupDictionaryValue
          : dictionaryValue;
      field.extras = field.extras || {};
      field.extras.lookup = field.extras.lookup || {};
    });
  }

  /**
   * Apre il wizard di inserimento colonna, invoca endpoint backend di creazione
   * e apre l'editor della colonna appena creata.
   * In fallback ricerca la colonna per nome+md_id quando l'id non arriva in risposta.
   */
  private async openInsertColumnEditor() {
    if (!this.metaInfo || !this.datasourceColonne) {
      return;
    }
    await this.ensureDatasourceSchema(this.datasourceColonne);

    const uiTypes = [
      { label: this.t('metadata.column_type.text', 'Text'), value: 'text' },
      { label: this.t('metadata.column_type.text_area', 'Text Area'), value: 'txt_area' },
      { label: this.t('metadata.column_type.number_int', 'Number (Int)'), value: 'number_int' },
      { label: this.t('metadata.column_type.number_decimal', 'Number (Decimal)'), value: 'number_decimal' },
      { label: this.t('metadata.column_type.date', 'Date'), value: 'date' },
      { label: this.t('metadata.column_type.datetime', 'DateTime'), value: 'datetime' },
      { label: this.t('metadata.column_type.boolean', 'Boolean'), value: 'boolean' }
    ];

    const promptResult = await WtoolboxService.promptDialog(
      this.trslSrv.instant('insert') + ' ' + this.trslSrv.instant('column'),
      [
        {
          name: 'mc_ui_column_type',
          caption: this.trslSrv.instant('type'),
          type: 'dictionary_radio',
          required: true,
          dictionaryData: uiTypes
        },
        {
          name: 'mc_nome_colonna',
          caption: this.trslSrv.instant('column'),
          type: 'text',
          required: true
        },
        {
          name: 'alias',
          caption: this.trslSrv.instant('description'),
          type: 'text',
          required: true
        },
        {
          name: 'nullable',
          caption: this.trslSrv.instant('nullable'),
          type: 'boolean',
          value: true
        },
        {
          name: 'maxLength',
          caption: this.trslSrv.instant('max_length'),
          type: 'number',
          value: 0,
          tooltip: this.trslSrv.instant('only_for_text_types')
        }
      ],
      '600px',
      '520px'
    );

    if (!promptResult) {
      return;
    }

    const uiType = promptResult.mc_ui_column_type?.value;
    const columnName = (promptResult.mc_nome_colonna?.value || '').toString().trim();
    const alias = (promptResult.alias?.value || columnName).toString().trim();
    const nullable = promptResult.nullable?.value !== false;
    const textTypes = ['text', 'dictionary', 'dictionary_radio', 'google_map'];
    const rawMaxLength = Number.parseInt((promptResult.maxLength?.value ?? '0').toString(), 10);
    const maxLength = textTypes.indexOf(uiType) >= 0 && !Number.isNaN(rawMaxLength) ? rawMaxLength : 0;

    if (!uiType || !columnName) {
      return;
    }

    const endpoint = this.getAddColumnEndpoint();
    const payload = {
      route: this.metaInfo.tableMetadata.md_route_name,
      mc_ui_column_type: uiType,
      mc_nome_colonna: columnName,
      alias: alias,
      nullable: nullable,
      scale: 0,
      precision: 0,
      maxLength: maxLength,
      defaultValue: ''
    };

    const created = await WtoolboxService.http.post<any>(endpoint, payload).toPromise();
    const createdId = this.parseCreatedColumnId(created);

    this.clearLocalStoragePreservingTranslation();
    await this.datasource.value.getSchemaAndData();

    if (createdId > 0) {
      await this.openEditor({ info: { mc_id: createdId } });
      return;
    }

    this.datasourceColonne.filterInfo = {
      logic: 'AND',
      filters: [
        { field: 'md_id', value: this.metaInfo.tableMetadata.md_id.toString(), operatore: 'eq' },
        { field: 'mc_nome_colonna', value: columnName, operatore: 'eq', fixed: true }
      ]
    };
    const lastPayload = await this.datasourceColonne.fetchData();
    const found = lastPayload?.resultInfo?.dato?.[0];
    if (found?.mc_id) {
      await this.openEditor({ info: { mc_id: found.mc_id } });
    }
  }

  /**
   * Prepara un nuovo record metadata colonna di tipo `button` vincolato alla tabella corrente
   * e apre la dialog di edit sul datasource colonne.
   * @returns `Promise<void>`.
   */
  private async openInsertColumnActionMetadata(): Promise<void> {
    if (!this.metaInfo || !this.datasourceColonne) {
      return;
    }

    const currentMdId = Number(this.metaInfo?.tableMetadata?.md_id);
    if (!Number.isFinite(currentMdId) || currentMdId <= 0) {
      return;
    }

    await this.ensureDatasourceSchema(
      this.datasourceColonne,
      MetadataProviderService.metaColumnRoute || ' metadati  colonne'
    );

    // Keep insert scoped to the current table metadata.
    this.datasourceColonne.filterInfo = {
      logic: 'AND',
      filters: [{ field: 'md_id', value: String(currentMdId), operatore: 'eq', fixed: true }]
    };

    this.datasourceColonne.addNewRecord({
      md_id: currentMdId,
      mc_ui_column_type: 'button'
    });

    this.openEditDialog(this.datasourceColonne, this.trslSrv.instant('insert'));
  }

  /**
* Interpreta e normalizza input/configurazione in `parseCreatedColumnId` per l'utilizzo nel componente.
* @param response Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Valore numerico prodotto da `parseCreatedColumnId` (indice, conteggio o misura operativa).
*/
  private parseCreatedColumnId(response: any): number {
    if (typeof response === 'number') {
      return response;
    }

    if (response && typeof response === 'object') {
      const candidates = [response.d, response.res, response.id, response.mc_id];
      for (const c of candidates) {
        const parsed = Number.parseInt((c ?? '').toString(), 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }

    const parsed = Number.parseInt((response ?? '').toString(), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Restituisce l'endpoint da usare per l'aggiunta colonna scegliendo
   * automaticamente tra asmx proxy e path legacy.
   * @returns URL endpoint AddColumn.
   */
  private getAddColumnEndpoint(): string {
    return this.getAsmxEndpoint('scaffolding.AddColumn', 'metaModel/scaffolding.asmx/AddColumn');
  }

  /**
   * Sincronizza metadata colonne con lo schema fisico tabella via endpoint backend e aggiorna il menu al termine.
   */
  private async syncMetadataFromSchema() {
    if (!this.metaInfo?.tableMetadata?.md_nome_tabella) {
      return;
    }

    const before = new Set((this.metaInfo.columnMetadata || []).map(x => x.mc_nome_colonna));

    const connName = this.metaInfo.tableMetadata.md_conn_name || 'DataSQLConnection';
    const db = this.metaInfo.tableMetadata.md_db_name || '';
    const table = this.metaInfo.tableMetadata.md_nome_tabella;

    const connectionInfo = await this.getConnectionInfo(connName);
    const provider = (connectionInfo?.ProviderName || '').toString().toLowerCase();
    const isMySql = provider.indexOf('mysql') >= 0;

    const endpoint = this.getAsmxEndpoint('scaffolding.scaffoldTable', '');

    const payload: any = {
      connection: connectionInfo?.ConnectionString || '',
      connName: connName,
      db: db,
      table: table,
      createMenu: false
    };

    if (!isMySql) {
      payload.parentMenuId = 0;
    }

    await WtoolboxService.http.post<any>(endpoint, payload).toPromise();

    this.clearLocalStoragePreservingTranslation();
    await this.datasource.value.getSchemaAndData();

    const afterColumns = (this.datasource.value.metaInfo?.columnMetadata || []).map(x => x.mc_nome_colonna);
    const added = afterColumns.filter(x => !before.has(x));

    WtoolboxService.messageNotificationService.add({
      severity: added.length ? 'success' : 'info',
      summary: this.trslSrv.instant('metadata.menu.sync_from_schema'),
      detail: added.length
        ? this.trslSrv.format(this.trslSrv.instant('metadata.sync.added_columns_{0}'), added.join(', '))
        : this.trslSrv.instant('metadata.sync.no_new_columns')
    });
  }

  /**
   * Recupera la definizione connessione dal backend (`MetaService.getConnections`)
   * cercando prima `connName`, poi fallback su `DataSQLConnection`.
   * @param connName Nome connessione richiesto dal metadata tabella.
   * @returns Oggetto connessione o `null` se non trovato.
   */
  private async getConnectionInfo(connName: string): Promise<any> {
    const endpoint = MetadataProviderService.getConnectionsUri;
    const raw = await WtoolboxService.http.post<any>(endpoint, {}).toPromise();
    const parsed = this.parseMaybeSerialized(raw);
    const connections = Array.isArray(parsed) ? parsed : [];
    return connections.find(x => x.Name === connName)
      || connections.find(x => x.Name === 'DataSQLConnection')
      || null;
  }

  /**
* Interpreta e normalizza input/configurazione in `parseMaybeSerialized` per l'utilizzo nel componente.
* @param raw Valore in ingresso elaborato o normalizzato dal metodo.
* @returns Struttura dati prodotta da `parseMaybeSerialized` dopo normalizzazione/elaborazione.
*/
  private parseMaybeSerialized(raw: any): any {
    if (raw == null) {
      return raw;
    }

    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }

    return raw;
  }

  /**
   * Compone un endpoint ASMX usando il root configurato:
   * se il root punta a `asmxproxy` usa `proxyMethod`, altrimenti path legacy.
   * @param proxyMethod Metodo proxy (es. `scaffolding.AddColumn`).
   * @param legacyPath Path ASMX legacy.
   * @returns URL finale da invocare.
   */
  private getAsmxEndpoint(proxyMethod: string, legacyPath: string): string {
    const root = (WtoolboxService.appSettings?.global_root_url || '').toString();
    if (root.toLowerCase().indexOf('asmxproxy') >= 0) {
      return root + proxyMethod;
    }

    return root + legacyPath;
  }

  /**
   * Rimuove una colonna dal metadata e, opzionalmente, anche dallo schema fisico tabella con conferma utente.
   */
  private async removeColumn(removeFromSchema: boolean) {
    if (!this.metaInfo || !this.metaInfo.columnMetadata?.length) {
      return;
    }

    const selected = await WtoolboxService.promptDialog(
      this.trslSrv.instant('remove') + ' ' + this.trslSrv.instant('column'),
      [
        {
          name: 'mc_id',
          caption: this.trslSrv.instant('column'),
          type: 'dictionary',
          required: true,
          dictionaryData: this.metaInfo.columnMetadata
            .filter(x => !x.mc_is_primary_key)
            .map(x => ({ label: `${x.mc_display_string_in_view} (${x.mc_nome_colonna})`, value: x.mc_id }))
            .sort((a, b) => a.label.localeCompare(b.label))
        }
      ],
      '650px',
      '420px'
    );

    if (!selected?.mc_id?.value) {
      return;
    }

    const selectedId = Number.parseInt(selected.mc_id.value.toString(), 10);
    const metaCol = this.metaInfo.columnMetadata.find(x => x.mc_id == selectedId);
    if (!metaCol) {
      return;
    }

    const confirmed = await WtoolboxService.confirm({
      message: removeFromSchema
        ? this.trslSrv.format(this.trslSrv.instant('metadata.confirm.remove_column_schema_{0}'), metaCol.mc_nome_colonna)
        : this.trslSrv.format(this.trslSrv.instant('metadata.confirm.remove_column_metadata_{0}'), metaCol.mc_nome_colonna),
      header: this.trslSrv.instant('confirmation')
    });

    if (!confirmed) {
      return;
    }

    if (removeFromSchema) {
      await WtoolboxService.http.post(
        MetadataProviderService.removeColumnUri,
        {
          table: this.metaInfo.tableMetadata.md_route_name,
          mc_nome_colonna: metaCol.mc_nome_colonna,
          mc_id: metaCol.mc_id
        }
      ).toPromise();
    } else {
      await this.ensureDatasourceSchema(this.datasourceColonne);
      this.datasourceColonne.filterInfo = {
        logic: 'AND',
        filters: [{ field: 'mc_id', value: metaCol.mc_id.toString(), operatore: 'eq', fixed: true }]
      };
      const payload = await this.datasourceColonne.fetchData();
      const current = payload?.resultInfo?.current;
      if (current) {
        await this.datasourceColonne.syncData(this.deepUnwrapModelValue(current), this.deepUnwrapModelValue(current), true);
      }
    }

    await this.invalidateMetadataCaches();
    await this.datasource.value.getSchemaAndData();
  }

  /**
   * Invalida cache locali metadata/report per forzare una ricostruzione coerente allo stato server.
   */
  private async invalidateMetadataCaches() {
    const route = this.metaInfo?.tableMetadata?.md_route_name;
    if (route) {
      try {
        await WtoolboxService.http.post(MetadataProviderService.flushCacheUri, { route }).toPromise();
      } catch {
      }
    }

    try {
      const metaDb = await MetadataProviderService.getMetaDB();
      await Promise.all(metaDb.tables.map(t => t.clear()));
    } catch {
    }

    this.clearLocalStoragePreservingTranslation();
    // Re-ensure translation state in-memory after metadata cache invalidation.
    await this.trslSrv.ensureTranslationsLoaded();
  }

  /**
   * Dispatcher principale delle azioni menu metadata.
   * Gestisce comandi speciali (insert/sync/remove/report), risolve il datasource target
   * per i record correlati e apre `EditFormComponent` con record corrente.
   * @param item Voce menu cliccata o wrapper PrimeNG con `info`/`id`.
   */
  async openEditor(item: any) {

    let record;
    let ds;
    let header;

    if (item && item.id == 'insert-column') {
      await this.openInsertColumnEditor();
      return;
    }
    if (item && item.id == 'sync-metadata-from-schema') {
      await this.syncMetadataFromSchema();
      return;
    }
    if (item && item.id == 'remove-column-metadata') {
      await this.removeColumn(false);
      return;
    }
    if (item && item.id == 'remove-column-schema') {
      await this.removeColumn(true);
      return;
    }
    if (item && item.id == 'create-report') {
      this.openReportDesigner();
      return;
    }
    if (item && item.id == 'edit-report' && item.reportName) {
      this.openReportDesigner(String(item.reportName));
      return;
    }
    if (item && item.id == 'insert-meta-custom-actions') {
      await this.openInsertRelatedMetadata(this.getRelatedMetadataDatasource(this.metaCustomActionsRoute), { md_id: this.metaInfo?.tableMetadata?.md_id }, this.metaCustomActionsRoute);
      return;
    }
    if (item && item.id == 'insert-meta-column-actions') {
      await this.openInsertColumnActionMetadata();
      return;
    }
    if (item && item.id == 'insert-meta-auth-table') {
      await this.openInsertRelatedMetadata(this.getRelatedMetadataDatasource(this.metaAuthTableRoute), { md_id: this.metaInfo?.tableMetadata?.md_id }, this.metaAuthTableRoute);
      return;
    }
    if (item && item.id == 'insert-meta-styles-table') {
      await this.openInsertRelatedMetadata(this.getRelatedMetadataDatasource(this.metaTableStyleRoute), { md_id: this.metaInfo?.tableMetadata?.md_id }, this.metaTableStyleRoute);
      return;
    }
    if (item && item.id == 'insert-meta-auth-column') {
      await this.openInsertRelatedMetadata(this.getRelatedMetadataDatasource(this.metaAuthColumnRoute), {}, this.metaAuthColumnRoute);
      return;
    }
    if (item && item.id == 'insert-meta-styles-column') {
      await this.openInsertRelatedMetadata(this.getRelatedMetadataDatasource(this.metaColumnStyleRoute), {}, this.metaColumnStyleRoute);
      return;
    }
    if (item && item.id == 'insert-meta-condition-group') {
      await this.openInsertRelatedMetadata(
        this.getRelatedMetadataDatasource(this.metaConditionGroupRoute),
        { md_id: this.metaInfo?.tableMetadata?.md_id },
        this.metaConditionGroupRoute
      );
      return;
    }
    if (item && item.id == 'insert-meta-condition-item') {
      const seedFkCgId = this.pickFirstDefined(this.getNestedConditionItems(this.metaInfo?.tableMetadata), ['FK_CG_Id', 'CG_Id']);
      await this.openInsertRelatedMetadata(
        this.getRelatedMetadataDatasource(this.metaConditionItemRoute),
        { FK_CG_Id: seedFkCgId, __user_id: this.userInfoSrv.getuserInfo()?.user_id, __context_route_name: this.metaInfo?.tableMetadata?.md_route_name },
        this.metaConditionItemRoute
      );
      return;
    }
    if (item && item.id == 'insert-meta-condition-action-group') {
      const seedFkCgId = this.pickFirstDefined(this.getNestedConditionItems(this.metaInfo?.tableMetadata), ['FK_CG_Id', 'CG_Id']);
      await this.openInsertRelatedMetadata(
        this.getRelatedMetadataDatasource(this.metaConditionActionGroupRoute),
        { FK_CG_Id: seedFkCgId, __user_id: this.userInfoSrv.getuserInfo()?.user_id },
        this.metaConditionActionGroupRoute
      );
      return;
    }
    if (item && item.id == 'insert-meta-condition-action') {
      const conditionRows = this.getNestedConditionItems(this.metaInfo?.tableMetadata);
      const actionGroups = this.getDistinctConditionActionGroups(conditionRows, this.getNestedConditionActions(conditionRows));
      const firstActionGroup = actionGroups[0] || null;
      const seedFkCagId = this.pickFirstDefined(firstActionGroup, ['CAG_Id', 'FK_CAG_Id']);
      await this.openInsertRelatedMetadata(
        this.getRelatedMetadataDatasource(this.metaConditionActionRoute),
        { FK_CAG_Id: seedFkCagId, __user_id: this.userInfoSrv.getuserInfo()?.user_id },
        this.metaConditionActionRoute
      );
      return;
    }

    if (item.info) {
      const contextEditorKey = item?.editorKey ? String(item.editorKey) : '';
      const contextEditorRoute = item?.editorRoute ? String(item.editorRoute) : '';
      const contextInfo = contextEditorKey
        ? this.hydrateContextRecordFromSection(item.info, contextEditorKey)
        : item.info;

      if (contextEditorKey) {
        const preferredKeys: string[] = [contextEditorKey];
        let context = null;
        if (this.saveCallback) {
          context = await this.resolveLocalEditorContext(contextInfo, { preferredKeys, strictPreferred: true });
        }
        if (!context) {
          context = await this.resolveEditorContext(contextInfo, { preferredKeys, strictPreferred: true });
        }
        if (!context) {
          const strategy = this.getEditorStrategyByKey(contextEditorKey, contextEditorRoute);
          if (strategy?.ds) {
            if (!this.isDesignerMemoryOnlyMode() || !strategy.ds?.metaInfo?.tableMetadata) {
              await this.ensureDatasourceSchema(strategy.ds, strategy.route);
            }
            const localModel = this.deepUnwrapModelValue(contextInfo) || {};
            strategy.ds.setCurrent(localModel);
            context = { ds: strategy.ds, record: localModel };
          }
        }
        ds = context?.ds;
        record = context?.record;
      } else {
        const columnId = this.pickFirstDefined(contextInfo, ['mc_id']);
        const hasColumnId = columnId !== undefined && columnId !== null && columnId !== '';
        if (hasColumnId) {
          const targetMcId = String(columnId);
          await this.ensureDatasourceSchema(
            this.datasourceColonne,
            MetadataProviderService.metaColumnRoute || ' metadati  colonne'
          );

          if (this.saveCallback) {
            // Designer mode: memory-only context, avoid DB query on metadata columns.
            const localFromMeta = (this.metaInfo?.columnMetadata || []).find((x: any) =>
              String(this.pickFirstDefined(x, ['mc_id']) ?? '') === targetMcId
            );
            const localModel = this.deepUnwrapModelValue(localFromMeta || contextInfo) || {};
            if (localModel.mc_id === undefined) {
              localModel.mc_id = columnId;
            }
            ds = this.datasourceColonne;
            record = localModel;
          } else {
            this.datasourceColonne.filterInfo = {
              logic: 'AND',
              filters: [{ field: 'mc_id', value: targetMcId, operatore: 'eq', fixed: true }]
            };
            const payload = await this.datasourceColonne.fetchData();
            const found = (payload?.resultInfo?.dato || []).find((x: any) =>
              String(this.pickFirstDefined(x, ['mc_id']) ?? '') === targetMcId
            );

            if (found) {
              ds = this.datasourceColonne;
              record = found;
            } else {
              // Fallback: keep opening the editor using the menu payload even if
              // the filtered fetch did not return the row (timing/cache inconsistencies).
              ds = this.datasourceColonne;
              const localModel = this.deepUnwrapModelValue(contextInfo) || {};
              if (localModel.mc_id === undefined) {
                localModel.mc_id = columnId;
              }
              record = localModel;
            }
          }
        } else {
          const preferredKeys: string[] = [];
          if (this.pickFirstDefined(contextInfo, ['md_id']) !== undefined) {
            preferredKeys.push('md_id');
          }

          const strictPreferred = preferredKeys.length > 0;
          let context = null;
          if (this.saveCallback) {
            context = await this.resolveLocalEditorContext(contextInfo, { preferredKeys, strictPreferred });
          }
          if (!context) {
            context = await this.resolveEditorContext(contextInfo, { preferredKeys, strictPreferred });
          }
          if (!context && strictPreferred) {
            if (this.saveCallback) {
              context = await this.resolveLocalEditorContext(contextInfo, { preferredKeys, strictPreferred: false });
            }
            if (!context) {
              context = await this.resolveEditorContext(contextInfo, { preferredKeys, strictPreferred: false });
            }
          }
          ds = context?.ds;
          record = context?.record;
        }
      }

      header = this.trslSrv.instant('edit');

      if (this.metaInfo && ds && record) {
        if (contextEditorKey) {
          const normalizedRecord = this.deepUnwrapModelValue(record) || {};
          if (this.normalizeKey(contextEditorKey) === this.normalizeKey('CI_Id') && !normalizedRecord.__context_route_name) {
            normalizedRecord.__context_route_name = this.metaInfo?.tableMetadata?.md_route_name || '';
          }
          this.applyCurrentRouteColumnLookupFilter(ds, contextEditorRoute || ds?.hardcodedRoute, normalizedRecord);
          ds.setCurrent(normalizedRecord);
          this.publishDatasourceState(ds);
        } else {
          const currentModel = ds.getModelFromObservable(record);
          ds.setCurrent(currentModel);
          this.publishDatasourceState(ds);
        }
        this.openEditDialog(ds, header, contextEditorKey || undefined);
      }
    }
  }
}




