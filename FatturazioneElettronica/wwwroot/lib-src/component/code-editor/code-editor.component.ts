import { HttpClient } from '@angular/common/http';
import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, HostBinding, ComponentRef, Input, Inject, ViewEncapsulation } from '@angular/core';
import { SecurityContext } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MonacoEditorComponent, MonacoEditorLoaderService, MonacoEditorModule } from '@materia-ui/ngx-monaco-editor';

import { BehaviorSubject, Observable, Subscription, combineLatest, from } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { SqlProvider } from './sql-parser';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { NgClass, NgStyle } from '@angular/common';
import { EditorOptions } from './editor-options';
import { MetaInfo } from '../../class/metaInfo';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { UserInfoService } from '../../service/user-info.service';
import { ContextMenuModule } from 'primeng/contextmenu';
import { TreeModule } from 'primeng/tree';
import { TSProvider } from './ts-parser';
import { DataProviderService } from '../../service/data-provider.service';
import { HtmlProvider } from './html-parser';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WUIC_COMPONENT_SELECTORS } from './wuic-component-selectors';
import { WUIC_COMPONENT_BINDINGS } from './wuic-component-bindings';

// import { TreeItemDragStartEvent, TreeItemDragEvent, TreeItemDropEvent, DropPosition, TreeItemAddRemoveArgs, TreeItem, NodeClickEvent } from '@progress/kendo-angular-treeview';

@Component({
  selector: 'wuic-code-editor',
  imports: [NgClass, NgStyle, FormsModule, MonacoEditorModule, ContextMenuModule, TreeModule],
  templateUrl: './code-editor.component.html',
  styleUrls: ['./code-editor.component.scss']
})
export class CodeEditorComponent implements OnInit, AfterViewInit, OnDestroy { // , FormFieldCustom
  // @HostBinding('class') class = 'fxFlex fxFlexFix';
  /**
   * Configurazione di presentazione per style, usata nel rendering del componente.
   */
  @HostBinding('style') style = 'overflow: visible';

  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per context menu anchor.
   */
  @ViewChild('contextMenuAnchor') contextMenuAnchor: any;

  /**
   * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
   */
  @Input() field: MetadatiColonna = new MetadatiColonna('');
  /**
   * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
   */
  @Input() record?: { [key: string]: BehaviorSubject<any> };
  /**
   * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() metaInfo: MetaInfo = new MetaInfo();

  // @Input() parent: any;
  // @Input() ctxItems: any[] = [];

  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per editor ref.
   */
  @ViewChild('editorRef', { static: false }) editorRef: MonacoEditorComponent | undefined;
  /**
   * Proprieta di stato del componente per editor, usata dalla logica interna e dal template.
   */
  editor: monaco.editor.IStandaloneCodeEditor | undefined;

  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per ctxs.
   */
  @ViewChild('ctxs') ctxs: any

  /**
   * Collezione dati per editor options, consumata dal rendering e dalle operazioni del componente.
   */
  editorOptions: EditorOptions = new EditorOptions('vs-dark', 'sql'); //sql
  /**
   * Proprieta di stato del componente per editor model value, usata dalla logica interna e dal template.
   */
  editorModelValue: string = '';

  /**
   * Proprieta di stato del componente per sample code, usata dalla logica interna e dal template.
   */
  sampleCode: string = '';
  // originalCode = 'function x() { // TODO }';

  /**
   * Flag di stato che governa il comportamento UI/logico relativo a fullscreen.
   */
  fullscreen: boolean = false;
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a render.
   */
  render: boolean = false;
  /**
   * Collezione dati per tree nodes, consumata dal rendering e dalle operazioni del componente.
   */
  treeNodes: any[];
  /**
   * Collezione dati per prime tree nodes, consumata dal rendering e dalle operazioni del componente.
   */
  primeTreeNodes: any[];
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a sql obj view.
   */
  sqlObjView: boolean;
  /**
   * Proprieta di stato del componente per sql provider, usata dalla logica interna e dal template.
   */
  sqlProvider: SqlProvider | undefined;
  /**
   * Collezione dati per errors, consumata dal rendering e dalle operazioni del componente.
   */
  errors: { Message: string }[] = [];
  /**
   * Proprieta di stato del componente per code context, usata dalla logica interna e dal template.
   */
  codeContext: string;
  /**
   * Proprieta di stato del componente per ts provider, usata dalla logica interna e dal template.
   */
  tsProvider: TSProvider;
  /**
   * Configurazione di presentazione per html provider, usata nel rendering del componente.
   */
  htmlProvider: HtmlProvider | undefined;
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a show html preview.
   */
  showHtmlPreview: boolean = true;
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a auto format html.
   */
  autoFormatHtml: boolean = true;
  /**
   * Configurazione di presentazione per sanitized html preview, usata nel rendering del componente.
   */
  sanitizedHtmlPreview: SafeHtml | string = '';
  /**
   * Configurazione di presentazione per html format handle, usata nel rendering del componente.
   */
  private htmlFormatHandle: any;
  /**
   * Proprieta di stato del componente per skip next auto format, usata dalla logica interna e dal template.
   */
  private skipNextAutoFormat = false;
  /**
   * Proprieta di stato del componente per layout raf, usata dalla logica interna e dal template.
   */
  private layoutRaf: number | null = null;
  /**
   * Collezione dati per scroll hosts, consumata dal rendering e dalle operazioni del componente.
   */
  private scrollHosts: HTMLElement[] = [];
  /**
   * Proprieta di stato del componente per on host scroll, usata dalla logica interna e dal template.
   */
  private readonly onHostScroll = () => this.scheduleEditorLayout();
  /**
   * Proprieta di stato del componente per record value sub, usata dalla logica interna e dal template.
   */
  private recordValueSub: Subscription | null = null;
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a syncing from record.
   */
  private syncingFromRecord: boolean = false;

      /**
   * function Object() { [native code] }
   * @param monacoLoaderService Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   * @param http Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   * @param metaSrv Metadati correnti usati per guidare mapping, validazioni e comportamento runtime.
   * @param userInfo Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   * @param dataSrv Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   * @param wtoolbox Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   * @param sanitizer Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   */
  constructor(private monacoLoaderService: MonacoEditorLoaderService, private http: HttpClient, private metaSrv: MetadataProviderService, private userInfo: UserInfoService, private dataSrv: DataProviderService, private wtoolbox: WtoolboxService, private sanitizer: DomSanitizer) {
    this.treeNodes = [];
    this.primeTreeNodes = [];
    this.sqlObjView = false;
  }

  private t(resource: string, fallback: string): string {
    const translated = WtoolboxService.translationService?.instant?.(resource);
    return translated && translated !== resource ? translated : fallback;
  }

            /**
   * Applica aggiornamenti di stato tramite `setFullScreen` mantenendo coerenti UI e dati.
   * @param $event Evento che innesca il comportamento del metodo.
   * @param ctx Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  setFullScreen($event: any, ctx: any) {
    $event.stopPropagation();
    $event.preventDefault();

    this.fullscreen = !this.fullscreen;
    requestAnimationFrame(() => this.editor?.layout());
  }

            /**
   * Gestisce la logica operativa di `toggleSqlObjView` in modo coerente con l'implementazione corrente.
   * @param $event Evento che innesca il comportamento del metodo.
   * @param ctx Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  toggleSqlObjView($event: any, ctx: any) {
    $event.stopPropagation();
    $event.preventDefault();

    this.sqlObjView = !this.sqlObjView;
  }

          /**
   * Gestisce la logica di `onContentChange` con il flusso specifico definito dalla sua implementazione.
   * @param $event Evento UI/payload evento che innesca la logica del metodo.
   */
  onContentChange($event) {
    debugger;
  }

      /**
   * Gestisce la logica operativa di `onTreeNodeDragStart` orchestrando le chiamate `stopPropagation` e `onNodeDragStart`.
   * @param event Evento UI o payload evento che innesca il flusso del metodo.
   * @param dataItem Record/elemento su cui il metodo applica elaborazioni o aggiornamenti.
   */
  onTreeNodeDragStart(event: DragEvent, dataItem: any): void {
    event.stopPropagation();
    this.editorOptions?.onNodeDragStart?.(event, dataItem);
  }

      /**
   * Gestisce la logica operativa di `onTreeNodeDragEnd` orchestrando le chiamate `stopPropagation` e `onNodeDragEnd`.
   * @param event Evento UI o payload evento che innesca il flusso del metodo.
   * @param dataItem Record/elemento su cui il metodo applica elaborazioni o aggiornamenti.
   */
  onTreeNodeDragEnd(event: DragEvent, dataItem: any): void {
    event.stopPropagation();
    this.editorOptions?.onNodeDragEnd?.(event, dataItem);
  }

            /**
   * Gestisce la logica operativa di `testSql` in modo coerente con l'implementazione corrente.
   * @param $event Evento che innesca il comportamento del metodo.
   * @param ctx Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  async testSql($event: any, ctx: any) {
    $event.stopPropagation();
    $event.preventDefault();

    if (this.editorRef) {
      let errors = await this.sqlProvider!.testSql();

      if (this.errors.length) {
        WtoolboxService.messageNotificationService.add({ severity: 'error', summary: 'sql_parser_error', detail: errors.map(x => x.Message).join(' -- ') });
      } else {
        WtoolboxService.messageNotificationService.add({ severity: 'success', summary: 'sql_parser_success', detail: this.t('ok', 'Ok') });
      }
    }
  }

            /**
   * Gestisce la logica operativa di `suggest` in modo coerente con l'implementazione corrente.
   * @param $event Evento che innesca il comportamento del metodo.
   * @param ctx Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  async suggest($event: any, ctx: any) {
    $event.stopPropagation();
    $event.preventDefault();

    // var resp = await WtoolboxService.promptDialog('Suggest', [{ name: 'prompt', caption: 'prompt', type: 'text' }]);

    // debugger;
    const nextValue = String(this.field.mc_suggest_value_callback__fn(this.record!, this.field, this.metaInfo, WtoolboxService) ?? '');
    this.editorModelValue = nextValue;
    this.record![this.field.mc_nome_colonna].next(nextValue);
  }

        /**
   * Gestisce la logica di `onEditorModelChange` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
   * @param value Valore in ingresso elaborato o normalizzato dal metodo.
   */
  onEditorModelChange(value: string): void {
    const nextValue = String(value ?? '');
    this.editorModelValue = nextValue;
    this.refreshHtmlPreview();
    this.scheduleAutoFormatHtml();
    if (this.syncingFromRecord) {
      return;
    }
    this.record?.[this.field.mc_nome_colonna]?.next(nextValue);
  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  ngOnInit(): void {

    let formFieldOptions: {
      editorOptions?: EditorOptions,
      compilerOptions?: monaco.languages.typescript.CompilerOptions,
      schemas?: any[],
      codeContext?: string,
      extraLibs?: string[]
    } = {};

    if (this.field && this.field.extras.customEditorConfig) {
      try {
        formFieldOptions = this.field.extras.customEditorConfig;
      } catch (e) {
        console.error(`customEditorConfig for field ${this.field.mc_nome_colonna} error: ${e}`);
      }
    }

    this.editorOptions = { ...this.editorOptions, ...(formFieldOptions.editorOptions || {}) };
    const configuredLanguage = String((formFieldOptions.editorOptions as any)?.language || '').trim().toLowerCase();
    if (configuredLanguage === 'json' || configuredLanguage === 'typescript' || configuredLanguage === 'sql' || configuredLanguage === 'csharp' || configuredLanguage === 'html') {
      this.editorOptions.language = configuredLanguage as 'json' | 'typescript' | 'sql' | 'csharp' | 'html';
    }
    (this.editorOptions as any).automaticLayout = true;
    (this.editorOptions as any).fixedOverflowWidgets = false;
    (this.editorOptions as any).scrollBeyondLastLine = false;
    (this.editorOptions as any).wordWrap = (this.editorOptions as any).wordWrap || 'on';
    (this.editorOptions as any).wrappingIndent = (this.editorOptions as any).wrappingIndent || 'same';
    (this.editorOptions as any).suggest = {
      ...((this.editorOptions as any).suggest || {}),
      showStatusBar: false,
      preview: false,
      previewMode: 'subwordSmart',
      showInlineDetails: false
    };
    if (this.editorOptions.language === 'html') {
      this.showHtmlPreview = true;
      this.autoFormatHtml = (this.field?.extras?.customEditorConfig as any)?.htmlAutoFormat !== false;
    }
    this.bindRecordValue();
    this.refreshHtmlPreview();

    // if (this.editorOptions.language === 'sql') {
    //   this.sampleCode = '';
    // } else if (this.editorOptions.language === 'typescript') {
    //   this.sampleCode = 'function x() {\nconsole.log("Hello world!");\n}';
    // } else if (this.editorOptions.language === 'json') {
    //   this.sampleCode = '{\n\n}';
    // }

    // this.sampleCode = formFieldOptions.sampleCode || this.sampleCode;

    this.monacoLoaderService.isMonacoLoaded$.pipe(
      filter(isLoaded => isLoaded),
      take(1),
    ).subscribe(async () => {

        if (this.editorOptions.language === 'sql') {
          this.sqlProvider = new SqlProvider(this.http, this.editorOptions);
          await this.sqlProvider.registerSqlProvider(this.treeNodes);
          this.primeTreeNodes = this.mapToPrimeTreeNodes(this.treeNodes);
        }
        else if (this.editorOptions.language === 'typescript') {

          this.tsProvider = new TSProvider(this.http, this.editorOptions);
          await this.tsProvider.registerTSProvider(formFieldOptions, this.field, this.codeContext, this.record, this.metaSrv, this.userInfo);
        }
        else if (this.editorOptions.language === 'json') {

          // https://json-schema.org/learn/getting-started-step-by-step
          // string.
          //   number.
          //   integer.
          //   object.
          //   array.
          //   boolean.
          //   null.

          let modelUriStr = `a://${this.field.mc_nome_colonna + '_' + this.field.mc_id.toString()}/contextual.schema.json`;

          monaco.editor.getModels().forEach(model => {
            if (model.uri.toString() == modelUriStr) {
              model.dispose();
            }
          });

          let modelUri = monaco.Uri.parse(modelUriStr); // a made up unique URI for our model

          let model = monaco.editor.createModel("", "json", modelUri);

          this.editorOptions.model = model;

          if (formFieldOptions.schemas) {
            let schemaStr = JSON.stringify(formFieldOptions.schemas);
            schemaStr = schemaStr.replace('{0}', modelUriStr);
            formFieldOptions.schemas = JSON.parse(schemaStr);
          }

          monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
            validate: true,
            schemas: formFieldOptions.schemas || []
          });
        }
        else if (this.editorOptions.language === 'csharp') {
          //https://github.com/dotnetprojects/MonacoRoslynCompletionProvider (downloaded)
        } else if (this.editorOptions.language === 'html') {
          this.htmlProvider = new HtmlProvider(this.editorOptions, WUIC_COMPONENT_SELECTORS, WUIC_COMPONENT_BINDINGS);
          this.htmlProvider.registerHtmlProvider();
        }

      this.render = true;
    });
  }

  /**
   * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
   */
  ngAfterViewInit() {
    let self = this;
    let intv = setInterval(() => {
      if (!self.editorRef) return;

      this.editor = this.editorRef!.editor;
      this.editor?.updateOptions({
        automaticLayout: true,
        fixedOverflowWidgets: false,
        scrollBeyondLastLine: false,
        wordWrap: (this.editorOptions as any).wordWrap || 'on',
        wrappingIndent: (this.editorOptions as any).wrappingIndent || 'same',
        suggest: {
          ...((this.editorOptions as any).suggest || {}),
          showStatusBar: false,
          preview: false,
          previewMode: 'subwordSmart',
          showInlineDetails: false
        }
      } as any);
      this.editor?.layout();
      this.scheduleEditorLayout();

      clearInterval(intv);

      const editorDom = this.editor?.getDomNode?.();
      this.scrollHosts = this.getScrollableAncestors(editorDom || null);
      this.scrollHosts.forEach((host) => host.addEventListener('scroll', this.onHostScroll, { passive: true }));

      if (this.sqlProvider) {
        this.sqlProvider.setEditor(self.editorRef.editor);
      } else if (this.tsProvider) {
        this.tsProvider.setEditor(self.editorRef.editor);
      } else if (this.htmlProvider) {
        this.htmlProvider.setEditor(self.editorRef.editor);
      }

    }, 100);
  }

  /**
   * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
   */
  ngOnDestroy(): void {
    if (this.layoutRaf !== null) {
      cancelAnimationFrame(this.layoutRaf);
      this.layoutRaf = null;
    }
    this.scrollHosts.forEach((host) => host.removeEventListener('scroll', this.onHostScroll));
    this.scrollHosts = [];
    this.recordValueSub?.unsubscribe();
    this.recordValueSub = null;
    this.htmlProvider?.dispose();
    if (this.htmlFormatHandle) {
      clearTimeout(this.htmlFormatHandle);
      this.htmlFormatHandle = undefined;
    }
  }

      /**
   * Gestisce la logica operativa di `scheduleEditorLayout` orchestrando le chiamate `cancelAnimationFrame` e `requestAnimationFrame`.
   */
  private scheduleEditorLayout(): void {
    if (!this.editor) {
      return;
    }

    if (this.layoutRaf !== null) {
      cancelAnimationFrame(this.layoutRaf);
    }

    this.layoutRaf = requestAnimationFrame(() => {
      this.layoutRaf = null;
      this.editor?.layout();
    });
  }

              /**
   * Recupera i dati/valori richiesti da `getScrollableAncestors`.
   * @param start Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Collezione `HTMLElement[]` derivata dalla trasformazione dei dati nel metodo `getScrollableAncestors`.
   */
  private getScrollableAncestors(start: HTMLElement | null): HTMLElement[] {
    const hosts: HTMLElement[] = [];
    let current: HTMLElement | null = start?.parentElement || null;
    while (current) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY || '';
      const isScrollableY = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
        && current.scrollHeight > current.clientHeight;
      if (isScrollableY) {
        hosts.push(current);
      }
      current = current.parentElement;
    }
    return hosts;
  }

      /**
   * Gestisce la logica operativa di `bindRecordValue` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`, gestendo subscription RxJS in modo esplicito.
   */
  private bindRecordValue(): void {
    const fieldName = String(this.field?.mc_nome_colonna || '');
    const subject = fieldName ? this.record?.[fieldName] : undefined;
    if (!subject) {
      this.editorModelValue = '';
      return;
    }

    this.editorModelValue = String(subject.value ?? '');
    this.recordValueSub?.unsubscribe();
    this.recordValueSub = subject.subscribe((value) => {
      const nextValue = String(value ?? '');
      if (nextValue === this.editorModelValue) {
        return;
      }

      this.syncingFromRecord = true;
      this.editorModelValue = nextValue;
      this.refreshHtmlPreview();
      this.syncingFromRecord = false;
    });
  }

        /**
   * Valuta una condizione tramite `isHtmlEditor` con il flusso specifico definito dalla sua implementazione.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */



  get isHtmlEditor(): boolean {
    return this.editorOptions?.language === 'html';
  }

  /**
   * Valuta una condizione tramite `isJsonEditor` con il flusso specifico definito dalla sua implementazione.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */
  get isJsonEditor(): boolean {
    return this.editorOptions?.language === 'json';
  }

      /**
   * Gestisce il comportamento UI di `toggleHtmlPreview` orchestrando le chiamate `stopPropagation` e `preventDefault`.
   * @param $event Evento UI o payload evento che innesca il flusso del metodo.
   */
  toggleHtmlPreview($event: any): void {
    $event?.stopPropagation?.();
    $event?.preventDefault?.();
    this.showHtmlPreview = !this.showHtmlPreview;
    this.scheduleEditorLayout();
  }

      /**
   * Gestisce la logica operativa di `formatHtmlNow` orchestrando le chiamate `stopPropagation` e `preventDefault`.
   * @param $event Evento UI o payload evento che innesca il flusso del metodo.
   */
  formatHtmlNow($event?: any): void {
    $event?.stopPropagation?.();
    $event?.preventDefault?.();
    if (!this.isHtmlEditor || !this.editor) {
      return;
    }
    this.skipNextAutoFormat = true;
    this.editor.getAction('editor.action.formatDocument')?.run().catch(() => undefined);
  }

  /**
   * Gestisce la logica operativa di `formatJsonNow` orchestrando parse/stringify JSON e sync nel model editor.
   * @param $event Evento UI o payload evento che innesca il flusso del metodo.
   */
  formatJsonNow($event?: any): void {
    $event?.stopPropagation?.();
    $event?.preventDefault?.();
    if (!this.isJsonEditor) {
      return;
    }

    const raw = String(this.editor?.getValue?.() ?? this.editorModelValue ?? '');
    if (!raw.trim()) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const pretty = JSON.stringify(parsed, null, 2);
      this.editorModelValue = pretty;
      this.editor?.setValue(pretty);
      this.record?.[this.field.mc_nome_colonna]?.next(pretty);
    } catch {
      WtoolboxService.messageNotificationService.add({
        severity: 'error',
        summary: 'json_format_error',
        detail: this.t('json_format_error_detail', 'JSON non valido: impossibile formattare.')
      });
    }
  }

      /**
   * Gestisce la logica operativa di `scheduleAutoFormatHtml` orchestrando le chiamate `clearTimeout` e `setTimeout`.
   */
  private scheduleAutoFormatHtml(): void {
    if (!this.isHtmlEditor || !this.autoFormatHtml || !this.editor) {
      return;
    }
    if (this.skipNextAutoFormat) {
      this.skipNextAutoFormat = false;
      return;
    }

    if (this.htmlFormatHandle) {
      clearTimeout(this.htmlFormatHandle);
    }
    this.htmlFormatHandle = setTimeout(() => {
      this.htmlFormatHandle = undefined;
      this.formatHtmlNow();
    }, 1200);
  }

      /**
   * Gestisce la logica operativa di `refreshHtmlPreview` orchestrando le chiamate `sanitizeHtmlForPreview`.
   */
  private refreshHtmlPreview(): void {
    if (!this.isHtmlEditor) {
      this.sanitizedHtmlPreview = '';
      return;
    }
    this.sanitizedHtmlPreview = this.sanitizeHtmlForPreview(this.editorModelValue || '');
  }

              /**
   * Gestisce la logica operativa di `sanitizeHtmlForPreview` in modo coerente con l'implementazione corrente.
   * @param rawHtml Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Valore di tipo `SafeHtml | string` prodotto da `sanitizeHtmlForPreview`.
   */
  private sanitizeHtmlForPreview(rawHtml: string): SafeHtml | string {
    if (!rawHtml) {
      return '';
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    this.transformAngularTemplateForPreview(doc);
    const blockedTags = ['script', 'iframe', 'object', 'embed', 'link', 'meta'];
    blockedTags.forEach((tag) => doc.querySelectorAll(tag).forEach((node) => node.remove()));

    doc.querySelectorAll('*').forEach((node) => {
      Array.from(node.attributes).forEach((attr) => {
        const attrName = (attr.name || '').toLowerCase();
        const attrValue = (attr.value || '').trim();
        if (attrName.startsWith('on')) {
          node.removeAttribute(attr.name);
          return;
        }
        if ((attrName === 'src' || attrName === 'href') && /^javascript:/i.test(attrValue)) {
          node.removeAttribute(attr.name);
        }
      });
    });

    const cleaned = doc.body?.innerHTML || '';
    const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, cleaned) || '';
    return this.sanitizer.bypassSecurityTrustHtml(sanitized);
  }

            /**
   * Gestisce la logica operativa di `transformAngularTemplateForPreview` in modo coerente con l'implementazione corrente.
   * @param doc Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  private transformAngularTemplateForPreview(doc: Document): void {
    const allNodes = Array.from(doc.body.querySelectorAll('*'));

    allNodes.forEach((node) => {
      const tagName = (node.tagName || '').toLowerCase();

      if (tagName === 'ng-container') {
        const replacement = doc.createElement('div');
        const ngIfAttr = node.getAttribute('*ngif') || node.getAttribute('*ngIf') || '';
        const captionMatch = /getMetaColumn\(\s*['"]([^'"]+)['"]\s*\)/i.exec(ngIfAttr);
        if (captionMatch && captionMatch[1]) {
          replacement.setAttribute('data-wuic-caption', captionMatch[1]);
        }
        Array.from(node.attributes).forEach((attr) => replacement.setAttribute(attr.name, attr.value));
        while (node.firstChild) {
          replacement.appendChild(node.firstChild);
        }
        node.replaceWith(replacement);
        node = replacement;
      }

      Array.from(node.attributes).forEach((attr) => {
        const name = attr.name || '';
        if (name.startsWith('[(') && name.endsWith(')]')) {
          node.removeAttribute(name);
          return;
        }

        if (name.startsWith('[') && name.endsWith(']')) {
          node.removeAttribute(name);
          return;
        }

        if (name.startsWith('(') && name.endsWith(')')) {
          node.removeAttribute(name);
          return;
        }

        if (name.startsWith('*')) {
          node.removeAttribute(name);
        }
      });

      const normalizedTagName = (node.tagName || '').toLowerCase();
      if (normalizedTagName.startsWith('wuic-')) {
        const caption = this.extractMetaColumnCaption(node) || normalizedTagName;
        const placeholder = doc.createElement('div');
        placeholder.className = 'wuic-preview-component';

        if (normalizedTagName === 'wuic-field-editor') {
          const label = doc.createElement('label');
          label.className = 'wuic-preview-field__label';
          label.textContent = caption;
          placeholder.appendChild(label);

          // Keep preview compatible with Angular HTML sanitizer: form controls
          // like <input> may be stripped in sanitized HTML fragments.
          const inputPreview = doc.createElement('div');
          inputPreview.className = 'wuic-preview-field__input';
          placeholder.appendChild(inputPreview);
        } else {
          const title = doc.createElement('div');
          title.className = 'wuic-preview-component__title';
          title.textContent = `<${normalizedTagName}>`;
          placeholder.appendChild(title);
        }

        if ((node.innerHTML || '').trim()) {
          const content = doc.createElement('div');
          content.className = 'wuic-preview-component__content';
          content.innerHTML = node.innerHTML;
          placeholder.appendChild(content);
        }

        node.replaceWith(placeholder);
      }
    });
  }

            /**
   * Gestisce la logica operativa di `extractMetaColumnCaption` in modo coerente con l'implementazione corrente.
   * @param node Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Stringa risultante calcolata da `extractMetaColumnCaption` per chiavi/label o valori testuali.
   */
  private extractMetaColumnCaption(node: Element): string {
    let current: Element | null = node.parentElement;
    while (current) {
      const explicitCaption = current.getAttribute('data-wuic-caption') || '';
      if (explicitCaption) {
        return explicitCaption;
      }
      const ngIfAttr = current.getAttribute('*ngif') || current.getAttribute('*ngIf') || '';
      const match = /getMetaColumn\(\s*['"]([^'"]+)['"]\s*\)/i.exec(ngIfAttr);
      if (match && match[1]) {
        return match[1];
      }
      current = current.parentElement;
    }
    return '';
  }

        /**
   * Trasforma i dati in una forma coerente con rendering o payload normalizzando e trasformando collezioni di record.
   * @param nodes Collezione di input processata dal metodo (normalizzazione, filtri e mapping).
   * @returns Collezione di tipo `any[]` derivata dalle trasformazioni applicate nel metodo.
   */
  private mapToPrimeTreeNodes(nodes: any[]): any[] {
    if (!Array.isArray(nodes)) {
      return [];
    }

    return nodes.map(node => ({
      label: node?.text ?? '',
      data: node,
      children: this.mapToPrimeTreeNodes(node?.items || [])
    }));
  }

}


