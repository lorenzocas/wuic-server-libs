import '@angular/compiler';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { MetaInfo } from '../../class/metaInfo';
import { DataSourceComponent } from '../data-source/data-source.component';
import { Table } from 'primeng/table';
import * as i0 from "@angular/core";
export declare class DynamicRowTemplateComponent {
    private static readonly tableStyleConditionCache;
    private static readonly columnStyleConditionCache;
    rowData: any;
    columns: MetadatiColonna[];
    expanded: boolean;
    metaInfo: MetaInfo;
    datasource: DataSourceComponent;
    dt: Table;
    toggleRow: (rowData: any, $event: any, dt: Table) => void;
    rowSelect: (rowData: any, $event: any, dt: Table) => void;
    rowCustomSelect: (rowData: any, $event: any, dt: Table) => void;
    MetadatiColonna: typeof MetadatiColonna;
    get classes(): string | null;
    private getTableStyleClasses;
    private buildTableStylePredicate;
    getCellClasses(metaColumn: any, rowData: any): string | null;
    getMetaColumn(fieldName: string): MetadatiColonna | null;
    static getComponentFromTemplate(template: string): typeof DynamicRowTemplateComponent;
    onRowSelect($event: any, rowData: any): void;
    private isSelectedRow;
    private areSameRow;
    static ɵfac: i0.ɵɵFactoryDeclaration<DynamicRowTemplateComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DynamicRowTemplateComponent, "wuic-dynamic-row-template", never, { "rowData": { "alias": "rowData"; "required": false; }; "columns": { "alias": "columns"; "required": false; }; "expanded": { "alias": "expanded"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "datasource": { "alias": "datasource"; "required": false; }; "dt": { "alias": "dt"; "required": false; }; "toggleRow": { "alias": "toggleRow"; "required": false; }; "rowSelect": { "alias": "rowSelect"; "required": false; }; "rowCustomSelect": { "alias": "rowCustomSelect"; "required": false; }; "MetadatiColonna": { "alias": "MetadatiColonna"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=dynamic-template.component.d.ts.map