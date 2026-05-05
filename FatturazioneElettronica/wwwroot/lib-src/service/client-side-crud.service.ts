import { Injectable } from '@angular/core';
import { DataSourceComponent } from '../component/data-source/data-source.component';
import { ResultInfo } from '../class/resultInfo';
import { MetadataProviderService } from './metadata-provider.service';

type LocalCrudOperation = 'insert' | 'update' | 'delete';

interface LocalCrudRow {
  id?: number;
  route: string;
  user_id: string;
  pk_name: string;
  pk_value?: string;
  guid?: string;
  payload: any;
  dirty: boolean;
  deleted: boolean;
  inserted: boolean;
  op?: LocalCrudOperation;
  inserted_at?: number | null;
  modified_at?: number | null;
  deleted_at?: number | null;
  created_at: number;
  updated_at: number;
}

type LocalCrudDb = {
  rows: any;
};

@Injectable({
  providedIn: 'root'
})
export class ClientSideCrudService {
  private db?: LocalCrudDb;
  private dbInitPromise?: Promise<LocalCrudDb>;
  private readonly localModePrefix = '__wuic_client_side_crud_mode__';

  /**
   * Inizializza una sola volta il database Dexie locale (`WuicClientSideCrudDB`) e ne riusa l'istanza.
   * @returns Istanza DB locale usata per cache/sync CRUD client-side.
   */
  private async getDb(): Promise<LocalCrudDb> {
    if (this.db) {
      return this.db;
    }

    if (!this.dbInitPromise) {
      this.dbInitPromise = import('dexie')
        .then(({ default: Dexie }) => {
          const db = new Dexie('WuicClientSideCrudDB') as any;
          db.version(1).stores({
            rows: '++id,route,user_id,pk_name,pk_value,guid,dirty,deleted,op,created_at,updated_at,[route+user_id],[route+user_id+pk_value],[route+user_id+guid]'
          });
          db.version(2).stores({
            rows: '++id,route,user_id,pk_name,pk_value,guid,dirty,deleted,inserted,op,inserted_at,modified_at,deleted_at,created_at,updated_at,[route+user_id],[route+user_id+pk_value],[route+user_id+guid],[route+user_id+dirty],[route+user_id+op],[route+user_id+dirty+op]'
          }).upgrade((tx: any) => {
            return tx.table('rows').toCollection().modify((row: LocalCrudRow) => {
              const now = Date.now();
              if (row.inserted === undefined) {
                row.inserted = row.op === 'insert';
              }
              if (row.inserted_at === undefined) {
                row.inserted_at = row.created_at || now;
              }
              if (row.modified_at === undefined) {
                row.modified_at = row.updated_at || row.created_at || now;
              }
              if (row.deleted_at === undefined) {
                row.deleted_at = row.deleted ? (row.updated_at || now) : null;
              }
            });
          });

          this.db = db;
          return db;
        })
        .finally(() => {
          this.dbInitPromise = undefined;
        });
    }

    return await this.dbInitPromise;
  }

  private clone<T>(value: T): T {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  /**
   * Normalizza il payload in una forma coerente per i passaggi successivi.
   * @param route Route applicativa coinvolta nell'operazione.
   * @returns Valore restituito dal metodo (string).
   */
  private normalizeRoute(route: any): string {
    return route == null ? '' : String(route).trim();
  }

  /**
   * Normalizza il payload in una forma coerente per i passaggi successivi.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @returns Valore restituito dal metodo (string).
   */
  private normalizeUserId(userId: any): string {
    if (userId === null || userId === undefined) {
      return '__anonymous__';
    }

    const normalized = String(userId).trim();
    return normalized || '__anonymous__';
  }

  /**
   * Estrae la route metadata dal datasource corrente.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @returns Nome route (`md_route_name`) o stringa vuota.
   */
  private getRoute(scope: DataSourceComponent): string {
    return this.normalizeRoute(scope?.metaInfo?.tableMetadata?.md_route_name);
  }

  /**
   * Risolve il nome colonna primary key della route, con fallback su `id`.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @returns Nome campo PK.
   */
  private getPkName(scope: DataSourceComponent): string {
    return MetadataProviderService.getPKeys(scope.metaInfo.columnMetadata)?.[0]?.mc_nome_colonna || 'id';
  }

  /**
   * Estrae il valore PK serializzato da un payload entita usando il nome campo indicato.
   * @param payload Payload richiesta/risposta usato nel metodo.
   * @param pkName Nome della colonna PK da usare per estrarre il valore dal payload.
   * @returns PK in formato stringa oppure `undefined` se assente.
   */
  private getPkValue(payload: any, pkName: string): string | undefined {
    const value = payload?.[pkName];
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    return String(value);
  }

  /**
   * Cerca una riga nel DB client-side per route+utente usando priorita su GUID, con fallback su primary key.
   * @param route Route applicativa coinvolta nell'operazione.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @param pkValue Valore PK della riga (usato come fallback se GUID non disponibile).
   * @param guid GUID locale della riga.
   * @returns Riga locale trovata oppure `undefined`.
   */
  private async findRow(route: string, userId: string, pkValue?: string, guid?: string): Promise<LocalCrudRow | undefined> {
    const db = await this.getDb();
    if (pkValue) {
      const byPk = await db.rows.where('[route+user_id+pk_value]').equals([route, userId, pkValue]).first();
      if (byPk) {
        return byPk;
      }
    }

    if (guid) {
      return await db.rows.where('[route+user_id+guid]').equals([route, userId, guid]).first();
    }

    return undefined;
  }

  /**
   * Genera una PK temporanea client-side per nuove righe non ancora persistite su server.
   * @returns Identificativo negativo con prefisso `tmp_`.
   */
  private getTempPk(): string {
    return `__local_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }

  /**
   * Costruisce la chiave localStorage che abilita/disabilita la modalita CRUD locale per route+utente.
   * @param route Route applicativa coinvolta nell'operazione.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @returns Chiave storage del flag modalita locale.
   */
  private getModeKey(route: string, userId: string): string {
    return `${this.localModePrefix}${userId}__${route}`;
  }

  /**
   * Attiva/disattiva il flag modalita CRUD locale per route+utente in localStorage.
   * @param route Route applicativa coinvolta nell'operazione.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @param enabled Stato modalita locale da salvare.
   */
  private setModeEnabled(route: string, userId: string, enabled: boolean): void {
    const key = this.getModeKey(route, userId);
    if (enabled) {
      localStorage.setItem(key, '1');
    } else {
      localStorage.removeItem(key);
    }
  }

  /**
   * Valuta una condizione booleana sullo stato o sull'input corrente.
   * Legge/scrive dati persistenti su storage browser.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @returns Valore restituito dal metodo (Promise<boolean>).
   */
  async isModeEnabled(scope: DataSourceComponent, userId: string | number): Promise<boolean> {
    const route = this.getRoute(scope);
    const normalizedUserId = this.normalizeUserId(userId);
    if (!route) {
      return false;
    }

    return localStorage.getItem(this.getModeKey(route, normalizedUserId)) === '1';
  }

  /**
   * Abilita la route in modalita CRUD locale popolando la tabella locale con `allRows`.
   * Normalizza ogni record con GUID/PK/flag di stato e salva anche il marker di modalita in localStorage.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @param allRows Righe iniziali da cache-are localmente.
   */
  async enable(scope: DataSourceComponent, userId: string | number, allRows: any[]): Promise<void> {
    const db = await this.getDb();
    const route = this.getRoute(scope);
    const normalizedUserId = this.normalizeUserId(userId);
    const pkName = this.getPkName(scope);
    const now = Date.now();

    if (!route) {
      return;
    }

    const rows: LocalCrudRow[] = (allRows || []).map((item) => {
      const payload = this.clone(item) || {};
      const guid = payload.__guid ? String(payload.__guid) : undefined;
      const pkValue = this.getPkValue(payload, pkName);

      return {
        route,
        user_id: normalizedUserId,
        pk_name: pkName,
        pk_value: pkValue,
        guid,
        payload,
        dirty: false,
        deleted: false,
        inserted: false,
        inserted_at: now,
        modified_at: now,
        deleted_at: null,
        created_at: now,
        updated_at: now
      };
    });

    await (db as any).transaction('rw', (db as any).rows, async () => {
      await db.rows.where('[route+user_id]').equals([route, normalizedUserId]).delete();
      if (rows.length) {
        await db.rows.bulkAdd(rows);
      }
    });

    this.setModeEnabled(route, normalizedUserId, true);
  }

  /**
   * Esegue l'operazione dati implementata da `select`.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @param all Flag che abilita caricamento completo dataset.
   * @param resultInfo Struttura risultato da popolare/aggiornare.
   * @returns Valore restituito dal metodo (Promise<ResultInfo>).
   */
  async select(scope: DataSourceComponent, userId: string | number, all: boolean, resultInfo?: ResultInfo): Promise<ResultInfo> {
    const db = await this.getDb();
    const route = this.getRoute(scope);
    const normalizedUserId = this.normalizeUserId(userId);
    const rows = await db.rows.where('[route+user_id]').equals([route, normalizedUserId]).toArray();

    let items = rows
      .filter(r => !r.deleted)
      .map(r => this.clone(r.payload))
      .filter(x => !!x);

    const filters = scope.filterInfo?.filters || [];
    if (filters.length) {
      items = items.filter((item) => {
        return filters.every((f: any) => {
          const itemValue = item[f.field];
          const fieldValue = f.value;
          const op = (f.operatore || 'eq').toString().toLowerCase();

          switch (op) {
            case 'eq':
            case '=':
              return String(itemValue ?? '') === String(fieldValue ?? '');
            case 'neq':
              return String(itemValue ?? '') !== String(fieldValue ?? '');
            case 'contains':
              return String(itemValue ?? '').toLowerCase().indexOf(String(fieldValue ?? '').toLowerCase()) >= 0;
            case 'startswith':
              return String(itemValue ?? '').toLowerCase().startsWith(String(fieldValue ?? '').toLowerCase());
            case 'endswith':
              return String(itemValue ?? '').toLowerCase().endsWith(String(fieldValue ?? '').toLowerCase());
            case 'gt':
              return Number(itemValue) > Number(fieldValue);
            case 'gte':
              return Number(itemValue) >= Number(fieldValue);
            case 'lt':
              return Number(itemValue) < Number(fieldValue);
            case 'lte':
              return Number(itemValue) <= Number(fieldValue);
            case 'isnull':
              return itemValue == null;
            case 'eqor':
              return String(fieldValue ?? '').split(',').map(x => x.trim()).includes(String(itemValue ?? ''));
            case 'between': {
              let from: any = null;
              let to: any = null;
              try {
                const parsed = typeof fieldValue === 'string' ? JSON.parse(fieldValue) : fieldValue;
                from = parsed?.from ?? null;
                to = parsed?.to ?? null;
              } catch {
                from = null;
                to = null;
              }

              if (from === null || from === '' || to === null || to === '') {
                return true;
              }

              const itemAsNumber = Number(itemValue);
              const fromAsNumber = Number(from);
              const toAsNumber = Number(to);
              if (!Number.isNaN(itemAsNumber) && !Number.isNaN(fromAsNumber) && !Number.isNaN(toAsNumber)) {
                return itemAsNumber >= fromAsNumber && itemAsNumber <= toAsNumber;
              }

              const itemDate = new Date(itemValue as any).getTime();
              const fromDate = new Date(from as any).getTime();
              const toDate = new Date(to as any).getTime();
              if (!Number.isNaN(itemDate) && !Number.isNaN(fromDate) && !Number.isNaN(toDate)) {
                return itemDate >= fromDate && itemDate <= toDate;
              }

              const itemString = String(itemValue ?? '');
              const fromString = String(from ?? '');
              const toString = String(to ?? '');
              return itemString >= fromString && itemString <= toString;
            }
            default:
              return true;
          }
        });
      });
    }

    const sortInfo = scope.sortInfo || [];
    if (sortInfo.length) {
      items = items.sort((a, b) => {
        for (const s of sortInfo) {
          const field = s.field;
          const dir = s.dir === 'desc' ? -1 : 1;
          const av = a?.[field];
          const bv = b?.[field];

          if (av === bv) {
            continue;
          }

          if (av == null) {
            return -1 * dir;
          }

          if (bv == null) {
            return 1 * dir;
          }

          if (av > bv) {
            return 1 * dir;
          }

          if (av < bv) {
            return -1 * dir;
          }
        }

        return 0;
      });
    }

    const total = items.length;
    const pageSize = Number(scope.pageSize || 0);
    const currentPage = Math.max(1, Number(scope.currentPage || 1));
    if (pageSize > 0) {
      const start = (currentPage - 1) * pageSize;
      items = items.slice(start, start + pageSize);
    }

    const out = resultInfo || new ResultInfo();
    out.dato = all ? items : (items[0] ? [items[0]] : []);
    out.current = out.dato.length ? scope.getObservable(out.dato[0]) : null;
    out.totalRowCount = total;
    out.Agg = null;
    out.route = route;

    return out;
  }

  /**
   * Esegue l'operazione dati implementata da `insert`.
   * @param entity Entita dati target della mutazione.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @returns Valore restituito dal metodo (Promise<any>).
   */
  async insert(entity: any, scope: DataSourceComponent, userId: string | number): Promise<any> {
    const db = await this.getDb();
    const route = this.getRoute(scope);
    const normalizedUserId = this.normalizeUserId(userId);
    const pkName = this.getPkName(scope);
    const now = Date.now();
    const payload = this.clone(entity) || {};

    if (payload[pkName] == null || payload[pkName] === '') {
      payload[pkName] = this.getTempPk();
    }

    const guid = payload.__guid ? String(payload.__guid) : undefined;
    const pkValue = this.getPkValue(payload, pkName);

    await db.rows.add({
      route,
      user_id: normalizedUserId,
      pk_name: pkName,
      pk_value: pkValue,
      guid,
      payload,
      dirty: true,
      deleted: false,
      inserted: true,
      op: 'insert',
      inserted_at: now,
      modified_at: now,
      deleted_at: null,
      created_at: now,
      updated_at: now
    });

    return payload;
  }

  /**
   * Esegue l'operazione dati implementata da `update`.
   * @param entity Entita dati target della mutazione.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @returns Valore restituito dal metodo (Promise<any>).
   */
  async update(entity: any, scope: DataSourceComponent, userId: string | number): Promise<any> {
    const db = await this.getDb();
    const route = this.getRoute(scope);
    const normalizedUserId = this.normalizeUserId(userId);
    const pkName = this.getPkName(scope);
    const payload = this.clone(entity) || {};
    const pkValue = this.getPkValue(payload, pkName);
    const guid = payload.__guid ? String(payload.__guid) : undefined;
    const existing = await this.findRow(route, normalizedUserId, pkValue, guid);
    const now = Date.now();

    if (!existing) {
      return this.insert(entity, scope, normalizedUserId);
    }

    const nextPayload = Object.assign({}, existing.payload || {}, payload);
    const nextOp: LocalCrudOperation = existing.op === 'insert' ? 'insert' : 'update';

    await (db as any).transaction('rw', (db as any).rows, async () => {
      await db.rows.update(existing.id!, {
        payload: nextPayload,
        pk_value: this.getPkValue(nextPayload, pkName),
        guid: nextPayload.__guid ? String(nextPayload.__guid) : existing.guid,
        dirty: true,
        deleted: false,
        inserted: nextOp === 'insert',
        op: nextOp,
        modified_at: now,
        deleted_at: null,
        updated_at: now
      });
    });

    return nextPayload;
  }

  /**
   * Rimuove i dati target aggiornando lo stato del servizio.
   * @param entity Entita dati target della mutazione.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @returns Valore restituito dal metodo (Promise<any>).
   */
  async delete(entity: any, scope: DataSourceComponent, userId: string | number): Promise<any> {
    const db = await this.getDb();
    const route = this.getRoute(scope);
    const normalizedUserId = this.normalizeUserId(userId);
    const pkName = this.getPkName(scope);
    const payload = this.clone(entity) || {};
    const pkValue = this.getPkValue(payload, pkName);
    const guid = payload.__guid ? String(payload.__guid) : undefined;
    const existing = await this.findRow(route, normalizedUserId, pkValue, guid);

    if (!existing) {
      return payload;
    }

    if (existing.op === 'insert') {
      await db.rows.delete(existing.id!);
      return existing.payload;
    }

    await db.rows.update(existing.id!, {
      dirty: true,
      deleted: true,
      inserted: false,
      op: 'delete',
      modified_at: Date.now(),
      deleted_at: Date.now(),
      updated_at: Date.now()
    });

    return existing.payload;
  }

  async disableAndSync(
    scope: DataSourceComponent,
    userId: string | number,
    remote: {
      insert: (entity: any) => Promise<any>;
      update: (entity: any) => Promise<any>;
      delete: (entity: any) => Promise<any>;
    }
  ): Promise<{ inserted: number; updated: number; deleted: number }> {
    const db = await this.getDb();
    const route = this.getRoute(scope);
    const normalizedUserId = this.normalizeUserId(userId);
    if (!route) {
      return { inserted: 0, updated: 0, deleted: 0 };
    }

    const getDirtyRowsByOp = async (op: LocalCrudOperation): Promise<LocalCrudRow[]> => {
      const rows = await (db.rows as any)
        .where('[route+user_id+dirty+op]')
        .equals([route, normalizedUserId, true, op])
        .toArray();

      return rows.sort((a: LocalCrudRow, b: LocalCrudRow) =>
        (a.modified_at || a.updated_at || a.created_at) - (b.modified_at || b.updated_at || b.created_at)
      );
    };

    const [insertRows, updateRows, deleteRows] = await Promise.all([
      getDirtyRowsByOp('insert'),
      getDirtyRowsByOp('update'),
      getDirtyRowsByOp('delete')
    ]);

    let inserted = 0;
    let updated = 0;
    let deleted = 0;

    for (const row of insertRows) {
      await remote.insert(this.clone(row.payload));
      inserted++;
    }

    for (const row of updateRows) {
      await remote.update(this.clone(row.payload));
      updated++;
    }

    for (const row of deleteRows) {
      await remote.delete(this.clone(row.payload));
      deleted++;
    }

    await (db as any).transaction('rw', (db as any).rows, async () => {
      await db.rows.where('[route+user_id]').equals([route, normalizedUserId]).delete();
    });
    this.setModeEnabled(route, normalizedUserId, false);

    return { inserted, updated, deleted };
  }

  /**
   * Pulisce lo stato runtime e le cache associate.
   * @param scope Datasource/scope operativo su cui applicare la logica.
   * @param userId Identificativo utente usato per contesto e persistenza.
   * @returns Valore restituito dal metodo (Promise<void>).
   */
  async clearRoute(scope: DataSourceComponent, userId: string | number): Promise<void> {
    const db = await this.getDb();
    const route = this.getRoute(scope);
    const normalizedUserId = this.normalizeUserId(userId);
    if (!route) {
      return;
    }

    await (db as any).transaction('rw', (db as any).rows, async () => {
      await db.rows.where('[route+user_id]').equals([route, normalizedUserId]).delete();
    });
    this.setModeEnabled(route, normalizedUserId, false);
  }
}
