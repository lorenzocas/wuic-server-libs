import { BehaviorSubject } from "rxjs";
import type { MetadatiColonna } from "./metadati_colonna";
import type { MetaInfo } from "./metaInfo";
import type { DataSourceComponent } from "../component/data-source/data-source.component";
export interface IFieldEditor {
    record?: {
        [key: string]: BehaviorSubject<any>;
    };
    field?: MetadatiColonna;
    metaInfo?: MetaInfo;
    nestedSource?: DataSourceComponent;
    valore: any;
    lookupValue?: any;
    items?: any[];
    loaded?: boolean;
}
export declare class ValueChangedPayload {
    field: MetadatiColonna;
    newValue: any;
    oldValue?: any;
}
//# sourceMappingURL=IFieldEditor.d.ts.map