import { AfterViewInit } from '@angular/core';
import { StimulsoftDesignerComponent } from 'stimulsoft-designer-angular';
import { ActivatedRoute, Router } from '@angular/router';
import * as i0 from "@angular/core";
export declare class ReportDesignerComponent implements AfterViewInit {
    private router;
    private aRoute;
    designer: StimulsoftDesignerComponent;
    requestUrl: string;
    baseRequestUrl: string;
    route: string;
    currentReport: string;
    constructor(router: Router, aRoute: ActivatedRoute);
    private syncRequestUrl;
    fix(): void;
    ngAfterViewInit(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<ReportDesignerComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<ReportDesignerComponent, "wuic-report-designer", never, {}, {}, never, never, true, never>;
}
//# sourceMappingURL=report-designer.component.d.ts.map