import { NgComponentOutlet } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';

/**
 * Cache module-scope della promise di import dinamico di `DesignerComponent`.
 * Senza questa cache, ogni istanza di questo lazy wrapper chiama `import(...)` separatamente
 * (microtask + change detection extra). Con la cache, il primo arrivato innesca l'import;
 * i successivi attendono la stessa promise gia risolta.
 */
let designerComponentPromise: Promise<any> | null = null;

@Component({
  selector: 'wuic-designer-route',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @if (loadedComponent) {
      <ng-container *ngComponentOutlet="loadedComponent" />
    }
  `
})
export class DesignerRouteComponent implements OnInit {
  @ViewChild(NgComponentOutlet) private outlet?: NgComponentOutlet;
  /**
   * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
   */
  loadedComponent: any = null;

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  async ngOnInit(): Promise<void> {
    designerComponentPromise ??= import('./designer.component').then((m) => m.DesignerComponent);
    this.loadedComponent = await designerComponentPromise;
  }

  /**
   * Delega al componente designer runtime la conferma navigazione con pending changes.
   */
  async confirmNavigationWithPendingChanges(): Promise<boolean> {
    const instance: any = this.outlet?.componentInstance;
    if (!instance || typeof instance.confirmNavigationWithPendingChanges !== 'function') {
      return true;
    }

    return await instance.confirmNavigationWithPendingChanges();
  }
}


