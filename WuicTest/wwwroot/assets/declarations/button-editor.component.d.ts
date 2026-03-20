import { MetadatiColonna } from '../../../class/metadati_colonna';
import { ConfirmationService } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';
import { WtoolboxService } from '../../../service/wtoolbox.service';
import { MetaInfo } from '../../../class/metaInfo';
import { BehaviorSubject } from 'rxjs';
import * as i0 from "@angular/core";
export declare class ButtonEditorComponent {
    private confirmationService;
    private trn;
    private wtoolbox;
    record?: any;
    field: MetadatiColonna;
    metaInfo: MetaInfo;
    isFilter?: boolean;
    nestedIndex: number;
    triggerProp: BehaviorSubject<any>;
    readOnly: boolean;
    constructor(confirmationService: ConfirmationService, trn: TranslateService, wtoolbox: WtoolboxService);
    ngAfterViewInit(): void;
    isButtonVisible(): boolean;
    buttonExecute(event: Event): Promise<void>;
    static ɵfac: i0.ɵɵFactoryDeclaration<ButtonEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<ButtonEditorComponent, "wuic-button-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=button-editor.component.d.ts.map