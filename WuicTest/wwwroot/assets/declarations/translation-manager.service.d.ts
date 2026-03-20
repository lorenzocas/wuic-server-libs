import { Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Lingua } from '../class/lingua';
import { Translation } from '../class/translation';
import { UserInfoService } from './user-info.service';
import * as i0 from "@angular/core";
export declare class TranslationManagerService {
    private http;
    private inj;
    private authSrv;
    httpOptions: {
        withCredentials: boolean;
    };
    translationTable: Translation[];
    constructor(http: HttpClient, inj: Injector, authSrv: UserInfoService);
    setEndPoint(): Promise<void>;
    getLingue(): Array<Lingua>;
    loadTranslations(): Promise<void>;
    instant(resource: string): string;
    format(stringa: string, ...args: any[]): string;
    getResourcesByLang(lang?: string): any;
    getTranslation(value: string): string;
    updateTranslations(translationObj: any): Promise<Object>;
    static ɵfac: i0.ɵɵFactoryDeclaration<TranslationManagerService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<TranslationManagerService>;
}
//# sourceMappingURL=translation-manager.service.d.ts.map