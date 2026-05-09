import { Component, Input, OnDestroy, AfterViewInit, Optional, SkipSelf, ViewChild, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FieldsetModule } from 'primeng/fieldset';
import { SplitButtonModule } from 'primeng/splitbutton';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { MenuItem } from 'primeng/api';
import { BehaviorSubject, Subscription } from 'rxjs';

// Import dal bridge `wuic-framework-lib-dev` (alias tsconfig path che punta
// a `./src/app/wuic-bridges/public.ts` in dev). In build production l'angular
// `fileReplacements` swappa `wuic-bridges/public.ts` con
// `wuic-bridges-npm/public.ts` che esporta dalla lib npm `wuic-framework-lib`.
// Pattern allineato a quello di WuicTest -> niente collisioni NG0912 e
// portabilita' tra dev (sorgenti via lib-src) e prod (lib npm pubblicata).
import {
  DataSourceComponent, DataRepeaterComponent, FieldEditorComponent,
  ListGridComponent,
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
    SplitButtonModule,
    DialogModule,
    ButtonModule,
    FieldEditorComponent,
    DataSourceComponent,
    DataRepeaterComponent,
    ListGridComponent
  ],
  templateUrl: './document-edit-form.component.html',
  styleUrl: './document-edit-form.component.scss'
})
export class DocumentEditFormComponent implements AfterViewInit, OnDestroy {
  /** Subscription bag: BS dei campi progressivo/anno/serie per auto-compose
   *  programmatico di `numero`. Cleanup in ngOnDestroy. */
  private autoComposeSubs: Subscription[] = [];

  /** Cache aliquote IVA: map codice_iva_id -> aliquota (number). Fetchata
   *  una volta al primo evento di prefill prodotto, riusata per ricalcolare
   *  iva_riga senza HTTP roundtrip ogni volta. */
  private codiciIvaAliquotaMap: Map<number, number> | null = null;
  private codiciIvaFetchInFlight: Promise<Map<number, number>> | null = null;

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
  ) { }

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

  /** Nome colonna prezzo sul record `prodotti` da copiare in
   *  `righe.prezzo_unitario` quando l'utente seleziona un prodotto.
   *  Default `prezzo_vendita` (fatture_inviate, preventivi, ordini,
   *  ddt vendita, proforma); per i documenti di acquisto/ricevuti
   *  passare `prezzo_acquisto` via property binding nel template SQL. */
  @Input() rowPriceField: string = 'prezzo_vendita';

  /** Nome colonna FK del documento verso `clienti` (sales) o `fornitori`
   *  (purchase). Letta a runtime per risolvere il `listino_id` della
   *  controparte e chiamare `sp_get_prezzo_listino`. Default `cliente_id`
   *  (sales); per documenti acquisto passare `fornitore_id` via property
   *  binding nel template SQL. Se la controparte non ha un listino
   *  associato, il prezzo viene preso da `prodotti.<rowPriceField>`. */
  @Input() counterpartFkField: 'cliente_id' | 'fornitore_id' = 'cliente_id';

  /**
   * Tipi di documento sorgente abilitati per la generazione "Crea da..."
   * (splitbutton in cima al form, visibile solo in __new mode).
   *
   * Esempio per fatture_inviate (sales):
   * ```
   * [importSourceTypes]="[
   *   { label: 'Da preventivo', route: 'preventivi', rowsRoute: 'preventivi_righe', fkField: 'preventivo_id' },
   *   { label: 'Da ordine',     route: 'ordini',     rowsRoute: 'ordini_righe',     fkField: 'ordine_id' },
   *   { label: 'Da DDT',        route: 'ddt',        rowsRoute: 'ddt_righe',        fkField: 'ddt_id' },
   *   { label: 'Da proforma',   route: 'proforma',   rowsRoute: 'proforma_righe',   fkField: 'proforma_id' }
   * ]"
   * ```
   *
   * Lascia [] (default) se questo template non supporta la conversione (es.
   * fatture_ricevute, ordini_acquisto). In quel caso lo splitbutton non viene
   * renderizzato.
   */
  @Input() importSourceTypes: Array<{ label: string; route: string; rowsRoute: string; fkField: string }> = [];

  /**
   * Valore di stato che abilita l'edit delle righe (default 'BOZZA').
   * Quando `record.stato.value !== statoEditableValue` E il record NON e'
   * __new, le colonne della nested route prodotti vengono settate a
   * `mc_logic_editable=false` e la grid diventa read-only. In modalita'
   * Insert (__new=true) le righe restano sempre editabili.
   */
  @Input() statoEditableValue: string = 'BOZZA';

  /**
   * Nome colonna stato sulla testata. Default 'stato'. Override solo se la
   * route usa un nome diverso. Se la colonna non esiste, il guard sull'edit
   * delle righe non si attiva e la grid resta sempre editabile.
   */
  @Input() statoFieldName: string = 'stato';

  @ViewChild(DataSourceComponent) righeDs?: DataSourceComponent; //To access directly the directive
  /** Riferimento alla nested data-source `scadenzeDs`. Usata per generaScadenze
   *  + patch runtime di metadati colonne (vedi `bindScadenzeMetaPatches`).
   *
   *  Pattern allineato a quello di `righeDs` (`@ViewChild` by type) ma qui
   *  serviamo template ref perche' `righeDs` (primo data-source nel template
   *  top-down) gia' matcha by type. Il template ref `#scadenzeDs` corrisponde
   *  al binding `<wuic-data-source #scadenzeDs ...>` nel HTML.
   *  Vedi skill `component-databound-hardcoded-datasource` per il pattern. */
  @ViewChild('scadenzeDs') scadenzeDs?: DataSourceComponent;

  /** Stato dialog "scegli documento sorgente" per la conversione documento->documento. */
  importDialogVisible = false;
  /** Tipo doc sorgente selezionato (entry da `importSourceTypes`). */
  importSelectedType: { label: string; route: string; rowsRoute: string; fkField: string } | null = null;
  /** MenuItems del p-splitButton (popolati da `importSourceTypes`). */
  splitButtonItems: MenuItem[] = [];

  /** Stato dialog "Genera scadenze": apre la grid pagamenti da cui scegliere il tipo. */
  pagamentiDialogVisible = false;

  /** ViewChild della nested data-source `scadenze`. Usata per pushare le righe
   *  generate dal pagamento selezionato nell'array `dato` runtime. NB: visto che
   *  ci sono PIU' DataSourceComponent nel template (righe + scadenze), il
   *  primo `@ViewChild(DataSourceComponent)` matcha il primo (righe). Per
   *  scadenze risolviamo runtime via DOM lookup. */

  private fetchInfoSubscription?: Subscription;
  private statoSub?: Subscription;

  /**
   * Hook init: applica metadata patches in-memory (mc_logic_editable,
   * mc_default_value_callback__fn, mc_selection_changed_custom_function__fn)
   * + esegue i default sul record corrente in modalita' Insert.
   *
   * Pattern allineato a WuicTest pattern-3c (Cities ODATA grid) — niente
   * stringhe SQL runtime-compiled, callback type-safe debuggabili.
   */
  ngAfterViewInit(): void {
    this.injectMetadataPatches();
    this.applyDefaultsIfInsert();
    this.bindAutoComposeNumero();
    this.bindStatoToRigheEditability();
    this.buildSplitButtonItems();
    this.bindScadenzeMetaPatches();
    this.installSaveValidationGuard();
  }

  /**
   * Monkey-patch `parametricDialog.submitData` per bloccare il save quando il
   * documento NON ha righe (`righeDs.resultInfo.dato.length === 0`). Le scadenze
   * sono opzionali (un documento puo' avere 0 scadenze) — quindi il guard si
   * applica SOLO a `righeDs`.
   *
   * Il pattern monkey-patch e' giustificato: il framework non espone un evento
   * `beforeSave` ne' un hook validation record-level (le `validationsRules`
   * standard sono per-campo). Wrap del metodo chiamato da
   * `customAction(action='save')` -> intercettiamo prima dell'esecuzione.
   *
   * Il wrapper:
   *  - Se `righeDs.dato.length===0` -> toast warn + return early (dialog resta aperto)
   *  - Altrimenti delega all'implementation originale
   *
   * Cleanup non strettamente necessario: la `parametricDialog` viene distrutta
   * insieme al component custom (lifetime sovrapposto).
   */
  private installSaveValidationGuard(): void {
    if (!this.parametricDialog) return;
    const dialog: any = this.parametricDialog;
    if (typeof dialog.submitData !== 'function') {
      console.warn('[document-edit-form] parametricDialog.submitData non disponibile, save-validation guard skip');
      return;
    }
    if (dialog.__hasDocumentEditFormSaveGuard === true) return;
    dialog.__hasDocumentEditFormSaveGuard = true;

    const orig = dialog.submitData.bind(dialog);
    dialog.submitData = async (...args: any[]) => {
      if (!this.showProdottiCard) {
        // Documento senza nested righe (es. ddt senza prodotti) -> niente guard.
        return orig(...args);
      }
      const dsRef: any = this.righeDs as any;
      const dato: any[] = dsRef?.resultInfo?.dato || [];
      if (dato.length === 0) {
        WtoolboxService?.messageNotificationService?.add?.({
          severity: 'warn',
          summary: 'Validazione',
          detail: 'Impossibile salvare il documento: aggiungi almeno una riga prodotti.'
        });
        return; // dialog resta aperto
      }
      // Verifica che ogni riga abbia `prodotto_id` valorizzato. Le righe possono
      // essere BS-wrapped (BehaviorSubject su ogni colonna) o plain object —
      // gestiamo entrambi via `readRecordValue`.
      let invalidIdx = -1;
      for (let i = 0; i < dato.length; i++) {
        const r = dato[i];
        // Skip righe marcate cancellate (logical delete client-side)
        const deleted = r?.___deleted === true || r?.___deleted?.value === true;
        if (deleted) continue;
        const prodId = this.readRecordValue(r, 'prodotto_id');
        if (prodId == null || prodId === '' || Number(prodId) <= 0) {
          invalidIdx = i;
          break;
        }
      }
      if (invalidIdx >= 0) {
        const rigaRaw = this.readRecordValue(dato[invalidIdx], 'riga');
        const rigaNum = rigaRaw != null && rigaRaw !== '' ? rigaRaw : (invalidIdx + 1);
        WtoolboxService?.messageNotificationService?.add?.({
          severity: 'warn',
          summary: 'Validazione',
          detail: `Impossibile salvare: la riga ${rigaNum} non ha un prodotto selezionato.`
        });
        return; // dialog resta aperto
      }
      return orig(...args);
    };
  }

  /**
   * Subscribe a `scadenzeDs.fetchInfo$` per patchare runtime la `metaInfo`
   * della nested grid Scadenze. Stesso pattern usato per `righeDs.fetchInfo$`
   * (vedi `injectMetadataPatches`): si attende il publish del fetchInfo (che
   * porta `metaInfo` con `tableMetadata` + `columnMetadata`), poi si modifica
   * il riferimento cached dal `MetadataProviderService` — patch locale single-
   * dialog scenario, latest-wins.
   *
   * Patch applicate:
   *  - `mc_hide_in_list = true` su tutte le colonne NON essenziali per il
   *    contesto fattura (whitelist sotto). PK preservata.
   *
   * Vedi skill `component-databound-hardcoded-datasource` per il pattern
   * "patch metadata via fetchInfo$ subscribe".
   */
  private bindScadenzeMetaPatches(): void {
    if (!this.scadenzeDs) return;
    const ESSENTIAL = new Set([
      'data_scadenza', 'importo', 'importo_pagato', 'pagamento_id',
      'stato', 'rata_n', 'rata_totale', 'note', 'banca_id'
    ]);
    const sub = this.scadenzeDs.fetchInfo$.subscribe((info) => {
      const route = this.scadenzeDs?.route?.value || this.scadenzeRoute;
      if (!info || route !== info.metaInfo?.tableMetadata?.md_route_name) return;

      this.scadenzeDs.metaInfo.tableMetadata.md_multiple_selection = false;
      this.scadenzeDs.metaInfo.tableMetadata.md_edit_popup = false;
      this.scadenzeDs.metaInfo.tableMetadata.md_inline_cell_editing = true;
      this.scadenzeDs.metaInfo.tableMetadata.md_inline_edit = true;
      this.scadenzeDs.metaInfo.tableMetadata.md_batch_save = true;

      this.scadenzeDs.metaInfo.tableMetadata.md_pageable = false;
      this.scadenzeDs.metaInfo.tableMetadata.md_pagesize = 0;

      this.scadenzeDs.metaInfo.tableMetadata.md_hide_refresh = true;
      this.scadenzeDs.metaInfo.tableMetadata.md_hide_export_xls = true;
      this.scadenzeDs.metaInfo.tableMetadata.md_disabilita_filtri = true;

      this.scadenzeDs.metaInfo.tableMetadata.extraProps = Object.assign(this.righeDs.metaInfo.tableMetadata.extraProps || {}, { toolbar: { hideManageState: true, hideBatchActions: true } }) as any;

      const cols: any[] = info.metaInfo?.columnMetadata || [];
      for (const c of cols) {
        const name = c?.mc_nome_colonna;
        if (!name) continue;
        if (c.mc_is_primary_key) continue;
        c.mc_hide_in_list = !ESSENTIAL.has(name);
      }
    });
    this.autoComposeSubs.push(sub);
  }

  ngOnDestroy(): void {
    this.autoComposeSubs.forEach((s) => { try { s.unsubscribe(); } catch { /* */ } });
    this.autoComposeSubs.length = 0;
    this.fetchInfoSubscription?.unsubscribe();
    this.fetchInfoSubscription = null;
    this.statoSub?.unsubscribe();
    this.statoSub = undefined;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Stato testata -> righe editabili (BOZZA only) + altre azioni
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Subscribe a `record.<statoFieldName>` (BehaviorSubject) e applica/rimuove
   * `mc_logic_editable=false` su tutte le colonne della nested route prodotti
   * quando lo stato cambia.
   *
   * Regola:
   *  - record.__new=true              -> righe sempre editabili (insert mode)
   *  - stato == statoEditableValue    -> righe editabili
   *  - stato != statoEditableValue    -> righe read-only (incluso button Aggiungi)
   *
   * In aggiunta, settiamo `md_insertable/md_deletable/md_editable=false` sulla
   * nested table metadata per disabilitare i pulsanti Aggiungi/Cancella del
   * list-grid quando le righe sono read-only.
   */
  private bindStatoToRigheEditability(): void {
    if (!this.record) return;
    const slot = this.record[this.statoFieldName];
    if (!slot || typeof (slot as BehaviorSubject<any>).subscribe !== 'function') {
      // colonna stato assente -> niente guard, righe sempre editabili
      return;
    }
    const apply = () => this.applyRigheEditableState();
    this.statoSub = (slot as BehaviorSubject<any>).subscribe(apply);
  }

  private applyRigheEditableState(): void {
    if (!this.metas || !this.showProdottiCard) return;
    const route = this.prodottiRoute;
    if (!route) return;
    const editable = this.areRigheEditable;
    // Trova metadata della nested route
    const nestedMeta = (this.metas as any[])?.find?.((m: any) =>
      m?.tableMetadata?.md_route_name === route ||
      m?.tableMetadata?.mdroutename === route
    );
    if (!nestedMeta) return;

    // Colonne: setta mc_logic_editable
    const cols: any[] = nestedMeta.columnMetadata || [];
    for (const c of cols) {
      // Skip PK/computed (non vengono mai editati)
      if (c?.mc_is_primary_key || c?.mc_is_computed) continue;
      // Preserva l'editabilita' originale per ripristino quando torna BOZZA
      if (c.__origLogicEditable === undefined) c.__origLogicEditable = c.mc_logic_editable !== false;
      c.mc_logic_editable = editable && c.__origLogicEditable;
    }

    // Tabella: setta md_insertable/deletable/editable per togliere i bottoni
    const tm = nestedMeta.tableMetadata;
    if (tm) {
      if (tm.__origInsertable === undefined) tm.__origInsertable = tm.md_insertable !== false;
      if (tm.__origDeletable === undefined) tm.__origDeletable = tm.md_deletable !== false;
      if (tm.__origEditable === undefined) tm.__origEditable = tm.md_editable !== false;
      tm.md_insertable = editable && tm.__origInsertable;
      tm.md_deletable = editable && tm.__origDeletable;
      tm.md_editable = editable && tm.__origEditable;
    }
  }

  /** True se le righe sono editabili: insert mode OPPURE stato==statoEditableValue. */
  get areRigheEditable(): boolean {
    if (!this.record) return false;
    const isNew = this.record.__new === true || this.record.__new?.value === true;
    if (isNew) return true;
    const cur = this.readRecordValue(this.record, this.statoFieldName);
    if (cur == null || cur === '') return true; // colonna stato non popolata -> permissive
    return String(cur).toUpperCase() === String(this.statoEditableValue).toUpperCase();
  }

  // ─────────────────────────────────────────────────────────────────────
  // Splitbutton "Crea da..." (visibile solo in __new mode)
  // ─────────────────────────────────────────────────────────────────────

  /** True se mostriamo lo splitbutton: ci sono tipi sorgente configurati AND record __new. */
  get showImportSplitButton(): boolean {
    if (!this.importSourceTypes?.length) return false;
    const isNew = this.record?.__new === true || this.record?.__new?.value === true;
    return isNew;
  }

  /** Costruisce i `MenuItem[]` dello splitbutton da `importSourceTypes`. */
  private buildSplitButtonItems(): void {
    this.splitButtonItems = (this.importSourceTypes || []).map((t) => ({
      label: t.label,
      icon: 'pi pi-copy',
      command: () => this.openImportDialog(t)
    }));
  }

  /** Apre il dialog di selezione del documento sorgente. */
  openImportDialog(type: { label: string; route: string; rowsRoute: string; fkField: string }): void {
    this.importSelectedType = type;
    this.importDialogVisible = true;
  }

  /**
   * Handler `(onClick)` del primary del splitButton (cioe' click sul label/icona,
   * NON sul dropdown chevron). Apre il dialog del primo tipo di sorgente come
   * default. Il signature di p-splitButton (onClick) e' MouseEvent, mentre
   * MenuItem.command vuole un MenuItemCommandEvent — qui evitiamo il mismatch
   * di tipi chiamando `openImportDialog` direttamente.
   */
  onSplitPrimaryClick(): void {
    const first = this.importSourceTypes?.[0];
    if (first) this.openImportDialog(first);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Genera scadenze da pagamento
  // ─────────────────────────────────────────────────────────────────────

  /** Apre il dialog "Seleziona tipo pagamento" (grid pagamenti). */
  openPagamentiDialog(): void {
    this.pagamentiDialogVisible = true;
  }

  /**
   * Handler `[rowCustomSelect]` del list-grid pagamenti. Signature reale:
   * `(_event, rowData, _dt)` — vedi commento su `onImportSourceSelected` per
   * la storia del mismatch firma framework.
   *
   * Logica:
   *  1. Chiude dialog
   *  2. Chiama `generaScadenze(pagamento)` che pusha N record nel scadenze ds
   *  3. Toast feedback
   */
  onPagamentoSelected = async (_event: any, pagamento: any): Promise<void> => {
    if (!pagamento?.id) return;
    this.pagamentiDialogVisible = false;
    try {
      const generated = await this.generaScadenze(pagamento);
      WtoolboxService?.messageNotificationService?.add?.({
        severity: 'success',
        summary: 'Scadenze',
        detail: `${generated} rate generate da "${pagamento.descrizione || 'pagamento'}"`
      });
    } catch (e: any) {
      console.error('[document-edit-form] generaScadenze failed:', e);
      // Mostra il messaggio reale dell'Error (specifico) invece del generico —
      // i guard interni (totale=0, scadenzeDs missing, sp 0 rate) emettono
      // messaggi user-friendly direttamente nel `throw new Error(...)`.
      const detail = (e instanceof Error && e.message)
        ? e.message
        : 'Errore durante la generazione delle scadenze';
      WtoolboxService?.messageNotificationService?.add?.({
        severity: 'warn',
        summary: 'Scadenze',
        detail
      });
    }
  };

  /**
   * Genera N record scadenza in-memory nel datasource `scadenzeDs`, chiamando
   * la stored procedure server-side `sp_calcola_scadenze` come **single source
   * of truth** della logica DF/FM/n_rate/distribuzione importo. Le righe
   * tornate dalla SP vengono pushate __new=true nel `scadenzeDs.resultInfo.dato`
   * (in-memory, persistite al batch save successivo).
   *
   * Razionale server-side: la stessa logica e' usata anche dal trigger
   * `tr_fatture_inviate_scadenze_auto` (post-save fallback). Avere la SP
   * separata permette anteprima nel dialog senza scrivere su DB.
   *
   * Pre-clean: se ci sono gia' scadenze __new=true precedenti, vengono rimosse
   * (l'utente sta sostituendo la generazione precedente). Le scadenze
   * non-__new (esistenti da DB) restano intoccate.
   */
  private async generaScadenze(pagamento: any): Promise<number> {
    const dataDocVal = this.readRecordValue(this.record, 'data_documento');
    const totaleRaw = this.readRecordValue(this.record, 'totale')
      ?? this.readRecordValue(this.record, 'imponibile') ?? 0;
    const totale = Number(totaleRaw) || 0;
    if (totale <= 0) {
      throw new Error('Totale documento non valorizzato: imposta righe prima di generare scadenze');
    }

    const scadenzeDs: any = this.scadenzeDs;
    if (!scadenzeDs) {
      throw new Error('scadenzeDs non disponibile: la grid Scadenze non e\' montata');
    }

    const cpFk = this.counterpartFkField;
    const cpVal = this.readRecordValue(this.record, cpFk);
    const tipoMov = this.routeName === 'fatture_inviate' || this.routeName === 'preventivi' || this.routeName === 'ordini'
      ? 'INCASSO' : 'PAGAMENTO';

    // Chiama sp_calcola_scadenze via getFlatDataFromStored (pattern WUIC framework
    // per stored procs). La SP ritorna N righe (una per rata) gia' calcolate.
    const baseUrl = (WtoolboxService as any).appSettings?.global_root_url;
    if (!baseUrl) throw new Error('global_root_url non disponibile');
    const body = {
      stored: 'sp_calcola_scadenze',
      parameters: [
        { field: '@pagamento_id', operatore: 'eq', value: String(pagamento.id), Type: 'number' },
        { field: '@data_documento', operatore: 'eq', value: this.toDateOnlyString(dataDocVal) || null, Type: 'date' },
        { field: '@totale', operatore: 'eq', value: String(totale), Type: 'number' },
        { field: '@cliente_id', operatore: 'eq', value: cpFk === 'cliente_id' && cpVal != null ? String(cpVal) : null, Type: 'number' },
        { field: '@fornitore_id', operatore: 'eq', value: cpFk === 'fornitore_id' && cpVal != null ? String(cpVal) : null, Type: 'number' },
        { field: '@tipo', operatore: 'eq', value: tipoMov, Type: 'text' }
      ],
      __pageIndex: 0, __pageSize: 100, __sortField: '', __sortDir: '',
      skipExtraParams: false, noResults: false
    };
    const resp: any = await ((WtoolboxService as any).http.post(baseUrl + 'MetaService.getFlatDataFromStored', body).toPromise());
    const rows: any[] = (resp && (resp.results || resp.dato || resp.Data || resp.data)) || [];
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('sp_calcola_scadenze ha ritornato 0 rate — verifica pagamento_id/totale');
    }

    // Pre-clean: rimuovi righe __new precedenti (regenerazione idempotente).
    if (!scadenzeDs.resultInfo) scadenzeDs.resultInfo = { dato: [], totalRowCount: 0, current: {} };
    if (!Array.isArray(scadenzeDs.resultInfo.dato)) scadenzeDs.resultInfo.dato = [];
    scadenzeDs.resultInfo.dato = scadenzeDs.resultInfo.dato.filter((r: any) => {
      const isNew = r?.__new?.value === true || r?.__new === true;
      return !isNew;
    });

    let generated = 0;
    for (const row of rows) {
      // Normalizza data_scadenza in formato YYYY-MM-DD (la SP la ritorna come Date string)
      const cleanRow: any = { ...row };
      cleanRow.data_scadenza = this.toDateOnlyString(row.data_scadenza);
      // FK al documento corrente (sara' settata correttamente al batch save dal
      // framework via parentRecord, ma settarla esplicitamente aiuta la grid
      // a renderizzare in anteprima)
      if (this.routeName === 'fatture_inviate') {
        cleanRow.fattura_inviata_id = this.readRecordValue(this.record, 'id');
      } else if (this.routeName === 'fatture_ricevute') {
        cleanRow.fattura_ricevuta_id = this.readRecordValue(this.record, 'id');
      }

      scadenzeDs.addNewRecord?.(cleanRow);
      const bsRecord = scadenzeDs.resultInfo?.current;
      if (bsRecord) {
        scadenzeDs.resultInfo.dato.push(bsRecord);
        generated++;
      }
    }
    scadenzeDs.resultInfo.totalRowCount = scadenzeDs.resultInfo.dato.length;

    // Re-publish per re-render
    if (typeof scadenzeDs.fetchInfo$?.next === 'function' && scadenzeDs.metaInfo) {
      scadenzeDs.fetchInfo$.next({
        resultInfo: scadenzeDs.resultInfo,
        metaInfo: scadenzeDs.metaInfo,
        filterDescriptor: scadenzeDs.filterDescriptor
      });
    }
    return generated;
  }


  /** Hook bindato al `[rowCustomSelect]` del list-grid nel dialog.
   *
   *  ATTENZIONE: il framework dichiara la signature `(rowData, $event, dt)` su
   *  `ListGridComponent.rowCustomSelect` MA l'invocazione reale in
   *  `dynamic-template.component.ts:447` passa `($event, rowData, dt)` — argomenti
   *  invertiti. Adattiamo il nostro handler all'invocazione reale: il PRIMO
   *  argomento e' l'evento DOM, il SECONDO e' il record selezionato dalla list-grid. */
  onImportSourceSelected = async (_event: any, selected: any): Promise<void> => {
    if (!selected || !this.importSelectedType) return;
    const type = this.importSelectedType;
    this.importDialogVisible = false;
    console.debug('[document-edit-form] onImportSourceSelected', { type: type.label, selected: { id: selected?.id, keys: Object.keys(selected || {}).slice(0, 12) } });

    try {
      await this.populateFromSourceDoc(type, selected);
    } catch (e) {
      console.error('[document-edit-form] populateFromSourceDoc failed:', e);
      WtoolboxService?.messageNotificationService?.add?.({
        severity: 'error',
        summary: 'Importazione',
        detail: 'Errore durante l\'importazione del documento sorgente'
      });
    }
  };

  /**
   * Popola il record corrente (testata + righe in-memory) leggendo i dati
   * dal documento sorgente. Pattern:
   *  1. Copia campi compatibili dalla testata sorgente alla testata corrente
   *     (intersezione dei nomi colonna). Skip: PK, progressivo, anno, numero,
   *     stato, stato_sdi, sdi_*, audit columns.
   *  2. CRUD read sulle righe sorgente (rowsRoute filtrato per fkField=sourceId).
   *  3. Per ogni riga sorgente, aggiunge una nuova riga __new=true al
   *     `righeDs` con i campi compatibili (skip: id, FK al sorgente, audit).
   *  4. Le righe vengono persistite al batch save insieme alla testata.
   */
  private async populateFromSourceDoc(
    type: { label: string; route: string; rowsRoute: string; fkField: string },
    rowDataFromGrid: any
  ): Promise<void> {
    if (!rowDataFromGrid?.id || !this.record) return;

    const baseUrl = (WtoolboxService as any).appSettings?.global_root_url;
    if (!baseUrl) throw new Error('global_root_url non disponibile');

    // Flag `__importing` sul record corrente: protegge il callback
    // `mc_selection_changed_custom_function__fn` di `prodotto_id` dal chiamare
    // `sp_get_prezzo_listino` durante l'import bulk delle righe (lo stored
    // call non e' necessario perche' i prezzi vengono COPIATI dal documento
    // sorgente, NON ricalcolati). Senza questo guard, ogni `addNewRecord(row)`
    // triggererebbe N round-trip server-side -> latenza e potenziali 500
    // se la SP rifiuta i parametri parzialmente vuoti.
    this.record.__importing = true;

    // 1. Fetch testata sorgente completa via getFlatRecordData filtrando per id.
    //    Il rowData del list-grid contiene solo i campi visualizzati nella grid
    //    (es. cliente_id__lookup_obj ma non causale, riferimento_ordine, FK numerici
    //    completi). Per copiare l'intera testata serve un fetch dedicato.
    const headerPayload = this.buildFlatRecordPayload(type.route, {
      logic: 'AND',
      filters: [{ field: 'id', operatore: 'eq', value: rowDataFromGrid.id }]
    }, 1);
    const headerResp = await fetch(baseUrl + 'MetaService.getFlatRecordData', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(headerPayload)
    });
    if (!headerResp.ok) throw new Error(`getFlatRecordData ${type.route}/header failed: ${headerResp.status}`);
    const headerJson = await headerResp.json();
    const sourceHeader = (headerJson?.results || headerJson?.dato || [])[0];
    if (!sourceHeader) throw new Error('source header non trovato');

    // 2. Copia campi compatibili sulla testata
    const skipFields = new Set([
      'id', 'progressivo', 'progressivo_interno', 'anno', 'numero', 'serie',
      'stato', 'stato_sdi', 'sdi_id', 'sdi_messaggio', 'data_documento',
      'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted', '__new'
    ]);
    const cols: any[] = this.metaInfo?.columnMetadata || [];
    for (const col of cols) {
      const name = col?.mc_nome_colonna;
      if (!name || skipFields.has(name)) continue;
      // Skip campi che non esistono nella sorgente (alias join, calcolati, ecc.)
      if (!(name in sourceHeader)) continue;
      const sourceVal = sourceHeader[name];
      if (sourceVal === undefined || sourceVal === null) continue;
      if (this.record[name] !== undefined) {
        this.setRecordValue(this.record, name, sourceVal);
      }
    }

    // 2b. Alias joined `<targetEntity>___<textField>__<col>` per le colonne
    //     lookupByID della testata: serve solo per il display in mode read-only
    //     (es. preview detail) — il lookup-editor in EDIT mode auto-binda
    //     `__lookup_obj` via `installProgrammaticValueAutoFetch` (subscribe
    //     a record[col] BS) appena vede il FK cambiare e scopre che il valore
    //     non e' negli items caricati.
    for (const col of cols) {
      const name = col?.mc_nome_colonna;
      if (!name || skipFields.has(name)) continue;
      if (col?.mc_ui_column_type !== 'lookupByID') continue;
      const targetEntity = col?.mc_ui_lookup_entity_name;
      const textField = col?.mc_ui_lookup_dataTextField;
      if (!targetEntity || !textField) continue;
      const aliasKey = `${targetEntity}___${textField}__${name}`;
      const displayValue = sourceHeader[aliasKey];
      if (displayValue != null) this.setSlotIfPresent(this.record, aliasKey, displayValue);
    }

    // 3. Fetch righe sorgente via getFlatRecordData (endpoint canonical
    //    framework, vedi data-provider-meta.service.ts:300). NON usare
    //    AsmxCrudRead — non supporta filterInfo strutturato.
    const rowsPayload = this.buildFlatRecordPayload(type.rowsRoute, {
      logic: 'AND',
      filters: [{ field: type.fkField, operatore: 'eq', value: sourceHeader.id }]
    }, 500);
    const resp = await fetch(baseUrl + 'MetaService.getFlatRecordData', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rowsPayload)
    });
    if (!resp.ok) throw new Error(`getFlatRecordData ${type.rowsRoute} failed: ${resp.status}`);
    const json = await resp.json();
    // rawPagedResult shape: { results: [...], totalCount: N }
    const sourceRows: any[] = json?.results || json?.dato || [];

    // 4. Aggiungi le righe come __new=true al righeDs.
    //
    //    Pattern: ogni sourceRow viene passata a `ds.addNewRecord(row)` che:
    //      - applica i default metadata (callback, ecc.)
    //      - sovrascrive con i campi della source row (Object.assign)
    //      - chiama `setCurrent(defaulted)` -> wrappa in BS map e setta come current
    //    Il record corrente bs-wrapped viene poi pushato in `ds.resultInfo.dato`
    //    (l'array che il list-grid renderizza). Infine pubblichiamo
    //    `fetchInfo$.next(...)` per forzare il re-render della grid (pattern
    //    allineato a 3a-external-rest-grid.component.ts:188).
    if (this.righeDs && sourceRows.length > 0) {
      const skipRowFields = new Set([
        'id', type.fkField, 'created_at', 'updated_at', 'created_by',
        'updated_by', 'cancellato', 'deleted', '__new',
        // 'riga' viene RICALCOLATA dal `mc_default_value_callback__fn` di riga
        // basandosi su `dato.length + 1` (vedi injectMetadataPatches). Skippandola
        // dalla source row, il default callback prevale e i numeri riga risultanti
        // sono CONTINUI (1, 2, 3, ...) anche se ci sono gia' righe pre-esistenti
        // nella grid (es. utente importa due preventivi diversi in sequenza, o
        // aggiunge righe manuali poi importa altre).
        'riga'
      ]);
      // Filtra anche gli alias joined (`<targetTable>___<textField>__<col>`):
      // sono read-only nel risultato della source ma confondono se passati
      // come default al nuovo record.
      const cleanSourceRows = sourceRows.map((sr: any) => {
        const out: any = {};
        for (const k of Object.keys(sr || {})) {
          if (skipRowFields.has(k)) continue;
          if (k.includes('___')) continue; // alias joined
          out[k] = sr[k];
        }
        return out;
      });

      const ds: any = this.righeDs as any;
      // Inizializza resultInfo se assente (autoload=false in Insert -> resultInfo
      // potrebbe essere `new ResultInfo()` con `dato=[]`).
      if (!ds.resultInfo) {
        ds.resultInfo = { dato: [], totalRowCount: 0, current: {} };
      }
      if (!Array.isArray(ds.resultInfo.dato)) {
        ds.resultInfo.dato = [];
      }

      for (const cleanRow of cleanSourceRows) {
        ds.addNewRecord?.(cleanRow);
        const bsRecord = ds.resultInfo?.current;
        if (bsRecord && bsRecord !== ds.resultInfo.dato[ds.resultInfo.dato.length - 1]) {
          ds.resultInfo.dato.push(bsRecord);
        }
      }
      ds.resultInfo.totalRowCount = ds.resultInfo.dato.length;

      // Re-publish per forzare il re-render del list-grid: senza questo l'array
      // `dato` e' mutato ma il list-grid (binded via fetchInfo$ subscribe) non
      // si accorge dell'update -> grid vuota. Con il guard `__importing` sui
      // selection-changed callback (vedi injectMetadataPatches), l'eventuale
      // ciclo di sync downstream non chiama piu' `sp_get_prezzo_listino` etc.
      // -> niente piu' HTTP 500.
      if (typeof ds.fetchInfo$?.next === 'function' && ds.metaInfo) {
        ds.fetchInfo$.next({
          resultInfo: ds.resultInfo,
          metaInfo: ds.metaInfo,
          filterDescriptor: ds.filterDescriptor
        });
      } else {
        console.warn('[document-edit-form] righeDs.fetchInfo$ o metaInfo non disponibile, skip re-publish', {
          hasFetchInfo$: !!ds.fetchInfo$,
          hasMetaInfo: !!ds.metaInfo
        });
      }
    }

    // Reset flag __importing in modo asincrono: il list-grid renderizza i lookup-editor
    // delle righe DOPO il return di populateFromSourceDoc (Angular change detection +
    // mount asincrono). I lookup-editor chiamano `mc_selection_changed_custom_function__fn`
    // nel proprio ngAfterViewInit se hanno un valore preset (vedi
    // lookup-editor.component.ts ngAfterViewInit:208-244). Se resettassimo __importing
    // SINCRONAMENTE qui, il callback su prodotto_id partirebbe senza guard e chiamerebbe
    // sp_get_prezzo_listino N volte (1x per ogni riga). 1500ms da' tempo a tutti i
    // lookup-editor di montarsi e auto-skippare via il guard.
    setTimeout(() => {
      if (this.record) this.record.__importing = false;
      // Ricalcola master totali dalle righe importate. Durante __importing il
      // callback mc_selection_changed_custom_function__fn delle righe e' skippato
      // (no recalculateRow auto), quindi i totali master non si aggiornano. Qui
      // forziamo il recalc dopo che __importing torna false.
      this.recalculateMasterTotals();
    }, 1500);

    WtoolboxService?.messageNotificationService?.add?.({
      severity: 'success',
      summary: 'Importazione',
      detail: `Documento ${type.label.toLowerCase()} importato (${sourceRows.length} righe)`
    });
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

    // Master totals readonly: imponibile / iva / totale sono calcolati
    // sommando le righe (`recalculateMasterTotals`). Sconto globale e
    // bollo sono editabili dall'utente e triggerano il ricalcolo.
    const masterCalcReadonly = ['imponibile', 'iva', 'totale'];
    for (const cn of masterCalcReadonly) {
      const c = cols.find(x => x?.mc_nome_colonna === cn);
      if (c) c.mc_logic_editable = false;
    }

    // Trigger ricalcolo master quando cambiano sconto globale o bollo.
    const masterRecalcTriggers = ['sconto_globale_perc', 'bollo_valore'];
    for (const cn of masterRecalcTriggers) {
      const c = cols.find(x => x?.mc_nome_colonna === cn);
      if (c) {
        c.mc_selection_changed_custom_function__fn = () => {
          this.recalculateMasterTotals();
        };
      }
    }

    this.fetchInfoSubscription?.unsubscribe();

    this.fetchInfoSubscription = this.righeDs.fetchInfo$.subscribe((info) => {
      const dataSourceRoute = this.righeDs?.route?.value || this.routeName;
      if (info && dataSourceRoute == info.metaInfo?.tableMetadata?.md_route_name) {
        this.righeDs.metaInfo.tableMetadata.md_edit_popup = false;
        this.righeDs.metaInfo.tableMetadata.md_inline_cell_editing = true;
        this.righeDs.metaInfo.tableMetadata.md_inline_edit = true;
        this.righeDs.metaInfo.tableMetadata.md_batch_save = true;

        this.righeDs.metaInfo.tableMetadata.md_pageable = false;
        this.righeDs.metaInfo.tableMetadata.md_pagesize = 0;

        this.righeDs.metaInfo.tableMetadata.md_hide_refresh = true;
        this.righeDs.metaInfo.tableMetadata.md_hide_export_xls = true;
        this.righeDs.metaInfo.tableMetadata.md_disabilita_filtri = true;
        // hideBatchActions: nasconde "Salva modifiche" + "Annulla modifiche"
        // + indicatore conteggio changes (badge pencil) dalla toolbar della
        // grid righe. La testata della fattura ha gia' i suoi save/cancel
        // (parametric-dialog footer) che persistono master + righe in batch.
        this.righeDs.metaInfo.tableMetadata.extraProps = Object.assign(this.righeDs.metaInfo.tableMetadata.extraProps || {}, { toolbar: { hideManageState: true, hideBatchActions: true } }) as any;

        // Patches column-metadata sulla rows route. Vengono applicate sul
        // riferimento cached dal MetadataProvider (lifetime progetto-wide):
        // ogni nuova istanza del componente sovrascrive con la closure
        // corrente -> latest-wins. In single-dialog scenario (caso comune)
        // non ci sono race condition.
        const rowCols: any[] = info.metaInfo?.columnMetadata || [];
        const dsRef = this.righeDs;
        const priceField = this.rowPriceField;

        const UMCol = rowCols.find((c: any) => c?.mc_nome_colonna === 'unita_misura_id');
        if (UMCol) {
          UMCol.mc_ui_grid_size_width = 50;
        }

        // riga: numero progressivo automatico, readonly, colonna stretta.
        // Default = (count righe esistenti in `dato`) + 1. La nuova riga
        // inline-add NON e' ancora nel `dato` quando il callback viene
        // chiamato (vedi list-grid.addRecord -> datasource.addNewRecord ->
        // default callback FIRE -> poi push), quindi il count e' coerente.
        const rigaCol = rowCols.find((c: any) => c?.mc_nome_colonna === 'riga');
        if (rigaCol) {
          rigaCol.mc_logic_editable = false;
          rigaCol.mc_ui_grid_size_width = 40;
          rigaCol.mc_default_value_callback__fn = (rec: any) => {
            const dato: any[] = (dsRef as any)?.resultInfo?.dato || [];
            rec.riga = (Array.isArray(dato) ? dato.length : 0) + 1;
          };
        }

        // Calcolati read-only: imponibile_riga, iva_riga, totale_riga
        // sono frutto di `recalculateRow()` -> l'utente non li edita
        // direttamente. mc_logic_editable=false -> field-editor li
        // renderizza come readonly span.
        const calcReadonlyCols = ['imponibile_riga', 'iva_riga', 'totale_riga'];
        for (const cn of calcReadonlyCols) {
          const c = rowCols.find((x: any) => x?.mc_nome_colonna === cn);
          if (c) c.mc_logic_editable = false;
        }

        // prodotto_id: alla selezione di un prodotto dalla lookup,
        // legge l'oggetto pieno da `record['prodotto_id__lookup_obj'].value`
        // e pre-popola i campi dipendenti. Il combo combo response include
        // i campi extra grazie a `mc_props_bag.slimCombo` settato sulla
        // colonna (vedi script 2026-05-08-prodotti-slim-combo-extras.sql)
        // -> niente HTTP roundtrip aggiuntivo, lookup_obj ha tutto.
        // L'autocomplete dropdown setta `__lookup_obj` PRIMA di firare il
        // callback (lookup-editor.component.ts:421).
        const prodCol = rowCols.find((c: any) => c?.mc_nome_colonna === 'prodotto_id');
        if (prodCol) {
          prodCol.mc_selection_changed_custom_function__fn = async (
            record: any, _field: any, _metaInfo: any, newValue: any, oldValue: any
          ) => {
            if (newValue == null || newValue === '' || newValue === oldValue) return;
            // Skip durante import bulk: la testata e' marcata `__importing=true`
            // dal `populateFromSourceDoc` e i prezzi/righe vengono copiati
            // direttamente dal documento sorgente, no need to fetch sp_get_prezzo_listino.
            if (this.record?.__importing === true) return;
            const lookup = record?.['prodotto_id__lookup_obj']?.value;
            if (lookup && typeof lookup === 'object') {
              this.setSlotIfPresent(record, 'descrizione', lookup.descrizione);

              // FK delle lookup figlie. Il display:
              //  - in EDIT mode (lookup-editor montato): auto-fetch del lookup-editor
              //    al cambio di record[col] popola items + __lookup_obj automaticamente
              //    (vedi `installProgrammaticValueAutoFetch` in lookup-editor).
              //  - in DISPLAY mode (cella in lista, no edit attivo): formatGridViewValue
              //    legge l'alias joined `<route>___<textField>__<col>` dal record.
              //    Lo settiamo qui per non dover aspettare il mount dell'editor.
              this.setSlotIfPresent(record, 'unita_misura_id', lookup.unita_misura_id);
              this.setSlotIfPresent(record, 'unita_misura___codice__unita_misura_id',
                lookup['unita_misura___codice__unita_misura_id']);

              this.setSlotIfPresent(record, 'codice_iva_id', lookup.codice_iva_id);
              this.setSlotIfPresent(record, 'codici_iva___descrizione__codice_iva_id',
                lookup['codici_iva___descrizione__codice_iva_id']);

              // Listino lookup con fallback prodotti: chiama
              // `sp_get_prezzo_listino` passando prodotto_id +
              // controparte (cliente_id/fornitore_id master) + data
              // documento. La proc ritorna prezzo_vendita/prezzo_acquisto
              // dal listino se trovato (validity match), altrimenti dai
              // prodotti default. `prezzo_source` = 'listino' | 'prodotto'.
              const listinoData = await this.fetchListinoPrice(Number(newValue));
              const priceVal = listinoData?.[priceField] ?? (lookup as any)[priceField];
              if (priceVal != null) {
                const num = Number(priceVal);
                if (Number.isFinite(num)) this.setSlotIfPresent(record, 'prezzo_unitario', num);
              }
              const scontoVal = listinoData?.sconto_default ?? lookup.sconto_default;
              if (scontoVal != null) {
                const ns = Number(scontoVal);
                if (Number.isFinite(ns)) this.setSlotIfPresent(record, 'sconto_perc', ns);
              }
            }

            // Ricalcola imponibile/iva/totale dopo il prefill.
            await this.recalculateRow(record);
          };
        }

        // Ricalcola imponibile/iva/totale ad ogni cambio UI di
        // quantita / prezzo_unitario / sconto_perc / codice_iva_id.
        const recalcCols = ['quantita', 'prezzo_unitario', 'sconto_perc', 'codice_iva_id'];
        for (const colName of recalcCols) {
          const col = rowCols.find((c: any) => c?.mc_nome_colonna === colName);
          if (!col) continue;
          col.mc_selection_changed_custom_function__fn = async (
            record: any, _field: any, _metaInfo: any, _newValue: any, _oldValue: any
          ) => {
            // Skip durante import bulk: i totali riga sono gia' calcolati nella sorgente.
            if (this.record?.__importing === true) return;
            await this.recalculateRow(record);
          };

          if (col.mc_nome_colonna == 'quantita') {
            col.mc_ui_grid_size_width = 80;
          }
        }
      }
    });

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
        { field: '@route', operatore: 'eq', value: String(route), Type: 'text' },
        { field: '@anno', operatore: 'eq', value: String(anno), Type: 'number' },
        { field: '@serie', operatore: 'eq', value: String(serie), Type: 'text' }
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

  /** Helper: scrive un valore in uno slot del record solo se lo slot
   *  esiste come BehaviorSubject. No-op se la colonna non e' nel
   *  record (utile per route righe con schema parziale, es.
   *  fatture_ricevute_righe senza unita_misura_id). */
  private setSlotIfPresent(record: any, col: string, val: any): void {
    if (val == null) return;
    const slot = record?.[col];
    if (slot && typeof slot.next === 'function') {
      slot.next(val);
    }
  }


  /** Chiama `sp_get_prezzo_listino` (DB Dati) per risolvere il prezzo
   *  applicabile al prodotto `prodId` per la controparte e la data del
   *  documento corrente. Ritorna `null` su errore o se la SP non
   *  produce righe. La SP fa autonomamente il fallback su
   *  `prodotti.<prezzo>` quando la controparte non ha listino associato
   *  o quando il prodotto non e' nel listino — questo helper restituisce
   *  comunque il record (con `prezzo_source = 'prodotto'` o `'listino'`),
   *  e il caller decide se usare i suoi valori o i lookup_obj prodotti.
   *
   *  Per stored procedures il framework espone
   *  `MetaService.getFlatDataFromStored` — stesso pattern usato gia'
   *  per `sp_next_progressivo` in `fetchNextProgressivoAndCompose`. */
  private async fetchListinoPrice(prodId: number): Promise<any | null> {
    if (!prodId || prodId <= 0) return null;

    const counterpartFk = this.counterpartFkField;
    const cliente_id = counterpartFk === 'cliente_id'
      ? Number(this.readRecordValue(this.record, 'cliente_id') || 0) || null
      : null;
    const fornitore_id = counterpartFk === 'fornitore_id'
      ? Number(this.readRecordValue(this.record, 'fornitore_id') || 0) || null
      : null;
    const dataDoc = this.readRecordValue(this.record, 'data_documento');

    const url = (WtoolboxService as any).appSettings.global_root_url + 'MetaService.getFlatDataFromStored';
    const body = {
      stored: 'sp_get_prezzo_listino',
      parameters: [
        { field: '@prodotto_id', operatore: 'eq', value: String(prodId), Type: 'number' },
        { field: '@cliente_id', operatore: 'eq', value: cliente_id != null ? String(cliente_id) : null, Type: 'number' },
        { field: '@fornitore_id', operatore: 'eq', value: fornitore_id != null ? String(fornitore_id) : null, Type: 'number' },
        { field: '@listino_id', operatore: 'eq', value: null, Type: 'number' },
        { field: '@data', operatore: 'eq', value: dataDoc ? this.toDateOnlyString(dataDoc) : null, Type: 'date' }
      ],
      __pageIndex: 0, __pageSize: 1, __sortField: '', __sortDir: '',
      skipExtraParams: false, noResults: false
    };
    try {
      const resp: any = await ((WtoolboxService as any).http.post(url, body).toPromise());
      const arr = (resp && (resp.results || resp.Data || resp.data || [])) || [];
      return Array.isArray(arr) && arr.length ? arr[0] : null;
    } catch (e) {
      console.warn('[DocumentEditForm] sp_get_prezzo_listino failed', e);
      return null;
    }
  }

  /** Helper: serializza Date|string in 'YYYY-MM-DD' per `@data` della SP. */
  private toDateOnlyString(v: any): string | null {
    if (v == null) return null;
    if (v instanceof Date) {
      if (Number.isNaN(v.getTime())) return null;
      const yyyy = v.getFullYear();
      const mm = String(v.getMonth() + 1).padStart(2, '0');
      const dd = String(v.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    const s = String(v);
    return s.includes('T') ? s.slice(0, 10) : s;
  }

  /** Carica una sola volta tutte le aliquote da `codici_iva` e le
   *  cache-a come Map<id, aliquota>. Usato da recalculateRow per
   *  evitare un HTTP roundtrip ogni volta che cambia un campo
   *  della riga. */
  private async loadCodiciIvaAliquote(): Promise<Map<number, number>> {
    if (this.codiciIvaAliquotaMap) return this.codiciIvaAliquotaMap;
    if (this.codiciIvaFetchInFlight) return this.codiciIvaFetchInFlight;

    const url = (WtoolboxService as any).appSettings.global_root_url + 'MetaService.getFlatRecordData';
    const body = {
      user_id: 0,
      route: 'codici_iva',
      lookup_table_id: 0,
      SortInfo: [],
      GroupInfo: [],
      PageInfo: { pageSize: 500, currentPage: 1 },
      filterInfo: { logic: 'AND', filters: [] },
      logicOperator: 'AND',
      has_server_operation: true,
      aggregates: [],
      columnRestrictionList: [],
      formula_lookup: '',
      mc_id: 0,
      routeContext: ''
    };
    this.codiciIvaFetchInFlight = (async () => {
      try {
        const resp: any = await (WtoolboxService as any).http.post(url, body).toPromise();
        const arr = (resp && (resp.results || resp.Data || resp.data || [])) || [];
        const map = new Map<number, number>();
        if (Array.isArray(arr)) {
          for (const row of arr) {
            const id = Number(row?.id);
            const aliq = Number(row?.aliquota);
            if (Number.isFinite(id) && Number.isFinite(aliq)) {
              map.set(id, aliq);
            }
          }
        }
        this.codiciIvaAliquotaMap = map;
        return map;
      } catch {
        this.codiciIvaAliquotaMap = new Map();
        return this.codiciIvaAliquotaMap;
      } finally {
        this.codiciIvaFetchInFlight = null;
      }
    })();
    return this.codiciIvaFetchInFlight;
  }

  /** Ricalcola imponibile_riga / iva_riga / totale_riga dai correnti
   *  quantita / prezzo_unitario / sconto_perc / codice_iva_id.
   *  Formula:
   *    imponibile = qty * prezzo * (1 - sconto/100)
   *    iva        = imponibile * aliquota/100
   *    totale     = imponibile + iva
   *  Aliquota letta dalla cache `codiciIvaAliquotaMap`. */
  private async recalculateRow(record: any): Promise<void> {
    if (!record) return;

    const num = (key: string): number => {
      const slot = record[key];
      const v = (slot && typeof slot === 'object' && 'value' in slot) ? slot.value : slot;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const qty = num('quantita');
    const prezzo = num('prezzo_unitario');
    const sconto = num('sconto_perc');
    const codIvaId = num('codice_iva_id');

    const imponibile = qty * prezzo * (1 - (sconto / 100));

    let aliquota = 0;
    if (codIvaId > 0) {
      const map = await this.loadCodiciIvaAliquote();
      aliquota = map.get(codIvaId) ?? 0;
    }
    const iva = imponibile * (aliquota / 100);
    const totale = imponibile + iva;

    // Round a 4 decimali per coerenza col formato delle colonne decimal.
    const r4 = (n: number) => Math.round(n * 10000) / 10000;

    this.setSlotIfPresent(record, 'imponibile_riga', r4(imponibile));
    this.setSlotIfPresent(record, 'iva_riga', r4(iva));
    this.setSlotIfPresent(record, 'totale_riga', r4(totale));

    // Dopo aver aggiornato la riga, ricalcola anche i totali del documento.
    this.recalculateMasterTotals();
  }

  /** Ricalcola i totali del documento (master record `this.record`) sommando
   *  i totali delle righe correnti in `righeDs.resultInfo.dato`.
   *  Formula:
   *    imp_pre = sum(righe.imponibile_riga)
   *    iva_pre = sum(righe.iva_riga)
   *    sconto = (sconto_globale_perc || 0) / 100
   *    imponibile_doc = imp_pre * (1 - sconto)
   *    iva_doc        = iva_pre * (1 - sconto)
   *    totale_doc     = imponibile_doc + iva_doc + (bollo_valore || 0)
   *
   *  Le colonne master `imponibile/iva/totale` sono settate `mc_logic_editable=false`
   *  in injectMetadataPatches → readonly span; vengono aggiornate via .next del BS.
   *  Per route senza `sconto_globale_perc`/`bollo_valore` (es. fatture_ricevute,
   *  preventivi) i contributi sono 0 e la formula degenera a sum diretta. Per
   *  `ddt` (senza colonne totale) il metodo e' no-op grazie a `setSlotIfPresent`. */
  private recalculateMasterTotals(): void {
    if (!this.record || !this.righeDs) return;

    const num = (rec: any, key: string): number => {
      const slot = rec?.[key];
      const v = (slot && typeof slot === 'object' && 'value' in slot) ? slot.value : slot;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    // Read row totals from righeDs.resultInfo.dato. Inline-add fix garantisce
    // dato = [] (non null) anche in Insert mode → loop sicuro. Per ogni row,
    // preferire __observable (BS map con valori live post-edit inline) se
    // presente, altrimenti row plain (post-fetch in Edit mode).
    const dato: any[] = ((this.righeDs as any)?.resultInfo?.dato as any[]) || [];
    let impSum = 0;
    let ivaSum = 0;
    for (const row of dato) {
      if (!row) continue;
      const src = row.__observable || row;
      impSum += num(src, 'imponibile_riga');
      ivaSum += num(src, 'iva_riga');
    }

    // Master adjustments (presenti solo su fatture_inviate)
    const sconto = num(this.record, 'sconto_globale_perc') / 100;
    const bollo = num(this.record, 'bollo_valore');

    const imp = impSum * (1 - sconto);
    const iva = ivaSum * (1 - sconto);
    const tot = imp + iva + bollo;

    const r2 = (n: number) => Math.round(n * 100) / 100;

    this.setSlotIfPresent(this.record, 'imponibile', r2(imp));
    this.setSlotIfPresent(this.record, 'iva', r2(iva));
    this.setSlotIfPresent(this.record, 'totale', r2(tot));
  }

  /** Read value compatibile con record plain o BehaviorSubject map. */
  private readRecordValue(record: any, key: string): any {
    if (!record) return undefined;
    const slot = record[key];
    if (slot && typeof slot === 'object' && 'value' in slot) return slot.value;
    return slot;
  }

  /** Costruisce il payload canonical per `MetaService.getFlatRecordData`
   *  (vedi data-provider-meta.service.ts:300). Usato dalla logica di
   *  importazione documento sorgente per fetchare testata + righe. */
  private buildFlatRecordPayload(route: string, filterInfo: any, pageSize: number): any {
    const userId = (WtoolboxService as any).resolveInjectorRef?.()
      ?.get?.((WtoolboxService as any).UserInfoService || 'UserInfoService', null)
      ?.getuserInfo?.()?.user_id || 0;
    return {
      user_id: userId,
      route,
      lookup_table_id: 0,
      SortInfo: [],
      GroupInfo: [],
      PageInfo: { pageSize, currentPage: 1 },
      filterInfo,
      logicOperator: 'AND',
      has_server_operation: false,
      aggregates: [],
      columnRestrictionList: [],
      formula_lookup: '',
      mc_id: 0,
      routeContext: ''
    };
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
  // 2026-05-08: rimosso il check `hasParentId` -> la nested grid righe e'
  // visibile/usabile ANCHE in fase Insert. In Insert il datasource ha
  // [autoload]=false (vedi template) cosi' niente fetch HTTP con
  // FK=null; le righe aggiunte restano in memoria come __new=true e
  // vengono persistite al batch save insieme alla testata (pattern WUIC
  // nested-entity standard).
  get showProdottiCard(): boolean {
    const idx = this.prodottiNestedIndex;
    return Number.isInteger(idx) && idx >= 0 && !!this.metaInfo?.nestedRoutes?.[idx];
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
    // Stesso pattern di showProdottiCard: nested grid sempre visibile, autoload
    // disattivato in Insert dal template.
    return Number.isInteger(idx as any) && (idx as number) >= 0 && !!this.metaInfo?.nestedRoutes?.[idx as number];
  }
  get scadenzeRoute(): string {
    return this.metaInfo?.nestedRoutes?.[this.scadenzeNestedIndex as number]?.route || '';
  }
  get showNoteCard(): boolean {
    return !!(this.noteFields && this.noteFields.length > 0);
  }
}
