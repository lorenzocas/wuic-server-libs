import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Subject } from 'rxjs';
import { UserInfoService } from './user-info.service';
import { WtoolboxService } from './wtoolbox.service';

export interface NotificationItem {
  id: number;
  userId: number;
  type: string;
  message: string;
  targetJson: string;
  payloadJson: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string | null;
}

interface NotificationSnapshot {
  userId: number;
  unreadCount: number;
  notifications: NotificationItem[];
}

export interface RealtimeProgressEvent {
  guid: string;
  progress: number;
  operation?: string;
  route?: string;
  totalRecords?: number | null;
}

@Injectable({ providedIn: 'root' })
export class NotificationRealtimeService {
  private socket: WebSocket | null = null;
  private reconnectTimer: any;
  private currentUserId: number | null = null;
  private manuallyClosed = false;
  private connectingUserId: number | null = null;
  private snapshotInFlight: Promise<void> | null = null;
  private snapshotInFlightUserId: number | null = null;
  private lastSnapshotAt = 0;
  private lastSnapshotUserId: number | null = null;

  readonly unreadCount$ = new BehaviorSubject<number>(0);
  readonly notifications$ = new BehaviorSubject<NotificationItem[]>([]);
  readonly enabled$ = new BehaviorSubject<boolean>(this.resolveNotificationsEnabledFromSettings());
  readonly progressEvents$ = new Subject<RealtimeProgressEvent>();

  constructor(
    private http: HttpClient,
    private userInfoService: UserInfoService,
    private ngZone: NgZone
  ) { }

  async connect(userId?: number | null): Promise<void> {
    if (!this.enabled$.value) {
      this.unreadCount$.next(0);
      this.notifications$.next([]);
      return;
    }

    const resolvedUserId = Number(userId || this.resolveUserIdFromSession() || 0);
    if (!resolvedUserId || resolvedUserId <= 0) {
      return;
    }

    const sameUser = this.currentUserId === resolvedUserId;
    const socketState = this.socket?.readyState;
    if (sameUser && (socketState === WebSocket.OPEN || socketState === WebSocket.CONNECTING)) {
      return;
    }

    if (sameUser && this.connectingUserId === resolvedUserId) {
      return;
    }

    if (!sameUser && this.currentUserId) {
      this.disconnect();
    }

    this.currentUserId = resolvedUserId;
    this.manuallyClosed = false;
    this.connectingUserId = resolvedUserId;

    try {
      await this.loadSnapshot(resolvedUserId);
      if (this.manuallyClosed || this.currentUserId !== resolvedUserId) {
        return;
      }
      this.openSocket(resolvedUserId);
    } finally {
      if (this.connectingUserId === resolvedUserId) {
        this.connectingUserId = null;
      }
    }
  }

  disconnect(): void {
    this.manuallyClosed = true;
    this.connectingUserId = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
      }
      this.socket = null;
    }
  }

  async markRead(notificationId: number): Promise<void> {
    if (!notificationId || notificationId <= 0) {
      return;
    }

    try {
      const res: any = await firstValueFrom(this.http.post(this.buildApiUrl(`Notifications/markread/${notificationId}`), {}));
      const snapshot = this.normalizeSnapshot(res?.data);
      this.applySnapshot(snapshot);
    } catch {
    }
  }

  /**
   * Marca come lette TUTTE le notifiche non lette dell'utente (senza eliminarle).
   * A differenza di `clearRead` (che sposta a `deleted_at` le gia' lette), questa
   * op mantiene la cronologia notifiche visibile ma azzera il contatore unread.
   * Endpoint: POST /api/Notifications/markallread/{userId}.
   */
  async markAllRead(userId?: number | null): Promise<void> {
    const resolvedUserId = Number(userId || this.currentUserId || 0);
    if (!resolvedUserId || resolvedUserId <= 0) {
      return;
    }

    try {
      const res: any = await firstValueFrom(this.http.post(this.buildApiUrl(`Notifications/markallread/${resolvedUserId}`), {}));
      const snapshot = this.normalizeSnapshot(res?.data);
      this.applySnapshot(snapshot);
    } catch {
    }
  }

  async deleteRead(notificationId: number): Promise<void> {
    if (!notificationId || notificationId <= 0) {
      return;
    }

    try {
      const res: any = await firstValueFrom(this.http.post(this.buildApiUrl(`Notifications/delete-read/${notificationId}`), {}));
      const snapshot = this.normalizeSnapshot(res?.data);
      this.applySnapshot(snapshot);
    } catch {
    }
  }

  async clearRead(userId?: number | null): Promise<void> {
    const resolvedUserId = Number(userId || this.currentUserId || this.resolveUserIdFromSession() || 0);
    if (!resolvedUserId || resolvedUserId <= 0) {
      return;
    }

    try {
      const res: any = await firstValueFrom(this.http.post(this.buildApiUrl(`Notifications/clearread/${resolvedUserId}`), {}));
      const snapshot = this.normalizeSnapshot(res?.data);
      this.applySnapshot(snapshot);
    } catch {
    }
  }

  async enqueue(payload: {
    userId: number;
    type?: string;
    message: string;
    targetJson?: string;
    payloadJson?: string;
    source?: string;
    createdBy?: string;
  }): Promise<void> {
    if (!payload?.userId || !payload?.message) {
      return;
    }

    try {
      const res: any = await firstValueFrom(this.http.post(this.buildApiUrl('Notifications/enqueue'), payload));
      const snapshot = this.normalizeSnapshot(res?.data);
      this.applySnapshot(snapshot);
    } catch {
    }
  }

  async dismissProgressNotification(progressGuid: string, userId?: number | null): Promise<void> {
    const guid = String(progressGuid || '').trim();
    const resolvedUserId = Number(userId || this.currentUserId || this.resolveUserIdFromSession() || 0);
    if (!guid || !resolvedUserId || resolvedUserId <= 0) {
      return;
    }

    try {
      const res: any = await firstValueFrom(this.http.post(this.buildApiUrl('Notifications/dismiss-progress'), {
        userId: resolvedUserId,
        progressGuid: guid
      }));
      const snapshot = this.normalizeSnapshot(res?.data);
      this.applySnapshot(snapshot);
    } catch {
    }
  }

  private openSocket(userId: number): void {
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const wsBase = this.buildApiBaseUrl().replace(/^http/i, 'ws').replace(/\/api\/?$/i, '');
    const wsUrl = `${wsBase}/ws/notifications?userId=${encodeURIComponent(String(userId))}`;
    const ws = new WebSocket(wsUrl);
    this.socket = ws;

    ws.onmessage = (evt: MessageEvent) => {
      this.ngZone.run(() => {
        try {
          const payload = JSON.parse(String(evt.data || '{}'));
          if (payload?.type === 'snapshot') {
            const snapshot = this.normalizeSnapshot(payload);
            this.applySnapshot(snapshot);
          } else if (payload?.type === 'progress') {
            const guid = String(payload?.guid || '').trim();
            const progress = Number(payload?.progress);
            if (!guid || !Number.isFinite(progress)) {
              return;
            }

            const event: RealtimeProgressEvent = {
              guid,
              progress,
              operation: String(payload?.operation || '').trim() || undefined,
              route: String(payload?.route || '').trim() || undefined,
              totalRecords: Number.isFinite(Number(payload?.totalRecords))
                ? Number(payload?.totalRecords)
                : null
            };
            this.progressEvents$.next(event);
          }
        } catch {
        }
      });
    };

    ws.onclose = (evt) => {
      console.warn('[WS-NOTIFY] onclose', { code: evt.code, reason: evt.reason, wasClean: evt.wasClean, sameSocket: this.socket === ws });
      if (this.socket === ws) {
        this.socket = null;
      }
      if (this.manuallyClosed) {
        return;
      }
      this.scheduleReconnect();
    };

    ws.onerror = (evt) => {
      console.warn('[WS-NOTIFY] onerror', evt);
      this.scheduleReconnect();
    };

    ws.onopen = () => {
      console.log('[WS-NOTIFY] onopen — connected to', wsUrl);
      void this.loadSnapshot(userId);
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.manuallyClosed || !this.currentUserId) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manuallyClosed && this.currentUserId) {
        this.openSocket(this.currentUserId);
      }
    }, 5000);
  }

  private async loadSnapshot(userId: number): Promise<void> {
    const now = Date.now();
    if (this.lastSnapshotUserId === userId && (now - this.lastSnapshotAt) < 1000) {
      return;
    }

    if (this.snapshotInFlight && this.snapshotInFlightUserId === userId) {
      await this.snapshotInFlight;
      return;
    }

    const request = (async () => {
      try {
        const res: any = await firstValueFrom(this.http.get(this.buildApiUrl(`Notifications/unread/${userId}`)));
        const notificationsEnabled = this.extractNotificationsEnabledFromResponse(res);
        if (notificationsEnabled === false) {
          this.enabled$.next(false);
          this.unreadCount$.next(0);
          this.notifications$.next([]);
          this.disconnect();
          return;
        }

        const snapshot = this.normalizeSnapshot(res?.data);
        this.applySnapshot(snapshot);
        this.lastSnapshotUserId = userId;
        this.lastSnapshotAt = Date.now();
      } catch {
        this.unreadCount$.next(0);
        this.notifications$.next([]);
      }
    })();

    this.snapshotInFlight = request;
    this.snapshotInFlightUserId = userId;
    try {
      await request;
    } finally {
      if (this.snapshotInFlight === request) {
        this.snapshotInFlight = null;
        this.snapshotInFlightUserId = null;
      }
    }
  }

  private applySnapshot(snapshot: NotificationSnapshot): void {
    this.unreadCount$.next(Number(snapshot?.unreadCount || 0));
    this.notifications$.next(Array.isArray(snapshot?.notifications) ? snapshot.notifications : []);
  }

  private normalizeSnapshot(raw: any): NotificationSnapshot {
    const listRaw = Array.isArray(raw?.notifications ?? raw?.Notifications)
      ? (raw?.notifications ?? raw?.Notifications)
      : [];

    return {
      userId: Number(raw?.userId ?? raw?.UserId ?? 0),
      unreadCount: Number(raw?.unreadCount ?? raw?.UnreadCount ?? 0),
      notifications: listRaw.map((item: any) => this.normalizeItem(item))
    };
  }

  private normalizeItem(item: any): NotificationItem {
    return {
      id: Number(item?.id ?? item?.Id ?? 0),
      userId: Number(item?.userId ?? item?.UserId ?? 0),
      type: String(item?.type ?? item?.Type ?? ''),
      message: String(item?.message ?? item?.Message ?? ''),
      targetJson: String(item?.targetJson ?? item?.TargetJson ?? ''),
      payloadJson: String(item?.payloadJson ?? item?.PayloadJson ?? ''),
      isRead: Boolean(item?.isRead ?? item?.IsRead ?? false),
      createdAt: String(item?.createdAt ?? item?.CreatedAt ?? ''),
      readAt: item?.readAt ?? item?.ReadAt ?? null
    };
  }

  private buildApiUrl(path: string): string {
    const base = this.buildApiBaseUrl();
    return `${base}${path}`;
  }

  private buildApiBaseUrl(): string {
    const configured = String(WtoolboxService.appSettings?.api_url || '').trim();
    if (configured) {
      return configured.endsWith('/') ? configured : `${configured}/`;
    }

    if (typeof window !== 'undefined' && window.location) {
      return `${window.location.protocol}//${window.location.host}/api/`;
    }

    return '/api/';
  }

  private resolveUserIdFromSession(): number | null {
    try {
      const user = this.userInfoService.getuserInfo();
      const id = Number(user?.user_id || 0);
      return Number.isFinite(id) && id > 0 ? id : null;
    } catch {
      return null;
    }
  }

  private resolveNotificationsEnabledFromSettings(): boolean {
    const appSettings: any = WtoolboxService.appSettings || {};
    const candidates = [
      appSettings?.notifications?.enabled,
      appSettings?.Notifications?.Enabled,
      appSettings?.notificationsEnabled,
      appSettings?.notifications_enabled
    ];

    for (const value of candidates) {
      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') {
          return true;
        }
        if (normalized === 'false') {
          return false;
        }
      }
    }

    return true;
  }

  private extractNotificationsEnabledFromResponse(res: any): boolean | null {
    const value = res?.notificationsEnabled;
    if (typeof value === 'boolean') {
      return value;
    }
    return null;
  }
}
