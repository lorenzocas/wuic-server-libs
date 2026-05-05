export class EditorOptions {
    theme: string;
    language: 'json' | 'typescript' | 'sql' | 'csharp' | 'html';
    contextMenuItems: any[];
    model?: any;
    onInit?: any;
    onNodeClick?: any;
    onNodeDragStart?: any;
    onNodeDragEnd?: any;
    onDropIntoEditor?: any;

    constructor(theme: string, language: 'json' | 'typescript' | 'sql' | 'csharp' | 'html') {
        this.theme = theme;
        this.language = language;
        this.contextMenuItems = [];
    }
}
