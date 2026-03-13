import { BehaviorSubject } from "rxjs";
import { MetaInfo } from "./metaInfo";
export interface IDesignerProperties {
    archetypePropName: string;
    init(metaInfo: MetaInfo, nestedIndex?: number): any;
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<string>): MetaInfo;
}
//# sourceMappingURL=IDesignerProperties.d.ts.map