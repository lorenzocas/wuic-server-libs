export declare class WidgetDefinition {
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
    schedulerEventTemplate?: string;
    mapEventTemplate?: string;
    treeItemTemplate?: string;
    menuParams?: {
        ulWith: string;
        liWidth: string;
        itemCountThreshold: number;
    };
    archetypes: {
        [key: string]: {
            markup: string;
            component: any;
            designerOptions?: any;
        };
    };
    constructor();
}
//# sourceMappingURL=widgetDefinition.d.ts.map