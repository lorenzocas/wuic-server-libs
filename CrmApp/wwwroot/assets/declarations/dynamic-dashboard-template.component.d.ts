import { BehaviorSubject } from 'rxjs';
import * as i0 from "@angular/core";
export declare class DynamicDashboardTemplateComponent {
    inputs: any;
    inputProps: any;
    toolProps: any[];
    suggestions: any[];
    toolId: number;
    componentId: number;
    uniqueName: string;
    name: string;
    tag: string;
    icon: string;
    group: string;
    nestedComponents: any[];
    allowedChildren: string[];
    hide: boolean;
    componentRef: {
        component: BehaviorSubject<any>;
        id: number;
        name: string;
        uniqueName: string;
    };
    onDrop: any;
    ctxItems: any;
    private selectDisplayFormulaFns;
    stringify(obj: any): string;
    onResizing(event: any, element: any, parentElement: any): void;
    onMoving($event: any, element: any): void;
    onDragEnter($event: any, th: any): void;
    getSelectOptionLabel(inputs: any, opt: any): string;
    getUlItemDisplayValue(inputs: any, rowData: any): string;
    getLabelDisplayValue(inputs: any): string;
    private getSelectOptionFallbackLabel;
    private getSelectDisplayFormulaFn;
    static getComponentFromTemplate(template: string): typeof DynamicDashboardTemplateComponent;
    static ɵfac: i0.ɵɵFactoryDeclaration<DynamicDashboardTemplateComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DynamicDashboardTemplateComponent, "wuic-dynamic-dashboard-template", never, { "inputs": { "alias": "inputs"; "required": false; }; "inputProps": { "alias": "inputProps"; "required": false; }; "toolProps": { "alias": "toolProps"; "required": false; }; "suggestions": { "alias": "suggestions"; "required": false; }; "toolId": { "alias": "toolId"; "required": false; }; "componentId": { "alias": "componentId"; "required": false; }; "uniqueName": { "alias": "uniqueName"; "required": false; }; "name": { "alias": "name"; "required": false; }; "tag": { "alias": "tag"; "required": false; }; "icon": { "alias": "icon"; "required": false; }; "group": { "alias": "group"; "required": false; }; "nestedComponents": { "alias": "nestedComponents"; "required": false; }; "allowedChildren": { "alias": "allowedChildren"; "required": false; }; "hide": { "alias": "hide"; "required": false; }; "componentRef": { "alias": "componentRef"; "required": false; }; "onDrop": { "alias": "onDrop"; "required": false; }; "ctxItems": { "alias": "ctxItems"; "required": false; }; }, {}, never, never, false, never>;
}
//# sourceMappingURL=dynamic-dashboard-template.component.d.ts.map