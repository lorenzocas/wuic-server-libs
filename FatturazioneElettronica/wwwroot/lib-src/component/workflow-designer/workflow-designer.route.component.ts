import { NgComponentOutlet } from '@angular/common';
import { Component, OnInit } from '@angular/core';

/**
 * Cache module-scope della promise di import dinamico di `WorkflowDesignerComponent`.
 * Senza questa cache, ogni istanza di questo lazy wrapper chiama `import(...)` separatamente
 * (microtask + change detection extra). Con la cache, il primo arrivato innesca l'import;
 * i successivi attendono la stessa promise gia risolta.
 */
let workflowDesignerComponentPromise: Promise<any> | null = null;

@Component({
  selector: 'wuic-workflow-designer-route',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @if (loadedComponent) {
      <ng-container *ngComponentOutlet="loadedComponent" />
    }
  `
})
export class WorkflowDesignerRouteComponent implements OnInit {
  /**
   * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
   */
  loadedComponent: any = null;

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  async ngOnInit(): Promise<void> {
    workflowDesignerComponentPromise ??= import('./workflow-designer.component').then((m) => m.WorkflowDesignerComponent);
    this.loadedComponent = await workflowDesignerComponentPromise;
  }
}


