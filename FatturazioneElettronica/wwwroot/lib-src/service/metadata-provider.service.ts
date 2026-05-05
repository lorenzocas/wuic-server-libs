import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { MetadatiColonna } from '../class/metadati_colonna';
import { MetaInfo } from '../class/metaInfo';
import { UserInfoService } from './user-info.service';
import type { MenuItem } from 'primeng/api';
import { WidgetDefinition } from '../class/widgetDefinition';
import { MetadatiTabella } from '../class/metadati_tabella';
import { WtoolboxService } from './wtoolbox.service';
import { MetadatiCustomActionTabella } from '../class/metadati_custom_actions_tabelle';
import { MetadatiUiStiliTabella } from '../class/metadati_ui_stili_tabella';
import { MetadatiUiStiliColonna } from '../class/metadati_ui_stili_colonna';
import { MetadatiUtentiAutorizzazioniColonna } from '../class/metadati_utenti_autorizzazioni_colonna';
import { MetadatiConditionGroup, MetadatiConditionGroupAction } from '../class/metadati_condition_group';
import { BehaviorSubject } from 'rxjs';
import { IFieldEditor } from '../class/IFieldEditor';
import type { DataSourceComponent } from '../component/data-source/data-source.component';
import { CarouselOptions } from '../class/carouselOptions';
import { SchedulerOptions } from '../class/schedulerOptions';
import { TreeOptions } from '../class/treeOptions';
import { MapOptions } from '../class/mapOptions';
import { ChartOptions } from '../class/chartOptions';
import { KanbanOptions } from '../class/kanbanOptions';
import { ValidationRule } from '../class/validationRule';

// import { Meta } from '@angular/platform-browser';
// import { DataSourceComponent } from '../component/data-source/data-source.component';

@Injectable({
  providedIn: 'root'
})
export class MetadataProviderService {

  contentType = "application/json; charset=utf-8";
  dataType = "json";
  type = "POST";
  // Getter lazy invece di instance field initializer: `WtoolboxService.appSettings`
  // puo' non essere popolato quando Angular DI istanzia questo service
  // (ordine di init dei chunk dipende dalla topologia esbuild). Con
  // `optimization.scripts: true` l'ordine cambia e accedere al field initializer
  // crashava con "Cannot read properties of undefined (reading 'global_root_url')"
  // a `<instance_members_initializer>`. Il getter viene valutato alla prima
  // invocazione (a runtime, appSettings gia' popolato).
  get getMetadataUri() { return WtoolboxService.appSettings?.global_root_url + "MetaService.getTableMetadata"; }
  get getMetadataVersionUri() { return WtoolboxService.appSettings?.global_root_url + "MetaService.getProjectMetadataVersion"; }

  static readUri;
  static storedUri;
  static readUriCmb;
  static readDistinctUriCmb;
  static updateUri;
  static createUri;
  static deleteUri;
  static restoreUri;
  static cloneUri;
  static getDistinctValuesUri;
  static batchEditUri;
  static exportUri;
  static exportFromStoredUri
  static exportPdfUri;
  static flushCacheUri;
  static removeColumnUri;
  static checkInstallUri;
  static installUri;
  static getRealPathUri;

  static getMenuByUserIDUri;
  static getMenuAdminMethodsUri;
  static removeMenuUri;
  static addMenuUri;
  static addMenuFullUri;
  static reorderMenuUri;
  static nestMenuUri;

  static getConnectionsUri;
  static getAppSettingsUri;
  static updateConnectionsUri;
  static deleteConnectionsUri;
  static insertConnectionsUri;
  static updateAppSettingsUri;

  static getLoggedUsersUri;
  static GetUserListTestUri;

  static readCustomSettingsUri;
  static saveCustomSettingsUri;

  static saveDashboardUri
  static loadDashboardUri
  static deleteDashboardUri;
  static saveWorkflowGraphUri;
  static loadWorkflowGraphUri;
  static getWorkflowGraphsUri;
  static renameWorkflowGraphUri;
  static deleteWorkflowGraphUri;
  static getCssClassesFromSheetsUri;
  static writeChangesToCssFileUri;

  static scaffoldODataUri;

  static metaTableRoute;
  static metaColumnRoute;
  static metaMenuRoute;
  static metatableActionRoute;
  static metatableStyleRoute;
  static metatableColumnStyleRoute;
  static metatableAuthRoute;
  static metatableColumnAuthRoute;
  private static metadataVersionInFlight?: Promise<number>;
  private static lastMetadataVersionCheckAtMs = 0;
  private static readonly minMetadataVersionIntervalMs = 5000;
  private static readonly minReportListIntervalMs = 5000;
  private static reportListInFlightByRoute = new Map<string, Promise<{ path: string; name: string }[]>>();
  private static reportListCacheByRoute = new Map<string, { path: string; name: string }[]>();

  /** ETag cache for getTableMetadata — keyed by "route__userId" */
  private static metadataETagByKey = new Map<string, string>();
  /** Cached raw payload for ETag 304 reuse — keyed by "route__userId" */
  private static metadataCacheByKey = new Map<string, any>();
  private static reportListLastCheckAtByRoute = new Map<string, number>();
  private static customSettingsInFlightByRequest = new Map<string, Promise<any>>();
  /**
   * In-flight dedupe per `getMenuByUserID`. Quando `meta-menu.component.ts`
   * registra piu' sottoscrizioni (ngOnInit + authSession.state$ subscribe +
   * WtoolboxService.menuUpdated subscribe) che invocano `loadMenuIfAllowed`
   * nello stesso tick, finivamo per sparare 2-4 POST concorrenti allo stesso
   * endpoint (payload MB-scale, critical path LCP): la prima era fresca,
   * le altre duplicavano lavoro server + rete. Questa Map permette a
   * chiamate sovrapposte di condividere la stessa Promise, collassando N
   * chiamate concorrenti in 1 singola.
   *
   * Key = `${userId}__${forceRefresh}` — chiamate con forceRefresh=false e
   * forceRefresh=true restano separate (una legge localStorage, l'altra
   * bypassa): collapsarle sarebbe semanticamente sbagliato.
   */
  private static menuInFlightByKey = new Map<string, Promise<MenuItem[]>>();
  private static menuAdminMethodsInFlightByKey = new Map<string, Promise<string[]>>();
  static readonly defaultGridRowTemplate = ``;
  static readonly defaultMobileCardTemplate = ``;

  /**
   * Ordina le custom actions tabella per campo `ordine` (ascendente) alla radice del table metadata.
   * Le action senza `ordine` restano in coda preservando l'ordine relativo originale.
   */
  private static sortTableCustomActionsByOrdine(tableMetadata: any): void {
    if (!tableMetadata) {
      return;
    }

    const actions = Array.isArray(tableMetadata._Metadati_Custom_Actions_Tabelles)
      ? tableMetadata._Metadati_Custom_Actions_Tabelles
      : [];

    actions.sort((a: any, b: any) => {
      const aOrd = Number(a?.ordine ?? a?.Ordine);
      const bOrd = Number(b?.ordine ?? b?.Ordine);
      const aHasOrd = Number.isFinite(aOrd);
      const bHasOrd = Number.isFinite(bOrd);

      if (aHasOrd && bHasOrd) {
        return aOrd - bOrd;
      }
      if (aHasOrd) {
        return -1;
      }
      if (bHasOrd) {
        return 1;
      }
      return 0;
    });

    tableMetadata._Metadati_Custom_Actions_Tabelles = actions;
  }

  static widgetDefinition: WidgetDefinition = {
    defaultHeight: "70px",
    defaultWidth: "100%",
    defaultFilterWidth: "200px",
    fieldLabelInline: false,
    formColumns: 1,
    lookupServerPageCount: 10,
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
    archetypes:
    {
      // Keep archetype markup/designer metadata lightweight to avoid static import cycles.
      'carousel': { markup: '<wuic-carousel-list-lazy [datasource]="datasource" [hardcodedDatasource]="hardcodedDatasource"></wuic-carousel-list-lazy>', component: null, designerOptions: CarouselOptions },
      'chart': { markup: '<wuic-chart-list-lazy [datasource]="datasource" [hardcodedDatasource]="hardcodedDatasource"></wuic-chart-list-lazy>', component: null, designerOptions: ChartOptions },
      'detail': { markup: '<wuic-parametric-dialog-lazy [datasource]="datasource" [hardcodedDatasource]="hardcodedDatasource" [readOnly]="true" [isEditForm]="true"></wuic-parametric-dialog-lazy>', component: null },
      'dialog': { markup: '<wuic-parametric-dialog-lazy [datasource]="datasource" [hardcodedDatasource]="hardcodedDatasource"></wuic-parametric-dialog-lazy>', component: null },
      'edit': { markup: '<wuic-parametric-dialog-lazy [datasource]="datasource" [hardcodedDatasource]="hardcodedDatasource" [isEditForm]="true"></wuic-parametric-dialog-lazy>', component: null },
      'list': { markup: '<wuic-list-grid-lazy [datasource]="datasource" [hardcodedDatasource]="hardcodedDatasource" [rowCustomSelect]="rowCustomSelect"></wuic-list-grid-lazy>', component: null },
      'kanban': { markup: '<wuic-kanban-list-lazy [datasource]="datasource" [hardcodedDatasource]="hardcodedDatasource"></wuic-kanban-list-lazy>', component: null, designerOptions: KanbanOptions },

      // 'lookup': { markup: '<wuic-lookup-editor [record]="record" [field]="field" [metaInfo]="metaInfo"></wuic-lookup-editor>', component: LookupEditorComponent },
      'map': { markup: '<wuic-map-list-lazy [datasource]="datasource" [hardcodedDatasource]="hardcodedDatasource"></wuic-map-list-lazy>', component: null, designerOptions: MapOptions },

      'scheduler': { markup: '<wuic-scheduler-list-lazy [datasource]="datasource" [hardcodedDatasource]="hardcodedDatasource"></wuic-scheduler-list-lazy>', component: null, designerOptions: SchedulerOptions },
      'spreadsheet': { markup: '<wuic-spreadsheet-list-sf-lazy [datasource]="datasource" [hardcodedDatasource]="hardcodedDatasource"></wuic-spreadsheet-list-sf-lazy>', component: null },
      'tree': { markup: '<wuic-tree-list-lazy [datasource]="datasource" [hardcodedDatasource]="hardcodedDatasource"></wuic-tree-list-lazy>', component: null, designerOptions: TreeOptions },
      'wizard': { markup: '<wuic-parametric-dialog-lazy [datasource]="datasource" [hardcodedDatasource]="hardcodedDatasource" [isWizard]="true"></wuic-parametric-dialog-lazy>', component: null }
    },
    gridRowTemplate: MetadataProviderService.defaultGridRowTemplate,
    mobileCardTemplate: MetadataProviderService.defaultMobileCardTemplate,
    mobileBreakpointPx: 768,
    schedulerEventTemplate: `<div class="scheduler-item"><wuic-data-action-button-lazy [data]="rowData.extendedProps" [metaInfo]="metaInfo" [datasource]="datasource" [simplified]="true"></wuic-data-action-button-lazy><span class="item-description">{{rowData.title}}</span> </div>`,
    mapEventTemplate: `<div class="map-info"><span class="map-info-title" [innerHTML]="rowData | callback2: getDescription"></span><br/><wuic-data-action-button-lazy [data]="rowData.record" [metaInfo]="metaInfo" [datasource]="datasource" [simplified]="true"></wuic-data-action-button-lazy></div>`,
    treeItemTemplate: `<table><tr><td><wuic-data-action-button-lazy [data]="rowData.data" [parentField]="parentField" [metaInfo]="metaInfo" [datasource]="datasource"></wuic-data-action-button-lazy></td><td><b>{{ rowData.label }}</b></td></tr></table>`
  };

  static widgetMap: {
    [key: string]: {
      component?: any,
      loader?: () => Promise<any>,
      width?: string,
      height?: string,
      hide?: boolean
    }
  } = {};

  static customDesignerTools: {
    group: string,
    toolId: number,
    name: string,
    tag: string,
    icon: string,
    inputProps: { [key: string]: any },
    inputs: { [key: string]: any }
  }[] = [];

  static customDesignerComponents: any[] = [];

  static customRepeaterComponents: any[] = [];

  static baseLibs: string[] = [
    // "assets/declarations/wuic-framework-lib-core.d.ts",
    // "assets/declarations/wuic-framework-lib-notifications.d.ts",
    // "assets/declarations/wuic-framework-lib-routes.d.ts",
    // "assets/declarations/wuic-framework-lib-ui.d.ts",
    // "assets/declarations/wuic-framework-lib-widget-loaders.d.ts",
    "assets/declarations/wuic-framework-lib.d.ts"
  ];

  static MetaDB: any;
  private static metaDbInitPromise?: Promise<any>;
  private static metaDbConfiguredVersion?: number;

  /**
   * Resetta lo stato runtime del singleton Dexie metadata.
   * Utile dopo logout/session reset per evitare riuso di istanze chiuse.
   */
  static resetMetaDbRuntimeState(): void {
    try {
      MetadataProviderService.MetaDB?.close?.();
    } catch {
      // Ignore close errors during reset.
    }
    MetadataProviderService.MetaDB = undefined;
    MetadataProviderService.metaDbInitPromise = undefined;
    MetadataProviderService.metaDbConfiguredVersion = undefined;
  }

  /**
   * Restituisce l'istanza DB metadata locale inizializzata alla versione schema corrente (v5).
   * Wrapper convenienza verso `generateLocalDB(5)`.
   * @returns Istanza Dexie `MetaDB`.
   */
  static async getMetaDB(): Promise<any> {
    return await MetadataProviderService.generateLocalDB(5);
  }

  /**
   * Inizializza (o riusa) il database Dexie `MetaDB` con lo schema metadata richiesto dalla versione passata.
   * Configura tabelle/indici per colonne, tabelle, stili, autorizzazioni, condition group e custom actions.
   * @param version Versione schema Dexie da applicare.
   * @returns Istanza DB locale pronta all'uso.
   */
  static async generateLocalDB(version: number) {
    if (MetadataProviderService.MetaDB && MetadataProviderService.metaDbConfiguredVersion === version) {
      try {
        if (typeof MetadataProviderService.MetaDB?.isOpen === 'function' && !MetadataProviderService.MetaDB.isOpen()) {
          await MetadataProviderService.MetaDB.open();
        }
        return MetadataProviderService.MetaDB;
      } catch {
        MetadataProviderService.resetMetaDbRuntimeState();
      }
    }

    if (!MetadataProviderService.metaDbInitPromise) {
      MetadataProviderService.metaDbInitPromise = import('dexie')
        .then(async ({ default: Dexie }) => {
          const applySchema = (db: any) => {
            db.version(version).stores({
              MetadatiColonna: MetadataProviderService.getSchemaFromClass(new MetadatiColonna(''), 'mc_id', false, ['md_id', '__user_id']),
              MetadatiTabella: MetadataProviderService.getSchemaFromClass(new MetadatiTabella(''), 'md_id', false, ['md_route_name', '__user_id'], '[md_id+__user_id]'),
              MetadatiCustomActionTabella: MetadataProviderService.getSchemaFromClass(new MetadatiCustomActionTabella(), 'Id', false, ['md_id', '__user_id']),
              MetadatiUiStiliTabella: MetadataProviderService.getSchemaFromClass(new MetadatiUiStiliTabella(), 'must_id', false, ['md_id', '__user_id']),
              // MetadatiCustomEditFormAction: MetadataProviderService.getSchemaFromClass(new MetadatiCustomEditFormAction(), 'mf_id', true),
              MetadatiUiStiliColonna: MetadataProviderService.getSchemaFromClass(new MetadatiUiStiliColonna(), 'musc_id', false, ['mc_id', '__user_id']),
              MetadatiUtentiAutorizzazioniColonna: MetadataProviderService.getSchemaFromClass(new MetadatiUtentiAutorizzazioniColonna(), 'muac_id', false, ['mc_id', '__user_id']),
              MetadatiConditionGroup: MetadataProviderService.getSchemaFromClass(new MetadatiConditionGroup(), '[CG_Id+CI_Id]', false, ['md_id', '__user_id', 'CG_Id', 'CI_Id']),
              MetadatiConditionGroupAction: MetadataProviderService.getSchemaFromClass(new MetadatiConditionGroupAction(), 'CAI_Id', true, ['FK_CG_Id', '__user_id']),
            });
          };

          const openDb = async (db: any) => {
            if (MetadataProviderService.metaDbConfiguredVersion !== version) {
              applySchema(db);
              MetadataProviderService.metaDbConfiguredVersion = version;
            }
            await db.open();
            return db;
          };

          if (!MetadataProviderService.MetaDB) {
            MetadataProviderService.MetaDB = new Dexie('MetaDB');
          }

          try {
            return await openDb(MetadataProviderService.MetaDB);
          } catch (err: any) {
            const message = String(err?.message || err || '');
            const isPrimaryKeyUpgradeError =
              String(err?.name || '').toLowerCase().indexOf('upgrade') >= 0 &&
              message.toLowerCase().indexOf('primary key') >= 0;

            if (!isPrimaryKeyUpgradeError) {
              throw err;
            }

            console.warn('Dexie MetaDB reset after UpgradeError on primary key change', { message });
            try { MetadataProviderService.MetaDB?.close?.(); } catch { }
            await Dexie.delete('MetaDB');
            MetadataProviderService.metaDbConfiguredVersion = undefined;
            MetadataProviderService.MetaDB = new Dexie('MetaDB');
            return await openDb(MetadataProviderService.MetaDB);
          }
        })
        .finally(() => {
          MetadataProviderService.metaDbInitPromise = undefined;
        });
    }

    return await MetadataProviderService.metaDbInitPromise;
  }

  /**
   * Costruisce la stringa schema Dexie partendo dalle proprieta della classe metadata e dalle chiavi richieste.
   * Supporta PK semplice/composta, auto-incremento e indici aggiuntivi.
   * @param classIntance Istanza usata per enumerare le proprieta persistibili.
   * @param pKey Nome PK (anche composta nel formato `[a+b]`).
   * @param autoIncrement Se `true` usa prefisso `++` sulla PK semplice.
   * @param keys Campi da indicizzare come chiave composta.
   * @param append Se valorizzato, appende ulteriori indici manuali allo schema.
   * @returns Definizione schema compatibile Dexie `version().stores(...)`.
   */
  static getSchemaFromClass(classIntance: any, pKey: string, autoIncrement: boolean, keys?: string[], append?: string) {
    let schema = '';
    let pkeys = [];

    if (pKey.indexOf('+') > 0) {
      pkeys = pKey.split('+').map(k => k.replace('[', '').replace(']', ''));
      schema += pKey;
    } else {
      if (keys && keys.indexOf(pKey) >= 0) {
        schema += '[' + keys.join('+') + ']';
      } else {
        schema = (autoIncrement ? '++' : '') + pKey;
      }
    }

    Object.keys(classIntance).forEach((key) => {
      if (pkeys.length) {
        if (pkeys.indexOf(key) >= 0 || key.indexOf('__fn') > 0) return;
      } else {
        if (key == pKey || (keys && keys.indexOf(key) >= 0) || key.indexOf('__fn') > 0) return;
      }
      schema += ',' + key;
    });

    if (keys && keys.length) {
      schema += ',[' + keys.join('+') + ']';
    }

    if (append) {
      schema += ',' + append;
    }

    return schema;
  }

  /**
   * Verifica se la route appartiene al set di route metadata interne (editor metadati, stili, autorizzazioni, custom actions).
   * @param route Route da verificare.
   * @returns `true` se la route e una route metadata gestita dal framework.
   */
  static isMetaRoute(route) {
    return (
      route == " metadati  colonne" ||
      route == " metadati  tabelle" ||
      route == "__metadati_stili_tabella" ||
      route == "__metadati_stili_colonna" ||
      route == "Autorizzazioni colonne" ||
      route == "Autorizzazioni tabelle" ||
      route == "custom_route_action" ||
      route == "_Metadati_Custom_Actions_Tabelle" ||
      route == "_Metadati_Utenti_Autorizzazioni_Tabelle" ||
      route == "_Metadati_Utenti_Autorizzazioni_Colonne" ||
      route == "_Metadati_UI_Stili_Tabelle" ||
      route == "_Metadati_UI_Stili_Colonne" ||
      route == "_metadati_condition_group" ||
      route == "_metadati_condition_item" ||
      route == "_metadati_condition_action_group" ||
      route == "_metadati_condition_action_item"
    )
  }

  /**
   * Estrae le colonne marcate come primary key (`mc_is_primary_key`) gestendo flag boolean/number/string.
   * @param columns Collezione metadata colonne.
   * @returns Elenco colonne PK.
   */
  static getPKeys(columns: MetadatiColonna[]) {
    return (columns || []).filter(c => MetadataProviderService.isTruthyFlag((c as any)?.mc_is_primary_key));
  }

  /**
   * Interpreta in modo tollerante i flag boolean legacy provenienti da metadata DB.
   * Considera veri: `true`, `1`, `'true'`, `'1'`, `'yes'`, `'si'`.
   * @param value Valore da interpretare.
   * @returns `true` se il valore rappresenta un flag attivo.
   */
  private static isTruthyFlag(value: any): boolean {
    if (value === true || value === 1) {
      return true;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'si';
    }

    return false;
  }

  /**
   * Traduce la definizione `mc_aggregation` (lista separata da virgole) in descriptor `{ field, aggregate }` consumabili dalla grid.
   * @param metas Metadata colonna da cui ricavare aggregazioni.
   * @returns Collezione aggregazioni campo->funzione (sum/count/min/max/...).
   */
  static getAggregates(metas: MetadatiColonna[]) {
    let fieldAggregates = [];
    metas.forEach((meta) => {
      if (meta.mc_aggregation) {
        meta.mc_aggregation.split(",").forEach((agg) => {
          fieldAggregates.push({ field: meta.ang_name, aggregate: agg });
        });
      }
    });
    return fieldAggregates;
  }

  /**
   * Valuta una condizione booleana sullo stato o sull'input corrente.
   * Legge/scrive dati persistenti su storage browser.
   * @param route Route applicativa coinvolta nell'operazione.
   * @returns Valore restituito dal metodo (boolean).
   */
  private isClientSideCrudModeEnabled(route: string): boolean {
    const safeRoute = (route || '').trim();
    if (!safeRoute) {
      return false;
    }

    const userId = this.userInfo.getuserInfo()?.user_id;
    if (userId === null || userId === undefined) {
      return false;
    }

    const key = `__wuic_client_side_crud_mode__${String(userId).trim()}__${safeRoute}`;
    return localStorage.getItem(key) === '1';
  }

  /**
   * Costruisce la chiave cache menu utente (`menu_{userId}`) usata per persistenza localStorage.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @returns Chiave localStorage della cache menu.
   */
  private getMenuCacheKey(userId: number | string): string {
    return `menu_${userId}`;
  }

  /**
   * Pulisce lo stato runtime e le cache associate.
   * Legge/scrive dati persistenti su storage browser.
   * @param userId Identificativo utente usato per contesto e persistenza.
   */
  private clearMenuCache(userId: number | string): void {
    localStorage.removeItem(this.getMenuCacheKey(userId));
    this.clearMenuCacheByPrefix();
  }

  /**
   * Pulisce lo stato runtime e le cache associate.
   * Legge/scrive dati persistenti su storage browser.
   */
  private clearMenuCacheByPrefix(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('menu_')) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }

  /**
   * Costruisce la chiave cache metodi admin menu (`menu_admin_methods_{userId}`).
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @returns Chiave localStorage della cache metodi admin menu.
   */
  private getMenuAdminMethodsCacheKey(userId: number | string): string {
    return `menu_admin_methods_${userId}`;
  }

  /**
   * Pulisce lo stato runtime e le cache associate.
   * Legge/scrive dati persistenti su storage browser.
   * @param userId Identificativo utente usato per contesto e persistenza.
   */
  private clearMenuAdminMethodsCache(userId: number | string): void {
    localStorage.removeItem(this.getMenuAdminMethodsCacheKey(userId));
  }

  /**
   * Invalida la cache menu dell'utente corrente (o dell'utente passato) rimuovendo la voce `menu_{userId}` da localStorage.
   * Se richiesto elimina anche la cache dei metodi amministrativi `menu_admin_methods_{userId}`.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @param clearAdminMethods Quando `true` rimuove anche la cache dei metodi admin del menu.
   */
  public invalidateMenuByUserIdCache(userId?: number | string, clearAdminMethods: boolean = false): void {
    const resolvedUserId = userId ?? this.userInfo.getuserInfo()?.user_id;
    if (resolvedUserId === null || resolvedUserId === undefined || resolvedUserId === '') {
      return;
    }

    this.clearMenuCache(resolvedUserId);
    if (clearAdminMethods) {
      this.clearMenuAdminMethodsCache(resolvedUserId);
    }
  }

  constructor(private http: HttpClient, private userInfo: UserInfoService) {
    // Safe-guard: `WtoolboxService.appSettings` puo' essere undefined al
    // momento della prima istanziazione di questo service via Angular DI
    // (dipende dall'ordine di caricamento dei chunk esbuild, variabile con
    // `optimization.scripts: true`). Senza fallback, l'accesso
    // `appSettings.global_root_url` esplode con "Cannot read properties of
    // undefined (reading 'global_root_url')" durante il factory call del
    // service. Usare fallback `''` produce URL relativi che funzionano comunque
    // (lo stesso path-based resolution del backend).
    const __root = WtoolboxService.appSettings?.global_root_url ?? '';
    const __meta = WtoolboxService.appSettings?.meta_url ?? '';
    MetadataProviderService.readUri = __root + "MetaService.getFlatRecordData";
    MetadataProviderService.storedUri = __root + "MetaService.getFlatDataFromStored";
    MetadataProviderService.readUriCmb = __root + "MetaService.getFlatRecordComboData";
    MetadataProviderService.readDistinctUriCmb = __root + "MetaService.getFlatRecordDistinctComboData";
    MetadataProviderService.updateUri = __root + "MetaService.updateRecord";
    MetadataProviderService.createUri = __root + "MetaService.insertRecord";
    MetadataProviderService.deleteUri = __root + "MetaService.deleteRecord";
    MetadataProviderService.restoreUri = __root + "MetaService.restoreRecord";
    MetadataProviderService.cloneUri = __root + "MetaService.CloneRecord";
    MetadataProviderService.getDistinctValuesUri = __root + "MetaService.getDistinctValues";
    MetadataProviderService.batchEditUri = __root + "MetaService.batchRecord";
    MetadataProviderService.exportUri = __root + "MetaService.ExportFlatRecordDataSrv";
    MetadataProviderService.exportFromStoredUri = __root + "MetaService.ExportFlatRecordDataFromStoredSrv";
    MetadataProviderService.exportPdfUri = __root + "MetaService.ExportPdfFlatRecordDataSrv";
    MetadataProviderService.flushCacheUri = __root + "MetaService.FlushCache";
    MetadataProviderService.removeColumnUri = MetadataProviderService.buildAsmxEndpoint("scaffolding.RemoveColumn", "metaModel/scaffolding.asmx/RemoveColumn");
    MetadataProviderService.checkInstallUri = __root + "MetaService.checkInstall";
    MetadataProviderService.installUri = __root + "MetaService.configure_wuic";
    MetadataProviderService.getRealPathUri = "services/Utility.asmx/getRealPath";

    MetadataProviderService.getMenuByUserIDUri = __root + "MetaService.getMenuByUserID";
    MetadataProviderService.getMenuAdminMethodsUri = __root + "MetaService.getMenuAdminMethods";
    MetadataProviderService.removeMenuUri = __root + "MetaService.removeMenu";
    MetadataProviderService.addMenuUri = __root + "MetaService.addMenu";
    MetadataProviderService.addMenuFullUri = __root + "MetaService.addMenuFull";
    MetadataProviderService.reorderMenuUri = __root + "MetaService.reorderMenu";
    MetadataProviderService.nestMenuUri = __root + "MetaService.nestMenu";

    MetadataProviderService.getConnectionsUri = __root + "MetaService.getConnections";
    MetadataProviderService.getAppSettingsUri = __root + "MetaService.getAppSettings";
    MetadataProviderService.updateConnectionsUri = __root + "MetaService.updateConnection";
    MetadataProviderService.deleteConnectionsUri = __root + "MetaService.deleteConnection";
    MetadataProviderService.insertConnectionsUri = __root + "MetaService.insertConnection";
    MetadataProviderService.updateAppSettingsUri = __root + "MetaService.updateAppSettings";

    MetadataProviderService.getLoggedUsersUri = __root + "MetaService.getLoggedUsers";
    MetadataProviderService.GetUserListTestUri = __root + "MetaService.GetUserListTest";

    MetadataProviderService.readCustomSettingsUri = __root + 'MetaService.readCustomSettings';
    MetadataProviderService.saveCustomSettingsUri = __root + 'MetaService.saveCustomSettings';
    MetadataProviderService.saveDashboardUri = __root + 'MetaService.saveDashboard';
    MetadataProviderService.loadDashboardUri = __root + 'MetaService.loadDashboard';
    MetadataProviderService.deleteDashboardUri = __root + 'MetaService.deleteDashboard';
    MetadataProviderService.saveWorkflowGraphUri = __root + 'MetaService.saveWorkflowGraph';
    MetadataProviderService.loadWorkflowGraphUri = __root + 'MetaService.loadWorkflowGraph';
    MetadataProviderService.getWorkflowGraphsUri = __root + 'MetaService.getWorkflowGraphs';
    MetadataProviderService.renameWorkflowGraphUri = __root + 'MetaService.renameWorkflowGraph';
    MetadataProviderService.deleteWorkflowGraphUri = __root + 'MetaService.deleteWorkflowGraph';
    MetadataProviderService.getCssClassesFromSheetsUri = __root + 'MetaService.getCssClassesFromSheets';
    MetadataProviderService.writeChangesToCssFileUri = __root + 'MetaService.writeChangesToCssFile';

    MetadataProviderService.scaffoldODataUri = __meta + 'ScaffoldOData';

    MetadataProviderService.metaTableRoute = " metadati  tabelle";
    MetadataProviderService.metaColumnRoute = " metadati  colonne";
    MetadataProviderService.metaMenuRoute = " metadati  menu";
    MetadataProviderService.metatableActionRoute = "custom_route_action";
    MetadataProviderService.metatableStyleRoute = "__metadati_stili_tabella";
    MetadataProviderService.metatableColumnStyleRoute = "__metadati_stili_colonna";
    MetadataProviderService.metatableAuthRoute = "Autorizzazioni tabelle";
    MetadataProviderService.metatableColumnAuthRoute = "Autorizzazioni colonne";

    void MetadataProviderService.generateLocalDB(5);
  }

  /**
   * Recupera i metadata colonna partendo dall'id tabella (`md_id`) delegando a `getMetadati`.
   * @param md_id Identificativo metadato tabella.
   * @returns Collezione metadata colonna della tabella richiesta.
   */
  async getMetadatiById(md_id: number): Promise<MetadatiColonna[]> {
    return await this.getMetadati('', md_id);
  }

  /**
   * Restituisce i metadata di una route (o `md_id`) da cache Dexie quando validi; in caso contrario ricarica da backend.
   * Gestisce invalidazione per versioning metadata progetto e bypass cache in modalita client-side CRUD.
   * @param route Route applicativa coinvolta nell'operazione.
   * @param md_id Identificativo metadato tabella.
   * @returns Metadata colonna mappati e pronti per datasource/edit/list.
   */
  async getMetadati(
    route: string,
    md_id?: number,
    options?: { skipProjectVersionCheck?: boolean }
  ): Promise<MetadatiColonna[]> {
    if (!route && !md_id) {
      console.error("missing route");
    }

    // During startup/login the cookie may be missing; avoid hard crash on null user info.
    const userId = Number(this.userInfo.getuserInfo()?.user_id ?? 0);
    const routeKey = String(route || '');

    const metaDb = await MetadataProviderService.generateLocalDB(5);
    let cachedTable;

    if (md_id) {
      cachedTable = await metaDb.MetadatiTabella
        .where('[md_id+__user_id]')
        .equals([md_id, userId])
        .first();
    } else {
      cachedTable = await metaDb.MetadatiTabella
        .where('[md_route_name+__user_id]')
        .equals([routeKey, userId])
        .first();
    }

    if (cachedTable) {
      const tableId = Number(cachedTable.md_id || 0);
      const [stiliTbl, customActions, conditionGroups, cachedColumnsRaw] = await Promise.all([
        metaDb.MetadatiUiStiliTabella.where({ md_id: tableId, __user_id: userId }).toArray(),
        metaDb.MetadatiCustomActionTabella.where({ md_id: tableId, __user_id: userId }).toArray(),
        metaDb.MetadatiConditionGroup.where({ md_id: tableId, __user_id: userId }).toArray(),
        metaDb.MetadatiColonna.where({ md_id: tableId, __user_id: userId }).toArray()
      ]);
      let cachedColumns = cachedColumnsRaw;

      cachedTable._Metadati_UI_Stili_Tabelles = stiliTbl;
      cachedTable._Metadati_Custom_Actions_Tabelles = customActions;
      MetadataProviderService.sortTableCustomActionsByOrdine(cachedTable);
      cachedTable._Metadati_Condition_Groups = conditionGroups;
      cachedTable.extraProps = {} as any;

      const conditionGroupKeys = (conditionGroups || [])
        .map((cg: any) => Number(cg?.CG_Id || 0))
        .filter((cgId: number) => Number.isFinite(cgId) && cgId > 0)
        .map((cgId: number) => [cgId, userId] as [number, number]);

      let allConditionActions: any[] = [];
      if (conditionGroupKeys.length) {
        allConditionActions = await metaDb.MetadatiConditionGroupAction
          .where('[FK_CG_Id+__user_id]')
          .anyOf(conditionGroupKeys)
          .toArray();
      }

      const actionsByConditionGroup = new Map<number, any[]>();
      allConditionActions.forEach((row: any) => {
        const key = Number(row?.FK_CG_Id || 0);
        if (!actionsByConditionGroup.has(key)) {
          actionsByConditionGroup.set(key, []);
        }
        actionsByConditionGroup.get(key)!.push(row);
      });

      for (const cg of conditionGroups || []) {
        const cgId = Number(cg?.CG_Id || 0);
        cg.ConditionActions = actionsByConditionGroup.get(cgId) || [];
      }

      if (!cachedColumns.length) {
        // Cache incoerente (tabella presente, colonne assenti): forza refill da backend.
        return await this.getMetas(routeKey || route, userId, md_id);
      }

      const columnKeys = cachedColumns
        .map(c => Number(c?.mc_id || 0))
        .filter(mcId => Number.isFinite(mcId) && mcId > 0)
        .map(mcId => [mcId, userId] as [number, number]);

      let allColumnStyles: any[] = [];
      let allColumnAuth: any[] = [];
      if (columnKeys.length) {
        allColumnStyles = await metaDb.MetadatiUiStiliColonna
          .where('[mc_id+__user_id]')
          .anyOf(columnKeys)
          .toArray();
        allColumnAuth = await metaDb.MetadatiUtentiAutorizzazioniColonna
          .where('[mc_id+__user_id]')
          .anyOf(columnKeys)
          .toArray();
      }

      const stylesByColumn = new Map<number, any[]>();
      allColumnStyles.forEach((row: any) => {
        const key = Number(row?.mc_id || 0);
        if (!stylesByColumn.has(key)) stylesByColumn.set(key, []);
        stylesByColumn.get(key)!.push(row);
      });

      const authByColumn = new Map<number, any[]>();
      allColumnAuth.forEach((row: any) => {
        const key = Number(row?.mc_id || 0);
        if (!authByColumn.has(key)) authByColumn.set(key, []);
        authByColumn.get(key)!.push(row);
      });

      for (let indx = 0; indx < cachedColumns.length; indx++) {
        const c = cachedColumns[indx];
        const mcId = Number(c?.mc_id || 0);

        if (indx == 0) {
          c._Metadati_Tabelle = cachedTable;
        }

        c._Metadati_UI_Stili_Colonnes = stylesByColumn.get(mcId) || [];
        c._Metadati_Utenti_Autorizzazioni_Colonnes = authByColumn.get(mcId) || [];
      }

      cachedColumns = MetadataProviderService.mapMetadata(cachedColumns);
      (cachedColumns as any).schedulerInfo = Array.isArray((cachedTable as any)?.schedulerInfo)
        ? (cachedTable as any).schedulerInfo
        : [];

      if (this.isClientSideCrudModeEnabled(cachedTable.md_route_name || routeKey || route)) {
        return cachedColumns;
      }

      if (options?.skipProjectVersionCheck) {
        return cachedColumns;
      }

      const offsetMs = 1000 * 60 * (WtoolboxService.appSettings.cacheMetadataVersionExpirationMinutes || 0);
      const version = await this.getProjectMetadataVersionIfExpired(offsetMs);
      if (version === null) {
        return cachedColumns;
      }

      const cachedVersion = Number(cachedTable.ProjectMetadataVersion || 0);
      if (cachedVersion < Number(version)) {
        return await this.getMetas(routeKey || route, userId, md_id);
      }

      return cachedColumns;
    }
    else {
      //let getMetadataRequestId = wtoolbox.ui.toggleBusy();
      return await this.getMetas(routeKey || route, userId, md_id);
    }

    // if (d)
    //   return d.promise;
  }

  /**
   * Chiama l'endpoint metadata remoto (`MetaService.getFlatData`) e sincronizza cache Dexie locale
   * (tabelle, colonne, stili, autorizzazioni, condition/actions) per l'utente corrente.
   * @param route Route applicativa coinvolta nell'operazione.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @param md_id Identificativo metadato tabella.
   */
  async getMetas(route: string, userId: number, md_id?: number) {
    // let metaRequestId = wtoolbox.ui.toggleBusy();

    // const headers = new HttpHeaders().set('Content-Type', 'application/json; charset=utf-8');
    //return this.httpClient.post<T>(this.httpUtilService.prepareUrlForRequest(url), body, {headers: headers})

    const metaDb = await MetadataProviderService.generateLocalDB(5);
    WtoolboxService.isBusy.next(true);

    // ETag support: send If-None-Match if we have a cached ETag for this route+user.
    const etagKey = `${route}__${userId}`;
    const cachedETag = MetadataProviderService.metadataETagByKey.get(etagKey);
    let reqHeaders = new HttpHeaders();
    if (cachedETag) {
      reqHeaders = reqHeaders.set('If-None-Match', cachedETag);
    }

    let rawPayload: any;
    try {
      const response = await (this.http.post(
        this.getMetadataUri,
        {
          route: route,
          md_id: md_id || '',
          lookup_table_id: 0,
          user_id: userId,
          dm: 1
        },
        { headers: reqHeaders, observe: 'response' }
      ).toPromise() as Promise<any>);

      // Store ETag from response for next request.
      // Defensive guard on `response` itself: Angular's RxJS `toPromise()` can
      // resolve to `undefined` when the observable completes without emitting
      // (Angular 18+/optimization.scripts=true edge case with tree-shaken RxJS).
      // Senza questo check, l'accesso `response.headers` esplode con
      // "TypeError: Cannot read properties of undefined (reading 'headers')".
      const responseETag = response?.headers?.get('ETag');
      if (responseETag) {
        MetadataProviderService.metadataETagByKey.set(etagKey, responseETag);
        MetadataProviderService.metadataCacheByKey.set(etagKey, response?.body);
      }
      rawPayload = response?.body;
    } catch (err: any) {
      // 304 Not Modified — reuse cached payload
      if (err?.status === 304) {
        rawPayload = MetadataProviderService.metadataCacheByKey.get(etagKey);
        if (!rawPayload) {
          // Cache miss — fall back to full request without ETag
          MetadataProviderService.metadataETagByKey.delete(etagKey);
          WtoolboxService.isBusy.next(false);
          return this.getMetas(route, userId, md_id);
        }
      } else {
        throw err;
      }
    }

    const normalizedPayload = this.normalizeMetadataPayload(rawPayload);
    let results = normalizedPayload.columnMetadata;
    const reportList = normalizedPayload.reportList;
    const schedulerInfo = normalizedPayload.schedulerInfo;
    this.setReportListCache(route, reportList);

    if (results.length) {
      let mapped = results; // MetadataProviderService.mapMetadata(results);

      // let clonedMeta = JSON.stringify(mapped);
      // let key = route + "_" + userId;

      const isValidDexieKey = (value: any): boolean => {
        if (value === null || value === undefined) {
          return false;
        }
        if (typeof value === 'number') {
          return Number.isFinite(value);
        }
        if (typeof value === 'string') {
          return value.length > 0;
        }
        if (value instanceof Date) {
          return !Number.isNaN(value.getTime());
        }
        if (Array.isArray(value)) {
          return value.length > 0 && value.every((v) => isValidDexieKey(v));
        }
        return false;
      };

      const columnsToCache: any[] = [];
      const columnStylesToCache: any[] = [];
      const columnAuthToCache: any[] = [];

      mapped.forEach((mc: any) => {
        const normalizedColumn = mc || {};
        normalizedColumn.__user_id = userId;
        if (isValidDexieKey(normalizedColumn.mc_id)) {
          columnsToCache.push(normalizedColumn);
        } else {
          console.warn('Dexie: skip MetadatiColonna row with invalid mc_id', {
            route,
            md_id,
            userId,
            mc_id: normalizedColumn.mc_id,
            column: normalizedColumn?.mc_nome_colonna
          });
        }

        (normalizedColumn?._Metadati_UI_Stili_Colonnes || []).forEach((msc: any) => {
          msc.__user_id = userId;
          columnStylesToCache.push(msc);
        });

        (normalizedColumn?._Metadati_Utenti_Autorizzazioni_Colonnes || []).forEach((mu: any) => {
          mu.__user_id = userId;
          columnAuthToCache.push(mu);
        });

        if (mc.mc_nome_colonna == 'mc_ui_column_type' && route == ' metadati  colonne') {
          let dic = "";
          Object.keys(MetadataProviderService.widgetMap).sort().forEach(k => {
            dic += k + "@@" + k + "||";
          });
          mc.mc_dictionary_value = dic;
        }
      });

      const tableMetadata = mapped[0]._Metadati_Tabelle;
      tableMetadata.__user_id = userId;
      (tableMetadata as any).schedulerInfo = Array.isArray(schedulerInfo) ? schedulerInfo : [];
      MetadataProviderService.sortTableCustomActionsByOrdine(tableMetadata);

      const tableStylesToCache = (tableMetadata?._Metadati_UI_Stili_Tabelles || []).map((m: any) => {
        m.__user_id = userId;
        return m;
      });

      const tableActionsToCache = (tableMetadata?._Metadati_Custom_Actions_Tabelles || []).map((m: any) => {
        m.__user_id = userId;
        return m;
      });

      const conditionGroupsToCache: any[] = [];
      const conditionActionsToCache: any[] = [];
      (tableMetadata?._Metadati_Condition_Groups || []).forEach((m: any) => {
        m.__user_id = userId;
        // Key path for Dexie store is [CG_Id+CI_Id]: normalize null/undefined to finite numbers.
        m.CG_Id = Number.isFinite(Number(m?.CG_Id)) ? Number(m.CG_Id) : 0;
        m.CI_Id = Number.isFinite(Number(m?.CI_Id)) ? Number(m.CI_Id) : 0;
        conditionGroupsToCache.push(m);

        (m?.ConditionActions || []).forEach((ca: any) => {
          ca.__user_id = userId;
          // Auto-increment key CAI_Id: if invalid, leave undefined so Dexie can assign.
          const cai = Number(ca?.CAI_Id);
          ca.CAI_Id = Number.isFinite(cai) && cai > 0 ? cai : undefined;
          ca.FK_CG_Id = Number.isFinite(Number(ca?.FK_CG_Id)) ? Number(ca.FK_CG_Id) : m.CG_Id;
          conditionActionsToCache.push(ca);
        });
      });

      const putSafe = async (
        table: any,
        row: any,
        ctx: { table: string; route: string; md_id?: number; userId: number; key: any }
      ): Promise<void> => {
        try {
          await table.put(row);
        } catch (e) {
          console.warn('Dexie: skip invalid row on put', { ...ctx, error: e, row });
        }
      };

      const bulkPutSafe = async (
        table: any,
        rows: any[],
        ctx: { table: string; route: string; md_id?: number; userId: number; keyField?: string }
      ): Promise<void> => {
        if (!rows.length) {
          return;
        }

        try {
          await table.bulkPut(rows);
          return;
        } catch (e) {
          console.warn('Dexie: bulkPut failed, fallback to row-by-row put', { ...ctx, error: e, count: rows.length });
        }

        for (const row of rows) {
          const key = ctx.keyField ? row?.[ctx.keyField] : undefined;
          await putSafe(table, row, { table: ctx.table, route: ctx.route, md_id: ctx.md_id, userId: ctx.userId, key });
        }
      };

      await metaDb.transaction(
        'rw',
        metaDb.MetadatiTabella,
        metaDb.MetadatiColonna,
        metaDb.MetadatiUiStiliColonna,
        metaDb.MetadatiUtentiAutorizzazioniColonna,
        metaDb.MetadatiUiStiliTabella,
        metaDb.MetadatiCustomActionTabella,
        metaDb.MetadatiConditionGroup,
        metaDb.MetadatiConditionGroupAction,
        async () => {
          await Promise.all([
            bulkPutSafe(metaDb.MetadatiColonna, columnsToCache, { table: 'MetadatiColonna', route, md_id, userId, keyField: 'mc_id' }),
            bulkPutSafe(metaDb.MetadatiUiStiliColonna, columnStylesToCache, { table: 'MetadatiUiStiliColonna', route, md_id, userId, keyField: 'musc_id' }),
            bulkPutSafe(metaDb.MetadatiUtentiAutorizzazioniColonna, columnAuthToCache, { table: 'MetadatiUtentiAutorizzazioniColonna', route, md_id, userId, keyField: 'muac_id' }),
            putSafe(metaDb.MetadatiTabella, tableMetadata, { table: 'MetadatiTabella', route, md_id, userId, key: tableMetadata?.md_id }),
            bulkPutSafe(metaDb.MetadatiUiStiliTabella, tableStylesToCache, { table: 'MetadatiUiStiliTabella', route, md_id, userId, keyField: 'must_id' }),
            bulkPutSafe(metaDb.MetadatiCustomActionTabella, tableActionsToCache, { table: 'MetadatiCustomActionTabella', route, md_id, userId, keyField: 'Id' }),
            bulkPutSafe(metaDb.MetadatiConditionGroup, conditionGroupsToCache, { table: 'MetadatiConditionGroup', route, md_id, userId, keyField: 'CG_Id' }),
            bulkPutSafe(metaDb.MetadatiConditionGroupAction, conditionActionsToCache, { table: 'MetadatiConditionGroupAction', route, md_id, userId, keyField: 'CAI_Id' })
          ]);
        }
      );

      mapped = MetadataProviderService.mapMetadata(results);
      (mapped as any).schedulerInfo = Array.isArray(schedulerInfo) ? schedulerInfo : [];

      WtoolboxService.isBusy.next(false);

      return mapped;

    }
    else {

      return [];
    }

    // .error(function (data) {
    //   if (d)
    //     d.reject();

    //   wtoolbox.logError(data);
    //   if (metaRequestId)
    //     wtoolbox.ui.toggleBusy(metaRequestId);
    // });
  }

  private normalizeMetadataPayload(payload: any): { columnMetadata: any[]; reportList: { path: string; name: string }[]; schedulerInfo: any[] } {
    // Slim serialization envelope: { __slim: true, __defaults: {...}, columnMetadata: [...], ... }
    if (payload?.__slim === true && payload?.__defaults) {
      const columns = payload.columnMetadata || payload.data;
      if (Array.isArray(columns)) {
        this.rehydrateSlimPayload(columns, payload.__defaults);
        // Replace columns back and remove slim markers, then continue normal parsing
        payload.columnMetadata = columns;
        delete payload.__slim;
        delete payload.__defaults;
        delete payload.data;
      }
    }

    if (Array.isArray(payload)) {
      return { columnMetadata: payload, reportList: [], schedulerInfo: [] };
    }

    const columnMetadata = Array.isArray(payload?.columnMetadata)
      ? payload.columnMetadata
      : [];
    const reportList = Array.isArray(payload?.reportList)
      ? payload.reportList
      : [];
    const schedulerInfo = Array.isArray(payload?.schedulerInfo)
      ? payload.schedulerInfo
      : [];

    return { columnMetadata, reportList, schedulerInfo };
  }

  /**
   * Rehydrates a slim metadata payload by restoring default values for properties
   * that were stripped by the server's slim serialization.
   * Each column object gets missing column defaults applied, and the embedded
   * _Metadati_Tabelle object gets missing table defaults applied.
   */
  private rehydrateSlimPayload(data: any, defaults: { table?: Record<string, any>; column?: Record<string, any> }): any {
    if (!Array.isArray(data)) {
      return data;
    }

    const tableDefaults = defaults?.table || {};
    const columnDefaults = defaults?.column || {};

    for (const col of data) {
      if (!col || typeof col !== 'object') continue;

      // Rehydrate column-level defaults
      for (const key of Object.keys(columnDefaults)) {
        if (!(key in col)) {
          col[key] = columnDefaults[key];
        }
      }

      // Rehydrate table-level defaults on the nested _Metadati_Tabelle
      const table = col._Metadati_Tabelle;
      if (table && typeof table === 'object') {
        for (const key of Object.keys(tableDefaults)) {
          if (!(key in table)) {
            table[key] = tableDefaults[key];
          }
        }
      }
    }

    return data;
  }

  private setReportListCache(route: string, reports: { path: string; name: string }[]): void {
    const routeKey = String(route || '').trim().toLowerCase();
    if (!routeKey) {
      return;
    }

    const normalized = Array.isArray(reports) ? reports : [];
    MetadataProviderService.reportListCacheByRoute.set(routeKey, normalized);
    MetadataProviderService.reportListLastCheckAtByRoute.set(routeKey, Date.now());
  }

  /**
   * Invalida la cache report locale.
   * Se `route` e valorizzata, invalida solo quella route; altrimenti svuota tutta la cache report.
   */
  invalidateReportListCache(route?: string): void {
    const routeKey = String(route || '').trim().toLowerCase();
    if (!routeKey) {
      MetadataProviderService.reportListCacheByRoute.clear();
      MetadataProviderService.reportListLastCheckAtByRoute.clear();
      MetadataProviderService.reportListInFlightByRoute.clear();
      return;
    }

    MetadataProviderService.reportListCacheByRoute.delete(routeKey);
    MetadataProviderService.reportListLastCheckAtByRoute.delete(routeKey);
    MetadataProviderService.reportListInFlightByRoute.delete(routeKey);
  }

  /**
   * Recupera da localStorage il dizionario risorse lingua (`language_resources`) usato per tradurre metadata lato client.
   * @returns Oggetto risorse deserializzato oppure `null` se assente.
   */
  static getResources() {
    let x = localStorage.getItem("language_resources");
    return x ? JSON.parse(x) : null;
  }

  /**
   * Applica le risorse di traduzione al metadata tabella/colonne preservando le relazioni annidate non presenti nel payload tradotto
   * (condition groups, custom actions, autorizzazioni tabella, stili tabella).
   * @param metadati Collezione metadata colonna da aggiornare.
   * @param resources Dizionario risorse tradotte (tableMetadata + colonne per nome campo).
   */
  static translate_meta(metadati: any[], resources: any) {

    let table_metadata = metadati[0]._Metadati_Tabelle;
    const preservedConditionGroups = table_metadata?._Metadati_Condition_Groups;
    const preservedCustomActions = table_metadata?._Metadati_Custom_Actions_Tabelles;
    const preservedTableAuthorizations = table_metadata?._Metadati_Utenti_Autorizzazioni_Tabelles;
    const preservedStyles = table_metadata?._Metadati_UI_Stili_Tabelles;

    // angular.extend(table_metadata, resources.tableMetadata);
    Object.assign(table_metadata, resources.tableMetadata);

    // Keep nested metadata relations if translation resources do not carry them.
    if (!table_metadata?._Metadati_Condition_Groups && preservedConditionGroups) {
      table_metadata._Metadati_Condition_Groups = preservedConditionGroups;
    }
    if (!table_metadata?._Metadati_Custom_Actions_Tabelles && preservedCustomActions) {
      table_metadata._Metadati_Custom_Actions_Tabelles = preservedCustomActions;
    }
    if (!table_metadata?._Metadati_Utenti_Autorizzazioni_Tabelles && preservedTableAuthorizations) {
      table_metadata._Metadati_Utenti_Autorizzazioni_Tabelles = preservedTableAuthorizations;
    }
    if (!table_metadata?._Metadati_UI_Stili_Tabelles && preservedStyles) {
      table_metadata._Metadati_UI_Stili_Tabelles = preservedStyles;
    }
    MetadataProviderService.sortTableCustomActionsByOrdine(table_metadata);

    for (let i = 0; i < metadati.length; i++) {
      let metadato = metadati[i];
      // angular.extend(metadato, resources[metadato.mc_nome_colonna]);
      Object.assign(metadato, resources[metadato.mc_nome_colonna]);
    }
  }

  /**
   * Mappa il tipo UI metadata (`mc_ui_column_type`) nel tipo TypeScript corrispondente usato dai declaration/template generator.
   * @param col Metadato colonna da analizzare.
   * @returns Nome tipo TypeScript stimato (`string`, `number`, `boolean`, `Date`, `any`).
   */
  static getTSTypeFromMetaColumn(col: MetadatiColonna) {
    switch (col.mc_ui_column_type) {
      case 'number':
        return 'number';
      case 'number_boolean':
        return 'boolean';
      case 'boolean':
        return 'boolean';
      case 'lookupByID':
        return col.mc_db_column_type == 'int' ? 'number' : 'string';
      case 'button':
        return 'any';
      case 'number_slider':
        return 'number';
      case 'date':
        return 'Date';
      case 'datetime':
        return 'Date';
      case 'time':
        return 'Date';
      case 'dictionary':
        return 'string';
      case 'dictionary_radio':
        return 'string';
      case 'html_area':
        return 'string';
      case 'upload':
        return 'string';
      case 'code_editor':
        return 'string';
      default:
        return 'string';
    }
  }

  /**
   * Normalizza e arricchisce i metadata colonna/tabella: ordina campi, inizializza callback dinamiche, parse di bag JSON
   * e garantisce fallback robusti per funzioni custom non compilabili.
   * @param metas Metadata colonna grezzi provenienti da cache o backend.
   * @returns Metadata pronti all'uso da datasource/edit-form/list-grid.
   */
  static mapMetadata(metas: MetadatiColonna[]) {

    if (!metas || !metas.length) {
      debugger;
      return [];
    }

    let table_metadata = metas[0]._Metadati_Tabelle;

    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

    // try {
    const compileSyncRouteCallback = <T extends Function>(
      callbackName: string,
      source: any,
      fallback: T
    ): T => {
      const raw = String(source || '');
      if (!raw.trim()) {
        return fallback;
      }

      const sanitized = raw
        .replace(/^\uFEFF/, '')
        .replace(/\u0000/g, '')
        .replace(/\u2028|\u2029/g, '\n');
      if (/\bawait\b/.test(sanitized)) {
        console.error(
          `Route '${table_metadata.md_route_name}' - Invalid ${callbackName}: 'await' is not supported in sync callback`,
          { callbackSourceEscaped: JSON.stringify(sanitized) }
        );
        return fallback;
      }

      try {
        return new Function('metaInfo, record, datasource, wtoolbox', sanitized) as T;
      } catch (_compileErr) {
        console.error(
          `Route '${table_metadata.md_route_name}' - Invalid ${callbackName}`,
          {
            compileError: _compileErr,
            callbackSourceEscaped: JSON.stringify(sanitized)
          }
        );
        return fallback;
      }
    };

    table_metadata.md_conditional_update_rule_fn = compileSyncRouteCallback(
      'md_conditional_update_rule',
      table_metadata.md_conditional_update_rule,
      (() => false) as (metaInfo: MetaInfo, record: any, datasource: any, wtoolbox) => boolean
    );

    table_metadata.md_conditional_delete_rule_fn = compileSyncRouteCallback(
      'md_conditional_delete_rule',
      table_metadata.md_conditional_delete_rule,
      (() => false) as (metaInfo: MetaInfo, record: any, datasource: any, wtoolbox) => boolean
    );

    table_metadata.md_display_formula_fn = compileSyncRouteCallback(
      'md_display_formula',
      table_metadata.md_display_formula,
      (() => '') as (metaInfo: MetaInfo, record: any, datasource: DataSourceComponent, wtoolbox) => string
    );
    // The wrappers below RE-THROW on user-callback failure (instead of
    // calling errorHandler.handleError(_err) directly with a raw Error).
    // The caller (DataSourceComponent.executeAfterSyncCallback /
    // canProceedBeforeSync / lifecycle handlers) catches the rethrow and
    // wraps it into a typed `errors.client.user_callback.failed`
    // WuicClientException, which routes through GlobalHandler branch 0
    // and produces a localized dialog. Calling handleError directly here
    // bypassed the typing pipeline and produced the generic
    // "Si è verificato un errore inatteso" fallback.
    table_metadata.md_before_save_fn = table_metadata.md_before_save ? (new AsyncFunction('dataSource, savingData, beforeSync, event, wtoolbox', `
          const commit = () => beforeSync(true);
          const resolve = (doSync) => beforeSync(doSync);
          const prevent =  () => beforeSync(false);
          const record = savingData;
          ${table_metadata.md_before_save}
        `) as (dataSource: DataSourceComponent, savingData: any, beforeSync: (shouldSync: boolean) => void, event: any, wtoolbox: typeof WtoolboxService) => Promise<any>) : async () => true;
    table_metadata.md_after_save_fn = table_metadata.md_after_save ? (new AsyncFunction('dataSource, savingData, syncedData, isInsert, isClone, isDelete, event, wtoolbox', `
          const record = savingData;
          const result = syncedData;
          ${table_metadata.md_after_save}
        `) as (dataSource: DataSourceComponent, savingData: any, syncedData: any, isInsert: boolean, isClone: boolean, isDelete: boolean, event: any, wtoolbox: typeof WtoolboxService) => Promise<void>) : async () => { };
    table_metadata.md_after_load_fn = table_metadata.md_after_load ? (new AsyncFunction('dataSource, originalEvent, result, loadedRecords, isInsert, wtoolbox', `
          ${table_metadata.md_after_load}
        `) as (dataSource: DataSourceComponent, originalEvent: any, result: any, loadedRecords: any[], isInsert: boolean, wtoolbox: typeof WtoolboxService) => Promise<void>) : async () => { };

    const normalizeDynamicScript = (source: any) => String(source || '')
      .replace(/^\uFEFF/, '')
      .replace(/\u0000/g, '')
      .replace(/\u2028|\u2029/g, '\n');

    table_metadata._Metadati_Custom_Actions_Tabelles.forEach((ca) => {
      const actionScript = normalizeDynamicScript(ca.action_callback);
      const disableScript = normalizeDynamicScript(ca.disable_callback);

      try {
        let str = WtoolboxService.buildAsyncBody(actionScript);
        ca.action_callback__fn = actionScript
          ? (new AsyncFunction('datasource, metaInfo, record, event, wtoolbox', str) as (datasource: any, metaInfo: MetaInfo, record: any, event: any, wtoolbox: typeof WtoolboxService) => void)
          : async () => { };
      } catch (_compileErr) {
        console.error(
          `Route '${table_metadata.md_route_name}' - Invalid table action callback`,
          {
            actionId: ca?.Id,
            buttonCaption: ca?.button_caption,
            compileError: _compileErr,
            callbackSourceEscaped: JSON.stringify(actionScript)
          }
        );
        ca.action_callback__fn = async () => { };
      }

      try {
        // FUNZIONA SOLO COME SINCRONA !!!!!!!!!!!!!!!!!!!!!!!!!!
        ca.disable_callback__fn = disableScript
          ? (new Function('datasource, metaInfo, record, wtoolbox', disableScript) as (datasource: any, metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean)
          : () => false;
      } catch (_compileErr) {
        console.error(
          `Route '${table_metadata.md_route_name}' - Invalid table action disable callback`,
          {
            actionId: ca?.Id,
            buttonCaption: ca?.button_caption,
            compileError: _compileErr,
            callbackSourceEscaped: JSON.stringify(disableScript)
          }
        );
        ca.disable_callback__fn = () => false;
      }
    });

    if (WtoolboxService.appSettings.preventNavigateOnFilterByDefault)
      table_metadata.preventNavigateOnFilter = true;

    //parse table metadata too 
    table_metadata.extraProps = {} as any

    try {
      Object.assign(
        table_metadata.extraProps,
        MetadataProviderService.parseMetadataBag(table_metadata.md_props_bag, `Route '${table_metadata.md_route_name}'`)
      );
      (table_metadata as any).md_props_bag = JSON.stringify(table_metadata.extraProps || {});
    } catch (e) {
      alert("Extra properties Route '" + table_metadata.md_route_name + "' - " + e);
    }

    table_metadata.parameterInfo = [];
    let parameters = table_metadata.extraProps.parameters;

    if (parameters)
      table_metadata.parameterInfo = parameters.map(function (param: any) {
        let name_of_param_col = param.Name;
        let default_value = param.value || "0";
        let col = new MetadatiColonna(name_of_param_col);
        let show_in_filter = (param.enabled || param.mc_show_in_filters) && !param.isOut;
        col.mc_ui_column_type = param.Type;
        col.$$currentOperator = {
          name: "eq",
          caption: "equals_to"
        };
        //col.__currentFilterValue = ko.observable(default_value);
        col.mc_hide_in_list = true;
        col.mc_hide_in_edit = true;
        col.isOut = param.isOut;
        col.mc_show_in_filters = show_in_filter;
        col.mc_filter_hide_operator = true;

        if (param.customizationCallback) {
          try {
            new Function("param, route", param.customizationCallback)(col, table_metadata.md_route_name);
          } catch (e) {
            alert("Parameter '" + param.Name + "' customization error - " + e);
          }
        }

        return col;
      });

    let resources = MetadataProviderService.getResources();

    if (resources && resources[table_metadata.md_route_name]) {
      MetadataProviderService.translate_meta(metas, resources[table_metadata.md_route_name]);
    }

    let orderedMetas = metas.map(function (m) {
      const routeName = String(table_metadata?.md_route_name || '').toLowerCase();
      const actionRouteName = String(MetadataProviderService.metatableActionRoute || '').toLowerCase();
      const isTableActionMetadataRoute =
        routeName === 'custom_route_action' ||
        routeName === '_metadati_custom_actions_tabelle' ||
        (!!actionRouteName && routeName === actionRouteName);

      if (isTableActionMetadataRoute && String(m.mc_nome_colonna || '').toLowerCase() === 'action_callback') {
        m.mc_suggest_value_callback = 'await wtoolbox.suggestions.suggestTableActionCallback(record, field);';
      }
      if (String(m.mc_nome_colonna || '').toLowerCase() === 'md_props_bag') {
        m.mc_suggest_value_callback = 'await wtoolbox.suggestions.suggestTablePropsBag(record, field);';
      }
      if (String(m.mc_nome_colonna || '').toLowerCase() === 'mc_props_bag') {
        m.mc_suggest_value_callback = 'await wtoolbox.suggestions.suggestColumnPropsBag(record, field);';
      }
      m.ang_name = m.mc_nome_colonna;
      m.mc_ui_lookup_filter = m.mc_ui_lookup_filter || "contains";
      m.mc_value_change_trigger_event = m.mc_value_change_trigger_event || "keyup";

      m.editor = new BehaviorSubject<IFieldEditor>(null);

      m.extras = {} as any;

      // try {
      Object.assign(
        m.extras,
        MetadataProviderService.parseMetadataBag(m.mc_props_bag, `Route '${table_metadata.md_route_name}' - Column '${m.mc_nome_colonna}'`)
      );
      (m as any).mc_props_bag = JSON.stringify(m.extras || {});

      const prepareCallbackSource = (source: any) => {
        const raw = String(source || '');
        const sanitized = raw
          .replace(/^\uFEFF/, '')
          .replace(/\u0000/g, '')
          .replace(/\u2028|\u2029/g, '\n');
        const escapedInStrings = MetadataProviderService.escapeLineBreaksInQuotedLiterals(sanitized);
        const final = escapedInStrings || sanitized;
        const suspiciousChars = Array.from(raw)
          .map((ch, idx) => ({ idx, code: ch.charCodeAt(0), ch }))
          .filter((item) => item.code < 32 || item.code === 127 || item.code === 8232 || item.code === 8233)
          .slice(0, 50);

        return {
          raw,
          sanitized,
          escapedInStrings,
          final,
          callbackSanitizationApplied: raw !== sanitized,
          callbackStringEscapeApplied: raw !== escapedInStrings,
          suspiciousChars
        };
      };

      const logDynamicCallbackCompileError = (
        callbackName: string,
        compileError: any,
        compileErrorAfterSanitization: any,
        callbackInfo: ReturnType<typeof prepareCallbackSource>,
        generatedFunctionBody: string,
        generatedFunctionBodySanitized: string
      ) => {
        console.error(
          `Route '${table_metadata.md_route_name}' - Column '${m.mc_nome_colonna}' - Invalid ${callbackName}`,
          {
            compileError,
            compileErrorAfterSanitization,
            callbackSourceRaw: callbackInfo.raw,
            callbackSourceEscaped: JSON.stringify(callbackInfo.raw),
            callbackSourceSanitizedEscaped: JSON.stringify(callbackInfo.sanitized),
            callbackSourceEscapedInStringsEscaped: JSON.stringify(callbackInfo.escapedInStrings),
            callbackSourceFinalEscaped: JSON.stringify(callbackInfo.final),
            generatedFunctionBodyEscaped: JSON.stringify(generatedFunctionBody),
            generatedFunctionBodySanitizedEscaped: JSON.stringify(generatedFunctionBodySanitized),
            callbackSanitizationApplied: callbackInfo.callbackSanitizationApplied,
            callbackStringEscapeApplied: callbackInfo.callbackStringEscapeApplied,
            suspiciousChars: callbackInfo.suspiciousChars
          }
        );
      };

      if (m.mc_button_action) {
        const callbackInfo = prepareCallbackSource(m.mc_button_action);
        const callbackBody = WtoolboxService.buildAsyncBody(callbackInfo.final);
        const callbackBodySanitized = WtoolboxService.buildAsyncBody(callbackInfo.sanitized);

        try {
          m.mc_button_action__fn = (new AsyncFunction('datasource, record, event, field, wtoolbox', callbackBody) as (datasource: DataSourceComponent, record: { [key: string]: BehaviorSubject<any> }, event: any, field: MetadatiColonna, wtoolbox: typeof WtoolboxService) => void);
        } catch (_compileErr) {
          try {
            m.mc_button_action__fn = (new AsyncFunction('datasource, record, event, field, wtoolbox', callbackBodySanitized) as (datasource: DataSourceComponent, record: { [key: string]: BehaviorSubject<any> }, event: any, field: MetadatiColonna, wtoolbox: typeof WtoolboxService) => void);
            console.warn(
              `Route '${table_metadata.md_route_name}' - Column '${m.mc_nome_colonna}' - mc_button_action compiled after sanitization`,
              {
                callbackSourceRawEscaped: JSON.stringify(callbackInfo.raw),
                callbackSourceFinalEscaped: JSON.stringify(callbackInfo.final)
              }
            );
          } catch (_compileErrSanitized) {
            logDynamicCallbackCompileError('mc_button_action', _compileErr, _compileErrSanitized, callbackInfo, callbackBody, callbackBodySanitized);
            m.mc_button_action__fn = () => { };
          }
        }
      } else {
        m.mc_button_action__fn = () => { };
      }

      if (m.mc_selection_changed_custom_function) {
        const callbackInfo = prepareCallbackSource(m.mc_selection_changed_custom_function);
        // Wrap the user code in `new Promise(async (resolve, reject) => { try { ... resolve() } catch (_err) { reject(_err) } })`.
        // The Promise wrapper preserves backward-compat with user callbacks
        // that explicitly call `resolve(...)` to short-circuit. The
        // try/catch REJECTS instead of calling errorHandler — so the
        // outer Promise rejects and WtoolboxService.runUserCallback
        // (at the invocation site) types it into
        // errors.client.user_callback.failed. The previous design called
        // `handleError(_err)` directly + never resolved → typed pipeline
        // bypassed AND outer Promise stuck pending forever.
        const callbackBody = `
          return new Promise(async (resolve, reject) => {
            try {
              ${callbackInfo.final}
              resolve();
            } catch (_err) {
              reject(_err);
            }
          });` as string;
        const callbackBodySanitized = `
          return new Promise(async (resolve, reject) => {
            try {
              ${callbackInfo.sanitized}
              resolve();
            } catch (_err) {
              reject(_err);
            }
          });` as string;

        try {
          m.mc_selection_changed_custom_function__fn = (new AsyncFunction('record, field, metaInfo, newValue, oldValue, wtoolbox', callbackBody) as (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, metaInfo: MetaInfo, newValue: any, oldValue: any, wtoolbox: typeof WtoolboxService) => void);
        } catch (_compileErr) {
          try {
            m.mc_selection_changed_custom_function__fn = (new AsyncFunction('record, field, metaInfo, newValue, oldValue, wtoolbox', callbackBodySanitized) as (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, metaInfo: MetaInfo, newValue: any, oldValue: any, wtoolbox: typeof WtoolboxService) => void);
            console.warn(
              `Route '${table_metadata.md_route_name}' - Column '${m.mc_nome_colonna}' - mc_selection_changed_custom_function compiled after sanitization`,
              {
                callbackSourceRawEscaped: JSON.stringify(callbackInfo.raw),
                callbackSourceFinalEscaped: JSON.stringify(callbackInfo.final)
              }
            );
          } catch (_compileErrSanitized) {
            logDynamicCallbackCompileError('mc_selection_changed_custom_function', _compileErr, _compileErrSanitized, callbackInfo, callbackBody, callbackBodySanitized);
            m.mc_selection_changed_custom_function__fn = () => { };
          }
        }
      } else {
        m.mc_selection_changed_custom_function__fn = () => { };
      }

      if (m.mc_validation_custom_callback) {
        const callbackInfo = prepareCallbackSource(m.mc_validation_custom_callback);
        // Same Promise(resolve, reject) wrap as mc_selection_changed_custom_function above.
        const callbackBody = `
          return new Promise(async (resolve, reject) => {
            try {
              ${callbackInfo.final}
              resolve();
            } catch (_err) {
              reject(_err);
            }
          });` as string;
        const callbackBodySanitized = `
          return new Promise(async (resolve, reject) => {
            try {
              ${callbackInfo.sanitized}
              resolve();
            } catch (_err) {
              reject(_err);
            }
          });` as string;

        try {
          m.mc_validation_custom_callback__fn = (new AsyncFunction('record, field, vr, wtoolbox', callbackBody) as (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, vr: ValidationRule, wtoolbox: typeof WtoolboxService) => boolean);
        } catch (_compileErr) {
          try {
            m.mc_validation_custom_callback__fn = (new AsyncFunction('record, field, vr, wtoolbox', callbackBodySanitized) as (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, vr: ValidationRule, wtoolbox: typeof WtoolboxService) => boolean);
            console.warn(
              `Route '${table_metadata.md_route_name}' - Column '${m.mc_nome_colonna}' - mc_validation_custom_callback compiled after sanitization`,
              {
                callbackSourceRawEscaped: JSON.stringify(callbackInfo.raw),
                callbackSourceFinalEscaped: JSON.stringify(callbackInfo.final)
              }
            );
          } catch (_compileErrSanitized) {
            logDynamicCallbackCompileError('mc_validation_custom_callback', _compileErr, _compileErrSanitized, callbackInfo, callbackBody, callbackBodySanitized);
            m.mc_validation_custom_callback__fn = () => { return true };
          }
        }
      } else {
        m.mc_validation_custom_callback__fn = () => { return true };
      }

      if (m.mc_selection_changing_custom_function) {
        const callbackInfo = prepareCallbackSource(m.mc_selection_changing_custom_function);
        try {
          m.mc_selection_changing_custom_function__fn = (new Function('record, field, metaInfo, newValue, oldValue, event, wtoolbox', callbackInfo.final) as (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, metaInfo: MetaInfo, newValue: any, oldValue: any, event: any, wtoolbox: typeof WtoolboxService) => void);
        } catch (_compileErr) {
          try {
            m.mc_selection_changing_custom_function__fn = (new Function('record, field, metaInfo, newValue, oldValue, event, wtoolbox', callbackInfo.sanitized) as (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, metaInfo: MetaInfo, newValue: any, oldValue: any, event: any, wtoolbox: typeof WtoolboxService) => void);
            console.warn(
              `Route '${table_metadata.md_route_name}' - Column '${m.mc_nome_colonna}' - mc_selection_changing_custom_function compiled after sanitization`,
              {
                callbackSourceRawEscaped: JSON.stringify(callbackInfo.raw),
                callbackSourceFinalEscaped: JSON.stringify(callbackInfo.final)
              }
            );
          } catch (_compileErrSanitized) {
            logDynamicCallbackCompileError('mc_selection_changing_custom_function', _compileErr, _compileErrSanitized, callbackInfo, callbackInfo.final, callbackInfo.sanitized);
            m.mc_selection_changing_custom_function__fn = () => { };
          }
        }
      } else {
        m.mc_selection_changing_custom_function__fn = () => { };
      }

      if (m.mc_default_value_callback) {
        const callbackInfo = prepareCallbackSource(m.mc_default_value_callback);
        const callbackBody = `
          const dato = record;
          ${callbackInfo.final}
        `;
        const callbackBodySanitized = `
          const dato = record;
          ${callbackInfo.sanitized}
        `;

        try {
          m.mc_default_value_callback__fn = (new Function('record, field, metaInfo, wtoolbox', callbackBody) as (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, metaInfo: MetaInfo, wtoolbox: typeof WtoolboxService) => any);
        } catch (_compileErr) {
          try {
            m.mc_default_value_callback__fn = (new Function('record, field, metaInfo, wtoolbox', callbackBodySanitized) as (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, metaInfo: MetaInfo, wtoolbox: typeof WtoolboxService) => any);
            console.warn(
              `Route '${table_metadata.md_route_name}' - Column '${m.mc_nome_colonna}' - mc_default_value_callback compiled after sanitization`,
              {
                callbackSourceRawEscaped: JSON.stringify(callbackInfo.raw),
                callbackSourceFinalEscaped: JSON.stringify(callbackInfo.final)
              }
            );
          } catch (_compileErrSanitized) {
            logDynamicCallbackCompileError('mc_default_value_callback', _compileErr, _compileErrSanitized, callbackInfo, callbackBody, callbackBodySanitized);
            m.mc_default_value_callback__fn = () => { return undefined };
          }
        }
      } else {
        m.mc_default_value_callback__fn = () => { };
      }

      // m.mc_suggest_value_callback__fn = m.mc_suggest_value_callback ? (new Function('record, field, metaInfo, wtoolbox', m.mc_suggest_value_callback) as (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, metaInfo: MetaInfo, wtoolbox: typeof WtoolboxService) => any) : () => { };
      if (m.mc_suggest_value_callback) {
        const suggestCallbackRaw = String(m.mc_suggest_value_callback || "");
        const suggestCallbackEscapedInStrings = MetadataProviderService.escapeLineBreaksInQuotedLiterals(suggestCallbackRaw);
        const suggestCallbackSanitized = suggestCallbackRaw
          .replace(/^\uFEFF/, '')
          .replace(/\u0000/g, '')
          .replace(/\u2028|\u2029/g, '\n');
        const suggestCallbackFinal = MetadataProviderService.escapeLineBreaksInQuotedLiterals(suggestCallbackSanitized) || suggestCallbackEscapedInStrings;
        const callbackHasSanitizationDelta = suggestCallbackRaw !== suggestCallbackSanitized;
        const callbackHasStringEscapeDelta = suggestCallbackRaw !== suggestCallbackEscapedInStrings;
        // Same Promise(resolve, reject) wrap as mc_selection_changed_custom_function above.
        const suggestFunctionBody = `
              return new Promise(async (resolve, reject) => {
                try {
                  const dato = record;
                  ${suggestCallbackFinal}
                  resolve();
                } catch (_err) {
                  reject(_err);
                }
              });` as string;
        const suggestFunctionBodySanitized = `
              return new Promise(async (resolve, reject) => {
                try {
                  const dato = record;
                  ${suggestCallbackSanitized}
                  resolve();
                } catch (_err) {
                  reject(_err);
                }
              });` as string;
        try {
          m.mc_suggest_value_callback__fn = (new AsyncFunction('record, field, metaInfo, wtoolbox', suggestFunctionBody) as (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, metaInfo: MetaInfo, wtoolbox: typeof WtoolboxService) => string);
        } catch (_compileErr) {
          try {
            m.mc_suggest_value_callback__fn = (new AsyncFunction('record, field, metaInfo, wtoolbox', suggestFunctionBodySanitized) as (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, metaInfo: MetaInfo, wtoolbox: typeof WtoolboxService) => string);
            console.warn(
              `Route '${table_metadata.md_route_name}' - Column '${m.mc_nome_colonna}' - mc_suggest_value_callback compiled after sanitization`,
              {
                callbackSourceRawEscaped: JSON.stringify(suggestCallbackRaw),
                callbackSourceSanitizedEscaped: JSON.stringify(suggestCallbackSanitized),
                callbackSourceEscapedInStringsEscaped: JSON.stringify(suggestCallbackEscapedInStrings),
                callbackSourceFinalEscaped: JSON.stringify(suggestCallbackFinal),
                callbackSanitizationApplied: callbackHasSanitizationDelta,
                callbackStringEscapeApplied: callbackHasStringEscapeDelta
              }
            );
            return m;
          } catch (_compileErrSanitized) {
            const suspiciousChars = Array.from(suggestCallbackRaw)
              .map((ch, idx) => ({ idx, code: ch.charCodeAt(0), ch }))
              .filter((item) => item.code < 32 || item.code === 127 || item.code === 8232 || item.code === 8233)
              .slice(0, 50);

            console.error(
              `Route '${table_metadata.md_route_name}' - Column '${m.mc_nome_colonna}' - Invalid mc_suggest_value_callback`,
              {
                compileError: _compileErr,
                compileErrorAfterSanitization: _compileErrSanitized,
                callbackSourceRaw: suggestCallbackRaw,
                callbackSourceEscaped: JSON.stringify(suggestCallbackRaw),
                callbackSourceSanitizedEscaped: JSON.stringify(suggestCallbackSanitized),
                callbackSourceEscapedInStringsEscaped: JSON.stringify(suggestCallbackEscapedInStrings),
                callbackSourceFinalEscaped: JSON.stringify(suggestCallbackFinal),
                generatedFunctionBodyEscaped: JSON.stringify(suggestFunctionBody),
                generatedFunctionBodySanitizedEscaped: JSON.stringify(suggestFunctionBodySanitized),
                callbackSanitizationApplied: callbackHasSanitizationDelta,
                callbackStringEscapeApplied: callbackHasStringEscapeDelta,
                suspiciousChars
              }
            );
            m.mc_suggest_value_callback__fn = () => { return "" };
          }
        }
      } else {
        m.mc_suggest_value_callback__fn = () => { return "" };
      }

      // } catch (e) {
      //   // alert("Extra properties Route '" + table_metadata.md_route_name + "' - Column: '" + m.mc_nome_colonna + "' - " + e);
      //   console.error("Route '" + table_metadata.md_route_name + "' - Column: '" + m.mc_nome_colonna + "' - " + e);
      // }

      return m;
    }).sort(function (a, b) {
      return a.mc_ordine != null && b.mc_ordine != null ?
        a.mc_ordine - b.mc_ordine :
        a.mc_id - b.mc_id
    });

    // metas[0]._Metadati_Tabelle = null;
    orderedMetas[0]._Metadati_Tabelle = table_metadata;

    return orderedMetas;
  }

  /**
   * Calcola la colonna target per uno spostamento su/giu nell'ordine campi usando `metaInfo.columnMetadata`.
   * Salta le colonne nascoste in edit (`mc_hide_in_edit`) e prepara i dati necessari alla reorder server-side (chiamata oggi commentata).
   * @param field Colonna sorgente da spostare.
   * @param upDown Direzione di spostamento (`"up"` o `"down"`).
   * @param metaInfo Metadati tabella/colonne usati per risolvere indice corrente e target.
   */
  reorderField(field: MetadatiColonna, upDown: any, metaInfo: MetaInfo) {
    let route = metaInfo.tableMetadata.md_route_name;
    let index = metaInfo.columnMetadata.indexOf(field);
    let trgtIndex = 0;
    let target_cols = metaInfo.columnMetadata.filter(function (col: MetadatiColonna) {
      if (upDown == "up") {
        if (metaInfo.columnMetadata.indexOf(col) == index - 1) {
          trgtIndex = index - 1;
          return true;
        }
      }
      else {
        if (metaInfo.columnMetadata.indexOf(col) == index + 1) {
          trgtIndex = index + 1;
          return true;
        }
      }

      return false;
    });

    if (target_cols.length) {

      let target_col = target_cols[0];

      if (target_col.mc_hide_in_edit) {
        if (upDown == "up") {
          for (let i = trgtIndex; i >= 0; i--) {
            if (!metaInfo.columnMetadata[i].mc_hide_in_edit)
              target_col = metaInfo.columnMetadata[i];
          }
        }
        else {
          for (let i = trgtIndex; i < metaInfo.columnMetadata.length; i++) {
            if (!metaInfo.columnMetadata[i].mc_hide_in_edit)
              target_col = metaInfo.columnMetadata[i];
          }
        }
      }

      if (!target_col.mc_hide_in_edit) {
        // wtoolbox.data.getJSONPostData((WtoolboxService.appSettings?.global_root_url ?? "") + "metaModel/metaService.asmx/reorderField",
        //   {
        //     route: route,
        //     before: upDown == "up",
        //     source_col_name: field.ang_name,
        //     target_col_name: target_col.ang_name
        //   }).then(function (res) {
        //     cache.remove(route + "_" + UserInfo.getUserID());
        //     if (localStorageService.isSupported) {
        //       localStorageService.clearAll();
        //     }
        //     self.getMetadati(route, function (metas) {
        //       metaInfo.columnMetadata = metas;
        //     });
        //     //let tmp = metaInfo.columnMetadata[index];
        //     //let trgtIndex = metaInfo.columnMetadata.indexOf(target_col);
        //     //metaInfo.columnMetadata[index] = metaInfo.columnMetadata[trgtIndex];
        //     //metaInfo.columnMetadata[trgtIndex] = tmp;
        //   })["catch"](function (err) {
        //     wtoolbox.logError(err);
        //   });
      }
    }
  }

  /**
   * Punto di estensione per mostrare/nascondere una colonna in edit/list tramite metadata (`mc_hide_in_edit` e affini).
   * L'implementazione operativa server-side e il refresh cache/route sono presenti come traccia nei blocchi commentati.
   * @param field Colonna da aggiornare.
   * @param show Se `true` la colonna deve essere mostrata, se `false` nascosta.
   * @param edit Flag legacy usato dalla chiamata server per distinguere il contesto edit.
   * @param metaInfo Metadati correnti della route.
   */
  hideColumn(field: MetadatiColonna, show: boolean, edit: boolean, metaInfo?: MetaInfo) {
    // let route = metaInfo.tableMetadata.md_route_name;
    // wtoolbox.data.getJSONPostData((WtoolboxService.appSettings?.global_root_url ?? "") + "metaModel/metaService.asmx/hideColumn",
    //   {
    //     route: route,
    //     col_name: field.ang_name,
    //     show: show || false,
    //     edit: edit
    //   }).then(function (res) {
    //     cache.remove(route + "_" + UserInfo.getUserID());
    //     field.mc_hide_in_edit = !show;
    //     if (localStorageService.isSupported) {
    //       localStorageService.clearAll();
    //     }
    //     $route.reload();
    //   })["catch"](function (err) {
    //     wtoolbox.logError(err);
    //   });
  }

  /**
   * Genera o richiede un suggerimento contestuale basato su metadata e record corrente.
   * @param field Metadato colonna/campo coinvolto nell'elaborazione.
   * @param record Record corrente usato dalla logica/metadati.
   */
  suggest(field: MetadatiColonna, record: any) {
    if (field && field.mc_suggest_value_callback) {
      if (record) {
        // let injectedservices = {
        //   appSettings: appSettings,
        //   wtoolbox: wtoolbox,
        //   RouteSrvc: RouteSrvc
        // }

        //   if (!angular.isFunction(field.mc_suggest_value_callback))
        //     new Function("dato, field, evento, services, commit, wtoolbox, scope", field.mc_suggest_value_callback)
        //       (record, field, event, injectedservices, commit, wtoolbox, $scope);
        //   else
        //     field.mc_suggest_value_callback(record, field, event, injectedservices, commit, wtoolbox, $scope);

        //   $scope.editForm.$setDirty();
        // }
      }
    }
  }

  /**
   * Recupera il menu utente da cache localStorage o da backend (`MetaService.getMenuByUserID`) e lo mappa in `MenuItem[]`.
   * @param forceRefresh Se `true` bypassa localStorage e forza chiamata backend.
   */
  async getMenuByUserID(forceRefresh: boolean = false): Promise<MenuItem[]> {
    let uId = this.userInfo.getuserInfo().user_id;
    let key = this.getMenuCacheKey(uId);

    if (!forceRefresh) {
      const cached = localStorage.getItem(key);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            return parsed as MenuItem[];
          }
        } catch {
          localStorage.removeItem(key);
        }
      }
    }

    // In-flight dedupe: se un'altra chiamata per lo stesso (userId, forceRefresh)
    // e' gia' partita e non ancora risolta, riusiamo la sua Promise invece di
    // sparare un secondo POST. Cruciale perche' meta-menu.component.ts registra
    // piu' subscriptions che possono invocare questo metodo nello stesso tick.
    const inFlightKey = `${uId}__${forceRefresh ? 'force' : 'cache'}`;
    const existing = MetadataProviderService.menuInFlightByKey.get(inFlightKey);
    if (existing) {
      return existing;
    }

    WtoolboxService.isBusy.next(true);

    const promise = (async () => {
      try {
        const results = await (this.http.post(
          MetadataProviderService.getMenuByUserIDUri,
          { user_id: uId }
        ).toPromise() as Promise<any[]>);

        if (results && results.length) {
          const mapped: MenuItem[] = [];
          this.mapMenu(results, mapped);
          const clonedMeta = JSON.stringify(mapped);
          localStorage.setItem(key, clonedMeta);
          return mapped;
        }
        return [];
      } finally {
        WtoolboxService.isBusy.next(false);
        // Rilascia l'in-flight entry SOLO dopo la fine della call (ok o ko):
        // fino ad allora, chiamanti concorrenti devono agganciarsi a questa
        // Promise, dopo invece devono poter ripartire (es. per forceRefresh
        // successivo a un update metadata).
        MetadataProviderService.menuInFlightByKey.delete(inFlightKey);
      }
    })();

    MetadataProviderService.menuInFlightByKey.set(inFlightKey, promise);
    return promise;
  }

  /**
   * Recupera i metodi amministrativi menu dell'utente da cache o backend (`MetaService.getMenuAdminMethods`).
   * @param forceRefresh Se `true` bypassa localStorage e forza chiamata backend.
   * @returns Elenco metodi admin abilitati per il menu corrente.
   */
  async getMenuAdminMethods(forceRefresh: boolean = false): Promise<string[]> {
    const uId = this.userInfo.getuserInfo().user_id;
    const key = this.getMenuAdminMethodsCacheKey(uId);

    if (!forceRefresh) {
      const cached = localStorage.getItem(key);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            return parsed as string[];
          }
        } catch {
          localStorage.removeItem(key);
        }
      }
    }

    // In-flight dedupe: stesso motivo di `getMenuByUserID` — `meta-menu.component.ts`
    // richiama `syncMenuAdminMethods` sia in ngOnInit che in `refreshAuthSession`,
    // e in condizioni di race possiamo ritrovarci 2 POST concorrenti allo stesso
    // endpoint nello stesso tick.
    const inFlightKey = `${uId}__${forceRefresh ? 'force' : 'cache'}`;
    const existing = MetadataProviderService.menuAdminMethodsInFlightByKey.get(inFlightKey);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      try {
        const methods = await (this.http.post(
          MetadataProviderService.getMenuAdminMethodsUri,
          {}
        ).toPromise() as Promise<string[]>);

        const validMethods = Array.isArray(methods) ? methods : [];
        localStorage.setItem(key, JSON.stringify(validMethods));
        return validMethods;
      } finally {
        MetadataProviderService.menuAdminMethodsInFlightByKey.delete(inFlightKey);
      }
    })();

    MetadataProviderService.menuAdminMethodsInFlightByKey.set(inFlightKey, promise);
    return promise;
  }

  /**
   * Rimuove i dati target aggiornando lo stato del servizio.
   * @param menuId Identificativo tecnico usato per lookup/aggiornamento.
   * @param preserveChilds Se `true` preserva i figli ricollegandoli al livello superiore.
   * @returns Valore restituito dal metodo (Promise<void>).
   */
  async removeMenu(menuId: number, preserveChilds: boolean): Promise<void> {
    await this.http.post(
      MetadataProviderService.removeMenuUri,
      { menuId: menuId, preserveChilds: preserveChilds }
    ).toPromise();

    this.clearMenuCache(this.userInfo.getuserInfo().user_id);
    this.clearMenuAdminMethodsCache(this.userInfo.getuserInfo().user_id);
  }

  /**
   * Chiama `MetaService.addMenu` per creare una nuova voce menu relativa a `menuId`, con opzioni di inserimento prima/dopo e nesting.
   * Al termine invalida cache menu e cache metodi admin dell'utente.
   * @param menuId Id voce/menu di riferimento.
   * @param before Se `true` inserisce prima del target, altrimenti dopo.
   * @param nested Se `true` richiede un inserimento annidato.
   * @param mm_id Catena id menu usata dal backend per contestualizzare la posizione.
   * @returns Id della nuova voce menu creata dal backend.
   */
  async addMenu(menuId: number, before: boolean, nested: boolean, mm_id: number[]): Promise<number> {
    const id = await (this.http.post(
      MetadataProviderService.addMenuUri,
      { menuId: menuId, before: before, nested: nested, mm_id: mm_id || [] }
    ).toPromise() as Promise<number>);

    this.clearMenuCache(this.userInfo.getuserInfo().user_id);
    this.clearMenuAdminMethodsCache(this.userInfo.getuserInfo().user_id);
    return id;
  }

  /**
   * Riordina una voce menu via `MetaService.reorderMenu` specificando sorgente, target, posizione relativa e nuovo parent.
   * Invalida poi cache menu/metodi admin per forzare rilettura coerente alla successiva apertura.
   * @param source Id voce menu spostata.
   * @param target Id voce menu target.
   * @param after Se `true` posiziona dopo il target, altrimenti prima.
   * @param newParentId Id parent finale dopo il move.
   * @param mm_id Catena id menu usata dal backend durante il riordino.
   */
  async reorderMenu(source: number, target: number, after: boolean, newParentId: number, mm_id: number[]): Promise<void> {
    await this.http.post(
      MetadataProviderService.reorderMenuUri,
      { source: source, target: target, after: after, newParentId: newParentId, mm_id: mm_id || [] }
    ).toPromise();

    this.clearMenuCache(this.userInfo.getuserInfo().user_id);
    this.clearMenuAdminMethodsCache(this.userInfo.getuserInfo().user_id);
  }

  /**
   * Sposta una voce menu come figlia di un nuovo parent chiamando `MetaService.nestMenu`.
   * Dopo la mutazione invalida cache menu e cache metodi amministrativi.
   * @param newChild Id della voce da annidare.
   * @param newParent Id del nuovo nodo parent.
   */
  async nestMenu(newChild: number, newParent: number): Promise<void> {
    await this.http.post(
      MetadataProviderService.nestMenuUri,
      { newChild: newChild, newParent: newParent }
    ).toPromise();

    this.clearMenuCache(this.userInfo.getuserInfo().user_id);
    this.clearMenuAdminMethodsCache(this.userInfo.getuserInfo().user_id);
  }

  /**
   * Crea una nuova voce menu completa (caption + url) via `MetaService.addMenuFull`.
   * Invalida cache menu e metodi admin e ritorna l'id generato dal backend.
   * @param caption Etichetta visualizzata nel menu.
   * @param url Route/URL associata alla voce.
   * @returns Id della voce menu creata.
   */
  async addMenuFull(caption: string, url: string): Promise<number> {
    const id = await (this.http.post(
      MetadataProviderService.addMenuFullUri,
      { caption: caption, url: url }
    ).toPromise() as Promise<number>);

    this.clearMenuCache(this.userInfo.getuserInfo().user_id);
    this.clearMenuAdminMethodsCache(this.userInfo.getuserInfo().user_id);
    return id;
  }

  /**
   * Trasforma la struttura annidata ricevuta dal backend (`_Metadati_Menus_Ordered`) in `MenuItem[]` PrimeNG.
   * Normalizza la route (`mm_uri_menu`) e ricostruisce ricorsivamente i figli preservando `mm_id` e icona.
   * @param results Nodi menu raw restituiti dal backend.
   * @param items Collezione root su cui appendere i nodi mappati.
   * @param parent Parent corrente durante la ricorsione; se assente il nodo viene aggiunto alla root.
   */
  mapMenu(results: any[], items: MenuItem[], parent?: MenuItem) {
    results.forEach(element => {
      const normalizedRoute = this.normalizeMenuRoute(element.mm_uri_menu);
      const routeParts = this.splitMenuRouteAndQuery(normalizedRoute);
      let mItem: any = {
        label: element.mm_display_string_menu,
        icon: element.mm_icon,
        route: routeParts.route,
        queryParams: routeParts.queryParams,
        items: [],
        mm_id: element.mm_id,
        mm_uri_menu: element.mm_uri_menu
      };

      if (parent) {
        if (!parent.items) parent.items = [];
        parent.items.push(mItem);
      } else {
        items.push(mItem);
      }

      this.mapMenu(element._Metadati_Menus_Ordered, items, mItem);
    });
    // return [];
  }

  /**
   * Normalizza il payload in una forma coerente per i passaggi successivi.
   * @param route Route applicativa coinvolta nell'operazione.
   * @returns Valore restituito dal metodo (any).
   */
  private normalizeMenuRoute(route: any): any {
    if (typeof route !== 'string') {
      return route;
    }

    if (route === '') {
      return undefined;
    }

    // With HashLocation Angular manages the hash prefix itself.
    if (route.startsWith('#/')) {
      return route.substring(1);
    }

    if (route.startsWith('#')) {
      return route.substring(1);
    }

    return route;
  }

  private splitMenuRouteAndQuery(route: any): { route: any; queryParams?: Record<string, any> } {
    if (typeof route !== 'string') {
      return { route };
    }

    const raw = route.trim();
    if (!raw) {
      return { route: undefined };
    }

    const idx = raw.indexOf('?');
    if (idx < 0) {
      return { route: raw };
    }

    const path = raw.substring(0, idx).trim();
    const query = raw.substring(idx + 1).trim();
    if (!query) {
      return { route: path || raw };
    }

    const params: Record<string, any> = {};
    query.split('&')
      .map((x) => x.trim())
      .filter((x) => !!x)
      .forEach((pair) => {
        const eq = pair.indexOf('=');
        if (eq < 0) {
          const keyOnly = decodeURIComponent(pair);
          if (keyOnly) {
            params[keyOnly] = '';
          }
          return;
        }

        const key = decodeURIComponent(pair.substring(0, eq));
        const value = decodeURIComponent(pair.substring(eq + 1));
        if (!key) {
          return;
        }

        params[key] = value;
      });

    return {
      route: path || raw,
      queryParams: Object.keys(params).length ? params : undefined
    };
  }

  /**
   * Esegue parse robusto di `mc_props_bag`/bag JSON metadata accettando anche payload legacy malformati.
   * In caso di errore prova normalizzazione progressiva e logga dettagli contestuali per debug metadata.
   * @param raw Payload bag grezzo (oggetto o stringa JSON-like).
   * @param context Identificatore contesto usato nei log (route/colonna).
   * @returns Oggetto bag normalizzato; `{}` se non interpretabile.
   */
  private static parseMetadataBag(raw: any, context: string): Record<string, any> {
    if (raw && typeof raw === 'object') {
      return raw as Record<string, any>;
    }

    const text = String(raw || '').trim();
    if (!text) {
      return {};
    }

    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (originalErr) {
      const normalized = this.normalizeLegacyJsonLike(text);
      try {
        const parsed = JSON.parse(normalized);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (err) {
        const originalPosition = this.extractJsonErrorPosition(originalErr);
        const normalizedPosition = this.extractJsonErrorPosition(err);
        console.error(`${context} - Invalid JSON in props bag`, {
          originalError: originalErr,
          normalizedError: err,
          originalErrorPosition: originalPosition,
          normalizedErrorPosition: normalizedPosition,
          originalErrorContext: this.buildJsonErrorContext(text, originalPosition),
          normalizedErrorContext: this.buildJsonErrorContext(normalized, normalizedPosition),
          originalErrorCharDetails: this.getJsonErrorCharDetails(text, originalPosition),
          normalizedErrorCharDetails: this.getJsonErrorCharDetails(normalized, normalizedPosition),
          originalPreviewEscaped: JSON.stringify(text.slice(0, 400)),
          normalizedPreviewEscaped: JSON.stringify(normalized.slice(0, 400))
        });
        return {};
      }
    }
  }

  /**
   * Applica correzioni conservative a stringhe JSON legacy (virgolette smart, apostrofi, separatori irregolari)
   * per aumentare la probabilita di parse senza alterare il contenuto semantico.
   * @param input Stringa JSON-like da normalizzare.
   * @returns Stringa normalizzata pronta per tentativo `JSON.parse`.
   */
  private static normalizeLegacyJsonLike(input: string): string {
    let normalized = String(input || '').trim();
    if (!normalized) {
      return '{}';
    }

    // Remove BOM and JavaScript comments often present in legacy serialized blobs.
    normalized = normalized.replace(/^\uFEFF/, '');
    normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, '');
    normalized = normalized.replace(/(^|\s+)\/\/.*$/gm, '$1');

    // Convert single-quoted strings/keys to valid JSON double-quoted strings.
    normalized = normalized.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value: string) => {
      const escaped = value.replace(/"/g, '\\"');
      return `"${escaped}"`;
    });

    // Quote unquoted object keys: { key: 1 } => { "key": 1 }.
    // Allow dots in legacy keys (e.g. ui.theme: "x").
    normalized = normalized.replace(/([{,]\s*)([A-Za-z_$][\w$.-]*)(\s*:)/g, '$1"$2"$3');

    // Fix common malformed schema fragment: "type": "number", "null"
    // into valid JSON-schema union type: "type": ["number", "null"].
    normalized = normalized.replace(
      /("type"\s*:\s*"[^"]+")\s*,\s*"null"(?=\s*[},])/g,
      (_m, typeExpr: string) => `${typeExpr.replace(/"type"\s*:\s*"([^"]+)"/, '"type": ["$1", "null"]')}`
    );

    // Remove trailing commas in objects/arrays.
    normalized = normalized.replace(/,\s*([}\]])/g, '$1');

    return normalized;
  }

  /**
   * Estrae la posizione carattere dell'errore JSON da messaggi parser eterogenei.
   * @param err Errore lanciato da `JSON.parse`.
   * @returns Indice carattere errore se rilevabile.
   */
  private static extractJsonErrorPosition(err: any): number | undefined {
    const message = String(err?.message || '');
    const match = message.match(/position\s+(\d+)/i);
    if (!match) {
      return undefined;
    }

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  /**
   * Costruisce un frammento diagnostico intorno alla posizione errore JSON per semplificare il fixing metadata.
   * @param input Testo JSON sorgente.
   * @param position Posizione carattere errore.
   * @returns Oggetto diagnostico con before/after e offset.
   */
  private static buildJsonErrorContext(input: string, position?: number): any {
    if (typeof position !== 'number' || position < 0 || position > input.length) {
      return {
        excerptEscaped: JSON.stringify(input.slice(0, 300))
      };
    }

    const radius = 140;
    const start = Math.max(0, position - radius);
    const end = Math.min(input.length, position + radius);
    const excerpt = input.slice(start, end);
    const pointerOffset = position - start;
    const before = input.slice(0, position);
    const line = before.split('\n').length;
    const lastNewline = before.lastIndexOf('\n');
    const column = position - (lastNewline + 1) + 1;

    return {
      position,
      line,
      column,
      excerptEscaped: JSON.stringify(excerpt),
      pointerOffset,
      pointerGuide: `${' '.repeat(Math.max(0, pointerOffset))}^`
    };
  }

  /**
   * Fornisce dettagli del carattere in errore (char, codePoint, escape) alla posizione indicata.
   * @param input Testo JSON sorgente.
   * @param position Posizione carattere errore.
   * @returns Dettagli carattere utili per debug parser.
   */
  private static getJsonErrorCharDetails(input: string, position?: number): any {
    if (typeof position !== 'number' || position < 0 || position >= input.length) {
      return undefined;
    }

    const currentChar = input[position];
    const from = Math.max(0, position - 8);
    const to = Math.min(input.length - 1, position + 8);
    const around: Array<{ index: number; char: string; code: number }> = [];

    for (let i = from; i <= to; i++) {
      around.push({
        index: i,
        char: input[i],
        code: input.charCodeAt(i)
      });
    }

    return {
      position,
      char: currentChar,
      code: input.charCodeAt(position),
      around
    };
  }

  // Prevent runtime compilation errors when metadata stores raw CR/LF inside quoted JS strings.
  /**
   * Escapa line break non validi all'interno di literal stringa JSON mantenendo intatti i contenuti fuori stringa.
   * @param input Testo JSON da sanificare.
   * @returns Testo con newline in-string convertiti a sequenze escape.
   */
  private static escapeLineBreaksInQuotedLiterals(input: string): string {
    const text = String(input || '');
    if (!text) {
      return text;
    }

    let result = '';
    let inSingle = false;
    let inDouble = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (escaped) {
        result += ch;
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        result += ch;
        escaped = true;
        continue;
      }

      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        result += ch;
        continue;
      }

      if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        result += ch;
        continue;
      }

      if ((inSingle || inDouble) && ch === '\r') {
        result += '\\r';
        continue;
      }

      if ((inSingle || inDouble) && ch === '\n') {
        result += '\\n';
        continue;
      }

      result += ch;
    }

    return result;
  }

  /**
   * Compone l'endpoint ASMX scegliendo il path proxy (`.../AsmxProxy/...`) quando configurato,
   * altrimenti fallback al percorso legacy.
   * @param proxyMethod Metodo proxy da appendere a `global_root_url`.
   * @param legacyPath Path legacy ASMX.
   * @returns URL endpoint risolto.
   */
  private static buildAsmxEndpoint(proxyMethod: string, legacyPath: string): string {
    const root = (WtoolboxService.appSettings?.global_root_url || '').toString();
    if (root.toLowerCase().indexOf('asmxproxy') >= 0) {
      return root + proxyMethod;
    }

    return root + legacyPath;
  }

  /**
   * Avvia il processo di scaffolding OData lato server chiamando l'endpoint `MetadataProviderService.scaffoldODataUri`.
   */
  async scaffoldOdata() {
    let results = await (this.http.get(
      MetadataProviderService.scaffoldODataUri

    ).toPromise() as Promise<any>);
  }

  /**
   * Costruisce la chiave localStorage dei custom settings utente.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @returns Chiave `wuic_custom_settings_{userId}`.
   */
  private getCustomSettingsStorageKey(userId: number | string): string {
    return `wuic_custom_settings_${userId}`;
  }

  /**
   * Costruisce la chiave richiesta usata per deduplica chiamate custom settings in-flight (`userId::key`).
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @param key Chiave logica della configurazione o del setting.
   * @returns Chiave composita richiesta.
   */
  private getCustomSettingsRequestKey(userId: number | string, key: string): string {
    return `${String(userId)}::${String(key || '')}`;
  }

  /**
   * Legge i custom settings utente con deduplica richieste in-flight e cache locale (`wuic_custom_settings_{userId}`).
   * Per una chiave specifica prova prima localStorage, poi richieste aggregate gia in corso; per la lettura completa aggiorna la cache locale.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @param key Chiave setting; vuota per ottenere l'intero dizionario.
   * @returns Valore del setting richiesto oppure oggetto completo dei settings.
   */
  async readCustomSettings(userId: number | string, key: string = ''): Promise<any> {
    const normalizedKey = String(key || '');
    const requestKey = this.getCustomSettingsRequestKey(userId, normalizedKey);
    const allSettingsRequestKey = this.getCustomSettingsRequestKey(userId, '');

    if (normalizedKey) {
      const fromLocal = this.getCustomSettingFromLocalStorage(normalizedKey, userId);
      if (fromLocal !== null && fromLocal !== undefined) {
        return fromLocal;
      }

      const allSettingsInFlight = MetadataProviderService.customSettingsInFlightByRequest.get(allSettingsRequestKey);
      if (allSettingsInFlight) {
        const allSettings = await allSettingsInFlight;
        if (allSettings && typeof allSettings === 'object' && normalizedKey in allSettings) {
          return allSettings[normalizedKey];
        }
      }
      return null;
    }

    const alreadyInFlight = MetadataProviderService.customSettingsInFlightByRequest.get(requestKey);
    if (alreadyInFlight) {
      return await alreadyInFlight;
    }

    const request = (this.http.post(
      MetadataProviderService.readCustomSettingsUri,
      { user_id: String(userId), key: normalizedKey },
      { withCredentials: true }
    ).toPromise() as Promise<any>).finally(() => {
      MetadataProviderService.customSettingsInFlightByRequest.delete(requestKey);
    });
    MetadataProviderService.customSettingsInFlightByRequest.set(requestKey, request);

    const raw = await request;

    if (raw === null || raw === undefined || raw === '') {
      return normalizedKey ? null : {};
    }

    if (typeof raw === 'object') {
      if (!normalizedKey) {
        localStorage.setItem(this.getCustomSettingsStorageKey(userId), JSON.stringify(raw));
      } else {
        this.setCustomSettingInLocalStorage(normalizedKey, raw, userId);
      }
      return raw;
    }

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (!normalizedKey && parsed && typeof parsed === 'object') {
          localStorage.setItem(this.getCustomSettingsStorageKey(userId), JSON.stringify(parsed));
        } else if (normalizedKey) {
          this.setCustomSettingInLocalStorage(normalizedKey, parsed, userId);
        }
        return parsed;
      } catch {
        return raw;
      }
    }

    return raw;
  }

  /**
   * Salva i dati richiesti dal flusso runtime del servizio.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @param settings Oggetto settings (o stringa JSON) da serializzare e inviare al backend.
   * @param key Chiave logica della configurazione o del setting.
   * @returns Valore restituito dal metodo (Promise<any>).
   */
  async saveCustomSettings(userId: number | string, settings: any, key: string): Promise<any> {
    const serialized = typeof settings === 'string' ? settings : JSON.stringify(settings ?? {});
    return this.http.post(
      MetadataProviderService.saveCustomSettingsUri,
      { user_id: String(userId), settings: serialized, key },
      { withCredentials: true }
    ).toPromise();
  }

  /**
   * Genera lato server lo script SQL PIVOT per una route metadata e restituisce la query pronta da mostrare.
   * @param route Route metadata (`md_route_name`) da usare come sorgente.
   * @param rowColumns Colonne asse righe.
   * @param columnColumns Colonne asse colonne (pivot key).
   * @param valueColumn Colonna valore aggregata nella pivot.
   * @param aggregateFunction Funzione aggregazione (`SUM|AVG|MIN|MAX|COUNT`).
   * @returns Payload risposta backend con `ok`, `query` e metadati diagnostici.
   */
  async generatePivotQuery(
    route: string,
    rowColumns: string[],
    columnColumns: string[],
    valueColumns: string[] | string,
    aggregateFunction: string = 'SUM',
    valueDefinitions?: Array<{ alias: string; aggregateFunction?: string; caption?: string }>,
    filterInfo?: any,
    sortInfo?: any[],
    rowColumnOptions?: Array<{ alias: string; castDate?: boolean; groupBy?: string }>,
    columnColumnOptions?: Array<{ alias: string; castDate?: boolean; groupBy?: string }>,
    topRows: number = 300
  ): Promise<any> {
    const userId = this.userInfo.getuserInfo()?.user_id;
    const normalizedValueColumns = Array.isArray(valueColumns)
      ? valueColumns.filter(x => !!String(x || '').trim()).map(x => String(x).trim())
      : (String(valueColumns || '').trim() ? [String(valueColumns).trim()] : []);
    const fallbackValueColumn = normalizedValueColumns[0] || '';
    const parsedTopRows = Number(topRows);
    const normalizedTopRows = Number.isFinite(parsedTopRows)
      ? Math.max(0, Math.floor(parsedTopRows))
      : 300;

    const raw = await this.http.post(
      (WtoolboxService.appSettings?.global_root_url ?? "") + 'MetaService.generatePivotQuery',
      {
        user_id: String(userId ?? ''),
        route: String(route || ''),
        rowColumns: Array.isArray(rowColumns) ? rowColumns : [],
        columnColumns: Array.isArray(columnColumns) ? columnColumns : [],
        valueColumn: fallbackValueColumn,
        valueColumns: normalizedValueColumns,
        aggregateFunction: String(aggregateFunction || 'SUM'),
        valueDefinitions: Array.isArray(valueDefinitions) ? valueDefinitions : [],
        valueAggregates: Array.isArray(valueDefinitions) ? valueDefinitions : {}, // backward compatibility backend param
        rowColumnOptions: Array.isArray(rowColumnOptions) ? rowColumnOptions : [],
        columnColumnOptions: Array.isArray(columnColumnOptions) ? columnColumnOptions : [],
        filterInfo: filterInfo ?? null,
        sortInfo: Array.isArray(sortInfo) ? sortInfo : [],
        topRows: normalizedTopRows
      },
      { withCredentials: true }
    ).toPromise();
    return this.tryParseJsonPayload(raw);
  }

  /**
   * Esegue la query pivot e restituisce anteprima righe/colonne dinamiche.
   */
  async executePivotQuery(
    route: string,
    rowColumns: string[],
    columnColumns: string[],
    valueColumns: string[] | string,
    aggregateFunction: string = 'SUM',
    valueDefinitions?: Array<{ alias: string; aggregateFunction?: string; caption?: string }>,
    filterInfo?: any,
    sortInfo?: any[],
    maxRows: number = 200,
    rowColumnOptions?: Array<{ alias: string; castDate?: boolean; groupBy?: string }>,
    columnColumnOptions?: Array<{ alias: string; castDate?: boolean; groupBy?: string }>
  ): Promise<any> {
    const userId = this.userInfo.getuserInfo()?.user_id;
    const normalizedValueColumns = Array.isArray(valueColumns)
      ? valueColumns.filter(x => !!String(x || '').trim()).map(x => String(x).trim())
      : (String(valueColumns || '').trim() ? [String(valueColumns).trim()] : []);
    const fallbackValueColumn = normalizedValueColumns[0] || '';
    const parsedMaxRows = Number(maxRows);
    const normalizedMaxRows = Number.isFinite(parsedMaxRows)
      ? Math.max(0, Math.min(1000, Math.floor(parsedMaxRows)))
      : 200;

    const raw = await this.http.post(
      (WtoolboxService.appSettings?.global_root_url ?? "") + 'MetaService.executePivotQuery',
      {
        user_id: String(userId ?? ''),
        route: String(route || ''),
        rowColumns: Array.isArray(rowColumns) ? rowColumns : [],
        columnColumns: Array.isArray(columnColumns) ? columnColumns : [],
        valueColumn: fallbackValueColumn,
        valueColumns: normalizedValueColumns,
        aggregateFunction: String(aggregateFunction || 'SUM'),
        valueDefinitions: Array.isArray(valueDefinitions) ? valueDefinitions : [],
        valueAggregates: Array.isArray(valueDefinitions) ? valueDefinitions : {}, // backward compatibility backend param
        rowColumnOptions: Array.isArray(rowColumnOptions) ? rowColumnOptions : [],
        columnColumnOptions: Array.isArray(columnColumnOptions) ? columnColumnOptions : [],
        filterInfo: filterInfo ?? null,
        sortInfo: Array.isArray(sortInfo) ? sortInfo : [],
        maxRows: normalizedMaxRows,
        topRows: normalizedMaxRows
      },
      { withCredentials: true }
    ).toPromise();
    return this.tryParseJsonPayload(raw);
  }

  /**
   * Creates a DB VIEW from a multi-table view definition built by the
   * View Builder canvas. Scaffolds the view as a new route so the
   * existing pivot builder can operate on it.
   */
  async createViewFromDefinition(
    viewDefinition: any,
    viewName?: string,
    targetSchema?: string,
    createMenu?: boolean,
    parentMenuId?: number,
    overwriteIfExists?: boolean,
    scaffold?: boolean,
    manualSql?: string
  ): Promise<any> {
    const userId = this.userInfo.getuserInfo()?.user_id;
    const raw = await this.http.post(
      (WtoolboxService.appSettings?.global_root_url ?? "") + 'MetaService.createViewFromDefinition',
      {
        user_id: String(userId ?? ''),
        viewDefinitionJson: JSON.stringify(viewDefinition),
        view_name: viewName || '',
        target_schema: targetSchema || 'dbo',
        createMenu: !!createMenu,
        parentMenuId: parentMenuId || 0,
        overwrite_if_exists: !!overwriteIfExists,
        scaffold: scaffold !== false,
        manual_sql: manualSql || '',
      },
      { withCredentials: true }
    ).toPromise();
    return this.tryParseJsonPayload(raw);
  }

  /**
   * Executes a SELECT query from a ViewDefinition without creating a DB view.
   * Returns { ok, sql, columns, rows }.
   */
  async previewViewDefinition(
    viewDefinition: any,
    maxRows: number = 0,
    generateOnly: boolean = false,
    filterInfo: any = null,
    manualSql?: string
  ): Promise<any> {
    const userId = this.userInfo.getuserInfo()?.user_id;
    // maxRows=0 e' il sentinel "Illimitato": non lo rimpiazzare via `||` (che
    // sarebbe falsy-coalesce). Usa Number() + clamp non-negativo. Il server
    // (`MetaService.previewViewDefinition`) salta TOP/LIMIT quando arriva 0.
    const numRows = Number(maxRows);
    const safeMaxRows = Number.isFinite(numRows) && numRows > 0 ? Math.trunc(numRows) : 0;
    const raw = await this.http.post(
      (WtoolboxService.appSettings?.global_root_url ?? "") + 'MetaService.previewViewDefinition',
      {
        user_id: String(userId ?? ''),
        viewDefinitionJson: JSON.stringify(viewDefinition),
        maxRows: safeMaxRows,
        generateOnly: !!generateOnly,
        filterInfoJson: filterInfo ? JSON.stringify(filterInfo) : '',
        manual_sql: manualSql || '',
      },
      { withCredentials: true }
    ).toPromise();
    return this.tryParseJsonPayload(raw);
  }

  async createPivotView(
    route: string,
    rowColumns: string[],
    columnColumns: string[],
    valueColumns: string[] | string,
    aggregateFunction: string = 'SUM',
    valueDefinitions?: Array<{ alias: string; aggregateFunction?: string; caption?: string }>,
    filterInfo?: any,
    sortInfo?: any[],
    rowColumnOptions?: Array<{ alias: string; castDate?: boolean; groupBy?: string }>,
    columnColumnOptions?: Array<{ alias: string; castDate?: boolean; groupBy?: string }>,
    targetSchema: string = 'dbo',
    createMenu: boolean = false,
    viewName?: string | null,
    enableDynamicScheduler: boolean = false,
    schedulerFrequency: string = '',
    topRows: number = 300,
    overwriteIfExists: boolean = false
  ): Promise<any> {
    const userId = this.userInfo.getuserInfo()?.user_id;
    const normalizedValueColumns = Array.isArray(valueColumns)
      ? valueColumns.filter(x => !!String(x || '').trim()).map(x => String(x).trim())
      : (String(valueColumns || '').trim() ? [String(valueColumns).trim()] : []);
    const fallbackValueColumn = normalizedValueColumns[0] || '';
    const parsedTopRows = Number(topRows);
    const normalizedTopRows = Number.isFinite(parsedTopRows)
      ? Math.max(0, Math.floor(parsedTopRows))
      : 300;

    const raw = await this.http.post(
      (WtoolboxService.appSettings?.global_root_url ?? "") + 'MetaService.createPivotView',
      {
        user_id: String(userId ?? ''),
        route: String(route || ''),
        rowColumns: Array.isArray(rowColumns) ? rowColumns : [],
        columnColumns: Array.isArray(columnColumns) ? columnColumns : [],
        valueColumn: fallbackValueColumn,
        valueColumns: normalizedValueColumns,
        aggregateFunction: String(aggregateFunction || 'SUM'),
        valueAggregates: Array.isArray(valueDefinitions) ? valueDefinitions : [],
        rowColumnOptions: Array.isArray(rowColumnOptions) ? rowColumnOptions : [],
        columnColumnOptions: Array.isArray(columnColumnOptions) ? columnColumnOptions : [],
        filterInfo: filterInfo ?? null,
        sortInfo: Array.isArray(sortInfo) ? sortInfo : [],
        target_schema: String(targetSchema || 'dbo'),
        createMenu: !!createMenu,
        view_name: String(viewName || ''),
        enable_dynamic_scheduler: !!enableDynamicScheduler,
        scheduler_frequency: String(schedulerFrequency || ''),
        enableDynamicScheduler: !!enableDynamicScheduler,
        schedulerFrequency: String(schedulerFrequency || ''),
        topRows: normalizedTopRows,
        overwrite_if_exists: !!overwriteIfExists,
        overwriteIfExists: !!overwriteIfExists
      },
      { withCredentials: true }
    ).toPromise();
    return this.tryParseJsonPayload(raw);
  }

  async createPivotMaterializedTable(
    route: string,
    rowColumns: string[],
    columnColumns: string[],
    valueColumns: string[] | string,
    aggregateFunction: string = 'SUM',
    valueDefinitions?: Array<{ alias: string; aggregateFunction?: string; caption?: string }>,
    filterInfo?: any,
    sortInfo?: any[],
    rowColumnOptions?: Array<{ alias: string; castDate?: boolean; groupBy?: string }>,
    columnColumnOptions?: Array<{ alias: string; castDate?: boolean; groupBy?: string }>,
    targetSchema: string = 'dbo',
    createMenu: boolean = false,
    tableName?: string | null,
    enableDynamicScheduler: boolean = false,
    schedulerFrequency: string = '',
    topRows: number = 300,
    overwriteIfExists: boolean = false
  ): Promise<any> {
    const userId = this.userInfo.getuserInfo()?.user_id;
    const normalizedValueColumns = Array.isArray(valueColumns)
      ? valueColumns.filter(x => !!String(x || '').trim()).map(x => String(x).trim())
      : (String(valueColumns || '').trim() ? [String(valueColumns).trim()] : []);
    const fallbackValueColumn = normalizedValueColumns[0] || '';
    const parsedTopRows = Number(topRows);
    const normalizedTopRows = Number.isFinite(parsedTopRows)
      ? Math.max(0, Math.floor(parsedTopRows))
      : 300;

    const raw = await this.http.post(
      (WtoolboxService.appSettings?.global_root_url ?? "") + 'MetaService.createPivotMaterializedTable',
      {
        user_id: String(userId ?? ''),
        route: String(route || ''),
        rowColumns: Array.isArray(rowColumns) ? rowColumns : [],
        columnColumns: Array.isArray(columnColumns) ? columnColumns : [],
        valueColumn: fallbackValueColumn,
        valueColumns: normalizedValueColumns,
        aggregateFunction: String(aggregateFunction || 'SUM'),
        valueAggregates: Array.isArray(valueDefinitions) ? valueDefinitions : [],
        rowColumnOptions: Array.isArray(rowColumnOptions) ? rowColumnOptions : [],
        columnColumnOptions: Array.isArray(columnColumnOptions) ? columnColumnOptions : [],
        filterInfo: filterInfo ?? null,
        sortInfo: Array.isArray(sortInfo) ? sortInfo : [],
        target_schema: String(targetSchema || 'dbo'),
        createMenu: !!createMenu,
        table_name: String(tableName || ''),
        enable_dynamic_scheduler: !!enableDynamicScheduler,
        scheduler_frequency: String(schedulerFrequency || ''),
        enableDynamicScheduler: !!enableDynamicScheduler,
        schedulerFrequency: String(schedulerFrequency || ''),
        topRows: normalizedTopRows,
        overwrite_if_exists: !!overwriteIfExists,
        overwriteIfExists: !!overwriteIfExists
      },
      { withCredentials: true }
    ).toPromise();
    return this.tryParseJsonPayload(raw);
  }

  async forceSchedulerExecutionNow(
    schedulerId: number,
    routeName?: string | null
  ): Promise<any> {
    const userId = this.userInfo.getuserInfo()?.user_id;
    const raw = await this.http.post(
      (WtoolboxService.appSettings?.global_root_url ?? "") + 'MetaService.forceSchedulerExecutionNow',
      {
        user_id: String(userId ?? ''),
        scheduler_id: Number.isFinite(Number(schedulerId)) ? Number(schedulerId) : 0,
        route_name: String(routeName || '')
      },
      { withCredentials: true }
    ).toPromise();
    return this.tryParseJsonPayload(raw);
  }

  /**
   * Salva la configurazione pivot persistita in `_metadati__pivot`.
   * @param route Route metadata selezionata.
   * @param mdId Id metadata tabella.
   * @param configuration Oggetto configurazione (assi/valore/aggregazione).
   * @param sqlText SQL pivot generato.
   * @returns Payload backend normalizzato.
   */
  async savePivotConfiguration(route: string, mdId: number | null, configuration: any, sqlText: string, pivotName: string): Promise<any> {
    const userId = this.userInfo.getuserInfo()?.user_id;
    const raw = await this.http.post(
      (WtoolboxService.appSettings?.global_root_url ?? "") + 'MetaService.savePivotConfiguration',
      {
        user_id: String(userId ?? ''),
        route: String(route || ''),
        md_id: Number.isFinite(Number(mdId)) && Number(mdId) > 0 ? Number(mdId) : null,
        pivot_config_json: JSON.stringify(configuration ?? {}),
        sql_text: String(sqlText || ''),
        pivot_name: String(pivotName || '')
      },
      { withCredentials: true }
    ).toPromise();
    return this.tryParseJsonPayload(raw);
  }

  /**
   * Carica la configurazione pivot persistita per route/md_id.
   * @param route Route metadata selezionata.
   * @param mdId Id metadata tabella.
   * @returns Payload backend normalizzato.
   */
  async loadPivotConfiguration(route: string, mdId: number | null, pivotName?: string | null): Promise<any> {
    const userId = this.userInfo.getuserInfo()?.user_id;
    const raw = await this.http.post(
      (WtoolboxService.appSettings?.global_root_url ?? "") + 'MetaService.loadPivotConfiguration',
      {
        user_id: String(userId ?? ''),
        route: String(route || ''),
        md_id: Number.isFinite(Number(mdId)) && Number(mdId) > 0 ? Number(mdId) : null,
        pivot_name: String(pivotName || '')
      },
      { withCredentials: true }
    ).toPromise();
    return this.tryParseJsonPayload(raw);
  }

  /**
   * Droppa una view scaffoldata dal DB dati e rimuove i metadati associati
   * (tabella + colonne + stili/autorizzazioni/azioni) dal DB metadata.
   * Richiede admin. Idempotente: se view o metadati non esistono ritorna
   * comunque `ok=true` con flag `dropped_view` / `removed_metadata` = false.
   * @param viewRoute Route name della view scaffoldata (es. 'testw').
   */
  async dropScaffoldedView(viewRoute: string): Promise<any> {
    const userId = this.userInfo.getuserInfo()?.user_id;
    const raw = await this.http.post(
      (WtoolboxService.appSettings?.global_root_url ?? "") + 'MetaService.dropScaffoldedView',
      {
        user_id: String(userId ?? ''),
        view_route: String(viewRoute || '')
      },
      { withCredentials: true }
    ).toPromise();
    return this.tryParseJsonPayload(raw);
  }

  /**
   * Cancella la configurazione pivot salvata identificata da `pivotName`.
   * Richiede admin lato backend. Idempotente: se il record non esiste
   * ritorna `{ ok: true, deleted: 0 }`.
   * @param pivotName Nome del pivot da cancellare (come salvato in _metadati__pivot).
   * @returns Payload backend `{ ok, deleted, pivot_name }`.
   */
  async deletePivotConfiguration(pivotName: string): Promise<any> {
    const userId = this.userInfo.getuserInfo()?.user_id;
    const raw = await this.http.post(
      (WtoolboxService.appSettings?.global_root_url ?? "") + 'MetaService.deletePivotConfiguration',
      {
        user_id: String(userId ?? ''),
        pivot_name: String(pivotName || '')
      },
      { withCredentials: true }
    ).toPromise();
    return this.tryParseJsonPayload(raw);
  }

  /**
   * Elenca le configurazioni pivot salvate, opzionalmente filtrate per route metadata.
   * @param route Route metadata opzionale.
   * @returns Payload backend normalizzato.
   */
  async listPivotConfigurations(route?: string | null): Promise<any> {
    const userId = this.userInfo.getuserInfo()?.user_id;
    const raw = await this.http.post(
      (WtoolboxService.appSettings?.global_root_url ?? "") + 'MetaService.listPivotConfigurations',
      {
        user_id: String(userId ?? ''),
        route: String(route || '')
      },
      { withCredentials: true }
    ).toPromise();
    return this.tryParseJsonPayload(raw);
  }

  async getViewBuilderForeignKeys(): Promise<{ source: string; target: string }[]> {
    const userId = this.userInfo.getuserInfo()?.user_id;
    const raw = await this.http.post(
      (WtoolboxService.appSettings?.global_root_url ?? "") + 'MetaService.getViewBuilderForeignKeys',
      { user_id: String(userId ?? '') },
      { withCredentials: true }
    ).toPromise();
    const data = this.tryParseJsonPayload(raw);
    return Array.isArray(data?.foreignKeys) ? data.foreignKeys : [];
  }

  private tryParseJsonPayload(raw: any): any {
    if (typeof raw !== 'string') {
      return raw;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  /**
   * Esegue il bootstrap dei custom settings in localStorage subito dopo login/session bootstrap.
   * Recupera tutti i settings dell'utente e li salva in `wuic_custom_settings_{userId}` senza interrompere il flusso in caso di errore endpoint.
   * @param userId Identificativo utente; se omesso usa l'utente corrente.
   */
  async bootstrapCustomSettingsToLocalStorage(userId?: number | string): Promise<void> {
    const resolved = userId ?? this.userInfo.getuserInfo()?.user_id;
    if (resolved === null || resolved === undefined || resolved === '') {
      return;
    }

    try {
      const allSettings = await this.readCustomSettings(resolved, '');
      if (allSettings && typeof allSettings === 'object') {
        localStorage.setItem(this.getCustomSettingsStorageKey(resolved), JSON.stringify(allSettings));
      }
    } catch {
      // Keep login flow resilient when custom settings endpoint is unavailable.
    }
  }

  /**
   * Pulisce lo stato runtime e le cache associate.
   * Legge/scrive dati persistenti su storage browser.
   * @param userId Identificativo utente usato per contesto e persistenza.
   */
  clearCustomSettingsLocalStorage(userId?: number | string): void {
    const resolved = userId ?? this.userInfo.getuserInfo()?.user_id;
    if (resolved !== null && resolved !== undefined && resolved !== '') {
      localStorage.removeItem(this.getCustomSettingsStorageKey(resolved));
      return;
    }

    Object.keys(localStorage)
      .filter(k => k.startsWith('wuic_custom_settings_'))
      .forEach(k => localStorage.removeItem(k));
  }

  getCustomSettingFromLocalStorage<T = any>(key: string, userId?: number | string): T | null {
    const resolved = userId ?? this.userInfo.getuserInfo()?.user_id;
    if (resolved === null || resolved === undefined || resolved === '') {
      return null;
    }

    const raw = localStorage.getItem(this.getCustomSettingsStorageKey(resolved));
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      const root = typeof parsed === 'string'
        ? (() => {
          try {
            return JSON.parse(parsed);
          } catch {
            return null;
          }
        })()
        : parsed;

      if (!root) {
        return null;
      }

      const value = root?.[key];
      if (typeof value === 'string') {
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as T;
        }
      }

      return value ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Aggiorna/inserisce un singolo setting nell'oggetto settings locale dell'utente e lo riscrive in localStorage.
   * In caso di JSON corrotto riparte da oggetto vuoto per mantenere il salvataggio resiliente.
   * @param key Chiave logica della configurazione o del setting.
   * @param value Nuovo valore da salvare.
   * @param userId Identificativo utente; se omesso usa l'utente corrente.
   */
  setCustomSettingInLocalStorage(key: string, value: any, userId?: number | string): void {
    const resolved = userId ?? this.userInfo.getuserInfo()?.user_id;
    if (resolved === null || resolved === undefined || resolved === '') {
      return;
    }

    const storageKey = this.getCustomSettingsStorageKey(resolved);
    let current: any = {};

    try {
      current = JSON.parse(localStorage.getItem(storageKey) || '{}') || {};
    } catch {
      current = {};
    }

    current[key] = value;
    localStorage.setItem(storageKey, JSON.stringify(current));
  }

  /**
   * Recupera la lista report per route.
   * - Prima legge dalla cache locale popolata da `getTableMetadata` (via `setReportListCache`).
   * - Se la cache e' vuota/non popolata (refresh pagina prima che `getMetas` abbia girato,
   *   oppure cache invalidata da `invalidateReportListCache`), fallback su chiamata backend
   *   dedicata `MetaService.getReportListByRoute` e ripopola la cache. 2026-04-24: risolve
   *   il bug "list si svuota dopo refresh" dove `loadReportList` in ngOnInit del list-grid
   *   girava prima che `getMetas` avesse popolato il cache, e UI mostrava "Nessun report trovato".
   * - Dedup: chiamate concorrenti sulla stessa route riusano la stessa promise in-flight.
   * @param route Route applicativa di cui leggere i report associati.
   * @returns Elenco report `{ path, name }`.
   */
  async getReportList(route: string): Promise<{ path: string; name: string }[]> {
    const routeKey = String(route || '').trim().toLowerCase();
    if (!routeKey) {
      return [];
    }

    const cached = MetadataProviderService.reportListCacheByRoute.get(routeKey);
    if (cached !== undefined) {
      return cached;
    }

    // Cache miss: coalesce concurrent callers on the same route into one in-flight fetch.
    const inFlight = MetadataProviderService.reportListInFlightByRoute.get(routeKey);
    if (inFlight) {
      return inFlight;
    }

    const fetchPromise = (async () => {
      try {
        const url = (WtoolboxService.appSettings?.global_root_url ?? '') + 'MetaService.getReportListByRoute';
        const result = await (this.http.post<{ path: string; name: string }[]>(
          url,
          { route },
          { withCredentials: true }
        ).toPromise());
        const normalized = Array.isArray(result) ? result : [];
        this.setReportListCache(routeKey, normalized);
        return normalized;
      } catch {
        // Backend fail: non cachare il failure per permettere retry al prossimo call.
        return [];
      } finally {
        MetadataProviderService.reportListInFlightByRoute.delete(routeKey);
      }
    })();

    MetadataProviderService.reportListInFlightByRoute.set(routeKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Recupera `ProjectMetadataVersion` dal backend solo quando la cache versione e scaduta;
   * usa `MetaService.getAppSettings` e salva timestamp+versione in localStorage per ridurre chiamate ripetute.
   * @param offsetMs Offset fuso client in millisecondi da riportare al backend.
   * @returns Versione metadata progetto corrente oppure `null` se cache ancora valida/errore.
   */
  private async getProjectMetadataVersionIfExpired(offsetMs: number): Promise<number | null> {
    const effectiveOffsetMs = Math.max(Number(offsetMs) || 0, MetadataProviderService.minMetadataVersionIntervalMs);
    const nowMs = Date.now();
    const lastFromStorageRaw = localStorage.getItem("lastprojectmetaversionretrieve");
    const lastFromStorage = Number(lastFromStorageRaw);
    const lastCheckAt = Number.isFinite(lastFromStorage) && lastFromStorage > 0
      ? lastFromStorage
      : MetadataProviderService.lastMetadataVersionCheckAtMs;

    if (effectiveOffsetMs > 0 && lastCheckAt > 0 && nowMs <= (lastCheckAt + effectiveOffsetMs)) {
      return null;
    }

    if (!MetadataProviderService.metadataVersionInFlight) {
      MetadataProviderService.metadataVersionInFlight = (this.http.post(
        this.getMetadataVersionUri,
        {}
      ).toPromise() as Promise<number>).then((version) => {
        const checkedAt = Date.now();
        MetadataProviderService.lastMetadataVersionCheckAtMs = checkedAt;
        localStorage.setItem("lastprojectmetaversionretrieve", String(checkedAt));
        return Number(version || 0);
      }).finally(() => {
        MetadataProviderService.metadataVersionInFlight = undefined;
      });
    }

    return await MetadataProviderService.metadataVersionInFlight;
  }

  async getReportVariables(route: string, reportName: string): Promise<Array<{ name: string; alias: string; value: string; type: string }>> {
    const url = WtoolboxService.appSettings.api_url + 'ReportViewer/GetReportVariables';
    const results = await (this.http.post<Array<{ name: string; alias: string; value: string; type: string }>>(
      url,
      { route, reportName },
      { withCredentials: true }
    ).toPromise());
    return results || [];
  }

  /**
   * Elimina un report (file `.mrt`) e relativo cleanup metadata via `MetaService.removeReport`.
   * Solo gli utenti admin possono effettivamente cancellare; il backend ritorna `false` per non-admin.
   * Dopo successo invalida la cache report-list locale per la route, cosi' il prossimo
   * `getReportList` ricarica dal backend.
   * @param route Route applicativa che ospita il report.
   * @param name  Nome file `.mrt` da rimuovere.
   * @returns `true` se la cancellazione e' andata a buon fine.
   */
  async removeReport(route: string, name: string): Promise<boolean> {
    const url = (WtoolboxService.appSettings?.global_root_url ?? '') + 'MetaService.removeReport';
    const ok = await (this.http.post<boolean>(
      url,
      { route, name },
      { withCredentials: true }
    ).toPromise());
    if (ok) {
      this.invalidateReportListCache(route);
    }
    return !!ok;
  }
}
