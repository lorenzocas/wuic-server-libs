import { ChangeDetectorRef, OnInit } from '@angular/core';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { MetadataProviderService } from '../../../service/metadata-provider.service';
import { MetaInfo } from '../../../class/metaInfo';
import { WtoolboxService } from '../../../service/wtoolbox.service';
import { BehaviorSubject } from 'rxjs';
import { TranslationManagerService } from '../../../service/translation-manager.service';
import { EditFormComponent } from '../../edit-form/edit-form.component';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { UserInfoService } from '../../../service/user-info.service';
import { MetadataEditorService } from '../../../service/metadata-editor.service';
import * as i0 from "@angular/core";
export declare class FieldEditorComponent implements OnInit {
    metaSrv: MetadataProviderService;
    private trslSrv;
    private cd;
    userInfo: UserInfoService;
    private metadataEditorSrv;
    record?: any;
    field: MetadatiColonna;
    metaInfo: MetaInfo;
    readOnly?: boolean;
    isFilter?: boolean;
    hideLabel?: boolean;
    forceShowLabel?: boolean;
    operator: string;
    nestedIndex: number;
    triggerProp: BehaviorSubject<any>;
    widgetDefinition: any;
    widgetMap: {
        [key: string]: {
            component: any;
            width?: string;
            height?: string;
        };
    };
    widget: any;
    wtoolbox: typeof WtoolboxService;
    popupRef: DynamicDialogRef<EditFormComponent>;
    searchAction: BehaviorSubject<string>;
    searchVisible: boolean;
    get classes(): string | null;
    constructor(metaSrv: MetadataProviderService, trslSrv: TranslationManagerService, cd: ChangeDetectorRef, userInfo: UserInfoService, metadataEditorSrv: MetadataEditorService);
    ngOnInit(): void;
    getComponent(): any;
    getInputs(): {
        record: any;
        field: MetadatiColonna;
        metaInfo: MetaInfo;
        isFilter: boolean;
        nestedIndex: number;
        triggerProp: BehaviorSubject<any>;
        readOnly: boolean;
    };
    condition(): any;
    conditionSpan(): boolean;
    setOperator($event: any): void;
    editLookupRecord(): void;
    addLookupRecord(): void;
    searchLookupRecord(): void;
    selectRow($event: any, rowData: any, dt: any): Promise<void>;
    onLabelDoubleClick(event: MouseEvent): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<FieldEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<FieldEditorComponent, "wuic-field-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "hideLabel": { "alias": "hideLabel"; "required": false; }; "forceShowLabel": { "alias": "forceShowLabel"; "required": false; }; "operator": { "alias": "operator"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=field-editor.component.d.ts.map