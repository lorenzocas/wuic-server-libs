import { IBindable } from "./IBindable";

export class WidgetDefinition {
    defaultHeight: string;
    defaultWidth: string;
    defaultFilterWidth: string;
    fieldLabelInline: boolean;
    formColumns: number;
    filterOperators: any[];
    lookupServerPageCount: number;
    gridRowImports?: any[];
    dynamicFormImports?: any[];
    gridRowTemplate?: string;
    mobileCardTemplate?: string;
    mobileBreakpointPx?: number;
    schedulerEventTemplate?: string;
    mapEventTemplate?: string;
    treeItemTemplate?: string;

    menuParams?: {
        ulWith: string;
        liWidth: string;
        itemCountThreshold: number;
    }

    archetypes: { [key: string]: { markup?: string, component?: any, designerOptions?: any } };

    constructor() {
        this.defaultHeight = '';
        this.defaultWidth = '';
        this.defaultFilterWidth = '';
        this.fieldLabelInline = false;
        this.formColumns = 1;
        this.lookupServerPageCount = 10;
    }
}