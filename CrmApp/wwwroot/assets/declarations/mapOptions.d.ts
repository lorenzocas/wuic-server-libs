import { BehaviorSubject } from "rxjs";
import { IDesignerProperties } from "./IDesignerProperties";
import { MetaInfo } from "./metaInfo";
export declare class MapOptions implements IDesignerProperties {
    mapId: string;
    zoom: number;
    center: Point;
    minZoom: number;
    maxZoom: number;
    useCurrentLocation: boolean;
    useClusterer: boolean;
    filterByBoundaries: boolean;
    customMarkerImageSrc: string;
    customMarkerImageSrcField: string;
    markerContentCallback: string;
    titleField: string;
    infoField: string;
    infoFunction: string;
    itemTemplateString: string;
    constructor();
    init(metaInfo: MetaInfo): void;
    archetypePropName: string;
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo;
}
export declare class Point {
    lat: number;
    lng: number;
    archetypePropName: string;
    constructor();
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo;
}
//# sourceMappingURL=mapOptions.d.ts.map