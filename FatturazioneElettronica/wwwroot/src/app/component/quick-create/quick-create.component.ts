import { CommonModule } from '@angular/common';
import { Component, signal, inject, ChangeDetectionStrategy, HostListener, Input } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

interface QuickEntity {
  key: string;
  label: string;
  route: string;
  icon: string;
  color: string;
}

/**
 * Workflow #16: quick-create modal — apre dialog "Crea nuovo" con scelta tipo
 * entita' e naviga al list (con query param `?quickCreate=1`).
 *
 * Trigger:
 *   - Click sul button "+" nell'header (renderizzato dal parent in app.component.html)
 *   - Shortcut Alt+N (Ctrl+N e' rubato dal browser per "nuova finestra")
 *   - Esposto via @ViewChild in AppComponent → openDialog() pubblica
 *
 * Le entita' sono configurate hardcoded (4 tipi: cliente / fornitore /
 * fattura inviata / preventivo). In una iterazione futura potrebbero arrivare
 * da metadata `_metadati__tabelle` filtrate per `mdshowinquickcreate=1`.
 */
@Component({
  selector: 'app-quick-create',
  standalone: true,
  imports: [CommonModule, DialogModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [visible]="dialogOpen()"
      (visibleChange)="dialogOpen.set($event)"
      [modal]="true"
      [closable]="true"
      [draggable]="false"
      [resizable]="false"
      [style]="{ width: '480px', maxWidth: '92vw' }"
      header="Crea nuovo"
      [attr.id]="'app_quick_create_dialog'">
      <div class="app-quick-create__body" [attr.id]="'app_quick_create_body'">
        <p class="app-quick-create__hint">
          Scegli il tipo di record da creare. Verrai portato sulla relativa lista.
        </p>
        <div class="app-quick-create__grid">
          <button *ngFor="let e of entities"
                  type="button"
                  class="app-quick-create__btn"
                  [attr.id]="'qc_btn_' + e.key"
                  [attr.data-entity]="e.key"
                  [attr.data-route]="e.route"
                  (click)="pick(e)">
            <i [class]="'pi ' + e.icon" [style.color]="e.color" style="font-size:28px;"></i>
            <span class="app-quick-create__btn-label">{{ e.label }}</span>
          </button>
        </div>
        <div class="app-quick-create__shortcut">
          <kbd>Alt</kbd>+<kbd>N</kbd> apre/chiude • <kbd>Esc</kbd> chiude
        </div>
      </div>
    </p-dialog>
  `,
  styles: [`
    .app-quick-create__body { display: flex; flex-direction: column; gap: 14px; }
    .app-quick-create__hint { margin: 0; color: #6b7280; font-size: 13px; }
    .app-quick-create__grid {
      display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;
    }
    .app-quick-create__btn {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; padding: 18px 8px;
      border: 1px solid #e5e7eb; border-radius: 8px;
      background: white; cursor: pointer;
      transition: transform .12s, box-shadow .12s, border-color .12s;
    }
    .app-quick-create__btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 14px rgba(0,0,0,0.10);
      border-color: #c7d2fe;
    }
    .app-quick-create__btn-label { font-weight: 600; color: #0f172a; font-size: 14px; }
    .app-quick-create__shortcut {
      font-size: 11px; color: #9ca3af; text-align: center;
    }
    .app-quick-create__shortcut kbd {
      background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 3px;
      padding: 1px 5px; font-family: monospace; font-size: 10px;
    }
  `]
})
export class QuickCreateComponent {
  private router = inject(Router);

  /** Catalog hardcoded: 4 entita' principali della FE */
  readonly entities: QuickEntity[] = [
    { key: 'cliente',    label: 'Cliente',          route: 'clienti',           icon: 'pi-user',          color: '#3b82f6' },
    { key: 'fornitore',  label: 'Fornitore',        route: 'fornitori',         icon: 'pi-building',      color: '#10b981' },
    { key: 'fattura',    label: 'Fattura inviata',  route: 'fatture_inviate',   icon: 'pi-file-edit',     color: '#f59e0b' },
    { key: 'preventivo', label: 'Preventivo',       route: 'preventivi',        icon: 'pi-file',          color: '#8b5cf6' }
  ];

  dialogOpen = signal(false);

  openDialog() { this.dialogOpen.set(true); }
  closeDialog() { this.dialogOpen.set(false); }

  pick(e: QuickEntity) {
    this.closeDialog();
    // Naviga alla list con query param che la list-grid puo' usare per auto-open add (futuro).
    // Per ora il solo effetto e' la navigazione alla route corretta.
    this.router.navigateByUrl(`/${e.route}/list?quickCreate=1`);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent) {
    // Alt+N apre/chiude (Ctrl+N e' rubato dal browser per "new window")
    if (ev.altKey && !ev.ctrlKey && !ev.metaKey && ev.key.toLowerCase() === 'n') {
      ev.preventDefault();
      if (this.dialogOpen()) this.closeDialog();
      else this.openDialog();
    }
  }
}
