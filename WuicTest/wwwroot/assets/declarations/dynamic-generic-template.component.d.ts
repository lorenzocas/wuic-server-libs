import '@angular/compiler';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { MetaInfo } from '../../class/metaInfo';
import { DataSourceComponent } from '../data-source/data-source.component';
import * as i0 from "@angular/core";
export declare class DynamicGenericTemplateComponent {
    rowData: any;
    columns: MetadatiColonna[];
    expanded: boolean;
    metaInfo: MetaInfo;
    datasource: DataSourceComponent;
    getDescription: Function;
    MetadatiColonna: typeof MetadatiColonna;
    findColumn(columnName: string): MetadatiColonna | null;
    getFieldValue(record: any, fieldName: string): any;
    get classes(): string | null;
    static getComponentFromTemplate(template: string): typeof DynamicGenericTemplateComponent;
    static ɵfac: i0.ɵɵFactoryDeclaration<DynamicGenericTemplateComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DynamicGenericTemplateComponent, "wuic-dynamic-generic-template", never, { "rowData": { "alias": "rowData"; "required": false; }; "columns": { "alias": "columns"; "required": false; }; "expanded": { "alias": "expanded"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "datasource": { "alias": "datasource"; "required": false; }; "getDescription": { "alias": "getDescription"; "required": false; }; "MetadatiColonna": { "alias": "MetadatiColonna"; "required": false; }; }, {}, never, never, false, never>;
}
//# sourceMappingURL=dynamic-generic-template.component.d.ts.map