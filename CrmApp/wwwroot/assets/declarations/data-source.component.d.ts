import { OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { DataProviderService } from '../../service/data-provider.service';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { ResultInfo } from '../../class/resultInfo';
import { MetaInfo } from '../../class/metaInfo';
import { FilterInfo } from '../../class/filterInfo';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { MetadatiConditionGroup, MetadatiConditionGroupAction } from '../../class/metadati_condition_group';
import { ValueChangedPayload } from '../../class/IFieldEditor';
import { SortInfo } from '../../class/sortInfo';
import { GroupInfo } from '../../class/groupInfo';
import { AggregationInfo } from '../../class/aggregationInfo';
import { TrackedChange } from '../../class/trackedChanges';
import { UpdateInfo } from '../../class/updateInfo';
import * as i0 from "@angular/core";
export declare class DataSourceComponent implements OnInit, OnDestroy {
    private metaSrv;
    private dataSrv;
    private trnsl;
    private router;
    private aRoute;
    route: BehaviorSubject<string>;
    routeFromRouting: boolean;
    hardcodedRoute: string;
    autoload?: boolean;
    loading: BehaviorSubject<boolean>;
    changeTracking?: boolean;
    parentRecord: any;
    parentMetaInfo: MetaInfo;
    parentDatasource: DataSourceComponent;
    componentRef: BehaviorSubject<{
        component: DataSourceComponent;
        id: number;
        name: string;
        uniqueName: string;
    }>;
    sortInfo: SortInfo[];
    groupInfo: GroupInfo[];
    aggregationInfo: AggregationInfo[];
    filterInfo?: FilterInfo;
    pageSize: number;
    currentPage: number;
    filterParam: string;
    isCurrentInsert: boolean;
    metaInfo: MetaInfo;
    resultInfo: ResultInfo;
    filterDescriptor: {
        [key: string]: BehaviorSubject<any>;
    };
    changes: TrackedChange[];
    interval: any;
    private lastFilterInfoQueryRaw?;
    private lastPageInfoQueryRaw?;
    private lastSortInfoQueryRaw?;
    fetchInfo: BehaviorSubject<{
        resultInfo: ResultInfo;
        metaInfo: MetaInfo;
        filterDescriptor: {
            [key: string]: BehaviorSubject<any>;
        };
    }>;
    pristine: any;
    clientSideCrudActive: boolean;
    lastClientSideCrudSyncResult?: {
        inserted: number;
        updated: number;
        deleted: number;
    };
    constructor(metaSrv: MetadataProviderService, dataSrv: DataProviderService, trnsl: TranslationManagerService, router: Router, aRoute: ActivatedRoute);
    private init;
    private applyFilterInfoFromQueryString;
    private applyPageInfoFromQueryString;
    private applySortInfoFromQueryString;
    private applyFilterInfoToFilterDescriptor;
    ngOnInit(): void;
    ngOnDestroy(): void;
    static getObservable(dato: any, metaInfo: MetaInfo): {
        [key: string]: BehaviorSubject<any>;
    };
    getObservable(dato?: any): {
        [key: string]: BehaviorSubject<any>;
    };
    static getModelFromObservable(dato: any, metaInfo: MetaInfo): {};
    getModelFromObservable(dato: any): {};
    private getMetadata;
    getData(): Promise<void>;
    canUseClientSideCrud(): boolean;
    enableClientSideCrud(): Promise<void>;
    disableClientSideCrud(): Promise<{
        inserted: number;
        updated: number;
        deleted: number;
    }>;
    disableClientSideCrudWithoutSync(): Promise<void>;
    getSchemaAndData(schemaOnly?: boolean): Promise<void>;
    fetchData(): Promise<{
        resultInfo: ResultInfo;
        metaInfo: MetaInfo;
        filterDescriptor: {
            [key: string]: BehaviorSubject<any>;
        };
        groupInfo: GroupInfo[];
        sortInfo: SortInfo[];
        aggregationInfo: AggregationInfo[];
    }>;
    parseTabs(): void;
    parseNestedRoutes(): void;
    parseValidations(): void;
    validateData(record: {
        [key: string]: BehaviorSubject<any>;
    }): Promise<void>;
    groupBy(xs: any[], key: string): any;
    private isObservableField;
    private getConditionOperandValue;
    private setConditionOperandValue;
    private normalizeConditionOperator;
    parseConditions(): void;
    evaluateConditions(groupedConditions: {
        [CG_Id: number]: {
            ConditionItems: MetadatiConditionGroup[];
            ConditionActions: MetadatiConditionGroupAction[];
        };
    }, payload: ValueChangedPayload, all: boolean): void;
    getCodeRepresentation(field: MetadatiColonna, value: any): string;
    private executeConditionalActions;
    syncData(entita: any, original: any, deleting?: boolean, cloning?: boolean): Promise<UpdateInfo>;
    private executeAfterSyncCallback;
    private canProceedBeforeSync;
    private notifyMenuMetadataChanged;
    exportXls(): Promise<any>;
    setCurrent(data: any): void;
    addNewRecord(record?: any): {
        [key: string]: BehaviorSubject<any>;
    };
    clearColumnFilter(col: MetadatiColonna, fetch?: boolean): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<DataSourceComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DataSourceComponent, "wuic-data-source", never, { "route": { "alias": "route"; "required": false; }; "routeFromRouting": { "alias": "routeFromRouting"; "required": false; }; "hardcodedRoute": { "alias": "hardcodedRoute"; "required": false; }; "autoload": { "alias": "autoload"; "required": false; }; "loading": { "alias": "loading"; "required": false; }; "changeTracking": { "alias": "changeTracking"; "required": false; }; "parentRecord": { "alias": "parentRecord"; "required": false; }; "parentMetaInfo": { "alias": "parentMetaInfo"; "required": false; }; "parentDatasource": { "alias": "parentDatasource"; "required": false; }; "componentRef": { "alias": "componentRef"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=data-source.component.d.ts.map