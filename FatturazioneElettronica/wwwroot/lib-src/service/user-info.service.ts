import { Injectable } from '@angular/core';
import { CookieService } from 'ngx-cookie-service';
import { UserInfo } from '../class/userInfo';
import { WtoolboxService } from './wtoolbox.service';

/**
 * Storage key used as the PRIMARY source of truth for the UI-side view of
 * the current user. Required because when the backend runs with
 * `enableCookieAuthentication=true`, the `k-user` cookie is HttpOnly and
 * invisible to JavaScript — `document.cookie` returns `undefined` for it.
 *
 * In legacy mode (`enableCookieAuthentication=false`) the cookie is still
 * the server-side auth carrier but we also write a copy here so the read
 * path is identical in both modes.
 */
const USER_INFO_STORAGE_KEY = 'k-user-memory';

@Injectable({
  providedIn: 'root'
})
export class UserInfoService {

  constructor(private cookieService: CookieService) { }

  /**
   * Reads the user-info snapshot from sessionStorage. Returns `null` when
   * absent or malformed. Used as the primary cache — the `k-user` cookie
   * may be HttpOnly (server-managed mode) and is therefore not readable
   * from JS.
   */
  private readFromStorage(): UserInfo | null {
    try {
      const raw = typeof window !== 'undefined' && window.sessionStorage
        ? window.sessionStorage.getItem(USER_INFO_STORAGE_KEY)
        : null;
      if (!raw) return null;
      return JSON.parse(raw) as UserInfo;
    } catch {
      return null;
    }
  }

  private writeToStorage(info: UserInfo): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(USER_INFO_STORAGE_KEY, JSON.stringify(info));
      }
    } catch {
      // sessionStorage can throw in private browsing / storage-full edge cases.
      // Best effort — the cookie path still covers legacy mode.
    }
  }

  private removeFromStorage(): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(USER_INFO_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Returns `true` when the UI has a cached user snapshot. Checks
   * sessionStorage FIRST (works in both legacy and server-managed cookie
   * modes) and falls back to the readable cookie (legacy-only path).
   */
  hasStoredUserInfo(): boolean {
    if (this.readFromStorage()) return true;
    return !!this.cookieService.get('k-user');
  }

  /**
   * Clears UI-side user state. Removes the sessionStorage snapshot and the
   * JS-readable cookie. NOTE: when the backend runs in server-managed mode
   * the HttpOnly `k-user` cookie cannot be deleted from JavaScript — the
   * server-side logout endpoint (`MetaService.logoutSession`) must be
   * invoked to emit a proper `Set-Cookie` delete header.
   */
  clearUserInfo() {
    this.removeFromStorage();
    this.cookieService.delete('k-user', '/');
  }

  /**
   * Valuta se l'utente corrente ha privilegi di super-admin basandosi
   * SOLO sul flag `isSuperAdmin` (che rispecchia `ruoli.superadmin` lato
   * DB meta). Non usiamo piu' `isAdmin` dell'utente ne' role_id / role
   * string: `isAdmin` e' un flag storico che sopravvive sul modello ma
   * non e' la source of truth per l'autorizzazione.
   *
   * Accetta varianti di naming (`isSuperAdmin` / `issuperadmin` /
   * `IsSuperAdmin` / `ruoli_superadmin` in `extra_keys`) per tollerare
   * payload non ancora normalizzati.
   *
   * @param userLike Oggetto utente da leggere (cookie / sessionStorage / legacy).
   * @returns `true` se il ruolo dell'utente ha `superadmin = 1`.
   */
  isUserAdmin(userLike: any): boolean {
    if (!userLike) {
      return false;
    }

    const rawFlag = userLike.isSuperAdmin
      ?? userLike.issuperadmin
      ?? userLike.IsSuperAdmin
      ?? userLike.extra_keys?.ruoli_superadmin;

    if (typeof rawFlag === 'boolean') {
      return rawFlag;
    }

    if (typeof rawFlag === 'number') {
      return rawFlag === 1;
    }

    if (typeof rawFlag === 'string') {
      const flagLower = rawFlag.toLowerCase();
      return flagLower === 'true' || flagLower === '1';
    }

    return false;
  }

  /**
   * Valuta una condizione booleana sullo stato o sull'input corrente.
   * @returns Valore restituito dal metodo (boolean).
   */
  isCurrentUserAdmin(): boolean {
    return this.isUserAdmin(this.getuserInfo());
  }

  isAuthAdmin(auth?: { legacyRole?: string; claims?: { type?: string; value?: string }[] } | null): boolean {
    const legacyRole = String(auth?.legacyRole || '').toLowerCase();
    const claimRoles = Array.isArray(auth?.claims)
      ? auth.claims
        .filter(c => String(c?.type || '').toLowerCase().includes('role'))
        .map(c => String(c?.value || '').toLowerCase())
      : [];

    if (legacyRole.includes('admin') || claimRoles.some(r => r.includes('admin'))) {
      return true;
    }

    return this.isCurrentUserAdmin();
  }

  /**
   * Normalizza un payload utente eterogeneo e lo salva come snapshot UI.
   *
   * Cambio di semantica vs la versione pre-cookie-auth-hardening:
   *   - PRIMA scriveva solo nel cookie `k-user` via `CookieService.set`;
   *   - ORA scrive PRIMA in sessionStorage (source of truth per la UI,
   *     leggibile anche quando il cookie e' HttpOnly), POI prova a
   *     scrivere anche il cookie — se il cookie HttpOnly esiste gia'
   *     (server-managed mode), la scrittura JS viene silenziosamente
   *     droppata dal browser senza errori, e non ci interessa: il cookie
   *     di autenticazione e' gia' quello settato dal backend via
   *     Set-Cookie.
   *
   * In legacy mode questa logica e' trasparente: la scrittura JS del
   * cookie funziona ancora, il cookie e' l'autenticazione, sessionStorage
   * e' solo un mirror per velocita'.
   *
   * @param userLike Oggetto utente in formato libero (server/legacy/client).
   */
  setUserInfoCookie(userLike: any) {
    if (!userLike) {
      return;
    }

    const languageId = userLike?.lingua?.id || userLike?.language || 'it-IT';
    const languageLabel = userLike?.lingua?.lingua || (typeof languageId === 'string' ? languageId.split('-')[0].toUpperCase() : 'IT');

    const normalized: UserInfo = {
      user_id: Number(userLike.user_id ?? 0),
      user_name: userLike.user_name || userLike.username || '',
      display_name: userLike.display_name || userLike.username || '',
      role: userLike.role || '',
      role_id: Number(userLike.role_id ?? 0),
      isAdmin: !!(userLike.isAdmin ?? userLike.isadmin ?? userLike.IsAdmin),
      isSuperAdmin: this.isUserAdmin(userLike),
      language: languageId,
      lingua: {
        id: languageId,
        lingua: languageLabel
      },
      optimisticCheckEnabled: userLike.extra_keys?.optimistic_concurrency_check === 'true'
    };

    // 1) Primary write: sessionStorage (works in both modes).
    this.writeToStorage(normalized);

    // 2) Best-effort legacy write: the browser silently drops this write
    //    when a HttpOnly cookie with the same name already exists at the
    //    same path (server-managed mode). In legacy mode it succeeds and
    //    produces the same wire format the backend expects.
    try {
      this.cookieService.set('k-user', JSON.stringify(normalized), undefined, '/');
    } catch {
      // ignore — sessionStorage is the source of truth anyway
    }
  }

  /**
   * Salva nel cookie `k-user` un utente admin fittizio, utile in contesti sviluppo/debug locale.
   */
  setDummyUserInfo() {
    let user: UserInfo = {
      user_id: 100274,
      user_name: 'admin',
      display_name: 'admin',
      role: 'Admin',
      role_id: 1,
      isAdmin: true,
      isSuperAdmin: true,
      language: 'it-IT',
      lingua: {
        id: 'it-IT',
        lingua: 'IT'
      }
    }

    this.writeToStorage(user);
    let uInfo = JSON.stringify(user);
    this.cookieService.set('k-user', uInfo, null, '/');

    return uInfo;
  }

  /**
   * Restituisce l'utente corrente dal cookie `k-user`
   * @returns Profilo utente corrente.
   */
  getuserInfo(): UserInfo {
    return this.getStoredUserInfo();
  }

  /**
   * Read path: prefer sessionStorage (source of truth, works in both cookie
   * modes) and fall back to the JS-readable cookie when sessionStorage is
   * empty. In server-managed mode the cookie is HttpOnly and this fallback
   * always returns `null`, so the caller must hydrate via
   * `MetaService.me` at boot (see `AuthSessionService.refreshAll`).
   */
  getStoredUserInfo(): UserInfo | null {
    const fromStorage = this.readFromStorage();
    if (fromStorage) return fromStorage;

    const raw = this.cookieService.get('k-user');
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      // Mirror cookie → sessionStorage on first read so subsequent lookups
      // are cheap and don't re-parse the cookie on every call.
      if (parsed) this.writeToStorage(parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  setUserLanguage(languageId: string): UserInfo | null {
    const current = this.getStoredUserInfo();
    const nextLanguage = String(languageId || '').trim();
    if (!current || !nextLanguage) {
      return current;
    }

    const normalizedLanguage = nextLanguage;
    const languageLabel = normalizedLanguage.split('-')[0]?.toUpperCase() || normalizedLanguage.toUpperCase();
    const nextUser: UserInfo = {
      ...current,
      language: normalizedLanguage,
      lingua: {
        id: normalizedLanguage,
        lingua: languageLabel
      }
    };

    this.writeToStorage(nextUser);
    try {
      this.cookieService.set('k-user', JSON.stringify(nextUser), undefined, '/');
    } catch {
      // ignore — sessionStorage is the source of truth
    }
    return nextUser;
  }
}
