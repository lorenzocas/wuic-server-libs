import { DataSourceComponent } from "../component/data-source/data-source.component";
import { SortInfo } from "./sortInfo";

export class ComboParams {
    endpoint: any
    dataroute: string;
    sortInfo: SortInfo[];
    groupInfo: any;
    filterInfo: any;
    md_server_side_operations: boolean;
    pageSize?: number;

    constructor(ds: DataSourceComponent) {
        this.dataroute = ds.metaInfo.tableMetadata.md_route_name;
        this.sortInfo = ds.sortInfo;
        this.groupInfo = ds.groupInfo;
        this.filterInfo = ds.filterInfo;
        this.md_server_side_operations = ds.metaInfo.tableMetadata.md_server_side_operations;
        this.pageSize = ds.pageSize;
    }
}