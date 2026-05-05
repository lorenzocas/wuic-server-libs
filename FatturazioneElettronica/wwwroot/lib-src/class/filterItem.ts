import type { FilterInfo } from "./filterInfo";

export class FilterItem {
    field: string;
    operatore: string;
    value: string;
    fixed?: boolean;
    __extra?: boolean;
    __descriptorManaged?: boolean;
    __querystring?: boolean;
    __routefilter?: boolean;
    __nestedroute?: boolean;
    nestedFilters?: FilterInfo;
    operator?: string;
    constructor(params: {
        field: string,
        operator: string,
        value: string,
        fixed?: boolean,
        __extra?: boolean,
        __descriptorManaged?: boolean,
        __routefilter?: boolean,
        __nestedroute?: boolean
    }) {
        this.field = params.field;
        this.operatore = params.operator;
        this.value = params.value;
        this.fixed = params.fixed;
        this.__extra = params.__extra;
        this.__descriptorManaged = params.__descriptorManaged;
        this.__routefilter = params.__routefilter;
        this.__nestedroute = params.__nestedroute;
        this.operator = params.operator;
    }
}
