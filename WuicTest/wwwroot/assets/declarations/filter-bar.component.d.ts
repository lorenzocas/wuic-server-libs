import { OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { MetaInfo } from '../../class/metaInfo';
import { BehaviorSubject } from 'rxjs';
import { DataSourceComponent } from '../data-source/data-source.component';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { SortInfo } from '../../class/sortInfo';
import * as i0 from "@angular/core";
export declare class FilterBarComponent implements OnInit, OnChanges, OnDestroy {
    private router;
    private aroute;
    private location;
    datasource: BehaviorSubject<DataSourceComponent>;
    hardcodedDatasource: DataSourceComponent;
    filterDescriptor: {
        [key: string]: BehaviorSubject<any>;
    };
    metas: MetadatiColonna[];
    metaInfo: MetaInfo;
    selectedGroupColumn: MetadatiColonna;
    selectedAggregateColumn: MetadatiColonna;
    aggregations: {
        label: string;
        value: string;
    }[];
    selectedAggregation: string;
    selectedSortColumn: MetadatiColonna;
    selectedSortDir: 'asc' | 'desc';
    sortDirections: {
        label: string;
        value: 'asc' | 'desc';
    }[];
    pageSize: number;
    pageSizeOptions: {
        label: string;
        value: number;
    }[];
    private datasourceSubscription?;
    private fetchInfoSubscription?;
    private boundDatasource?;
    constructor(router: Router, aroute: ActivatedRoute, location: Location);
    ngOnInit(): void;
    ngOnChanges(changes: SimpleChanges): void;
    ngOnDestroy(): void;
    private bindToDatasource;
    private subscribeToDatasource;
    private isFilterable;
    filter(): Promise<void>;
    clearFilter(): Promise<void>;
    addGroupField(): void;
    addAggregateField(): void;
    clearGroups(): void;
    getSortLabel(sort: SortInfo): string;
    addSortField(): void;
    removeSortField(index: number): void;
    clearSorting(): void;
    applySorting(): Promise<void>;
    private buildPageSizeOptions;
    private hasGroupingApplied;
    private getTotalForPageSize;
    applyPageSize(): Promise<void>;
    resetPageSize(): Promise<void>;
    private syncGridStateQueryString;
    static ɵfac: i0.ɵɵFactoryDeclaration<FilterBarComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<FilterBarComponent, "wuic-filter-bar", never, { "datasource": { "alias": "datasource"; "required": false; }; "hardcodedDatasource": { "alias": "hardcodedDatasource"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=filter-bar.component.d.ts.map