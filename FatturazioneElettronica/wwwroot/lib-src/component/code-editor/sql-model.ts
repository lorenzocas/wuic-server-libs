
export class SqlModel {
    database: string;
    isDefault: boolean;
    schema: string;
    tables: SqlTable[];
    types: SqlTable[];
    functions: SqlFunctionStored[];
    storeds: SqlFunctionStored[];
}

export class SqlFunctionStored {
    schema: string;
    name: string;
    type: string;
    parameters: SqlParameter[];
}

export class SqlParameter {
    name: string;
    type: string;
    isOutput: boolean;
    isReadOnly: boolean;
    order: number;
    size: string;
}

export class SqlTable {
    schema: string;
    table: string;
    alias: string;
    schemaObj: SqlModel;
    columns: SqlColumn[];
}

export class SqlRelation {
    schemaPK: string;
    tablePK: string;
    columnPK: string;
    schemaFK: string;
    tableFK: string;
    columnFK: string;
}

export class SqlColumn {
    schema: string;
    table: string;
    tableAlias: string;
    column: string;
    type: string;
    isNullable: boolean;
    columnDescription: string;
    isPkey: boolean;
    isIdentity: boolean;
    order: number;

    childRelations: SqlRelation[];
    parentRelation: SqlRelation;
}

export type Stack<T> = {
    text: T;
    sqlDatabase?: string;
    sqlModel?: SqlModel;
    sqlTable?: SqlTable;
    parentTable?: SqlTable;
    sqlColumn?: SqlColumn;
    sqlRelation?: SqlRelation;
    sqlParameter?: SqlParameter;
    sqlFunction?: SqlFunctionStored;
    items?: Stack<T>[] | null;
};

export class Statement {
    statement: string;
    index: number;
    words: { token: string, tokenIndx: number }[];

    sqlModels: SqlModel[];
    sqlTables: { table: SqlTable, usedAlias: string }[];
    sqlColumns: { column: SqlColumn, usedAlias: string }[];
    sqlAliases: any[];

    subStatements: { key: string, statement: Statement }[];

    constructor(statement: string, index: number) {
        this.statement = statement;
        this.index = index;
        this.subStatements = [];
        this.words = [];

        this.sqlModels = [];
        this.sqlTables = [];
        this.sqlColumns = [];
        this.sqlAliases = [];
    }
}
