import { BehaviorSubject } from "rxjs";

export class ResultInfo {
    public totalRowCount?: number;
    public totalGroups?: number;
    public dato: Array<any>;
    public current: { [key: string]: BehaviorSubject<any> };
    public Agg?: any[];
    public route?: string;
    public cursorMode?: boolean;
    public nextPageCursor?: string;
    public prevPageCursor?: string;

    constructor(dato?: { [key: string]: BehaviorSubject<any> }) {
        this.dato = null;
        this.current = dato ? dato : {};
    }
}
