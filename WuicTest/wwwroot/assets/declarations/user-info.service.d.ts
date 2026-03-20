import { CookieService } from 'ngx-cookie-service';
import { UserInfo } from '../class/userInfo';
import * as i0 from "@angular/core";
export declare class UserInfoService {
    private cookieService;
    constructor(cookieService: CookieService);
    setDummyUserInfo(): string;
    getuserInfo(): UserInfo;
    static ɵfac: i0.ɵɵFactoryDeclaration<UserInfoService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<UserInfoService>;
}
//# sourceMappingURL=user-info.service.d.ts.map