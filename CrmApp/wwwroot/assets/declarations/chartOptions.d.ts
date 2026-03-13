import { BehaviorSubject } from "rxjs";
import { IDesignerProperties } from "./IDesignerProperties";
import { MetaInfo } from "./metaInfo";
import { ResultInfo } from "./resultInfo";
export declare class ChartOptions implements IDesignerProperties {
    type: 'bar' | 'line' | 'scatter' | 'bubble' | 'pie' | 'doughnut' | 'polarArea' | 'radar';
    options: any;
    drillDown: string | ((clickedItem: any, chartOptions: any, data: any) => void);
    dataOptions: chartDataOption;
    constructor();
    init(metaInfo: MetaInfo): void;
    archetypePropName: string;
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo;
}
export declare class chartDataOption {
    getChartData: string | ((data: ResultInfo) => any);
    dataProperty: 'dato' | 'Agg';
    cutOffCount: number;
    datasets: ChartDatasetOptions[];
    constructor();
}
export declare class ChartDatasetOptions {
    label: string;
    labelField: string;
    dataField: string;
    backgroundColorField: string;
    generateRandomColor: boolean;
    borderColorField: string;
    parseData: string | ((data: any[]) => any);
    constructor();
}
//# sourceMappingURL=chartOptions.d.ts.map