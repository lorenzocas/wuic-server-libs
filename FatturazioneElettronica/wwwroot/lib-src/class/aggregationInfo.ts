export class AggregationInfo {
    field: string;
    aggregate: string;

    constructor(field: string, aggregate: string) {
        this.field = field;
        this.aggregate = aggregate;
    }
}