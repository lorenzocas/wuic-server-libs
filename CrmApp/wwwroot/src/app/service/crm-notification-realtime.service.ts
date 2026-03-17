import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

export interface CrmNotificationItem {
  notificationId: number;
  userId: number;
  type: string;
  message: string;
  entityType: string;
  entityId?: number | null;
  isRead: boolean;
  createdAt: string;
}

interface CrmNotificationSnapshot {
  userId: number;
  unreadCount: number;
  notifications: CrmNotificationItem[];
}

@Injectable({ providedIn: 'root' })
export class CrmNotificationRealtimeService {
  private socket: WebSocket | null = null;
  private reconnectTimer: any;
  private currentUserId: number | null = null;
  private manuallyClosed = false;

  readonly unreadCount$ = new BehaviorSubject<number>(0);
  readonly notifications$ = new BehaviorSubject<CrmNotificationItem[]>([]);

  constructor(private http: HttpClient) { }

  async connect(userId: number): Promise<void> {
    if (!userId || userId <= 0) {
      return;
    }

    this.currentUserId = userId;
    this.manuallyClosed = false;

    await this.loadSnapshot(userId);
    this.openSocket(userId);
  }

  disconnect(): void {
    this.manuallyClosed = true;
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

    const url = `${environment.api_url}CrmNotifications/markread/${notificationId}`;
    try {
      const res: any = await firstValueFrom(this.http.post(url, {}));
      const snapshot = this.normalizeSnapshot(res?.data);
      this.applySnapshot(snapshot);
    } catch {
      // server push will realign state on next event
    }
  }

  private openSocket(userId: number): void {
    this.disconnectSocketOnly();

    const wsBase = environment.api_url.replace(/^http/i, 'ws').replace(/\/api\/?$/i, '');
    const wsUrl = `${wsBase}/ws/crm-notifications?userId=${encodeURIComponent(String(userId))}`;

    this.socket = new WebSocket(wsUrl);

    this.socket.onmessage = (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(String(evt.data || '{}'));
        if (payload?.type === 'snapshot') {
          const snapshot = this.normalizeSnapshot(payload);
          this.applySnapshot(snapshot);
        }
      } catch {
      }
    };

    this.socket.onclose = () => {
      this.socket = null;
      if (this.manuallyClosed) {
        return;
      }
      this.scheduleReconnect();
    };

    this.socket.onerror = () => {
      this.disconnectSocketOnly();
      this.scheduleReconnect();
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
    const url = `${environment.api_url}CrmNotifications/unread/${userId}`;
    try {
      const res: any = await firstValueFrom(this.http.get(url));
      const snapshot = this.normalizeSnapshot(res?.data);
      this.applySnapshot(snapshot);
    } catch {
      this.unreadCount$.next(0);
      this.notifications$.next([]);
    }
  }

  private applySnapshot(snapshot: CrmNotificationSnapshot): void {
    this.unreadCount$.next(Number(snapshot?.unreadCount || 0));
    this.notifications$.next(Array.isArray(snapshot?.notifications) ? snapshot.notifications : []);
  }

  private disconnectSocketOnly(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
      }
      this.socket = null;
    }
  }

  private normalizeSnapshot(raw: any): CrmNotificationSnapshot {
    const listRaw = Array.isArray(raw?.notifications ?? raw?.Notifications)
      ? (raw?.notifications ?? raw?.Notifications)
      : [];

    return {
      userId: Number(raw?.userId ?? raw?.UserId ?? 0),
      unreadCount: Number(raw?.unreadCount ?? raw?.UnreadCount ?? 0),
      notifications: listRaw.map((item: any) => this.normalizeItem(item))
    };
  }

  private normalizeItem(item: any): CrmNotificationItem {
    return {
      notificationId: Number(item?.notificationId ?? item?.NotificationId ?? 0),
      userId: Number(item?.userId ?? item?.UserId ?? 0),
      type: String(item?.type ?? item?.Type ?? ''),
      message: String(item?.message ?? item?.Message ?? ''),
      entityType: String(item?.entityType ?? item?.EntityType ?? ''),
      entityId: item?.entityId ?? item?.EntityId ?? null,
      isRead: Boolean(item?.isRead ?? item?.IsRead ?? false),
      createdAt: String(item?.createdAt ?? item?.CreatedAt ?? '')
    };
  }
}
