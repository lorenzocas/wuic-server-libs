import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnInit  } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MetaInfo } from '../../class/metaInfo';

/**
 * Cache module-scope della promise di import dinamico di `DataActionButtonComponent`.
 * Senza questa cache, ogni istanza di questo lazy wrapper chiama `import(...)` separatamente
 * (microtask + change detection extra). Con la cache, il primo arrivato innesca l'import;
 * i successivi attendono la stessa promise gia risolta.
 */
let dataActionButtonComponentPromise: Promise<any> | null = null;

@Component({
  selector: 'wuic-data-action-button-lazy',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @if (loadedComponent) {
      <ng-container *ngComponentOutlet="loadedComponent; inputs: componentInputs()" />
    } @else {
      <!-- Placeholder con la stessa dimensione del p-splitButton reale.
           Senza questo, fino a quando il dynamic import non completa, l'host
           e' collassato a 0px → quando il componente vero monta, la cell <td>
           sticky-frozen che lo contiene si espande di colpo causando reflow
           delle frozen successive (City Name viene "spinta" o tagliata).
           Il placeholder mantiene la cell stabile dal primo paint. -->
      <span class="wuic-action-btn-placeholder" aria-hidden="true"></span>
    }
  `,
  styles: [`
    :host {
      /* Pre-alloc dimensioni equivalenti al p-splitButton del componente
         reale (icon + dropdown chevron). Evita reflow random al primo lazy
         load nelle list-grid: la cell <td> sticky-frozen ha gia' la width
         corretta, le frozen successive (es. City Name) non vengono spostate.
         Width 48px: il p-splitButton icon-only e' ~42px (misurato runtime),
         48px coprono il button + breathing margin. La cell parent
         (list-grid: td.wuic-action-cell, 64px box-sizing border-box) ha
         padding ~3.2px ovvero content area 57.6px → 48px ci stanno comodi
         con 4-5px di margine per lato → centratura pixel-perfect orizzontale. */
      display: inline-block;
      min-width: 48px;
      min-height: 1.85rem;
      vertical-align: middle;
    }
    .wuic-action-btn-placeholder {
      display: inline-block;
      width: 48px;
      height: 1.85rem;
    }
  `]
})
export class LazyDataActionButtonComponent implements OnInit {
  /**
   * Input dal componente padre per data; usata nella configurazione e nel rendering del componente.
   */
  @Input() data: any;
  /**
   * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() metaInfo: MetaInfo;
  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource: BehaviorSubject<any>;
  /**
   * Input dal componente padre per filter; usata nella configurazione e nel rendering del componente.
   */
  @Input() filter?: () => void;
  /**
   * Input dal componente padre per simplified; usata nella configurazione e nel rendering del componente.
   */
  @Input() simplified: boolean = false;

  @Input() parentField: string;

  /**
   * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
   */
  loadedComponent: any = null;


  constructor(private readonly cdr: ChangeDetectorRef) { }
  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  async ngOnInit(): Promise<void> {
    dataActionButtonComponentPromise ??= import('./data-action-button.component').then((m) => m.DataActionButtonComponent);
    this.loadedComponent = await dataActionButtonComponentPromise;
    this.cdr.markForCheck();
  }

  /**
* Gestisce la logica di `componentInputs` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
* @returns Oggetto risultato costruito dal metodo per il passo successivo del flusso.
*/
  componentInputs() {
    return {
      data: this.data,
      metaInfo: this.metaInfo,
      datasource: this.datasource,
      filter: this.filter,
      simplified: this.simplified,
      parentField: this.parentField
    };
  }
}


