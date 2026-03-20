import { OnInit } from '@angular/core';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { MetaInfo } from '../../../class/metaInfo';
import { BehaviorSubject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { UserInfoService } from '../../../service/user-info.service';
import { PrimeNG } from 'primeng/config';
import * as i0 from "@angular/core";
export declare class UploadEditorComponent implements OnInit {
    private trnsl;
    private usrSrv;
    private config;
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    field: MetadatiColonna;
    metaInfo: MetaInfo;
    isFilter?: boolean;
    nestedIndex: number;
    triggerProp: BehaviorSubject<any>;
    readOnly: boolean;
    uploadPath: string;
    uploadEndpoint: string;
    mimeTypes: string;
    maxFileSize: number;
    pkName: string;
    valore: any;
    constructor(trnsl: TranslateService, usrSrv: UserInfoService, config: PrimeNG);
    ngOnInit(): void;
    choose(event: any, callback: any): void;
    onFileSelect($event: any): void;
    onBeforeUpload($event: any): void;
    onUpload($event: any): Promise<void>;
    formatSize(bytes: any): string;
    removeAttachment(field: any): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<UploadEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<UploadEditorComponent, "wuic-upload-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=upload-editor.component.d.ts.map