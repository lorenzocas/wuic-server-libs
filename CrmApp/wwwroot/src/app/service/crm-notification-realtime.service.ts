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
  private connectingUserId: number | null = null;
  private snapshotInFlight: Promise<void> | null = null;
  private snapshotInFlightUserId: number | null = null;
  private lastSnapshotAt = 0;
  private lastSnapshotUserId: number | null = null;

  readonly unreadCount$ = new BehaviorSubject<number>(0);
  readonly notifications$ = new BehaviorSubject<CrmNotificationItem[]>([]);

  constructor(private http: HttpClient) { }

  async connect(userId: number): Promise<void> {
    if (!userId || userId <= 0) {
      return;
    }

    const sameUser = this.currentUserId === userId;
    const socketState = this.socket?.readyState;
    if (sameUser && (socketState === WebSocket.OPEN || socketState === WebSocket.CONNECTING)) {
      return;
    }

    if (sameUser && this.connectingUserId === userId) {
      return;
    }

    if (!sameUser && this.currentUserId) {
      this.disconnect();
    }

    this.currentUserId = userId;
    this.manuallyClosed = false;
    this.connectingUserId = userId;

    try {
      await this.loadSnapshot(userId);
      if (this.manuallyClosed || this.currentUserId !== userId) {
        return;
      }
      this.openSocket(userId);
    } finally {
      if (this.connectingUserId === userId) {
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

    const url = `${environment.api_url}CrmNotifications/markread/${notificationId}`;
    try {
      const res: any = await firstValueFrom(this.http.post(url, {}));
      const snapshot = this.normalizeSnapshot(res?.data);
      this.applySnapshot(snapshot);
    } catch {
      // server push will realign state on next event
    }
  }
  async clearRead(userId: number): Promise<void> {
    if (!userId || userId <= 0) {
      return;
    }

    const url = `${environment.api_url}CrmNotifications/clearread/${userId}`;
    try {
      const res: any = await firstValueFrom(this.http.post(url, {}));
      const snapshot = this.normalizeSnapshot(res?.data);
      this.applySnapshot(snapshot);
    } catch {
      // server push will realign state on next event
    }
  }

  private openSocket(userId: number): void {
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const wsBase = environment.api_url.replace(/^http/i, 'ws').replace(/\/api\/?$/i, '');
    const wsUrl = `${wsBase}/ws/crm-notifications?userId=${encodeURIComponent(String(userId))}`;

    const ws = new WebSocket(wsUrl);
    this.socket = ws;

    ws.onmessage = (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(String(evt.data || '{}'));
        if (payload?.type === 'snapshot') {
          const snapshot = this.normalizeSnapshot(payload);
          this.applySnapshot(snapshot);
        }
      } catch {
      }
    };

    ws.onclose = () => {
      if (this.socket === ws) {
        this.socket = null;
      }
      if (this.manuallyClosed) {
        return;
      }
      this.scheduleReconnect();
    };

    ws.onerror = () => {
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
    const now = Date.now();
    if (this.lastSnapshotUserId === userId && (now - this.lastSnapshotAt) < 1000) {
      return;
    }

    if (this.snapshotInFlight && this.snapshotInFlightUserId === userId) {
      await this.snapshotInFlight;
      return;
    }

    const url = `${environment.api_url}CrmNotifications/unread/${userId}`;
    const request = (async () => {
      try {
        const res: any = await firstValueFrom(this.http.get(url));
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

  private applySnapshot(snapshot: CrmNotificationSnapshot): void {
    this.unreadCount$.next(Number(snapshot?.unreadCount || 0));
    this.notifications$.next(Array.isArray(snapshot?.notifications) ? snapshot.notifications : []);
  }

  private disconnectSocketOnly(): void {
    if (this.socket) {
      try {
        if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
          this.socket.close();
        }
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


