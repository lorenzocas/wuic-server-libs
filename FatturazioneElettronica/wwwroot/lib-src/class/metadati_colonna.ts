import { WtoolboxService } from "../service/wtoolbox.service";
import { GlobalHandler } from "../handler/GlobalHandler";
import { WuicClientException } from "../exception/WuicClientException";
import { WuicErrorCodes } from "../exception/WuicErrorCodes";
import { MetadatiTabella } from "./metadati_tabella";
import { MetadatiUiStiliColonna } from "./metadati_ui_stili_colonna";
import { MetadatiUtentiAutorizzazioniColonna } from "./metadati_utenti_autorizzazioni_colonna";
import { MetaInfo } from "./metaInfo";
import { ValidationRule } from "./validationRule";
import type { IFieldEditor } from "./IFieldEditor";
import { BehaviorSubject } from "rxjs";
import { EditorOptions } from "../component/code-editor/editor-options";
import { formatCurrency, formatNumber, formatPercent } from '@angular/common';
import { FilterInfo } from "./filterInfo";

export class MetadatiColonna {
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
    // `| (string & {})` e' un idiom TypeScript: mantiene l'autocomplete
    // delle literal in VS Code ma accetta qualsiasi stringa a runtime.
    // Se scrivessimo solo `| string`, il compilatore collasserebbe
    // l'intera unione in `string` e IntelliSense non proporrebbe
    // piu' le literal (fallback a word-based suggest dal workspace).
    // Fonte: https://github.com/microsoft/TypeScript/issues/29729
    mc_ui_column_type: 'text' | 'txt_area' | 'number' | 'number_boolean' | 'date' | 'datetime' | 'boolean' | 'lookupByID' | 'multiple_check' | 'point' | 'button' | 'code_editor' | 'dictionary' | 'dictionary_radio' | 'html_area' | 'upload' | 'color' | 'polygon' | 'tree' | (string & {});
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
    mc_filter_disable_operator: boolean;
    mc_filter_hide_operator: boolean;
    mc_editable_insert_only: boolean;

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
    /**
     * Shape runtime di `mc_props_bag` (JSON persistito su
     * `_metadati__colonne.mc_props_bag`). Viene idratato da
     * `MetadataProviderService.parseMetadataBag` al fetch metadata.
     *
     * Convenzione: ogni toggle/config colonna che NON corrisponde a una
     * colonna SQL reale di `_metadati__colonne` vive qui (vedi
     * [Widget Lookup](docs/pages/field-widget-lookup.md) per gli esempi
     * documentati). Quando aggiungi una nuova chiave in `mc_props_bag`,
     * estendi anche questo type perche' sia autocomplete-friendly.
     */
    extras: {
        /**
         * Parametri custom per widget colonna specifici. Uso raro; shape
         * dipende dal widget consumer (nessun contratto stabile). Lasciato
         * `any[]` permissivo finche' non emergono pattern consolidati.
         */
        parameters: any[];
        form: {
            /**
             * Numero di colonne Bootstrap che il campo occupa nel form edit
             * (es. 1 = `col-md-12` full-width, 2 = `col-md-6` mezza riga,
             * 3 = `col-md-4`, 4 = `col-md-3`). Override del layout table-level
             * `extraProps.archetypes.form.columns`.
             */
            columns?: number;
            /**
             * Forza il campo in readonly indipendentemente da `mc_logic_editable`
             * e dalle condition-action. Utile per lock temporanei da metadata
             * senza toccare i flag standard.
             */
            disabled?: boolean;
        },
        style: {
            /**
             * CSS inline applicato all'editor del campo nel form (es.
             * `"max-width: 420px;"`). Il contenuto e' iniettato "as is" nel
             * `style` dell'host — non e' validato.
             */
            editCss: string
        },
        /**
         * Callback JS (body di funzione) eseguito durante la validazione
         * per verificare unicita' del valore verso il backend prima del
         * save. Shape stringa libera parsata da `new Function(...)`.
         */
        checkUniqueValue: string,
        /**
         * Configurazione avanzata dei widget lookup (`lookupByID`,
         * `multiple_check`). Documentata in
         * `docs/pages/field-widget-lookup.md` → sezione "mc_props_bag utile".
         */
        lookup: {
            /**
             * Vincolo aggiuntivo client/server applicato a ogni query lookup.
             * Shape `FilterInfo` (logic + filters[]).
             */
            filter?: FilterInfo;
            /**
             * Virtual scroll sul p-autocomplete del dropdown lookup.
             * Forme accettate:
             *   - `true` / `false` (boolean puro)
             *   - `1` / `0` (shorthand numerico)
             *   - stringa equivalente (`"true"`, `"1"`, ecc.)
             *   - oggetto `{enabled, itemSize, virtualRowHeight, rowHeight}`
             * `isLookupVirtualizationEnabled()` fa il parsing tollerante.
             */
            virtualize?: boolean | number | string | {
                enabled?: boolean | number | string;
                /** Altezza riga virtuale in px. Default `44`. */
                itemSize?: number;
                /** Alias di `itemSize` (retrocompatibile). */
                virtualRowHeight?: number;
                /** Alias di `itemSize` (retrocompatibile). */
                rowHeight?: number;
            };
            /**
             * Override endpoint dati lookup: instrada il FETCH delle options
             * a un provider specifico bypassando il combo-endpoint
             * metadata standard (`MetaService.getFlatRecordComboData`).
             * Es. `{type:'odata', uri:'/odata/Stateprovinces'}` →
             * `DataProviderOdataService.selectCombo`. Vedi
             * `DataProviderService.select()` per il dispatcher.
             */
            endpoint?: {
                type: string;
                uri: string;
                [k: string]: any;
            };
            /**
             * Legacy: items client-only iniettati nel dropdown lookup
             * senza passare dal server. Non piu' renderizzato attivamente
             * dal framework, mantenuto per retrocompatibilita'.
             */
            unboundedItems?: any[];
            /** Espansione futura — chiavi custom tollerate. */
            [k: string]: any;
        },
        /**
         * Configurazione del code-editor Monaco per colonne `mc_ui_column_type`
         * = 'code_editor' (+ 'html_area', ecc). Letta da
         * `code-editor.component.ts` e `ts-parser.ts`.
         */
        customEditorConfig: {
            /** Opzioni Monaco standard (language, theme, minimap, ecc.). */
            editorOptions: EditorOptions,
            /** Compiler options TS passate a Monaco (language service). */
            compilerOptions?: any,
            /** JSON schemas caricati per validazione editor JSON/YAML. */
            schemas?: any[],
            /** Context code path per import risolti relativamente a una route. */
            codeContext?: string,
            /** `.d.ts` aggiuntivi da caricare come extra libs Monaco. */
            extraLibs?: string[],
            /** Nome campo che fornisce la route-id di contesto (per ts-parser). */
            routeContextField?: string,
            /** Nome campo che fornisce la column-id di contesto (per ts-parser). */
            columnContextField?: string,
            /**
             * Abilita auto-format HTML sull'editor `html_area`.
             * Default `true` (solo valore esplicito `false` lo disattiva).
             */
            htmlAutoFormat?: boolean,
            [k: string]: any;
        },
        uploader: {
            /**
             * Callback eseguito prima dell'upload. Accetta:
             *   - stringa → body JS parsato con `new Function(...)`
             *   - Function → invocata direttamente
             * Puo' annullare/trasformare il file. Shape del call-site
             * determinata runtime dal widget uploader.
             */
            beforeUpload: string | Function
        },
        /**
         * Slim combo: restringe le colonne fetchate dal combo-endpoint
         * ai soli campi necessari al dropdown (PK + text + extraFields),
         * riducendo il payload di ~80-90% rispetto al full entity.
         * Letto da `DataProviderMetaService.buildSlimComboRestriction`
         * (vedi `data-provider-meta.service.ts:135`).
         *
         * Semantica:
         *   - omesso o `true` (default): slim attivo → fetch PK +
         *     `mc_ui_lookup_dataValueField` + `mc_ui_lookup_dataTextField`
         *     + eventuali `extraFields` (stringa comma-separated a livello
         *     colonna) + i valori dell'array se presente.
         *   - `false` (opt-out esplicito): fetch full entity, senza
         *     restriction. Necessario quando `mc_ui_lookup_combo_text_edit_computed_dataTextField`
         *     referenzia colonne arbitrarie che non possiamo inferire.
         *   - `string[]` (es. `["status","color"]`): slim attivo + queste
         *     extra colonne aggiunte all'elenco ridotto (utile per grid
         *     templates che mostrano colonne supplementari nel dropdown).
         *
         * Nota: vive al TOP-LEVEL di `extras`, NON sotto `extras.lookup`,
         * matchando l'accesso runtime `(field.extras as any)?.slimCombo`.
         */
        slimCombo?: boolean | string[];
        /** Extension escape hatch per chiavi `mc_props_bag` future non tipizzate. */
        [k: string]: any;
    };
    hideSelectAllCheck: boolean;
    jsonEditor: string;
    afterUpload: string;
    logic_disabled: boolean;

    _Metadati_Tabelle: MetadatiTabella;
    isOut: any;
    $$currentOperator?: { name: string; caption: string; };
    mc_ui_filter_size_width: string;

    validationsRules: ValidationRule[];
    /**
     * Stringa comma-separated di nomi colonna da includere NELLE QUERY
     * COMBO/LOOKUP oltre ai campi standard (PK + valueField + textField).
     * Es. `"status,color"` → il dropdown lookup richiede al server anche
     * queste colonne, rendendole disponibili nei template di cella
     * (`mc_ui_grid_column_data_template`) o alle `optionLabel` personalizzate.
     *
     * Uso tipico lato lookup-editor (`<wuic-lookup-editor [comboExtraFields]="..."`)
     * e lato slim-combo builder (`DataProviderMetaService.buildSlimComboRestriction`
     * line ~158, che splitta la stringa sui `,` e aggiunge i nomi al set
     * `columnRestrictionList`).
     *
     * `null` / `undefined` / stringa vuota = nessun extra field.
     */
    extraFields: string | null | undefined;

    mc_button_action__fn: (datasource: any, record: { [key: string]: BehaviorSubject<any> }, event: any, field: MetadatiColonna, wtoolbox: typeof WtoolboxService) => void;

    mc_selection_changed_custom_function__fn: (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, metaInfo: MetaInfo, newValue: any, oldValue: any, wtoolbox: typeof WtoolboxService, nestedIndex?: number, nodes?: any[]) => void;

    //lascia non async
    mc_selection_changing_custom_function__fn: (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, metaInfo: MetaInfo, newValue: any, oldValue: any, event: any, wtoolbox: typeof WtoolboxService) => void;

    mc_default_value_callback__fn: (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, metaInfo: MetaInfo, wtoolbox: typeof WtoolboxService) => any;

    mc_suggest_value_callback__fn: (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, metaInfo: MetaInfo, wtoolbox: typeof WtoolboxService) => string;

    mc_validation_custom_callback__fn: (record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna, vr: ValidationRule, wtoolbox: typeof WtoolboxService) => boolean;

    editor: BehaviorSubject<IFieldEditor>;

    codeEditing: boolean = false;

    propConstructor: any;
    propPath: string;

    constructor(name: string) {
        /// <summary>
        /// 
        /// </summary>
        /// <param name="name">Nome della colonna</param>
        /// <field name='mc_selection_changed_custom_function' type='Function'>Parameters (dataSource, record, field)</field>

        this.mc_id = 0;

        this.mc_real_column_name = name;
        this.mc_nome_colonna = this.ang_name = name;
        this.ang_name = name;
        this.mc_db_column_type = "varchar";
        this.mc_is_primary_key = false;
        this.mc_ui_size_width = '';
        this.mc_ui_size_height = '';

        this.mc_display_string_in_edit = name;
        this.mc_display_string_in_view = name;
        this.mc_ui_column_type = "text";

        this.mc_ordine = 0;
        this.mc_hide_in_list = false;
        this.mc_hide_in_edit = false;
        this.mc_hide_in_detail = false;
        this.hide_in_import = false;
        this.mc_hide_in_service = false;

        this.mc_show_in_filters = false;
        this.mc_is_range_filter = false;
        this.mc_default_value = '';
        this.mc_is_multicheck_filter = false;
        this.mc_ui_grid_size_width = '';
        this.mc_is_db_computed = false;
        this.mc_logic_editable = true;
        this.mc_logic_nullable = true;

        this.mc_default_value_callback = '';
        this.mc_selection_changing_custom_function = '';
        this.mc_selection_changed_custom_function = '';
        this.mc_suggest_value_callback = '';

        this.mc_ui_grid_conditional_template_class = "";
        this.mc_ui_grid_conditional_alt_template_class = "";
        this.mc_ui_grid_conditional_template_condition = "";

        this.mc_ui_grid_column_data_template = "";

        this.mc_dictionary_value = "";
        this.mc_aggregation = "";

        this.mc_is_computed = false;
        this.mc_computed_formula = '';
        this.mc_computed_client_formula = '';

        this.convert_null_to_string = '';
        this.mc_max_length = '';

        this.mc_grant_by_default = true;

        this.mc_edit_associated_tab = "";
        this.mc_auto_uppercase = false;
        this.mc_is_logic_delete_key = false;
        this.mc_tooltip = "";

        this.mc_validation_has = false;
        this.mc_validation_required = false;
        this.mc_validation_message = "";
        this.mc_validation_type = "";
        this.mc_validation_pattern = "";
        this.mc_validation_max_length = '';
        this.mc_validation_min_length = '';
        this.mc_validation_pattern_message = "";
        this.mc_validation_max_length_message = "";
        this.mc_validation_min_length_message = "";
        this.mc_validation_type_message = "";
        this.mc_validation_custom_callback = '';
        this.mc_logic_converter_has = false;
        this.mc_logic_converter_read_callback = '';
        this.mc_logic_converter_write_callback = '';

        this.mc_default_sort = '';
        this.mc_default_multisort_order = 0;

        this.mc_hide_in_export = false;
        this.mc_disable_sorting = false;

        this.mc_ui_is_password = false;
        this.mc_password_encription_method = '';

        this.mc_custom_join = "";

        this.mc_ui_lookup_filter = "";
        this.mc_ui_lookup_dataValueField = "";
        this.mc_ui_lookup_dataTextField = "";
        this.mc_ui_lookup_entity_name = "";
        this.mc_serverside_operations = true;
        this.mc_ui_pagesize = 10;
        this.mc_ui_lookup_computed_dataTextField = "";
        this.mc_ui_lookup_combo_text_edit_computed_dataTextField = "";
        this.mc_logic_allow_navigation = false;
        this.mc_logic_navigate_new_window = false;
        this.mc_ui_lookup_edit_allow = false;
        this.mc_ui_lookup_insert_allow = false;
        this.mc_ui_lookup_search_grid = false;
        this.mc_custom_select_clause = "";

        this.mc_ui_slider_min = null;
        this.mc_ui_slider_max = null;
        this.mc_ui_slider_format = "N";
        this.mc_ui_slider_decimals = 0;

        this.mc_ui_grid_is_multiple_check = false;
        this.mc_ui_grid_related_id_field = "";
        this.mc_ui_grid_display_field = "";
        this.mc_ui_grid_manytomany_route = "";
        this.mc_ui_grid_manytomany_local_id_field = "";
        this.mc_ui_grid_manytomany_related_id_field = "";
        this.mc_ui_grid_local_id_field = "";

        this.isImageUpload = false;
        this.isDBUpload = false;
        this.upload_secure = false;
        this.isMultipleUpload = false;
        this.IsZippedUpload = false;
        this.UseRouteNameAsSubfolder = false;
        this.UseRecordIDAsSubfolder = false;
        this.key_field_name = "";
        this.DefaultUploadRootPath = "";
        this.MultipleUploadTableRoute = "";
        this.MultipleUploadBlobFieldName = "";
        this.MultipleUploadBlobThumbFieldName = "";
        this.MultipleUploadFilePathFieldName = "";
        this.MultipleUploadFileTitleFieldName = "";
        this.MultipleUploadFileNameFieldName = "";
        this.MultipleUploadFileSizeFieldName = "";
        this.MultipleUploadFileTypeFieldName = "";
        this.MultipleUploadFileIconPathFieldName = "";
        this.MultipleUploadFKey = "";
        this.AllowWebCamShot = false;
        this.AllowWebCamVideo = false;
        this.createThumb = false;
        this.thumbWidth = 50;
        this.thumbHeight = 50;
        this.customUploadHandlerPath = "";
        this.uploadsecure = false;

        this.mc_button_caption = "";
        this.mc_button_action = '';
        this.mc_button_confirm_message = "";
        this.mc_button_executed_message = "";
        this.mc_button_tooltip = "";
        this.mc_button_template = "";
        this.mc_button_image = "";
        this.mc_button_visibility_condition = "";
        this.mc_button_action_type = 0;

        this.mc_logic_cascade_isMember = false;
        this.mc_logic_cascade_childToReset = "";
        this.mc_logic_cascade_filteringParent = "";

        this.mc_filter_disable_operator = false;
        // Default: mostra il dropdown operatori (equals, contains, starts with,
        // ecc.) sotto il filter input. Settare a `true` solo per colonne dove
        // si vuole forzare un singolo operatore (UX semplificata).
        this.mc_filter_hide_operator = false;
        this.mc_editable_insert_only = false;

        this._Metadati_UI_Stili_Colonnes = [];
        this._Metadati_Utenti_Autorizzazioni_Colonnes = [];

        this.mc_custom_edit_cell_template = '';
        this.mc_filter_hierarchy = false;

        this.cssPaths = '';
        this.snippetsTemplate = '';
        this.container_class = '';
        this.useHtmlAspxEditor = false;

        this.allowed_file_types = "";
        this.max_file_size = 0;

        this.mc_value_change_trigger_event = "keyup";
        this.mc_syntax_builder = '';

        this.use_slider_in_edit = false;
        this.use_gauge_in_view = false;
        this.use_chart_in_view = false;
        this.hide_value_in_view = false;
        this.mc_chart_label_template = '';
        this.mc_chart_ranges = '';
        this.mc_chart_select = '';

        this.mc_props_bag = '';

        this.extras = {} as any;

        //not mapped to DB
        //Every element added here need to be instantiate in _injectMetadata(...) (__my_private_api.js)
        //if you want to use it in designer (and persist for savedashboard) need to modify self.saveDash() function in __my_dom_editor.js and add it to convertKOArrayToJSArray(... copyProps[] parameter )
        this.hideSelectAllCheck = false;
        this.jsonEditor = "";
        this.afterUpload = "";
        this.logic_disabled = false;

        this.mc_ui_filter_size_width = '';

        this._Metadati_Tabelle = new MetadatiTabella('');
        this.validationsRules = [];

        this.extraFields = null;

        this.editor = new BehaviorSubject<any>(null);
    }

    static clone(col: MetadatiColonna) {
        return Object.assign(new MetadatiColonna(col.mc_nome_colonna), col);
    }

    static formatGridViewValue(metaColumn: MetadatiColonna, recordObj: any) {
        let field = metaColumn.mc_nome_colonna;
        const userLocale = (() => {
            try {
                const rawUser = typeof localStorage !== 'undefined' ? localStorage.getItem('k-user') : null;
                if (rawUser) {
                    const parsedUser = JSON.parse(rawUser);
                    const locale = parsedUser?.lingua?.id || parsedUser?.language;
                    if (locale) {
                        return locale;
                    }
                }
            } catch {
                // Ignore malformed local user payload and fallback below.
            }

            return WtoolboxService.appSettings?.locale || navigator.language || 'it-IT';
        })();

        let record = recordObj;
        if (recordObj[field] instanceof BehaviorSubject) {
            record = {};
            Object.keys(recordObj).forEach(key => {
                record[key] = recordObj[key].value;
            });
        }

        const customCellTemplate = String(metaColumn?.mc_ui_grid_column_data_template || '').trim();
        if (customCellTemplate) {
            const customValue = MetadatiColonna.evaluateGridColumnDataTemplate(customCellTemplate, metaColumn, record);
            if (customValue !== undefined) {
                return customValue;
            }
        }

        if (metaColumn.mc_ui_column_type == 'lookupByID') {
            // Defensive: column flagged as lookup but with no target route
            // (mc_ui_lookup_entity_name unset/empty) would null-deref on
            // `.toString()`. Render the raw value as a graceful fallback —
            // the typed-exception pipeline already surfaces
            // errors.client.metadata.lookup_orphan from
            // DataSourceComponent.getObservable upstream, no need to throw
            // again here (would spam the dialog with N copies, one per
            // rendered row).
            const lookupRoute = metaColumn.mc_ui_lookup_entity_name;
            if (lookupRoute === null || lookupRoute === undefined || String(lookupRoute).trim() === '') {
                return record[field];
            }
            const lookupDescCol = String(lookupRoute).replaceAll(' ', '_') + '___' + metaColumn.mc_ui_lookup_dataTextField + '__' + field;
            return record[lookupDescCol];
        } else if (metaColumn.mc_ui_column_type == 'dictionary' || metaColumn.mc_ui_column_type == 'dictionary_radio') {
            const dictionaryRaw = metaColumn.mc_dictionary_value || '';
            const value = record[field];
            if (value === null || value === undefined || dictionaryRaw === '') {
                return value;
            }

            const dictionaryMap = dictionaryRaw
                .split('||')
                .map(x => x.split('@@'))
                .filter(x => x.length >= 2)
                .reduce((acc, pair) => {
                    acc[String(pair[0])] = pair.slice(1).join('@@');
                    return acc;
                }, {} as { [key: string]: string });

            const displayValue = dictionaryMap[String(value)];
            if (displayValue === undefined) {
                return value;
            }

            return WtoolboxService.translationService?.instant(displayValue) || displayValue;
        } else if (metaColumn.mc_ui_column_type == 'multiple_check') {
            return record[field] ? (<any[]>record[field]).map(x => x[metaColumn.mc_ui_grid_display_field]).join(', ') : '';
        } else if (metaColumn.mc_ui_column_type == 'date') {
            return record[field] ? new Date(record[field]).toLocaleDateString(userLocale) : '';
        } else if (metaColumn.mc_ui_column_type == 'datetime') {
            return record[field] ? (new Date(record[field]).toLocaleDateString(userLocale) + ' ' + new Date(record[field]).toLocaleTimeString(userLocale)) : '';
        } else if (metaColumn.mc_ui_column_type == 'point') {
            if (record[field]) {
                let point = JSON.parse(record[field]);
                return `Lat: ${point.lat} - Long: ${point.lng}`;
            }
        }

        // mc_ui_slider_format ('C' currency / 'N' number / 'P' percent) ha
        // senso solo per colonne numeriche. Su colonne text/textarea/html_area
        // applicarlo significherebbe passare una stringa non numerica a
        // formatNumber/formatCurrency/formatPercent → output "∞"/"NaN" che il
        // developer interpreta come bug di rendering. Restringiamo l'applicazione
        // ai soli column types numerici.
        const numericColumnTypes = new Set(['number', 'number_boolean']);
        const colType = String(metaColumn.mc_ui_column_type || '').toLowerCase();
        if (metaColumn.mc_ui_slider_format && numericColumnTypes.has(colType)) {
            const locale = WtoolboxService.appSettings?.locale || 'en-US';
            const currencySymbol = WtoolboxService.appSettings?.currencySymbol || 'EUR';
            const currencyCode = WtoolboxService.appSettings?.currencyCode || 'EUR';
            if (metaColumn.mc_ui_slider_format == 'C') {
                return record[field] ? formatCurrency(record[field], locale, currencySymbol, currencyCode, `0.${metaColumn.mc_ui_slider_decimals || 0}-${metaColumn.mc_ui_slider_decimals}`) : '';
            } else if (metaColumn.mc_ui_slider_format == 'N') {
                return record[field] ? formatNumber(record[field], locale, `0.${metaColumn.mc_ui_slider_decimals || 0}-${metaColumn.mc_ui_slider_decimals}`) : '';
            } else if (metaColumn.mc_ui_slider_format == 'P') {
                return record[field] ? formatPercent(record[field], locale, `0.${metaColumn.mc_ui_slider_decimals || 0}-${metaColumn.mc_ui_slider_decimals}`) : '';
            }
        }

        return record[field];
    }

    private static evaluateGridColumnDataTemplate(templateCode: string, metaColumn: MetadatiColonna, record: any): any {
        const field = String(metaColumn?.mc_nome_colonna || '').trim();
        if (!field) {
            return undefined;
        }

        const normalized = String(templateCode || '').trim();
        if (!normalized) {
            return undefined;
        }

        const row = record || {};

        try {
            const kendoExpression = normalized.match(/^#=\s*([\s\S]*?)\s*#$/);
            const expression = kendoExpression ? kendoExpression[1] : normalized;

            const expressionFn = new Function(
                'data',
                'record',
                'field',
                'value',
                'metaColumn',
                'wtoolbox',
                `const row = data || {}; return (function(){ with(row){ return (${expression}); } }).call(row);`
            ) as (data: any, record: any, field: string, value: any, metaColumn: MetadatiColonna, wtoolbox: typeof WtoolboxService) => any;

            return expressionFn(row, row, field, row[field], metaColumn, WtoolboxService);
        } catch {
            // Continue with default grid formatting when custom template is not a plain expression.
            return undefined;
        }
    }

    static async validateField(value: any, vr: ValidationRule, record: { [key: string]: BehaviorSubject<any> }, field: MetadatiColonna) {
        if (vr.type == "required") {
            vr.isValid = (value !== undefined && value !== null && value !== "");
        }
        else if (vr.type == "pattern") {
            let regx = new RegExp(vr.column.mc_validation_pattern);
            vr.isValid = regx.test(value);
        }
        else if (vr.type == "type") {
            let type = vr.column.mc_validation_type;

            let pattern;

            switch (type) {

                case "email":
                    pattern = /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))$/i;
                    break;

                case "url":
                    pattern = /^(https?|ftp):\/\/(((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:)*@)?(((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?)(:\d*)?)(\/((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)?)?(\?((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|[\uE000-\uF8FF]|\/|\?)*)?(\#((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|\/|\?)*)?$/i;
                    break;

                case "creditcard":
                    pattern = function (value) {
                        // accept only spaces, digits and dashes
                        if (/[^0-9 \-]+/.test(value)) {
                            return false;
                        }
                        let nCheck = 0,
                            nDigit = 0,
                            bEven = false;

                        value = value.replace(/\D/g, "");

                        for (let n = value.length - 1; n >= 0; n--) {
                            let cDigit = value.charAt(n);
                            nDigit = parseInt(cDigit, 10);
                            if (bEven) {
                                if ((nDigit *= 2) > 9) {
                                    nDigit -= 9;
                                }
                            }
                            nCheck += nDigit;
                            bEven = !bEven;
                        }

                        return (nCheck % 10) === 0;
                    }

                    break;
            }

            // Guard: if mc_validation_type doesn't match any switch case
            // (email/url/creditcard) `pattern` stays undefined and the
            // legacy code crashed with TypeError 'Cannot read properties
            // of undefined (reading test)'. Emit a typed metadata
            // diagnostic and fail the rule visibly instead.
            if (!pattern) {
                GlobalHandler.emitClientException(new WuicClientException(
                    WuicErrorCodes.MetadataPropsBagMalformed,
                    {
                        parserMessage: `Unknown mc_validation_type='${type}' (expected: email | url | creditcard).`,
                        column: field?.mc_nome_colonna,
                    },
                    { surface: 'service', targetName: 'MetadatiColonna.validateField.unknownType' }
                ));
                vr.isValid = false;
            } else {
                vr.isValid = (pattern as any).test(value);
            }
        }
        else if (vr.type == "max_length") {
            vr.isValid = value && value.length <= vr.column.mc_validation_max_length;
        }
        else if (vr.type == "min_length") {
            vr.isValid = value && value.length >= vr.column.mc_validation_min_length;
        }
        else if (vr.type == "custom") {
            // Wrap the user-supplied custom validation callback so any
            // throw becomes a typed errors.client.user_callback.failed
            // dialog (instead of the raw errors.client.unknown fallback).
            // On error, runUserCallback returns undefined → coerce to
            // false so the validation rule visibly fails (the dialog
            // already explains the cause to the user).
            const cbResult = await WtoolboxService.runUserCallback<boolean>(
                'mc_validation_custom_callback',
                field.mc_validation_custom_callback__fn,
                [record, field, vr, WtoolboxService],
                {
                    column: field?.mc_nome_colonna,
                    phase:  'validate-field',
                    ruleType: vr?.type,
                },
                { targetName: 'MetadatiColonna.validateField.mc_validation_custom_callback' }
            );
            vr.isValid = cbResult === true;
        }
    }
}
