import { BehaviorSubject } from "rxjs";
export declare class ResultInfo {
    totalRowCount?: number;
    totalGroups?: number;
    dato: Array<any>;
    current: {
        [key: string]: BehaviorSubject<any>;
    };
    Agg?: any[];
    route?: string;
    constructor(dato?: {
        [key: string]: BehaviorSubject<any>;
    });
}
//# sourceMappingURL=resultInfo.d.ts.map