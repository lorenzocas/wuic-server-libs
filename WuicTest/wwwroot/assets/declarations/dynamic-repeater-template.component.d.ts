import { Table } from 'primeng/table';
import { DataSourceComponent } from '../data-source/data-source.component';
import { BehaviorSubject } from 'rxjs';
import * as i0 from "@angular/core";
export declare class DynamicRepeaterTemplateComponent {
    datasource: BehaviorSubject<DataSourceComponent>;
    hardcodedDatasource: DataSourceComponent;
    action: BehaviorSubject<string>;
    record: any;
    field: any;
    rowCustomSelect: (rowData: any, $event: any, dt: Table) => void;
    static getComponentFromTemplate(template: string): typeof DynamicRepeaterTemplateComponent;
    static ɵfac: i0.ɵɵFactoryDeclaration<DynamicRepeaterTemplateComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DynamicRepeaterTemplateComponent, "wuic-dynamic-repeater-template", never, { "datasource": { "alias": "datasource"; "required": false; }; "hardcodedDatasource": { "alias": "hardcodedDatasource"; "required": false; }; "action": { "alias": "action"; "required": false; }; "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "rowCustomSelect": { "alias": "rowCustomSelect"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=dynamic-repeater-template.component.d.ts.map