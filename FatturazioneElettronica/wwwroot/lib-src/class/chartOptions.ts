import { BehaviorSubject } from "rxjs";
import { IDesignerProperties } from "./IDesignerProperties";
import { MetadatiColonna } from "./metadati_colonna";
import { MetaInfo } from "./metaInfo";
import { ResultInfo } from "./resultInfo";

export class ChartOptions implements IDesignerProperties {

    public type: 'bar' | 'line' | 'scatter' | 'bubble' | 'pie' | 'doughnut' | 'polarArea' | 'radar';
    public options: any;
    public drillDown: string | ((clickedItem: any, chartOptions: any, data: any) => void);
    public dataOptions: chartDataOption;

    constructor() {
        this.options = {};
        this.dataOptions = new chartDataOption();
    }
    init(metaInfo: MetaInfo) {
        const chart: any = metaInfo?.tableMetadata?.extraProps?.archetypes?.chart || {};

        this.type = chart.type || this.type || 'bar';
        this.options = chart.options || this.options || {};
        this.drillDown = chart.drillDown ?? this.drillDown;

        const nextDataOptions = Object.assign(new chartDataOption(), this.dataOptions || {}, chart.dataOptions || {});
        nextDataOptions.datasets = Array.isArray(nextDataOptions.datasets) ? nextDataOptions.datasets : [];
        this.dataOptions = nextDataOptions;
    }

    archetypePropName: string = "chart";

    public getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo {
        let props = [];

        let prop = new MetadatiColonna("type");
        prop.mc_display_string_in_edit = "Chart Type";
        prop.mc_ui_column_type = "dictionary";
        prop.mc_dictionary_value = "bar@@bar||line@@line||scatter@@scatter||bubble@@bubble||pie@@pie||doughnut@@doughnut||polarArea@@polarArea||radar@@radar";
        prop.mc_ui_size_width = "100%";

        props.push(prop);

        prop = new MetadatiColonna("drillDown");
        prop.mc_display_string_in_edit = "Chart data point click function";
        prop.mc_ui_column_type = "txt_area";
        prop.mc_ui_size_width = "100%";

        props.push(prop);

        let mi = new MetaInfo();
        mi.columnMetadata = props;

        return mi;
    }
}

export class chartDataOption {
    public getChartData: string | ((data: ResultInfo) => any);
    public dataProperty: 'dato' | 'Agg';
    public cutOffCount: number;
    public datasets: ChartDatasetOptions[];

    constructor() {
        this.datasets = [];
    }
}

export class ChartDatasetOptions {
    public label: string;
    public labelField: string;
    public dataField: string;
    public backgroundColorField: string;
    public generateRandomColor: boolean;
    public borderColorField: string;
    public parseData: string | ((data: any[]) => any);

    public constructor() {

    }
}
