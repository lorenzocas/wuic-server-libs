import { SqlTable, SqlModel, Stack, Statement } from "./sql-model";
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Emitter } from 'monaco-editor/esm/vs/base/common/event';
import { WtoolboxService } from "../../service/wtoolbox.service";
import { EditorOptions } from "./editor-options";
import { MetadatiColonna } from "../../class/metadati_colonna";
import { combineLatest, from, Observable } from "rxjs";
import { MetadataProviderService } from "../../service/metadata-provider.service";

// import { editor } from 'monaco-editor';
// import { LinkedList } from 'monaco-editor/esm/vs/base/common/linkedList';
// import { MenuId, MenuRegistry } from 'monaco-editor/esm/vs/platform/actions/common/actions';

export class TSProvider {
    previousStatements: string[];
    schemas: SqlModel[];
    editorOptions: EditorOptions;
    userDefTypes: SqlTable[];
    treeNodes: Stack<string>[];
    private editor: monaco.editor.IStandaloneCodeEditor;

    contextMenuEvent: {
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
        }; target: {
            element: HTMLElement;
            position: monaco.Position;
            range: monaco.IRange;
            mouseColumn: number;
            type: number;
        };
    };

    snippets: { [key: string]: string } = {
        'http.get': `let getResults = await (wtoolbox.http.get(wtoolbox.appSettings.api_url + '<method>').toPromise() as Promise<any>);`,
        'http.post': `let postResults = await (wtoolbox.http.post(wtoolbox.appSettings.api_url + '<method>', { }).toPromise() as Promise<any>);`,
        'prompt.text': `let promptResult = await wtoolbox.promptDialog('Title', 'Caption', [{ name: 'prompt', caption: 'prompt', type: 'text' }]);`,
        'msgbox.show': `let msboxResponse = await wtoolbox.confirm({ message: 'Are you sure?', header: 'Yes', acceptLabel: 'OK', rejectLabel: 'Cancel' });`,
        'toast.show': `wtoolbox.messageNotificationService.add({ severity: 'success', summary: 'Success', detail: 'message...' });`,
        'select.by.route': `let selectResults:ResultInfo = await wtoolbox.dataService.selectByRoute('<routeName>', [], []);`,
    }

    constructor(private http: HttpClient, editorOptions: EditorOptions) {
        this.editorOptions = editorOptions;

        this.treeNodes = [];
    }

    /**
     * Inserisce nello script editor lo snippet selezionato dal menu contestuale, sostituendo il range corrente.
     * @param snippetKey Chiave snippet.
     * @param snippetValue Contenuto snippet da inserire.
     */
    snippeter(snippetKey, snippetValue) {
        let id = { major: 1, minor: 1 };
        let op = { identifier: id, range: this.contextMenuEvent.target.range, text: snippetValue, forceMoveMarkers: true };
        this.editor.executeEdits("snippet." + snippetKey, [op]);
    }

    /**
     * Collega l'istanza Monaco al provider TS e registra emitter custom per drag&drop e context menu.
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
     * Configura il linguaggio TS editor per callback metadata:
     * snippet menu, compiler options, extra libs `.d.ts`, tipi route-specific e code context dinamico.
     * @param formFieldOptions Config custom editor (libs/compilatore/context/snippet).
     * @param field Colonna metadata in editing.
     * @param codeContext Signature/template funzione corrente.
     * @param record Record corrente.
     * @param metaSrv Servizio metadata usato per derivare tipi route/lookup.
     * @param userInfo Contesto utente runtime.
     */
    public async registerTSProvider(formFieldOptions, field: MetadatiColonna, codeContext: string, record: any, metaSrv: MetadataProviderService, userInfo: any) {

        let self = this;

        let extraLibs: any[] = [];
        let libs: Observable<any>[] = [];

        let contextMenuItems = [
            {
                label: 'Snippets', icon: 'pi pi-receipt',
                items: []
            }
        ];

        Object.keys(this.snippets).forEach(snippetKey => {
            contextMenuItems[0].items.push({
                label: snippetKey, icon: 'pi pi-cloud-download',
                command: (ctxMenuEvent) => {
                    self.snippeter(snippetKey, this.snippets[snippetKey]);
                }
            });
        });

        this.editorOptions.contextMenuItems = contextMenuItems;

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

            event.dataTransfer.setData("text/plain", JSON.stringify(dataItem));
        }

        this.editorOptions.onNodeDragEnd = (event: DragEvent, dataItem: Stack<string>[]) => {
            // debugger;
        }

        let compilerOptions = {
            target: monaco.languages.typescript.ScriptTarget.ES2016,
            allowNonTsExtensions: true,
            moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
            module: monaco.languages.typescript.ModuleKind.CommonJS,
            noEmit: true,
            typeRoots: ["node_modules/@types"]
        };

        if (formFieldOptions.compilerOptions) {
            try {
                compilerOptions = { ...compilerOptions, ...formFieldOptions.compilerOptions };
            } catch (e) {
                console.error(`customEditorConfig compilerOptions for field ${field.mc_nome_colonna} error: ${e}`);
            }
        }

        monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);

        // //esportare i tipi usando angular.json (riduci i file esportati alle cartelle ...)
        // // "assets": [
        // //   ....
        // //   {
        // //     "glob": "**/*",
        // //     "input": "node_modules/@skylab/easygrid/lib",
        // //     "output": "assets/"
        // //   },
        // //   ....
        // libs.push(this.http.get("assets/models/easygrid.server.d.ts", { responseType: 'text' }));

        let headers = new HttpHeaders({
            'Cache-Control': 'no-cache, no-store, must-revalidate, post-check=0, pre- check=0',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        libs = MetadataProviderService.baseLibs.map(lib => {
            return this.http.get(lib, { headers: headers, responseType: 'text' });
        });

        if (formFieldOptions.extraLibs && formFieldOptions.extraLibs.length) {
            libs.concat(formFieldOptions.extraLibs.map(lib => {
                return this.http.get(lib, { headers: headers, responseType: 'text' });
            }));
        }

        codeContext = formFieldOptions.codeContext || '';

        if (codeContext) {
            let routeIdContextField = field.extras.customEditorConfig?.routeContextField;
            let columnContextField = field.extras.customEditorConfig?.columnContextField;

            if (codeContext.indexOf('record: ') >= 0 && routeIdContextField) {
                let routeId = record[routeIdContextField]?.value; // this.metaInfo.tableMetadata.md_route_name.replaceAll(' ', '_');

                if (routeId) {
                    let metas = await metaSrv.getMetadatiById(routeId);
                    let currentColumnMeta = null;

                    if (columnContextField) {
                        currentColumnMeta = metas.find(m => m.mc_id == record[columnContextField].value);
                    }

                    if (metas && metas.length) {
                        let routeName = metas[0]._Metadati_Tabelle.md_route_name.replaceAll(' ', '_');

                        let classProperties = '';
                        let classPropsArray = [];

                        let compositeTypeDef = '';

                        for (let c of metas) {
                            compositeTypeDef += `'${c.mc_nome_colonna}': BehaviorSubject<${MetadataProviderService.getTSTypeFromMetaColumn(c)}>;`;

                            let lookupRoute = '';

                            if (c.mc_ui_column_type == 'lookupByID') {
                                let lookupRoute = c.mc_ui_lookup_entity_name

                                if (lookupRoute) {
                                    compositeTypeDef += `'${c.mc_nome_colonna + '__lookup_obj'}': BehaviorSubject<${lookupRoute}>;`;

                                    let lookupMetas = await metaSrv.getMetadati(lookupRoute);

                                    let nestedClassProperties = '';
                                    let nestedClassPropsArray = [];

                                    if (lookupMetas && lookupMetas.length) {
                                        lookupRoute = lookupRoute.replaceAll(' ', '_');

                                        for (let cLookup of lookupMetas) {
                                            nestedClassPropsArray.push(`${cLookup.mc_nome_colonna}: ${MetadataProviderService.getTSTypeFromMetaColumn(cLookup)};`);
                                        }

                                        nestedClassProperties = nestedClassPropsArray.join('\n');

                                        libs.push(from(new Promise<string>((resolve, reject) => {
                                            resolve(`export declare class ${lookupRoute} {
                                                ${nestedClassProperties}
                                            };
                                            constructor();`);
                                        })));
                                    }
                                }
                            }

                            // recursive function to get the type of the nested lookup objects
                            // ...
                            if (codeContext.indexOf('record: any') >= 0) {
                                classPropsArray.push(`${c.mc_nome_colonna}: ${MetadataProviderService.getTSTypeFromMetaColumn(c)};`);
                            } else {
                                classPropsArray.push(`${c.mc_nome_colonna}: BehaviorSubject<${MetadataProviderService.getTSTypeFromMetaColumn(c)}>`);

                                if (c.mc_ui_column_type == 'lookupByID') {
                                    classPropsArray.push(`${c.mc_nome_colonna + '__lookup_obj'}: BehaviorSubject<${lookupRoute}>;`);
                                }
                            }

                        }

                        classProperties = classPropsArray.join('\n');

                        libs.push(from(new Promise<string>((resolve, reject) => {
                            resolve(`export declare class ${routeName} {
                                ${classProperties}
                            };
                            constructor();`);
                        })));

                        if (codeContext.indexOf('record: any') >= 0) {
                            codeContext = codeContext.replace('record: any', `record: ${routeName}`);
                        } else {
                            codeContext = codeContext.replace('record: {[key: string]: BehaviorSubject<any>}', `record: {${compositeTypeDef}}`);
                        }

                        if (currentColumnMeta && currentColumnMeta.mc_ui_column_type == 'lookupByID' && codeContext.indexOf('let newValue: any;') >= 0) {
                            codeContext = codeContext.replace('let newValue: any;', `let newValue: ${currentColumnMeta.mc_ui_lookup_entity_name};`);
                        }

                    }
                }
            }

            libs.push(from(new Promise<string>((resolve, reject) => { resolve(codeContext); })));
        }

        if (libs.length) {
            combineLatest(libs).subscribe(libsContent => {

                console.log('TypeScript provider extra libs loaded:', libsContent);
                libsContent.forEach((data: string) => {
                    let lines = data.split('\n');

                    // da migliorare con regex !!!
                    let parsedLines = lines.filter(x => {
                        return x.indexOf('import ') < 0; // && x.indexOf('export interface ') < 0
                    }).map((line) => {
                        return line.replace('export declare', 'declare').replace('export interface', 'declare interface').replace('export class', 'declare class');
                    });

                    let newtext = parsedLines.join('\n');

                    extraLibs.push({ content: newtext });
                });

                monaco.languages.typescript.typescriptDefaults.setExtraLibs(extraLibs);
            });
        }
    }

}

class DragDropInteractionEmitter extends Emitter {
    private editor: any;
    private tsProvider: TSProvider;
    private position: monaco.Position

    constructor(_contributions, deliveryQueue, editor, tsProvider) {
        super({ deliveryQueue });
        this.editor = editor;
        this.editor._contributions = _contributions;
        this.tsProvider = tsProvider;
    }

    /**
     * Gestisce il drop nel codice trasformando i nodi trascinati (tabella/colonna/relazione) in testo inseribile nell'editor.
     * @param event Evento drop Monaco con posizione target.
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
                                    if (dataItem.sqlTable) {
                                        callback(`${dataItem.sqlTable.schema}.${dataItem.sqlTable.table}`);
                                    }
                                    if (dataItem.parentTable) {

                                        // let suggestions = self.sqlProvider.getAutocompleteSuggestions(self.editor.getValue(), self.position);

                                        // let colSugg = suggestions.suggestions.find(x => x.label == '<All columns>');

                                        // if (colSugg) {
                                        //     callback(colSugg.insertText);
                                        // } else {
                                        //     callback(dataItem.parentTable.columns.map(x => x.column).join(','));
                                        // }
                                    }
                                    if (dataItem.sqlColumn) {
                                        // let suggestions = self.sqlProvider.getAutocompleteSuggestions(self.editor.getValue(), self.position);

                                        // let colSugg = suggestions.suggestions.find(x => x.insertText.indexOf(dataItem.sqlColumn.column) >= 0);

                                        // if (colSugg) {
                                        //     callback(colSugg.insertText);
                                        // } else {
                                        //     callback(`${dataItem.sqlColumn.schema}.${dataItem.sqlColumn.table}.${dataItem.sqlColumn.column}`);
                                        // }

                                    }
                                    if (dataItem.sqlRelation) {
                                        // let suggestions = self.sqlProvider.getAutocompleteSuggestions(self.editor.getValue(), self.position);

                                        // if (suggestions && suggestions.suggestions) {
                                        //     let relSugg = suggestions.suggestions.find(x => x.insertText.indexOf(`${dataItem.sqlRelation.schemaPK}.${dataItem.sqlRelation.tablePK}`) >= 0);

                                        //     if (relSugg) {
                                        //         callback(relSugg.insertText);
                                        //     } else {
                                        //         callback(`${dataItem.sqlRelation.schemaPK}.${dataItem.sqlRelation.tablePK} ON ${dataItem.sqlRelation.schemaFK}.${dataItem.sqlRelation.tableFK}.${dataItem.sqlRelation.columnFK} = ${dataItem.sqlRelation.schemaPK}.${dataItem.sqlRelation.tablePK}.${dataItem.sqlRelation.columnPK}`);
                                        //     }
                                        // }
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
    private tsProvider: TSProvider;

    constructor(_contributions, deliveryQueue, editor, tsProvider) {
        super({ deliveryQueue });
        this.editor = editor;
        this.editor._contributions = _contributions;
        this.tsProvider = tsProvider;
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
        this.tsProvider.contextMenuEvent = event;

        // event.event.stopPropagation();

        // this.editor._contributions.onBeforeInteractionEvent();
        // super.fire(event);
    }
}
