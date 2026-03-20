import { AfterViewInit } from '@angular/core';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { MetaInfo } from '../../../class/metaInfo';
import { BehaviorSubject } from 'rxjs';
import { IFieldEditor } from '../../../class/IFieldEditor';
import * as i0 from "@angular/core";
export declare class TextAreaEditorComponent implements IFieldEditor, AfterViewInit {
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    field: MetadatiColonna;
    metaInfo: MetaInfo;
    isFilter?: boolean;
    nestedIndex: number;
    triggerProp: BehaviorSubject<any>;
    readOnly: boolean;
    valore: any;
    constructor();
    ngAfterViewInit(): void;
    modelChangeFn($event: any): Promise<void>;
    onBlur(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<TextAreaEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<TextAreaEditorComponent, "wuic-text-area-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=text-area-editor.component.d.ts.map