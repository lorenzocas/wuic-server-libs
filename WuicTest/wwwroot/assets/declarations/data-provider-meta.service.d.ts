import { DataSourceComponent } from '../component/data-source/data-source.component';
import { ComboParams } from '../class/comboParams';
import { MetadatiColonna } from '../class/metadati_colonna';
import { rawPagedResult } from '../class/rawPagedResult';
import { ResultInfo } from '../class/resultInfo';
import { HttpClient } from '@angular/common/http';
import { FilterInfo } from '../class/filterInfo';
import { SortInfo } from '../class/sortInfo';
import * as i0 from "@angular/core";
export declare class DataProviderMetaService {
    private _http;
    http: HttpClient;
    constructor(_http: HttpClient);
    select(scope: DataSourceComponent, userId: number, all: boolean, resultInfo?: ResultInfo, hideBusy?: any): Promise<ResultInfo>;
    selectByRoute(userId: number, route: string, filterInfo?: FilterInfo, sortInfo?: SortInfo[], pageSize?: number, currentPage?: number): Promise<ResultInfo>;
    getComboData(scope: ComboParams, UserInfo: any, currentRecord: any, field: MetadatiColonna, filterString: string): Promise<rawPagedResult>;
    update(entity: any, pristine: any, scope: DataSourceComponent, UserInfo: any): Promise<any>;
    insert(entity: any, scope: DataSourceComponent, userId: number): Promise<any>;
    clone(entity: any, scope: DataSourceComponent, userId: number, relatedRouteToClone: any[]): Promise<any>;
    delete(entity: any, scope: DataSourceComponent, userId: number): Promise<any>;
    static ɵfac: i0.ɵɵFactoryDeclaration<DataProviderMetaService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<DataProviderMetaService>;
}
//# sourceMappingURL=data-provider-meta.service.d.ts.map