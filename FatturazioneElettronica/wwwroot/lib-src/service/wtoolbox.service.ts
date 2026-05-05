import { ApplicationRef, createComponent, EmbeddedViewRef, EnvironmentInjector, Injectable, Injector, Type } from '@angular/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import type { Confirmation } from 'primeng/api';
import { DataProviderService } from './data-provider.service';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Observable, Subject } from 'rxjs';
import { Router } from '@angular/router';
import { MetadatiColonna } from '../class/metadati_colonna';
import { MetadatiCustomActionTabella } from '../class/metadati_custom_actions_tabelle';
import { MetaInfo } from '../class/metaInfo';
import { DialogService } from 'primeng/dynamicdialog';
import { TranslationManagerService } from './translation-manager.service';
import { GlobalHandler } from '../handler/GlobalHandler';
import { WorkflowRuntimeMetadataService } from './workflow-runtime-metadata.service';
import { UserInfoService } from './user-info.service';
import { WuicClientException } from '../exception/WuicClientException';
import { WuicErrorCodes } from '../exception/WuicErrorCodes';

@Injectable({
  providedIn: 'root'
})
export class WtoolboxService {
  /**
   * Route corrente del metadata-editor (contesto chiamante) usata dai suggest metadata quando
   * il record in edit non espone direttamente il nome route.
   */
  public static metadataEditorContextRouteName: string = '';

  /**
   * Backing store globale per `appSettings`. Motivazione: con
   * `optimization.scripts: true` + tree-shake aggressivo, esbuild puo'
   * duplicare la classe `WtoolboxService` in piu' chunk (uno per import path,
   * es. npm barrel vs deep path relative). Ogni copia ha i suoi static field
   * isolati → `WtoolboxService.appSettings = X` dal main.ts setta sulla copia
   * "npm" ma i service interni della lib leggono dalla copia "relative" che
   * resta `undefined` → crash runtime su ogni accesso.
   *
   * Spostando il backing store su `globalThis`, tutte le copie della classe
   * condividono lo stesso slot di memoria → populate/read sempre coerente.
   *
   * Convenzione chiave globale: `__WUIC_APP_SETTINGS` (prefisso uppercase per
   * evitare collisione con proprieta' librerie terze).
   */
  public static get appSettings(): any {
    return (globalThis as any).__WUIC_APP_SETTINGS;
  }
  public static set appSettings(value: any) {
    (globalThis as any).__WUIC_APP_SETTINGS = value;
  }

  public static myFunctions: any = {};

  public static dialogService: DialogService;
  public static messageNotificationService: MessageService;
  public static confirmationService: ConfirmationService;
  public static dataService: DataProviderService;
  public static translationService: TranslationManagerService;
  public static errorHandler: GlobalHandler

  public static http: HttpClient;
  private static injectorRef: Injector | null = null;
  private static readonly fallbackRouter: { navigateByUrl: (url: string) => Promise<boolean>; } = {
    navigateByUrl: async (url: string) => {
      const target = String(url || '').trim();
      if (!target) {
        return false;
      }

      if (target.startsWith('http://') || target.startsWith('https://')) {
        globalThis.location.href = target;
        return true;
      }

      const hashTarget = target.startsWith('#') ? target : `#${target}`;
      globalThis.location.hash = hashTarget;
      return true;
    }
  };

  public static isBusy: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  public static menuUpdated: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  /**
   * Generic wrapper for invoking user-supplied callbacks compiled from
   * metadata fields (mc_*_callback / md_*_callback / mc_*_fn). Catches
   * BOTH synchronous throws AND awaited Promise rejections, then surfaces
   * the failure as a typed `errors.client.user_callback.failed` dialog
   * via `GlobalHandler.emitClientException` (instead of letting the raw
   * error escape to NgZone unhandled → `errors.client.unknown` fallback).
   *
   * Use this anywhere the framework invokes user-supplied JS — it
   * collapses the boilerplate try/catch + Promise.catch + typed wrap that
   * was previously duplicated across DataSource (after_save / before_save
   * / after_load / default_value), FieldEditor (suggest), and any future
   * call sites.
   *
   * @param callbackName    Logical metadata name (e.g. 'mc_suggest_value_callback').
   * @param fn              The compiled callback (sync or async).
   * @param args            Args to pass to the callback.
   * @param ctx             Optional context (route / column / phase / target)
   *                        merged into the typed exception args for diagnostics.
   * @param opts.rethrow    If true, re-throws the typed exception after
   *                        emitting (use when the calling flow must halt,
   *                        e.g. before_save canceling the save). Default false.
   * @param opts.targetName Optional `targetName` override for the typed
   *                        WuicClientException (defaults to callbackName).
   * @returns The callback's resolved value, or `undefined` on failure.
   */
  public static async runUserCallback<T = any>(
    callbackName: string,
    fn: (...args: any[]) => T | Promise<T>,
    args: any[] = [],
    ctx: { route?: string; column?: string; phase?: string; [k: string]: any } = {},
    opts: { rethrow?: boolean; targetName?: string } = {}
  ): Promise<T | undefined> {
    let result: T | undefined;
    let typed: WuicClientException | null = null;
    try {
      const ret = fn(...args);
      if (ret && typeof (ret as any).then === 'function') {
        try { result = await (ret as Promise<T>); }
        catch (asyncErr: any) { typed = WtoolboxService.buildTypedUserCallbackException(callbackName, asyncErr, ctx, opts.targetName); }
      } else {
        result = ret as T;
      }
    } catch (syncErr: any) {
      typed = WtoolboxService.buildTypedUserCallbackException(callbackName, syncErr, ctx, opts.targetName);
    }
    if (typed) {
      GlobalHandler.emitClientException(typed);
      if (opts.rethrow) { throw typed; }
      return undefined;
    }
    return result;
  }

  /**
   * Synchronous sibling of `runUserCallback`. Use when the call site needs
   * the return value INLINE (e.g. PrimeNG chart drillDown returning a DOM
   * element, marker content callback returning a node, archetype formatter
   * returning a derived data shape) — `await` would break the synchronous
   * contract with the surrounding renderer.
   *
   * Catches synchronous throws ONLY (the wrapped fn must be sync). If the
   * fn returns a Promise it is returned as-is (the caller handles it).
   *
   * On throw: emits `errors.client.user_callback.failed` typed exception
   * via GlobalHandler and returns `opts.fallback` (default `undefined`).
   * If `opts.rethrow=true`, re-throws the typed exception after emitting.
   */
  public static runUserCallbackSync<T = any>(
    callbackName: string,
    fn: (...args: any[]) => T,
    args: any[] = [],
    ctx: { route?: string; column?: string; phase?: string; archetype?: string; [k: string]: any } = {},
    opts: { rethrow?: boolean; targetName?: string; fallback?: T } = {}
  ): T | undefined {
    try {
      return fn(...args);
    } catch (syncErr: any) {
      const typed = WtoolboxService.buildTypedUserCallbackException(callbackName, syncErr, ctx, opts.targetName);
      GlobalHandler.emitClientException(typed);
      if (opts.rethrow) throw typed;
      return opts.fallback;
    }
  }

  /**
   * Wrap synchronous archetype lifecycle bodies (parseData, processData,
   * ngOnInit, refreshOptions, ...) so any throw bubbles into a typed
   * `errors.client.archetype.<archetypeName>.init_failed` envelope —
   * instead of leaking a raw stack trace into the GlobalHandler unknown
   * fallback (e.g. "TypeError: dataOptions.datasets.forEach is not a
   * function" surfacing with full minified chunk paths).
   *
   * The caller decides what to return on failure via `opts.fallback`
   * (default `undefined`) — most renderers can gracefully fall through
   * with empty data so the page still mounts.
   */
  public static wrapArchetypeLifecycleSync<T = any>(
    archetypeName: string,
    phase: string,
    fn: () => T,
    ctx: { route?: string; [k: string]: any } = {},
    opts: { fallback?: T; rethrow?: boolean } = {}
  ): T | undefined {
    try {
      return fn();
    } catch (err: any) {
      try { (err as any).__wuicHandled = true; } catch { /* primitive throw */ }
      let innerMessage: string | undefined;
      let innerName:    string | undefined;
      if (err instanceof Error) {
        innerMessage = err.message;
        innerName    = err.name;
      } else if (err && typeof err === 'object') {
        innerMessage = (typeof err.message === 'string' ? err.message : null)
                    || (() => { try { return JSON.stringify(err); } catch { return '[unserializable]'; } })();
        innerName    = err.constructor?.name || (typeof err);
      } else {
        innerMessage = String(err);
        innerName    = typeof err;
      }
      if (innerMessage && innerMessage.length > 500) innerMessage = innerMessage.slice(0, 500);
      const exc = new WuicClientException(
        WuicErrorCodes.archetypeInitFailed(archetypeName),
        { archetype: archetypeName, phase, ...ctx, innerName, innerMessage },
        { surface: 'archetype', targetName: `${archetypeName}.${phase}`, cause: err }
      );
      GlobalHandler.emitClientException(exc);
      if (opts.rethrow) throw exc;
      return opts.fallback;
    }
  }

  /**
   * Builds a typed `errors.client.user_callback.failed` WuicClientException
   * from any thrown value (Error / primitive / plain object / undefined),
   * preserving an `innerMessage` + `innerName` for the translation template.
   * Shared by both `runUserCallback` (async) and `runUserCallbackSync`.
   */
  private static buildTypedUserCallbackException(
    callbackName: string,
    err: any,
    ctx: { [k: string]: any },
    targetNameOverride?: string
  ): WuicClientException {
    try { (err as any).__wuicHandled = true; } catch { /* primitive throw */ }
    let innerMessage: string | undefined;
    let innerName:    string | undefined;
    if (err instanceof Error) {
      innerMessage = err.message;
      innerName    = err.name;
    } else if (typeof err === 'string' || typeof err === 'number' || typeof err === 'boolean') {
      innerMessage = String(err);
      innerName    = typeof err;
    } else if (err && typeof err === 'object') {
      innerMessage = (typeof err.message === 'string' ? err.message : null)
                  || (typeof err.toString === 'function' && err.toString !== Object.prototype.toString ? err.toString() : null)
                  || (() => { try { return JSON.stringify(err); } catch { return '[unserializable error object]'; } })();
      innerName    = err.constructor?.name || (typeof err);
    } else {
      innerMessage = String(err);
      innerName    = typeof err;
    }
    if (innerMessage && innerMessage.length > 500) innerMessage = innerMessage.slice(0, 500);
    return new WuicClientException(
      WuicErrorCodes.ClientUserCallbackFailed,
      { callbackName, ...ctx, innerName, innerMessage },
      { surface: 'callback', targetName: targetNameOverride || callbackName, cause: err }
    );
  }

  constructor(public _http: HttpClient, private injector: Injector) {
    WtoolboxService.injectorRef = injector;

  }

  public static get router(): { navigateByUrl: (url: string) => Promise<boolean>; } {
    if (!WtoolboxService.injectorRef) {
      return WtoolboxService.fallbackRouter;
    }
    try {
      return WtoolboxService.injectorRef.get(Router);
    } catch {
      return WtoolboxService.fallbackRouter;
    }
  }

  private static tr(key: string, fallback: string): string {
    const translated = String(WtoolboxService.translationService?.instant?.(key) || '').trim();
    if (!translated || translated.toLowerCase() === key.toLowerCase()) {
      return fallback;
    }
    return translated;
  }

  /**
   * Salva nel runtime workflow il payload associato a uno specifico route node.
   * Wrapper statico verso `WorkflowRuntimeMetadataService.setRouteNodePayload`.
   * @param routeNodeId Identificativo nodo workflow.
   * @param payload Payload da associare al nodo.
   */
  public static setWorkflowRouteNodePayload(routeNodeId: string, payload: any): void {
    WorkflowRuntimeMetadataService.getInstance()?.setRouteNodePayload(routeNodeId, payload);
  }

  /**
   * Recupera il payload runtime precedentemente associato a un route node workflow.
   * @param routeNodeId Identificativo nodo workflow.
   * @returns Payload nodo oppure `null`.
   */
  public static getWorkflowRouteNodePayload(routeNodeId: string): any | null {
    return WorkflowRuntimeMetadataService.getInstance()?.getRouteNodePayload(routeNodeId) ?? null;
  }

  /**
   * Restituisce i route node id collegati a una route (ed eventualmente a una action specifica).
   * @param route Route applicativa.
   * @param action Azione opzionale.
   * @returns Elenco id nodi compatibili.
   */
  public static getWorkflowRouteNodeIds(route: string, action?: string): string[] {
    return WorkflowRuntimeMetadataService.getInstance()?.getRouteNodeIds(route, action) || [];
  }

  /**
   * Pulisce il payload runtime di un singolo route node o di tutti i nodi se `routeNodeId` non e fornito.
   * @param routeNodeId Identificativo nodo workflow opzionale.
   */
  public static clearWorkflowRouteNodePayload(routeNodeId?: string): void {
    WorkflowRuntimeMetadataService.getInstance()?.clearRouteNodePayload(routeNodeId);
  }

  public static getWorkflowPreviousRouteNode(routeNodeId: string): { routeNodeId: string; route: string; action: string; } | null {
    return WorkflowRuntimeMetadataService.getInstance()?.getPreviousRouteNode(routeNodeId) ?? null;
  }

  public static getWorkflowPreviousRouteNodeByRoute(route: string, action?: string): { routeNodeId: string; route: string; action: string; } | null {
    return WorkflowRuntimeMetadataService.getInstance()?.getPreviousRouteNodeByRoute(route, action) ?? null;
  }

  /**
   * Costruisce un contesto route/workflow utile ai CRUD hook host-side.
   * Include anche informazioni debug leggere per troubleshooting.
   */
  public static buildCrudRouteContext(routeName?: string, actionName?: string, source?: string): any {
    const hashRaw = String(globalThis?.location?.hash || '').trim();
    const hashNoSharp = hashRaw.startsWith('#') ? hashRaw.substring(1) : hashRaw;
    const hashPath = hashNoSharp.startsWith('/') ? hashNoSharp : (hashNoSharp ? `/${hashNoSharp}` : '');
    const segments = hashPath.replace(/^\/+/, '').split('/').filter(Boolean);

    let resolvedRoute = String(routeName || '').trim();
    let resolvedAction = String(actionName || '').trim();
    let screenKind = 'other';
    let workflowGraphId = '';

    if (segments[0] === 'workflow-runner') {
      screenKind = 'workflow';
      workflowGraphId = decodeURIComponent(String(segments[1] || '').trim());
      if (!resolvedAction) {
        resolvedAction = 'workflow-runner';
      }
    } else if (segments.length >= 2 && segments[1] === 'dashboard') {
      screenKind = 'dashboard';
      if (!resolvedRoute) {
        resolvedRoute = decodeURIComponent(String(segments[0] || '').trim());
      }
      if (!resolvedAction) {
        resolvedAction = 'dashboard';
      }
    } else if (segments.length >= 2) {
      screenKind = 'route';
      if (!resolvedRoute) {
        resolvedRoute = decodeURIComponent(String(segments[0] || '').trim());
      }
      if (!resolvedAction) {
        resolvedAction = decodeURIComponent(String(segments[1] || '').trim());
      }
    } else if (resolvedRoute) {
      screenKind = 'route';
    }

    const nodeIds = (screenKind === 'workflow' || screenKind === 'route' || screenKind === 'dashboard')
      ? WtoolboxService.getWorkflowRouteNodeIds(resolvedRoute, resolvedAction)
      : [];
    const workflowRouteNodeId = String(nodeIds?.[0] || '').trim();
    const workflowPayload = workflowRouteNodeId
      ? (WtoolboxService.getWorkflowRouteNodePayload(workflowRouteNodeId) || {})
      : {};
    const workflowActionType = String(
      workflowPayload?.actionType
      || workflowPayload?.workflowActionType
      || workflowPayload?.workflowActionTypeId
      || ''
    ).trim();

    // Lingua corrente utente (BCP-47 tag). Priorita' uguale a
    // TranslationManagerService.resolveCurrentLocale:
    //   1. override esplicito in localStorage (`wuic-selected-language`)
    //      — impostato dal language selector nel menu bar.
    //   2. lingua dal profilo utente (userInfo.lingua.id).
    //   3. lingua del browser (navigator.language).
    //   4. fallback 'it-IT'.
    // Passata al server via `routeContext.language` nei CRUD hook cosi' le
    // stored procedure / custom hooks possono filtrare lookup/dati in base
    // alla lingua attiva senza doversi re-autenticare il cookie k-user.
    let resolvedLanguage = '';
    try {
      if (typeof localStorage !== 'undefined') {
        resolvedLanguage = String(localStorage.getItem('wuic-selected-language') || '').trim();
      }
    } catch { /* private mode / quota */ }
    if (!resolvedLanguage) {
      try {
        const userSvc = WtoolboxService.resolveInjectorRef()?.get(UserInfoService, null);
        resolvedLanguage = String(userSvc?.getuserInfo?.()?.lingua?.id || '').trim();
      } catch { /* injector not ready at very early bootstrap */ }
    }
    if (!resolvedLanguage && typeof navigator !== 'undefined') {
      resolvedLanguage = String(navigator.language || '').trim();
    }
    if (!resolvedLanguage) {
      resolvedLanguage = 'it-IT';
    }

    return {
      screenKind: screenKind,
      route: resolvedRoute,
      action: resolvedAction,
      hashPath: hashPath,
      workflowGraphId: workflowGraphId,
      workflowRouteNodeId: workflowRouteNodeId,
      workflowActionType: workflowActionType,
      requestId: '',
      rawSource: String(source || '').trim(),
      hookMethodName: '',
      operationKind: '',
      language: resolvedLanguage,
      debugPayloadJson: JSON.stringify({
        hash: hashRaw,
        href: String(globalThis?.location?.href || ''),
        source: String(source || '').trim(),
        segments: segments
      })
    };
  }

  /**
   * Assegna un valore su un path annidato creando dinamicamente i nodi mancanti.
   * Supporta campi array indicizzati (`nestedIndex`) e modalita reactive (`async`) con `BehaviorSubject`.
   * @param target Oggetto target da modificare.
   * @param propPath Path proprieta separato da punto.
   * @param parentConstructors Costruttori usati per istanziare i nodi intermedi.
   * @param value Valore finale da assegnare.
   * @param nestedIndex Indice elemento array quando il path termina su collezione annidata.
   * @param async Se `true` assegna/aggiorna `BehaviorSubject` invece del valore plain.
   */
  public static safeAssign(target: any, propPath: string, parentConstructors: any[], value: any, nestedIndex?: number, async?: boolean) {
    let props = propPath.split('.');

    let obj = target;
    for (let i = 0; i <= props.length - 1; i++) {
      if (i < props.length - 1) {

        if (obj[props[i]] == null) {
          let constr = parentConstructors.shift();
          if (Array.isArray(constr)) {
            obj[props[i]] = [];
          } else if (typeof constr === 'function') {
            obj[props[i]] = new constr();
          } else {
            obj[props[i]] = {};
          }
        } else {
          parentConstructors.shift();
        }

        obj = obj[props[i]];

        if (nestedIndex !== undefined && i == props.length - 2) {
          if (obj == null) {
            obj = [];
          }

          if (obj.length <= nestedIndex) {
            for (let j = obj.length; j <= nestedIndex; j++) {
              obj.push({});
            }
          }
        }

      } else if (props.length - 1 == i) {

        if (nestedIndex !== undefined) {

          if (async) {
            if (!obj[nestedIndex][props[i]]) {
              obj[nestedIndex][props[i]] = new BehaviorSubject<any>(value);
            } else {
              obj[nestedIndex][props[i]].next(value);
            }
          } else {
            obj[nestedIndex][props[i]] = value;
          }
        }
        else if (props.length > i) {
          if (async) {
            if (!obj[props[i]]) {
              obj[props[i]] = new BehaviorSubject<any>(value);
            } else {
              obj[props[i]].next(value);
            }
          } else {
            obj[props[i]] = value;
          }
        }
      }
    }
  }

  /**
   * Esegue merge profondo di oggetti plain: gli array vengono sostituiti, gli oggetti annidati vengono fusi ricorsivamente.
   * @param target Oggetto destinazione.
   * @param source Oggetto sorgente.
   * @returns Oggetto destinazione aggiornato.
   */
  public static deepMerge(target: any, source: any): any {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return target;
    }

    Object.keys(source).forEach((key) => {
      const srcVal = source[key];
      if (Array.isArray(srcVal)) {
        target[key] = srcVal;
      } else if (srcVal && typeof srcVal === 'object') {
        target[key] = WtoolboxService.deepMerge(target[key] && typeof target[key] === 'object' ? target[key] : {}, srcVal);
      } else {
        target[key] = srcVal;
      }
    });

    return target;
  }

  /**
   * Riduce una lista di path annidati mantenendo solo i "leaf path":
   * se esiste `a.b`, il parent `a` viene scartato.
   * Utile nei tree checkbox per evitare che la selezione di un nodo child
   * trascini accidentalmente l'intero parent object.
   */
  public static keepOnlyLeafPaths(paths: string[]): string[] {
    const normalized = Array.from(new Set(
      (paths || [])
        .map((x) => String(x || '').trim())
        .filter((x) => !!x)
    ));

    if (!normalized.length) {
      return [];
    }

    return normalized.filter((candidate) => {
      const prefix = candidate + '.';
      return !normalized.some((other) => other !== candidate && other.startsWith(prefix));
    });
  }

  /**
   * Genera un UUID v4 client-side usando `crypto.getRandomValues`.
   * @returns UUID in formato canonico `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.
   */
  public static uuidv4() {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
  }

  /**
   * Genera timestamp compatto locale nel formato `yyyyMMddHHmmss`.
   * @returns Stringa timestamp.
   */
  public static getTimestamp(): string {
    let dt = new Date();
    return `${dt.getFullYear().toString()}${(dt.getMonth() + 1).toString().padStart(2, '0')}${dt.getDate().toString().padStart(2, '0')}${dt.getHours().toString().padStart(2, '0')}${dt.getMinutes().toString().padStart(2, '0')}${dt.getSeconds().toString().padStart(2, '0')}`;
  }

  /**
   * Mostra un dialog di conferma PrimeNG con etichette localizzate (`OK`/`Cancel`) e ritorna esito booleano.
   * @param payload Configurazione dialog conferma.
   * @returns `true` su accept, `false` su reject.
   */
  public static async confirm(payload: Confirmation): Promise<boolean> {

    let opts = {
      icon: 'pi pi-info-circle',
      acceptIcon: "none",
      rejectIcon: "none",
      rejectButtonStyleClass: "p-button-text",
      acceptLabel: WtoolboxService.translationService.instant('OK'),
      rejectLabel: WtoolboxService.translationService.instant('Cancel'),
    }

    payload = Object.assign(opts, payload);

    return new Promise((resolve, reject) => {

      payload.accept = () => {
        resolve(true);
      };
      payload.reject = () => {
        resolve(false);
      };

      WtoolboxService.confirmationService.confirm(payload);
    });
  }

  /**
   * Incapsula uno script custom in un body Promise-safe con gestione errori standard (`isBusy` + `errorHandler`).
   * Usato per compilare callback dinamiche metadata mantenendo comportamento uniforme.
   * @param script Script utente da eseguire nel blocco `try`.
   * @param fallbackReturn Placeholder legacy mantenuto per compatibilita firma.
   * @returns Corpo funzione JavaScript pronto per `new Function(...)`.
   */
  public static buildAsyncBody(script: string, fallbackReturn: string = '') {
    // The wrapper rejects on user-script throw (instead of the legacy
    // handleError(_err) swallow). Rejection propagates to the call site
    // where WtoolboxService.runUserCallback turns it into a typed
    // errors.client.user_callback.failed dialog. Without this change the
    // outer Promise resolved with `false` and the typed pipeline was
    // bypassed → user saw the generic errors.client.unknown fallback.
    return [
      'return new Promise(async (resolve, reject) => {',
      ' try {',
      script,
      '   resolve();',
      ' } catch (_err) {',
      '   wtoolbox.isBusy.next(false);',
      '   reject(_err);',
      ' }',
      '});'
    ].filter((line) => !!line).join('\n');
  }

  /**
   * Apre un dialog modale che renderizza un PrimeNG `<p-fileUpload>` per upload di file
   * Excel/CSV verso una tabella SQL dinamica (creata/ricreata con colonne derivate dagli
   * header del file). Al termine dell'upload il backend esegue la stored procedure
   * indicata passando `@TableName`, `@UserId`, `@RowCount`.
   *
   * Backend: `UploadHandlerCustom.customAction` -> `metaQuery.UploadToDynamicTable`
   * (vedi `md_action_type = 10`).
   *
   * @param opts Configurazione upload: `target_table` (nome tabella SQL, obbligatorio),
   *             `stored_name` (stored da invocare, obbligatorio), `mode` (`replace` default,
   *             `truncate` o `append`), `title` (header dialog), `accept` (default `.xls,.xlsx,.csv`),
   *             `width`/`height` dialog, `maxFileSize` byte (default 50MB), `routeName` opzionale,
   *             `chooseLabel` etichetta bottone scelta file.
   * @returns Promise risolta con `{ ok, message, targetTable, storedName, mode, fileName, raw }`
   *          in caso di successo, `undefined` se l'utente annulla. In caso di errore backend
   *          il dialog resta aperto mostrando il messaggio.
   */
  public static async uploadDialog(opts: {
    target_table: string;
    stored_name: string;
    mode?: 'replace' | 'truncate' | 'append';
    title?: string;
    accept?: string;
    width?: string;
    height?: string;
    maxFileSize?: number;
    routeName?: string;
    chooseLabel?: string;
  }): Promise<{ ok: boolean; message: string; targetTable: string; storedName: string; mode: string; fileName: string; raw: any } | undefined> {
    if (!opts || !opts.target_table || !opts.stored_name) {
      console.error('uploadDialog: target_table e stored_name sono obbligatori.');
      return undefined;
    }

    const { UploadDialogComponent } = await import('../component/upload-dialog/upload-dialog.component');

    const dialogConfig = {
      data: {
        target_table: opts.target_table,
        stored_name: opts.stored_name,
        mode: opts.mode || 'replace',
        accept: opts.accept,
        maxFileSize: opts.maxFileSize,
        routeName: opts.routeName,
        chooseLabel: opts.chooseLabel
      },
      header: opts.title || 'Upload',
      width: opts.width || '560px',
      height: opts.height || 'auto',
      styleClass: 'edit-form-content',
      position: 'center',
      closable: true
    };

    WtoolboxService.resolveDialogServiceFromInjector();

    let ref: any;
    if (WtoolboxService.dialogService && WtoolboxService.dialogService.open) {
      ref = WtoolboxService.dialogService.open(UploadDialogComponent, dialogConfig);
    }

    if (!ref || !ref.onClose) {
      console.error('uploadDialog: DialogService non disponibile.');
      return undefined;
    }

    return await firstValueFrom(ref.onClose as Observable<any>);
  }

  /**
   * Costruisce e apre un dialog parametrico runtime (form metadata-driven), generando dinamicamente:
   * metadata colonna, record reactive, azioni OK/Cancel e validazione required.
   * @param title Titolo dialog.
   * @param fields Definizione campi da renderizzare.
   * @param width Larghezza dialog.
   * @param height Altezza dialog.
   * @param customValidation Hook validazione custom (legacy).
   * @returns Promise risolta con record compilato o `undefined` su cancel/close.
   */
  public static async promptDialog(title: string, fields: { name: string, caption: string, value?: any, type: string, tooltip?: string, required?: boolean, route?: { lookupRoute?: string, lookupValueField?: string, lookupDesField?: string, lookupFilter?: string }, dictionaryData?: { label: string, value: any, items?: any }[], serverSide?: boolean, selectionChanged?: (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, metaInfo: MetaInfo, newValue: any, oldValue: any, wtoolbox: typeof WtoolboxService, nestedIndex?: number, nodes?: any[]) => void, propsBag?: any, hide?: boolean }[], width?: string, height?: string, customValidation?: any): Promise<any> {

    let ref: any;

    let metaInfo = new MetaInfo();

    let actionOK = new MetadatiCustomActionTabella();
    actionOK.button_caption = WtoolboxService.translationService.instant('OK');
    actionOK.action_callback__fn = (ds, meta, record, event, wtoolbox) => {
      ref.close(record);
    };
    actionOK.disable_callback__fn = (ds, meta: MetaInfo, record, wtoolbox) => {
      // return new Promise((resolve, reject) => {
      let valid = true;

      meta.columnMetadata.forEach(field => {
        const raw = record[field.mc_nome_colonna];
        const currentValue = raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
        if (field.mc_validation_required && (currentValue == null || currentValue === '')) {
          valid = false;
        }
      });

      // disable_callback must return TRUE when button is disabled
      return !valid;
      // });
    };

    let actionCancel = new MetadatiCustomActionTabella();
    actionCancel.button_caption = WtoolboxService.translationService.instant('Cancel');
    actionCancel.action_callback__fn = (ds, meta, record, event, wtoolbox) => {
      ref.close(undefined);
    };

    metaInfo.tableMetadata._Metadati_Custom_Actions_Tabelles = [
      actionOK,
      actionCancel
    ];

    metaInfo.columnMetadata = [];
    let record = {};
    let pristine = {};

    fields.forEach(field => {
      let mc = new MetadatiColonna(field.name);
      mc.mc_serverside_operations = field.serverSide;
      mc.mc_ui_column_type = field.type;
      mc.mc_display_string_in_edit = field.caption;
      mc.mc_tooltip = field.tooltip;
      mc.mc_validation_required = field.required;
      // Prompt fields must stay editable unless explicitly hidden/managed differently.
      mc.mc_logic_editable = true;
      mc.mc_is_computed = false;
      mc.mc_is_db_computed = false;
      mc.mc_editable_insert_only = false;

      if (field.type == 'dictionary' || field.type == 'dictionary_radio') {
        mc.mc_dictionary_value = field.dictionaryData.map(x => `${x.value}@@${x.label}`).join('||');
      } else if (field.type == 'tree') {
        mc.mc_dictionary_value = JSON.stringify(field.dictionaryData);
        mc.mc_ui_lookup_dataValueField = field.route.lookupValueField;
        mc.mc_ui_lookup_dataTextField = field.route.lookupDesField;
      }
      else if (field.type == 'lookup' || field.type == 'lookupByID') {
        mc.mc_ui_lookup_entity_name = field.route.lookupRoute;
        mc.mc_ui_lookup_dataValueField = field.route.lookupValueField;
        mc.mc_ui_lookup_dataTextField = field.route.lookupDesField;
        mc.mc_ui_lookup_filter = field.route.lookupFilter;
      }

      if (field.selectionChanged) {
        mc.mc_selection_changed_custom_function__fn = field.selectionChanged;
      }

      if (field.propsBag !== undefined) {
        mc.mc_props_bag = JSON.stringify(field.propsBag || {});
        mc.extras = Object.assign({}, field.propsBag || {});
      }

      if (field.hide !== undefined) {
        mc.mc_hide_in_edit = !!field.hide;
      }

      record[field.name] = new BehaviorSubject<any>(field.value);
      pristine[field.name] = field.value;

      metaInfo.columnMetadata.push(mc);
    });

    // Prompt dialog behaves like "new record" context for editors checking insert-only flags.
    (record as any).__new = true;

    let datasource = {
      metaInfo: metaInfo,
      pristine: pristine,
      resultInfo: {
        dato: [],
        current: record
      }
    };

    const { ParametricDialogComponent } = await import('../component/parametric-dialog/parametric-dialog.component');

    const dialogConfig = {
      data: {
        datasource: new BehaviorSubject<any>(datasource)
      },
      header: title,
      width: width || '400px',
      height: height || '250px',
      styleClass: 'edit-form-content',
      position: 'center'
    };

    WtoolboxService.resolveDialogServiceFromInjector();

    if (WtoolboxService.dialogService && WtoolboxService.dialogService.open) {
      ref = WtoolboxService.dialogService.open(ParametricDialogComponent, dialogConfig);
    }

    if (!ref || !ref.onClose) {
      ref = await WtoolboxService.openPromptDialogFallback(dialogConfig);
    }

    if (!ref || !ref.onClose) {
      console.error('Unable to open prompt dialog with both DynamicDialog and fallback host');
      return undefined;
    }

    return await firstValueFrom(ref.onClose as Observable<any>);
  }

  private static async openPromptDialogFallback(dialogConfig: any): Promise<{ onClose: Observable<any>; close: (result?: any) => void; } | null> {
    const resolvedInjector = WtoolboxService.resolveInjectorRef();
    if (!resolvedInjector || typeof document === 'undefined') {
      return null;
    }

    try {
      const appRef = resolvedInjector.get(ApplicationRef);
      const environmentInjector = resolvedInjector.get(EnvironmentInjector);
      const close$ = new Subject<any>();
      const { PromptDialogFallbackHostComponent } = await import('../component/prompt-dialog-fallback-host/prompt-dialog-fallback-host.component');
      const hostRef = createComponent(PromptDialogFallbackHostComponent, { environmentInjector });

      hostRef.instance.datasource = dialogConfig?.data?.datasource;
      hostRef.instance.header = String(dialogConfig?.header || '');
      hostRef.instance.width = String(dialogConfig?.width || '400px');
      hostRef.instance.height = String(dialogConfig?.height || '250px');
      hostRef.instance.styleClass = String(dialogConfig?.styleClass || 'edit-form-content');
      hostRef.instance.position = WtoolboxService.normalizePromptDialogPosition(dialogConfig?.position);
      hostRef.instance.closable = dialogConfig?.closable !== false;

      const hostElement = (hostRef.hostView as EmbeddedViewRef<any>).rootNodes[0] as HTMLElement;
      appRef.attachView(hostRef.hostView);
      document.body.appendChild(hostElement);

      const detachAndDestroy = () => {
        try {
          appRef.detachView(hostRef.hostView);
        } catch {
          // Best-effort detach in case view is already detached.
        }
        hostRef.destroy();
      };

      const close = (result?: any) => {
        hostRef.instance.closeWithResult(result);
      };

      hostRef.instance.closed.subscribe((result) => {
        close$.next(result);
        close$.complete();
        detachAndDestroy();
      });

      return {
        onClose: close$.asObservable(),
        close
      };
    } catch (err) {
      console.error('Prompt dialog fallback host failed to initialize', err);
      return null;
    }
  }

  private static resolveDialogServiceFromInjector(): void {
    if (WtoolboxService.dialogService?.open) {
      return;
    }

    const resolvedInjector = WtoolboxService.resolveInjectorRef();
    if (!resolvedInjector) {
      return;
    }

    try {
      const resolvedDialogService = resolvedInjector.get(DialogService, null as any);
      if (resolvedDialogService?.open) {
        WtoolboxService.dialogService = resolvedDialogService;
      }
    } catch {
      // Keep current behavior when DialogService is not available in injector.
    }
  }

  private static resolveInjectorRef(): Injector | null {
    if (WtoolboxService.injectorRef) {
      return WtoolboxService.injectorRef;
    }

    if (typeof document === 'undefined') {
      return null;
    }

    const ngGlobal = (globalThis as any)?.ng;
    const getInjectorFn = ngGlobal && typeof ngGlobal.getInjector === 'function'
      ? ngGlobal.getInjector.bind(ngGlobal)
      : null;

    if (!getInjectorFn) {
      return null;
    }

    const candidates: (Element | null | undefined)[] = [
      document.querySelector('app-root'),
      document.querySelector('[ng-version]'),
      document.body?.firstElementChild,
      document.body
    ];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }

      try {
        const resolved = getInjectorFn(candidate);
        if (resolved) {
          WtoolboxService.injectorRef = resolved as Injector;
          return WtoolboxService.injectorRef;
        }
      } catch {
        // Try next candidate.
      }
    }

    return null;
  }

  private static normalizePromptDialogPosition(value: any): 'center' | 'top' | 'bottom' | 'left' | 'right' | 'topleft' | 'topright' | 'bottomleft' | 'bottomright' {
    const normalized = String(value || '').trim().toLowerCase();
    switch (normalized) {
      case 'top':
      case 'bottom':
      case 'left':
      case 'right':
      case 'topleft':
      case 'topright':
      case 'bottomleft':
      case 'bottomright':
        return normalized;
      default:
        return 'center';
    }
  }

  public static safeStringify = (obj, replacer: (key, value) => any) => {
    let cache = [];
    const retVal = JSON.stringify(
      obj,
      (key, value) => {

        value = replacer(key, value);

        if (typeof value === "object" && value !== null && value !== undefined) {
          if (cache.includes(value)) {
            if (value.uniqueName) {
              return { uniqueName: value.uniqueName };
            }

            // Break circular/non-serializable references deterministically.
            return null;
          } else if (!(value instanceof BehaviorSubject)) {
            cache.push(value); // Store value in our collection
          }
        } else if (typeof value === 'function') {
          return undefined;
        }

        return value;
      });

    cache = null;
    return retVal;
  };

  /**
   * Costruisce un albero gerarchico `{ key, object, children/items }` da una lista flat con chiave parent.
   * Popola opzionalmente anche una lista flatten per lookup/tree selector.
   * @param data Sorgente flat.
   * @param pKeyName Nome campo id.
   * @param parentKeyName Nome campo parent id.
   * @param flattenedTreeDataSource Accumulatore opzionale versione flatten.
   * @param addCallback Callback opzionale legacy per estensioni.
   * @param nullParentValue Valore che identifica i nodi root.
   * @returns Collezione nodi root del modello gerarchico.
   */
  public static createHierarchicalDataModel(data: any, pKeyName: any, parentKeyName: any, flattenedTreeDataSource: any, addCallback?: any, nullParentValue?: any) {

    if (!parentKeyName) {
      alert("undefined parent key!");
      return null;
    }

    let firstLevelElements = data.filter(function (it) {
      if (nullParentValue === undefined)
        nullParentValue = null;

      return nullParentValue == it[parentKeyName];
    });

    let hdata = []; // ko.observableArray();

    for (let el in firstLevelElements) {
      let ele = firstLevelElements[el];
      ele = { key: ele[pKeyName], object: ele };

      hdata.push(ele);

      if (flattenedTreeDataSource)
        flattenedTreeDataSource.push(ele);

      WtoolboxService.trasverseDataModel(data, ele, pKeyName, parentKeyName, hdata, flattenedTreeDataSource, 'children', []);

    }

    return hdata.filter(function (it) {
      return it[parentKeyName] == null;
    });
  }

  /**
   * Traversa ricorsivamente il dataset flat e aggancia i figli del nodo corrente.
   * Salva in ogni nodo anche la catena `parentKeys` usata dalle logiche di selezione parent lookup.
   * @param data Dataset flat completo.
   * @param el Nodo corrente.
   * @param pKeyName Nome campo id.
   * @param parentKeyName Nome campo parent id.
   * @param hdata Collezione root/accumulatore principale.
   * @param flattenedTreeDataSource Accumulatore opzionale versione flatten.
   * @param nestingProp Nome proprieta usata per i figli (`items`/`children`).
   * @param currentParents Catena parent del nodo corrente.
   * @param addCallback Callback opzionale legacy.
   */
  public static trasverseDataModel(data, el, pKeyName, parentKeyName, hdata, flattenedTreeDataSource, nestingProp = 'items', currentParents: number[], addCallback?) {

    //let nestedElements = jlinq.from(data).equals(parentKeyName, el[pKeyName]()).select();

    let nestedElements = data.filter(function (it) {
      let left = it[parentKeyName];
      let right = el.key;
      return left == right;
    });

    if (!nestedElements || nestedElements.length == 0)
      el[nestingProp] = null;
    else
      el[nestingProp] = [] //ko.observableArray();

    let currPar = currentParents.concat([el.key]);

    nestedElements.forEach(subElement => {

      subElement.selected = false;
      let koSubElement = { key: subElement[pKeyName], object: subElement, parentKeys: currPar };

      el[nestingProp].push(koSubElement);

      if (flattenedTreeDataSource)
        flattenedTreeDataSource.push(koSubElement);

      if (subElement)
        WtoolboxService.trasverseDataModel(data, koSubElement, pKeyName, parentKeyName, hdata, flattenedTreeDataSource, nestingProp, currPar);

    });

  }

  /**
   * Converte un record con campi reactive (`BehaviorSubject`) in oggetto plain prendendo il valore corrente di ogni campo.
   * @param entity Entita da "spacchettare".
   * @returns Entita plain serializzabile.
   */
  public static unwrapEntity(entity: any) {
    let unwrapped = entity ? {} : null;

    if (entity) {
      Object.keys(entity).forEach(key => {
        const field = entity[key];
        let value: any;

        if (field === null || field === undefined) {
          value = field;
        } else if (typeof field === 'object' && 'value' in field) {
          // Supports both BehaviorSubject-backed fields and plain values.
          value = field.value;
        } else {
          value = field;
        }

        unwrapped[key] = value;
      });
    }

    return unwrapped;
  }

  public static suggestions = {
    /**
     * Richiama `MetaService.suggestBeforeTriggers` e inserisce nel campo target uno script
     * "before save" di esempio (debug/commenti su colonne reali + `commit()` finale).
     * @param md_id Id tabella usato nella request (`id_tabella`).
     * @param record Record metadata corrente.
     * @param field Campo che riceve lo script generato (`field.mc_nome_colonna`).
     */
    async suggestBeforeSave(md_id: number, record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let result = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestBeforeTriggers"}`, { id_tabella: md_id }).toPromise());
      record[field.mc_nome_colonna].next(result.res);
    },
    /**
     * Richiama `MetaService.suggestAfterTriggers` e popola il campo con boilerplate
     * "after save" (controllo record nuovo + esempi di uso valori/lookup delle prime colonne).
     * @param md_id Id tabella usato nella request (`id_tabella`).
     * @param record Record metadata corrente.
     * @param field Campo che riceve lo script generato.
     */
    async suggestAfterSave(md_id: number, record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let result = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestAfterTriggers"}`, { id_tabella: md_id }).toPromise());
      record[field.mc_nome_colonna].next(result.res);
    },
    /**
     * Ottiene da `MetaService.suggestDetails` la definizione relazioni master/detail in formato
     * `route||lookupDataValueField||lookupField||descrizione||` (entry separate da virgola).
     * @param md_id Id tabella usato nella request (`id_tabella`).
     * @param record Record metadata corrente.
     * @param field Campo metadata che salva la stringa di dettaglio.
     */
    async suggestDetails(md_id: number, record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let result = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestDetails"}`, { id_tabella: md_id }).toPromise());
      record[field.mc_nome_colonna].next(result.res);
    },
    /**
     * Richiede a `MetaService.suggestFilters` un filtro esempio costruito sui campi della route
     * (es. `campo||eq||1\\campo2||contains||prova`) e lo scrive nel campo metadata selezionato.
     * @param route Route di cui generare il filtro.
     * @param record Record metadata corrente.
     * @param field Campo metadata destinazione filtro.
     */
    async suggestFilters(route: string, record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let result = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestFilters"}`, { route: route }).toPromise());
      record[field.mc_nome_colonna].next(result.res);
    },
    /**
     * Usa `MetaService.suggestAfterLoad` per generare callback post-load; il template server
     * imposta il record corrente al primo elemento (`dataSource.setCurrent(dataSource.resultInfo[0])`).
     * @param md_id Id tabella usato nella request (`id_tabella`).
     * @param record Record metadata corrente.
     * @param field Campo che riceve il callback.
     */
    async suggestAfterLoad(md_id: number, record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let result = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestAfterLoad"}`, { id_tabella: md_id }).toPromise());
      record[field.mc_nome_colonna].next(result.res);
    },
    /**
     * Richiama `MetaService.suggestJoinOverride` che costruisce una SELECT dinamica (FROM/JOIN/FIELD)
     * dai metadati della route; la query risultante viene salvata nel campo metadata corrente.
     * @param route Route di cui proporre la query `md_custom_join`.
     * @param record Record metadata corrente.
     * @param field Campo target per la query SQL generata.
     */
    async suggestJoinOverride(route: string, record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let result = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestJoinOverride"}`, { route: route }).toPromise());
      record[field.mc_nome_colonna].next(result.res);
    },
    /**
     * Richiede a `MetaService.suggestConditionalGridTemplate` una coppia `[cssClass, condizione]`.
     * Aggiorna due metadati: `field.mc_nome_colonna` con la formula condizione e
     * `md_ui_grid_conditional_template` con la classe CSS suggerita.
     * @param route Route tabella da cui derivare condizione e classe.
     * @param record Record metadata corrente.
     * @param field Campo formula da valorizzare con `res[1]`.
     */
    async suggestConditionalGridTemplate(route: string, record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let result = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestConditionalGridTemplate"}`, { route: route }).toPromise());
      record[field.mc_nome_colonna].next(result.res[1]);
      record['md_ui_grid_conditional_template'].next(result.res[0]);
    },
    /**
     * Genera template Angular edit/detail via `MetaService.suggestEditTemplate`.
     * Determina automaticamente `targetField` (`md_edit_template` o `md_detail_template`),
     * passa `md_tab_edit` come `isTabEdit` e salva il markup ritornato nel campo destinazione.
     * @param route Route (fallback `record['md_route_name']`).
     * @param record Record metadata corrente.
     * @param field Campo da aggiornare; se assente usa i campi standard edit/detail.
     * @param editDetail Forza il tipo template richiesto (`'edit'` o `'detail'`).
     */
    async suggestEditTemplate(route: string, record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, editDetail?: 'edit' | 'detail') {
      const tabEditValue = record['md_tab_edit']?.value;
      const isTabEdit = tabEditValue === true || tabEditValue === 1 || tabEditValue === '1';
      const targetRoute = route || record['md_route_name']?.value;
      const targetField = field?.mc_nome_colonna || (editDetail === 'detail' ? 'md_detail_template' : 'md_edit_template');
      const effectiveEditDetail = editDetail || (targetField === 'md_detail_template' || targetField === 'mddetailtemplate' ? 'detail' : 'edit');

      const res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestEditTemplate"}`, {
        route: targetRoute,
        field: targetField,
        isTabEdit: isTabEdit,
        edit_detail: effectiveEditDetail
      }).toPromise());

      const value = res?.res ?? res;
      if (!value) {
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_columns', 'No columns found.') });
      } else {
        record[targetField].next(value);
      }
    },
    /**
     * Wrapper di `suggestEditTemplate(..., 'detail')`: genera esplicitamente il template dettaglio.
     * @param route Route tabella.
     * @param record Record metadata corrente.
     * @param field Campo target del template.
     */
    async suggestDetailTemplate(route: string, record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      await WtoolboxService.suggestions.suggestEditTemplate(route, record, field, 'detail');
    },
    /**
     * Richiede `MetaService.suggestGridRowtemplate` e popola il campo con HTML riga griglia:
     * colonne visibili, bottoni azione, editor inline e renderer speciali (upload/color/default).
     * @param route Route tabella.
     * @param record Record metadata corrente.
     * @param field Campo metadata che contiene il template riga.
     */
    async suggestGridRowtemplate(route: string, record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestGridRowtemplate"}`, { route: route }).toPromise());

      if (!res.res) {
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_columns', 'No columns found.') });
      }
      else {
        record[field.mc_nome_colonna].next(res.res);
      }
    },
    /**
     * Mostra selettore colonne (`MetaService.getColonneByUserID`) e scrive nel campo target
     * il `mc_nome_colonna` scelto; opzionalmente filtra per tipo editor (`type` contenuto in `mc_ui_column_type`).
     * @param record Record metadata corrente.
     * @param field Campo metadata in cui salvare il nome colonna selezionato.
     * @param type Filtro tipologia colonna (match su `mc_ui_column_type`).
     * @param routeRef Nome campo record che contiene la route (default `md_route_name`).
     */
    async suggestColumnMD(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, type: string, routeRef?: string) {
      const explicitRouteRef = String(routeRef || '').trim();
      const resolveRecordValue = (name: string): string => {
        if (!name || !record) {
          return '';
        }
        const raw: any = (record as any)[name];
        if (raw === undefined || raw === null) {
          return '';
        }
        if (typeof raw === 'object' && raw && 'value' in raw) {
          return String((raw as any).value || '').trim();
        }
        return String(raw || '').trim();
      };

      const explicitRoute = explicitRouteRef ? resolveRecordValue(explicitRouteRef) : '';
      const fallbackRoute = resolveRecordValue('md_route_name');
      const routeFromMetadataEditorContext = String(WtoolboxService.metadataEditorContextRouteName || '').trim();
      const route = explicitRoute || fallbackRoute || routeFromMetadataEditorContext;
      if (!route) {
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('suggest.not_found_route_for_column', 'No route found for column suggestion.') });
        return;
      }

      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.getColonneByUserID"}`, { route }).toPromise());

      if (!res || !res.results.length) {
        // self.notification.alert("No columns found.", "Not Found", "info");
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_columns', 'No columns found.') });
      }
      else {
        WtoolboxService.promptDialog(WtoolboxService.translationService.instant("select.column"), [
          {
            name: "mc_nome_colonna",
            caption: WtoolboxService.translationService.instant("column"),
            type: "dictionary",
            dictionaryData: res.results
              .filter(x => type ? x.mc_ui_column_type.indexOf(type) >= 0 : true)
              .map(x => { return { label: x.mc_display_string_in_view, value: x.mc_nome_colonna } })
              .sort((a, b) => a.label.localeCompare(b.label))
          }
        ], '500px', '500px', null).then((res) => {
          if (res) {
            record[field.mc_nome_colonna].next(res.mc_nome_colonna.value);
          }
        });
      }
    },
    /**
     * Costruisce formula computed partendo da gerarchia lookup: apre albero da
     * `MetaService.getLookupListByIDLevelUP` e invia la selezione a `getClauseByLookupHierarchy`
     * con `appendOnly=1` (formula `CONCAT(...)` pronta per `mc_ui_computed_formula`).
     * @param record Record metadata corrente.
     * @param field Campo formula da aggiornare.
     */
    async suggestComputedFormula(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.getLookupListByIDLevelUP"}`, { mc_id: record['mc_id'].value }).toPromise());

      if (res.length == 0) {
        // self.notification.alert("No lookups found. Check your lookup definitions.", "Not Found", "info", null, 300);
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_lookups_check_definitions', 'No lookups found. Check your lookup definitions.') });
      }
      else {
        let flattenedTreeDataSource = [];
        let lookupTreeDataSource = WtoolboxService.createHierarchicalDataModel(res, "id", "parent", flattenedTreeDataSource);

        WtoolboxService.promptDialog(WtoolboxService.translationService.instant("select.lookup"), [
          {
            name: "value",
            caption: WtoolboxService.translationService.instant("formula"),
            type: "tree",
            dictionaryData: lookupTreeDataSource,
            route: { lookupDesField: "displayName" }
          }
        ], '500px', '500px', null).then((res) => {
          if (res?.value?.value) {
            WtoolboxService.suggestions.getClauseByLookupHierarchy(res.value.value.map(x => x.object), record, field, 1);
          }
        });

      }
    },
    /**
     * Richiama `MetaService.getSeletClauseByLookupHierarchy` per tradurre la selezione gerarchica lookup
     * in una clausola SQL/lookup pronta da salvare nel campo metadata corrente.
     * @param model Modello dati su cui effettuare la risoluzione.
     * @param record Record corrente usato dalla logica/metadati.
     * @param field Metadato colonna/campo coinvolto nell'elaborazione.
     * @param appendOnly Modalita append dei filtri gerarchici.
     */
    async getClauseByLookupHierarchy(model: any[], record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, appendOnly: 0 | 1 | 2) {
      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.getSeletClauseByLookupHierarchy"}`, { selection: model, appendOnly: appendOnly }).toPromise());

      if (!res) {
        // self.notification.alert("No columns found. Check your metadata.", "Not Found", "info");
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_columns_check_metadata', 'No columns found. Check your metadata.') });
      }
      else {
        record[field.mc_nome_colonna].next(res.res);
        // this.cd.detectChanges();
      }
    },
    /**
     * A partire da un nodo lookup selezionato aggiunge ricorsivamente in `arr` le tabelle parent richieste (`parentKeys`).
     * Serve alla selezione gerarchica dei lookup per includere automaticamente i parent necessari alla formula SQL finale.
     * @param newValue Nodo selezionato che contiene `parentKeys`.
     * @param arr Accumulatore della selezione estesa (nodi originali + parent trovati).
     * @param nodes Albero nodi corrente su cui cercare i parent.
     */
    checkParentTables(newValue, arr, nodes) {
      if (!newValue || !Array.isArray(newValue.parentKeys) || !Array.isArray(nodes)) {
        return;
      }

      nodes.forEach(node => {
        if (newValue.parentKeys.indexOf(node.key) >= 0 && !arr.includes(node)) {
          arr.push(node);
        }

        if (node.children) {
          WtoolboxService.suggestions.checkParentTables(newValue, arr, node.children);
        }
      });
    },
    /**
     * Carica la gerarchia lookup per route (`MetaService.getLookupListByRoute`), apre il selettore tree
     * e aggiorna il campo con la clausola risultante includendo i parent necessari.
     * @param record Record corrente usato dalla logica/metadati.
     * @param field Metadato colonna/campo coinvolto nell'elaborazione.
     */
    async getLookupListByRoute(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.getLookupListByRoute"}`, { mc_id: record['mc_id'].value }).toPromise());

      if (res.length == 0) {
        // self.notification.alert("No lookups found. Check your lookup definitions.", "Not Found", "info");
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_lookups_check_definitions', 'No lookups found. Check your lookup definitions.') });
      }
      else {
        let flattenedTreeDataSource = [];
        let lookupTreeDataSource = WtoolboxService.createHierarchicalDataModel(res, "id", "parent", flattenedTreeDataSource);

        WtoolboxService.promptDialog(WtoolboxService.translationService.instant("select.lookup"), [
          {
            name: "value",
            caption: WtoolboxService.translationService.instant("formula"),
            type: "tree",
            dictionaryData: lookupTreeDataSource,
            route: { lookupDesField: "displayName" },
            selectionChanged: (record, field, metaInfo, newValue, oldValue, wtoolbox, nestedIndex, nodes) => {
              let arr = [];
              newValue.forEach(x => {
                arr.push(x);
              });

              newValue.forEach(x => {
                if (!x.object.isTable) {
                  WtoolboxService.suggestions.checkParentTables(x, arr, nodes);
                }
              });

              record['value'].next(arr);
            }
          }
        ], '500px', '500px', null).then((res) => {
          if (res?.value?.value) {
            WtoolboxService.suggestions.getClauseByLookupHierarchy(res.value.value.map(x => x.object), record, field, 2);
          }
        });
      }
    },
    /**
     * Chiede `MetaService.suggestDefaultValue` e salva un valore default coerente con il tipo colonna
     * (es. `10`, `true`, data ISO, `<put_dictionary_value_here>`, `stringa`).
     * @param record Record metadata corrente (usa `mc_id`).
     * @param field Campo che riceve il valore default suggerito.
     */
    async suggestDefaultValue(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestDefaultValue"}`, { mc_id: record['mc_id'].value }).toPromise());

      if (!res.res) {
        // self.notification.alert("No lookups found. Check your lookup definitions.", "Not Found", "info");
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_text_or_number_columns', 'No text or number columns found.') });
      }
      else {
        record[field.mc_nome_colonna].next(res.res);
      }
    },
    /**
     * Chiede `MetaService.suggestDefaultValueCallback` e salva un callback JS tipo
     * `record.<campo> = <sample>;`, con sample variabile in base a `mc_ui_column_type`.
     * @param record Record metadata corrente (usa `mc_id`).
     * @param field Campo callback da valorizzare.
     */
    async suggestDefaultValueCallback(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestDefaultValueCallback"}`, { mc_id: record['mc_id'].value }).toPromise());

      if (!res.res) {
        // self.notification.alert("No lookups found. Check your lookup definitions.", "Not Found", "info");
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_columns', 'No columns found.') });
      }
      else {
        record[field.mc_nome_colonna].next(res.res);
      }
    },
    /**
     * Genera `action_callback`/`mc_button_callback` usando `MetaService.suggestTableActionCallback`.
     * Legge il tipo azione da `md_action_type` (o fallback `mc_button_action_type`).
     * Case server supportati: `0` navigation, `1` method.call, `2` generate.file,
     * `3` export, `4` call.stored, `5` approve, `6` parametric.dialog,
     * `7` client sync, `8` client async, `9` show route payload, `10` upload (XLS/CSV -> tabella dinamica + stored).
     * Lato client questo metodo apre dialog dedicati per `0`, `1`, `3`, `10`; per gli altri
     * passa il payload base e delega la generazione finale al branch server corrispondente.
     * @param record Record metadata corrente.
     * @param field Campo callback da aggiornare.
     */
    async suggestTableActionCallback(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      const actionType = Number((record['md_action_type'] || record['mc_button_action_type'])?.value || 0);
      const payload = {
        md_action_type: actionType,
        target_route: '',
        target_archetype: '',
        target_class: '',
        target_method: '',
        target_export_format: '',
        field: field.mc_nome_colonna,
        target_table: '',
        target_stored: '',
        target_mode: ''
      };

      if (actionType === 0) {
        const routesRes = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestLookupTable"}`, { mc_id: 0 }).toPromise());
        const routesRaw = typeof routesRes === 'string' ? JSON.parse(routesRes || '[]') : (routesRes || []);
        const routeOptions = (Array.isArray(routesRaw) ? routesRaw : [])
          .filter((x: any) => !!String(x?.md_route_name || '').trim())
          .map((x: any) => {
            const routeName = String(x.md_route_name || '').trim();
            const caption = String(x.md_display_string || x.md_nome_tabella || routeName).trim();
            return { label: `${caption} (${routeName})`, value: routeName };
          })
          .sort((a, b) => a.label.localeCompare(b.label));

        routeOptions.unshift({ label: '', value: '' });

        const archetypeOptions = [
          { label: 'list', value: 'list' },
          { label: 'map', value: 'map' },
          { label: 'tree', value: 'tree' },
          { label: 'spreadsheet', value: 'spreadsheet' },
          { label: 'scheduler', value: 'scheduler' },
          { label: 'carousel', value: 'carousel' },
          { label: 'chart', value: 'chart' },
          { label: 'form', value: 'form' },
          { label: 'edit', value: 'edit' },
          { label: 'detail', value: 'detail' }
        ];

        if (!routeOptions.length) {
          WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_routes', 'No routes found.') });
          return;
        }

        const selected = await WtoolboxService.promptDialog(WtoolboxService.tr('suggest.navigation_target.title', 'Navigation target'), [
          {
            name: 'target_route',
            caption: WtoolboxService.tr('suggest.navigation_target.route', 'Route'),
            type: 'dictionary',
            dictionaryData: routeOptions,
            value: null
          },
          {
            name: 'target_archetype',
            caption: WtoolboxService.tr('suggest.navigation_target.action', 'Action'),
            type: 'dictionary',
            dictionaryData: archetypeOptions,
            value: 'list'
          }
        ], '520px', '320px');

        const selectedRoute = selected?.target_route?.value;
        const selectedArchetype = selected?.target_archetype?.value;
        if (!selectedRoute) {
          return;
        }

        payload.target_route = String(selectedRoute);
        payload.target_archetype = String(selectedArchetype || 'list');
      } else if (actionType === 1) {
        const classesRes = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.getAsmxProxyClasses"}`, {}).toPromise());
        const classesRaw = typeof classesRes === 'string' ? JSON.parse(classesRes || '[]') : (classesRes || []);
        const classes = Array.isArray(classesRaw) ? classesRaw : [];

        const classOptions = classes
          .filter((x: any) => !!String(x?.full_name || '').trim())
          .map((x: any) => {
            const fullName = String(x.full_name || '').trim();
            const name = String(x.name || fullName).trim();
            return { label: `${name} (${fullName})`, value: fullName };
          })
          .sort((a, b) => a.label.localeCompare(b.label));

        if (!classOptions.length) {
          WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_asmxproxy_classes', 'No AsmxProxy classes found.') });
          return;
        }

        const parseMethods = async (classFullName: string) => {
          if (!classFullName) {
            return [];
          }

          const methodsRes = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.getAsmxProxyMethods"}`, { class_full_name: classFullName }).toPromise());
          const methodsRaw = typeof methodsRes === 'string' ? JSON.parse(methodsRes || '[]') : (methodsRes || []);
          const methods = Array.isArray(methodsRaw) ? methodsRaw : [];
          return methods
            .filter((m: any) => !!String(m?.name || '').trim())
            .map((m: any) => {
              const pCount = Array.isArray(m?.parameters) ? m.parameters.length : 0;
              const methodName = String(m.name || '').trim();
              return { label: `${methodName} (${pCount})`, value: methodName };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
        };

        const toDictionaryValue = (items: { label: string, value: any }[]) =>
          (items || []).map(x => `${String(x.value)}@@${String(x.label).replaceAll('||', ' ').replaceAll('@@', ' ')}`).join('||');

        const initialMethodOptions: { label: string, value: any }[] = [];

        const selectedDialog = await WtoolboxService.promptDialog(WtoolboxService.tr('suggest.method_call_target.title', 'Method call target'), [
          {
            name: 'target_class',
            caption: WtoolboxService.tr('suggest.method_call_target.class', 'Class'),
            type: 'dictionary',
            dictionaryData: classOptions,
            value: null,
            selectionChanged: async (dialogRecord, dialogField, dialogMeta, newValue) => {
              const selectedClass = String(newValue || '').trim();
              const methods = selectedClass ? await parseMethods(selectedClass) : [];
              const methodField = (dialogMeta?.columnMetadata || []).find(x => x.mc_nome_colonna === 'target_method');

              if (!methodField) {
                return;
              }

              methodField.mc_dictionary_value = toDictionaryValue(methods);
              const methodEditor = methodField.editor?.value as any;
              if (methodEditor) {
                methodEditor.items = methods.map(x => ({ value: x.value, text: x.label, __selected: false }));
              }

              dialogRecord['target_method']?.next(methods.length ? methods[0].value : null);
            }
          },
          {
            name: 'target_method',
            caption: WtoolboxService.tr('suggest.method_call_target.method', 'Method'),
            type: 'dictionary',
            dictionaryData: initialMethodOptions,
            value: null
          }
        ], '620px', '300px');

        const selectedClass = String(selectedDialog?.target_class?.value || '').trim();
        const selectedMethod = String(selectedDialog?.target_method?.value || '').trim();
        if (!selectedClass) {
          return;
        }
        if (!selectedMethod) {
          WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_methods_for_selected_class', 'No methods found for selected class.') });
          return;
        }

        payload.target_class = selectedClass;
        payload.target_method = selectedMethod;
      } else if (actionType === 3) {
        const selectedExport = await WtoolboxService.promptDialog(WtoolboxService.tr('suggest.export_format.title', 'Export format'), [
          {
            name: 'target_export_format',
            caption: WtoolboxService.tr('suggest.export_format.format', 'Format'),
            type: 'dictionary',
            dictionaryData: [
              { label: 'xlsx', value: 'xls' },
              { label: 'pdf', value: 'pdf' }
            ],
            value: null
          }
        ], '420px', '250px');

        const selectedFormat = String(selectedExport?.target_export_format?.value || '').trim().toLowerCase();
        if (!selectedFormat) {
          return;
        }

        payload.target_export_format = selectedFormat;
      } else if (actionType === 10) {
        const selectedUpload = await WtoolboxService.promptDialog(
          WtoolboxService.tr('suggest.upload_target.title', 'Upload target'),
          [
            {
              name: 'target_table',
              caption: WtoolboxService.tr('suggest.upload_target.table', 'Target SQL table'),
              type: 'text',
              required: true,
              value: ''
            },
            {
              name: 'target_stored',
              caption: WtoolboxService.tr('suggest.upload_target.stored', 'Stored procedure name'),
              type: 'text',
              required: true,
              value: ''
            },
            {
              name: 'target_mode',
              caption: WtoolboxService.tr('suggest.upload_target.mode', 'Target mode'),
              type: 'dictionary',
              dictionaryData: [
                { label: 'replace (DROP + CREATE + INSERT)', value: 'replace' },
                { label: 'truncate (CREATE IF NOT EXISTS + TRUNCATE + INSERT)', value: 'truncate' },
                { label: 'append (CREATE IF NOT EXISTS + INSERT)', value: 'append' }
              ],
              value: 'replace'
            }
          ],
          '560px',
          '360px'
        );

        const selectedTable = String(selectedUpload?.target_table?.value || '').trim();
        const selectedStored = String(selectedUpload?.target_stored?.value || '').trim();
        const selectedMode = String(selectedUpload?.target_mode?.value || 'replace').trim().toLowerCase();
        if (!selectedTable || !selectedStored) {
          return;
        }

        payload.target_table = selectedTable;
        payload.target_stored = selectedStored;
        payload.target_mode = (selectedMode === 'truncate' || selectedMode === 'append') ? selectedMode : 'replace';
      }

      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestTableActionCallback"}`, payload).toPromise());
      const value = res?.res ?? res;

      if (!value) {
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_suggestions', 'No suggestions found.') });
      }
      else {
        record[field.mc_nome_colonna].next(value);
      }
    },
    /**
     * Apre un popup con 3 sorgenti link (menu metadata, dashboard salvate, workflow salvati)
     * e scrive il percorso selezionato nel campo target.
     * Regole link:
     * - menu: usa `mm_uri_menu` cosi com'e;
     * - dashboard: `<board_route>/dashboard`;
     * - workflow: `workflow-runner/<graph_key>` (route runner verificata).
     * @param record Record metadata corrente.
     * @param field Campo metadata destinazione link.
     */
    async suggestMenuLink(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, wtoolbox: typeof WtoolboxService = WtoolboxService) {
      const normalizeUniqueOptions = (items: { label: string; value: string }[]) =>
        Array.from(
          new Map(
            (items || [])
              .filter((x) => !!String(x?.value || '').trim())
              .map((x) => [String(x.value).trim().toLowerCase(), { label: String(x.label || x.value), value: String(x.value).trim() }])
          ).values()
        ).sort((a, b) => a.label.localeCompare(b.label));

      const flattenRawMenu = (items: any[], acc: { label: string; value: string }[]) => {
        (items || []).forEach((item: any) => {
          const uri = String(item?.mm_uri_menu || '').trim();
          const label = String(item?.mm_display_string_menu || uri).trim();
          if (uri) {
            acc.push({ label: `${label} (${uri})`, value: uri });
          }
          if (Array.isArray(item?._Metadati_Menus_Ordered) && item._Metadati_Menus_Ordered.length) {
            flattenRawMenu(item._Metadati_Menus_Ordered, acc);
          }
        });
      };

      const userInfoService = WtoolboxService.resolveInjectorRef()?.get(UserInfoService, null);
      const currentUserId = String(userInfoService?.getuserInfo?.()?.user_id || '').trim();

      let menuOptions: { label: string; value: string }[] = [];
      try {
        const rawMenu = await (wtoolbox.http.post<any>(
          `${wtoolbox.appSettings.global_root_url + "MetaService.getMenuByUserID"}`,
          { user_id: currentUserId || '' }
        ).toPromise());
        flattenRawMenu(Array.isArray(rawMenu) ? rawMenu : [], menuOptions);
      } catch {
        menuOptions = [];
      }
      menuOptions = normalizeUniqueOptions(menuOptions);

      let dashboardOptions: { label: string; value: string }[] = [];
      try {
        const rawDashboards = await (wtoolbox.http.post<any>(
          `${wtoolbox.appSettings.global_root_url + "MetaService.loadDashboard"}`,
          { user_id: currentUserId || '', dashRoute: '' }
        ).toPromise());
        dashboardOptions = normalizeUniqueOptions((Array.isArray(rawDashboards) ? rawDashboards : []).map((row: any) => {
          const boardRoute = String(row?.board_route || row?.boardroute || '').trim();
          const boardDes = String(row?.board_des || row?.boarddes || boardRoute).trim();
          return { label: `${boardDes} (${boardRoute})`, value: boardRoute };
        }));
      } catch {
        dashboardOptions = [];
      }

      let workflowOptions: { label: string; value: string }[] = [];
      try {
        const rawWorkflows = await (wtoolbox.http.post<any>(
          `${wtoolbox.appSettings.global_root_url + "MetaService.getWorkflowGraphs"}`,
          { user_id: '' }
        ).toPromise());
        const rows = Array.isArray(rawWorkflows) ? rawWorkflows : (Array.isArray(rawWorkflows?.results) ? rawWorkflows.results : []);
        workflowOptions = normalizeUniqueOptions(rows.map((row: any) => {
          const key = String(row?.graph_key || row?.wg_key || '').trim();
          const name = String(row?.graph_name || row?.wg_name || key).trim();
          return { label: `${name} (${key})`, value: key };
        }));
      } catch {
        workflowOptions = [];
      }

      const selected = await wtoolbox.promptDialog(
        WtoolboxService.tr('suggest.menu_link.title', 'Select target link'),
        [
          {
            name: 'menu_uri',
            caption: WtoolboxService.tr('suggest.menu_link.menu_uri', 'Menu link'),
            type: 'dictionary',
            dictionaryData: [{ label: '', value: '' }, ...menuOptions],
            value: null,
            selectionChanged: (dialogRecord) => {
              dialogRecord['dashboard_route']?.next(null);
              dialogRecord['workflow_key']?.next(null);
            }
          },
          {
            name: 'dashboard_route',
            caption: WtoolboxService.tr('suggest.menu_link.dashboard_route', 'Dashboard'),
            type: 'dictionary',
            dictionaryData: [{ label: '', value: '' }, ...dashboardOptions],
            value: null,
            selectionChanged: (dialogRecord) => {
              dialogRecord['menu_uri']?.next(null);
              dialogRecord['workflow_key']?.next(null);
            }
          },
          {
            name: 'workflow_key',
            caption: WtoolboxService.tr('suggest.menu_link.workflow_key', 'Workflow'),
            type: 'dictionary',
            dictionaryData: [{ label: '', value: '' }, ...workflowOptions],
            value: null,
            selectionChanged: (dialogRecord) => {
              dialogRecord['menu_uri']?.next(null);
              dialogRecord['dashboard_route']?.next(null);
            }
          }
        ],
        '760px',
        '360px'
      );

      if (!selected) {
        return;
      }

      const selectedMenuUri = String(selected?.menu_uri?.value || '').trim();
      const selectedDashboardRoute = String(selected?.dashboard_route?.value || '').trim();
      const selectedWorkflowKey = String(selected?.workflow_key?.value || '').trim();

      let link = '';
      if (selectedMenuUri) {
        link = selectedMenuUri;
      } else if (selectedDashboardRoute) {
        link = `${selectedDashboardRoute}/dashboard`;
      } else if (selectedWorkflowKey) {
        link = `workflow-runner/${encodeURIComponent(selectedWorkflowKey)}`;
      }

      if (!link) {
        return;
      }

      record[field.mc_nome_colonna]?.next(link);
    },
    /**
     * Ottiene da `MetaService.suggestSelectionChangedCallback` un callback che usa
     * `newValue/oldValue` e aggiorna un campo compatibile della stessa tabella.
     * @param record Record metadata corrente (usa `mc_id`).
     * @param field Campo callback destinazione.
     */
    async suggestSelectionChangedCallback(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestSelectionChangedCallback"}`, { mc_id: record['mc_id'].value }).toPromise());

      if (!res?.res) {
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_columns', 'No columns found.') });
      }
      else {
        record[field.mc_nome_colonna].next(res.res);
      }
    },
    /**
     * Richiede `MetaService.suggestSuggest` e salva callback "suggest value" che,
     * se il campo Ã¨ vuoto, imposta un valore iniziale coerente col tipo colonna.
     * @param record Record metadata corrente (usa `mc_id`).
     * @param field Campo callback da valorizzare.
     */
    async suggestSuggestValueCallback(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      const res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestSuggest"}`, { mc_id: record['mc_id'].value }).toPromise());
      const value = res?.res ?? res;

      if (!value) {
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_columns', 'No columns found.') });
      } else {
        record[field.mc_nome_colonna].next(value);
      }
    },
    /**
     * Richiede `MetaService.suggestGridColumnDataTemplate` e imposta template cella grid:
     * upload con preview/link, color swatch per `color`, fallback testo formattato per altri tipi.
     * @param record Record metadata corrente (usa `mc_id`).
     * @param field Campo template da aggiornare.
     */
    async suggestGridColumnDataTemplate(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      const res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestGridColumnDataTemplate"}`, { mc_id: record['mc_id'].value }).toPromise());
      const value = res?.res ?? res;

      if (!value) {
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_columns', 'No columns found.') });
      } else {
        record[field.mc_nome_colonna].next(value);
      }
    },
    /**
     * Chiede `MetaService.suggestConditionalCellTemplate` e distribuisce il risultato `[classe, condizione]`
     * su tre metadati cella: `mc_ui_grid_conditional_template_class`,
     * `mc_ui_grid_conditional_alt_template_class`, `mc_ui_grid_conditional_template_condition`.
     * @param record Record metadata corrente (usa `mc_id`).
     * @param field Campo corrente (non usato per il write diretto in questo metodo).
     */
    async suggestConditionalCellTemplate(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestConditionalCellTemplate"}`, { mc_id: record['mc_id'].value }).toPromise());

      if (!res.res) {
        // self.notification.alert("No lookups found. Check your lookup definitions.", "Not Found", "info");
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_columns', 'No columns found.') });
      }
      else {
        record['mc_ui_grid_conditional_template_class'].next(res.res[0]);
        record['mc_ui_grid_conditional_alt_template_class'].next(res.res[0]);
        record['mc_ui_grid_conditional_template_condition'].next(res.res[1]);
      }
    },

    async suggestConditionalCellStyle(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestConditionalCellTemplate"}`, { mc_id: record['mc_id'].value }).toPromise());

      if (!res.res) {
        // self.notification.alert("No lookups found. Check your lookup definitions.", "Not Found", "info");
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_columns', 'No columns found.') });
      }
      else {
        record['musc_attribute_name'].next(res.res[0]);
        record['musc_attribute_value'].next(res.res[1]);
      }
    },

    async suggestConditionalRowStyle(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestConditionalRowStyle"}`, { md_id: record['md_id'].value }).toPromise());

      if (!res.res) {
        // self.notification.alert("No lookups found. Check your lookup definitions.", "Not Found", "info");
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_columns', 'No columns found.') });
      }
      else {
        record['must_attribute_name'].next(res.res[0]);
        record['must_attribute_value'].next(res.res[1]);
      }
    },

    /**
     * Richiede `MetaService.suggestCustomValidation` e salva uno script validazione:
     * il template server cambia per tipo colonna (numero/data/boolean/testo) e imposta `vr.isValid`.
     * @param record Record metadata corrente (usa `mc_id`).
     * @param field Campo callback validazione da valorizzare.
     */
    async suggestCustomValidation(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestCustomValidation"}`, { mc_id: record['mc_id'].value }).toPromise());
      if (!res.res) {
        // self.notification.alert("No lookups found. Check your lookup definitions.", "Not Found", "info");
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_columns', 'No columns found.') });
      }
      else {
        record[field.mc_nome_colonna].next(res.res);
      }
    },
    /**
     * Clona configurazione lookup da una colonna esistente proposta da `MetaService.suggestLookup2`.
     * Dopo selezione utente copia nel record corrente i principali metadati lookup:
     * entitÃ , text/value field, filtri, computed text, permessi edit/insert, navigation,
     * `mc_custom_join`, `mc_serverside_operations`, paging e display string.
     * @param record Record metadata corrente (usa `mc_id`).
     * @param field Campo invocante (usato per contesto, non come unica destinazione).
     */
    async suggestLookup(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestLookup2"}`, { mc_id: record['mc_id'].value }).toPromise());

      if (res.length == 0) {
        // self.notification.alert("No lookups found. Check your lookup definitions.", "Not Found", "info");
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_column', 'No column found.') });
      }
      else {
        WtoolboxService.promptDialog(WtoolboxService.translationService.instant("select.column"), [
          {
            name: "table",
            caption: WtoolboxService.translationService.instant("table"),
            type: "dictionary",
            dictionaryData: res.map(x => { return { label: x.mc_ui_lookup_entity_name + ' <-(' + x.mc_nome_colonna + '[' + x.mc_display_string_in_view + ']) ' + x._Metadati_Tabelle.md_display_string, value: x.mc_id } })
          }
        ], '500px', '500px', null).then((selectedId) => {
          if (selectedId) {
            let selectedCol = res.find(x => x.mc_id == selectedId.table.value);
            record['mc_ui_lookup_entity_name'].next(selectedCol.mc_ui_lookup_entity_name);
            record['mc_ui_lookup_dataTextField'].next(selectedCol.mc_ui_lookup_dataTextField);
            record['mc_ui_lookup_dataValueField'].next(selectedCol.mc_ui_lookup_dataValueField);
            record['mc_ui_lookup_filter'].next(selectedCol.mc_ui_lookup_filter);
            record['mc_ui_lookup_computed_dataTextField'].next(selectedCol.mc_ui_lookup_computed_dataTextField);
            record['mc_ui_lookup_combo_text_edit_computed_dataTextField'].next(selectedCol.mc_ui_lookup_combo_text_edit_computed_dataTextField);
            record['mc_ui_lookup_edit_allow'].next(selectedCol.mc_ui_lookup_edit_allow);
            record['mc_ui_lookup_insert_allow'].next(selectedCol.mc_ui_lookup_insert_allow);
            record['mc_ui_lookup_search_grid'].next(selectedCol.mc_ui_lookup_search_grid);
            record['mc_logic_allow_navigation'].next(selectedCol.mc_logic_allow_navigation);
            record['mc_logic_navigate_new_window'].next(selectedCol.mc_logic_navigate_new_window);
            record['mc_custom_join'].next(selectedCol.mc_custom_join);
            record['mc_serverside_operations'].next(selectedCol.mc_serverside_operations ? 1 : 0);
            record['mc_ui_pagesize'].next(selectedCol.mc_ui_pagesize);
            record['mc_display_string_in_view'].next(selectedCol.mc_display_string_in_view);
            record['mc_display_string_in_edit'].next(selectedCol.mc_display_string_in_edit);
          }
        });
      }
    },
    /**
     * Genera filtro default per lookup via `MetaService.suggestLookupDefaultFilter`
     * (internamente delega ai filtri della `mc_ui_lookup_entity_name` associata).
     * @param record Record metadata corrente (usa `mc_id`).
     * @param field Campo filtro lookup da aggiornare.
     */
    async suggestLookupDefaultFilter(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.suggestLookupDefaultFilter"}`, { mc_id: record['mc_id'].value }).toPromise());

      if (!res.res) {
        // self.notification.alert("No lookups found. Check your lookup definitions.", "Not Found", "info");
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_columns', 'No columns found.') });
      }
      else {
        record[field.mc_nome_colonna].next(res.res);
      }
    },
    /**
     * Assistente visuale per `md_props_bag`: propone albero di chiavi standard (archetypes/map/chart/carousel,
     * groupInfo, aggregates, cloneDefinition, ecc.), mantiene i parent necessari e salva JSON
     * contenente solo i rami selezionati.
     * @param record Record metadata corrente.
     * @param field Campo `md_props_bag` target.
     */
    async suggestTablePropsBag(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      const defaultPropsBag: any = {
        // Routing dati custom verso provider alternativi (odata/webservice).
        // Il dispatcher `DataProviderService.select` legge type+uri per
        // decidere il sub-service. parameterMapping consente di mappare
        // valori dal record parent ai query params dell'endpoint.
        endpoint: {
          type: 'odata',
          method: 'get',
          uri: '',
          parameterMapping: []
        },
        // Parametri di route (stored procedure / query parametrizzate).
        // Rehydrati in tableMetadata.parameterInfo come MetadatiColonna
        // sintetiche e usati dalla filter-bar.
        parameters: [],
        serverProperties: {
          queryOptimization: {
            enabled: false,
            countPolicy: "exact",
            sqlServerHint: "none"
          },
          RecordTranslations: {
            Enabled: false,
            DefaultTableName: "_record_field_translations",
            TranslationJsonFieldName: "translation_json",
            DefaultLanguage: "",
            FieldNames: []
          }
        },
        archetypes: {
          list: {
            proportionalColwidth: true,
            advancedFilter: false,
            virtualize: {
              enabled: false,
              itemSize: 44
            }
          },
          edit: {
            advancedFilter: false
          },
          detail: {
            advancedFilter: false
          },
          map: {
            advancedFilter: false,
            center: null,
            zoom: 8
          },
          chart: {
            advancedFilter: false,
            title: '',
            categoryField: '',
            valueField: '',
            dataOptions: {}
          },
          carousel: {
            advancedFilter: false,
            imageFieldName: '',
            descriptionFieldName: '',
            imageWidth: 320,
            pageSize: 10,
            usePreview: false
          },
          scheduler: {
            advancedFilter: false
          },
          spreadsheet: {
            advancedFilter: false
          },
          tree: {
            advancedFilter: false
          },
          // Form archetype — layout del form edit/detail.
          form: {
            columns: 1,
            orderedTabs: []
          },
          kanban: {
            advancedFilter: false,
            statusField: '',
            colorField: '',
            wipLimitField: '',
            wipLimitHardField: '',
            assignedUserIdField: '',
            statusColumns: [
              {
                value: 'todo',
                label: 'To Do',
                color: '#dbeafe',
                order: 0,
                wipLimit: null,
                wipLimitHard: false
              },
              {
                value: 'in_progress',
                label: 'In Progress',
                color: '#dbeafe',
                order: 1,
                wipLimit: null,
                wipLimitHard: false
              },
              {
                value: 'review',
                label: 'Review',
                color: '#fef3c7',
                order: 2,
                wipLimit: null,
                wipLimitHard: false
              },
              {
                value: 'done',
                label: 'Done',
                color: '#dcfce7',
                order: 3,
                wipLimit: null,
                wipLimitHard: false
              }
            ],
            titleField: '',
            descriptionField: '',
            cardSubtitleField: '',
            clickAction: 'detail',
            persistMode: 'immediate'
          }
        },
        groupInfo: [],
        aggregates: [],
        changeTracking: false,
        client_side_crud: {
          enabled: true,
          batchSize: 200,
          maxPages: 20,
          includeLookupRoutes: true
        },
        import: {
          enabled: true,
          skipsettings: false,
          allowedExtensions: [
            "xls",
            "xlsx"
          ],
          import_type: "I",
          commit_level: "R",
          use_column_captions: "C",
          use_descriptive_fkey: true,
          separator: ";"
        },
        notifications: {
          triggerRules: [
            {
              enabled: true,
              event: 'insert',
              watchColumns: [],
              userIdExpr: '{{owner_user_id}}',
              typeTemplate: 'info',
              messageTemplate: 'Nuovo record su {{id}}',
              targetTemplate: '{"path":"/{{md_route_name}}/edit/{{id}}"}',
              payloadTemplate: '{"route":"{{md_route_name}}","id":"{{id}}"}',
              source: '{{md_route_name}}',
              triggerName: ''
            },
            {
              enabled: true,
              event: 'update',
              watchColumns: [],
              userIdExpr: '{{owner_user_id}}',
              typeTemplate: 'info',
              messageTemplate: 'Aggiornamento record {{id}}',
              targetTemplate: '{"path":"/{{md_route_name}}/edit/{{id}}"}',
              payloadTemplate: '{"route":"{{md_route_name}}","id":"{{id}}"}',
              source: '{{md_route_name}}',
              triggerName: ''
            },
            {
              enabled: true,
              event: 'delete',
              watchColumns: [],
              userIdExpr: '{{owner_user_id}}',
              typeTemplate: 'warn',
              messageTemplate: 'Eliminato record {{id}}',
              targetTemplate: '{"path":"/{{md_route_name}}/list"}',
              payloadTemplate: '{"route":"{{md_route_name}}","id":"{{id}}","event":"delete"}',
              source: '{{md_route_name}}',
              triggerName: ''
            }
          ]
        },
        cloneDefinition: {
          relatedRoutes: []
        },
        // Toolbar-level hide/show flags, cambiabili per-route senza toccare
        // lo schema SQL di _metadati__tabelle.
        toolbar: {
          // Nasconde "Gestione stato" (bookmark) + select stati salvati.
          // Utile per route hardcoded/demo dove il saved-state feature
          // (persistenza user_id+route via MetaService) non ha senso.
          hideManageState: false
        }
      };

      const clone = (value: any) => JSON.parse(JSON.stringify(value));
      const rows: any[] = [];
      const valueByPath = new Map<string, any>();
      let nextId = 1;

      const addNode = (key: string, value: any, parentId: number | null, parentPath: string[]) => {
        const id = nextId++;
        const pathParts = parentPath.concat([key]);
        const path = pathParts.join('.');
        const isArray = Array.isArray(value);
        const isObject = !!value && typeof value === 'object' && !isArray;
        const valueType = isArray ? 'array' : (isObject ? 'object' : typeof value);
        const displayName = isObject || isArray ? `${key} (${valueType})` : `${key}: ${valueType}`;

        rows.push({
          id: id,
          parent: parentId,
          displayName: displayName,
          path: path,
          isTable: false
        });

        valueByPath.set(path, clone(value));

        if (isObject) {
          Object.keys(value).forEach((childKey) => {
            addNode(childKey, value[childKey], id, pathParts);
          });
        }
      };

      Object.keys(defaultPropsBag).forEach((key) => {
        addNode(key, defaultPropsBag[key], null, []);
      });

      const flattenedTreeDataSource = [];
      const treeDataSource = WtoolboxService.createHierarchicalDataModel(rows, "id", "parent", flattenedTreeDataSource);

      const selected = await WtoolboxService.promptDialog(WtoolboxService.tr('suggest.md_props_bag.title', 'Suggest md_props_bag'), [
        {
          name: "value",
          caption: WtoolboxService.tr('suggest.md_props_bag.extra_properties', 'Extra properties'),
          type: "tree",
          dictionaryData: treeDataSource,
          route: { lookupDesField: "displayName" },
          selectionChanged: (dialogRecord, dialogField, dialogMeta, newValue, oldValue, wtoolbox, nestedIndex, nodes) => {
            const selectedNodes = Array.isArray(newValue) ? newValue.slice() : [];
            const allNodes = Array.isArray(nodes) ? nodes : [];
            const byKey = new Map<any, any>();

            selectedNodes.forEach((x) => byKey.set(x?.key, x));
            selectedNodes.forEach((x) => {
              WtoolboxService.suggestions.checkParentTables(x, selectedNodes, allNodes);
            });
            selectedNodes.forEach((x) => byKey.set(x?.key, x));

            dialogRecord['value']?.next(Array.from(byKey.values()));
          }
        }
      ], '640px', '560px', null);

      const selectedNodes = selected?.value?.value;
      if (!Array.isArray(selectedNodes) || !selectedNodes.length) {
        return;
      }

      const setPathValue = (target: any, pathParts: string[], value: any) => {
        let cursor = target;
        for (let i = 0; i < pathParts.length - 1; i++) {
          const segment = pathParts[i];
          if (!cursor[segment] || typeof cursor[segment] !== 'object' || Array.isArray(cursor[segment])) {
            cursor[segment] = {};
          }
          cursor = cursor[segment];
        }
        cursor[pathParts[pathParts.length - 1]] = value;
      };

      const selectedPaths = WtoolboxService
        .keepOnlyLeafPaths(
          selectedNodes.map((x) => String(x?.object?.path || '').trim())
        )
        .sort((a, b) => a.split('.').length - b.split('.').length);

      let suggestedJson: any = {};
      selectedPaths.forEach((path) => {
        const templateValue = valueByPath.get(path);
        if (templateValue === undefined) {
          return;
        }
        const fragment: any = {};
        setPathValue(fragment, path.split('.'), clone(templateValue));
        suggestedJson = WtoolboxService.deepMerge(suggestedJson, fragment);
      });

      let existingJson: any = {};
      const currentValue = record[field.mc_nome_colonna]?.value;
      if (currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
        existingJson = clone(currentValue);
      } else if (typeof currentValue === 'string' && currentValue.trim().length > 0) {
        try {
          const parsed = JSON.parse(currentValue);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            existingJson = parsed;
          }
        } catch {
          // se il JSON esistente e invalido non blocchiamo il suggest
          existingJson = {};
        }
      }

      const mergedJson = WtoolboxService.deepMerge(existingJson, suggestedJson);
      record[field.mc_nome_colonna].next(JSON.stringify(mergedJson, null, 2));
    },
    /**
     * Assistente visuale per `mc_props_bag`: propone chiavi colonna (form/style/lookup/customEditorConfig/uploader),
     * permette selezione ad albero e salva JSON minimo con i soli path scelti.
     * @param record Record metadata corrente.
     * @param field Campo `mc_props_bag` target.
     */
    async suggestColumnPropsBag(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      const defaultPropsBag: any = {
        parameters: [],
        form: {
          columns: 1,
          disabled: false
        },
        style: {
          editCss: ''
        },
        checkUniqueValue: '',
        lookup: {
          filter: null,
          virtualize: {
            enabled: false,
            itemSize: 44
          },
          // Override provider dati del dropdown lookup: invece del
          // combo-endpoint metadata standard (MetaService.getFlatRecordComboData),
          // instrada il FETCH direttamente al provider dichiarato.
          endpoint: {
            type: 'odata',
            uri: ''
          },
          // Legacy: items client-only iniettati nel dropdown senza passare dal server.
          unboundedItems: []
        },
        customEditorConfig: {
          editorOptions: {
            language: 'sql'
          },
          compilerOptions: {},
          schemas: [],
          codeContext: '',
          extraLibs: [],
          routeContextField: '',
          columnContextField: '',
          // Auto-format HTML sull'editor `html_area` (solo `false` esplicito disattiva).
          htmlAutoFormat: true
        },
        uploader: {
          beforeUpload: ''
        },
        // Slim combo: restringe le colonne fetchate dal combo-endpoint ai soli
        // campi necessari al dropdown (PK + text + extraFields). Vive al
        // TOP-LEVEL di extras (non sotto `lookup`), matchando l'accesso runtime
        // `field.extras.slimCombo` in DataProviderMetaService.buildSlimComboRestriction.
        // Valori: true (default, slim attivo) | false (opt-out full fetch) | string[] (slim + extra cols).
        slimCombo: true
      };

      const clone = (value: any) => JSON.parse(JSON.stringify(value));
      const rows: any[] = [];
      const valueByPath = new Map<string, any>();
      let nextId = 1;

      const addNode = (key: string, value: any, parentId: number | null, parentPath: string[]) => {
        const id = nextId++;
        const pathParts = parentPath.concat([key]);
        const path = pathParts.join('.');
        const isArray = Array.isArray(value);
        const isObject = !!value && typeof value === 'object' && !isArray;
        const valueType = isArray ? 'array' : (isObject ? 'object' : typeof value);
        const displayName = isObject || isArray ? `${key} (${valueType})` : `${key}: ${valueType}`;

        rows.push({
          id: id,
          parent: parentId,
          displayName: displayName,
          path: path,
          isTable: false
        });

        valueByPath.set(path, clone(value));

        if (isObject) {
          Object.keys(value).forEach((childKey) => {
            addNode(childKey, value[childKey], id, pathParts);
          });
        }
      };

      Object.keys(defaultPropsBag).forEach((key) => {
        addNode(key, defaultPropsBag[key], null, []);
      });

      const flattenedTreeDataSource = [];
      const treeDataSource = WtoolboxService.createHierarchicalDataModel(rows, "id", "parent", flattenedTreeDataSource);

      const selected = await WtoolboxService.promptDialog(WtoolboxService.tr('suggest.mc_props_bag.title', 'Suggest mc_props_bag'), [
        {
          name: "value",
          caption: WtoolboxService.tr('suggest.mc_props_bag.column_extra_properties', 'Column extra properties'),
          type: "tree",
          dictionaryData: treeDataSource,
          route: { lookupDesField: "displayName" },
          selectionChanged: (dialogRecord, dialogField, dialogMeta, newValue, oldValue, wtoolbox, nestedIndex, nodes) => {
            const selectedNodes = Array.isArray(newValue) ? newValue.slice() : [];
            const allNodes = Array.isArray(nodes) ? nodes : [];
            const byKey = new Map<any, any>();

            selectedNodes.forEach((x) => byKey.set(x?.key, x));
            selectedNodes.forEach((x) => {
              WtoolboxService.suggestions.checkParentTables(x, selectedNodes, allNodes);
            });
            selectedNodes.forEach((x) => byKey.set(x?.key, x));

            dialogRecord['value']?.next(Array.from(byKey.values()));
          }
        }
      ], '640px', '560px', null);

      const selectedNodes = selected?.value?.value;
      if (!Array.isArray(selectedNodes) || !selectedNodes.length) {
        return;
      }

      const setPathValue = (target: any, pathParts: string[], value: any) => {
        let cursor = target;
        for (let i = 0; i < pathParts.length - 1; i++) {
          const segment = pathParts[i];
          if (!cursor[segment] || typeof cursor[segment] !== 'object' || Array.isArray(cursor[segment])) {
            cursor[segment] = {};
          }
          cursor = cursor[segment];
        }
        cursor[pathParts[pathParts.length - 1]] = value;
      };

      const selectedPaths = WtoolboxService
        .keepOnlyLeafPaths(
          selectedNodes.map((x) => String(x?.object?.path || '').trim())
        )
        .sort((a, b) => a.split('.').length - b.split('.').length);

      let suggestedJson: any = {};
      selectedPaths.forEach((path) => {
        const templateValue = valueByPath.get(path);
        if (templateValue === undefined) {
          return;
        }
        const fragment: any = {};
        setPathValue(fragment, path.split('.'), clone(templateValue));
        suggestedJson = WtoolboxService.deepMerge(suggestedJson, fragment);
      });

      record[field.mc_nome_colonna].next(JSON.stringify(suggestedJson, null, 2));
    },
    /**
     * Carica la gerarchia lookup per ID (`MetaService.getLookupListByIDLevelUP`) e apre il selettore tree
     * per comporre automaticamente la formula/lookup da applicare al campo metadata.
     * @param record Record corrente usato dalla logica/metadati.
     * @param field Metadato colonna/campo coinvolto nell'elaborazione.
     */
    async getLookupListByID(record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
      let res = await (WtoolboxService.http.post<any>(`${WtoolboxService.appSettings.global_root_url + "MetaService.getLookupListByIDLevelUP"}`, { mc_id: record['mc_id'].value }).toPromise());

      if (res.length == 0) {
        // self.notification.alert("No lookups found. Check your lookup definitions.", "Not Found", "info", null, 300);
        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: WtoolboxService.tr('common.not_found_summary', 'Not Found'), detail: WtoolboxService.tr('common.not_found_lookups_check_definitions', 'No lookups found. Check your lookup definitions.') });
      }
      else {
        let flattenedTreeDataSource = [];
        let lookupTreeDataSource = WtoolboxService.createHierarchicalDataModel(res, "id", "parent", flattenedTreeDataSource);

        WtoolboxService.promptDialog(WtoolboxService.translationService.instant("select.lookup"), [
          {
            name: "value",
            caption: WtoolboxService.translationService.instant("formula"),
            type: "tree",
            dictionaryData: lookupTreeDataSource,
            route: { lookupDesField: "displayName" }
          }
        ], '500px', '500px', null).then((res) => {
          if (res?.value?.value) {
            WtoolboxService.suggestions.getClauseByLookupHierarchy(res.value.value.map(x => x.object), record, field, 0);
          }
        });

      }
    },
  }

  public static metadataFunctions: any = {};

}



