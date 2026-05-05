/**
 * DynamicCompilerService — wrapper sopra l'API pubblica `Compiler` di Angular
 * per compilare a runtime template HTML/Angular con input variabile, SENZA
 * dipendere da API private `ɵcompileComponent` / `ɵcompileNgModule`.
 *
 * # Perche'
 *
 * Il framework WUIC usa template stringa generati da metadata (SQL, layout
 * JSON) per costruire dinamicamente componenti Angular (righe list-grid,
 * celle, form, ecc.). Storicamente ha usato `ɵcompileComponent` (API `ɵ`
 * privata) per questo scopo.
 *
 * In Angular 21, `ɵcompileComponent` in **prod mode** (`ngDevMode=false` via
 * `enableProdMode()` o `optimization.scripts: true`) crasha con:
 *
 *     TypeError: Cannot redefine property: ɵfac
 *       at addDirectiveFactoryDef
 *       at compileComponent
 *
 * Motivo: Angular definisce `ɵfac` con `configurable: isDevMode()` sugli
 * import della classe runtime-compiled. In prod, configurable e' false, e
 * il secondo compile (es. ri-render di una row) non puo' ridefinire la
 * factory def.
 *
 * La workaround storica era forzare `optimization.scripts: false` +
 * `define: { ngDevMode: "true" }` in `angular.json`, con tradeoff negativi
 * su bundle chunking e tree-shaking.
 *
 * Questo service **elimina la dipendenza da `ɵcompileComponent`** sostituendola
 * con `Compiler.compileModuleAndAllComponentsSync`, che usa il path
 * NgModule-based e non triggera `addDirectiveFactoryDef` sugli import.
 *
 * # Design
 *
 * ## JitCompilerFactory manuale (no bootstrap switch)
 *
 * L'API `inject(Compiler)` e' disponibile solo se il bootstrap usa
 * `platformBrowserDynamic().bootstrapModule(AppModule)`. L'app host corrente
 * (WuicTest) usa invece `bootstrapApplication(AppComponent, appConfig)`
 * standalone.
 *
 * Per evitare di dover riscrivere il bootstrap come prerequisito, istanziamo
 * il `Compiler` manualmente via `JitCompilerFactory` da
 * `@angular/platform-browser-dynamic`. Questo modulo e' gia' come dep in
 * `WuicTest/package.json`. La factory produce un `Compiler` funzionale che
 * puo' compilare `NgModule` runtime senza DI Angular.
 *
 * ## Cache dei template
 *
 * La compilazione di un template e' costosa (puo' arrivare a decine di ms
 * per template complessi). Lo stesso template HTML (es. grid row default)
 * viene potenzialmente richiesto su piu' route diverse. Manteniamo una
 * cache `templateHash -> compiledComponentType` per riutilizzo.
 *
 * ## Lifecycle NgModuleRef
 *
 * Ogni template compilato produce un `NgModuleFactory` (+ uno `NgModuleRef`
 * se instanziato). Non lo distruggiamo esplicitamente perche' i template
 * rimangono validi per tutta la durata della SPA; quando il template
 * stringa cambia, una nuova entry viene aggiunta alla cache.
 *
 * ## Side-effect `@angular/compiler`
 *
 * `@angular/compiler` DEVE essere importato come side-effect prima di
 * qualsiasi uso di `Compiler.compileModule*`. L'import sotto e' la garanzia:
 * esbuild lo include nel bundle e lo esegue prima del primo uso di questo
 * service.
 */

import '@angular/compiler';
import {
  Compiler,
  CompilerFactory,
  Component,
  NgModule,
  NgModuleRef,
  Type,
  createNgModule,
  Injector
} from '@angular/core';
import { JitCompilerFactory } from '@angular/platform-browser-dynamic';
import { GlobalHandler } from '../handler/GlobalHandler';
import { WuicClientException } from '../exception/WuicClientException';
import { WuicErrorCodes } from '../exception/WuicErrorCodes';

/**
 * Opzioni per compilare un template dinamico.
 */
export interface CompileDynamicComponentOptions {
  /** Template HTML/Angular da compilare runtime. */
  template: string;
  /**
   * Selector CSS per il componente compilato (es. 'tr', '[field-editor]').
   * Opzionale: alcuni dynamic template (es. `DynamicForm`) non hanno selector
   * e vengono istanziati via `NgComponentOutlet`. Se omesso, Angular usa
   * il default `ng-component`.
   */
  selector?: string;
  /** Classe base da estendere; il componente compilato diventa una subclass. */
  baseClass: Type<any>;
  /**
   * Import per il componente. Possono essere NgModule, standalone components,
   * direttive, o pipe gia' decorate. Vengono passati all'NgModule wrapper
   * che circonda il componente compilato.
   */
  imports: Array<Type<any> | any[]>;
  /** Provider opzionali scoped al componente compilato. */
  providers?: any[];
  /**
   * Stili CSS inline da applicare al componente. Array di stringhe CSS (NON
   * path a file .css: il `Compiler` pubblico a runtime non risolve i path).
   */
  styles?: string[];
  /**
   * Origin metadata field that supplied the template (e.g. `md_rowTemplate`,
   * `md_edit_template`, `mc_ui_grid_column_data_template`,
   * `md_book_html_template`). Used to enrich typed compile/runtime errors
   * with the SPECIFIC field the user has to fix instead of a generic
   * 'template invalid' message. Optional — if omitted, falls back to
   * baseClass-name inference.
   */
  templateField?: string;
  /**
   * Route name (`md_route_name`) that owns the template. Optional but
   * highly recommended — surfaces in the typed error dialog so the user
   * knows WHICH route to open in the metadata editor.
   */
  route?: string;
}

/**
 * Maps a baseClass to its conventional `templateField` when the call site
 * doesn't pass an explicit `templateField` in `CompileDynamicComponentOptions`.
 * Best-effort: covers the common 1:1 mappings, falls back to the class name.
 * Exported so `GlobalHandler` can reuse it for runtime-error stack inference.
 */
export function inferTemplateFieldFromBaseClass(baseClassName: string): string {
    switch (baseClassName) {
        case 'DynamicRowTemplateComponent':       return 'md_rowTemplate';
        case 'DynamicCardTemplateComponent':      return '<mobile card auto-template>';
        case 'DynamicFormTemplateComponent':      return 'md_edit_template';
        case 'DynamicFieldTemplateComponent':     return 'mc_ui_grid_column_data_template';
        case 'DynamicGenericTemplateComponent':   return 'md_*_template';
        case 'DynamicRepeaterTemplateComponent':  return 'md_repeater_template';
        case 'DynamicDashboardTemplateComponent': return 'md_dashboard_template';
        default:                                  return baseClassName || '<unknown>';
    }
}

/**
 * Compila dinamicamente un componente da template stringa usando l'API
 * pubblica `Compiler`. Mantiene una cache per riutilizzo.
 *
 * Il componente compilato e' **non-standalone** (`standalone: false`),
 * dichiarato dentro un NgModule wrapper che include gli import forniti.
 * Questo evita il crash `addDirectiveFactoryDef` che affligge il path
 * standalone + runtime compile in prod.
 *
 * @param opts Template + selector + baseClass + imports + providers
 * @returns Type<any> — la classe componente pronta per NgComponentOutlet / createComponent
 */
export class DynamicCompilerService {
  private static _compiler: Compiler | null = null;
  private static readonly _templateCache = new Map<string, Type<any>>();
  private static readonly _moduleRefCache = new Map<Type<any>, NgModuleRef<any>>();

  /**
   * Lazy-instantiate il `Compiler` via `JitCompilerFactory`. Evita
   * `inject(Compiler)` che richiede bootstrap dinamico (non disponibile
   * nell'app host standalone).
   */
  private static getCompiler(): Compiler {
    if (!this._compiler) {
      // `JitCompilerFactory` ha una svista nei `.d.ts` di Angular 21: il
      // constructor richiede un array `CompilerOptions[]` a runtime (fa
      // `this._defaultOptions = [compilerOptions, ...defaultOptions]`),
      // ma il tipo esportato non espone la signature → TS accetta 0 args.
      // Passare `undefined` produce `TypeError: defaultOptions is not iterable`
      // al primo compile. Workaround: cast a `any` e pass `[]`.
      const factory: CompilerFactory = new (JitCompilerFactory as any)([]);
      this._compiler = factory.createCompiler();
    }
    return this._compiler;
  }

  /**
   * Chiave cache. Usiamo template + selector + nome classe base come chiave
   * composita per evitare collisioni quando baseclass diversi condividono
   * lo stesso template string.
   */
  private static cacheKey(opts: CompileDynamicComponentOptions): string {
    return `${opts.baseClass.name}|${opts.selector}|${opts.template}`;
  }

  /**
   * Compila un componente dinamico. Ritorna una `Type<any>` che puo' essere
   * passata a `NgComponentOutlet` / `createComponent` / `ViewContainerRef.createComponent`.
   *
   * NOTE: il componente e' non-standalone. Per essere usato via
   * `NgComponentOutlet` senza `ngModule`/`ngModuleRef`, Angular risolve
   * automaticamente il modulo wrapper dalla metadata `ɵngMod` impostata
   * dal compiler.
   */
  public static compile(opts: CompileDynamicComponentOptions): Type<any> {
    const key = this.cacheKey(opts);
    const cached = this._templateCache.get(key);
    if (cached) return cached;

    // Compile failures (malformed HTML, unclosed tags, invalid Angular
    // expressions in user-supplied templates like md_rowTemplate /
    // md_edit_template / mc_ui_grid_column_data_template / mc_button_template)
    // are caught here and degrade gracefully:
    //   1. Emit a typed errors.metadata.props_bag.malformed dialog so the
    //      user sees WHICH template + WHY it failed.
    //   2. Return a SAFE FALLBACK component (same baseClass, empty
    //      template) so the rest of the page still renders.
    //
    // The try/catch wraps the FULL compile pipeline because Angular's
    // `Component()` decorator (line ~217) eagerly parses the template at
    // decoration time and can throw before `compileModuleAndAllComponentsSync`
    // ever runs (Unexpected character "EOF", Parser errors, etc.).
    try {
      // Subclass fresca della base per avere un `ɵcmp` vergine — evita conflitti
      // con la metadata della classe base (che resta non-decorata / riusabile).
      // Usiamo un nome classe esplicito per migliorare debugging e stack trace.
      const baseName = opts.baseClass.name;
      const DynamicComponentClass = class extends (opts.baseClass as any) {};
      Object.defineProperty(DynamicComponentClass, 'name', {
        value: `Dynamic${baseName}_${this._templateCache.size}`,
        configurable: true,
      });

      // Pattern identico al vecchio `ɵcompileNgModule` + `ɵcompileComponent
      // (standalone:true, imports: [WrapperModule])`, ma eseguito via API
      // pubblica `Compiler`:
      //
      //  1. `WrapperModule` raccoglie gli import utente e li ri-esporta.
      //     Stessa semantica di `ɵcompileNgModule({imports, exports})`.
      //  2. Il componente dinamico e' **standalone: true** con
      //     `imports: [WrapperModule]` → il wrapper porta tutti i pipe/directive/
      //     standalone-components nello scope del componente. Standalone path
      //     preserva la risoluzione pipe (NG0302 evitata) che invece il path
      //     NgModule-declarations perdeva.
      //  3. Un `ContainerModule` importa il componente standalone — serve
      //     solo come unita' per `Compiler.compileModuleAndAllComponentsSync`
      //     che richiede un `@NgModule` target.
      const WrapperModule = class {};
      Object.defineProperty(WrapperModule, 'name', {
        value: `Dynamic${baseName}Wrapper_${this._templateCache.size}`,
        configurable: true,
      });
      NgModule({
        imports: opts.imports as any[],
        exports: opts.imports as any[],
      })(WrapperModule);

      const componentMetadata: any = {
        template: opts.template,
        standalone: true,
        imports: [WrapperModule],
      };
      if (opts.selector) componentMetadata.selector = opts.selector;
      if (opts.providers) componentMetadata.providers = opts.providers;
      if (opts.styles) componentMetadata.styles = opts.styles;
      Component(componentMetadata)(DynamicComponentClass);

      const ContainerModule = class {};
      Object.defineProperty(ContainerModule, 'name', {
        value: `Dynamic${baseName}Container_${this._templateCache.size}`,
        configurable: true,
      });
      NgModule({
        imports: [DynamicComponentClass as any],
      })(ContainerModule);

      // Compilazione sincrona del container module — attraversa WrapperModule
      // e gli import utente, poi `DynamicComponentClass` standalone. Il
      // componente compilato ha `ɵcmp` + `ɵfac` corretti e pipe scope
      // popolato via WrapperModule re-exports.
      const compiler = this.getCompiler();
      compiler.compileModuleAndAllComponentsSync(ContainerModule as Type<any>);

      // FORCE EAGER TEMPLATE PARSE: Angular's `Component()` decorator
      // installs a LAZY getter on `ɵcmp` that runs `parseJitTemplate`
      // ONLY when the component def is first accessed (typically by
      // `NgComponentOutlet.ngOnChanges` → `_R3ViewContainerRef.createComponent`
      // → `getComponentDef`). That happens AFTER `compile()` returns,
      // so a malformed template throws OUT of our try/catch into NgZone
      // unhandled. Reading `ɵcmp` here pulls the parse forward into our
      // try/catch boundary, so the throw becomes a typed dialog +
      // fallback component instead of the raw NG0303-style error.
      // We also touch the wrapper module's component defs for the same
      // reason (some JIT errors are deferred until module-scope walk).
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _forceParse = (DynamicComponentClass as any).ɵcmp;

      // A questo punto `DynamicComponentClass` ha `ɵcmp` + `ɵfac` impostati
      // dal compiler. Puo' essere usato come componente Angular standard.
      this._templateCache.set(key, DynamicComponentClass as Type<any>);
      return DynamicComponentClass as Type<any>;
    } catch (compileErr: any) {
      this.emitTemplateCompileError(opts, compileErr);
      return this.buildFallbackComponent(opts) as Type<any>;
    }
  }

  /**
   * Builds a degenerate component with the SAME baseClass + selector but
   * an empty template (or a small visible warning marker). Used when the
   * user-supplied template fails to compile so the rest of the page can
   * still render. Cached under the same key so we don't re-attempt the
   * failing compile on every render.
   */
  private static buildFallbackComponent(opts: CompileDynamicComponentOptions): Type<any> {
    const baseName = opts.baseClass.name;
    const FallbackClass = class extends (opts.baseClass as any) {};
    Object.defineProperty(FallbackClass, 'name', {
      value: `Dynamic${baseName}_Fallback_${this._templateCache.size}`,
      configurable: true,
    });
    // Minimal safe template: an empty container that occupies no layout.
    // For row templates (selector='tr') we need at least one <td> to
    // satisfy the table semantics; for everything else an empty <div>
    // works.
    const safeTemplate = (opts.selector === 'tr')
      ? '<td colspan="99" class="wuic-template-compile-failed" style="color:#c00;font-style:italic;padding:4px 8px;">[template compile error — see dialog]</td>'
      : '<div class="wuic-template-compile-failed" style="color:#c00;font-style:italic;padding:4px 8px;">[template compile error — see dialog]</div>';
    const componentMetadata: any = {
      template: safeTemplate,
      standalone: true,
      imports: [],
    };
    if (opts.selector) componentMetadata.selector = opts.selector;
    Component(componentMetadata)(FallbackClass);
    const FallbackContainer = class {};
    NgModule({ imports: [FallbackClass as any] })(FallbackContainer);
    try {
      this.getCompiler().compileModuleAndAllComponentsSync(FallbackContainer as Type<any>);
    } catch {
      // Defensive: if even the trivial fallback fails (shouldn't happen),
      // return the unmodified base class so at least nothing crashes.
      return opts.baseClass;
    }
    const cacheKey = this.cacheKey(opts);
    this._templateCache.set(cacheKey, FallbackClass as Type<any>);
    return FallbackClass as Type<any>;
  }

  /**
   * Builds a typed errors.metadata.props_bag.malformed exception with the
   * template snippet + parser message + base class hint, then dispatches
   * it via GlobalHandler so the dialog appears localized.
   */
  private static emitTemplateCompileError(opts: CompileDynamicComponentOptions, compileErr: any): void {
    const rawMsg = (compileErr instanceof Error ? compileErr.message : String(compileErr || '')).slice(0, 500);
    const templatePreview = String(opts.template || '').slice(0, 200);
    const templateField = opts.templateField || inferTemplateFieldFromBaseClass(opts.baseClass?.name || '');
    const route         = opts.route || '<unknown>';
    const args = {
      templateField,
      route,
      phase:         'compile',
      parserMessage: rawMsg,
      baseClass:     opts.baseClass?.name || '',
      selector:      opts.selector || '',
      templatePreview,
    } as any;
    const typed = new WuicClientException(
      WuicErrorCodes.MetadataTemplateInvalid,
      args,
      { surface: 'service', targetName: 'DynamicCompilerService.compile', cause: compileErr }
    );
    try { console.error(`[DynamicCompilerService] template '${templateField}' compile FAILED on route '${route}' (baseClass=${opts.baseClass?.name}):`, rawMsg, '\n--- template (first 200 chars) ---\n', templatePreview); } catch {}
    GlobalHandler.emitClientException(typed);
  }

  /**
   * Se un componente dinamico richiede un `NgModuleRef` per essere istanziato
   * via `NgComponentOutlet` con `[ngModuleRef]`, questa utility lo crea e lo
   * cacha. Non sempre necessario (Angular spesso risolve via `ɵngMod`), ma
   * disponibile come fallback.
   */
  public static getModuleRefFor(componentType: Type<any>, parentInjector: Injector): NgModuleRef<any> | null {
    const cached = this._moduleRefCache.get(componentType);
    if (cached) return cached;

    // Trova il modulo wrapper tramite metadata `ɵngMod`. Compile lo imposta
    // automaticamente sul componente quando la classe e' declarata in un
    // `NgModule.declarations`.
    const moduleType = (componentType as any).ɵngMod?.type;
    if (!moduleType) return null;

    try {
      const ref = createNgModule(moduleType, parentInjector);
      this._moduleRefCache.set(componentType, ref);
      return ref;
    } catch {
      return null;
    }
  }

  /** Pulisce la cache (utile per test / metadata refresh). */
  public static clearCache(): void {
    this._moduleRefCache.forEach((ref) => {
      try { ref.destroy(); } catch {}
    });
    this._moduleRefCache.clear();
    this._templateCache.clear();
    if (this._compiler) {
      try { this._compiler.clearCache(); } catch {}
    }
  }
}
