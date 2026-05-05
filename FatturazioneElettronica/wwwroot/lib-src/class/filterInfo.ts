import { FilterItem } from "./filterItem";

export class FilterInfo {
    logic: "AND" | "OR";
    filters: FilterItem[];

    constructor(logic: "AND" | "OR", filters: FilterItem[]) {
        this.logic = logic;
        this.filters = filters;
    }
}
