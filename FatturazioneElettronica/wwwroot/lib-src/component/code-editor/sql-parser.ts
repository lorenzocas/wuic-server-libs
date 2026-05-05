import { IRange } from "monaco-editor";
import { SqlTable, SqlRelation, SqlModel, SqlColumn, SqlParameter, SqlFunctionStored, Stack, Statement } from "./sql-model";
import { HttpClient } from '@angular/common/http';
import { Emitter } from 'monaco-editor/esm/vs/base/common/event';
import { WtoolboxService } from "../../service/wtoolbox.service";
// import { editor } from 'monaco-editor';
// import { LinkedList } from 'monaco-editor/esm/vs/base/common/linkedList';
// import { MenuId, MenuRegistry } from 'monaco-editor/esm/vs/platform/actions/common/actions';

export class SqlProvider {
    currents: CurrentProviderDataContext;
    previousStatements: string[];
    schemas: SqlModel[];
    editorOptions: any;
    userDefTypes: SqlTable[];
    treeNodes: Stack<string>[];
    private editor: monaco.editor.IStandaloneCodeEditor;

    constructor(private http: HttpClient, editorOptions: any) {
        this.currents = {
            declarations: [],
            statements: [],
            globalTables: []
        };

        this.previousStatements = [];
        this.schemas = [];
        this.editorOptions = editorOptions;

        this.treeNodes = [];
    }

    /**
     * Collega Monaco editor al provider SQL registrando emitter custom per drag&drop e context menu.
     * @param editor Istanza editor Monaco.
     */
    public setEditor(editor: monaco.editor.IStandaloneCodeEditor) {
        this.editor = editor;
        this.editor['_onDropIntoEditor'] = this.editor['_register'](new DragDropInteractionEmitter(this.editor['_contributions'], this.editor['_deliveryQueue'], this.editor, this));
        this.editor['onDropIntoEditor'] = this.editor['_onDropIntoEditor'].event;

        // this._onContextMenu = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
        // this.onContextMenu = this._onContextMenu.event;
        this.editor['_onContextMenu'] = this.editor['_register'](new ContextMenuInteractionEmitter(this.editor['_contributions'], this.editor['_deliveryQueue'], this.editor, this));
        (<unknown>this.editor)['onContextMenu'] = this.editor['_onContextMenu'].event;
    }

    /**
     * Inizializza autocomplete SQL: carica schema oggetti da backend, costruisce menu albero,
     * configura tokenizer Monarch e registra completion provider SQL contestuale.
     * @param treeNodes Collezione nodi albero da popolare per il toolbox SQL.
     */
    public async registerSqlProvider(treeNodes: Stack<string>[]) {

        this.treeNodes = treeNodes;

        let normalizedKeywords: string[] = [];
        sqlKeywords.forEach(element => {
            normalizedKeywords = normalizedKeywords.concat(element.split(' '));
        });

        const scaffoldedOnly = this.editorOptions?.scaffoldedOnly ?? false;
        this.schemas = <SqlModel[]>(await this.http.get(`${WtoolboxService.appSettings.api_url}CodeEditor/AutocompleteSqlObjects?scaffoldedOnly=${scaffoldedOnly}`).toPromise());
        this.userDefTypes = this.schemas.map(x => x.types).flat(1);

        let nodes = this.createTreeMenu();

        nodes.forEach(node => {
            this.treeNodes.push(node);
        });

        this.editorOptions.contextMenuItems = nodes;

        monaco.languages.setMonarchTokensProvider("sql", {
            keywords: normalizedKeywords,
            types: sqlTypes.map(x => x.name),
            udt: this.userDefTypes.map(x => x.table),
            operators: comparisonOperators,
            aggregations: aggregateFunctions,
            otherReserved: otherReserved,
            ignoreCase: true,
            tokenizer: {
                root: [
                    [/[a-z_$][\w$]*/, {
                        cases: {
                            '@keywords': 'keyword',
                            '@types': 'types',
                            '@udt': 'udt',
                            '@operators': 'operators',
                            '@aggregations': 'aggregations',
                            '@otherReserved': 'otherReserved',
                        }
                    }],
                ],
            }
        });

        let rules = [
            { token: "keyword", foreground: "569CD6" },
            { token: "types", foreground: "0CCB23" },
            { token: "udt", foreground: "089319" },
            { token: "operators", foreground: "808080" },
            { token: "aggregations", foreground: "FF00FF" },
            { token: "otherReserved", foreground: "FF00FF" }
        ]

        monaco.editor.defineTheme("sqlTheme", {
            base: "vs-dark",
            inherit: true,
            rules: rules,
            colors: {}
        });

        this.editorOptions.theme = 'sqlTheme';

        monaco.languages.registerCompletionItemProvider('sql', {
            triggerCharacters: ['.', ' ', '\n'], // '('
            provideCompletionItems: (model: monaco.editor.ITextModel, position: monaco.Position, context: any, token: any) => {

                let lastWord = model.getWordUntilPosition(position); //getWordUntilPosition //getWordAtPosition
                let originalText = model.getValueInRange(model.getFullModelRange());
                let scaffoldedOnly = this.editorOptions?.scaffoldedOnly ?? false;

                return this.getAutocompleteSuggestions(originalText, position, lastWord, scaffoldedOnly);
            }
        });

        this.editorOptions.onNodeClick = (event: PointerEvent, dataItem: Stack<string>[]) => {
            // debugger;
        }

        this.editorOptions.onInit = (editor) => {
            // debugger;
            this.editor = editor;
        }

        this.editorOptions.onNodeDragStart = (event: DragEvent, dataItem: Stack<string>) => {
            event.stopPropagation();
            event.stopImmediatePropagation();

            event.dataTransfer!.setData("text/plain", JSON.stringify(dataItem));
        }

        this.editorOptions.onNodeDragEnd = (event: DragEvent, dataItem: Stack<string>[]) => {
            // debugger;
        }

        // monaco.languages.registerSignatureHelpProvider('sql', {
        //     signatureHelpTriggerCharacters: ['(', ','],
        //     provideSignatureHelp: (model: monaco.editor.ITextModel, position: monaco.Position, token: any, context: any) => {

        //         var lastWord = model.getWordUntilPosition(position); //getWordUntilPosition //getWordAtPosition
        //         var originalText = model.getValueInRange(model.getFullModelRange());
        //         var fullText = this.sanitize(originalText);

        //         var range: IRange = {
        //             startLineNumber: position.lineNumber,
        //             endLineNumber: position.lineNumber,
        //             startColumn: lastWord.startColumn,
        //             endColumn: lastWord.endColumn,
        //         };

        //         var contextInfo = this.getContextInfo(originalText, position);
        //         this.parseStatements();
        //         var currentStatement = this.currents.statements.find(x => x.index == contextInfo.currentStmntIndex);

        //         if (currentStatement && currentStatement.words.length > 0
        //             && currentStatement.words[0].toUpperCase() == 'INSERT INTO') {

        //         } else {

        //             return {
        //                 dispose: () => { },
        //                 value: {
        //                     activeParameter: 0,
        //                     activeSignature: 0,
        //                     signatures: [{
        //                         label: 'string substr(string $string, int $start [, int $length])',
        //                         parameters: [
        //                             {
        //                                 label: 'string $string',
        //                                 documentation: 'The input string. Must be one character or longer.'
        //                             },
        //                             {
        //                                 label: 'int $start',
        //                                 documentation: "If "
        //                             },
        //                             {
        //                                 label: 'int $length',
        //                                 documentation: 'If '
        //                             }
        //                         ]
        //                     }]
        //                 }
        //             };

        //         }
        //     }
        // });

    }

    public getAutocompleteSuggestions(
        originalText: string,
        position: monaco.Position,
        lastWord?: monaco.editor.IWordAtPosition,
        scaffoldedOnly: boolean = true
    ) {

        let fullText = this.sanitize(originalText);

        let range: IRange = {
            startLineNumber: position.lineNumber,
            startColumn: lastWord ? lastWord.startColumn : position.column,
            endLineNumber: position.lineNumber,
            endColumn: lastWord ? lastWord.endColumn : position.column
        };

        this.previousStatements = fullText.split(';').filter(x => x.length > 0).map(x => x.trim()); //.toUpperCase()

        let contextInfo = this.getContextInfo(originalText, position);

        this.parseStatements();

        let ctx = this.getAutocompleteContext(contextInfo);

        return this.getSuggestionsByContext(ctx, range, originalText, contextInfo, scaffoldedOnly);
    }

    /**
     * Trasforma modelli schema/tabelle/colonne/relazioni in struttura menu ad albero usata dal pannello editor.
     * @returns Nodi root del tree menu SQL.
     */
    private createTreeMenu() {
        const buildSchemaNode = (model: SqlModel) => {
            const schemaName = this.getModelSchemaName(model) || model.schema;
            const databaseName = this.getModelDatabaseName(model) || undefined;
            return {
                text: schemaName,
                sqlDatabase: databaseName,
                sqlModel: model,
                items: [
                    {
                        text: 'Tables',
                        items: model.tables.map(t => {
                            return {
                                text: t.table,
                                sqlDatabase: databaseName,
                                sqlTable: t,
                                items: [
                                    {
                                        text: 'Columns',
                                        sqlDatabase: databaseName,
                                        parentTable: t,
                                        items: t.columns.map(c => {
                                            return {
                                                text: c.column,
                                                sqlDatabase: databaseName,
                                                sqlColumn: c,
                                                items: [
                                                    {
                                                        text: 'Relations',
                                                        sqlDatabase: databaseName,
                                                        items: c.childRelations.map(r => {
                                                            return {
                                                                text: `${r.schemaFK}.${r.tableFK}.${r.columnFK}`,
                                                                sqlRelation: r
                                                            };
                                                        }).concat(c.parentRelation ? {
                                                            text: `${c.parentRelation.schemaPK}.${c.parentRelation.tablePK}.${c.parentRelation.columnPK}`,
                                                            sqlRelation: c.parentRelation
                                                        } : [])
                                                    }
                                                ]
                                            };
                                        })
                                    }
                                ]
                            };
                        })
                    },
                    {
                        text: 'Functions',
                        items: model.functions.map(f => {
                            return {
                                text: f.name,
                                sqlFunction: f,
                                items: f.parameters.map(p => {
                                    return {
                                        text: p.name,
                                        sqlParameter: p
                                    };
                                })
                            };
                        })
                    },
                    {
                        text: 'Stored Procedures',
                        items: model.storeds.map(f => {
                            return {
                                text: f.name,
                                sqlFunction: f,
                                items: f.parameters.map(p => {
                                    return {
                                        text: p.name,
                                        sqlParameter: p
                                    };
                                })
                            };
                        })
                    }
                ]
            };
        };

        const groupedByDb: { [db: string]: SqlModel[] } = {};
        this.schemas.forEach(model => {
            const dbName = this.getModelDatabaseName(model) || '(default)';
            if (!groupedByDb[dbName]) {
                groupedByDb[dbName] = [];
            }
            groupedByDb[dbName].push(model);
        });

        return Object.keys(groupedByDb).sort().map(dbName => {
            return {
                text: dbName,
                sqlDatabase: dbName !== '(default)' ? dbName : undefined,
                items: groupedByDb[dbName]
                    .sort((a, b) => this.getModelSchemaName(a).localeCompare(this.getModelSchemaName(b)))
                    .map(buildSchemaNode)
            };
        });
    }

    /**
     * Invia lo statement corrente all'endpoint parser server (`CodeEditor/ParseSql`) per validazione/test.
     * @returns Esito parser backend.
     */
    public async testSql(): Promise<any[]> {
        return await (this.http.post(`${WtoolboxService.appSettings.api_url}CodeEditor/ParseSql`, { sqlStatement: this.editor.getValue() }).toPromise() as Promise<any[]>);
    }

    // #region manage input context

    /**
     * Normalizza il testo SQL rimuovendo newline/tab e spazi multipli per facilitare parsing/tokenizzazione.
     * @param str Input SQL grezzo.
     * @returns SQL sanificato in singola linea.
     */
    sanitize(str: string): string {
        return str.replace(/(\r\n|\n|\r|\t)/gm, " ").replace(/ +(?= )/g, '');
    }

    private normalizeStatement(previousWords: { token: string, tokenIndx: number }[]): { token: string, tokenIndx: number }[] {
        let skipNext = false;

        let sanitizedPreviousWords: { token: string, tokenIndx: number }[] = [];
        previousWords.forEach((elementObj, indx) => {
            let element = (elementObj.token || '').toUpperCase();

            if ((element == 'INNER' || element == 'LEFT' || element == 'RIGHT' || element == 'ORDER' || element == 'INSERT' || element == 'GROUP' || element == 'CASE' || element == 'CREATE')
                &&
                previousWords.length > indx + 1) {
                if (element == 'CASE' && previousWords[indx + 1].token != 'WHEN') {
                    if (!skipNext) {
                        sanitizedPreviousWords.push({ token: elementObj.token, tokenIndx: elementObj.tokenIndx });
                    }
                } else {
                    skipNext = true;
                    sanitizedPreviousWords.push({ token: `${elementObj.token} ${previousWords[indx + 1].token}`, tokenIndx: elementObj.tokenIndx });
                }
            } else {
                if (!skipNext) {
                    sanitizedPreviousWords.push({ token: elementObj.token, tokenIndx: elementObj.tokenIndx });
                }

                skipNext = false;
            }
        });
        return sanitizedPreviousWords;
    }

    /**
     * Rimuove dal testo principale i blocchi annidati tra parentesi gia individuati.
     * @param statement Statement sorgente.
     * @param nestedStatements Match dei blocchi annidati.
     * @param currentIndx Indice di partenza opzionale.
     * @returns Statement "flattened" senza sub-statement annidati.
     */
    removeNestedStatements(statement: string, nestedStatements: RegExpMatchArray[], currentIndx?: number): string {

        if (nestedStatements.length) {
            let currentIndxx: number = currentIndx ?? 0;
            let cleanString = '';

            nestedStatements.forEach(x => {
                cleanString += `${statement.substring(currentIndxx, x.index)}`;
                currentIndx = x.index! + x[0].length;
                statement = statement.replace(x[0], '');
            });

            if (currentIndxx < statement.length - 1) {
                cleanString += `${statement.substring(currentIndxx, statement.length - 1)}`;
            }
        }

        return statement;
    }

    /**
     * Estrae i sub-statement annidati tra parentesi tonde.
     * @param statement Testo SQL.
     * @returns Match array dei blocchi annidati.
     */
    getNestedStatements(statement: string): RegExpMatchArray[] {
        const rx = /\(([^()]*)\)/g;
        return [...statement.matchAll(rx)];
    }

    /**
     * Ricerca ricorsivamente un sub-statement per keyword con filtri opzionali su livello e indice parent.
     * @param currentStmnt Statement corrente della ricorsione.
     * @param matchingKeyWord Keyword da trovare.
     * @param found Oggetto accumulatore risultato.
     * @param level Livello annidamento corrente.
     * @param parentIndex Indice sub-statement del parent.
     */
    getNestedStatement(currentStmnt: Statement, matchingKeyWord: string, found: { key: string, statement: Statement, parentStatement: Statement, desiredLevel: number, desiredIndex: number }, level: number = -1, parentIndex: number = -1) {
        for (let index = 0; index < currentStmnt.subStatements.length; index++) {
            if (currentStmnt.subStatements[index].key == matchingKeyWord
                && (found.desiredLevel == level || found.desiredLevel == -1)
                && (found.desiredIndex == parentIndex || found.desiredIndex == -1)
                && !found.statement
            ) {
                found.statement = currentStmnt.subStatements[index].statement;
                found.key = currentStmnt.subStatements[index].key;
                found.parentStatement = currentStmnt;
                return;
            } else if (!found.statement) {
                this.getNestedStatement(currentStmnt.subStatements[index].statement, matchingKeyWord, found, level + 1, index);
            }
        }
    }

    /**
     * Effettua parsing char-by-char del testo SQL costruendo una mappa per line/column/statement/nesting utile al context resolver.
     * @param text SQL completo.
     * @param position Posizione cursore Monaco.
     * @returns Struttura tokenizzata per livello annidamento.
     */
    processText(text, position: monaco.Position) {
        const parsedText: {
            char: string, parentIndx, lineNumber: number, column: number,
            statementIndex: number, nestingIndex: number, nestingLevel: number
        }[][] = [];
        let depth = 0;
        let column = 0;
        let lineNumber = 1;
        let statementIndx = 1;
        let depthIndx: { depth: number, index: number }[] = [];
        let fakeDepth = 0;

        // identify position in text
        for (let index = 0; index < text.length; index++) {
            let c = text[index];

            if (c === '\n' || c === '\r') {
                lineNumber++;
                column = 0;

                if (c === '\r' && text[index + 1] === '\n') {
                    index++;
                }

            } else {
                column++;
            }

            if (c === '(') {
                if (index == 0 || text[index - 1] == ' ' || text[index - 1] == ',' || text[index - 1] == '\n') {
                    depth++;

                    if (depth < parsedText.length) {
                        depthIndx.find(x => x.depth == depth).index++;
                    }
                } else {
                    fakeDepth++;
                }
            } else if (c === ';') {
                statementIndx++;
                continue;
            }

            if (depth >= parsedText.length) {
                parsedText.push([]);
                depthIndx.push({ depth: depth, index: 0 });
            }

            let parentDepth = depthIndx.find(x => x.depth == depth - 1);
            let parentIndex = parentDepth ? parentDepth.index : -1;

            parsedText[depth].push({
                char: c === '\n' || c === '\r' ? ' ' : c,
                column: column,
                lineNumber: lineNumber,
                statementIndex: statementIndx,
                nestingIndex: depthIndx.find(x => x.depth == depth).index,
                nestingLevel: depth,
                parentIndx: parentIndex
            });

            if (c === ')') {
                if (fakeDepth == 0) {
                    depth--;
                } else {
                    fakeDepth--;
                }
            }
        }

        return parsedText;
    }

    /**
     * Deriva il contesto autocomplete corrente (token precedenti, statement index, livello annidamento, caratteri adiacenti).
     * @param originalText Testo SQL originale.
     * @param position Posizione cursore Monaco.
     * @returns ContextInfo per il motore suggerimenti.
     */
    getContextInfo(originalText: string, position: monaco.Position): ContextInfo {

        let parsedText = this.processText(originalText, position);
        const emptyContext = (): ContextInfo => {
            return {
                words: [],
                nonNestedWords: [],
                currentStmntIndex: 1,
                position: position,
                nestedStatementIndex: 0,
                nestedStatementLevel: 0,
                adjacentChars: ''
            };
        };

        if (!parsedText || parsedText.length === 0) {
            return emptyContext();
        }

        let levelBlock = parsedText.find(y => y.find(z => z.lineNumber == position.lineNumber && z.column == position.column - 1));
        let charToken;

        //quando triggera autocomplete dopo a capo
        if (!levelBlock && position.column == 1 && position.lineNumber > 1) {
            let levelLineBlock = parsedText.filter(y => y.find(z => z.lineNumber == position.lineNumber - 1));
            if (levelLineBlock.length > 0) {
                levelBlock = levelLineBlock[levelLineBlock.length - 1];
                charToken = levelBlock[levelBlock.length - 1];
            }
        } else {
            charToken = levelBlock?.find(y => y.lineNumber == position.lineNumber && y.column == position.column - 1);
        }

        if (!levelBlock) {
            // Fallback: pick last parsed row block so autocomplete can continue safely.
            levelBlock = parsedText[parsedText.length - 1];
        }

        if (!charToken) {
            charToken = levelBlock?.[levelBlock.length - 1];
        }

        if (!charToken || !levelBlock) {
            return emptyContext();
        }

        let charTokenIndx = levelBlock.indexOf(charToken);
        if (charTokenIndx < 0) {
            charTokenIndx = 0;
        }

        let adjacentChars = (charTokenIndx > 0 ? levelBlock[charTokenIndx].char : '') + (levelBlock.length > charTokenIndx + 1 ? levelBlock[charTokenIndx + 1].char : '');

        let nestingIndex = charToken.nestingIndex;
        let nestingLevel = charToken.nestingLevel;
        let statementIndx = charToken.statementIndex;

        let previousWords: { word: string, statementIndx: number }[] = [];
        let previousNonNestedWords: { word: string, statementIndx: number }[] = [];

        let previousWordString = '';
        let previousNonNestedWordString = '';

        parsedText.forEach((level) => {
            let offset = 0;
            let token = level[offset];
            while (token && (token.lineNumber < position.lineNumber || (token.lineNumber == position.lineNumber && token.column <= position.column))) {
                if (token.nestingLevel == nestingLevel && token.nestingIndex == nestingIndex) {
                    previousNonNestedWordString += token.char;
                }

                previousWordString += token.char;

                offset++;
                token = level.length > offset ? level[offset] : null;
            }
        });

        previousNonNestedWords = previousNonNestedWordString.split(' ').filter(x => x.length > 0).map(x => x.trim().toUpperCase()).map(x => { return { word: x, statementIndx: statementIndx } });
        previousWords = previousWordString.split(' ').filter(x => x.length > 0).map(x => x.trim().toUpperCase()).map(x => { return { word: x, statementIndx: statementIndx } });

        return {
            words: previousWords,
            nonNestedWords: previousNonNestedWords,
            currentStmntIndex: statementIndx,
            position: position,
            // absolutePosition: absolutePosition,
            nestedStatementIndex: nestingIndex,
            nestedStatementLevel: nestingLevel,
            adjacentChars: adjacentChars
        };
    }

    // REWRITE USING processText() !!!
    /**
     * Implementazione legacy del context resolver mantenuta per fallback/confronto.
     * @param originalText Testo SQL originale.
     * @param position Posizione cursore Monaco.
     * @returns ContextInfo calcolato con algoritmo precedente.
     */
    getContextInfoOld(originalText: string, position: monaco.Position): ContextInfo {
        let previousWords: { word: string, statementIndx: number }[] = [];
        let previousNonNestedWords: { word: string, statementIndx: number }[] = [];

        let statementIndex = 1;

        let txtLines = originalText.split('\r\n');
        let nestedStatements = this.getNestedStatements(originalText);

        let parsedInput = this.processText(originalText, position);

        let adjacentChars = '';

        let x = txtLines[position.lineNumber - 1];

        if (x.length >= position.column - 1) {
            if (position.column > 2) {
                adjacentChars = adjacentChars + (x[position.column - 2] || '');
            }
            if (position.column > 1) {
                adjacentChars = adjacentChars + (x[position.column - 1] || '');
            }
        }

        let absolutePosition = 0;
        let endPosition = 0;

        txtLines.forEach((line, indx) => {
            if (indx <= position.lineNumber - 1) {
                if (indx < position.lineNumber - 1) {

                    endPosition = absolutePosition += line.length + 1;

                    let overlappings = nestedStatements.filter(x => (x.index >= absolutePosition && x.index <= endPosition) || (x.index + x[1].length >= absolutePosition && x.index + x[1].length <= endPosition) || (x.index <= absolutePosition && x.index + x[1].length >= endPosition));

                    let cleanString = line;
                    overlappings.forEach(overlapping => {
                        for (let ovIndex = overlapping.index; ovIndex < overlapping.index + overlapping[0].length; ovIndex++) {
                            cleanString = cleanString.substring(0, ovIndex) + '§' + line.substring(ovIndex + 1);
                        }
                    });

                    absolutePosition = endPosition;

                    previousWords = previousWords.concat(line.split(' ').filter(x => x.length > 0).map(x => x.trim().toUpperCase()).map(x => { return { word: x, statementIndx: statementIndex } }));

                    if (cleanString != line) {
                        previousNonNestedWords = previousNonNestedWords.concat(cleanString.substring(0, Math.min(position.column, line.length)).split(' ').filter(x => x.length > 0).map(x => x.trim().toUpperCase()).map(x => { return { word: x.replace(/§/g, ''), statementIndx: statementIndex } }));
                    } else {
                        previousNonNestedWords = previousNonNestedWords.concat(previousWords);
                    }

                } else {

                    endPosition = absolutePosition + Math.min(position.column, line.length);

                    let overlappings = nestedStatements.filter(x => (x.index >= absolutePosition && x.index <= endPosition) || (x.index + x[1].length >= absolutePosition && x.index + x[1].length <= endPosition) || (x.index <= absolutePosition && x.index + x[1].length >= endPosition));

                    let cleanString = line;
                    overlappings.forEach(overlapping => {
                        for (let ovIndex = overlapping.index; ovIndex < overlapping.index + overlapping[0].length; ovIndex++) {
                            cleanString = cleanString.substring(0, ovIndex) + '§' + line.substring(ovIndex + 1);
                        }
                    });

                    absolutePosition = endPosition;

                    previousWords = previousWords.concat(line.substring(0, Math.min(position.column, line.length)).split(' ').filter(x => x.length > 0).map(x => x.trim().toUpperCase()).map(x => { return { word: x, statementIndx: statementIndex } }));

                    if (cleanString != line) {
                        previousNonNestedWords = previousNonNestedWords.concat(cleanString.substring(0, Math.min(position.column, line.length)).split(' ').filter(x => x.length > 0).map(x => x.trim().toUpperCase()).map(x => { return { word: x.replace(/§/g, ''), statementIndx: statementIndex } }));
                    } else {
                        previousNonNestedWords = previousNonNestedWords.concat(previousWords);
                    }
                }

                if (line.trim().endsWith(';')) {
                    statementIndex++;
                }
            }
        });

        let nestedStatementIndex = -1;
        if (nestedStatements.length > 0) {
            nestedStatementIndex = nestedStatements.indexOf(nestedStatements.find(x => {
                return x.length > 1 && x.index <= absolutePosition && x.index + x[1].length >= absolutePosition;
            }));

            if (nestedStatementIndex >= 0) {
                let currentStatementuniqueWords = previousWords.map((x, indx) => x.word + indx.toString());

                let nestings = currentStatementuniqueWords.filter(x => x.startsWith('('))
                    .map((x, indx) => currentStatementuniqueWords.indexOf(x));
                if (nestings.length > nestedStatementIndex) {
                    previousWords = previousWords.filter((x, indx) => indx >= nestings[nestedStatementIndex]).map(x => { return { word: x.word.replace('(', '').trim(), statementIndx: x.statementIndx } }).filter(x => x.word.length > 0);
                }
            }
        }

        return {
            words: previousWords,
            nonNestedWords: previousNonNestedWords,
            currentStmntIndex: statementIndex,
            position: position,
            absolutePosition: absolutePosition,
            nestedStatementIndex: nestedStatementIndex,
            adjacentChars: adjacentChars
        };
    }

    /**
     * Determina il tipo contesto autocomplete (SELECT/FROM/WHERE/JOIN/SET/...) in base ai token normalizzati dello statement corrente.
     * @param contextInfo Informazioni contesto cursore.
     * @returns Enum `autocompleteContext` risolto.
     */
    getAutocompleteContext(contextInfo: ContextInfo) {
        //use this.currents.statements !!!
        //triggerKind = 0 = word

        let currentStatementWords: string[];
        let contextWords: { word: string, statementIndx: number }[] = [];
        let statementIndex = contextInfo.currentStmntIndex;

        if (contextInfo.nestedStatementLevel > 0) {
            contextWords = contextInfo.words.filter(x => x.statementIndx == statementIndex);
        } else {
            contextWords = contextInfo.nonNestedWords.filter(x => x.statementIndx == statementIndex);
        }

        let normalized = this.normalizeStatement(contextWords.map((x, indx) => { return { token: x.word, tokenIndx: indx } }));
        currentStatementWords = normalized.map(x => x.token.replace("(", ""));

        let keywordIndx = -1;
        let matchingKeyWords = currentStatementWords.filter(x => sqlKeywords.indexOf(x.toUpperCase()) >= 0);

        let matchingKeyWord = matchingKeyWords.length > 0 ? matchingKeyWords[matchingKeyWords.length - 1] : '';

        if (matchingKeyWord) {
            keywordIndx = sqlKeywords.indexOf(matchingKeyWord.toUpperCase());
        }

        if (keywordIndx >= 0) {
            let currentStmnt = this.currents.statements.find(x => x.index == statementIndex);
            if (currentStmnt) {
                let subStmnt = currentStmnt.subStatements.find(x => x.key.toUpperCase() == matchingKeyWord.toUpperCase());
                let match = { key: null, statement: null, parentStatement: null, desiredLevel: -1, desiredIndex: -1 };

                if (contextInfo.nestedStatementLevel > 0) {
                    match.desiredLevel = 1; // implement contextInfo.nestedStatementLevel
                    match.desiredIndex = contextInfo.nestedStatementIndex;

                    this.getNestedStatement(currentStmnt, matchingKeyWord.toUpperCase(), match);
                    if (match.statement) {
                        subStmnt = match;
                        currentStmnt = match.parentStatement;
                    }
                }
                else if (!subStmnt) {
                    this.getNestedStatement(currentStmnt, matchingKeyWord.toUpperCase(), match);
                    if (match.statement) {
                        subStmnt = match;
                    }
                }

                if (subStmnt) {

                    contextInfo.currentStatement = currentStmnt;
                    contextInfo.currentSubStatement = subStmnt;

                    let currentSubStmntWords = subStmnt.statement.words;

                    switch (subStmnt.key) {
                        case 'DECLARE':

                            if (currentSubStmntWords[currentSubStmntWords.length - 1].token.indexOf('@') < 0) {
                                return autocompleteContext.declaration;
                            } else {
                                return autocompleteContext.sqlType;
                            }

                        case 'UPDATE':

                            return this.evaluateAutocompleteContext(contextInfo, subStmnt.statement, true, autocompleteContext.statementSet);

                        case 'INSERT INTO':

                            return this.evaluateAutocompleteContext(contextInfo, subStmnt.statement, true, null,
                                (statement, contextInfo) => {
                                    if (contextInfo.adjacentChars == '()') {
                                        if (statement.sqlTables.length > 0) {
                                            return autocompleteContext.columnWhereSkipAlias;
                                        }
                                    } else if (contextInfo.adjacentChars == ')' || !contextInfo.adjacentChars) {
                                        return autocompleteContext.columnWhereSkipAlias;
                                    }

                                    console.log('table!!!');
                                    return autocompleteContext.table;
                                });

                        case 'SELECT':

                            let previousWord;
                            let nextWord;

                            let previousWords = currentSubStmntWords.filter(x => x.tokenIndx < contextInfo.position.column - 1);

                            if (previousWords.length > 0) {
                                previousWord = previousWords[previousWords.length - 1];
                            }

                            let nextWords = currentSubStmntWords.filter(x => x.tokenIndx >= contextInfo.position.column - 1);

                            if (nextWords.length > 0) {
                                nextWord = nextWords[0];
                            }

                            let selectLastToken = (currentSubStmntWords[currentSubStmntWords.length - 1]?.token || '').trim();

                            if (selectLastToken.indexOf('.') >= 0) {
                                // Alias-qualified column completion (e.g. AppCit. or AppCit.Sta)
                                return autocompleteContext.columnWhereRestricted;
                            }
                            if (contextInfo.adjacentChars == '()' || (previousWord && nextWord && previousWord.token[previousWord.token.length - 1] == '(' && nextWord.token[0] == ')')) {
                                return autocompleteContext.columnSelect;
                            } else if (currentSubStmntWords[currentSubStmntWords.length - 1].token.indexOf(',') >= 0 || currentSubStmntWords[currentSubStmntWords.length - 1].token.toUpperCase() == 'SELECT') {
                                return autocompleteContext.columnSelect;
                            } else {
                                return autocompleteContext.statementFrom;
                            }

                        case 'FROM':
                            // After at least one table in FROM, allow partial clause prefixes
                            // (e.g. "I" => "INNER JOIN") while keeping schema suggestions otherwise.
                            return this.evaluateAutocompleteContext(
                                contextInfo,
                                subStmnt.statement,
                                false,
                                subStmnt.statement.sqlTables.length > 0 ? autocompleteContext.statementWhereJoin : null
                            );

                        case 'AS':

                            if (matchingKeyWords.length > 1 && matchingKeyWords[matchingKeyWords.length - 2] == 'WITH') {
                                return autocompleteContext.statementSelect;
                            } else {
                                return autocompleteContext.statementWhereJoin;
                            }

                        case 'WHERE':

                            return this.evaluateAutocompleteWhereContext(this.currents, currentSubStmntWords.map(x => x.token), subStmnt.statement);

                        case 'INNER JOIN':
                        case 'LEFT JOIN':
                        case 'RIGHT JOIN':

                            if (currentSubStmntWords.length > 1) {
                                let schemaTableAliasToken = currentSubStmntWords[1];

                                if (schemaTableAliasToken) {
                                    let schemaAndTableOrAlias = schemaTableAliasToken.token.split('.').filter(x => x.length > 0);

                                    if (schemaAndTableOrAlias.length > 0) {

                                    } else {
                                        return autocompleteContext.schema;
                                    }

                                    if (schemaAndTableOrAlias.length >= 1) {

                                    }
                                    else {
                                        return autocompleteContext.table;
                                    }

                                    if (currentSubStmntWords[currentSubStmntWords.length - 1].token.toUpperCase() == subStmnt.key.toUpperCase()) {
                                        return autocompleteContext.schemaJoin;
                                    } else {
                                        return autocompleteContext.tableJoin;
                                    }
                                }
                                else {
                                    return autocompleteContext.schemaJoin;
                                }

                            }
                            else {
                                return autocompleteContext.schemaJoin;
                            }

                        case 'ON':

                            return this.evaluateAutocompleteContext(contextInfo, subStmnt.statement, true, autocompleteContext.statementWhereJoin);

                        case 'ORDER BY':

                            return autocompleteContext.columnOrder;

                        case 'GROUP BY':

                            return autocompleteContext.columnGroupBy;

                        case 'SET':

                            if (currentSubStmntWords[currentSubStmntWords.length - 1].token.trim().toUpperCase() == 'SET') {
                                let updtStmnt = currentStmnt.subStatements.find(x => x.key == 'UPDATE');
                                if (updtStmnt && updtStmnt.statement.words.length > 1) {
                                    // this.currents.table = updtStmnt.statement.sqlTables[updtStmnt.statement.sqlTables.length - 1];
                                    return autocompleteContext.columnWhere;
                                } else {
                                    return autocompleteContext.variable;
                                }
                            }
                            else {
                                if (currentSubStmntWords[currentSubStmntWords.length - 1].token.trim().endsWith(',')) {
                                    return autocompleteContext.columnWhere;
                                }
                                else if (currentSubStmntWords[currentSubStmntWords.length - 1].token.trim() == '=') {
                                    return autocompleteContext.columnWhereAndVariables;
                                }
                                else {
                                    return autocompleteContext.assignmentOperator;
                                }
                            }

                            break;
                    }
                }
            }
        }

        return autocompleteContext.statement;
    }

    evaluateAutocompleteContext(contextInfo: ContextInfo, statement: Statement, skipAs: boolean = false,
        defaultAutoCtx: autocompleteContext = null,
        contextDelegate: (statement: Statement, contextInfo: ContextInfo) => autocompleteContext = null) {
        const lastToken = statement?.words?.length
            ? (statement.words[statement.words.length - 1].token || '').trim()
            : '';
        const lastDotIndex = lastToken.lastIndexOf('.');

        if (lastDotIndex >= 0) {

            if (lastDotIndex < lastToken.length - 1) {
                if (!defaultAutoCtx && !contextDelegate) {
                    return autocompleteContext.statementWhereJoin;
                } else if (contextDelegate) {
                    return contextDelegate(statement, contextInfo);
                } else {
                    return defaultAutoCtx;
                }
            } else {
                if (statement.sqlTables.length > 0) {
                    return autocompleteContext.columnWhereRestricted
                } else {
                    if (!skipAs) {
                        return autocompleteContext.table;
                    } else {
                        return autocompleteContext.tableNoAs;
                    }
                }
            }

        } else {
            if (defaultAutoCtx !== null && this.matchesDefaultContextPrefix(lastToken, defaultAutoCtx)) {
                return defaultAutoCtx;
            }
            return autocompleteContext.schema;
        }
    }

    /**
     * Verifica se il token parziale corrente puo ancora essere completato verso la keyword attesa dal contesto di default.
     * @param lastToken Token corrente.
     * @param defaultAutoCtx Contesto default previsto.
     * @returns `true` se il prefisso e compatibile.
     */
    private matchesDefaultContextPrefix(lastToken: string, defaultAutoCtx: autocompleteContext): boolean {
        const token = (lastToken || '').trim().toUpperCase();
        if (!token) {
            return false;
        }

        switch (defaultAutoCtx) {
            case autocompleteContext.statementWhereJoin:
                return ['WHERE', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'ORDER BY', 'GROUP BY']
                    .some(x => x.startsWith(token));
            case autocompleteContext.statementSet:
                return 'SET'.startsWith(token);
            default:
                return false;
        }
    }

    /**
     * Affina il contesto in clausola WHERE decidendo tra suggerimento colonna o operatore confronto.
     * @param currents Stato parser corrente.
     * @param currentStatementWords Token statement corrente.
     * @param whereSubStatemnt Sub-statement WHERE.
     * @returns Context specifico WHERE.
     */
    evaluateAutocompleteWhereContext(currents: CurrentProviderDataContext, currentStatementWords: string[], whereSubStatemnt: Statement) {

        let lastToken = currentStatementWords[currentStatementWords.length - 1].trim().toUpperCase();

        if (lastToken == 'AND' || lastToken == 'WHERE') {
            return autocompleteContext.columnWhere;
        } else {
            return autocompleteContext.comparisonOperator;
        }

    }

    // #endregion

    // #region create parsing model

    /**
     * Resetta le strutture parse correnti (dichiarazioni, statement parsed, tabelle globali).
     */
    private clearCurrents() {
        this.currents.declarations = [];
        this.currents.statements = [];
        this.currents.globalTables = [];
    }

    /**
     * Parsifica tutti gli statement precedenti invocando ricorsivamente `parseStatementRecursive` su ciascuno.
     */
    parseStatements() {
        //https://www.npmjs.com/package/js-sql-parser
        //https://www.npmjs.com/package/node-sql-parser
        //https://github.com/forward/sql-parser
        //https://github.com/sqljs/node-sqljs

        this.clearCurrents();

        this.previousStatements.forEach((statement, stmntIndx) => {

            let sanitedStatement = this.sanitize(statement);

            this.parseStatementRecursive(sanitedStatement, stmntIndx);
        });

    }

    /**
     * Costruisce il modello `Statement` ricorsivo per uno statement SQL:
     * individua keyword, nested statement, tabelle, alias, colonne e relazioni.
     * @param statement Testo statement da analizzare.
     * @param stmntIndx Indice statement nel batch.
     * @param parentStatement Parent opzionale per annidamento.
     */
    private parseStatementRecursive(statement: string, stmntIndx: number, parentStatement?: Statement) {
        let statementObj = new Statement(statement, stmntIndx + 1);

        if (parentStatement) {
            parentStatement.subStatements.push({ key: statement.trim(), statement: statementObj });
        }

        let subStatement: Statement;

        let nestedStatements = this.getNestedStatements(statement);
        let z = nestedStatements[0];

        statementObj.statement = this.removeNestedStatements(statement, nestedStatements);

        let previousWords = statement.split(' ').filter(x => x.length > 0).map((x, splitIndx) => {
            return {
                token: x.trim(),
                tokenIndx: 0
            }
        });

        previousWords.forEach((x, indx) => {
            x.tokenIndx = indx == 0 ? 0 : (previousWords[indx - 1].tokenIndx + previousWords[indx - 1].token.length + 1);
        });

        let sanitizedPreviousWords = this.normalizeStatement(previousWords);

        statementObj.words = sanitizedPreviousWords;

        let currentStatementTag: string;

        let found = false;
        let nested = null;

        for (let indx = 0; indx < sanitizedPreviousWords.length; indx++) {
            const elementObj = sanitizedPreviousWords[indx];
            let element = elementObj.token;

            let indxOffset = 0;
            for (let nestedIndex = 0; nestedIndex < nestedStatements.length; nestedIndex++) {
                nested = nestedStatements[nestedIndex];
                if (nested.length > 1 && elementObj.tokenIndx >= nested.index && elementObj.tokenIndx <= nested.index + nested[1].length) {
                    this.parseStatementRecursive(nested[1], indx, subStatement);
                    let firstWordOutsideNested = sanitizedPreviousWords.find(x => x.tokenIndx > nested.index + nested[1].length);
                    indxOffset = sanitizedPreviousWords.indexOf(firstWordOutsideNested) - 1;
                }
            }

            if (indxOffset > 0) {
                indx = indxOffset;
                continue;
            }

            if (sqlKeywords.indexOf(element.toUpperCase()) >= 0) {
                currentStatementTag = element;

                subStatement = new Statement(element, Object.keys(statementObj.subStatements).length + 1);
                subStatement.words.push(elementObj);
                statementObj.subStatements.push({ key: currentStatementTag.toUpperCase(), statement: subStatement });

                found = false;
            } else {

                if (subStatement) {
                    subStatement.words.push(elementObj);
                    subStatement.statement = `${subStatement.statement} ${element}`;
                }

                if (!found) {
                    switch ((currentStatementTag || '').toUpperCase()) {

                        case 'DECLARE':

                            found = this.populateDeclarations(statement, found);

                            break;

                        // case 'SELECT':
                        //     break;
                        case 'UPDATE':
                        case 'INSERT INTO':
                        case 'FROM':
                        case 'INNER JOIN':
                        case 'LEFT JOIN':
                        case 'RIGHT JOIN':
                        case 'ON':

                            found = this.populateCurrentSchemaTables(element, stmntIndx, found, statementObj, subStatement);
                            this.populateCurrentColumns(element, stmntIndx, statementObj, subStatement);

                            break;

                        case 'AS':

                            found = this.populateAlias(element, stmntIndx, found, statementObj, subStatement);

                            break;

                        case 'CREATE TABLE':

                            found = this.populateGlobalTables(statement, found);

                            break;

                        default:
                            break;
                    }
                }

            }
        }

        if (!parentStatement) {
            this.currents.statements.push(statementObj);
        }
    }

    /**
     * Rileva definizioni tabelle temporanee (`#temp`) e popola la lista global tables con relative colonne/tipi.
     * @param statement Statement corrente.
     * @param found Flag stato parsing corrente.
     * @returns `true` se e stata trovata una tabella globale.
     */
    populateGlobalTables(statement, found) {
        let tableName = statement.split(' ').find(x => x.indexOf('#') == 0);

        if (tableName) {
            tableName = tableName.split('(')[0];

            let table = new SqlTable();
            table.table = tableName;
            table.alias = tableName;

            table.columns = statement.split('(')[1].split(')')[0].split(',').map(x => {
                let col = new SqlColumn();
                col.column = x.split(' ')[0].trim();
                col.table = tableName;

                if (x.split(' ').length > 1) {
                    col.type = x.split(' ')[1].trim();
                }

                return col;
            });

            if (!this.currents.globalTables.find(x => x.table.toUpperCase() == table.table.toUpperCase())) {
                this.currents.globalTables.push(table);
            }

            return true;
        }

        return false;
    }

    /**
     * Estrae dichiarazioni variabili (`DECLARE @...`) e associa eventuali user-defined table types disponibili.
     * @param statement Statement corrente.
     * @param found Flag stato parsing corrente.
     * @returns `true` se e stata aggiunta una dichiarazione.
     */
    private populateDeclarations(statement: string, found: boolean) {
        if (statement.indexOf('@') >= 0) {
            let decStr = statement.trim().toUpperCase().split(' ');
            if (decStr.length >= 3) {
                let dec = { paramName: decStr[1], paramtype: decStr[2], usertype: null };

                let type;
                if (decStr[2].indexOf('.') >= 0) {
                    type = this.userDefTypes.find(x => x.table.toUpperCase() == decStr[2].split('.')[1] && x.schema.toUpperCase() == decStr[2].split('.')[0]);
                } else {
                    type = this.userDefTypes.find(x => x.table.toUpperCase() == decStr[2].split('.')[0] && x.schema.toUpperCase() == 'DBO');
                }

                if (type) {
                    dec.usertype = type;
                }

                if (!this.currents.declarations.find(x => x.paramName.toUpperCase() == dec.paramName.toUpperCase())) {
                    this.currents.declarations.push(dec);
                }

                found = true;
            }
        }
        return found;
    }

    /**
     * Popola l'elenco colonne correnti risolvendole da SELECT + contesto tabelle/alias/schema nello statement analizzato.
     * @param element Frammento statement.
     * @param stmntIndx Indice statement.
     * @param statementObj Modello statement principale.
     * @param subStatement Sub-statement corrente.
     */
    private populateCurrentColumns(element: string, stmntIndx: number, statementObj: Statement, subStatement: Statement) {

        let selStmnt = statementObj.subStatements.find(x => x.key == 'SELECT');
        if (selStmnt) {
            let columns: { column: SqlColumn, usedAlias: string }[] = selStmnt.statement.statement.replace('SELECT', '').trim().toUpperCase().split(',').filter(x => x).map(x => {
                let col = null;

                x = x.trim();

                let ownerTbl: SqlTable;
                let isAlias = false;

                if (x.indexOf('.') >= 0) {
                    let schema = x.split('.')[0].replace('[', '').replace(']', '').replace('(', '').replace(')', '').toUpperCase();

                    let ownerSchema = this.schemas.find(s => s.schema.toUpperCase() === schema);

                    if (!ownerSchema) {
                        ownerSchema = this.schemas.find(x => x.tables.find(t => t.alias.toUpperCase() === schema));
                        if (ownerSchema) {
                            ownerTbl = ownerSchema.tables.find(t => t.alias.toUpperCase() === schema);
                            isAlias = true;
                        }
                    } else if (x.split('.').length > 1) {
                        ownerTbl = ownerSchema.tables.find(t => t.table.toUpperCase() === x.split('.')[1].replace('[', '').replace(']', '').replace('(', '').replace(')', '').toUpperCase());
                    }

                    if (ownerTbl) {
                        let colDef = x.split('.')[isAlias ? 1 : 2].replace('[', '').replace(']', '').replace('(', '').replace(')', '').trim().toUpperCase().split(' ');
                        let ownerCol = ownerTbl.columns.find(c => c.column.toUpperCase() === colDef[0].toUpperCase());
                        if (ownerCol) {
                            col = {
                                column: ownerCol,
                                usedAlias: colDef.length > 1 ? colDef[1] : ''
                            };
                        }
                    }

                } else {
                    let colDef = x.trim().replace('[', '').replace(']', '').replace('(', '').replace(')', '').toUpperCase().split(' ');

                    if (colDef.length == 2) {
                        let tbl = statementObj.sqlTables.find(t => t.table.columns.find(c => c.column.toUpperCase() === colDef[0]));

                        if (tbl) {
                            let tableCol = tbl.table.columns.find(c => c.column.toUpperCase() === colDef[1]);
                            if (tableCol) {
                                col = {
                                    column: tableCol,
                                    usedAlias: colDef[1]
                                };
                            }
                        }
                    }
                    else if (colDef.length == 1) {
                        let tbl = statementObj.sqlTables.find(t => t.table.columns.find(c => c.column.toUpperCase() === colDef[0]));

                        if (tbl) {
                            let tableCol = tbl.table.columns.find(c => c.column.toUpperCase() === colDef[0]);
                            if (tableCol) {
                                col = {
                                    column: tableCol,
                                    usedAlias: ''
                                };
                            }
                        }
                    }
                }

                return col;

            }).filter(x => x);


            columns.forEach(x => {
                let normalizedColumn = x?.column?.column?.toUpperCase();
                if (!normalizedColumn) {
                    return;
                }

                if (statementObj) {
                    if (!statementObj.sqlColumns.find(c => c?.column?.column?.toUpperCase() == normalizedColumn)) {
                        statementObj.sqlColumns.push(x);
                    }
                }
                if (subStatement) {
                    if (!subStatement.sqlColumns.find(c => c?.column?.column?.toUpperCase() == normalizedColumn)) {
                        subStatement.sqlColumns.push(x);
                    }
                }
            });
        }
    }

    /**
     * Associa alias dichiarati alle tabelle risolte nel FROM/JOIN e propaga l'alias alle colonne della tabella.
     * @param element Frammento statement.
     * @param stmntIndx Indice statement.
     * @param found Flag stato parsing corrente.
     * @param statementObj Modello statement principale.
     * @param subStatement Sub-statement corrente.
     * @returns `true` se alias valido applicato.
     */
    populateAlias(element: string, stmntIndx: number, found: boolean, statementObj: Statement, subStatement: Statement) {
        if (subStatement) {
            if (subStatement.words.length > 1) {
                let alias = subStatement.words[1].token.replace('[', '').replace(']', '').replace('(', '').replace(')', '');
                if (alias) {
                    let fromStmnt; // = statementObj.subStatements.find(x => x.key == 'FROM');
                    let matchTbl: { table: SqlTable, usedAlias: string };

                    let subStatementIndex = statementObj.subStatements.indexOf(statementObj.subStatements.find(x => x.statement.statement == subStatement.statement));

                    if (subStatementIndex > 1) {
                        fromStmnt = statementObj.subStatements[subStatementIndex - 1];
                    }

                    if (fromStmnt && fromStmnt.statement.sqlTables.length > 0) {
                        matchTbl = fromStmnt.statement.sqlTables[0] //.find(x => x.table.table.toUpperCase() == tbl.table.toUpperCase() && x.table.schema.toUpperCase() == tbl.schema.toUpperCase());
                        if (matchTbl) {
                            matchTbl.usedAlias = alias;
                            matchTbl.table.columns.forEach(col => {
                                col.tableAlias = alias;
                            });
                        }
                    }

                    if (matchTbl && statementObj && statementObj.sqlTables.length > 0) {
                        matchTbl = statementObj.sqlTables.find(x => x.table.table.toUpperCase() == matchTbl.table.table.toUpperCase() && x.table.schema.toUpperCase() == matchTbl.table.schema.toUpperCase());
                        if (matchTbl) {
                            matchTbl.usedAlias = alias;
                            matchTbl.table.columns.forEach(col => {
                                col.tableAlias = alias;
                            });
                        }
                    }
                }
            }
        }

        return true;
    }

    /**
     * Risolve riferimenti tabella `db.schema.table`/`schema.table` dentro FROM/JOIN e popola le tabelle correnti dello statement.
     * @param element Frammento statement.
     * @param stmntIndx Indice statement.
     * @param found Flag stato parsing corrente.
     * @param statementObj Modello statement principale.
     * @param subStatement Sub-statement corrente.
     * @returns `true` se tabella schema-resolved trovata.
     */
    private populateCurrentSchemaTables(element: string, stmntIndx: number, found: boolean, statementObj: Statement, subStatement: Statement) {
        let tblStr = element.trim().toUpperCase().split(' ');

        if (tblStr.length > 0 && tblStr[0].split('.').length > 1) {
            let identifierParts = tblStr[0].replace('[', '').replace(']', '').split('.').filter(x => x);
            let schemaName = '';
            let tableName = '';
            let dbName = '';

            if (identifierParts.length >= 3) {
                dbName = identifierParts[0];
                schemaName = identifierParts[1];
                tableName = identifierParts[2].split('(')[0];
            } else {
                schemaName = identifierParts[0];
                tableName = (identifierParts[1] || '').split('(')[0];
            }

            let match = this.schemas.find(x => {
                let modelSchema = this.getModelSchemaName(x).toUpperCase();
                let modelDb = (this.getModelDatabaseName(x) || '').toUpperCase();
                return modelSchema === schemaName.toUpperCase() && (!dbName || modelDb === dbName.toUpperCase());
            });

            if (match) {
                if (statementObj) {
                    let matchSchema = statementObj.sqlModels.find(x => match.schema.toUpperCase() === x.schema.toUpperCase());
                    if (!matchSchema) {
                        statementObj.sqlModels.push(match);
                    }
                }

                if (subStatement) {
                    let matchSchema = subStatement.sqlModels.find(x => match.schema.toUpperCase() === x.schema.toUpperCase());
                    if (!matchSchema) {
                        subStatement.sqlModels.push(match);
                    }
                }

                let matchTable = match.tables.find(x => x.table.toUpperCase() === tableName.toUpperCase());

                if (matchTable) {
                    if (statementObj) {
                        let matchTbl = statementObj.sqlTables.find(x => x.table.table.toUpperCase() == matchTable.table.toUpperCase() && x.table.schema.toUpperCase() == matchTable.schema.toUpperCase());
                        if (!matchTbl) {
                            statementObj.sqlTables.push({ table: matchTable, usedAlias: '' });
                        }
                    }

                    if (subStatement) {
                        let matchTbl = subStatement.sqlTables.find(x => x.table.table.toUpperCase() == matchTable.table.toUpperCase() && x.table.schema.toUpperCase() == matchTable.schema.toUpperCase());
                        if (!matchTbl) {
                            subStatement.sqlTables.push({ table: matchTable, usedAlias: '' });
                        }
                    }

                    found = true;
                }
            } else {
                let aliasCandidate = identifierParts[0] || '';
                let matchTbl = statementObj.sqlTables.find(x => x.usedAlias.toUpperCase() === aliasCandidate.toUpperCase());
                if (matchTbl) {
                    if (!subStatement.sqlTables.find(x => x.table.table.toUpperCase() == matchTbl.table.table.toUpperCase() && x.table.schema.toUpperCase() == matchTbl.table.schema.toUpperCase())) {
                        subStatement.sqlTables.push({ table: matchTbl.table, usedAlias: matchTbl.usedAlias });
                    }
                    let matchSchema = statementObj.sqlModels.find(x => matchTbl.table.schema.toUpperCase() === x.schema.toUpperCase());
                    if (matchSchema && !subStatement.sqlModels.find(x => matchTbl.table.schema.toUpperCase() === x.schema.toUpperCase())) {
                        subStatement.sqlModels.push(matchSchema);
                    }
                }
            }
        }
        return found;
    }

    // #endregion

    // #region create suggestions

    getSuggestionsByContext(
        context: autocompleteContext,
        range: monaco.IRange,
        originalText: string,
        contextInfo: ContextInfo,
        scaffoldedOnly: boolean = true
    ): monaco.languages.CompletionList {
        let ci: monaco.languages.CompletionItem[] = [];

        let selectFields: SqlColumn[] = [];

        let newLinePrepend = '';

        if (range.endLineNumber == 1 || originalText.split('\r\n')[range.endLineNumber - 1].indexOf(' ') > 0) {
            newLinePrepend = '\r\n';
        }

        let currentStatement: Statement = contextInfo.currentStatement;
        let currentSubStatement: Statement;

        if (currentStatement) {
            currentSubStatement = contextInfo.currentSubStatement.statement;
        }

        if (currentStatement && currentStatement.sqlTables.length > 0) {
            currentStatement.sqlTables.forEach(tbl => {
                selectFields = selectFields.concat(tbl.table.columns);
            });
        }

        switch (context) {

            case autocompleteContext.statement:
                ci = sqlKeywords.map(x => {
                    return {
                        documentation: x,
                        insertText: x,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        label: x,
                        range: range
                    };
                });

                break;

            case autocompleteContext.statementSelect:
                ci = [
                    {
                        documentation: 'SELECT',
                        insertText: `${newLinePrepend}SELECT`,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        label: 'SELECT',
                        range: range
                    }
                ];

                break;

            case autocompleteContext.statementFrom:
                ci = [
                    {
                        documentation: 'FROM',
                        insertText: `${newLinePrepend}FROM`,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        label: 'FROM',
                        range: range
                    }
                ];

                break;

            case autocompleteContext.statementValues:
                ci = [
                    {
                        documentation: 'VALUES()',
                        insertText: `${newLinePrepend}VALUES()`,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        label: 'VALUES()',
                        range: range
                    }
                ];

                break;


            case autocompleteContext.assignmentOperator:

            case autocompleteContext.statementSet:
                ci = [
                    {
                        documentation: 'SET',
                        insertText: `${newLinePrepend}SET`,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        label: 'SET',
                        range: range
                    }
                ];

                break;

            case autocompleteContext.statementWhereJoin:

                ci = [
                    {
                        documentation: 'WHERE',
                        insertText: `${newLinePrepend}WHERE`,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        label: 'WHERE',
                        range: range
                    },
                    {
                        documentation: 'INNER JOIN',
                        insertText: `${newLinePrepend}INNER JOIN`,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        label: 'INNER JOIN',
                        range: range
                    },
                    {
                        documentation: 'LEFT JOIN',
                        insertText: `${newLinePrepend}LEFT JOIN`,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        label: 'LEFT JOIN',
                        range: range
                    },
                    {
                        documentation: 'RIGHT JOIN',
                        insertText: `${newLinePrepend}RIGHT JOIN`,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        label: 'RIGHT JOIN',
                        range: range
                    },
                    {
                        documentation: 'ORDER BY',
                        insertText: `${newLinePrepend}ORDER BY`,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        label: 'ORDER BY',
                        range: range
                    },
                    {
                        documentation: 'GROUP BY',
                        insertText: `${newLinePrepend}GROUP BY`,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        label: 'GROUP BY',
                        range: range
                    }
                ].filter(x => {
                    if (currentStatement) {
                        if (currentStatement.subStatements.find(s => x.label.indexOf('JOIN') < 0 && x.label == s.key.toUpperCase())) {
                            return false;
                        }
                    }

                    return true;
                });

                break;

            case autocompleteContext.statementOn:

                ci = [
                    {
                        documentation: 'ON',
                        insertText: `${newLinePrepend}ON`,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        label: 'ON',
                        range: range
                    }
                ];

                break;

            case autocompleteContext.columnSelect:
            case autocompleteContext.columnWhere:
            case autocompleteContext.columnOrder:
            case autocompleteContext.columnGroupBy:
            case autocompleteContext.columnWhereAndVariables:
            case autocompleteContext.columnWhereRestricted:
            case autocompleteContext.columnWhereSkipAlias:

                if (context == autocompleteContext.columnWhereAndVariables) {
                    ci = this.currents.declarations.map(x => {
                        return {
                            documentation: x.paramName,
                            insertText: `${x.paramName}`,
                            kind: monaco.languages.CompletionItemKind.Variable,
                            label: x.paramName,
                            range: range
                        };
                    });
                }

                ci = ci.concat(selectFields.filter(x => {
                    if (context == autocompleteContext.columnSelect && currentStatement.sqlColumns.find(c => c?.column?.column?.toUpperCase() == x.column.toUpperCase())) {
                        return false;
                    }
                    return true;
                }).filter(x => {
                    if (context == autocompleteContext.columnWhereRestricted) {
                        let restrictedToken = (currentSubStatement?.words?.[currentSubStatement.words.length - 1]?.token || '').trim();
                        let restrictedParts = restrictedToken
                            .replace('[', '')
                            .replace(']', '')
                            .replace('(', '')
                            .replace(')', '')
                            .split('.')
                            .filter(y => y)
                            .map(y => y.trim().toUpperCase());

                        if (!scaffoldedOnly && restrictedParts.length >= 3) {
                            let dbFilter = restrictedParts[0];
                            let schemaFilter = restrictedParts[1];
                            let tableFilter = restrictedParts[2];
                            let colDb = (this.getColumnDatabaseName(x) || '').toUpperCase();
                            return x.schema.toUpperCase() === schemaFilter
                                && x.table.toUpperCase() === tableFilter
                                && (!dbFilter || colDb === dbFilter);
                        }

                        if (restrictedParts.length >= 1 && restrictedToken.indexOf('.') >= 0) {
                            let aliasFilter = restrictedParts[0];
                            return (x.tableAlias || '').toUpperCase() === aliasFilter;
                        }

                        let scopedTables = (currentSubStatement?.sqlTables && currentSubStatement.sqlTables.length > 0)
                            ? currentSubStatement.sqlTables
                            : (currentStatement?.sqlTables || []);
                        return scopedTables.find(y => (y.usedAlias || '').toUpperCase() == (x.tableAlias || '').toUpperCase());
                    }
                    return true;
                }).map(x => {
                    let restrictedToken = (currentSubStatement?.words?.[currentSubStatement.words.length - 1]?.token || '').trim();
                    let isAliasQualifiedCompletion = context == autocompleteContext.columnWhereRestricted && restrictedToken.indexOf('.') >= 0;

                    let aliasStmnts = currentStatement.subStatements.filter(s => s.key == 'FROM' || s.key.indexOf('JOIN') >= 0 || s.key == 'ON');
                    let aliasStmnt = aliasStmnts.find(y => y.statement.sqlTables.length > 0 &&
                        y.statement.sqlTables[0].table.schema.toUpperCase() == x.schema.toUpperCase() &&
                        y.statement.sqlTables[0].table.table.toUpperCase() == x.table.toUpperCase());

                    let str = `${x.schema}.${x.table}.${x.column}`;

                    if (context == autocompleteContext.columnWhereSkipAlias) {
                        str = x.column;
                    }
                    else if (isAliasQualifiedCompletion && !scaffoldedOnly) {
                        // User already typed "<alias>.", so only append the column name.
                        str = x.column;
                    }
                    else if (aliasStmnt) {
                        str = `${aliasStmnt.statement.sqlTables[0].usedAlias}.${x.column}`;
                    }

                    let longDescr = `${x.column} (${x.type}, ${x.isNullable ? 'null' : 'not null'})${x.columnDescription ? ` - ${x.columnDescription}` : ''}`;

                    return {
                        documentation: longDescr,
                        insertText: str,
                        kind: x.isPkey ? monaco.languages.CompletionItemKind.Keyword : (x.parentRelation) ? monaco.languages.CompletionItemKind.Reference : monaco.languages.CompletionItemKind.Field,
                        label: longDescr,
                        range: range
                    };
                }));

                if (context == autocompleteContext.columnSelect || context == autocompleteContext.columnWhere || context == autocompleteContext.columnWhereSkipAlias) {
                    let allCols = ci.map(x => {
                        return x.insertText;
                    }).join(',');

                    ci.push({
                        documentation: '<All columns>',
                        insertText: allCols,
                        kind: monaco.languages.CompletionItemKind.Field,
                        label: '<All columns>',
                        range: range
                    });
                }

                if (context == autocompleteContext.columnSelect) {
                    ci.splice(0, 0, {
                        documentation: '*',
                        insertText: '*',
                        kind: monaco.languages.CompletionItemKind.Field,
                        label: '*',
                        range: range
                    });
                }

                break;

            case autocompleteContext.comparisonOperator:

                ci = comparisonOperators.filter(x => {
                    // if (this.currents.column && this.currents.column.type) {
                    //     var sqlType = sqlTypes.find(x => x.name.toUpperCase() == this.currents.column.type.toUpperCase());
                    //     if (sqlType) {
                    //         switch (true) {
                    //             case sqlType.isString:
                    //                 return ['=', '<>', '!=', '!', 'NOT', 'LIKE', 'IN', 'IS', 'IS NOT NULL'].indexOf(x) >= 0;
                    //             case sqlType.isNumber:
                    //                 return ['=', '<>', '<', '<=', '>', '>=', '!=', '!', 'NOT', 'BETWEEN', 'IN', 'IS', 'IS NOT NULL'].indexOf(x) >= 0;
                    //             case sqlType.isBool:
                    //                 return ['=', '<>', '!=', '!', 'NOT', 'IS', 'IS NOT NULL'].indexOf(x) >= 0;
                    //             default:
                    //                 return true;
                    //         }
                    //     }
                    // }
                    return true;
                }).map(x => {
                    return {
                        documentation: x,
                        insertText: `${x}`,
                        kind: monaco.languages.CompletionItemKind.Operator,
                        label: x,
                        range: range
                    };
                });

                break;

            case autocompleteContext.schema:
            case autocompleteContext.schemaJoin:

                if (context == autocompleteContext.schemaJoin) {
                    currentStatement.sqlTables.forEach(tbl => {
                        this.parseTblRelations(currentStatement, tbl, ci, range);
                    });
                } else {
                    if (!scaffoldedOnly) {
                        const dbs = Array.from(new Set(this.schemas
                            .map(x => this.getModelDatabaseName(x))
                            .filter(x => !!x)
                            .map(x => x!)));

                        ci = dbs.map(x => {
                            return {
                                documentation: x,
                                insertText: x,
                                kind: monaco.languages.CompletionItemKind.Module,
                                label: x,
                                range: range
                            };
                        });
                    }

                    ci = ci.concat(this.schemas.map(x => {
                        const schemaLabel = this.getModelSchemaName(x);
                        return {
                            documentation: schemaLabel,
                            insertText: schemaLabel,
                            kind: monaco.languages.CompletionItemKind.Module,
                            label: schemaLabel,
                            range: range
                        };
                    }));
                }

                ci = ci.concat(currentStatement.sqlTables.filter(x => x.usedAlias).map(x => {
                    return {
                        documentation: x.usedAlias ?? x.table.alias,
                        insertText: x.usedAlias ?? x.table.alias,
                        kind: monaco.languages.CompletionItemKind.Module,
                        label: x.usedAlias ?? x.table.alias,
                        range: range
                    };
                }));

                break;

            case autocompleteContext.table:
            case autocompleteContext.tableNoAs:
            case autocompleteContext.tableJoin:
                let rawScopedToken = (currentSubStatement?.words?.[currentSubStatement.words.length - 1]?.token || '').trim();
                let currentSchema = currentStatement.sqlModels[currentStatement.sqlModels.length - 1]?.schema;
                let scopedParts = rawScopedToken
                    .replace('[', '')
                    .replace(']', '')
                    .replace('(', '')
                    .replace(')', '')
                    .split('.')
                    .filter(x => x);
                let isDbScopedSchema = !scaffoldedOnly && rawScopedToken.indexOf('.') >= 0;

                if (context == autocompleteContext.tableJoin) {
                    currentStatement.sqlTables.forEach(tbl => {
                        this.parseTblRelations(currentStatement, tbl, ci, range, currentSchema);
                    });
                } else {
                    if (isDbScopedSchema && rawScopedToken.endsWith('.') && scopedParts.length == 1) {
                        let dbToken = scopedParts[0].toUpperCase();
                        let dbModels = this.schemas.filter(x => (this.getModelDatabaseName(x) || '').toUpperCase() === dbToken);

                        if (dbModels.length > 0) {
                            ci = dbModels.map(x => {
                                let schemaLabel = this.getModelSchemaName(x);
                                return {
                                    documentation: schemaLabel,
                                    insertText: schemaLabel,
                                    kind: monaco.languages.CompletionItemKind.Module,
                                    label: schemaLabel,
                                    range: range
                                };
                            });
                        } else {
                            // Token is likely a schema without db prefix: resolve against default db.
                            let defaultDb = this.getDefaultDatabaseName();
                            let schemaToken = scopedParts[0];
                            let defaultScopedModel = this.schemas.find(x =>
                                this.getModelSchemaName(x).toUpperCase() === schemaToken.toUpperCase()
                                && (!defaultDb || (this.getModelDatabaseName(x) || '').toUpperCase() === defaultDb.toUpperCase()));

                            let sourceTables = defaultScopedModel?.tables || [];
                            ci = sourceTables.map(x => {
                                let txtLine = originalText.split('\n')[range.startLineNumber - 1];
                                let startCol = txtLine.toUpperCase().indexOf(`${schemaToken.toUpperCase()}.`);
                                let replaceStartColumn = startCol >= 0 ? startCol + 1 : range.startColumn;
                                return {
                                    documentation: x.table,
                                    // The user already typed "<schema>." so only append table name.
                                    insertText: x.table,
                                    kind: monaco.languages.CompletionItemKind.Class,
                                    label: x.table,
                                    range: range,
                                    additionalTextEdits: (x.alias && context != autocompleteContext.tableNoAs) ? [{
                                        range: {
                                            startLineNumber: range.startLineNumber,
                                            endLineNumber: range.endLineNumber,
                                            startColumn: replaceStartColumn,
                                            endColumn: range.endColumn,
                                        },
                                        text: `${schemaToken}.${x.table} AS ${x.alias}`
                                    }] : undefined
                                };
                            });
                        }
                        break;
                    }

                    let scopedModel: SqlModel | null = null;
                    if (isDbScopedSchema && scopedParts.length >= 2) {
                        let dbName = scopedParts[0];
                        let schemaName = scopedParts[1];
                        scopedModel = this.schemas.find(x =>
                            (this.getModelDatabaseName(x) || '').toUpperCase() === dbName.toUpperCase()
                            && this.getModelSchemaName(x).toUpperCase() === schemaName.toUpperCase());
                    } else if (currentSchema) {
                        scopedModel = this.schemas.find(x => this.getModelSchemaName(x).toUpperCase() === currentSchema.toUpperCase());
                    }

                    let sourceTables = scopedModel?.tables || [];
                    ci = sourceTables.map(x => {
                        try {
                            let txtLine = originalText.split('\n')[range.startLineNumber - 1];
                            let qualifiedSchema = scopedModel ? this.getModelSchemaName(scopedModel) : x.schema;
                            let startCol = txtLine.toUpperCase().indexOf(`${qualifiedSchema.toUpperCase()}.`);
                            let tokenHasQualifier = rawScopedToken.indexOf('.') >= 0;
                            let insertTxt = (!x.alias || context == autocompleteContext.tableNoAs) ?
                                (tokenHasQualifier
                                    ? x.table
                                    : `${context != autocompleteContext.tableNoAs ? `${qualifiedSchema}.` : ''}${x.table}`)
                                :
                                ``;
                            return {
                                documentation: x.table,
                                insertText: insertTxt,
                                kind: monaco.languages.CompletionItemKind.Class,
                                label: x.table,
                                range: range,
                                additionalTextEdits: (x.alias && context != autocompleteContext.tableNoAs) ? [{
                                    range: {
                                        startLineNumber: range.startLineNumber,
                                        endLineNumber: range.endLineNumber,
                                        startColumn: startCol + 1,
                                        endColumn: range.endColumn,
                                    },
                                    text: `${x.schema}.${x.table} AS ${x.alias}`
                                }] : undefined
                            };
                        } catch (error) {
                            debugger;
                            return null;
                        }
                    });
                }

                break;

            case autocompleteContext.declaration:

                let paramName = '@Param';
                let paramIndx = 1;

                while (this.currents.declarations.find(x => x.paramName.toUpperCase() === `${paramName}${paramIndx.toString()}`.toUpperCase())) {
                    paramIndx++;
                }

                paramName = `@Param${paramIndx}`;

                ci = [
                    {
                        documentation: `${paramName}`,
                        insertText: `${paramName}`,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        label: `${paramName}`,
                        range: range
                    }
                ];

                break;

            case autocompleteContext.sqlType:

                ci = sqlTypes.map(x => {
                    return {
                        documentation: x.name,
                        insertText: `${x.name} ${x.isString && x.name.toUpperCase().indexOf("VAR") >= 0 ? '(100)' :
                            x.isNumber && x.name.toUpperCase() == "DECIMAL" ? '(18, 2)' :
                                ''}= null;\n`,
                        kind: monaco.languages.CompletionItemKind.TypeParameter,
                        label: x.name,
                        range: range
                    };
                });

                ci = ci.concat(this.userDefTypes.map(x => {
                    return {
                        documentation: `${x.schema}.${x.table}`,
                        insertText: `${x.schema}.${x.table};\n`,
                        kind: monaco.languages.CompletionItemKind.TypeParameter,
                        label: `${x.schema}.${x.table}`,
                        range: range
                    }
                }));

                break;

            case autocompleteContext.variable:

                ci = this.currents.declarations.map(x => {
                    return {
                        documentation: x.paramName,
                        insertText: `${x.paramName} = `,
                        kind: monaco.languages.CompletionItemKind.Variable,
                        label: x.paramName,
                        range: range
                    };
                });

                break;

            default:

        }

        let t: monaco.languages.CompletionList = {
            suggestions: ci
        }

        return t;
    }

    // #endregion

    // #region helpers

    /**
     * Estrae il nome database da un modello schema (campo esplicito o prefisso `database.schema`).
     * @param model Modello SQL schema.
     * @returns Nome database o `null`.
     */
    private getModelDatabaseName(model: SqlModel): string | null {
        if (!model) {
            return null;
        }

        let modelAny = model as any;
        if (modelAny.database) {
            return modelAny.database;
        }

        let schema = model.schema || '';
        if (schema.indexOf('.') >= 0) {
            return schema.split('.')[0];
        }

        return null;
    }

    /**
     * Estrae il nome schema normalizzato da un modello, rimuovendo eventuale prefisso database.
     * @param model Modello SQL schema.
     * @returns Nome schema.
     */
    private getModelSchemaName(model: SqlModel): string {
        if (!model) {
            return '';
        }

        let schema = model.schema || '';
        if (schema.indexOf('.') >= 0) {
            return schema.split('.').slice(1).join('.');
        }

        return schema;
    }

    /**
     * Risolve il database owner di una colonna cercando il modello schema/tabella corrispondente.
     * @param column Colonna SQL.
     * @returns Nome database o `null`.
     */
    private getColumnDatabaseName(column: SqlColumn): string | null {
        if (!column) {
            return null;
        }

        let ownerModel = this.schemas.find(m =>
            this.getModelSchemaName(m).toUpperCase() === (column.schema || '').toUpperCase()
            && m.tables?.find(t => t.table.toUpperCase() === (column.table || '').toUpperCase()));

        return this.getModelDatabaseName(ownerModel);
    }

    /**
     * Restituisce il database di default per i suggerimenti SQL (modello marcato `isDefault` o primo schema disponibile).
     * @returns Nome database default.
     */
    private getDefaultDatabaseName(): string | null {
        let defaultModel = this.schemas.find(m => (m as any)?.isDefault);
        if (defaultModel) {
            return this.getModelDatabaseName(defaultModel);
        }
        return this.getModelDatabaseName(this.schemas[0]);
    }

    /**
     * Genera suggestion JOIN in base alle relazioni PK/FK della tabella corrente (child + parent relations).
     * @param statement Statement corrente.
     * @param tbl Tabella sorgente e alias in uso.
     * @param ci Collezione completion item da arricchire.
     * @param range Range Monaco di sostituzione.
     * @param schemaFilter Filtro schema opzionale.
     */
    private parseTblRelations(statement: Statement, tbl: { table: SqlTable, usedAlias: string }, ci: monaco.languages.CompletionItem[], range: monaco.IRange, schemaFilter?: string) {
        let relations: SqlRelation[] = [];
        tbl.table.columns.forEach(col => {

            let rel = col.childRelations.find(rel => {
                if (schemaFilter) {
                    return rel.schemaFK.toUpperCase() === schemaFilter.toUpperCase();
                }

                return true;
            });

            if (rel) {
                relations.push(rel);
            }

            if (col.parentRelation && col.parentRelation.tableFK.toUpperCase() == tbl.table.table.toUpperCase() && col.parentRelation.schemaFK.toUpperCase() == tbl.table.schema.toUpperCase() && (!schemaFilter || col.parentRelation.schemaPK.toUpperCase() == schemaFilter.toUpperCase())) {
                relations.push(col.parentRelation);
            }

        });

        relations.forEach(rel => {
            let joinSuggestion = "";

            let tblPK = this.schemas.find(x => x.schema.toUpperCase() === rel.schemaPK.toUpperCase()).tables.find(x => x.table.toUpperCase() === rel.tablePK.toUpperCase());

            let tblFK = this.schemas.find(x => x.schema.toUpperCase() === rel.schemaFK.toUpperCase()).tables.find(x => x.table.toUpperCase() === rel.tableFK.toUpperCase());

            let aliasTblPK;
            let aliasTblFK;

            if (rel.schemaFK == tbl.table.schema && rel.tableFK == tbl.table.table) {
                aliasTblPK = tblPK.alias ? tblPK.alias : `${tblPK.schema}.${tblPK.table}`
                aliasTblFK = tbl.usedAlias ? tbl.usedAlias : (tblFK.alias ? tblFK.alias : `${tblFK.schema}.${tblFK.table}`);

                joinSuggestion = `\t${rel.schemaPK}.${rel.tablePK} AS ${aliasTblPK} ON \n\t${aliasTblFK}.${rel.columnFK} = \n\t${aliasTblPK}.${rel.columnPK}`;
            }
            else {
                aliasTblPK = tbl.usedAlias ? tbl.usedAlias : (tblPK.alias ? tblPK.alias : `${tblPK.schema}.${tblPK.table}`)
                aliasTblFK = tblFK.alias ? tblFK.alias : `${tblFK.schema}.${tblFK.table}`;

                joinSuggestion = `\t${rel.schemaFK}.${rel.tableFK} AS ${aliasTblFK} ON \n\t${aliasTblPK}.${rel.columnPK} = \n\t${aliasTblFK}.${rel.columnFK}`;
            }

            ci.push({
                documentation: joinSuggestion.replace(/(\r\n|\n|\r|\t)/gm, ' '),
                insertText: `\n${joinSuggestion}`,
                kind: monaco.languages.CompletionItemKind.Reference,
                label: joinSuggestion.replace(/(\r\n|\n|\r|\t)/gm, ' '),
                range: range
            });
        });
    }

    /**
     * Cerca una tabella nel catalogo schema partendo dall'alias SQL corrente.
     * @param alias Alias da risolvere.
     * @param statement Statement corrente (presente per compatibilita firma).
     * @returns Tabella risolta oppure `undefined`.
     */
    getTableByAlias(alias: string, statement: Statement): SqlTable {
        let tbl: SqlTable;

        this.schemas.forEach(schema => {

            schema.tables.forEach(table => {
                if (table.alias && table.alias.toUpperCase() === alias.toUpperCase()) {
                    tbl = table;
                    tbl.schemaObj = schema;

                    return;
                }
            });

            if (tbl) {
                return;
            }

        });

        return tbl;
    }

    // #endregion

}

class DragDropInteractionEmitter extends Emitter {
    private editor: any;
    private sqlProvider: SqlProvider;
    private position: monaco.Position

    constructor(_contributions, deliveryQueue, editor, sqlProvider) {
        super({ deliveryQueue });
        this.editor = editor;
        this.editor._contributions = _contributions;
        this.sqlProvider = sqlProvider;
    }

    /**
     * Gestisce drop di nodi SQL nel testo editor convertendo il payload trascinato in snippet SQL contestuale.
     * @param event Evento drop con posizione Monaco.
     */
    fire(event: { event: DragEvent, position: monaco.Position }) {

        let self = this;
        self.position = event.position;

        let de = {
            event: {
                dataTransfer: {
                    items: [
                        {
                            kind: 'string',
                            type: 'text/plain',
                            getAsFile: () => { return null; },
                            getAsString: (callback: (str: string) => void) => {

                                let dataItem: Stack<string> = JSON.parse(event.event.dataTransfer.getData('text/plain'));
                                if (dataItem) {
                                    let providerSchemas: SqlModel[] = ((self.sqlProvider as any).schemas || []);
                                    let getDbPrefixFor = (schemaName: string, tableName?: string, preferredDbName?: string) => {
                                        let owner = providerSchemas.find(m => {
                                            if (preferredDbName) {
                                                let mDb = ((m as any).database || ((m.schema || '').indexOf('.') >= 0 ? (m.schema || '').split('.')[0] : '') || '').toUpperCase();
                                                if (mDb !== preferredDbName.toUpperCase()) {
                                                    return false;
                                                }
                                            }
                                            let mSchema = (m.schema || '').indexOf('.') >= 0 ? (m.schema || '').split('.').slice(1).join('.') : (m.schema || '');
                                            let schemaMatch = mSchema.toUpperCase() === (schemaName || '').toUpperCase();
                                            if (!schemaMatch) {
                                                return false;
                                            }
                                            if (!tableName) {
                                                return true;
                                            }
                                            return (m.tables || []).some(t => t.table.toUpperCase() === tableName.toUpperCase());
                                        });
                                        if (!owner) {
                                            return '';
                                        }
                                        let db = (owner as any).database || ((owner.schema || '').indexOf('.') >= 0 ? (owner.schema || '').split('.')[0] : '');
                                        return db ? `${db}.` : '';
                                    };

                                    if (dataItem.sqlModel) {
                                        let modelAny = dataItem.sqlModel as any;
                                        let modelDb = modelAny.database || ((dataItem.sqlModel.schema || '').indexOf('.') >= 0 ? (dataItem.sqlModel.schema || '').split('.')[0] : '');
                                        let modelSchema = (dataItem.sqlModel.schema || '').indexOf('.') >= 0
                                            ? (dataItem.sqlModel.schema || '').split('.').slice(1).join('.')
                                            : (dataItem.sqlModel.schema || '');
                                        callback(modelDb ? `${modelDb}.${modelSchema}.` : `${modelSchema}.`);
                                    } else if (dataItem.sqlTable) {
                                        let tableDbName = (dataItem as any).sqlDatabase;
                                        let tblDbPrefix = tableDbName ? `${tableDbName}.` : getDbPrefixFor(dataItem.sqlTable.schema, dataItem.sqlTable.table);
                                        callback(`${tblDbPrefix}${dataItem.sqlTable.schema}.${dataItem.sqlTable.table}`);
                                    } else if (dataItem.parentTable) {

                                        let suggestions = self.sqlProvider.getAutocompleteSuggestions(self.editor.getValue(), self.position);

                                        let colSugg = suggestions.suggestions.find(x => x.label == '<All columns>');

                                        if (colSugg) {
                                            callback(colSugg.insertText);
                                        } else {
                                            callback(dataItem.parentTable.columns.map(x => x.column).join(','));
                                        }
                                    } else if (dataItem.sqlColumn) {
                                        let suggestions = self.sqlProvider.getAutocompleteSuggestions(self.editor.getValue(), self.position);

                                        let colSugg = suggestions.suggestions.find(x => x.insertText.indexOf(dataItem.sqlColumn.column) >= 0);

                                        if (colSugg) {
                                            callback(colSugg.insertText);
                                        } else {
                                            let columnDbName = (dataItem as any).sqlDatabase;
                                            let colDbPrefix = columnDbName ? `${columnDbName}.` : getDbPrefixFor(dataItem.sqlColumn.schema, dataItem.sqlColumn.table);
                                            callback(`${colDbPrefix}${dataItem.sqlColumn.schema}.${dataItem.sqlColumn.table}.${dataItem.sqlColumn.column}`);
                                        }

                                    } else if (dataItem.sqlRelation) {
                                        let suggestions = self.sqlProvider.getAutocompleteSuggestions(self.editor.getValue(), self.position);

                                        if (suggestions && suggestions.suggestions) {
                                            let relSugg = suggestions.suggestions.find(x => x.insertText.indexOf(`${dataItem.sqlRelation.schemaPK}.${dataItem.sqlRelation.tablePK}`) >= 0);

                                            if (relSugg) {
                                                callback(relSugg.insertText);
                                            } else {
                                                callback(`${dataItem.sqlRelation.schemaPK}.${dataItem.sqlRelation.tablePK} ON ${dataItem.sqlRelation.schemaFK}.${dataItem.sqlRelation.tableFK}.${dataItem.sqlRelation.columnFK} = ${dataItem.sqlRelation.schemaPK}.${dataItem.sqlRelation.tablePK}.${dataItem.sqlRelation.columnPK}`);
                                            }
                                        }
                                    } else if (dataItem.sqlDatabase) {
                                        callback(`${dataItem.sqlDatabase}.`);
                                    }
                                }
                            }
                        }
                    ]
                }
            },
            position: event.position
        };

        // IMMUTABLE !!!!
        // event.event.dataTransfer.clearData();
        // event.event.dataTransfer.items.clear();
        // event.event.dataTransfer.setData('text/plain', 'pippo');

        this.editor._contributions.onBeforeInteractionEvent();
        super.fire(de);
    }
}

export class ContextMenuInteractionEmitter extends Emitter {
    private editor: any;
    private sqlProvider: SqlProvider;

    constructor(_contributions, deliveryQueue, editor, sqlProvider) {
        super({ deliveryQueue });
        this.editor = editor;
        this.editor._contributions = _contributions;
        this.sqlProvider = sqlProvider;
    }

    fire(event: {
        event: {
            leftButton: boolean,
            middleButton: boolean,
            rightButton: boolean,
            buttons: number,
            detail: number,
            ctrlKey: boolean,
            shiftKey: boolean,
            altKey: boolean,
            posx: number,
            posy: number,
            editorPos: {
                x: number,
                y: number,
                width: number,
                height: number,
            },
            relativePos: {
                x: number,
                y: number,
            },
            preventDefault: () => void,
            stopPropagation: () => void
        },
        target: {
            element: HTMLElement,
            position: monaco.Position,
            range: monaco.IRange,
            mouseColumn: number,
            type: number
        }
    }) {
        event.event.preventDefault();
        debugger;
        // event.event.stopPropagation();

        // this.editor._contributions.onBeforeInteractionEvent();
        // super.fire(event);
    }
}

class ContextInfo {
    words: {
        word: string, statementIndx: number
    }[];
    nonNestedWords: {
        word: string, statementIndx: number
    }[];
    currentStmntIndex: number;
    nestedStatementIndex: number;
    nestedStatementLevel?: number;
    currentStatement?: Statement;
    currentSubStatement?: { key: string, statement: Statement };
    position: monaco.Position;
    absolutePosition?: number;
    adjacentChars: string;
}

class CurrentProviderDataContext {
    declarations: { paramName: string, paramtype: string, usertype?: SqlTable }[];
    globalTables: SqlTable[];
    statements: Statement[]
}

enum autocompleteContext {
    statement,
    statementSelect,
    statementFrom,
    statementWhere,
    statementWhereJoin,
    columnWhereRestricted,
    columnWhereSkipAlias,
    statementOn,
    statementOnRelation,
    comparisonOperator,
    declaration,
    sqlType,
    schema,
    schemaJoin,
    table,
    tableNoAs,
    tableJoin,
    columnSelect,
    columnWhere,
    columnOrder,
    columnGroupBy,
    variable,
    columnWhereAndVariables,
    statementSet,
    assignmentOperator,
    statementValues
}

const sqlKeywords = [
    'ALTER',
    'CREATE TABLE',
    'DELETE',
    'DROP',
    'EXEC',
    'EXECUTE',
    'INSERT INTO',
    'VALUES',
    'SELECT',
    'FROM',
    'AS',
    'INNER JOIN',
    'LEFT JOIN',
    'RIGHT JOIN',
    'ON',
    'WHERE',
    'GROUP BY',
    'ORDER BY',
    'UPDATE',
    'USE',
    'WITH',
    'DECLARE',
    'SET',
    'BEGIN',
    'END',
    'CASE',
    'WHEN',
    'CASE WHEN'
];

const otherReserved = [
    'READONLY'
];

const aggregateFunctions = [
    'AVG',
    'COUNT',
    'MIN',
    'MAX',
    'SUM',
    'STDEV',
    'STDEVP',
    'VAR',
    'VARP'
];

const comparisonOperators = [
    '=',
    '>',
    '<',
    '>=',
    '<=',
    '<>',
    '!=',
    'BETWEEN',
    'LIKE',
    'IN',
    'IS NULL',
    'IS NOT NULL'
];

const sqlTypes = [
    { name: 'int', isString: false, isBool: false, isDate: false, isNumber: true },
    { name: 'bigint', isString: false, isBool: false, isDate: false, isNumber: true },
    { name: 'smallint', isString: false, isBool: false, isDate: false, isNumber: true },
    { name: 'tinyint', isString: false, isBool: false, isDate: false, isNumber: true },
    { name: 'decimal', isString: false, isBool: false, isDate: false, isNumber: true },
    { name: 'numeric', isString: false, isBool: false, isDate: false, isNumber: true },
    { name: 'float', isString: false, isBool: false, isDate: false, isNumber: true },
    { name: 'real', isString: false, isBool: false, isDate: false, isNumber: true },
    { name: 'date', isString: false, isBool: false, isDate: true, isNumber: false },
    { name: 'datetime', isString: false, isBool: false, isDate: true, isNumber: false },
    { name: 'datetime2', isString: false, isBool: false, isDate: true, isNumber: false },
    { name: 'smalldatetime', isString: false, isBool: false, isDate: true, isNumber: false },
    { name: 'time', isString: false, isBool: false, isDate: true, isNumber: false },
    { name: 'datetimeoffset', isString: false, isBool: false, isDate: true, isNumber: false },
    { name: 'timestamp', isString: false, isBool: false, isDate: true, isNumber: false },
    { name: 'money', isString: false, isBool: false, isDate: false, isNumber: true },
    { name: 'bit', isString: false, isBool: true, isDate: false, isNumber: false },
    { name: 'varchar', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'nvarchar', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'char', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'nchar', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'text', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'ntext', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'binary', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'varbinary', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'image', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'uniqueidentifier', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'xml', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'sql_variant', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'geography', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'geometry', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'hierarchyid', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'cursor', isString: true, isBool: false, isDate: false, isNumber: false },
    { name: 'table', isString: true, isBool: false, isDate: false, isNumber: false },
];
