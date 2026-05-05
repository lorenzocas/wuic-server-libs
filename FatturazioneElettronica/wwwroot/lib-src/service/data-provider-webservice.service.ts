import { Injectable } from '@angular/core';
import { DataSourceComponent } from '../component/data-source/data-source.component';
import { MetadataProviderService } from './metadata-provider.service';
import { ComboParams } from '../class/comboParams';
import { MetadatiColonna } from '../class/metadati_colonna';
import { rawPagedResult } from '../class/rawPagedResult';
import { ResultInfo } from '../class/resultInfo';
import { HttpClient } from '@angular/common/http';
import { UserInfo } from '../class/userInfo';
import { WtoolboxService } from './wtoolbox.service';

@Injectable({
  providedIn: 'root'
})
export class DataProviderWebserviceService {

  constructor(private http: HttpClient) { }

  /**
   * Esegue l'operazione dati implementata da `select`.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @param all Flag che abilita caricamento completo dataset.
   * @param resultInfo Struttura risultato da popolare/aggiornare.
   * @param hideBusy Flag/handler per gestione busy indicator UI.
   */
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

    let method = scope.metaInfo.tableMetadata.extraProps.endpoint.method;
    let uri: string = WtoolboxService.appSettings.api_url + scope.metaInfo.tableMetadata.extraProps.endpoint.uri;
    let parameterMapping = scope.metaInfo.tableMetadata.extraProps.endpoint.parameterMapping;

    let result;

    let missingParams = false;

    let postParams = {};

    if (parameterMapping) {
      parameterMapping.forEach((mapping) => {
        if (mapping.source.required) {
          if (scope.filterInfo && scope.filterInfo.filters) {
            let matchFilter = scope.filterInfo.filters.find((filter) => filter.field == mapping.target.name);
            if (!matchFilter || matchFilter.value === null) {
              missingParams = true;
            } else {
              postParams[mapping.target.name] = matchFilter.value;
            }
          } else {
            missingParams = true;
          }
        }
      });
    }

    if (missingParams) {
      // Defensive skip (parametro dipendente non ancora valorizzato — es. lookup
      // database prima che connection sia selezionata). NON e' un errore: e'
      // solo un'attesa. Lowered da console.log a console.debug per togliere
      // noise dalla console DevTools del cliente.
      console.debug("[data-provider-webservice] skipping fetch — missing required parameters for endpoint:", uri);
      return null;
    }

    if (method == "post") {
      result = await (this.http.post(uri, postParams).toPromise() as Promise<any>);
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
   * Esegue l'operazione dati implementata da `update`.
   * Legge/scrive dati persistenti su storage browser.
   * @param entity Entita dati target della mutazione.
   * @param pristine Copia originale dell'entita per diff/update.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param UserInfo Contesto utente da inoltrare al backend webservice.
   * @returns Valore restituito dal metodo (Promise<any>).
   */
  async update(entity, pristine, scope: DataSourceComponent, UserInfo): Promise<any> {
    let route = scope.metaInfo.tableMetadata.md_route_name;

    entity["__original"] = pristine;

    scope.loading.next(true);
    let clonedEntity;

    throw new Error("Method not implemented.");

    let data = await (this.http.post(
      MetadataProviderService.updateUri,
      {
        route: route,
        user_id: UserInfo.user_id,
        entity: clonedEntity || entity
      }
    ).toPromise() as Promise<any>);

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
   * Esegue l'operazione dati implementata da `insert`.
   * Legge/scrive dati persistenti su storage browser.
   * @param entity Entita dati target della mutazione.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param userId Identificativo utente usato per contesto e persistenza.
   */
  async insert(entity, scope: DataSourceComponent, userId: number) {
    let route = scope.metaInfo.tableMetadata.md_route_name;
    // entity["__original"] = scope.pristine.current; // manage optimistic concurrency

    // var crudInsertRequestId = wtoolbox.ui.toggleBusy();
    scope.loading.next(true);

    let clonedEntity;

    throw new Error("Method not implemented.");

    let data = await (this.http.post(
      MetadataProviderService.createUri,
      {
        route: route,
        user_id: userId,
        entity: clonedEntity || entity
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
      localStorage.clear();

      scope.getSchemaAndData();
    } else {
      scope.fetchData();
    }

    scope.loading.next(false);

    return data;

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
  async delete(entity, scope: DataSourceComponent, userId: number) {
    // entity["__original"] = scope.pristine.current; // manage optimistic concurrency

    // var crudDeleteRequestId = wtoolbox.ui.toggleBusy();
    scope.loading.next(true);

    let clonedEntity;

    throw new Error("Method not implemented.");

    let data = await (this.http.post(
      MetadataProviderService.deleteUri,
      {
        route: scope.metaInfo.tableMetadata.md_route_name,
        user_id: userId,
        entity: clonedEntity || entity
      }
    ).toPromise() as Promise<any>);

    if (MetadataProviderService.isMetaRoute(scope.metaInfo.tableMetadata.md_route_name)) {
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
}
