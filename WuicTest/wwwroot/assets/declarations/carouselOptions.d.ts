import { IDesignerProperties } from "./IDesignerProperties";
import { MetaInfo } from "./metaInfo";
import { BehaviorSubject } from "rxjs";
export declare class CarouselOptions implements IDesignerProperties {
    imageFieldName: string;
    descriptionFieldName: string;
    imageWidth: number;
    pageSize: number;
    numVisible: number;
    numScroll: number;
    usePreview: boolean;
    responsiveOptions: ResponsiveOption[];
    itemTemplateString: string;
    constructor();
    init(metaInfo: MetaInfo): void;
    archetypePropName: string;
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo;
}
export declare class ResponsiveOption implements IDesignerProperties {
    breakpoint: string;
    numVisible: number;
    numScroll: number;
    archetypePropName: string;
    constructor();
    init(metaInfo: MetaInfo): void;
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo;
}
//# sourceMappingURL=carouselOptions.d.ts.map