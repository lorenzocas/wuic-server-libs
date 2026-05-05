import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit  } from '@angular/core';

/**
 * Cache module-scope della promise di import dinamico di `MetaMenuComponent`.
 * Senza questa cache, ogni istanza di questo lazy wrapper chiama `import(...)` separatamente
 * (microtask + change detection extra). Con la cache, il primo arrivato innesca l'import;
 * i successivi attendono la stessa promise gia risolta.
 */
let metaMenuComponentPromise: Promise<any> | null = null;

@Component({
  selector: 'wuic-meta-menu-lazy',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @if (loadedComponent) {
      <ng-container *ngComponentOutlet="loadedComponent" />
    }
  `
})
export class LazyMetaMenuComponent implements OnInit {
  /**
   * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
   */
  loadedComponent: any = null;


  constructor(private readonly cdr: ChangeDetectorRef) { }
  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  async ngOnInit(): Promise<void> {
    metaMenuComponentPromise ??= import('./meta-menu.component').then((m) => m.MetaMenuComponent);
    this.loadedComponent = await metaMenuComponentPromise;
    this.cdr.markForCheck();
  }
}


