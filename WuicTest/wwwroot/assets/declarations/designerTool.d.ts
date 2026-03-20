import { BehaviorSubject } from "rxjs";
import { DataSourceComponent } from "../component/data-source/data-source.component";
import { MenuItem } from "primeng/api";
export declare class DesignerTool {
    componentId?: number;
    uniqueName?: string;
    displayName?: string;
    toolProps?: any[];
    toolId: number;
    name: string;
    tag: string;
    icon: string;
    inputProps: {
        [key: string]: DesignerToolProp;
    };
    inputs: {
        [key: string]: any | BehaviorSubject<any>;
    };
    nestedComponents?: DesignerTool[];
    allowedChildren?: string[];
    hide?: boolean;
    group?: string;
    suggestions?: string[];
    componentRef?: BehaviorSubject<{
        component: DataSourceComponent;
        id: number;
        name: string;
        uniqueName: string;
    }>;
    events?: any;
    onDrop?: (dt: DesignerTool) => void;
    ctxItems?: MenuItem[];
    refCtxItems?: MenuItem[];
}
export declare class DesignerToolProp {
    propertyCaption?: string;
    type: 'string' | 'txt_area' | 'dictionary' | 'boolean' | 'number' | 'color' | 'button' | 'numberToArray' | 'autocomplete' | 'dropped-component-list' | 'dropped-component' | 'html-string' | 'selectedItem' | 'propertyTree' | 'function' | 'metaEditor';
    async?: boolean;
    hideCaption?: boolean;
    hide?: boolean;
    values?: string[];
    filter?: string;
    serializable?: boolean | any;
    multiple?: boolean;
    metaColumnName?: string;
    metaRoute?: string;
    displayField?: string;
    valueField?: string;
    asyncPath?: string;
    conditional?: (inputProps: {
        [key: string]: DesignerToolProp;
    }, inputs: {
        [key: string]: any | BehaviorSubject<any>;
    }, newValue: any, oldValue: any) => void;
    converter?: (obj: any, prop: string, newValue: any, tool: DesignerTool) => void;
    callback?: (obj: any, prop: string, newValue: any, tool: DesignerTool) => void;
}
//# sourceMappingURL=designerTool.d.ts.map