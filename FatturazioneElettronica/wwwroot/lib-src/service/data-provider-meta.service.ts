import { Injectable, inject } from '@angular/core';
import { DataSourceComponent } from '../component/data-source/data-source.component';
import { MetadataProviderService } from './metadata-provider.service';
import { ComboParams } from '../class/comboParams';
import { MetadatiColonna } from '../class/metadati_colonna';
import { rawPagedResult } from '../class/rawPagedResult';
import { ResultInfo } from '../class/resultInfo';
import { HttpClient } from '@angular/common/http';
import { UserInfo } from '../class/userInfo';
import { FilterInfo } from '../class/filterInfo';
import { SortInfo } from '../class/sortInfo';
import { WtoolboxService } from './wtoolbox.service';
import { UserInfoService } from './user-info.service';

@Injectable({
  providedIn: 'root'
})
export class DataProviderMetaService {

  public http: HttpClient;
  private userInfoService = inject(UserInfoService);

  /**
   * Inizializza il provider dati metadata con l'istanza `HttpClient` usata da tutti gli endpoint `MetaService.*`.
   */
  constructor(private _http: HttpClient) {
    this.http = _http;
  }

  /**
   * Risolve i placeholder di tipo `{{path.to.value}}` su un oggetto sorgente.
   * Supporta path annidati con dot-notation. Esempi:
   *   - `{{currentUser.lingua.id}}` -> `userInfo.lingua.id`
   *   - `{{currentUser.user_id}}` -> `userInfo.user_id`
   * Se il valore non e una stringa o non contiene placeholder, viene
   * ritornato invariato. Se la risoluzione fallisce, il placeholder viene
   * lasciato vuoto (stringa vuota) per evitare di propagare il template
   * letterale al backend.
   *
   * Usato per interpolare i `parameters[].value` di una SP route prima di
   * inviarli a `MetaService.getFlatDataFromStored`.
   */
  private interpolateUserPlaceholders(value: any): any {
    if (typeof value !== 'string') return value;
    if (value.indexOf('{{') < 0) return value;

    const userInfo: any = this.userInfoService.getuserInfo() || {};
    const sources: { [prefix: string]: any } = {
      currentUser: userInfo,
      user: userInfo
    };

    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expr) => {
      const path = String(expr || '').trim().split('.');
      const head = path.shift();
      const root = head ? sources[head] : null;
      if (!root) return '';
      let cur: any = root;
      for (const seg of path) {
        if (cur == null) return '';
        cur = cur[seg];
      }
      return cur == null ? '' : String(cur);
    });
  }

  /**
   * Costruisce la lista `filterElement[]` per un fetch SP-route a partire
   * dai `parameterInfo` (derivati da `md_props_bag.parameters`) gia
   * popolati in `tableMetadata.parameterInfo` da `MetadataProviderService.prepareMetadatas`.
   *
   * Per ogni parameter declarato:
   *   1. legge il `value` dal raw `md_props_bag.parameters[i].value` (gli
   *      `extraProps.parameters` raw sono accessibili via
   *      `tableMetadata.extraProps.parameters`),
   *   2. interpola i placeholder `{{currentUser.*}}`,
   *   3. emette un `filterElement` con `field=Name`, `value=interpolated`,
   *      `Type`, `isOut`.
   *
   * Il backend `GetFlatDataFromStored` matcha il `field` (case-insensitive,
   * con/senza `@` prefix) col parameter Name in `mdpropsbag.parameters` e
   * lo bind via Dapper DynamicParameters.
   */
  private buildStoredParametersPayload(scope: DataSourceComponent): any[] {
    const tbl: any = scope?.metaInfo?.tableMetadata;
    const rawParams = (tbl?.extraProps as any)?.parameters;
    if (!Array.isArray(rawParams) || rawParams.length === 0) return [];

    const out: any[] = [];
    for (const p of rawParams) {
      if (!p || typeof p !== 'object') continue;
      const name = String(p.Name || p.name || '').trim();
      if (!name) continue;
      out.push({
        field: name,
        operatore: 'eq',
        value: this.interpolateUserPlaceholders(p.value),
        isOut: !!p.isOut,
        Type: p.Type || p.type || 'text'
      });
    }
    return out;
  }

  /**
   * Pulisce la cache localStorage preservando le traduzioni gia caricate.
   * Evita regressioni UX dove, dopo save metadata non-translation, le label tornano alle chiavi raw.
   */
  private clearLocalStoragePreservingTranslation(): void {
    const translationSnapshot = localStorage.getItem('translation');
    localStorage.clear();
    if (translationSnapshot !== null && translationSnapshot !== undefined) {
      localStorage.setItem('translation', translationSnapshot);
    }
  }

  private buildRouteContext(route: string, action: string, source: string): any {
    return WtoolboxService.buildCrudRouteContext(route, action, source);
  }

  /**
   * Builds a columnRestrictionList for slim combo fetching.
   *
   * Slim is **enabled by default** (returns PK + valueField + textField + extraFields).
   * Returns [] (no restriction → all columns) when slim must be disabled:
   *   - `mc_ui_lookup_combo_text_edit_computed_dataTextField` is set
   *     (the computed display formula may reference any column on the lookup row,
   *     so we can't safely strip them);
   *   - `mc_props_bag.slimCombo` is explicitly `false` (opt-out).
   *
   * `mc_props_bag.slimCombo` can also be an array of extra field names to include
   * in the slim selection (e.g. `["status", "color"]` for templates that show
   * additional columns alongside the text field).
   */
  static buildSlimComboRestriction(field: MetadatiColonna | null | undefined): string[] {
    if (!field) return [];

    const slimCombo = (field.extras as any)?.slimCombo;

    // Explicit opt-out via mc_props_bag.slimCombo = false
    if (slimCombo === false) return [];

    // Computed display formula may reference arbitrary columns → can't strip
    const computedTextField = String(field.mc_ui_lookup_combo_text_edit_computed_dataTextField || '').trim();
    if (computedTextField) return [];

    const columns = new Set<string>();

    // Value field (the ID/FK column)
    const valueField = String(field.mc_ui_lookup_dataValueField || '').trim();
    if (valueField) columns.add(valueField);

    // Text field (the display column)
    const textField = String(field.mc_ui_lookup_dataTextField || '').trim();
    if (textField) columns.add(textField);

    // Extra fields requested by the combo (comma-separated)
    const extra = String(field.extraFields || '').trim();
    if (extra) {
      for (const f of extra.split(',')) {
        const name = f.trim();
        if (name) columns.add(name);
      }
    }

    // slimCombo can be an array of additional field names to include in the slim selection
    if (Array.isArray(slimCombo)) {
      for (const f of slimCombo) {
        const name = String(f || '').trim();
        if (name) columns.add(name);
      }
    }

    return columns.size > 0 ? Array.from(columns) : [];
  }

  /**
   * Carica i dati della route corrente chiamando `MetaService.getFlatRecordData` (`MetadataProviderService.readUri`).
   * Invia paginazione/ordinamenti/gruppi/filtri/aggregazioni e `has_server_operation`, poi mappa la risposta
   * `rawPagedResult` in `ResultInfo` (`dato`, `current`, `totalRowCount`, `totalGroups`, `Agg`, `route`).
   * Se `all=false` espone solo il primo record in `dato`, altrimenti l'intera pagina.
   * @param scope Datasource con metadati tabella/colonne e stato runtime (filtri, paging, loading).
   * @param userId `user_id` inoltrato al backend.
   * @param all Se `true` mantiene tutti i risultati pagina; se `false` riduce al primo elemento.
   * @param resultInfo Contenitore risultato da riempire; se assente viene creato.
   * @param hideBusy Parametro legacy non usato nella logica corrente.
   */
  async select(scope: DataSourceComponent, userId: number, all: boolean, resultInfo?: ResultInfo, hideBusy?: any) {
    if (!resultInfo)
      resultInfo = new ResultInfo();

    let route = scope.metaInfo.tableMetadata.md_route_name;

    // Bug fix race-condition: durante state-restore o transizioni SPA con
    // metaInfo parzialmente popolato, route puo' essere vuoto ("" o null) ma
    // l'API si aspetta un valore non vuoto. Se non bloccato qui, il POST a
    // `MetaService.getFlatRecordData` parte con route="" e il backend ritorna
    // 50 record dalla prima tabella di metadata ("random") → quando questa
    // response vince il timing tra le 3 fetchData parallele del flow init+
    // applySelectedGridState, sovrascrive i record corretti e il list-grid
    // mostra 50 <tr> con celle vuote (column name mismatch). Ritorniamo un
    // resultInfo vuoto coerente cosi' il consumer (list-grid) non crasha sulla
    // subscribe a fetchInfo$ (che pero' qui non viene pubblicata: select() e'
    // chiamato da fetchData() che ha gia' un guard sopra a cui questo si
    // affianca come difesa in profondita').
    if (!route) {
      resultInfo.dato = [];
      resultInfo.totalRowCount = 0;
      resultInfo.totalGroups = 0;
      resultInfo.Agg = null;
      resultInfo.route = '';
      resultInfo.cursorMode = false;
      resultInfo.nextPageCursor = null;
      resultInfo.prevPageCursor = null;
      resultInfo.current = null;
      return resultInfo;
    }

    let filterString = scope.filterParam;
    let filters = [];
    const filterLogic = String((scope as any)?.filterInfo?.logic ?? (scope as any)?.filterInfo?.logicOperator ?? 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
    const queryOptimization = (scope?.metaInfo?.tableMetadata?.extraProps as any)?.serverProperties?.queryOptimization || {};
    const cursorModeEnabled = !!queryOptimization?.enabled && String(queryOptimization?.countPolicy || '').toLowerCase() === 'cursor';
    const pageDirection = scope?.pageDirection === 'prev' ? 'prev' : 'next';
    const pageCursor = cursorModeEnabled ? (scope?.pageCursor || null) : null;

    //*********IMPLEMENT MULTIKEY CASE**********

    if (filterString) {
      filters.push({ field: filterString.split("||")[0], operatore: filterString.split("||")[1], value: filterString.split("||")[2] });
    }

    // var crudSelectRequestId;

    if (scope?.metaInfo?.tableMetadata?.md_nome_tabella === '__param_dialog') {
      return resultInfo; // skip data loading for param dialog, which is handled by a dedicated endpoint (`selectCombo`) and doesn't use `dato/current` di `ResultInfo`
    }
    const actionContext = String((scope as any)?.aRoute?.snapshot?.paramMap?.get('action') || '').trim() || 'list';
    const routeContext = this.buildRouteContext(route, actionContext, 'DataProviderMetaService.select');

    // ----- SP-route dispatch branch -----
    // Quando la route metadata punta a una stored procedure
    // (`md_is_stored = true`), il backend non puo essere chiamato via
    // `getFlatRecordData` (proverebbe SELECT * FROM <sp-name> e fallirebbe).
    // Invece dispatchiamo a `getFlatDataFromStored` con i parametri costruiti
    // dal `md_props_bag.parameters` (interpolati con `{{currentUser.*}}`).
    let result: rawPagedResult;
    const isStoredRoute = !!(scope?.metaInfo?.tableMetadata as any)?.md_is_stored;

    if (isStoredRoute) {
      const storedParameters = this.buildStoredParametersPayload(scope);
      const pageSize = scope.pageSize == null ? 200 : scope.pageSize;
      const currentPage = scope.currentPage || 1;
      const sortField = (scope.sortInfo && scope.sortInfo.length) ? scope.sortInfo[0]?.field : null;
      const sortDir = (scope.sortInfo && scope.sortInfo.length) ? scope.sortInfo[0]?.dir : null;

      result = await (this.http.post(
        MetadataProviderService.storedUri,
        {
          user_id: userId,
          stored: route,
          parameters: storedParameters,
          __pageIndex: currentPage,
          __pageSize: pageSize,
          __sortField: sortField,
          __sortDir: sortDir,
          skipExtraParams: false,
          noResults: false
        }
      ).toPromise() as Promise<rawPagedResult>);
    } else {
      // if (!hideBusy)
      //   crudSelectRequestId = wtoolbox.ui.toggleBusy();
      result = await (this.http.post(
        MetadataProviderService.readUri,
        {
          user_id: userId,
          route: route,
          lookup_table_id: 0,
          SortInfo: scope.sortInfo || [],
          GroupInfo: scope.groupInfo || [],
          PageInfo: { pageSize: scope.pageSize == null ? 10 : scope.pageSize, currentPage: scope.currentPage || 1 },
          pageCursor: pageCursor,
          pageDirection: pageDirection,
          filterInfo: scope.filterInfo || { logic: filterLogic, filters: filters },
          logicOperator: filterLogic,
          has_server_operation: scope.metaInfo.tableMetadata.md_server_side_operations,
          aggregates: scope.aggregationInfo && scope.aggregationInfo.length
            ? scope.aggregationInfo
            : (scope?.metaInfo?.columnMetadata ? MetadataProviderService.getAggregates(scope.metaInfo.columnMetadata) : []),
          columnRestrictionList: [],
          formula_lookup: "",
          mc_id: 0,
          routeContext: JSON.stringify(routeContext)
        }
      ).toPromise() as Promise<rawPagedResult>);
    }

    // var result = JSON.parse(data);

    // var unboundedLookups = scope.metaInfo.columnMetadata.filter(function (col) {
    //   return col.extras && col.extras.lookup && col.extras.lookup.unboundedItems && col.extras.lookup.unboundedItems.length
    // });

    // angular.forEach(unboundedLookups, function (col) {
    //   var lookupName = wtoolbox.data.getLookupName(col);
    //   var unboundedValues = col.extras.lookup.unboundedItems;
    //   var descFieldName = col.mc_ui_lookup_dataTextField;
    //   var valueFieldName = col.mc_ui_lookup_dataValueField;
    //   angular.forEach(result.results, function (row) {
    //     var unbounded = unboundedValues.filter(function (v) {
    //       return v[valueFieldName] == row[valueFieldName];
    //     });
    //     if (unbounded.length) {
    //       row[lookupName] = unbounded[0][descFieldName];
    //     }
    //   });
    // });

    // var dictionaries = scope.metaInfo.columnMetadata.filter(function (col) {
    //   return col.mc_dictionary_value;
    // });

    // angular.forEach(dictionaries, function (col) {
    //   var dictionaryMap = wtoolbox.data.getDictionaryMapping(col);
    //   angular.forEach(result.results, function (row) {
    //     row[col.ang_name + "__dictionary_display_value"] = dictionaryMap[row[col.ang_name]];
    //   });
    // });

    // var points = scope.metaInfo.columnMetadata.filter(function (col) {
    //   return col.mc_db_column_type == "point" || col.mc_ui_column_type == "google_map";
    // });

    // angular.forEach(points, function (col) {
    //   angular.forEach(result.results, function (row) {

    //     var lat_long = (row[col.ang_name] || "").toLowerCase().split(",");
    //     if (lat_long.length > 1) {
    //       var latit = $.trim(lat_long[0].replace("lat:", ""));
    //       var longit = $.trim(lat_long[1].replace("long:", ""));

    //       row[col.ang_name + "__latitude"] = latit;
    //       row[col.ang_name + "__longitude"] = longit;
    //     }
    //   });
    // });

    resultInfo.dato = result ? (
      result.results.length ? (
        all ? result.results : result.results[0]
      ) : []
    ) : [];

    // if (!scope.isCurrentInsert)
    if (resultInfo.dato.length) {
      if (scope && typeof (scope as any).getObservable === 'function') {
        resultInfo.current = (scope as any).getObservable(resultInfo.dato[0]);
      } else if (scope?.metaInfo?.columnMetadata?.length) {
        resultInfo.current = DataSourceComponent.getObservable(resultInfo.dato[0], scope.metaInfo);
      } else {
        resultInfo.current = null;
      }
    } else {
      resultInfo.current = null;
    }

    resultInfo.totalRowCount = result ? result.TotalRecords : 0;
    resultInfo.totalGroups = result ? Number(result.TotalGroups || 0) : 0;
    resultInfo.Agg = result ? result.Agg : null;
    resultInfo.route = route;
    resultInfo.cursorMode = !!result?.cursorMode;
    resultInfo.nextPageCursor = result?.nextPageCursor || null;
    resultInfo.prevPageCursor = result?.prevPageCursor || null;

    if (scope) {
      if (resultInfo.cursorMode) {
        const usedCursor = pageCursor;
        if (usedCursor && pageDirection === 'next') {
          scope.prevCursors = Array.isArray(scope.prevCursors) ? scope.prevCursors : [];
          if (!scope.prevCursors.length || scope.prevCursors[scope.prevCursors.length - 1] !== usedCursor) {
            scope.prevCursors.push(usedCursor);
          }
        }
        if (usedCursor && pageDirection === 'prev' && Array.isArray(scope.prevCursors) && scope.prevCursors.length) {
          scope.prevCursors.pop();
        }

        scope.cursorMode = true;
        scope.nextPageCursor = resultInfo.nextPageCursor;
        scope.prevPageCursor = resultInfo.prevPageCursor;
      } else {
        scope.cursorMode = false;
        scope.nextPageCursor = null;
        scope.prevPageCursor = null;
        scope.prevCursors = [];
      }

      scope.pageCursor = null;
      scope.pageDirection = 'next';
    }

    // if (callback)
    //   callback(scope, result, resultInfo.dato); //backward compatibility

    // if (crudSelectRequestId)
    //   wtoolbox.ui.toggleBusy(crudSelectRequestId);


    // .error(function (data) {
    //   wtoolbox.logError(data);

    //   //handle grid error
    //   callback(scope, resultInfo.dato, resultInfo.dato);

    //   if (crudSelectRequestId)
    //     wtoolbox.ui.toggleBusy(crudSelectRequestId);

    // });

    return resultInfo;
  }

  /**
   * Variante di `select` che usa l'endpoint lookup/combo (`MetaService.getFlatRecordComboData`).
   * Attivata solo dai datasource che impostano `useComboEndpoint=true` (lookup-editor annidato).
   */
  async selectCombo(scope: DataSourceComponent, userId: number, all: boolean, resultInfo?: ResultInfo, hideBusy?: any) {
    if (!resultInfo) {
      resultInfo = new ResultInfo();
    }

    const route = scope?.metaInfo?.tableMetadata?.md_route_name;
    const filters: any[] = [];
    const filterLogic = String((scope as any)?.filterInfo?.logic ?? (scope as any)?.filterInfo?.logicOperator ?? 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
    const filterString = scope?.filterParam;

    if (filterString) {
      filters.push({ field: filterString.split("||")[0], operatore: filterString.split("||")[1], value: filterString.split("||")[2] });
    }

    const pageSize = scope?.pageSize == null ? MetadataProviderService.widgetDefinition.lookupServerPageCount : scope.pageSize;
    const currentRecord = this.normalizeComboCurrentRecord(scope?.comboCurrentRecord ?? scope?.parentRecord);
    const formulaLookup = String(scope?.comboFormulaLookup || '').trim();
    const mcId = Number(scope?.comboMcId || 0);
    const extraFields = String(scope?.comboExtraFields || '').trim();
    const actionContext = String((scope as any)?.aRoute?.snapshot?.paramMap?.get('action') || '').trim() || 'list';
    const routeContext = this.buildRouteContext(route || '', actionContext, 'DataProviderMetaService.selectCombo');

    // Slim combo: if the parent lookup column has slimCombo in mc_props_bag,
    // restrict the columns fetched to PK + valueField + textField.
    const comboField = (scope as any)?.comboField as MetadatiColonna | undefined;
    const comboRestriction: string[] = comboField
      ? DataProviderMetaService.buildSlimComboRestriction(comboField)
      : [];

    const result = await (this.http.post(
      MetadataProviderService.readUriCmb,
      {
        user_id: userId,
        route: route,
        lookup_table_id: 0,
        SortInfo: scope.sortInfo || [],
        GroupInfo: scope.groupInfo || [],
        PageInfo: { pageSize: pageSize, currentPage: scope?.currentPage || 1 },
        filterInfo: scope.filterInfo || { logic: filterLogic, filters: filters },
        logicOperator: filterLogic,
        has_server_operation: scope?.metaInfo?.tableMetadata?.md_server_side_operations,
        aggregates: scope.aggregationInfo && scope.aggregationInfo.length
          ? scope.aggregationInfo
          : (scope?.metaInfo?.columnMetadata ? MetadataProviderService.getAggregates(scope.metaInfo.columnMetadata) : []),
        columnRestrictionList: comboRestriction,
        formula_lookup: formulaLookup,
        mc_id: Number.isFinite(mcId) ? mcId : 0,
        currentRecord: currentRecord,
        extraFields: extraFields,
        routeContext: JSON.stringify(routeContext)
      }
    ).toPromise() as Promise<rawPagedResult>);

    resultInfo.dato = result ? (
      result.results.length ? (
        all ? result.results : result.results[0]
      ) : []
    ) : [];

    if (resultInfo.dato.length) {
      if (scope && typeof (scope as any).getObservable === 'function') {
        resultInfo.current = (scope as any).getObservable(resultInfo.dato[0]);
      } else if (scope?.metaInfo?.columnMetadata?.length) {
        resultInfo.current = DataSourceComponent.getObservable(resultInfo.dato[0], scope.metaInfo);
      } else {
        resultInfo.current = null;
      }
    } else {
      resultInfo.current = null;
    }

    resultInfo.totalRowCount = result ? result.TotalRecords : 0;
    resultInfo.totalGroups = result ? Number(result.TotalGroups || 0) : 0;
    resultInfo.Agg = result ? result.Agg : null;
    resultInfo.route = route;
    resultInfo.cursorMode = false;
    resultInfo.nextPageCursor = null;
    resultInfo.prevPageCursor = null;

    if (scope) {
      scope.cursorMode = false;
      scope.nextPageCursor = null;
      scope.prevPageCursor = null;
      scope.prevCursors = [];
      scope.pageCursor = null;
      scope.pageDirection = 'next';
    }

    return resultInfo;
  }

  /**
   * Converte un record eventualmente reattivo (BehaviorSubject per campo) in oggetto plain.
   */
  private normalizeComboCurrentRecord(record: any): any {
    if (!record || typeof record !== 'object') {
      return record;
    }

    const plain: any = {};
    Object.keys(record).forEach((key) => {
      const value = record[key];
      if (value && typeof value === 'object' && 'value' in value) {
        plain[key] = value.value;
      } else {
        plain[key] = value;
      }
    });
    return plain;
  }

  /**
   * Wrapper di `select` senza componente UI reale: costruisce uno scope minimale con route e server-side ops attive,
   * poi richiede l'intera pagina (`all=true`).
   * @param userId `user_id` inviato a `MetaService.getFlatRecordData`.
   * @param route Route da interrogare (`md_route_name`).
   * @param filterInfo Filtro opzionale passato al backend.
   * @param sortInfo Ordinamenti opzionali.
   * @param pageSize Page size opzionale.
   * @param currentPage Pagina corrente opzionale.
   * @returns `ResultInfo` popolato da `select`.
   */
  async selectByRoute(userId: number, route: string, filterInfo?: FilterInfo, sortInfo?: SortInfo[], pageSize?: number, currentPage?: number): Promise<ResultInfo> {
    let scope = {
      metaInfo: {
        tableMetadata: {
          md_route_name: route,
          md_server_side_operations: true
        }
      },
      pageSize: pageSize,
      currentPage: currentPage,
      filterInfo: filterInfo,
      sortInfo: sortInfo
    };

    return await this.select(<any>scope, userId, true);
  }

  /**
   * Carica i dati per un controllo combo/lookup chiamando `MetaService.getFlatRecordComboData`.
   * Compone `filterInfo` in base a testo ricerca o valore corrente campo, includendo eventuale record gia selezionato.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param UserInfo Contesto utente da passare alle API metadata.
   * @param currentRecord Record corrente usato dalla logica/metadati.
   * @param field Metadato colonna/campo coinvolto nell'elaborazione.
   * @param filterString Testo filtro free-text per ricerca/suggest.
   */
  async getComboData(scope: ComboParams, UserInfo: any, currentRecord: any, field: MetadatiColonna, filterString: string) {

    let route = scope.dataroute;
    const filterLogic = String((scope as any)?.filterInfo?.logic ?? (scope as any)?.filterInfo?.logicOperator ?? 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';

    let value = currentRecord[field.mc_nome_colonna];
    let filterInfo = null;
    const routeContext = this.buildRouteContext(route || '', 'list', 'DataProviderMetaService.getComboData');

    // var filters = [];

    if (filterString) {
      filterInfo = {
        logic: "and",
        filters: [
          { field: field.mc_ui_lookup_dataTextField, operatore: "contains", value: filterString },
        ]
      }
    } else if (value && field.mc_serverside_operations) {
      filterInfo = {
        logic: "or",
        filters: [
          { field: field.mc_ui_lookup_dataValueField, operatore: "eq", value: value, __extra: true },
          { field: "__extra" }
        ]
      }
    }

    // Build columnRestrictionList for slim combo: when mc_props_bag has slimCombo=true,
    // only request the essential columns (PK + valueField + textField) to reduce payload.
    const columnRestrictionList: string[] = DataProviderMetaService.buildSlimComboRestriction(field);

    //string user_id, string route, int lookup_table_id, List<SortInfo> SortInfo, List<GroupInfo> GroupInfo, PageInfo PageInfo, FilterInfos filterInfo, string logicOperator, bool has_server_operation, List<AggregationInfo> aggregates, List<string> columnRestrictionList, string formula_lookup, int mc_id, string extraFields, SerializableDictionary<string, object> currentRecord
    let result = await (this.http.post(
      MetadataProviderService.readUriCmb,
      {
        user_id: UserInfo.user_id,
        route: route,
        lookup_table_id: 0,
        SortInfo: scope.sortInfo || [],
        GroupInfo: scope.groupInfo || [],
        PageInfo: { pageSize: scope.pageSize == null ? MetadataProviderService.widgetDefinition.lookupServerPageCount : scope.pageSize, currentPage: 1 },
        filterInfo: filterInfo || { logic: filterLogic, filters: [] },
        logicOperator: filterLogic,
        has_server_operation: scope.md_server_side_operations,
        aggregates: [], // wtoolbox.data.getAggregates(scope.metaInfo.columnMetadata),
        columnRestrictionList: columnRestrictionList,
        formula_lookup: "",
        mc_id: 0,
        currentRecord: currentRecord,
        extraFields: field.extraFields || "",
        routeContext: JSON.stringify(routeContext)
      }
    ).toPromise() as Promise<rawPagedResult>);

    return result;

  }

  /**
   * Aggiorna un record via `MetaService.updateRecord` inviando `entity` + `__original` (snapshot `pristine`) e `route`.
   * Dopo il salvataggio invalida cache metadata:
   * - su `is_system_route`: `localStorage.clear()`, clear DB locale metadata, `getSchemaAndData()`;
   * - su meta route standard: clear cache (oppure solo translation per `_wuic_translations`) e reload schema+dati.
   * @param entity Record modificato da salvare.
   * @param pristine Versione originale usata dal backend per logiche di update/concurrency.
   * @param scope Datasource che fornisce route e stato loading.
   * @param UserInfo Contesto utente (usa `UserInfo.user_id`).
   * @returns Payload risposta backend (include tipicamente `operation`, `result`, `__entity`).
   */
  async update(entity, pristine, scope: DataSourceComponent, UserInfo): Promise<any> {
    let route = scope.metaInfo.tableMetadata.md_route_name;
    const routeContext = this.buildRouteContext(route, 'update', 'DataProviderMetaService.update');

    if (!Object.prototype.hasOwnProperty.call(entity || {}, "__original")) {
      entity["__original"] = pristine;
    }

    scope.loading.next(true);
    let clonedEntity;

    // if (appSettings.preventComboItemSerialization && !scope.metaInfo.tableMetadata.extraProps.forceComboItemSerialization) {
    //   entity.defaults = null;
    //   entity.fields = null;

    //   clonedEntity = angular.copy(entity);

    //   var lookups = scope.metaInfo.columnMetadata.filter(function (col) {
    //     return col.mc_ui_column_type = "lookupByID";
    //   });
    //   angular.forEach(lookups, function (lookup) {
    //     clonedEntity[lookup.mc_nome_colonna + "__obj"] = null;
    //   });
    // }

    let data = await (this.http.post(
      MetadataProviderService.updateUri,
      {
        route: route,
        user_id: UserInfo.user_id,
        entity: clonedEntity || entity,
        routeContext: JSON.stringify(routeContext)
      }
    ).toPromise() as Promise<any>);

    const isSystemRoute = !!scope?.metaInfo?.tableMetadata?.is_system_route;
    if (isSystemRoute) {

      if (route === "_wuic_translations") {
        localStorage.removeItem('translation');
      }

      this.clearLocalStoragePreservingTranslation();

      const metaDb = await MetadataProviderService.getMetaDB();
      metaDb.tables.forEach(function (table) {
        table.clear();
      });
      scope.getSchemaAndData();
      scope.loading.next(false);
      return data;
    }

    scope.loading.next(false);

    return data;
  }

  /**
   * Esegue il batch update remoto via `MetaService.batchRecord` sulla route corrente.
   * Dopo il salvataggio invalida cache locali metadata/traduzioni e ricarica schema+dati quando la route e metadata/system route.
   * @param entities Entita dati coinvolte nella mutazione batch.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @returns Payload risposta backend del batch.
   */
  async batchSave(entities: any[], scope: DataSourceComponent, userId: number): Promise<any> {
    const route = scope?.metaInfo?.tableMetadata?.md_route_name;
    const routeContext = this.buildRouteContext(route || '', 'batch', 'DataProviderMetaService.batchSave');
    if (!route || !Array.isArray(entities) || !entities.length) {
      return null;
    }

    scope.loading?.next?.(true);

    const data = await (this.http.post(
      MetadataProviderService.batchEditUri,
      {
        route: route,
        user_id: userId,
        entities: entities,
        routeContext: JSON.stringify(routeContext)
      }
    ).toPromise() as Promise<any>);

    const isSystemRoute = !!scope?.metaInfo?.tableMetadata?.is_system_route;
    if (isSystemRoute) {
      this.clearLocalStoragePreservingTranslation();
      const metaDb = await MetadataProviderService.getMetaDB();
      metaDb.tables.forEach(function (table) {
        table.clear();
      });
      scope.getSchemaAndData();
      scope.loading?.next?.(false);
      return data;
    }

    if (MetadataProviderService.isMetaRoute(route)) {
      if (route === "_wuic_translations") {
        localStorage.removeItem('translation');
      } else {
        this.clearLocalStoragePreservingTranslation();
      }
      const metaDb = await MetadataProviderService.getMetaDB();
      metaDb.tables.forEach(function (table) {
        table.clear();
      });
      scope.getSchemaAndData();
    }

    scope.loading?.next?.(false);
    return data;
  }

  /**
   * Inserisce un record via `MetaService.insertRecord`.
   * Se il backend restituisce `operation='insert'` con id autogenerato, valorizza la PK locale
   * del record usando il primo campo primary key metadata (`MetadataProviderService.getPKeys`).
   * Per meta route invalida cache browser e ricarica schema+dati.
   * @param entity Record da inserire.
   * @param scope Datasource corrente (route, metadati, loading).
   * @param userId `user_id` da inviare al backend.
   */
  async insert(entity, scope: DataSourceComponent, userId: number) {
    let route = scope.metaInfo.tableMetadata.md_route_name;
    const routeContext = this.buildRouteContext(route, 'insert', 'DataProviderMetaService.insert');
    // entity["__original"] = scope.pristine.current; // manage optimistic concurrency

    // var crudInsertRequestId = wtoolbox.ui.toggleBusy();
    scope.loading.next(true);

    let clonedEntity;

    // if (appSettings.preventComboItemSerialization && !scope.metaInfo.tableMetadata.extraProps.forceComboItemSerialization) {
    //   entity.defaults = null;
    //   entity.fields = null;

    //   clonedEntity = angular.copy(entity);

    //   var lookups = scope.metaInfo.columnMetadata.filter(function (col) {
    //     return col.mc_ui_column_type = "lookupByID";
    //   });
    //   angular.forEach(lookups, function (lookup) {
    //     clonedEntity[lookup.mc_nome_colonna + "__obj"] = null;
    //   });
    // }

    let data = await (this.http.post(
      MetadataProviderService.createUri,
      {
        route: route,
        user_id: userId,
        entity: clonedEntity || entity,
        routeContext: JSON.stringify(routeContext)
      }
    ).toPromise() as Promise<any>);

    if (data.operation == "insert") {
      let autoGeneratedID = data.result;
      if (autoGeneratedID) {
        let pk = MetadataProviderService.getPKeys(scope.metaInfo.columnMetadata);
        if (pk.length) {
          entity[pk[0].ang_name] = autoGeneratedID;
        }
      }
    }

    if (MetadataProviderService.isMetaRoute(route)) {
      if (route === "_wuic_translations") {
        localStorage.removeItem('translation');
      } else {
        this.clearLocalStoragePreservingTranslation();
      }

      scope.getSchemaAndData();
    } else {
      // scope.fetchData();
    }

    scope.loading.next(false);

    return data;

  }

  /**
   * Clona un record (ed eventuali relazioni richieste) via `MetaService.CloneRecord`.
   * Invia `relatedRouteToClone` per guidare la clonazione server-side delle route collegate.
   * Su meta route invalida cache metadata locale e ricarica schema+dati.
   * @param entity Record sorgente da clonare.
   * @param scope Datasource corrente.
   * @param userId `user_id` inviato all'endpoint clone.
   * @param relatedRouteToClone Elenco route correlate da includere nella clonazione.
   */
  async clone(entity, scope: DataSourceComponent, userId: number, relatedRouteToClone: any[]) {
    let route = scope.metaInfo.tableMetadata.md_route_name;
    const routeContext = this.buildRouteContext(route, 'clone', 'DataProviderMetaService.clone');
    // entity["__original"] = scope.pristine.current; // manage optimistic concurrency

    // var crudInsertRequestId = wtoolbox.ui.toggleBusy();
    scope.loading.next(true);

    let clonedEntity;

    let data = await (this.http.post(
      MetadataProviderService.cloneUri,
      {
        route: route,
        relatedRouteToClone: relatedRouteToClone,
        user_id: userId,
        entity: clonedEntity || entity,
        routeContext: JSON.stringify(routeContext)
      }
    ).toPromise() as Promise<any>);

    debugger;

    if (MetadataProviderService.isMetaRoute(route)) {
      this.clearLocalStoragePreservingTranslation();
      const metaDb = await MetadataProviderService.getMetaDB();
      metaDb.tables.forEach(function (table) {
        table.clear();
      });

      scope.getSchemaAndData();
    } else {
      // scope.fetchData();
    }

    scope.loading.next(false);

    return data;

  }

  /**
   * Elimina un record via `MetaService.deleteRecord` usando la route del datasource.
   * Per meta route effettua invalidazione cache (`localStorage`/`translation`, IndexedDB metadata)
   * e ricarica schema+dati per riallineare l'editor metadati.
   * @param entity Record da eliminare.
   * @param scope Datasource corrente (fornisce route e loading).
   * @param userId `user_id` passato al backend.
   */
  async delete(entity, scope: DataSourceComponent, userId: number) {
    // entity["__original"] = scope.pristine.current; // manage optimistic concurrency

    // var crudDeleteRequestId = wtoolbox.ui.toggleBusy();
    scope.loading.next(true);
    const routeContext = this.buildRouteContext(scope.metaInfo.tableMetadata.md_route_name, 'delete', 'DataProviderMetaService.delete');

    let clonedEntity;

    // if (appSettings.preventComboItemSerialization && scope && scope.metaInfo && !scope.metaInfo.tableMetadata.extraProps.forceComboItemSerialization) {
    //   entity.defaults = null;
    //   entity.fields = null;

    //   clonedEntity = angular.copy(entity);

    //   var lookups = scope.metaInfo.columnMetadata.filter(function (col) {
    //     return col.mc_ui_column_type = "lookupByID";
    //   });
    //   angular.forEach(lookups, function (lookup) {
    //     clonedEntity[lookup.mc_nome_colonna + "__obj"] = null;
    //   });
    // }

    let data = await (this.http.post(
      MetadataProviderService.deleteUri,
      {
        route: scope.metaInfo.tableMetadata.md_route_name,
        user_id: userId,
        entity: clonedEntity || entity,
        routeContext: JSON.stringify(routeContext)
      }
    ).toPromise() as Promise<any>);

    if (MetadataProviderService.isMetaRoute(scope.metaInfo.tableMetadata.md_route_name)) {
      if (scope.metaInfo.tableMetadata.md_route_name === "_wuic_translations") {
        localStorage.removeItem('translation');
      } else {
        this.clearLocalStoragePreservingTranslation();
      }
      const metaDb = await MetadataProviderService.getMetaDB();
      metaDb.tables.forEach(function (table) {
        table.clear();
      });

      scope.getSchemaAndData();
    } else {
      // scope.fetchData();
    }

    scope.loading.next(false);

    return data;

  }

  /**
   * Invoca l'export XLS backend includendo tema PrimeNG e modalita light/dark per generare file coerenti con lo stile UI.
   * @param route Route applicativa coinvolta nell'operazione.
   * @param filterInfo Filtro applicato alla selezione dati.
   * @param progressGuid GUID progresso per tracciamento export/lavorazione.
   * @param selectedTheme Tema UI richiesto per export/render.
   * @param themeMode Modalita tema (light/dark) applicata all'output.
   */
  async exportXlsWithTheme(route, filterInfo, progressGuid, selectedTheme, themeMode) {
    const filterLogic = String(filterInfo?.logic ?? filterInfo?.logicOperator ?? 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
    const routeContext = this.buildRouteContext(route, 'export', 'DataProviderMetaService.exportXlsWithTheme');
    const trackProgress = String(progressGuid || '').trim().length > 0;
    if (!trackProgress) {
      WtoolboxService.isBusy.next(true);
    }

    try {
      let data = await (this.http.post(
        MetadataProviderService.exportUri,
        {
          route: route,
          filterInfo: filterInfo || { logic: filterLogic, filters: [] },
          logicOperator: filterLogic,
          has_server_operation: true,
          progressGuid: progressGuid,
          excelTheme: selectedTheme,
          excelThemeMode: themeMode,
          routeContext: JSON.stringify(routeContext)
        }
      ).toPromise() as Promise<any>);

      return data;
    } finally {
      if (!trackProgress) {
        WtoolboxService.isBusy.next(false);
      }
    }
  }

  /**
   * Legge lo stato avanzamento export dal backend (`MetaService.readProgress`).
   * @param progressGuid GUID progresso assegnato all'export.
   * @returns Percentuale progresso (0-100) o `-1` se non disponibile.
   */
  async readExportProgress(progressGuid: string): Promise<number> {
    const guid = String(progressGuid || '').trim();
    if (!guid) {
      return -1;
    }

    const raw = await (this.http.post(
      WtoolboxService.appSettings.global_root_url + "MetaService.readProgress",
      { guid: guid }
    ).toPromise() as Promise<any>);

    const candidate = typeof raw === 'object' && raw !== null && raw.hasOwnProperty('value')
      ? (raw as any).value
      : raw;
    const parsed = Number(candidate);
    if (!Number.isFinite(parsed)) {
      return -1;
    }

    return parsed;
  }

  /**
   * Richiede annullamento task export lato backend.
   * @param progressGuid GUID progresso assegnato all'export.
   */
  async cancelExportTask(progressGuid: string): Promise<any> {
    const guid = String(progressGuid || '').trim();
    if (!guid) {
      return null;
    }

    return await (this.http.post(
      WtoolboxService.appSettings.global_root_url + "MetaService.cancelExportTask",
      { guid: guid }
    ).toPromise() as Promise<any>);
  }

  /**
   * Richiede stop task export e generazione file parziale con record processati finora.
   * @param progressGuid GUID progresso assegnato all'export.
   */
  async stopExportAndDownloadTask(progressGuid: string): Promise<any> {
    const guid = String(progressGuid || '').trim();
    if (!guid) {
      return null;
    }

    return await (this.http.post(
      WtoolboxService.appSettings.global_root_url + "MetaService.stopExportAndDownloadTask",
      { guid: guid }
    ).toPromise() as Promise<any>);
  }

  /**
   * Richiede annullamento task import lato backend (rollback completo).
   * @param progressGuid GUID progresso assegnato all'import.
   */
  async cancelImportTask(progressGuid: string): Promise<any> {
    const guid = String(progressGuid || '').trim();
    if (!guid) {
      return null;
    }

    return await (this.http.post(
      WtoolboxService.appSettings.global_root_url + "MetaService.cancelImportTask",
      { guid: guid }
    ).toPromise() as Promise<any>);
  }

  /**
   * Richiede stop task import con commit parziale dei record processati.
   * @param progressGuid GUID progresso assegnato all'import.
   */
  async stopImportAndCommitTask(progressGuid: string): Promise<any> {
    const guid = String(progressGuid || '').trim();
    if (!guid) {
      return null;
    }

    return await (this.http.post(
      WtoolboxService.appSettings.global_root_url + "MetaService.stopImportAndCommitTask",
      { guid: guid }
    ).toPromise() as Promise<any>);
  }

  /**
   * Salva/aggiorna una dashboard via `MetaService.saveDashboard`.
   * Il payload viene inoltrato così com'è (tipicamente `dashRoute`, `elements`, `desc`, `sheetPaths`, `designMode`, `pwd`, `user_id`).
   * Lato server il record viene upsertato in `dom_board` e le associazioni fogli riscritte in `dom_board_sheet`.
   * @param payload Oggetto richiesta dashboard da persistire.
   * @returns Oggetto dashboard serializzato restituito dal backend.
   */
  async saveDashboard(payload: any): Promise<any> {

    WtoolboxService.isBusy.next(true);

    let data = await (this.http.post(MetadataProviderService.saveDashboardUri, payload).toPromise() as Promise<any>);

    WtoolboxService.isBusy.next(false);

    return data;
  }

  /**
   * Carica una dashboard via `MetaService.loadDashboard` in base al `dashRoute` nel payload.
   * @param payload Richiesta di load (tipicamente `dashRoute`, opzionalmente `user_id`).
   * @returns Stato dashboard serializzato dal backend (`dom_board` + dati correlati).
   */
  async loadDashboard(payload: any): Promise<any[]> {

    WtoolboxService.isBusy.next(true);

    let data = await (this.http.post(MetadataProviderService.loadDashboardUri, payload).toPromise() as Promise<any[]>);

    WtoolboxService.isBusy.next(false);

    return data;
  }

  /**
   * Elimina una dashboard via `MetaService.deleteDashboard`.
   * Lato server la cancellazione rimuove anche righe figlie (`dom_board_element`, `dom_board_sheet`) nella stessa transazione.
   * @param payload Richiesta delete (deve includere `dashRoute`).
   * @returns Esito serializzato `{ deleted, affected }`.
   */
  async deleteDashboard(payload: any): Promise<any> {

    WtoolboxService.isBusy.next(true);

    const data = await (this.http.post(MetadataProviderService.deleteDashboardUri, payload).toPromise() as Promise<any>);

    WtoolboxService.isBusy.next(false);

    return data;
  }

  /**
   * Salva/aggiorna un workflow graph via `MetaService.saveWorkflowGraph`.
   * Il backend fa upsert su `_wuic_workflow_graph` e riscrive i dettagli route-node
   * in `_wuic_workflow_graph_route_metadata` partendo da `route_metadata_json`.
   * @param payload Richiesta con `graph_key`, `graph_name`, `graph_json`, `route_metadata_json`.
   * @returns Esito serializzato con id/chiave/nome e numero route metadata processate.
   */
  async saveWorkflowGraph(payload: any): Promise<any> {
    WtoolboxService.isBusy.next(true);
    const data = await (this.http.post(MetadataProviderService.saveWorkflowGraphUri, payload).toPromise() as Promise<any>);
    WtoolboxService.isBusy.next(false);
    return data;
  }

  /**
   * Carica un workflow graph via `MetaService.loadWorkflowGraph`.
   * Se la chiave non esiste, il backend ritorna un grafo vuoto (`nodes/connections`) con `route_metadata=[]`.
   * @param payload Richiesta con `graph_key`.
   * @returns Struttura `{ graph_key, graph_name, graph_json, route_metadata }`.
   */
  async loadWorkflowGraph(payload: any): Promise<any> {
    WtoolboxService.isBusy.next(true);
    const data = await (this.http.post(MetadataProviderService.loadWorkflowGraphUri, payload).toPromise() as Promise<any>);
    WtoolboxService.isBusy.next(false);
    return data;
  }

  /**
   * Richiede al backend l'elenco dei workflow graph disponibili (`MetaService.getWorkflowGraphs`).
   * @param payload Payload richiesta/risposta usato nel metodo.
   * @returns Collezione graph restituita dal server.
   */
  async getWorkflowGraphs(payload: any): Promise<any> {
    WtoolboxService.isBusy.next(true);
    const data = await (this.http.post(MetadataProviderService.getWorkflowGraphsUri, payload).toPromise() as Promise<any>);
    WtoolboxService.isBusy.next(false);
    return data;
  }

  /**
   * Rinomina un workflow graph lato server usando `MetadataProviderService.renameWorkflowGraphUri`.
   * @param payload Payload con identificativo grafo e nuovo nome.
   * @returns Risposta backend del rename.
   */
  async renameWorkflowGraph(payload: any): Promise<any> {
    WtoolboxService.isBusy.next(true);
    const data = await (this.http.post(MetadataProviderService.renameWorkflowGraphUri, payload).toPromise() as Promise<any>);
    WtoolboxService.isBusy.next(false);
    return data;
  }

  /**
   * Elimina un workflow graph via `MetaService.deleteWorkflowGraph` usando `graph_key`.
   * @param payload Richiesta delete graph.
   * @returns Esito serializzato `{ deleted, affected }`.
   */
  async deleteWorkflowGraph(payload: any): Promise<any> {
    WtoolboxService.isBusy.next(true);
    const data = await (this.http.post(MetadataProviderService.deleteWorkflowGraphUri, payload).toPromise() as Promise<any>);
    WtoolboxService.isBusy.next(false);
    return data;
  }

  /**
   * Chiede al backend le classi CSS presenti nei fogli indicati (`MetaService.getCssClassesFromSheets`).
   * @param sheetPaths Percorsi fogli CSS da elaborare.
   * @returns Lista classi CSS rilevate.
   */
  async getCssClassesFromSheets(sheetPaths: string[]): Promise<any[]> {
    WtoolboxService.isBusy.next(true);
    const data = await (this.http.post(
      MetadataProviderService.getCssClassesFromSheetsUri,
      { sheets: sheetPaths || [] }
    ).toPromise() as Promise<any[]>);
    WtoolboxService.isBusy.next(false);
    return data || [];
  }

  /**
   * Scrive su file CSS le modifiche di stile invocando l'endpoint backend dedicato.
   * @param sheet Foglio CSS oggetto di lettura/scrittura.
   */
  async writeChangesToCssFile(sheet: any): Promise<void> {
    WtoolboxService.isBusy.next(true);
    await (this.http.post(
      MetadataProviderService.writeChangesToCssFileUri,
      { sheet: sheet }
    ).toPromise() as Promise<any>);
    WtoolboxService.isBusy.next(false);
  }
}
