import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, Input, OnDestroy, OnInit, ViewChild, forwardRef } from '@angular/core';
import { MetaInfo } from '../../class/metaInfo';
import { DataSourceComponent } from '../data-source/data-source.component';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { ResultInfo } from '../../class/resultInfo';
import { AsyncPipe } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DataRepeaterComponent } from '../data-repeater/data-repeater.component';
import { BehaviorSubject, Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { MetadataEditorComponent } from '../metadata-editor/metadata-editor.component';
import { UserInfoService } from '../../service/user-info.service';
import { FilterBarComponent } from '../filter-bar/filter-bar.component';
import type { Table } from 'primeng/table';
import { PagerComponent } from '../pager/pager.component';
@Component({
  selector: 'wuic-bounded-repeater',
  imports: [DataSourceComponent, forwardRef(() => DataRepeaterComponent), ButtonModule, AsyncPipe, MetadataEditorComponent, FilterBarComponent, PagerComponent],
  templateUrl: './bounded-repeater.component.html',
  styleUrl: './bounded-repeater.component.css',
  // OnPush: il wrapper WUIC delle route dinamiche /<route>/<action> e'
  // mountato su ogni pagina admin (list-grid, kanban, spreadsheet, ecc.).
  // Con Default strategy ogni evento DOM dell'app triggera CD globale, che
  // re-evaluta i 4 method-call del template + i getter + le valutazioni
  // AsyncPipe sui BehaviorSubject action/routeName - somma visibile come
  // freeze ~1s su click di FAB/menu/altri controlli.
  //
  // Con OnPush il subtree viene re-checked solo quando:
  //   - cambiano gli @Input (hardcodedRoute, routeName, action, ecc.)
  //   - si chiama cdr.markForCheck() (dopo action.next, onRepeaterTemplateReady)
  //   - un evento originato dal subtree stesso scatta (click su figli)
  //
  // I method-call del template (isCurrentUserAdmin/shouldRenderFilterBar/
  // shouldShowEditPagerAndFilter/effectiveLongDescriptionHtml) sono stati
  // sostituiti con property precomputate aggiornate in recomputeTemplateFlags().
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BoundedRepeaterComponent implements OnInit, OnDestroy {

  /**
   * Input dal componente padre per hardcoded route; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedRoute: string;
  /**
   * Input dal componente padre per route name; usata nella configurazione e nel rendering del componente.
   */
  @Input() routeName: BehaviorSubject<string>;
  /**
   * Input dal componente padre per action; usata nella configurazione e nel rendering del componente.
   */
  @Input() action: BehaviorSubject<string>;

  /**
   * Input dal componente padre per parent record; usata nella configurazione e nel rendering del componente.
   */
  @Input() parentRecord: any;
  /**
   * Input dal componente padre per parent meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() parentMetaInfo: MetaInfo;

  /**
   * Input dal componente padre per row custom select; usata nella configurazione e nel rendering del componente.
   */
  @Input() rowCustomSelect: (rowData: any, $event: any, dt: Table) => void;

  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per datasource.
   */
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent; //To access directly the directive

  /**
   * Flag di stato che governa il comportamento UI/logico relativo a loading.
   */
  loading: BehaviorSubject<boolean>;
  /**
   * Proprieta di stato del componente per bounded info, usata dalla logica interna e dal template.
   */
  boundedInfo: { resultInfo: ResultInfo; metaInfo: MetaInfo; };
  /**
   * Proprieta di stato del componente per pending list refresh, usata dalla logica interna e dal template.
   */
  private pendingListRefresh = false;
  /**
   * Proprieta di stato del componente per router events subscription, usata dalla logica interna e dal template.
   */
  private routerEventsSubscription?: Subscription;
  /**
   * Proprieta di stato del componente per page size, usata dalla logica interna e dal template.
   */
  pageSize: number;
  private longDescriptionRawCache = '';
  private longDescriptionSafeCache: SafeHtml | '' = '';

  // ---- Property memoizzate consumate dal template (OnPush-safe) ----
  // Sostituiscono le vecchie chiamate a metodo nel template. Aggiornate
  // esplicitamente via recomputeTemplateFlags() in punti deterministici:
  //   - ngOnInit
  //   - subscribe al BehaviorSubject action (cambia action → ricompute)
  //   - onRepeaterTemplateReady (datasource ha caricato metaInfo)
  //   - router NavigationEnd (action da paramMap puo' cambiare)
  /** Snapshot HTML sanitizzato del md_long_description; '' se vuoto. */
  longDescHtml: SafeHtml | '' = '';
  /** True se mostrare <wuic-metadata-editor> (datasource pronto + utente admin). */
  showMetadataEditor = false;
  /** True se la filter-bar avanzata deve essere mostrata sopra il repeater. */
  showFilterBar = false;
  /** True quando action=edit e nessun filtro forzato da route: pager+filter visibili. */
  showEditPagerAndFilter = false;

  /**
 * Descrizione lunga ripulita: evita di renderizzare blocchi vuoti
 * (es. `<p><br></p>`, `&nbsp;`, solo spazi). Ora chiamato SOLO da
 * recomputeTemplateFlags(), non dal template (evita call su ogni CD).
 */
  private computeEffectiveLongDescriptionHtml(): SafeHtml | '' {
    const raw = String(this.datasource?.metaInfo?.tableMetadata?.md_long_description || '');
    if (!raw.trim()) {
      this.longDescriptionRawCache = '';
      this.longDescriptionSafeCache = '';
      return '';
    }

    if (raw === this.longDescriptionRawCache && this.longDescriptionSafeCache) {
      return this.longDescriptionSafeCache;
    }

    const cleaned = this.stripScriptTags(raw);
    this.longDescriptionRawCache = raw;
    this.longDescriptionSafeCache = this.sanitizer.bypassSecurityTrustHtml(cleaned);
    return this.longDescriptionSafeCache;
  }

  private stripScriptTags(html: string): string {
    return String(html || '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }

  /**
   * Ricalcola TUTTI i flag del template + descrizione lunga, in un unico
   * punto idempotente. Chiamare dopo mutations che influenzano la visibilita:
   *   - action change (subscribe BehaviorSubject)
   *   - metaInfo load (onRepeaterTemplateReady)
   *   - NavigationEnd (action aggiornata da route param)
   *
   * La funzione chiama markForCheck() alla fine per segnalare ad Angular
   * (OnPush) che il subtree va ricontrollato nel prossimo tick.
   */
  private recomputeTemplateFlags(): void {
    this.longDescHtml = this.computeEffectiveLongDescriptionHtml();
    this.showMetadataEditor = !!this.datasource && this.userService.isCurrentUserAdmin();
    this.showFilterBar = this.shouldRenderFilterBarInternal();
    this.showEditPagerAndFilter = this.shouldShowEditPagerAndFilterInternal();
    this.cdr.markForCheck();
  }


  /**
* function Object() { [native code] }
* @param route Informazione di navigazione usata per risolvere la route di destinazione.
* @param router Informazione di navigazione usata per risolvere la route di destinazione.
* @param userService Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
*/
  constructor(private route: ActivatedRoute,
    private router: Router, public userService: UserInfoService, private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef) {

    this.routeName = new BehaviorSubject<string>(null!);
    this.action = new BehaviorSubject<string>(null!);

    this.loading = WtoolboxService.isBusy;
  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  ngOnInit(): void {
    if (!this.routeName.value) {
      this.routeName.next(this.hardcodedRoute ? this.hardcodedRoute : this.route.snapshot.paramMap.get('route') || '');
    }

    let action = '';
    if (!this.action.value) {
      action = this.route.snapshot.paramMap.get('action') || '';
      if (action) {
        this.action.next(action);
      }
    }

    if (action === 'edit' || action === 'detail') {
      this.pageSize = 1;
    }

    this.routerEventsSubscription?.unsubscribe();
    this.routerEventsSubscription = this.router.events.subscribe((val) => {
      if (val instanceof NavigationEnd) {
        const action = this.route.snapshot.paramMap.get('action');

        const previousAction = this.action.value;

        if (previousAction === 'map' && action === 'list' && this.datasource) {
          this.datasource.filterInfo = undefined;
          this.pendingListRefresh = true;
        }

        this.action.next(action!);
        // Action cambiata via route: ricalcola flag template (OnPush).
        this.recomputeTemplateFlags();
      }
    });

    // Subscribe al BehaviorSubject action per ricomputare flag anche quando
    // il parent push un'action diversa (hardcodedRoute/action via @Input).
    this.actionSubscription = this.action.subscribe(() => {
      this.recomputeTemplateFlags();
    });

    // Initial computation (prima che ngAfterViewInit popoli datasource -
    // showMetadataEditor restera' false finche' onRepeaterTemplateReady
    // chiamera' recomputeTemplateFlags() di nuovo con datasource valorizzato).
    this.recomputeTemplateFlags();
  }

  /**
   * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
   */
  ngOnDestroy(): void {
    this.routerEventsSubscription?.unsubscribe();
    this.actionSubscription?.unsubscribe();
    this.fetchInfoSubscription?.unsubscribe();
  }

  private actionSubscription?: Subscription;

  @HostListener('window:beforeunload', ['$event'])
  onWindowBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.datasource?.hasPendingChanges?.()) {
      return;
    }

    event.preventDefault();
    event.returnValue = '';
  }

  /**
* Gestisce la logica operativa di `onRepeaterTemplateReady` in modo coerente con l'implementazione corrente.
* @param action Parametro utilizzato dal metodo nel flusso elaborativo.
*/
  onRepeaterTemplateReady(action: string) {
    if (action === 'list' && this.pendingListRefresh && this.datasource?.metaInfo?.columnMetadata?.length) {
      this.pendingListRefresh = false;
      this.datasource.getSchemaAndData(false);
    }
    // A questo punto datasource+metaInfo sono popolati: ricalcola flag
    // template (showMetadataEditor, showFilterBar, longDescHtml).
    this.recomputeTemplateFlags();

    // Subscribe (una volta sola) a fetchInfo$ del datasource: recompute flag
    // ogni volta che metaInfo si aggiorna. Serve perche' templateReady fires
    // non garantisce che metaInfo sia gia' popolato — la race era che
    // showFilterBar restava false "per sempre" nonostante
    // extraProps.archetypes.list.advancedFilter=true, perche' al templateReady
    // `this.datasource.metaInfo.tableMetadata.extraProps.archetypes` era
    // ancora undefined. Subscribe reattivo → showFilterBar si aggiorna appena
    // metaInfo arriva dal backend.
    this.ensureFetchInfoSubscription();
  }

  /**
   * Subscribe idempotente a `datasource.fetchInfo$` per ri-computare i flag
   * template ad ogni payload. No-op se gia' subscritto.
   */
  private ensureFetchInfoSubscription(): void {
    if (this.fetchInfoSubscription || !this.datasource?.fetchInfo$) return;
    this.fetchInfoSubscription = this.datasource.fetchInfo$.subscribe((info) => {
      if (info) this.recomputeTemplateFlags();
    });
  }

  private fetchInfoSubscription?: Subscription;

  /**
* Gestisce la logica operativa di `confirmNavigationWithPendingChanges` orchestrando le chiamate `confirmProceedWithPendingChanges`.
* @returns Promise che completa il flusso asincrono restituendo un risultato di tipo `Promise<boolean>`.
*/
  async confirmNavigationWithPendingChanges(): Promise<boolean> {
    if (!this.datasource) {
      return true;
    }

    return await this.datasource.confirmProceedWithPendingChanges('navigate');
  }

  /**
 * Verifica una condizione di stato o di validita coordinando chiamate verso servizi applicativi.
 * @returns Esito booleano dell'elaborazione svolta dal metodo.
 */
  hasRouteFilterParam(): boolean {
    return !!String(this.route.snapshot.paramMap.get('filters') || '').trim();
  }

  /**
 * Recupera e prepara i dati richiesti dal chiamante coordinando chiamate verso servizi applicativi.
 * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
 */
  private getCurrentAction(): string {
    return String(this.action?.value || this.route.snapshot.paramMap.get('action') || '').trim().toLowerCase();
  }

  /**
   * Gestisce la logica operativa di `shouldShowEditPagerAndFilter` orchestrando
   * le chiamate `getCurrentAction` e `hasRouteFilterParam`.
   *
   * NON usare dal template: usa invece la property `showEditPagerAndFilter`
   * (memoizzata, OnPush-safe). Il metodo resta esposto per retrocompatibilita'
   * di chiamanti esterni / test.
   */
  shouldShowEditPagerAndFilter(): boolean {
    return this.shouldShowEditPagerAndFilterInternal();
  }

  /** Implementazione pura: non leggere da template, solo da recompute. */
  private shouldShowEditPagerAndFilterInternal(): boolean {
    return this.getCurrentAction() === 'edit' && !this.hasRouteFilterParam();
  }

  /**
   * Determina se mostrare la filter-bar sopra il data-repeater.
   * La visibilita e metadata-driven: compare solo se
   * `md_props_bag.archetypes.<action>.advancedFilter` e true.
   *
   * NON usare dal template: usa invece la property `showFilterBar`
   * (memoizzata, OnPush-safe). Il metodo resta esposto per retrocompatibilita'.
   */
  shouldRenderFilterBar(): boolean {
    return this.shouldRenderFilterBarInternal();
  }

  /** Implementazione pura: non leggere da template, solo da recompute. */
  private shouldRenderFilterBarInternal(): boolean {
    const archetypeKey = this.getCurrentArchetypeKey();
    return this.isAdvancedFilterEnabledForArchetype(archetypeKey);
  }

  /**
 * Normalizza l'action corrente verso la chiave archetype nel props bag.
 */
  private getCurrentArchetypeKey(): string {
    const action = this.getCurrentAction();
    if (!action) {
      return 'list';
    }

    if (action === 'kanban-list') {
      return 'kanban';
    }

    return action;
  }

  /**
 * Legge il flag `archetypes.<key>.advancedFilter` con parser tollerante.
 */
  private isAdvancedFilterEnabledForArchetype(archetypeKey: string): boolean {
    const cfg: any = this.datasource?.metaInfo?.tableMetadata?.extraProps?.archetypes?.[archetypeKey];
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
      return false;
    }

    const raw = cfg.advancedFilter;
    return this.toBooleanLoose(raw, false);
  }

  /**
 * Parser boolean-like per metadata (`true/false`, `1/0`, stringhe equivalenti).
 */
  private toBooleanLoose(value: any, defaultValue: boolean): boolean {
    if (value === undefined || value === null || String(value).trim() === '') {
      return defaultValue;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'n') {
      return false;
    }

    return defaultValue;
  }
}
