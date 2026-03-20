import { ConfirmationService, MessageService, Confirmation } from 'primeng/api';
import { DataProviderService } from './data-provider.service';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { DialogService } from 'primeng/dynamicdialog';
import { TranslationManagerService } from './translation-manager.service';
import { GlobalHandler } from '../handler/GlobalHandler';
import * as i0 from "@angular/core";
export declare class WtoolboxService {
    _http: HttpClient;
    static appSettings: any;
    static myFunctions: any;
    static dialogService: DialogService;
    static messageNotificationService: MessageService;
    static confirmationService: ConfirmationService;
    static dataService: DataProviderService;
    static translationService: TranslationManagerService;
    static errorHandler: GlobalHandler;
    static http: HttpClient;
    static isBusy: BehaviorSubject<boolean>;
    static menuUpdated: BehaviorSubject<boolean>;
    constructor(_http: HttpClient);
    static getTimestamp(): string;
    static confirm(payload: Confirmation): Promise<boolean>;
    static promptDialog(title: string, fields: {
        name: string;
        caption: string;
        value?: any;
        type: string;
        tooltip?: string;
        required?: boolean;
        route?: string;
        dictionaryData?: any[];
    }[], width?: string, height?: string, customValidation?: any): Promise<any>;
    static metadataFunctions: any;
    static ɵfac: i0.ɵɵFactoryDeclaration<WtoolboxService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<WtoolboxService>;
}
//# sourceMappingURL=wtoolbox.service.d.ts.map