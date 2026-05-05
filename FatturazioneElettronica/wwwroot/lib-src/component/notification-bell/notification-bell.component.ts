import { Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { PopoverModule } from 'primeng/popover';
import { ProgressBarModule } from 'primeng/progressbar';
import type { Popover } from 'primeng/popover';
import { Subscription } from 'rxjs';
import { NotificationItem, NotificationRealtimeService } from '../../service/notification-realtime.service';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { TranslationManagerService } from '../../service/translation-manager.service';

@Component({
  selector: 'wuic-notification-bell',
  imports: [DatePipe, ButtonModule, PopoverModule, ProgressBarModule],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.css'
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  @Input() userId?: number | null;
  // Default sentinel vuoto: se il consumer NON passa l'input, risolviamo via
  // TranslationManagerService all'ngOnInit. I fallback italiani restano nel
  // trslSrv.instant(...) || '...' per il caso in cui la chiave manchi dal DB
  // (deploy pre-upsert).
  @Input() title = '';
  @Input() emptyMessage = '';
  @Input() clearReadLabel = '';
  @Input() markAllReadLabel = '';

  @ViewChild('notificationPanel') notificationPanel?: Popover;

  unreadCount = 0;
  notifications: NotificationItem[] = [];
  isVisible = true;
  progressByGuid: Record<string, number> = {};
  /** Title del bottone "elimina notifica letta" (X), localizzato. */
  deleteNotificationTitle = '';

  private readonly sub = new Subscription();

  constructor(
    private readonly realtime: NotificationRealtimeService,
    private readonly router: Router,
    private readonly trslSrv: TranslationManagerService
  ) { }

  /** Risolve i label dalle traduzioni, rispettando eventuali @Input espliciti. */
  private resolveLabels(): void {
    if (!this.title) {
      this.title = this.trslSrv.instant('notification_bell.title') || 'Notifiche';
    }
    if (!this.emptyMessage) {
      this.emptyMessage = this.trslSrv.instant('notification_bell.empty_message') || 'Nessuna notifica.';
    }
    if (!this.clearReadLabel) {
      this.clearReadLabel = this.trslSrv.instant('notification_bell.clear_read') || 'Rimuovi lette';
    }
    if (!this.markAllReadLabel) {
      this.markAllReadLabel = this.trslSrv.instant('notification_bell.mark_all_read') || 'Segna tutte lette';
    }
    this.deleteNotificationTitle = this.trslSrv.instant('notification_bell.delete_notification') || 'Elimina notifica';
  }

  async ngOnInit(): Promise<void> {
    this.resolveLabels();

    this.sub.add(this.realtime.enabled$.subscribe((enabled) => {
      this.isVisible = enabled !== false;
    }));

    this.sub.add(this.realtime.unreadCount$.subscribe((count) => {
      this.unreadCount = Number(count || 0);
    }));

    this.sub.add(this.realtime.notifications$.subscribe((items) => {
      this.notifications = Array.isArray(items) ? items : [];
    }));

    this.sub.add(this.realtime.progressEvents$.subscribe((evt) => {
      const guid = String(evt?.guid || '').trim();
      const progress = Number(evt?.progress);
      if (!guid || !Number.isFinite(progress)) {
        return;
      }

      const normalized = Math.max(0, Math.min(100, progress));
      this.progressByGuid[guid] = normalized;
    }));

    if (this.isVisible) {
      await this.realtime.connect(this.userId);
    }
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  async clearRead(): Promise<void> {
    await this.realtime.clearRead(this.userId);
  }

  async markAllRead(): Promise<void> {
    await this.realtime.markAllRead(this.userId);
  }

  /**
   * Ritorna `true` se la notifica, al click, naviga verso un path o apre un download
   * o un resume progress. Usato dall'HTML per applicare uno styling "cliccabile"
   * (cursor pointer, hover highlight, chevron ►) che distingue visivamente le
   * notifiche azionabili da quelle puramente informative.
   */
  isClickable(item: NotificationItem): boolean {
    if (!item) return false;
    if (this.resolveNotificationDownloadUrl(item)) return true;
    if (this.resolveNotificationPath(item)) return true;
    // tryEmit*ProgressResume sono destructive (dispatchano evento); qui vogliamo
    // solo un predicate read-only → controllo sulla presenza del guid progress.
    if (this.getNotificationProgressGuid(item)) return true;
    return false;
  }

  async deleteReadNotification(event: Event, item: NotificationItem): Promise<void> {
    event?.stopPropagation();
    event?.preventDefault();
    if (!item?.isRead || !item?.id) {
      return;
    }
    await this.realtime.deleteRead(item.id);
  }

  async openNotification(item: NotificationItem): Promise<void> {
    if (!item) {
      return;
    }

    if (!item.isRead && item.id > 0) {
      await this.realtime.markRead(item.id);
    }

    if (this.tryEmitImportProgressResume(item) || this.tryEmitExportProgressResume(item)) {
      this.notificationPanel?.hide();
      return;
    }

    const downloadUrl = this.resolveNotificationDownloadUrl(item);
    if (downloadUrl) {
      this.notificationPanel?.hide();
      window.open(downloadUrl, '_blank');
      return;
    }

    const targetPath = this.resolveNotificationPath(item);
    if (targetPath) {
      this.notificationPanel?.hide();
      const currentUrl = String(this.router.url || '').trim();
      const currentBase = currentUrl.split('?')[0];
      const targetBase = targetPath.split('?')[0];
      if (currentBase && targetBase && currentBase === targetBase) {
        return;
      }
      const forcedTargetPath = this.addNotificationNonce(targetPath);
      await this.router.navigateByUrl(forcedTargetPath);
    }
  }

  private resolveNotificationDownloadUrl(item: NotificationItem): string {
    const target = this.parseJson(item?.targetJson);
    const explicitUrl = String(target?.downloadUrl || target?.url || '').trim();
    if (explicitUrl) {
      return explicitUrl;
    }

    const downloadFile = String(target?.downloadFile || '').trim();
    if (!downloadFile) {
      return '';
    }

    const fileRoot = String(WtoolboxService?.appSettings?.file_path || '').trim();
    if (fileRoot) {
      return fileRoot + downloadFile;
    }

    return downloadFile.startsWith('/') ? downloadFile : `/${downloadFile}`;
  }

  private resolveNotificationPath(item: NotificationItem): string {
    const target = this.parseJson(item?.targetJson);
    let path = String(target?.path || target?.route || '').trim();
    if (!path) {
      return '';
    }

    // Notifications may carry hash routes (e.g. "#/cities/list?..."), normalize for Angular router.
    if (path.startsWith('#/')) {
      path = path.substring(1);
    }

    return path;
  }

  private tryEmitExportProgressResume(item: NotificationItem): boolean {
    const target = this.parseJson(item?.targetJson);
    const payload = this.parseJson(item?.payloadJson);
    if (!target || typeof target !== 'object') {
      return false;
    }

    const operation = String(payload?.operation || target?.operation || '').trim().toLowerCase();
    if (operation === 'import') {
      return false;
    }

    let guid = String(target?.exportProgressGuid || target?.progressGuid || '').trim();
    let total = Number(target?.exportProgressTotal || target?.totalRecords || 0);

    const rawPath = String(target?.path || target?.route || '').trim();
    if (!guid && rawPath) {
      try {
        const normalizedPath = rawPath.startsWith('#') ? rawPath.substring(1) : rawPath;
        const fakeUrl = new URL(normalizedPath, window.location.origin);
        guid = String(fakeUrl.searchParams.get('exportProgressGuid') || '').trim();
        const totalRaw = Number(fakeUrl.searchParams.get('exportProgressTotal') || 0);
        if (Number.isFinite(totalRaw) && totalRaw > 0) {
          total = totalRaw;
        }
      } catch {
      }
    }

    if (!guid) {
      return false;
    }

    window.dispatchEvent(new CustomEvent('wuic-export-progress-resume', {
      detail: {
        guid,
        total: Number.isFinite(total) && total > 0 ? Math.floor(total) : 0,
        progress: this.getNotificationProgress(item)
      }
    }));

    return true;
  }

  private tryEmitImportProgressResume(item: NotificationItem): boolean {
    const target = this.parseJson(item?.targetJson);
    const payload = this.parseJson(item?.payloadJson);
    if (!target || typeof target !== 'object') {
      return false;
    }

    const operation = String(payload?.operation || target?.operation || '').trim().toLowerCase();
    let guid = String(target?.importProgressGuid || '').trim();
    if (!guid && operation === 'import') {
      guid = String(target?.progressGuid || '').trim();
    }
    const rawPath = String(target?.path || target?.route || '').trim();
    if (!guid && rawPath) {
      try {
        const normalizedPath = rawPath.startsWith('#') ? rawPath.substring(1) : rawPath;
        const fakeUrl = new URL(normalizedPath, window.location.origin);
        guid = String(fakeUrl.searchParams.get('importProgressGuid') || '').trim();
      } catch {
      }
    }

    if (!guid) {
      return false;
    }

    window.dispatchEvent(new CustomEvent('wuic-import-progress-resume', {
      detail: {
        guid,
        progress: this.getNotificationProgress(item)
      }
    }));

    return true;
  }

  getNotificationProgress(item: NotificationItem): number | null {
    const guid = this.getNotificationProgressGuid(item);
    if (!guid) {
      return null;
    }

    const progress = this.progressByGuid[guid];
    if (!Number.isFinite(progress)) {
      return null;
    }

    return Math.max(0, Math.min(100, Number(progress)));
  }

  private getNotificationProgressGuid(item: NotificationItem): string {
    const target = this.parseJson(item?.targetJson);
    const payload = this.parseJson(item?.payloadJson);
    if (!target || typeof target !== 'object') {
      return '';
    }

    const operation = String(payload?.operation || target?.operation || '').trim().toLowerCase();
    let guid = String(
      operation === 'import'
        ? (target?.importProgressGuid || target?.progressGuid || '')
        : (target?.exportProgressGuid || target?.progressGuid || '')
    ).trim();
    if (guid) {
      return guid;
    }

    const rawPath = String(target?.path || target?.route || '').trim();
    if (!rawPath) {
      return '';
    }

    try {
      const normalizedPath = rawPath.startsWith('#') ? rawPath.substring(1) : rawPath;
      const fakeUrl = new URL(normalizedPath, window.location.origin);
      guid = String(
        fakeUrl.searchParams.get('exportProgressGuid')
        || fakeUrl.searchParams.get('importProgressGuid')
        || ''
      ).trim();
      return guid;
    } catch {
      return '';
    }
  }

  private addNotificationNonce(path: string): string {
    const raw = String(path || '').trim();
    if (!raw) {
      return raw;
    }

    const sep = raw.includes('?') ? '&' : '?';
    return `${raw}${sep}_ntf=${Date.now()}`;
  }

  private parseJson(raw: string): any {
    if (!raw || typeof raw !== 'string') {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
