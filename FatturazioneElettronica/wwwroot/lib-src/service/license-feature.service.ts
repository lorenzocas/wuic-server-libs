import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Observable } from 'rxjs';
import { WtoolboxService } from './wtoolbox.service';

/**
 * Shape of the response returned by `/api/Meta/LicenseStatus` (GET).
 * The endpoint is defined in `Controllers/MetaController.cs` LicenseStatus action.
 */
export interface LicenseStatusResponse {
  machineFingerprint?: string;
  licenseValid?: boolean;
  licenseReason?: string;
  licenseExpiryUtc?: string | null;
  licenseEmail?: string;
  maintenanceExpiryUtc?: string | null;
  tier?: string;
  features?: string[];
  /**
   * DBMS utilizzato dal backend per il **DB DATI** (`AppSettings.dbms`):
   * `'mssql'` o `'mysql'`. Aggiunto 2026-04-28 per il tooltip license del
   * meta-menu — sysadmin vede a colpo d'occhio su quale provider gira il
   * deploy.
   */
  dataDbms?: string;
  /**
   * DBMS utilizzato dal backend per il **DB METADATI** (`AppSettings.meta-dbms`).
   * Tipicamente uguale a `dataDbms` ma puo' divergere quando
   * `allowMultipleDBMS=true` (es. data MySQL + metadata MSSQL).
   */
  metaDbms?: string;
}

/**
 * Client-side view of the current license. Exposes synchronous `has(feature)`
 * predicate for use in templates, directives, guards, and components.
 *
 * Lifecycle:
 *   1) App bootstrap calls `refresh()` once.
 *   2) All `*wuicFeature` directives and `FeatureRouteGuard` read from the
 *      cached snapshot via `has()`.
 *   3) On license change (upgrade via new appsettings.json) restart the app
 *      OR call `refresh()` again to re-fetch.
 *
 * IMPORTANT: this service is a UX layer only. The real security is server-side
 * (see `SanitizeBoardContent` + `[RequireFeature]` + data-decoration in
 * `AsmxCrudRead`). A client can patch this service and unlock everything locally,
 * but the server will still refuse premium operations.
 */
@Injectable({ providedIn: 'root' })
export class LicenseFeatureService {

  private static readonly ALWAYS_ALLOWED_ARCHETYPES = new Set([
    'list', 'kanban', 'dialog', 'edit', 'detail', 'form',
    'chart', 'tree', 'carousel', 'map', 'scheduler'
  ]);

  private statusSubject = new BehaviorSubject<LicenseStatusResponse | null>(null);
  private loadedOnce = false;
  /**
   * Promise risolta dopo il PRIMO `refresh()` (success or fail-closed).
   * Usata dai route guard per attendere che lo snapshot iniziale sia
   * disponibile prima di decidere access → evita race post-refresh pagina
   * dove il guard partiva con `statusSubject.value === null` e denyava la
   * feature anche con licenza valida.
   */
  private readyResolve: (() => void) | null = null;
  private readyPromise: Promise<void> = new Promise<void>((resolve) => {
    this.readyResolve = resolve;
  });

  constructor(private http: HttpClient) { }

  /**
   * Ritorna una Promise che risolve quando il primo `refresh()` ha completato
   * (con successo o con fail-closed fallback). Dopo il primo load, ritorna
   * una Promise gia' risolta → overhead zero. Il guard la await per decidere
   * solo con snapshot reale, non con `null` iniziale.
   */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Observable of the current license status snapshot. Emits `null` until the
   * first `refresh()` completes.
   */
  status$(): Observable<LicenseStatusResponse | null> {
    return this.statusSubject.asObservable();
  }

  /**
   * Synchronous accessor to the cached snapshot. Returns `null` if not yet loaded.
   */
  snapshot(): LicenseStatusResponse | null {
    return this.statusSubject.value;
  }

  /**
   * Fetches `/api/Meta/LicenseStatus` and caches the result. Returns the promise
   * so callers (like an APP_INITIALIZER) can await it.
   */
  async refresh(): Promise<LicenseStatusResponse | null> {
    try {
      const url = this.resolveLicenseStatusUrl();
      const resp = await firstValueFrom(this.http.get<LicenseStatusResponse>(url));
      this.statusSubject.next(resp ?? null);
      this.loadedOnce = true;
      this.signalReady();
      return resp;
    } catch {
      // Fail-closed on network/auth error: treat as base tier. Server-side gates
      // still enforce security; we just degrade UX.
      this.statusSubject.next({ licenseValid: false, tier: '', features: [] });
      this.loadedOnce = true;
      this.signalReady();
      return null;
    }
  }

  /** Idempotent: il primo refresh risolve `readyPromise`; i successivi no-op. */
  private signalReady(): void {
    if (this.readyResolve) {
      const r = this.readyResolve;
      this.readyResolve = null;
      r();
    }
  }

  /**
   * Returns true when the current license includes the given feature flag.
   * Returns `false` when:
   *   - license not yet loaded (conservative default);
   *   - license is invalid;
   *   - feature is not in the `features` array.
   */
  has(feature: string): boolean {
    if (!feature) return false;
    const snap = this.statusSubject.value;
    if (!snap || !snap.licenseValid) return false;
    const f = feature.trim().toLowerCase();
    return (snap.features ?? []).some(x => (x ?? '').trim().toLowerCase() === f);
  }

  /**
   * Returns true when the archetype (e.g. "spreadsheet", "pivot-grid", "list")
   * is permitted by the current license. Archetypes in the always-allowed set
   * (list, kanban, chart, ...) return true unconditionally.
   */
  isArchetypeAllowed(archetype: string): boolean {
    if (!archetype) return true;
    const a = archetype.trim().toLowerCase();
    if (LicenseFeatureService.ALWAYS_ALLOWED_ARCHETYPES.has(a)) return true;

    const required = this.archetypeToFeature(a);
    if (!required) return true; // unknown archetype → assume base
    return this.has(required);
  }

  /**
   * Mirrors the server-side `LicenseFeatureMap.ArchetypeFeatureMap`. Kept
   * hardcoded on both sides so a patched client gets UX unlock, but the
   * server-side gate (boardcontent sanitizer + data-decoration) still enforces.
   */
  private archetypeToFeature(archetype: string): string | null {
    switch (archetype) {
      case 'spreadsheet':         return 'spreadsheet';
      case 'pivot-grid':
      case 'pivot':               return 'pivot-grid';
      case 'workflow':
      case 'workflow-designer':   return 'workflow-designer';
      case 'report':
      case 'report-designer':     return 'report-designer';
      case 'rag-chatbot':         return 'rag-chatbot';
      case 'dashboard-designer':  return 'dashboard-designer';
      case 'offline-crud':        return 'offline-crud';
      default:                    return null;
    }
  }

  /**
   * Builds the LicenseStatus endpoint URL from `global_root_url`. The root is
   * typically `"/api/Meta/AsmxProxy/"` (AsmxProxy pattern) or `"/api/Meta/"`
   * (direct). LicenseStatus is a direct GET action on MetaController, so we
   * strip any trailing `AsmxProxy/` segment before appending the action name.
   */
  private resolveLicenseStatusUrl(): string {
    const base = (WtoolboxService.appSettings as any)?.global_root_url ?? '/api/Meta/';
    const trimmed = (base as string).replace(/AsmxProxy\/?$/i, '');
    const normalized = trimmed.endsWith('/') ? trimmed : (trimmed + '/');
    return normalized + 'LicenseStatus';
  }
}
