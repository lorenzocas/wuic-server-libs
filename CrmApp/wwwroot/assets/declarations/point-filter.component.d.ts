import { GoogleMap } from '@angular/google-maps';
import { MetaInfo } from '../../../class/metaInfo';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { BehaviorSubject } from 'rxjs';
import { DataSourceComponent } from '../../data-source/data-source.component';
import * as i0 from "@angular/core";
export declare class PointFilterComponent {
    record?: any;
    field: MetadatiColonna;
    metaInfo: MetaInfo;
    datasource?: BehaviorSubject<DataSourceComponent>;
    map?: GoogleMap;
    dialogVisible: boolean;
    mapCenter: google.maps.LatLngLiteral;
    mapZoom: number;
    private drawingManager?;
    private activePolygon?;
    private activeCircle?;
    pendingOperator: 'maparea' | 'mapdistance' | null;
    pendingValue: string | null;
    openDialog(): void;
    closeDialog(): void;
    initDrawingTools(): Promise<void>;
    drawArea(): void;
    drawCircle(): void;
    applyFilter(): Promise<void>;
    clearFilter(): void;
    clearShapes(): void;
    private toPolygonWkt;
    private toCircleExpression;
    private extractCenterFromFilterValue;
    static ɵfac: i0.ɵɵFactoryDeclaration<PointFilterComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<PointFilterComponent, "wuic-point-filter", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "datasource": { "alias": "datasource"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=point-filter.component.d.ts.map