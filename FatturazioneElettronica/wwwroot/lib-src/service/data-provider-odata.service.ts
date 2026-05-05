import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DataSourceComponent } from '../component/data-source/data-source.component';
import { MetadataProviderService } from './metadata-provider.service';
import { ComboParams } from '../class/comboParams';
import { MetadatiColonna } from '../class/metadati_colonna';
import { rawPagedResult } from '../class/rawPagedResult';
import { ResultInfo } from '../class/resultInfo';
import { UpdateInfo } from '../class/updateInfo';
import { HttpClient } from '@angular/common/http';
import { UserInfo } from '../class/userInfo';
import { FilterInfo } from '../class/filterInfo';
// import { config, EntityManager, EntityQuery } from 'breeze-client';
// import { OData4DataService, OData4UriBuilder } from 'breeze-odata4';

@Injectable({
  providedIn: 'root'
})
export class DataProviderOdataService {

  constructor(private http: HttpClient) { }


  /**
   * Esegue l'operazione dati implementata da `select`.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @param all Flag che abilita caricamento completo dataset.
   * @param resultInfo Struttura risultato da popolare/aggiornare.
   * @param hideBusy Flag/handler per gestione busy indicator UI.
   */
  /**
   * Variante di `select` usata dai datasource annidati del lookup-editor
   * (`useComboEndpoint=true`) quando la colonna lookup dichiara un endpoint
   * OData override via `mc_props_bag.lookup.endpoint` (runtime:
   * `field.extras.lookup.endpoint`).
   *
   * Differenze rispetto a `select()`:
   *   - non legge URL da `tableMetadata.extraProps.endpoint` della route
   *     lookup (perche' la route lookup e' spesso "solo metadata" senza
   *     binding OData), ma dal parametro `endpointOverride` passato dal
   *     dispatcher — che lo estrae da `scope.comboField.extras.lookup.endpoint`
   *   - `$select` automatico su `dataValueField + dataTextField` (+ chiave
   *     primaria se distinta) per minimizzare il payload del dropdown.
   *   - `$top` dal `scope.pageSize` (default combo).
   *   - `$count=true` per popolare `totalRowCount` (usato dal pager del
   *     lookup-editor in modalita' server-side).
   *
   * Shape risposta attesa dal backend: wrapper OData v4
   * `{ value: [...], "@odata.count": N }`, come emesso da
   * `EntitiesController.Get` quando la query passa `$count=true`.
   */
  async selectCombo(
    scope: DataSourceComponent,
    userId: number,
    all: boolean,
    resultInfo?: ResultInfo,
    hideBusy?: any,
    endpointOverride?: { type?: string; uri?: string; [k: string]: any }
  ): Promise<ResultInfo> {
    if (!resultInfo) {
      resultInfo = new ResultInfo();
    }

    const comboField = (scope as any)?.comboField as MetadatiColonna | undefined;
    const valueField = String(comboField?.mc_ui_lookup_dataValueField || '').trim();
    const textField = String(comboField?.mc_ui_lookup_dataTextField || '').trim();

    // Base URL lookup: prima dall'override (comboField.extras.lookup.endpoint),
    // poi dal table-level (se la route lookup e' anch'essa OData-backed).
    const uriRaw = String(
      endpointOverride?.uri
      ?? scope?.metaInfo?.tableMetadata?.extraProps?.endpoint?.uri
      ?? ''
    );
    if (!uriRaw) {
      throw new Error('DataProviderOdataService.selectCombo: no endpoint.uri configured (neither comboField.extras.lookup.endpoint nor tableMetadata.extraProps.endpoint)');
    }
    // Strip eventuale querystring dalla base — ricostruiamo noi i query params.
    const qIdx = uriRaw.indexOf('?');
    const baseUrl = (qIdx >= 0 ? uriRaw.substring(0, qIdx) : uriRaw).replace(/\/+$/, '');

    // $filter: il lookup-editor passa `scope.filterInfo` con un filtro
    // `contains(<textField>, '<user query>')` durante la typeahead search.
    // filterInfoToOdata costruisce `?$filter=...` (URL con `/odata/<route>`),
    // ma qui vogliamo SOLO l'expression — estraiamo tutto dopo `$filter=`.
    const filterInfo = (scope?.filterInfo as FilterInfo) || new FilterInfo('AND', []);
    const filterExpr = this.buildOdataFilterExpression(filterInfo);

    const params: string[] = [];
    params.push(`$top=${Number(scope?.pageSize || 20)}`);
    params.push(`$count=true`);
    if (filterExpr) {
      params.push(`$filter=${encodeURIComponent(filterExpr)}`);
    }
    // $select minimale: solo value/text (+ raramente una PK distinta). Questo
    // rende il payload combo tipicamente un decimo rispetto al fetch pieno.
    const selectFields = [valueField, textField].filter((x, i, a) => x && a.indexOf(x) === i);
    if (selectFields.length) {
      params.push(`$select=${selectFields.join(',')}`);
    }

    const url = `${baseUrl}?${params.join('&')}`;

    scope.loading?.next(true);
    try {
      const res = await firstValueFrom(
        this.http.get<{ value: any[]; '@odata.count'?: number }>(url)
      );
      const rows = Array.isArray(res) ? res : (Array.isArray(res?.value) ? res.value : []);
      const total = Array.isArray(res)
        ? rows.length
        : Number(res?.['@odata.count'] ?? rows.length);

      resultInfo.dato = all ? rows : (rows.length ? rows[0] : []);
      resultInfo.totalRowCount = total;
      resultInfo.Agg = null;
      resultInfo.route = scope?.metaInfo?.tableMetadata?.md_route_name;
      resultInfo.cursorMode = false;
      resultInfo.nextPageCursor = null;
      resultInfo.prevPageCursor = null;

      if (all && Array.isArray(rows) && rows.length && typeof (scope as any)?.getObservable === 'function') {
        resultInfo.current = (scope as any).getObservable(rows[0]);
      } else {
        resultInfo.current = null;
      }

      return resultInfo;
    } finally {
      scope.loading?.next(false);
    }
  }

  async select(scope: DataSourceComponent, userId: number, all: boolean, resultInfo?: ResultInfo, hideBusy?: any) {
    if (!resultInfo)
      resultInfo = new ResultInfo();

    let route = scope.metaInfo.tableMetadata.md_route_name;
    let filterString = scope.filterParam;
    let filters = [];

    //*********IMPLEMENT MULTIKEY CASE**********

    if (filterString) {
      filters.push({ field: filterString.split("||")[0], operatore: filterString.split("||")[1], value: filterString.split("||")[2] });
    }

    // var crudSelectRequestId;

    // if (!hideBusy)
    //   crudSelectRequestId = wtoolbox.ui.toggleBusy();
    // var result = await (this.http.post(
    //   MetadataProviderService.readUri,
    //   {
    //     user_id: UserInfo.user_id,
    //     route: route,
    //     lookup_table_id: 0,
    //     SortInfo: scope.sortInfo || [],
    //     GroupInfo: scope.groupInfo || [],
    //     PageInfo: { pageSize: scope.pageSize == null ? 10 : scope.pageSize, currentPage: scope.currentPage || 1 },
    //     filterInfo: scope.filterInfo || { logic: "AND", filters: filters },
    //     logicOperator: "AND",
    //     has_server_operation: scope.metaInfo.tableMetadata.md_server_side_operations,
    //     aggregates: MetadataProviderService.getAggregates(scope.metaInfo.columnMetadata),
    //     columnRestrictionList: [],
    //     formula_lookup: "",
    //     mc_id: 0
    //   }
    // ).toPromise() as Promise<rawPagedResult>);

    let method = scope.metaInfo.tableMetadata.extraProps.endpoint.method;
    let uri: string = scope.metaInfo.tableMetadata.extraProps.endpoint.uri;

    let filterInfo = scope.filterInfo || { logic: "AND", filters: filters };

    uri = this.filterInfoToOdata(filterInfo, uri);

    let result;

    if (method == "post") {
      result = await (this.http.post(uri, {}).toPromise() as Promise<any>);
    } else {
      result = await (this.http.get(uri).toPromise() as Promise<any>);
    }

    resultInfo.dato = result ? (
      result.length ? (
        all ? result : result[0]
      ) : []
    ) : [];

    if (!scope.isCurrentInsert)
      resultInfo.current = resultInfo.dato.length ? scope.getObservable(resultInfo.dato[0]) : null;

    resultInfo.totalRowCount = result ? result.length : 0;
    resultInfo.Agg = null;
    resultInfo.route = route;

    return resultInfo;
  }

  /**
   * Traduce il `FilterInfo` interno in espressione OData `$filter` applicando i mapping operatori previsti dalla route.
   * @param filterInfo Filtro applicato alla selezione dati.
   * @param route Route applicativa coinvolta nell'operazione.
   */
  filterInfoToOdata(filterInfo: FilterInfo, route: string) {
    const fullQry = '/odata/' + route;
    const expr = this.buildOdataFilterExpression(filterInfo);
    if (!expr) {
      return fullQry;
    }
    return `${fullQry}?$filter=${encodeURIComponent(expr)}`;
  }

  private buildOdataFilterExpression(group: any): string {
    const logic = String(group?.logic ?? group?.logicOperator ?? 'AND').toLowerCase() === 'or' ? 'or' : 'and';
    const filters = Array.isArray(group?.filters) ? group.filters : [];
    const expressions = filters
      .map((filter: any) => this.buildOdataNodeExpression(filter))
      .filter((x: string) => !!x);

    if (!expressions.length) {
      return '';
    }
    if (expressions.length === 1) {
      return expressions[0];
    }
    return `(${expressions.join(` ${logic} `)})`;
  }

  private buildOdataNodeExpression(filter: any): string {
    if (!filter) {
      return '';
    }

    if (filter?.nestedFilters && Array.isArray(filter.nestedFilters.filters)) {
      return this.buildOdataFilterExpression(filter.nestedFilters);
    }

    const field = String(filter?.field || '').trim();
    if (!field) {
      return '';
    }

    // Sentinel `__extra` emesso dal lookup-editor quando pre-popola il
    // filtro lookup con un valore gia' selezionato (vedi
    // `lookup-editor.component.ts` — genera una coppia
    //   [{field:<pk>, operatore:'eq', value:<id>, __extra:true},
    //    {field:'__extra'}]
    // dove il secondo filter non ha operatore/value ed e' solo un marker
    // di "extra selection". Lo skippiamo: il primo filter e' gia' il vero
    // vincolo di pre-selezione.
    if (field === '__extra') {
      return '';
    }

    const op = String(filter?.operatore ?? filter?.operator ?? 'eq').toLowerCase();
    const value = filter?.value;

    // `eqor` = "equals any of" (operatore WUIC interno usato per multi-value
    // lookup pre-selezione). Valore puo' essere una stringa CSV "1,2,3" o un
    // array [1,2,3]. Traduzione OData: disjunction di `eq` wrappata in
    // parentesi — formalmente equivalente a `in` ma piu' portabile sui
    // provider OData che non implementano l'operatore `in` (OData v4 lo
    // supporta ma non tutti i runtime).
    if (op === 'eqor') {
      const values = Array.isArray(value)
        ? value
        : String(value ?? '').split(',').map(s => s.trim()).filter(s => s.length > 0);
      if (values.length === 0) {
        return '';
      }
      if (values.length === 1) {
        return `${field} eq ${this.toOdataValueLiteral(values[0])}`;
      }
      return `(${values.map(v => `${field} eq ${this.toOdataValueLiteral(v)}`).join(' or ')})`;
    }

    const valueLiteral = this.toOdataValueLiteral(value);

    switch (op) {
      case 'contains':
      case 'startswith':
      case 'endswith':
        return `${op}(${field}, ${valueLiteral})`;
      case 'isnull':
        return `${field} eq null`;
      case 'isnotnull':
        return `${field} ne null`;
      default:
        return `${field} ${this.getOdataOperator(op)} ${valueLiteral}`;
    }
  }

  private toOdataValueLiteral(value: any): string {
    if (value === null || value === undefined || value === '') {
      return 'null';
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    const raw = String(value);
    const isQuoted = raw.startsWith("'") && raw.endsWith("'");
    if (isQuoted) {
      return raw;
    }

    const numeric = Number(raw);
    if (!Number.isNaN(numeric) && String(numeric) === raw.trim()) {
      return raw.trim();
    }

    return `'${raw.replace(/'/g, "''")}'`;
  }

  /**
   * Mappa l'operatore filtro interno nel corrispondente frammento OData (`eq`, `contains`, `startswith`, ...),
   * adattando anche il valore quando richiesto dalla sintassi.
   * @param operatore Operatore filtro interno da convertire in sintassi OData.
   * @param value Valore input da convertire/normalizzare.
   */
  getOdataOperator(operatore: string, value?: any) {
    switch (operatore) {
      case "eq":
        return "eq";
      case "neq":
        return "ne";
      case "gt":
        return "gt";
      case "gte":
        return "ge";
      case "lt":
        return "lt";
      case "lte":
        return "le";
      case "contains":
        return "contains";
      case "startswith":
        return "startswith";
      case "endswith":
        return "endswith";
      default:
        return operatore;
    }
  }

  /**
   * Esegue l'operazione dati implementata da `update`.
   * Legge/scrive dati persistenti su storage browser.
   * @param entity Entita dati target della mutazione.
   * @param pristine Copia originale dell'entita per diff/update.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @returns Valore restituito dal metodo (Promise<any>).
   */
  async update(entity, pristine, scope: DataSourceComponent, userId: number): Promise<UpdateInfo> {
    // PATCH `{endpoint.uri}({pk})` — invia TUTTO il record (non solo il delta)
    // perche' il controller `EntitiesController.Patch` fa un copy-field generico
    // e accetta qualsiasi subset; passare l'entita' intera e' la scelta piu'
    // robusta. Header __original/__guid/__new/__changes vengono stripped dal
    // toJsonSafe() (non sono colonne modello EF).
    const base = this.resolveEntitySetBaseUrl(scope);
    const { pkName, pkValue } = this.resolvePk(entity, scope);
    if (!pkName) {
      throw new Error('DataProviderOdataService.update: no primary key column in metaInfo.columnMetadata');
    }
    const url = `${base}(${this.formatODataKey(pkValue)})`;
    const body = this.toJsonSafe(entity, scope);

    scope.loading.next(true);
    try {
      const updated = await firstValueFrom(this.http.patch<any>(url, body));
      const info = new UpdateInfo();
      info.operation = 'update';
      info.result = pkValue;
      info.__entity = updated;
      info.__guid = entity.__guid;
      return info;
    } finally {
      scope.loading.next(false);
    }
  }

  /**
   * Esegue l'operazione dati implementata da `insert`.
   * Legge/scrive dati persistenti su storage browser.
   * @param entity Entita dati target della mutazione.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param userId Identificativo utente usato per contesto e persistenza.
   */
  async insert(entity, scope: DataSourceComponent, userId: number): Promise<UpdateInfo> {
    // POST `{endpoint.uri}` con JSON del record (column-name: value). Il
    // controller `EntitiesController.Post` ritorna 201 con l'entita' appena
    // inserita, includendo la PK autogenerata se presente (es. IDENTITY/GUID).
    // Propaghiamo il valore PK sul record in-memoria cosi' l'UI lo vede
    // subito senza attendere il reload.
    const base = this.resolveEntitySetBaseUrl(scope);
    const body = this.toJsonSafe(entity, scope);

    scope.loading.next(true);
    try {
      const inserted = await firstValueFrom(this.http.post<any>(base, body));
      const pks = MetadataProviderService.getPKeys(scope.metaInfo.columnMetadata);
      const pkName = pks?.[0]?.mc_nome_colonna;
      const serverPk = pkName && inserted ? inserted[pkName] : undefined;

      // Propaga PK generata lato server al record in memoria (BehaviorSubject-aware).
      if (pkName && serverPk !== undefined && serverPk !== null) {
        entity[pkName] = serverPk;
        const currentPk = scope.resultInfo?.current?.[pkName];
        if (currentPk && typeof currentPk.next === 'function') {
          currentPk.next(serverPk);
        }
      }

      const info = new UpdateInfo();
      info.operation = 'insert';
      info.result = serverPk ?? null;
      info.__entity = inserted;
      info.__guid = entity.__guid;
      return info;
    } finally {
      scope.loading.next(false);
    }
  }

  /**
   * Esegue l'operazione dati implementata da `clone`.
   * Legge/scrive dati persistenti su storage browser.
   * @param entity Entita dati target della mutazione.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @param relatedRouteToClone Route applicativa coinvolta nell'operazione.
   */
  async clone(entity, scope: DataSourceComponent, userId: number, relatedRouteToClone: any[]) {
    let route = scope.metaInfo.tableMetadata.md_route_name;
    // entity["__original"] = scope.pristine.current; // manage optimistic concurrency

    // var crudInsertRequestId = wtoolbox.ui.toggleBusy();
    scope.loading.next(true);

    let clonedEntity;

    throw new Error("Method not implemented.");

    let data = await (this.http.post(
      MetadataProviderService.cloneUri,
      {
        route: route,
        relatedRouteToClone: relatedRouteToClone,
        user_id: userId,
        entity: clonedEntity || entity
      }
    ).toPromise() as Promise<any>);

    debugger;

    if (MetadataProviderService.isMetaRoute(route)) {
      localStorage.clear();
      const metaDb = await MetadataProviderService.getMetaDB();
      metaDb.tables.forEach(function (table) {
        table.clear();
      });

      scope.getSchemaAndData();
    } else {
      scope.fetchData();
    }

    scope.loading.next(false);

    return data;

  }

  /**
   * Rimuove i dati target aggiornando lo stato del servizio.
   * Legge/scrive dati persistenti su storage browser.
   * @param entity Entita dati target della mutazione.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param userId Identificativo utente usato per contesto e persistenza.
   */
  async delete(entity, scope: DataSourceComponent, userId: number): Promise<UpdateInfo> {
    // DELETE `{endpoint.uri}({pk})`. Nessun body. Il controller ritorna 200/204.
    const base = this.resolveEntitySetBaseUrl(scope);
    const { pkName, pkValue } = this.resolvePk(entity, scope);
    if (!pkName) {
      throw new Error('DataProviderOdataService.delete: no primary key column in metaInfo.columnMetadata');
    }
    const url = `${base}(${this.formatODataKey(pkValue)})`;

    scope.loading.next(true);
    try {
      await firstValueFrom(this.http.delete(url));
      const info = new UpdateInfo();
      info.operation = 'delete';
      info.result = pkValue;
      info.__entity = entity;
      info.__guid = entity.__guid;
      return info;
    } finally {
      scope.loading.next(false);
    }
  }

  // ====================================================================
  // Helpers CRUD (insert/update/delete) — condivisi tra i 3 metodi.
  // ====================================================================

  /**
   * Risolve la base URL per POST/PATCH/DELETE sull'entity set. Priorita':
   * 1. `extraProps.endpoint.uri` (config esplicita) — stripando eventuale
   *    querystring (`?$filter=...`) che non fa parte della base.
   * 2. Fallback: `/odata/{md_route_name}` (relative URL, richiede stesso
   *    origin del frontend).
   */
  private resolveEntitySetBaseUrl(scope: DataSourceComponent): string {
    const endpoint = scope.metaInfo?.tableMetadata?.extraProps?.endpoint;
    const raw = endpoint?.uri ? String(endpoint.uri) : null;
    if (raw) {
      const qIdx = raw.indexOf('?');
      return (qIdx >= 0 ? raw.substring(0, qIdx) : raw).replace(/\/+$/, '');
    }
    const route = scope.metaInfo?.tableMetadata?.md_route_name;
    return `/odata/${route || ''}`;
  }

  /**
   * Estrae nome e valore della PK dal record. Supporta sia valori "scalari"
   * (`entity.id = 42`) sia "osservabili" (`entity.id = BehaviorSubject(42)`),
   * perche' a seconda del call-site l'entity puo' essere il record "raw" o
   * il record osservabile (`resultInfo.current`).
   */
  private resolvePk(entity: any, scope: DataSourceComponent): { pkName: string | undefined; pkValue: any } {
    const pks = MetadataProviderService.getPKeys(scope.metaInfo?.columnMetadata || []);
    const pkName = pks?.[0]?.mc_nome_colonna;
    if (!pkName || !entity) {
      return { pkName, pkValue: undefined };
    }
    const raw = entity[pkName];
    const pkValue = raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
    return { pkName, pkValue };
  }

  /**
   * Serializza il record per JSON HTTP:
   *   - include solo le colonne definite in `metaInfo.columnMetadata` (evita
   *     di mandare `__new`, `__guid`, `__changes`, subject/observabili e campi
   *     lookup `*__lookup_obj` non mappati sul modello EF lato server)
   *   - unwrappa eventuali BehaviorSubject (`{ value }`) al loro valore
   *     scalare, cosi' il JSON e' "piatto" come il modello SQL si aspetta.
   */
  private toJsonSafe(entity: any, scope: DataSourceComponent): any {
    const body: any = {};
    (scope.metaInfo?.columnMetadata || []).forEach((col) => {
      const name = col.mc_nome_colonna;
      if (!name || !Object.prototype.hasOwnProperty.call(entity, name)) {
        return;
      }
      const raw = entity[name];
      body[name] = raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
    });
    return body;
  }

  /**
   * Formatta un valore di chiave per URL OData: numerici/booleani nudi,
   * stringhe single-quoted con escape (`'` -> `''`). GUID trattati come
   * stringa (OData v4 accetta guid'xxx' o 'xxx' — adottiamo quest'ultima
   * forma per non dover distinguere).
   */
  private formatODataKey(value: any): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    const s = String(value);
    const numeric = Number(s);
    if (!Number.isNaN(numeric) && String(numeric) === s.trim()) {
      return s.trim();
    }
    return `'${s.replace(/'/g, "''")}'`;
  }
}
