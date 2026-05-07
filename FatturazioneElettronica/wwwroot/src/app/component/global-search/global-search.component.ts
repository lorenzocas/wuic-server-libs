import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, signal, inject, ChangeDetectionStrategy, HostListener, ViewChild, ElementRef, AfterViewChecked, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../environments/environment';

interface SearchResult {
  entity_type: string;
  id: number;
  primary_label: string;
  secondary_label: string;
  route: string;
  score: number;
}

/**
 * Workflow #12: search globale cross-route + #16 Ctrl+K command palette.
 *
 * UI:
 *   - Floating icon button (bottom-right corner, accanto al rag-chatbot fab)
 *   - Apre dialog modale (PrimeNG p-dialog) con input + lista risultati
 *   - Shortcut Ctrl+K / Cmd+K apre/chiude il palette
 *   - Esc chiude
 *
 * NON e' inserito nell'header per non rubare spazio al menu metadata-driven.
 */
@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [CommonModule, FormsModule, InputTextModule, DialogModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Floating trigger button (icon-only) bottom-right.
         Visibile SOLO se [showFab]=true (default false post Workflow #15:
         il button trigger viene renderizzato dal parent in header). -->
    <button *ngIf="showFab" class="app-global-search__fab"
            [attr.id]="'app_global_search_fab'"
            type="button"
            (click)="openPalette()"
            title="Cerca (Ctrl+K)"
            aria-label="Cerca globale">
      <i class="pi pi-search"></i>
    </button>

    <!-- Dialog command palette -->
    <p-dialog
      [(visible)]="paletteOpenSig"
      [modal]="true"
      [closable]="true"
      [draggable]="false"
      [resizable]="false"
      [style]="{ width: '640px', maxWidth: '90vw' }"
      header="Cerca clienti, fatture, preventivi..."
      (onShow)="onDialogShow()"
      (onHide)="onDialogHide()">
      <div class="app-global-search__palette">
        <input #paletteInput pInputText
          [attr.id]="'app_global_search_input'"
          type="text"
          [ngModel]="query()"
          (ngModelChange)="onInput($event)"
          placeholder="Cerca..."
          class="app-global-search__input"
          autocomplete="off" />
        <div class="app-global-search__results" *ngIf="results().length > 0">
          <div *ngFor="let r of results()"
               class="app-global-search__item"
               [attr.data-entity]="r.entity_type"
               [attr.data-id]="r.id"
               (click)="onPick(r)">
            <span class="app-global-search__type">{{ r.entity_type }}</span>
            <span class="app-global-search__label">{{ r.primary_label }}</span>
            <span class="app-global-search__sec">{{ r.secondary_label }}</span>
          </div>
        </div>
        <div *ngIf="results().length === 0 && query().length >= 2 && !loading()"
             class="app-global-search__empty">Nessun risultato per "{{ query() }}"</div>
        <div class="app-global-search__hint">
          <kbd>Ctrl</kbd>+<kbd>K</kbd> apre/chiude • <kbd>Esc</kbd> chiude
        </div>
      </div>
    </p-dialog>
  `,
  styles: [`
    .app-global-search__fab {
      position: fixed; bottom: 96px; right: 24px;
      width: 48px; height: 48px;
      border-radius: 50%; border: none;
      background: var(--p-primary-color, #3b82f6); color: white;
      box-shadow: 0 4px 14px rgba(0,0,0,0.2);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 18px;
      z-index: 9000;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .app-global-search__fab:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 18px rgba(0,0,0,0.28);
    }
    .app-global-search__fab i { font-size: 18px; }

    .app-global-search__palette { display: flex; flex-direction: column; gap: 12px; }
    .app-global-search__input { width: 100%; font-size: 16px; padding: 10px 14px; }
    .app-global-search__results {
      max-height: 360px; overflow-y: auto;
      border: 1px solid #e5e7eb; border-radius: 4px;
    }
    .app-global-search__item {
      padding: 10px 14px; cursor: pointer; display: grid;
      grid-template-columns: 110px minmax(0, 1fr); gap: 10px; align-items: baseline;
      border-bottom: 1px solid #f3f4f6;
    }
    .app-global-search__item:last-child { border-bottom: none; }
    .app-global-search__item:hover { background: #f0f7ff; }
    .app-global-search__type {
      font-size: 11px; text-transform: uppercase; color: #6b7280;
      letter-spacing: 0.04em; font-weight: 500;
    }
    .app-global-search__label {
      font-weight: 600; color: #0f172a;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .app-global-search__sec {
      grid-column: 2; font-size: 12px; color: #6b7280;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .app-global-search__empty {
      padding: 16px; text-align: center; color: #6b7280; font-style: italic;
      border: 1px dashed #e5e7eb; border-radius: 4px;
    }
    .app-global-search__hint {
      font-size: 11px; color: #9ca3af; text-align: center; margin-top: 4px;
    }
    .app-global-search__hint kbd {
      background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 3px;
      padding: 1px 5px; font-family: monospace; font-size: 10px;
    }
  `]
})
export class GlobalSearchComponent implements AfterViewChecked {
  private http = inject(HttpClient);
  private router = inject(Router);

  /** Se true, renderizza un FAB fixed bottom-right; se false, solo dialog (parent gestisce trigger). */
  @Input() showFab = false;

  paletteOpenSig = signal(false);
  query = signal('');
  results = signal<SearchResult[]>([]);
  loading = signal(false);

  @ViewChild('paletteInput') paletteInputRef?: ElementRef<HTMLInputElement>;
  private debounceTimer: any = null;
  private justOpened = false;

  // Public method for parent components / shortcuts
  openPalette() {
    this.paletteOpenSig.set(true);
    this.justOpened = true;
  }

  closePalette() {
    this.paletteOpenSig.set(false);
    this.query.set('');
    this.results.set([]);
  }

  onDialogShow() {
    // Auto-focus input
    setTimeout(() => this.paletteInputRef?.nativeElement?.focus(), 100);
  }

  onDialogHide() {
    this.query.set('');
    this.results.set([]);
  }

  ngAfterViewChecked() {
    if (this.justOpened && this.paletteInputRef?.nativeElement) {
      this.paletteInputRef.nativeElement.focus();
      this.justOpened = false;
    }
  }

  onInput(q: string) {
    this.query.set(q);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (!q || q.trim().length < 2) {
      this.results.set([]); return;
    }
    this.loading.set(true);
    this.debounceTimer = setTimeout(() => this.fetchResults(q.trim()), 300);
  }

  private fetchResults(q: string) {
    const url = `${environment.api_url || '/api/'}search/global?q=${encodeURIComponent(q)}&top=5`;
    this.http.get<any>(url).subscribe({
      next: (resp) => {
        if (resp?.ok) this.results.set(resp.results || []);
        this.loading.set(false);
      },
      error: () => { this.results.set([]); this.loading.set(false); }
    });
  }

  onPick(r: SearchResult) {
    this.closePalette();
    this.router.navigateByUrl(`/${r.route}/edit/${r.id}`);
  }

  // Shortcut handlers
  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent) {
    // Ctrl+K / Cmd+K → toggle palette
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      if (this.paletteOpenSig()) this.closePalette();
      else this.openPalette();
    }
  }
}
