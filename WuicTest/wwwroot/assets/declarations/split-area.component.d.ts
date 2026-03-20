import { Signal } from '@angular/core';
import { SplitComponent } from '../split/split.component';
import { SplitAreaSize } from '../split/helpers/models';
import * as i0 from "@angular/core";
export declare class SplitAreaComponent {
    protected readonly split: SplitComponent;
    readonly size: import("@angular/core").InputSignalWithTransform<"auto" | SplitAreaSize, import("../split/helpers/models").SplitAreaSizeInput>;
    readonly minSize: import("@angular/core").InputSignalWithTransform<SplitAreaSize, import("../split/helpers/models").SplitAreaSizeInput>;
    readonly maxSize: import("@angular/core").InputSignalWithTransform<SplitAreaSize, import("../split/helpers/models").SplitAreaSizeInput>;
    readonly lockSize: import("@angular/core").InputSignalWithTransform<boolean, unknown>;
    readonly visible: import("@angular/core").InputSignalWithTransform<boolean, unknown>;
    /**
     * @internal
     */
    readonly _internalSize: import("../split/helpers/utils").MirrorSignal<SplitAreaSize>;
    /**
     * @internal
     */
    readonly _normalizedMinSize: Signal<number>;
    /**
     * @internal
     */
    readonly _normalizedMaxSize: Signal<number>;
    private readonly index;
    private readonly gridAreaNum;
    private readonly hostClasses;
    protected get hostClassesBinding(): string;
    protected get hostGridColumnStyleBinding(): string;
    protected get hostGridRowStyleBinding(): string;
    protected get hostPositionStyleBinding(): string;
    private normalizeMinSize;
    private normalizeMaxSize;
    private normalizeSizeBoundary;
    static ɵfac: i0.ɵɵFactoryDeclaration<SplitAreaComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<SplitAreaComponent, "p-splitter-area", never, { "size": { "alias": "size"; "required": false; "isSignal": true; }; "minSize": { "alias": "minSize"; "required": false; "isSignal": true; }; "maxSize": { "alias": "maxSize"; "required": false; "isSignal": true; }; "lockSize": { "alias": "lockSize"; "required": false; "isSignal": true; }; "visible": { "alias": "visible"; "required": false; "isSignal": true; }; }, {}, never, ["*"], true, never>;
}
//# sourceMappingURL=split-area.component.d.ts.map