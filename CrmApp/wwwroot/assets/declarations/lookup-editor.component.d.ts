import { AfterViewInit, ChangeDetectorRef, OnInit } from '@angular/core';
import { DataSourceComponent } from '../../data-source/data-source.component';
import { AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { IFieldEditor } from '../../../class/IFieldEditor';
import { BehaviorSubject } from 'rxjs';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { TranslationManagerService } from '../../../service/translation-manager.service';
import * as i0 from "@angular/core";
export declare class LookupEditorComponent implements IFieldEditor, AfterViewInit, OnInit {
    private trslSrv;
    private cd;
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    field: MetadatiColonna;
    metaInfo: any;
    isFilter?: boolean;
    nestedIndex: number;
    triggerProp: BehaviorSubject<any>;
    readOnly: boolean;
    nestedSource: DataSourceComponent;
    items: any[];
    clientItems: any[];
    valore: any;
    lookupValue: any;
    loaded: boolean;
    constructor(trslSrv: TranslationManagerService, cd: ChangeDetectorRef);
    ngOnInit(): void;
    ngAfterViewInit(): void;
    search(event: AutoCompleteCompleteEvent): Promise<void>;
    modelChangeFn($event: any, removed?: boolean): Promise<void>;
    onBlur(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<LookupEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<LookupEditorComponent, "wuic-lookup-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=lookup-editor.component.d.ts.map