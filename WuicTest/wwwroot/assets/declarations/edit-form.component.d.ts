import { OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { DataSourceComponent } from '../data-source/data-source.component';
import { MetaInfo } from '../../class/metaInfo';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import * as i0 from "@angular/core";
export declare class EditFormComponent implements OnInit, OnChanges, OnDestroy {
    ref: DynamicDialogRef | null;
    config: DynamicDialogConfig | null;
    private route;
    private router;
    datasource: BehaviorSubject<DataSourceComponent>;
    hardcodedDatasource: DataSourceComponent;
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    metas: MetadatiColonna[];
    metaInfo: MetaInfo;
    routeName: BehaviorSubject<string>;
    pristine: any;
    formTemplate: any;
    cloning: boolean;
    readOnly: boolean;
    private datasourceSubscription?;
    private fetchInfoSubscription?;
    private boundDatasource?;
    private recordValueSubscriptions;
    private disableCallbacksRunning;
    private disableCallbacksPending;
    constructor(ref: DynamicDialogRef | null, config: DynamicDialogConfig | null, route: ActivatedRoute, router: Router);
    ngOnInit(): void;
    ngOnChanges(changes: SimpleChanges): void;
    ngOnDestroy(): void;
    private bindToDatasource;
    private subscribeToDatasource;
    private applyDatasourceState;
    private clearRecordValueSubscriptions;
    private setupRecordValueSubscriptions;
    private recomputeActionDisabledState;
    getComponent(): any;
    getInputs(field: MetadatiColonna): {
        record: {
            [key: string]: BehaviorSubject<any>;
        };
        field: MetadatiColonna;
        metaInfo: MetaInfo;
        readOnly: boolean;
        forceShowLabel: boolean;
    };
    parseData(data: any): {
        [key: string]: BehaviorSubject<any>;
    };
    parseColumns(columns: MetadatiColonna[]): MetadatiColonna[];
    fieldByTab(metas: MetadatiColonna[], tab: any): MetadatiColonna[];
    submitData(): Promise<void>;
    rollbackChanges(resultInfo: any): void;
    goBack(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<EditFormComponent, [{ optional: true; }, { optional: true; }, null, null]>;
    static ɵcmp: i0.ɵɵComponentDeclaration<EditFormComponent, "wuic-edit-form", never, { "datasource": { "alias": "datasource"; "required": false; }; "hardcodedDatasource": { "alias": "hardcodedDatasource"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=edit-form.component.d.ts.map