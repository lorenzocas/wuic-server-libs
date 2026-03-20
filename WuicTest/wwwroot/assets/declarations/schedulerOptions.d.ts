import { IDesignerProperties } from "./IDesignerProperties";
import { MetaInfo } from "./metaInfo";
import { BehaviorSubject } from "rxjs";
export declare class SchedulerOptions implements IDesignerProperties {
    fromField: string;
    toField: string;
    titleField: string;
    itemTemplateString: string;
    titleFunction: string;
    constructor();
    init(metaInfo: MetaInfo): void;
    archetypePropName: string;
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo;
}
//# sourceMappingURL=schedulerOptions.d.ts.map