import { AfterViewInit } from '@angular/core';
import { DynamicDashboardTemplateComponent } from '../dynamic-dashboard-template/dynamic-dashboard-template.component';
import * as i0 from "@angular/core";
export declare class DashboardComponent implements AfterViewInit {
    dashboardElements: any[];
    constructor();
    getComponent(dashboardElement: any): typeof DynamicDashboardTemplateComponent;
    ngAfterViewInit(): void;
    onResizing(event: any): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<DashboardComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DashboardComponent, "wuic-dashboard", never, { "dashboardElements": { "alias": "dashboardElements"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=dashboard.component.d.ts.map