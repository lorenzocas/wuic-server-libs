import { BehaviorSubject } from 'rxjs';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { MetaInfo } from '../../../class/metaInfo';
import * as i0 from "@angular/core";
export declare class CodeAreaEditorComponent {
    record?: {
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
    toggleEditor(): boolean;
    static ɵfac: i0.ɵɵFactoryDeclaration<CodeAreaEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<CodeAreaEditorComponent, "lib-code-area-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=code-area-editor.component.d.ts.map