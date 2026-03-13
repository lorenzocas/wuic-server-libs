import { SqlTable, SqlModel, Stack, Statement } from "./sql-model";
import { HttpClient } from '@angular/common/http';
import { Emitter } from 'monaco-editor/esm/vs/base/common/event';
export declare class SqlProvider {
    private http;
    currents: CurrentProviderDataContext;
    previousStatements: string[];
    schemas: SqlModel[];
    editorOptions: any;
    userDefTypes: SqlTable[];
    treeNodes: Stack<string>[];
    private editor;
    constructor(http: HttpClient, editorOptions: any);
    setEditor(editor: monaco.editor.IStandaloneCodeEditor): void;
    registerSqlProvider(treeNodes: Stack<string>[]): Promise<void>;
    getAutocompleteSuggestions(originalText: string, position: monaco.Position, lastWord?: monaco.editor.IWordAtPosition, scaffoldedOnly?: boolean): monaco.languages.CompletionList;
    private createTreeMenu;
    testSql(): Promise<any[]>;
    sanitize(str: string): string;
    private normalizeStatement;
    removeNestedStatements(statement: string, nestedStatements: RegExpMatchArray[], currentIndx?: number): string;
    getNestedStatements(statement: string): RegExpMatchArray[];
    getNestedStatement(currentStmnt: Statement, matchingKeyWord: string, found: {
        key: string;
        statement: Statement;
        parentStatement: Statement;
        desiredLevel: number;
        desiredIndex: number;
    }, level?: number, parentIndex?: number): void;
    processText(text: any, position: monaco.Position): {
        char: string;
        parentIndx: any;
        lineNumber: number;
        column: number;
        statementIndex: number;
        nestingIndex: number;
        nestingLevel: number;
    }[][];
    getContextInfo(originalText: string, position: monaco.Position): ContextInfo;
    getContextInfoOld(originalText: string, position: monaco.Position): ContextInfo;
    getAutocompleteContext(contextInfo: ContextInfo): autocompleteContext;
    evaluateAutocompleteContext(contextInfo: ContextInfo, statement: Statement, skipAs?: boolean, defaultAutoCtx?: autocompleteContext, contextDelegate?: (statement: Statement, contextInfo: ContextInfo) => autocompleteContext): autocompleteContext;
    private matchesDefaultContextPrefix;
    evaluateAutocompleteWhereContext(currents: CurrentProviderDataContext, currentStatementWords: string[], whereSubStatemnt: Statement): autocompleteContext.comparisonOperator | autocompleteContext.columnWhere;
    private clearCurrents;
    parseStatements(): void;
    private parseStatementRecursive;
    populateGlobalTables(statement: any, found: any): boolean;
    private populateDeclarations;
    private populateCurrentColumns;
    populateAlias(element: string, stmntIndx: number, found: boolean, statementObj: Statement, subStatement: Statement): boolean;
    private populateCurrentSchemaTables;
    getSuggestionsByContext(context: autocompleteContext, range: monaco.IRange, originalText: string, contextInfo: ContextInfo, scaffoldedOnly?: boolean): monaco.languages.CompletionList;
    private getModelDatabaseName;
    private getModelSchemaName;
    private getColumnDatabaseName;
    private getDefaultDatabaseName;
    private parseTblRelations;
    getTableByAlias(alias: string, statement: Statement): SqlTable;
}
export declare class ContextMenuInteractionEmitter extends Emitter {
    private editor;
    private sqlProvider;
    constructor(_contributions: any, deliveryQueue: any, editor: any, sqlProvider: any);
    fire(event: {
        event: {
            leftButton: boolean;
            middleButton: boolean;
            rightButton: boolean;
            buttons: number;
            detail: number;
            ctrlKey: boolean;
            shiftKey: boolean;
            altKey: boolean;
            posx: number;
            posy: number;
            editorPos: {
                x: number;
                y: number;
                width: number;
                height: number;
            };
            relativePos: {
                x: number;
                y: number;
            };
            preventDefault: () => void;
            stopPropagation: () => void;
        };
        target: {
            element: HTMLElement;
            position: monaco.Position;
            range: monaco.IRange;
            mouseColumn: number;
            type: number;
        };
    }): void;
}
declare class ContextInfo {
    words: {
        word: string;
        statementIndx: number;
    }[];
    nonNestedWords: {
        word: string;
        statementIndx: number;
    }[];
    currentStmntIndex: number;
    nestedStatementIndex: number;
    nestedStatementLevel?: number;
    currentStatement?: Statement;
    currentSubStatement?: {
        key: string;
        statement: Statement;
    };
    position: monaco.Position;
    absolutePosition?: number;
    adjacentChars: string;
}
declare class CurrentProviderDataContext {
    declarations: {
        paramName: string;
        paramtype: string;
        usertype?: SqlTable;
    }[];
    globalTables: SqlTable[];
    statements: Statement[];
}
declare enum autocompleteContext {
    statement = 0,
    statementSelect = 1,
    statementFrom = 2,
    statementWhere = 3,
    statementWhereJoin = 4,
    columnWhereRestricted = 5,
    columnWhereSkipAlias = 6,
    statementOn = 7,
    statementOnRelation = 8,
    comparisonOperator = 9,
    declaration = 10,
    sqlType = 11,
    schema = 12,
    schemaJoin = 13,
    table = 14,
    tableNoAs = 15,
    tableJoin = 16,
    columnSelect = 17,
    columnWhere = 18,
    columnOrder = 19,
    columnGroupBy = 20,
    variable = 21,
    columnWhereAndVariables = 22,
    statementSet = 23,
    assignmentOperator = 24,
    statementValues = 25
}
export {};
//# sourceMappingURL=sql-parser.d.ts.map