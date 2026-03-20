import { HttpClient } from '@angular/common/http';
import { ResultInfo } from '../class/resultInfo';
import { MetadatiColonna } from '../class/metadati_colonna';
import { DataSourceComponent } from '../component/data-source/data-source.component';
import { ComboParams } from '../class/comboParams';
import { DataProviderOdataService } from './data-provider-odata.service';
import { DataProviderMetaService } from './data-provider-meta.service';
import { DataProviderWebserviceService } from './data-provider-webservice.service';
import { UserInfoService } from './user-info.service';
import { SortInfo } from '../class/sortInfo';
import { FilterItem } from '../class/filterItem';
import * as i0 from "@angular/core";
export declare class DataProviderService {
    private http;
    private odataSrv;
    private dataMetaSrv;
    private webDataSrv;
    private userInfo;
    constructor(http: HttpClient, odataSrv: DataProviderOdataService, dataMetaSrv: DataProviderMetaService, webDataSrv: DataProviderWebserviceService, userInfo: UserInfoService);
    selectByRoute(route: string, filters?: FilterItem[], sortInfo?: SortInfo[], pageSize?: number, currentPage?: number): Promise<ResultInfo>;
    select(scope: DataSourceComponent, all: boolean, resultInfo?: ResultInfo, hideBusy?: any): Promise<ResultInfo>;
    getComboData(scope: ComboParams, currentRecord: any, field: MetadatiColonna, filterString: string): Promise<import("../class/rawPagedResult").rawPagedResult>;
    insert(entity: any, scope: DataSourceComponent): Promise<ResultInfo>;
    update(entity: any, pristine: any, scope: DataSourceComponent): Promise<ResultInfo>;
    delete(entity: any, scope: DataSourceComponent): Promise<ResultInfo>;
    clone(entity: any, scope: DataSourceComponent, relatedRouteToClone: any[]): Promise<ResultInfo>;
    exportXls(route: any, filterInfo: any, progressGuid: any): Promise<any>;
    static ɵfac: i0.ɵɵFactoryDeclaration<DataProviderService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<DataProviderService>;
}
//# sourceMappingURL=data-provider.service.d.ts.map