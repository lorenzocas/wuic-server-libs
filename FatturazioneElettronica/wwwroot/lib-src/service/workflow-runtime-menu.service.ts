import { Injectable } from '@angular/core';
import type { MenuItem } from 'primeng/api';
import { BehaviorSubject } from 'rxjs';
import { WorkflowRuntimeMetadataService } from './workflow-runtime-metadata.service';

export type WorkflowRuntimeMenuState = {
  items: MenuItem[];
  exclusive: boolean;
};

@Injectable({
  providedIn: 'root'
})
export class WorkflowRuntimeMenuService {
  private readonly storageKey = 'wuic.workflow.runtime.menu.v1';
  private readonly runtimeMenusSubject = new BehaviorSubject<WorkflowRuntimeMenuState>({ items: [], exclusive: false });
  readonly runtimeMenus$ = this.runtimeMenusSubject.asObservable();

  constructor() {
    this.restoreFromStorage();
  }

  get snapshot(): WorkflowRuntimeMenuState {
    return this.runtimeMenusSubject.value || { items: [], exclusive: false };
  }

  /**
   * Aggiorna lo stato menu runtime esposto dallo stream `runtimeMenus$`.
   * Clona i nodi in formato serializzabile, applica decorazioni command-specific e persiste lo stato in sessionStorage.
   * @param items Struttura menu runtime da pubblicare.
   * @param exclusive Se `true` il menu runtime sostituisce quello standard.
   */
  setRuntimeMenus(items: MenuItem[], exclusive: boolean = false): void {
    const safeItems = this.decorateMenuItems(this.cloneSerializableMenuItems(items));
    const safeExclusive = !!exclusive;
    this.runtimeMenusSubject.next({
      items: safeItems,
      exclusive: safeExclusive
    });
    this.persistToStorage(safeItems, safeExclusive);
  }

  /**
   * Pulisce lo stato runtime e le cache associate.
   */
  clearRuntimeMenus(): void {
    this.runtimeMenusSubject.next({ items: [], exclusive: false });
    this.removePersistedStorage();
  }

  /**
   * Salva in sessionStorage una versione serializzabile dei menu runtime (senza funzioni/command non serializzabili).
   * @param items Menu da persistere.
   * @param exclusive Flag di modalita esclusiva menu runtime.
   */
  private persistToStorage(items: MenuItem[], exclusive: boolean): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(this.storageKey, JSON.stringify({
        items: this.cloneSerializableMenuItems(items),
        exclusive: !!exclusive
      }));
    } catch {
      // Ignore storage write errors.
    }
  }

  /**
   * Ripristina i menu runtime da sessionStorage al bootstrap servizio e riapplica le decorazioni command.
   */
  private restoreFromStorage(): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    try {
      const raw = storage.getItem(this.storageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw || '{}') || {};
      const items = this.decorateMenuItems(this.cloneSerializableMenuItems(parsed.items || []));
      const exclusive = !!parsed.exclusive;
      this.runtimeMenusSubject.next({ items, exclusive });
    } catch {
      this.removePersistedStorage();
    }
  }

  /**
   * Rimuove i dati target aggiornando lo stato del servizio.
   */
  private removePersistedStorage(): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.removeItem(this.storageKey);
    } catch {
      // Ignore storage errors.
    }
  }

  /**
   * Restituisce lo storage usato per persistere menu runtime (`sessionStorage`) con guard per ambienti senza Web Storage.
   * @returns Oggetto Storage disponibile oppure `null`.
   */
  private getStorage(): Storage | null {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    return sessionStorage;
  }

  /**
   * Esegue l'operazione dati implementata da `cloneSerializableMenuItems`.
   * @param items Elementi menu/collezione da trasformare.
   * @returns Valore restituito dal metodo (MenuItem[]).
   */
  private cloneSerializableMenuItems(items: MenuItem[]): MenuItem[] {
    if (!Array.isArray(items)) {
      return [];
    }

    return items.map((row) => {
      const item: MenuItem = {
        label: String(row?.label || ''),
        icon: String(row?.icon || ''),
        route: String((row as any)?.route || ''),
        url: String(row?.url || ''),
        target: String(row?.target || ''),
        styleClass: String(row?.styleClass || ''),
        disabled: !!row?.disabled,
        separator: !!row?.separator
      };

      const children = this.cloneSerializableMenuItems((row?.items || []) as MenuItem[]);
      if (children.length) {
        item.items = children;
      }
      return item;
    });
  }

  /**
   * Applica command runtime ai nodi menu serializzati.
   * In particolare il nodo con route `/` pulisce `WorkflowRuntimeMetadataService` e menu runtime per uscire dal contesto workflow.
   * @param items Collezione menu da decorare ricorsivamente.
   * @returns Nuova collezione con command ricostruiti.
   */
  private decorateMenuItems(items: MenuItem[]): MenuItem[] {
    return (Array.isArray(items) ? items : []).map((row) => {
      const current: MenuItem = { ...row };
      const route = String((current as any)?.route || '').trim();
      if (route === '/') {
        current.command = () => {
          WorkflowRuntimeMetadataService.getInstance()?.clear();
          this.clearRuntimeMenus();
        };
      }

      const children = this.decorateMenuItems((current.items || []) as MenuItem[]);
      if (children.length) {
        current.items = children;
      } else {
        delete current.items;
      }
      return current;
    });
  }
}
