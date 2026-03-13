import { EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import * as i0 from "@angular/core";
type CssStyleRow = {
    Key: string;
    Value: string;
};
type CssClassRow = {
    SelectorString: string;
    ClassNames: string[];
    Styles: CssStyleRow[];
    Media?: string;
};
type CssSheetRow = {
    SheetPath: string;
    classes: CssClassRow[];
};
type StyleProp = {
    key: string;
    type: string;
    values?: string[];
};
export declare class CssSheetEditorComponent implements OnChanges {
    visible: boolean;
    visibleChange: EventEmitter<boolean>;
    sheets: CssSheetRow[];
    selectedSheetPath: string;
    styleProps: StyleProp[];
    assetsFolder: string;
    applyEditor: EventEmitter<{
        sheets: CssSheetRow[];
        selectedSheetPath: string;
    }>;
    draftSheets: CssSheetRow[];
    selectedSheetPathDraft: string;
    selectedClassSelector: string;
    pendingStyleKey: string;
    pendingStyleValue: string;
    newSheetName: string;
    newClassName: string;
    ngOnChanges(changes: SimpleChanges): void;
    close(): void;
    addSheet(): void;
    removeSelectedSheet(): void;
    addClassToSelectedSheet(): void;
    removeSelectedClass(): void;
    addStyleToSelectedClass(): void;
    removeStyle(index: number): void;
    onStyleKeyChanged(style: CssStyleRow): void;
    onStyleValueChanged(): void;
    onPendingStyleKeyChanged(): void;
    getPropertyValues(propKey: string): string[];
    isPropertyDictionary(propKey: string): boolean;
    isPropertyColor(propKey: string): boolean;
    colorPickerValue(value: string): string;
    onPendingColorChanged(value: string): void;
    onStyleColorChanged(style: CssStyleRow, value: string): void;
    onSelectedSheetChanged(): void;
    onSelectedClassChanged(): void;
    private syncDraft;
    private cloneSheets;
    private defaultValueForProperty;
    private normalizePath;
    private buildAssetSheetPath;
    private emitChanges;
    private resetPendingStyle;
    get currentSheet(): CssSheetRow | null;
    get currentClass(): CssClassRow | null;
    static ɵfac: i0.ɵɵFactoryDeclaration<CssSheetEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<CssSheetEditorComponent, "wuic-css-sheet-editor", never, { "visible": { "alias": "visible"; "required": false; }; "sheets": { "alias": "sheets"; "required": false; }; "selectedSheetPath": { "alias": "selectedSheetPath"; "required": false; }; "styleProps": { "alias": "styleProps"; "required": false; }; "assetsFolder": { "alias": "assetsFolder"; "required": false; }; }, { "visibleChange": "visibleChange"; "applyEditor": "applyEditor"; }, never, never, true, never>;
}
export {};
//# sourceMappingURL=css-sheet-editor.component.d.ts.map