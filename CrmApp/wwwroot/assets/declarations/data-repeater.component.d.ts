import { EventEmitter, OnInit } from '@angular/core';
import { DataSourceComponent } from '../data-source/data-source.component';
import { BehaviorSubject } from 'rxjs';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { Table } from 'primeng/table';
import * as i0 from "@angular/core";
export declare class DataRepeaterComponent implements OnInit {
    datasource: BehaviorSubject<DataSourceComponent>;
    hardcodedDatasource: DataSourceComponent;
    action: BehaviorSubject<string>;
    hardcodedAction: string;
    field: MetadatiColonna;
    record: any;
    rowCustomSelect: (rowData: any, $event: any, dt: Table) => void;
    templateReady: EventEmitter<string>;
    archetype: string;
    archetypes: {
        [key: string]: {
            markup: string;
            component: any;
            designerOptions?: any;
        };
    };
    repeaterTemplate: any;
    constructor();
    private normalizeArchetypeAction;
    private resolveArchetype;
    private renderArchetype;
    ngOnInit(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<DataRepeaterComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DataRepeaterComponent, "wuic-data-repeater", never, { "datasource": { "alias": "datasource"; "required": false; }; "hardcodedDatasource": { "alias": "hardcodedDatasource"; "required": false; }; "action": { "alias": "action"; "required": false; }; "hardcodedAction": { "alias": "hardcodedAction"; "required": false; }; "field": { "alias": "field"; "required": false; }; "record": { "alias": "record"; "required": false; }; "rowCustomSelect": { "alias": "rowCustomSelect"; "required": false; }; }, { "templateReady": "templateReady"; }, never, never, true, never>;
}
//# sourceMappingURL=data-repeater.component.d.ts.map