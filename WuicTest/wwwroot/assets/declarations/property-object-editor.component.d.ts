import { OnInit } from '@angular/core';
import { TranslationManagerService } from '../../../service/translation-manager.service';
import { BehaviorSubject } from 'rxjs';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { MetaInfo } from '../../../class/metaInfo';
import { IDesignerProperties } from '../../../class/IDesignerProperties';
import * as i0 from "@angular/core";
export declare class PropertyObjectEditorComponent implements OnInit {
    private trnsl;
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    field: MetadatiColonna;
    metaInfo: MetaInfo;
    isFilter?: boolean;
    nestedIndex: number;
    triggerProp: BehaviorSubject<any>;
    readOnly: boolean;
    nestedMetaInfo: MetaInfo;
    nestedObj: IDesignerProperties;
    valore: any;
    constructor(trnsl: TranslationManagerService);
    ngOnInit(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<PropertyObjectEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<PropertyObjectEditorComponent, "wuic-property-object-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=property-object-editor.component.d.ts.map