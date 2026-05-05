import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnInit, ViewChild } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DataSourceComponent } from '../data-source/data-source.component';

/**
 * Cache module-scope della promise di import dinamico di `ParametricDialogComponent`.
 * Senza questa cache, ogni istanza di questo lazy wrapper chiama `import(...)` separatamente
 * (microtask + change detection extra). Con la cache, il primo arrivato innesca l'import;
 * i successivi attendono la stessa promise gia risolta.
 */
let parametricDialogComponentPromise: Promise<any> | null = null;

@Component({
  selector: 'wuic-parametric-dialog-lazy',
  standalone: true,
  imports: [NgComponentOutlet],
  styles: [`
    :host {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      max-height: 100%;
      overflow: hidden;
    }
  `],
  template: `
    @if (loadedComponent) {
      <ng-container *ngComponentOutlet="loadedComponent; inputs: componentInputs()" />
    }
  `
})
export class LazyParametricDialogComponent implements OnInit {
  @ViewChild(NgComponentOutlet) innerOutlet?: NgComponentOutlet;
  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource: BehaviorSubject<DataSourceComponent>;
  /**
   * Input dal componente padre per hardcoded datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedDatasource: DataSourceComponent;
  /**
   * Input dal componente padre per hide toolbar; inoltrato al componente reale.
   */
  @Input() hideToolbar: boolean = false;
  /**
   * Input dal componente padre per is wizard; inoltrato al componente reale.
   */
  @Input() isWizard: boolean = false;

  /**
   * Input dal componente padre per is edit form; usata nella configurazione e nel rendering del componente.
   */
  @Input() isEditForm: boolean = false;
  /**
   * Input dal componente padre per readOnly; inoltrato al componente reale.
   */
  @Input() readOnly: boolean = false;

  /**
   * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
   */
  loadedComponent: any = null;

  constructor(private readonly cdr: ChangeDetectorRef) { }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  async ngOnInit(): Promise<void> {
    parametricDialogComponentPromise ??= import('./parametric-dialog.component').then((m) => m.ParametricDialogComponent);
    this.loadedComponent = await parametricDialogComponentPromise;
    // Vedi spreadsheet-list-sf.lazy.component per il motivo del markForCheck:
    // promise cached → await sincrono → CD non triggerato su ancestor OnPush.
    this.cdr.markForCheck();
  }

  /**
* Gestisce la logica di `componentInputs` con il flusso specifico definito dalla sua implementazione.
* @returns Oggetto risultato costruito dal metodo per il passo successivo del flusso.
*/
  componentInputs() {
    return {
      datasource: this.datasource,
      hardcodedDatasource: this.hardcodedDatasource,
      hideToolbar: this.hideToolbar,
      isWizard: this.isWizard,
      isEditForm: this.isEditForm,
      readOnly: this.readOnly
    };
  }
}
