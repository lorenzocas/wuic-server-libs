import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MaintenanceService } from './maintenance.service';

/**
 * Small full-screen overlay shown for ~1.5s before the page is reloaded
 * because the server entered maintenance mode. Prevents the user from
 * experiencing a blank-click / frozen navigation: they see "Aggiornamento
 * in corso, ricarico..." and then the real maintenance.html kicks in on
 * reload.
 *
 * Controlled by `MaintenanceService.overlayVisible` signal.
 */
@Component({
  selector: 'app-maintenance-toast',
  imports: [TranslatePipe],
  template: `
    @if (maintenance.overlayVisible()) {
      <div class="maintenance-overlay" role="status" aria-live="polite">
        <div class="overlay-card">
          <div class="spinner" aria-hidden="true"></div>
          <p class="overlay-text">{{ 'maintenance.reloading' | translate }}</p>
        </div>
      </div>
    }
  `,
  styles: [`
    .maintenance-overlay {
      position: fixed;
      inset: 0;
      z-index: 11000;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.15s ease;
    }
    .overlay-card {
      background: #1e293b;
      color: #e2e8f0;
      border-radius: 12px;
      padding: 24px 32px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
      min-width: 260px;
      max-width: 90vw;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid rgba(148, 163, 184, 0.2);
      border-top-color: #818cf8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .overlay-text {
      margin: 0;
      font-size: 0.95rem;
      text-align: center;
      line-height: 1.4;
    }
    @keyframes spin {
      from { transform: rotate(0); }
      to   { transform: rotate(360deg); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
  `]
})
export class MaintenanceToast {
  readonly maintenance = inject(MaintenanceService);
}
