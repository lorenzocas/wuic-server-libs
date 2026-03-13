import { SqlTable, SqlModel, Stack } from "./sql-model";
import { HttpClient } from '@angular/common/http';
import { Emitter } from 'monaco-editor/esm/vs/base/common/event';
import { EditorOptions } from "./editor-options";
import { MetadatiColonna } from "../../class/metadati_colonna";
import { MetadataProviderService } from "../../service/metadata-provider.service";
export declare class TSProvider {
    private http;
    previousStatements: string[];
    schemas: SqlModel[];
    editorOptions: EditorOptions;
    userDefTypes: SqlTable[];
    treeNodes: Stack<string>[];
    private editor;
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
        };
        target: {
            element: HTMLElement;
            position: monaco.Position;
            range: monaco.IRange;
            mouseColumn: number;
            type: number;
        };
    };
    snippets: {
        [key: string]: string;
    };
    constructor(http: HttpClient, editorOptions: EditorOptions);
    snippeter(snippetKey: any, snippetValue: any): void;
    setEditor(editor: monaco.editor.IStandaloneCodeEditor): void;
    registerTSProvider(formFieldOptions: any, field: MetadatiColonna, codeContext: string, record: any, metaSrv: MetadataProviderService, userInfo: any): Promise<void>;
}
export declare class ContextMenuInteractionEmitter extends Emitter {
    private editor;
    private tsProvider;
    constructor(_contributions: any, deliveryQueue: any, editor: any, tsProvider: any);
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
//# sourceMappingURL=ts-parser.d.ts.map