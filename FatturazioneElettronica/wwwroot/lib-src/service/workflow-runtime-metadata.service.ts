import { Injectable } from '@angular/core';

export type WorkflowRuntimeRouteMetadataEntry = {
  route: string;
  action?: string;
  metadata: any;
};

export type WorkflowRuntimeLinkedActionRouteMetadataEntry = {
  sourceRoute: string;
  tableActionId: number;
  targetRoute: string;
  targetAction?: string;
  metadata: any;
};

export type WorkflowRuntimeRouteNodePayloadEntry = {
  nodeId: string;
  route: string;
  action?: string;
  payload?: any;
};

export type WorkflowRuntimePreviousRouteNodeEntry = {
  routeNodeId: string;
  previousRouteNodeId?: string;
  previousRoute?: string;
  previousAction?: string;
};

@Injectable({
  providedIn: 'root'
})
export class WorkflowRuntimeMetadataService {
  private static instance?: WorkflowRuntimeMetadataService;
  private readonly storageKey = 'wuic.workflow.runtime.metadata.v1';
  private readonly byRouteAction = new Map<string, any>();
  private readonly byRoute = new Map<string, any>();
  private readonly linkedBySourceAction = new Map<string, WorkflowRuntimeLinkedActionRouteMetadataEntry[]>();
  private readonly pendingByRouteAction = new Map<string, any>();
  private readonly pendingByRoute = new Map<string, any>();
  private readonly routeNodePayloadByNodeId = new Map<string, any>();
  private readonly routeNodeIdsByRouteAction = new Map<string, string[]>();
  private readonly routeNodeIdsByRoute = new Map<string, string[]>();
  private readonly previousRouteNodeByRouteNodeId = new Map<string, { routeNodeId: string; route: string; action: string; }>();

  /**
   * Inizializza il singleton runtime metadata e prova il restore dello stato persistito da sessionStorage.
   */
  constructor() {
    WorkflowRuntimeMetadataService.instance = this;
    this.restoreFromStorage();
  }

  /**
   * Restituisce l'istanza singleton runtime metadata inizializzata dal DI Angular.
   * Utile per accessi statici da utility/service non iniettati.
   * @returns Istanza corrente del servizio oppure `undefined` se non ancora bootstrap.
   */
  static getInstance(): WorkflowRuntimeMetadataService | undefined {
    return WorkflowRuntimeMetadataService.instance;
  }

  /**
   * Reinizializza gli indici metadata runtime per route/azione a partire dalle entry ricevute dal server.
   * Popola sia la mappa specifica `route::action` sia il fallback per sola route e persiste il risultato in session storage.
   * @param entries Elenco metadata runtime per route/azione.
   */
  setRouteMetadata(entries: WorkflowRuntimeRouteMetadataEntry[]): void {
    this.byRouteAction.clear();
    this.byRoute.clear();

    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const route = String(entry?.route || '').trim().toLowerCase();
      if (!route) {
        return;
      }

      const action = String(entry?.action || '').trim().toLowerCase();
      const metadata = entry?.metadata ?? null;

      if (action) {
        this.byRouteAction.set(`${route}::${action}`, metadata);
      }

      if (!this.byRoute.has(route)) {
        this.byRoute.set(route, metadata);
      }
    });
    this.persistToStorage();
  }

  /**
   * Risolve i metadata runtime attivi per route/action usando priorita:
   * chiave specifica `route::action` e fallback metadata di sola route.
   * @param route Route applicativa coinvolta nell'operazione.
   * @param action Azione richiesta nel flusso corrente.
   * @returns Metadata runtime associato oppure `null`.
   */
  getRouteMetadata(route: string, action?: string): any | null {
    const safeRoute = String(route || '').trim().toLowerCase();
    if (!safeRoute) {
      return null;
    }

    const safeAction = String(action || '').trim().toLowerCase();
    if (safeAction) {
      const byAction = this.byRouteAction.get(`${safeRoute}::${safeAction}`);
      if (byAction !== undefined) {
        return byAction;
      }
    }

    if (this.byRoute.has(safeRoute)) {
      return this.byRoute.get(safeRoute);
    }

    return null;
  }

  /**
   * Pulisce lo stato runtime e le cache associate.
   */
  clear(): void {
    this.byRouteAction.clear();
    this.byRoute.clear();
    this.linkedBySourceAction.clear();
    this.pendingByRouteAction.clear();
    this.pendingByRoute.clear();
    this.routeNodePayloadByNodeId.clear();
    this.routeNodeIdsByRouteAction.clear();
    this.routeNodeIdsByRoute.clear();
    this.previousRouteNodeByRouteNodeId.clear();
    this.removePersistedStorage();
  }

  /**
   * Registra i collegamenti tra azioni sorgente e route di destinazione usati dalla navigazione workflow.
   * Per ogni record valido salva target route/action e relativo payload metadata in `linkedBySourceAction`.
   * @param entries Collegamenti sourceRoute+tableActionId -> targetRoute/targetAction.
   */
  setLinkedActionRouteMetadata(entries: WorkflowRuntimeLinkedActionRouteMetadataEntry[]): void {
    this.linkedBySourceAction.clear();

    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const sourceRoute = String(entry?.sourceRoute || '').trim().toLowerCase();
      const tableActionId = Number(entry?.tableActionId || 0);
      const targetRoute = String(entry?.targetRoute || '').trim().toLowerCase();
      if (!sourceRoute || !targetRoute || !Number.isFinite(tableActionId) || tableActionId <= 0) {
        return;
      }

      const key = `${sourceRoute}::${tableActionId}`;
      if (!this.linkedBySourceAction.has(key)) {
        this.linkedBySourceAction.set(key, []);
      }
      this.linkedBySourceAction.get(key)!.push({
        sourceRoute,
        tableActionId,
        targetRoute,
        targetAction: String(entry?.targetAction || '').trim().toLowerCase(),
        metadata: entry?.metadata ?? null
      });
    });
    this.persistToStorage();
  }

  /**
   * Attiva i metadata di navigazione collegati a una specifica azione tabellare, spostandoli nelle mappe "pending".
   * I metadata pending verranno consumati dalla prima apertura della route target (con o senza action).
   * @param sourceRoute Route sorgente da cui parte l'azione.
   * @param tableActionId Id dell'azione tabellare eseguita.
   */
  activateLinkedNavigationMetadata(sourceRoute: string, tableActionId: number): void {
    const route = String(sourceRoute || '').trim().toLowerCase();
    const actionId = Number(tableActionId || 0);
    if (!route || !Number.isFinite(actionId) || actionId <= 0) {
      return;
    }

    const key = `${route}::${actionId}`;
    const targets = this.linkedBySourceAction.get(key) || [];
    targets.forEach((entry) => {
      const targetRoute = String(entry?.targetRoute || '').trim().toLowerCase();
      const targetAction = String(entry?.targetAction || '').trim().toLowerCase();
      if (!targetRoute) {
        return;
      }

      if (targetAction) {
        this.pendingByRouteAction.set(`${targetRoute}::${targetAction}`, entry?.metadata ?? null);
      }
      if (!this.pendingByRoute.has(targetRoute)) {
        this.pendingByRoute.set(targetRoute, entry?.metadata ?? null);
      }
    });
    this.persistToStorage();
  }

  /**
   * Consuma (read-once) metadata pending per route/azione: se presenti li ritorna e li rimuove dallo stato runtime.
   * La lookup prova prima la chiave `route::action`, poi il fallback per sola route.
   * @param route Route che sta aprendo il datasource.
   * @param action Azione corrente opzionale.
   * @returns Metadata pending associato alla route (eventualmente action-specific) oppure `null`.
   */
  consumePendingRouteMetadata(route: string, action?: string): any | null {
    const safeRoute = String(route || '').trim().toLowerCase();
    if (!safeRoute) {
      return null;
    }

    const safeAction = String(action || '').trim().toLowerCase();
    if (safeAction) {
      const byActionKey = `${safeRoute}::${safeAction}`;
      if (this.pendingByRouteAction.has(byActionKey)) {
        const value = this.pendingByRouteAction.get(byActionKey);
        this.pendingByRouteAction.delete(byActionKey);
        this.persistToStorage();
        return value ?? null;
      }
    }

    if (this.pendingByRoute.has(safeRoute)) {
      const value = this.pendingByRoute.get(safeRoute);
      this.pendingByRoute.delete(safeRoute);
      this.persistToStorage();
      return value ?? null;
    }

    return null;
  }

  /**
   * Ricostruisce l'indice payload per nodo workflow (`nodeId -> payload`) e gli indici inversi per route e route+action.
   * Serve a recuperare il payload del nodo che ha aperto una route runtime.
   * @param entries Entry payload nodo con coordinate route/action.
   */
  setRouteNodePayloadEntries(entries: WorkflowRuntimeRouteNodePayloadEntry[]): void {
    this.routeNodePayloadByNodeId.clear();
    this.routeNodeIdsByRouteAction.clear();
    this.routeNodeIdsByRoute.clear();

    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const nodeId = String(entry?.nodeId || '').trim();
      if (!nodeId) {
        return;
      }

      const route = String(entry?.route || '').trim().toLowerCase();
      const action = String(entry?.action || '').trim().toLowerCase();
      this.routeNodePayloadByNodeId.set(nodeId, entry?.payload ?? null);

      if (route) {
        if (!this.routeNodeIdsByRoute.has(route)) {
          this.routeNodeIdsByRoute.set(route, []);
        }
        const routeIds = this.routeNodeIdsByRoute.get(route)!;
        if (!routeIds.includes(nodeId)) {
          routeIds.push(nodeId);
        }
      }

      if (route && action) {
        const key = `${route}::${action}`;
        if (!this.routeNodeIdsByRouteAction.has(key)) {
          this.routeNodeIdsByRouteAction.set(key, []);
        }
        const routeActionIds = this.routeNodeIdsByRouteAction.get(key)!;
        if (!routeActionIds.includes(nodeId)) {
          routeActionIds.push(nodeId);
        }
      }
    });
    this.persistToStorage();
  }

  /**
   * Aggiorna il payload runtime associato a un singolo nodo workflow.
   * @param nodeId Identificativo del route node.
   * @param payload Payload da associare al nodo.
   */
  setRouteNodePayload(nodeId: string, payload: any): void {
    const safeNodeId = String(nodeId || '').trim();
    if (!safeNodeId) {
      return;
    }
    this.routeNodePayloadByNodeId.set(safeNodeId, payload ?? null);
    this.persistToStorage();
  }

  /**
   * Recupera il payload runtime associato a un route node.
   * @param nodeId Identificativo tecnico usato per lookup/aggiornamento.
   * @returns Payload del nodo oppure `null` se non presente.
   */
  getRouteNodePayload(nodeId: string): any | null {
    const safeNodeId = String(nodeId || '').trim();
    if (!safeNodeId) {
      return null;
    }
    if (!this.routeNodePayloadByNodeId.has(safeNodeId)) {
      return null;
    }
    return this.routeNodePayloadByNodeId.get(safeNodeId) ?? null;
  }

  /**
   * Restituisce gli id nodi route associati alla route corrente, con precedenza all'indice route+action.
   * @param route Route applicativa coinvolta nell'operazione.
   * @param action Azione richiesta nel flusso corrente.
   * @returns Lista id route node compatibili con il contesto richiesto.
   */
  getRouteNodeIds(route: string, action?: string): string[] {
    const safeRoute = String(route || '').trim().toLowerCase();
    if (!safeRoute) {
      return [];
    }

    const safeAction = String(action || '').trim().toLowerCase();
    if (safeAction) {
      const idsByRouteAction = this.routeNodeIdsByRouteAction.get(`${safeRoute}::${safeAction}`);
      if (Array.isArray(idsByRouteAction) && idsByRouteAction.length) {
        return [...idsByRouteAction];
      }
    }

    const idsByRoute = this.routeNodeIdsByRoute.get(safeRoute);
    return Array.isArray(idsByRoute) ? [...idsByRoute] : [];
  }

  /**
   * Elimina payload nodo runtime:
   * senza `nodeId` svuota tutta la mappa, con `nodeId` rimuove solo la voce specifica.
   * In entrambi i casi sincronizza lo storage.
   * @param nodeId Id nodo da rimuovere; opzionale per clear globale.
   */
  clearRouteNodePayload(nodeId?: string): void {
    const safeNodeId = String(nodeId || '').trim();
    if (!safeNodeId) {
      this.routeNodePayloadByNodeId.clear();
      this.persistToStorage();
      return;
    }
    this.routeNodePayloadByNodeId.delete(safeNodeId);
    this.persistToStorage();
  }

  /**
   * Registra la relazione "nodo corrente -> nodo precedente" usata per funzioni back/navigation nel workflow runner.
   * Mantiene anche route/action del nodo precedente per consentire risoluzione contestuale.
   * @param entries Mappatura dei nodi precedenti calcolata dal runtime.
   */
  setPreviousRouteNodeEntries(entries: WorkflowRuntimePreviousRouteNodeEntry[]): void {
    this.previousRouteNodeByRouteNodeId.clear();

    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const routeNodeId = String(entry?.routeNodeId || '').trim();
      const previousRouteNodeId = String(entry?.previousRouteNodeId || '').trim();
      const previousRoute = String(entry?.previousRoute || '').trim();
      if (!routeNodeId || !previousRouteNodeId || !previousRoute) {
        return;
      }

      this.previousRouteNodeByRouteNodeId.set(routeNodeId, {
        routeNodeId: previousRouteNodeId,
        route: previousRoute,
        action: String(entry?.previousAction || '').trim().toLowerCase()
      });
    });
    this.persistToStorage();
  }

  /**
   * Recupera il nodo precedente partendo dall'id nodo corrente.
   * Restituisce la terna usata dal runner (`routeNodeId`, `route`, `action`) oppure `null`.
   * @param routeNodeId Id nodo corrente per cui cercare il predecessore.
   * @returns Informazioni del nodo precedente o `null` se non mappato.
   */
  getPreviousRouteNode(routeNodeId: string): { routeNodeId: string; route: string; action: string; } | null {
    const safeNodeId = String(routeNodeId || '').trim();
    if (!safeNodeId) {
      return null;
    }

    if (!this.previousRouteNodeByRouteNodeId.has(safeNodeId)) {
      return null;
    }
    return this.previousRouteNodeByRouteNodeId.get(safeNodeId) || null;
  }

  /**
   * Risolve il nodo precedente usando il contesto route/action corrente:
   * prende il primo routeNodeId compatibile (`getRouteNodeIds`) e ne legge il predecessore.
   * @param route Route corrente.
   * @param action Azione corrente opzionale.
   * @returns Nodo precedente risolto o `null` se non disponibile.
   */
  getPreviousRouteNodeByRoute(route: string, action?: string): { routeNodeId: string; route: string; action: string; } | null {
    const routeNodeIds = this.getRouteNodeIds(route, action);
    if (!routeNodeIds.length) {
      return null;
    }
    return this.getPreviousRouteNode(routeNodeIds[0]);
  }

  /**
   * Serializza tutte le mappe runtime in sessionStorage (`wuic.workflow.runtime.metadata.v1`) per mantenere stato fra refresh tab.
   */
  private persistToStorage(): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(this.storageKey, JSON.stringify({
        byRouteAction: Array.from(this.byRouteAction.entries()),
        byRoute: Array.from(this.byRoute.entries()),
        linkedBySourceAction: Array.from(this.linkedBySourceAction.entries()),
        pendingByRouteAction: Array.from(this.pendingByRouteAction.entries()),
        pendingByRoute: Array.from(this.pendingByRoute.entries()),
        routeNodePayloadByNodeId: Array.from(this.routeNodePayloadByNodeId.entries()),
        routeNodeIdsByRouteAction: Array.from(this.routeNodeIdsByRouteAction.entries()),
        routeNodeIdsByRoute: Array.from(this.routeNodeIdsByRoute.entries()),
        previousRouteNodeByRouteNodeId: Array.from(this.previousRouteNodeByRouteNodeId.entries())
      }));
    } catch {
      // Ignore storage write errors (quota/private mode).
    }
  }

  /**
   * Ripristina le mappe runtime da sessionStorage all'avvio servizio; se il payload e corrotto lo elimina.
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
      this.restoreMap(this.byRouteAction, parsed.byRouteAction);
      this.restoreMap(this.byRoute, parsed.byRoute);
      this.restoreMap(this.linkedBySourceAction, parsed.linkedBySourceAction);
      this.restoreMap(this.pendingByRouteAction, parsed.pendingByRouteAction);
      this.restoreMap(this.pendingByRoute, parsed.pendingByRoute);
      this.restoreMap(this.routeNodePayloadByNodeId, parsed.routeNodePayloadByNodeId);
      this.restoreMap(this.routeNodeIdsByRouteAction, parsed.routeNodeIdsByRouteAction);
      this.restoreMap(this.routeNodeIdsByRoute, parsed.routeNodeIdsByRoute);
      this.restoreMap(this.previousRouteNodeByRouteNodeId, parsed.previousRouteNodeByRouteNodeId);
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
   * Ripristina una mappa `Map<K,V>` da una struttura serializzata come array di tuple `[key, value]`.
   * Voci non valide vengono ignorate.
   * @param target Mappa destinazione da ricostruire.
   * @param entries Payload serializzato letto da storage.
   */
  private restoreMap<K, V>(target: Map<K, V>, entries: any): void {
    target.clear();
    if (!Array.isArray(entries)) {
      return;
    }
    entries.forEach((row: any) => {
      if (!Array.isArray(row) || row.length < 2) {
        return;
      }
      target.set(row[0] as K, row[1] as V);
    });
  }

  /**
   * Restituisce lo storage runtime (`sessionStorage`) usato per persistere metadata workflow fra refresh pagina.
   * @returns Oggetto Storage disponibile oppure `null` in ambienti non browser.
   */
  private getStorage(): Storage | null {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    return sessionStorage;
  }
}
