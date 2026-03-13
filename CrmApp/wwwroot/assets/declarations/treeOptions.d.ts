import { BehaviorSubject } from "rxjs";
import { IDesignerProperties } from "./IDesignerProperties";
import { MetaInfo } from "./metaInfo";
export declare class TreeOptions implements IDesignerProperties {
    parentField: string;
    labelField: string;
    iconField: string;
    leafField: string;
    labelFunction: string;
    itemTemplateString: string;
    constructor();
    init(metaInfo: MetaInfo): void;
    archetypePropName: string;
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo;
}
//# sourceMappingURL=treeOptions.d.ts.map