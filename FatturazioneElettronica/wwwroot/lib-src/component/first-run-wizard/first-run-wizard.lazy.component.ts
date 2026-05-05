import {
  ChangeDetectorRef,
  Component,
  ComponentRef,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  ViewContainerRef
} from '@angular/core';
import { Subscription } from 'rxjs';

/**
 * Cache module-scope della promise di import dinamico di `WuicFirstRunWizardComponent`.
 * Senza questa cache, ogni istanza di questo lazy wrapper chiama `import(...)`
 * separatamente (microtask + change detection extra). Con la cache, il primo
 * arrivato innesca l'import; i successivi attendono la stessa promise gia' risolta.
 *
 * Razionale per il lazy load del firstRun wizard:
 *   - il componente trasporta ~870 LOC TS + 320 HTML + 280 SCSS + 5 lingue di
 *     traduzioni hardcoded (~12 KB minified gzip stimato): non serve nel bundle
 *     iniziale di tutti i deploy gia' installati;
 *   - dopo il completamento del firstRun (appsettings.firstRun=false) NON
 *     verra' MAI renderizzato — chunk separato = code split del 100% di quel
 *     payload per il caso normale "app gia' configurata" (la maggioranza dei
 *     pageload in produzione);
 *   - su deploy fresh il chunk si scarica al primo pageload (~150ms su rete
 *     buona), gestito dal lazy wrapper che mostra null finche' il componente
 *     reale non e' pronto (overlay = blank background) — overhead percettivo
 *     trascurabile rispetto all'install che dura minuti.
 *
 * NOTA refactor 2026-04-26: nato come `*ngComponentOutlet` con binding
 * `outputs: { complete: ... }`, ma quel binding NON esiste sulla direttiva
 * `NgComponentOutlet` (solo `inputs:` esiste, dal 16.2). Sostituito con
 * `ViewContainerRef.createComponent()` + subscribe manuale al `complete`
 * EventEmitter dell'instance — pattern Angular standard per dynamic component
 * con output forwarding.
 */
let firstRunWizardComponentPromise: Promise<any> | null = null;

@Component({
  selector: 'wuic-first-run-wizard',
  standalone: true,
  imports: [],
  template: `<ng-container #vcr></ng-container>`
})
export class LazyFirstRunWizardComponent implements OnInit, OnDestroy {
  /**
   * Mirror dell'output `(complete)` del componente reale. Il consumer si lega a
   * <wuic-first-run-wizard (complete)="..."> sul wrapper lazy senza sapere che
   * sotto c'e' un dynamic import. La forwarding e' fatta in ngOnInit:
   * subscribe al `complete` dell'instance reale dopo `createComponent()`.
   */
  @Output() complete = new EventEmitter<void>();

  @ViewChild('vcr', { read: ViewContainerRef, static: true }) vcr!: ViewContainerRef;

  private componentRef: ComponentRef<any> | null = null;
  private completeSub: Subscription | null = null;

  constructor(private readonly cdr: ChangeDetectorRef) { }

  async ngOnInit(): Promise<void> {
    firstRunWizardComponentPromise ??= import('./first-run-wizard.component').then((m) => m.WuicFirstRunWizardComponent);
    const componentClass = await firstRunWizardComponentPromise;
    this.componentRef = this.vcr.createComponent(componentClass);
    // Forward output del componente reale al wrapper. Type assertion necessaria
    // perche' `componentClass` e' tipato `any` (dynamic import) — ma sappiamo per
    // contratto che `WuicFirstRunWizardComponent` espone `complete: EventEmitter<void>`.
    const instance = this.componentRef.instance as { complete?: EventEmitter<void> };
    if (instance.complete && typeof instance.complete.subscribe === 'function') {
      this.completeSub = instance.complete.subscribe(() => this.complete.emit());
    }
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.completeSub?.unsubscribe();
    this.componentRef?.destroy();
  }
}
