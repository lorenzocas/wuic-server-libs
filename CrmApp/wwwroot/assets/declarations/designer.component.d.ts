import { ChangeDetectorRef, OnInit } from '@angular/core';
import { DesignerTool, DesignerToolProp } from '../../class/designerTool';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { DataProviderService } from '../../service/data-provider.service';
import { UserInfoService } from '../../service/user-info.service';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { BehaviorSubject } from 'rxjs';
import { MetaInfo } from '../../class/metaInfo';
import { ActivatedRoute } from '@angular/router';
import { ContextMenu } from 'primeng/contextmenu';
import { MenuItem } from 'primeng/api';
import { TranslationManagerService } from '../../service/translation-manager.service';
import * as i0 from "@angular/core";
export declare class DesignerComponent implements OnInit {
    private route;
    private dataSrv;
    private metaSrv;
    private userInfo;
    private cd;
    private trslSrv;
    draggedPayload: DesignerTool;
    selected: any[];
    availableTools: DesignerTool[];
    droppableDisabled: boolean;
    tool: DesignerTool;
    dashboardElements: any[];
    flattenedDashboardElements: any[];
    ctxItems: BehaviorSubject<MenuItem[]>;
    defaultCtxItems: MenuItem[];
    ctxElement: any;
    footerCtxItems: MenuItem[];
    footerCtxElement: DesignerTool | null;
    toolProps: any;
    htmlStyleString: string;
    htmlInputProperties: {
        [key: string]: DesignerToolProp;
    };
    tableInputProperties: {
        [key: string]: DesignerToolProp;
    };
    htmlInputs: any;
    tableInputs: any;
    maxId: number;
    dashboardComponents: any[];
    innerHtmlProperties: {
        [key: string]: DesignerToolProp;
    };
    dsProperties: {
        [key: string]: DesignerToolProp;
    };
    repeaterProperties: {
        [key: string]: DesignerToolProp;
    };
    bindableHtmlProps: {
        [key: string]: DesignerToolProp;
    };
    bindableHtmlInputs: {
        [key: string]: any;
    };
    headerProps: {
        [key: string]: DesignerToolProp;
    };
    headerInputs: {
        [key: string]: any;
    };
    anchorProps: {
        [key: string]: DesignerToolProp;
    };
    anchorInputs: {
        [key: string]: any;
    };
    imgProps: {
        [key: string]: DesignerToolProp;
    };
    imgInputs: {
        [key: string]: any;
    };
    htmlItemTemplateProps: {
        [key: string]: DesignerToolProp;
    };
    htmlButtonProps: {
        [key: string]: DesignerToolProp;
    };
    tabViewProps: {
        [key: string]: DesignerToolProp;
    };
    tabViewInputs: {
        [key: string]: any;
    };
    splitterProps: {
        [key: string]: DesignerToolProp;
    };
    splitterInputs: {
        [key: string]: any;
    };
    splitterAreaProps: {
        [key: string]: DesignerToolProp;
    };
    splitterAreaInputs: {
        [key: string]: any;
    };
    accordionProps: {
        [key: string]: DesignerToolProp;
    };
    accordionInputs: {
        [key: string]: any;
    };
    accordionAreaProps: {
        [key: string]: DesignerToolProp;
    };
    accordionAreaInputs: {
        [key: string]: any;
    };
    availableProjectCssFiles: string[];
    availableProjectCssClassByFile: {
        [file: string]: string[];
    };
    dashboardCssSheets: any[];
    showCssSheetEditor: boolean;
    selectedCssEditorSheetPath: string;
    dashMenus: MenuItem[];
    noEdit: boolean;
    currentDashboardRoute: string;
    currentDashboardDescription: string;
    showArchetypeConfigurator: boolean;
    archetypeConfigTool: DesignerTool | null;
    private readonly popupManagedArchetypes;
    private readonly propertySectionStateByTool;
    private readonly maxHistoryLength;
    private undoHistory;
    private redoHistory;
    private applyingHistory;
    private lastCommittedSnapshot;
    private pendingColorHistoryBase;
    private pendingColorHistoryDirty;
    constructor(route: ActivatedRoute, dataSrv: DataProviderService, metaSrv: MetadataProviderService, userInfo: UserInfoService, cd: ChangeDetectorRef, trslSrv: TranslationManagerService);
    ngOnInit(): Promise<void>;
    private refreshAvailableProjectCssClasses;
    openCssSheetEditor(): void;
    onCssSheetEditorVisibleChange(visible: boolean): void;
    getCssEditorStyleProps(): {
        key: string;
        type: string;
        values?: string[];
    }[];
    onCssSheetEditorApply(event: {
        sheets: any[];
        selectedSheetPath: string;
    }): Promise<void>;
    private ensureDashboardSavedBeforeCssLink;
    private buildSerializedDashboardElements;
    private persistCurrentDashboardWithoutPrompt;
    private normalizeSheetPath;
    private normalizeCssSheet;
    private ensureDashboardCssLinks;
    private collectDashboardSheetPaths;
    private extractDashboardSheetPaths;
    private loadDashboardCssSheets;
    getCssClassOptionsForTool(tool: DesignerTool | null | undefined): string[];
    onCssFileChanged(nextFile: string, tool: DesignerTool): void;
    onCssClassChanged(nextClasses: string[] | string, tool: DesignerTool): void;
    private normalizeCssClassSelection;
    clearDashboard(): void;
    undo(): void;
    redo(): void;
    onWindowKeydown(event: KeyboardEvent): void;
    onWindowMouseup(): void;
    onWindowTouchend(): void;
    onWindowKeyup(): void;
    onWindowChange(): void;
    get currentDashboardTitle(): string;
    get droppedDashboardItems(): DesignerTool[];
    get canUndo(): boolean;
    get canRedo(): boolean;
    getDroppedDashboardItemLabel(item: DesignerTool): string;
    selectDashboardItem(item: DesignerTool): void;
    showFooterContextMenu(event: MouseEvent, item: DesignerTool, menu: ContextMenu): void;
    private renameFooterContextItem;
    reloadDashboards(sourceDashboards?: any[]): Promise<void>;
    metaEditorSave(data: any, original: any): void;
    showCtx($event: any, o: any): void;
    getElementByName(id: string): any;
    getelementNameByPosition(x: any, y: any): string;
    removeElementByName(name: string): void;
    private propertyTreeBuilder;
    eachRecursive(inputs: any, obj: any, tree: any[], record: any, props: MetadatiColonna[], parentElement?: any, preserve?: boolean, propertyStack?: any[], skipProps?: string[]): void;
    setValue($event: any, tool: any, toolProp: any): void;
    canOpenArchetypeConfigurator(tool: DesignerTool | null | undefined): boolean;
    shouldShowPropertyTree(tool: DesignerTool | null | undefined): boolean;
    openArchetypeConfigurator(tool: DesignerTool): void;
    closeArchetypeConfigurator(): void;
    onArchetypeConfigVisibleChange(visible: boolean): void;
    getActiveArchetypeConfig(): string;
    getArchetypeConfigValueForTool(tool: DesignerTool | null): any;
    onArchetypeConfigApply(nextConfig: any): void;
    getArchetypeConfigMetaInfoForTool(tool: DesignerTool | null): MetaInfo | null;
    private normalizeArchetypeAction;
    private getRepeaterAction;
    private isPopupManagedArchetype;
    private getDesignerDatasourceMetaInfo;
    getDatasourceColumnOptions(tool: DesignerTool | null | undefined): string[];
    private ensureSelectFieldDefaults;
    private openSelectDisplayFormulaEditor;
    private openUlDisplayFormulaEditor;
    private openLabelDisplayFormulaEditor;
    hasParentDatasourceBinding(tool: DesignerTool | null | undefined): boolean;
    openMasterDetailFilterFormulaEditor(inputs: any, tool?: DesignerTool): Promise<void>;
    private getDatasourceColumnsFromDatasourceComponent;
    private getMasterDetailFilterFormulaCodeContext;
    private getSelectDisplayFormulaCodeContext;
    private getSelectDisplayFormulaColumns;
    private unwrapBehaviorSubjects;
    private toBehaviorSubjectsObject;
    private ensureMergedExtraProps;
    converter(obj: any, prop: string, newValue: any, tool: DesignerTool): void;
    converterSplitter(obj: any, prop: string, newValue: any, tool: DesignerTool): void;
    converterAccordion(obj: any, prop: string, newValue: any, tool: DesignerTool): void;
    dropTable(currentTool: DesignerTool): void;
    dropSplitter(currentTool: DesignerTool): void;
    dropAccordion(currentTool: DesignerTool): void;
    search(event: AutoCompleteCompleteEvent, tool: DesignerTool, toolProp: any): Promise<void>;
    dragStart(payload: any): void;
    onDrag($event: DragEvent): void;
    drop(event: any): void;
    private getNewID;
    filterTool(tool: any): boolean;
    getToolPropertySections(tool: DesignerTool | null | undefined): {
        key: string;
        label: string;
        open: boolean;
        props: any[];
    }[];
    onPropertySectionToggle(tool: DesignerTool | null | undefined, sectionKey: string, $event: Event): void;
    private getPropertySectionToolKey;
    private shouldHideToolProp;
    getDroppedComponentListModel(tool: DesignerTool | null | undefined, toolProp: any): any;
    private getPropertySectionKey;
    get availableToolGroups(): {
        group: string;
        tools: DesignerTool[];
    }[];
    flattenComponentTree(components: DesignerTool[]): DesignerTool[];
    dragEnd(): void;
    saveDashboard(): Promise<void>;
    loadDashboard(dashboard: any): Promise<void>;
    private captureHistorySnapshot;
    private commitHistoryIfChanged;
    private resetHistory;
    private applyHistorySnapshot;
    private finalizePendingColorHistory;
    private applySerializedDashboardElements;
    private isTypingTarget;
    private handleRepeaterMasterRowSelection;
    private unwrapBehaviorSubjectValue;
    private ensureDataRepeaterRowCustomSelect;
    private ensureDatasourceMasterDetailFormulaEditor;
    private ensureSplitterResize;
    private ensureAccordionToggle;
    private getDatasourceRouteName;
    private getDatasourcePrimaryKey;
    private applyMasterDetailFilterFormula;
    private injectMasterDetailLookupFilter;
    openCurrentDashboardInNewTab(): void;
    hidrateCustomPropsRecursive(customProps: any): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<DesignerComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<DesignerComponent, "wuic-designer", never, {}, {}, never, never, true, never>;
}
//# sourceMappingURL=designer.component.d.ts.map