import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnInit  } from '@angular/core';

/**
 * Cache module-scope della promise di import dinamico di `ImageWrapperComponent`.
 * Senza questa cache, ogni istanza di questo lazy wrapper chiama `import(...)` separatamente
 * (microtask + change detection extra). Con la cache, il primo arrivato innesca l'import;
 * i successivi attendono la stessa promise gia risolta.
 */
let imageWrapperComponentPromise: Promise<any> | null = null;

@Component({
  selector: 'wuic-image-wrapper-lazy',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @if (loadedComponent) {
      <ng-container *ngComponentOutlet="loadedComponent; inputs: componentInputs()" />
    }
  `
})
export class LazyImageWrapperComponent implements OnInit {
  /**
   * Input dal componente padre per src; usata nella configurazione e nel rendering del componente.
   */
  @Input() src: string;
  /**
   * Input dal componente padre per preview image src; usata nella configurazione e nel rendering del componente.
   */
  @Input() previewImageSrc: string;
  /**
   * Input dal componente padre per append to; usata nella configurazione e nel rendering del componente.
   */
  @Input() appendTo: any;
  /**
   * Input dal componente padre per alt; usata nella configurazione e nel rendering del componente.
   */
  @Input() alt: string;
  /**
   * Input dal componente padre per width; usata nella configurazione e nel rendering del componente.
   */
  @Input() width: string;
  /**
   * Input dal componente padre per height; usata nella configurazione e nel rendering del componente.
   */
  @Input() height: string;
  /**
   * Input dal componente padre per style; usata nella configurazione e nel rendering del componente.
   */
  @Input() style: string;
  /**
   * Input dal componente padre per style class; usata nella configurazione e nel rendering del componente.
   */
  @Input() styleClass: string;
  /**
   * Input dal componente padre per preview; usata nella configurazione e nel rendering del componente.
   */
  @Input() preview: boolean;

  /**
   * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
   */
  loadedComponent: any = null;


  constructor(private readonly cdr: ChangeDetectorRef) { }
  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  async ngOnInit(): Promise<void> {
    imageWrapperComponentPromise ??= import('./image-wrapper.component').then((m) => m.ImageWrapperComponent);
    this.loadedComponent = await imageWrapperComponentPromise;
    this.cdr.markForCheck();
  }

          /**
   * Gestisce la logica di `componentInputs` con il flusso specifico definito dalla sua implementazione.
   * @returns Oggetto risultato costruito dal metodo per il passo successivo del flusso.
   */
  componentInputs() {
    return {
      src: this.src,
      previewImageSrc: this.previewImageSrc,
      appendTo: this.appendTo,
      alt: this.alt,
      width: this.width,
      height: this.height,
      style: this.style,
      styleClass: this.styleClass,
      preview: this.preview
    };
  }
}


