import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { MetadataProviderService } from './metadata-provider.service';
import { ResultInfo } from '../class/resultInfo';
import { MetadatiColonna } from '../class/metadati_colonna';
import { DataSourceComponent } from '../component/data-source/data-source.component';
import { ComboParams } from '../class/comboParams';
import { UserInfo } from '../class/userInfo';
import { DataProviderOdataService } from './data-provider-odata.service';
import { DataProviderMetaService } from './data-provider-meta.service';
import { DataProviderWebserviceService } from './data-provider-webservice.service';
import { UserInfoService } from './user-info.service';
import { FilterInfo } from '../class/filterInfo';
import { SortInfo } from '../class/sortInfo';
import { FilterItem } from '../class/filterItem';
import { UpdateInfo } from '../class/updateInfo';
import { ClientSideCrudService } from './client-side-crud.service';

@Injectable({
  providedIn: 'root'
})
export class DataProviderService {

  private readonly defaultClientCrudBatchSize = 10000;
  private readonly defaultClientCrudMaxPages = 2000;
  private readonly clientCrudLookupKeyPrefix = '__wuic_client_side_crud_lookup_routes__';

  constructor(private http: HttpClient, private metaSrv: MetadataProviderService, private odataSrv: DataProviderOdataService, private dataMetaSrv: DataProviderMetaService, private webDataSrv: DataProviderWebserviceService, private userInfo: UserInfoService, private clientCrudSrv: ClientSideCrudService) { }

  private getClientSideCrudConfig(scope: DataSourceComponent): { enabled: boolean; batchSize: number; maxPages: number; includeLookupRoutes: boolean } {
    const raw = scope?.metaInfo?.tableMetadata?.extraProps?.client_side_crud as any;
    if (!raw) {
      return {
        enabled: false,
        batchSize: this.defaultClientCrudBatchSize,
        maxPages: this.defaultClientCrudMaxPages,
        includeLookupRoutes: false
      };
    }

    if (raw === true) {
      return {
        enabled: true,
        batchSize: this.defaultClientCrudBatchSize,
        maxPages: this.defaultClientCrudMaxPages,
        includeLookupRoutes: false
      };
    }

    const parsedBatchSize = Number(raw?.batchSize);
    const parsedMaxPages = Number(raw?.maxPages);
    return {
      enabled: raw?.enabled !== false,
      batchSize: Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? Math.trunc(parsedBatchSize) : this.defaultClientCrudBatchSize,
      maxPages: Number.isFinite(parsedMaxPages) && parsedMaxPages > 0 ? Math.trunc(parsedMaxPages) : this.defaultClientCrudMaxPages,
      includeLookupRoutes: !!raw?.includeLookupRoutes
    };
  }

  /**
   * Costruisce la chiave localStorage che traccia le lookup route caricate in client-side CRUD per coppia utente+route.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @returns Chiave storage nel formato `__wuic_client_side_crud_lookup_routes__{userId}__{route}`.
   */
  private getLookupRouteStorageKey(scope: DataSourceComponent): string {
    const route = scope?.metaInfo?.tableMetadata?.md_route_name || '';
    const userId = this.userInfo.getuserInfo()?.user_id;
    return `${this.clientCrudLookupKeyPrefix}${userId}__${route}`;
  }

  /**
   * Salva i dati richiesti dal flusso runtime del servizio.
   * Legge/scrive dati persistenti su storage browser.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param routes Elenco route coinvolte nell'operazione.
   */
  private saveLookupRoutesForScope(scope: DataSourceComponent, routes: string[]): void {
    localStorage.setItem(this.getLookupRouteStorageKey(scope), JSON.stringify(routes || []));
  }

  /**
   * Legge da localStorage la lista lookup route memorizzata per la route corrente in modalita client-side CRUD.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @returns Elenco route lookup persistite (array vuoto se assenti/corrotte).
   */
  private getLookupRoutesForScope(scope: DataSourceComponent): string[] {
    const raw = localStorage.getItem(this.getLookupRouteStorageKey(scope));
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  /**
   * Pulisce lo stato runtime e le cache associate.
   * Legge/scrive dati persistenti su storage browser.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   */
  private clearLookupRoutesForScope(scope: DataSourceComponent): void {
    localStorage.removeItem(this.getLookupRouteStorageKey(scope));
  }

  /**
   * Estrae dalle colonne metadata le route lookup referenziate (`lookupByID` / `multiple_check`) escludendo la route corrente.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @returns Elenco route lookup univoche collegate al datasource.
   */
  private getLookupRoutes(scope: DataSourceComponent): string[] {
    const cols = scope?.metaInfo?.columnMetadata || [];
    const currentRoute = scope?.metaInfo?.tableMetadata?.md_route_name;
    const lookupRoutes = new Set<string>();

    cols.forEach((col: any) => {
      if (col?.mc_ui_column_type === 'lookupByID' && col?.mc_ui_lookup_entity_name) {
        const route = String(col.mc_ui_lookup_entity_name).trim();
        if (route) {
          lookupRoutes.add(route);
        }
      }

      if (col?.mc_ui_column_type === 'multiple_check' && col?.mc_ui_grid_route) {
        const route = String(col.mc_ui_grid_route).trim();
        if (route) {
          lookupRoutes.add(route);
        }
      }
    });

    return [...lookupRoutes].filter(r => !!r && r !== currentRoute);
  }

  /**
   * Scarica tutte le righe di una route in pagine consecutive usando `selectByRoute` fino a esaurimento dataset.
   * Interrompe il loop su pagina vuota, ultimo batch incompleto o raggiungimento `totalRowCount`.
   * @param route Route applicativa coinvolta nell'operazione.
   * @param batchSize Numero record per pagina.
   * @param maxPages Limite massimo pagine da leggere.
   * @returns Collezione aggregata di tutte le righe lette.
   */
  private async fetchAllRowsByRoute(route: string, batchSize: number, maxPages: number): Promise<any[]> {
    const allRows: any[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const pageData = await this.selectByRoute(route, [], [], batchSize, page);
      const pageRows = Array.isArray(pageData?.dato) ? pageData.dato : [];
      const total = Number(pageData?.totalRowCount || 0);

      if (!pageRows.length) {
        break;
      }

      allRows.push(...pageRows);

      if ((total > 0 && allRows.length >= total) || pageRows.length < batchSize) {
        break;
      }
    }

    return allRows;
  }

  /**
   * Valuta una condizione booleana sullo stato o sull'input corrente.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @returns Valore restituito dal metodo (boolean).
   */
  private isClientSideCrudActive(scope: DataSourceComponent): boolean {
    return !!scope?.clientSideCrudActive;
  }

  /**
   * Esegue l'operazione dati implementata da `selectByRoute`.
   * @param route Route applicativa coinvolta nell'operazione.
   * @param filters Elenco filtri da tradurre in `FilterInfo`.
   * @param sortInfo Ordinamenti applicati alla query.
   * @param pageSize Dimensione pagina della query.
   * @param currentPage Indice pagina corrente.
   * @returns Valore restituito dal metodo (Promise<ResultInfo>).
   */
  async selectByRoute(route: string, filters?: FilterItem[], sortInfo?: SortInfo[], pageSize?: number, currentPage?: number): Promise<ResultInfo> {
    return await this.dataMetaSrv.selectByRoute(this.userInfo.getuserInfo().user_id, route, new FilterInfo('AND', filters), sortInfo, pageSize, currentPage);
  }

  /**
   * Esegue l'operazione dati implementata da `select`.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param all Flag che abilita caricamento completo dataset.
   * @param resultInfo Struttura risultato da popolare/aggiornare.
   * @param hideBusy Flag/handler per gestione busy indicator UI.
   * @param forceRemote Flag per forzare provider remoto bypassando cache client.
   * @returns Valore restituito dal metodo (Promise<ResultInfo>).
   */
  async select(scope: DataSourceComponent, all: boolean, resultInfo?: ResultInfo, hideBusy?: any, forceRemote: boolean = false): Promise<ResultInfo> {
    if (!forceRemote && this.isClientSideCrudActive(scope)) {
      return await this.clientCrudSrv.select(scope, this.userInfo.getuserInfo().user_id, all, resultInfo);
    }

    // Lookup combo endpoint override.
    //
    // Quando il datasource e' quello annidato dal lookup-editor
    // (`useComboEndpoint=true`), la colonna lookup del datasource PARENT puo'
    // dichiarare un endpoint OData custom via `mc_props_bag.lookup.endpoint`
    // (runtime: `field.extras.lookup.endpoint`). Cosi' un campo lookup —
    // tipicamente legato a una route metadata WUIC (`stateprovinces`) — puo'
    // in realta' tirare le options direttamente dall'endpoint OData generico
    // (`/odata/StateProvinces`) invece del solito `MetaService.getFlatRecordComboData`.
    // Utile quando l'app espone l'entita' in OData ma non vuole appoggiarsi
    // al combo pipeline metadata (es. Pattern 3 hardcoded datasource
    // completamente "pure OData").
    //
    // Il comboField e' passato dal template del lookup-editor via
    // `[comboField]="field"` -> `scope.comboField`.
    const comboEndpointOverride = scope?.useComboEndpoint
      ? (scope as any)?.comboField?.extras?.lookup?.endpoint
      : null;

    const effectiveEndpoint = comboEndpointOverride || scope?.metaInfo?.tableMetadata?.extraProps?.endpoint;
    const endpointType = String(effectiveEndpoint?.type || '').trim().toLowerCase();

    if (endpointType) {
      if (endpointType === 'odata') {
        if (scope?.useComboEndpoint) {
          return await this.odataSrv.selectCombo(scope, this.userInfo.getuserInfo().user_id, all, resultInfo, hideBusy, effectiveEndpoint);
        }
        return await this.odataSrv.select(scope, this.userInfo.getuserInfo().user_id, all, resultInfo, hideBusy);
      }

      return await this.webDataSrv.select(scope, this.userInfo.getuserInfo().user_id, all, resultInfo, hideBusy);
    }

    if (scope?.useComboEndpoint) {
      return await this.dataMetaSrv.selectCombo(scope, this.userInfo.getuserInfo().user_id, all, resultInfo, hideBusy);
    }

    return await this.dataMetaSrv.select(scope, this.userInfo.getuserInfo().user_id, all, resultInfo, hideBusy);
  }

  /**
   * Delega al provider metadata il caricamento dati combo (`MetaService.getFlatRecordComboData`) passando contesto utente corrente.
   * @param scope Configurazione combo/lookup (route, paging, sort, ...).
   * @param currentRecord Record corrente usato dalla logica/metadati.
   * @param field Metadato colonna/campo coinvolto nell'elaborazione.
   * @param filterString Testo filtro free-text per ricerca/suggest.
   */
  async getComboData(scope: ComboParams, currentRecord: any, field: MetadatiColonna, filterString: string) {
    return await this.dataMetaSrv.getComboData(scope, this.userInfo.getuserInfo().user_id, currentRecord, field, filterString);
  }

  /**
   * Esegue l'operazione dati implementata da `insert`.
   * @param entity Entita dati target della mutazione.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param forceRemote Flag per forzare provider remoto bypassando cache client.
   * @returns Valore restituito dal metodo (Promise<UpdateInfo>).
   */
  async insert(entity: any, scope: DataSourceComponent, forceRemote: boolean = false): Promise<UpdateInfo> {
    if (!forceRemote && this.isClientSideCrudActive(scope)) {
      return await this.clientCrudSrv.insert(entity, scope, this.userInfo.getuserInfo().user_id);
    }

    if (scope.metaInfo.tableMetadata.extraProps.endpoint) {
      if (scope.metaInfo.tableMetadata.extraProps.endpoint.type === 'odata') {
        return await this.odataSrv.insert(entity, scope, this.userInfo.getuserInfo().user_id);
      } else {
        return await this.webDataSrv.insert(entity, scope, this.userInfo.getuserInfo().user_id);
      }
    } else {
      return await this.dataMetaSrv.insert(entity, scope, this.userInfo.getuserInfo().user_id);
    }
  }

  /**
   * Esegue l'operazione dati implementata da `update`.
   * @param entity Entita dati target della mutazione.
   * @param pristine Copia originale dell'entita per diff/update.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param forceRemote Flag per forzare provider remoto bypassando cache client.
   * @returns Valore restituito dal metodo (Promise<UpdateInfo>).
   */
  async update(entity, pristine, scope: DataSourceComponent, forceRemote: boolean = false): Promise<UpdateInfo> {
    if (!forceRemote && this.isClientSideCrudActive(scope)) {
      return await this.clientCrudSrv.update(entity, scope, this.userInfo.getuserInfo().user_id);
    }

    if (scope.metaInfo.tableMetadata.extraProps.endpoint) {
      if (scope.metaInfo.tableMetadata.extraProps.endpoint.type === 'odata') {
        return await this.odataSrv.update(entity, pristine, scope, this.userInfo.getuserInfo().user_id);
      } else {
        return await this.webDataSrv.update(entity, pristine, scope, this.userInfo.getuserInfo().user_id);
      }
    } else {
      return await this.dataMetaSrv.update(entity, pristine, scope, this.userInfo.getuserInfo());
    }
  }

  /**
   * Rimuove i dati target aggiornando lo stato del servizio.
   * @param entity Entita dati target della mutazione.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param forceRemote Flag per forzare provider remoto bypassando cache client.
   * @returns Valore restituito dal metodo (Promise<UpdateInfo>).
   */
  async delete(entity, scope: DataSourceComponent, forceRemote: boolean = false): Promise<UpdateInfo> {
    if (!forceRemote && this.isClientSideCrudActive(scope)) {
      return await this.clientCrudSrv.delete(entity, scope, this.userInfo.getuserInfo().user_id);
    }

    if (scope.metaInfo.tableMetadata.extraProps.endpoint) {
      if (scope.metaInfo.tableMetadata.extraProps.endpoint.type === 'odata') {
        return await this.odataSrv.delete(entity, scope, this.userInfo.getuserInfo().user_id);
      } else {
        return await this.webDataSrv.delete(entity, scope, this.userInfo.getuserInfo().user_id);
      }
    } else {
      return await this.dataMetaSrv.delete(entity, scope, this.userInfo.getuserInfo().user_id);
    }
  }

  /**
   * Salva un batch di entita scegliendo dinamicamente il provider: client-side CRUD locale, provider endpoint-specific
   * (fallback a update singolo) oppure provider metadata standard.
   * @param entities Entita dati coinvolte nella mutazione batch.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param forceRemote Se `true` bypassa la modalita client-side.
   * @returns Risultati del batch (array esiti o payload backend).
   */
  async batchSave(entities: any[], scope: DataSourceComponent, forceRemote: boolean = false): Promise<any> {
    if (!Array.isArray(entities) || !entities.length || !scope) {
      return null;
    }

    if (!forceRemote && this.isClientSideCrudActive(scope)) {
      const results: any[] = [];
      for (const entity of entities) {
        if (!entity) {
          continue;
        }
        const pristine = Object.assign({}, entity?.__original || {});
        const payload = Object.assign({}, entity || {});
        delete payload.__original;
        results.push(await this.clientCrudSrv.update(payload, scope, this.userInfo.getuserInfo().user_id));
      }
      return results;
    }

    if (scope.metaInfo.tableMetadata.extraProps?.endpoint) {
      // Endpoint-specific providers currently expose only single-record mutations.
      // Use update fallback to preserve compatibility.
      const results: any[] = [];
      for (const entity of entities) {
        if (!entity) {
          continue;
        }
        const pristine = Object.assign({}, entity?.__original || {});
        const payload = Object.assign({}, entity || {});
        delete payload.__original;
        results.push(await this.update(payload, pristine, scope, true));
      }
      return results;
    }

    return await this.dataMetaSrv.batchSave(entities, scope, this.userInfo.getuserInfo().user_id);
  }

  /**
   * Esegue l'operazione dati implementata da `clone`.
   * @param entity Entita dati target della mutazione.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param relatedRouteToClone Route applicativa coinvolta nell'operazione.
   * @returns Valore restituito dal metodo (Promise<UpdateInfo>).
   */
  async clone(entity, scope: DataSourceComponent, relatedRouteToClone: any[]): Promise<UpdateInfo> {
    if (scope.metaInfo.tableMetadata.extraProps.endpoint) {
      if (scope.metaInfo.tableMetadata.extraProps.endpoint.type === 'odata') {
        return await this.odataSrv.clone(entity, scope, this.userInfo.getuserInfo().user_id, relatedRouteToClone);
      } else {
        return await this.webDataSrv.clone(entity, scope, this.userInfo.getuserInfo().user_id, relatedRouteToClone);
      }
    } else {
      return await this.dataMetaSrv.clone(entity, scope, this.userInfo.getuserInfo().user_id, relatedRouteToClone);
    }
  }

  /**
   * Abilita la modalita CRUD locale caricando tutte le righe della route (e opzionalmente delle lookup route collegate)
   * nel DB client-side, preservando e ripristinando lo stato paging/filter/sort originale del datasource.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   */
  async enableClientSideCrud(scope: DataSourceComponent): Promise<void> {
    const savedPageSize = scope.pageSize;
    const savedCurrentPage = scope.currentPage;
    const savedFilterInfo = scope.filterInfo;
    const savedSortInfo = scope.sortInfo;
    const cfg = this.getClientSideCrudConfig(scope);

    try {
      const allRows: any[] = [];

      scope.pageSize = cfg.batchSize;
      scope.currentPage = 1;
      scope.filterInfo = new FilterInfo('AND', []);
      scope.sortInfo = [];

      for (let i = 0; i < cfg.maxPages; i++) {
        const pageData = await this.select(scope, true, new ResultInfo(), undefined, true);
        const pageRows = Array.isArray(pageData?.dato) ? pageData.dato : [];
        const total = Number(pageData?.totalRowCount || 0);

        if (!pageRows.length) {
          break;
        }

        allRows.push(...pageRows);

        if ((total > 0 && allRows.length >= total) || pageRows.length < cfg.batchSize) {
          break;
        }

        scope.currentPage += 1;
      }

      await this.clientCrudSrv.enable(scope, this.userInfo.getuserInfo().user_id, allRows);

      if (cfg.includeLookupRoutes) {
        const lookupRoutes = this.getLookupRoutes(scope);
        this.saveLookupRoutesForScope(scope, lookupRoutes);

        for (const lookupRoute of lookupRoutes) {
          const lookupMetas = await this.metaSrv.getMetadati(lookupRoute as string);
          if (!lookupMetas?.length) {
            continue;
          }

          const lookupRows = await this.fetchAllRowsByRoute(lookupRoute, cfg.batchSize, cfg.maxPages);
          const lookupScope = {
            metaInfo: {
              tableMetadata: lookupMetas[0]._Metadati_Tabelle,
              columnMetadata: lookupMetas
            }
          } as DataSourceComponent;

          await this.clientCrudSrv.enable(lookupScope, this.userInfo.getuserInfo().user_id, lookupRows);
        }
      } else {
        this.clearLookupRoutesForScope(scope);
      }
    } finally {
      scope.pageSize = savedPageSize;
      scope.currentPage = savedCurrentPage;
      scope.filterInfo = savedFilterInfo;
      scope.sortInfo = savedSortInfo;
    }
  }

  /**
   * Verifica se la route corrente e gia in modalita client-side CRUD per l'utente attuale.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @returns `true` se la modalita locale e attiva per la route.
   */
  async restoreClientSideCrudState(scope: DataSourceComponent): Promise<boolean> {
    return await this.clientCrudSrv.isModeEnabled(scope, this.userInfo.getuserInfo().user_id);
  }

  async disableClientSideCrud(scope: DataSourceComponent): Promise<{ inserted: number; updated: number; deleted: number }> {
    const syncResult = await this.clientCrudSrv.disableAndSync(scope, this.userInfo.getuserInfo().user_id, {
      insert: async (entity: any) => await this.insert(entity, scope, true),
      update: async (entity: any) => {
        const payload = Object.assign({}, entity || {});
        const pristine = Object.assign({}, entity || {});
        delete payload.__original;
        delete pristine.__original;
        return await this.update(payload, pristine, scope, true);
      },
      delete: async (entity: any) => await this.delete(entity, scope, true)
    });

    const lookupRoutes = this.getLookupRoutesForScope(scope);
    for (const lookupRoute of lookupRoutes) {
      const lookupScope = {
        metaInfo: {
          tableMetadata: { md_route_name: lookupRoute }
        }
      } as DataSourceComponent;
      await this.clientCrudSrv.clearRoute(lookupScope, this.userInfo.getuserInfo().user_id);
    }
    this.clearLookupRoutesForScope(scope);

    return syncResult;
  }

  /**
   * Disabilita la modalita CRUD locale senza sincronizzare modifiche pendenti verso server.
   * Pulisce solo la route corrente e le eventuali lookup route tracciate.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   */
  async disableClientSideCrudWithoutSync(scope: DataSourceComponent): Promise<void> {
    await this.clientCrudSrv.clearRoute(scope, this.userInfo.getuserInfo().user_id);
    this.clearLookupRoutesForScope(scope);
  }

  /**
   * Esporta in XLS passando al backend anche tema/mode UI correnti.
   * Il metodo deduce tema da DOM/stylesheet/localStorage, normalizza i token e li persiste (`wuic-selected-theme`, `wuic-theme-mode`).
   * @param route Route applicativa coinvolta nell'operazione.
   * @param filterInfo Filtro applicato alla selezione dati.
   * @param progressGuid GUID progresso per tracciamento export/lavorazione.
   */
  async exportXls(route, filterInfo, progressGuid) {
    const normalizeThemeToken = (value: any): string => {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
    };

    const isValidThemeToken = (value: string): boolean => {
      return /^(aura|lara|nora|material)-[a-z0-9_-]+$/.test(value);
    };

    const normalizeThemeMode = (value: any): string => {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized === 'dark' || normalized === 'light') {
        return normalized;
      }
      return '';
    };

    const inferThemeFromStylesheetHref = (): string => {
      if (typeof document === 'undefined') {
        return '';
      }

      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
      for (const link of links) {
        const href = String(link?.href || '').toLowerCase();
        if (!href) {
          continue;
        }

        const match = href.match(/(aura|lara|nora|material)-([a-z0-9_-]+)/i);
        if (match) {
          const token = normalizeThemeToken(`${match[1]}-${match[2]}`);
          if (isValidThemeToken(token)) {
            return token;
          }
        }
      }

      return '';
    };

    const inferThemeModeFromStylesheetHref = (): string => {
      if (typeof document === 'undefined') {
        return '';
      }

      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
      for (const link of links) {
        const href = String(link?.href || '').toLowerCase();
        if (!href) {
          continue;
        }

        if (/\.(dark)\.css(\?|$)|-dark\.css(\?|$)|\bdark\b/.test(href)) {
          return 'dark';
        }
      }

      return '';
    };

    const inferThemeFromDom = (): string => {
      if (typeof document === 'undefined') {
        return '';
      }

      const root = document?.documentElement;
      const body = document?.body;
      const attrThemeRaw =
        root?.getAttribute('data-theme') ||
        root?.getAttribute('data-preset') ||
        root?.getAttribute('theme') ||
        body?.getAttribute('data-theme') ||
        body?.getAttribute('data-preset') ||
        body?.getAttribute('theme') ||
        '';
      const attrTheme = normalizeThemeToken(attrThemeRaw);
      if (isValidThemeToken(attrTheme)) {
        return attrTheme;
      }

      const classTokens = `${root?.className || ''} ${body?.className || ''}`
        .split(/\s+/)
        .filter(Boolean)
        .map(c => c.toLowerCase());
      const themeToken = classTokens.find(c => isValidThemeToken(c));
      if (themeToken) {
        return themeToken;
      }

      return inferThemeFromStylesheetHref();
    };

    const inferThemeModeFromDom = (): string => {
      if (typeof document === 'undefined') {
        return '';
      }

      const root = document?.documentElement;
      const body = document?.body;
      const rootDark = document?.documentElement?.classList?.contains('theme-dark');
      const bodyDark = document?.body?.classList?.contains('theme-dark');
      const classList = `${root?.className || ''} ${body?.className || ''}`.toLowerCase();
      const attrMode =
        normalizeThemeMode(root?.getAttribute('data-theme-mode')) ||
        normalizeThemeMode(root?.getAttribute('data-color-scheme')) ||
        normalizeThemeMode(body?.getAttribute('data-theme-mode')) ||
        normalizeThemeMode(body?.getAttribute('data-color-scheme'));

      if (attrMode) {
        return attrMode;
      }

      if (rootDark || bodyDark || classList.includes('dark-theme') || classList.includes('theme-dark') || classList.includes('dark')) {
        return 'dark';
      }

      const fromStylesheet = inferThemeModeFromStylesheetHref();
      if (fromStylesheet) {
        return fromStylesheet;
      }

      return 'light';
    };

    const selectedTheme =
      inferThemeFromDom()
      || normalizeThemeToken(localStorage.getItem('wuic-selected-theme'))
      || normalizeThemeToken(localStorage.getItem('selected-theme'))
      || 'aura-blue';
    const themeMode =
      inferThemeModeFromDom()
      || normalizeThemeMode(localStorage.getItem('wuic-theme-mode'))
      || normalizeThemeMode(localStorage.getItem('theme-mode'))
      || 'light';

    // Keep localStorage aligned with active UI theme even when the host app does not persist it.
    localStorage.setItem('wuic-selected-theme', selectedTheme);
    localStorage.setItem('wuic-theme-mode', themeMode);

    return await this.dataMetaSrv.exportXlsWithTheme(route, filterInfo, progressGuid, selectedTheme, themeMode);

  }

  /**
   * Salva i dati richiesti dal flusso runtime del servizio.
   * @param payload Payload richiesta/risposta usato nel metodo.
   * @returns Valore restituito dal metodo (Promise<any>).
   */
  async saveDashboard(payload: any): Promise<any> {
    return await this.dataMetaSrv.saveDashboard(payload);
  }

  /**
   * Carica i dati richiesti dal flusso runtime del servizio.
   * @param payload Payload richiesta/risposta usato nel metodo.
   * @returns Valore restituito dal metodo (Promise<any[]>).
   */
  loadDashboard(payload: any): Promise<any[]> {
    return this.dataMetaSrv.loadDashboard(payload);
  }

  /**
   * Rimuove i dati target aggiornando lo stato del servizio.
   * @param payload Payload richiesta/risposta usato nel metodo.
   * @returns Valore restituito dal metodo (Promise<any>).
   */
  async deleteDashboard(payload: any): Promise<any> {
    return await this.dataMetaSrv.deleteDashboard(payload);
  }

  /**
   * Salva i dati richiesti dal flusso runtime del servizio.
   * @param payload Payload richiesta/risposta usato nel metodo.
   * @returns Valore restituito dal metodo (Promise<any>).
   */
  async saveWorkflowGraph(payload: any): Promise<any> {
    return await this.dataMetaSrv.saveWorkflowGraph(payload);
  }

  /**
   * Carica i dati richiesti dal flusso runtime del servizio.
   * @param payload Payload richiesta/risposta usato nel metodo.
   * @returns Valore restituito dal metodo (Promise<any>).
   */
  async loadWorkflowGraph(payload: any): Promise<any> {
    return await this.dataMetaSrv.loadWorkflowGraph(payload);
  }

  /**
   * Recupera la lista dei workflow graph disponibili delegando al provider metadata (`MetaService.getWorkflowGraphs`).
   * @param payload Payload richiesta/risposta usato nel metodo.
   * @returns Lista graph/metadata restituita dal backend.
   */
  async getWorkflowGraphs(payload: any): Promise<any> {
    return await this.dataMetaSrv.getWorkflowGraphs(payload);
  }

  /**
   * Rinomina un workflow graph delegando al provider metadata.
   * @param payload Payload con identificativo grafo e nuovo nome.
   * @returns Esito backend del rename.
   */
  async renameWorkflowGraph(payload: any): Promise<any> {
    return await this.dataMetaSrv.renameWorkflowGraph(payload);
  }

  /**
   * Rimuove i dati target aggiornando lo stato del servizio.
   * @param payload Payload richiesta/risposta usato nel metodo.
   * @returns Valore restituito dal metodo (Promise<any>).
   */
  async deleteWorkflowGraph(payload: any): Promise<any> {
    return await this.dataMetaSrv.deleteWorkflowGraph(payload);
  }

  /**
   * Carica i dati richiesti dal flusso runtime del servizio.
   * @returns Valore restituito dal metodo (Promise<any[]>).
   */
  loadAllDashboards(): Promise<any[]> {
    return this.dataMetaSrv.loadDashboard({
      user_id: this.userInfo.getuserInfo().user_id,
      dashRoute: ''
    });
  }

  /**
   * Recupera dal backend classi CSS disponibili nei fogli indicati (`MetaService.getCssClassesFromSheets`).
   * @param sheetPaths Percorsi fogli CSS da elaborare.
   * @returns Elenco classi/style token individuati dal server.
   */
  getCssClassesFromSheets(sheetPaths: string[]): Promise<any[]> {
    return this.dataMetaSrv.getCssClassesFromSheets(sheetPaths);
  }

  /**
   * Persiste su file CSS le modifiche apportate in editor stili tramite provider metadata.
   * @param sheet Foglio CSS oggetto di lettura/scrittura.
   */
  async writeChangesToCssFile(sheet: any): Promise<void> {
    await this.dataMetaSrv.writeChangesToCssFile(sheet);
  }
}
