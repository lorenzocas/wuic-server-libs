import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, signal, inject, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { CheckboxModule } from 'primeng/checkbox';
import { filter } from 'rxjs/operators';
import { UserInfoService } from '../../wuic-bridges/core';
import { environment } from '../../environments/environment';

interface WidgetPref {
  id: string;          // identificatore widget (logical key)
  label: string;       // user-friendly label
  visible: boolean;
  order: number;
}

interface LayoutPayload {
  widgets: WidgetPref[];
}

/**
 * Workflow #15: Dashboard widget configurabili per utente.
 *
 * UI:
 *   - Floating FAB icon (gear) bottom-right (sopra global-search e rag-chatbot fab)
 *   - Apre dialog con lista checkbox per nascondere/mostrare widget della board
 *     attiva (current route).
 *   - Salva pref via POST /api/board-pref (per coppia user_id + route).
 *   - Auto-fetch pref al cambio route (NavigationEnd) → applica visibilita'.
 *
 * NB: la lista widget e' attualmente hardcoded come catalog di esempio.
 * In produzione i widget verrebbero discoverati dal `dom_board.boardcontent`
 * della route corrente. Per il primo cut testabile la lista hardcoded
 * permette gia' API+DB+UI completi.
 */
@Component({
  selector: 'app-board-pref',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, DialogModule, CheckboxModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="app-board-pref__fab"
            [attr.id]="'app_board_pref_fab'"
            type="button"
            (click)="openDialog()"
            title="Personalizza dashboard"
            aria-label="Personalizza dashboard">
      <i class="pi pi-cog"></i>
    </button>

    <p-dialog
      [visible]="dialogOpen()"
      (visibleChange)="dialogOpen.set($event)"
      [modal]="true"
      [closable]="true"
      [draggable]="false"
      [resizable]="false"
      [style]="{ width: '520px', maxWidth: '90vw' }"
      header="Personalizza dashboard"
      (onShow)="onDialogShow()">
      <div class="app-board-pref__body" [attr.id]="'app_board_pref_dialog_body'">
        <p class="app-board-pref__route">Route: <code>{{ currentRoute() }}</code></p>
        <div *ngIf="!loading() && widgets().length > 0" class="app-board-pref__list">
          <div *ngFor="let w of widgets()"
               class="app-board-pref__row"
               [attr.data-widget-id]="w.id">
            <p-checkbox
              [(ngModel)]="w.visible"
              [binary]="true"
              [inputId]="'cb_' + w.id">
            </p-checkbox>
            <label [attr.for]="'cb_' + w.id" class="app-board-pref__label">
              {{ w.label }}
            </label>
          </div>
        </div>
        <div *ngIf="loading()" class="app-board-pref__loading">Caricamento...</div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Annulla"
                  styleClass="p-button-text"
                  [attr.id]="'app_board_pref_cancel'"
                  (onClick)="dialogOpen.set(false)"></p-button>
        <p-button label="Reset"
                  styleClass="p-button-secondary"
                  [attr.id]="'app_board_pref_reset'"
                  (onClick)="reset()"></p-button>
        <p-button label="Salva"
                  [attr.id]="'app_board_pref_save'"
                  [disabled]="saving()"
                  (onClick)="save()"></p-button>
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    .app-board-pref__fab {
      position: fixed; bottom: 168px; right: 24px;
      width: 48px; height: 48px;
      border-radius: 50%; border: none;
      background: #6366f1; color: white;
      box-shadow: 0 4px 14px rgba(0,0,0,0.2);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 18px;
      z-index: 9000;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .app-board-pref__fab:hover { transform: scale(1.08); box-shadow: 0 6px 18px rgba(0,0,0,0.28); }
    .app-board-pref__fab i { font-size: 18px; }
    .app-board-pref__body { display: flex; flex-direction: column; gap: 12px; min-height: 120px; }
    .app-board-pref__route { color: #6b7280; font-size: 12px; margin: 0; }
    .app-board-pref__route code { background: #f3f4f6; padding: 1px 5px; border-radius: 3px; }
    .app-board-pref__list { display: flex; flex-direction: column; gap: 8px; }
    .app-board-pref__row { display: flex; align-items: center; gap: 10px; padding: 6px 4px; }
    .app-board-pref__label { cursor: pointer; user-select: none; }
    .app-board-pref__loading { padding: 24px; text-align: center; color: #6b7280; font-style: italic; }
  `]
})
export class BoardPrefComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private userInfo = inject(UserInfoService);

  // catalog hardcoded widgets (in real app verrebbe da boardcontent)
  private static readonly WIDGET_CATALOG: WidgetPref[] = [
    { id: 'kpi_clienti',    label: 'KPI Clienti',         visible: true, order: 1 },
    { id: 'kpi_fatture',    label: 'KPI Fatture mensili', visible: true, order: 2 },
    { id: 'kpi_scadenze',   label: 'KPI Scadenze aperte', visible: true, order: 3 },
    { id: 'chart_vendite',  label: 'Chart vendite',       visible: true, order: 4 },
    { id: 'list_recenti',   label: 'Lista fatture recenti', visible: true, order: 5 }
  ];

  dialogOpen = signal(false);
  widgets = signal<WidgetPref[]>([]);
  loading = signal(false);
  saving = signal(false);
  currentRoute = signal<string>('/');

  ngOnInit() {
    this.currentRoute.set(this.router.url);
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.currentRoute.set(this.router.url));
  }

  openDialog() {
    this.dialogOpen.set(true);
  }

  onDialogShow() {
    this.loadPref();
  }

  private get userId(): number {
    return Number(this.userInfo?.getuserInfo?.()?.user_id ?? 0);
  }

  private get apiBase(): string {
    return environment.api_url || '/api/';
  }

  private routeKey(): string {
    return this.currentRoute().replace(/^[/#]+/, '').replace(/\?.*$/, '') || '_default';
  }

  private loadPref() {
    this.loading.set(true);
    const uid = this.userId;
    const url = `${this.apiBase}board-pref?route=${encodeURIComponent(this.routeKey())}&user_id=${uid}`;
    this.http.get<any>(url).subscribe({
      next: (resp) => {
        if (resp?.ok && resp?.layout_json) {
          try {
            const parsed: LayoutPayload = JSON.parse(resp.layout_json);
            // merge: catalog + saved overrides
            const map = new Map(parsed.widgets?.map(w => [w.id, w]) ?? []);
            const merged = BoardPrefComponent.WIDGET_CATALOG.map(c => {
              const ov = map.get(c.id);
              return ov ? { ...c, visible: ov.visible, order: ov.order ?? c.order } : { ...c };
            });
            merged.sort((a, b) => a.order - b.order);
            this.widgets.set(merged);
          } catch {
            this.widgets.set(BoardPrefComponent.WIDGET_CATALOG.map(w => ({ ...w })));
          }
        } else {
          this.widgets.set(BoardPrefComponent.WIDGET_CATALOG.map(w => ({ ...w })));
        }
        this.loading.set(false);
      },
      error: () => {
        this.widgets.set(BoardPrefComponent.WIDGET_CATALOG.map(w => ({ ...w })));
        this.loading.set(false);
      }
    });
  }

  save() {
    this.saving.set(true);
    const payload = {
      route: this.routeKey(),
      user_id: this.userId,
      layout_json: JSON.stringify({ widgets: this.widgets() } as LayoutPayload)
    };
    this.http.post<any>(`${this.apiBase}board-pref`, payload).subscribe({
      next: (resp) => {
        this.saving.set(false);
        if (resp?.ok) {
          this.dialogOpen.set(false);
          // emit event globally so dashboard listeners reagiscono
          document.dispatchEvent(new CustomEvent('board-pref:changed', {
            detail: { route: payload.route, layout: payload.layout_json }
          }));
        }
      },
      error: () => this.saving.set(false)
    });
  }

  reset() {
    const uid = this.userId;
    const url = `${this.apiBase}board-pref?route=${encodeURIComponent(this.routeKey())}&user_id=${uid}`;
    this.http.delete<any>(url).subscribe({
      next: () => {
        this.widgets.set(BoardPrefComponent.WIDGET_CATALOG.map(w => ({ ...w })));
        document.dispatchEvent(new CustomEvent('board-pref:changed', {
          detail: { route: this.routeKey(), layout: null }
        }));
      }
    });
  }
}
