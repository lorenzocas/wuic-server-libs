import { BehaviorSubject } from "rxjs";
import { MetaInfo } from "./metaInfo";
import { DataSourceComponent } from "../component/data-source/data-source.component";
import { DynamicGenericTemplateComponent } from "../component/dynamic-generic-template/dynamic-generic-template.component";
export interface IBindable {
    hardcodedRoute: string;
    parentRecord: any;
    parentMetaInfo: MetaInfo;
    datasource: BehaviorSubject<DataSourceComponent>;
    hardcodedDatasource: DataSourceComponent;
    metaInfo: MetaInfo;
    data: any[];
    itemTemplateString: string;
    itemTemplate: typeof DynamicGenericTemplateComponent;
    subscribeToDS(): void;
    parseData(dato: any[]): any[];
}
//# sourceMappingURL=IBindable.d.ts.map