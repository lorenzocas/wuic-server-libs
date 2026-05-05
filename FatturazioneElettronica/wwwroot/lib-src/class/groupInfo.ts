export class GroupInfo {
    field: string;
    groupFormula: string;
    dir: 'ASC' | 'DESC';
    groupCount: number;

    constructor(field: string) {
        this.field = field;
    }
}