import { MetadatiColonna } from "./metadati_colonna";
import { MetadatiTabella } from "./metadati_tabella";

export class MetaInfo {
    public tableMetadata: MetadatiTabella;
    public columnMetadata: MetadatiColonna[];
    public editMode: boolean;
    public dataTabs: any[];
    public pKey: MetadatiColonna;
    public nestedRoutes?: {
        route: string,
        pKeys: string[],
        fKeys: string[],
        nestedTabCaption?: string,
        nestedGridCaption?: string,
        nestedGridContainerClass?: string,
        action?: string
    }[];
    public rowsPerPageOptions?: number[];
    public gridRowTemplateCondition?: Function;
    public hasFooter?: boolean;
    public schedulerInfo?: any[];

    public operators: { [key: string]: string };

    public frozen?: boolean;

    // public nestedPropObservable?: any;

    constructor() {
        this.tableMetadata = new MetadatiTabella('');
        this.columnMetadata = [];
        this.editMode = false;
        this.dataTabs = [];
        this.schedulerInfo = [];
        this.frozen = false;
    }
}
