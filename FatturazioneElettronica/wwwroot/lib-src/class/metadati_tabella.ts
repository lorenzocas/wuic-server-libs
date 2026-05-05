import { BehaviorSubject } from "rxjs";
import { DataSourceComponent } from "../component/data-source/data-source.component";
import { WtoolboxService } from "../service/wtoolbox.service";
import { MetadatiConditionGroup } from "./metadati_condition_group";
import { MetadatiCustomActionTabella } from "./metadati_custom_actions_tabelle";
import { MetadatiUiStiliTabella } from "./metadati_ui_stili_tabella";
import { MetaInfo } from "./metaInfo";
import { MapOptions } from "./mapOptions";
import { GroupInfo } from "./groupInfo";
import { AggregationInfo } from "./aggregationInfo";
import { SchedulerOptions } from "./schedulerOptions";
import { TreeOptions } from "./treeOptions";
import { CarouselOptions } from "./carouselOptions";
import { ChartOptions } from "./chartOptions";
import { FormOptions } from "./formOptions";
import { KanbanOptions } from "./kanbanOptions";

export class MetadatiTabella {

    __user_id: number;
    ProjectMetadataVersion: number;

    md_id: number;
    md_nome_tabella: string;
    /**
     * True quando la route metadata punta a una stored procedure invece di
     * una tabella/vista. In questo caso il datasource fetcher dispatcha la
     * read verso `MetaService.getFlatDataFromStored` invece di
     * `MetaService.getFlatRecordData`, e i `parameterInfo` (derivati da
     * `md_props_bag.parameters`) vengono inviati come `filterElement[]`
     * con i placeholder `{{currentUser.*}}` interpolati lato client.
     */
    md_is_stored: boolean;
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
    md_drop_callback: string;
    md_custom_row_template: string;
    md_custom_repeater_view_template: string;
    md_custom_filter_template: string;
    md_custom_filter_cell_template: string;
    md_custom_view_cell_template: string;
    md_custom_edit_cell_template: string;
    md_custom_pager_template: string;
    md_custom_header_template: string;
    md_custom_header_cell_template: string;
    md_custom_command_header_template: string;
    md_custom_title_template: string;
    md_hide_refresh: boolean;
    md_hide_print: boolean;
    md_hide_export_pdf: boolean;
    md_hide_export_xls: boolean;
    md_auto_refresh_seconds: number;
    md_inline_cell_editing: boolean;
    md_batch_save: boolean;
    md_props_bag: any;
    md_hide_select_all_check: boolean;
    md_multiple_radio_selection: boolean;
    md_persist_row_selection_accross_paging: boolean;
    md_custom_edit: string;
    md_custom_delete: string;
    md_delete_and_sync: boolean;
    hide_toolbar: boolean;

    preventNavigateOnFilter: boolean | undefined;
    extraProps: {
        endpoint: {
            type: string,
            method: 'get' | 'post',
            uri: string,
            parameterMapping: [
                {
                    source: {
                        type: string,
                        name: string,
                        required: boolean,
                        path: string
                    },
                    target: {
                        type: string,
                        name: string,
                        parseFunction: string
                    }
                }
            ]
        },
        archetypes: {
            scheduler: SchedulerOptions,
            tree: TreeOptions,
            /**
             * Configurazione componente `<wuic-spreadsheet-list-sf>`.
             * Letta in `spreadsheet-list-sf.component.ts` via
             * `metaInfo.tableMetadata.extraProps.archetypes.spreadsheet.*`.
             */
            spreadsheet: {
                /** Page size iniziale (override di `md_pagesize`). */
                paginationSize?: number;
                [k: string]: any;
            },
            /**
             * Configurazione componente `<wuic-list-grid>`.
             * Letta in `list-grid.component.ts` (vedi metodi
             * `isProportionalColwidthEnabled`, `isAdvancedFilterModeEnabled`,
             * `isListVirtualizationEnabled`, ecc.).
             */
            list: {
                /**
                 * Distribuzione proporzionale larghezze colonne.
                 * Parser tollerante (`true/false/1/0/""/`stringa).
                 * Default attivo quando assente.
                 */
                proportionalColwidth?: boolean | number | string;
                /**
                 * Abilita modalita' filter-bar avanzata.
                 * Parser tollerante boolean-like.
                 */
                advancedFilter?: boolean | number | string;
                /**
                 * Virtual scroll PrimeNG della list-grid.
                 * Forme: boolean/number/string o oggetto
                 * `{enabled, itemSize, virtualRowHeight, rowHeight}`.
                 */
                virtualize?: boolean | number | string | {
                    enabled?: boolean | number | string;
                    itemSize?: number;
                    virtualRowHeight?: number;
                    rowHeight?: number;
                };
                /**
                 * Override dell'inline-cell-editing per la singola list.
                 * Fallback tollerato su chiave `d_inline_cell_editing`.
                 */
                md_inline_cell_editing?: boolean | number | string;
                [k: string]: any;
            },
            map: MapOptions,
            carousel: CarouselOptions,
            chart: ChartOptions,
            form: FormOptions,
            kanban: KanbanOptions,
            /**
             * Placeholder archetypes edit/detail. Hanno la stessa shape della
             * list (principalmente `advancedFilter`) ma il runtime consuma
             * solo `archetypes.list.advancedFilter` via
             * `list-grid.getAdvancedFilterRuleFromPropsBag`. Qui lasciamo
             * spazio forward-looking a controlli dedicati edit/detail page.
             */
            edit?: {
                advancedFilter?: boolean | number | string;
                [k: string]: any;
            };
            detail?: {
                advancedFilter?: boolean | number | string;
                [k: string]: any;
            };
        },
        /**
         * Parametri di route persistiti in `md_props_bag.parameters` e
         * rehydrati da `metadata-provider.service.ts` in
         * `tableMetadata.parameterInfo` (array di `MetadatiColonna`
         * sintetiche usate dalla filter-bar per i parametri stored
         * procedure / query parametrizzate).
         */
        parameters: {
            /** Nome parametro → diventa `mc_nome_colonna`. */
            Name: string;
            /** Tipo UI (matcha `mc_ui_column_type`), es. 'text', 'number'. */
            Type: string;
            /** Valore default stringa. Se mancante → '0'. */
            value?: string;
            /** Mostra parametro nella filter-bar. */
            enabled?: boolean;
            /** Alias di `enabled` (nomi storici). */
            mc_show_in_filters?: boolean;
            /** Parametro di output (non renderizzato in filter-bar). */
            isOut?: boolean;
            /** Body JS eseguito post-creazione per custom tweaks. */
            customizationCallback?: string;
            [k: string]: any;
        }[];
        groupInfo: GroupInfo[],
        aggregates: AggregationInfo[],
        cloneDefinition: {
            relatedRoutes: {
                relatedRoute: string,
                relatedIdField: string
            }[]
        },
        changeTracking: boolean,
        client_side_crud: boolean | {
            enabled?: boolean,
            batchSize?: number,
            maxPages?: number,
            includeLookupRoutes?: boolean
        },
        /**
         * Flag toolbar-level controllati da `md_props_bag.toolbar.*` (JSON).
         * Cambiabili per-route senza toccare lo schema SQL di
         * `_metadati__tabelle`. Esempio in `md_props_bag`:
         *   { "toolbar": { "hideManageState": true } }
         *
         *  - `hideManageState`: nasconde il bottone "Gestione stato"
         *     (icona bookmark) + la select degli stati salvati nella
         *     caption-right della list-grid. Utile per route hardcoded /
         *     demo dove il saved-state feature (persistenza user_id +
         *     route via MetaService) non ha senso — es. Pattern 3 puro
         *     OData senza route metadata registrata.
         */
        toolbar?: {
            hideManageState?: boolean;
        };
        /**
         * Tuning server-side letto da `DataProviderMetaService.select`
         * (vedi ~riga 196) e dal backend `MetaService.cs` (server-side
         * translations di record).
         */
        serverProperties?: {
            /**
             * Ottimizzazioni della query SQL generata per la list-grid.
             * Attualmente il client consuma solo `countPolicy === 'cursor'`
             * per attivare la cursor-mode pagination (no count globale,
             * prev/next via cursor). Le altre opzioni sono consumate lato
             * server da `MetaService.getFlatData` / SQL builder.
             */
            queryOptimization?: {
                /** Master toggle del blocco di ottimizzazioni. */
                enabled?: boolean;
                /**
                 * Policy del COUNT(*):
                 *   - `exact`: count sempre calcolato (default);
                 *   - `skipWhenPaged`: count skippato quando si usa paging;
                 *   - `never`: count mai calcolato (pager UI senza totale);
                 *   - `cursor`: cursor-mode, niente count, navigazione prev/next.
                 */
                countPolicy?: 'exact' | 'skipWhenPaged' | 'never' | 'cursor';
                /**
                 * Hint SQL Server applicati alla query.
                 *   - `none`: nessun hint;
                 *   - `recompile`: aggiunge `OPTION (RECOMPILE)` alla query.
                 */
                sqlServerHint?: 'none' | 'recompile';
            };
            /**
             * Traduzioni record-level gestite server-side:
             * MetaService merge-a i campi tradotti da una tabella
             * separata basandosi sulla lingua dell'utente.
             */
            RecordTranslations?: {
                Enabled?: boolean;
                /** Nome tabella traduzioni (default: convention `_translations_<route>`). */
                DefaultTableName?: string;
                /** Nome campo JSON nella tabella traduzioni. */
                TranslationJsonFieldName?: string;
                /** Lingua di fallback quando quella utente non ha righe. */
                DefaultLanguage?: string;
                /** Nomi campi da tradurre (lista bianca). */
                FieldNames?: string[];
            };
        };
        /**
         * Regole di notifica emesse dal backend al trigger di eventi CRUD
         * sul record (insert/update/delete). Consumato lato server
         * (`MetaService.cs`) — lato client e' solo persistenza via
         * `md_props_bag`. Vedi [list-grid.md](docs/pages/list-grid.md)
         * per i template attesi.
         */
        notifications?: {
            triggerRules?: {
                enabled?: boolean;
                event?: 'insert' | 'update' | 'delete';
                /** Nome logico della regola (identificatore per dedup/log). */
                triggerName?: string;
                /** Colonne da watchare per trigger di update (diff-based). */
                watchColumns?: string[];
                /** Espressione JS/SQL per derivare l'user-id destinatario. */
                userIdExpr?: string;
                /** Template stringa per il tipo notifica (icona, categoria). */
                typeTemplate?: string;
                /** Template stringa per il corpo messaggio. */
                messageTemplate?: string;
                /** Template URL/route di destinazione al click. */
                targetTemplate?: string;
                /** Template JSON payload strutturato. */
                payloadTemplate?: string;
                /** Sorgente emissione (es. nome modulo/servizio). */
                source?: string;
            }[];
        };
    };
    parameterInfo: any[];

    md_update_uri: string;
    hideSave: any;
    hideRollback: any;
    hideGoBack: any;

    _Metadati_Custom_Actions_Tabelles: MetadatiCustomActionTabella[];
    _Metadati_Utenti_Autorizzazioni_Tabelles: any[];
    // _Metadati_Custom_EditForm_Actions: MetadatiCustomEditFormAction[];
    _Metadati_UI_Stili_Tabelles: MetadatiUiStiliTabella[];
    _Metadati_Condition_Groups: MetadatiConditionGroup[]

    md_conditional_update_rule_fn: (metaInfo: MetaInfo, record: any, datasource: DataSourceComponent, wtoolbox: typeof WtoolboxService) => boolean;
    md_conditional_delete_rule_fn: (metaInfo: MetaInfo, record: any, datasource: DataSourceComponent, wtoolbox: typeof WtoolboxService) => boolean;
    md_before_save_fn: (datasource: DataSourceComponent, savingData: any, beforeSync: (shouldSync: boolean) => void, event: any, wtoolbox: typeof WtoolboxService) => Promise<any> | any;
    md_after_save_fn: (datasource: DataSourceComponent, savingData: any, syncedData: any, isInsert: boolean, isClone: boolean, isDelete: boolean, event: any, wtoolbox: typeof WtoolboxService) => Promise<void> | void;
    md_after_load_fn: (datasource: DataSourceComponent, originalEvent: any, result: any, loadedRecords: any[], isInsert: boolean, wtoolbox: typeof WtoolboxService) => Promise<void> | void;

    //lascia non async
    md_display_formula_fn: (metaInfo: MetaInfo, record: { [key: string]: BehaviorSubject<any> }, datasource: DataSourceComponent, wtoolbox: typeof WtoolboxService) => string;

    constructor(name: string) {
        this.md_id = 0;

        this.md_nome_tabella = name;

        this.md_is_stored = false;
        this.md_editable = true;
        this.md_deletable = true;
        this.md_insertable = true;
        this.md_display_string = "";
        this.md_long_description = "";
        this.is_system_route = false;
        this.md_url_read = "";
        this.md_url_update = "";
        this.md_url_delete = "";
        this.md_url_insert = "";

        this.md_sortable = true;
        this.md_groupable = false;
        this.md_scrollable = false;
        this.md_pageable = true;
        this.md_pagesize = 10;
        this.md_edit_popup = false;
        this.md_inline_edit = false;
        this.md_server_side_operations = true;
        this.md_nested_grid_routes = "";
        this.md_detail_grid_routes = "";
        this.md_parent_key_name = "";
        this.md_master_detail_edit = false;
        this.md_default_filter = "";
        this.md_header_rows_edit = false;
        this.md_multiple_selection = false;
        this.md_detail_action = false;
        this.md_display_formula = null;
        this.md_importable = false;
        this.md_clonable = false;
        this.md_open_filter_onload = false;

        this.md_before_save = null;
        this.md_after_save = null;
        this.md_after_load = null;

        this.md_ui_grid_conditional_template = "";
        this.md_ui_grid_conditional_alt_template = "";
        this.md_ui_grid_conditional_template_condition = "";

        this.md_conditional_update_rule = null;
        this.md_conditional_delete_rule = null;

        this.md_appoggio_left_table = null;
        this.md_appoggio_right_table = null;
        this.md_appoggio_allow_drag_drop = null;
        this.md_appoggio_edit_extra_data = null;
        this.md_appoggio_left_fk_name = null;
        this.md_appoggio_right_fk_name = null;

        this.md_treeview_template = "";
        this.md_gridview_template = "";
        this.md_rowTemplate = "";
        this.md_filter_template = "";
        this.md_detail_template = "";
        this.md_edit_template = "";
        this.md_book_html_template = "";
        this.md_gallery_html_template = "";
        this.md_map_html_template = "";

        this.md_grant_by_default = true;
        this.md_record_restriction_key_user_field_list = "";
        this.md_user_id_field_name = "";
        this.md_logging_enable = false;
        this.md_logging_last_mod_user_field_name = "";
        this.md_logging_last_mod_date_field_name = "";
        this.md_logging_insert_user_field_name = "";
        this.md_logging_insert_date_field_name = "";
        this.md_logging_delete_user_field_name = "";
        this.md_loggingdelete_date_field_name = "";
        this.md_logging_azienda_field_name = "";

        this.md_has_logic_delete = false;
        this.md_disabilita_filtri = false;
        this.md_grid_scroll_height = null;
        this.md_table_edit = false;
        this.md_tab_edit = false;
        this.md_table_column_counta = null;

        this.md_show_record_count = true;
        this.md_page_size_choice = "";

        this.md_is_reticular = false;
        this.reticular_key_name = "";
        this.reticular_key_value = null;

        this.md_conn_name = "";
        this.md_db_name = "";
        this.md_primary_key_type = "";
        this.md_db_name = "";
        this.md_schema_name = "";
        this.md_route_name = name;
        this.md_is_view = false;

        this.md_expose_in_webapi = false;
        this.md_expose_in_wcf = false;
        this.md_include_definition = false;
        this.md_service_custom_settings = false;
        this.md_service_page_size = 10;
        this.md_service_disable_sorting = false;
        this.md_service_disable_filtering = false;
        this.md_service_enable_edit = false;
        this.md_service_enable_insert = false;
        this.md_service_enable_delete = false;
        this.md_service_enable_detail = false;
        this.md_service_enable_clone = false;
        this.md_service_apply_default_filter = false;
        this.md_service_enable_logging = false;

        this._Metadati_Custom_Actions_Tabelles = [];
        this._Metadati_Utenti_Autorizzazioni_Tabelles = [];

        // this._Metadati_Custom_EditForm_Actions = [];

        this._Metadati_UI_Stili_Tabelles = [];

        this.md_allow_drag = false;
        this.md_allow_drop = false;
        this.md_drop_callback = null;

        this.md_custom_row_template = null;
        this.md_custom_repeater_view_template = null;
        this.md_custom_filter_template = null;
        this.md_custom_filter_cell_template = null;
        this.md_custom_view_cell_template = null;
        this.md_custom_edit_cell_template = null;
        this.md_custom_pager_template = null;
        this.md_custom_header_template = null;
        this.md_custom_header_cell_template = null;
        this.md_custom_command_header_template = null;
        this.md_custom_title_template = null;

        this.md_hide_refresh = null;
        this.md_hide_print = null;
        this.md_hide_export_pdf = null;
        this.md_hide_export_xls = null;
        this.md_auto_refresh_seconds = null;

        this.md_inline_cell_editing = false;

        this.md_batch_save = false;

        this.md_props_bag = null;

        //not mapped to DB
        this.md_hide_select_all_check = false;
        this.md_multiple_radio_selection = false;
        this.md_persist_row_selection_accross_paging = true;
        this.md_custom_edit = null;
        this.md_custom_delete = null;
        this.md_delete_and_sync = false;
        this.hide_toolbar = false;

        this.parameterInfo = [];
    }
}
