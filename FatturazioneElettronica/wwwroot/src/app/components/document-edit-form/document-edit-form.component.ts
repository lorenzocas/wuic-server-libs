import { Component, Input, OnDestroy, OnInit, Optional, SkipSelf } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FieldsetModule } from 'primeng/fieldset';
import { Subscription } from 'rxjs';

// Import dal bridge `wuic-framework-lib-dev` (alias tsconfig path che punta
// a `./src/app/wuic-bridges/public.ts` in dev). In build production l'angular
// `fileReplacements` swappa `wuic-bridges/public.ts` con
// `wuic-bridges-npm/public.ts` che esporta dalla lib npm `wuic-framework-lib`.
// Pattern allineato a quello di WuicTest -> niente collisioni NG0912 e
// portabilita' tra dev (sorgenti via lib-src) e prod (lib npm pubblicata).
import {
  DataSourceComponent, DataRepeaterComponent, FieldEditorComponent,
  ParametricDialogComponent, WtoolboxService
} from 'wuic-framework-lib-dev';

/**
 * Edit/Detail form custom condiviso per i 4 documenti commerciali:
 * fatture_inviate, fatture_ricevute, preventivi, ordini.
 *
 * Layout Aruba-style:
 *   Riga 1: 2 fieldset affiancati (Dati documento | Dati cliente/fornitore)
 *   Riga 2: fieldset full-width "Prodotti e servizi" (nested grid righe inline)
 *   Riga 3: 2 fieldset affiancati (Dati pagamento OR Stato | Calcolo)
 *   Riga 4 (opzionale): fieldset full-width Stato e SDI
 *   Riga 5 (opzionale): fieldset full-width Scadenze (nestedRoutes[N])
 *   Riga 6 (opzionale): fieldset full-width Note
 *
 * Inputs di behaviour:
 *  - documentFields:       campi della card "Dati documento" (sinistra)
 *  - controparteTitle:     "Dati cliente" | "Dati fornitore"
 *  - controparteFields:    campi della card destra
 *  - pagamentoTitle:       titolo card pagamento (default "Dati pagamento", null => card non renderizzata)
 *  - pagamentoFields:      campi card pagamento (vuoto/null => card non renderizzata)
 *  - statoTitle:           titolo card stato semplice (alternativa a pagamento per documenti senza pagamento, null => no card)
 *  - statoFields:          campi card stato (vuoto/null => no card)
 *  - calcoloTitle:         "Calcolo fattura" | "Calcolo"
 *  - calcoloFields:        campi card calcolo
 *  - statoSdiFields:       campi card "Stato e SDI" full-width (null/empty => card non renderizzata)
 *  - scadenzeNestedIndex:  indice in metaInfo.nestedRoutes per la grid Scadenze (null/undefined => card non renderizzata)
 *  - noteFields:           default ['note']; vuoto/null => card non renderizzata
 *  - prodottiNestedIndex:  indice in metaInfo.nestedRoutes per la grid Prodotti e servizi (default 0)
 *
 * Inputs forniti dal parametric-dialog -> DynamicFormTemplateComponent:
 *  - record / metaInfo / metas / readOnly
 */
@Component({
  selector: 'app-document-edit-form',
  standalone: true,
  imports: [
    CommonModule,
    FieldsetModule,
    FieldEditorComponent,
    DataSourceComponent,
    DataRepeaterComponent
  ],
  templateUrl: './document-edit-form.component.html',
  styleUrl: './document-edit-form.component.scss'
})
export class DocumentEditFormComponent implements OnInit, OnDestroy {
  /** Subscription bag: BS dei campi progressivo/anno/serie per auto-compose
   *  programmatico di `numero`. Cleanup in ngOnDestroy. */
  private autoComposeSubs: Subscription[] = [];

  /**
   * Inject del parent ParametricDialogComponent via Angular DI per accedere
   * al `datasource` (BehaviorSubject<DataSourceComponent>). Pattern preferito
   * a un @Input forwarded — la dialog e' gia' nel ramo componenti, niente
   * forward chain artificiale tramite DynamicFormTemplate.
   * `@Optional()`: il custom component potrebbe in teoria essere usato
   * fuori da una parametric-dialog (es. preview standalone) -> nel caso
   * il datasource non sara' disponibile e rebasePristine() resta no-op.
   * `@SkipSelf()`: salta il proprio injector e cerca nel parent tree.
   */
  constructor(
    @Optional() @SkipSelf() private parametricDialog?: ParametricDialogComponent
  ) {}
  // Forniti dal parametric-dialog tramite ngComponentOutlet inputs
  @Input() record: any;
  @Input() metaInfo: any;
  @Input() metas: any;
  @Input() readOnly: boolean = false;
  /** placeholder per evitare NG0303 sui set non dichiarati. */
  @Input() rowData: any;
  /** placeholder per evitare NG0303. */
  @Input() isEditForm: boolean = false;

  // Behaviour inputs (configurabili dal template SQL via property binding)
  @Input() documentFields: string[] = [];
  @Input() controparteTitle: string = 'Dati cliente';
  @Input() controparteFields: string[] = [];
  @Input() pagamentoTitle: string | null = 'Dati pagamento';
  @Input() pagamentoFields: string[] | null = null;
  @Input() statoTitle: string | null = null;
  @Input() statoFields: string[] | null = null;
  @Input() calcoloTitle: string = 'Calcolo';
  @Input() calcoloFields: string[] = [];
  @Input() statoSdiFields: string[] | null = null;
  @Input() scadenzeNestedIndex: number | null = null;
  @Input() noteFields: string[] | null = ['note'];
  @Input() prodottiNestedIndex: number = 0;

  /**
   * Nome route del documento per identificare la stored `sp_next_progressivo`.
   * Settato via property binding nel template SQL (es. `[routeName]="'fatture_inviate'"`).
   * Default: dedotto da `metaInfo.tableMetadata.md_route_name` se non passato.
   */
  @Input() routeName: string | null = null;

  /** Nome colonna progressivo (varia per route): `progressivo` (default),
   *  `progressivo_interno` (fatture_ricevute, ordini_elettronici). */
  @Input() progressivoField: string = 'progressivo';

  /** Se true, ricompone `numero` come `[serie ]<progressivo>/<anno>` su change.
   *  False per fatture_ricevute (numero_fornitore manuale) e ordini_elettronici (numero_pa manuale). */
  @Input() autoComposeNumero: boolean = true;

  /** Se true (fatture_inviate), include `serie` nella ricomposizione. */
  @Input() hasSerie: boolean = false;

  /**
   * Hook init: applica metadata patches in-memory (mc_logic_editable,
   * mc_default_value_callback__fn, mc_selection_changed_custom_function__fn)
   * + esegue i default sul record corrente in modalita' Insert.
   *
   * Pattern allineato a WuicTest pattern-3c (Cities ODATA grid) — niente
   * stringhe SQL runtime-compiled, callback type-safe debuggabili.
   */
  ngOnInit(): void {
    this.injectMetadataPatches();
    this.applyDefaultsIfInsert();
    this.bindAutoComposeNumero();
  }

  ngOnDestroy(): void {
    this.autoComposeSubs.forEach((s) => { try { s.unsubscribe(); } catch { /* */ } });
    this.autoComposeSubs.length = 0;
  }

  /**
   * Auto-compose robusto di `numero` su ogni cambio (UI o programmatico) di
   * progressivo/anno/serie. Subscribe diretto sulle BehaviorSubject del record:
   * il framework `mc_selection_changed_custom_function__fn` fired SOLO da
   * UI events (modelChangeFn), NON da `setRecordValue` programmatico.
   * Questo subscribe copre entrambi i casi -> auto-compose deterministico.
   */
  private bindAutoComposeNumero(): void {
    if (!this.autoComposeNumero || !this.record) return;
    const progField = this.progressivoField;
    const fields = this.hasSerie ? [progField, 'anno', 'serie'] : [progField, 'anno'];
    const recompose = () => {
      const prog = this.readRecordValue(this.record, progField);
      const anno = this.readRecordValue(this.record, 'anno');
      const serie = this.hasSerie ? (this.readRecordValue(this.record, 'serie') || '') : '';
      // Tolleranza: prog puo' essere 0 (numero-editor su blur con campo
      // svuotato), in quel caso teniamo numero blank per evitare "0/2026".
      if (prog == null || prog === '' || Number(prog) === 0) {
        this.setRecordValue(this.record, 'numero', '');
        return;
      }
      if (anno == null || anno === '') return;
      const composed = (serie ? serie + ' ' : '') + Number(prog) + '/' + anno;
      // Evita BS.next infinito se il valore non e' cambiato.
      const cur = this.readRecordValue(this.record, 'numero');
      if (cur === composed) return;
      this.setRecordValue(this.record, 'numero', composed);
    };
    for (const f of fields) {
      const slot = this.record[f];
      if (slot && typeof slot.subscribe === 'function') {
        // skipFirst=true non e' supportato standard; il primo emit del BS
        // arriva con il valore corrente -> recompose viene chiamato anche
        // a init. Va bene: se i default sono gia' settati (fetch async
        // gia' completato) ricomporra' subito; altrimenti i guard sopra
        // (prog/anno empty) evitano output spurious.
        const sub = slot.subscribe(() => recompose());
        this.autoComposeSubs.push(sub);
      }
    }
  }

  /** Chiama datasource.rebasePristineAfterDefaults() per impedire che i
   *  default applicati al record nuovo siano tracciati come edit utente.
   *  Chiamato dopo i default sync e dopo il complete della Promise async
   *  (sp_next_progressivo). Datasource raggiunto via DI del parent
   *  ParametricDialogComponent (vedi constructor). */
  private rebasePristine(): void {
    const ds = this.parametricDialog?.datasource?.value;
    if (ds && typeof ds.rebasePristineAfterDefaults === 'function') {
      try { ds.rebasePristineAfterDefaults(); } catch (_e) { /* non-fatal */ }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Metadata in-memory patches
  // ─────────────────────────────────────────────────────────────────────

  private injectMetadataPatches(): void {
    const cols: any[] = this.metaInfo?.columnMetadata || [];
    if (!cols.length) return;

    const route = this.effectiveRoute;
    const progressivoCol = this.progressivoField;

    // numero readonly (solo se ricomposizione attiva)
    if (this.autoComposeNumero) {
      const numCol = cols.find(c => c.mc_nome_colonna === 'numero');
      if (numCol) numCol.mc_logic_editable = false;
    }

    // data_documento default = oggi
    const ddCol = cols.find(c => c.mc_nome_colonna === 'data_documento');
    if (ddCol) {
      ddCol.mc_default_value_callback__fn = (rec: any) => { rec.data_documento = new Date(); };
    }

    // anno default = anno corrente
    const annoCol = cols.find(c => c.mc_nome_colonna === 'anno');
    if (annoCol) {
      annoCol.mc_default_value_callback__fn = (rec: any) => { rec.anno = new Date().getFullYear(); };
    }

    // progressivo: il default async (sp_next_progressivo) viene fatto da
    // applyDefaultsIfInsert -> fetchNextProgressivoAndCompose con il payload
    // filterElement format `{field, operatore, value, Type}`. Volutamente
    // NON settiamo `mc_default_value_callback__fn` qui — altrimenti, dato
    // che `cols` e' un riferimento al cache metadata progetto-wide, il
    // callback persisterebbe tra openings successivi e verrebbe eseguito
    // dal nuovo `addNewRecord` framework path PRIMA che il custom component
    // sia mounted (con la sua URL/route disponibili). E NON c'e' modo
    // pulito di costruire un body filterElement-format senza mantenere lo
    // stato `route` / `serie` chiusi nella callback. Per ora la duplicazione
    // viene evitata: defaults applicati una sola volta da applyDefaultsIfInsert.

    // NB: l'auto-compose di `numero` e' implementato via `bindAutoComposeNumero`
    // (subscribe diretto sulle BehaviorSubject del record) — vedi ngOnInit.
    // Non usiamo `mc_selection_changed_custom_function__fn` perche' fired
    // SOLO da UI events (modelChangeFn), NON da setRecordValue programmatico
    // -> mancherebbe la ricomposizione post fetchNextProgressivoAndCompose.
  }

  // ─────────────────────────────────────────────────────────────────────
  // Insert defaults (apply al record gia' BS-wrapped da setCurrent)
  // ─────────────────────────────────────────────────────────────────────
  //
  // I `mc_default_value_callback__fn` settati in injectMetadataPatches
  // funzionano per FUTURE chiamate `addNewRecord()` dove `record` arriva
  // come oggetto plain. Pero' QUESTO componente si monta DOPO l'iniziale
  // addNewRecord (che ha gia' wrappato il record in BS map). Quindi
  // applichiamo i default direttamente con setRecordValue (che gestisce
  // sia BS map sia plain).

  private applyDefaultsIfInsert(): void {
    const isNew = this.record?.__new === true || this.record?.__new?.value === true;
    if (!this.record || !isNew) return;
    const cols: any[] = this.metaInfo?.columnMetadata || [];

    // data_documento -> oggi (solo se vuoto)
    if (cols.find(c => c.mc_nome_colonna === 'data_documento')) {
      const cur = this.readRecordValue(this.record, 'data_documento');
      if (cur == null || cur === '') {
        this.setRecordValue(this.record, 'data_documento', new Date());
      }
    }

    // anno -> anno corrente (solo se vuoto)
    if (cols.find(c => c.mc_nome_colonna === 'anno')) {
      const cur = this.readRecordValue(this.record, 'anno');
      if (cur == null || cur === '') {
        this.setRecordValue(this.record, 'anno', new Date().getFullYear());
      }
    }

    // progressivo via sp_next_progressivo (async, fire-and-forget)
    const route = this.effectiveRoute;
    const progField = this.progressivoField;
    if (route && cols.find(c => c.mc_nome_colonna === progField)) {
      const curProg = this.readRecordValue(this.record, progField);
      if (curProg == null || curProg === '' || Number(curProg) === 0) {
        this.fetchNextProgressivoAndCompose(route, progField);
        // I default sync (data, anno) sono gia' applicati. Rebase pristine
        // ORA (per data+anno); il rebase finale post-progressivo viene
        // chiamato dentro la subscribe success di fetchNextProgressivoAndCompose.
        this.rebasePristine();
        return;
      }
    }
    // Se non c'e' progressivo da fetchare (es. fatture_ricevute con autoCompose=false),
    // rebase subito.
    this.rebasePristine();
  }

  /** Chiama sp_next_progressivo via AsmxProxy e popola progressivo + numero.
   *  Payload format coerente a `filterElement`: { field, operatore, value, ... }. */
  private fetchNextProgressivoAndCompose(route: string, progField: string): void {
    const anno = this.readRecordValue(this.record, 'anno') || new Date().getFullYear();
    const serie = this.hasSerie ? (this.readRecordValue(this.record, 'serie') || '') : '';
    const url = (WtoolboxService as any).appSettings.global_root_url + 'MetaService.getFlatDataFromStored';
    const body = {
      stored: 'sp_next_progressivo',
      parameters: [
        { field: '@route', operatore: 'eq', value: String(route),  Type: 'text' },
        { field: '@anno',  operatore: 'eq', value: String(anno),   Type: 'number' },
        { field: '@serie', operatore: 'eq', value: String(serie),  Type: 'text' }
      ],
      __pageIndex: 0, __pageSize: 1, __sortField: '', __sortDir: '',
      skipExtraParams: false, noResults: false
    };
    (WtoolboxService as any).http.post(url, body).subscribe({
      next: (r: any) => {
        // rawPagedResult: { Data: [...] } o { results: [...] } o array nudo
        const arr = (r && (r.Data || r.data || r.results || r)) || [];
        const next = (Array.isArray(arr) && arr[0] && arr[0].next_progressivo != null)
          ? Number(arr[0].next_progressivo) : 1;
        this.setRecordValue(this.record, progField, next);
        if (this.autoComposeNumero) {
          const composed = (serie ? serie + ' ' : '') + next + '/' + anno;
          this.setRecordValue(this.record, 'numero', composed);
        }
        // Rebase pristine post-progressivo (i BS.next sopra sono default-set,
        // non user-edit -> non devono triggerare dirty/Unsaved changes).
        this.rebasePristine();
      },
      error: (e: any) => { console.warn('[DocumentEditForm] sp_next_progressivo failed', e); }
    });
  }

  /** Read value compatibile con record plain o BehaviorSubject map. */
  private readRecordValue(record: any, key: string): any {
    if (!record) return undefined;
    const slot = record[key];
    if (slot && typeof slot === 'object' && 'value' in slot) return slot.value;
    return slot;
  }

  /** Set value compatibile con record plain (defaulted) o BS map. */
  private setRecordValue(record: any, key: string, value: any): void {
    if (!record) return;
    const slot = record[key];
    if (slot && typeof slot === 'object' && typeof (slot as any).next === 'function') {
      (slot as any).next(value);
    } else {
      record[key] = value;
    }
  }

  /** Route effettiva: @Input override o dedotta da metaInfo. */
  private get effectiveRoute(): string | null {
    return this.routeName
      || this.metaInfo?.tableMetadata?.md_route_name
      || this.metaInfo?.tableMetadata?.mdroutename
      || null;
  }

  /** Cerca colonna metadata per nome (case-insensitive). */
  getMetaColumn(fieldName: string): any {
    const normalized = (fieldName || '').trim().toLowerCase();
    if (!normalized) return null;
    const allColumns = [
      ...(((this.metas as any[]) || [])),
      ...(((this.metaInfo?.columnMetadata as any[]) || []))
    ];
    return allColumns.find((c: any) =>
      String(c?.mc_nome_colonna || '').trim().toLowerCase() === normalized
    ) || null;
  }

  /**
   * True se il record corrente ha gia' un id (modalita' Modifica/Detail).
   * In modalita' Insert (nuovo record) il record ha `__new = true` e l'`id`
   * e' un placeholder oggetto non valido come FK -> non possiamo caricare
   * le nested grid (FK parent = NULL/oggetto genera SQL non valido).
   *
   * Il flag `__new` e' marcato dal framework `addNewRecord()`.
   */
  get hasParentId(): boolean {
    const r = this.record;
    if (!r) return false;
    if (r.__new === true) return false;
    const id = r.id;
    if (id === null || id === undefined) return false;
    // FormControl/BehaviorSubject: prova `.value` come unwrap
    if (typeof id === 'object') {
      const v = id.value;
      if (v === null || v === undefined || v === 0 || v === '') return false;
      return true;
    }
    return id !== 0 && id !== '';
  }

  // Helpers per mostrare/nascondere card in base ai @Input
  get showProdottiCard(): boolean {
    const idx = this.prodottiNestedIndex;
    return Number.isInteger(idx) && idx >= 0 && !!this.metaInfo?.nestedRoutes?.[idx] && this.hasParentId;
  }
  get prodottiRoute(): string {
    return this.metaInfo?.nestedRoutes?.[this.prodottiNestedIndex]?.route || '';
  }

  get showPagamentoCard(): boolean {
    return !!(this.pagamentoFields && this.pagamentoFields.length > 0);
  }
  get showStatoCard(): boolean {
    return !!(this.statoFields && this.statoFields.length > 0);
  }
  get showStatoSdiCard(): boolean {
    return !!(this.statoSdiFields && this.statoSdiFields.length > 0);
  }
  get showScadenzeCard(): boolean {
    const idx = this.scadenzeNestedIndex;
    return Number.isInteger(idx as any) && (idx as number) >= 0 && !!this.metaInfo?.nestedRoutes?.[idx as number] && this.hasParentId;
  }
  get scadenzeRoute(): string {
    return this.metaInfo?.nestedRoutes?.[this.scadenzeNestedIndex as number]?.route || '';
  }
  get showNoteCard(): boolean {
    return !!(this.noteFields && this.noteFields.length > 0);
  }
}
