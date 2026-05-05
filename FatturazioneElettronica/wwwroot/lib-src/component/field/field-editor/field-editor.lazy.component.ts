import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnInit  } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { MetaInfo } from '../../../class/metaInfo';

/**
 * Cache module-scope della promise di import dinamico di `FieldEditorComponent`.
 * Senza questa cache, ogni istanza di `LazyFieldEditorComponent` chiama `import(...)` separatamente:
 * con 11+ campi in un dialog di edit, ne risultano 11+ microtask consecutive che frammentano la
 * change detection di Angular e amplificano i long task (vedi analisi LoAF su /cities/list -> "Modifica":
 * 2 frame da 111ms + 102ms in cui il 90% del tempo era 11x `import.then` resolve callback dello stesso chunk).
 * Con la cache, il primo arrivato innesca l'import; gli altri attendono la stessa promise gia risolta
 * e completano sincronicamente nella stessa microtask.
 */
let fieldEditorComponentPromise: Promise<any> | null = null;

@Component({
  selector: 'wuic-field-editor-lazy',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @if (loadedComponent) {
      <ng-container *ngComponentOutlet="loadedComponent; inputs: componentInputs()" />
    } @else {
      <div class="wuic-field-editor-skeleton" [style.min-height.px]="placeholderHeight()" aria-hidden="true"></div>
    }
  `,
  styles: [`
    :host { display: block; }
    .wuic-field-editor-skeleton {
      display: block;
      width: 100%;
      box-sizing: border-box;
      /* deliberatamente trasparente: non vogliamo flash di colore mentre il field carica,
         solo riservare lo spazio per evitare CLS quando i field si materializzano */
      background: transparent;
    }
  `]
})
export class LazyFieldEditorComponent implements OnInit {
  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource?: any;
  /**
   * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
   */
  @Input() record?: any;
  /**
   * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
   */
  @Input() field: MetadatiColonna;
  /**
   * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() metaInfo: MetaInfo;
  /**
   * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
   */
  @Input() readOnly?: boolean;
  /**
   * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
   */
  @Input() isFilter?: boolean;
  /**
   * Input dal componente padre per hide label; usata nella configurazione e nel rendering del componente.
   */
  @Input() hideLabel?: boolean;
  /**
   * Input dal componente padre per force show label; usata nella configurazione e nel rendering del componente.
   */
  @Input() forceShowLabel?: boolean;
  /**
   * Input dal componente padre per operator; usata nella configurazione e nel rendering del componente.
   */
  @Input() operator: string;
  /**
   * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
   */
  @Input() nestedIndex: number;
  /**
   * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
   */
  @Input() triggerProp: BehaviorSubject<any>;
  /**
   * Tabindex assegnato dinamicamente dal parent in base all'ordine campi del form.
   */
  @Input() tabIndex?: number;
  /**
   * Callback opzionale per autosave inline-cell-editing in contesto grid.
   */
  @Input() onInlineCellValueChange?: (rowData: any, metaColumn: MetadatiColonna) => void;

  /**
   * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
   */
  loadedComponent: any = null;


  constructor(private readonly cdr: ChangeDetectorRef) { }
  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  async ngOnInit(): Promise<void> {
    fieldEditorComponentPromise ??= import('./field-editor.component').then((m) => m.FieldEditorComponent);
    this.loadedComponent = await fieldEditorComponentPromise;
    this.cdr.markForCheck();
  }

  /**
   * Stima dell'altezza del field per il placeholder durante il caricamento async, in pixel.
   * Riserva lo spazio del field nel layout *prima* che `FieldEditorComponent` sia caricato:
   * cosi quando il componente reale si materializza non sposta i field vicini (no CLS).
   *
   * Priorita: `field.mc_ui_size_height` (override esplicito da metadata) > stima per widget type
   * > default 56px (label ~20 + input ~32 + spacing ~4). Le stime per widget alti (textarea,
   * dictionary, html-editor, code-area) sono volutamente conservative: meglio sovrastimare
   * (un piccolo gap che si chiude) che sottostimare (i field saltano in alto quando caricano).
   */
  protected placeholderHeight(): number {
    const raw = this.field?.mc_ui_size_height;
    const explicit = raw != null && raw !== '' ? Number(raw) : NaN;
    if (Number.isFinite(explicit) && explicit > 0) {
      return explicit;
    }
    const widgetType = this.field?.mc_ui_column_type;
    switch (widgetType) {
      case 'textarea': return 100;
      case 'html-editor': return 200;
      case 'code-area': return 200;
      case 'dictionary': return 120;
      case 'multiple_check': return 120;
      case 'tree-view-selector': return 200;
      case 'property-array': return 150;
      case 'property-object': return 150;
      case 'upload': return 80;
      case 'boolean': return 32;
      default: return 56;
    }
  }

          /**
   * Gestisce la logica di `componentInputs` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
   * @returns Oggetto risultato costruito dal metodo per il passo successivo del flusso.
   */
  componentInputs() {
    return {
      datasource: this.datasource,
      record: this.record,
      field: this.field,
      metaInfo: this.metaInfo,
      readOnly: this.readOnly,
      isFilter: this.isFilter,
      hideLabel: this.hideLabel,
      forceShowLabel: this.forceShowLabel,
      operator: this.operator,
      nestedIndex: this.nestedIndex,
      triggerProp: this.triggerProp,
      tabIndex: this.tabIndex,
      onInlineCellValueChange: this.onInlineCellValueChange
    };
  }
}


