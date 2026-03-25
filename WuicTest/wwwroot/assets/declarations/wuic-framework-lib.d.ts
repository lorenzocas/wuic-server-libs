import * as i0 from '@angular/core';
import { ErrorHandler, Injector, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, OnChanges, SimpleChanges, TemplateRef, NgZone, DoCheck, ElementRef, EventEmitter, PipeTransform } from '@angular/core';
import * as rxjs from 'rxjs';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { MenuItem, MessageService, ConfirmationService, Confirmation, MegaMenuItem } from 'primeng/api';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute, CanDeactivateFn, Routes } from '@angular/router';
import { CookieService } from 'ngx-cookie-service';
import { TranslateService } from '@ngx-translate/core';
import * as primeng_dynamicdialog from 'primeng/dynamicdialog';
import { DialogService, DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { Table, TableRowExpandEvent, TableRowCollapseEvent } from 'primeng/table';
import { DomSanitizer, Title, SafeHtml } from '@angular/platform-browser';
import { Location } from '@angular/common';
import { ContextMenu } from 'primeng/contextmenu';
import { FullCalendarComponent } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import { SplitButton } from 'primeng/splitbutton';
import { Menubar } from 'primeng/menubar';
import { AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { PrimeNG } from 'primeng/config';
import { ParametricDialogComponent as ParametricDialogComponent$1 } from 'wuic-framework-lib-src/component/parametric-dialog/parametric-dialog.component';
import { MonacoEditorComponent, MonacoEditorLoaderService } from '@materia-ui/ngx-monaco-editor';
import { Popover } from 'primeng/popover';
import { StimulsoftDesignerComponent } from 'stimulsoft-designer-angular';
import { StimulsoftViewerComponent } from 'stimulsoft-viewer-angular';
import * as wuic_framework_lib from 'wuic-framework-lib';

declare class CustomException {
    title: string;
    stackTrace: string;
    query: string;
    code: number;
}

declare class GlobalHandler implements ErrorHandler {
    static messageNotification: BehaviorSubject<{
        show: boolean;
        exception: CustomException;
    }>;
    handleError(e: any): void;
}

declare class WidgetDefinition {
    defaultHeight: string;
    defaultWidth: string;
    defaultFilterWidth: string;
    fieldLabelInline: boolean;
    formColumns: number;
    filterOperators: any[];
    lookupServerPageCount: number;
    gridRowImports?: any[];
    dynamicFormImports?: any[];
    gridRowTemplate?: string;
    schedulerEventTemplate?: string;
    mapEventTemplate?: string;
    treeItemTemplate?: string;
    menuParams?: {
        ulWith: string;
        liWidth: string;
        itemCountThreshold: number;
    };
    archetypes: {
        [key: string]: {
            markup: string;
            component: any;
            designerOptions?: any;
        };
    };
    constructor();
}

declare class rawPagedResult {
    TotalRecords?: number;
    TotalGroups?: number;
    results: Array<any>;
    Agg?: any;
    constructor();
}

declare class ResultInfo {
    totalRowCount?: number;
    totalGroups?: number;
    dato: Array<any>;
    current: {
        [key: string]: BehaviorSubject<any>;
    };
    Agg?: any[];
    route?: string;
    constructor(dato?: {
        [key: string]: BehaviorSubject<any>;
    });
}

declare class FilterItem {
    field: string;
    operatore: string;
    value: string;
    fixed?: boolean;
    __extra?: boolean;
    __descriptorManaged?: boolean;
    constructor(params: {
        field: string;
        operator: string;
        value: string;
        fixed?: boolean;
        __extra?: boolean;
        __descriptorManaged?: boolean;
    });
}

declare class FilterInfo {
    logic: "AND" | "OR";
    filters: FilterItem[];
    constructor(logic: "AND" | "OR", filters: FilterItem[]);
}

declare class Lingua {
    id: string;
    lingua: string;
    constructor(id: string, lingua: string);
}

declare class Translation {
    Language: string;
    Resource: string;
    Translation1: string;
    Id?: number;
    constructor();
}

declare class UserInfo {
    user_id: number;
    user_name: string;
    display_name: string;
    role: string;
    role_id: number;
    isAdmin: boolean;
    lingua: Lingua;
    constructor(params: {
        user_id: number;
        user_name: string;
        display_name: string;
        role: string;
        role_id: number;
        isAdmin: boolean;
        lingua: Lingua;
    });
}

declare class UserInfoService {
    private cookieService;
    constructor(cookieService: CookieService);
    /**
     * Valuta una condizione booleana sullo stato o sull'input corrente.
     * @returns Valore restituito dal metodo (boolean).
     */
    hasStoredUserInfo(): boolean;
    /**
     * Legge e deserializza il cookie `k-user` restituendo il profilo utente persistito dal login legacy.
     * @returns Profilo utente oppure `null` se cookie assente/non valido.
     */
    getStoredUserInfo(): UserInfo | null;
    /**
     * Pulisce lo stato runtime e le cache associate.
     */
    clearUserInfo(): void;
    /**
     * Valuta una condizione booleana sullo stato o sull'input corrente.
     * @param userLike Oggetto utente da leggere (preferendo cookie e fallback ai campi legacy).
     * @returns Valore restituito dal metodo (boolean).
     */
    isUserAdmin(userLike: any): boolean;
    /**
     * Valuta una condizione booleana sullo stato o sull'input corrente.
     * @returns Valore restituito dal metodo (boolean).
     */
    isCurrentUserAdmin(): boolean;
    isAuthAdmin(auth?: {
        legacyRole?: string;
        claims?: {
            type?: string;
            value?: string;
        }[];
    } | null): boolean;
    /**
     * Normalizza un payload utente eterogeneo e lo salva nel cookie `k-user` usato dal framework legacy.
     * @param userLike Oggetto utente in formato libero (server/legacy/client).
     */
    setUserInfoCookie(userLike: any): void;
    /**
     * Salva nel cookie `k-user` un utente admin fittizio, utile in contesti sviluppo/debug locale.
     */
    setDummyUserInfo(): string;
    /**
     * Restituisce l'utente corrente dal cookie `k-user`; se assente puo creare un utente dummy in base a `allowDummyUserInfo`.
     * @returns Profilo utente corrente.
     */
    getuserInfo(): UserInfo;
    static ɵfac: i0.ɵɵFactoryDeclaration<UserInfoService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<UserInfoService>;
}

declare class TranslationManagerService {
    private http;
    private inj;
    private authSrv;
    private ngxTranslate;
    private readonly translationCacheKey;
    private readonly likelyMojibakePattern;
    httpOptions: {
        withCredentials: boolean;
    };
    translationTable: Translation[];
    translationsLoaded$: BehaviorSubject<boolean>;
    private loadPromise?;
    private backendRetryTimer?;
    constructor(http: HttpClient, inj: Injector, authSrv: UserInfoService, ngxTranslate: TranslateService);
    /**
     * Entry point di bootstrap traduzioni: garantisce che la tabella traduzioni sia caricata prima dell'uso del servizio.
     */
    setEndPoint(): Promise<void>;
    /**
     * Carica le traduzioni da localStorage (`translation`) o da backend quando necessario, normalizza encoding e aggiorna ngx-translate.
     * Usa deduplica richieste in-flight per evitare download concorrenti della stessa tabella.
     * @param forceReload Se `true` ignora cache/memoizzazione e ricarica da backend.
     */
    ensureTranslationsLoaded(forceReload?: boolean): Promise<void>;
    /**
     * Espone la lista lingue supportate dal framework, usata da selettori lingua e fallback traduzioni.
     * @returns Collezione codici lingua disponibili (`it-IT`, `en-US`, ...).
     */
    getLingue(): Array<Lingua>;
    /**
     * Carica i dati richiesti dal flusso runtime del servizio.
     * Legge/scrive dati persistenti su storage browser.
     */
    loadTranslations(): Promise<void>;
    /**
     * Sincronizza le risorse interne con `@ngx-translate/core`, scegliendo lingua utente/fallback tra quelle disponibili.
     */
    private syncNgxTranslate;
    private resolveSupportedLang;
    /**
     * Restituisce la traduzione istantanea della risorsa richiesta tramite tabella gia caricata.
     * @param resource Chiave risorsa da tradurre.
     */
    instant(resource: string): string;
    /**
     * Applica placeholder formatting stile `{0}`, `{1}`, ... alla stringa passata.
     * @param stringa Template da formattare.
     */
    format(stringa: string, ...args: any[]): string;
    /**
     * Costruisce il dizionario risorse `{ Resource: Translation1 }` per una lingua specifica (o lingua utente corrente).
     * @param lang Lingua richiesta; se omessa usa lingua utente corrente.
     */
    getResourcesByLang(lang?: string): any;
    /**
     * Restituisce la traduzione per una chiave risorsa con fallback progressivi:
     * lingua corrente, ricerca case-insensitive, lingua italiana, quindi chiave originale.
     * @param value Valore input da convertire/normalizzare.
     */
    getTranslation(value: string): string;
    /**
     * Esegue l'operazione dati implementata da `updateTranslations`.
     * Legge/scrive dati persistenti su storage browser.
     * @param translationObj Dizionario chiave->valore traduzioni da fondere nella cache corrente.
     */
    updateTranslations(translationObj: any): Promise<Object>;
    /**
     * Normalizza il payload in una forma coerente per i passaggi successivi.
     * @param rows Righe grezze traduzioni provenienti da backend o cache locale.
     * @returns Valore restituito dal metodo (Translation[]).
     */
    private normalizeTranslations;
    /**
     * Tenta la correzione di stringhe mojibake (UTF-8/Latin-1) tipiche di sorgenti legacy prima dell'uso in UI.
     * @param value Valore input da convertire/normalizzare.
     * @returns Valore riparato (se applicabile) oppure input originale.
     */
    private repairMojibake;
    static ɵfac: i0.ɵɵFactoryDeclaration<TranslationManagerService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<TranslationManagerService>;
}

declare class MetadatiConditionGroup {
    __user_id: number;
    CG_Id: number;
    CG_Name: string;
    md_id: number;
    CI_Id: number;
    CI_Evaluation_Trigger: 0 | 1;
    CI_Comparison_Left_Field: string;
    CI_Comparison_Operator: string;
    CI_Comparison_Right_Field: string;
    CI_Formula: string;
    CI_Enabled: boolean;
    ConditionActions: MetadatiConditionGroupAction[];
    constructor();
}
declare class MetadatiConditionGroupAction {
    __user_id: number;
    CAG_Id: number;
    CAG_Name: string;
    FK_CG_Id: number;
    CAG_Execute_If_False?: boolean;
    CAI_Id: number;
    FK_CAG_Id: number;
    CAI_Target_Field: string;
    CAI_Target_Action: '0' | '1' | '2' | '3' | '4' | '5';
    CAI_Target_Action_Param_Value: string;
    CAI_Formula: string;
    CAI_Enabled: boolean;
    constructor();
}

interface IFieldEditor {
    record?: {
        [key: string]: BehaviorSubject<any>;
    };
    field?: MetadatiColonna;
    metaInfo?: MetaInfo;
    nestedSource?: DataSourceComponent;
    valore: any;
    lookupValue?: any;
    items?: any[];
    loaded?: boolean;
}
declare class ValueChangedPayload {
    field: MetadatiColonna;
    newValue: any;
    oldValue?: any;
    record?: any;
}

declare class SortInfo {
    field: string;
    dir: "asc" | "desc";
    mc_id: number;
}

declare class GroupInfo {
    field: string;
    groupFormula: string;
    dir: 'ASC' | 'DESC';
    groupCount: number;
    constructor(field: string);
}

declare class AggregationInfo {
    field: string;
    aggregate: string;
    constructor(field: string, aggregate: string);
}

declare class TrackedChange {
    pkey: string;
    guid: string;
    changes: ChangeT[];
    constructor(pkey: any, guid: any);
}
declare class ChangeT {
    field: string;
    oldValue: any;
    newValue: any;
    timestamp?: Date;
    constructor(field: string, oldValue: any, newValue: any);
}

declare class UpdateInfo {
    operation?: string;
    result: any;
    __entity: {
        [key: string]: any;
    };
    __guid: string;
    constructor();
}

type WorkflowRuntimeRouteMetadataEntry = {
    route: string;
    action?: string;
    metadata: any;
};
type WorkflowRuntimeLinkedActionRouteMetadataEntry = {
    sourceRoute: string;
    tableActionId: number;
    targetRoute: string;
    targetAction?: string;
    metadata: any;
};
type WorkflowRuntimeRouteNodePayloadEntry = {
    nodeId: string;
    route: string;
    action?: string;
    payload?: any;
};
type WorkflowRuntimePreviousRouteNodeEntry = {
    routeNodeId: string;
    previousRouteNodeId?: string;
    previousRoute?: string;
    previousAction?: string;
};
declare class WorkflowRuntimeMetadataService {
    private static instance?;
    private readonly storageKey;
    private readonly byRouteAction;
    private readonly byRoute;
    private readonly linkedBySourceAction;
    private readonly pendingByRouteAction;
    private readonly pendingByRoute;
    private readonly routeNodePayloadByNodeId;
    private readonly routeNodeIdsByRouteAction;
    private readonly routeNodeIdsByRoute;
    private readonly previousRouteNodeByRouteNodeId;
    /**
     * Inizializza il singleton runtime metadata e prova il restore dello stato persistito da sessionStorage.
     */
    constructor();
    /**
     * Restituisce l'istanza singleton runtime metadata inizializzata dal DI Angular.
     * Utile per accessi statici da utility/service non iniettati.
     * @returns Istanza corrente del servizio oppure `undefined` se non ancora bootstrap.
     */
    static getInstance(): WorkflowRuntimeMetadataService | undefined;
    /**
     * Reinizializza gli indici metadata runtime per route/azione a partire dalle entry ricevute dal server.
     * Popola sia la mappa specifica `route::action` sia il fallback per sola route e persiste il risultato in session storage.
     * @param entries Elenco metadata runtime per route/azione.
     */
    setRouteMetadata(entries: WorkflowRuntimeRouteMetadataEntry[]): void;
    /**
     * Risolve i metadata runtime attivi per route/action usando priorita:
     * chiave specifica `route::action` e fallback metadata di sola route.
     * @param route Route applicativa coinvolta nell'operazione.
     * @param action Azione richiesta nel flusso corrente.
     * @returns Metadata runtime associato oppure `null`.
     */
    getRouteMetadata(route: string, action?: string): any | null;
    /**
     * Pulisce lo stato runtime e le cache associate.
     */
    clear(): void;
    /**
     * Registra i collegamenti tra azioni sorgente e route di destinazione usati dalla navigazione workflow.
     * Per ogni record valido salva target route/action e relativo payload metadata in `linkedBySourceAction`.
     * @param entries Collegamenti sourceRoute+tableActionId -> targetRoute/targetAction.
     */
    setLinkedActionRouteMetadata(entries: WorkflowRuntimeLinkedActionRouteMetadataEntry[]): void;
    /**
     * Attiva i metadata di navigazione collegati a una specifica azione tabellare, spostandoli nelle mappe "pending".
     * I metadata pending verranno consumati dalla prima apertura della route target (con o senza action).
     * @param sourceRoute Route sorgente da cui parte l'azione.
     * @param tableActionId Id dell'azione tabellare eseguita.
     */
    activateLinkedNavigationMetadata(sourceRoute: string, tableActionId: number): void;
    /**
     * Consuma (read-once) metadata pending per route/azione: se presenti li ritorna e li rimuove dallo stato runtime.
     * La lookup prova prima la chiave `route::action`, poi il fallback per sola route.
     * @param route Route che sta aprendo il datasource.
     * @param action Azione corrente opzionale.
     * @returns Metadata pending associato alla route (eventualmente action-specific) oppure `null`.
     */
    consumePendingRouteMetadata(route: string, action?: string): any | null;
    /**
     * Ricostruisce l'indice payload per nodo workflow (`nodeId -> payload`) e gli indici inversi per route e route+action.
     * Serve a recuperare il payload del nodo che ha aperto una route runtime.
     * @param entries Entry payload nodo con coordinate route/action.
     */
    setRouteNodePayloadEntries(entries: WorkflowRuntimeRouteNodePayloadEntry[]): void;
    /**
     * Aggiorna il payload runtime associato a un singolo nodo workflow.
     * @param nodeId Identificativo del route node.
     * @param payload Payload da associare al nodo.
     */
    setRouteNodePayload(nodeId: string, payload: any): void;
    /**
     * Recupera il payload runtime associato a un route node.
     * @param nodeId Identificativo tecnico usato per lookup/aggiornamento.
     * @returns Payload del nodo oppure `null` se non presente.
     */
    getRouteNodePayload(nodeId: string): any | null;
    /**
     * Restituisce gli id nodi route associati alla route corrente, con precedenza all'indice route+action.
     * @param route Route applicativa coinvolta nell'operazione.
     * @param action Azione richiesta nel flusso corrente.
     * @returns Lista id route node compatibili con il contesto richiesto.
     */
    getRouteNodeIds(route: string, action?: string): string[];
    /**
     * Elimina payload nodo runtime:
     * senza `nodeId` svuota tutta la mappa, con `nodeId` rimuove solo la voce specifica.
     * In entrambi i casi sincronizza lo storage.
     * @param nodeId Id nodo da rimuovere; opzionale per clear globale.
     */
    clearRouteNodePayload(nodeId?: string): void;
    /**
     * Registra la relazione "nodo corrente -> nodo precedente" usata per funzioni back/navigation nel workflow runner.
     * Mantiene anche route/action del nodo precedente per consentire risoluzione contestuale.
     * @param entries Mappatura dei nodi precedenti calcolata dal runtime.
     */
    setPreviousRouteNodeEntries(entries: WorkflowRuntimePreviousRouteNodeEntry[]): void;
    /**
     * Recupera il nodo precedente partendo dall'id nodo corrente.
     * Restituisce la terna usata dal runner (`routeNodeId`, `route`, `action`) oppure `null`.
     * @param routeNodeId Id nodo corrente per cui cercare il predecessore.
     * @returns Informazioni del nodo precedente o `null` se non mappato.
     */
    getPreviousRouteNode(routeNodeId: string): {
        routeNodeId: string;
        route: string;
        action: string;
    } | null;
    /**
     * Risolve il nodo precedente usando il contesto route/action corrente:
     * prende il primo routeNodeId compatibile (`getRouteNodeIds`) e ne legge il predecessore.
     * @param route Route corrente.
     * @param action Azione corrente opzionale.
     * @returns Nodo precedente risolto o `null` se non disponibile.
     */
    getPreviousRouteNodeByRoute(route: string, action?: string): {
        routeNodeId: string;
        route: string;
        action: string;
    } | null;
    /**
     * Serializza tutte le mappe runtime in sessionStorage (`wuic.workflow.runtime.metadata.v1`) per mantenere stato fra refresh tab.
     */
    private persistToStorage;
    /**
     * Ripristina le mappe runtime da sessionStorage all'avvio servizio; se il payload e corrotto lo elimina.
     */
    private restoreFromStorage;
    /**
     * Rimuove i dati target aggiornando lo stato del servizio.
     */
    private removePersistedStorage;
    /**
     * Ripristina una mappa `Map<K,V>` da una struttura serializzata come array di tuple `[key, value]`.
     * Voci non valide vengono ignorate.
     * @param target Mappa destinazione da ricostruire.
     * @param entries Payload serializzato letto da storage.
     */
    private restoreMap;
    /**
     * Restituisce lo storage runtime (`sessionStorage`) usato per persistere metadata workflow fra refresh pagina.
     * @returns Oggetto Storage disponibile oppure `null` in ambienti non browser.
     */
    private getStorage;
    static ɵfac: i0.ɵɵFactoryDeclaration<WorkflowRuntimeMetadataService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<WorkflowRuntimeMetadataService>;
}

declare class DataSourceComponent implements OnInit, OnDestroy {
    private metaSrv;
    private dataSrv;
    private trnsl;
    private workflowRuntimeMetadata;
    private router;
    private aRoute;
    /**
     * Input dal componente padre per route; usata nella configurazione e nel rendering del componente.
     */
    route: BehaviorSubject<string>;
    /**
     * Input dal componente padre per route from routing; usata nella configurazione e nel rendering del componente.
     */
    routeFromRouting: boolean;
    /**
     * Input dal componente padre per hardcoded route; usata nella configurazione e nel rendering del componente.
     */
    hardcodedRoute: string;
    /**
     * Input dal componente padre per autoload; usata nella configurazione e nel rendering del componente.
     */
    autoload?: boolean;
    /**
     * Input dal componente padre per loading; usata nella configurazione e nel rendering del componente.
     */
    loading: BehaviorSubject<boolean>;
    /**
     * Input dal componente padre per change tracking; usata nella configurazione e nel rendering del componente.
     */
    changeTracking?: boolean;
    /**
     * Input dal componente padre per parent record; usata nella configurazione e nel rendering del componente.
     */
    parentRecord: any;
    /**
     * Input dal componente padre per parent meta info; usata nella configurazione e nel rendering del componente.
     */
    parentMetaInfo: MetaInfo;
    /**
     * Input dal componente padre per parent datasource; usata nella configurazione e nel rendering del componente.
     */
    parentDatasource: DataSourceComponent;
    /**
     * Input dal componente padre per component ref; usata nella configurazione e nel rendering del componente.
     */
    componentRef: BehaviorSubject<{
        component: DataSourceComponent;
        id: number;
        name: string;
        uniqueName: string;
    }>;
    /**
     * Collezione dati per sort info, consumata dal rendering e dalle operazioni del componente.
     */
    sortInfo: SortInfo[];
    /**
     * Collezione dati per group info, consumata dal rendering e dalle operazioni del componente.
     */
    groupInfo: GroupInfo[];
    /**
     * Collezione dati per aggregation info, consumata dal rendering e dalle operazioni del componente.
     */
    aggregationInfo: AggregationInfo[];
    /**
     * Struttura filtri corrente applicata alle query o al filtraggio client-side.
     */
    filterInfo?: FilterInfo;
    /**
     * Proprieta di stato del componente per page size, usata dalla logica interna e dal template.
     */
    pageSize: number;
    /**
     * Valore corrente selezionato per current page, usato dai flussi interattivi del componente.
     */
    currentPage: number;
    /**
     * Proprieta di stato del componente per filter param, usata dalla logica interna e dal template.
     */
    filterParam: string;
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a is current insert.
     */
    isCurrentInsert: boolean;
    /**
     * Metadati completi della route corrente (tabella, colonne, regole) usati per costruire UI e logica runtime.
     */
    metaInfo: MetaInfo;
    /**
     * Stato risultato corrente del datasource (record, paginazione, contesto di navigazione).
     */
    resultInfo: ResultInfo;
    /**
     * Proprieta di stato del componente per filter descriptor, usata dalla logica interna e dal template.
     */
    filterDescriptor: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Collezione dati per changes, consumata dal rendering e dalle operazioni del componente.
     */
    changes: TrackedChange[];
    /**
     * Proprieta di stato del componente per interval, usata dalla logica interna e dal template.
     */
    interval: any;
    /**
     * Proprieta di stato del componente per last filter info query raw, usata dalla logica interna e dal template.
     */
    private lastFilterInfoQueryRaw?;
    /**
     * Proprieta di stato del componente per last page info query raw, usata dalla logica interna e dal template.
     */
    private lastPageInfoQueryRaw?;
    /**
     * Proprieta di stato del componente per last sort info query raw, usata dalla logica interna e dal template.
     */
    private lastSortInfoQueryRaw?;
    /**
     * Riferimento all'ultimo oggetto `filterInfo` processato da `fetchData()`,
     * usato per rilevare riassegnazioni esterne e riallineare i descriptor UI.
     */
    private lastProcessedFilterInfoRef?;
    /**
     * Firma dell'ultimo contenuto `filterInfo` processato da `fetchData()`,
     * usata per rilevare modifiche ai singoli filterItem senza riassegnazione.
     */
    private lastProcessedFilterInfoSignature?;
    /**
     * Proprieta di stato del componente per router events subscription, usata dalla logica interna e dal template.
     */
    private routerEventsSubscription?;
    /**
     * Proprieta di stato del componente per route input subscription, usata dalla logica interna e dal template.
     */
    private routeInputSubscription?;
    /**
     * Proprieta di stato del componente per action state subscription, usata dalla logica interna e dal template.
     */
    private actionStateSubscription?;
    /**
     * Collezione dati per condition subscriptions, consumata dal rendering e dalle operazioni del componente.
     */
    private conditionSubscriptions;
    /**
     * Collezione dati per tracked record subscriptions, consumata dal rendering e dalle operazioni del componente.
     */
    private trackedRecordSubscriptions;
    /**
     * Valore corrente selezionato per selected rows, usato dai flussi interattivi del componente.
     */
    private selectedRows;
    /**
     * Proprieta di stato del componente per fetch info, usata dalla logica interna e dal template.
     */
    fetchInfo: BehaviorSubject<{
        resultInfo: ResultInfo;
        metaInfo: MetaInfo;
        filterDescriptor: {
            [key: string]: BehaviorSubject<any>;
        };
    }>;
    /**
     * Proprieta di stato del componente per pristine, usata dalla logica interna e dal template.
     */
    pristine: any;
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a client side crud active.
     */
    clientSideCrudActive: boolean;
    /**
     * Proprieta di stato del componente per last client side crud sync result, usata dalla logica interna e dal template.
     */
    lastClientSideCrudSyncResult?: {
        inserted: number;
        updated: number;
        deleted: number;
    };
    /**
     * Proprieta di stato del componente per last action, usata dalla logica interna e dal template.
     */
    private lastAction;
    /**
  * Inizializza il datasource con i servizi iniettati e avvia la configurazione base tramite `init()`.
  * @param metaSrv Servizio metadati usato per caricare schema route/colonne e invalidare cache correlate.
  * @param dataSrv Servizio dati usato per select/sync/export e gestione CRUD client-side.
  * @param trnsl Servizio traduzione/localizzazione usato per caption e notifiche.
  * @param workflowRuntimeMetadata Servizio che fornisce/consuma patch metadati runtime per flussi workflow.
  * @param router Router Angular usato per intercettare navigazione e sincronizzare stato datasource.
  * @param aRoute ActivatedRoute usata per leggere parametri route/query (`route`, `action`, `filterInfo`, ...).
  * @returns function Object() { [native code] }
  */
    constructor(metaSrv: MetadataProviderService, dataSrv: DataProviderService, trnsl: TranslationManagerService, workflowRuntimeMetadata: WorkflowRuntimeMetadataService, router: Router, aRoute: ActivatedRoute);
    /**
  * Reimposta lo stato interno (paging, filtri, metadati, descriptor e flag CRUD client-side) a valori iniziali.
  */
    private init;
    /**
  * Legge `filterInfo` dalla querystring, aggiorna `filterInfo.filters` (anche querystring-fixed) e sincronizza i valori nel `filterDescriptor`.
  */
    private applyFilterInfoFromQueryString;
    /**
  * Legge `pageInfo` dalla querystring e riallinea `currentPage`/`pageSize` rispettando i limiti definiti in `tableMetadata`.
  */
    private applyPageInfoFromQueryString;
    /**
  * Legge `sortInfo` dalla querystring e ricostruisce `sortInfo` locale in formato usato dalle query dati.
  */
    private applySortInfoFromQueryString;
    /**
  * Propaga i filtri strutturati (`filterInfo`) nei BehaviorSubject del `filterDescriptor`, inclusi i campi lookup associati.
  */
    private applyFilterInfoToFilterDescriptor;
    /**
  * Configura route/query subscriptions, applica stato URL (filter/page/sort) e avvia il caricamento schema/dati iniziale.
  */
    ngOnInit(): void;
    /**
  * Esegue cleanup completo del datasource: timer, subscription, selezione e stato transitorio.
  */
    ngOnDestroy(): void;
    /**
  * Aggiorna la selezione corrente mantenendo solo righe valide (non null/undefined).
  * @param rows Record/elemento su cui applicare la logica del metodo.
  */
    setSelectedRows(rows: any[] | null | undefined): void;
    /**
  * Svuota la selezione locale delle righe.
  */
    clearSelectedRows(): void;
    getSelectedRows(): any[];
    /**
  * Estrae dalla selezione i valori della chiave primaria; per PK composta restituisce un oggetto per riga.
  * @returns Elenco chiavi primarie dei record selezionati (singola PK o oggetto PK composta).
  */
    getSelectedKeys(): any[];
    /**
  * Annulla tutte le subscription del motore condizioni per evitare listener duplicati e memory leak.
  */
    private clearConditionSubscriptions;
    /**
  * Annulla le subscription usate dal change tracking del record corrente.
  */
    private clearTrackedRecordSubscriptions;
    /**
  * Crea un record reattivo con un `BehaviorSubject` per campo metadato e supporto campi lookup (`__lookup_obj`).
  * @param dato Record sorgente (plain o parzialmente reattivo) da convertire in struttura osservabile.
  * @param metaInfo Metadati colonna usati per creare i subject per ciascun campo, inclusi lookup.
  * @returns Record osservabile pronto per binding/editing, con subject per ogni campo metadato.
  */
    static getObservable(dato: any, metaInfo: MetaInfo): {
        [key: string]: BehaviorSubject<any>;
    };
    /**
  * Crea un record reattivo con un `BehaviorSubject` per campo metadato e supporto campi lookup (`__lookup_obj`).
  * @param dato Record sorgente (plain o parzialmente reattivo) da convertire in struttura osservabile.
  * @returns Record osservabile pronto per binding/editing, con subject per ogni campo metadato.
  */
    getObservable(dato?: any): {
        [key: string]: BehaviorSubject<any>;
    };
    /**
  * Converte un record reattivo in oggetto plain estraendo i valori correnti dai BehaviorSubject.
  * @param dato Record osservabile da convertire in oggetto plain.
  * @param metaInfo Metadati colonna usati per leggere i campi previsti dal modello.
  * @returns Oggetto plain con i valori correnti estratti dai subject del record.
  */
    static getModelFromObservable(dato: any, metaInfo: MetaInfo): {};
    /**
  * Converte un record reattivo in oggetto plain estraendo i valori correnti dai BehaviorSubject.
  * @param dato Record osservabile da convertire in oggetto plain.
  * @returns Oggetto plain con i valori correnti estratti dai subject del record.
  */
    getModelFromObservable(dato: any): {};
    /**
  * Restituisce il valore della proprietà richiesta con ricerca case-insensitive sulla chiave oggetto.
  * @param obj Oggetto sorgente su cui cercare la proprietà.
  * @param propName Nome proprietà da risolvere ignorando maiuscole/minuscole.
  * @returns Valore proprietà risolta con ricerca case-insensitive.
  */
    static getValueCaseInsensitive<T extends Record<string, any>>(obj: T, propName: string): T[keyof T];
    /**
  * Filtra i record in memoria (`resultInfo.dato`) confrontando i campi indicati nel filtro.
  * @param filter Mappa `campo -> valore` usata per filtrare i record già caricati lato client.
  * @param caseInsensitive Se true, i confronti stringa ignorano differenze maiuscole/minuscole.
  * @returns Sottoinsieme di `resultInfo.dato` che soddisfa i criteri di filtro richiesti.
  */
    getClientRecordsByFilter(filter: {
        [key: string]: any;
    }, caseInsensitive?: boolean): any[];
    /**
  * Trova il record locale che corrisponde al valore della chiave primaria passato in input.
  * @param pkeyValue Identificativo tecnico usato per lookup e matching.
  * @returns Record locale corrispondente alla PK richiesta, se presente.
  */
    getClientRecordByPKey(pkeyValue: any): any;
    /**
  * Applica un payload di aggiornamento su un record reattivo propagando i nuovi valori sui rispettivi BehaviorSubject.
  * @param record Record osservabile da aggiornare.
  * @param payload Oggetto con campi/valori da applicare al record.
  * @returns True se almeno un campo è stato aggiornato nel record osservabile.
  */
    setClientRecordValue(record: {
        [key: string]: BehaviorSubject<any>;
    }, payload: any): boolean;
    /**
  * Carica i metadati della route corrente tramite `MetadataProviderService`.
  */
    private getMetadata;
    /**
  * Esegue la select dati tramite `DataProviderService` e aggiorna `resultInfo`.
  */
    getData(): Promise<void>;
    /**
  * Applica patch runtime workflow su tabella/colonne (azioni, permessi, stili) fondendo i bundle con i metadati correnti.
  * @param route Route corrente usata per recuperare il bundle metadati runtime workflow.
  */
    private applyWorkflowRuntimeRouteMetadata;
    /**
  * Ricostruisce le callback delle custom action tabella (`action_callback__fn`, `disable_callback__fn`) e aggancia il linking di navigazione workflow.
  * @param actions Lista custom action tabella da rendere eseguibile (callback function ricostruite).
  * @param currentRoute Route sorgente usata per il linking automatico delle azioni di navigazione.
  */
    private rehydrateRuntimeTableActionCallbacks;
    /**
  * Restituisce il primo valore definito tra più chiavi candidate, con fallback case-insensitive.
  * @param obj Oggetto su cui cercare i valori.
  * @param keys Lista ordinata di chiavi candidate da testare.
  * @returns Valore di tipo `any` restituito dal metodo.
  */
    private pickFirstDefined;
    /**
  * Esegue deep clone JSON; in fallback normalizza prima eventuali wrapper osservabili.
  * @param input Valore in ingresso elaborato dal metodo.
  * @returns Valore di tipo `T` restituito dal metodo.
  */
    private cloneJson;
    /**
     * Ricostruisce `tableMetadata.extraProps` usando `tableMetadata.md_props_bag`
     * (fonte canonica persistita nei metadata).
     */
    private rehydrateTableExtraPropsFromPropsBag;
    /**
  * Verifica se la modalità client-side CRUD è abilitata in `tableMetadata.extraProps.client_side_crud`.
  * @returns True se `tableMetadata.extraProps.client_side_crud` abilita il CRUD client-side.
  */
    canUseClientSideCrud(): boolean;
    /**
  * Attiva il CRUD client-side, inizializza lo stato dedicato e ricarica i dati.
  */
    enableClientSideCrud(): Promise<void>;
    /**
  * Disattiva il CRUD client-side sincronizzando prima le modifiche locali e restituendo i conteggi insert/update/delete.
  * @returns Riepilogo sincronizzazione con conteggi `inserted`, `updated`, `deleted`.
  */
    disableClientSideCrud(): Promise<{
        inserted: number;
        updated: number;
        deleted: number;
    }>;
    /**
  * Disattiva il CRUD client-side senza sync e forza il refresh dati dal backend.
  */
    disableClientSideCrudWithoutSync(): Promise<void>;
    /**
  * Carica schema metadati e stato runtime (tabs, validazioni, condizioni, filtri, nested routes) e opzionalmente carica i dati.
  * @param schemaOnly Se true, inizializza solo schema/stato e pubblica `fetchInfo` senza eseguire fetch dati.
  */
    getSchemaAndData(schemaOnly?: boolean): Promise<void>;
    /**
  * Compone i filtri effettivi da `filterDescriptor`/`filterInfo`, esegue il fetch e pubblica il payload aggiornato su `fetchInfo`.
  * @returns Payload pubblicato su `fetchInfo` con `resultInfo`, `metaInfo`, filtri, sort, group e aggregation correnti.
  */
    fetchData(): Promise<{
        resultInfo: ResultInfo;
        metaInfo: MetaInfo;
        filterDescriptor: {
            [key: string]: BehaviorSubject<any>;
        };
        groupInfo: GroupInfo[];
        sortInfo: SortInfo[];
        aggregationInfo: AggregationInfo[];
    }>;
    /**
     * Costruisce una firma stabile del contenuto utile di `filterInfo` per
     * rilevare modifiche ai filtri anche senza cambio di riferimento oggetto.
     */
    private buildFilterInfoSyncSignature;
    /**
  * Costruisce `metaInfo.dataTabs` dalle colonne editabili e applica eventuale ordinamento tab da archetype.
  */
    parseTabs(): void;
    toggleTabByIndex(index: number, hidden?: boolean): void;
    toggleTabByName(tabName: string, hidden?: boolean): void;
    /**
  * Imposta in modo sicuro il tab selezionato su `metaInfo.dataTabs`.
  * Accetta come target il nome tab oppure l'indice nell'array `dataTabs`.
  * @param target Nome tab (`tabName`) o indice numerico.
  * @param allowHidden Se `false` (default) impedisce di selezionare tab nascosti.
  * @returns `true` se la selezione e stata applicata, altrimenti `false`.
  */
    setSelectedTab(target: string | number, allowHidden?: boolean): boolean;
    /**
  * Interpreta `md_nested_grid_routes` (JSON o formato legacy) e costruisce la struttura normalizzata delle route annidate.
  */
    parseNestedRoutes(): void;
    /**
  * Genera le regole di validazione per colonna (`required`, `type`, `pattern`, `custom`) usando metadati e extras.
  */
    parseValidations(): void;
    /**
  * Esegue le validazioni delle colonne sul record corrente invocando `MetadatiColonna.validateField`.
  * @param record Record osservabile da validare.
  */
    validateData(record: {
        [key: string]: BehaviorSubject<any>;
    }): Promise<void>;
    /**
  * Raggruppa una collezione per chiave e restituisce una mappa `key -> array elementi`.
  * @param xs Collezione da raggruppare.
  * @param key Nome proprietà usata come chiave di grouping.
  * @returns Mappa `chiave -> elenco elementi` risultante dal raggruppamento.
  */
    groupBy(xs: any[], key: string): any;
    /**
  * Determina se un valore è un campo osservabile compatibile (`next` + `value`).
  * @param value Valore da verificare come campo osservabile.
  * @returns True se il valore espone contratto osservabile (`next` + `value`).
  */
    private isObservableField;
    /**
  * Legge il valore di un operando condizione gestendo sia campi plain sia campi osservabili.
  * @param record Record corrente.
  * @param fieldName Nome campo operando da leggere.
  * @returns Valore dell'operando condizione già normalizzato (plain o subject.value).
  */
    private getConditionOperandValue;
    /**
  * Scrive il valore di un operando condizione su campo osservabile (next) o campo plain.
  * @param record Record corrente.
  * @param fieldName Nome campo operando da aggiornare.
  * @param value Nuovo valore da assegnare.
  */
    private setConditionOperandValue;
    /**
  * Normalizza operatori confronto/formula in un set canonico (`eq`, `ne`, `gt`, `ge`, `lt`, `le`, `contains`).
  * @param rawOperator Operatore raw da normalizzare.
  * @returns Operatore normalizzato nel set supportato dal valutatore condizioni.
  */
    private normalizeConditionOperator;
    /**
  * Configura listener e trigger dei gruppi condizione (`_Metadati_Condition_Groups`) sottoscrivendo i campi necessari.
  */
    parseConditions(): void;
    /**
  * Valuta ogni gruppo condizioni sul payload corrente (left/right/operator/formula) e invoca `executeConditionalActions` con l'esito.
  * @param groupedConditions Mappa gruppi condizione con relative condition items e action items.
  * @param payload Payload variazione campo (nuovo/vecchio valore + metadato campo trigger).
  * @param all Se true valuta tutti i gruppi; se false solo quelli collegati al campo trigger.
  */
    evaluateConditions(groupedConditions: {
        [CG_Id: number]: {
            ConditionItems: MetadatiConditionGroup[];
            ConditionActions: MetadatiConditionGroupAction[];
        };
    }, payload: ValueChangedPayload, all: boolean): void;
    /**
  * Converte un valore in rappresentazione codice coerente con `mc_ui_column_type` per formule/actions dinamiche.
  * @param field Metadato colonna usato per scegliere la serializzazione del valore.
  * @param value Valore da convertire in rappresentazione codice.
  * @returns Rappresentazione stringa/espressione usata per comporre formule e action code dinamico.
  */
    getCodeRepresentation(field: MetadatiColonna, value: any): string;
    /**
  * Esegue le azioni condizionali abilitate (`CAI_Target_Action`) modificando metadati/valori record o attivando la logica cascade.
  * @param payload ValueChangedPayload.
  * @param conditionGroup Gruppo condizioni e azioni da eseguire.
  * @param evaluationResult Esito valutazione del gruppo.
  * @param record Record corrente su cui applicare le azioni.
  */
    private executeConditionalActions;
    /**
  * Sincronizza insert/update/delete/clone del record corrente: valida, invoca callback before/after save, aggiorna notifiche e tracker locale.
  * @param entita Entità corrente da sincronizzare.
  * @param original Snapshot originale usato per update/comparison.
  * @param deleting Se true esegue il flusso delete.
  * @param cloning Se true esegue il flusso clone.
  * @returns Risultato della sync (insert/update/delete/clone) o null se validazione/callback blocca l'operazione.
  */
    syncData(entita: any, original: any, deleting?: boolean, cloning?: boolean): Promise<UpdateInfo>;
    /**
  * Restituisce i tracked change con almeno una modifica effettivamente pendente.
  * @returns Elenco pending changes con almeno una variazione registrata.
  */
    getPendingChanges(): TrackedChange[];
    /**
  * Restituisce l'azione route corrente (`action`) in formato lowercase trim.
  * @returns Azione route corrente (`action`) in lowercase.
  */
    private getCurrentRouteAction;
    /**
  * Restituisce il nome campo PK risolto da `metaInfo.pKey`.
  * @returns Nome campo chiave primaria risolto da `metaInfo.pKey`.
  */
    private getPrimaryKeyFieldName;
    /**
  * Applica/aggiorna filtri derivati dai parametri route sul `filterInfo` corrente.
  */
    private applyRouteParamFilterFromSnapshot;
    /**
  * Indica se esistono modifiche locali non ancora sincronizzate.
  * @returns True se esiste almeno un change pendente nel tracker.
  */
    hasPendingChanges(): boolean;
    /**
  * Gestisce la conferma utente quando ci sono pending changes prima di fetch/navigate.
  * @param operation Operazione in corso (`fetch` o `navigate`) usata nel prompt di conferma.
  * @returns True se l'operazione può proseguire; false se l'utente annulla.
  */
    confirmProceedWithPendingChanges(operation: 'fetch' | 'navigate'): Promise<boolean>;
    /**
  * Converte i pending changes in payload batch, invia la sync e aggiorna tracker/snapshot locale.
  * @param targetChanges Set opzionale di changes da sincronizzare; se omesso usa i pending correnti.
  * @returns Risposta backend della batch sync oppure null se non ci sono changes sincronizzabili.
  */
    batchSave(targetChanges?: TrackedChange[]): Promise<any>;
    /**
  * Ripristina i valori originali dei pending changes sui record e aggiorna tracker/snapshot locale.
  * @param targetChanges Set opzionale di changes da rollback; se omesso usa i pending correnti.
  * @returns Numero record sui quali è stato applicato il rollback locale.
  */
    rollbackChanges(targetChanges?: TrackedChange[]): number;
    /**
  * Costruisce un'entità batch dal tracked change includendo `__original` per confronto lato server.
  * @param tracked Tracked change da convertire in payload batch.
  * @returns Entità batch con valori correnti + snapshot `__original`.
  */
    private buildBatchEntityFromTrackedChange;
    /**
  * Risolve il nome PK dalla lista `columnMetadata`.
  * @returns Nome campo PK risolto da `columnMetadata`.
  */
    private getPrimaryKeyName;
    /**
  * Cerca il record locale corrispondente a un tracked change usando PK/GUID.
  * @param tracked Tracked change da risolvere.
  * @param pkeyName Nome PK opzionale usato nel matching.
  * @returns Record locale associato al tracked change, se trovato.
  */
    private findRecordByTrackedChange;
    /**
  * Verifica se record e tracked change identificano la stessa entità confrontando PK o GUID.
  * @param record Record candidato al match.
  * @param tracked Tracked change da confrontare.
  * @param pkeyName Nome PK opzionale usato nel confronto.
  * @returns True se record e tracked change rappresentano la stessa entità (PK/GUID).
  */
    private matchesTrackedChange;
    /**
  * Rimuove dal tracker locale i change specificati.
  * @param toRemove Changes da rimuovere dal tracker.
  */
    private removeTrackedChanges;
    /**
  * Rigenera lo snapshot `pristine` a partire dal record corrente normalizzato.
  */
    private refreshPristineFromCurrent;
    /**
  * Pubblica uno stato locale aggiornato su `fetchInfo` per riallineare i consumer del datasource.
  */
    private publishLocalStateUpdate;
    /**
  * Invoca la callback `md_after_save_fn` e centralizza la gestione errori post-sync.
  * @param savingData Payload inviato in sync.
  * @param syncedData Risposta restituita dal backend.
  * @param isInsert True se la sync è insert.
  * @param isClone True se la sync è clone.
  * @param isDelete True se la sync è delete.
  */
    private executeAfterSyncCallback;
    /**
  * Invoca `md_before_save_fn` e risolve se procedere o bloccare la sincronizzazione.
  * @param savingData Payload passato alla callback before-save.
  * @returns True se la callback before-save consente la sync, false altrimenti.
  */
    private canProceedBeforeSync;
    /**
  * Invalida cache menu e notifica aggiornamento quando la route corrente è il meta-menu.
  */
    private notifyMenuMetadataChanged;
    /**
  * Richiede export XLS della route corrente applicando il filtro attivo.
  * @returns Esito export XLS restituito da `DataProviderService`.
  */
    exportXls(): Promise<any>;
    /**
  * Imposta il record corrente, aggiorna `pristine` e (se attivo) avvia il tracking modifiche campo per campo.
  * @param data Record da impostare come corrente.
  */
    setCurrent(data: any): void;
    /**
  * Sottoscrive i campi del record e aggiorna `changes` con delta old/new per ogni modifica.
  * @param record Record osservabile da tracciare.
  * @param pkey Nome campo chiave primaria.
  * @param specificKey Campo specifico da tracciare (opzionale).
  */
    private trackRecordChange;
    /**
     * Verifica se un campo puo essere tracciato/sincronizzato come change persistente.
     * Esclude campi tecnici e lookup object non persistiti su DB.
     */
    private isTrackableChangeField;
    /**
     * Pulisce il payload changes per sync rimuovendo campi lookup/non persistenti
     * e change privi della struttura minima richiesta lato server.
     */
    private sanitizeChangesForSync;
    /**
  * Rimuove i tracked changes associati a una specifica entità risolta per PK o GUID.
  * @param entityLike Entità principale per risolvere PK/GUID.
  * @param fallbackEntityLike Entità fallback se la principale non contiene identificativi.
  */
    private removeTrackedChangesForEntity;
    /**
  * Crea un nuovo record con default metadato (e chiavi parent nested), lo imposta corrente e lo restituisce.
  * @param record Override opzionale dei valori default del nuovo record.
  * @returns Nuovo record osservabile impostato come corrente nel datasource.
  */
    addNewRecord(record?: any): {
        [key: string]: BehaviorSubject<any>;
    };
    /**
  * Azzera filtro/lookup della colonna, rimuove filtri compatibili da `filterInfo` e opzionalmente rilancia `fetchData`.
  * @param col Metadato colonna di cui azzerare i filtri.
  * @param fetch Se true esegue fetchData dopo il reset filtro.
  */
    clearColumnFilter(col: MetadatiColonna, fetch?: boolean): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<DataSourceComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DataSourceComponent, "wuic-data-source", never, { "route": { "alias": "route"; "required": false; }; "routeFromRouting": { "alias": "routeFromRouting"; "required": false; }; "hardcodedRoute": { "alias": "hardcodedRoute"; "required": false; }; "autoload": { "alias": "autoload"; "required": false; }; "loading": { "alias": "loading"; "required": false; }; "changeTracking": { "alias": "changeTracking"; "required": false; }; "parentRecord": { "alias": "parentRecord"; "required": false; }; "parentMetaInfo": { "alias": "parentMetaInfo"; "required": false; }; "parentDatasource": { "alias": "parentDatasource"; "required": false; }; "componentRef": { "alias": "componentRef"; "required": false; }; }, {}, never, never, true, never>;
}

declare class MetadatiCustomActionTabella {
    __user_id?: number;
    Id?: number;
    button_template?: string;
    button_image?: string;
    button_caption: string;
    tooltip?: string;
    _disabled?: boolean;
    action_callback?: string;
    disable_callback?: string;
    action_callback__fn: ((datasource: DataSourceComponent, metaInfo: MetaInfo, record: any, event: any, wtoolbox: typeof WtoolboxService) => void);
    disable_callback__fn?: ((datasource: DataSourceComponent, metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean);
    md_id?: number;
    md_action_type?: number;
    constructor();
}

declare class MetadatiUiStiliTabella {
    __user_id: number;
    must_id: number;
    must_attribute_name: string;
    must_attribute_value: string;
    md_id: number;
}

interface IDesignerProperties {
    archetypePropName: string;
    init(metaInfo: MetaInfo, nestedIndex?: number): any;
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<string>): MetaInfo;
}

declare class MapOptions implements IDesignerProperties {
    mapId: string;
    zoom: number;
    center: Point;
    minZoom: number;
    maxZoom: number;
    useCurrentLocation: boolean;
    useClusterer: boolean;
    filterByBoundaries: boolean;
    customMarkerImageSrc: string;
    customMarkerImageSrcField: string;
    markerContentCallback: string;
    titleField: string;
    infoField: string;
    infoFunction: string;
    itemTemplateString: string;
    constructor();
    init(metaInfo: MetaInfo): void;
    archetypePropName: string;
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo;
}
declare class Point {
    lat: number;
    lng: number;
    archetypePropName: string;
    constructor();
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo;
}

declare class SchedulerOptions implements IDesignerProperties {
    fromField: string;
    toField: string;
    titleField: string;
    itemTemplateString: string;
    titleFunction: string;
    constructor();
    init(metaInfo: MetaInfo): void;
    archetypePropName: string;
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo;
}

declare class TreeOptions implements IDesignerProperties {
    parentField: string;
    labelField: string;
    iconField: string;
    leafField: string;
    labelFunction: string;
    itemTemplateString: string;
    constructor();
    init(metaInfo: MetaInfo): void;
    archetypePropName: string;
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo;
}

declare class CarouselOptions implements IDesignerProperties {
    imageFieldName: string;
    descriptionFieldName: string;
    imageWidth: number;
    pageSize: number;
    numVisible: number;
    numScroll: number;
    usePreview: boolean;
    responsiveOptions: ResponsiveOption[];
    itemTemplateString: string;
    constructor();
    init(metaInfo: MetaInfo): void;
    archetypePropName: string;
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo;
}
declare class ResponsiveOption implements IDesignerProperties {
    breakpoint: string;
    numVisible: number;
    numScroll: number;
    archetypePropName: string;
    constructor();
    init(metaInfo: MetaInfo): void;
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo;
}

declare class ChartOptions implements IDesignerProperties {
    type: 'bar' | 'line' | 'scatter' | 'bubble' | 'pie' | 'doughnut' | 'polarArea' | 'radar';
    options: any;
    drillDown: string | ((clickedItem: any, chartOptions: any, data: any) => void);
    dataOptions: chartDataOption;
    constructor();
    init(metaInfo: MetaInfo): void;
    archetypePropName: string;
    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo;
}
declare class chartDataOption {
    getChartData: string | ((data: ResultInfo) => any);
    dataProperty: 'dato' | 'Agg';
    cutOffCount: number;
    datasets: ChartDatasetOptions[];
    constructor();
}
declare class ChartDatasetOptions {
    label: string;
    labelField: string;
    dataField: string;
    backgroundColorField: string;
    generateRandomColor: boolean;
    borderColorField: string;
    parseData: string | ((data: any[]) => any);
    constructor();
}

declare class FormOptions {
    columns: number;
    orderedTabs: string[];
    constructor();
}

declare class MetadatiTabella {
    __user_id: number;
    ProjectMetadataVersion: number;
    md_id: number;
    md_nome_tabella: string;
    md_editable: boolean;
    md_deletable: boolean;
    md_insertable: boolean;
    md_display_string: string;
    md_long_description: string;
    is_system_route: boolean;
    md_url_read: string;
    md_url_update: string;
    md_url_delete: string;
    md_url_insert: string;
    md_sortable: boolean;
    md_groupable: boolean;
    md_scrollable: boolean;
    md_pageable: boolean;
    md_pagesize: number;
    md_edit_popup: boolean;
    md_inline_edit: boolean;
    md_server_side_operations: boolean;
    md_nested_grid_routes: string;
    md_detail_grid_routes: string;
    md_parent_key_name: string;
    md_master_detail_edit: boolean;
    md_default_filter: string;
    md_header_rows_edit: boolean;
    md_multiple_selection: boolean;
    md_detail_action: boolean;
    md_display_formula: null;
    md_importable: boolean;
    md_clonable: boolean;
    md_open_filter_onload: boolean;
    md_before_save: null;
    md_after_save: null;
    md_after_load: null;
    md_ui_grid_conditional_template: string;
    md_ui_grid_conditional_alt_template: string;
    md_ui_grid_conditional_template_condition: string;
    md_conditional_update_rule: null;
    md_conditional_delete_rule: null;
    md_appoggio_left_table: null;
    md_appoggio_right_table: null;
    md_appoggio_allow_drag_drop: null;
    md_appoggio_edit_extra_data: null;
    md_appoggio_left_fk_name: null;
    md_appoggio_right_fk_name: null;
    md_treeview_template: string;
    md_gridview_template: string;
    md_rowTemplate: string;
    md_filter_template: string;
    md_detail_template: string;
    md_edit_template: string;
    md_book_html_template: string;
    md_gallery_html_template: string;
    md_map_html_template: string;
    md_grant_by_default: boolean;
    md_record_restriction_key_user_field_list: string;
    md_user_id_field_name: string;
    md_logging_enable: boolean;
    md_logging_last_mod_user_field_name: string;
    md_logging_last_mod_date_field_name: string;
    md_logging_insert_user_field_name: string;
    md_logging_insert_date_field_name: string;
    md_logging_delete_user_field_name: string;
    md_loggingdelete_date_field_name: string;
    md_logging_azienda_field_name: string;
    md_has_logic_delete: boolean;
    md_disabilita_filtri: boolean;
    md_grid_scroll_height: string;
    md_table_edit: boolean;
    md_tab_edit: boolean;
    md_table_column_counta: null;
    md_show_record_count: boolean;
    md_page_size_choice: string;
    md_is_reticular: boolean;
    reticular_key_name: string;
    reticular_key_value: null;
    md_conn_name: string;
    md_db_name: string;
    md_primary_key_type: string;
    md_schema_name: string;
    md_route_name: string;
    md_is_view: boolean;
    md_expose_in_webapi: boolean;
    md_expose_in_wcf: boolean;
    md_include_definition: boolean;
    md_service_custom_settings: boolean;
    md_service_page_size: number;
    md_service_disable_sorting: boolean;
    md_service_disable_filtering: boolean;
    md_service_enable_edit: boolean;
    md_service_enable_insert: boolean;
    md_service_enable_delete: boolean;
    md_service_enable_detail: boolean;
    md_service_enable_clone: boolean;
    md_service_apply_default_filter: boolean;
    md_service_enable_logging: boolean;
    md_allow_drag: boolean;
    md_allow_drop: boolean;
    md_drop_callback: null;
    md_custom_row_template: null;
    md_custom_repeater_view_template: null;
    md_custom_filter_template: null;
    md_custom_filter_cell_template: null;
    md_custom_view_cell_template: null;
    md_custom_edit_cell_template: null;
    md_custom_pager_template: null;
    md_custom_header_template: null;
    md_custom_header_cell_template: null;
    md_custom_command_header_template: null;
    md_custom_title_template: null;
    md_hide_refresh: null;
    md_hide_print: null;
    md_hide_export_pdf: null;
    md_hide_export_xls: null;
    md_auto_refresh_seconds: null;
    md_inline_cell_editing: boolean;
    md_batch_save: boolean;
    md_props_bag: null;
    md_hide_select_all_check: boolean;
    md_multiple_radio_selection: boolean;
    md_persist_row_selection_accross_paging: boolean;
    md_custom_edit: null;
    md_custom_delete: null;
    md_delete_and_sync: boolean;
    hide_toolbar: boolean;
    preventNavigateOnFilter: boolean | undefined;
    extraProps: {
        endpoint: {
            type: string;
            method: 'get' | 'post';
            uri: string;
            parameterMapping: [
                {
                    source: {
                        type: string;
                        name: string;
                        required: boolean;
                        path: string;
                    };
                    target: {
                        type: string;
                        name: string;
                        parseFunction: string;
                    };
                }
            ];
        };
        cascadeDefinition: any;
        archetypes: {
            scheduler: SchedulerOptions;
            tree: TreeOptions;
            spreadsheet: any;
            list: any;
            map: MapOptions;
            excel: any;
            carousel: CarouselOptions;
            chart: ChartOptions;
            form: FormOptions;
        };
        parameters: any[];
        groupInfo: GroupInfo[];
        aggregates: AggregationInfo[];
        cloneDefinition: {
            relatedRoutes: {
                relatedRoute: string;
                relatedIdField: string;
            }[];
        };
        changeTracking: boolean;
        client_side_crud: boolean | {
            enabled?: boolean;
            batchSize?: number;
            maxPages?: number;
            includeLookupRoutes?: boolean;
        };
    };
    parameterInfo: any[];
    md_update_uri: string;
    hideSave: any;
    hideRollback: any;
    hideGoBack: any;
    _Metadati_Custom_Actions_Tabelles: MetadatiCustomActionTabella[];
    _Metadati_Utenti_Autorizzazioni_Tabelles: any[];
    _Metadati_UI_Stili_Tabelles: MetadatiUiStiliTabella[];
    _Metadati_Condition_Groups: MetadatiConditionGroup[];
    md_conditional_update_rule_fn: (metaInfo: MetaInfo, record: any, datasource: DataSourceComponent, wtoolbox: typeof WtoolboxService) => boolean;
    md_conditional_delete_rule_fn: (metaInfo: MetaInfo, record: any, datasource: DataSourceComponent, wtoolbox: typeof WtoolboxService) => boolean;
    md_before_save_fn: (datasource: DataSourceComponent, savingData: any, beforeSync: (shouldSync: boolean) => void, event: any, wtoolbox: typeof WtoolboxService) => Promise<any> | any;
    md_after_save_fn: (datasource: DataSourceComponent, savingData: any, syncedData: any, isInsert: boolean, isClone: boolean, isDelete: boolean, event: any, wtoolbox: typeof WtoolboxService) => Promise<void> | void;
    md_after_load_fn: (datasource: DataSourceComponent, originalEvent: any, result: any, loadedRecords: any[], isInsert: boolean, wtoolbox: typeof WtoolboxService) => Promise<void> | void;
    md_display_formula_fn: (metaInfo: MetaInfo, record: {
        [key: string]: BehaviorSubject<any>;
    }, datasource: DataSourceComponent, wtoolbox: typeof WtoolboxService) => string;
    constructor(name: string);
}

declare class MetaInfo {
    tableMetadata: MetadatiTabella;
    columnMetadata: MetadatiColonna[];
    editMode: boolean;
    dataTabs: any[];
    pKey: MetadatiColonna;
    nestedRoutes?: {
        route: string;
        pKeys: string[];
        fKeys: string[];
        nestedTabCaption?: string;
        nestedGridCaption?: string;
        nestedGridContainerClass?: string;
        action?: string;
    }[];
    rowsPerPageOptions?: number[];
    gridRowTemplateCondition?: Function;
    hasFooter?: boolean;
    schedulerInfo?: any[];
    operators: {
        [key: string]: string;
    };
    frozen?: boolean;
    constructor();
}

declare class MetadataProviderService {
    private http;
    private userInfo;
    contentType: string;
    dataType: string;
    type: string;
    getMetadataUri: string;
    getMetadataVersionUri: string;
    static readUri: any;
    static storedUri: any;
    static readUriCmb: any;
    static readDistinctUriCmb: any;
    static updateUri: any;
    static createUri: any;
    static deleteUri: any;
    static restoreUri: any;
    static cloneUri: any;
    static getDistinctValuesUri: any;
    static batchEditUri: any;
    static exportUri: any;
    static exportFromStoredUri: any;
    static exportPdfUri: any;
    static flushCacheUri: any;
    static removeColumnUri: any;
    static checkInstallUri: any;
    static installUri: any;
    static getRealPathUri: any;
    static getMenuByUserIDUri: any;
    static getMenuAdminMethodsUri: any;
    static removeMenuUri: any;
    static addMenuUri: any;
    static addMenuFullUri: any;
    static reorderMenuUri: any;
    static nestMenuUri: any;
    static getConnectionsUri: any;
    static getAppSettingsUri: any;
    static updateConnectionsUri: any;
    static deleteConnectionsUri: any;
    static insertConnectionsUri: any;
    static updateAppSettingsUri: any;
    static getLoggedUsersUri: any;
    static GetUserListTestUri: any;
    static readCustomSettingsUri: any;
    static saveCustomSettingsUri: any;
    static saveDashboardUri: any;
    static loadDashboardUri: any;
    static deleteDashboardUri: any;
    static saveWorkflowGraphUri: any;
    static loadWorkflowGraphUri: any;
    static getWorkflowGraphsUri: any;
    static renameWorkflowGraphUri: any;
    static deleteWorkflowGraphUri: any;
    static getCssClassesFromSheetsUri: any;
    static writeChangesToCssFileUri: any;
    static scaffoldODataUri: any;
    static metaTableRoute: any;
    static metaColumnRoute: any;
    static metaMenuRoute: any;
    static metatableActionRoute: any;
    static metatableStyleRoute: any;
    static metatableColumnStyleRoute: any;
    static metatableAuthRoute: any;
    static metatableColumnAuthRoute: any;
    private static metadataVersionInFlight?;
    private static lastMetadataVersionCheckAtMs;
    private static readonly minMetadataVersionIntervalMs;
    private static readonly minReportListIntervalMs;
    private static reportListInFlightByRoute;
    private static reportListCacheByRoute;
    private static reportListLastCheckAtByRoute;
    private static customSettingsInFlightByRequest;
    static widgetDefinition: WidgetDefinition;
    static widgetMap: {
        [key: string]: {
            component?: any;
            loader?: () => Promise<any>;
            width?: string;
            height?: string;
            hide?: boolean;
        };
    };
    static baseLibs: string[];
    static MetaDB: any;
    private static metaDbInitPromise?;
    private static metaDbConfiguredVersion?;
    /**
     * Resetta lo stato runtime del singleton Dexie metadata.
     * Utile dopo logout/session reset per evitare riuso di istanze chiuse.
     */
    static resetMetaDbRuntimeState(): void;
    /**
     * Restituisce l'istanza DB metadata locale inizializzata alla versione schema corrente (v5).
     * Wrapper convenienza verso `generateLocalDB(5)`.
     * @returns Istanza Dexie `MetaDB`.
     */
    static getMetaDB(): Promise<any>;
    /**
     * Inizializza (o riusa) il database Dexie `MetaDB` con lo schema metadata richiesto dalla versione passata.
     * Configura tabelle/indici per colonne, tabelle, stili, autorizzazioni, condition group e custom actions.
     * @param version Versione schema Dexie da applicare.
     * @returns Istanza DB locale pronta all'uso.
     */
    static generateLocalDB(version: number): Promise<any>;
    /**
     * Costruisce la stringa schema Dexie partendo dalle proprieta della classe metadata e dalle chiavi richieste.
     * Supporta PK semplice/composta, auto-incremento e indici aggiuntivi.
     * @param classIntance Istanza usata per enumerare le proprieta persistibili.
     * @param pKey Nome PK (anche composta nel formato `[a+b]`).
     * @param autoIncrement Se `true` usa prefisso `++` sulla PK semplice.
     * @param keys Campi da indicizzare come chiave composta.
     * @param append Se valorizzato, appende ulteriori indici manuali allo schema.
     * @returns Definizione schema compatibile Dexie `version().stores(...)`.
     */
    static getSchemaFromClass(classIntance: any, pKey: string, autoIncrement: boolean, keys?: string[], append?: string): string;
    /**
     * Verifica se la route appartiene al set di route metadata interne (editor metadati, stili, autorizzazioni, custom actions).
     * @param route Route da verificare.
     * @returns `true` se la route e una route metadata gestita dal framework.
     */
    static isMetaRoute(route: any): boolean;
    /**
     * Estrae le colonne marcate come primary key (`mc_is_primary_key`) gestendo flag boolean/number/string.
     * @param columns Collezione metadata colonne.
     * @returns Elenco colonne PK.
     */
    static getPKeys(columns: MetadatiColonna[]): MetadatiColonna[];
    /**
     * Interpreta in modo tollerante i flag boolean legacy provenienti da metadata DB.
     * Considera veri: `true`, `1`, `'true'`, `'1'`, `'yes'`, `'si'`.
     * @param value Valore da interpretare.
     * @returns `true` se il valore rappresenta un flag attivo.
     */
    private static isTruthyFlag;
    /**
     * Traduce la definizione `mc_aggregation` (lista separata da virgole) in descriptor `{ field, aggregate }` consumabili dalla grid.
     * @param metas Metadata colonna da cui ricavare aggregazioni.
     * @returns Collezione aggregazioni campo->funzione (sum/count/min/max/...).
     */
    static getAggregates(metas: MetadatiColonna[]): any[];
    /**
     * Valuta una condizione booleana sullo stato o sull'input corrente.
     * Legge/scrive dati persistenti su storage browser.
     * @param route Route applicativa coinvolta nell'operazione.
     * @returns Valore restituito dal metodo (boolean).
     */
    private isClientSideCrudModeEnabled;
    /**
     * Costruisce la chiave cache menu utente (`menu_{userId}`) usata per persistenza localStorage.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @returns Chiave localStorage della cache menu.
     */
    private getMenuCacheKey;
    /**
     * Pulisce lo stato runtime e le cache associate.
     * Legge/scrive dati persistenti su storage browser.
     * @param userId Identificativo utente usato per contesto e persistenza.
     */
    private clearMenuCache;
    /**
     * Pulisce lo stato runtime e le cache associate.
     * Legge/scrive dati persistenti su storage browser.
     */
    private clearMenuCacheByPrefix;
    /**
     * Costruisce la chiave cache metodi admin menu (`menu_admin_methods_{userId}`).
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @returns Chiave localStorage della cache metodi admin menu.
     */
    private getMenuAdminMethodsCacheKey;
    /**
     * Pulisce lo stato runtime e le cache associate.
     * Legge/scrive dati persistenti su storage browser.
     * @param userId Identificativo utente usato per contesto e persistenza.
     */
    private clearMenuAdminMethodsCache;
    /**
     * Invalida la cache menu dell'utente corrente (o dell'utente passato) rimuovendo la voce `menu_{userId}` da localStorage.
     * Se richiesto elimina anche la cache dei metodi amministrativi `menu_admin_methods_{userId}`.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @param clearAdminMethods Quando `true` rimuove anche la cache dei metodi admin del menu.
     */
    invalidateMenuByUserIdCache(userId?: number | string, clearAdminMethods?: boolean): void;
    constructor(http: HttpClient, userInfo: UserInfoService);
    /**
     * Recupera i metadata colonna partendo dall'id tabella (`md_id`) delegando a `getMetadati`.
     * @param md_id Identificativo metadato tabella.
     * @returns Collezione metadata colonna della tabella richiesta.
     */
    getMetadatiById(md_id: number): Promise<MetadatiColonna[]>;
    /**
     * Restituisce i metadata di una route (o `md_id`) da cache Dexie quando validi; in caso contrario ricarica da backend.
     * Gestisce invalidazione per versioning metadata progetto e bypass cache in modalita client-side CRUD.
     * @param route Route applicativa coinvolta nell'operazione.
     * @param md_id Identificativo metadato tabella.
     * @returns Metadata colonna mappati e pronti per datasource/edit/list.
     */
    getMetadati(route: string, md_id?: number, options?: {
        skipProjectVersionCheck?: boolean;
    }): Promise<MetadatiColonna[]>;
    /**
     * Chiama l'endpoint metadata remoto (`MetaService.getFlatData`) e sincronizza cache Dexie locale
     * (tabelle, colonne, stili, autorizzazioni, condition/actions) per l'utente corrente.
     * @param route Route applicativa coinvolta nell'operazione.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @param md_id Identificativo metadato tabella.
     */
    getMetas(route: string, userId: number, md_id?: number): Promise<any[]>;
    private normalizeMetadataPayload;
    private setReportListCache;
    /**
     * Recupera da localStorage il dizionario risorse lingua (`language_resources`) usato per tradurre metadata lato client.
     * @returns Oggetto risorse deserializzato oppure `null` se assente.
     */
    static getResources(): any;
    /**
     * Applica le risorse di traduzione al metadata tabella/colonne preservando le relazioni annidate non presenti nel payload tradotto
     * (condition groups, custom actions, autorizzazioni tabella, stili tabella).
     * @param metadati Collezione metadata colonna da aggiornare.
     * @param resources Dizionario risorse tradotte (tableMetadata + colonne per nome campo).
     */
    static translate_meta(metadati: any[], resources: any): void;
    /**
     * Mappa il tipo UI metadata (`mc_ui_column_type`) nel tipo TypeScript corrispondente usato dai declaration/template generator.
     * @param col Metadato colonna da analizzare.
     * @returns Nome tipo TypeScript stimato (`string`, `number`, `boolean`, `Date`, `any`).
     */
    static getTSTypeFromMetaColumn(col: MetadatiColonna): "any" | "boolean" | "string" | "number" | "Date";
    /**
     * Normalizza e arricchisce i metadata colonna/tabella: ordina campi, inizializza callback dinamiche, parse di bag JSON
     * e garantisce fallback robusti per funzioni custom non compilabili.
     * @param metas Metadata colonna grezzi provenienti da cache o backend.
     * @returns Metadata pronti all'uso da datasource/edit-form/list-grid.
     */
    static mapMetadata(metas: MetadatiColonna[]): MetadatiColonna[];
    /**
     * Calcola la colonna target per uno spostamento su/giu nell'ordine campi usando `metaInfo.columnMetadata`.
     * Salta le colonne nascoste in edit (`mc_hide_in_edit`) e prepara i dati necessari alla reorder server-side (chiamata oggi commentata).
     * @param field Colonna sorgente da spostare.
     * @param upDown Direzione di spostamento (`"up"` o `"down"`).
     * @param metaInfo Metadati tabella/colonne usati per risolvere indice corrente e target.
     */
    reorderField(field: MetadatiColonna, upDown: any, metaInfo: MetaInfo): void;
    /**
     * Punto di estensione per mostrare/nascondere una colonna in edit/list tramite metadata (`mc_hide_in_edit` e affini).
     * L'implementazione operativa server-side e il refresh cache/route sono presenti come traccia nei blocchi commentati.
     * @param field Colonna da aggiornare.
     * @param show Se `true` la colonna deve essere mostrata, se `false` nascosta.
     * @param edit Flag legacy usato dalla chiamata server per distinguere il contesto edit.
     * @param metaInfo Metadati correnti della route.
     */
    hideColumn(field: MetadatiColonna, show: boolean, edit: boolean, metaInfo?: MetaInfo): void;
    /**
     * Genera o richiede un suggerimento contestuale basato su metadata e record corrente.
     * @param field Metadato colonna/campo coinvolto nell'elaborazione.
     * @param record Record corrente usato dalla logica/metadati.
     */
    suggest(field: MetadatiColonna, record: any): void;
    /**
     * Recupera il menu utente da cache localStorage o da backend (`MetaService.getMenuByUserID`) e lo mappa in `MenuItem[]`.
     * @param forceRefresh Se `true` bypassa localStorage e forza chiamata backend.
     */
    getMenuByUserID(forceRefresh?: boolean): Promise<MenuItem[]>;
    /**
     * Recupera i metodi amministrativi menu dell'utente da cache o backend (`MetaService.getMenuAdminMethods`).
     * @param forceRefresh Se `true` bypassa localStorage e forza chiamata backend.
     * @returns Elenco metodi admin abilitati per il menu corrente.
     */
    getMenuAdminMethods(forceRefresh?: boolean): Promise<string[]>;
    /**
     * Rimuove i dati target aggiornando lo stato del servizio.
     * @param menuId Identificativo tecnico usato per lookup/aggiornamento.
     * @param preserveChilds Se `true` preserva i figli ricollegandoli al livello superiore.
     * @returns Valore restituito dal metodo (Promise<void>).
     */
    removeMenu(menuId: number, preserveChilds: boolean): Promise<void>;
    /**
     * Chiama `MetaService.addMenu` per creare una nuova voce menu relativa a `menuId`, con opzioni di inserimento prima/dopo e nesting.
     * Al termine invalida cache menu e cache metodi admin dell'utente.
     * @param menuId Id voce/menu di riferimento.
     * @param before Se `true` inserisce prima del target, altrimenti dopo.
     * @param nested Se `true` richiede un inserimento annidato.
     * @param mm_id Catena id menu usata dal backend per contestualizzare la posizione.
     * @returns Id della nuova voce menu creata dal backend.
     */
    addMenu(menuId: number, before: boolean, nested: boolean, mm_id: number[]): Promise<number>;
    /**
     * Riordina una voce menu via `MetaService.reorderMenu` specificando sorgente, target, posizione relativa e nuovo parent.
     * Invalida poi cache menu/metodi admin per forzare rilettura coerente alla successiva apertura.
     * @param source Id voce menu spostata.
     * @param target Id voce menu target.
     * @param after Se `true` posiziona dopo il target, altrimenti prima.
     * @param newParentId Id parent finale dopo il move.
     * @param mm_id Catena id menu usata dal backend durante il riordino.
     */
    reorderMenu(source: number, target: number, after: boolean, newParentId: number, mm_id: number[]): Promise<void>;
    /**
     * Sposta una voce menu come figlia di un nuovo parent chiamando `MetaService.nestMenu`.
     * Dopo la mutazione invalida cache menu e cache metodi amministrativi.
     * @param newChild Id della voce da annidare.
     * @param newParent Id del nuovo nodo parent.
     */
    nestMenu(newChild: number, newParent: number): Promise<void>;
    /**
     * Crea una nuova voce menu completa (caption + url) via `MetaService.addMenuFull`.
     * Invalida cache menu e metodi admin e ritorna l'id generato dal backend.
     * @param caption Etichetta visualizzata nel menu.
     * @param url Route/URL associata alla voce.
     * @returns Id della voce menu creata.
     */
    addMenuFull(caption: string, url: string): Promise<number>;
    /**
     * Trasforma la struttura annidata ricevuta dal backend (`_Metadati_Menus_Ordered`) in `MenuItem[]` PrimeNG.
     * Normalizza la route (`mm_uri_menu`) e ricostruisce ricorsivamente i figli preservando `mm_id` e icona.
     * @param results Nodi menu raw restituiti dal backend.
     * @param items Collezione root su cui appendere i nodi mappati.
     * @param parent Parent corrente durante la ricorsione; se assente il nodo viene aggiunto alla root.
     */
    mapMenu(results: any[], items: MenuItem[], parent?: MenuItem): void;
    /**
     * Normalizza il payload in una forma coerente per i passaggi successivi.
     * @param route Route applicativa coinvolta nell'operazione.
     * @returns Valore restituito dal metodo (any).
     */
    private normalizeMenuRoute;
    private splitMenuRouteAndQuery;
    /**
     * Esegue parse robusto di `mc_props_bag`/bag JSON metadata accettando anche payload legacy malformati.
     * In caso di errore prova normalizzazione progressiva e logga dettagli contestuali per debug metadata.
     * @param raw Payload bag grezzo (oggetto o stringa JSON-like).
     * @param context Identificatore contesto usato nei log (route/colonna).
     * @returns Oggetto bag normalizzato; `{}` se non interpretabile.
     */
    private static parseMetadataBag;
    /**
     * Applica correzioni conservative a stringhe JSON legacy (virgolette smart, apostrofi, separatori irregolari)
     * per aumentare la probabilita di parse senza alterare il contenuto semantico.
     * @param input Stringa JSON-like da normalizzare.
     * @returns Stringa normalizzata pronta per tentativo `JSON.parse`.
     */
    private static normalizeLegacyJsonLike;
    /**
     * Estrae la posizione carattere dell'errore JSON da messaggi parser eterogenei.
     * @param err Errore lanciato da `JSON.parse`.
     * @returns Indice carattere errore se rilevabile.
     */
    private static extractJsonErrorPosition;
    /**
     * Costruisce un frammento diagnostico intorno alla posizione errore JSON per semplificare il fixing metadata.
     * @param input Testo JSON sorgente.
     * @param position Posizione carattere errore.
     * @returns Oggetto diagnostico con before/after e offset.
     */
    private static buildJsonErrorContext;
    /**
     * Fornisce dettagli del carattere in errore (char, codePoint, escape) alla posizione indicata.
     * @param input Testo JSON sorgente.
     * @param position Posizione carattere errore.
     * @returns Dettagli carattere utili per debug parser.
     */
    private static getJsonErrorCharDetails;
    /**
     * Escapa line break non validi all'interno di literal stringa JSON mantenendo intatti i contenuti fuori stringa.
     * @param input Testo JSON da sanificare.
     * @returns Testo con newline in-string convertiti a sequenze escape.
     */
    private static escapeLineBreaksInQuotedLiterals;
    /**
     * Compone l'endpoint ASMX scegliendo il path proxy (`.../AsmxProxy/...`) quando configurato,
     * altrimenti fallback al percorso legacy.
     * @param proxyMethod Metodo proxy da appendere a `global_root_url`.
     * @param legacyPath Path legacy ASMX.
     * @returns URL endpoint risolto.
     */
    private static buildAsmxEndpoint;
    /**
     * Avvia il processo di scaffolding OData lato server chiamando l'endpoint `MetadataProviderService.scaffoldODataUri`.
     */
    scaffoldOdata(): Promise<void>;
    /**
     * Costruisce la chiave localStorage dei custom settings utente.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @returns Chiave `wuic_custom_settings_{userId}`.
     */
    private getCustomSettingsStorageKey;
    /**
     * Costruisce la chiave richiesta usata per deduplica chiamate custom settings in-flight (`userId::key`).
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @param key Chiave logica della configurazione o del setting.
     * @returns Chiave composita richiesta.
     */
    private getCustomSettingsRequestKey;
    /**
     * Legge i custom settings utente con deduplica richieste in-flight e cache locale (`wuic_custom_settings_{userId}`).
     * Per una chiave specifica prova prima localStorage, poi richieste aggregate gia in corso; per la lettura completa aggiorna la cache locale.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @param key Chiave setting; vuota per ottenere l'intero dizionario.
     * @returns Valore del setting richiesto oppure oggetto completo dei settings.
     */
    readCustomSettings(userId: number | string, key?: string): Promise<any>;
    /**
     * Salva i dati richiesti dal flusso runtime del servizio.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @param settings Oggetto settings (o stringa JSON) da serializzare e inviare al backend.
     * @param key Chiave logica della configurazione o del setting.
     * @returns Valore restituito dal metodo (Promise<any>).
     */
    saveCustomSettings(userId: number | string, settings: any, key: string): Promise<any>;
    /**
     * Genera lato server lo script SQL PIVOT per una route metadata e restituisce la query pronta da mostrare.
     * @param route Route metadata (`md_route_name`) da usare come sorgente.
     * @param rowColumns Colonne asse righe.
     * @param columnColumns Colonne asse colonne (pivot key).
     * @param valueColumn Colonna valore aggregata nella pivot.
     * @param aggregateFunction Funzione aggregazione (`SUM|AVG|MIN|MAX|COUNT`).
     * @returns Payload risposta backend con `ok`, `query` e metadati diagnostici.
     */
    generatePivotQuery(route: string, rowColumns: string[], columnColumns: string[], valueColumns: string[] | string, aggregateFunction?: string, valueDefinitions?: Array<{
        alias: string;
        aggregateFunction?: string;
        caption?: string;
    }>, filterInfo?: any, sortInfo?: any[], rowColumnOptions?: Array<{
        alias: string;
        castDate?: boolean;
        groupBy?: string;
    }>, columnColumnOptions?: Array<{
        alias: string;
        castDate?: boolean;
        groupBy?: string;
    }>, topRows?: number): Promise<any>;
    /**
     * Esegue la query pivot e restituisce anteprima righe/colonne dinamiche.
     */
    executePivotQuery(route: string, rowColumns: string[], columnColumns: string[], valueColumns: string[] | string, aggregateFunction?: string, valueDefinitions?: Array<{
        alias: string;
        aggregateFunction?: string;
        caption?: string;
    }>, filterInfo?: any, sortInfo?: any[], maxRows?: number, rowColumnOptions?: Array<{
        alias: string;
        castDate?: boolean;
        groupBy?: string;
    }>, columnColumnOptions?: Array<{
        alias: string;
        castDate?: boolean;
        groupBy?: string;
    }>): Promise<any>;
    createPivotView(route: string, rowColumns: string[], columnColumns: string[], valueColumns: string[] | string, aggregateFunction?: string, valueDefinitions?: Array<{
        alias: string;
        aggregateFunction?: string;
        caption?: string;
    }>, filterInfo?: any, sortInfo?: any[], rowColumnOptions?: Array<{
        alias: string;
        castDate?: boolean;
        groupBy?: string;
    }>, columnColumnOptions?: Array<{
        alias: string;
        castDate?: boolean;
        groupBy?: string;
    }>, targetSchema?: string, createMenu?: boolean, viewName?: string | null, enableDynamicScheduler?: boolean, schedulerFrequency?: string, topRows?: number, overwriteIfExists?: boolean): Promise<any>;
    createPivotMaterializedTable(route: string, rowColumns: string[], columnColumns: string[], valueColumns: string[] | string, aggregateFunction?: string, valueDefinitions?: Array<{
        alias: string;
        aggregateFunction?: string;
        caption?: string;
    }>, filterInfo?: any, sortInfo?: any[], rowColumnOptions?: Array<{
        alias: string;
        castDate?: boolean;
        groupBy?: string;
    }>, columnColumnOptions?: Array<{
        alias: string;
        castDate?: boolean;
        groupBy?: string;
    }>, targetSchema?: string, createMenu?: boolean, tableName?: string | null, enableDynamicScheduler?: boolean, schedulerFrequency?: string, topRows?: number, overwriteIfExists?: boolean): Promise<any>;
    forceSchedulerExecutionNow(schedulerId: number, routeName?: string | null): Promise<any>;
    /**
     * Salva la configurazione pivot persistita in `_metadati__pivot`.
     * @param route Route metadata selezionata.
     * @param mdId Id metadata tabella.
     * @param configuration Oggetto configurazione (assi/valore/aggregazione).
     * @param sqlText SQL pivot generato.
     * @returns Payload backend normalizzato.
     */
    savePivotConfiguration(route: string, mdId: number | null, configuration: any, sqlText: string, pivotName: string): Promise<any>;
    /**
     * Carica la configurazione pivot persistita per route/md_id.
     * @param route Route metadata selezionata.
     * @param mdId Id metadata tabella.
     * @returns Payload backend normalizzato.
     */
    loadPivotConfiguration(route: string, mdId: number | null, pivotName?: string | null): Promise<any>;
    /**
     * Elenca le configurazioni pivot salvate, opzionalmente filtrate per route metadata.
     * @param route Route metadata opzionale.
     * @returns Payload backend normalizzato.
     */
    listPivotConfigurations(route?: string | null): Promise<any>;
    private tryParseJsonPayload;
    /**
     * Esegue il bootstrap dei custom settings in localStorage subito dopo login/session bootstrap.
     * Recupera tutti i settings dell'utente e li salva in `wuic_custom_settings_{userId}` senza interrompere il flusso in caso di errore endpoint.
     * @param userId Identificativo utente; se omesso usa l'utente corrente.
     */
    bootstrapCustomSettingsToLocalStorage(userId?: number | string): Promise<void>;
    /**
     * Pulisce lo stato runtime e le cache associate.
     * Legge/scrive dati persistenti su storage browser.
     * @param userId Identificativo utente usato per contesto e persistenza.
     */
    clearCustomSettingsLocalStorage(userId?: number | string): void;
    getCustomSettingFromLocalStorage<T = any>(key: string, userId?: number | string): T | null;
    /**
     * Aggiorna/inserisce un singolo setting nell'oggetto settings locale dell'utente e lo riscrive in localStorage.
     * In caso di JSON corrotto riparte da oggetto vuoto per mantenere il salvataggio resiliente.
     * @param key Chiave logica della configurazione o del setting.
     * @param value Nuovo valore da salvare.
     * @param userId Identificativo utente; se omesso usa l'utente corrente.
     */
    setCustomSettingInLocalStorage(key: string, value: any, userId?: number | string): void;
    /**
     * Recupera la lista report per route leggendo solo dalla cache locale popolata da `getTableMetadata`.
     * Non esegue chiamate backend dedicate a `MetaService.getReportListByRoute`.
     * @param route Route applicativa di cui leggere i report associati.
     * @returns Elenco report `{ path, name }`.
     */
    getReportList(route: string): Promise<{
        path: string;
        name: string;
    }[]>;
    /**
     * Recupera `ProjectMetadataVersion` dal backend solo quando la cache versione e scaduta;
     * usa `MetaService.getAppSettings` e salva timestamp+versione in localStorage per ridurre chiamate ripetute.
     * @param offsetMs Offset fuso client in millisecondi da riportare al backend.
     * @returns Versione metadata progetto corrente oppure `null` se cache ancora valida/errore.
     */
    private getProjectMetadataVersionIfExpired;
    getReportVariables(route: string, reportName: string): Promise<Array<{
        name: string;
        alias: string;
        value: string;
        type: string;
    }>>;
    static ɵfac: i0.ɵɵFactoryDeclaration<MetadataProviderService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<MetadataProviderService>;
}

declare class ComboParams {
    endpoint: any;
    dataroute: string;
    sortInfo: SortInfo[];
    groupInfo: any;
    filterInfo: any;
    md_server_side_operations: boolean;
    pageSize?: number;
    constructor(ds: DataSourceComponent);
}

declare class DataProviderOdataService {
    private http;
    constructor(http: HttpClient);
    /**
     * Esegue l'operazione dati implementata da `select`.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @param all Flag che abilita caricamento completo dataset.
     * @param resultInfo Struttura risultato da popolare/aggiornare.
     * @param hideBusy Flag/handler per gestione busy indicator UI.
     */
    select(scope: DataSourceComponent, userId: number, all: boolean, resultInfo?: ResultInfo, hideBusy?: any): Promise<ResultInfo>;
    /**
     * Traduce il `FilterInfo` interno in espressione OData `$filter` applicando i mapping operatori previsti dalla route.
     * @param filterInfo Filtro applicato alla selezione dati.
     * @param route Route applicativa coinvolta nell'operazione.
     */
    filterInfoToOdata(filterInfo: FilterInfo, route: string): string;
    /**
     * Mappa l'operatore filtro interno nel corrispondente frammento OData (`eq`, `contains`, `startswith`, ...),
     * adattando anche il valore quando richiesto dalla sintassi.
     * @param operatore Operatore filtro interno da convertire in sintassi OData.
     * @param value Valore input da convertire/normalizzare.
     */
    getOdataOperator(operatore: string, value?: any): string;
    /**
     * Esegue l'operazione dati implementata da `update`.
     * Legge/scrive dati persistenti su storage browser.
     * @param entity Entita dati target della mutazione.
     * @param pristine Copia originale dell'entita per diff/update.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @returns Valore restituito dal metodo (Promise<any>).
     */
    update(entity: any, pristine: any, scope: DataSourceComponent, userId: number): Promise<any>;
    /**
     * Esegue l'operazione dati implementata da `insert`.
     * Legge/scrive dati persistenti su storage browser.
     * @param entity Entita dati target della mutazione.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     */
    insert(entity: any, scope: DataSourceComponent, userId: number): Promise<any>;
    /**
     * Esegue l'operazione dati implementata da `clone`.
     * Legge/scrive dati persistenti su storage browser.
     * @param entity Entita dati target della mutazione.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @param relatedRouteToClone Route applicativa coinvolta nell'operazione.
     */
    clone(entity: any, scope: DataSourceComponent, userId: number, relatedRouteToClone: any[]): Promise<any>;
    /**
     * Rimuove i dati target aggiornando lo stato del servizio.
     * Legge/scrive dati persistenti su storage browser.
     * @param entity Entita dati target della mutazione.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     */
    delete(entity: any, scope: DataSourceComponent, userId: number): Promise<any>;
    static ɵfac: i0.ɵɵFactoryDeclaration<DataProviderOdataService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<DataProviderOdataService>;
}

declare class DataProviderMetaService {
    private _http;
    http: HttpClient;
    /**
     * Inizializza il provider dati metadata con l'istanza `HttpClient` usata da tutti gli endpoint `MetaService.*`.
     */
    constructor(_http: HttpClient);
    /**
     * Pulisce la cache localStorage preservando le traduzioni gia caricate.
     * Evita regressioni UX dove, dopo save metadata non-translation, le label tornano alle chiavi raw.
     */
    private clearLocalStoragePreservingTranslation;
    /**
     * Carica i dati della route corrente chiamando `MetaService.getFlatRecordData` (`MetadataProviderService.readUri`).
     * Invia paginazione/ordinamenti/gruppi/filtri/aggregazioni e `has_server_operation`, poi mappa la risposta
     * `rawPagedResult` in `ResultInfo` (`dato`, `current`, `totalRowCount`, `totalGroups`, `Agg`, `route`).
     * Se `all=false` espone solo il primo record in `dato`, altrimenti l'intera pagina.
     * @param scope Datasource con metadati tabella/colonne e stato runtime (filtri, paging, loading).
     * @param userId `user_id` inoltrato al backend.
     * @param all Se `true` mantiene tutti i risultati pagina; se `false` riduce al primo elemento.
     * @param resultInfo Contenitore risultato da riempire; se assente viene creato.
     * @param hideBusy Parametro legacy non usato nella logica corrente.
     */
    select(scope: DataSourceComponent, userId: number, all: boolean, resultInfo?: ResultInfo, hideBusy?: any): Promise<ResultInfo>;
    /**
     * Wrapper di `select` senza componente UI reale: costruisce uno scope minimale con route e server-side ops attive,
     * poi richiede l'intera pagina (`all=true`).
     * @param userId `user_id` inviato a `MetaService.getFlatRecordData`.
     * @param route Route da interrogare (`md_route_name`).
     * @param filterInfo Filtro opzionale passato al backend.
     * @param sortInfo Ordinamenti opzionali.
     * @param pageSize Page size opzionale.
     * @param currentPage Pagina corrente opzionale.
     * @returns `ResultInfo` popolato da `select`.
     */
    selectByRoute(userId: number, route: string, filterInfo?: FilterInfo, sortInfo?: SortInfo[], pageSize?: number, currentPage?: number): Promise<ResultInfo>;
    /**
     * Carica i dati per un controllo combo/lookup chiamando `MetaService.getFlatRecordComboData`.
     * Compone `filterInfo` in base a testo ricerca o valore corrente campo, includendo eventuale record gia selezionato.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param UserInfo Contesto utente da passare alle API metadata.
     * @param currentRecord Record corrente usato dalla logica/metadati.
     * @param field Metadato colonna/campo coinvolto nell'elaborazione.
     * @param filterString Testo filtro free-text per ricerca/suggest.
     */
    getComboData(scope: ComboParams, UserInfo: any, currentRecord: any, field: MetadatiColonna, filterString: string): Promise<rawPagedResult>;
    /**
     * Aggiorna un record via `MetaService.updateRecord` inviando `entity` + `__original` (snapshot `pristine`) e `route`.
     * Dopo il salvataggio invalida cache metadata:
     * - su `is_system_route`: `localStorage.clear()`, clear DB locale metadata, `getSchemaAndData()`;
     * - su meta route standard: clear cache (oppure solo translation per `_wuic_translations`) e reload schema+dati.
     * @param entity Record modificato da salvare.
     * @param pristine Versione originale usata dal backend per logiche di update/concurrency.
     * @param scope Datasource che fornisce route e stato loading.
     * @param UserInfo Contesto utente (usa `UserInfo.user_id`).
     * @returns Payload risposta backend (include tipicamente `operation`, `result`, `__entity`).
     */
    update(entity: any, pristine: any, scope: DataSourceComponent, UserInfo: any): Promise<any>;
    /**
     * Esegue il batch update remoto via `MetaService.batchRecord` sulla route corrente.
     * Dopo il salvataggio invalida cache locali metadata/traduzioni e ricarica schema+dati quando la route e metadata/system route.
     * @param entities Entita dati coinvolte nella mutazione batch.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @returns Payload risposta backend del batch.
     */
    batchSave(entities: any[], scope: DataSourceComponent, userId: number): Promise<any>;
    /**
     * Inserisce un record via `MetaService.insertRecord`.
     * Se il backend restituisce `operation='insert'` con id autogenerato, valorizza la PK locale
     * del record usando il primo campo primary key metadata (`MetadataProviderService.getPKeys`).
     * Per meta route invalida cache browser e ricarica schema+dati.
     * @param entity Record da inserire.
     * @param scope Datasource corrente (route, metadati, loading).
     * @param userId `user_id` da inviare al backend.
     */
    insert(entity: any, scope: DataSourceComponent, userId: number): Promise<any>;
    /**
     * Clona un record (ed eventuali relazioni richieste) via `MetaService.CloneRecord`.
     * Invia `relatedRouteToClone` per guidare la clonazione server-side delle route collegate.
     * Su meta route invalida cache metadata locale e ricarica schema+dati.
     * @param entity Record sorgente da clonare.
     * @param scope Datasource corrente.
     * @param userId `user_id` inviato all'endpoint clone.
     * @param relatedRouteToClone Elenco route correlate da includere nella clonazione.
     */
    clone(entity: any, scope: DataSourceComponent, userId: number, relatedRouteToClone: any[]): Promise<any>;
    /**
     * Elimina un record via `MetaService.deleteRecord` usando la route del datasource.
     * Per meta route effettua invalidazione cache (`localStorage`/`translation`, IndexedDB metadata)
     * e ricarica schema+dati per riallineare l'editor metadati.
     * @param entity Record da eliminare.
     * @param scope Datasource corrente (fornisce route e loading).
     * @param userId `user_id` passato al backend.
     */
    delete(entity: any, scope: DataSourceComponent, userId: number): Promise<any>;
    /**
     * Invoca l'export XLS backend includendo tema PrimeNG e modalita light/dark per generare file coerenti con lo stile UI.
     * @param route Route applicativa coinvolta nell'operazione.
     * @param filterInfo Filtro applicato alla selezione dati.
     * @param progressGuid GUID progresso per tracciamento export/lavorazione.
     * @param selectedTheme Tema UI richiesto per export/render.
     * @param themeMode Modalita tema (light/dark) applicata all'output.
     */
    exportXlsWithTheme(route: any, filterInfo: any, progressGuid: any, selectedTheme: any, themeMode: any): Promise<any>;
    /**
     * Salva/aggiorna una dashboard via `MetaService.saveDashboard`.
     * Il payload viene inoltrato così com'è (tipicamente `dashRoute`, `elements`, `desc`, `sheetPaths`, `designMode`, `pwd`, `user_id`).
     * Lato server il record viene upsertato in `dom_board` e le associazioni fogli riscritte in `dom_board_sheet`.
     * @param payload Oggetto richiesta dashboard da persistire.
     * @returns Oggetto dashboard serializzato restituito dal backend.
     */
    saveDashboard(payload: any): Promise<any>;
    /**
     * Carica una dashboard via `MetaService.loadDashboard` in base al `dashRoute` nel payload.
     * @param payload Richiesta di load (tipicamente `dashRoute`, opzionalmente `user_id`).
     * @returns Stato dashboard serializzato dal backend (`dom_board` + dati correlati).
     */
    loadDashboard(payload: any): Promise<any[]>;
    /**
     * Elimina una dashboard via `MetaService.deleteDashboard`.
     * Lato server la cancellazione rimuove anche righe figlie (`dom_board_element`, `dom_board_sheet`) nella stessa transazione.
     * @param payload Richiesta delete (deve includere `dashRoute`).
     * @returns Esito serializzato `{ deleted, affected }`.
     */
    deleteDashboard(payload: any): Promise<any>;
    /**
     * Salva/aggiorna un workflow graph via `MetaService.saveWorkflowGraph`.
     * Il backend fa upsert su `_wuic_workflow_graph` e riscrive i dettagli route-node
     * in `_wuic_workflow_graph_route_metadata` partendo da `route_metadata_json`.
     * @param payload Richiesta con `graph_key`, `graph_name`, `graph_json`, `route_metadata_json`.
     * @returns Esito serializzato con id/chiave/nome e numero route metadata processate.
     */
    saveWorkflowGraph(payload: any): Promise<any>;
    /**
     * Carica un workflow graph via `MetaService.loadWorkflowGraph`.
     * Se la chiave non esiste, il backend ritorna un grafo vuoto (`nodes/connections`) con `route_metadata=[]`.
     * @param payload Richiesta con `graph_key`.
     * @returns Struttura `{ graph_key, graph_name, graph_json, route_metadata }`.
     */
    loadWorkflowGraph(payload: any): Promise<any>;
    /**
     * Richiede al backend l'elenco dei workflow graph disponibili (`MetaService.getWorkflowGraphs`).
     * @param payload Payload richiesta/risposta usato nel metodo.
     * @returns Collezione graph restituita dal server.
     */
    getWorkflowGraphs(payload: any): Promise<any>;
    /**
     * Rinomina un workflow graph lato server usando `MetadataProviderService.renameWorkflowGraphUri`.
     * @param payload Payload con identificativo grafo e nuovo nome.
     * @returns Risposta backend del rename.
     */
    renameWorkflowGraph(payload: any): Promise<any>;
    /**
     * Elimina un workflow graph via `MetaService.deleteWorkflowGraph` usando `graph_key`.
     * @param payload Richiesta delete graph.
     * @returns Esito serializzato `{ deleted, affected }`.
     */
    deleteWorkflowGraph(payload: any): Promise<any>;
    /**
     * Chiede al backend le classi CSS presenti nei fogli indicati (`MetaService.getCssClassesFromSheets`).
     * @param sheetPaths Percorsi fogli CSS da elaborare.
     * @returns Lista classi CSS rilevate.
     */
    getCssClassesFromSheets(sheetPaths: string[]): Promise<any[]>;
    /**
     * Scrive su file CSS le modifiche di stile invocando l'endpoint backend dedicato.
     * @param sheet Foglio CSS oggetto di lettura/scrittura.
     */
    writeChangesToCssFile(sheet: any): Promise<void>;
    static ɵfac: i0.ɵɵFactoryDeclaration<DataProviderMetaService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<DataProviderMetaService>;
}

declare class DataProviderWebserviceService {
    private http;
    constructor(http: HttpClient);
    /**
     * Esegue l'operazione dati implementata da `select`.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @param all Flag che abilita caricamento completo dataset.
     * @param resultInfo Struttura risultato da popolare/aggiornare.
     * @param hideBusy Flag/handler per gestione busy indicator UI.
     */
    select(scope: DataSourceComponent, userId: number, all: boolean, resultInfo?: ResultInfo, hideBusy?: any): Promise<ResultInfo>;
    /**
     * Esegue l'operazione dati implementata da `update`.
     * Legge/scrive dati persistenti su storage browser.
     * @param entity Entita dati target della mutazione.
     * @param pristine Copia originale dell'entita per diff/update.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param UserInfo Contesto utente da inoltrare al backend webservice.
     * @returns Valore restituito dal metodo (Promise<any>).
     */
    update(entity: any, pristine: any, scope: DataSourceComponent, UserInfo: any): Promise<any>;
    /**
     * Esegue l'operazione dati implementata da `insert`.
     * Legge/scrive dati persistenti su storage browser.
     * @param entity Entita dati target della mutazione.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     */
    insert(entity: any, scope: DataSourceComponent, userId: number): Promise<any>;
    /**
     * Esegue l'operazione dati implementata da `clone`.
     * Legge/scrive dati persistenti su storage browser.
     * @param entity Entita dati target della mutazione.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @param relatedRouteToClone Route applicativa coinvolta nell'operazione.
     */
    clone(entity: any, scope: DataSourceComponent, userId: number, relatedRouteToClone: any[]): Promise<any>;
    /**
     * Rimuove i dati target aggiornando lo stato del servizio.
     * Legge/scrive dati persistenti su storage browser.
     * @param entity Entita dati target della mutazione.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     */
    delete(entity: any, scope: DataSourceComponent, userId: number): Promise<any>;
    static ɵfac: i0.ɵɵFactoryDeclaration<DataProviderWebserviceService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<DataProviderWebserviceService>;
}

declare class ClientSideCrudService {
    private db?;
    private dbInitPromise?;
    private readonly localModePrefix;
    /**
     * Inizializza una sola volta il database Dexie locale (`WuicClientSideCrudDB`) e ne riusa l'istanza.
     * @returns Istanza DB locale usata per cache/sync CRUD client-side.
     */
    private getDb;
    private clone;
    /**
     * Normalizza il payload in una forma coerente per i passaggi successivi.
     * @param route Route applicativa coinvolta nell'operazione.
     * @returns Valore restituito dal metodo (string).
     */
    private normalizeRoute;
    /**
     * Normalizza il payload in una forma coerente per i passaggi successivi.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @returns Valore restituito dal metodo (string).
     */
    private normalizeUserId;
    /**
     * Estrae la route metadata dal datasource corrente.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @returns Nome route (`md_route_name`) o stringa vuota.
     */
    private getRoute;
    /**
     * Risolve il nome colonna primary key della route, con fallback su `id`.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @returns Nome campo PK.
     */
    private getPkName;
    /**
     * Estrae il valore PK serializzato da un payload entita usando il nome campo indicato.
     * @param payload Payload richiesta/risposta usato nel metodo.
     * @param pkName Nome della colonna PK da usare per estrarre il valore dal payload.
     * @returns PK in formato stringa oppure `undefined` se assente.
     */
    private getPkValue;
    /**
     * Cerca una riga nel DB client-side per route+utente usando priorita su GUID, con fallback su primary key.
     * @param route Route applicativa coinvolta nell'operazione.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @param pkValue Valore PK della riga (usato come fallback se GUID non disponibile).
     * @param guid GUID locale della riga.
     * @returns Riga locale trovata oppure `undefined`.
     */
    private findRow;
    /**
     * Genera una PK temporanea client-side per nuove righe non ancora persistite su server.
     * @returns Identificativo negativo con prefisso `tmp_`.
     */
    private getTempPk;
    /**
     * Costruisce la chiave localStorage che abilita/disabilita la modalita CRUD locale per route+utente.
     * @param route Route applicativa coinvolta nell'operazione.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @returns Chiave storage del flag modalita locale.
     */
    private getModeKey;
    /**
     * Attiva/disattiva il flag modalita CRUD locale per route+utente in localStorage.
     * @param route Route applicativa coinvolta nell'operazione.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @param enabled Stato modalita locale da salvare.
     */
    private setModeEnabled;
    /**
     * Valuta una condizione booleana sullo stato o sull'input corrente.
     * Legge/scrive dati persistenti su storage browser.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @returns Valore restituito dal metodo (Promise<boolean>).
     */
    isModeEnabled(scope: DataSourceComponent, userId: string | number): Promise<boolean>;
    /**
     * Abilita la route in modalita CRUD locale popolando la tabella locale con `allRows`.
     * Normalizza ogni record con GUID/PK/flag di stato e salva anche il marker di modalita in localStorage.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @param allRows Righe iniziali da cache-are localmente.
     */
    enable(scope: DataSourceComponent, userId: string | number, allRows: any[]): Promise<void>;
    /**
     * Esegue l'operazione dati implementata da `select`.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @param all Flag che abilita caricamento completo dataset.
     * @param resultInfo Struttura risultato da popolare/aggiornare.
     * @returns Valore restituito dal metodo (Promise<ResultInfo>).
     */
    select(scope: DataSourceComponent, userId: string | number, all: boolean, resultInfo?: ResultInfo): Promise<ResultInfo>;
    /**
     * Esegue l'operazione dati implementata da `insert`.
     * @param entity Entita dati target della mutazione.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @returns Valore restituito dal metodo (Promise<any>).
     */
    insert(entity: any, scope: DataSourceComponent, userId: string | number): Promise<any>;
    /**
     * Esegue l'operazione dati implementata da `update`.
     * @param entity Entita dati target della mutazione.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @returns Valore restituito dal metodo (Promise<any>).
     */
    update(entity: any, scope: DataSourceComponent, userId: string | number): Promise<any>;
    /**
     * Rimuove i dati target aggiornando lo stato del servizio.
     * @param entity Entita dati target della mutazione.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @returns Valore restituito dal metodo (Promise<any>).
     */
    delete(entity: any, scope: DataSourceComponent, userId: string | number): Promise<any>;
    disableAndSync(scope: DataSourceComponent, userId: string | number, remote: {
        insert: (entity: any) => Promise<any>;
        update: (entity: any) => Promise<any>;
        delete: (entity: any) => Promise<any>;
    }): Promise<{
        inserted: number;
        updated: number;
        deleted: number;
    }>;
    /**
     * Pulisce lo stato runtime e le cache associate.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param userId Identificativo utente usato per contesto e persistenza.
     * @returns Valore restituito dal metodo (Promise<void>).
     */
    clearRoute(scope: DataSourceComponent, userId: string | number): Promise<void>;
    static ɵfac: i0.ɵɵFactoryDeclaration<ClientSideCrudService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<ClientSideCrudService>;
}

declare class DataProviderService {
    private http;
    private metaSrv;
    private odataSrv;
    private dataMetaSrv;
    private webDataSrv;
    private userInfo;
    private clientCrudSrv;
    private readonly defaultClientCrudBatchSize;
    private readonly defaultClientCrudMaxPages;
    private readonly clientCrudLookupKeyPrefix;
    constructor(http: HttpClient, metaSrv: MetadataProviderService, odataSrv: DataProviderOdataService, dataMetaSrv: DataProviderMetaService, webDataSrv: DataProviderWebserviceService, userInfo: UserInfoService, clientCrudSrv: ClientSideCrudService);
    private getClientSideCrudConfig;
    /**
     * Costruisce la chiave localStorage che traccia le lookup route caricate in client-side CRUD per coppia utente+route.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @returns Chiave storage nel formato `__wuic_client_side_crud_lookup_routes__{userId}__{route}`.
     */
    private getLookupRouteStorageKey;
    /**
     * Salva i dati richiesti dal flusso runtime del servizio.
     * Legge/scrive dati persistenti su storage browser.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param routes Elenco route coinvolte nell'operazione.
     */
    private saveLookupRoutesForScope;
    /**
     * Legge da localStorage la lista lookup route memorizzata per la route corrente in modalita client-side CRUD.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @returns Elenco route lookup persistite (array vuoto se assenti/corrotte).
     */
    private getLookupRoutesForScope;
    /**
     * Pulisce lo stato runtime e le cache associate.
     * Legge/scrive dati persistenti su storage browser.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     */
    private clearLookupRoutesForScope;
    /**
     * Estrae dalle colonne metadata le route lookup referenziate (`lookupByID` / `multiple_check`) escludendo la route corrente.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @returns Elenco route lookup univoche collegate al datasource.
     */
    private getLookupRoutes;
    /**
     * Scarica tutte le righe di una route in pagine consecutive usando `selectByRoute` fino a esaurimento dataset.
     * Interrompe il loop su pagina vuota, ultimo batch incompleto o raggiungimento `totalRowCount`.
     * @param route Route applicativa coinvolta nell'operazione.
     * @param batchSize Numero record per pagina.
     * @param maxPages Limite massimo pagine da leggere.
     * @returns Collezione aggregata di tutte le righe lette.
     */
    private fetchAllRowsByRoute;
    /**
     * Valuta una condizione booleana sullo stato o sull'input corrente.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @returns Valore restituito dal metodo (boolean).
     */
    private isClientSideCrudActive;
    /**
     * Esegue l'operazione dati implementata da `selectByRoute`.
     * @param route Route applicativa coinvolta nell'operazione.
     * @param filters Elenco filtri da tradurre in `FilterInfo`.
     * @param sortInfo Ordinamenti applicati alla query.
     * @param pageSize Dimensione pagina della query.
     * @param currentPage Indice pagina corrente.
     * @returns Valore restituito dal metodo (Promise<ResultInfo>).
     */
    selectByRoute(route: string, filters?: FilterItem[], sortInfo?: SortInfo[], pageSize?: number, currentPage?: number): Promise<ResultInfo>;
    /**
     * Esegue l'operazione dati implementata da `select`.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param all Flag che abilita caricamento completo dataset.
     * @param resultInfo Struttura risultato da popolare/aggiornare.
     * @param hideBusy Flag/handler per gestione busy indicator UI.
     * @param forceRemote Flag per forzare provider remoto bypassando cache client.
     * @returns Valore restituito dal metodo (Promise<ResultInfo>).
     */
    select(scope: DataSourceComponent, all: boolean, resultInfo?: ResultInfo, hideBusy?: any, forceRemote?: boolean): Promise<ResultInfo>;
    /**
     * Delega al provider metadata il caricamento dati combo (`MetaService.getFlatRecordComboData`) passando contesto utente corrente.
     * @param scope Configurazione combo/lookup (route, paging, sort, ...).
     * @param currentRecord Record corrente usato dalla logica/metadati.
     * @param field Metadato colonna/campo coinvolto nell'elaborazione.
     * @param filterString Testo filtro free-text per ricerca/suggest.
     */
    getComboData(scope: ComboParams, currentRecord: any, field: MetadatiColonna, filterString: string): Promise<rawPagedResult>;
    /**
     * Esegue l'operazione dati implementata da `insert`.
     * @param entity Entita dati target della mutazione.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param forceRemote Flag per forzare provider remoto bypassando cache client.
     * @returns Valore restituito dal metodo (Promise<UpdateInfo>).
     */
    insert(entity: any, scope: DataSourceComponent, forceRemote?: boolean): Promise<UpdateInfo>;
    /**
     * Esegue l'operazione dati implementata da `update`.
     * @param entity Entita dati target della mutazione.
     * @param pristine Copia originale dell'entita per diff/update.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param forceRemote Flag per forzare provider remoto bypassando cache client.
     * @returns Valore restituito dal metodo (Promise<UpdateInfo>).
     */
    update(entity: any, pristine: any, scope: DataSourceComponent, forceRemote?: boolean): Promise<UpdateInfo>;
    /**
     * Rimuove i dati target aggiornando lo stato del servizio.
     * @param entity Entita dati target della mutazione.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param forceRemote Flag per forzare provider remoto bypassando cache client.
     * @returns Valore restituito dal metodo (Promise<UpdateInfo>).
     */
    delete(entity: any, scope: DataSourceComponent, forceRemote?: boolean): Promise<UpdateInfo>;
    /**
     * Salva un batch di entita scegliendo dinamicamente il provider: client-side CRUD locale, provider endpoint-specific
     * (fallback a update singolo) oppure provider metadata standard.
     * @param entities Entita dati coinvolte nella mutazione batch.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param forceRemote Se `true` bypassa la modalita client-side.
     * @returns Risultati del batch (array esiti o payload backend).
     */
    batchSave(entities: any[], scope: DataSourceComponent, forceRemote?: boolean): Promise<any>;
    /**
     * Esegue l'operazione dati implementata da `clone`.
     * @param entity Entita dati target della mutazione.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @param relatedRouteToClone Route applicativa coinvolta nell'operazione.
     * @returns Valore restituito dal metodo (Promise<UpdateInfo>).
     */
    clone(entity: any, scope: DataSourceComponent, relatedRouteToClone: any[]): Promise<UpdateInfo>;
    /**
     * Abilita la modalita CRUD locale caricando tutte le righe della route (e opzionalmente delle lookup route collegate)
     * nel DB client-side, preservando e ripristinando lo stato paging/filter/sort originale del datasource.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     */
    enableClientSideCrud(scope: DataSourceComponent): Promise<void>;
    /**
     * Verifica se la route corrente e gia in modalita client-side CRUD per l'utente attuale.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     * @returns `true` se la modalita locale e attiva per la route.
     */
    restoreClientSideCrudState(scope: DataSourceComponent): Promise<boolean>;
    disableClientSideCrud(scope: DataSourceComponent): Promise<{
        inserted: number;
        updated: number;
        deleted: number;
    }>;
    /**
     * Disabilita la modalita CRUD locale senza sincronizzare modifiche pendenti verso server.
     * Pulisce solo la route corrente e le eventuali lookup route tracciate.
     * @param scope Datasource/scope operativo su cui applicare la logica.
     */
    disableClientSideCrudWithoutSync(scope: DataSourceComponent): Promise<void>;
    /**
     * Esporta in XLS passando al backend anche tema/mode UI correnti.
     * Il metodo deduce tema da DOM/stylesheet/localStorage, normalizza i token e li persiste (`wuic-selected-theme`, `wuic-theme-mode`).
     * @param route Route applicativa coinvolta nell'operazione.
     * @param filterInfo Filtro applicato alla selezione dati.
     * @param progressGuid GUID progresso per tracciamento export/lavorazione.
     */
    exportXls(route: any, filterInfo: any, progressGuid: any): Promise<any>;
    /**
     * Salva i dati richiesti dal flusso runtime del servizio.
     * @param payload Payload richiesta/risposta usato nel metodo.
     * @returns Valore restituito dal metodo (Promise<any>).
     */
    saveDashboard(payload: any): Promise<any>;
    /**
     * Carica i dati richiesti dal flusso runtime del servizio.
     * @param payload Payload richiesta/risposta usato nel metodo.
     * @returns Valore restituito dal metodo (Promise<any[]>).
     */
    loadDashboard(payload: any): Promise<any[]>;
    /**
     * Rimuove i dati target aggiornando lo stato del servizio.
     * @param payload Payload richiesta/risposta usato nel metodo.
     * @returns Valore restituito dal metodo (Promise<any>).
     */
    deleteDashboard(payload: any): Promise<any>;
    /**
     * Salva i dati richiesti dal flusso runtime del servizio.
     * @param payload Payload richiesta/risposta usato nel metodo.
     * @returns Valore restituito dal metodo (Promise<any>).
     */
    saveWorkflowGraph(payload: any): Promise<any>;
    /**
     * Carica i dati richiesti dal flusso runtime del servizio.
     * @param payload Payload richiesta/risposta usato nel metodo.
     * @returns Valore restituito dal metodo (Promise<any>).
     */
    loadWorkflowGraph(payload: any): Promise<any>;
    /**
     * Recupera la lista dei workflow graph disponibili delegando al provider metadata (`MetaService.getWorkflowGraphs`).
     * @param payload Payload richiesta/risposta usato nel metodo.
     * @returns Lista graph/metadata restituita dal backend.
     */
    getWorkflowGraphs(payload: any): Promise<any>;
    /**
     * Rinomina un workflow graph delegando al provider metadata.
     * @param payload Payload con identificativo grafo e nuovo nome.
     * @returns Esito backend del rename.
     */
    renameWorkflowGraph(payload: any): Promise<any>;
    /**
     * Rimuove i dati target aggiornando lo stato del servizio.
     * @param payload Payload richiesta/risposta usato nel metodo.
     * @returns Valore restituito dal metodo (Promise<any>).
     */
    deleteWorkflowGraph(payload: any): Promise<any>;
    /**
     * Carica i dati richiesti dal flusso runtime del servizio.
     * @returns Valore restituito dal metodo (Promise<any[]>).
     */
    loadAllDashboards(): Promise<any[]>;
    /**
     * Recupera dal backend classi CSS disponibili nei fogli indicati (`MetaService.getCssClassesFromSheets`).
     * @param sheetPaths Percorsi fogli CSS da elaborare.
     * @returns Elenco classi/style token individuati dal server.
     */
    getCssClassesFromSheets(sheetPaths: string[]): Promise<any[]>;
    /**
     * Persiste su file CSS le modifiche apportate in editor stili tramite provider metadata.
     * @param sheet Foglio CSS oggetto di lettura/scrittura.
     */
    writeChangesToCssFile(sheet: any): Promise<void>;
    static ɵfac: i0.ɵɵFactoryDeclaration<DataProviderService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<DataProviderService>;
}

declare class WtoolboxService {
    _http: HttpClient;
    private injector;
    /**
     * Route corrente del metadata-editor (contesto chiamante) usata dai suggest metadata quando
     * il record in edit non espone direttamente il nome route.
     */
    static metadataEditorContextRouteName: string;
    static appSettings: any;
    static myFunctions: any;
    static dialogService: DialogService;
    static messageNotificationService: MessageService;
    static confirmationService: ConfirmationService;
    static dataService: DataProviderService;
    static translationService: TranslationManagerService;
    static errorHandler: GlobalHandler;
    static http: HttpClient;
    private static injectorRef;
    private static readonly fallbackRouter;
    static isBusy: BehaviorSubject<boolean>;
    static menuUpdated: BehaviorSubject<boolean>;
    constructor(_http: HttpClient, injector: Injector);
    static get router(): {
        navigateByUrl: (url: string) => Promise<boolean>;
    };
    private static tr;
    /**
     * Salva nel runtime workflow il payload associato a uno specifico route node.
     * Wrapper statico verso `WorkflowRuntimeMetadataService.setRouteNodePayload`.
     * @param routeNodeId Identificativo nodo workflow.
     * @param payload Payload da associare al nodo.
     */
    static setWorkflowRouteNodePayload(routeNodeId: string, payload: any): void;
    /**
     * Recupera il payload runtime precedentemente associato a un route node workflow.
     * @param routeNodeId Identificativo nodo workflow.
     * @returns Payload nodo oppure `null`.
     */
    static getWorkflowRouteNodePayload(routeNodeId: string): any | null;
    /**
     * Restituisce i route node id collegati a una route (ed eventualmente a una action specifica).
     * @param route Route applicativa.
     * @param action Azione opzionale.
     * @returns Elenco id nodi compatibili.
     */
    static getWorkflowRouteNodeIds(route: string, action?: string): string[];
    /**
     * Pulisce il payload runtime di un singolo route node o di tutti i nodi se `routeNodeId` non e fornito.
     * @param routeNodeId Identificativo nodo workflow opzionale.
     */
    static clearWorkflowRouteNodePayload(routeNodeId?: string): void;
    static getWorkflowPreviousRouteNode(routeNodeId: string): {
        routeNodeId: string;
        route: string;
        action: string;
    } | null;
    static getWorkflowPreviousRouteNodeByRoute(route: string, action?: string): {
        routeNodeId: string;
        route: string;
        action: string;
    } | null;
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
    static safeAssign(target: any, propPath: string, parentConstructors: any[], value: any, nestedIndex?: number, async?: boolean): void;
    /**
     * Esegue merge profondo di oggetti plain: gli array vengono sostituiti, gli oggetti annidati vengono fusi ricorsivamente.
     * @param target Oggetto destinazione.
     * @param source Oggetto sorgente.
     * @returns Oggetto destinazione aggiornato.
     */
    static deepMerge(target: any, source: any): any;
    /**
     * Genera un UUID v4 client-side usando `crypto.getRandomValues`.
     * @returns UUID in formato canonico `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.
     */
    static uuidv4(): string;
    /**
     * Genera timestamp compatto locale nel formato `yyyyMMddHHmmss`.
     * @returns Stringa timestamp.
     */
    static getTimestamp(): string;
    /**
     * Mostra un dialog di conferma PrimeNG con etichette localizzate (`OK`/`Cancel`) e ritorna esito booleano.
     * @param payload Configurazione dialog conferma.
     * @returns `true` su accept, `false` su reject.
     */
    static confirm(payload: Confirmation): Promise<boolean>;
    /**
     * Incapsula uno script custom in un body Promise-safe con gestione errori standard (`isBusy` + `errorHandler`).
     * Usato per compilare callback dinamiche metadata mantenendo comportamento uniforme.
     * @param script Script utente da eseguire nel blocco `try`.
     * @param fallbackReturn Placeholder legacy mantenuto per compatibilita firma.
     * @returns Corpo funzione JavaScript pronto per `new Function(...)`.
     */
    static buildAsyncBody(script: string, fallbackReturn?: string): string;
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
    static promptDialog(title: string, fields: {
        name: string;
        caption: string;
        value?: any;
        type: string;
        tooltip?: string;
        required?: boolean;
        route?: {
            lookupRoute?: string;
            lookupValueField?: string;
            lookupDesField?: string;
            lookupFilter?: string;
        };
        dictionaryData?: {
            label: string;
            value: any;
            items?: any;
        }[];
        serverSide?: boolean;
        selectionChanged?: (record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna, metaInfo: MetaInfo, newValue: any, oldValue: any, wtoolbox: typeof WtoolboxService, nestedIndex?: number, nodes?: any[]) => void;
        propsBag?: any;
        hide?: boolean;
    }[], width?: string, height?: string, customValidation?: any): Promise<any>;
    private static openPromptDialogFallback;
    private static resolveDialogServiceFromInjector;
    private static resolveInjectorRef;
    private static normalizePromptDialogPosition;
    static safeStringify: (obj: any, replacer: (key: any, value: any) => any) => string;
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
    static createHierarchicalDataModel(data: any, pKeyName: any, parentKeyName: any, flattenedTreeDataSource: any, addCallback?: any, nullParentValue?: any): any[];
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
    static trasverseDataModel(data: any, el: any, pKeyName: any, parentKeyName: any, hdata: any, flattenedTreeDataSource: any, nestingProp: string, currentParents: number[], addCallback?: any): void;
    /**
     * Converte un record con campi reactive (`BehaviorSubject`) in oggetto plain prendendo il valore corrente di ogni campo.
     * @param entity Entita da "spacchettare".
     * @returns Entita plain serializzabile.
     */
    static unwrapEntity(entity: any): {};
    static suggestions: {
        /**
         * Richiama `MetaService.suggestBeforeTriggers` e inserisce nel campo target uno script
         * "before save" di esempio (debug/commenti su colonne reali + `commit()` finale).
         * @param md_id Id tabella usato nella request (`id_tabella`).
         * @param record Record metadata corrente.
         * @param field Campo che riceve lo script generato (`field.mc_nome_colonna`).
         */
        suggestBeforeSave(md_id: number, record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Richiama `MetaService.suggestAfterTriggers` e popola il campo con boilerplate
         * "after save" (controllo record nuovo + esempi di uso valori/lookup delle prime colonne).
         * @param md_id Id tabella usato nella request (`id_tabella`).
         * @param record Record metadata corrente.
         * @param field Campo che riceve lo script generato.
         */
        suggestAfterSave(md_id: number, record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Ottiene da `MetaService.suggestDetails` la definizione relazioni master/detail in formato
         * `route||lookupDataValueField||lookupField||descrizione||` (entry separate da virgola).
         * @param md_id Id tabella usato nella request (`id_tabella`).
         * @param record Record metadata corrente.
         * @param field Campo metadata che salva la stringa di dettaglio.
         */
        suggestDetails(md_id: number, record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Richiede a `MetaService.suggestFilters` un filtro esempio costruito sui campi della route
         * (es. `campo||eq||1\\campo2||contains||prova`) e lo scrive nel campo metadata selezionato.
         * @param route Route di cui generare il filtro.
         * @param record Record metadata corrente.
         * @param field Campo metadata destinazione filtro.
         */
        suggestFilters(route: string, record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Usa `MetaService.suggestAfterLoad` per generare callback post-load; il template server
         * imposta il record corrente al primo elemento (`dataSource.setCurrent(dataSource.resultInfo[0])`).
         * @param md_id Id tabella usato nella request (`id_tabella`).
         * @param record Record metadata corrente.
         * @param field Campo che riceve il callback.
         */
        suggestAfterLoad(md_id: number, record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Richiama `MetaService.suggestJoinOverride` che costruisce una SELECT dinamica (FROM/JOIN/FIELD)
         * dai metadati della route; la query risultante viene salvata nel campo metadata corrente.
         * @param route Route di cui proporre la query `md_custom_join`.
         * @param record Record metadata corrente.
         * @param field Campo target per la query SQL generata.
         */
        suggestJoinOverride(route: string, record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Richiede a `MetaService.suggestConditionalGridTemplate` una coppia `[cssClass, condizione]`.
         * Aggiorna due metadati: `field.mc_nome_colonna` con la formula condizione e
         * `md_ui_grid_conditional_template` con la classe CSS suggerita.
         * @param route Route tabella da cui derivare condizione e classe.
         * @param record Record metadata corrente.
         * @param field Campo formula da valorizzare con `res[1]`.
         */
        suggestConditionalGridTemplate(route: string, record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Genera template Angular edit/detail via `MetaService.suggestEditTemplate`.
         * Determina automaticamente `targetField` (`md_edit_template` o `md_detail_template`),
         * passa `md_tab_edit` come `isTabEdit` e salva il markup ritornato nel campo destinazione.
         * @param route Route (fallback `record['md_route_name']`).
         * @param record Record metadata corrente.
         * @param field Campo da aggiornare; se assente usa i campi standard edit/detail.
         * @param editDetail Forza il tipo template richiesto (`'edit'` o `'detail'`).
         */
        suggestEditTemplate(route: string, record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna, editDetail?: "edit" | "detail"): Promise<void>;
        /**
         * Wrapper di `suggestEditTemplate(..., 'detail')`: genera esplicitamente il template dettaglio.
         * @param route Route tabella.
         * @param record Record metadata corrente.
         * @param field Campo target del template.
         */
        suggestDetailTemplate(route: string, record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Richiede `MetaService.suggestGridRowtemplate` e popola il campo con HTML riga griglia:
         * colonne visibili, bottoni azione, editor inline e renderer speciali (upload/color/default).
         * @param route Route tabella.
         * @param record Record metadata corrente.
         * @param field Campo metadata che contiene il template riga.
         */
        suggestGridRowtemplate(route: string, record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Mostra selettore colonne (`MetaService.getColonneByUserID`) e scrive nel campo target
         * il `mc_nome_colonna` scelto; opzionalmente filtra per tipo editor (`type` contenuto in `mc_ui_column_type`).
         * @param record Record metadata corrente.
         * @param field Campo metadata in cui salvare il nome colonna selezionato.
         * @param type Filtro tipologia colonna (match su `mc_ui_column_type`).
         * @param routeRef Nome campo record che contiene la route (default `md_route_name`).
         */
        suggestColumnMD(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna, type: string, routeRef?: string): Promise<void>;
        /**
         * Costruisce formula computed partendo da gerarchia lookup: apre albero da
         * `MetaService.getLookupListByIDLevelUP` e invia la selezione a `getClauseByLookupHierarchy`
         * con `appendOnly=1` (formula `CONCAT(...)` pronta per `mc_ui_computed_formula`).
         * @param record Record metadata corrente.
         * @param field Campo formula da aggiornare.
         */
        suggestComputedFormula(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Richiama `MetaService.getSeletClauseByLookupHierarchy` per tradurre la selezione gerarchica lookup
         * in una clausola SQL/lookup pronta da salvare nel campo metadata corrente.
         * @param model Modello dati su cui effettuare la risoluzione.
         * @param record Record corrente usato dalla logica/metadati.
         * @param field Metadato colonna/campo coinvolto nell'elaborazione.
         * @param appendOnly Modalita append dei filtri gerarchici.
         */
        getClauseByLookupHierarchy(model: any[], record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna, appendOnly: 0 | 1 | 2): Promise<void>;
        /**
         * A partire da un nodo lookup selezionato aggiunge ricorsivamente in `arr` le tabelle parent richieste (`parentKeys`).
         * Serve alla selezione gerarchica dei lookup per includere automaticamente i parent necessari alla formula SQL finale.
         * @param newValue Nodo selezionato che contiene `parentKeys`.
         * @param arr Accumulatore della selezione estesa (nodi originali + parent trovati).
         * @param nodes Albero nodi corrente su cui cercare i parent.
         */
        checkParentTables(newValue: any, arr: any, nodes: any): void;
        /**
         * Carica la gerarchia lookup per route (`MetaService.getLookupListByRoute`), apre il selettore tree
         * e aggiorna il campo con la clausola risultante includendo i parent necessari.
         * @param record Record corrente usato dalla logica/metadati.
         * @param field Metadato colonna/campo coinvolto nell'elaborazione.
         */
        getLookupListByRoute(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Chiede `MetaService.suggestDefaultValue` e salva un valore default coerente con il tipo colonna
         * (es. `10`, `true`, data ISO, `<put_dictionary_value_here>`, `stringa`).
         * @param record Record metadata corrente (usa `mc_id`).
         * @param field Campo che riceve il valore default suggerito.
         */
        suggestDefaultValue(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Chiede `MetaService.suggestDefaultValueCallback` e salva un callback JS tipo
         * `record.<campo> = <sample>;`, con sample variabile in base a `mc_ui_column_type`.
         * @param record Record metadata corrente (usa `mc_id`).
         * @param field Campo callback da valorizzare.
         */
        suggestDefaultValueCallback(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Genera `action_callback`/`mc_button_callback` usando `MetaService.suggestTableActionCallback`.
         * Legge il tipo azione da `md_action_type` (o fallback `mc_button_action_type`).
         * Case server supportati: `0` navigation, `1` method.call, `2` generate.file,
         * `3` export, `4` call.stored, `5` approve, `6` parametric.dialog,
         * `7` client sync, `8` client async, `9` show route payload.
         * Lato client questo metodo apre dialog dedicati per `0`, `1`, `3`; per gli altri
         * passa il payload base e delega la generazione finale al branch server corrispondente.
         * @param record Record metadata corrente.
         * @param field Campo callback da aggiornare.
         */
        suggestTableActionCallback(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Ottiene da `MetaService.suggestSelectionChangedCallback` un callback che usa
         * `newValue/oldValue` e aggiorna un campo compatibile della stessa tabella.
         * @param record Record metadata corrente (usa `mc_id`).
         * @param field Campo callback destinazione.
         */
        suggestSelectionChangedCallback(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Richiede `MetaService.suggestSuggest` e salva callback "suggest value" che,
         * se il campo Ã¨ vuoto, imposta un valore iniziale coerente col tipo colonna.
         * @param record Record metadata corrente (usa `mc_id`).
         * @param field Campo callback da valorizzare.
         */
        suggestSuggestValueCallback(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Richiede `MetaService.suggestGridColumnDataTemplate` e imposta template cella grid:
         * upload con preview/link, color swatch per `color`, fallback testo formattato per altri tipi.
         * @param record Record metadata corrente (usa `mc_id`).
         * @param field Campo template da aggiornare.
         */
        suggestGridColumnDataTemplate(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Chiede `MetaService.suggestConditionalCellTemplate` e distribuisce il risultato `[classe, condizione]`
         * su tre metadati cella: `mc_ui_grid_conditional_template_class`,
         * `mc_ui_grid_conditional_alt_template_class`, `mc_ui_grid_conditional_template_condition`.
         * @param record Record metadata corrente (usa `mc_id`).
         * @param field Campo corrente (non usato per il write diretto in questo metodo).
         */
        suggestConditionalCellTemplate(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Richiede `MetaService.suggestCustomValidation` e salva uno script validazione:
         * il template server cambia per tipo colonna (numero/data/boolean/testo) e imposta `vr.isValid`.
         * @param record Record metadata corrente (usa `mc_id`).
         * @param field Campo callback validazione da valorizzare.
         */
        suggestCustomValidation(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Clona configurazione lookup da una colonna esistente proposta da `MetaService.suggestLookup2`.
         * Dopo selezione utente copia nel record corrente i principali metadati lookup:
         * entitÃ , text/value field, filtri, computed text, permessi edit/insert, navigation,
         * `mc_custom_join`, `mc_serverside_operations`, paging e display string.
         * @param record Record metadata corrente (usa `mc_id`).
         * @param field Campo invocante (usato per contesto, non come unica destinazione).
         */
        suggestLookup(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Genera filtro default per lookup via `MetaService.suggestLookupDefaultFilter`
         * (internamente delega ai filtri della `mc_ui_lookup_entity_name` associata).
         * @param record Record metadata corrente (usa `mc_id`).
         * @param field Campo filtro lookup da aggiornare.
         */
        suggestLookupDefaultFilter(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Assistente visuale per `md_props_bag`: propone albero di chiavi standard (archetypes/map/chart/carousel,
         * groupInfo, aggregates, cloneDefinition, ecc.), mantiene i parent necessari e salva JSON
         * contenente solo i rami selezionati.
         * @param record Record metadata corrente.
         * @param field Campo `md_props_bag` target.
         */
        suggestTablePropsBag(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Assistente visuale per `mc_props_bag`: propone chiavi colonna (form/style/lookup/customEditorConfig/uploader),
         * permette selezione ad albero e salva JSON minimo con i soli path scelti.
         * @param record Record metadata corrente.
         * @param field Campo `mc_props_bag` target.
         */
        suggestColumnPropsBag(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
        /**
         * Carica la gerarchia lookup per ID (`MetaService.getLookupListByIDLevelUP`) e apre il selettore tree
         * per comporre automaticamente la formula/lookup da applicare al campo metadata.
         * @param record Record corrente usato dalla logica/metadati.
         * @param field Metadato colonna/campo coinvolto nell'elaborazione.
         */
        getLookupListByID(record: {
            [key: string]: BehaviorSubject<any>;
        }, field: MetadatiColonna): Promise<void>;
    };
    static metadataFunctions: any;
    static ɵfac: i0.ɵɵFactoryDeclaration<WtoolboxService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<WtoolboxService>;
}

declare class MetadatiUiStiliColonna {
    __user_id: number;
    musc_id: number;
    musc_attribute_name: string;
    musc_attribute_value: string;
    musc_attribute_value_callback: string;
    constructor();
}

declare class MetadatiUtentiAutorizzazioniColonna {
    __user_id: number;
    muac_id: number;
    mc_id: number;
    muac_editable: boolean;
    muac_validation_required: boolean;
    ruolo_id: number;
    utente_id: number;
    constructor();
}

declare class ValidationRule {
    column: MetadatiColonna;
    field: string;
    type: string;
    message: string;
    validationCallback?: Function;
    isValid: boolean;
    constructor();
}

declare class EditorOptions {
    theme: string;
    language: 'json' | 'typescript' | 'sql' | 'csharp' | 'html';
    contextMenuItems: any[];
    model?: any;
    onInit?: any;
    onNodeClick?: any;
    onNodeDragStart?: any;
    onNodeDragEnd?: any;
    onDropIntoEditor?: any;
    constructor(theme: string, language: 'json' | 'typescript' | 'sql' | 'csharp' | 'html');
}

declare class MetadatiColonna {
    __user_id: number;
    mc_id: number;
    mc_real_column_name: string;
    mc_nome_colonna: string;
    ang_name: string;
    mc_db_column_type: string;
    mc_is_primary_key: boolean;
    mc_ui_size_width: string;
    mc_ui_size_height: string;
    mc_display_string_in_edit: string;
    mc_display_string_in_view: string;
    mc_ui_column_type: 'text' | 'txt_area' | 'number' | 'number_boolean' | 'date' | 'datetime' | 'boolean' | 'lookupByID' | 'multiple_check' | 'point' | 'button' | 'code_editor' | 'dictionary' | 'dictionary_radio' | 'html_area' | 'upload' | 'color' | 'polygon' | 'tree' | string;
    mc_ordine: number;
    mc_hide_in_list: boolean;
    mc_hide_in_edit: boolean;
    mc_hide_in_detail: boolean;
    hide_in_import: boolean;
    mc_hide_in_service: boolean;
    mc_show_in_filters: boolean;
    mc_is_range_filter: boolean;
    mc_default_value: string;
    mc_is_multicheck_filter: boolean;
    mc_ui_grid_size_width: string;
    mc_is_db_computed: boolean;
    mc_logic_editable: boolean;
    mc_logic_nullable: boolean;
    mc_default_value_callback: string;
    mc_selection_changing_custom_function: string;
    mc_selection_changed_custom_function: string;
    mc_suggest_value_callback: string;
    mc_ui_grid_conditional_template_class: string;
    mc_ui_grid_conditional_alt_template_class: string;
    mc_ui_grid_conditional_template_condition: string;
    mc_ui_grid_column_data_template: string;
    mc_dictionary_value: string;
    mc_aggregation: string;
    mc_is_computed: boolean;
    mc_computed_formula: string;
    mc_computed_client_formula: string;
    convert_null_to_string: string;
    mc_max_length: string;
    mc_grant_by_default: boolean;
    mc_edit_associated_tab: string;
    mc_auto_uppercase: boolean;
    mc_is_logic_delete_key: boolean;
    mc_tooltip: string;
    mc_validation_has: boolean;
    mc_validation_required: boolean;
    mc_validation_message: string;
    mc_validation_type: string;
    mc_validation_pattern: string;
    mc_validation_max_length: string;
    mc_validation_min_length: string;
    mc_validation_pattern_message: string;
    mc_validation_max_length_message: string;
    mc_validation_min_length_message: string;
    mc_validation_type_message: string;
    mc_validation_custom_callback: string;
    mc_logic_converter_has: boolean;
    mc_logic_converter_read_callback: string;
    mc_logic_converter_write_callback: string;
    mc_default_sort: string;
    mc_default_multisort_order: number;
    mc_hide_in_export: boolean;
    mc_disable_sorting: boolean;
    mc_ui_is_password: boolean;
    mc_password_encription_method: string;
    mc_custom_join: string;
    mc_ui_lookup_filter: string;
    mc_ui_lookup_dataValueField: string;
    mc_ui_lookup_dataTextField: string;
    mc_ui_lookup_entity_name: string;
    mc_serverside_operations: boolean;
    mc_ui_pagesize: number;
    mc_ui_lookup_computed_dataTextField: string;
    mc_ui_lookup_combo_text_edit_computed_dataTextField: string;
    mc_logic_allow_navigation: boolean;
    mc_logic_navigate_new_window: boolean;
    mc_ui_lookup_edit_allow: boolean;
    mc_ui_lookup_insert_allow: boolean;
    mc_ui_lookup_search_grid: boolean;
    mc_custom_select_clause: string;
    mc_ui_slider_min?: number;
    mc_ui_slider_max?: number;
    mc_ui_slider_format: string;
    mc_ui_slider_decimals: number;
    mc_ui_slider_smallstep: number;
    mc_ui_slider_largestep: number;
    mc_ui_grid_is_multiple_check: boolean;
    mc_ui_grid_related_id_field: string;
    mc_ui_grid_display_field: string;
    mc_ui_grid_manytomany_route: string;
    mc_ui_grid_route: string;
    mc_ui_grid_manytomany_local_id_field: string;
    mc_ui_grid_manytomany_related_id_field: string;
    mc_ui_grid_local_id_field: string;
    isImageUpload: boolean;
    isDBUpload: boolean;
    upload_secure: boolean;
    isMultipleUpload: boolean;
    IsZippedUpload: boolean;
    UseRouteNameAsSubfolder: boolean;
    UseRecordIDAsSubfolder: boolean;
    key_field_name: string;
    DefaultUploadRootPath: string;
    MultipleUploadTableRoute: string;
    MultipleUploadBlobFieldName: string;
    MultipleUploadBlobThumbFieldName: string;
    MultipleUploadFilePathFieldName: string;
    MultipleUploadFileTitleFieldName: string;
    MultipleUploadFileNameFieldName: string;
    MultipleUploadFileSizeFieldName: string;
    MultipleUploadFileTypeFieldName: string;
    MultipleUploadFileIconPathFieldName: string;
    MultipleUploadFKey: string;
    AllowWebCamShot: boolean;
    AllowWebCamVideo: boolean;
    createThumb: boolean;
    thumbWidth: number;
    thumbHeight: number;
    customUploadHandlerPath: string;
    uploadsecure: boolean;
    mc_button_caption: string;
    mc_button_action: string;
    mc_button_confirm_message: string;
    mc_button_executed_message: string;
    mc_button_tooltip: string;
    mc_button_template: string;
    mc_button_image: string;
    mc_button_visibility_condition: string;
    mc_button_action_type: number;
    mc_logic_cascade_isMember: boolean;
    mc_logic_cascade_childToReset: string;
    mc_logic_cascade_filteringParent: string;
    mc_filter_disable_operator: string;
    mc_filter_hide_operator: boolean;
    mc_editable_insert_only: string;
    _Metadati_UI_Stili_Colonnes: MetadatiUiStiliColonna[];
    _Metadati_Utenti_Autorizzazioni_Colonnes: MetadatiUtentiAutorizzazioniColonna[];
    mc_custom_edit_cell_template: string;
    mc_filter_hierarchy: boolean;
    cssPaths: string;
    snippetsTemplate: string;
    container_class: string;
    useHtmlAspxEditor: boolean;
    allowed_file_types: string;
    max_file_size: number;
    mc_value_change_trigger_event: string;
    mc_syntax_builder: string;
    use_slider_in_edit: boolean;
    use_gauge_in_view: boolean;
    use_chart_in_view: boolean;
    hide_value_in_view: boolean;
    mc_chart_label_template: string;
    mc_chart_ranges: string;
    mc_chart_select: string;
    mc_props_bag: string;
    extras: {
        parameters: any[];
        form: {
            columns?: number;
            disabled?: boolean;
        };
        style: {
            editCss: string;
        };
        checkUniqueValue: string;
        lookup: any;
        customEditorConfig: {
            editorOptions: EditorOptions;
            compilerOptions?: any;
            schemas?: any[];
            codeContext?: string;
            extraLibs?: string[];
            routeContextField?: string;
            columnContextField?: string;
        };
        uploader: {
            beforeUpload: string | Function;
        };
    };
    hideSelectAllCheck: boolean;
    jsonEditor: string;
    afterUpload: string;
    logic_disabled: boolean;
    _Metadati_Tabelle: MetadatiTabella;
    isOut: any;
    $$currentOperator?: {
        name: string;
        caption: string;
    };
    mc_ui_filter_size_width: string;
    validationsRules: ValidationRule[];
    extraFields: any;
    mc_button_action__fn: (datasource: any, record: {
        [key: string]: BehaviorSubject<any>;
    }, event: any, field: MetadatiColonna, wtoolbox: typeof WtoolboxService) => void;
    mc_selection_changed_custom_function__fn: (record: {
        [key: string]: BehaviorSubject<any>;
    }, field: MetadatiColonna, metaInfo: MetaInfo, newValue: any, oldValue: any, wtoolbox: typeof WtoolboxService, nestedIndex?: number, nodes?: any[]) => void;
    mc_selection_changing_custom_function__fn: (record: {
        [key: string]: BehaviorSubject<any>;
    }, field: MetadatiColonna, metaInfo: MetaInfo, newValue: any, oldValue: any, event: any, wtoolbox: typeof WtoolboxService) => void;
    mc_default_value_callback__fn: (record: {
        [key: string]: BehaviorSubject<any>;
    }, field: MetadatiColonna, metaInfo: MetaInfo, wtoolbox: typeof WtoolboxService) => any;
    mc_suggest_value_callback__fn: (record: {
        [key: string]: BehaviorSubject<any>;
    }, field: MetadatiColonna, metaInfo: MetaInfo, wtoolbox: typeof WtoolboxService) => string;
    mc_validation_custom_callback__fn: (record: {
        [key: string]: BehaviorSubject<any>;
    }, field: MetadatiColonna, vr: ValidationRule, wtoolbox: typeof WtoolboxService) => boolean;
    editor: BehaviorSubject<IFieldEditor>;
    codeEditing: boolean;
    propConstructor: any;
    propPath: string;
    constructor(name: string);
    static clone(col: MetadatiColonna): MetadatiColonna;
    static formatGridViewValue(metaColumn: MetadatiColonna, recordObj: any): any;
    private static evaluateGridColumnDataTemplate;
    static validateField(value: any, vr: ValidationRule, record: {
        [key: string]: BehaviorSubject<any>;
    }, field: MetadatiColonna): Promise<void>;
}

declare class LazyDataSourceComponent implements OnInit {
    /**
     * Input dal componente padre per route; usata nella configurazione e nel rendering del componente.
     */
    route: BehaviorSubject<string>;
    /**
     * Input dal componente padre per route from routing; usata nella configurazione e nel rendering del componente.
     */
    routeFromRouting: boolean;
    /**
     * Input dal componente padre per hardcoded route; usata nella configurazione e nel rendering del componente.
     */
    hardcodedRoute: string;
    /**
     * Input dal componente padre per autoload; usata nella configurazione e nel rendering del componente.
     */
    autoload?: boolean;
    /**
     * Input dal componente padre per loading; usata nella configurazione e nel rendering del componente.
     */
    loading: BehaviorSubject<boolean>;
    /**
     * Input dal componente padre per change tracking; usata nella configurazione e nel rendering del componente.
     */
    changeTracking?: boolean;
    /**
     * Input dal componente padre per parent record; usata nella configurazione e nel rendering del componente.
     */
    parentRecord: any;
    /**
     * Input dal componente padre per parent meta info; usata nella configurazione e nel rendering del componente.
     */
    parentMetaInfo: MetaInfo;
    /**
     * Input dal componente padre per parent datasource; usata nella configurazione e nel rendering del componente.
     */
    parentDatasource: any;
    /**
     * Input dal componente padre per component ref; usata nella configurazione e nel rendering del componente.
     */
    componentRef: BehaviorSubject<{
        component: any;
        id: number;
        name: string;
        uniqueName: string;
    }>;
    /**
     * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
     */
    loadedComponent: any;
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): Promise<void>;
    /**
     * Costruisce l'oggetto `inputs` passato al `NgComponentOutlet`, inoltrando al componente reale tutti i binding ricevuti dal wrapper lazy.
     * @returns Mappa `nomeInput -> valore` usata per istanziare `DataSourceComponent` in modalità lazy.
     */
    componentInputs(): {
        route: BehaviorSubject<string>;
        routeFromRouting: boolean;
        hardcodedRoute: string;
        autoload: boolean;
        loading: BehaviorSubject<boolean>;
        changeTracking: boolean;
        parentRecord: any;
        parentMetaInfo: MetaInfo;
        parentDatasource: any;
        componentRef: BehaviorSubject<{
            component: any;
            id: number;
            name: string;
            uniqueName: string;
        }>;
    };
    static ɵfac: i0.ɵɵFactoryDeclaration<LazyDataSourceComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<LazyDataSourceComponent, "wuic-data-source-lazy", never, { "route": { "alias": "route"; "required": false; }; "routeFromRouting": { "alias": "routeFromRouting"; "required": false; }; "hardcodedRoute": { "alias": "hardcodedRoute"; "required": false; }; "autoload": { "alias": "autoload"; "required": false; }; "loading": { "alias": "loading"; "required": false; }; "changeTracking": { "alias": "changeTracking"; "required": false; }; "parentRecord": { "alias": "parentRecord"; "required": false; }; "parentMetaInfo": { "alias": "parentMetaInfo"; "required": false; }; "parentDatasource": { "alias": "parentDatasource"; "required": false; }; "componentRef": { "alias": "componentRef"; "required": false; }; }, {}, never, never, true, never>;
}

interface ListGridSavedState {
    id: string;
    name: string;
    description: string;
    isDefault: boolean;
    createdAt: string;
    filterInfo: any;
    sortInfo: any[];
    pageInfo: {
        currentPage: number;
        pageSize: number;
    };
    columnWidths: {
        [field: string]: number;
    };
}
interface ReportVariableInput {
    name: string;
    alias: string;
    value: string;
    type?: string;
}
interface GridPendingChangeItem {
    id: string;
    change: TrackedChange;
    label: string;
    details: string;
    selected: boolean;
}
declare class ListGridComponent implements AfterViewInit, OnInit, OnDestroy {
    private metaSrv;
    private sanitizer;
    private route;
    private router;
    private location;
    private titleService;
    private trslSrv;
    private cd;
    userInfo: UserInfoService;
    /**
     * Identificativo tecnico per grid view states settings key, usato in matching, lookup o routing interno.
     */
    private static readonly GRID_VIEW_STATES_SETTINGS_KEY;
    /**
     * Identificativo tecnico per grid column layout settings key, usato in matching, lookup o routing interno.
     */
    private static readonly GRID_COLUMN_LAYOUT_SETTINGS_KEY;
    /**
     * Proprieta di stato del componente per select button guard installed, usata dalla logica interna e dal template.
     */
    private static selectButtonGuardInstalled;
    /**
     * Input dal componente padre per hardcoded route; usata nella configurazione e nel rendering del componente.
     */
    hardcodedRoute: string;
    /**
     * Input dal componente padre per parent record; usata nella configurazione e nel rendering del componente.
     */
    parentRecord: any;
    /**
     * Input dal componente padre per parent meta info; usata nella configurazione e nel rendering del componente.
     */
    parentMetaInfo: MetaInfo;
    /**
     * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
     */
    datasource: BehaviorSubject<DataSourceComponent>;
    /**
     * Input dal componente padre per hardcoded datasource; usata nella configurazione e nel rendering del componente.
     */
    hardcodedDatasource: DataSourceComponent;
    /**
     * Input dal componente padre per row custom select; usata nella configurazione e nel rendering del componente.
     */
    rowCustomSelect: (rowData: any, $event: any, dt: Table) => void;
    /**
     * Input dal componente padre per hide toolbar; quando true nasconde la caption toolbar della griglia.
     */
    hideToolbar: boolean;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per table.
     */
    table: Table;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per column ctx menu.
     */
    columnCtxMenu: ContextMenu;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per metadata columns datasource.
     */
    metadataColumnsDatasource: DataSourceComponent;
    /**
     * Collezione dati per records, consumata dal rendering e dalle operazioni del componente.
     */
    records: any[];
    /**
     * Collezione dati per cols, consumata dal rendering e dalle operazioni del componente.
     */
    cols: any[];
    /**
     * Collezione dati per metas, consumata dal rendering e dalle operazioni del componente.
     */
    metas: MetadatiColonna[];
    /**
     * Metadati completi della route corrente (tabella, colonne, regole) usati per costruire UI e logica runtime.
     */
    metaInfo: MetaInfo;
    /**
     * Proprieta di stato del componente per route name, usata dalla logica interna e dal template.
     */
    routeName: string;
    /**
     * Proprieta di stato del componente per action name, usata dalla logica interna e dal template.
     */
    actionName: string;
    /**
     * Proprieta di stato del componente per total records, usata dalla logica interna e dal template.
     */
    totalRecords: number;
    /**
     * Proprieta di stato del componente per page size, usata dalla logica interna e dal template.
     */
    pageSize: number;
    /**
     * Proprieta di stato del componente per row number, usata dalla logica interna e dal template.
     */
    rowNumber: number;
    /**
     * Proprieta di stato del componente per order column, usata dalla logica interna e dal template.
     */
    orderColumn: string;
    /**
     * Proprieta di stato del componente per order dir, usata dalla logica interna e dal template.
     */
    orderDir: 'asc' | 'desc';
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a loading.
     */
    loading: BehaviorSubject<boolean>;
    /**
     * Indice corrente per page index, usato per posizionamento o navigazione nel componente.
     */
    pageIndex: number;
    /**
     * Collezione dati per global filter fields, consumata dal rendering e dalle operazioni del componente.
     */
    globalFilterFields: string[];
    /**
     * Proprieta di stato del componente per search value, usata dalla logica interna e dal template.
     */
    searchValue: string;
    /**
     * Configurazione di presentazione per row template, usata nel rendering del componente.
     */
    rowTemplate: any;
    /**
     * Valore corrente selezionato per selected items, usato dai flussi interattivi del componente.
     */
    selectedItems: any[];
    /**
     * Collezione dati per expanded rows, consumata dal rendering e dalle operazioni del componente.
     */
    expandedRows: {};
    /**
     * Collezione dati per aggregates, consumata dal rendering e dalle operazioni del componente.
     */
    aggregates: any[];
    /**
     * Proprieta di stato del componente per sync filter info query timer, usata dalla logica interna e dal template.
     */
    private syncFilterInfoQueryTimer;
    /**
     * Proprieta di stato del componente per sync grid state query timer, usata dalla logica interna e dal template.
     */
    private syncGridStateQueryTimer;
    /**
     * Proprieta di stato del componente per suppress grid state url push, usata dalla logica interna e dal template.
     */
    private suppressGridStateUrlPush;
    /**
     * Proprieta di stato del componente per release grid state url push timer, usata dalla logica interna e dal template.
     */
    private releaseGridStateUrlPushTimer;
    /**
     * Proprieta di stato del componente per navigation triggered by popstate, usata dalla logica interna e dal template.
     */
    private navigationTriggeredByPopstate;
    /**
     * Proprieta di stato del componente per suppress next page only query sync, usata dalla logica interna e dal template.
     */
    private suppressNextPageOnlyQuerySync;
    /**
     * Proprieta di stato del componente per client side crud toggle busy, usata dalla logica interna e dal template.
     */
    clientSideCrudToggleBusy: boolean;
    /**
     * Proprieta di stato del componente per persisted column widths by route, usata dalla logica interna e dal template.
     */
    private persistedColumnWidthsByRoute;
    /**
     * Proprieta di stato del componente per persisted column layout by route, usata dalla logica interna e dal template.
     */
    private persistedColumnLayoutByRoute;
    /**
     * Proprieta di stato del componente per remote column layout hydration in flight, usata dalla logica interna e dal template.
     */
    private remoteColumnLayoutHydrationInFlight;
    /**
     * Collezione dati per persisted grid states by route, consumata dal rendering e dalle operazioni del componente.
     */
    private persistedGridStatesByRoute;
    /**
     * Proprieta di stato del componente per remote grid states hydration in flight, usata dalla logica interna e dal template.
     */
    private remoteGridStatesHydrationInFlight;
    /**
     * Valore corrente selezionato per current route saved states, usato dai flussi interattivi del componente.
     */
    currentRouteSavedStates: ListGridSavedState[];
    /**
     * Valore corrente selezionato per selected saved state id, usato dai flussi interattivi del componente.
     */
    selectedSavedStateId: string;
    /**
     * Proprieta di stato del componente per applying saved state, usata dalla logica interna e dal template.
     */
    private applyingSavedState;
    /**
     * Identificativo tecnico per new grid state option id, usato in matching, lookup o routing interno.
     */
    readonly NEW_GRID_STATE_OPTION_ID = "__new__";
    /**
     * Proprieta di stato del componente per save grid state dialog visible, usata dalla logica interna e dal template.
     */
    saveGridStateDialogVisible: boolean;
    /**
     * Valore corrente selezionato per save grid state dialog selected id, usato dai flussi interattivi del componente.
     */
    saveGridStateDialogSelectedId: string;
    /**
     * Proprieta di stato del componente per save grid state dialog new name, usata dalla logica interna e dal template.
     */
    saveGridStateDialogNewName: string;
    /**
     * Proprieta di stato del componente per save grid state dialog set as default, usata dalla logica interna e dal template.
     */
    saveGridStateDialogSetAsDefault: boolean;
    /**
     * Collezione dati per save state menu items, consumata dal rendering e dalle operazioni del componente.
     */
    saveStateMenuItems: MenuItem[];
    /**
     * Collezione dati per clear filters menu items, consumata dal rendering e dalle operazioni del componente.
     */
    clearFiltersMenuItems: MenuItem[];
    /**
     * Collezione dati per column context menu items, consumata dal rendering e dalle operazioni del componente.
     */
    columnContextMenuItems: MenuItem[];
    /**
     * Valore corrente selezionato per selected column for context menu, usato dai flussi interattivi del componente.
     */
    selectedColumnForContextMenu?: MetadatiColonna;
    /**
     * Collezione dati per available reports, consumata dal rendering e dalle operazioni del componente.
     */
    availableReports: {
        path: string;
        name: string;
    }[];
    /**
     * Collezione dati per report menu items, consumata dal rendering e dalle operazioni del componente.
     */
    reportMenuItems: MenuItem[];
    /**
     * Collezione dati per table action menu items, consumata dal rendering e dalle operazioni del componente.
     */
    tableActionMenuItems: MenuItem[];
    /**
     * Proprieta di stato del componente per report variable dialog visible, usata dalla logica interna e dal template.
     */
    reportVariableDialogVisible: boolean;
    /**
     * Proprieta di stato del componente per report variable dialog loading, usata dalla logica interna e dal template.
     */
    reportVariableDialogLoading: boolean;
    /**
     * Valore corrente selezionato per selected report name for variables, usato dai flussi interattivi del componente.
     */
    selectedReportNameForVariables: string;
    /**
     * Valore corrente selezionato per selected report variables, usato dai flussi interattivi del componente.
     */
    selectedReportVariables: ReportVariableInput[];
    /**
     * Proprieta di stato del componente per column layout dialog visible, usata dalla logica interna e dal template.
     */
    columnLayoutDialogVisible: boolean;
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a column layout draft.
     */
    columnLayoutDraft: {
        field: string;
        header: string;
        visible: boolean;
    }[];
    /**
     * Proprieta di stato del componente per changes dialog visible, usata dalla logica interna e dal template.
     */
    changesDialogVisible: boolean;
    /**
     * Proprieta di stato del componente per changes dialog busy, usata dalla logica interna e dal template.
     */
    changesDialogBusy: boolean;
    /**
     * Collezione dati per pending change items, consumata dal rendering e dalle operazioni del componente.
     */
    pendingChangeItems: GridPendingChangeItem[];
    /**
     * Proprieta di stato del componente per pending preferred state auto apply, usata dalla logica interna e dal template.
     */
    private pendingPreferredStateAutoApply;
    /**
     * Proprieta di stato del componente per query param subscription, usata dalla logica interna e dal template.
     */
    private queryParamSubscription?;
    /**
     * Proprieta di stato del componente per router events subscription, usata dalla logica interna e dal template.
     */
    private routerEventsSubscription?;
    /**
     * Proprieta di stato del componente per datasource ready subscription, usata dalla logica interna e dal template.
     */
    private datasourceReadySubscription?;
    /**
     * Proprieta di stato del componente per fetch info subscription, usata dalla logica interna e dal template.
     */
    private fetchInfoSubscription?;
    /**
     * Proprieta di stato del componente per width defined, usata dalla logica interna e dal template.
     */
    width_defined: string;
    /**
     * Proprieta di stato del componente per metadati colonna, usata dalla logica interna e dal template.
     */
    MetadatiColonna: typeof MetadatiColonna;
    /**
     * function Object() { [native code] }
     * @param metaSrv Metadati correnti usati per guidare mapping, validazioni e comportamento runtime.
     * @param sanitizer Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
     * @param route Informazione di navigazione usata per risolvere la route di destinazione.
     * @param router Informazione di navigazione usata per risolvere la route di destinazione.
     * @param location Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
     * @param titleService Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
     * @param trslSrv Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
     * @param cd Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
     * @param userInfo Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
     */
    constructor(metaSrv: MetadataProviderService, sanitizer: DomSanitizer, route: ActivatedRoute, router: Router, location: Location, titleService: Title, trslSrv: TranslationManagerService, cd: ChangeDetectorRef, userInfo: UserInfoService);
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): void;
    /**
     * Gestisce la logica operativa di `ensureSelectButtonGuard` orchestrando le chiamate `call`.
     */
    private ensureSelectButtonGuard;
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
     * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
     */
    ngOnDestroy(): void;
    /**
     * Restituisce una chiave stabile per il tracking colonne nel template,
     * evitando re-render completi quando l'array visibile viene ricreato.
     */
    getStableColumnTrackKey(col: any, index: number): string;
    /**
     * Gestisce la logica operativa di `subscribeToDS` in modo coerente con l'implementazione corrente.
     * @returns Risultato elaborato da `subscribeToDS` e restituito al chiamante.
     */
    private subscribeToDS;
    /**
     * Recupera e prepara i dati richiesti dal chiamante usando i metadati per determinare chiavi, campi e comportamento runtime.
     * @param metaInfo Metadati del contesto corrente usati per guidare filtri, mapping e comportamento runtime.
     * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
     */
    private getEffectiveGridRowTemplate;
    /**
     * Costruisce una struttura di output a partire dal contesto corrente usando i metadati per determinare chiavi, campi e comportamento runtime.
     * @param columns Collezione di input processata dal metodo (normalizzazione, filtri e mapping).
     * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
     */
    private buildDefaultGridRowTemplateWithColumnTemplates;
    /**
     * Costruisce una struttura di output a partire dal contesto corrente normalizzando e trasformando collezioni di record.
     * @param columns Collezione di input processata dal metodo (normalizzazione, filtri e mapping).
     * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
     */
    private buildGridColumnTemplateSwitchCases;
    /**
     * Verifica una condizione di stato o di validita orchestrando le chiamate `trim` e `String`.
     * @param template Valore testuale usato come chiave, nome campo, criterio o frammento di configurazione.
     * @returns Esito booleano dell'elaborazione svolta dal metodo.
     */
    private isAngularCellMarkupTemplate;
    /**
     * Trasforma i dati in una forma coerente con il rendering o con il payload richiesto orchestrando le chiamate `trim` e `String`.
     * @param template Valore testuale usato come chiave, nome campo, criterio o frammento di configurazione.
     * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
     */
    private normalizeGridCellTemplate;
    /**
     * Esegue operazioni di persistenza/sincronizzazione in `syncTableFilterUiFromDatasource` trasformando e filtrando collezioni dati.
     */
    private syncTableFilterUiFromDatasource;
    /**
     * Interpreta e normalizza input/configurazione in `parseData` per l'utilizzo nel componente.
     * @param data Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
     * @returns Struttura dati prodotta da `parseData` dopo normalizzazione/elaborazione.
     */
    parseData(data: any): any;
    /**
     * Ricalcola lo stato `_disabled` delle azioni tabella valutando i callback di disabilitazione contro `resultInfo.current` e il contesto UI corrente.
     */
    reEvaluateActionEnabledStates(): void;
    /**
     * Ricostruisce il menu azioni tabella includendo solo le voci autorizzate/visibili e riallineando caption, stato disabled e comandi eseguibili.
     */
    private rebuildTableActionMenuItems;
    /**
     * Gestisce la logica operativa di `onColumnHeaderContextMenu` in modo coerente con l'implementazione corrente.
     * @param event Evento che innesca il comportamento del metodo.
     * @param col Parametro utilizzato dal metodo nel flusso elaborativo.
     * @param menu Parametro utilizzato dal metodo nel flusso elaborativo.
     */
    onColumnHeaderContextMenu(event: MouseEvent, col: any, menu: ContextMenu): void;
    /**
     * Gestisce la logica operativa di `ensureMetadataColumnsDatasourceRoute` propagando aggiornamenti sui flussi reattivi usati dalla UI.
     */
    private ensureMetadataColumnsDatasourceRoute;
    /**
     * Inizializza (una sola volta) il datasource dedicato alle colonne metadato, caricando schema e configurazione necessari alle operazioni di update metadati.
     */
    private ensureMetadataColumnsDatasourceSchema;
    /**
     * Recupera dal datasource metadati il record colonna corrispondente a `mc_id`, usato per modifiche puntuali alle proprietà della colonna.
     * @param mcId Identificativo `mc_id` della colonna metadato da leggere nel datasource amministrativo.
     * @returns Promise che completa il flusso asincrono restituendo un risultato di tipo `Promise<any | null>`.
     */
    private fetchMetadataColumnRecord;
    /**
     * Apre il form editor dei metadati colonna per la `mc_id` selezionata e, alla chiusura con salvataggio, ricarica schema/dati della griglia.
     * @param metaColumn Metadato colonna su cui aprire l'editor; la ricerca del record avviene tramite `mc_id`.
     */
    private openColumnMetadataEditor;
    /**
     * Imposta `mc_hide_in_list = true` sulla colonna selezionata (risolta via `mc_id`), salva il record metadato e ricarica la griglia per applicare la nuova visibilità.
     * @param metaColumn Metadato colonna selezionato; viene usato `mc_id` per recuperare il record persistito e aggiornare `mc_hide_in_list`.
     */
    private hideColumnByMetadata;
    /**
     * Aggiorna i testi di colonna `mc_display_string_in_view` e `mc_display_string_in_edit` tramite prompt, persiste il record metadato e ricarica lo schema.
     * @param metaColumn Metadato colonna selezionato; viene usato `mc_id` per aggiornare `mc_display_string_in_view` e `mc_display_string_in_edit`.
     */
    private editColumnDisplayStrings;
    /**
     * Interpreta e normalizza input/configurazione in `parseColumns` per l'utilizzo nel componente.
     * @param columns Collezione in ingresso processata dal metodo.
     * @returns Struttura dati prodotta da `parseColumns` dopo normalizzazione/elaborazione.
     */
    parseColumns(columns: MetadatiColonna[]): any[];
    /**
     * Gestisce la logica di `onColumnResize` orchestrando le chiamate `captureResizedColumnWidth` e `detectChanges`.
     * @param event Evento UI/payload evento che innesca la logica del metodo.
     */
    onColumnResize(event: any): Promise<void>;
    /**
     * Gestisce la logica di `onColumnReorder` trasformando e filtrando collezioni dati.
     * @param event Evento UI/payload evento che innesca la logica del metodo.
     */
    onColumnReorder(event: any): Promise<void>;
    /**
     * Gestisce la logica operativa di `pageFilterChange` in modo coerente con l'implementazione corrente.
     * @param event Evento che innesca il comportamento del metodo.
     * @returns Risultato elaborato da `pageFilterChange` e restituito al chiamante.
     */
    pageFilterChange(event: any): Promise<void>;
    /**
     * Gestisce la logica operativa di `clearFilter` in modo coerente con l'implementazione corrente.
     * @param table Parametro utilizzato dal metodo nel flusso elaborativo.
     */
    clearFilter(table: Table): Promise<void>;
    /**
     * Gestisce la logica operativa di `resetGridState` in modo coerente con l'implementazione corrente.
     * @param table Parametro utilizzato dal metodo nel flusso elaborativo.
     */
    resetGridState(table: Table): Promise<void>;
    /**
     * Recupera i dati/valori richiesti da `getTgtVal`.
     * @param tgt Parametro utilizzato dal metodo nel flusso elaborativo.
     * @returns Valore risolto da `getTgtVal` in base ai criteri implementati.
     */
    getTgtVal(tgt: any): any;
    /**
     * Calcola i valori di aggregazione per colonna (`sum`, `avg`, `min`, `max`, `count`) usando i campi metadato con flag `mc_aggregation`.
     * @param col Parametro utilizzato dal metodo nel flusso elaborativo.
     * @returns Valore risolto da `getAggregations` in base ai criteri implementati.
     */
    getAggregations(col: MetadatiColonna): any[];
    /**
     * Gestisce la logica di `exportXls` orchestrando le chiamate `exportXls` e `open`.
     */
    exportXls(): Promise<void>;
    /**
     * Gestisce la logica di `refresh` preparando/aggiornando il dataset visualizzato.
     */
    refresh(): Promise<void>;
    private getPrimaryActiveSchedulerInfo;
    private formatSchedulerDateTime;
    /**
     * Verifica una condizione di stato o di validita orchestrando le chiamate `canUseClientSideCrud`.
     * @returns Esito booleano dell'elaborazione svolta dal metodo.
     */
    canToggleClientSideCrud(): boolean;
    /**
     * Valuta una condizione tramite `isClientSideCrudActive` con il flusso specifico definito dalla sua implementazione.
     * @returns Esito booleano del controllo/elaborazione eseguito dal metodo.
     */
    isClientSideCrudActive(): boolean;
    /**
     * Recupera e prepara i dati richiesti dal chiamante normalizzando e trasformando collezioni di record.
     * @returns Valore numerico derivato dai calcoli interni (conteggio, indice, priorita o metrica operativa).
     */
    getDatasourceChangesCount(): number;
    /**
     * Verifica una condizione di stato o di validita orchestrando le chiamate `getDatasourceChangesCount`.
     * @returns Esito booleano del controllo effettuato dal metodo (true quando la condizione verificata risulta soddisfatta).
     */
    hasDatasourceChanges(): boolean;
    /**
     * Gestisce il comportamento UI di `openChangesDialog` orchestrando le chiamate `buildPendingChangeItems`.
     */
    openChangesDialog(): void;
    /**
     * Recupera e prepara i dati richiesti dal chiamante normalizzando e trasformando collezioni di record.
     * @returns Valore numerico derivato dai calcoli interni (conteggio, indice, priorita o metrica operativa).
     */
    getSelectedPendingChangesCount(): number;
    /**
     * Costruisce una struttura di output a partire dal contesto corrente normalizzando e trasformando collezioni di record.
     * @returns Collezione di tipo `GridPendingChangeItem[]` derivata dalle trasformazioni applicate nel metodo.
     */
    private buildPendingChangeItems;
    /**
     * Esegue una operazione di persistenza/sincronizzazione mantenendo coerente lo stato locale normalizzando e trasformando collezioni di record, allineando i record al formato atteso dai componenti del framework, coordinando chiamate verso servizi applicativi.
     */
    saveAllPendingChanges(): Promise<void>;
    /**
     * Esegue una operazione di persistenza/sincronizzazione mantenendo coerente lo stato locale normalizzando e trasformando collezioni di record, allineando i record al formato atteso dai componenti del framework, coordinando chiamate verso servizi applicativi.
     */
    saveSelectedPendingChanges(): Promise<void>;
    /**
     * Gestisce la logica operativa di `cancelAllPendingChanges` trasformando e filtrando collezioni dati.
     */
    cancelAllPendingChanges(): void;
    /**
     * Riconcilia le righe modificate dopo refresh dati associando i pending changes ai record correnti in base a PK/GUID e mantenendo il tracking coerente.
     * @param changes Collezione di input processata dal metodo.
     */
    private reassignModifiedRows;
    /**
     * Ripristina lo stato e pulisce risorse temporanee legate al flusso del componente normalizzando e trasformando collezioni di record.
     */
    private resetInlineEditingRows;
    /**
     * Gestisce comportamento UI tramite `toggleClientSideCrud` orchestrando le chiamate `canToggleClientSideCrud` e `syncAndDisableClientSideCrud`.
     */
    toggleClientSideCrud(): Promise<void>;
    /**
     * Esegue operazioni di persistenza/sincronizzazione in `syncAndDisableClientSideCrud` orchestrando le chiamate `isClientSideCrudActive` e `confirm`.
     */
    syncAndDisableClientSideCrud(): Promise<void>;
    /**
     * Gestisce la logica di `discardLocalAndDisableClientSideCrud` orchestrando le chiamate `isClientSideCrudActive` e `confirm`.
     */
    discardLocalAndDisableClientSideCrud(): Promise<void>;
    /**
     * Crea un nuovo record tramite datasource (`addNewRecord`), lo porta in edit mode e sincronizza lo stato locale della griglia.
     */
    addRecord(): void;
    /**
     * Espande tutte le righe raggruppate presenti nella vista corrente e aggiorna il relativo stato espansione della griglia.
     */
    expandAll(): void;
    /**
     * Gestisce la logica di `collapseAll` con il flusso specifico definito dalla sua implementazione.
     */
    collapseAll(): void;
    /**
     * Gestisce la logica di `onRowExpand` con il flusso specifico definito dalla sua implementazione.
     * @param event Evento UI/payload evento che innesca la logica del metodo.
     */
    onRowExpand(event: TableRowExpandEvent): void;
    /**
     * Gestisce la logica di `onRowCollapse` con il flusso specifico definito dalla sua implementazione.
     * @param event Evento UI/payload evento che innesca la logica del metodo.
     */
    onRowCollapse(event: TableRowCollapseEvent): void;
    /**
     * Gestisce la logica operativa di `toggleRow` in modo coerente con l'implementazione corrente.
     * @param item Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
     * @param event Evento che innesca il comportamento del metodo.
     * @param dt Parametro utilizzato dal metodo nel flusso elaborativo.
     */
    toggleRow(item: any, event: Event, dt: Table): void;
    /**
     * Gestisce la logica operativa di `rowSelect` in modo coerente con l'implementazione corrente.
     * @param item Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
     * @param event Evento che innesca il comportamento del metodo.
     * @param dt Parametro utilizzato dal metodo nel flusso elaborativo.
     */
    rowSelect(item: any, event: any, dt: Table): void;
    /**
     * Gestisce la logica operativa di `onSelectionChange` in modo coerente con l'implementazione corrente.
     * @param selection Parametro utilizzato dal metodo nel flusso elaborativo.
     */
    onSelectionChange(selection: any): void;
    /**
     * Gestisce la logica operativa di `clearColumnFilter` in modo coerente con l'implementazione corrente.
     * @param col Parametro utilizzato dal metodo nel flusso elaborativo.
     * @param fetch Flag che abilita/disabilita rami della logica.
     */
    clearColumnFilter(col: MetadatiColonna, fetch: boolean): void;
    /**
     * Valuta la condizione gestita da `hasActiveFilter` restituendo un esito utile al flusso.
     * @param col Parametro utilizzato dal metodo nel flusso elaborativo.
     * @returns Esito booleano restituito da `hasActiveFilter`.
     */
    hasActiveFilter(col: MetadatiColonna): boolean;
    /**
     * Gestisce la logica operativa di `showActionColumn` in modo coerente con l'implementazione corrente.
     * @returns Risultato elaborato da `showActionColumn` e restituito al chiamante.
     */
    showActionColumn(): boolean;
    /**
     * Valuta una condizione di stato o validita usando i metadati per determinare campi, chiavi e comportamento runtime.
     * @param col Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
     * @returns Esito booleano del controllo/elaborazione effettuato dal metodo.
     */
    isColumnSortable(col: any): boolean;
    /**
     * Esegue operazioni di persistenza/sincronizzazione in `syncFilterInfoQueryString` orchestrando le chiamate `syncGridStateQueryString`.
     */
    private syncFilterInfoQueryString;
    /**
     * Esegue operazioni di persistenza/sincronizzazione in `syncGridStateQueryString` allineando lo stato con parametri route/query, trasformando e filtrando collezioni dati, coordinando la navigazione applicativa.
     */
    private syncGridStateQueryString;
    /**
     * Gestisce la logica di `clearGridStateQueryString` allineando lo stato con parametri route/query, coordinando la navigazione applicativa.
     */
    private clearGridStateQueryString;
    /**
     * Gestisce la logica di `scheduleSyncFilterInfoQueryString` orchestrando le chiamate `clearTimeout` e `setTimeout`.
     */
    private scheduleSyncFilterInfoQueryString;
    /**
     * Gestisce la logica operativa di `scheduleSyncGridStateQueryString` in modo coerente con l'implementazione corrente.
     * @param delayMs Parametro utilizzato dal metodo nel flusso elaborativo.
     */
    private scheduleSyncGridStateQueryString;
    /**
     * Esegue operazioni di persistenza/sincronizzazione in `syncPageInfoQueryString` orchestrando le chiamate `scheduleSyncGridStateQueryString`.
     */
    private syncPageInfoQueryString;
    /**
     * Esegue operazioni di persistenza/sincronizzazione in `syncSortInfoQueryString` orchestrando le chiamate `scheduleSyncGridStateQueryString`.
     */
    private syncSortInfoQueryString;
    /**
     * Gestisce la logica operativa di `pushGridStateUrl` in modo coerente con l'implementazione corrente.
     * @param tree Parametro utilizzato dal metodo nel flusso elaborativo.
     */
    private pushGridStateUrl;
    /**
     * Gestisce la logica di `areUrlsEquivalent` allineando lo stato con parametri route/query, trasformando e filtrando collezioni dati, coordinando la navigazione applicativa.
     * @param aUrl Informazioni di routing usate per risolvere il contesto o comporre la navigazione.
     * @param bUrl Informazioni di routing usate per risolvere il contesto o comporre la navigazione.
     * @returns Esito booleano calcolato dal metodo.
     */
    private areUrlsEquivalent;
    /**
     * Gestisce la logica operativa di `normalizedQueryParams` in modo coerente con l'implementazione corrente.
     * @param queryParams Parametro utilizzato dal metodo nel flusso elaborativo.
     * @returns Risultato elaborato da `normalizedQueryParams` e restituito al chiamante.
     */
    private normalizedQueryParams;
    /**
     * Recupera e prepara i dati richiesti dal chiamante orchestrando le chiamate `toLowerCase` e `trim`.
     * @param route Informazioni di routing usate per comporre o risolvere la navigazione.
     * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
     */
    private getRouteKey;
    /**
     * Recupera informazioni tramite `getCurrentRouteColumnWidths` orchestrando le chiamate `getRouteKey` e `keys`.
     * @returns Valore di tipo `{ [field: string]: number }` restituito dal metodo.
     */
    private getCurrentRouteColumnWidths;
    /**
     * Recupera informazioni tramite `getCurrentRouteColumnLayout` orchestrando le chiamate `getRouteKey`.
     * @returns Valore di tipo `ListGridColumnLayout` restituito dal metodo.
     */
    private getCurrentRouteColumnLayout;
    /**
     * Apre il dialog layout colonne precompilato con ordine/larghezze correnti per consentire all'utente di personalizzare la griglia.
     */
    openColumnLayoutDialog(): void;
    /**
     * Gestisce la logica operativa di `resetColumnLayoutDraftToMetadata` in modo coerente con l'implementazione corrente.
     * @returns Risultato elaborato da `resetColumnLayoutDraftToMetadata` e restituito al chiamante.
     */
    resetColumnLayoutDraftToMetadata(): void;
    /**
     * Gestisce la logica di `resetColumnLayoutDraftAndWidths` orchestrando le chiamate `resetColumnLayoutDraftToMetadata` e `saveColumnLayoutFromDialog`.
     */
    resetColumnLayoutDraftAndWidths(): Promise<void>;
    /**
     * Gestisce la logica operativa di `moveColumnLayoutDraft` in modo coerente con l'implementazione corrente.
     * @param index Parametro utilizzato dal metodo nel flusso elaborativo.
     * @param direction Parametro utilizzato dal metodo nel flusso elaborativo.
     */
    moveColumnLayoutDraft(index: number, direction: -1 | 1): void;
    /**
     * Salva ordine, visibilità e larghezza colonne nel profilo route corrente e applica immediatamente il layout persistito alla griglia.
     */
    saveColumnLayoutFromDialog(): Promise<void>;
    /**
     * Gestisce la logica operativa di `extractVisibleColumnOrderFromReorderEvent` trasformando e filtrando collezioni dati.
     * @param event Evento UI o payload evento che innesca il flusso del metodo.
     * @returns Collezione di tipo `string[]` risultante dalle trasformazioni applicate dal metodo.
     */
    private extractVisibleColumnOrderFromReorderEvent;
    /**
     * Applica aggiornamenti di stato tramite `applyPersistedColumnOrder` trasformando e filtrando collezioni dati.
     * @param cols Collezione di input processata dal metodo.
     * @param order Collezione di input processata dal metodo.
     * @returns Collezione di tipo `any[]` risultante dalle trasformazioni applicate dal metodo.
     */
    private applyPersistedColumnOrder;
    /**
     * Gestisce la logica di `persistCurrentRouteColumnLayoutFromCols` trasformando e filtrando collezioni dati.
     */
    private persistCurrentRouteColumnLayoutFromCols;
    /**
     * Gestisce la logica di `loadPersistedColumnLayoutFromLocalStorage` orchestrando le chiamate `getCustomSettingFromLocalStorage` e `normalizePersistedColumnLayoutMap`.
     */
    private loadPersistedColumnLayoutFromLocalStorage;
    /**
     * Gestisce la logica di `hydratePersistedColumnLayoutFromServerIfNeeded` orchestrando le chiamate `keys` e `getuserInfo`.
     */
    private hydratePersistedColumnLayoutFromServerIfNeeded;
    /**
     * Gestisce la logica di `captureResizedColumnWidth` orchestrando le chiamate `captureAllColumnWidthsFromTableDom`.
     * @param event Evento UI/payload evento che innesca la logica del metodo.
     */
    private captureResizedColumnWidth;
    /**
     * Gestisce la logica di `captureAllColumnWidthsFromTableDom` trasformando e filtrando collezioni dati.
     * @param event Evento UI/payload evento che innesca la logica del metodo.
     */
    private captureAllColumnWidthsFromTableDom;
    /**
     * Gestisce la logica di `persistCurrentRouteColumnWidths` trasformando e filtrando collezioni dati.
     */
    private persistCurrentRouteColumnWidths;
    /**
     * Gestisce la logica di `resetCurrentRouteColumnWidths` trasformando e filtrando collezioni dati.
     */
    resetCurrentRouteColumnWidths(): Promise<void>;
    /**
     * Gestisce la logica di `clearInlineColumnWidthStylesFromTableDom` orchestrando le chiamate `removeProperty` e `querySelectorAll`.
     */
    private clearInlineColumnWidthStylesFromTableDom;
    /**
     * Restituisce la larghezza default colonna leggendo la configurazione metadato (`mc_ui_grid_width` e fallback applicativi).
     * @param metaColumn Metadati del contesto usati per guidare logica runtime e rendering.
     * @returns Valore di tipo `number | undefined` restituito dal metodo.
     */
    private getMetadataDefaultColumnWidth;
    /**
     * Indica se la route corrente ha larghezze persistite valide.
     * @param routeWidths Mappa larghezze route corrente.
     * @returns True quando esiste almeno una larghezza persistita.
     */
    private hasPersistedColumnWidths;
    /**
     * Determina se la griglia deve distribuire le colonne in modo proporzionale
     * leggendo `md_props_bag.archetypes.list.proportionalColwidth`.
     * @returns True quando la modalita proporzionale e attiva.
     */
    private isProportionalColwidthEnabled;
    /**
     * Restituisce la stringa CSS width per una colonna in base alla modalita corrente.
     * @param col Colonna renderizzata.
     * @returns Width CSS (`px` o `%`) oppure `null`.
     */
    getColumnWidthCss(col: any): string | null;
    /**
     * Restituisce il valore CSS per `min-width` sulle colonne della tabella.
     * @returns Valore CSS da applicare.
     */
    getColumnMinWidthCss(): string;
    /**
     * Restituisce la larghezza viewport usata per valutare il fallback delle colonne percentuali.
     * @returns Larghezza viewport in px, oppure `0` se non disponibile.
     */
    private getViewportWidthPx;
    /**
     * Gestisce comportamento UI tramite `openSaveGridStateDialog` orchestrando le chiamate `refreshCurrentRouteSavedStates` e `some`.
     */
    openSaveGridStateDialog(): void;
    /**
     * Gestisce la logica di `onSaveGridStateDialogSelectionChange` orchestrando le chiamate `updateSaveGridStateDialogSetAsDefault`.
     */
    onSaveGridStateDialogSelectionChange(): void;
    /**
     * Applica aggiornamenti di stato tramite `updateSaveGridStateDialogSetAsDefault` orchestrando le chiamate `find`.
     */
    private updateSaveGridStateDialogSetAsDefault;
    /**
     * Esegue operazioni di persistenza/sincronizzazione in `saveCurrentRouteGridState` allineando lo stato con parametri route/query.
     */
    saveCurrentRouteGridState(): Promise<void>;
    /**
     * Applica aggiornamenti di stato tramite `applySelectedGridState` preparando/aggiornando il dataset visualizzato.
     * @param stateId Identificativo tecnico usato per lookup, match o aggiornamento mirato.
     */
    applySelectedGridState(stateId?: string): Promise<void>;
    /**
     * Esegue operazioni di persistenza/sincronizzazione in `removeSelectedGridState` trasformando e filtrando collezioni dati.
     */
    removeSelectedGridState(): Promise<void>;
    /**
     * Gestisce la logica operativa di `reloadPage` orchestrando le chiamate `reload`.
     */
    private reloadPage;
    /**
     * Gestisce la logica di `onSelectedGridStateChange` orchestrando le chiamate `String` e `applySelectedGridState`.
     * @param stateId Identificativo tecnico usato per lookup, match o aggiornamento mirato.
     */
    onSelectedGridStateChange(stateId: string): Promise<void>;
    /**
     * Gestisce la logica di `onSavedStateDropdownChange` orchestrando le chiamate `String` e `applySelectedGridState`.
     * @param event Evento UI/payload evento che innesca la logica del metodo.
     */
    onSavedStateDropdownChange(event: Event): Promise<void>;
    /**
     * Applica aggiornamenti di stato tramite `setSelectedGridStateAsPreferred` trasformando e filtrando collezioni dati.
     */
    setSelectedGridStateAsPreferred(): Promise<void>;
    /**
     * Gestisce la logica di `normalizePersistedColumnWidthMap` orchestrando le chiamate `keys` e `getRouteKey`.
     * @param raw Valore in ingresso elaborato o normalizzato dal metodo.
     * @returns Valore di tipo `{ [routeKey: string]: { [field: string]: number } }` costruito o risolto dal metodo.
     */
    private normalizePersistedColumnWidthMap;
    /**
     * Trasforma i dati in una forma coerente con rendering o payload normalizzando e trasformando collezioni di record.
     * @param raw Parametro in ingresso usato per determinare il flusso operativo del metodo.
     * @returns Valore di tipo `{ [routeKey: string]: ListGridColumnLayout }` costruito dal metodo per i passaggi successivi del flusso.
     */
    private normalizePersistedColumnLayoutMap;
    /**
     * Gestisce la logica di `loadPersistedGridStatesFromLocalStorage` trasformando e filtrando collezioni dati.
     */
    private loadPersistedGridStatesFromLocalStorage;
    /**
     * Gestisce la logica di `hydratePersistedGridStatesFromServerIfNeeded` orchestrando le chiamate `keys` e `getuserInfo`.
     */
    private hydratePersistedGridStatesFromServerIfNeeded;
    /**
     * Gestisce la logica di `refreshCurrentRouteSavedStates` orchestrando le chiamate `getRouteKey` e `syncSelectedSavedStateWithDatasourceCurrentState`.
     */
    private refreshCurrentRouteSavedStates;
    /**
     * Gestisce la logica di `tryAutoApplyPreferredStateForCurrentRoute` allineando lo stato con parametri route/query.
     */
    private tryAutoApplyPreferredStateForCurrentRoute;
    /**
     * Verifica una condizione di stato o di validita coordinando chiamate verso servizi applicativi.
     * @returns Esito booleano dell'elaborazione svolta dal metodo.
     */
    private hasExplicitGridStateInQueryParams;
    /**
     * Gestisce la logica di `persistGridStatesSettings` orchestrando le chiamate `getuserInfo` e `setCustomSettingInLocalStorage`.
     */
    private persistGridStatesSettings;
    /**
     * Gestisce la logica operativa di `deepClone` in modo coerente con l'implementazione corrente.
     * @param value Valore in ingresso elaborato o normalizzato dal metodo.
     * @returns Risultato elaborato da `deepClone` e restituito al chiamante.
     */
    private deepClone;
    /**
     * Esegue operazioni di persistenza/sincronizzazione in `syncSelectedSavedStateWithDatasourceCurrentState` orchestrando le chiamate `getCurrentGridStateSignatureFromDatasource` e `find`.
     */
    private syncSelectedSavedStateWithDatasourceCurrentState;
    /**
     * Recupera e prepara i dati richiesti dal chiamante orchestrando le chiamate `getCurrentGridStateSignatureFromQueryOrDatasource` e `normalizeFilterInfoForCompare`.
     * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
     */
    private getCurrentGridStateSignatureFromDatasource;
    /**
     * Recupera e prepara i dati richiesti dal chiamante orchestrando le chiamate `getCurrentGridStateFromQueryParams` e `stringify`.
     * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
     */
    private getCurrentGridStateSignatureFromQueryOrDatasource;
    /**
     * Recupera i dati/valori richiesti da `getSavedStateSignature`.
     * @param state Parametro utilizzato dal metodo nel flusso elaborativo.
     * @returns Stringa risultante calcolata da `getSavedStateSignature` per chiavi/label o valori testuali.
     */
    private getSavedStateSignature;
    /**
     * Trasforma i dati in una forma coerente con rendering o payload normalizzando e trasformando collezioni di record.
     * @param value Collezione di input processata dal metodo (normalizzazione, filtri e mapping).
     * @returns Valore di tipo `any` costruito dal metodo per i passaggi successivi del flusso.
     */
    private normalizeForCompare;
    /**
     * Recupera informazioni tramite `getCurrentGridStateFromQueryParams` leggendo parametri route/query per mantenere lo stato consistente con l'URL.
     * @returns Valore di tipo `any | null` restituito dal metodo.
     */
    private getCurrentGridStateFromQueryParams;
    /**
     * Gestisce la logica operativa di `tryParseJson` in modo coerente con l'implementazione corrente.
     * @param raw Valore in ingresso elaborato o normalizzato dal metodo.
     * @returns Risultato elaborato da `tryParseJson` e restituito al chiamante.
     */
    private tryParseJson;
    /**
     * Trasforma i dati in una forma coerente con rendering o payload normalizzando e trasformando collezioni di record.
     * @param filterInfo Criterio di filtro usato per limitare o rifinire il dataset elaborato.
     * @returns Valore di tipo `any` costruito dal metodo per i passaggi successivi del flusso.
     */
    private normalizeFilterInfoForCompare;
    /**
     * Trasforma i dati in una forma coerente con rendering o payload normalizzando e trasformando collezioni di record.
     * @param sortInfo Collezione di input processata dal metodo (normalizzazione, filtri e mapping).
     * @returns Collezione di tipo `any[]` derivata dalle trasformazioni applicate nel metodo.
     */
    private normalizeSortInfoForCompare;
    /**
     * Applica aggiornamenti di stato tramite `applySavedFilterInfoToDatasourceDescriptor` mantenendo coerenti UI e dati.
     * @param ds Parametro utilizzato dal metodo nel flusso elaborativo.
     * @param filterInfo Filtro o criteri di ricerca applicati al dataset.
     */
    private applySavedFilterInfoToDatasourceDescriptor;
    /**
     * Applica al DOM tabellare le larghezze persistite per campo, riallineando header/body dopo render e resize.
     */
    private forceApplyPersistedColumnWidthsToTableDom;
    /**
     * Recupera e prepara i dati richiesti dal chiamante usando i metadati per determinare chiavi, campi e comportamento runtime.
     * @returns Valore numerico derivato dai calcoli interni (conteggio, indice, priorita o metrica operativa).
     */
    private getLeadingStructuralColumnCount;
    /**
     * Gestisce la logica operativa di `debugColumnWidths` in modo coerente con l'implementazione corrente.
     * @param stage Parametro utilizzato dal metodo nel flusso elaborativo.
     * @param payload Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
     */
    private debugColumnWidths;
    /**
     * Costruisce una struttura di output a partire dal contesto corrente orchestrando le chiamate `padStart` e `String`.
     * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
     */
    private buildNewReportName;
    /**
     * Gestisce la logica operativa di `openReportDesigner` in modo coerente con l'implementazione corrente.
     * @param reportName Parametro utilizzato dal metodo nel flusso elaborativo.
     */
    private openReportDesigner;
    /**
     * Gestisce la logica operativa di `openReportViewer` in modo coerente con l'implementazione corrente.
     * @param reportName Parametro utilizzato dal metodo nel flusso elaborativo.
     * @param parameters Parametro utilizzato dal metodo nel flusso elaborativo.
     */
    private openReportViewer;
    /**
     * Costruisce una struttura di output a partire dal contesto corrente normalizzando e trasformando collezioni di record.
     * @param variables Collezione di input processata dal metodo (normalizzazione, filtri e mapping).
     * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
     */
    private buildReportParametersQueryString;
    /**
     * Gestisce la logica operativa di `openReportFromMenu` in modo coerente con l'implementazione corrente.
     * @param reportName Parametro utilizzato dal metodo nel flusso elaborativo.
     */
    openReportFromMenu(reportName: string): Promise<void>;
    /**
     * Gestisce la logica di `cancelReportVariableDialog` con il flusso specifico definito dalla sua implementazione.
     */
    cancelReportVariableDialog(): void;
    /**
     * Applica aggiornamenti di stato tramite `applyReportVariablesAndOpenViewer` orchestrando le chiamate `cancelReportVariableDialog` e `buildReportParametersQueryString`.
     */
    applyReportVariablesAndOpenViewer(): void;
    /**
     * Carica dati dal layer applicativo e li armonizza per l'uso in UI normalizzando e trasformando collezioni di record.
     */
    private loadReportList;
    /**
     * Recupera informazioni tramite `getFieldFromResizeEvent` orchestrando le chiamate `getAttribute`.
     * @param event Evento UI o payload evento che innesca il flusso del metodo.
     * @returns Valore di tipo `string | null` restituito dal metodo.
     */
    private getFieldFromResizeEvent;
    /**
     * Recupera e prepara i dati richiesti dal chiamante orchestrando le chiamate `Number` e `isFinite`.
     * @param event Evento UI o payload evento da cui il metodo ricava input operativi.
     * @returns Valore numerico derivato dai calcoli interni (conteggio, indice, priorita o metrica operativa).
     */
    private getWidthFromResizeEvent;
    static ɵfac: i0.ɵɵFactoryDeclaration<ListGridComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<ListGridComponent, "wuic-list-grid", never, { "hardcodedRoute": { "alias": "hardcodedRoute"; "required": false; }; "parentRecord": { "alias": "parentRecord"; "required": false; }; "parentMetaInfo": { "alias": "parentMetaInfo"; "required": false; }; "datasource": { "alias": "datasource"; "required": false; }; "hardcodedDatasource": { "alias": "hardcodedDatasource"; "required": false; }; "rowCustomSelect": { "alias": "rowCustomSelect"; "required": false; }; "hideToolbar": { "alias": "hideToolbar"; "required": false; }; }, {}, never, never, true, never>;
}

declare class PagerComponent implements OnInit, OnChanges, OnDestroy {
    /**
     * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
     */
    datasource: BehaviorSubject<DataSourceComponent>;
    /**
     * Input dal componente padre per hardcoded datasource; usata nella configurazione e nel rendering del componente.
     */
    hardcodedDatasource: DataSourceComponent;
    /**
     * Input dal componente padre per page size; usata nella configurazione e nel rendering del componente.
     */
    pageSize: number;
    /**
     * Input dal componente padre per current page; usata nella configurazione e nel rendering del componente.
     */
    currentPage: number;
    /**
     * Input dal componente padre per forced page size; usata nella configurazione e nel rendering del componente.
     */
    forcedPageSize: number;
    /**
     * Proprieta di stato del componente per total records, usata dalla logica interna e dal template.
     */
    totalRecords: number;
    /**
     * Proprieta di stato del componente per total pages, usata dalla logica interna e dal template.
     */
    totalPages: number;
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a busy.
     */
    busy: boolean;
    /**
     * Proprieta di stato del componente per datasource subscription, usata dalla logica interna e dal template.
     */
    private datasourceSubscription?;
    /**
     * Proprieta di stato del componente per fetch info subscription, usata dalla logica interna e dal template.
     */
    private fetchInfoSubscription?;
    /**
     * Proprieta di stato del componente per bound datasource, usata dalla logica interna e dal template.
     */
    private boundDatasource?;
    /**
     * Proprieta di stato del componente per syncing from datasource, usata dalla logica interna e dal template.
     */
    private syncingFromDatasource;
    /**
     * Proprieta di stato del componente per preferred paging applied, usata dalla logica interna e dal template.
     */
    private preferredPagingApplied;
    /**
     * Proprieta di stato del componente per applying preferred paging, usata dalla logica interna e dal template.
     */
    private applyingPreferredPaging;
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): void;
    /**
 * Gestisce i cambiamenti degli input aggiornando lo stato derivato e le dipendenze del componente.
 * @param changes Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
 */
    ngOnChanges(changes: SimpleChanges): void;
    /**
     * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
     */
    ngOnDestroy(): void;
    /**
 * Gestisce la logica operativa di `prevPage` orchestrando le chiamate `goToPage`.
 */
    prevPage(): Promise<void>;
    /**
 * Gestisce la logica operativa di `nextPage` orchestrando le chiamate `goToPage`.
 */
    nextPage(): Promise<void>;
    /**
 * Gestisce la logica operativa di `firstPage` orchestrando le chiamate `goToPage`.
 */
    firstPage(): Promise<void>;
    /**
 * Gestisce la logica operativa di `lastPage` orchestrando le chiamate `goToPage`.
 */
    lastPage(): Promise<void>;
    /**
 * Applica aggiornamenti di stato tramite `applyPageSize` orchestrando le chiamate `normalizeInt` e `getCurrentDatasource`.
 */
    applyPageSize(): Promise<void>;
    /**
 * Applica aggiornamenti di stato tramite `applyCurrentPage` orchestrando le chiamate `normalizeInt` e `getCurrentDatasource`.
 */
    applyCurrentPage(): Promise<void>;
    /**
* Gestisce la logica operativa di `goToPage` in modo coerente con l'implementazione corrente.
* @param page Parametro utilizzato dal metodo nel flusso elaborativo.
*/
    private goToPage;
    /**
 * Applica aggiornamenti di stato tramite `applyExternalPagingInputs` orchestrando le chiamate `getCurrentDatasource` e `max`.
 */
    private applyExternalPagingInputs;
    /**
 * Gestisce la logica operativa di `bindToDatasource` gestendo subscription RxJS in modo esplicito, propagando aggiornamenti sui flussi reattivi usati dalla UI.
 */
    private bindToDatasource;
    /**
 * Gestisce la logica operativa di `subscribeToDatasource` gestendo subscription RxJS in modo esplicito, propagando aggiornamenti sui flussi reattivi usati dalla UI.
 */
    private subscribeToDatasource;
    /**
 * Applica aggiornamenti di stato tramite `applyPreferredPagingFromInputs` orchestrando le chiamate `getCurrentDatasource` e `max`.
 */
    private applyPreferredPagingFromInputs;
    /**
   * Esegue una operazione di persistenza/sincronizzazione mantenendo coerente lo stato locale orchestrando le chiamate `getCurrentDatasource` e `max`.
   */
    private syncFromDatasource;
    /**
* Gestisce la logica operativa di `recomputeTotals` in modo coerente con l'implementazione corrente.
* @param resultInfo Parametro utilizzato dal metodo nel flusso elaborativo.
*/
    private recomputeTotals;
    /**
* Applica aggiornamenti di stato tramite `applyPaging` mantenendo coerenti UI e dati.
* @param nextPage Parametro utilizzato dal metodo nel flusso elaborativo.
* @param nextSize Parametro utilizzato dal metodo nel flusso elaborativo.
*/
    private applyPaging;
    /**
* Applica aggiornamenti di stato tramite `setCurrentToFirstRow` mantenendo coerenti UI e dati.
* @param ds Parametro utilizzato dal metodo nel flusso elaborativo.
*/
    private setCurrentToFirstRow;
    /**
* Recupera informazioni tramite `getCurrentDatasource` con il flusso specifico definito dalla sua implementazione.
* @returns Valore di tipo `DataSourceComponent | null` costruito o risolto dal metodo.
*/
    private getCurrentDatasource;
    /**
* Gestisce la logica operativa di `normalizeInt` in modo coerente con l'implementazione corrente.
* @param value Valore in ingresso elaborato o normalizzato dal metodo.
* @param fallback Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Valore numerico prodotto da `normalizeInt` (indice, conteggio o misura operativa).
*/
    private normalizeInt;
    static ɵfac: i0.ɵɵFactoryDeclaration<PagerComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<PagerComponent, "wuic-pager", never, { "datasource": { "alias": "datasource"; "required": false; }; "hardcodedDatasource": { "alias": "hardcodedDatasource"; "required": false; }; "pageSize": { "alias": "pageSize"; "required": false; }; "currentPage": { "alias": "currentPage"; "required": false; }; "forcedPageSize": { "alias": "forcedPageSize"; "required": false; }; }, {}, never, never, true, never>;
}

declare class DynamicGenericTemplateComponent {
    /**
     * Input dal componente padre per row data; usata nella configurazione e nel rendering del componente.
     */
    rowData: any;
    /**
     * Input dal componente padre per columns; usata nella configurazione e nel rendering del componente.
     */
    columns: MetadatiColonna[];
    /**
     * Input dal componente padre per expanded; usata nella configurazione e nel rendering del componente.
     */
    expanded: boolean;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
     */
    datasource: DataSourceComponent;
    /**
     * Input dal componente padre per get description; usata nella configurazione e nel rendering del componente.
     */
    getDescription: Function;
    /**
     * Input dal componente padre per metadati colonna; usata nella configurazione e nel rendering del componente.
     */
    MetadatiColonna: typeof MetadatiColonna;
    /**
* Individua l'elemento richiesto in `findColumn` applicando i criteri di matching implementati.
* @param columnName Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Valore di tipo `MetadatiColonna | null` prodotto da `findColumn`.
*/
    findColumn(columnName: string): MetadatiColonna | null;
    /**
* Recupera i dati/valori richiesti da `getFieldValue`.
* @param record Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
* @param fieldName Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Valore risolto da `getFieldValue` in base ai criteri implementati.
*/
    getFieldValue(record: any, fieldName: string): any;
    /**
 * Gestisce la logica operativa di `classes` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`.
 * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
 */
    get classes(): string | null;
    /**
* Recupera i dati/valori richiesti da `getComponentFromTemplate`.
* @param template Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Valore risolto da `getComponentFromTemplate` in base ai criteri implementati.
*/
    static getComponentFromTemplate(template: string): typeof DynamicGenericTemplateComponent;
    static ɵfac: i0.ɵɵFactoryDeclaration<DynamicGenericTemplateComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DynamicGenericTemplateComponent, "wuic-dynamic-generic-template", never, { "rowData": { "alias": "rowData"; "required": false; }; "columns": { "alias": "columns"; "required": false; }; "expanded": { "alias": "expanded"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "datasource": { "alias": "datasource"; "required": false; }; "getDescription": { "alias": "getDescription"; "required": false; }; "MetadatiColonna": { "alias": "MetadatiColonna"; "required": false; }; }, {}, never, never, false, never>;
}

interface IBindable {
    hardcodedRoute: string;
    parentRecord: any;
    parentMetaInfo: MetaInfo;
    datasource: BehaviorSubject<DataSourceComponent>;
    hardcodedDatasource: DataSourceComponent;
    metaInfo: MetaInfo;
    data: any[];
    itemTemplateString: string;
    itemTemplate: typeof DynamicGenericTemplateComponent;
    subscribeToDS(): void;
    parseData(dato: any[]): any[];
}

interface IDesigner<T extends IDesignerProperties> {
    archetypeOptions: T;
}

declare class SchedulerListComponent implements AfterViewInit, IBindable, IDesigner<SchedulerOptions> {
    private titleService;
    private cd;
    private trslSrv;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per event content.
     */
    eventContent: TemplateRef<any>;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per calendar.
     */
    calendar: FullCalendarComponent;
    /**
     * Input dal componente padre per hardcoded route; usata nella configurazione e nel rendering del componente.
     */
    hardcodedRoute: string;
    /**
     * Input dal componente padre per parent record; usata nella configurazione e nel rendering del componente.
     */
    parentRecord: any;
    /**
     * Input dal componente padre per parent meta info; usata nella configurazione e nel rendering del componente.
     */
    parentMetaInfo: MetaInfo;
    /**
     * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
     */
    datasource: BehaviorSubject<DataSourceComponent>;
    /**
     * Input dal componente padre per hardcoded datasource; usata nella configurazione e nel rendering del componente.
     */
    hardcodedDatasource: DataSourceComponent;
    /**
     * Input dal componente padre per hide toolbar; quando true nasconde la toolbar del calendario.
     */
    hideToolbar: boolean;
    /**
     * Collezione dati per calendar options, consumata dal rendering e dalle operazioni del componente.
     */
    calendarOptions: CalendarOptions;
    /**
     * Collezione dati per archetype options, consumata dal rendering e dalle operazioni del componente.
     */
    archetypeOptions: SchedulerOptions;
    /**
     * Collezione dati per data, consumata dal rendering e dalle operazioni del componente.
     */
    data: any[];
    /**
     * Configurazione di presentazione per content renderers, usata nel rendering del componente.
     */
    private readonly contentRenderers;
    /**
     * Collezione dati per metas, consumata dal rendering e dalle operazioni del componente.
     */
    metas: MetadatiColonna[];
    /**
     * Proprieta di stato del componente per cols, usata dalla logica interna e dal template.
     */
    cols: any;
    /**
     * Metadati completi della route corrente (tabella, colonne, regole) usati per costruire UI e logica runtime.
     */
    metaInfo: MetaInfo;
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a loading.
     */
    loading: boolean;
    /**
     * Proprieta di stato del componente per from field, usata dalla logica interna e dal template.
     */
    fromField: string;
    /**
     * Proprieta di stato del componente per to field, usata dalla logica interna e dal template.
     */
    toField: string;
    /**
     * Proprieta di stato del componente per title field, usata dalla logica interna e dal template.
     */
    titleField: string;
    /**
     * Configurazione di presentazione per item template string, usata nel rendering del componente.
     */
    itemTemplateString: string;
    /**
     * Proprieta di stato del componente per counter, usata dalla logica interna e dal template.
     */
    counter: number;
    /**
     * Configurazione di presentazione per item template, usata nel rendering del componente.
     */
    itemTemplate: typeof DynamicGenericTemplateComponent;
    /**
     * Proprieta di stato del componente per title function, usata dalla logica interna e dal template.
     */
    titleFunction: Function;
    /**
     * Proprieta di stato del componente per fetch info sub, usata dalla logica interna e dal template.
     */
    private fetchInfoSub;
    /**
     * Proprieta di stato del componente per datasource sub, usata dalla logica interna e dal template.
     */
    private datasourceSub;
    /**
     * Inietta i servizi usati dal planner per titolo pagina, change detection e traduzioni.
     * @param titleService Servizio Angular `Title`.
     * @param cd `ChangeDetectorRef` per refresh espliciti del calendario.
     * @param trslSrv Servizio traduzioni per caption/dialog.
     */
    constructor(titleService: Title, cd: ChangeDetectorRef, trslSrv: TranslationManagerService);
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
     * Sottoscrive lo stream `fetchInfo` del datasource, applica le opzioni scheduler
     * dai metadati tabella e aggiorna gli eventi mostrati nel calendario.
     */
    subscribeToDS(): void;
    /**
     * Evita la propagazione dell'evento DOM dal contenuto custom dell'evento calendario.
     * @param $event Evento da fermare.
     */
    fix($event: any): void;
    /**
  * Interpreta e normalizza input/configurazione in `parseData` per l'utilizzo nel componente.
  * @param data Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
  * @returns Struttura dati prodotta da `parseData` dopo normalizzazione/elaborazione.
  */
    parseData(data: any): any;
    /**
  * Interpreta e normalizza input/configurazione in `parseDate` per l'utilizzo nel componente.
  * @param date Parametro utilizzato dal metodo nel flusso elaborativo.
  * @param col Parametro utilizzato dal metodo nel flusso elaborativo.
  * @returns Struttura dati prodotta da `parseDate` dopo normalizzazione/elaborazione.
  */
    parseDate(date: any, col: MetadatiColonna): Date;
    /**
  * Applica aggiornamenti di stato tramite `updateEvent` mantenendo coerenti UI e dati.
  * @param arg Parametro utilizzato dal metodo nel flusso elaborativo.
  */
    private updateEvent;
    private getColumnMetadata;
    private serializeDateForColumn;
    /**
     * Forza un re-render asincrono di FullCalendar dopo il refresh Angular,
     * utile quando il calendario viene inizializzato prima che il layout sia stabile.
     */
    private refreshCalendarView;
    onWindowResize(): void;
    private updateCalendarHeight;
    /**
     * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
     */
    ngOnDestroy(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<SchedulerListComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<SchedulerListComponent, "wuic-scheduler-list", never, { "hardcodedRoute": { "alias": "hardcodedRoute"; "required": false; }; "parentRecord": { "alias": "parentRecord"; "required": false; }; "parentMetaInfo": { "alias": "parentMetaInfo"; "required": false; }; "datasource": { "alias": "datasource"; "required": false; }; "hardcodedDatasource": { "alias": "hardcodedDatasource"; "required": false; }; "hideToolbar": { "alias": "hideToolbar"; "required": false; }; }, {}, never, never, true, never>;
}

declare class DataActionButtonComponent implements AfterViewInit, OnDestroy {
    private trslSrv;
    private cd;
    private messageService;
    private confirmationService;
    private router;
    private http;
    private metadataProvider;
    data: any;
    metaInfo: MetaInfo;
    datasource: BehaviorSubject<DataSourceComponent>;
    filter?: () => void;
    simplified: boolean;
    btn: SplitButton;
    items: MenuItem[];
    selectedValue: any;
    pkName: string;
    inlineItems: any[];
    private translationsLoadedSub?;
    constructor(trslSrv: TranslationManagerService, cd: ChangeDetectorRef, messageService: MessageService, confirmationService: ConfirmationService, router: Router, http: HttpClient, metadataProvider: MetadataProviderService);
    /**
     * Hook di debug locale per ispezionare l'evento click sul pulsante azioni.
     * @param $event Evento UI ricevuto dal template.
     */
    test($event: any): void;
    /**
     * Inizializza il menu azioni in base ai metadati tabella/colonna (`md_editable`, `md_deletable`, `md_inline_edit`, colonne `button`).
     * Calcola anche la PK corrente per le azioni route-based.
     */
    ngAfterViewInit(): void;
    ngOnDestroy(): void;
    private rebuildActionMenus;
    private translateLabel;
    /**
     * Esegue il comando dell'item selezionato se non disabilitato.
     * @param item Voce menu azione.
     */
    select(item: any): void;
    /**
     * Aggiunge al menu le azioni dinamiche derivate dalle colonne metadata di tipo `button`.
     * @param target Collezione menu da arricchire.
     */
    private appendMetadataButtonItems;
    private getButtonActionRecord;
    /**
     * Valuta se un bottone metadata e attivo verificando callback azione e condizione visibilita (`mc_button_visibility_condition`).
     * @param col Metadato colonna di tipo button.
     * @returns `true` se il bottone e eseguibile.
     */
    private isMetadataButtonEnabled;
    /**
     * Esegue l'azione custom del bottone metadata, con eventuale conferma (`mc_button_confirm_message`) e gestione errori centralizzata.
     * @param col Metadato colonna button.
     * @param record Record osservabile corrente.
     * @param event Evento UI di invocazione.
     */
    private executeMetadataButton;
    /**
     * Avvia il flusso edit del record corrente:
     * inline edit, popup `EditFormComponent` oppure navigazione route `/{route}/edit/{pk}`.
     */
    edit(): void;
    /**
     * Richiede conferma e, in caso positivo, elimina il record via `datasource.syncData(..., true)` ricaricando la griglia.
     */
    delete(): Promise<void>;
    private canRestoreFromChangeMaster;
    private appendRestoreFromChangeMasterActionAsync;
    private isLogicalDeleteSupportedRoute;
    private getRecordFieldIgnoreCase;
    private restoreFromChangeMaster;
    /**
     * Apre il record in modalita sola lettura tramite `EditFormComponent` con `readOnly: true`.
     */
    detail(): void;
    /**
     * Apre `EditFormComponent` in modalita cloning per creare una copia del record corrente.
     */
    clone(): void;
    /**
     * Salva modifiche inline sincronizzando il record osservabile con backend e riallineando il modello riga in tabella.
     */
    save(): Promise<void>;
    /**
     * Annulla l'inline edit locale della riga corrente.
     */
    cancelEdit(): Promise<void>;
    /**
     * Hook evento click principale (attualmente usato come placeholder/debug).
     * @param $event Evento click.
     */
    onClick($event: any): void;
    /**
     * Hook richiamato alla chiusura del menu split button.
     * @param $event Evento PrimeNG.
     */
    onMenuHide($event: any): void;
    /**
     * Hook richiamato all'apertura del menu split button.
     * @param $event Evento PrimeNG.
     */
    onMenuShow($event: any): void;
    /**
     * Hook click dropdown del pulsante azioni (punto estensione per custom behavior).
     * @param $event Evento click dropdown.
     */
    onDropdownClick($event: any): void;
    /**
     * Ferma la propagazione dell'evento per evitare side effects sul contenitore (es. row click/select).
     * @param $event Evento DOM.
     */
    fix($event: any): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<DataActionButtonComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DataActionButtonComponent, "wuic-data-action-button", never, { "data": { "alias": "data"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "datasource": { "alias": "datasource"; "required": false; }; "filter": { "alias": "filter"; "required": false; }; "simplified": { "alias": "simplified"; "required": false; }; }, {}, never, never, true, never>;
}

declare class LazyDataActionButtonComponent implements OnInit {
    /**
     * Input dal componente padre per data; usata nella configurazione e nel rendering del componente.
     */
    data: any;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
     */
    datasource: BehaviorSubject<any>;
    /**
     * Input dal componente padre per filter; usata nella configurazione e nel rendering del componente.
     */
    filter?: () => void;
    /**
     * Input dal componente padre per simplified; usata nella configurazione e nel rendering del componente.
     */
    simplified: boolean;
    /**
     * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
     */
    loadedComponent: any;
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): Promise<void>;
    /**
* Gestisce la logica di `componentInputs` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
* @returns Oggetto risultato costruito dal metodo per il passo successivo del flusso.
*/
    componentInputs(): {
        data: any;
        metaInfo: MetaInfo;
        datasource: BehaviorSubject<any>;
        filter: () => void;
        simplified: boolean;
    };
    static ɵfac: i0.ɵɵFactoryDeclaration<LazyDataActionButtonComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<LazyDataActionButtonComponent, "wuic-data-action-button-lazy", never, { "data": { "alias": "data"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "datasource": { "alias": "datasource"; "required": false; }; "filter": { "alias": "filter"; "required": false; }; "simplified": { "alias": "simplified"; "required": false; }; }, {}, never, never, true, never>;
}

interface AuthSessionState {
    initialized: boolean;
    loading: boolean;
    enabled: boolean;
    authenticated: boolean;
    legacyAuthenticated: boolean;
    provider?: string;
    name?: string;
    legacyName?: string;
    legacyRole?: string;
    claims?: {
        type: string;
        value: string;
    }[];
    error?: string;
    returnUrl: string;
    sessionExpiring?: boolean;
    sessionExpiresInSeconds?: number;
}
declare class AuthSessionService {
    private http;
    private userInfoService;
    private metadataProvider;
    private ngZone;
    private initialized;
    private sessionTimeoutMs;
    private sessionWarningMs;
    private sessionTimer;
    private sessionWarningTimer;
    private sessionCountdownTimer;
    private readonly stateSubject;
    readonly state$: rxjs.Observable<AuthSessionState>;
    get snapshot(): AuthSessionState;
    constructor(http: HttpClient, userInfoService: UserInfoService, metadataProvider: MetadataProviderService, ngZone: NgZone);
    /**
     * Inizializza il servizio una sola volta (o forzatamente) e carica lo stato sessione corrente via `refreshAll`.
     * @param force Se `true` forza una nuova inizializzazione anche se gia avvenuta.
     */
    initialize(force?: boolean): Promise<void>;
    /**
     * Ricalcola lo stato autenticazione combinando configurazione OAuth, endpoint `Auth/Enabled`, endpoint `Auth/Me`
     * e fallback sessione legacy (`k-user`), poi sincronizza eventuali custom settings utente.
     */
    refreshAll(): Promise<void>;
    /**
     * Aggiorna il `returnUrl` nello stato sessione applicando normalizzazione anti-open-redirect.
     * @param returnUrl URL di ritorno post login/logout.
     */
    setReturnUrl(returnUrl: string): void;
    /**
     * Avvia il login OAuth reindirizzando il browser a `Auth/Login` con `returnUrl` codificato.
     * @param returnUrl URL di ritorno post login/logout.
     */
    login(returnUrl?: string): void;
    /**
     * Esegue logout OAuth: pulisce prima stato client (storage + DB locali) e custom settings, poi redirect a `Auth/Logout`.
     * @param returnUrl URL di ritorno post login/logout.
     */
    logout(returnUrl?: string): Promise<void>;
    /**
     * Esegue login legacy via `MetaService.login`, interpreta le varianti payload storiche (`isLogged`, `value`, JSON string)
     * e in caso positivo salva l'utente nel cookie `k-user`.
     * @param username Username credenziale di autenticazione.
     * @param password Password credenziale di autenticazione.
     */
    legacyLogin(username: string, password: string, captchaToken?: string): Promise<boolean>;
    /**
     * Esegue logout legacy via `MetaService.logout` (se presente utente), poi ripulisce runtime locale e ricarica stato sessione.
     */
    legacyLogout(): Promise<void>;
    /**
     * Pulisce lo stato runtime e le cache associate.
     * Gestisce anche persistenza locale su IndexedDB/Dexie quando prevista.
     * @returns Valore restituito dal metodo (Promise<void>).
     */
    private clearClientRuntimeState;
    /**
     * Pulisce lo stato runtime e le cache associate.
     * Legge/scrive dati persistenti su storage browser.
     */
    private clearBrowserStorage;
    /**
     * Rimuove i dati target aggiornando lo stato del servizio.
     * Gestisce anche persistenza locale su IndexedDB/Dexie quando prevista.
     * @param dbName Nome database locale/remote da trattare.
     * @returns Valore restituito dal metodo (Promise<void>).
     */
    private deleteDexieDatabase;
    /**
     * Rimuove i dati target aggiornando lo stato del servizio.
     * Gestisce anche persistenza locale su IndexedDB/Dexie quando prevista.
     * @param dbName Nome database locale/remote da trattare.
     * @returns Valore restituito dal metodo (Promise<void>).
     */
    private deleteIndexedDbByName;
    /**
     * Carica e cache-a i custom settings dell'utente loggato in localStorage allineando il bootstrap sessione con MetadataProvider.
     */
    private bootstrapUserCustomSettings;
    /**
     * Configura il timeout di sessione in minuti. Chiamato dal meta-menu dopo aver letto AuthConfig.
     */
    setSessionTimeout(minutes: number, warningMinutes?: number): void;
    private activityListenersAttached;
    private setupActivityListeners;
    /**
     * Avvia/riavvia i timer di sessione. Chiamato dopo login e ad ogni attività HTTP.
     */
    resetSessionTimer(): void;
    private startSessionExpiryCountdown;
    private handleSessionExpired;
    private clearSessionTimers;
    private isUserAuthenticated;
    /**
     * Applica un aggiornamento parziale allo stato `AuthSessionState` preservando le proprieta non toccate.
     * @param partial Delta stato da fondere con lo stato corrente.
     */
    private patchState;
    /**
     * Costruisce una struttura derivata a partire dallo stato corrente.
     * @param action Azione richiesta nel flusso corrente.
     */
    private buildEndpoint;
    /**
     * Costruisce una struttura derivata a partire dallo stato corrente.
     * @param fullMethodName Nome completo metodo legacy (es. `MetaService.login`).
     */
    private buildMetaAsmxEndpoint;
    /**
     * Risolve la base URL API usata dal servizio: preferisce `appSettings.api_url`, fallback su `${window.location.origin}/api/`.
     */
    private getApiBaseUrl;
    /**
     * Valuta una condizione booleana sullo stato o sull'input corrente.
     * @returns Valore restituito dal metodo (boolean).
     */
    private isOAuthEnabledInSettings;
    /**
     * Normalizza il payload in una forma coerente per i passaggi successivi.
     * @param returnUrl URL di ritorno post login/logout.
     */
    private normalizeReturnUrl;
    /**
     * Ritorna l'URL browser corrente usato come `returnUrl` predefinito in login/logout.
     */
    private getCurrentLocalUrl;
    /**
     * Esegue il parsing del valore in ingresso con fallback sicuro.
     * @param raw Payload legacy da interpretare (stringa JSON, oggetto o wrapper con `value`).
     * @returns Valore restituito dal metodo (any).
     */
    private parseLegacyLoginResponse;
    /**
     * Estrae un messaggio errore leggibile da payload legacy eterogenei (raw/parsing/error/value) del login storico.
     * @param raw Payload grezzo risposta/errore.
     * @param parsed Payload gia interpretato.
     * @returns Messaggio errore normalizzato oppure `null`.
     */
    private extractLegacyLoginError;
    /**
     * Prova a leggere un messaggio errore da stringhe plain/JSON o da oggetti con chiavi comuni (`message`, `error`, `ExceptionMessage`).
     * @param candidate Sorgente messaggio da analizzare.
     * @returns Messaggio trovato oppure `null`.
     */
    private readMessage;
    /**
     * Log diagnostico opzionale del flusso login legacy, attivo solo con `appSettings.debugLegacyLogin === true`.
     * @param kind Tipo evento (`response` o `error`).
     * @param payload Payload da tracciare in console.
     */
    private debugLegacyLogin;
    static ɵfac: i0.ɵɵFactoryDeclaration<AuthSessionService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<AuthSessionService>;
}

type WorkflowRuntimeMenuState = {
    items: MenuItem[];
    exclusive: boolean;
};
declare class WorkflowRuntimeMenuService {
    private readonly storageKey;
    private readonly runtimeMenusSubject;
    readonly runtimeMenus$: rxjs.Observable<WorkflowRuntimeMenuState>;
    constructor();
    get snapshot(): WorkflowRuntimeMenuState;
    /**
     * Aggiorna lo stato menu runtime esposto dallo stream `runtimeMenus$`.
     * Clona i nodi in formato serializzabile, applica decorazioni command-specific e persiste lo stato in sessionStorage.
     * @param items Struttura menu runtime da pubblicare.
     * @param exclusive Se `true` il menu runtime sostituisce quello standard.
     */
    setRuntimeMenus(items: MenuItem[], exclusive?: boolean): void;
    /**
     * Pulisce lo stato runtime e le cache associate.
     */
    clearRuntimeMenus(): void;
    /**
     * Salva in sessionStorage una versione serializzabile dei menu runtime (senza funzioni/command non serializzabili).
     * @param items Menu da persistere.
     * @param exclusive Flag di modalita esclusiva menu runtime.
     */
    private persistToStorage;
    /**
     * Ripristina i menu runtime da sessionStorage al bootstrap servizio e riapplica le decorazioni command.
     */
    private restoreFromStorage;
    /**
     * Rimuove i dati target aggiornando lo stato del servizio.
     */
    private removePersistedStorage;
    /**
     * Restituisce lo storage usato per persistere menu runtime (`sessionStorage`) con guard per ambienti senza Web Storage.
     * @returns Oggetto Storage disponibile oppure `null`.
     */
    private getStorage;
    /**
     * Esegue l'operazione dati implementata da `cloneSerializableMenuItems`.
     * @param items Elementi menu/collezione da trasformare.
     * @returns Valore restituito dal metodo (MenuItem[]).
     */
    private cloneSerializableMenuItems;
    /**
     * Applica command runtime ai nodi menu serializzati.
     * In particolare il nodo con route `/` pulisce `WorkflowRuntimeMetadataService` e menu runtime per uscire dal contesto workflow.
     * @param items Collezione menu da decorare ricorsivamente.
     * @returns Nuova collezione con command ricostruiti.
     */
    private decorateMenuItems;
    static ɵfac: i0.ɵɵFactoryDeclaration<WorkflowRuntimeMenuService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<WorkflowRuntimeMenuService>;
}

declare class MetaMenuComponent implements OnInit, AfterViewInit, OnDestroy {
    private metaSrv;
    private authSession;
    private trslSrv;
    private userInfo;
    private workflowRuntimeMenu;
    private http;
    private ngZone;
    /**
     * Collezione dati per items, consumata dal rendering e dalle operazioni del componente.
     */
    items: MenuItem[];
    /**
     * Collezione dati per base items, consumata dal rendering e dalle operazioni del componente.
     */
    private baseItems;
    /**
     * Collezione dati per runtime items, consumata dal rendering e dalle operazioni del componente.
     */
    private runtimeItems;
    /**
     * Proprieta di stato del componente per runtime menu exclusive, usata dalla logica interna e dal template.
     */
    private runtimeMenuExclusive;
    /**
     * Proprieta di stato del componente per runtime menu sub, usata dalla logica interna e dal template.
     */
    private runtimeMenuSub?;
    /**
     * Proprieta di stato del componente per menu updated sub, usata dalla logica interna e dal template.
     */
    private menuUpdatedSub?;
    /**
     * Collezione dati per mega items, consumata dal rendering e dalle operazioni del componente.
     */
    megaItems: MegaMenuItem[];
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per menu.
     */
    menu: Menubar;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per menu metadata ds.
     */
    menuMetadataDs: DataSourceComponent;
    /**
     * Collezione dati per mega items2, consumata dal rendering e dalle operazioni del componente.
     */
    megaItems2: {
        label: string;
        icon: string;
        items: {
            label: string;
            items: {
                label: string;
            }[];
        }[][];
    }[];
    /**
     * Proprieta di stato del componente per observer, usata dalla logica interna e dal template.
     */
    observer: MutationObserver;
    /**
     * Proprieta di stato del componente per target node, usata dalla logica interna e dal template.
     */
    targetNode: Element;
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a config.
     */
    config: MutationObserverInit;
    /**
     * Stream osservabile per auth state$, usato per propagare aggiornamenti reattivi nel componente.
     */
    authState$: Observable<AuthSessionState>;
    /**
     * Proprieta di stato del componente per auth return url, usata dalla logica interna e dal template.
     */
    authReturnUrl: string;
    /**
     * Proprieta di stato del componente per login username, usata dalla logica interna e dal template.
     */
    loginUsername: string;
    /**
     * Proprieta di stato del componente per login password, usata dalla logica interna e dal template.
     */
    loginPassword: string;
    /**
     * Proprieta di stato del componente per post login redirect route, usata dalla logica interna e dal template.
     */
    private postLoginRedirectRoute;
    private defaultSiteRoute;
    /**
     * Proprieta di stato del componente per meta menu route, usata dalla logica interna e dal template.
     */
    metaMenuRoute: any;
    /**
     * Collezione dati per context items, consumata dal rendering e dalle operazioni del componente.
     */
    contextItems: MenuItem[];
    /**
     * Proprieta di stato del componente per menu admin methods, usata dalla logica interna e dal template.
     */
    menuAdminMethods: Set<string>;
    /**
     * Identificativo tecnico per dragged menu id, usato in matching, lookup o routing interno.
     */
    draggedMenuId: number | null;
    /**
     * Proprieta di stato del componente per move dialog visible, usata dalla logica interna e dal template.
     */
    moveDialogVisible: boolean;
    /**
     * Proprieta di stato del componente per pending move, usata dalla logica interna e dal template.
     */
    pendingMove: {
        sourceId: number;
        targetId: number;
        targetLabel?: string;
    } | null;
    /**
     * Proprieta di stato del componente per drag in progress, usata dalla logica interna e dal template.
     */
    dragInProgress: boolean;
    captchaEnabled: boolean;
    captchaSiteKey: string;
    captchaToken: string;
    private captchaWidgetId;
    registrationEnabled: boolean;
    authView: 'login' | 'register' | 'forgotPassword' | 'resetPassword';
    registerUsername: string;
    registerEmail: string;
    registerPassword: string;
    registerMessage: string;
    registerError: string;
    forgotEmail: string;
    forgotMessage: string;
    forgotError: string;
    resetToken: string;
    resetEmail: string;
    resetNewPassword: string;
    resetMessage: string;
    resetError: string;
    /**
     * Inietta i servizi usati dal componente per autenticazione, traduzioni, profilo utente,
     * metadata menu e runtime menu; espone inoltre `authState$` per il binding nel template.
     * @param metaSrv Servizio metadata che carica menu utente e metodi amministrativi.
     * @param authSession Servizio che gestisce sessione auth moderna/legacy e stato corrente.
     * @param trslSrv Servizio traduzioni usato per label fallback/risorse i18n.
     * @param userInfo Servizio helper per verificare i ruoli utente (es. admin).
     * @param workflowRuntimeMenu Stream dei menu runtime da fondere con il menu base.
     */
    constructor(metaSrv: MetadataProviderService, authSession: AuthSessionService, trslSrv: TranslationManagerService, userInfo: UserInfoService, workflowRuntimeMenu: WorkflowRuntimeMenuService, http: HttpClient, ngZone: NgZone);
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
     * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
     */
    ngOnDestroy(): void;
    /**
     * Esegue il comando associato alla voce PrimeNG, passando l'evento originale e l'item
     * nel payload atteso da `MenuItem.command`.
     * @param item Voce menu cliccata; se non espone `command` il metodo termina senza effetti.
     * @param event Evento DOM del click, inoltrato come `originalEvent`.
     */
    onMenuItemClick(item: any, event?: Event): void;
    /**
     * Forza la visibilità del primo submenu quando riceve focus su una voce menubar, evitando
     * che il popup rimanga nascosto in alcune transizioni CSS/DOM del componente PrimeNG.
     * @param $event Evento focus proveniente dall'elemento menu.
     */
    onFocus($event: any): void;
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): Promise<void>;
    /**
     * Aggiorna nel servizio auth l'URL di ritorno da usare dopo login/logout.
     */
    onAuthReturnUrlChanged(): void;
    /**
     * Avvia il login OIDC/social demandando al servizio auth il redirect verso provider.
     */
    loginWithGoogle(): void;
    /**
     * Esegue logout in modalità moderna quando abilitata; in modalità legacy invoca `legacyLogout`
     * e forza il redirect alla root applicativa.
     */
    logout(): Promise<void>;
    /**
     * Ricarica stato sessione, permessi admin menu e contenuto menu in sequenza.
     */
    refreshAuthSession(): Promise<void>;
    /**
     * Esegue login legacy con username/password. In caso di successo resetta la password,
     * sincronizza permessi/menu e applica l'eventuale redirect richiesto via query/hash.
     */
    loginLegacy(): Promise<void>;
    private loadAuthConfig;
    private loadRecaptchaScript;
    private tryRenderCaptchaWidget;
    private resetCaptchaWidget;
    private bootstrapResetPasswordFromQuery;
    switchAuthView(view: 'login' | 'register' | 'forgotPassword'): void;
    submitRegistration(): Promise<void>;
    submitForgotPassword(): Promise<void>;
    submitResetPassword(): Promise<void>;
    /**
     * Legge parametri `redirect` e `firstRunLogin` da URL (query o hash-query), normalizza
     * la route locale e precompila credenziali admin di primo avvio quando richiesto.
     */
    private bootstrapRedirectLoginFromQuery;
    /**
     * Recupera un parametro URL prima da `location.search`, poi (fallback) dalla query contenuta
     * nell'hash routing (`#/route?...`).
     * @param paramName Nome parametro da leggere.
     * @returns Valore del parametro oppure stringa vuota se non presente.
     */
    private getParamFromUrl;
    /**
     * Converte un valore testuale/etereo in booleano accettando varianti comuni di vero.
     * @param value Valore da normalizzare (`1`, `true`, `yes`, `si`).
     * @returns `true` se il valore rappresenta vero, altrimenti `false`.
     */
    private toBoolean;
    /**
     * Normalizza una route di redirect accettando path locali assoluti o URL same-origin.
     * Scarta URL esterni per evitare redirect fuori dominio.
     * @param rawRoute Route/URL grezzo letto da query/hash.
     * @returns Route locale normalizzata (`/path?...`) o stringa vuota se non valida.
     */
    private normalizeLocalRoute;
    /**
     * Restituisce le credenziali admin di bootstrap usate nel flusso `firstRunLogin`.
     * @returns Oggetto credenziali con username/password uguali ad `admin`.
     */
    private getFirstRunAdminCredential;
    /**
     * Determina se il menu deve rimanere nascosto perché è richiesta autenticazione.
     * In modalità moderna: `enabled && !authenticated`; in legacy: `!enabled && !legacyAuthenticated`.
     * @param state Snapshot corrente della sessione auth.
     * @returns `true` quando l'utente non è autenticato per la modalità attiva.
     */
    requiresAuthentication(state: AuthSessionState): boolean;
    /**
     * Decide se mostrare la barra di autenticazione.
     * È visibile sempre con auth moderna abilitata, oppure in legacy finché non autenticato.
     * @param state Snapshot corrente della sessione auth.
     * @returns `true` quando la barra auth deve essere visualizzata.
     */
    showAuthBar(state: AuthSessionState): boolean;
    /**
     * Verifica se l'utente della sessione corrente ha ruolo amministratore.
     * @param auth Stato auth opzionale da passare al controllo ruolo.
     * @returns `true` se l'utente è admin.
     */
    isAdminRole(auth?: any): boolean;
    /**
     * Abilita il menu contestuale solo per admin, su voci con `mm_id` e quando sono
     * disponibili metodi server di amministrazione menu.
     * @param auth Stato auth corrente.
     * @param item Voce menu target.
     * @returns `true` se il context menu può essere aperto.
     */
    canOpenMenuContext(auth: AuthSessionState, item: any): boolean;
    /**
     * Verifica se è consentito il drag&drop della voce: utente admin, voce valida e
     * disponibilità di almeno uno tra `reorderMenu` o `nestMenu`.
     * @param auth Stato auth corrente.
     * @param item Voce menu target.
     * @returns `true` se il drag è permesso.
     */
    canDragMenu(auth: AuthSessionState, item: any): boolean;
    /**
     * Intercetta il click destro su voce menu, costruisce le azioni contestuali disponibili
     * per quella voce e apre il context menu PrimeNG.
     * @param event Evento mouse di apertura context menu.
     * @param item Voce menu selezionata.
     * @param auth Stato auth corrente.
     * @param contextMenu Istanza context menu PrimeNG usata per la visualizzazione.
     */
    onMenuContext(event: MouseEvent, item: any, auth: AuthSessionState, contextMenu: any): void;
    /**
     * Avvia il drag della voce menu salvando l'id sorgente e impostando il payload
     * `application/x-wuic-menu-id` per il drop handler.
     * @param event Evento dragstart.
     * @param item Voce menu trascinata.
     * @param auth Stato auth corrente.
     */
    onMenuDragStart(event: DragEvent, item: any, auth: AuthSessionState): void;
    /**
     * Abilita il drop su una voce menu impostando `dropEffect = move`.
     * @param event Evento dragover.
     * @param item Voce menu target.
     * @param auth Stato auth corrente.
     */
    onMenuDragOver(event: DragEvent, item: any, auth: AuthSessionState): void;
    /**
     * Chiude lo stato di drag ripulendo id sorgente e classe CSS globale di trascinamento.
     */
    onMenuDragEnd(): void;
    /**
     * Gestisce il drop: ricava source/target id, valida i casi non ammessi (self/drop su discendente)
     * e apre il dialog di conferma per scegliere la modalità di spostamento.
     * @param event Evento drop.
     * @param item Voce menu destinazione.
     * @param auth Stato auth corrente.
     */
    onMenuDrop(event: DragEvent, item: any, auth: AuthSessionState): Promise<void>;
    /**
     * Carica il menu utente solo se l'utente risulta autenticato per la modalità attiva;
     * altrimenti svuota il menu locale e interrompe il flusso.
     */
    private loadMenuIfAllowed;
    /**
     * Ricompone `items` unendo menu base e runtime; quando `runtimeMenuExclusive` è attivo
     * mostra solo le voci runtime.
     */
    private applyMergedMenuItems;
    /**
     * Sincronizza i metodi admin disponibili per il menu (`addMenu`, `removeMenu`, `reorderMenu`, `nestMenu`).
     * Se l'utente non è admin o la chiamata fallisce, azzera permessi e context menu.
     */
    private syncMenuAdminMethods;
    /**
     * Verifica la presenza di un metodo amministrativo nel set locale sincronizzato dal server.
     * @param methodName Nome metodo admin da verificare.
     * @returns `true` se il metodo è disponibile.
     */
    hasMenuAdminMethod(methodName: string): boolean;
    /**
     * Costruisce le voci del menu contestuale per la voce selezionata.
     * Inserisce sempre "Apri metadata voce", aggiunge il gruppo "Aggiungi voce"
     * (prima/dentro/dopo) solo se e disponibile `addMenu`, e aggiunge "Rimuovi voce"
     * solo se e disponibile `removeMenu`.
     * @param item Voce menu su cui applicare le azioni contestuali.
     * @returns Elenco `MenuItem[]` mostrato dal context menu.
     */
    private buildContextItems;
    /**
     * Apre l'editor metadata della voce menu: filtra datasource su `mm_id`, carica record corrente
     * e mostra `EditFormComponent` in dialog; alla chiusura positiva notifica refresh menu.
     * @param item Voce menu di cui aprire i metadati.
     */
    private openMenuMetadata;
    /**
     * Trova il nodo target nel tree menu e restituisce il suo contesto strutturale:
     * id del parent e lista ordinata degli id fratelli nel contenitore corrente.
     * @param targetId Id del nodo target.
     * @returns Contesto `{ parentId, siblingIds }` o `null` se il nodo non esiste.
     */
    private getNodeContext;
    /**
     * Verifica se `targetId` appartiene al sottoalbero del nodo `sourceId`.
     * Usato per impedire spostamenti ciclici (un nodo dentro un proprio discendente).
     * @param sourceId Id nodo sorgente.
     * @param targetId Id nodo destinazione.
     * @returns `true` se il target è discendente della sorgente.
     */
    private isDescendant;
    /**
     * Annulla uno spostamento pendente chiudendo il dialog e ripristinando stato drag.
     */
    cancelPendingMove(): void;
    /**
     * Conferma lo spostamento pendente e invoca l'API corretta:
     * `nestMenu` per `inside`, `reorderMenu` per `before/after` con contesto fratelli.
     * @param action Modalità di posizionamento rispetto al target.
     */
    executePendingMove(action: 'before' | 'after' | 'inside'): Promise<void>;
    /**
     * Aggiorna il flag interno di drag e applica/rimuove la classe globale body
     * usata dagli stili durante il trascinamento.
     * @param active `true` per entrare in stato drag, `false` per uscirne.
     */
    private setDragState;
    /**
     * Crea una nuova voce menu prima/dentro/dopo il target usando l'API metadata,
     * poi ricarica il menu e apre subito l'editor del nuovo record.
     * @param item Voce menu target.
     * @param mode Posizione di inserimento: `before`, `inside`, `after`.
     */
    private addMenuEntry;
    /**
     * Rimuove la voce menu dopo conferma utente e notifica il refresh del menubar.
     * @param item Voce menu da eliminare.
     */
    private removeMenuEntry;
    /**
     * Restituisce la traduzione della risorsa o il fallback quando la chiave non è risolta.
     * @param resource Chiave i18n.
     * @param fallback Testo fallback.
     * @returns Testo tradotto o fallback.
     */
    private t;
    /**
     * Traduce una risorsa e sostituisce i placeholder posizionali `{0}`, `{1}`, ...
     * con i valori passati in `args`.
     * @param resource Chiave i18n.
     * @param fallback Testo fallback.
     * @param args Argomenti per sostituzione placeholder.
     * @returns Stringa formattata finale.
     */
    private tf;
    /**
     * Inizializza e riaggancia il `MutationObserver` sul menubar per adattare layout di submenu
     * quando vengono evidenziati: larghezza ul/li, float e offset sui livelli annidati.
     * Esegue solo se `menuParams` è configurato nel widget definition.
     */
    private ensureMenuObserver;
    private submenuLayoutScheduled;
    private submenuLayoutRunning;
    private scheduleSubmenuColumnLayout;
    private applySubmenuColumnLayout;
    static ɵfac: i0.ɵɵFactoryDeclaration<MetaMenuComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<MetaMenuComponent, "wuic-meta-menu", never, {}, {}, never, never, true, never>;
}

declare class LazyMetaMenuComponent implements OnInit {
    /**
     * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
     */
    loadedComponent: any;
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): Promise<void>;
    static ɵfac: i0.ɵɵFactoryDeclaration<LazyMetaMenuComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<LazyMetaMenuComponent, "wuic-meta-menu-lazy", never, {}, {}, never, never, true, never>;
}

declare class TextEditorComponent implements IFieldEditor, AfterViewInit {
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly: boolean;
    /**
     * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
     */
    valore: any;
    /**
   * function Object() { [native code] }
   */
    constructor();
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
  * Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
  * @param $event Evento UI/payload evento che innesca la logica del metodo.
  */
    modelChangeFn($event: any): Promise<void>;
    /**
  * Gestisce la logica di `beforeChange` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
  * @param $event Evento UI/payload evento che innesca la logica del metodo.
  */
    beforeChange($event: any): void;
    /**
  * Gestisce la logica di `onBlur` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
  */
    onBlur(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<TextEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<TextEditorComponent, "wuic-text-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}

declare class TextAreaEditorComponent implements IFieldEditor, AfterViewInit {
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly: boolean;
    /**
     * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
     */
    valore: any;
    /**
   * function Object() { [native code] }
   */
    constructor();
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
  * Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
  * @param $event Evento UI/payload evento che innesca la logica del metodo.
  */
    modelChangeFn($event: any): Promise<void>;
    /**
  * Gestisce la logica di `onBlur` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
  */
    onBlur(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<TextAreaEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<TextAreaEditorComponent, "wuic-text-area-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}

declare class NumberEditorComponent implements IFieldEditor, AfterViewInit {
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly: boolean;
    /**
     * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
     */
    valore: any;
    /**
     * Proprieta di stato del componente per currency code, usata dalla logica interna e dal template.
     */
    currencyCode: string;
    /**
     * Proprieta di stato del componente per locale, usata dalla logica interna e dal template.
     */
    locale: string;
    /**
   * function Object() { [native code] }
   */
    constructor();
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
  * Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
  * @param $event Evento UI/payload evento che innesca la logica del metodo.
  */
    modelChangeFn($event: any): Promise<void>;
    /**
  * Gestisce la logica di `onBlur` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
  */
    onBlur(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<NumberEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<NumberEditorComponent, "wuic-number-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}

declare class LookupEditorComponent implements IFieldEditor, AfterViewInit, OnInit {
    private trslSrv;
    private cd;
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: any;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly: boolean;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per nested source.
     */
    nestedSource: DataSourceComponent;
    /**
     * Collezione dati per items, consumata dal rendering e dalle operazioni del componente.
     */
    items: any[];
    /**
     * Collezione dati per client items, consumata dal rendering e dalle operazioni del componente.
     */
    clientItems: any[];
    /**
     * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
     */
    valore: any;
    /**
     * Proprieta di stato del componente per lookup value, usata dalla logica interna e dal template.
     */
    lookupValue: any;
    /**
     * Proprieta di stato del componente per loaded, usata dalla logica interna e dal template.
     */
    loaded: boolean;
    /**
  * function Object() { [native code] }
  * @param trslSrv Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
  * @param cd Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
  */
    constructor(trslSrv: TranslationManagerService, cd: ChangeDetectorRef);
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): void;
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
  * Gestisce la logica di `search` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI, trasformando e filtrando collezioni dati.
  * @param event Evento UI/payload evento che innesca la logica del metodo.
  */
    search(event: AutoCompleteCompleteEvent): Promise<void>;
    /**
  * Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
  * @param $event Evento UI/payload evento che innesca la logica del metodo.
  * @param removed Flag di controllo che abilita/disabilita rami specifici della logica.
  */
    modelChangeFn($event: any, removed?: boolean): Promise<void>;
    /**
  * Gestisce la logica di `onBlur` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
  */
    onBlur(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<LookupEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<LookupEditorComponent, "wuic-lookup-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}

declare class DictionaryEditorComponent implements OnInit {
    private trnSrv;
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly: boolean;
    /**
     * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
     */
    valore: any;
    /**
     * Collezione dati per items, consumata dal rendering e dalle operazioni del componente.
     */
    items: any[];
    /**
     * Proprieta di stato del componente per lookup props, usata dalla logica interna e dal template.
     */
    lookupProps: any;
    /**
  * function Object() { [native code] }
  * @param trnSrv Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
  */
    constructor(trnSrv: TranslationManagerService);
    /**
   * Verifica una condizione di stato o di validita orchestrando le chiamate `toLowerCase` e `some`.
   * @returns Esito booleano dell'elaborazione svolta dal metodo.
   */
    private isNumericDbType;
    /**
  * Gestisce la logica operativa di `coerceDictionaryValue` in modo coerente con l'implementazione corrente.
  * @param rawValue Valore in ingresso elaborato o normalizzato dal metodo.
  * @returns Risultato elaborato da `coerceDictionaryValue` e restituito al chiamante.
  */
    private coerceDictionaryValue;
    /**
  * Gestisce la logica operativa di `normalizeCurrentValueType` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`, propagando aggiornamenti sui flussi reattivi usati dalla UI, trasformando e filtrando collezioni dati.
  */
    private normalizeCurrentValueType;
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): void;
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
  * Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
  * @param $event Evento UI/payload evento che innesca la logica del metodo.
  */
    modelChangeFn($event: any): Promise<void>;
    /**
  * Gestisce la logica di `onBlur` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
  */
    onBlur(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<DictionaryEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DictionaryEditorComponent, "wuic-dictionary-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}

declare class BooleanEditorComponent implements IFieldEditor, AfterViewInit {
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly: boolean;
    /**
     * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
     */
    valore: any;
    /**
   * function Object() { [native code] }
   */
    constructor();
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
  * Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
  * @param $event Evento UI/payload evento che innesca la logica del metodo.
  */
    modelChangeFn($event: any): Promise<void>;
    private toBool;
    private isNewRecord;
    isDisabled(): boolean;
    static ɵfac: i0.ɵɵFactoryDeclaration<BooleanEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<BooleanEditorComponent, "wuic-boolean-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}

declare class DateEditorComponent implements IFieldEditor, AfterViewInit {
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly: boolean;
    /**
     * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
     */
    valore: any;
    /**
     * Proprieta di stato del componente per hour format, usata dalla logica interna e dal template.
     */
    hourFormat: string;
    /**
   * function Object() { [native code] }
   */
    constructor();
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
  * Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
  * @param $event Evento UI/payload evento che innesca la logica del metodo.
  */
    modelChangeFn($event: any): Promise<void>;
    /**
  * Gestisce la logica di `onBlur` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
  */
    onBlur(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<DateEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DateEditorComponent, "wuic-date-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}

declare class HtmlEditorComponent implements AfterViewInit {
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly: boolean;
    /**
     * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
     */
    valore: any;
    /**
   * function Object() { [native code] }
   */
    constructor();
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
  * Gestisce comportamento UI tramite `toggleEditor` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
  * @returns Esito booleano calcolato dal metodo.
  */
    toggleEditor(): boolean;
    /**
  * Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
  * @param value Valore in ingresso elaborato o normalizzato dal metodo.
  */
    modelChangeFn(value: string): Promise<void>;
    /**
  * Gestisce la logica di `onBlur` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
  */
    onBlur(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<HtmlEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<HtmlEditorComponent, "wuic-html-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}

declare class UploadEditorComponent implements OnInit, AfterViewInit {
    private trnsl;
    private usrSrv;
    private config;
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly: boolean;
    /**
     * Proprieta di stato del componente per upload path, usata dalla logica interna e dal template.
     */
    uploadPath: string;
    /**
     * Proprieta di stato del componente per upload endpoint, usata dalla logica interna e dal template.
     */
    uploadEndpoint: string;
    /**
     * Proprieta di stato del componente per mime types, usata dalla logica interna e dal template.
     */
    mimeTypes: string;
    /**
     * Proprieta di stato del componente per max file size, usata dalla logica interna e dal template.
     */
    maxFileSize: number;
    /**
     * Proprieta di stato del componente per pk name, usata dalla logica interna e dal template.
     */
    pkName: string;
    /**
     * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
     */
    valore: any;
    /**
  * function Object() { [native code] }
  * @param trnsl Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
  * @param usrSrv Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
  * @param config Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
  */
    constructor(trnsl: TranslateService, usrSrv: UserInfoService, config: PrimeNG);
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): void;
    ngAfterViewInit(): void;
    /**
  * Gestisce la logica operativa di `choose` in modo coerente con l'implementazione corrente.
  * @param event Evento che innesca il comportamento del metodo.
  * @param callback Parametro utilizzato dal metodo nel flusso elaborativo.
  */
    choose(event: any, callback: any): void;
    /**
  * Gestisce la logica di `onFileSelect` orchestrando le chiamate `getType` e `split`.
  * @param $event Evento UI/payload evento che innesca la logica del metodo.
  */
    onFileSelect($event: any): void;
    /**
  * Gestisce la logica di `onBeforeUpload` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
  * @param $event Evento UI/payload evento che innesca la logica del metodo.
  */
    onBeforeUpload($event: any): void;
    /**
  * Gestisce la logica di `onUpload` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
  * @param $event Evento UI/payload evento che innesca la logica del metodo.
  */
    onUpload($event: any): Promise<void>;
    /**
  * Gestisce la logica operativa di `formatSize` in modo coerente con l'implementazione corrente.
  * @param bytes Parametro utilizzato dal metodo nel flusso elaborativo.
  * @returns Valore stringa restituito da `formatSize`.
  */
    formatSize(bytes: any): string;
    /**
  * Esegue l'operazione di persistenza/sincronizzazione in `removeAttachment` aggiornando lo stato locale quando necessario.
  * @param field Parametro utilizzato dal metodo nel flusso elaborativo.
  */
    removeAttachment(field: any): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<UploadEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<UploadEditorComponent, "wuic-upload-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}

declare class ButtonEditorComponent {
    private confirmationService;
    private trn;
    private wtoolbox;
    /**
     * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
     */
    datasource?: any;
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record?: any;
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly: boolean;
    /**
 * function Object() { [native code] }
 * @param confirmationService Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
 * @param trn Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
 * @param wtoolbox Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
 */
    constructor(confirmationService: ConfirmationService, trn: TranslateService, wtoolbox: WtoolboxService);
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
* Valuta una condizione tramite `isButtonVisible` con il flusso specifico definito dalla sua implementazione.
* @returns Esito booleano calcolato dal metodo.
*/
    isButtonVisible(): boolean;
    /**
* Gestisce la logica di `buttonExecute` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
* @param event Evento UI/payload evento che innesca la logica del metodo.
*/
    buttonExecute(event: Event): Promise<void>;
    static ɵfac: i0.ɵɵFactoryDeclaration<ButtonEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<ButtonEditorComponent, "wuic-button-editor", never, { "datasource": { "alias": "datasource"; "required": false; }; "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}

declare class MetadataEditorService {
    private dataSrv;
    private trslSrv;
    private userInfo;
    private workflowRuntimeMetadata;
    constructor(dataSrv: DataProviderService, trslSrv: TranslationManagerService, userInfo: UserInfoService, workflowRuntimeMetadata: WorkflowRuntimeMetadataService);
    /**
     * Apre il metadata editor di colonna predisponendo le liste lookup richieste dall'UI (rotte, chiavi, relazioni)
     * e allineando il contesto runtime con i servizi metadata correnti.
     * @param field Metadato colonna/campo coinvolto nell'elaborazione.
     * @param metaSrv Servizio/metacontesto usato dal dialog editor.
     */
    openMetadataColumnEditor(field: MetadatiColonna, metaSrv: any): Promise<void>;
    /**
     * Apre l'editor metadata colonna in contesto locale (designer/runtime in-memory):
     * il salvataggio aggiorna solo `hostDatasource.metaInfo.columnMetadata` senza sync DB.
     * @param field Metadato colonna da modificare.
     * @param metaSrv Servizio metadata corrente usato per costruire il datasource editor.
     * @param hostDatasource Datasource host da aggiornare in memoria dopo il salvataggio.
     */
    openMetadataColumnEditorInContext(field: MetadatiColonna, metaSrv: any, hostDatasource?: DataSourceComponent | BehaviorSubject<DataSourceComponent> | null): Promise<void>;
    static ɵfac: i0.ɵɵFactoryDeclaration<MetadataEditorService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<MetadataEditorService>;
}

declare class FieldEditorComponent implements OnInit, OnChanges, DoCheck {
    metaSrv: MetadataProviderService;
    private trslSrv;
    private cd;
    userInfo: UserInfoService;
    private metadataEditorSrv;
    /**
     * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
     */
    datasource?: any;
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record?: any;
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly?: boolean;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per hide label; usata nella configurazione e nel rendering del componente.
     */
    hideLabel?: boolean;
    /**
     * Input dal componente padre per force show label; usata nella configurazione e nel rendering del componente.
     */
    forceShowLabel?: boolean;
    /**
     * Input dal componente padre per operator; usata nella configurazione e nel rendering del componente.
     */
    operator: string;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Proprieta di stato del componente per widget definition, usata dalla logica interna e dal template.
     */
    widgetDefinition: any;
    /**
     * Proprieta di stato del componente per widget map, usata dalla logica interna e dal template.
     */
    widgetMap: {
        [key: string]: {
            component?: any;
            loader?: () => Promise<any>;
            width?: string;
            height?: string;
        };
    };
    /**
     * Proprieta di stato del componente per widget, usata dalla logica interna e dal template.
     */
    widget: any;
    /**
     * Proprieta di stato del componente per resolved component, usata dalla logica interna e dal template.
     */
    resolvedComponent: any;
    /**
     * Mantiene il tipo widget precedente per intercettare cambi dinamici su `field.mc_ui_column_type`
     * anche quando l'oggetto `field` mantiene lo stesso riferimento.
     */
    private lastWidgetKey;
    /**
     * Proprieta di stato del componente per wtoolbox, usata dalla logica interna e dal template.
     */
    wtoolbox: typeof WtoolboxService;
    /**
     * Proprieta di stato del componente per popup ref, usata dalla logica interna e dal template.
     */
    popupRef: DynamicDialogRef<ParametricDialogComponent$1>;
    /**
     * Proprieta di stato del componente per search action, usata dalla logica interna e dal template.
     */
    searchAction: BehaviorSubject<string>;
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a search visible.
     */
    searchVisible: boolean;
    /**
  * Gestisce la logica operativa di `classes` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`.
  * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
  */
    get classes(): string | null;
    get hostFieldName(): string;
    get hostFieldId(): string;
    /**
  * function Object() { [native code] }
  * @param metaSrv Metadati correnti usati per guidare mapping, validazioni e comportamento runtime.
  * @param trslSrv Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
  * @param cd Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
  * @param userInfo Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
  * @param metadataEditorSrv Metadati correnti usati per guidare mapping, validazioni e comportamento runtime.
  */
    constructor(metaSrv: MetadataProviderService, trslSrv: TranslationManagerService, cd: ChangeDetectorRef, userInfo: UserInfoService, metadataEditorSrv: MetadataEditorService);
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): void;
    /**
  * Gestisce i cambiamenti degli input aggiornando lo stato derivato e le dipendenze del componente.
  * @param _changes Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
  */
    ngOnChanges(_changes: SimpleChanges): void;
    /**
     * Rileva mutazioni in-place del tipo widget (es. da text a dictionary nel designer)
     * e riallinea il componente editor visualizzato.
     */
    ngDoCheck(): void;
    /**
  * Gestisce la logica operativa di `ensureComponentLoaded` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`.
  */
    private ensureComponentLoaded;
    /**
  * Recupera i dati/valori richiesti da `getComponent` usando metadati server `_Metadati_*` per risolvere i campi.
  * @returns Valore risolto da `getComponent` in base ai criteri implementati.
  */
    getComponent(): any;
    /**
  * Recupera informazioni tramite `getInputs` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
  * @returns Oggetto risultato costruito dal metodo per il passo successivo del flusso.
  */
    getInputs(): {
        record: any;
        field: MetadatiColonna;
        metaInfo: MetaInfo;
        isFilter: boolean;
        nestedIndex: number;
        triggerProp: BehaviorSubject<any>;
        readOnly: boolean;
    };
    /**
  * Gestisce la logica di `condition` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
  * @returns Esito booleano calcolato dal metodo.
  */
    condition(): any;
    /**
  * Gestisce la logica di `conditionSpan` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
  * @returns Esito booleano calcolato dal metodo.
  */
    conditionSpan(): boolean;
    /**
  * Applica aggiornamenti di stato tramite `setOperator` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
  * @param $event Evento UI/payload evento che innesca la logica del metodo.
  */
    setOperator($event: any): void;
    /**
  * Gestisce la logica di `editLookupRecord` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), gestendo esplicitamente il ciclo di vita delle subscription RxJS, propagando aggiornamenti sui campi reattivi usati dalla UI.
  */
    editLookupRecord(): void;
    /**
  * Gestisce la logica di `addLookupRecord` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), gestendo esplicitamente il ciclo di vita delle subscription RxJS, propagando aggiornamenti sui campi reattivi usati dalla UI.
  */
    addLookupRecord(): void;
    /**
  * Gestisce la logica di `searchLookupRecord` con il flusso specifico definito dalla sua implementazione.
  */
    searchLookupRecord(): void;
    /**
  * Gestisce la logica operativa di `selectRow` in modo coerente con l'implementazione corrente.
  * @param $event Evento che innesca il comportamento del metodo.
  * @param rowData Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
  * @param dt Parametro utilizzato dal metodo nel flusso elaborativo.
  */
    selectRow($event: any, rowData: any, dt: any): Promise<void>;
    /**
  * Gestisce la logica operativa di `onLabelDoubleClick` orchestrando le chiamate `isCurrentUserAdmin` e `preventDefault`.
  * @param event Evento UI o payload evento che innesca il flusso del metodo.
  */
    onLabelDoubleClick(event: MouseEvent): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<FieldEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<FieldEditorComponent, "wuic-field-editor", never, { "datasource": { "alias": "datasource"; "required": false; }; "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "hideLabel": { "alias": "hideLabel"; "required": false; }; "forceShowLabel": { "alias": "forceShowLabel"; "required": false; }; "operator": { "alias": "operator"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; }, {}, never, never, true, never>;
}

declare class LazyFieldEditorComponent implements OnInit {
    /**
     * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
     */
    datasource?: any;
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record?: any;
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly?: boolean;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per hide label; usata nella configurazione e nel rendering del componente.
     */
    hideLabel?: boolean;
    /**
     * Input dal componente padre per force show label; usata nella configurazione e nel rendering del componente.
     */
    forceShowLabel?: boolean;
    /**
     * Input dal componente padre per operator; usata nella configurazione e nel rendering del componente.
     */
    operator: string;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
     */
    loadedComponent: any;
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): Promise<void>;
    /**
* Gestisce la logica di `componentInputs` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
* @returns Oggetto risultato costruito dal metodo per il passo successivo del flusso.
*/
    componentInputs(): {
        datasource: any;
        record: any;
        field: MetadatiColonna;
        metaInfo: MetaInfo;
        readOnly: boolean;
        isFilter: boolean;
        hideLabel: boolean;
        forceShowLabel: boolean;
        operator: string;
        nestedIndex: number;
        triggerProp: BehaviorSubject<any>;
    };
    static ɵfac: i0.ɵɵFactoryDeclaration<LazyFieldEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<LazyFieldEditorComponent, "wuic-field-editor-lazy", never, { "datasource": { "alias": "datasource"; "required": false; }; "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "hideLabel": { "alias": "hideLabel"; "required": false; }; "forceShowLabel": { "alias": "forceShowLabel"; "required": false; }; "operator": { "alias": "operator"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; }, {}, never, never, true, never>;
}

declare class CodeAreaEditorComponent {
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record?: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly: boolean;
    /**
     * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
     */
    valore: any;
    /**
   * function Object() { [native code] }
   */
    constructor();
    /**
* Gestisce comportamento UI tramite `toggleEditor` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
* @returns Esito booleano calcolato dal metodo.
*/
    toggleEditor(): boolean;
    static ɵfac: i0.ɵɵFactoryDeclaration<CodeAreaEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<CodeAreaEditorComponent, "lib-code-area-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}

declare class SqlModel {
    database: string;
    isDefault: boolean;
    schema: string;
    tables: SqlTable[];
    types: SqlTable[];
    functions: SqlFunctionStored[];
    storeds: SqlFunctionStored[];
}
declare class SqlFunctionStored {
    schema: string;
    name: string;
    type: string;
    parameters: SqlParameter[];
}
declare class SqlParameter {
    name: string;
    type: string;
    isOutput: boolean;
    isReadOnly: boolean;
    order: number;
    size: string;
}
declare class SqlTable {
    schema: string;
    table: string;
    alias: string;
    schemaObj: SqlModel;
    columns: SqlColumn[];
}
declare class SqlRelation {
    schemaPK: string;
    tablePK: string;
    columnPK: string;
    schemaFK: string;
    tableFK: string;
    columnFK: string;
}
declare class SqlColumn {
    schema: string;
    table: string;
    tableAlias: string;
    column: string;
    type: string;
    isNullable: boolean;
    columnDescription: string;
    isPkey: boolean;
    isIdentity: boolean;
    order: number;
    childRelations: SqlRelation[];
    parentRelation: SqlRelation;
}
type Stack<T> = {
    text: T;
    sqlDatabase?: string;
    sqlModel?: SqlModel;
    sqlTable?: SqlTable;
    parentTable?: SqlTable;
    sqlColumn?: SqlColumn;
    sqlRelation?: SqlRelation;
    sqlParameter?: SqlParameter;
    sqlFunction?: SqlFunctionStored;
    items?: Stack<T>[] | null;
};
declare class Statement {
    statement: string;
    index: number;
    words: {
        token: string;
        tokenIndx: number;
    }[];
    sqlModels: SqlModel[];
    sqlTables: {
        table: SqlTable;
        usedAlias: string;
    }[];
    sqlColumns: {
        column: SqlColumn;
        usedAlias: string;
    }[];
    sqlAliases: any[];
    subStatements: {
        key: string;
        statement: Statement;
    }[];
    constructor(statement: string, index: number);
}

declare class SqlProvider {
    private http;
    currents: CurrentProviderDataContext;
    previousStatements: string[];
    schemas: SqlModel[];
    editorOptions: any;
    userDefTypes: SqlTable[];
    treeNodes: Stack<string>[];
    private editor;
    constructor(http: HttpClient, editorOptions: any);
    /**
     * Collega Monaco editor al provider SQL registrando emitter custom per drag&drop e context menu.
     * @param editor Istanza editor Monaco.
     */
    setEditor(editor: monaco.editor.IStandaloneCodeEditor): void;
    /**
     * Inizializza autocomplete SQL: carica schema oggetti da backend, costruisce menu albero,
     * configura tokenizer Monarch e registra completion provider SQL contestuale.
     * @param treeNodes Collezione nodi albero da popolare per il toolbox SQL.
     */
    registerSqlProvider(treeNodes: Stack<string>[]): Promise<void>;
    getAutocompleteSuggestions(originalText: string, position: monaco.Position, lastWord?: monaco.editor.IWordAtPosition, scaffoldedOnly?: boolean): monaco.languages.CompletionList;
    /**
     * Trasforma modelli schema/tabelle/colonne/relazioni in struttura menu ad albero usata dal pannello editor.
     * @returns Nodi root del tree menu SQL.
     */
    private createTreeMenu;
    /**
     * Invia lo statement corrente all'endpoint parser server (`CodeEditor/ParseSql`) per validazione/test.
     * @returns Esito parser backend.
     */
    testSql(): Promise<any[]>;
    /**
     * Normalizza il testo SQL rimuovendo newline/tab e spazi multipli per facilitare parsing/tokenizzazione.
     * @param str Input SQL grezzo.
     * @returns SQL sanificato in singola linea.
     */
    sanitize(str: string): string;
    private normalizeStatement;
    /**
     * Rimuove dal testo principale i blocchi annidati tra parentesi gia individuati.
     * @param statement Statement sorgente.
     * @param nestedStatements Match dei blocchi annidati.
     * @param currentIndx Indice di partenza opzionale.
     * @returns Statement "flattened" senza sub-statement annidati.
     */
    removeNestedStatements(statement: string, nestedStatements: RegExpMatchArray[], currentIndx?: number): string;
    /**
     * Estrae i sub-statement annidati tra parentesi tonde.
     * @param statement Testo SQL.
     * @returns Match array dei blocchi annidati.
     */
    getNestedStatements(statement: string): RegExpMatchArray[];
    /**
     * Ricerca ricorsivamente un sub-statement per keyword con filtri opzionali su livello e indice parent.
     * @param currentStmnt Statement corrente della ricorsione.
     * @param matchingKeyWord Keyword da trovare.
     * @param found Oggetto accumulatore risultato.
     * @param level Livello annidamento corrente.
     * @param parentIndex Indice sub-statement del parent.
     */
    getNestedStatement(currentStmnt: Statement, matchingKeyWord: string, found: {
        key: string;
        statement: Statement;
        parentStatement: Statement;
        desiredLevel: number;
        desiredIndex: number;
    }, level?: number, parentIndex?: number): void;
    /**
     * Effettua parsing char-by-char del testo SQL costruendo una mappa per line/column/statement/nesting utile al context resolver.
     * @param text SQL completo.
     * @param position Posizione cursore Monaco.
     * @returns Struttura tokenizzata per livello annidamento.
     */
    processText(text: any, position: monaco.Position): {
        char: string;
        parentIndx: any;
        lineNumber: number;
        column: number;
        statementIndex: number;
        nestingIndex: number;
        nestingLevel: number;
    }[][];
    /**
     * Deriva il contesto autocomplete corrente (token precedenti, statement index, livello annidamento, caratteri adiacenti).
     * @param originalText Testo SQL originale.
     * @param position Posizione cursore Monaco.
     * @returns ContextInfo per il motore suggerimenti.
     */
    getContextInfo(originalText: string, position: monaco.Position): ContextInfo;
    /**
     * Implementazione legacy del context resolver mantenuta per fallback/confronto.
     * @param originalText Testo SQL originale.
     * @param position Posizione cursore Monaco.
     * @returns ContextInfo calcolato con algoritmo precedente.
     */
    getContextInfoOld(originalText: string, position: monaco.Position): ContextInfo;
    /**
     * Determina il tipo contesto autocomplete (SELECT/FROM/WHERE/JOIN/SET/...) in base ai token normalizzati dello statement corrente.
     * @param contextInfo Informazioni contesto cursore.
     * @returns Enum `autocompleteContext` risolto.
     */
    getAutocompleteContext(contextInfo: ContextInfo): autocompleteContext;
    evaluateAutocompleteContext(contextInfo: ContextInfo, statement: Statement, skipAs?: boolean, defaultAutoCtx?: autocompleteContext, contextDelegate?: (statement: Statement, contextInfo: ContextInfo) => autocompleteContext): autocompleteContext;
    /**
     * Verifica se il token parziale corrente puo ancora essere completato verso la keyword attesa dal contesto di default.
     * @param lastToken Token corrente.
     * @param defaultAutoCtx Contesto default previsto.
     * @returns `true` se il prefisso e compatibile.
     */
    private matchesDefaultContextPrefix;
    /**
     * Affina il contesto in clausola WHERE decidendo tra suggerimento colonna o operatore confronto.
     * @param currents Stato parser corrente.
     * @param currentStatementWords Token statement corrente.
     * @param whereSubStatemnt Sub-statement WHERE.
     * @returns Context specifico WHERE.
     */
    evaluateAutocompleteWhereContext(currents: CurrentProviderDataContext, currentStatementWords: string[], whereSubStatemnt: Statement): autocompleteContext.comparisonOperator | autocompleteContext.columnWhere;
    /**
     * Resetta le strutture parse correnti (dichiarazioni, statement parsed, tabelle globali).
     */
    private clearCurrents;
    /**
     * Parsifica tutti gli statement precedenti invocando ricorsivamente `parseStatementRecursive` su ciascuno.
     */
    parseStatements(): void;
    /**
     * Costruisce il modello `Statement` ricorsivo per uno statement SQL:
     * individua keyword, nested statement, tabelle, alias, colonne e relazioni.
     * @param statement Testo statement da analizzare.
     * @param stmntIndx Indice statement nel batch.
     * @param parentStatement Parent opzionale per annidamento.
     */
    private parseStatementRecursive;
    /**
     * Rileva definizioni tabelle temporanee (`#temp`) e popola la lista global tables con relative colonne/tipi.
     * @param statement Statement corrente.
     * @param found Flag stato parsing corrente.
     * @returns `true` se e stata trovata una tabella globale.
     */
    populateGlobalTables(statement: any, found: any): boolean;
    /**
     * Estrae dichiarazioni variabili (`DECLARE @...`) e associa eventuali user-defined table types disponibili.
     * @param statement Statement corrente.
     * @param found Flag stato parsing corrente.
     * @returns `true` se e stata aggiunta una dichiarazione.
     */
    private populateDeclarations;
    /**
     * Popola l'elenco colonne correnti risolvendole da SELECT + contesto tabelle/alias/schema nello statement analizzato.
     * @param element Frammento statement.
     * @param stmntIndx Indice statement.
     * @param statementObj Modello statement principale.
     * @param subStatement Sub-statement corrente.
     */
    private populateCurrentColumns;
    /**
     * Associa alias dichiarati alle tabelle risolte nel FROM/JOIN e propaga l'alias alle colonne della tabella.
     * @param element Frammento statement.
     * @param stmntIndx Indice statement.
     * @param found Flag stato parsing corrente.
     * @param statementObj Modello statement principale.
     * @param subStatement Sub-statement corrente.
     * @returns `true` se alias valido applicato.
     */
    populateAlias(element: string, stmntIndx: number, found: boolean, statementObj: Statement, subStatement: Statement): boolean;
    /**
     * Risolve riferimenti tabella `db.schema.table`/`schema.table` dentro FROM/JOIN e popola le tabelle correnti dello statement.
     * @param element Frammento statement.
     * @param stmntIndx Indice statement.
     * @param found Flag stato parsing corrente.
     * @param statementObj Modello statement principale.
     * @param subStatement Sub-statement corrente.
     * @returns `true` se tabella schema-resolved trovata.
     */
    private populateCurrentSchemaTables;
    getSuggestionsByContext(context: autocompleteContext, range: monaco.IRange, originalText: string, contextInfo: ContextInfo, scaffoldedOnly?: boolean): monaco.languages.CompletionList;
    /**
     * Estrae il nome database da un modello schema (campo esplicito o prefisso `database.schema`).
     * @param model Modello SQL schema.
     * @returns Nome database o `null`.
     */
    private getModelDatabaseName;
    /**
     * Estrae il nome schema normalizzato da un modello, rimuovendo eventuale prefisso database.
     * @param model Modello SQL schema.
     * @returns Nome schema.
     */
    private getModelSchemaName;
    /**
     * Risolve il database owner di una colonna cercando il modello schema/tabella corrispondente.
     * @param column Colonna SQL.
     * @returns Nome database o `null`.
     */
    private getColumnDatabaseName;
    /**
     * Restituisce il database di default per i suggerimenti SQL (modello marcato `isDefault` o primo schema disponibile).
     * @returns Nome database default.
     */
    private getDefaultDatabaseName;
    /**
     * Genera suggestion JOIN in base alle relazioni PK/FK della tabella corrente (child + parent relations).
     * @param statement Statement corrente.
     * @param tbl Tabella sorgente e alias in uso.
     * @param ci Collezione completion item da arricchire.
     * @param range Range Monaco di sostituzione.
     * @param schemaFilter Filtro schema opzionale.
     */
    private parseTblRelations;
    /**
     * Cerca una tabella nel catalogo schema partendo dall'alias SQL corrente.
     * @param alias Alias da risolvere.
     * @param statement Statement corrente (presente per compatibilita firma).
     * @returns Tabella risolta oppure `undefined`.
     */
    getTableByAlias(alias: string, statement: Statement): SqlTable;
}
declare class ContextInfo {
    words: {
        word: string;
        statementIndx: number;
    }[];
    nonNestedWords: {
        word: string;
        statementIndx: number;
    }[];
    currentStmntIndex: number;
    nestedStatementIndex: number;
    nestedStatementLevel?: number;
    currentStatement?: Statement;
    currentSubStatement?: {
        key: string;
        statement: Statement;
    };
    position: monaco.Position;
    absolutePosition?: number;
    adjacentChars: string;
}
declare class CurrentProviderDataContext {
    declarations: {
        paramName: string;
        paramtype: string;
        usertype?: SqlTable;
    }[];
    globalTables: SqlTable[];
    statements: Statement[];
}
declare enum autocompleteContext {
    statement = 0,
    statementSelect = 1,
    statementFrom = 2,
    statementWhere = 3,
    statementWhereJoin = 4,
    columnWhereRestricted = 5,
    columnWhereSkipAlias = 6,
    statementOn = 7,
    statementOnRelation = 8,
    comparisonOperator = 9,
    declaration = 10,
    sqlType = 11,
    schema = 12,
    schemaJoin = 13,
    table = 14,
    tableNoAs = 15,
    tableJoin = 16,
    columnSelect = 17,
    columnWhere = 18,
    columnOrder = 19,
    columnGroupBy = 20,
    variable = 21,
    columnWhereAndVariables = 22,
    statementSet = 23,
    assignmentOperator = 24,
    statementValues = 25
}

declare class TSProvider {
    private http;
    previousStatements: string[];
    schemas: SqlModel[];
    editorOptions: EditorOptions;
    userDefTypes: SqlTable[];
    treeNodes: Stack<string>[];
    private editor;
    contextMenuEvent: {
        event: {
            leftButton: boolean;
            middleButton: boolean;
            rightButton: boolean;
            buttons: number;
            detail: number;
            ctrlKey: boolean;
            shiftKey: boolean;
            altKey: boolean;
            posx: number;
            posy: number;
            editorPos: {
                x: number;
                y: number;
                width: number;
                height: number;
            };
            relativePos: {
                x: number;
                y: number;
            };
            preventDefault: () => void;
            stopPropagation: () => void;
        };
        target: {
            element: HTMLElement;
            position: monaco.Position;
            range: monaco.IRange;
            mouseColumn: number;
            type: number;
        };
    };
    snippets: {
        [key: string]: string;
    };
    constructor(http: HttpClient, editorOptions: EditorOptions);
    /**
     * Inserisce nello script editor lo snippet selezionato dal menu contestuale, sostituendo il range corrente.
     * @param snippetKey Chiave snippet.
     * @param snippetValue Contenuto snippet da inserire.
     */
    snippeter(snippetKey: any, snippetValue: any): void;
    /**
     * Collega l'istanza Monaco al provider TS e registra emitter custom per drag&drop e context menu.
     * @param editor Istanza editor Monaco.
     */
    setEditor(editor: monaco.editor.IStandaloneCodeEditor): void;
    /**
     * Configura il linguaggio TS editor per callback metadata:
     * snippet menu, compiler options, extra libs `.d.ts`, tipi route-specific e code context dinamico.
     * @param formFieldOptions Config custom editor (libs/compilatore/context/snippet).
     * @param field Colonna metadata in editing.
     * @param codeContext Signature/template funzione corrente.
     * @param record Record corrente.
     * @param metaSrv Servizio metadata usato per derivare tipi route/lookup.
     * @param userInfo Contesto utente runtime.
     */
    registerTSProvider(formFieldOptions: any, field: MetadatiColonna, codeContext: string, record: any, metaSrv: MetadataProviderService, userInfo: any): Promise<void>;
}

type WuicComponentBindings = {
    inputs?: string[];
    outputs?: string[];
    twoWay?: string[];
};

declare class HtmlProvider {
    private editorOptions;
    private componentSelectors;
    private componentBindings;
    private editor;
    private validateHandle;
    private readonly markerOwner;
    private completionProviderDisposable;
    private formatterDisposable;
    private readonly htmlSnippets;
    constructor(editorOptions: EditorOptions, componentSelectors?: string[], componentBindings?: Record<string, WuicComponentBindings>);
    /**
     * Configura il provider HTML: imposta linguaggio editor e registra completion + formatter.
     */
    registerHtmlProvider(): void;
    /**
     * Associa l'istanza Monaco editor al provider e attiva validazione live su change contenuto/modello.
     * @param editor Istanza editor Monaco.
     */
    setEditor(editor: monaco.editor.IStandaloneCodeEditor): void;
    /**
     * Rilascia risorse registrate (timeout validate, provider completion e formatter).
     */
    dispose(): void;
    /**
     * Debounce della validazione HTML per evitare parsing marker ad ogni singolo keystroke.
     */
    private scheduleValidate;
    /**
     * Esegue validazione immediata del documento HTML combinando parse errors `parse5` e regole strict custom.
     */
    private validateNow;
    /**
     * Costruisce marker strict su pattern sospetti (tag malformati, `on*=` inline, `javascript:` URL) e delega ai validator dedicati.
     * @param content Contenuto HTML corrente.
     * @param model Modello Monaco.
     * @returns Marker warning/error aggiuntivi.
     */
    private buildStrictMarkers;
    /**
     * Verifica bilanciamento tag opening/closing con stack parser lightweight.
     * @param content Contenuto HTML corrente.
     * @param model Modello Monaco.
     * @returns Marker per tag non chiusi o chiusure senza apertura.
     */
    private buildTagBalanceMarkers;
    /**
     * Valida sintassi Angular template (interpolazioni, binding `[x]`, `(x)`, `[(x)]`, direttive `*ng...`).
     * @param content Contenuto template.
     * @param model Modello Monaco.
     * @returns Marker syntax per pattern Angular non validi/incompleti.
     */
    private buildAngularSyntaxMarkers;
    /**
     * Registra completion provider HTML/WUIC con suggerimenti tag snippet e binding Angular contestuali al componente.
     */
    private registerCompletionProvider;
    private getOpenTagContext;
    /**
     * Genera completion item per `@Input`, `@Output`, two-way binding e direttive strutturali del tag corrente.
     * @param tagName Nome tag in editing.
     * @param range Range Monaco di sostituzione testo.
     * @returns Suggerimenti binding Angular.
     */
    private buildAngularBindingSuggestions;
    /**
     * Registra formatter documento HTML completo, delegando la formattazione a `formatHtml`.
     */
    private registerDocumentFormatter;
    /**
     * Applica una formattazione HTML basic (line-break/indentazione) senza parser DOM completo.
     * @param input Testo HTML grezzo.
     * @returns HTML formattato.
     */
    private formatHtml;
}

declare class CodeEditorComponent implements OnInit, AfterViewInit, OnDestroy {
    private monacoLoaderService;
    private http;
    private metaSrv;
    private userInfo;
    private dataSrv;
    private wtoolbox;
    private sanitizer;
    /**
     * Configurazione di presentazione per style, usata nel rendering del componente.
     */
    style: string;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per context menu anchor.
     */
    contextMenuAnchor: any;
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record?: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per editor ref.
     */
    editorRef: MonacoEditorComponent | undefined;
    /**
     * Proprieta di stato del componente per editor, usata dalla logica interna e dal template.
     */
    editor: monaco.editor.IStandaloneCodeEditor | undefined;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per ctxs.
     */
    ctxs: any;
    /**
     * Collezione dati per editor options, consumata dal rendering e dalle operazioni del componente.
     */
    editorOptions: EditorOptions;
    /**
     * Proprieta di stato del componente per editor model value, usata dalla logica interna e dal template.
     */
    editorModelValue: string;
    /**
     * Proprieta di stato del componente per sample code, usata dalla logica interna e dal template.
     */
    sampleCode: string;
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a fullscreen.
     */
    fullscreen: boolean;
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a render.
     */
    render: boolean;
    /**
     * Collezione dati per tree nodes, consumata dal rendering e dalle operazioni del componente.
     */
    treeNodes: any[];
    /**
     * Collezione dati per prime tree nodes, consumata dal rendering e dalle operazioni del componente.
     */
    primeTreeNodes: any[];
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a sql obj view.
     */
    sqlObjView: boolean;
    /**
     * Proprieta di stato del componente per sql provider, usata dalla logica interna e dal template.
     */
    sqlProvider: SqlProvider | undefined;
    /**
     * Collezione dati per errors, consumata dal rendering e dalle operazioni del componente.
     */
    errors: {
        Message: string;
    }[];
    /**
     * Proprieta di stato del componente per code context, usata dalla logica interna e dal template.
     */
    codeContext: string;
    /**
     * Proprieta di stato del componente per ts provider, usata dalla logica interna e dal template.
     */
    tsProvider: TSProvider;
    /**
     * Configurazione di presentazione per html provider, usata nel rendering del componente.
     */
    htmlProvider: HtmlProvider | undefined;
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a show html preview.
     */
    showHtmlPreview: boolean;
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a auto format html.
     */
    autoFormatHtml: boolean;
    /**
     * Configurazione di presentazione per sanitized html preview, usata nel rendering del componente.
     */
    sanitizedHtmlPreview: SafeHtml | string;
    /**
     * Configurazione di presentazione per html format handle, usata nel rendering del componente.
     */
    private htmlFormatHandle;
    /**
     * Proprieta di stato del componente per skip next auto format, usata dalla logica interna e dal template.
     */
    private skipNextAutoFormat;
    /**
     * Proprieta di stato del componente per layout raf, usata dalla logica interna e dal template.
     */
    private layoutRaf;
    /**
     * Collezione dati per scroll hosts, consumata dal rendering e dalle operazioni del componente.
     */
    private scrollHosts;
    /**
     * Proprieta di stato del componente per on host scroll, usata dalla logica interna e dal template.
     */
    private readonly onHostScroll;
    /**
     * Proprieta di stato del componente per record value sub, usata dalla logica interna e dal template.
     */
    private recordValueSub;
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a syncing from record.
     */
    private syncingFromRecord;
    /**
 * function Object() { [native code] }
 * @param monacoLoaderService Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
 * @param http Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
 * @param metaSrv Metadati correnti usati per guidare mapping, validazioni e comportamento runtime.
 * @param userInfo Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
 * @param dataSrv Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
 * @param wtoolbox Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
 * @param sanitizer Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
 */
    constructor(monacoLoaderService: MonacoEditorLoaderService, http: HttpClient, metaSrv: MetadataProviderService, userInfo: UserInfoService, dataSrv: DataProviderService, wtoolbox: WtoolboxService, sanitizer: DomSanitizer);
    private t;
    /**
* Applica aggiornamenti di stato tramite `setFullScreen` mantenendo coerenti UI e dati.
* @param $event Evento che innesca il comportamento del metodo.
* @param ctx Parametro utilizzato dal metodo nel flusso elaborativo.
*/
    setFullScreen($event: any, ctx: any): void;
    /**
* Gestisce la logica operativa di `toggleSqlObjView` in modo coerente con l'implementazione corrente.
* @param $event Evento che innesca il comportamento del metodo.
* @param ctx Parametro utilizzato dal metodo nel flusso elaborativo.
*/
    toggleSqlObjView($event: any, ctx: any): void;
    /**
* Gestisce la logica di `onContentChange` con il flusso specifico definito dalla sua implementazione.
* @param $event Evento UI/payload evento che innesca la logica del metodo.
*/
    onContentChange($event: any): void;
    /**
 * Gestisce la logica operativa di `onTreeNodeDragStart` orchestrando le chiamate `stopPropagation` e `onNodeDragStart`.
 * @param event Evento UI o payload evento che innesca il flusso del metodo.
 * @param dataItem Record/elemento su cui il metodo applica elaborazioni o aggiornamenti.
 */
    onTreeNodeDragStart(event: DragEvent, dataItem: any): void;
    /**
 * Gestisce la logica operativa di `onTreeNodeDragEnd` orchestrando le chiamate `stopPropagation` e `onNodeDragEnd`.
 * @param event Evento UI o payload evento che innesca il flusso del metodo.
 * @param dataItem Record/elemento su cui il metodo applica elaborazioni o aggiornamenti.
 */
    onTreeNodeDragEnd(event: DragEvent, dataItem: any): void;
    /**
* Gestisce la logica operativa di `testSql` in modo coerente con l'implementazione corrente.
* @param $event Evento che innesca il comportamento del metodo.
* @param ctx Parametro utilizzato dal metodo nel flusso elaborativo.
*/
    testSql($event: any, ctx: any): Promise<void>;
    /**
* Gestisce la logica operativa di `suggest` in modo coerente con l'implementazione corrente.
* @param $event Evento che innesca il comportamento del metodo.
* @param ctx Parametro utilizzato dal metodo nel flusso elaborativo.
*/
    suggest($event: any, ctx: any): Promise<void>;
    /**
* Gestisce la logica di `onEditorModelChange` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
* @param value Valore in ingresso elaborato o normalizzato dal metodo.
*/
    onEditorModelChange(value: string): void;
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): void;
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
     * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
     */
    ngOnDestroy(): void;
    /**
 * Gestisce la logica operativa di `scheduleEditorLayout` orchestrando le chiamate `cancelAnimationFrame` e `requestAnimationFrame`.
 */
    private scheduleEditorLayout;
    /**
* Recupera i dati/valori richiesti da `getScrollableAncestors`.
* @param start Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Collezione `HTMLElement[]` derivata dalla trasformazione dei dati nel metodo `getScrollableAncestors`.
*/
    private getScrollableAncestors;
    /**
 * Gestisce la logica operativa di `bindRecordValue` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`, gestendo subscription RxJS in modo esplicito.
 */
    private bindRecordValue;
    /**
* Valuta una condizione tramite `isHtmlEditor` con il flusso specifico definito dalla sua implementazione.
* @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
*/
    get isHtmlEditor(): boolean;
    /**
     * Valuta una condizione tramite `isJsonEditor` con il flusso specifico definito dalla sua implementazione.
     * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
     */
    get isJsonEditor(): boolean;
    /**
 * Gestisce il comportamento UI di `toggleHtmlPreview` orchestrando le chiamate `stopPropagation` e `preventDefault`.
 * @param $event Evento UI o payload evento che innesca il flusso del metodo.
 */
    toggleHtmlPreview($event: any): void;
    /**
 * Gestisce la logica operativa di `formatHtmlNow` orchestrando le chiamate `stopPropagation` e `preventDefault`.
 * @param $event Evento UI o payload evento che innesca il flusso del metodo.
 */
    formatHtmlNow($event?: any): void;
    /**
     * Gestisce la logica operativa di `formatJsonNow` orchestrando parse/stringify JSON e sync nel model editor.
     * @param $event Evento UI o payload evento che innesca il flusso del metodo.
     */
    formatJsonNow($event?: any): void;
    /**
 * Gestisce la logica operativa di `scheduleAutoFormatHtml` orchestrando le chiamate `clearTimeout` e `setTimeout`.
 */
    private scheduleAutoFormatHtml;
    /**
 * Gestisce la logica operativa di `refreshHtmlPreview` orchestrando le chiamate `sanitizeHtmlForPreview`.
 */
    private refreshHtmlPreview;
    /**
* Gestisce la logica operativa di `sanitizeHtmlForPreview` in modo coerente con l'implementazione corrente.
* @param rawHtml Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Valore di tipo `SafeHtml | string` prodotto da `sanitizeHtmlForPreview`.
*/
    private sanitizeHtmlForPreview;
    /**
* Gestisce la logica operativa di `transformAngularTemplateForPreview` in modo coerente con l'implementazione corrente.
* @param doc Parametro utilizzato dal metodo nel flusso elaborativo.
*/
    private transformAngularTemplateForPreview;
    /**
* Gestisce la logica operativa di `extractMetaColumnCaption` in modo coerente con l'implementazione corrente.
* @param node Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Stringa risultante calcolata da `extractMetaColumnCaption` per chiavi/label o valori testuali.
*/
    private extractMetaColumnCaption;
    /**
* Trasforma i dati in una forma coerente con rendering o payload normalizzando e trasformando collezioni di record.
* @param nodes Collezione di input processata dal metodo (normalizzazione, filtri e mapping).
* @returns Collezione di tipo `any[]` derivata dalle trasformazioni applicate nel metodo.
*/
    private mapToPrimeTreeNodes;
    static ɵfac: i0.ɵɵFactoryDeclaration<CodeEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<CodeEditorComponent, "wuic-code-editor", never, { "field": { "alias": "field"; "required": false; }; "record": { "alias": "record"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; }, {}, never, never, true, never>;
}

declare class DynamicRowTemplateComponent {
    /**
     * Configurazione di presentazione per table style condition cache, usata nel rendering del componente.
     */
    private static readonly tableStyleConditionCache;
    /**
     * Configurazione di presentazione per column style condition cache, usata nel rendering del componente.
     */
    private static readonly columnStyleConditionCache;
    /**
     * Input dal componente padre per row data; usata nella configurazione e nel rendering del componente.
     */
    rowData: any;
    /**
     * Input dal componente padre per columns; usata nella configurazione e nel rendering del componente.
     */
    columns: MetadatiColonna[];
    /**
     * Input dal componente padre per expanded; usata nella configurazione e nel rendering del componente.
     */
    expanded: boolean;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
     */
    datasource: DataSourceComponent;
    /**
     * Input dal componente padre per dt; usata nella configurazione e nel rendering del componente.
     */
    dt: Table;
    /**
     * Input dal componente padre per toggle row; usata nella configurazione e nel rendering del componente.
     */
    toggleRow: (rowData: any, $event: any, dt: Table) => void;
    /**
     * Input dal componente padre per row select; usata nella configurazione e nel rendering del componente.
     */
    rowSelect: (rowData: any, $event: any, dt: Table) => void;
    /**
     * Input dal componente padre per row custom select; usata nella configurazione e nel rendering del componente.
     */
    rowCustomSelect: (rowData: any, $event: any, dt: Table) => void;
    /**
     * Input dal componente padre per metadati colonna; usata nella configurazione e nel rendering del componente.
     */
    MetadatiColonna: typeof MetadatiColonna;
    /**
 * Gestisce la logica operativa di `classes` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`.
 * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
 */
    get classes(): string | null;
    /**
* Recupera e prepara i dati richiesti dal chiamante normalizzando e trasformando collezioni di record, usando i metadati per determinare campi, chiavi e comportamento runtime, allineando i record al formato atteso dal framework.
* @returns Collezione di tipo `string[]` derivata dalle trasformazioni applicate nel metodo.
*/
    private getTableStyleClasses;
    /**
* Costruisce una struttura di output a partire dal contesto corrente usando i metadati per determinare campi, chiavi e comportamento runtime, allineando i record al formato atteso dal framework.
* @param conditionCode Valore testuale usato come chiave, campo, route o parametro di configurazione.
* @returns Valore di tipo `(metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean` costruito dal metodo per i passaggi successivi del flusso.
*/
    private buildTableStylePredicate;
    /**
* Recupera e prepara i dati richiesti dal chiamante normalizzando e trasformando collezioni di record, usando i metadati per determinare campi, chiavi e comportamento runtime, allineando i record al formato atteso dal framework.
* @param metaColumn Metadati correnti usati per guidare mapping, validazioni e comportamento runtime.
* @param rowData Record/elemento su cui vengono applicate elaborazioni o aggiornamenti.
* @returns Valore di tipo `string | null` costruito dal metodo per i passaggi successivi del flusso.
*/
    getCellClasses(metaColumn: any, rowData: any): string | null;
    /**
* Recupera e prepara i dati richiesti dal chiamante usando i metadati per determinare campi, chiavi e comportamento runtime.
* @param fieldName Valore testuale usato come chiave, campo, route o parametro di configurazione.
* @returns Valore di tipo `MetadatiColonna | null` costruito dal metodo per i passaggi successivi del flusso.
*/
    getMetaColumn(fieldName: string): MetadatiColonna | null;
    /**
* Recupera i dati/valori richiesti da `getComponentFromTemplate`.
* @param template Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Valore risolto da `getComponentFromTemplate` in base ai criteri implementati.
*/
    static getComponentFromTemplate(template: string): typeof DynamicRowTemplateComponent;
    /**
* Gestisce la logica di `onRowSelect` orchestrando le chiamate `rowCustomSelect`.
* @param $event Evento UI/payload evento che innesca la logica del metodo.
* @param rowData Dato/record su cui il metodo applica trasformazioni, validazioni o aggiornamenti.
*/
    onRowSelect($event: any, rowData: any): void;
    /**
   * Verifica una condizione di stato o di validita normalizzando e trasformando collezioni di record.
   * @returns Esito booleano dell'elaborazione svolta dal metodo.
   */
    private isSelectedRow;
    /**
* Gestisce la logica operativa di `areSameRow` in modo coerente con l'implementazione corrente.
* @param a Parametro utilizzato dal metodo nel flusso elaborativo.
* @param b Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Esito booleano della verifica/esecuzione effettuata da `areSameRow`.
*/
    private areSameRow;
    static ɵfac: i0.ɵɵFactoryDeclaration<DynamicRowTemplateComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DynamicRowTemplateComponent, "wuic-dynamic-row-template", never, { "rowData": { "alias": "rowData"; "required": false; }; "columns": { "alias": "columns"; "required": false; }; "expanded": { "alias": "expanded"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "datasource": { "alias": "datasource"; "required": false; }; "dt": { "alias": "dt"; "required": false; }; "toggleRow": { "alias": "toggleRow"; "required": false; }; "rowSelect": { "alias": "rowSelect"; "required": false; }; "rowCustomSelect": { "alias": "rowCustomSelect"; "required": false; }; "MetadatiColonna": { "alias": "MetadatiColonna"; "required": false; }; }, {}, never, never, true, never>;
}

declare class ImageWrapperComponent {
    /**
     * Input dal componente padre per src; usata nella configurazione e nel rendering del componente.
     */
    src: string;
    /**
     * Input dal componente padre per preview image src; usata nella configurazione e nel rendering del componente.
     */
    previewImageSrc: string;
    /**
     * Input dal componente padre per append to; usata nella configurazione e nel rendering del componente.
     */
    appendTo: any;
    /**
     * Input dal componente padre per alt; usata nella configurazione e nel rendering del componente.
     */
    alt: string;
    /**
     * Input dal componente padre per width; usata nella configurazione e nel rendering del componente.
     */
    width: string;
    /**
     * Input dal componente padre per height; usata nella configurazione e nel rendering del componente.
     */
    height: string;
    /**
     * Input dal componente padre per style; usata nella configurazione e nel rendering del componente.
     */
    style: string;
    /**
     * Input dal componente padre per style class; usata nella configurazione e nel rendering del componente.
     */
    styleClass: string;
    /**
     * Input dal componente padre per preview; usata nella configurazione e nel rendering del componente.
     */
    preview: boolean;
    /**
   * function Object() { [native code] }
   */
    constructor();
    static ɵfac: i0.ɵɵFactoryDeclaration<ImageWrapperComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<ImageWrapperComponent, "wuic-image-wrapper", never, { "src": { "alias": "src"; "required": false; }; "previewImageSrc": { "alias": "previewImageSrc"; "required": false; }; "appendTo": { "alias": "appendTo"; "required": false; }; "alt": { "alias": "alt"; "required": false; }; "width": { "alias": "width"; "required": false; }; "height": { "alias": "height"; "required": false; }; "style": { "alias": "style"; "required": false; }; "styleClass": { "alias": "styleClass"; "required": false; }; "preview": { "alias": "preview"; "required": false; }; }, {}, never, never, true, never>;
}

declare class LazyImageWrapperComponent implements OnInit {
    /**
     * Input dal componente padre per src; usata nella configurazione e nel rendering del componente.
     */
    src: string;
    /**
     * Input dal componente padre per preview image src; usata nella configurazione e nel rendering del componente.
     */
    previewImageSrc: string;
    /**
     * Input dal componente padre per append to; usata nella configurazione e nel rendering del componente.
     */
    appendTo: any;
    /**
     * Input dal componente padre per alt; usata nella configurazione e nel rendering del componente.
     */
    alt: string;
    /**
     * Input dal componente padre per width; usata nella configurazione e nel rendering del componente.
     */
    width: string;
    /**
     * Input dal componente padre per height; usata nella configurazione e nel rendering del componente.
     */
    height: string;
    /**
     * Input dal componente padre per style; usata nella configurazione e nel rendering del componente.
     */
    style: string;
    /**
     * Input dal componente padre per style class; usata nella configurazione e nel rendering del componente.
     */
    styleClass: string;
    /**
     * Input dal componente padre per preview; usata nella configurazione e nel rendering del componente.
     */
    preview: boolean;
    /**
     * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
     */
    loadedComponent: any;
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): Promise<void>;
    /**
* Gestisce la logica di `componentInputs` con il flusso specifico definito dalla sua implementazione.
* @returns Oggetto risultato costruito dal metodo per il passo successivo del flusso.
*/
    componentInputs(): {
        src: string;
        previewImageSrc: string;
        appendTo: any;
        alt: string;
        width: string;
        height: string;
        style: string;
        styleClass: string;
        preview: boolean;
    };
    static ɵfac: i0.ɵɵFactoryDeclaration<LazyImageWrapperComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<LazyImageWrapperComponent, "wuic-image-wrapper-lazy", never, { "src": { "alias": "src"; "required": false; }; "previewImageSrc": { "alias": "previewImageSrc"; "required": false; }; "appendTo": { "alias": "appendTo"; "required": false; }; "alt": { "alias": "alt"; "required": false; }; "width": { "alias": "width"; "required": false; }; "height": { "alias": "height"; "required": false; }; "style": { "alias": "style"; "required": false; }; "styleClass": { "alias": "styleClass"; "required": false; }; "preview": { "alias": "preview"; "required": false; }; }, {}, never, never, true, never>;
}

declare class ColorEditorComponent implements IFieldEditor, AfterViewInit {
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly: boolean;
    /**
     * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
     */
    valore: any;
    /**
   * function Object() { [native code] }
   */
    constructor();
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
  * Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
  * @param $event Evento UI/payload evento che innesca la logica del metodo.
  */
    modelChangeFn($event: any): Promise<void>;
    static ɵfac: i0.ɵɵFactoryDeclaration<ColorEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<ColorEditorComponent, "wuic-color-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}

declare class PropertyArrayEditorComponent implements OnInit {
    private trnsl;
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly: boolean;
    /**
     * Proprieta di stato del componente per nested meta info, usata dalla logica interna e dal template.
     */
    nestedMetaInfo: MetaInfo;
    /**
     * Proprieta di stato del componente per nested obj, usata dalla logica interna e dal template.
     */
    nestedObj: IDesignerProperties;
    /**
     * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
     */
    valore: any;
    /**
 * function Object() { [native code] }
 * @param trnsl Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
 */
    constructor(trnsl: TranslationManagerService);
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): void;
    /**
* Gestisce la logica di `addObj` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI, trasformando e filtrando collezioni dati.
*/
    addObj(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<PropertyArrayEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<PropertyArrayEditorComponent, "wuic-property-array-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}

declare class PropertyObjectEditorComponent implements OnInit {
    private trnsl;
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: MetaInfo;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly: boolean;
    /**
     * Proprieta di stato del componente per nested meta info, usata dalla logica interna e dal template.
     */
    nestedMetaInfo: MetaInfo;
    /**
     * Proprieta di stato del componente per nested obj, usata dalla logica interna e dal template.
     */
    nestedObj: IDesignerProperties;
    /**
     * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
     */
    valore: any;
    /**
 * function Object() { [native code] }
 * @param trnsl Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
 */
    constructor(trnsl: TranslationManagerService);
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<PropertyObjectEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<PropertyObjectEditorComponent, "wuic-property-object-editor", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}

declare class TreeViewSelectorComponent implements OnInit {
    /**
     * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
     */
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    /**
     * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
     */
    field: MetadatiColonna;
    /**
     * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
     */
    metaInfo: any;
    /**
     * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
     */
    isFilter?: boolean;
    /**
     * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
     */
    nestedIndex: number;
    /**
     * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
     */
    triggerProp: BehaviorSubject<any>;
    /**
     * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
     */
    readOnly: boolean;
    /**
     * Input dal componente padre per nodes; usata nella configurazione e nel rendering del componente.
     */
    nodes: any[];
    /**
   * function Object() { [native code] }
   */
    constructor();
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): void;
    /**
* Gestisce la logica di `onNodeExpand` con il flusso specifico definito dalla sua implementazione.
* @param $event Evento UI/payload evento che innesca la logica del metodo.
*/
    onNodeExpand($event: any): void;
    /**
* Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
* @param value Valore in ingresso elaborato o normalizzato dal metodo.
*/
    modelChangeFn(value: any): Promise<void>;
    static ɵfac: i0.ɵɵFactoryDeclaration<TreeViewSelectorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<TreeViewSelectorComponent, "wuic-tree-view-selector", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; "nodes": { "alias": "nodes"; "required": false; }; }, {}, never, never, true, never>;
}

declare class ParametricDialogComponent implements OnDestroy {
    ref: DynamicDialogRef | null;
    config: DynamicDialogConfig | null;
    private route;
    private router;
    private trnsl;
    /**
     * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
     */
    datasource: BehaviorSubject<DataSourceComponent>;
    /**
     * Input dal componente padre per hardcoded datasource; usata nella configurazione e nel rendering del componente.
     */
    hardcodedDatasource: DataSourceComponent;
    /**
     * Input dal componente padre per hide toolbar; quando true nasconde la button bar in basso.
     */
    hideToolbar: boolean;
    /**
   * Input dal componente padre per indicare se il dialogo è un wizard; quando true abilita il comportamento wizard.
   */
    isWizard: boolean;
    /**
   * Input dal componente padre per indicare se il dialogo è un edit form; quando true abilita comportamenti specifici per edit form.
   */
    isEditForm: boolean;
    /**
     * Input dal componente padre per readOnly; quando true disabilita interazioni e azioni di modifica.
     */
    readOnly: boolean;
    /**
     * Record corrente in edit/view, usato da editor e callback dinamiche del componente.
     */
    record: any;
    /**
     * Collezione dati per metas, consumata dal rendering e dalle operazioni del componente.
     */
    metas: MetadatiColonna[];
    /**
     * Metadati completi della route corrente (tabella, colonne, regole) usati per costruire UI e logica runtime.
     */
    metaInfo: MetaInfo;
    /**
     * Proprieta di stato del componente per route name, usata dalla logica interna e dal template.
     */
    routeName: BehaviorSubject<string>;
    /**
     * Proprieta di stato del componente per pristine, usata dalla logica interna e dal template.
     */
    pristine: any;
    /**
     * Configurazione di presentazione per form template, usata nel rendering del componente.
     */
    formTemplate: any;
    /**
   * Flag di stato che governa il comportamento UI/logico relativo a cloning.
   */
    cloning: boolean;
    /**
     * Proprieta di stato del componente per wtoolbox, usata dalla logica interna e dal template.
     */
    wtoolbox: typeof WtoolboxService;
    /**
     * Proprieta di stato del componente per conditions bootstrapped, usata dalla logica interna e dal template.
     */
    private conditionsBootstrapped;
    /**
     * Proprieta di stato del componente per fetch info subscription, usata dalla logica interna e dal template.
     */
    private fetchInfoSubscription?;
    /**
     * Collezione dati per record value subscriptions, consumata dal rendering e dalle operazioni del componente.
     */
    private recordValueSubscriptions;
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a disable callbacks running.
     */
    private disableCallbacksRunning;
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a disable callbacks pending.
     */
    private disableCallbacksPending;
    /**
     * Valore tab attivo usato da PrimeNG Tabs.
     */
    activeTabValue: number;
    get visibleDataTabs(): any[];
    /**
   * Restituisce il value tab/panel con mapping stabile:
   * il tab selezionato vale 0, gli altri valgono 1..N.
   * @param dataTab Tab visibile corrente.
   * @param index Indice del tab visibile nel loop.
   * @returns Valore numerico usato da PrimeNG per matching tab/panel.
  */
    getTabValue(dataTab: any, index: number): number;
    /**
   * Gestisce il cambio tab proveniente da PrimeNG aggiornando lo stato metadata.
   * @param value Value emesso dal tab selezionato.
  */
    onTabValueChange(value: any): void;
    /**
  * function Object() { [native code] }
  * @param ref Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
  * @param config Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
  * @param route Informazione di navigazione usata per risolvere la route di destinazione.
  * @param router Informazione di navigazione usata per risolvere la route di destinazione.
  */
    constructor(ref: DynamicDialogRef | null, config: DynamicDialogConfig | null, route: ActivatedRoute, router: Router, trnsl: TranslationManagerService);
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): void;
    /**
  * Allinea stato locale (`record`, `pristine`, `metaInfo`, `metas`, `formTemplate`) al datasource corrente.
  * @param ds Datasource sorgente da cui leggere snapshot runtime.
  * @param metaInfoOverride Metainfo opzionale proveniente da evento `fetchInfo`.
  */
    private applyDatasourceSnapshot;
    /**
  * Gestisce la logica operativa di `bootstrapConditionalActions` orchestrando le chiamate `getModelFromObservable` e `setCurrent`.
  */
    private bootstrapConditionalActions;
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
     * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
     */
    ngOnDestroy(): void;
    /**
  * Interpreta e normalizza input/configurazione in `parseData` per l'utilizzo nel componente.
  * @param data Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
  * @returns Struttura dati prodotta da `parseData` dopo normalizzazione/elaborazione.
  */
    parseData(data: any): any;
    /**
  * Interpreta e normalizza input/configurazione in `parseColumns` per l'utilizzo nel componente.
  * @param columns Collezione in ingresso processata dal metodo.
  * @returns Struttura dati prodotta da `parseColumns` dopo normalizzazione/elaborazione.
  */
    parseColumns(columns: MetadatiColonna[]): MetadatiColonna[];
    /**
  * Gestisce la logica operativa di `fieldByTab` in modo coerente con l'implementazione corrente.
  * @param metas Metadati runtime usati per determinare comportamento, mapping e visibilità campi.
  * @param tab Parametro utilizzato dal metodo nel flusso elaborativo.
  * @returns Risultato elaborato da `fieldByTab` e restituito al chiamante.
  */
    fieldByTab(metas: MetadatiColonna[], tab: any): MetadatiColonna[];
    /**
   * Sincronizza i flag `selected` nei metadata a partire da un tab visibile target.
   * @param targetTab Tab visibile da impostare come selezionato.
  */
    private setSelectedVisibleTab;
    /**
   * Normalizza la selezione iniziale tab usando `metaInfo.dataTabs`.
  */
    private normalizeSelectedTabFromMetadata;
    /**
   * Risolve un tab visibile a partire dal value emesso da PrimeNG.
   * @param value Value selezionato emesso dal controllo tabs.
   * @returns Tab visibile corrispondente oppure null.
  */
    private findVisibleTabByValue;
    getComponent(): any;
    getInputs(field: MetadatiColonna): {
        datasource: BehaviorSubject<DataSourceComponent>;
        record: any;
        field: MetadatiColonna;
        metaInfo: MetaInfo;
        readOnly: boolean;
        forceShowLabel: boolean;
    };
    /**
  * Gestisce la logica di `execute` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
  * @param $event Evento UI/payload evento che innesca la logica del metodo.
  * @param item Dato/record su cui il metodo applica trasformazioni, validazioni o aggiornamenti.
  */
    execute($event: any, item: MetadatiCustomActionTabella): void;
    /**
   * Ripristina lo stato e pulisce risorse temporanee legate al flusso del componente gestendo il ciclo di vita delle sottoscrizioni RxJS.
   */
    private clearRecordValueSubscriptions;
    /**
  * Gestisce la logica operativa di `setupRecordValueSubscriptions` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`, gestendo subscription RxJS in modo esplicito, propagando aggiornamenti sui flussi reattivi usati dalla UI.
  */
    private setupRecordValueSubscriptions;
    /**
  * Gestisce la logica operativa di `recomputeActionDisabledState` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`.
  */
    private recomputeActionDisabledState;
    /**
  * Esegue il salvataggio del record: usa `saveCallback` custom se presente, altrimenti `datasource.syncData`; a esito positivo chiude dialog o naviga indietro.
  */
    submitData(): Promise<void>;
    /**
  * Determina se dopo save bisogna navigare indietro: true solo in pagina standalone (no dialog) e action route uguale a `edit`.
  * @returns True se il flusso post-save deve eseguire la navigazione indietro.
  */
    private shouldNavigateBackAfterSave;
    /**
  * Esegue la navigazione post-save: usa `history.back()` se disponibile, altrimenti fallback su route relativa `../list`.
  */
    private navigateBackAfterSave;
    /**
  * Ripristina i valori del record corrente usando `pristine` per ogni colonna metadato, annullando le modifiche non salvate.
  * @param resultInfo Parametro legacy non usato nella logica corrente (mantenuto per compatibilità firma).
  */
    rollbackChanges(resultInfo: any): void;
    /**
  * Chiude il dialog senza salvare quando presente; in modalità pagina esegue `history.back()`.
  */
    goBack(): void;
    /**
     * Dopo salvataggi metadata forza il reload delle traduzioni per evitare chiavi non risolte
     * quando la schermata viene riaperta subito dopo.
     */
    private reloadTranslationsIfMetadataSave;
    static ɵfac: i0.ɵɵFactoryDeclaration<ParametricDialogComponent, [{ optional: true; }, { optional: true; }, null, null, null]>;
    static ɵcmp: i0.ɵɵComponentDeclaration<ParametricDialogComponent, "wuic-parametric-dialog", never, { "datasource": { "alias": "datasource"; "required": false; }; "hardcodedDatasource": { "alias": "hardcodedDatasource"; "required": false; }; "hideToolbar": { "alias": "hideToolbar"; "required": false; }; "isWizard": { "alias": "isWizard"; "required": false; }; "isEditForm": { "alias": "isEditForm"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; }, {}, never, never, true, never>;
}

declare class MetadataEditorComponent implements AfterViewInit, OnInit, OnDestroy {
    private trslSrv;
    private metaSrv;
    private router;
    private userInfoSrv;
    private hostEl;
    /**
     * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
     */
    datasource: BehaviorSubject<DataSourceComponent>;
    /**
     * Input dal componente padre per hardcoded datasource; usata nella configurazione e nel rendering del componente.
     */
    hardcodedDatasource: DataSourceComponent;
    /**
     * Input dal componente padre per save callback; usata nella configurazione e nel rendering del componente.
     */
    saveCallback: Function;
    /**
     * Input dal componente padre per hide reports; usata nella configurazione e nel rendering del componente.
     */
    hideReports: boolean;
    /**
     * Input dal componente padre per hide related table actions; usata nella configurazione e nel rendering del componente.
     */
    hideRelatedTableActions: boolean;
    /**
     * Input dal componente padre per hide related column actions; usata nella configurazione e nel rendering del componente.
     */
    hideRelatedColumnActions: boolean;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per datasource tabelle.
     */
    metadataMenubar?: Menubar;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per datasource tabelle.
     */
    datasourceTabelle: DataSourceComponent;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per datasource colonne.
     */
    datasourceColonne: DataSourceComponent;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata custom actions.
     */
    datasourceRelatedMetadataCustomActions: DataSourceComponent;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata auth table.
     */
    datasourceRelatedMetadataAuthTable: DataSourceComponent;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata auth column.
     */
    datasourceRelatedMetadataAuthColumn: DataSourceComponent;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata table styles.
     */
    datasourceRelatedMetadataTableStyles: DataSourceComponent;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata column styles.
     */
    datasourceRelatedMetadataColumnStyles: DataSourceComponent;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata condition groups/items.
     */
    datasourceRelatedMetadataConditionGroup: DataSourceComponent;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata condition items.
     */
    datasourceRelatedMetadataConditionItem: DataSourceComponent;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata condition action groups.
     */
    datasourceRelatedMetadataConditionActionGroup: DataSourceComponent;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per datasource related metadata condition action items.
     */
    datasourceRelatedMetadataConditionAction: DataSourceComponent;
    /**
     * Proprieta di stato del componente per datasource related metadata compat, usata dalla logica interna e dal template.
     */
    private datasourceRelatedMetadataCompat?;
    /**
     * Espone un datasource di metadati correlati compatibile con versioni precedenti, preferendo il datasource compat se impostato.
     * @returns Primo datasource disponibile tra compat/custom-actions/auth/style.
     */
    get datasourceRelatedMetadata(): DataSourceComponent;
    /**
     * Imposta il datasource compatibile legacy usato come alias dai consumer esistenti.
     * @param value Datasource da usare come sorgente primaria per i metadati correlati.
     */
    set datasourceRelatedMetadata(value: DataSourceComponent);
    /**
     * Collezione dati per items, consumata dal rendering e dalle operazioni del componente.
     */
    items: MenuItem[] | undefined;
    /**
     * Metadati completi della route corrente (tabella, colonne, regole) usati per costruire UI e logica runtime.
     */
    metaInfo: MetaInfo;
    /**
     * Proprieta di stato del componente per ref, usata dalla logica interna e dal template.
     */
    ref: primeng_dynamicdialog.DynamicDialogRef<ParametricDialogComponent>;
    /**
     * Proprieta di stato del componente per meta custom actions route, usata dalla logica interna e dal template.
     */
    readonly metaCustomActionsRoute: any;
    /**
     * Proprieta di stato del componente per meta auth table route, usata dalla logica interna e dal template.
     */
    readonly metaAuthTableRoute: any;
    /**
     * Proprieta di stato del componente per meta auth column route, usata dalla logica interna e dal template.
     */
    readonly metaAuthColumnRoute: any;
    /**
     * Configurazione di presentazione per meta table style route, usata nel rendering del componente.
     */
    readonly metaTableStyleRoute: any;
    /**
     * Configurazione di presentazione per meta column style route, usata nel rendering del componente.
     */
    readonly metaColumnStyleRoute: any;
    /**
     * Configurazione route metadata condition group/item usata nelle sezioni "Metadati correlati".
     */
    readonly metaConditionGroupRoute = "_metadati_condition_group";
    /**
     * Configurazione route metadata condition item usata nelle sezioni "Metadati correlati".
     */
    readonly metaConditionItemRoute = "_metadati_condition_item";
    /**
     * Configurazione route metadata condition action group usata nelle sezioni "Metadati correlati".
     */
    readonly metaConditionActionGroupRoute = "_metadati_condition_action_group";
    /**
     * Configurazione route metadata condition action item usata nelle sezioni "Metadati correlati".
     */
    readonly metaConditionActionRoute = "_metadati_condition_action_item";
    /**
     * Proprieta di stato del componente per fetch info sub, usata dalla logica interna e dal template.
     */
    private fetchInfoSub?;
    /**
     * Proprieta di stato del componente per translations sub, usata dalla logica interna e dal template.
     */
    private translationsSub?;
    /**
     * Proprieta di stato del componente per view ready, usata dalla logica interna e dal template.
     */
    private viewReady;
    /**
     * Proprieta di stato del componente per extended menu refresh seq, usata dalla logica interna e dal template.
     */
    private extendedMenuRefreshSeq;
    /**
     * Proprieta di stato del componente per report menu refresh seq, usata dalla logica interna e dal template.
     */
    private reportMenuRefreshSeq;
    /**
     * Observer usato per intercettare apertura/chiusura submenu e ricalcolare il posizionamento verticale.
     */
    private submenuPositionObserver?;
    /**
     * Handle requestAnimationFrame per evitare ricalcoli ridondanti.
     */
    private submenuPositionRaf;
    /**
     * Identificativo tecnico per role description by id, usato in matching, lookup o routing interno.
     */
    private roleDescriptionById;
    /**
     * Inietta servizi di traduzione, metadata API, routing e profilo utente usati nelle azioni menu editor.
     * @param trslSrv Servizio traduzioni per etichette menu e messaggi conferma.
     * @param metaSrv Servizio metadata per CRUD colonne/report/relazioni.
     * @param router Router Angular usato per apertura report designer.
     * @param userInfoSrv Servizio utente usato per controlli ruolo/permessi.
     */
    constructor(trslSrv: TranslationManagerService, metaSrv: MetadataProviderService, router: Router, userInfoSrv: UserInfoService, hostEl: ElementRef<HTMLElement>);
    /**
     * Pulisce la cache localStorage preservando la cache traduzioni per evitare
     * perdita temporanea delle label localizzate dopo salvataggi metadata.
     */
    private clearLocalStoragePreservingTranslation;
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): void;
    /**
     * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
     */
    ngOnDestroy(): void;
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    private readonly onViewportChanged;
    private bindSubmenuAutoPositioning;
    private scheduleSubmenuReposition;
    private repositionVisibleSubmenus;
    /**
     * Normalizza il payload menu PrimeNG restituendo sempre il vero item (`item.item` oppure `item`).
     */
    private unwrapMenuItem;
    /**
     * Verifica se la voce menu rappresenta un elemento correlato cancellabile (`info` presente e `canDelete=true`).
     */
    isDeletableMenuItem(item: any): boolean;
    /**
     * Gestisce il click voce menu: blocca default, esegue `command` se definito, altrimenti apre l'editor sul record associato.
     */
    onMenuItemClick(event: Event, item: any): void;
    /**
     * Gestisce il click su elimina voce correlata e delega la cancellazione dopo validazione `canDelete`.
     */
    onMenuItemDeleteClick(event: Event, item: any): Promise<void>;
    private closeMetadataMenu;
    /**
     * Si sottoscrive a `fetchInfo`, aggiorna `metaInfo` e ricostruisce le voci menu quando cambiano i metadati.
     */
    private subscribeToDS;
    /**
     * Ricostruisce il menubar metadata (tabella/colonne + azioni schema/report) in base allo stato corrente e ai flag di visibilita.
     */
    private rebuildMenuItems;
    /**
     * Restituisce la traduzione risorsa o fallback quando la chiave non e risolta.
     */
    private t;
    /**
     * Genera un nome report univoco con timestamp (`Report_YYYYMMDD_HHMMSS.mrt`).
     */
    private buildNewReportName;
    /**
     * Risolve il route name attivo preferendo datasource.route e fallback su `metaInfo.tableMetadata.md_route_name`.
     */
    private getCurrentRouteName;
    /**
     * Naviga al report designer della route corrente, creando un nome report nuovo se non fornito.
     */
    private openReportDesigner;
    /**
     * Ricarica la sezione Reports menu da server con protezione race tramite `reportMenuRefreshSeq`.
     */
    private refreshReportMenuItems;
    /**
     * Ricarica le sezioni metadati estesi (azioni custom, autorizzazioni, stili) e aggiorna dinamicamente il menu.
     */
    private refreshExtendedMetadataMenuItems;
    /**
     * Converte una collezione record in `MenuItem[]` preservando label, comandi e metadati necessari alle azioni UI.
     */
    private toMenuItems;
    /**
     * Definisce la mappa tra chiavi record (`mc_id`, `muat_id`, `Id`, ...) e datasource
     * da usare per aprire l'editor corretto.
     * L'ordine e rilevante per i fallback quando la chiave compare in piu sezioni.
     * @returns Elenco strategie di risoluzione editor.
     */
    private getEditorStrategies;
    /**
     * Restituisce il datasource relativo alla sezione richiesta (custom actions/auth/style) se disponibile.
     */
    private getRelatedMetadataDatasource;
    /**
     * Seleziona la strategia editor partendo dalla chiave record e, se presente,
     * dalla route preferita della sezione.
     * @param key Nome chiave identificativa presente nel record.
     * @param route Route metadata attesa per disambiguare strategie con stessa chiave.
     * @returns Strategia selezionata oppure `null` se non trovata.
     */
    private getEditorStrategyByKey;
    /**
     * Arricchisce il record menu (`info`) con i dati completi trovati nelle collezioni
     * annidate di `metaInfo` della sezione corrispondente (auth/stili/custom actions).
     * @param info Record base proveniente dalla voce menu.
     * @param editorKey Chiave identita della sezione (es. `muac_id`, `must_id`).
     * @returns Record mergeato con priorita ai dati provenienti dalla sorgente annidata.
     */
    private hydrateContextRecordFromSection;
    /**
  * Risolge il valore finale in `resolveEditorContext` combinando contesto runtime e regole locali.
  * @param info Parametro utilizzato dal metodo nel flusso elaborativo.
  * @param opts Flag che abilita/disabilita rami della logica.
  * @returns Promise che conclude l'operazione asincrona di `resolveEditorContext` restituendo un valore di tipo `Promise<{ ds: DataSourceComponent; record: any } | null>`.
  */
    private resolveEditorContext;
    /**
   * Esegue una operazione di persistenza/sincronizzazione mantenendo coerente lo stato locale usando i metadati per determinare chiavi, campi e comportamento runtime, allineando i record al formato atteso dai componenti del framework, coordinando chiamate verso servizi applicativi.
   * @param item Record/elemento su cui il metodo applica trasformazioni, validazioni o aggiornamenti.
   */
    private deleteRelatedMetadataItem;
    /**
     * Notifica al callback esterno un delete logico passando il record normalizzato e il tipo di sezione.
     */
    private notifyDeleteToSaveCallback;
    /**
     * Individua la prima chiave identitaria valorizzata in un record usando
     * l'ordine di priorita delle chiavi note del metadata editor.
     * @param record Record da analizzare.
     * @returns Nome chiave trovata oppure stringa vuota.
     */
    private resolveFirstIdentityKey;
    /**
     * Normalizza il record da eliminare rimuovendo wrapper/model proxies e mantenendo solo valori serializzabili.
     */
    private normalizeRecordForDelete;
    /**
     * Esegue unwrap ricorsivo di oggetti/array modello per ottenere valori plain JS.
     */
    private deepUnwrapModelValue;
    /**
     * Aggiunge al menubar una sezione di metadati correlati con voci, pulsanti inserimento e azioni delete contestuali.
     */
    private appendRelatedMetadataSection;
    /**
     * Restituisce il primo valore non vuoto cercando una lista chiavi con varianti
     * di naming (case, underscore/no-underscore) e mapping su chiavi normalizzate.
     * @param row Oggetto sorgente.
     * @param keys Chiavi candidate in ordine di precedenza.
     * @returns Primo valore significativo trovato, altrimenti `undefined`.
     */
    private pickFirstDefined;
    /**
     * Compone l'etichetta leggibile per una regola di autorizzazione tabella (ruolo + descrizione + target).
     */
    private formatTableAuthorizationLabel;
    /**
     * Converte i flag CRUD dell'autorizzazione in testo compatto (R/W/C/D) per la label menu.
     */
    private formatAuthorizationPermissions;
    /**
     * Compone la label di autorizzazione colonna includendo nome campo e ruolo associato.
     */
    private formatColumnAuthorizationLabel;
    /**
     * Formatta i permessi colonna in stringa sintetica per visualizzazione menu.
     */
    private formatColumnAuthorizationPermissions;
    /**
     * Compone l'etichetta di uno stile tabella mostrando nome stile e target di applicazione.
     */
    private formatTableStyleLabel;
    /**
     * Compone la label per i condition groups.
     */
    private formatConditionGroupLabel;
    /**
     * Compone la label per i condition items.
     */
    private formatConditionItemLabel;
    /**
     * Compone la label per i condition action groups.
     */
    private formatConditionActionGroupLabel;
    /**
     * Compone la label per i condition action items.
     */
    private formatConditionActionLabel;
    /**
     * Normalizza un valore in flag tri-state (`true`/`false`/`null`) usato dai formatter permessi.
     */
    private toTriStateFlag;
    /**
     * Converte input eterogenei (`1/0`, `true/false`, stringhe) in boolean coerente.
     */
    private toBool;
    /**
     * Normalizza una chiave per confronti robusti: lowercase e rimozione caratteri non alfanumerici.
     * @param key Chiave originale.
     * @returns Chiave normalizzata.
     */
    private normalizeKey;
    /**
     * Estrae il valore effettivo da wrapper modello (`value`, `_value`, observable wrappers).
     */
    private unwrapValue;
    /**
     * Estrae una descrizione utente leggibile da campi diretti, alias lookup o oggetti lookup
     * annidati, evitando valori vuoti o uguali all'id utente.
     * @param row Riga autorizzazione da cui ricavare il testo utente.
     * @param userId Id utente usato come filtro per evitare label non informative.
     * @returns Descrizione utente oppure `undefined`.
     */
    private getUserDescription;
    /**
     * Ricava la descrizione ruolo usando cache locale, campo diretto `ruolo_des`
     * o oggetto lookup annidato associato al ruolo.
     * @param row Riga sorgente.
     * @param roleId Id ruolo corrente.
     * @returns Descrizione ruolo oppure `undefined`.
     */
    private getRoleDescription;
    /**
     * Carica e cachea le descrizioni ruolo da datasource lookup per arricchire le label autorizzazioni.
     */
    private hydrateRoleDescriptionCache;
    /**
     * Interroga le route lookup configurate e aggiorna la mappa `roleDescriptionById` con fallback robusto.
     */
    private hydrateRoleDescriptionsFromLookupRoutes;
    /**
  * Valuta la condizione gestita da `isRoleLookupField` restituendo un esito utile al flusso.
  * @param field Parametro utilizzato dal metodo nel flusso elaborativo.
  * @returns Esito booleano della verifica/esecuzione effettuata da `isRoleLookupField`.
  */
    private isRoleLookupField;
    /**
     * Estrae l'array item da payload lookup supportando risposte serializzate o strutture annidate.
     */
    private extractLookupItems;
    /**
     * Risolve la chiave valore dell'item lookup cercando i campi convenzionali disponibili.
     */
    private pickLookupValue;
    /**
     * Risolve il testo descrittivo dell'item lookup cercando i campi label convenzionali.
     */
    private pickLookupText;
    /**
     * Verifica che un testo sia utilizzabile come label ruolo/utente:
     * non nullo, non vuoto e diverso dall'id tecnico.
     * @param value Testo candidato.
     * @param roleId Id tecnico da scartare quando coincide col testo.
     * @returns `true` se il testo e significativo.
     */
    private hasMeaningfulRoleText;
    /**
     * Filtra e ordina le autorizzazioni colonna pertinenti al metadata corrente.
     */
    private selectRelevantColumnAuthorizations;
    /**
     * Filtra e ordina le autorizzazioni tabella pertinenti al contesto editor corrente.
     */
    private selectRelevantTableAuthorizations;
    /**
     * Determina se mostrare tutte le autorizzazioni (solo admin) invece del subset contestuale.
     */
    private shouldShowAllAuthorizationsForMetadataEditor;
    /**
     * Legge dal metadata tabella la collezione annidata di autorizzazioni tabella,
     * gestendo varianti storiche del nome relazione.
     * @param tableMetadata Metadati tabella correnti.
     * @returns Lista autorizzazioni tabella.
     */
    private getNestedTableAuthorizations;
    /**
     * Legge dal metadata tabella la collezione annidata degli stili tabella,
     * gestendo varianti storiche del nome relazione.
     * @param tableMetadata Metadati tabella correnti.
     * @returns Lista stili tabella.
     */
    private getNestedTableStyles;
    /**
     * Estrae e appiattisce gli stili annidati delle colonne, aggiungendo il campo
     * tecnico `__column_name` per la visualizzazione nel menu.
     * @param columns Elenco metadati colonna.
     * @returns Lista stili colonna flatten.
     */
    private getNestedColumnStyles;
    /**
     * Estrae e appiattisce le autorizzazioni annidate delle colonne, aggiungendo
     * `__column_name` come supporto alla label.
     * @param columns Elenco metadati colonna.
     * @returns Lista autorizzazioni colonna flatten.
     */
    private getNestedColumnAuthorizations;
    /**
     * Estrae i condition items annidati sul metadata tabella.
     */
    private getNestedConditionItems;
    /**
     * Restituisce i gruppi condizione distinti a partire dai condition items.
     */
    private getDistinctConditionGroups;
    /**
     * Restituisce l'insieme degli id gruppo condizione validi nel contesto corrente.
     */
    private getConditionGroupIdSet;
    /**
     * Filtra righe action/action-group mantenendo solo quelle collegate ai `CG_Id` correnti.
     * Se non ci sono gruppi condizione nel contesto corrente, restituisce sempre lista vuota.
     */
    private filterRowsByConditionGroupIds;
    /**
     * Filtra i condition item reali: evita righe "phantom" generate da LEFT JOIN (es. CI_Id = 0).
     */
    private extractConcreteConditionItems;
    /**
     * Estrae e appiattisce i condition action item annidati nei condition group/item.
     */
    private getNestedConditionActions;
    /**
     * Restituisce i condition action groups distinti a partire dagli action item.
     */
    private getDistinctConditionActionGroups;
    /**
     * Filtra i condition action item reali, escludendo i soli action-group (CAG) senza CAI.
     */
    private extractConcreteConditionActionItems;
    /**
     * Recupera una relazione annidata dal record sorgente provando piu nomi candidati,
     * anche tramite confronto normalizzato della chiave.
     * @param source Oggetto che contiene le relazioni annidate.
     * @param candidates Nomi relazione possibili in ordine di priorita.
     * @returns Prima collezione valida trovata, altrimenti array vuoto.
     */
    private getNestedRelationArray;
    /**
     * Calcola un punteggio di ordinamento priorita per presentare prima le regole autorizzative piu rilevanti.
     */
    private computeAuthorizationScore;
    /**
     * Assicura che il datasource abbia una route valida prima di operazioni CRUD/navigation.
     */
    private ensureDatasourceRoute;
    /**
     * Garantisce che lo schema datasource sia caricato prima di aprire editor o operazioni su colonne.
     */
    private ensureDatasourceSchema;
    private isMetadataNotFoundRouteError;
    /**
     * Ricarica metadati e ricostruisce il menu editor dopo operazioni che cambiano schema/configurazione.
     */
    private reloadMetadataEditorState;
    /**
     * Costruisce una chiave stabile editor a partire dalla route normalizzata corrente.
     */
    private getEditorKeyFromRoute;
    /**
     * Apre `EditFormComponent` sul datasource/record richiesto e gestisce il refresh al close con esito positivo.
     */
    private openEditDialog;
    /**
     * Pubblica lo stato datasource aggiornato verso i subscriber interni/esterni del metadata editor.
     */
    private publishDatasourceState;
    /**
  * Risolge il valore finale in `resolveLocalEditorContext` combinando contesto runtime e regole locali.
  * @param info Parametro utilizzato dal metodo nel flusso elaborativo.
  * @param opts Flag che abilita/disabilita rami della logica.
  * @returns Promise che conclude l'operazione asincrona di `resolveLocalEditorContext` restituendo un valore di tipo `Promise<{ ds: DataSourceComponent; record: any } | null>`.
  */
    private resolveLocalEditorContext;
    /**
     * True quando l'editor lavora nel contesto designer (memory-only su JSON serializzato).
     */
    private isDesignerMemoryOnlyMode;
    /**
     * Aggiorna il menu senza forzare reload/invalidazione database nel contesto designer.
     */
    private refreshDesignerMenuAfterMutation;
    /**
     * Apre la dialog di inserimento per la sezione correlata richiesta preimpostando i campi contesto.
     */
    private openInsertRelatedMetadata;
    /**
  * Applica aggiornamenti di stato tramite `applyCurrentRouteColumnLookupFilter` mantenendo coerenti UI e dati.
  * @param ds Parametro utilizzato dal metodo nel flusso elaborativo.
  */
    private applyCurrentRouteColumnLookupFilter;
    /**
     * Apre il wizard di inserimento colonna, invoca endpoint backend di creazione
     * e apre l'editor della colonna appena creata.
     * In fallback ricerca la colonna per nome+md_id quando l'id non arriva in risposta.
     */
    private openInsertColumnEditor;
    /**
     * Prepara un nuovo record metadata colonna di tipo `button` vincolato alla tabella corrente
     * e apre la dialog di edit sul datasource colonne.
     * @returns `Promise<void>`.
     */
    private openInsertColumnActionMetadata;
    /**
  * Interpreta e normalizza input/configurazione in `parseCreatedColumnId` per l'utilizzo nel componente.
  * @param response Parametro utilizzato dal metodo nel flusso elaborativo.
  * @returns Valore numerico prodotto da `parseCreatedColumnId` (indice, conteggio o misura operativa).
  */
    private parseCreatedColumnId;
    /**
     * Restituisce l'endpoint da usare per l'aggiunta colonna scegliendo
     * automaticamente tra asmx proxy e path legacy.
     * @returns URL endpoint AddColumn.
     */
    private getAddColumnEndpoint;
    /**
     * Sincronizza metadata colonne con lo schema fisico tabella via endpoint backend e aggiorna il menu al termine.
     */
    private syncMetadataFromSchema;
    /**
     * Recupera la definizione connessione dal backend (`MetaService.getConnections`)
     * cercando prima `connName`, poi fallback su `DataSQLConnection`.
     * @param connName Nome connessione richiesto dal metadata tabella.
     * @returns Oggetto connessione o `null` se non trovato.
     */
    private getConnectionInfo;
    /**
  * Interpreta e normalizza input/configurazione in `parseMaybeSerialized` per l'utilizzo nel componente.
  * @param raw Valore in ingresso elaborato o normalizzato dal metodo.
  * @returns Struttura dati prodotta da `parseMaybeSerialized` dopo normalizzazione/elaborazione.
  */
    private parseMaybeSerialized;
    /**
     * Compone un endpoint ASMX usando il root configurato:
     * se il root punta a `asmxproxy` usa `proxyMethod`, altrimenti path legacy.
     * @param proxyMethod Metodo proxy (es. `scaffolding.AddColumn`).
     * @param legacyPath Path ASMX legacy.
     * @returns URL finale da invocare.
     */
    private getAsmxEndpoint;
    /**
     * Rimuove una colonna dal metadata e, opzionalmente, anche dallo schema fisico tabella con conferma utente.
     */
    private removeColumn;
    /**
     * Invalida cache locali metadata/report per forzare una ricostruzione coerente allo stato server.
     */
    private invalidateMetadataCaches;
    /**
     * Dispatcher principale delle azioni menu metadata.
     * Gestisce comandi speciali (insert/sync/remove/report), risolve il datasource target
     * per i record correlati e apre `EditFormComponent` con record corrente.
     * @param item Voce menu cliccata o wrapper PrimeNG con `info`/`id`.
     */
    openEditor(item: any): Promise<void>;
    static ɵfac: i0.ɵɵFactoryDeclaration<MetadataEditorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<MetadataEditorComponent, "wuic-metadata-editor", never, { "datasource": { "alias": "datasource"; "required": false; }; "hardcodedDatasource": { "alias": "hardcodedDatasource"; "required": false; }; "saveCallback": { "alias": "saveCallback"; "required": false; }; "hideReports": { "alias": "hideReports"; "required": false; }; "hideRelatedTableActions": { "alias": "hideRelatedTableActions"; "required": false; }; "hideRelatedColumnActions": { "alias": "hideRelatedColumnActions"; "required": false; }; }, {}, never, never, true, never>;
}

type PaletteNodeDefinition = {
    type: 'start' | 'route' | 'action' | 'condition' | 'end';
    label: string;
    description: string;
};
type WorkflowMenuAuthorization$1 = {
    mmid: number;
    muamid: number;
    muamview: 0 | 1;
    ruoloid: number;
    utenteid: number;
};
type WorkflowStartMenuItem$1 = {
    mm_id: number;
    mm_parent_id: number;
    mm_nome_menu: string;
    mm_display_string_menu: string;
    mm_tooltip_menu: string;
    mm_uri_menu: string;
    mm_ordine: number;
    mm_is_visible_by_default: boolean;
    _Metadati_Utenti_Autorizzazioni_Menus: WorkflowMenuAuthorization$1[];
};
declare class WorkflowDesignerComponent implements AfterViewInit, OnDestroy {
    private injector;
    private dataSrv;
    workflowCanvasRef?: ElementRef<HTMLDivElement>;
    primeContextMenu?: ContextMenu;
    routeMetadataDs?: DataSourceComponent;
    startMenuDs?: DataSourceComponent;
    menuAuthDs?: DataSourceComponent;
    routeMetadataEditor?: MetadataEditorComponent;
    actionMetadataEditor?: MetadataEditorComponent;
    workflowChange: EventEmitter<any>;
    readonly paletteNodes: PaletteNodeDefinition[];
    private readonly socket;
    private editor?;
    private area?;
    contextMenuItems: MenuItem[];
    contextMenuNodeId: string | null;
    contextMenuNodeType: string;
    routePopupVisible: boolean;
    routeSourceOptions: Array<{
        label: string;
        value: 'route' | 'dashboard';
    }>;
    selectedRouteSourceType: 'route' | 'dashboard';
    routeOptions: Array<{
        label: string;
        value: string;
    }>;
    dashboardOptions: Array<{
        label: string;
        value: string;
        boardcontent: string;
    }>;
    filteredRouteOptions: Array<{
        label: string;
        value: string;
    }>;
    filteredDashboardOptions: Array<{
        label: string;
        value: string;
        boardcontent: string;
    }>;
    routeActionOptions: Array<{
        label: string;
        value: string;
    }>;
    selectedRouteName: string;
    selectedDashboardRoute: string;
    selectedRouteAction: string;
    private pendingRouteDrop;
    actionPopupVisible: boolean;
    actionTypeOptions: Array<{
        label: string;
        value: number;
    }>;
    selectedActionTypeId: number | null;
    actionScopeOptions: Array<{
        label: string;
        value: number;
    }>;
    selectedActionScopeId: number | null;
    private pendingActionDrop;
    private readonly actionTypeDictionaryValue;
    routeMetadataDialogVisible: boolean;
    routeMetadataRoute: string;
    workflowKey: string;
    workflowName: string;
    savingWorkflow: boolean;
    loadingWorkflow: boolean;
    savedGraphOptions: Array<{
        label: string;
        value: string;
        name: string;
    }>;
    selectedSavedGraphKey: string;
    reopenWorkflowDialogVisible: boolean;
    reopenDialogSelectedGraphKey: string;
    workflowOptionsDialogVisible: boolean;
    workflowOptionsStartNodeId: string;
    workflowOptionsCaption: string;
    workflowOptionsInheritMetadata: boolean;
    workflowOptionsExclusiveMenu: boolean;
    workflowOptionsShowExit: boolean;
    loadingSavedGraphs: boolean;
    graphActionsMenuItems: MenuItem[];
    runnerActionsMenuItems: MenuItem[];
    private routeMetadataNodeId;
    private routeMetadataDashboardDatasourceUniqueName;
    private lastCreatedRouteNodeId;
    private pendingMenuAuthContext;
    private pendingStartMenuContext;
    private localMenuIdSeed;
    private autoArrangeTimer;
    private readonly autoArrangeDelayMs;
    private readonly pendingAutoArrangeSeeds;
    relayoutEnabled: boolean;
    private readonly startMenuRoute;
    private readonly menuAuthRoute;
    readonly routeMetadataSaveCallback: Function;
    readonly startMenuSaveCallback: Function;
    readonly menuAuthSaveCallback: Function;
    constructor(injector: Injector, dataSrv: DataProviderService);
    /**
     * Inizializza il canvas Rete dopo il render:
     * crea editor/area/plugin di connessione+render Angular, collega il pipe eventi
     * per emettere `workflowChange`, carica i grafi salvati e garantisce il nodo Start iniziale.
     */
    ngAfterViewInit(): Promise<void>;
    /**
     * Cleanup del componente: cancella timer di auto-layout pendenti e distrugge l'area Rete.
     */
    ngOnDestroy(): void;
    /**
     * Avvia il drag dalla palette impostando nel `dataTransfer` il tipo nodo
     * (`application/wuic-workflow-node-type`) usato dal drop sul canvas.
     */
    onPaletteDragStart(event: DragEvent, node: PaletteNodeDefinition): void;
    isPaletteNodeEnabled(node: PaletteNodeDefinition): boolean;
    /**
     * Abilita il drop sul canvas impedendo il comportamento browser di default
     * e forzando feedback visuale `copy`.
     */
    onCanvasDragOver(event: DragEvent): void;
    /**
     * Gestisce il drop sul canvas:
     * - converte coordinate mouse in coordinate area (tenendo conto di pan/zoom),
     * - per `route`/`action` apre popup di configurazione preliminare,
     * - per altri tipi crea subito il nodo via `addNodeByType`.
     */
    onCanvasDrop(event: DragEvent): Promise<void>;
    /**
     * Apre il context menu del nodo sotto puntatore:
     * risolve `contextMenuNodeId/type`, costruisce le azioni disponibili e mostra Prime context menu.
     */
    onCanvasContextMenu(event: MouseEvent): void;
    /**
     * Click sul canvas fuori dai menu: chiude il context menu attivo.
     */
    onCanvasClick(): void;
    /**
     * Cancella il nodo selezionato dal context menu con gestione dipendenze:
     * - blocca la cancellazione del nodo Start,
     * - se il nodo e route chiede conferma e rimuove anche action collegate,
     * - se il nodo e action rimuove anche il link metadata nel bundle route.
     */
    deleteContextNode(): Promise<void>;
    /**
     * Rimuove dal `workflowRouteMetadataBundle` della route sorgente il target metadata
     * referenziato da un action node (`table_action` o `column_button`).
     */
    private removeActionMetadataLinkFromRouteBundle;
    /**
     * Restituisce gli id action collegati a una route combinando:
     * - link esplicito `workflowRouteNodeId` sul nodo action,
     * - connessioni canvas in ingresso/uscita tra route e action.
     */
    private getLinkedActionNodeIdsForRoute;
    /**
     * Elimina un nodo dal canvas dopo aver rimosso tutte le connessioni
     * dove il nodo e source o target.
     */
    private removeNodeWithConnections;
    /**
     * Apre l'editor metadata della route dal context menu:
     * risolve route effettiva (anche da datasource dashboard), prepara `routeMetadataDs`,
     * carica schema+dati e applica il bundle metadata corrente o un bundle iniziale.
     */
    openRouteMetadataFromContext(dashboardDatasourceUniqueName?: string | null): Promise<void>;
    /**
     * Apre metadata editor puntuale dell'azione selezionata:
     * sincronizza prima il bundle route con lo stato action node,
     * poi apre editor su record target (`Id` table action o `mc_id` column button).
     */
    openActionMetadataFromContext(): Promise<void>;
    get contextStartMenuItems(): WorkflowStartMenuItem$1[];
    /**
     * Inserisce una nuova voce menu sul nodo Start:
     * crea seed con `mm_ordine` progressivo e apre `EditFormComponent` su route menu.
     */
    addStartMenuFromContext(): Promise<void>;
    /**
     * Modifica una voce menu esistente del nodo Start (per oggetto o id),
     * aprendo l'editor con il record seed normalizzato.
     */
    renameStartMenuFromContext(menuInput: WorkflowStartMenuItem$1 | number): Promise<void>;
    /**
     * Apre dialog `EditFormComponent` per inserimento/modifica voce menu Start,
     * configurando datasource route menu e il contesto temporaneo di salvataggio.
     */
    private openStartMenuEditor;
    /**
     * Callback save del dialog menu Start:
     * normalizza record, assegna id locale quando assente, fa upsert in `workflowStartMenus`
     * e propaga l'evento workflow.
     */
    private handleStartMenuSave;
    /**
     * Apre editor autorizzazioni menu in modalita insert per la voce selezionata.
     */
    openInsertMenuAuthorizationFromContext(menuIdRaw: number): Promise<void>;
    /**
     * Apre editor autorizzazioni menu in modalita edit per la coppia menu/autorizzazione selezionata.
     */
    openEditMenuAuthorizationFromContext(menuIdRaw: number, muamIdRaw: number): Promise<void>;
    /**
     * Elimina una autorizzazione menu dal nodo Start e ricalcola il payload normalizzato.
     */
    deleteMenuAuthorizationFromContext(menuIdRaw: number, muamIdRaw: number): void;
    /**
     * Restituisce la lista autorizzazioni della voce menu in contesto ordinata per `muamid`.
     */
    getMenuAuthorizationsForContext(menuIdRaw: number): WorkflowMenuAuthorization$1[];
    /**
     * Compone l'etichetta UI di una autorizzazione menu usando ruolo/utente e flag visibilita.
     */
    getMenuAuthorizationLabel(auth: WorkflowMenuAuthorization$1): string;
    /**
     * Elimina una voce menu dal nodo Start previa conferma utente.
     */
    deleteStartMenuFromContext(menuIdRaw: number): Promise<void>;
    /**
     * Shortcut UI: apre il dialog opzioni workflow focalizzato sulle impostazioni caption menu Start.
     */
    editStartMenuCaptionFromContext(): void;
    /**
     * Apre il dialog opzioni del nodo Start (caption, inherit metadata, esclusivita menu, show exit)
     * inizializzando i campi dal nodo corrente.
     */
    openWorkflowOptionsFromContext(): void;
    /**
     * Chiude il dialog opzioni workflow senza applicare modifiche.
     */
    cancelWorkflowOptionsDialog(): void;
    /**
     * Conferma il dialog opzioni workflow e persiste i flag sul nodo Start corrente.
     */
    confirmWorkflowOptionsDialog(): void;
    /**
     * Apre l'editor autorizzazioni menu (insert/edit) su datasource dedicata,
     * preparando record seed e contesto salvataggio.
     */
    private openMenuAuthorizationEditor;
    /**
     * Rifinisce i metadati colonna dell'editor autorizzazioni nascondendo `mmid`
     * e disabilitandone edit/required nel form.
     */
    private configureMenuAuthorizationEditorMeta;
    /**
     * Callback save autorizzazioni menu:
     * normalizza input, assegna id locale quando necessario, fa upsert su `_Metadati_Utenti_Autorizzazioni_Menus`
     * e sincronizza `workflowStartMenus`.
     */
    private handleMenuAuthorizationSave;
    /**
     * Conferma la creazione di una route dal popup drag/drop:
     * crea il nodo route con source type (route/dashboard), auto-collega start/action/route sorgente,
     * costruisce/sincronizza bundle metadata e aggiorna stato popup.
     */
    confirmRouteDrop(): Promise<void>;
    /**
     * Annulla il popup creazione route e resetta selezioni/filtri temporanei.
     */
    cancelRouteDrop(): void;
    /**
     * Conferma la creazione action da popup:
     * crea nodo action tipizzato, aggancia metadata target nel bundle route,
     * collega route->action sul canvas e resetta stato popup.
     */
    confirmActionDrop(): Promise<void>;
    /**
     * Annulla il popup creazione action e pulisce selezioni temporanee.
     */
    cancelActionDrop(): void;
    /**
     * Factory nodi workflow:
     * inizializza socket in/out, campi custom `workflow*` e payload specifico
     * per start/route/action/condition/end.
     */
    private createNode;
    /**
     * Aggiunge un nodo al canvas in coordinate assolute area,
     * applica stato visuale, emette snapshot workflow e opzionalmente pianifica auto-layout.
     */
    private addNodeByType;
    /**
     * Debounce dei pass di relayout: accumula seed node id e avvia `runAutoArrangeBatch`
     * dopo `autoArrangeDelayMs`.
     */
    private scheduleAutoArrange;
    /**
     * Disattivando relayout cancella timer pendenti e svuota i seed accumulati.
     */
    onRelayoutEnabledChanged(): void;
    /**
     * Costruisce il contesto operativo passato a `WorkflowDesignerLayoutHelper`:
     * espone editor/area e resolver di nodi/host DOM necessari ai pass di auto-layout.
     */
    private getLayoutContext;
    /**
     * Esegue i pass completi di layout:
     * risoluzione overlap, normalizzazione spazi orizzontali per livelli,
     * allineamento action per route, vincolo start/end estremi e zoom finale.
     */
    private runAutoArrangeBatch;
    /**
     * Crea (se assente) la connessione `route.out -> action.in` scegliendo la route
     * preferita o la route piu vicina al punto di drop.
     */
    private autoConnectRouteToAction;
    /**
     * Connette automaticamente `start.out -> route.in` evitando duplicati.
     */
    private autoConnectStartToRoute;
    /**
     * Connette automaticamente `action.out -> route.in` evitando duplicati.
     */
    private autoConnectActionToRoute;
    /**
     * Trasforma una action collegata in action di navigazione verso una route target:
     * aggiorna callback/azione nel bundle metadata sorgente e sincronizza tipo/scope del nodo action.
     */
    private configureLinkedActionAsNavigation;
    /**
     * Inserisce un nodo action "navigation" tra due route:
     * crea il nodo a meta percorso, lo collega source->action->target
     * e persiste il relativo target metadata nel bundle della route sorgente.
     */
    private insertNavigationActionBetweenRoutes;
    /**
     * Genera il codice callback JavaScript della navigation action
     * che imposta `window.location.hash` verso `#/route/archetype`.
     */
    private buildNavigationActionCallback;
    /**
     * Risolve la route da usare per auto-connect:
     * preferita esplicita, ultima route creata, altrimenti route geometricamente piu vicina.
     */
    private resolveRouteNodeForAutoConnect;
    /**
     * Emissione stato workflow verso l'esterno (`workflowChange`):
     * serializza nodi/connessioni correnti con coordinate e route metadata derivato.
     */
    private emitWorkflow;
    /**
     * Aggiorna label e attributi/stili visuali del nodo sul DOM host (`node-<id>`)
     * in base a tipo nodo, scope e action type.
     */
    private applyNodeVisualState;
    /**
     * Completa i campi visuali mancanti di un action node
     * inferendo tipo/scope dal bundle metadata route target.
     */
    private normalizeActionNodeVisualContext;
    /**
     * Tenta il mapping descrizione testuale -> `actionTypeId` tramite matching di keyword normalize.
     */
    private inferActionTypeIdFromDescription;
    /**
     * Calcola l'etichetta visuale del nodo in base a tipo e campi workflow:
     * Start caption, Route route/action, Action scope/tipo.
     */
    private computeNodeLabel;
    /**
     * Restituisce la label user-friendly per action type,
     * con fallback su descrizione normalizzata quando l'id non e noto.
     */
    private getActionTypeVisualLabel;
    private resolveNodeVisual;
    /**
     * Cerca l'elemento host DOM del nodo Rete (`node-<id>`) nel canvas.
     */
    private findNodeHostElement;
    /**
     * Chiude e resetta completamente il context menu corrente.
     */
    private hideContextMenu;
    /**
     * Costruisce dinamicamente le voci context menu in base al tipo nodo:
     * route metadata, action metadata, gestione menu start, cancellazione nodo.
     */
    private buildContextMenuItems;
    /**
     * Estrae l'id nodo dal target mouse event risalendo `composedPath`/parentElement
     * e riconoscendo i tag custom `node-<id>`.
     */
    private getNodeIdFromEvent;
    /**
     * Variante drag event di risoluzione id nodo (`node-<id>`) dal path DOM.
     */
    private getNodeIdFromDragEvent;
    /**
     * Apre il popup configurazione route inizializzando i campi
     * e caricando on-demand route/dashboard options.
     */
    private openRoutePopup;
    /**
     * Sincronizza i campi popup route quando cambia la sorgente (`route` vs `dashboard`).
     */
    onRouteSourceTypeChanged(): void;
    /**
     * Apre il popup selezione tipo/scope action con default scope tabellare.
     */
    private openActionPopup;
    /**
     * Carica le route applicative da metadata table route e popola autocomplete route.
     */
    private loadRouteOptions;
    /**
     * Carica i dashboard salvati (`loadAllDashboards`) e popola autocomplete dashboard
     * includendo `boardcontent` per estrarre metadata datasource annidati.
     */
    private loadDashboardOptions;
    /**
     * Filtra client-side le opzioni route su label/value in base alla query.
     */
    filterRouteOptions(event: AutoCompleteCompleteEvent): void;
    /**
     * Filtra client-side le opzioni dashboard su label/value in base alla query.
     */
    filterDashboardOptions(event: AutoCompleteCompleteEvent): void;
    /**
     * Restituisce il tipo azione configurato (`id`,`description`) a partire dalle opzioni parse-ate.
     */
    private getActionTypeById;
    /**
     * Restituisce lo scope azione (`azione_tab`/`azione_col`) a partire dall'id selezionato.
     */
    private getActionScopeById;
    /**
     * Parse del dizionario action type nel formato `id@@descrizione||...`
     * usato dal componente per popolare il selettore tipi azione.
     */
    private parseActionTypeOptions;
    /**
     * Risolve un nodo editor per id stringa.
     */
    private getNodeById;
    /**
     * Normalizza un valore eterogeneo (bool/number/string) in booleano,
     * con fallback esplicito quando il valore non e interpretabile.
     */
    private toBoolean;
    /**
     * Determina se una route node deriva da route metadata standard o da dashboard embedded,
     * usando flag espliciti e fallback su action/boardcontent/datasources presenti.
     */
    private getRouteSourceType;
    /**
     * Risolve la route sorgente di una action:
     * prima da `workflowRouteNodeId`, fallback dalla connessione in ingresso `*.out -> action.in`.
     */
    private resolveRouteNodeForAction;
    /**
     * Garantisce un `workflowRouteMetadataBundle` valido sul nodo route:
     * riusa bundle esistente, altrimenti lo costruisce da datasource route metadata
     * (se richiesto) o crea un bundle vuoto.
     */
    private ensureRouteMetadataBundleForNode;
    /**
     * Inserisce nel bundle route il target metadata associato a una nuova action:
     * - scope tabella: aggiunge una riga in `tableActions`,
     * - scope colonna: aggiunge una colonna button in `columnMetadata`.
     * Ritorna la coppia (`targetType`,`targetId`) da salvare sul nodo action.
     */
    private attachActionMetadataToRouteBundle;
    /**
     * Richiede al server un callback suggerito (`MetaService.suggestTableActionCallback`)
     * per il tipo azione; fallback locale su `debugger;` in caso di errore.
     */
    private fetchSuggestedTableActionCallback;
    /**
     * Genera un id numerico locale (max+1) o seed timestamp se la collezione e vuota.
     */
    private nextLocalNumericId;
    /**
     * Estrae il massimo valore numerico presente nel campo indicato.
     */
    private maxNumericField;
    /**
     * Normalizza una stringa in nome metadata-safe (`a-z0-9_`) per campi tecnici.
     */
    private toMetadataSafeName;
    /**
     * Attende la disponibilita del `routeMetadataEditor` (render async dialog),
     * con numero massimo tentativi.
     */
    private waitForRouteMetadataEditor;
    /**
     * Attende la disponibilita del `actionMetadataEditor` (render async dialog),
     * con numero massimo tentativi.
     */
    private waitForActionMetadataEditor;
    /**
     * Salva il grafo workflow corrente via `MetaService.saveWorkflowGraph`.
     * Mapping payload persistito verificato lato server (`Services/MetaService.cs`):
     * - `graph_key` -> `_wuic_workflow_graph.wg_key`
     * - `graph_name` -> `_wuic_workflow_graph.wg_name`
     * - `graph_json` -> `_wuic_workflow_graph.wg_graph_json`
     * - `route_metadata_json[]` -> righe `_wuic_workflow_graph_route_metadata`
     *   (`wg_id`, `node_client_id`, `route_name`, `route_action`, `metadata_json`).
     * Il server esegue upsert su `_wuic_workflow_graph` e replace completo del dettaglio route metadata.
     */
    saveWorkflow(): Promise<void>;
    /**
     * Genera una chiave workflow client-side nel formato `wf_<timestampUTC>_<rand>`,
     * usata come candidato `wg_key` per nuovi grafi.
     */
    private generateWorkflowKey;
    /**
     * Carica un grafo da `MetaService.loadWorkflowGraph` usando `workflowKey`,
     * normalizza i formati di risposta (`graph_json` + `route_metadata`) e ricostruisce il canvas.
     * Se la chiave non esiste, il server ritorna un grafo vuoto (`nodes/connections` vuoti).
     */
    loadWorkflow(): Promise<void>;
    /**
     * Rilegge l'elenco grafi salvati tramite `MetaService.getWorkflowGraphs`
     * (query su `_wuic_workflow_graph` ordinata per `wg_updated_on DESC, wg_key ASC`)
     * e aggiorna `savedGraphOptions` per dropdown/dialog con eventuale preselezione.
     */
    refreshSavedGraphs(preselectKey?: string): Promise<void>;
    /**
     * Sincronizza `workflowKey/workflowName` quando l'utente seleziona un grafo dalla lista salvati.
     */
    onSavedGraphSelectionChange(): void;
    /**
     * Apre il dialog "Riapri workflow" ricaricando prima la lista grafi disponibili.
     */
    openReopenWorkflowDialog(): Promise<void>;
    /**
     * Conferma il dialog di riapertura e carica il grafo selezionato.
     */
    confirmReopenWorkflowDialog(): Promise<void>;
    /**
     * Chiude il dialog di riapertura senza modificare il workflow corrente.
     */
    cancelReopenWorkflowDialog(): void;
    /**
     * Carica il grafo attualmente selezionato nel dropdown principale.
     */
    openSelectedGraph(): Promise<void>;
    /**
     * Rinominazione del grafo selezionato tramite `renameWorkflowGraph`,
     * seguita da refresh lista grafi.
     */
    renameSelectedGraph(): Promise<void>;
    /**
     * Elimina il grafo selezionato via `deleteWorkflowGraph`, resetta stato corrente
     * e reinizializza il canvas con un nuovo workflow vuoto.
     */
    deleteSelectedGraph(): Promise<void>;
    /**
     * Crea un nuovo workflow locale svuotando chiave/nome/selezione,
     * cancellando il canvas e ricreando il nodo Start iniziale.
     */
    createNewWorkflow(): Promise<void>;
    get currentSavedGraphKey(): string;
    get canOpenWorkflowRunner(): boolean;
    get currentGraphCaption(): string;
    /**
     * Rigenera i menu toolbar (azioni grafo e runner) con stato enabled/disabled
     * coerente con salvataggio/caricamento corrente.
     */
    private refreshToolbarMenuItems;
    /**
     * Apre il runner workflow in una nuova tab su `#/workflow-runner/<graphKey>`.
     */
    openWorkflowRunnerInNewTab(): void;
    /**
     * Serializza lo stato editor in due payload:
     * 1) `graph` (nodi/connessioni + coordinate) da salvare in `wg_graph_json`,
     * 2) `routeMetadata` dettaglio per route-node da salvare nella tabella `_wuic_workflow_graph_route_metadata`.
     * Prima della serializzazione sincronizza `md_action_type` dei `tableActions` nel bundle route
     * con gli action node effettivamente collegati.
     */
    private serializeGraphPayload;
    /**
     * Allinea nel bundle route il campo `md_action_type` delle table action
     * con il `workflowActionTypeId` dei nodi action effettivamente collegati.
     */
    private syncRouteMetadataActionTypesFromLinkedNodes;
    /**
     * Estrae le righe dettaglio route da nodi di tipo `route` nel formato atteso dal backend:
     * `{ node_id, route_name, route_action, metadata_json }`.
     * `metadata_json` e serializzato come string JSON per persistenza in `wgrm.metadata_json`.
     */
    private extractRouteMetadataEntries;
    /**
     * Ricostruisce editor/canvas da payload serializzato:
     * - ricrea nodi con mapping oldId->newId,
     * - ripristina metadata route/start/action fields,
     * - ricrea connessioni valide (`sourceOutput`/`targetInput` esistenti),
     * - reintegra stato visuale e zoom.
     * Se presente, privilegia `routeMetadataEntries` rispetto al metadata embedded nel nodo.
     */
    private restoreGraph;
    /**
     * Esegue zoom-to-fit dei nodi correnti ignorando errori in ambienti non visual/test.
     */
    private safeZoomAt;
    /**
     * Restituisce il nodo Start presente nel grafo, se esiste.
     */
    private findStartNode;
    /**
     * Garantisce l'esistenza del nodo Start dopo restore/clear.
     */
    private ensureInitialStartNode;
    /**
     * Forza il refresh dello stato visuale di tutti i nodi (doppio pass immediato+deferred).
     */
    private refreshAllNodeVisualState;
    /**
     * Reidrata ripetutamente lo stato visuale dopo restore per sincronizzare label/style con il renderer.
     */
    private rehydrateNodeVisualStateAfterRestore;
    /**
     * Svuota il canvas rimuovendo prima tutte le connessioni e poi tutti i nodi.
     */
    private clearGraph;
    /**
     * Normalizza la risposta `loadWorkflowGraph` supportando alias server legacy/nuovi:
     * - grafo da `graph_json|wg_graph_json|graphjson`
     * - metadata da `route_metadata|routeMetadata`
     * - nome da `graph_name|wg_name|graphname`.
     */
    private normalizeLoadedWorkflow;
    /**
     * Uniforma la risposta `getWorkflowGraphs` ad array righe,
     * gestendo sia array diretto sia envelope `{ results: [...] }`.
     */
    private normalizeSavedGraphs;
    /**
     * Effettua parse JSON tollerante: ritorna oggetto originale se gia object,
     * `null` su input vuoto/parse error.
     */
    private parseMaybeJson;
    /**
     * Recupera il primo campo valorizzato tra possibili alias (case-insensitive).
     */
    private pickFirstDefined;
    /**
     * Normalizza ricorsivamente un payload rendendolo serializzabile:
     * rimuove funzioni, evita cicli, converte date e scarta chiavi pericolose.
     */
    private sanitizeForSerialization;
    /**
     * Genera id locale per menu Start (positivo progressivo se presenti id reali,
     * altrimenti sequenza negativa temporanea).
     */
    private nextLocalMenuId;
    /**
     * Normalizza la collezione menu Start in shape coerente (`WorkflowStartMenuItem`),
     * includendo default/ordini/id locali e normalizzazione autorizzazioni figlie.
     */
    private normalizeStartMenuItems;
    /**
     * Normalizza le autorizzazioni menu supportando alias campo multipli (`muamid`, `muam_id`, ...).
     */
    private normalizeMenuAuthorizations;
    /**
     * Restituisce il prossimo id autorizzazione menu locale (max `muamid` + 1).
     */
    private nextLocalMenuAuthId;
    /**
     * Costruisce un `RouteMetadataBundle` leggendo `routeMetadataDs.metaInfo`
     * (tabella, colonne, azioni, permessi, stili e collezioni derivate su colonna).
     */
    private buildRouteMetadataBundle;
    /**
     * Variante builder da metaInfo esterno (non dal datasource live),
     * usata per reidratare bundle da payload dashboard/metaInfo.
     */
    private buildRouteMetadataBundleFromMetaInfo;
    /**
     * Estrae dal `boardcontent` dashboard i datasource annidati e per ciascuno
     * compone route + metadata bundle serializzabile.
     */
    private extractDashboardDatasourceMetadata;
    /**
     * Restituisce la lista datasource metadata associata a una route dashboard node,
     * con fallback a estrazione runtime dal boardcontent.
     */
    private getDashboardDatasourceMetadataEntries;
    /**
     * Seleziona un datasource metadata specifico per `uniqueName` o, in fallback, il primo disponibile.
     */
    private getDashboardDatasourceMetadataForNode;
    /**
     * Callback save dell'editor metadata route:
     * applica insert/update/delete al bundle, sincronizza datasource editor,
     * propaga eventuale update su boardcontent dashboard e riallinea nodi action derivati.
     */
    private handleRouteMetadataSave;
    private syncLinkedActionNodesFromMetadataSave;
    /**
     * Sincronizza i nodi action con `tableActions` del bundle route:
     * crea nodi mancanti, rimuove orfani e deduplica nodi duplicati per stesso target.
     */
    private syncTableActionNodesWithMetadata;
    /**
     * Rimuove dal bundle la riga corretta in base a `editorKey`/id presenti
     * (table action, permessi/stili tabella e colonna).
     */
    private removeRecordFromBundle;
    private isLinkedActionNode;
    /**
     * Applica tipo/scope a un nodo action e riallinea socket out:
     * navigation (type=0) richiede output `out`, altri tipi lo rimuovono.
     */
    private applyLinkedActionTypeToNode;
    /**
     * Rimuove tutte le connessioni uscenti `out` del nodo action (usato quando cambia tipologia).
     */
    private removeInvalidOutgoingConnections;
    /**
     * Converte il payload `EditFormComponent` in plain object unwrap-pando eventuali wrapper/soggetti.
     */
    private normalizeEditFormRecord;
    /**
     * Estrae il valore effettivo da field editor (`BehaviorSubject`, wrapper `{ value }`, scalari).
     */
    private unwrapEditorFieldValue;
    /**
     * Crea un route metadata bundle vuoto inizializzato per la route indicata.
     */
    private createEmptyRouteBundle;
    /**
     * Applica (upsert) un record editor nel segmento corretto del bundle route
     * inferendo il target da `editorKey`, id e shape dei campi.
     */
    private applyRecordToBundle;
    /**
     * Genera id locale negativo progressivo per nuove righe bundle non ancora persistite.
     */
    private nextLocalBundleItemId;
    /**
     * Esegue upsert in una collezione per chiave id stringificata.
     */
    private upsertById;
    /**
     * Ricostruisce le collezioni derivate da `columnMetadata`
     * (`columnActions`, `columnPermissions`, `columnStyles`).
     */
    private rebuildDerivedRouteCollections;
    /**
     * Applica il bundle metadata corrente alla datasource route metadata editor
     * aggiornando `metaInfo`, record corrente e `fetchInfo`.
     */
    private applyRouteMetadataBundleToDatasource;
    /**
     * Materializza un oggetto `metaInfo` coerente a partire da route bundle,
     * riallacciando permessi/stili alle rispettive colonne per id/nome.
     */
    private buildMetaInfoFromRouteMetadataBundle;
    private updateDashboardBoardcontentMetadata;
    /**
     * Traduzione istantanea con fallback locale quando la resource non e risolta.
     */
    private t;
    /**
     * Traduzione formattata con placeholder `{0}`, `{1}`, ... sostituiti da argomenti runtime.
     */
    private tf;
    static ɵfac: i0.ɵɵFactoryDeclaration<WorkflowDesignerComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<WorkflowDesignerComponent, "wuic-workflow-designer", never, {}, { "workflowChange": "workflowChange"; }, never, never, true, never>;
}

type WorkflowMenuAuthorization = {
    mmid: number;
    muamid: number;
    muamview: 0 | 1;
    ruoloid: number;
    utenteid: number;
};
type WorkflowStartMenuItem = {
    mm_id: number;
    mm_parent_id: number;
    mm_nome_menu: string;
    mm_display_string_menu: string;
    mm_tooltip_menu: string;
    mm_uri_menu: string;
    mm_ordine: number;
    mm_is_visible_by_default: boolean;
    _Metadati_Utenti_Autorizzazioni_Menus: WorkflowMenuAuthorization[];
};
type WorkflowNodeSerialized = {
    id: string;
    label: string;
    type: string;
    route: string;
    action: string;
    routePayload?: any;
    routeSourceType?: 'route' | 'dashboard';
    dashboardDatasources?: Array<{
        uniqueName: string;
        route: string;
        metadataBundle: any | null;
    }>;
    actionTypeId?: number;
    actionType?: string;
    routeNodeId?: string;
    metadataTargetType?: 'table_action' | 'column_button' | '';
    metadataTargetId?: number;
    startMenus?: WorkflowStartMenuItem[];
    startMenuCaption?: string;
    startExclusiveMenu?: boolean;
    startShowExit?: boolean;
    routeMetadata?: any;
};
type WorkflowConnectionSerialized = {
    id?: string;
    source: string;
    sourceOutput: string;
    target: string;
    targetInput: string;
};
declare class WorkflowRunnerComponent implements OnInit, OnDestroy {
    private route;
    private dataSrv;
    private runtimeMetadataSrv;
    private runtimeMenuSrv;
    private userInfo;
    private trslSrv;
    /**
     * Identificativo tecnico per graph id, usato in matching, lookup o routing interno.
     */
    graphId: string;
    /**
     * Proprieta di stato del componente per graph name, usata dalla logica interna e dal template.
     */
    graphName: string;
    /**
     * Proprieta di stato del componente per loading, usata dalla logica interna e dal template.
     */
    loading: boolean;
    /**
     * Messaggio o stato diagnostico per load error, usato nel feedback UX del componente.
     */
    loadError: string;
    /**
     * Collezione dati per nodes, consumata dal rendering e dalle operazioni del componente.
     */
    nodes: WorkflowNodeSerialized[];
    /**
     * Collezione dati per connections, consumata dal rendering e dalle operazioni del componente.
     */
    connections: WorkflowConnectionSerialized[];
    /**
     * Identificativo tecnico per route metadata by node id, usato in matching, lookup o routing interno.
     */
    routeMetadataByNodeId: Map<string, any>;
    /**
     * Proprieta di stato del componente per param sub, usata dalla logica interna e dal template.
     */
    private paramSub?;
    /**
     * Inietta le dipendenze runtime del runner:
     * route param source, provider dati workflow e servizi stato runtime (metadata/menu).
     */
    constructor(route: ActivatedRoute, dataSrv: DataProviderService, runtimeMetadataSrv: WorkflowRuntimeMetadataService, runtimeMenuSrv: WorkflowRuntimeMenuService, userInfo: UserInfoService, trslSrv: TranslationManagerService);
    private t;
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): void;
    /**
     * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
     */
    ngOnDestroy(): void;
    /**
     * Restituisce il nodo `start` corrente del grafo caricato.
     */
    get startNode(): WorkflowNodeSerialized | null;
    /**
     * Restituisce i nodi route direttamente collegati all'output del nodo Start.
     */
    get routeNodesConnectedToStart(): WorkflowNodeSerialized[];
    /**
     * Conteggio entry metadata route indicizzate per `nodeId`.
     */
    get routeMetadataCount(): number;
    /**
     * Carica un workflow dal backend (`loadWorkflowGraph`), normalizza nodi/connessioni/metadata
     * e pubblica lo stato runtime su `WorkflowRuntimeMetadataService` e `WorkflowRuntimeMenuService`.
     * @param graphId Chiave workflow (`graph_key`) letta dalla route.
     */
    private loadGraph;
    /**
     * Costruisce il menu runtime effettivo a partire dal nodo Start:
     * applica filtro visibilita/autorizzazioni, integra route collegate e voce uscita,
     * poi pubblica il risultato su `runtimeMenuSrv`.
     */
    private applyRuntimeMenus;
    /**
     * Valuta la visibilita di una voce Start menu in base alle autorizzazioni:
     * priorita `utente+ruolo` > `utente` > `ruolo` > `globale`; fallback al default della voce.
     */
    private isStartMenuVisible;
    /**
     * Normalizza l'array Start menu in shape `WorkflowStartMenuItem` coerente per runtime:
     * coercizione tipi, default etichette/ordine e normalizzazione autorizzazioni figlie.
     */
    private normalizeStartMenus;
    /**
     * Normalizza le righe autorizzazione menu supportando alias campo (`muam_id`, `ruolo_id`, ...).
     * @param fallbackMmId Id menu di fallback quando assente nella riga.
     */
    private normalizeMenuAuthorizations;
    /**
     * Costruisce il tree PrimeNG `MenuItem[]` dalle voci start menu,
     * ricostruendo la gerarchia `mm_parent_id` e normalizzando le route.
     */
    private buildStartMenuTree;
    /**
     * Normalizza una route in formato router-link:
     * `#/x` -> `/x`, `x` -> `/x`, stringa vuota -> `''`.
     */
    private normalizeRoutePath;
    /**
     * Calcola per ogni route la route precedente nel grafo (diretta o via action intermedia)
     * e produce una mappa lineare usata dal runtime metadata service.
     */
    private buildPreviousRouteNodeEntries;
    /**
     * Estrae le navigation action collegate a una table action:
     * risolve route sorgente/target dal grafo e allega metadata route target.
     */
    private buildLinkedActionRouteMetadataEntries;
    /**
     * Normalizza il payload `loadWorkflowGraph` (string/object, alias legacy/nuovi):
     * produce nodi/connessioni tipizzati, metadata route per node id e nome workflow.
     */
    private normalizeLoadedWorkflow;
    /**
     * Parse JSON tollerante: ritorna `null` su input vuoto/invalid JSON, oppure oggetto parse-ato.
     */
    private parseMaybeJson;
    /**
     * Restituisce il primo valore definito tra una lista di chiavi,
     * con matching case-insensitive su proprietà oggetto.
     */
    private pickFirstDefined;
    /**
     * Converte valori eterogenei (boolean/number/string) in boolean con fallback esplicito.
     */
    private toBoolean;
    static ɵfac: i0.ɵɵFactoryDeclaration<WorkflowRunnerComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<WorkflowRunnerComponent, "wuic-workflow-runner", never, {}, {}, never, never, true, never>;
}

interface NotificationItem {
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
declare class NotificationRealtimeService {
    private http;
    private userInfoService;
    private socket;
    private reconnectTimer;
    private currentUserId;
    private manuallyClosed;
    private connectingUserId;
    private snapshotInFlight;
    private snapshotInFlightUserId;
    private lastSnapshotAt;
    private lastSnapshotUserId;
    readonly unreadCount$: BehaviorSubject<number>;
    readonly notifications$: BehaviorSubject<NotificationItem[]>;
    readonly enabled$: BehaviorSubject<boolean>;
    constructor(http: HttpClient, userInfoService: UserInfoService);
    connect(userId?: number | null): Promise<void>;
    disconnect(): void;
    markRead(notificationId: number): Promise<void>;
    clearRead(userId?: number | null): Promise<void>;
    enqueue(payload: {
        userId: number;
        type?: string;
        message: string;
        targetJson?: string;
        payloadJson?: string;
        source?: string;
        createdBy?: string;
    }): Promise<void>;
    private openSocket;
    private scheduleReconnect;
    private loadSnapshot;
    private applySnapshot;
    private normalizeSnapshot;
    private normalizeItem;
    private buildApiUrl;
    private buildApiBaseUrl;
    private resolveUserIdFromSession;
    private resolveNotificationsEnabledFromSettings;
    private extractNotificationsEnabledFromResponse;
    static ɵfac: i0.ɵɵFactoryDeclaration<NotificationRealtimeService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<NotificationRealtimeService>;
}

declare class NotificationBellComponent implements OnInit, OnDestroy {
    private readonly realtime;
    private readonly router;
    userId?: number | null;
    title: string;
    emptyMessage: string;
    clearReadLabel: string;
    notificationPanel?: Popover;
    unreadCount: number;
    notifications: NotificationItem[];
    isVisible: boolean;
    private readonly sub;
    constructor(realtime: NotificationRealtimeService, router: Router);
    ngOnInit(): Promise<void>;
    ngOnDestroy(): void;
    clearRead(): Promise<void>;
    openNotification(item: NotificationItem): Promise<void>;
    private resolveNotificationPath;
    private parseJson;
    static ɵfac: i0.ɵɵFactoryDeclaration<NotificationBellComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<NotificationBellComponent, "wuic-notification-bell", never, { "userId": { "alias": "userId"; "required": false; }; "title": { "alias": "title"; "required": false; }; "emptyMessage": { "alias": "emptyMessage"; "required": false; }; "clearReadLabel": { "alias": "clearReadLabel"; "required": false; }; }, {}, never, never, true, never>;
}

declare class BoundedRepeaterComponent implements OnInit, OnDestroy {
    private route;
    private router;
    userService: UserInfoService;
    /**
     * Input dal componente padre per hardcoded route; usata nella configurazione e nel rendering del componente.
     */
    hardcodedRoute: string;
    /**
     * Input dal componente padre per route name; usata nella configurazione e nel rendering del componente.
     */
    routeName: BehaviorSubject<string>;
    /**
     * Input dal componente padre per action; usata nella configurazione e nel rendering del componente.
     */
    action: BehaviorSubject<string>;
    /**
     * Input dal componente padre per parent record; usata nella configurazione e nel rendering del componente.
     */
    parentRecord: any;
    /**
     * Input dal componente padre per parent meta info; usata nella configurazione e nel rendering del componente.
     */
    parentMetaInfo: MetaInfo;
    /**
     * Input dal componente padre per row custom select; usata nella configurazione e nel rendering del componente.
     */
    rowCustomSelect: (rowData: any, $event: any, dt: Table) => void;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per datasource.
     */
    datasource?: DataSourceComponent;
    /**
     * Flag di stato che governa il comportamento UI/logico relativo a loading.
     */
    loading: BehaviorSubject<boolean>;
    /**
     * Proprieta di stato del componente per bounded info, usata dalla logica interna e dal template.
     */
    boundedInfo: {
        resultInfo: ResultInfo;
        metaInfo: MetaInfo;
    };
    /**
     * Proprieta di stato del componente per pending list refresh, usata dalla logica interna e dal template.
     */
    private pendingListRefresh;
    /**
     * Proprieta di stato del componente per router events subscription, usata dalla logica interna e dal template.
     */
    private routerEventsSubscription?;
    /**
     * Proprieta di stato del componente per page size, usata dalla logica interna e dal template.
     */
    pageSize: number;
    /**
  * function Object() { [native code] }
  * @param route Informazione di navigazione usata per risolvere la route di destinazione.
  * @param router Informazione di navigazione usata per risolvere la route di destinazione.
  * @param userService Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
  */
    constructor(route: ActivatedRoute, router: Router, userService: UserInfoService);
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): void;
    /**
     * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
     */
    ngOnDestroy(): void;
    /**
  * Gestisce la logica operativa di `onRepeaterTemplateReady` in modo coerente con l'implementazione corrente.
  * @param action Parametro utilizzato dal metodo nel flusso elaborativo.
  */
    onRepeaterTemplateReady(action: string): void;
    /**
  * Gestisce la logica operativa di `confirmNavigationWithPendingChanges` orchestrando le chiamate `confirmProceedWithPendingChanges`.
  * @returns Promise che completa il flusso asincrono restituendo un risultato di tipo `Promise<boolean>`.
  */
    confirmNavigationWithPendingChanges(): Promise<boolean>;
    /**
   * Verifica una condizione di stato o di validita coordinando chiamate verso servizi applicativi.
   * @returns Esito booleano dell'elaborazione svolta dal metodo.
   */
    hasRouteFilterParam(): boolean;
    /**
   * Recupera e prepara i dati richiesti dal chiamante coordinando chiamate verso servizi applicativi.
   * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
   */
    private getCurrentAction;
    /**
  * Gestisce la logica operativa di `shouldShowEditPagerAndFilter` orchestrando le chiamate `getCurrentAction` e `hasRouteFilterParam`.
  * @returns Esito booleano del controllo/elaborazione eseguito dal metodo.
  */
    shouldShowEditPagerAndFilter(): boolean;
    static ɵfac: i0.ɵɵFactoryDeclaration<BoundedRepeaterComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<BoundedRepeaterComponent, "wuic-bounded-repeater", never, { "hardcodedRoute": { "alias": "hardcodedRoute"; "required": false; }; "routeName": { "alias": "routeName"; "required": false; }; "action": { "alias": "action"; "required": false; }; "parentRecord": { "alias": "parentRecord"; "required": false; }; "parentMetaInfo": { "alias": "parentMetaInfo"; "required": false; }; "rowCustomSelect": { "alias": "rowCustomSelect"; "required": false; }; }, {}, never, never, true, never>;
}

declare class DesignerRouteComponent implements OnInit {
    /**
     * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
     */
    loadedComponent: any;
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): Promise<void>;
    static ɵfac: i0.ɵɵFactoryDeclaration<DesignerRouteComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DesignerRouteComponent, "wuic-designer-route", never, {}, {}, never, never, true, never>;
}

type RouteOption = {
    label: string;
    value: string;
    mdId: number | null;
};
type PivotColumn = {
    alias: string;
    realName: string;
    label: string;
    dbType: string;
    uiType: string;
};
type PivotAxisColumn = PivotColumn & {
    castDate?: boolean;
    dateGroupBy?: string;
};
type PivotValueColumn = PivotColumn & {
    id: string;
    caption: string;
    aggregateFunction: string;
};
type SavedPivotOption = {
    label: string;
    value: string;
    info: any;
};
declare class PivotBuilderComponent implements OnInit, AfterViewInit {
    private dataSrv;
    private metaSrv;
    private trslSrv;
    private aRoute;
    activeFilterPanel: string;
    pivotName: string;
    routeOptions: RouteOption[];
    filteredRouteOptions: RouteOption[];
    selectedRouteOption?: RouteOption;
    selectedRouteName: string;
    selectedRouteMdId: number | null;
    sourceColumns: PivotColumn[];
    rowColumns: PivotAxisColumn[];
    columnColumns: PivotAxisColumn[];
    valueColumns: PivotValueColumn[];
    dateGroupByOptions: Array<{
        label: string;
        value: string;
    }>;
    aggregateFunction: string;
    topRows: number;
    readonly aggregateOptions: {
        label: string;
        value: string;
    }[];
    generatedSql: string;
    loadingRouteColumns: boolean;
    generatingSql: boolean;
    savingConfiguration: boolean;
    executingQuery: boolean;
    creatingView: boolean;
    creatingMaterializedTable: boolean;
    draggingColumn?: PivotColumn;
    nestedSource?: DataSourceComponent;
    pivotDatasource?: DataSourceComponent;
    pivotDatasourceSub?: Subscription;
    persistedFilterInfo?: any;
    persistedSortInfo?: any[];
    readonly pivotRoute$: BehaviorSubject<string>;
    readonly pivotDatasourceRef$: BehaviorSubject<DataSourceComponent>;
    showQueryResults: boolean;
    queryResultColumns: string[];
    queryResultRows: any[];
    private readonly dateOnlyFormatter;
    private readonly dateTimeFormatter;
    reopenPivotDialogVisible: boolean;
    reopeningPivotList: boolean;
    savedPivotOptions: SavedPivotOption[];
    reopenDialogSelectedPivotName: string | null;
    readonly sqlEditorOptions: {
        theme: string;
        language: string;
        automaticLayout: boolean;
        minimap: {
            enabled: boolean;
        };
        readOnly: boolean;
    };
    constructor(dataSrv: DataProviderService, metaSrv: MetadataProviderService, trslSrv: TranslationManagerService, aRoute: ActivatedRoute);
    private t;
    private buildDateGroupByOptions;
    ngOnInit(): Promise<void>;
    ngAfterViewInit(): void;
    loadRouteOptions(): Promise<void>;
    filterRouteOptions(event: AutoCompleteCompleteEvent): void;
    onRouteOptionSelected(option: RouteOption): Promise<void>;
    private selectRoute;
    private tryLoadPivotByName;
    private mapPivotColumns;
    onDragStart(event: DragEvent, column: PivotColumn): void;
    allowDrop(event: DragEvent): void;
    onDropToRows(event: DragEvent): void;
    onDropToColumns(event: DragEvent): void;
    onDropToValues(event: DragEvent): void;
    addToRows(column: PivotColumn): void;
    addToColumns(column: PivotColumn): void;
    addToValues(column: PivotColumn): void;
    private applyDrop;
    removeFromRows(alias: string): void;
    isAxisDateCastAvailable(column: PivotAxisColumn): boolean;
    isAxisDateTimeGroupAvailable(column: PivotAxisColumn): boolean;
    private normalizeDateGroupBy;
    setRowCastDate(alias: string, checked: boolean): void;
    setColumnCastDate(alias: string, checked: boolean): void;
    setRowDateGroupBy(alias: string, groupBy: string): void;
    setColumnDateGroupBy(alias: string, groupBy: string): void;
    private getRowColumnOptionsPayload;
    private getColumnColumnOptionsPayload;
    removeFromColumns(alias: string): void;
    removeFromValues(id: string): void;
    getValueAggregate(id: string): string;
    setValueAggregate(id: string, aggregate: string): void;
    setValueCaption(id: string, caption: string): void;
    private normalizeAggregate;
    normalizeTopRows(value: any): number;
    private extractDisplayLabel;
    private createValueColumn;
    private loadPersistedPivotConfiguration;
    private getPivotDatasource;
    private applyPersistedGridStateToDatasource;
    private deepClone;
    formatQueryCellValue(value: any, columnName?: string): string;
    private tryParseIsoLikeDate;
    private getAxisGroupByForResultColumn;
    private formatDateByGroupBy;
    private parseConfig;
    generatePivotSql(): Promise<void>;
    executePivotSql(): Promise<void>;
    createPivotView(): Promise<void>;
    private requestCreatePivotView;
    createPivotMaterializedTable(): Promise<void>;
    private requestCreatePivotMaterializedTable;
    onFilterBarApplied(): void;
    savePivotConfiguration(): Promise<void>;
    openReopenPivotDialog(): Promise<void>;
    cancelReopenPivotDialog(): void;
    confirmReopenPivotDialog(): Promise<void>;
    ngOnDestroy(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<PivotBuilderComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<PivotBuilderComponent, "wuic-pivot-builder", never, {}, {}, never, never, true, never>;
}

declare class WorkflowDesignerRouteComponent implements OnInit {
    /**
     * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
     */
    loadedComponent: any;
    /**
     * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
     */
    ngOnInit(): Promise<void>;
    static ɵfac: i0.ɵɵFactoryDeclaration<WorkflowDesignerRouteComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<WorkflowDesignerRouteComponent, "wuic-workflow-designer-route", never, {}, {}, never, never, true, never>;
}

declare class ReportDesignerComponent implements AfterViewInit, OnDestroy {
    private router;
    private aRoute;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per designer.
     */
    designer: StimulsoftDesignerComponent;
    /**
     * Proprieta di stato del componente per request url, usata dalla logica interna e dal template.
     */
    requestUrl: string;
    /**
     * Proprieta di stato del componente per base request url, usata dalla logica interna e dal template.
     */
    baseRequestUrl: string;
    /**
     * Proprieta di stato del componente per route, usata dalla logica interna e dal template.
     */
    route: string;
    /**
     * Valore corrente selezionato per current report, usato dai flussi interattivi del componente.
     */
    currentReport: string;
    /**
     * Proprieta di stato del componente per router events subscription, usata dalla logica interna e dal template.
     */
    private routerEventsSubscription?;
    /**
     * Proprieta di stato del componente per designer bootstrap interval, usata dalla logica interna e dal template.
     */
    private designerBootstrapInterval?;
    /**
   * function Object() { [native code] }
   * @param router Informazioni di routing usate per comporre o risolvere la navigazione.
   * @param aRoute Informazioni di routing usate per comporre o risolvere la navigazione.
   */
    constructor(router: Router, aRoute: ActivatedRoute);
    /**
* Esegue operazioni di persistenza/sincronizzazione in `syncRequestUrl` allineando lo stato con parametri route/query.
*/
    private syncRequestUrl;
    /**
* Gestisce la logica di `fix` con il flusso specifico definito dalla sua implementazione.
*/
    fix(): void;
    /**
     * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
     */
    ngAfterViewInit(): void;
    /**
     * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
     */
    ngOnDestroy(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<ReportDesignerComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<ReportDesignerComponent, "wuic-report-designer", never, {}, {}, never, never, true, never>;
}

declare class ReportViewerComponent implements OnDestroy {
    private router;
    private aRoute;
    /**
     * Riferimento a elementi o componenti figli usato dalla logica UI per viewer.
     */
    viewer: StimulsoftViewerComponent;
    /**
     * Proprieta di stato del componente per request url, usata dalla logica interna e dal template.
     */
    requestUrl: string;
    /**
     * Proprieta di stato del componente per base request url, usata dalla logica interna e dal template.
     */
    baseRequestUrl: string;
    /**
     * Proprieta di stato del componente per route, usata dalla logica interna e dal template.
     */
    route: string;
    /**
     * Proprieta di stato del componente per action, usata dalla logica interna e dal template.
     */
    action: string;
    /**
     * Valore corrente selezionato per current report, usato dai flussi interattivi del componente.
     */
    currentReport: string;
    /**
     * Proprieta di stato del componente per router events subscription, usata dalla logica interna e dal template.
     */
    private routerEventsSubscription?;
    /**
   * function Object() { [native code] }
   * @param router Informazioni di routing usate per comporre o risolvere la navigazione.
   * @param aRoute Informazioni di routing usate per comporre o risolvere la navigazione.
   */
    constructor(router: Router, aRoute: ActivatedRoute);
    /**
   * Esegue una operazione di persistenza/sincronizzazione mantenendo coerente lo stato locale coordinando chiamate verso servizi applicativi.
   */
    private updateRequestUrl;
    /**
   * Costruisce una struttura di output a partire dal contesto corrente normalizzando e trasformando collezioni di record.
   * @param rawFilterInfo Criteri di filtro applicati per limitare il dataset o aggiornare la query visualizzata.
   * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
   */
    private buildFiltersQueryString;
    /**
   * Trasforma i dati in una forma coerente con il rendering o con il payload richiesto orchestrando le chiamate `String`.
   * @param filter Criteri di filtro applicati per limitare il dataset o aggiornare la query visualizzata.
   * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
   */
    private mapFilterToControllerFormat;
    /**
* Gestisce la logica di `fix` orchestrando le chiamate `dashboardRefresh`.
*/
    fix(): void;
    /**
     * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
     */
    ngOnDestroy(): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<ReportViewerComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<ReportViewerComponent, "wuic-report-viewer", never, {}, {}, never, never, true, never>;
}

declare const boundedRepeaterPendingChangesGuard: CanDeactivateFn<BoundedRepeaterComponent>;

declare const routes: Routes;

declare function loadTextEditorComponent(): Promise<typeof wuic_framework_lib.TextEditorComponent>;
declare function loadTextAreaEditorComponent(): Promise<typeof wuic_framework_lib.TextAreaEditorComponent>;
declare function loadNumberEditorComponent(): Promise<typeof wuic_framework_lib.NumberEditorComponent>;
declare function loadBooleanEditorComponent(): Promise<typeof wuic_framework_lib.BooleanEditorComponent>;
declare function loadLookupEditorComponent(): Promise<typeof wuic_framework_lib.LookupEditorComponent>;
declare function loadButtonEditorComponent(): Promise<typeof wuic_framework_lib.ButtonEditorComponent>;
declare function loadDateEditorComponent(): Promise<typeof wuic_framework_lib.DateEditorComponent>;
declare function loadDictionaryEditorComponent(): Promise<typeof wuic_framework_lib.DictionaryEditorComponent>;
declare function loadHtmlEditorComponent(): Promise<typeof wuic_framework_lib.HtmlEditorComponent>;
declare function loadUploadEditorComponent(): Promise<typeof wuic_framework_lib.UploadEditorComponent>;
declare function loadCodeAreaEditorComponent(): Promise<typeof wuic_framework_lib.CodeAreaEditorComponent>;
declare function loadColorEditorComponent(): Promise<typeof wuic_framework_lib.ColorEditorComponent>;
declare function loadTreeViewSelectorComponent(): Promise<typeof wuic_framework_lib.TreeViewSelectorComponent>;
declare function loadPropertyArrayEditorComponent(): Promise<typeof wuic_framework_lib.PropertyArrayEditorComponent>;
declare function loadPropertyObjectEditorComponent(): Promise<typeof wuic_framework_lib.PropertyObjectEditorComponent>;

declare class VisibleFieldListPipe implements PipeTransform {
    transform(value: any[], ...args: any): any[];
    static ɵfac: i0.ɵɵFactoryDeclaration<VisibleFieldListPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<VisibleFieldListPipe, "visibleFieldList", true>;
}

declare class CallbackPipe implements PipeTransform {
    transform(items: any[], callback: (item: any) => boolean, field?: string): any;
    static ɵfac: i0.ɵɵFactoryDeclaration<CallbackPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<CallbackPipe, "callback", true>;
}

declare class IsSelectedRowPipe implements PipeTransform {
    transform(items: any[], rowData: any, metaInfo: MetaInfo): any;
    static ɵfac: i0.ɵɵFactoryDeclaration<IsSelectedRowPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<IsSelectedRowPipe, "isSelectedRow", true>;
}

declare class FormatGridViewValuePipe implements PipeTransform {
    transform(rowData: unknown, metaColumn: MetadatiColonna): unknown;
    static ɵfac: i0.ɵɵFactoryDeclaration<FormatGridViewValuePipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<FormatGridViewValuePipe, "formatGridViewValue", true>;
}

declare class CallbackPipe2 implements PipeTransform {
    transform(items: any[], callback: any): any;
    static ɵfac: i0.ɵɵFactoryDeclaration<CallbackPipe2, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<CallbackPipe2, "callback2", true>;
}

declare class GetSrcUploadPreviewPipe implements PipeTransform {
    transform(value: string, UploadField: MetadatiColonna, metaInfo: MetaInfo, record: any, thumb?: boolean): string;
    static ɵfac: i0.ɵɵFactoryDeclaration<GetSrcUploadPreviewPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<GetSrcUploadPreviewPipe, "getSrcUploadPreview", true>;
}