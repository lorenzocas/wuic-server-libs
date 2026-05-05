import { parseFragment, ParserError } from 'parse5';
import { EditorOptions } from './editor-options';
import { WuicComponentBindings, WUIC_COMMON_INPUTS } from './wuic-component-bindings';

export class HtmlProvider {
  private editor: monaco.editor.IStandaloneCodeEditor | undefined;
  private validateHandle: any;
  private readonly markerOwner = 'wuic-html-parser';
  private completionProviderDisposable: monaco.IDisposable | undefined;
  private formatterDisposable: monaco.IDisposable | undefined;

  private readonly htmlSnippets: Array<{ label: string; snippet: string; documentation: string }> = [
    { label: 'div', snippet: '<div>$0</div>', documentation: 'Container element' },
    { label: 'section', snippet: '<section>$0</section>', documentation: 'Sectioning content' },
    { label: 'article', snippet: '<article>$0</article>', documentation: 'Independent content block' },
    { label: 'a', snippet: '<a href=\"$1\">$0</a>', documentation: 'Anchor link' },
    { label: 'img', snippet: '<img src=\"$1\" alt=\"$2\" />', documentation: 'Image with alt text' },
    { label: 'table', snippet: '<table>\\n  <thead>\\n    <tr><th>$1</th></tr>\\n  </thead>\\n  <tbody>\\n    <tr><td>$0</td></tr>\\n  </tbody>\\n</table>', documentation: 'Basic table template' },
    { label: 'ul', snippet: '<ul>\\n  <li>$0</li>\\n</ul>', documentation: 'Unordered list' },
    { label: 'form', snippet: '<form>\\n  <label for=\"$1\">$2</label>\\n  <input id=\"$1\" name=\"$1\" />\\n</form>', documentation: 'Simple form template' }
  ];

  constructor(
    private editorOptions: EditorOptions,
    private componentSelectors: string[] = [],
    private componentBindings: Record<string, WuicComponentBindings> = {}
  ) { }

  /**
   * Configura il provider HTML: imposta linguaggio editor e registra completion + formatter.
   */
  public registerHtmlProvider() {
    this.editorOptions.language = 'html';
    this.registerCompletionProvider();
    this.registerDocumentFormatter();
  }

  /**
   * Associa l'istanza Monaco editor al provider e attiva validazione live su change contenuto/modello.
   * @param editor Istanza editor Monaco.
   */
  public setEditor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor;
    this.validateNow();
    this.editor.onDidChangeModelContent(() => this.scheduleValidate());
    this.editor.onDidChangeModel(() => this.scheduleValidate());
  }

  /**
   * Rilascia risorse registrate (timeout validate, provider completion e formatter).
   */
  public dispose() {
    if (this.validateHandle) {
      clearTimeout(this.validateHandle);
      this.validateHandle = undefined;
    }

    this.completionProviderDisposable?.dispose();
    this.completionProviderDisposable = undefined;
    this.formatterDisposable?.dispose();
    this.formatterDisposable = undefined;
  }

  /**
   * Debounce della validazione HTML per evitare parsing marker ad ogni singolo keystroke.
   */
  private scheduleValidate() {
    if (this.validateHandle) {
      clearTimeout(this.validateHandle);
    }

    this.validateHandle = setTimeout(() => {
      this.validateHandle = undefined;
      this.validateNow();
    }, 250);
  }

  /**
   * Esegue validazione immediata del documento HTML combinando parse errors `parse5` e regole strict custom.
   */
  private validateNow() {
    const model = this.editor?.getModel();
    if (!model || model.getLanguageId() !== 'html') {
      return;
    }

    const content = model.getValue() || '';
    const parseErrors: ParserError[] = [];

    parseFragment(content, {
      sourceCodeLocationInfo: true,
      onParseError: (error: ParserError) => {
        parseErrors.push(error);
      }
    });

    const parseMarkers: monaco.editor.IMarkerData[] = parseErrors.map((error) => {
      const startLineNumber = Math.max(1, Number(error.startLine || 1));
      const startColumn = Math.max(1, Number(error.startCol || 1));
      const endLineNumber = Math.max(startLineNumber, Number(error.endLine || startLineNumber));
      const endColumn = Math.max(startColumn + 1, Number(error.endCol || (startColumn + 1)));

      return {
        startLineNumber,
        startColumn,
        endLineNumber,
        endColumn,
        severity: monaco.MarkerSeverity.Error,
        message: `HTML parse error: ${error.code}`
      };
    });

    const strictMarkers = this.buildStrictMarkers(content, model);
    const markers = [...parseMarkers, ...strictMarkers];
    monaco.editor.setModelMarkers(model, this.markerOwner, markers);
  }

  /**
   * Costruisce marker strict su pattern sospetti (tag malformati, `on*=` inline, `javascript:` URL) e delega ai validator dedicati.
   * @param content Contenuto HTML corrente.
   * @param model Modello Monaco.
   * @returns Marker warning/error aggiuntivi.
   */
  private buildStrictMarkers(content: string, model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] {
    const markers: monaco.editor.IMarkerData[] = [];
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      const lineNo = index + 1;
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      const hasLooksLikeTagWithoutAngleBracket =
        !trimmed.startsWith('<') &&
        !trimmed.startsWith('{{') &&
        /^[a-zA-Z][\w:-]*\s+[^<>{}]*=/.test(trimmed);

      if (hasLooksLikeTagWithoutAngleBracket) {
        const firstToken = trimmed.split(/\s+/)[0];
        const startColumn = Math.max(1, line.indexOf(firstToken) + 1);
        markers.push({
          startLineNumber: lineNo,
          startColumn,
          endLineNumber: lineNo,
          endColumn: Math.min(line.length + 1, startColumn + firstToken.length),
          severity: monaco.MarkerSeverity.Error,
          message: `Possible malformed tag '${firstToken}': missing '<' at start.`
        });
      }

      const inlineEventMatch = line.match(/\son[a-z]+\s*=/i);
      if (inlineEventMatch?.index != null) {
        const startColumn = inlineEventMatch.index + 2;
        markers.push({
          startLineNumber: lineNo,
          startColumn,
          endLineNumber: lineNo,
          endColumn: startColumn + (inlineEventMatch[0].trim().length || 2),
          severity: monaco.MarkerSeverity.Warning,
          message: 'Inline on* event handler detected.'
        });
      }

      const jsUrlMatch = line.match(/\b(?:href|src)\s*=\s*["']?\s*javascript:/i);
      if (jsUrlMatch?.index != null) {
        const startColumn = jsUrlMatch.index + 1;
        markers.push({
          startLineNumber: lineNo,
          startColumn,
          endLineNumber: lineNo,
          endColumn: Math.min(line.length + 1, startColumn + jsUrlMatch[0].length),
          severity: monaco.MarkerSeverity.Warning,
          message: 'Potentially unsafe javascript: URL.'
        });
      }
    });

    const tagMarkers = this.buildTagBalanceMarkers(content, model);
    markers.push(...tagMarkers);
    const angularMarkers = this.buildAngularSyntaxMarkers(content, model);
    markers.push(...angularMarkers);
    return markers;
  }

  /**
   * Verifica bilanciamento tag opening/closing con stack parser lightweight.
   * @param content Contenuto HTML corrente.
   * @param model Modello Monaco.
   * @returns Marker per tag non chiusi o chiusure senza apertura.
   */
  private buildTagBalanceMarkers(content: string, model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] {
    const markers: monaco.editor.IMarkerData[] = [];
    const tagRegex = /<\/?([a-zA-Z][\w:-]*)\b([^>]*)>/g;
    const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
    const stack: Array<{ tag: string; index: number; length: number }> = [];
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(content)) !== null) {
      const full = match[0];
      const tag = (match[1] || '').toLowerCase();
      const attrs = match[2] || '';
      const isClosing = full.startsWith('</');
      const isSelfClosing = /\/\s*>$/.test(full) || voidTags.has(tag);

      if (!isClosing && !isSelfClosing) {
        stack.push({ tag, index: match.index, length: full.length });
        continue;
      }

      if (isClosing) {
        const last = stack[stack.length - 1];
        if (last && last.tag === tag) {
          stack.pop();
        } else {
          const pos = model.getPositionAt(match.index);
          markers.push({
            startLineNumber: pos.lineNumber,
            startColumn: pos.column,
            endLineNumber: pos.lineNumber,
            endColumn: pos.column + full.length,
            severity: monaco.MarkerSeverity.Error,
            message: `Closing tag </${tag}> has no matching opening tag.`
          });
        }
      }
    }

    for (const unclosed of stack) {
      const pos = model.getPositionAt(unclosed.index);
      markers.push({
        startLineNumber: pos.lineNumber,
        startColumn: pos.column,
        endLineNumber: pos.lineNumber,
        endColumn: pos.column + unclosed.length,
        severity: monaco.MarkerSeverity.Error,
        message: `Tag <${unclosed.tag}> is not closed.`
      });
    }

    return markers;
  }

  /**
   * Valida sintassi Angular template (interpolazioni, binding `[x]`, `(x)`, `[(x)]`, direttive `*ng...`).
   * @param content Contenuto template.
   * @param model Modello Monaco.
   * @returns Marker syntax per pattern Angular non validi/incompleti.
   */
  private buildAngularSyntaxMarkers(content: string, model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] {
    const markers: monaco.editor.IMarkerData[] = [];

    const pushMarker = (startIndex: number, length: number, severity: monaco.MarkerSeverity, message: string) => {
      const pos = model.getPositionAt(Math.max(0, startIndex));
      markers.push({
        startLineNumber: pos.lineNumber,
        startColumn: pos.column,
        endLineNumber: pos.lineNumber,
        endColumn: pos.column + Math.max(1, length),
        severity,
        message
      });
    };

    // Angular interpolation basic validation.
    const interpolationStack: number[] = [];
    for (let i = 0; i < content.length - 1; i++) {
      const pair = content.slice(i, i + 2);
      if (pair === '{{') {
        interpolationStack.push(i);
        i += 1;
        continue;
      }
      if (pair === '}}') {
        if (interpolationStack.length === 0) {
          pushMarker(i, 2, monaco.MarkerSeverity.Error, 'Unexpected interpolation close "}}".');
        } else {
          const openIndex = interpolationStack.pop()!;
          const expr = content.slice(openIndex + 2, i).trim();
          if (!expr) {
            pushMarker(openIndex, 4, monaco.MarkerSeverity.Warning, 'Empty Angular interpolation "{{ }}".');
          }
        }
        i += 1;
      }
    }
    for (const openIndex of interpolationStack) {
      pushMarker(openIndex, 2, monaco.MarkerSeverity.Error, 'Unclosed Angular interpolation "{{".');
    }

    // Angular attribute syntax validation on opening tags.
    const openTagRegex = /<([a-zA-Z][\w:-]*)\b([^<>]*)>/g;
    let match: RegExpExecArray | null;
    while ((match = openTagRegex.exec(content)) !== null) {
      const tagText = match[0];
      const tagOffset = match.index;
      const attrs = match[2] || '';
      if (tagText.startsWith('</')) {
        continue;
      }

      // Broken property binding: [prop=...
      const malformedProperty = /\[[^\]\s=><"'`]*\s*=/g;
      let bad: RegExpExecArray | null;
      while ((bad = malformedProperty.exec(attrs)) !== null) {
        pushMarker(tagOffset + 1 + bad.index, bad[0].length, monaco.MarkerSeverity.Error, 'Malformed Angular property binding. Use [prop]="...".');
      }

      // Broken event binding: (event=...
      const malformedEvent = /\([^\)\s=><"'`]*\s*=/g;
      while ((bad = malformedEvent.exec(attrs)) !== null) {
        pushMarker(tagOffset + 1 + bad.index, bad[0].length, monaco.MarkerSeverity.Error, 'Malformed Angular event binding. Use (event)="...".');
      }

      // Broken two-way binding: [(model=...
      const malformedTwoWay = /\[\([^\)\]]+\s*=/g;
      while ((bad = malformedTwoWay.exec(attrs)) !== null) {
        pushMarker(tagOffset + 1 + bad.index, bad[0].length, monaco.MarkerSeverity.Error, 'Malformed Angular two-way binding. Use [(prop)]="...".');
      }

      // Structural directives: warn only when value is missing or empty.
      const structuralDirective = /\*([\w-]+)(\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
      let structuralMatch: RegExpExecArray | null;
      while ((structuralMatch = structuralDirective.exec(attrs)) !== null) {
        const directiveName = structuralMatch[1] || '';
        const hasAssignment = !!structuralMatch[2];
        const exprValue = (structuralMatch[3] ?? structuralMatch[4] ?? '').trim();

        if (!hasAssignment) {
          pushMarker(
            tagOffset + 1 + structuralMatch.index,
            structuralMatch[0].length,
            monaco.MarkerSeverity.Warning,
            `Structural directive *${directiveName} without expression.`
          );
          continue;
        }

        if (!exprValue) {
          pushMarker(
            tagOffset + 1 + structuralMatch.index,
            structuralMatch[0].length,
            monaco.MarkerSeverity.Warning,
            `Structural directive *${directiveName} has an empty expression.`
          );
        }
      }

      // Invalid banana-in-a-box closure like [(x]="..." or [x)]="..."
      const malformedBanana1 = /\[\([^\]]+\](?=\s*=)/g;
      while ((bad = malformedBanana1.exec(attrs)) !== null) {
        pushMarker(tagOffset + 1 + bad.index, bad[0].length, monaco.MarkerSeverity.Error, 'Malformed two-way binding closure, expected ")]".');
      }
      const malformedBanana2 = /\[[^\]]+\)\s*=/g;
      while ((bad = malformedBanana2.exec(attrs)) !== null) {
        pushMarker(tagOffset + 1 + bad.index, bad[0].length, monaco.MarkerSeverity.Error, 'Malformed two-way binding opening, expected "[("');
      }
    }

    return markers;
  }

  /**
   * Registra completion provider HTML/WUIC con suggerimenti tag snippet e binding Angular contestuali al componente.
   */
  private registerCompletionProvider() {
    this.completionProviderDisposable?.dispose();
    this.completionProviderDisposable = monaco.languages.registerCompletionItemProvider('html', {
      triggerCharacters: ['<', ' ', '/'],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const linePrefix = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        });
        const tagPrefixMatch = linePrefix.match(/<([\w-]*)$/);
        const tagPrefix = (tagPrefixMatch?.[1] || '').toLowerCase();
        const attrPrefixMatch = linePrefix.match(/([^\s"'=<>]*)$/);
        const attrPrefix = attrPrefixMatch?.[1] || '';
        const openTagContext = this.getOpenTagContext(linePrefix);
        const range: monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: Math.max(1, position.column - attrPrefix.length),
          endColumn: word.endColumn
        };

        const suggestions: monaco.languages.CompletionItem[] = this.htmlSnippets.map((item) => ({
          label: item.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: item.snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: item.documentation,
          range
        }));

        if (tagPrefix.startsWith('wuic-')) {
          const wuicSuggestions = this.componentSelectors
            .filter((tag) => tag.toLowerCase().startsWith(tagPrefix))
            .map((tag) => ({
              label: tag,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: `${tag}>$0</${tag}>`,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'WUIC Angular component selector',
              range
            } as monaco.languages.CompletionItem));
          suggestions.unshift(...wuicSuggestions);
        }

        if (openTagContext && openTagContext.tagName.startsWith('wuic-')) {
          const bindingSuggestions = this.buildAngularBindingSuggestions(openTagContext.tagName, range);
          suggestions.unshift(...bindingSuggestions);
        }

        return { suggestions };
      }
    });
  }

  private getOpenTagContext(linePrefix: string): { tagName: string; attrs: string } | null {
    const match = linePrefix.match(/<([\w-]+)\b([^<>]*)$/);
    if (!match) {
      return null;
    }
    const tagName = (match[1] || '').toLowerCase();
    const attrs = match[2] || '';
    return { tagName, attrs };
  }

  /**
   * Genera completion item per `@Input`, `@Output`, two-way binding e direttive strutturali del tag corrente.
   * @param tagName Nome tag in editing.
   * @param range Range Monaco di sostituzione testo.
   * @returns Suggerimenti binding Angular.
   */
  private buildAngularBindingSuggestions(tagName: string, range: monaco.IRange): monaco.languages.CompletionItem[] {
    const specific = this.componentBindings[tagName] || {};
    const inputs = Array.from(new Set([...(specific.inputs || []), ...WUIC_COMMON_INPUTS]));
    const outputs = specific.outputs || [];
    const twoWay = specific.twoWay || [];

    const suggestions: monaco.languages.CompletionItem[] = [];

    for (const input of inputs) {
      suggestions.push({
        label: `[${input}]`,
        kind: monaco.languages.CompletionItemKind.Property,
        insertText: `[${input}]="$1"`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: `Angular @Input for ${tagName}`,
        range
      });
    }

    for (const output of outputs) {
      suggestions.push({
        label: `(${output})`,
        kind: monaco.languages.CompletionItemKind.Event,
        insertText: `(${output})="$1"`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: `Angular @Output for ${tagName}`,
        range
      });
    }

    for (const model of twoWay) {
      suggestions.push({
        label: `[(${model})]`,
        kind: monaco.languages.CompletionItemKind.Property,
        insertText: `[(${model})]="$1"`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: `Angular two-way binding for ${tagName}`,
        range
      });
    }

    suggestions.push(
      {
        label: '*ngIf',
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: `*ngIf="$1"`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: 'Angular structural directive',
        range
      },
      {
        label: '*ngFor',
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: `*ngFor="let item of $1"`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: 'Angular structural directive',
        range
      }
    );

    return suggestions;
  }

  /**
   * Registra formatter documento HTML completo, delegando la formattazione a `formatHtml`.
   */
  private registerDocumentFormatter() {
    this.formatterDisposable?.dispose();
    this.formatterDisposable = monaco.languages.registerDocumentFormattingEditProvider('html', {
      provideDocumentFormattingEdits: (model) => {
        const input = model.getValue() || '';
        const formatted = this.formatHtml(input);
        const fullRange = model.getFullModelRange();
        return [{ range: fullRange, text: formatted }];
      }
    });
  }

  /**
   * Applica una formattazione HTML basic (line-break/indentazione) senza parser DOM completo.
   * @param input Testo HTML grezzo.
   * @returns HTML formattato.
   */
  private formatHtml(input: string): string {
    if (!input || !input.trim()) {
      return '';
    }

    const normalized = input
      .replace(/>\s+</g, '><')
      .replace(/\r\n/g, '\n')
      .trim();

    const withLineBreaks = normalized
      .replace(/></g, '>\n<')
      .replace(/(<\/(div|section|article|main|aside|header|footer|nav|ul|ol|li|table|thead|tbody|tfoot|tr|td|th|form|fieldset|p|h[1-6]|pre|blockquote)>)/gi, '$1\n')
      .replace(/(<(div|section|article|main|aside|header|footer|nav|ul|ol|li|table|thead|tbody|tfoot|tr|td|th|form|fieldset|p|h[1-6]|pre|blockquote)(\s[^>]*)?>)/gi, '\n$1')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    let indentLevel = 0;
    const lines: string[] = [];
    const openingTag = /^<([a-zA-Z0-9-]+)(\s[^>]*)?>$/;
    const closingTag = /^<\/([a-zA-Z0-9-]+)>$/;
    const selfClosing = /^<([a-zA-Z0-9-]+)(\s[^>]*)?\/>$/;
    const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

    for (const rawLine of withLineBreaks) {
      const line = rawLine.trim();
      const closeMatch = line.match(closingTag);
      if (closeMatch) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      lines.push(`${'  '.repeat(indentLevel)}${line}`);

      const openMatch = line.match(openingTag);
      const isSelf = selfClosing.test(line);
      if (openMatch && !isSelf && !voidTags.has(openMatch[1].toLowerCase()) && !line.includes(`</${openMatch[1]}>`)) {
        indentLevel += 1;
      }
    }

    return lines.join('\n');
  }
}
