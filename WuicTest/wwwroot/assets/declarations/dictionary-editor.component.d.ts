import { ElementRef, OnInit } from '@angular/core';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { TranslationManagerService } from '../../../service/translation-manager.service';
import { MetaInfo } from '../../../class/metaInfo';
import { BehaviorSubject } from 'rxjs';
import * as i0 from "@angular/core";
export declare class DictionaryEditorComponent implements OnInit {
    private trnSrv;
    private hostEl;
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
    items: any[];
    lookupProps: any;
    constructor(trnSrv: TranslationManagerService, hostEl: ElementRef<HTMLElement>);
    private isNumericDbType;
    private coerceDictionaryValue;
    private normalizeCurrentValueType;
    ngOnInit(): void;
    ngAfterViewInit(): void;
    modelChangeFn($event: any): Promise<void>;
    onBlur(): void;
    onSelectShow(event?: any): void;
    onSelectHide(event?: any): void;
    private getActiveOverlay;
    static ɵfac: i0.ɵɵFactoryDeclaration<DictionaryEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DictionaryEditorComponent, "wuic-dictionary-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=dictionary-editor.component.d.ts.map