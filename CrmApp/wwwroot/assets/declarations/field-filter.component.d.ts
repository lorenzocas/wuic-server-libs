import { OnInit } from '@angular/core';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { MetadataProviderService } from '../../../service/metadata-provider.service';
import { MetaInfo } from '../../../class/metaInfo';
import { WtoolboxService } from '../../../service/wtoolbox.service';
import { DataSourceComponent } from '../../data-source/data-source.component';
import { BehaviorSubject } from 'rxjs';
import * as i0 from "@angular/core";
export declare class FieldFilterComponent implements OnInit {
    metaSrv: MetadataProviderService;
    record?: any;
    field: MetadatiColonna;
    metaInfo: MetaInfo;
    readOnly?: boolean;
    hideLabel?: boolean;
    operator: string;
    datasource?: BehaviorSubject<DataSourceComponent>;
    widgetDefinition: any;
    widgetMap: {
        [key: string]: {
            component: any;
            width?: string;
            height?: string;
        };
    };
    widget: any;
    wtoolbox: typeof WtoolboxService;
    get classes(): string | null;
    constructor(metaSrv: MetadataProviderService);
    ngOnInit(): void;
    getComponent(): any;
    getInputs(): {
        record: any;
        field: MetadatiColonna;
        metaInfo: MetaInfo;
        isFilter: boolean;
    };
    condition(): any;
    conditionSpan(): boolean;
    setOperator($event: any): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<FieldFilterComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<FieldFilterComponent, "wuic-field-filter", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; "hideLabel": { "alias": "hideLabel"; "required": false; }; "operator": { "alias": "operator"; "required": false; }; "datasource": { "alias": "datasource"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=field-filter.component.d.ts.map