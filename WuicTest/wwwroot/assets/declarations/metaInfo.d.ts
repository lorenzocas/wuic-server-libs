import { MetadatiColonna } from "./metadati_colonna";
import { MetadatiTabella } from "./metadati_tabella";
export declare class MetaInfo {
    tableMetadata: MetadatiTabella;
    columnMetadata: MetadatiColonna[];
    editMode: boolean;
    dataTabs: any[];
    pKey: MetadatiColonna;
    nestedRoutes?: {
        route: string;
        pKeys: string[];
        fKeys: string[];
        nestedTabCaption?: string;
        nestedGridCaption?: string;
        nestedGridContainerClass?: string;
        action?: string;
    }[];
    rowsPerPageOptions?: number[];
    gridRowTemplateCondition?: Function;
    hasFooter?: boolean;
    operators: {
        [key: string]: string;
    };
    constructor();
}
//# sourceMappingURL=metaInfo.d.ts.map