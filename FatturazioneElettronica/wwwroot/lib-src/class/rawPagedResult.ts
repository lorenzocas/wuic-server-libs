export class rawPagedResult {
    public TotalRecords?: number;
    public TotalGroups?: number;
    public results: Array<any>;
    public Agg?: any;
    public sqlQuery?: string;
    public cursorMode?: boolean;
    public nextPageCursor?: string;
    public prevPageCursor?: string;

    constructor() {
        this.results = [];
    }
}
