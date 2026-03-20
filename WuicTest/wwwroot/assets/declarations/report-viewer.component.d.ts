import { Router, ActivatedRoute } from '@angular/router';
import { StimulsoftViewerComponent } from 'stimulsoft-viewer-angular';
import * as i0 from "@angular/core";
export declare class ReportViewerComponent {
    private router;
    private aRoute;
    viewer: StimulsoftViewerComponent;
    requestUrl: string;
    baseRequestUrl: string;
    route: string;
    action: string;
    currentReport: string;
    constructor(router: Router, aRoute: ActivatedRoute);
    private updateRequestUrl;
    private buildFiltersQueryString;
    private mapFilterToControllerFormat;
    fix(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<ReportViewerComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<ReportViewerComponent, "wuic-report-viewer", never, {}, {}, never, never, true, never>;
}
//# sourceMappingURL=report-viewer.component.d.ts.map