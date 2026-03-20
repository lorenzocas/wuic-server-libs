import { EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { MetaInfo } from '../../class/metaInfo';
import * as i0 from "@angular/core";
export declare class ArchetypeConfiguratorComponent implements OnChanges {
    visible: boolean;
    visibleChange: EventEmitter<boolean>;
    archetype: string;
    metaInfo: MetaInfo | null;
    value: any;
    applyConfig: EventEmitter<any>;
    readonly chartTypes: string[];
    readonly legendPositions: string[];
    readonly animationEasings: string[];
    mapDraft: any;
    carouselDraft: any;
    chartDraft: any;
    ngOnChanges(changes: SimpleChanges): void;
    close(): void;
    apply(): void;
    get fieldCandidates(): any[];
    private syncDraftFromValue;
    private buildChartOptionsFromDraft;
    private toNumber;
    private toNullableNumber;
    private unwrapValue;
    static ɵfac: i0.ɵɵFactoryDeclaration<ArchetypeConfiguratorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<ArchetypeConfiguratorComponent, "wuic-archetype-configurator", never, { "visible": { "alias": "visible"; "required": false; }; "archetype": { "alias": "archetype"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "value": { "alias": "value"; "required": false; }; }, { "visibleChange": "visibleChange"; "applyConfig": "applyConfig"; }, never, never, true, never>;
}
//# sourceMappingURL=archetype-configurator.component.d.ts.map