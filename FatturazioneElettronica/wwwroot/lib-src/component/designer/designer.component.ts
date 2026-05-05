import { ChangeDetectorRef, Component, DoCheck, HostListener, input, OnDestroy, OnInit } from '@angular/core';
import { SplitterModule } from 'primeng/splitter';
import { DragDropModule } from 'primeng/dragdrop';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { AsyncPipe, NgClass } from '@angular/common';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { DesignerTool, DesignerToolProp } from '../../class/designerTool';
import { ColorPickerModule } from 'primeng/colorpicker';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { AutoCompleteModule } from 'primeng/autocomplete';
import type { AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { DataProviderService } from '../../service/data-provider.service';
import { UserInfoService } from '../../service/user-info.service';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { BehaviorSubject, combineLatest, filter, take } from 'rxjs';
import { FieldEditorComponent } from "../field/field-editor/field-editor.component";
import { IDesignerProperties } from '../../class/IDesignerProperties';
import { DataSourceComponent } from '../data-source/data-source.component';
import { MetaInfo } from '../../class/metaInfo';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { TranslateModule } from '@ngx-translate/core';
import { UrlSegmentGroup, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot, RouterState, ActivatedRoute } from '@angular/router';
import { SafeSubscriber } from 'rxjs/internal/Subscriber';
import { ContextMenuModule } from 'primeng/contextmenu';
import { TreeDragDropService } from 'primeng/api';
import type { ContextMenu } from 'primeng/contextmenu';
import type { MenuItem } from 'primeng/api';
import { MetadataEditorComponent } from '../metadata-editor/metadata-editor.component';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { MetadataEditorService } from '../../service/metadata-editor.service';
import { MenubarModule } from 'primeng/menubar';
import { ArchetypeConfiguratorComponent } from '../archetype-configurator/archetype-configurator.component';
import { ButtonModule } from 'primeng/button';
import { MultiSelectModule } from 'primeng/multiselect';
import { CssSheetEditorComponent } from '../css-sheet-editor/css-sheet-editor.component';
import { MenuModule } from 'primeng/menu';
import { DialogModule } from 'primeng/dialog';
import { TreeModule } from 'primeng/tree';
import { WorkflowRuntimeMetadataService } from '../../service/workflow-runtime-metadata.service';
import { DynamicDashboardTemplateComponent } from '../dynamic-dashboard-template/dynamic-dashboard-template.component';
import { ParametricDialogComponent } from '../parametric-dialog/parametric-dialog.component';

type DesignerHistorySnapshot = {
  serializedElements: string;
  selectedUniqueName: string | null;
};

@Component({
  selector: 'wuic-designer',
  imports: [NgClass, TranslateModule, AsyncPipe, FormsModule, SplitterModule, DragDropModule, SelectModule, ColorPickerModule, AutoCompleteModule, DashboardComponent, FieldEditorComponent, ContextMenuModule, MetadataEditorComponent, MenubarModule, ArchetypeConfiguratorComponent, ButtonModule, MultiSelectModule, CssSheetEditorComponent, MenuModule, DialogModule, TreeModule],
  providers: [TreeDragDropService],
  templateUrl: './designer.component.html',
  styleUrl: './designer.component.css'
})
/**
 * Editor visuale dei dashboard Wuic.
 *
 * Scopo del componente:
 * - costruire e modificare il tree di componenti UI (drag&drop, nesting, property editor),
 * - configurare binding dati/metadata (`DATASOURCE`, `DATAREPEATER`, formule, archetipi),
 * - mantenere coerenza runtime tra stato canvas, metadati server e preview locale.
 *
 * Responsabilita principali:
 * - serializzazione/deserializzazione del layout dashboard (`dashboardElements`) con reidratazione
 *   di hook runtime (BehaviorSubject, callback, custom props),
 * - gestione persistenza dashboard e fogli CSS collegati tramite `DataProviderService`/`MetaService`,
 * - orchestrazione UX avanzata (undo/redo, context menu, toolbar, popup configuratori).
 *
 * Output funzionale:
 * il componente produce un payload dashboard persistibile (layout + metadata di supporto)
 * che viene salvato lato server e ricaricato per la modalita runtime/design.
 */
export class DesignerComponent implements OnInit, OnDestroy, DoCheck {
  draggedPayload: DesignerTool;
  selected: any[];
  availableTools: DesignerTool[];
  droppableDisabled: boolean = false;

  // content: string;
  tool: DesignerTool;
  dashboardElements: any[] = [];
  flattenedDashboardElements: any[] = [];

  ctxItems: BehaviorSubject<MenuItem[]> = new BehaviorSubject<MenuItem[]>([]);
  defaultCtxItems: MenuItem[];
  ctxElement: any;
  footerCtxItems: MenuItem[] = [];
  footerCtxElement: DesignerTool | null = null;
  hierarchyCtxItems: MenuItem[] = [];
  hierarchyCtxElement: DesignerTool | null = null;
  hierarchySelection: any = null;
  private hierarchyTreeNodesState: any[] = [];
  private hierarchyTreeSignature = '';
  private lastToolSelectionUniqueName = '';

  toolProps: any;
  htmlStyleString: string;

  htmlInputProperties: { [key: string]: DesignerToolProp };
  tableInputProperties: { [key: string]: DesignerToolProp };

  htmlInputs: any;
  tableInputs: any;

  maxId: number = 0;
  dashboardComponents: any[] = [];
  innerHtmlProperties: { [key: string]: DesignerToolProp };
  dsProperties: { [key: string]: DesignerToolProp };
  repeaterProperties: { [key: string]: DesignerToolProp };
  bindableHtmlProps: { [key: string]: DesignerToolProp };
  bindableHtmlInputs: { [key: string]: any };
  headerProps: { [key: string]: DesignerToolProp };
  headerInputs: { [key: string]: any };
  anchorProps: { [key: string]: DesignerToolProp };
  anchorInputs: { [key: string]: any };
  imgProps: { [key: string]: DesignerToolProp };
  imgInputs: { [key: string]: any };
  htmlItemTemplateProps: { [key: string]: DesignerToolProp };
  htmlButtonProps: { [key: string]: DesignerToolProp };

  tabViewProps: { [key: string]: DesignerToolProp };
  tabViewInputs: { [key: string]: any };

  splitterProps: { [key: string]: DesignerToolProp };
  splitterInputs: { [key: string]: any };
  splitterAreaProps: { [key: string]: DesignerToolProp };
  splitterAreaInputs: { [key: string]: any };

  accordionProps: { [key: string]: DesignerToolProp };
  accordionInputs: { [key: string]: any };
  accordionAreaProps: { [key: string]: DesignerToolProp };
  accordionAreaInputs: { [key: string]: any };
  availableProjectCssFiles: string[] = [''];
  availableProjectCssClassByFile: { [file: string]: string[] } = {};
  dashboardCssSheets: any[] = [];
  showCssSheetEditor = false;
  selectedCssEditorSheetPath = '';

  dashMenus: MenuItem[];
  graphActionsMenuItems: MenuItem[] = [];
  hideDatasourcesInCanvas = false;
  savedDashboardOptions: Array<{ label: string; value: string; info: any }> = [];
  reopenDashboardDialogVisible = false;
  reopenDialogSelectedDashboardRoute: string | null = null;
  noEdit: boolean;
  currentDashboardRoute: string = '';
  currentDashboardDescription: string = '';
  showArchetypeConfigurator = false;
  archetypeConfigTool: DesignerTool | null = null;

  propFilter: string;

  private readonly popupManagedArchetypes = ['map', 'chart', 'carousel'];
  private readonly propertySectionStateByTool: { [toolKey: string]: { [sectionKey: string]: boolean } } = {};
  private readonly maxHistoryLength = 100;
  private undoHistory: DesignerHistorySnapshot[] = [];
  private redoHistory: DesignerHistorySnapshot[] = [];
  private applyingHistory = false;
  private lastCommittedSnapshot: DesignerHistorySnapshot | null = null;
  private pendingColorHistoryBase: DesignerHistorySnapshot | null = null;
  private pendingColorHistoryDirty = false;
  private _historyApplyIsRedo = false;
  private _lastHistoryApplyTime = 0;
  private _suppressRedoClear = false;
  private _redoRebindTimer: any;
  private lastKnownHashRoute = '';
  private suppressNextHashGuard = false;
  private _routeParamSub: any;
  private footerHoverTargetElements: HTMLElement[] = [];
  private footerHoverOverlayElement: HTMLDivElement | null = null;
  private footerHoverTabPanelPreviousSelection: Array<{ panel: any; selected: boolean }> = [];
  private hierarchyHoverFooterElement: HTMLElement | null = null;

  private t(key: string, fallback: string): string {
    const translated = String(this.trslSrv?.instant?.(key) || '').trim();
    if (!translated || translated.toLowerCase() === key.toLowerCase()) {
      return fallback;
    }
    return translated;
  }

  /**
   * Inizializza stato base del designer:
   * context menu default, menu footer, mappa proprieta base dei tool
   * e binding ai converter/callback usati dall'editor proprieta.
   * Non carica dati remoti: il bootstrap runtime avviene in `ngOnInit`.
   */
  constructor(private route: ActivatedRoute, private dataSrv: DataProviderService, private metaSrv: MetadataProviderService, private userInfo: UserInfoService, private cd: ChangeDetectorRef, private trslSrv: TranslationManagerService, private metadataEditorSrv: MetadataEditorService, private workflowRuntimeMetadata: WorkflowRuntimeMetadataService = {} as any) {
    this.defaultCtxItems = [
      {
        label: this.t('designer.remove', 'Remove'),
        icon: 'pi pi-trash',
        command: (menuItem) => {
          if (this.ctxElement) {
            this.removeElementByName(this.ctxElement.uniqueName);
          }
        }
      }
    ];

    this.ctxItems.next(this.defaultCtxItems);
    this.footerCtxItems = [
      {
        label: this.t('designer.rename', 'Rename'),
        icon: 'pi pi-pencil',
        command: () => {
          this.renameFooterContextItem();
        }
      },
      {
        label: this.t('designer.remove', 'Remove'),
        icon: 'pi pi-trash',
        command: () => {
          const uniqueName = String(this.footerCtxElement?.uniqueName || '').trim();
          if (uniqueName) {
            this.removeElementByName(uniqueName);
          }
        }
      }
    ];
    this.hierarchyCtxItems = [
      {
        label: this.t('designer.remove', 'Remove'),
        icon: 'pi pi-trash',
        command: () => {
          const uniqueName = String(this.hierarchyCtxElement?.uniqueName || '').trim();
          if (uniqueName) {
            this.removeElementByName(uniqueName);
          }
        }
      }
    ];

    this.htmlStyleString = '[ngClass]="0.cssClass" [ngStyle]="{width: 0.width, maxWidth: 0.maxWidth, height: 0.height, maxHeight: 0.maxHeight, minWidth: 0.minWidth, minHeight: 0.minHeight, position: 0.position, left: 0.left, top: 0.top, float: 0.float, display: 0.display, boxSizing: 0.boxSizing, backgroundColor: 0.backgroundColor, color: 0.color, borderRadius: 0.borderRadius, borderBottomStyle: 0.borderBottomStyle, borderBottomWidth: 0.borderBottomWidth, borderBottomColor: 0.borderBottomColor, borderLeftStyle: 0.borderLeftStyle, borderLeftWidth: 0.borderLeftWidth, borderLeftColor: 0.borderLeftColor, borderRightStyle: 0.borderRightStyle, borderRightWidth: 0.borderRightWidth, borderRightColor: 0.borderRightColor, borderTopStyle: 0.borderTopStyle, borderTopWidth: 0.borderTopWidth, borderTopColor: 0.borderTopColor, paddingTop: 0.paddingTop, paddingRight: 0.paddingRight, paddingBottom: 0.paddingBottom, paddingLeft: 0.paddingLeft, marginTop: 0.marginTop, marginRight: 0.marginRight, marginBottom: 0.marginBottom, marginLeft: 0.marginLeft, fontSize: 0.fontSize, fontFamily: 0.fontFamily, fontWeight: 0.fontWeight, fontStyle: 0.fontStyle, textDecoration: 0.textDecoration, textAlign: 0.textAlign, verticalAlign: 0.verticalAlign, lineHeight: 0.lineHeight, letterSpacing: 0.letterSpacing, wordSpacing: 0.wordSpacing, textTransform: 0.textTransform, textIndent: 0.textIndent, whiteSpace: 0.whiteSpace, wordWrap: 0.wordWrap, wordBreak: 0.wordBreak, overflow: 0.overflow, overflowX: 0.overflowX, overflowY: 0.overflowY, zIndex: 0.zIndex, cursor: 0.cursor, visibility: 0.visibility, opacity: 0.opacity, filter: 0.filter, transform: 0.transform, transformOrigin: 0.transformOrigin, transition: 0.transition, boxShadow: 0.boxShadow, textShadow: 0.textShadow, backgroundPosition: 0.backgroundPosition, backgroundRepeat: 0.backgroundRepeat, backgroundAttachment: 0.backgroundAttachment, backgroundSize: 0.backgroundSize, backgroundImage: 0.backgroundImage, backgroundClip: 0.backgroundClip, backgroundOrigin: 0.backgroundOrigin, backgroundBlendMode: 0.backgroundBlendMode, clip: 0.clip, clipPath: 0.clipPath, clipRule: 0.clipRule, mask: 0.mask, maskType: 0.maskType, maskImage: 0.maskImage, maskMode: 0.maskMode, maskSize: 0.maskSize, maskRepeat: 0.maskRepeat, maskPosition: 0.maskPosition, maskClip: 0.maskClip, maskOrigin: 0.maskOrigin, maskComposite: 0.maskComposite, maskBorder: 0.maskBorder, maskBorderSource: 0.maskBorderSource, maskBorderSlice: 0.maskBorderSlice, maskBorderWidth: 0.maskBorderWidth, maskBorderOutset: 0.maskBorderOutset, maskBorderRepeat: 0.maskBorderRepeat, maskBorderMode: 0.maskBorderMode, maskBorderClip: 0.maskBorderClip, maskBorderOrigin: 0.maskBorderOrigin, maskBorder, tableLayout: 0.tableLayout, borderCollapse: 0.borderCollapse, borderSpacing: 0.borderSpacing, captionSide: 0.captionSide, emptyCells: 0.emptyCells, tableCaption: 0.tableCaption, tableBorder: 0.tableBorder, tableBorderSpacing: 0.tableBorderSpacing, tableBorderCollapse: 0.tableBorderCollapse, listStyle: 0.listStyle}"';
    this.htmlInputProperties = {
      animation: { type: 'string' },
      animationName: { type: 'string' },
      animationDuration: { type: 'string' },
      animationTimingFunction: { type: 'string' },
      animationDelay: { type: 'string' },
      animationIterationCount: { type: 'string' },

      animationDirection: { type: 'dictionary', values: ['', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'inherit'] },
      animationFillMode: { type: 'dictionary', values: ['', 'none', 'forwards', 'backwards', 'both', 'inherit'] },
      animationPlayState: { type: 'dictionary', values: ['', 'running', 'paused', 'inherit'] },

      background: { type: 'string' },
      backgroundAttachment: { type: 'dictionary', values: ['', 'scroll', 'fixed', 'local', 'inherit'] },
      backgroundBlendMode: { type: 'dictionary', values: ['', 'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'saturation', 'color', 'luminosity', 'inherit'] },
      backgroundClip: { type: 'dictionary', values: ['', 'border-box', 'padding-box', 'content-box', 'inherit'] },

      backgroundColor: { type: 'color' },
      backgroundImage: { type: 'string' },
      backgroundOrigin: { type: 'dictionary', values: ['', 'padding-box', 'border-box', 'content-box', 'inherit'] },
      backgroundPosition: { type: 'dictionary', values: ['', 'left top', 'left center', 'left bottom', 'right top', 'right center', 'right bottom', 'center top', 'center center', 'center bottom', 'x% y%', 'xpos ypos', 'inherit'] },

      backgroundRepeat: { type: 'dictionary', values: ['', 'repeat', 'repeat-x', 'repeat-y', 'no-repeat', 'inherit'] },
      backgroundSize: { type: 'dictionary', values: ['', 'auto', 'cover', 'contain', 'inherit'] },

      borderRadius: { type: 'string' },
      borderStyle: {
        type: 'dictionary', values: ['', 'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge',
          'inset', 'outset', 'inherit'], converter: this.converterBorderStyle.bind(this)
      },
      borderWidth: { type: 'string', converter: this.converterBorderWidth.bind(this) },
      borderColor: { type: 'color', converter: this.converterBorderColor.bind(this) },
      borderBottomStyle: { type: 'dictionary', values: ['', 'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset', 'inherit'] },
      borderBottomWidth: { type: 'string' },
      borderBottomColor: { type: 'color' },
      borderLeftStyle: { type: 'dictionary', values: ['', 'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset', 'inherit'] },
      borderLeftWidth: { type: 'string' },
      borderLeftColor: { type: 'color' },
      borderRightStyle: { type: 'dictionary', values: ['', 'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset', 'inherit'] },
      borderRightWidth: { type: 'string' },
      borderRightColor: { type: 'color' },
      borderTopStyle: { type: 'dictionary', values: ['', 'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset', 'inherit'] },
      borderTopWidth: { type: 'string' },
      borderTopColor: { type: 'color' },

      boxSizing: { type: 'dictionary', values: ['', 'content-box', 'border-box', 'inherit', 'initial', 'unset'] },
      boxShadow: { type: 'string' },

      clip: { type: 'string' },
      clipPath: { type: 'string' },
      clipRule: { type: 'dictionary', values: ['', 'nonzero', 'evenodd', 'inherit'] },

      color: { type: 'color' },

      cssFile: { type: 'dictionary', values: this.availableProjectCssFiles, propertyCaption: 'CSS File' },
      cssClass: { type: 'dictionary', values: [], propertyCaption: 'CSS Classes' },

      cursor: { type: 'dictionary', values: ['', 'auto', 'crosshair', 'default', 'pointer', 'move', 'e-resize', 'ne-resize', 'nw-resize', 'n-resize', 'se-resize', 'sw-resize', 's-resize', 'w-resize', 'text', 'wait', 'help', 'progress', 'inherit'] },

      display: { type: 'dictionary', values: ['', 'block', 'inline', 'inline-block', 'flex', 'none', 'inherit'] },

      filter: { type: 'string' },

      float: { type: 'dictionary', values: ['', 'left', 'right', 'none', 'inherit'] },
      // border: { type: 'string' },

      fontSize: { type: 'string' },
      fontFamily: { type: 'dictionary', values: ['', 'Arial', 'Verdana', 'Times New Roman', 'Georgia', 'Trebuchet MS', 'Tahoma', 'Courier New', 'Lucida Console', 'Impact', 'Comic Sans MS', 'Palatino Linotype', 'Book Antiqua', 'Lucida Sans Unicode', 'Arial Black', 'Garamond', 'Courier', 'Brush Script MT', 'Arial Narrow', 'Geneva', 'Gill Sans', 'Helvetica', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'] },
      fontWeight: { type: 'dictionary', values: ['', 'normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'] },
      fontStyle: { type: 'dictionary', values: ['', 'normal', 'italic', 'oblique'] },

      height: { type: 'string' },

      left: { type: 'string' },
      letterSpacing: { type: 'string' },

      lineHeight: { type: 'string' },
      listStyle: { type: 'dictionary', values: ['', 'none', 'disc', 'circle', 'square', 'decimal', 'decimal-leading-zero', 'lower-roman', 'upper-roman', 'lower-greek', 'lower-latin', 'upper-latin', 'armenian', 'georgian', 'lower-alpha', 'upper-alpha', 'none', 'inherit'] },

      marginTop: { type: 'string' },
      marginRight: { type: 'string' },
      marginBottom: { type: 'string' },
      marginLeft: { type: 'string' },

      mask: { type: 'string' },
      maskType: { type: 'dictionary', values: ['', 'luminance', 'alpha', 'auto', 'inherit'] },
      maskImage: { type: 'string' },
      maskMode: { type: 'dictionary', values: ['', 'alpha', 'luminance', 'auto', 'inherit'] },
      maskSize: { type: 'string' },
      maskRepeat: { type: 'dictionary', values: ['', 'repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round', 'inherit'] },
      maskPosition: { type: 'string' },
      maskClip: { type: 'dictionary', values: ['', 'border-box', 'padding-box', 'content-box', 'inherit'] },
      maskOrigin: { type: 'dictionary', values: ['', 'border-box', 'padding-box', 'content-box', 'inherit'] },
      maskComposite: { type: 'dictionary', values: ['', 'add', 'subtract', 'intersect', 'exclude', 'inherit'] },
      maskBorder: { type: 'string' },
      maskBorderSource: { type: 'string' },
      maskBorderSlice: { type: 'string' },
      maskBorderWidth: { type: 'string' },
      maskBorderOutset: { type: 'string' },
      maskBorderRepeat: { type: 'dictionary', values: ['', 'stretch', 'repeat', 'round', 'space', 'inherit'] },
      maskBorderMode: { type: 'dictionary', values: ['', 'alpha', 'luminance', 'auto', 'inherit'] },
      maskBorderClip: { type: 'dictionary', values: ['', 'border-box', 'padding-box', 'content-box', 'inherit'] },
      maskBorderOrigin: { type: 'dictionary', values: ['', 'border-box', 'padding-box', 'content-box', 'inherit'] },
      maskBorderComposite: { type: 'dictionary', values: ['', 'add', 'subtract', 'intersect', 'exclude', 'inherit'] },

      maxHeight: { type: 'string' },
      maxWidth: { type: 'string' },

      minWidth: { type: 'string' },
      minHeight: { type: 'string' },

      opacity: { type: 'string' },

      overflow: { type: 'dictionary', values: ['', 'visible', 'hidden', 'scroll', 'auto', 'inherit'] },
      overflowX: { type: 'dictionary', values: ['', 'visible', 'hidden', 'scroll', 'auto', 'inherit'] },
      overflowY: { type: 'dictionary', values: ['', 'visible', 'hidden', 'scroll', 'auto', 'inherit'] },

      paddingTop: { type: 'string' },
      paddingRight: { type: 'string' },
      paddingBottom: { type: 'string' },
      paddingLeft: { type: 'string' },

      position: { type: 'dictionary', values: ['', 'relative', 'absolute', 'fixed', 'static', 'sticky', 'inherit'] },

      textAlign: { type: 'dictionary', values: ['', 'left', 'right', 'center', 'justify', 'inherit'] },
      textIndent: { type: 'string' },
      textTransform: { type: 'dictionary', values: ['', 'none', 'capitalize', 'uppercase', 'lowercase', 'inherit'] },

      textDecoration: { type: 'dictionary', values: ['', 'none', 'underline', 'overline', 'line-through', 'blink'] },

      textShadow: { type: 'string' },
      top: { type: 'string' },

      transformOrigin: { type: 'string' },
      transform: { type: 'string' },

      transition: { type: 'string' },

      transitionProperty: { type: 'string' },
      transitionDuration: { type: 'string' },
      transitionTimingFunction: { type: 'string' },
      transitionDelay: { type: 'string' },

      verticalAlign: { type: 'dictionary', values: ['', 'baseline', 'sub', 'super', 'top', 'text-top', 'middle', 'bottom', 'text-bottom', 'inherit'] },
      visibility: { type: 'dictionary', values: ['', 'visible', 'hidden', 'collapse', 'inherit'] },

      whiteSpace: { type: 'dictionary', values: ['', 'normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap', 'inherit'] },

      width: { type: 'string' },
      wordSpacing: { type: 'dictionary', values: ['', 'normal', 'inherit'] },
      wordWrap: { type: 'dictionary', values: ['', 'normal', 'break-word', 'inherit'] },
      wordBreak: { type: 'dictionary', values: ['', 'normal', 'break-all', 'keep-all', 'inherit'] },

      zIndex: { type: 'string' }

    };

    this.tableInputProperties = {
      rows: { type: 'numberToArray', converter: this.converter.bind(this) },
      cols: { type: 'numberToArray', converter: this.converter.bind(this) },
      tableLayout: { type: 'dictionary', values: ['', 'auto', 'fixed', 'inherit'] },
      borderCollapse: { type: 'dictionary', values: ['', 'separate', 'collapse', 'inherit'] },
      borderSpacing: { type: 'string' },
      captionSide: { type: 'dictionary', values: ['', 'top', 'bottom', 'inherit'] },
      emptyCells: { type: 'dictionary', values: ['', 'show', 'hide', 'inherit'] },
      tableCaption: { type: 'string' },
      tableBorder: { type: 'string' },
      tableBorderSpacing: { type: 'string' },
      tableBorderCollapse: { type: 'dictionary', values: ['', 'separate', 'collapse', 'inherit'] }
    };

    this.htmlInputs = {
      cssClass: ['html-input-designer'],
      cssFile: 'styles.css',
      // width: '100px',
      // height: '100px',
      // backgroundColor: 'transparent',
      // color: 'inherit',
      // borderBottomStyle: 'solid',
      // borderBottomWidth: '1px',
      // borderBottomColor: 'inherit',
      // borderLeftStyle: 'solid',
      // borderLeftWidth: '1px',
      // borderLeftColor: 'inherit',
      // borderRightStyle: 'solid',
      // borderRightWidth: '1px',
      // borderRightColor: 'inherit',
      // borderTopStyle: 'solid',
      // borderTopWidth: '1px',
      // borderTopColor: 'inherit'
    };
    this.tableInputs = {
      rows: 2, // Array(2).fill(1).map((x, i) => i)
      cols: 2, // Array(2).fill(1).map((x, i) => i)
      borderCollapse: 'collapse',
    };

    let tableProps = {};
    Object.assign(tableProps, this.tableInputProperties);
    Object.assign(tableProps, this.htmlInputProperties);

    let tableFullInputs = {};
    Object.assign(tableFullInputs, this.tableInputs);
    Object.assign(tableFullInputs, this.htmlInputs);

    this.dsProperties = {
      datasource: {
        type: 'dropped-component-list',
        filter: 'DATASOURCE',
        // async: true,
        asyncPath: 'component',
        serializable: { prop: 'uniqueName' }
      },
      componentRef: { type: 'dropped-component', hide: true, serializable: false },
    };

    this.repeaterProperties = {}
    Object.assign(this.repeaterProperties, this.dsProperties);
    Object.assign(this.repeaterProperties, {
      hideToolbar: {
        type: 'boolean',
        propertyCaption: 'Hide toolbar'
      },
      action: {
        propertyCaption: 'Archetype',
        type: 'dictionary',
        async: true,
        values: Object.keys(MetadataProviderService.widgetDefinition.archetypes).map(x => {
          return x;
        }),
        conditional: (inputProps: any, inputs: any, newValue, oldValue) => {
          this.propertyTreeBuilder(newValue, inputs);
        }
      },
      propertyTree: {
        type: 'propertyTree',
        // propertyCaption: 'Action Properties',
        hideCaption: true,
        async: true
      },
      templateString: {
        type: 'html-string',
        hide: true
      },
      rowCustomSelect: {
        type: 'function',
        hide: true
      },
      wizardPrevConfig: {
        type: 'button',
        propertyCaption: 'wizard.prev.config',
        hideCaption: true,
        callback: (inputs: any) => {
          void this.openWizardTableActionConfig(inputs, 'prev');
        }
      },
      wizardNextConfig: {
        type: 'button',
        propertyCaption: 'wizard.next.config',
        hideCaption: true,
        callback: (inputs: any) => {
          void this.openWizardTableActionConfig(inputs, 'next');
        }
      },
      wizardCompleteConfig: {
        type: 'button',
        propertyCaption: 'wizard.complete.config',
        hideCaption: true,
        callback: (inputs: any) => {
          void this.openWizardTableActionConfig(inputs, 'end');
        }
      }
    });

    this.bindableHtmlProps = {};
    this.innerHtmlProperties = {
      innerText: { type: 'string', propertyCaption: 'Inner Text' },
      bindingFunction: { type: 'txt_area', propertyCaption: 'Binding function' }
    };

    Object.assign(this.bindableHtmlProps, this.innerHtmlProperties);
    Object.assign(this.bindableHtmlProps, this.dsProperties);
    Object.assign(this.bindableHtmlProps, this.htmlInputProperties);

    this.bindableHtmlInputs = {
      innerText: 'STRING'
    };
    Object.assign(this.bindableHtmlInputs, this.htmlInputs);
    Object.assign(this.bindableHtmlInputs, {
      cssClass: ['html-input-bindable-designer']
    });

    this.headerProps = {
      headerType: {
        type: 'dictionary',
        values: [
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
        ],
        propertyCaption: 'Header Type'
      }
    };

    Object.assign(this.headerProps, this.bindableHtmlProps);

    this.headerInputs = {
      headerType: 'h1'
    };

    Object.assign(this.headerInputs, this.bindableHtmlInputs);

    this.anchorProps = {
      href: { type: 'string', propertyCaption: 'Href' },
      target: {
        type: 'dictionary',
        values: ['_blank', '_self', '_parent', '_top'],
        propertyCaption: 'Target'
      }
    }

    Object.assign(this.anchorProps, this.bindableHtmlProps);

    this.anchorInputs = {
      href: 'https://www.google.com',
      target: '_blank'
    }

    Object.assign(this.anchorInputs, this.bindableHtmlInputs);

    this.imgProps = {
      src: { type: 'string', propertyCaption: 'Source' },
      alt: { type: 'string', propertyCaption: 'Alt' }
    }
    Object.assign(this.imgProps, this.bindableHtmlProps);
    delete this.imgProps['innerText'];

    this.imgInputs = {
      src: null,
      alt: 'Image'
    }
    Object.assign(this.imgInputs, this.bindableHtmlInputs);

    this.htmlItemTemplateProps = {
      itemTemplate: { type: 'txt_area', propertyCaption: 'Item Template' }
    }
    Object.assign(this.htmlItemTemplateProps, this.bindableHtmlProps);
    delete this.htmlItemTemplateProps['innerText'];

    this.htmlButtonProps = {
      clickCallback: { type: 'txt_area', propertyCaption: 'Click callback' }
    }
    Object.assign(this.htmlButtonProps, this.htmlItemTemplateProps);

    this.splitterProps = {
      direction: { type: 'dictionary', values: ['horizontal', 'vertical'], propertyCaption: 'Direction' },
      unit: { type: 'dictionary', values: ['percent', 'pixel'], propertyCaption: 'Area size unit' },
      areas: { type: 'numberToArray', converter: this.converterSplitter.bind(this) },
      resize: { type: 'function', hide: true }
    }
    Object.assign(this.splitterProps, this.htmlInputProperties);

    this.splitterInputs = {
      direction: 'horizontal',
      unit: 'percent',
      size: 50,
      areas: 2,
      resize: (event, splitter) => {
        // let indx = event.gutterNum;
        splitter.nestedComponents.forEach((area, i) => {
          area.inputs.size = event.sizes[i];
        });

        cd.detectChanges();
        // Splitter dragEnd is the gesture-end signal — mutated `area.inputs.size`
        // values must be persisted in undo history right here. Without this,
        // resizing splitter areas was not undoable.
        this.commitHistoryIfChanged();
      }
    }
    Object.assign(this.splitterInputs, this.htmlInputs);

    this.splitterAreaProps = {
      size: { type: 'string', propertyCaption: 'Size' }
    }
    Object.assign(this.splitterAreaProps, this.htmlInputProperties);
    delete this.splitterAreaProps['width'];
    delete this.splitterAreaProps['height'];


    this.splitterAreaInputs = {
      size: 50
    }
    Object.assign(this.splitterAreaInputs, this.htmlInputs);
    delete this.splitterAreaInputs['width'];
    delete this.splitterAreaInputs['height'];
    delete this.splitterAreaInputs['cssClass'];

    this.accordionProps = {
      items: { type: 'numberToArray', converter: this.converterAccordion.bind(this) },
      toggle: { type: 'function', hide: true }
    }
    Object.assign(this.accordionProps, this.htmlInputProperties);

    this.accordionInputs = {
      items: 2,
      toggle: (event, accordion, nestedItem) => {
        accordion.nestedComponents.forEach((item, i) => {
          if (item.uniqueName == nestedItem.uniqueName) {
            item.inputs.expanded = !item.inputs.expanded;
          } else {
            item.inputs.expanded = false;
          }
        });

        cd.detectChanges();

        event.preventDefault();
      }
    }
    Object.assign(this.accordionInputs, this.htmlInputs);
    this.accordionInputs['display'] = 'block';

    this.accordionAreaProps = {
      header: { type: 'string', propertyCaption: 'Header' }
    }
    Object.assign(this.accordionAreaProps, this.htmlInputProperties);

    this.accordionAreaInputs = {
      header: 'header',
      items: 2
    }
    Object.assign(this.accordionAreaInputs, this.htmlInputs);
    delete this.accordionAreaInputs['cssClass'];

    this.accordionAreaInputs['height'] = null;
    this.accordionAreaInputs['display'] = 'block';
    // this.accordionAreaInputs['borderStyle'] = 'none';
    this.accordionAreaInputs['borderTopStyle'] = 'none';
    this.accordionAreaInputs['borderLeftStyle'] = 'none';
    this.accordionAreaInputs['borderRightStyle'] = 'none';

    this.accordionAreaInputs['borderBottomStyle'] = 'solid';
    this.accordionAreaInputs['borderBottomWidth'] = '1px';
    this.accordionAreaInputs['borderBottomColor'] = '#e2e8f0';

    // let divCtx = [
    //   {
    //     label: 'Add DIV',
    //     icon: 'pi pi-plus',
    //     command: (menuItem) => {
    //       debugger;
    //     }
    //   } as any
    // ];
    // divCtx.push(...this.defaultCtxItems);

    this.availableTools = [
      {
        group: 'HTML',
        toolId: 1,
        name: 'TABLE',
        tag: `<table [attr.id]="uniqueName"  ngxDraggableDom="true" (moved)="onMoving($event, this)" ngResizable [rzHandles] = "'se'" (rzResizing)="onResizing($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}><tr *ngFor="let nestedTR of nestedComponents" [attr.id]="nestedTR.uniqueName" ${this.htmlStyleString.replace(/0/g, 'nestedTR.inputs')}><td *ngFor="let nestedTD of nestedTR.nestedComponents" [attr.id]="nestedTD.uniqueName" [attr.colspan]="nestedTD.inputs?.colSpan || null" [attr.rowspan]="nestedTD.inputs?.rowSpan || null" ngResizable [rzHandles] = "'se'" (rzResizing)="onResizing($event, nestedTD)" ${this.htmlStyleString.replace(/0/g, 'nestedTD.inputs')}><wuic-dashboard [dashboardElements]="nestedTD.nestedComponents"></wuic-dashboard></td></tr></table>`,
        icon: 'pi pi-table',
        inputProps: tableProps,
        inputs: tableFullInputs,
        nestedComponents: [],
        onDrop: this.dropTable.bind(this)
      },
      {
        group: 'HTML',
        toolId: 3,
        hide: true,
        name: 'TR',
        tag: ``,
        icon: 'pi pi-bars',
        inputProps: this.htmlInputProperties,
        inputs: Object.assign({}, tableFullInputs, { cssClass: [] }),
        nestedComponents: []
      },
      {
        group: 'HTML',
        toolId: 4,
        hide: true,
        name: 'TD',
        tag: ``,
        icon: 'pi pi-bars',
        inputProps: Object.assign({}, this.htmlInputProperties, {
          colSpan: { type: 'string', propertyCaption: 'Col span' },
          rowSpan: { type: 'string', propertyCaption: 'Row span' }
        }),
        inputs: Object.assign({}, tableFullInputs, {
          colSpan: '',
          rowSpan: ''
        }, { cssClass: [] }),
        nestedComponents: []
      },
      {
        group: 'HTML',
        toolId: 2,
        name: 'DIV',
        tag: `<div [attr.id]="uniqueName" ngxDraggableDom="true" ngResizable [rzHandles] = "'se'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}><wuic-dashboard [dashboardElements]="nestedComponents"></wuic-dashboard></div>`,
        icon: 'pi pi-stop',
        inputProps: this.htmlInputProperties,
        inputs: this.htmlInputs,
        nestedComponents: [],
        ctxItems: this.defaultCtxItems
      },
      {
        group: 'HTML',
        toolId: 3,
        name: 'SPAN',
        tag: `<span [attr.id]="uniqueName"  [databound]="inputs.datasource?.component" [bindingFunction]="inputs.bindingFunction" [inputs]="inputs" ngxDraggableDom="true" ngResizable [rzHandles] = "'e'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}>{{inputs.innerText}}</span>`,
        icon: 'pi pi-language',
        inputProps: this.bindableHtmlProps,
        inputs: this.bindableHtmlInputs
      },
      {
        group: 'HTML',
        toolId: 17,
        name: 'LABEL',
        tag: `<label [attr.id]="uniqueName"  [databound]="inputs.datasource?.component" [bindingFunction]="inputs.bindingFunction" [inputs]="inputs" ngxDraggableDom="true" ngResizable [rzHandles]="'e'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}>{{getLabelDisplayValue(inputs)}}</label>`,
        icon: 'pi pi-tag',
        inputProps: Object.assign({}, this.bindableHtmlProps, {
          displayField: { type: 'dictionary', values: [''], propertyCaption: 'Display Field' },
          displayFormula: { type: 'button', propertyCaption: 'Display Formula', hideCaption: true, callback: this.openLabelDisplayFormulaEditor.bind(this) }
        }),
        inputs: Object.assign({}, this.bindableHtmlInputs, {
          datasource: null,
          componentRef: null,
          innerText: 'Label',
          displayField: '',
          displayFormula: ''
        })
      },
      {
        group: 'HTML',
        toolId: 4,
        name: 'Hx',
        tag: `<h1 *ngIf="inputs.headerType == 'h1'" [attr.id]="uniqueName"  [databound]="inputs.datasource?.component" [bindingFunction]="inputs.bindingFunction" [inputs]="inputs" ngxDraggableDom="true" ngResizable [rzHandles] = "'e'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}>{{inputs.innerText}}</h1><h2 *ngIf="inputs.headerType == 'h2'" [attr.id]="uniqueName"  [databound]="inputs.datasource?.component" [bindingFunction]="inputs.bindingFunction" [inputs]="inputs" ngxDraggableDom="true" ngResizable [rzHandles] = "'e'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}>{{inputs.innerText}}</h2><h3 *ngIf="inputs.headerType == 'h3'" [attr.id]="uniqueName"  [databound]="inputs.datasource?.component" [bindingFunction]="inputs.bindingFunction" [inputs]="inputs" ngxDraggableDom="true" ngResizable [rzHandles] = "'e'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}>{{inputs.innerText}}</h3><h4 *ngIf="inputs.headerType == 'h4'" [attr.id]="uniqueName"  [databound]="inputs.datasource?.component" [bindingFunction]="inputs.bindingFunction" [inputs]="inputs" ngxDraggableDom="true" ngResizable [rzHandles] = "'e'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}>{{inputs.innerText}}</h4><h5 *ngIf="inputs.headerType == 'h5'" [attr.id]="uniqueName"  [databound]="inputs.datasource?.component" [bindingFunction]="inputs.bindingFunction" [inputs]="inputs" ngxDraggableDom="true" ngResizable [rzHandles] = "'e'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}>{{inputs.innerText}}</h5><h6 *ngIf="inputs.headerType == 'h6'" [attr.id]="uniqueName"  [databound]="inputs.datasource?.component" [bindingFunction]="inputs.bindingFunction" [inputs]="inputs" ngxDraggableDom="true" ngResizable [rzHandles] = "'e'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}>{{inputs.innerText}}</h6>`,
        icon: 'pi pi-chevron-up',
        inputProps: this.headerProps,
        inputs: this.headerInputs
      },
      {
        group: 'HTML',
        toolId: 5,
        name: 'ANCHOR',
        tag: `<a [attr.id]="uniqueName"  [href]="inputs.href" [target]="inputs.target" [databound]="inputs.datasource?.component" [bindingFunction]="inputs.bindingFunction" [inputs]="inputs" ngxDraggableDom="true" ngResizable [rzHandles] = "'e'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}>{{inputs.innerText}}</a>`,
        icon: 'pi pi-link',
        inputProps: this.anchorProps,
        inputs: this.anchorInputs
      },
      {
        group: 'HTML',
        toolId: 6,
        name: 'IMG',
        tag: `<img [attr.id]="uniqueName"  [src]="inputs.src" [alt]="inputs.alt" [databound]="inputs.datasource?.component" [bindingFunction]="inputs.bindingFunction" [inputs]="inputs" ngxDraggableDom="true" ngResizable [rzHandles] = "'se'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')} />`,
        icon: 'pi pi-image',
        inputProps: this.imgProps,
        inputs: this.imgInputs
      },
      {
        group: 'HTML',
        toolId: 18,
        name: 'IFRAME',
        tag: `<iframe [attr.id]="uniqueName"  [attr.src]="inputs.src" [attr.frameborder]="inputs.frameBorder" [attr.allowfullscreen]="inputs.allowFullscreen ? '' : null" ngxDraggableDom="true" ngResizable [rzHandles]="'se'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}></iframe>`,
        icon: 'pi pi-window-maximize',
        inputProps: Object.assign({}, this.htmlInputProperties, {
          src: { type: 'string', propertyCaption: 'Source URL' },
          frameBorder: { type: 'dictionary', values: ['0', '1'], propertyCaption: 'Frame Border' },
          allowFullscreen: { type: 'boolean', propertyCaption: 'Allow Fullscreen' }
        }),
        inputs: Object.assign({}, this.htmlInputs, {
          src: '',
          frameBorder: '0',
          allowFullscreen: false,
          width: '480px',
          height: '280px'
        })
      },
      {
        group: 'HTML',
        toolId: 7,
        name: 'UL',
        tag: `<ul [attr.id]="uniqueName"  [databound]="inputs.datasource?.component" [itemTemplate]="inputs.itemTemplate" [inputs]="inputs" ngxDraggableDom="true" ngResizable [rzHandles] = "'se'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}>
          <li *ngFor="let li of (inputs.datasource?.component?.value?.resultInfo?.dato || (inputs.optionsCsv || '').split(','))">
            <ng-container *ngIf="inputs.displayFormula; else ulItemTemplate">{{getUlItemDisplayValue(inputs, li)}}</ng-container>
            <ng-template #ulItemTemplate>
              {{getSelectOptionLabel(inputs, li)}}
            </ng-template>
          <li>
        </ul>`,
        icon: 'pi pi-list',
        inputProps: (() => {
          const ulProps = Object.assign({}, this.htmlItemTemplateProps, {
            optionsCsv: { type: 'string', propertyCaption: 'Options CSV' },
            valueField: { type: 'dictionary', values: [''], propertyCaption: 'Value Field' },
            textField: { type: 'dictionary', values: [''], propertyCaption: 'Text Field' },
            displayFormula: { type: 'button', propertyCaption: 'Display Formula', hideCaption: true, callback: this.openUlDisplayFormulaEditor.bind(this) }
          });
          delete ulProps['bindingFunction'];
          return ulProps;
        })(),
        inputs: Object.assign({}, this.bindableHtmlInputs, {
          optionsCsv: 'Item 1,Item 2,Item 3',
          valueField: '',
          textField: '',
          displayFormula: ''
        }),
        nestedComponents: []
      },
      {
        group: 'HTML',
        toolId: 8,
        name: 'BUTTON',
        tag: `<button [attr.id]="uniqueName"  (click)="inputs.clickCallback__fn(inputs.datasource?.component?.value?.resultInfo, inputs.datasource?.component?.value?.metaInfo, inputs, $event, inputs._wtoolbox)" [databound]="inputs.datasource?.component" [bindingFunction]="inputs.bindingFunction" [itemTemplate]="inputs.itemTemplate" [clickCallback]="inputs.clickCallback" [inputs]="inputs" ngxDraggableDom="true" ngResizable [rzHandles] = "'se'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}><ng-container *ngComponentOutlet="inputs.itemTemplateComponent; inputs: { rowData: inputs.templateData, metaInfo: inputs.datasource?.component?.value?.metaInfo, datasource: inputs.datasource?.component?.value }"></ng-container></button>`,
        icon: 'pi pi-arrow-circle-down',
        inputProps: this.htmlButtonProps,
        inputs: this.bindableHtmlInputs
      },
      {
        group: 'HTML',
        toolId: 9,
        name: 'INPUT',
        tag: `<input [attr.id]="uniqueName"  [type]="inputs.inputType || 'text'" [placeholder]="inputs.placeholder" [readonly]="inputs.readonly" [disabled]="inputs.disabled" [value]="inputs.value" (input)="inputs.value=$any($event.target).value" ngxDraggableDom="true" ngResizable [rzHandles]="'e'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')} />`,
        icon: 'pi pi-pencil',
        inputProps: Object.assign({}, this.htmlInputProperties, {
          inputType: { type: 'dictionary', propertyCaption: 'Type', values: ['text', 'number', 'email', 'password', 'search', 'url'] },
          placeholder: { type: 'string', propertyCaption: 'Placeholder' },
          value: { type: 'string', propertyCaption: 'Value' },
          readonly: { type: 'boolean', propertyCaption: 'Readonly' },
          disabled: { type: 'boolean', propertyCaption: 'Disabled' }
        }),
        inputs: Object.assign({}, this.htmlInputs, {
          inputType: 'text',
          placeholder: '',
          value: '',
          readonly: false,
          disabled: false,
          height: '32px'
        })
      },
      {
        group: 'HTML',
        toolId: 10,
        name: 'TEXTAREA',
        tag: `<textarea [attr.id]="uniqueName"  [placeholder]="inputs.placeholder" [readonly]="inputs.readonly" [disabled]="inputs.disabled" [rows]="inputs.rows" [value]="inputs.value" (input)="inputs.value=$any($event.target).value" ngxDraggableDom="true" ngResizable [rzHandles]="'se'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}></textarea>`,
        icon: 'pi pi-align-left',
        inputProps: Object.assign({}, this.htmlInputProperties, {
          placeholder: { type: 'string', propertyCaption: 'Placeholder' },
          value: { type: 'txt_area', propertyCaption: 'Value' },
          rows: { type: 'string', propertyCaption: 'Rows' },
          readonly: { type: 'boolean', propertyCaption: 'Readonly' },
          disabled: { type: 'boolean', propertyCaption: 'Disabled' }
        }),
        inputs: Object.assign({}, this.htmlInputs, {
          placeholder: '',
          value: '',
          rows: '4',
          readonly: false,
          disabled: false,
          height: '96px'
        })
      },
      {
        group: 'HTML',
        toolId: 11,
        name: 'CHECKBOX',
        tag: `<label [attr.id]="uniqueName"  ngxDraggableDom="true" ngResizable [rzHandles]="'e'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}><input type="checkbox" [checked]="inputs.checked" (change)="inputs.checked=$any($event.target).checked" [disabled]="inputs.disabled" /> {{inputs.label}}</label>`,
        icon: 'pi pi-check-square',
        inputProps: Object.assign({}, this.htmlInputProperties, {
          label: { type: 'string', propertyCaption: 'Label' },
          checked: { type: 'boolean', propertyCaption: 'Checked' },
          disabled: { type: 'boolean', propertyCaption: 'Disabled' }
        }),
        inputs: Object.assign({}, this.htmlInputs, {
          label: 'Checkbox',
          checked: false,
          disabled: false,
          width: '160px',
          height: '24px',
          // borderStyle: 'none',
          borderTopStyle: 'none',
          borderRightStyle: 'none',
          borderBottomStyle: 'none',
          borderLeftStyle: 'none'
        })
      },
      {
        group: 'HTML',
        toolId: 12,
        name: 'SEPARATOR',
        tag: `<hr [attr.id]="uniqueName"  ngxDraggableDom="true" ngResizable [rzHandles]="'e'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')} />`,
        icon: 'pi pi-minus',
        inputProps: this.htmlInputProperties,
        inputs: Object.assign({}, this.htmlInputs, {
          width: '100%',
          height: '2px',
          // borderStyle: 'none',
          borderTopStyle: 'solid',
          borderTopWidth: '1px',
          borderTopColor: '#cbd5e1',
          borderRightStyle: 'none',
          borderBottomStyle: 'none',
          borderLeftStyle: 'none'
        })
      },
      {
        group: 'HTML',
        toolId: 19,
        name: 'HR',
        tag: `<hr [attr.id]="uniqueName"  ngxDraggableDom="true" ngResizable [rzHandles]="'e'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')} />`,
        icon: 'pi pi-minus',
        inputProps: this.htmlInputProperties,
        inputs: Object.assign({}, this.htmlInputs, {
          width: '100%',
          height: '2px',
          // borderStyle: 'none',
          borderTopStyle: 'solid',
          borderTopWidth: '1px',
          borderTopColor: '#cbd5e1',
          borderRightStyle: 'none',
          borderBottomStyle: 'none',
          borderLeftStyle: 'none'
        })
      },
      {
        group: 'HTML',
        toolId: 13,
        name: 'KPI',
        tag: `<div [attr.id]="uniqueName"  ngxDraggableDom="true" ngResizable [rzHandles]="'se'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}><div style="font-size:12px; opacity:.75;">{{inputs.caption}}</div><div style="font-size:28px; font-weight:700; line-height:1.2;">{{inputs.value}}</div></div>`,
        icon: 'pi pi-chart-line',
        inputProps: Object.assign({}, this.htmlInputProperties, {
          caption: { type: 'string', propertyCaption: 'Caption' },
          value: { type: 'string', propertyCaption: 'Value' }
        }),
        inputs: Object.assign({}, this.htmlInputs, {
          caption: 'KPI',
          value: '0',
          width: '180px',
          height: '90px',
          paddingTop: '10px',
          paddingRight: '12px',
          paddingBottom: '10px',
          paddingLeft: '12px',
          borderRadius: '8px',
          // borderStyle: 'solid',
          // borderWidth: '1px',
          // borderColor: '#d1d5db'
        })
      },
      {
        group: 'HTML',
        toolId: 14,
        name: 'DATE',
        tag: `<input [attr.id]="uniqueName"  type="date" [readonly]="inputs.readonly" [disabled]="inputs.disabled" [value]="inputs.value" (input)="inputs.value=$any($event.target).value" ngxDraggableDom="true" ngResizable [rzHandles]="'e'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')} />`,
        icon: 'pi pi-calendar',
        inputProps: Object.assign({}, this.htmlInputProperties, {
          value: { type: 'string', propertyCaption: 'Value (yyyy-mm-dd)' },
          readonly: { type: 'boolean', propertyCaption: 'Readonly' },
          disabled: { type: 'boolean', propertyCaption: 'Disabled' }
        }),
        inputs: Object.assign({}, this.htmlInputs, {
          value: '',
          readonly: false,
          disabled: false,
          width: '180px',
          height: '32px'
        })
      },
      {
        group: 'HTML',
        toolId: 15,
        name: 'SELECT',
        tag: `<select [attr.id]="uniqueName"  [disabled]="inputs.disabled" [value]="inputs.value" (change)="inputs.value=$any($event.target).value" ngxDraggableDom="true" ngResizable [rzHandles]="'e'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}><option *ngFor="let opt of (inputs.datasource?.component?.value?.resultInfo?.dato || (inputs.optionsCsv || '').split(','))" [value]="inputs.datasource?.component?.value?.resultInfo?.dato ? (opt?.[inputs.valueField] ?? '') : opt.trim()">{{getSelectOptionLabel(inputs, opt)}}</option></select>`,
        icon: 'pi pi-list',
        inputProps: Object.assign({}, this.htmlInputProperties, this.dsProperties, {
          optionsCsv: { type: 'string', propertyCaption: 'Options CSV' },
          valueField: { type: 'dictionary', values: [''], propertyCaption: 'Value Field' },
          textField: { type: 'dictionary', values: [''], propertyCaption: 'Text Field' },
          displayFormula: { type: 'button', propertyCaption: 'Display Formula', hideCaption: true, callback: this.openSelectDisplayFormulaEditor.bind(this) },
          value: { type: 'string', propertyCaption: 'Selected Value' },
          disabled: { type: 'boolean', propertyCaption: 'Disabled' }
        }),
        inputs: Object.assign({}, this.htmlInputs, {
          datasource: null,
          componentRef: null,
          optionsCsv: 'Option 1,Option 2,Option 3',
          valueField: '',
          textField: '',
          displayFormula: '',
          value: 'Option 1',
          disabled: false,
          width: '180px',
          height: '32px'
        })
      },
      {
        group: 'HTML',
        toolId: 16,
        name: 'MULTISELECT',
        tag: `<select [attr.id]="uniqueName"  multiple="true" [disabled]="inputs.disabled" [size]="inputs.size || 4" (change)="inputs.values = [].slice.call($any($event.target).selectedOptions || []).map(x => x.value)" ngxDraggableDom="true" ngResizable [rzHandles]="'se'" (rzResizing)="onResizing($event, this)" (moved)="onMoving($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}><option *ngFor="let opt of (inputs.datasource?.component?.value?.resultInfo?.dato || (inputs.optionsCsv || '').split(','))" [value]="inputs.datasource?.component?.value?.resultInfo?.dato ? (opt?.[inputs.valueField] ?? '') : opt.trim()" [selected]="(inputs.values || []).includes((inputs.datasource?.component?.value?.resultInfo?.dato ? (opt?.[inputs.valueField] ?? '') : opt.trim()) + '')">{{getSelectOptionLabel(inputs, opt)}}</option></select>`,
        icon: 'pi pi-check-square',
        inputProps: Object.assign({}, this.htmlInputProperties, this.dsProperties, {
          optionsCsv: { type: 'string', propertyCaption: 'Options CSV' },
          valueField: { type: 'dictionary', values: [''], propertyCaption: 'Value Field' },
          textField: { type: 'dictionary', values: [''], propertyCaption: 'Text Field' },
          displayFormula: { type: 'button', propertyCaption: 'Display Formula', hideCaption: true, callback: this.openSelectDisplayFormulaEditor.bind(this) },
          values: { type: 'txt_area', propertyCaption: 'Selected Values (array)' },
          size: { type: 'string', propertyCaption: 'Visible Rows' },
          disabled: { type: 'boolean', propertyCaption: 'Disabled' }
        }),
        inputs: Object.assign({}, this.htmlInputs, {
          datasource: null,
          componentRef: null,
          optionsCsv: 'Option 1,Option 2,Option 3',
          valueField: '',
          textField: '',
          displayFormula: '',
          values: [],
          size: '4',
          disabled: false,
          width: '200px',
          height: '96px'
        })
      },
      {
        group: 'DATA',
        toolId: 100,
        name: 'DATASOURCE',
        tag: `<wuic-data-source [attr.id]="uniqueName"  #datasource [autoload]="inputs.autoload" [routeFromRouting]="inputs.routeFromRouting" [route]="inputs.route" [parentRecord]="inputs.selectedItem" [parentMetaInfo]="inputs.parentMetaInfo" [componentRef]="inputs.componentRef"></wuic-data-source>`,
        icon: 'pi pi-database',
        inputProps: {
          autoload: { type: 'boolean' },
          routeFromRouting: { type: 'boolean' },
          route: {
            type: 'autocomplete',
            multiple: false,
            metaColumnName: 'md_id',
            metaRoute: MetadataProviderService.metaTableRoute,
            displayField: 'md_display_string',
            valueField: 'md_route_name',
            async: true
          },
          metaEditor: { type: 'metaEditor', hideCaption: true },
          componentRef: { type: 'dropped-component', hide: true, async: true, serializable: false },
          parentRecord: { type: 'selectedItem', hide: true, serializable: false },
          parentDatasource: {
            type: 'dropped-component-list',
            filter: 'DATASOURCE',
            async: true,
            asyncPath: 'component',
            serializable: { prop: 'uniqueName' }
          },
          masterDetailFilterFormula: { type: 'txt_area', propertyCaption: 'Master-detail filter formula', hide: true },
          masterDetailFilterFormulaEditor: {
            type: 'button',
            propertyCaption: 'Edit Formula',
            callback: (inputs: any, _prop: string, _newValue: any, tool: DesignerTool) => {
              void this.openMasterDetailFilterFormulaEditor(inputs, tool);
            }
          }
        },
        inputs: {
          route: null,
          autoload: true,
          routeFromRouting: false,
          componentRef: null,
          masterDetailFilterFormula: ''
        },
        nestedComponents: []
      },
      {
        group: 'DATA',
        toolId: 101,
        name: 'DATAREPEATER',
        tag: `<wuic-data-repeater [attr.id]="uniqueName"  [datasource]="inputs.datasource?.component" [action]="inputs.action" [hideToolbar]="inputs.hideToolbar" [rowCustomSelect]="inputs.rowCustomSelect?.bind(inputs)"></wuic-data-repeater>`,
        icon: 'pi pi-table',
        inputProps: this.repeaterProperties,
        inputs: {
          hideToolbar: false,
          action: null,
          propertyTree: [],
          componentRef: null,
          datasource: null,
          rowCustomSelect: (arg1: any, arg2: any, dt: any) => {
            const firstIsEvent = !!(arg1 && (arg1.currentTarget || arg1.target));
            const $event = firstIsEvent ? arg1 : arg2;
            const rowData = firstIsEvent ? arg2 : arg1;
            this.handleRepeaterMasterRowSelection($event, rowData);
          }
        }
      },
      {
        group: 'DATA',
        toolId: 102,
        name: 'FILTERBAR',
        tag: `<wuic-filter-bar [attr.id]="uniqueName"  [datasource]="inputs.datasource?.component"></wuic-filter-bar>`,
        icon: 'pi pi-filter',
        inputProps: Object.assign({}, this.dsProperties),
        inputs: {
          datasource: null,
          componentRef: null
        }
      },
      {
        group: 'DATA',
        toolId: 104,
        name: 'PAGER',
        tag: `<wuic-pager [attr.id]="uniqueName"  [datasource]="inputs.datasource?.component" [pageSize]="inputs.pageSize" [currentPage]="inputs.currentPage"></wuic-pager>`,
        icon: 'pi pi-angle-double-right',
        inputProps: Object.assign({}, this.dsProperties, {
          pageSize: { type: 'string', propertyCaption: 'Page Size' },
          currentPage: { type: 'string', propertyCaption: 'Current Page' }
        }),
        inputs: {
          datasource: null,
          componentRef: null,
          pageSize: 10,
          currentPage: 1
        }
      },
      {
        group: 'CONTAINER',
        toolId: 1000,
        name: 'TABVIEW',
        tag: `<p-tabView [attr.id]="uniqueName"  [tabs]="nestedComponents" ngxDraggableDom="true" (moved)="onMoving($event, this)" ngResizable [rzHandles]="'se'" (rzResizing)="onResizing($event, this)" ${this.htmlStyleString.replace('[ngStyle]', '[style]').replace(/0/g, 'inputs')}>
            <wuic-dashboard [dashboardElements]="nestedComponents"></wuic-dashboard>
        </p-tabView>`,
        icon: 'pi pi-folder',
        inputProps: this.htmlInputProperties,
        inputs: Object.assign({}, this.htmlInputs, { cssClass: [] }),
        nestedComponents: [],
        allowedChildren: ['TABPANEL']
      },
      {
        group: 'CONTAINER',
        toolId: 1001,
        name: 'TABPANEL',
        tag: `<p-tabPanel [attr.id]="uniqueName"  [selected]="inputs.selected">
                 <wuic-dashboard [dashboardElements]="nestedComponents"></wuic-dashboard>
             </p-tabPanel>`,
        icon: 'pi pi-tags',
        inputProps: {
          header: { type: 'string', propertyCaption: 'Tab Header' },
          selected: { type: 'boolean', propertyCaption: 'Selected', hide: true }
        },
        inputs: { header: '<header>' },
        nestedComponents: []
      },
      {
        group: 'CONTAINER',
        toolId: 1002,
        name: 'SPLITTER',
        tag: `<p-splitter [attr.id]="uniqueName"  [direction]="inputs.direction" (dragEnd)="inputs.resize?.($event, this)" ngxDraggableDom="true" (moved)="onMoving($event, this)" ngResizable [rzHandles]="'se'" (rzResizing)="onResizing($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}>
                 <p-splitter-area *ngFor="let nestedArea of nestedComponents" [attr.id]="nestedArea.uniqueName" [size]="nestedArea.inputs.size" ${this.htmlStyleString.replace(/0/g, 'nestedArea.inputs')}>
                  <wuic-dashboard [dashboardElements]="nestedArea.nestedComponents"></wuic-dashboard>
                </p-splitter-area>
              </p-splitter>`,
        icon: 'pi pi-objects-column',
        inputProps: this.splitterProps,
        inputs: this.splitterInputs,
        nestedComponents: [],
        allowedChildren: ['SPLITTER-AREA'],
        onDrop: this.dropSplitter.bind(this)
      },
      {
        group: 'CONTAINER',
        toolId: 1003,
        name: 'SPLITTER-AREA',
        tag: ``,
        icon: '',
        inputProps: this.splitterAreaProps,
        inputs: this.splitterAreaInputs,
        hide: true,
        nestedComponents: [],
        onDrop: null
      },
      {
        group: 'CONTAINER',
        toolId: 1004,
        name: 'ACCORDION',
        tag: ` <cdk-accordion class="wuic-accordion-tab" [attr.id]="uniqueName"  (dragEnd)="inputs.resize?.($event, this)" ngxDraggableDom="true" (moved)="onMoving($event, this)" ngResizable [rzHandles]="'se'" (rzResizing)="onResizing($event, this)" ${this.htmlStyleString.replace(/0/g, 'inputs')}>
              <cdk-accordion-item *ngFor="let nestedItem of nestedComponents" [attr.id]="nestedItem.uniqueName" 
                ${this.htmlStyleString.replace(/0/g, 'nestedItem.inputs')}>
                  <div class="wuic-accordion-header">
                    <a class="wuic-accordion-header-link" (click)="inputs.toggle?.($event, this, nestedItem)">{{nestedItem.inputs.header}}</a>
                  </div>
                  <div class="wuic-accordion-content" [style.minHeight]="'40px'" [style.display]="nestedItem.inputs.expanded ? '' : 'none'">
                    <wuic-dashboard [dashboardElements]="nestedItem.nestedComponents"></wuic-dashboard>
                  </div>
              </cdk-accordion-item>
             </cdk-accordion>`,
        icon: 'pi pi-server',
        inputProps: this.accordionProps,
        inputs: this.accordionInputs,
        nestedComponents: [],
        allowedChildren: ['ACCORDION-AREA'],
        onDrop: this.dropAccordion.bind(this)
      },
      {
        group: 'CONTAINER',
        toolId: 1005,
        name: 'ACCORDION-AREA',
        tag: ``,
        icon: '',
        inputProps: this.accordionAreaProps,
        inputs: this.accordionAreaInputs,
        hide: true,
        nestedComponents: [],
        onDrop: null
      }
    ];

    this.availableTools = this.availableTools.concat(MetadataProviderService.customDesignerTools);

    this.resetHistory();
  }

  /**
   * Inizializza il designer:
   * costruisce il menu principale (`dashMenus`), allinea le azioni toolbar,
   * carica eventuale dashboard da route URL (`/:route/dashboard`) in modalita no-edit
   * oppure ricarica la lista dashboard salvate.
   */
  async ngOnInit() {
    this.lastKnownHashRoute = String(window?.location?.hash || '');
    this.refreshAvailableProjectCssClasses();

    let menus = [];

    menus = [
      {
        label: this.trslSrv.instant('new'),
        command: (x) => {
          this.clearDashboard();
        }
      },
      {
        label: this.trslSrv.instant('save'),
        command: (x) => {
          this.saveDashboard();
        }
      },
      {
        label: this.trslSrv.instant('load')
      },
      {
        label: this.t('designer.css', 'CSS'),
        command: () => {
          this.openCssSheetEditor();
        }
      }
    ];

    this.dashMenus = menus;
    this.refreshGraphActionsMenuItems();

    // Subscribe to route param changes so navigating between
    // /:route/dashboard URLs reloads the dashboard (e.g. sasa/dashboard → master-det/dashboard).
    // Using paramMap observable instead of snapshot ensures the component reacts
    // when Angular reuses the same instance for a different :route value.
    this._routeParamSub = this.route.paramMap.subscribe(async (params) => {
      const routeDashboard = params.get('route');
      if (routeDashboard) {
        this.noEdit = true;
        this.setDesignerEditModeClass(false);
        await this.loadDashboard({ board_route: routeDashboard });
      } else {
        this.noEdit = false;
        this.setDesignerEditModeClass(true);
        this.reloadDashboards();
      }
    });

    // Capture-phase mouseup/touchend listeners for post-gesture history commit.
    //
    // Why capture phase instead of the @HostListener('window:mouseup') above?
    // `NgxDraggableDomDirective` attaches a BUBBLE-phase mouseup listener on
    // `document` that calls `event.stopImmediatePropagation()` (see
    // directive/ngx-draggable-dom.directive.ts onMouseUp), which kills every
    // window-level bubble listener — including our HostListener. So dropping a
    // dragged div never reached `onWindowMouseup` and the history commit was
    // skipped.
    //
    // A capture-phase listener fires BEFORE the bubble phase, so it runs even
    // if something downstream stops propagation. We still keep the HostListener
    // path: the commit helper consumes the timestamp (sets it to 0), so the
    // listener that fires first commits, and any subsequent call no-ops.
    this._designerGestureMouseUp = this.commitHistoryAfterDesignerGestureIfNeeded.bind(this);
    document.addEventListener('mouseup', this._designerGestureMouseUp, true);
    document.addEventListener('touchend', this._designerGestureMouseUp, true);
  }

  ngOnDestroy(): void {
    this._routeParamSub?.unsubscribe();
    if (this._designerGestureMouseUp) {
      document.removeEventListener('mouseup', this._designerGestureMouseUp, true);
      document.removeEventListener('touchend', this._designerGestureMouseUp, true);
      this._designerGestureMouseUp = undefined;
    }
    this.clearHierarchyHoverHighlight();
    this.clearFooterHoverHighlight();
    this.setDesignerEditModeClass(false);
  }

  /**
   * Handler capture-phase per mouseup/touchend su document. Riferimento
   * conservato per poter fare `removeEventListener` in `ngOnDestroy` (bind
   * produce una funzione diversa a ogni chiamata quindi va memorizzata).
   */
  private _designerGestureMouseUp?: (event?: Event) => void;

  @HostListener('window:hashchange')
  async onWindowHashChange(): Promise<void> {
    const nextHash = String(window?.location?.hash || '');
    const previousHash = this.lastKnownHashRoute;

    if (this.suppressNextHashGuard) {
      this.lastKnownHashRoute = nextHash;
      return;
    }

    if (nextHash === previousHash) {
      return;
    }

    if (!this.hasDashboardPendingChanges()) {
      this.lastKnownHashRoute = nextHash;
      return;
    }

    const proceed = await this.confirmNavigationWithPendingChanges();
    if (proceed) {
      this.lastKnownHashRoute = nextHash;
      return;
    }

    this.suppressNextHashGuard = true;
    window.location.hash = previousHash || '#/';
    setTimeout(() => {
      this.suppressNextHashGuard = false;
      this.lastKnownHashRoute = String(window?.location?.hash || '');
    }, 0);
  }

  @HostListener('window:beforeunload', ['$event'])
  onWindowBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasDashboardPendingChanges()) {
      return;
    }

    event.preventDefault();
    event.returnValue = '';
  }

  /**
   * Usato dal canDeactivate guard su route dashboard per bloccare navigazione menu/route
   * in presenza di modifiche pendenti sui datasource renderizzati in dashboard.
   */
  public async confirmNavigationWithPendingChanges(): Promise<boolean> {
    const pendingDatasources = this.getDashboardDatasourcesForPendingChanges().filter((ds: any) =>
      typeof ds?.hasPendingChanges === 'function' && ds.hasPendingChanges()
    );

    if (!pendingDatasources.length) {
      return true;
    }

    for (const datasource of pendingDatasources) {
      if (typeof (datasource as any)?.confirmProceedWithPendingChanges === 'function') {
        const canProceed = await (datasource as any).confirmProceedWithPendingChanges('navigate');
        if (!canProceed) {
          return false;
        }
      }
    }

    return true;
  }

  private hasDashboardPendingChanges(): boolean {
    return this.getDashboardDatasourcesForPendingChanges().some((ds: any) =>
      typeof ds?.hasPendingChanges === 'function' && ds.hasPendingChanges()
    );
  }

  private getDashboardDatasourcesForPendingChanges(): DataSourceComponent[] {
    const out = new Set<DataSourceComponent>();

    const pushDs = (candidate: any) => {
      if (candidate instanceof DataSourceComponent) {
        out.add(candidate);
        return;
      }
      if (candidate instanceof BehaviorSubject && candidate.value instanceof DataSourceComponent) {
        out.add(candidate.value);
        return;
      }
      if (candidate?.component instanceof DataSourceComponent) {
        out.add(candidate.component);
        return;
      }
      if (candidate?.component?.value instanceof DataSourceComponent) {
        out.add(candidate.component.value);
      }
    };

    (Array.isArray(this.dashboardComponents) ? this.dashboardComponents : []).forEach((entry: any) => {
      pushDs(entry);
      pushDs(entry?.component);
    });

    const allTools = [
      ...(Array.isArray(this.flattenedDashboardElements) ? this.flattenedDashboardElements : []),
      ...(Array.isArray(this.dashboardElements) ? this.dashboardElements : [])
    ];

    allTools.forEach((tool: any) => {
      if (tool?.name === 'DATASOURCE') {
        const componentRef = this.unwrapBehaviorSubjectValue(tool?.inputs?.['componentRef']);
        pushDs(componentRef);
      }

      const resolved = this.resolveDesignerToolDatasource(tool);
      pushDs(resolved);
    });

    return Array.from(out);
  }

  ngDoCheck(): void {
    this.refreshHierarchyTreeState();
    this.syncHierarchySelectionToCurrentTool();
  }

  private setDesignerEditModeClass(enabled: boolean): void {
    if (typeof document === 'undefined' || !document.body) {
      return;
    }

    const className = 'wuic-designer-edit-mode';
    if (enabled) {
      document.body.classList.add(className);
    } else {
      document.body.classList.remove(className);
    }
  }

  /**
   * Ricostruisce il catalogo classi CSS disponibili nel designer partendo da:
   * 1) stylesheet runtime presenti nel DOM,
   * 2) classi parse-ate dai fogli collegati al dashboard (`dashboardCssSheets`).
   * Scarta bundle hashati Angular e classi framework (`p-*`, `pi-*`, `ng-*`, `cdk-*`).
   */
  private refreshAvailableProjectCssClasses() {
    if (typeof document === 'undefined') {
      this.availableProjectCssFiles = [''];
      this.availableProjectCssClassByFile = {};
      return;
    }

    const fileClassMap: { [file: string]: Set<string> } = {};
    const ensureBucket = (file: string) => {
      if (!fileClassMap[file]) {
        fileClassMap[file] = new Set<string>();
      }
      return fileClassMap[file];
    };

    const resolveFileName = (sheet: CSSStyleSheet): string => {
      const href = (sheet as any)?.href as string | null;
      if (!href) {
        return '';
      }
      try {
        const urlObj = new URL(href, document.baseURI);
        const cleanedPath = String(urlObj.pathname || '').replace(/\\/g, '/');
        const assetsIdx = cleanedPath.toLowerCase().indexOf('/assets/');
        if (assetsIdx >= 0) {
          // Keep relative assets path (e.g. assets/my-dash/file.css) to avoid collisions.
          return cleanedPath.substring(assetsIdx + 1);
        }

        const parts = cleanedPath.split('/');
        return parts[parts.length - 1] || cleanedPath;
      } catch {
        return href;
      }
    };

    const shouldExcludeFile = (file: string): boolean => {
      const normalized = String(file || '').trim().toLowerCase();
      if (!normalized) {
        return true;
      }

      const baseName = normalized.split('/').pop() || normalized;

      // Angular/runtime generated hashed css bundles (not useful in designer picker)
      if (/^[a-f0-9]{40,}\.css$/.test(baseName)) {
        return true;
      }

      return false;
    };

    const collectFromRule = (rule: CSSRule) => {
      const cssStyleRule = rule as CSSStyleRule;
      const selectorText = cssStyleRule?.selectorText;
      if (selectorText) {
        const matches: string[] = selectorText.match(/\.-?[_a-zA-Z]+[_a-zA-Z0-9-]*/g) ?? [];
        matches.forEach((m) => {
          const cls = m.slice(1).trim();
          if (!cls) return;
          if (cls.startsWith('p-') || cls.startsWith('pi-') || cls.startsWith('ng-') || cls.startsWith('cdk-')) return;
          const currentFile = (collectFromRule as any).__file || '';
          if (!currentFile) return;
          ensureBucket(currentFile).add(cls);
        });
      }

      const grouping = rule as CSSGroupingRule;
      const nested = grouping?.cssRules;
      if (nested?.length) {
        Array.from(nested).forEach((nestedRule) => collectFromRule(nestedRule));
      }
    };

    Array.from(document.styleSheets || []).forEach((sheet) => {
      try {
        const file = resolveFileName(sheet as CSSStyleSheet);
        if (!file || shouldExcludeFile(file)) {
          return;
        }
        (collectFromRule as any).__file = file;
        ensureBucket(file);
        const rules = sheet.cssRules || [];
        Array.from(rules).forEach((rule) => collectFromRule(rule));
      } catch {
        // Cross-origin stylesheets may not expose cssRules.
      }
    });

    (this.dashboardCssSheets || []).forEach((sheet) => {
      const file = this.normalizeSheetPath(sheet?.SheetPath);
      if (!file) {
        return;
      }

      ensureBucket(file);
      (sheet?.classes || []).forEach((cssClass) => {
        const candidates: string[] = [];
        if (Array.isArray(cssClass?.ClassNames) && cssClass.ClassNames.length) {
          candidates.push(...cssClass.ClassNames);
        } else {
          const selector = String(cssClass?.SelectorString || '').trim();
          const selectorMatches: string[] = selector.match(/\.-?[_a-zA-Z]+[_a-zA-Z0-9-]*/g) ?? [];
          selectorMatches.forEach((m) => candidates.push(m.slice(1)));
        }

        candidates
          .map((x) => String(x || '').trim())
          .filter((x) => !!x)
          .forEach((cls) => ensureBucket(file).add(cls));
      });
    });

    this.availableProjectCssClassByFile = Object.keys(fileClassMap).reduce((acc, file) => {
      acc[file] = [''].concat(Array.from(fileClassMap[file]).sort((a, b) => a.localeCompare(b)));
      return acc;
    }, {} as { [file: string]: string[] });
    this.availableProjectCssFiles = [''].concat(Object.keys(this.availableProjectCssClassByFile).sort((a, b) => a.localeCompare(b)));

    if (this.htmlInputProperties?.['cssFile']) {
      this.htmlInputProperties['cssFile'].values = this.availableProjectCssFiles;
    }
    if (this.htmlInputProperties?.['cssClass']) {
      this.htmlInputProperties['cssClass'].values = [''];
    }
  }

  /**
   * Apre il popup editor fogli CSS associati al dashboard corrente.
   */
  openCssSheetEditor(): void {
    this.showCssSheetEditor = true;
  }

  /**
   * Sincronizza la visibilita del popup CSS; in chiusura resetta il foglio selezionato.
   */
  onCssSheetEditorVisibleChange(visible: boolean): void {
    this.showCssSheetEditor = visible;
    if (!visible) {
      this.selectedCssEditorSheetPath = '';
    }
  }

  /**
   * Restituisce l'elenco proprieta stile editabili nel popup CSS
   * filtrando `htmlInputProperties` sui tipi supportati.
   */
  getCssEditorStyleProps(): { key: string; type: string; values?: string[]; }[] {
    return Object.keys(this.htmlInputProperties || {})
      .filter((key) => key !== 'cssFile' && key !== 'cssClass')
      .map((key) => ({
        key: key,
        type: this.htmlInputProperties[key]?.type,
        values: this.htmlInputProperties[key]?.values
      }))
      .filter((x) => x.type === 'string' || x.type === 'color' || x.type === 'dictionary');
  }

  /**
   * Applica le modifiche provenienti dal popup CSS:
   * normalizza i fogli, verifica che il dashboard sia persistito,
   * salva i file CSS lato server e aggiorna link/style cache locali.
   */
  async onCssSheetEditorApply(event: { sheets: any[]; selectedSheetPath: string; }): Promise<void> {
    const previousSheets = this.dashboardCssSheets;
    const previousSelectedSheetPath = this.selectedCssEditorSheetPath;

    this.dashboardCssSheets = (event?.sheets || []).map((sheet) => this.normalizeCssSheet(sheet));
    this.selectedCssEditorSheetPath = this.normalizeSheetPath(event?.selectedSheetPath);

    const canPersist = await this.ensureDashboardSavedBeforeCssLink();
    if (!canPersist) {
      this.dashboardCssSheets = previousSheets;
      this.selectedCssEditorSheetPath = previousSelectedSheetPath;
      this.refreshAvailableProjectCssClasses();
      return;
    }

    for (const sheet of this.dashboardCssSheets) {
      await this.dataSrv.writeChangesToCssFile(sheet);
    }

    const sheetPaths = this.dashboardCssSheets.map((x) => this.normalizeSheetPath(x?.SheetPath)).filter((x) => !!x);
    this.ensureDashboardCssLinks(sheetPaths);
    this.refreshAvailableProjectCssClasses();
    await this.persistCurrentDashboardWithoutPrompt();
    WtoolboxService.messageNotificationService.add({
      severity: 'success',
      summary: this.t('success', 'Success'),
      detail: this.t('designer.css_updated_successfully', 'CSS updated successfully')
    });
  }

  /**
   * Garantisce l'esistenza di una route dashboard prima di collegare fogli CSS.
   * Se il dashboard non e ancora salvato, apre prompt nome/route e invoca `saveDashboard`.
   */
  private async ensureDashboardSavedBeforeCssLink(): Promise<boolean> {
    if (this.currentDashboardRoute) {
      return true;
    }

    const resp = await WtoolboxService.promptDialog(this.t('designer.save_dashboard.title', 'Save Dashboard'), [
      {
        name: 'dashboardName',
        caption: this.t('designer.save_dashboard.name_caption', 'Dashboard Name'),
        type: 'text',
        value: '',
        required: true
      },
      {
        name: 'route',
        caption: this.t('designer.save_dashboard.route_caption', 'Dashboard route'),
        type: 'text',
        value: '',
        required: true
      }
      // height=340px: evita lo scroll interno al dialog con 2 campi + footer.
    ], null, "400px", "340px");

    if (!resp) {
      WtoolboxService.messageNotificationService.add({
        severity: 'warn',
        summary: this.t('warning', 'Warning'),
        detail: this.t('designer.save_dashboard_first_to_link_css', 'Save the dashboard first to link CSS sheets')
      });
      return false;
    }

    const dashboardName = resp.dashboardName.value;
    const route = resp.route.value;

    const payload = {
      user_id: this.userInfo.getuserInfo().user_id,
      desc: dashboardName,
      dashRoute: route,
      elements: this.buildSerializedDashboardElements(),
      sheetPaths: this.collectDashboardSheetPaths(),
      designMode: '',
      pwd: ''
    };

    const result = await this.dataSrv.saveDashboard(payload);
    if (!result) {
      WtoolboxService.messageNotificationService.add({
        severity: 'error',
        summary: this.t('error', 'Error'),
        detail: this.t('designer.error_saving_dashboard', 'An error occurred while saving the dashboard')
      });
      return false;
    }

    this.currentDashboardRoute = route;
    this.currentDashboardDescription = dashboardName;
    this.reloadDashboards();
    WtoolboxService.messageNotificationService.add({
      severity: 'success',
      summary: this.t('success', 'Success'),
      detail: this.t('designer.dashboard_saved_successfully', 'Dashboard saved successfully')
    });
    return true;
  }

  /**
   * Serializza il tree `dashboardElements` in JSON persistibile per `dom_board.boardcontent`,
   * eliminando riferimenti runtime non serializzabili (route snapshot, component refs, subject interni).
   */
  private buildSerializedDashboardElements(): string {
    let currentParentProp = null;
    const transientSerializationKeys = new Set([
      '_tView',
      '_declarationTContainer',
      '_injector',
      '_lView',
      '_views',
      'appRef',
      '_zoneDelegate',
      'db',
      'zone',
      'suggestions',
      'nestedSource',
      'editor',
      'validationsRules',
      'blueprint',
      'extraProps'
    ]);

    const serializationFlattened = this.flattenComponentTree(this.dashboardElements);
    serializationFlattened.forEach((element) => {
      if (element.name == 'DATASOURCE') {
        const componentRef = element?.inputs?.['componentRef']?.value?.component;
        const metaInfoFromRef = componentRef?.value?.metaInfo ?? componentRef?.metaInfo ?? null;
        // Only overwrite metaInfo if we got a live reference; otherwise keep the
        // serialized copy so that undo/redo snapshots preserve the metadata.
        if (metaInfoFromRef) {
          element.inputs['metaInfo'] = metaInfoFromRef;
        }
      }
      // Normalize DATAREPEATER.datasource to a lightweight {uniqueName, component}
      // before serialization. Ensures uniqueName survives JSON round-trip.
      if (element.name === 'DATAREPEATER' || element.name === 'SELECT' || element.name === 'MULTISELECT' || element.name === 'UL') {
        const dsInput = element.inputs?.['datasource'];
        if (dsInput && typeof dsInput === 'object' && !(dsInput instanceof BehaviorSubject)) {
          // Case 1: full DS element (has inputs) — reduce to lightweight ref
          if (dsInput.uniqueName && dsInput.inputs) {
            element.inputs['datasource'] = {
              uniqueName: dsInput.uniqueName,
              component: dsInput.component ?? null
            };
          }
          // Case 2: already lightweight but missing uniqueName — recover from tree
          if (!dsInput.uniqueName && dsInput.component) {
            const firstDs = serializationFlattened.find((e: any) => e.name === 'DATASOURCE');
            if (firstDs?.uniqueName) {
              dsInput.uniqueName = firstDs.uniqueName;
            }
          }
        }
      }
    });

    return WtoolboxService.safeStringify(this.dashboardElements, function (key, value) {
      if (value instanceof UrlSegmentGroup || value instanceof UrlTree || value instanceof ActivatedRouteSnapshot || value instanceof RouterStateSnapshot || value instanceof RouterState || value instanceof ActivatedRoute || value instanceof SafeSubscriber || transientSerializationKeys.has(key)) {
        return null;
      }

      if (key == 'component' && (currentParentProp == 'componentRef' || currentParentProp == 'datasource' || currentParentProp == 'parentDatasource')) {
        return null;
      }
      // Also null-out live DataSourceComponent instances nested deeper in the tree
      // (e.g. DATAREPEATER.inputs.datasource.component) where currentParentProp
      // tracking loses context due to JSON.stringify's sequential key visitation.
      // The value may be the component directly OR a BehaviorSubject wrapping it.
      if (key === 'component' && value && typeof value === 'object') {
        const inner = (value instanceof BehaviorSubject) ? value.value : value;
        if (inner && typeof inner === 'object' && ('fetchInfo$' in inner || '__ngContext__' in inner)) {
          return null;
        }
      }

      currentParentProp = key;

      if (value instanceof BehaviorSubject) {
        return value.value === undefined ? null : value.value;
      }

      return value;
    });
  }

  /**
   * Persiste il dashboard corrente senza prompt utente,
   * riusando route/descrizione correnti e il payload serializzato degli elementi.
   */
  private async persistCurrentDashboardWithoutPrompt(): Promise<void> {
    if (!this.currentDashboardRoute) {
      return;
    }

    const payload = {
      user_id: this.userInfo.getuserInfo().user_id,
      desc: this.currentDashboardDescription || this.currentDashboardRoute,
      dashRoute: this.currentDashboardRoute,
      elements: this.buildSerializedDashboardElements(),
      sheetPaths: this.collectDashboardSheetPaths(),
      designMode: '',
      pwd: ''
    };

    await this.dataSrv.saveDashboard(payload);
  }

  /**
   * Normalizza un path CSS in formato slash `/` e trim.
   */
  private normalizeSheetPath(path: any): string {
    return String(path || '').trim().replace(/\\/g, '/');
  }

  /**
   * Normalizza il payload foglio CSS (path, selector, class names, key/value style)
   * nel formato atteso da salvataggio e binding UI.
   */
  private normalizeCssSheet(sheet: any): any {
    return {
      SheetPath: this.normalizeSheetPath(sheet?.SheetPath),
      classes: (sheet?.classes || []).map((cssClass) => ({
        SelectorString: String(cssClass?.SelectorString || '').trim(),
        ClassNames: Array.isArray(cssClass?.ClassNames)
          ? cssClass.ClassNames.map((c) => String(c || '').trim()).filter((c) => !!c)
          : [],
        Media: String(cssClass?.Media || '').trim(),
        Styles: (cssClass?.Styles || []).map((style) => ({
          Key: String(style?.Key || '').trim(),
          Value: String(style?.Value || '').trim()
        })).filter((style) => !!style.Key)
      }))
    };
  }

  /**
   * Sincronizza i tag `<link>` dei fogli dashboard in `<head>`:
   * rimuove link obsoleti, aggiunge/aggiorna quelli correnti con cache-busting
   * e fallback opzionale su base URL backend (`global_root_url`).
   */
  private ensureDashboardCssLinks(sheetPaths: string[]): void {
    if (typeof document === 'undefined') {
      return;
    }

    // Filter out placeholder defaults (`styles.css` bare filename) and any
    // bare-filename path that isn't anchored to an assets/ folder. These are
    // defaults set on the tool metadata (see `this.htmlInputs.cssFile =
    // 'styles.css'` at the top of the component) which the user never
    // overrode with a real CSS file. Emitting a `<link>` for them 404s on
    // both the frontend origin and the backend fallback, producing noisy
    // console errors in dev/E2E without any functional impact.
    const isPlaceholderPath = (p: string): boolean => {
      if (!p) return true;
      const lower = p.toLowerCase();
      // Single-segment, no `assets/` prefix → treat as placeholder.
      const stripped = lower.replace(/^\/+/, '');
      if (stripped === 'styles.css') return true;
      if (!stripped.includes('/') && stripped.endsWith('.css')) return true;
      return false;
    };
    const normalized = Array.from(new Set(
      (sheetPaths || [])
        .map((x) => this.normalizeSheetPath(x))
        .filter((x) => !!x && !isPlaceholderPath(x))
    ));
    const head = document.head;
    const existingLinks = Array.from(head.querySelectorAll('link[data-wuic-dashboard-sheet="true"]')) as HTMLLinkElement[];
    const keepSet = new Set(normalized.map((x) => x.toLowerCase()));
    const resolveStaticBaseUrl = (): string => {
      try {
        // In designer/ng-serve scenarios css assets are served by the current frontend origin.
        return WtoolboxService.appSettings?.file_path;
      } catch {
        return window.location.origin;
      }
    };
    const resolveBackendStaticBaseUrl = (): string => {
      try {
        const raw = WtoolboxService.appSettings?.file_path;
        if (!raw) {
          return '';
        }

        const url = new URL(raw, window.location.origin);
        const apiIndex = url.pathname.toLowerCase().indexOf('/api/');
        let staticPath = apiIndex >= 0 ? url.pathname.substring(0, apiIndex) : url.pathname;
        if (!staticPath.endsWith('/')) {
          staticPath += '/';
        }
        return `${url.origin}${staticPath}`;
      } catch {
        return '';
      }
    };
    const buildCssHref = (baseUrl: string, relativePath: string): string => {
      const baseUrlObj = new URL(baseUrl || window.location.origin, window.location.origin);
      const basePath = baseUrlObj.pathname.toLowerCase();
      let resolvedRelativePath = relativePath;
      if (basePath.endsWith('/assets/') && resolvedRelativePath.toLowerCase().startsWith('assets/')) {
        resolvedRelativePath = resolvedRelativePath.substring('assets/'.length);
      }

      const urlObj = new URL(resolvedRelativePath, baseUrlObj.toString());
      urlObj.hash = '';
      urlObj.searchParams.set('x', Date.now().toString());
      return urlObj.toString();
    };
    const staticBaseUrl = resolveStaticBaseUrl();
    const backendStaticBaseUrl = resolveBackendStaticBaseUrl();

    existingLinks.forEach((linkEl) => {
      const path = this.normalizeSheetPath(linkEl.getAttribute('data-sheet-path') || '');
      if (!keepSet.has(path.toLowerCase())) {
        linkEl.remove();
      }
    });

    normalized.forEach((path) => {
      const match = existingLinks.find((l) => this.normalizeSheetPath(l.getAttribute('data-sheet-path') || '').toLowerCase() === path.toLowerCase());
      const normalizedRelativePath = path.replace(/^\/+/, '');
      let normalizedHref = normalizedRelativePath;
      let fallbackHref = '';
      try {
        normalizedHref = buildCssHref(staticBaseUrl, normalizedRelativePath);
        if (backendStaticBaseUrl) {
          const backendHref = buildCssHref(backendStaticBaseUrl, normalizedRelativePath);
          if (backendHref !== normalizedHref) {
            fallbackHref = backendHref;
          }
        }
      } catch {
        normalizedHref = normalizedRelativePath;
      }
      const cacheBustedHref = normalizedHref;
      const attachFallback = (el: HTMLLinkElement) => {
        if (!fallbackHref) {
          el.onerror = null;
          el.removeAttribute('data-fallback-href');
          return;
        }

        el.setAttribute('data-fallback-href', fallbackHref);
        el.onerror = () => {
          const fb = el.getAttribute('data-fallback-href');
          const switched = el.getAttribute('data-fallback-used') === 'true';
          if (!fb || switched) {
            return;
          }
          el.setAttribute('data-fallback-used', 'true');
          el.setAttribute('href', fb);
        };
      };
      if (match) {
        match.removeAttribute('data-fallback-used');
        match.setAttribute('href', cacheBustedHref);
        attachFallback(match);
        return;
      }

      const linkEl = document.createElement('link');
      linkEl.setAttribute('rel', 'stylesheet');
      linkEl.setAttribute('href', cacheBustedHref);
      linkEl.setAttribute('data-wuic-dashboard-sheet', 'true');
      linkEl.setAttribute('data-sheet-path', path);
      attachFallback(linkEl);
      head.appendChild(linkEl);
    });
  }

  /**
   * Compone i path fogli CSS da persistere unendo:
   * - fogli gestiti dal popup (`dashboardCssSheets`)
   * - eventuali `cssFile` usati nei componenti del tree.
   */
  private collectDashboardSheetPaths(): string[] {
    const fromCssEditor = (this.dashboardCssSheets || []).map((sheet) => this.normalizeSheetPath(sheet?.SheetPath));
    const fromTools = this.flattenComponentTree(this.dashboardElements || [])
      .map((element) => this.normalizeSheetPath(element?.inputs?.['cssFile']))
      .filter((x) => !!x);
    return Array.from(new Set(fromCssEditor.concat(fromTools).filter((x) => !!x)));
  }

  /**
   * Estrae i fogli CSS associati da payload backend legacy/nuovo:
   * `domBoardSheets`, `sheetPaths` nei risultati e `sheetPaths` nel record dashboard.
   */
  private extractDashboardSheetPaths(resultRows: any[], dashboard: any): string[] {
    const firstRow = resultRows?.[0] || {};
    const legacyPaths: string[] = [];

    const rowSheets = firstRow?.domBoardSheets || firstRow?.domboardsheets || [];
    if (Array.isArray(rowSheets)) {
      rowSheets.forEach((sheet) => {
        const path = this.normalizeSheetPath(sheet?.sheetPath ?? sheet?.SheetPath);
        if (path) {
          legacyPaths.push(path);
        }
      });
    }

    const directRowPaths = Array.isArray(firstRow?.sheetPaths) ? firstRow.sheetPaths : [];
    directRowPaths.forEach((path) => {
      const normalized = this.normalizeSheetPath(path);
      if (normalized) {
        legacyPaths.push(normalized);
      }
    });

    const dashboardPaths = Array.isArray(dashboard?.sheetPaths) ? dashboard.sheetPaths : [];
    dashboardPaths.forEach((path) => {
      const normalized = this.normalizeSheetPath(path);
      if (normalized) {
        legacyPaths.push(normalized);
      }
    });

    return Array.from(new Set(legacyPaths));
  }

  /**
   * Carica classi CSS dai fogli passati e aggiorna stato editor/link runtime.
   * Se la lista e vuota, pulisce completamente lo stato CSS del dashboard.
   */
  private async loadDashboardCssSheets(sheetPaths: string[]): Promise<void> {
    const paths = Array.from(new Set((sheetPaths || []).map((x) => this.normalizeSheetPath(x)).filter((x) => !!x)));
    if (!paths.length) {
      this.dashboardCssSheets = [];
      this.selectedCssEditorSheetPath = '';
      this.ensureDashboardCssLinks([]);
      this.refreshAvailableProjectCssClasses();
      return;
    }

    const sheets = await this.dataSrv.getCssClassesFromSheets(paths);
    this.dashboardCssSheets = (sheets || []).map((sheet) => this.normalizeCssSheet(sheet));
    this.selectedCssEditorSheetPath = this.dashboardCssSheets[0]?.SheetPath || '';
    this.ensureDashboardCssLinks(paths);
    this.refreshAvailableProjectCssClasses();
  }

  /**
   * Restituisce le classi selezionabili per il `cssFile` correntemente scelto nel tool.
   */
  getCssClassOptionsForTool(tool: DesignerTool | null | undefined): string[] {
    const cssFile = String(tool?.inputs?.['cssFile'] || '').trim();
    return (this.availableProjectCssClassByFile[cssFile] || ['']).filter((x) => !!x);
  }

  /**
   * Aggiorna il file CSS del tool e filtra la selezione classi
   * rimuovendo quelle non presenti nel nuovo file.
   */
  onCssFileChanged(nextFile: string, tool: DesignerTool): void {
    tool.inputs['cssFile'] = nextFile || '';
    const classOptions = this.getCssClassOptionsForTool(tool);
    const currentSelection = this.normalizeCssClassSelection(tool.inputs['cssClass']);
    tool.inputs['cssClass'] = currentSelection.filter((cls) => classOptions.includes(cls));
    this.commitHistoryIfChanged();
  }

  /**
   * Applica al tool la nuova selezione classi CSS normalizzata.
   */
  onCssClassChanged(nextClasses: string[] | string, tool: DesignerTool): void {
    tool.inputs['cssClass'] = this.normalizeCssClassSelection(nextClasses);
    this.commitHistoryIfChanged();
  }

  /**
   * Converte un valore classi (stringa o array) in array pulito e deduplicabile.
   */
  private normalizeCssClassSelection(value: any): string[] {
    if (Array.isArray(value)) {
      return value.map((x) => String(x || '').trim()).filter((x) => !!x);
    }

    const text = String(value || '').trim();
    if (!text) {
      return [];
    }

    return text.split(/\s+/).map((x) => x.trim()).filter((x) => !!x);
  }

  /**
   * Azzera lo stato designer e resetta il dashboard corrente (elementi, CSS, selezione, history).
   */
  clearDashboard() {
    this.dashboardElements = [];
    this.dashboardComponents = [];
    this.flattenedDashboardElements = [];
    this.tool = null;
    this.currentDashboardRoute = '';
    this.currentDashboardDescription = '';
    this.dashboardCssSheets = [];
    this.selectedCssEditorSheetPath = '';
    this.ensureDashboardCssLinks([]);
    this.refreshAvailableProjectCssClasses();
    this.refreshGraphActionsMenuItems();
    this.resetHistory();
  }

  /**
   * Ripristina lo snapshot precedente dalla history undo.
   */
  undo(): void {
    console.log(`[UNDO-v9] called. undoLen=${this.undoHistory.length} redoLen=${this.redoHistory.length} applyingHistory=${this.applyingHistory}`);
    if (this.applyingHistory || this.undoHistory.length === 0) {
      console.log(`[UNDO-v9] SKIP`);
      return;
    }
    // Cancel any pending redo rebind timer
    if (this._redoRebindTimer) {
      clearTimeout(this._redoRebindTimer);
      this._redoRebindTimer = undefined;
      console.log(`[UNDO-v9] cancelled redo rebind timer`);
    }
    try {
      const target = this.undoHistory.pop();
      if (this.lastCommittedSnapshot) {
        this.redoHistory.push(this.lastCommittedSnapshot);
      }
      this.lastCommittedSnapshot = target;
      console.log(`[UNDO-v9] applying target. undoLen=${this.undoHistory.length} redoLen=${this.redoHistory.length}`);
      this.applyHistorySnapshot(target, false);
    } catch (err) {
    }
  }

  /**
   * Riapplica lo snapshot successivo dalla history redo.
   */
  redo(): void {
    console.log(`[REDO-v9] called. undoLen=${this.undoHistory.length} redoLen=${this.redoHistory.length} applyingHistory=${this.applyingHistory}`);
    if (this.applyingHistory || this.redoHistory.length === 0) {
      console.log(`[REDO-v9] SKIP`);
      return;
    }
    try {
      const target = this.redoHistory.pop();
      if (this.lastCommittedSnapshot) {
        this.undoHistory.push(this.lastCommittedSnapshot);
      }
      console.log(`[REDO-v9] applying target. undoLen=${this.undoHistory.length} redoLen=${this.redoHistory.length}`);
      this.lastCommittedSnapshot = target;
      this.applyHistorySnapshot(target, true);

      // Re-bind DATAREPEATER→DATASOURCE after redo.
      // Cancel any previous pending rebind (e.g. if user does redo then undo quickly).
      if (this._redoRebindTimer) {
        clearTimeout(this._redoRebindTimer);
      }
      this._redoRebindTimer = setTimeout(() => {
        this._redoRebindTimer = undefined;
        console.log(`[REDO-REBIND-v9] timer fired. redoLen=${this.redoHistory.length} applyingHistory=${this.applyingHistory}`);
        // Skip if user already did undo since the redo
        if (this.redoHistory.length > 0 || this.applyingHistory) {
          console.log(`[REDO-REBIND-v9] SKIP`);
          return;
        }
        this.applyingHistory = true;
        try {
          const liveFlat = this.flattenedDashboardElements || [];
          liveFlat.forEach((el) => {
            if (el?.name === 'DATASOURCE') {
              const cr = el?.inputs?.['componentRef'];
              const crVal = (cr instanceof BehaviorSubject) ? cr.value : cr;
              const liveComp = crVal?.component instanceof BehaviorSubject
                ? crVal.component.value : crVal?.component;
              if (liveComp) {
                liveFlat.forEach((dr) => {
                  if (dr?.name === 'DATAREPEATER' || dr?.name === 'SELECT' || dr?.name === 'MULTISELECT' || dr?.name === 'UL') {
                    const dsRef = dr?.inputs?.['datasource'];
                    if (dsRef?.uniqueName === el.uniqueName && dsRef?.component instanceof BehaviorSubject) {
                      dsRef.component.next(liveComp);
                    }
                  }
                });
                if (liveComp.fetchData) {
                  liveComp.fetchData();
                }
              }
            }
          });
          this.cd.detectChanges();
        } finally {
          this.applyingHistory = false;
          this._lastHistoryApplyTime = Date.now();
        }
      }, 1000) as any;
    } catch (err) {
      // redo error — ignore
    }
  }

  @HostListener('window:keydown', ['$event'])
  /**
   * Gestisce shortcut globali undo/redo (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y`)
   * quando il focus non e su campi di input.
   */
  onWindowKeydown(event: KeyboardEvent): void {
    if (this.noEdit || !event) {
      return;
    }

    if (this.isTypingTarget(event.target)) {
      return;
    }

    const ctrlOrMeta = !!event.ctrlKey || !!event.metaKey;
    if (!ctrlOrMeta) {
      return;
    }

    const key = String(event.key || '').toLowerCase();
    if (key === 'z' && event.shiftKey) {
      event.preventDefault();
      this.redo();
      return;
    }

    if (key === 'z') {
      event.preventDefault();
      this.undo();
      return;
    }

    if (key === 'y') {
      event.preventDefault();
      this.redo();
    }
  }

  @HostListener('window:mouseup')
  /**
   * Chiude transazioni history pendenti da color picker al rilascio mouse e
   * committa la history se l'utente ha appena terminato un drag/resize di un
   * elemento del designer.
   */
  onWindowMouseup(): void {
    if (!this.finalizePendingColorHistory()) {
      // Generic mouseup MUST NOT call commitHistoryIfChanged unconditionally:
      // mouseup fires BEFORE click, so clicking the Undo/Redo button would
      // otherwise commit (clearing redoHistory) before the (click) handler runs.
      //
      // Drag/resize gestures however are NOT captured by any other commit path
      // (onResizing/onMoving in DynamicDashboardTemplateComponent only mutate
      // inputs.width/height/transform without any history hook), so the final
      // size/position would never make it into undoHistory.
      //
      // We resolve the conflict via a "did the user just drag/resize a
      // designer element?" check: onResizing/onMoving stamp a static timestamp
      // each time they fire; here we commit only if that timestamp is fresh,
      // then consume it so unrelated mouseups don't trigger spurious commits.
      this.commitHistoryAfterDesignerGestureIfNeeded();
    }
  }

  @HostListener('window:touchend')
  /**
   * Variante touch: stesso meccanismo di mouseup per supportare drag/resize
   * via touch su designer.
   */
  onWindowTouchend(): void {
    if (!this.finalizePendingColorHistory()) {
      this.commitHistoryAfterDesignerGestureIfNeeded();
    }
  }

  /**
   * Se l'utente ha appena terminato un drag/resize di un elemento del designer
   * (rilevato tramite il timestamp statico aggiornato da `onResizing`/`onMoving`
   * in `DynamicDashboardTemplateComponent`), committa lo snapshot history e
   * consuma il timestamp. La finestra di 1000ms tollera lievi ritardi tra
   * ultimo evento di gesture e mouseup; valori piu bassi rischiavano di
   * mancare commit su gesture brevi su laptop lenti.
   */
  private commitHistoryAfterDesignerGestureIfNeeded(): void {
    const ts = DynamicDashboardTemplateComponent.lastDesignerGestureTimestamp;
    if (!ts) {
      return;
    }
    const elapsed = Date.now() - ts;
    if (elapsed > 1000) {
      // Stale signal (the gesture was much earlier — e.g., the user dragged,
      // released, then later clicked an unrelated button without dragging).
      // Reset so we don't keep checking a never-cleared old timestamp.
      DynamicDashboardTemplateComponent.lastDesignerGestureTimestamp = 0;
      return;
    }
    DynamicDashboardTemplateComponent.lastDesignerGestureTimestamp = 0;
    this.commitHistoryIfChanged();
  }

  @HostListener('window:keyup')
  /**
   * Esegue commit history su modifiche input concluse da tastiera.
   */
  onWindowKeyup(): void {
  }

  @HostListener('window:change')
  /**
   * Esegue commit history su eventi `change` globali dei controlli.
   */
  onWindowChange(): void {
    // Removed commitHistoryIfChanged — change events from inputs during
    // undo/redo rehydration cause spurious commits that clear redoHistory.
    // Commits are already triggered by setValue, drop, mouseup, etc.
  }

  get currentDashboardTitle(): string {
    const route = String(this.currentDashboardRoute || '').trim();
    if (!route) {
      return 'Nuova Dashboard';
    }

    const description = String(this.currentDashboardDescription || '').trim();
    return description || 'Nuova Dashboard';
  }

  /**
   * Forward alla command toolbar "Nuovo".
   */
  onToolbarNewDashboard(): void {
    this.dashMenus?.[0]?.command?.({ item: this.dashMenus?.[0] } as any);
  }

  /**
   * Forward alla command toolbar "Salva".
   */
  onToolbarSaveDashboard(): void {
    this.dashMenus?.[1]?.command?.({ item: this.dashMenus?.[1] } as any);
  }

  /**
   * Forward alla command toolbar "CSS".
   */
  onToolbarOpenCss(): void {
    this.dashMenus?.[3]?.command?.({ item: this.dashMenus?.[3] } as any);
  }

  /**
   * Apre il dialog di riapertura dashboard.
   */
  openReopenDashboardDialog(): void {
    this.reopenDialogSelectedDashboardRoute = null;
    this.reopenDashboardDialogVisible = true;
  }

  /**
   * Chiude il dialog di riapertura senza applicare selezione.
   */
  cancelReopenDashboardDialog(): void {
    this.reopenDashboardDialogVisible = false;
    this.reopenDialogSelectedDashboardRoute = null;
  }

  /**
   * Conferma la dashboard selezionata nel dialog e ne avvia il caricamento.
   */
  async confirmReopenDashboardDialog(): Promise<void> {
    const route = String(this.reopenDialogSelectedDashboardRoute || '').trim();
    if (!route) {
      return;
    }

    const selected = (this.savedDashboardOptions || []).find((x) => String(x.value || '').trim() === route);
    this.cancelReopenDashboardDialog();
    await this.loadDashboard(selected?.info || { board_route: route });
  }

  /**
   * Elimina la dashboard corrente invocando backend `deleteDashboard`.
   * Sul server la cancellazione rimuove `dom_board` e, a cascata logica, `dom_board_element`/`dom_board_sheet`.
   */
  async onToolbarDeleteDashboard(): Promise<void> {
    const route = String(this.currentDashboardRoute || '').trim();
    if (!route) {
      return;
    }

    const ok = await WtoolboxService.confirm({
      header: this.t('warning', 'Warning'),
      message: this.trslSrv.format(
        this.t('designer.delete_dashboard_confirm', "Eliminare definitivamente la dashboard '{1}'?"),
        this.currentDashboardTitle
      ),
      acceptLabel: this.t('delete', 'Delete'),
      rejectLabel: this.t('cancel', 'Cancel')
    });

    if (!ok) {
      return;
    }

    const payload = {
      user_id: this.userInfo.getuserInfo().user_id,
      dashRoute: route
    };

    try {
      const result = await this.dataSrv.deleteDashboard(payload);
      const deleted = !!(result?.deleted || (Number(result?.affected || 0) > 0));
      if (deleted) {
        this.clearDashboard();
        await this.reloadDashboards();
        WtoolboxService.messageNotificationService.add({
          severity: 'success',
          summary: this.t('success', 'Success'),
          detail: this.t('designer.dashboard_deleted_successfully', 'Dashboard deleted successfully')
        });
      } else {
        WtoolboxService.messageNotificationService.add({
          severity: 'warn',
          summary: this.t('warning', 'Warning'),
          detail: this.t('designer.dashboard_not_found_or_already_deleted', 'Dashboard not found or already deleted')
        });
      }
    } catch (error) {
      console.error('Failed to delete dashboard', error);
      WtoolboxService.messageNotificationService.add({
        severity: 'error',
        summary: this.t('error', 'Error'),
        detail: this.t('designer.error_deleting_dashboard', 'An error occurred while deleting the dashboard')
      });
    }
  }

  /**
   * Rigenera il menu azioni rapido del designer (`graphActionsMenuItems`),
   * collegando le entry ai rispettivi handler toolbar (riapri, nuovo, salva,
   * elimina, CSS). Viene invocato:
   * - al bootstrap del component;
   * - ogni volta che l'utente clicca il button "Azioni designer" (handler
   *   nel template chiama `refreshGraphActionsMenuItems()` PRIMA di
   *   `graphActionsMenu.toggle($event)`), cosi' i label sono sempre
   *   ri-tradotti con la lingua corrente — fix 2026-04-23 per il caso in
   *   cui l'utente cambia lingua mentre il popup non e' mai stato aperto
   *   in quella lingua: i `this.t(...)` dei label restavano appiccicati
   *   alla lingua di bootstrap;
   * - dopo `toggleHideDatasourcesInCanvas()` per aggiornare la label/icon
   *   della voce show/hide datasource.
   *
   * Deve essere `public` perche' il template lo invoca direttamente
   * (strictTemplates: true in tsconfig).
   */
  public refreshGraphActionsMenuItems(): void {
    this.graphActionsMenuItems = [
      {
        label: this.t('designer.menu_reopen', 'Riapri'),
        icon: 'pi pi-folder-open',
        command: () => this.openReopenDashboardDialog()
      },
      {
        label: this.t('designer.menu_new', 'Nuovo grafo'),
        icon: 'pi pi-file',
        command: () => this.onToolbarNewDashboard()
      },
      {
        label: this.t('designer.menu_save', 'Salva grafo'),
        icon: 'pi pi-save',
        command: () => this.onToolbarSaveDashboard()
      },
      {
        label: this.t('designer.css', 'CSS'),
        icon: 'pi pi-palette',
        command: () => {
          this.openCssSheetEditor();
        }
      },
      {
        label: this.t('designer.menu_delete', 'Elimina'),
        icon: 'pi pi-trash',
        disabled: !this.currentDashboardRoute,
        command: () => this.onToolbarDeleteDashboard()
      },
      {
        separator: true
      },
      {
        label: this.hideDatasourcesInCanvas
          ? this.t('designer.menu_show_datasources', 'Mostra datasource nel canvas')
          : this.t('designer.menu_hide_datasources', 'Nascondi datasource nel canvas'),
        icon: this.hideDatasourcesInCanvas ? 'pi pi-eye' : 'pi pi-eye-slash',
        command: () => this.toggleHideDatasourcesInCanvas()
      }
    ];
  }

  toggleHideDatasourcesInCanvas(): void {
    this.hideDatasourcesInCanvas = !this.hideDatasourcesInCanvas;
    this.refreshGraphActionsMenuItems();
  }

  get droppedDashboardItems(): DesignerTool[] {
    return (this.flattenedDashboardElements || []).filter((item) => !!item?.uniqueName);
  }

  get hierarchyTreeNodes(): any[] {
    return this.hierarchyTreeNodesState;
  }

  get canUndo(): boolean {
    return this.undoHistory.length > 0;
  }

  get canRedo(): boolean {
    return this.redoHistory.length > 0;
  }

  /**
   * Calcola la label visualizzata per un elemento nel pannello "dropped items".
   */
  getDroppedDashboardItemLabel(item: DesignerTool): string {
    const displayName = String(item?.displayName || '').trim();
    if (displayName) {
      return displayName;
    }

    const uniqueName = String(item?.uniqueName || '').trim();
    const name = String(item?.name || '').trim();
    if (!uniqueName) {
      return name;
    }

    return name ? `${uniqueName} (${name})` : uniqueName;
  }

  /**
   * Imposta come selezionato l'elemento cliccato nella lista elementi.
   */
  selectDashboardItem(item: DesignerTool): void {
    if (!item) {
      return;
    }

    this.tool = item;
    this.syncHierarchySelectionToCurrentTool();
  }

  showHierarchyNodeContextMenu(event: MouseEvent, node: any, menu: ContextMenu): void {
    event.preventDefault();
    event.stopPropagation();
    const uniqueName = String(node?.key || '').trim();
    this.hierarchyCtxElement = uniqueName ? this.getElementByName(uniqueName) : null;
    menu.show(event);
  }

  onHierarchyNodeSelect(event: any): void {
    const node = event?.node;
    if (!node) {
      return;
    }

    const uniqueName = String(node?.key || '').trim();
    if (!uniqueName) {
      return;
    }

    const item = this.getElementByName(uniqueName);
    if (!item) {
      return;
    }

    this.selectDashboardItem(item);
    this.cd.detectChanges();
  }

  onHierarchyNodeMouseEnter(node: any): void {
    const uniqueName = String(node?.key || '').trim();
    if (!uniqueName) {
      return;
    }

    this.setHierarchyHoverHighlightByKey(uniqueName);
  }

  onHierarchyNodeMouseLeave(): void {
    this.clearHierarchyHoverHighlight();
  }

  isHierarchyNodeSelected(node: any): boolean {
    const nodeKey = String(node?.key || '').trim();
    const selectedKey = String(this.hierarchySelection?.key || '').trim();
    return !!nodeKey && nodeKey === selectedKey;
  }

  setHierarchyHoverHighlightByKey(uniqueName: string): void {
    const key = String(uniqueName || '').trim();
    this.clearHierarchyHoverHighlight();
    if (!key) {
      return;
    }

    const item = this.getElementByName(key);
    if (!item) {
      return;
    }

    this.setFooterHoverHighlight(item);

    if (typeof document === 'undefined') {
      return;
    }

    const footerElement = document.querySelector<HTMLElement>(`.designer-footer-item[data-designer-unique-name="${key}"]`);
    if (footerElement) {
      footerElement.classList.add('designer-tree-hover-target');
      this.hierarchyHoverFooterElement = footerElement;
    }
  }

  clearHierarchyHoverHighlight(): void {
    if (this.hierarchyHoverFooterElement) {
      this.hierarchyHoverFooterElement.classList.remove('designer-tree-hover-target');
      this.hierarchyHoverFooterElement = null;
    }
    this.clearFooterHoverHighlight();
  }

  onHierarchyNodeDrop(event: any): void {
    const draggedUniqueName = String(event?.dragNode?.key || '').trim();
    const dropUniqueName = String(event?.dropNode?.key || '').trim();
    if (!draggedUniqueName) {
      return;
    }

    this.moveComponentInHierarchy(draggedUniqueName, dropUniqueName || null, event?.index);
  }

  setFooterHoverHighlight(item: DesignerTool): void {
    const uniqueName = String(item?.uniqueName || '').trim();
    this.clearFooterHoverHighlight();
    if (!uniqueName || typeof document === 'undefined') {
      return;
    }

    this.activateTabPanelForHover(item);

    const target = this.resolveFooterHoverDomTarget(item);
    if (!target) {
      return;
    }

    const visualTarget = this.resolveFooterHoverVisualTarget(target);
    const targets: HTMLElement[] = [target];
    if (visualTarget && visualTarget !== target) {
      targets.push(visualTarget);
    }

    targets.forEach((el) => el.classList.add('designer-footer-hover-target'));
    this.footerHoverTargetElements = targets;
    this.renderFooterHoverOverlay(visualTarget || target);
  }

  clearFooterHoverHighlight(): void {
    (this.footerHoverTargetElements || []).forEach((el) => {
      el?.classList?.remove('designer-footer-hover-target');
    });
    this.footerHoverTargetElements = [];
    if (this.footerHoverOverlayElement) {
      this.footerHoverOverlayElement.remove();
      this.footerHoverOverlayElement = null;
    }
    if (this.footerHoverTabPanelPreviousSelection.length > 0) {
      this.footerHoverTabPanelPreviousSelection.forEach((entry) => {
        if (entry?.panel?.inputs) {
          entry.panel.inputs.selected = !!entry.selected;
        }
      });
      this.footerHoverTabPanelPreviousSelection = [];
      this.cd.detectChanges();
    }
  }

  private activateTabPanelForHover(item: DesignerTool): void {
    if (String(item?.name || '').toUpperCase() !== 'TABPANEL') {
      return;
    }

    const panelUniqueName = String(item?.uniqueName || '').trim();
    if (!panelUniqueName) {
      return;
    }

    const tabViewItem = (this.flattenedDashboardElements || []).find((x: any) =>
      String(x?.name || '').toUpperCase() === 'TABVIEW'
      && Array.isArray(x?.nestedComponents)
      && x.nestedComponents.some((n: any) => String(n?.uniqueName || '') === panelUniqueName)
    ) as any;

    if (!tabViewItem || !Array.isArray(tabViewItem?.nestedComponents)) {
      return;
    }

    this.footerHoverTabPanelPreviousSelection = tabViewItem.nestedComponents.map((panel: any) => ({
      panel,
      selected: !!panel?.inputs?.selected
    }));

    tabViewItem.nestedComponents.forEach((panel: any) => {
      if (!panel?.inputs) {
        panel.inputs = {};
      }
      panel.inputs.selected = String(panel?.uniqueName || '') === panelUniqueName;
    });

    this.cd.detectChanges();
  }

  private resolveFooterHoverVisualTarget(root: HTMLElement): HTMLElement {
    const candidates = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 12 && r.height > 12;
      })
      .sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return (rb.width * rb.height) - (ra.width * ra.height);
      });

    return candidates[0] || root;
  }

  private resolveFooterHoverDomTarget(item: DesignerTool): HTMLElement | null {
    const uniqueName = String(item?.uniqueName || '').trim();
    if (!uniqueName || typeof document === 'undefined') {
      return null;
    }

    if (String(item?.name || '').toUpperCase() === 'TABPANEL') {
      const tabPanelTarget = this.resolveTabPanelHoverTarget(item);
      if (tabPanelTarget) {
        return tabPanelTarget;
      }
    }

    const byId = document.getElementById(uniqueName);
    if (byId) {
      const rect = byId.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return byId;
      }
    }

    const byTitle = document.querySelector<HTMLElement>(`[title="${uniqueName}"]`);
    if (byTitle) {
      const rect = byTitle.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return byTitle;
      }
    }

    return null;
  }

  private resolveTabPanelHoverTarget(item: DesignerTool): HTMLElement | null {
    const panelUniqueName = String(item?.uniqueName || '').trim();
    if (!panelUniqueName) {
      return null;
    }

    const panelDom = document.getElementById(panelUniqueName)
      || document.querySelector<HTMLElement>(`[title="${panelUniqueName}"]`);
    if (panelDom) {
      const tabViewDom = panelDom.closest('p-tabview, .p-tabview, [data-pc-name="tabview"]') as HTMLElement | null;
      const panelsFromClosest = tabViewDom?.querySelector<HTMLElement>('.p-tabview-panels');
      if (panelsFromClosest) {
        return panelsFromClosest;
      }
    }

    const tabViewItem = (this.flattenedDashboardElements || []).find((x: any) =>
      String(x?.name || '').toUpperCase() === 'TABVIEW'
      && Array.isArray(x?.nestedComponents)
      && x.nestedComponents.some((n: any) => String(n?.uniqueName || '') === panelUniqueName)
    ) as any;

    if (!tabViewItem) {
      return null;
    }

    const tabViewUniqueName = String(tabViewItem?.uniqueName || '').trim();
    if (!tabViewUniqueName) {
      return null;
    }

    const tabViewHost = document.getElementById(tabViewUniqueName)
      || document.querySelector<HTMLElement>(`[title="${tabViewUniqueName}"]`);
    if (!tabViewHost) {
      return null;
    }

    const panelsContainer = tabViewHost.querySelector<HTMLElement>('.p-tabview-panels');
    if (panelsContainer) {
      return panelsContainer;
    }

    const nested = Array.isArray(tabViewItem?.nestedComponents) ? tabViewItem.nestedComponents : [];
    const panelIndex = nested.findIndex((n: any) => String(n?.uniqueName || '') === panelUniqueName);
    if (panelIndex < 0) {
      return tabViewHost;
    }

    const panelHeaderText = String(item?.inputs?.['tabHeader'] || '').trim();
    if (panelHeaderText) {
      const headerCandidates = Array.from(tabViewHost.querySelectorAll<HTMLElement>('li, a, button, .p-tab'));
      const matchedHeader = headerCandidates.find((el) => String(el.textContent || '').trim() === panelHeaderText);
      if (matchedHeader) {
        return matchedHeader;
      }
    }

    const panelCandidates = Array.from(tabViewHost.querySelectorAll<HTMLElement>('.p-tabview-panel, .p-tabpanel, [role="tabpanel"]'));
    if (panelCandidates[panelIndex]) {
      return panelCandidates[panelIndex];
    }

    return tabViewHost;
  }

  private renderFooterHoverOverlay(target: HTMLElement): void {
    if (typeof document === 'undefined') {
      return;
    }

    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'designer-footer-hover-overlay';
    overlay.style.position = 'fixed';
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.border = '1px solid #3b82f6';
    overlay.style.boxShadow = 'inset 0 0 0 1px #3b82f6';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '2147483000';
    overlay.style.borderRadius = '2px';
    document.body.appendChild(overlay);
    this.footerHoverOverlayElement = overlay;
  }

  /**
   * Mostra il context menu footer per l'elemento target.
   */
  showFooterContextMenu(event: MouseEvent, item: DesignerTool, menu: ContextMenu): void {
    event.preventDefault();
    event.stopPropagation();
    this.footerCtxElement = item;
    menu.show(event);
  }

  /**
   * Rinomina l'elemento selezionato nel footer context menu aggiornando `displayName`.
   */
  private async renameFooterContextItem(): Promise<void> {
    const item = this.footerCtxElement;
    if (!item) {
      return;
    }

    const currentLabel = String(item.displayName || '').trim();
    const fallbackLabel = String(item.uniqueName || item.name || '').trim();
    const response = await WtoolboxService.promptDialog(this.t('designer.rename_item.title', 'Rename item'), [
      {
        name: 'displayName',
        caption: this.t('name', 'Name'),
        type: 'text',
        value: currentLabel || fallbackLabel,
        required: true
      }
    ], null, "320px");

    if (!response) {
      return;
    }

    const nextLabel = String(response?.displayName?.value || '').trim();
    if (!nextLabel) {
      return;
    }

    item.displayName = nextLabel;
    this.cd.detectChanges();
    this.commitHistoryIfChanged();
  }

  /**
   * Ricarica i dashboard disponibili e aggiorna sia il menu (`dashMenus[2].items`)
   * sia il datasource del dialog "Riapri" (`savedDashboardOptions`).
   * Se `sourceDashboards` non e passato, legge i record da `dataSrv.loadAllDashboards()`.
   * @param sourceDashboards Dataset opzionale gia caricato dal chiamante.
   */
  async reloadDashboards(sourceDashboards?: any[]) {
    const dashboards = sourceDashboards || await this.dataSrv.loadAllDashboards();
    if (!Array.isArray(this.dashMenus) || this.dashMenus.length < 3) {
      return;
    }

    const dashboardItems = (dashboards || []).map((item) => {
      const boardDes = String(item?.board_des || item?.boarddes || '').trim();
      const boardRoute = String(item?.board_route || item?.boardroute || '').trim();
      return {
        label: boardRoute ? `${boardDes} (#/${boardRoute}/dashboard)` : boardDes,
        // icon: 'pi pi-plus',
        command: (x) => {
          this.loadDashboard(x.item['info']);
        },
        info: item
      };
    });

    this.dashMenus[2].items = dashboardItems;
    this.savedDashboardOptions = dashboardItems.map((item) => ({
      label: String(item.label || '').trim(),
      value: String(item.info?.board_route || item.info?.boardroute || '').trim(),
      info: item.info
    })).filter((x) => !!x.value);

    let mnus = this.dashMenus;
    this.dashMenus = [];

    setTimeout(() => {
      this.dashMenus = mnus;
      this.refreshGraphActionsMenuItems();
      this.cd.detectChanges();
    }, 0);
  }

  /**
   * Callback di salvataggio usata dal metadata editor del designer.
   * Normalizza `data/original` (unwrap ricorsivo di `BehaviorSubject`/`{ value }`),
   * aggiorna il metadato host in base a `editorKey` (azioni, permessi, stili, colonne)
   * e pubblica il refresh sulle datasource coinvolte.
   */
  metaEditorSave = (data, original, editorKey?: string) => {
    const unwrapEntry = (value: any): any => {
      if (value instanceof BehaviorSubject) {
        return unwrapEntry(value.value);
      }
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
        return unwrapEntry(value.value);
      }
      if (Array.isArray(value)) {
        return value.map((item) => unwrapEntry(item));
      }
      if (value && typeof value === 'object') {
        const out: any = {};
        Object.keys(value).forEach((key) => {
          out[key] = unwrapEntry(value[key]);
        });
        return out;
      }
      return value;
    };

    const normalizedData = unwrapEntry(data) || {};
    const normalizedOriginal = unwrapEntry(original) || {};
    const hostDatasource = this.resolveDesignerToolDatasource(this.tool);
    const normalizedEditorKey = String(editorKey || '').trim();
    const isDeleted = !!(normalizedData?.__deleted ?? normalizedOriginal?.__deleted);
    const updateCurrentRecord = (ds: any, source: any) => {
      if (!ds?.setCurrent || !source) {
        return;
      }
      const currentModel = ds?.getModelFromObservable
        ? (ds.getModelFromObservable(ds.resultInfo?.current) || {})
        : {};
      ds.setCurrent({
        ...currentModel,
        ...source
      });
    };
    const publishDatasource = (ds: any) => {
      if (!ds?.fetchInfo$?.next) {
        return;
      }
      ds.fetchInfo$.next({
        resultInfo: ds.resultInfo,
        metaInfo: ds.metaInfo,
        filterDescriptor: ds.filterDescriptor,
        groupInfo: ds.groupInfo,
        sortInfo: ds.sortInfo,
        aggregationInfo: ds.aggregationInfo
      });
    };
    const pickIdValue = (record: any, key: string): any => {
      if (!record || !key) {
        return undefined;
      }
      return record[key];
    };
    const nextTemporaryNumericId = (list: any[], idKey: string): number => {
      const values = (Array.isArray(list) ? list : [])
        .map((item: any) => Number(item?.[idKey]))
        .filter((v: number) => Number.isFinite(v));
      const minValue = values.length ? Math.min(...values) : 0;
      return minValue <= 0 ? minValue - 1 : -1;
    };
    const upsertById = (list: any[], idKey: string, row: any, originalRow?: any, allowMissingIdInsert: boolean = false) => {
      const nextList = Array.isArray(list) ? list : [];
      const idValue = pickIdValue(row, idKey) ?? pickIdValue(originalRow, idKey);
      if (idValue === undefined || idValue === null || idValue === '') {
        if (!isDeleted && allowMissingIdInsert) {
          const temporaryId = nextTemporaryNumericId(nextList, idKey);
          const rowWithId = Object.assign({}, originalRow || {}, row, { [idKey]: temporaryId });
          nextList.push(rowWithId);
        }
        return nextList;
      }
      const idx = nextList.findIndex((item: any) => String(item?.[idKey] ?? '') === String(idValue));
      if (isDeleted) {
        if (idx >= 0) {
          nextList.splice(idx, 1);
        }
        return nextList;
      }
      if (idx >= 0) {
        nextList[idx] = Object.assign({}, nextList[idx], row);
      } else {
        nextList.push(Object.assign({}, originalRow || {}, row));
      }
      return nextList;
    };
    const resolveHostColumn = (record: any): any => {
      const columnId = Number(record?.mc_id ?? record?.mcid ?? 0);
      if (!columnId) {
        return null;
      }
      return hostDatasource?.metaInfo?.columnMetadata?.find((col) => Number(col?.mc_id || 0) === columnId) || null;
    };

    if (normalizedEditorKey === 'Id') {
      const tableMetadata = hostDatasource?.metaInfo?.tableMetadata;
      if (tableMetadata) {
        tableMetadata._Metadati_Custom_Actions_Tabelles = upsertById(
          tableMetadata._Metadati_Custom_Actions_Tabelles || [],
          'Id',
          normalizedData,
          normalizedOriginal
        );
      }
    } else if (normalizedEditorKey === 'muat_id') {
      const tableMetadata = hostDatasource?.metaInfo?.tableMetadata;
      if (tableMetadata) {
        tableMetadata._Metadati_Utenti_Autorizzazioni_Tabelles = upsertById(
          tableMetadata._Metadati_Utenti_Autorizzazioni_Tabelles || [],
          'muat_id',
          normalizedData,
          normalizedOriginal
        );
      }
    } else if (normalizedEditorKey === 'must_id') {
      const tableMetadata = hostDatasource?.metaInfo?.tableMetadata;
      if (tableMetadata) {
        tableMetadata._Metadati_UI_Stili_Tabelles = upsertById(
          tableMetadata._Metadati_UI_Stili_Tabelles || [],
          'must_id',
          normalizedData,
          normalizedOriginal
        );
      }
    } else if (normalizedEditorKey === 'CG_Id') {
      const tableMetadata = hostDatasource?.metaInfo?.tableMetadata;
      if (tableMetadata) {
        const normalizedConditionGroup = Object.assign({}, normalizedOriginal || {}, normalizedData || {});
        if (normalizedConditionGroup.CG_Id === undefined || normalizedConditionGroup.CG_Id === null || normalizedConditionGroup.CG_Id === '') {
          const fallbackGroupId = normalizedConditionGroup.__guid ?? normalizedOriginal?.__guid;
          if (fallbackGroupId !== undefined && fallbackGroupId !== null && String(fallbackGroupId) !== '') {
            normalizedConditionGroup.CG_Id = fallbackGroupId;
          }
        }
        tableMetadata._Metadati_Condition_Groups = upsertById(
          tableMetadata._Metadati_Condition_Groups || [],
          'CG_Id',
          normalizedConditionGroup,
          normalizedOriginal,
          true
        );
      }
    } else if (normalizedEditorKey === 'CI_Id') {
      const tableMetadata = hostDatasource?.metaInfo?.tableMetadata;
      if (tableMetadata) {
        const conditionGroups = Array.isArray(tableMetadata._Metadati_Condition_Groups)
          ? tableMetadata._Metadati_Condition_Groups
          : [];

        const rawGroupId = normalizedData?.FK_CG_Id ?? normalizedData?.CG_Id ?? normalizedOriginal?.FK_CG_Id ?? normalizedOriginal?.CG_Id;
        const hasGroupId = rawGroupId !== undefined && rawGroupId !== null && String(rawGroupId) !== '';
        if (!isDeleted && !hasGroupId) {
          WtoolboxService.errorHandler?.handleError(new Error('FK_CG_Id obbligatorio: impossibile salvare Condition Item senza gruppo condizione.'));
          return;
        }
        const linkedGroup = hasGroupId
          ? conditionGroups.find((row: any) => String(row?.CG_Id ?? row?.FK_CG_Id ?? row?.__guid ?? '') === String(rawGroupId))
          : null;

        const normalizedConditionItem = Object.assign(
          {},
          linkedGroup || {},
          normalizedOriginal || {},
          normalizedData || {}
        );

        if (hasGroupId) {
          normalizedConditionItem.CG_Id = rawGroupId;
        }
        if (normalizedConditionItem.FK_CG_Id === undefined && normalizedConditionItem.CG_Id !== undefined) {
          normalizedConditionItem.FK_CG_Id = normalizedConditionItem.CG_Id;
        }
        if (normalizedConditionItem.md_id === undefined) {
          normalizedConditionItem.md_id = tableMetadata.md_id;
        }
        if (!Array.isArray(normalizedConditionItem.ConditionActions)) {
          normalizedConditionItem.ConditionActions = Array.isArray(linkedGroup?.ConditionActions) ? linkedGroup.ConditionActions : [];
        }

        tableMetadata._Metadati_Condition_Groups = upsertById(
          conditionGroups,
          'CI_Id',
          normalizedConditionItem,
          normalizedOriginal,
          true
        );
      }
    } else if (normalizedEditorKey === 'CAG_Id') {
      const tableMetadata = hostDatasource?.metaInfo?.tableMetadata;
      if (tableMetadata) {
        const conditionGroups = Array.isArray(tableMetadata._Metadati_Condition_Groups)
          ? tableMetadata._Metadati_Condition_Groups
          : [];
        const rawGroupId = normalizedData?.FK_CG_Id ?? normalizedOriginal?.FK_CG_Id;
        const hasGroupId = rawGroupId !== undefined && rawGroupId !== null && String(rawGroupId) !== '';
        if (!isDeleted && !hasGroupId) {
          WtoolboxService.errorHandler?.handleError(new Error('FK_CG_Id obbligatorio: impossibile salvare Condition Action Group senza gruppo condizione.'));
          return;
        }

        const normalizedActionGroup = Object.assign({}, normalizedOriginal || {}, normalizedData || {});
        if (hasGroupId) {
          normalizedActionGroup.FK_CG_Id = rawGroupId;
        }
        if (normalizedActionGroup.CAG_Id === undefined || normalizedActionGroup.CAG_Id === null || normalizedActionGroup.CAG_Id === '') {
          const fallbackActionGroupId = normalizedActionGroup.__guid ?? normalizedOriginal?.__guid;
          if (fallbackActionGroupId !== undefined && fallbackActionGroupId !== null && String(fallbackActionGroupId) !== '') {
            normalizedActionGroup.CAG_Id = fallbackActionGroupId;
          }
        }

        let hostConditionRow = hasGroupId
          ? conditionGroups.find((row: any) => String(row?.CG_Id ?? row?.__guid ?? '') === String(rawGroupId))
          : null;
        if (!hostConditionRow && hasGroupId && !isDeleted) {
          hostConditionRow = {
            CG_Id: rawGroupId,
            md_id: tableMetadata?.md_id,
            ConditionActions: []
          } as any;
          conditionGroups.push(hostConditionRow as any);
        }
        if (!hostConditionRow) {
          return;
        }

        hostConditionRow.ConditionActions = upsertById(
          hostConditionRow.ConditionActions || [],
          'CAG_Id',
          normalizedActionGroup,
          normalizedOriginal,
          true
        );
        tableMetadata._Metadati_Condition_Groups = conditionGroups;
      }
    } else if (normalizedEditorKey === 'CAI_Id') {
      const tableMetadata = hostDatasource?.metaInfo?.tableMetadata;
      if (tableMetadata) {
        const conditionGroups = Array.isArray(tableMetadata._Metadati_Condition_Groups)
          ? tableMetadata._Metadati_Condition_Groups
          : [];
        const rawActionGroupId = normalizedData?.FK_CAG_Id ?? normalizedOriginal?.FK_CAG_Id ?? normalizedData?.CAG_Id ?? normalizedOriginal?.CAG_Id;
        const hasActionGroupId = rawActionGroupId !== undefined && rawActionGroupId !== null && String(rawActionGroupId) !== '';
        if (!isDeleted && !hasActionGroupId) {
          WtoolboxService.errorHandler?.handleError(new Error('FK_CAG_Id obbligatorio: impossibile salvare Condition Action Item senza gruppo azione condizione.'));
          return;
        }

        const normalizedActionItem = Object.assign({}, normalizedOriginal || {}, normalizedData || {});
        if (hasActionGroupId) {
          normalizedActionItem.FK_CAG_Id = rawActionGroupId;
          if (normalizedActionItem.CAG_Id === undefined || normalizedActionItem.CAG_Id === null || normalizedActionItem.CAG_Id === '') {
            normalizedActionItem.CAG_Id = rawActionGroupId;
          }
        }
        if (normalizedActionItem.CAI_Id === undefined || normalizedActionItem.CAI_Id === null || normalizedActionItem.CAI_Id === '') {
          const fallbackActionId = normalizedActionItem.__guid ?? normalizedOriginal?.__guid;
          if (fallbackActionId !== undefined && fallbackActionId !== null && String(fallbackActionId) !== '') {
            normalizedActionItem.CAI_Id = fallbackActionId;
          }
        }

        let hostConditionRow = conditionGroups.find((row: any) =>
          Array.isArray(row?.ConditionActions) &&
          row.ConditionActions.some((action: any) => String(action?.CAG_Id ?? action?.FK_CAG_Id ?? '') === String(rawActionGroupId))
        );
        if (!hostConditionRow) {
          WtoolboxService.errorHandler?.handleError(new Error('FK_CAG_Id non valido: impossibile trovare il gruppo azione condizione in memoria.'));
          return;
        }

        hostConditionRow.ConditionActions = upsertById(
          hostConditionRow.ConditionActions || [],
          'CAI_Id',
          normalizedActionItem,
          normalizedOriginal,
          true
        );
        tableMetadata._Metadati_Condition_Groups = conditionGroups;
      }
    } else if (normalizedEditorKey === 'muac_id') {
      const hostColumn = resolveHostColumn(normalizedData) || resolveHostColumn(normalizedOriginal);
      if (hostColumn) {
        hostColumn._Metadati_Utenti_Autorizzazioni_Colonnes = upsertById(
          hostColumn._Metadati_Utenti_Autorizzazioni_Colonnes || [],
          'muac_id',
          normalizedData,
          normalizedOriginal
        );
      }
    } else if (normalizedEditorKey === 'musc_id') {
      const hostColumn = resolveHostColumn(normalizedData) || resolveHostColumn(normalizedOriginal);
      if (hostColumn) {
        hostColumn._Metadati_UI_Stili_Colonnes = upsertById(
          hostColumn._Metadati_UI_Stili_Colonnes || [],
          'musc_id',
          normalizedData,
          normalizedOriginal
        );
      }
    } else if (normalizedData.mc_id) {
      const columnId = Number(normalizedData.mc_id);
      const hostColumn = hostDatasource?.metaInfo?.columnMetadata?.find((col) => Number(col?.mc_id) === columnId);
      if (hostColumn) {
        if (isDeleted) {
          hostDatasource.metaInfo.columnMetadata = (hostDatasource.metaInfo.columnMetadata || [])
            .filter((col: any) => Number(col?.mc_id || 0) !== columnId);
        } else {
          Object.assign(hostColumn, normalizedData);
        }
      }
      if (!isDeleted) {
        updateCurrentRecord(this['datasourceColonne'], normalizedData);
      }
      publishDatasource(this['datasourceColonne']);
    } else {
      const hostTableMetadata = hostDatasource?.metaInfo?.tableMetadata || null;
      if (hostTableMetadata) {
        Object.assign(hostTableMetadata, normalizedData);
      }
      if (!isDeleted) {
        updateCurrentRecord(this['datasourceTabelle'], normalizedData);
      }
      publishDatasource(this['datasourceTabelle']);
      if (hostDatasource?.resultInfo?.current) {
        Object.keys(hostDatasource.resultInfo.current).forEach((field) => {
          if (hostTableMetadata && Object.prototype.hasOwnProperty.call(hostTableMetadata, field) && hostDatasource.resultInfo.current[field]?.next) {
            hostDatasource.resultInfo.current[field].next(hostTableMetadata[field]);
          }
        });
      }
    }

    if (this.tool?.inputs) {
      this.tool.inputs['metaInfo'] = hostDatasource?.metaInfo || this.tool.inputs['metaInfo'] || null;
    }
    const flattenedMatch = (this.flattenedDashboardElements || []).find((x) => x?.uniqueName === this.tool?.uniqueName);
    if (flattenedMatch?.inputs) {
      flattenedMatch.inputs['metaInfo'] = hostDatasource?.metaInfo || flattenedMatch.inputs['metaInfo'] || null;
    }

    publishDatasource(hostDatasource);

    if (typeof this['rebuildMenuItems'] === 'function') {
      this['rebuildMenuItems']();
    }

    const dialogRef = this['ref'];
    if (dialogRef?.close) {
      dialogRef.close(data);
    }

    return data;
  }

  /**
   * Risolve la `DataSourceComponent` associata al tool corrente cercando:
   * `inputs.componentRef`, binding `inputs.datasource`, elemento flatten/root con stesso `uniqueName`.
   */
  private resolveDesignerToolDatasource(tool: DesignerTool | null | undefined): DataSourceComponent | null {
    const visitedToolKeys = new Set<string>();

    const resolveDatasourceFromBinding = (binding: any): DataSourceComponent | null => {
      if (!binding) {
        return null;
      }

      if (binding instanceof DataSourceComponent) {
        return binding;
      }

      if (binding instanceof BehaviorSubject) {
        return binding.value instanceof DataSourceComponent ? binding.value : null;
      }

      if (binding?.component instanceof DataSourceComponent) {
        return binding.component;
      }

      if (binding?.component?.value instanceof DataSourceComponent) {
        return binding.component.value;
      }

      const bindingUniqueName = String(
        binding?.uniqueName
        ?? binding?.name
        ?? (typeof binding === 'string' ? binding : '')
      ).trim();

      if (!bindingUniqueName) {
        return null;
      }

      const refTool = (this.flattenedDashboardElements || []).find((x) => String(x?.uniqueName || '').trim() === bindingUniqueName)
        || (this.dashboardElements || []).find((x) => String(x?.uniqueName || '').trim() === bindingUniqueName)
        || null;

      if (!refTool) {
        return null;
      }

      return tryResolveFromTool(refTool);
    };

    const tryResolveFromTool = (candidate: any): DataSourceComponent | null => {
      if (!candidate?.inputs) {
        return null;
      }
      const candidateKey = String(candidate?.uniqueName || candidate?.name || '').trim();
      if (candidateKey) {
        if (visitedToolKeys.has(candidateKey)) {
          return null;
        }
        visitedToolKeys.add(candidateKey);
      }

      const componentRef = this.unwrapBehaviorSubjectValue(candidate.inputs['componentRef']);
      if (componentRef?.component instanceof DataSourceComponent) {
        return componentRef.component;
      } else if (componentRef?.component?.value instanceof DataSourceComponent) {
        return componentRef.component.value;
      }
      const componentRefResolved = resolveDatasourceFromBinding(componentRef);
      if (componentRefResolved) {
        return componentRefResolved;
      }

      const datasourceBinding = this.unwrapBehaviorSubjectValue(candidate.inputs['datasource']);
      if (datasourceBinding instanceof DataSourceComponent) {
        return datasourceBinding;
      }
      if (datasourceBinding instanceof BehaviorSubject && datasourceBinding.value instanceof DataSourceComponent) {
        return datasourceBinding.value;
      }
      if (datasourceBinding?.component instanceof DataSourceComponent) {
        return datasourceBinding.component;
      }
      if (datasourceBinding?.component?.value instanceof DataSourceComponent) {
        return datasourceBinding.component.value;
      }
      const datasourceResolved = resolveDatasourceFromBinding(datasourceBinding);
      if (datasourceResolved) {
        return datasourceResolved;
      }

      return null;
    };

    const direct = tryResolveFromTool(tool);
    if (direct) {
      return direct;
    }

    const uniqueName = String(tool?.uniqueName || '').trim();
    if (!uniqueName) {
      return null;
    }

    const flattenedMatch = (this.flattenedDashboardElements || []).find((x) => x?.uniqueName === uniqueName) || null;
    const flattenedResolved = tryResolveFromTool(flattenedMatch);
    if (flattenedResolved) {
      return flattenedResolved;
    }

    const rootMatch = (this.dashboardElements || []).find((x) => x?.uniqueName === uniqueName) || null;
    return tryResolveFromTool(rootMatch);
  }

  /**
   * Aggiorna il context menu in base all'elemento sotto il puntatore
   * impostando `ctxElement` e le azioni specifiche (`ctxItems`).
   */
  showCtx($event, o: any) {
    let uniqueName = this.getelementNameByPosition($event.x, $event.y);
    if (uniqueName) {
      let el = this.getElementByName(uniqueName);
      let contextField = this.resolveContextFieldEditorColumn($event, el);
      let contextDs = contextField ? this.resolveDesignerToolDatasource(el) : null;

      if (!contextField || !contextDs) {
        const fallback = this.resolveContextFieldEditorColumnAcrossDesigner($event, el);
        contextField = fallback?.field || null;
        contextDs = fallback?.ds || null;
      }

      const fieldCtxItems = (contextField && contextDs)
        ? this.buildFieldEditorContextMenuItems(contextField, contextDs)
        : [];

      if (el && el.ctxItems) {
        this.ctxItems.next([...fieldCtxItems, ...el.ctxItems]);
      } else {
        this.ctxItems.next([...fieldCtxItems, ...this.defaultCtxItems]);
      }

      if (el) {
        this.ctxElement = el;
      }
    }
  }

  /**
   * Restituisce un elemento del tree flatten da `uniqueName`.
   */
  getElementByName(id: string) {
    return this.flattenedDashboardElements.find(x => x.uniqueName == id);
  }

  /**
   * Prova a risolvere la colonna metadata associata al `wuic-field-editor`
   * sotto il puntatore nel canvas designer.
   */
  private resolveContextFieldEditorColumn(event: MouseEvent, tool: DesignerTool | null | undefined): MetadatiColonna | null {
    if (!tool) {
      return null;
    }

    const hints = this.extractFieldEditorContextHints(event);
    if (!hints) {
      return null;
    }

    const ds = this.resolveDesignerToolDatasource(tool);
    const cols = ds?.metaInfo?.columnMetadata || [];
    if (!cols.length) {
      return null;
    }

    return this.matchContextFieldColumn(cols, hints);
  }

  /**
   * Fallback robusto: prova a risolvere la colonna del `wuic-field-editor`
   * cercando il match tra tutti i datasource presenti nel tree designer.
   */
  private resolveContextFieldEditorColumnAcrossDesigner(
    event: MouseEvent,
    preferredTool: DesignerTool | null | undefined
  ): { field: MetadatiColonna; ds: DataSourceComponent; } | null {
    const hints = this.extractFieldEditorContextHints(event);
    if (!hints) {
      return null;
    }

    const candidateTools: DesignerTool[] = [];
    const seen = new Set<string>();
    const appendTool = (tool: DesignerTool | null | undefined) => {
      if (!tool) {
        return;
      }
      const key = String(tool.uniqueName || '').trim();
      if (key && seen.has(key)) {
        return;
      }
      if (key) {
        seen.add(key);
      }
      candidateTools.push(tool);
    };

    appendTool(preferredTool);
    appendTool(this.ctxElement);
    appendTool(this.tool);
    (this.flattenedDashboardElements || []).forEach((tool) => appendTool(tool));

    for (const tool of candidateTools) {
      const ds = this.resolveDesignerToolDatasource(tool);
      const cols = ds?.metaInfo?.columnMetadata || [];
      if (!ds || !cols.length) {
        continue;
      }

      const field = this.matchContextFieldColumn(cols, hints);
      if (field) {
        return { field, ds };
      }
    }

    return null;
  }

  private extractFieldEditorContextHints(event: MouseEvent): {
    dataFieldId: number;
    dataFieldName: string;
    forAttr: string;
    labelText: string;
  } | null {
    const target = event?.target as HTMLElement | null;
    if (!target) {
      return null;
    }

    const fieldEditorHost = target.closest('wuic-field-editor') as HTMLElement | null;
    if (!fieldEditorHost) {
      return null;
    }

    const normalize = (v: any) => String(v || '')
      .replace('*', '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    return {
      dataFieldId: Number(fieldEditorHost.getAttribute('data-field-id') || 0),
      dataFieldName: String(fieldEditorHost.getAttribute('data-field-name') || '').trim(),
      forAttr: String(fieldEditorHost.querySelector('label.caption')?.getAttribute('for') || '').trim(),
      labelText: normalize(fieldEditorHost.querySelector('label.caption')?.textContent || '')
    };
  }

  private matchContextFieldColumn(cols: MetadatiColonna[], hints: {
    dataFieldId: number;
    dataFieldName: string;
    forAttr: string;
    labelText: string;
  }): MetadatiColonna | null {
    if (!Array.isArray(cols) || !hints) {
      return null;
    }

    if (Number.isFinite(hints.dataFieldId) && hints.dataFieldId > 0) {
      const byId = cols.find((c: any) => Number(c?.mc_id || 0) === hints.dataFieldId);
      if (byId) {
        return byId;
      }
    }

    if (hints.dataFieldName) {
      const byDataName = cols.find((c: any) =>
        String(c?.mc_nome_colonna || '').trim() === hints.dataFieldName
        || String(c?.ang_name || '').trim() === hints.dataFieldName
      );
      if (byDataName) {
        return byDataName;
      }
    }

    if (hints.forAttr) {
      const byName = cols.find((c: any) =>
        String(c?.ang_name || '').trim() === hints.forAttr
        || String(c?.mc_nome_colonna || '').trim() === hints.forAttr
      );
      if (byName) {
        return byName;
      }
    }

    if (hints.labelText) {
      const normalize = (v: any) => String(v || '')
        .replace('*', '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

      const byLabel = cols.find((c: any) => normalize(c?.mc_display_string_in_edit) === hints.labelText);
      if (byLabel) {
        return byLabel;
      }
    }

    return null;
  }

  /**
   * Costruisce le voci context menu specifiche per `wuic-field-editor` nel canvas designer.
   */
  private buildFieldEditorContextMenuItems(field: MetadatiColonna, ds: DataSourceComponent): MenuItem[] {
    return [
      {
        label: this.t('designer.ctx_open_column_metadata', 'Apri metadato colonna'),
        icon: 'pi pi-external-link',
        command: () => {
          void this.metadataEditorSrv.openMetadataColumnEditorInContext(field, this.metaSrv, ds)
            .catch((err) => this.handleContextFieldActionError(err));
        }
      },
      {
        label: this.t('designer.ctx_move_to_new_tab', 'Sposta in nuovo Tab'),
        icon: 'pi pi-folder-open',
        command: () => {
          void this.moveContextFieldToNewTab(field, ds)
            .catch((err) => this.handleContextFieldActionError(err));
        }
      },
      {
        label: this.t('designer.ctx_move_to_existing_tab', 'Sposta in tab esistente'),
        icon: 'pi pi-list',
        command: () => {
          void this.moveContextFieldToExistingTab(field, ds)
            .catch((err) => this.handleContextFieldActionError(err));
        }
      }
    ];
  }

  /**
   * Prompt nome tab e aggiorna `mc_edit_associated_tab` della colonna nel datasource designer.
   */
  private async moveContextFieldToNewTab(field: MetadatiColonna, ds: DataSourceComponent): Promise<void> {
    const promptResult = await WtoolboxService.promptDialog(
      this.t('designer.ctx_move_to_new_tab', 'Sposta in nuovo Tab'),
      [{
        name: 'tabName',
        caption: this.t('designer.tab_name_caption', 'Nome Tab'),
        type: 'text',
        required: true,
        value: this.getAssociatedTabValue(field)
      }],
      '520px',
      '320px'
    );

    if (!promptResult) {
      return;
    }

    const tabName = String(promptResult?.tabName?.value || '').trim();
    if (!tabName) {
      return;
    }

    this.applyContextFieldTabAssignment(field, ds, tabName);
  }

  /**
   * Prompt scelta tab esistente e aggiorna `mc_edit_associated_tab` della colonna.
   */
  private async moveContextFieldToExistingTab(field: MetadatiColonna, ds: DataSourceComponent): Promise<void> {
    const choices = this.getContextFieldTabChoices(ds);
    if (!choices.length) {
      return;
    }

    const currentTab = this.getAssociatedTabValue(field) || 'non_associati_a_tab';
    const hasCurrent = choices.some((x) => String(x.value) === currentTab);
    const defaultValue = hasCurrent ? currentTab : String(choices[0].value);

    const promptResult = await WtoolboxService.promptDialog(
      'Sposta in tab esistente',
      [{
        name: 'tabName',
        caption: 'Tab',
        type: 'dictionary',
        required: true,
        value: defaultValue,
        dictionaryData: choices
      }],
      '520px',
      '320px'
    );

    if (!promptResult) {
      return;
    }

    const tabName = String(promptResult?.tabName?.value || '').trim();
    if (!tabName) {
      return;
    }

    this.applyContextFieldTabAssignment(field, ds, tabName);
  }

  /**
   * Applica l'assegnazione tab sul metadata colonna e pubblica aggiornamento runtime.
   */
  private applyContextFieldTabAssignment(field: MetadatiColonna, ds: DataSourceComponent, tabName: string): void {
    const normalizedTab = String(tabName || '').trim();
    if (!normalizedTab) {
      return;
    }

    const targetCol = (ds?.metaInfo?.columnMetadata || []).find((col: any) =>
      Number(col?.mc_id || 0) === Number(field?.mc_id || 0)
      || String(col?.mc_nome_colonna || '') === String(field?.mc_nome_colonna || '')
    );

    if (!targetCol) {
      const fieldId = Number(field?.mc_id || 0);
      const fieldName = String(field?.mc_nome_colonna || '').trim();
      const dsRoute = String(ds?.route?.value || ds?.metaInfo?.tableMetadata?.md_route_name || '').trim();
      throw new Error(`Designer column metadata not found in datasource context. route='${dsRoute}', mc_id='${fieldId}', mc_nome_colonna='${fieldName}'.`);
    }

    targetCol.mc_edit_associated_tab = normalizedTab;
    field.mc_edit_associated_tab = normalizedTab;

    if (ds?.metaInfo?.tableMetadata) {
      // Spostare un campo su tab implica visualizzazione a tab nel parametric-dialog.
      ds.metaInfo.tableMetadata.md_tab_edit = true;
    }

    this.rebuildContextDatasourceTabs(ds);

    if (ds?.metaInfo?.tableMetadata?.md_tab_edit && typeof (ds as any).parseTabs === 'function' && !ds.metaInfo.dataTabs?.length) {
      (ds as any).parseTabs();
    }

    if (ds?.fetchInfo$?.next) {
      ds.fetchInfo$.next({
        resultInfo: ds.resultInfo,
        metaInfo: ds.metaInfo,
        filterDescriptor: ds.filterDescriptor,
        groupInfo: ds.groupInfo,
        sortInfo: ds.sortInfo,
        aggregationInfo: ds.aggregationInfo
      } as any);
    }

    this.commitHistoryIfChanged();
    this.cd.detectChanges();
  }

  /**
   * Ricostruisce `metaInfo.dataTabs` dal metadata colonne per riflettere subito gli spostamenti tab nel designer.
   */
  private rebuildContextDatasourceTabs(ds: DataSourceComponent): void {
    if (!ds?.metaInfo) {
      return;
    }

    const defaultTab = 'non_associati_a_tab';
    const tabs: Array<{ tabName: string; tabHeader: string; selected: boolean; rendered: boolean; hidden: boolean; }> = [];
    const existingSelected = String((ds.metaInfo.dataTabs || []).find((x: any) => !!x?.selected)?.tabName || '').trim();

    (ds.metaInfo.columnMetadata || []).forEach((col: any) => {
      if (col?.mc_hide_in_edit) {
        return;
      }

      const tabName = String(col?.mc_edit_associated_tab || '').trim() || defaultTab;
      const already = tabs.some((x) => x.tabName === tabName);
      if (already) {
        return;
      }

      tabs.push({
        tabName,
        tabHeader: this.trslSrv.instant(tabName),
        selected: false,
        rendered: false,
        hidden: false
      });
    });

    if (!tabs.length) {
      tabs.push({
        tabName: defaultTab,
        tabHeader: this.trslSrv.instant(defaultTab),
        selected: true,
        rendered: false,
        hidden: false
      });
    }

    const selectedIndex = tabs.findIndex((x) => x.tabName === existingSelected);
    if (selectedIndex >= 0) {
      tabs[selectedIndex].selected = true;
    } else {
      tabs[0].selected = true;
    }

    ds.metaInfo.dataTabs = tabs;
  }

  /**
   * Restituisce la lista tab disponibili nel datasource per la scelta "tab esistente".
   */
  private getContextFieldTabChoices(ds: DataSourceComponent): Array<{ label: string; value: string; }> {
    const result = new Map<string, string>();
    const defaultTab = 'non_associati_a_tab';
    const toLabel = (tab: string) => this.trslSrv.instant(tab) || tab;

    (Array.isArray(ds?.metaInfo?.dataTabs) ? ds.metaInfo.dataTabs : []).forEach((tab: any) => {
      const tabName = String(tab?.tabName || '').trim();
      if (tabName && !result.has(tabName)) {
        result.set(tabName, toLabel(tabName));
      }
    });

    (Array.isArray(ds?.metaInfo?.columnMetadata) ? ds.metaInfo.columnMetadata : []).forEach((col: any) => {
      if (col?.mc_hide_in_edit) {
        return;
      }
      const tabName = String(col?.mc_edit_associated_tab || '').trim() || defaultTab;
      if (!result.has(tabName)) {
        result.set(tabName, toLabel(tabName));
      }
    });

    if (!result.has(defaultTab)) {
      result.set(defaultTab, toLabel(defaultTab));
    }

    return Array.from(result.entries()).map(([value, label]) => ({ value, label }));
  }

  private getAssociatedTabValue(col: any): string {
    const value = col?.mc_edit_associated_tab ?? col?.mc_associated_tab ?? '';
    return String(value || '').trim();
  }

  private handleContextFieldActionError(error: any): void {
    const detail = String(error?.message || error || this.t('designer.unhandled_field_action_error', 'Errore non gestito durante azione campo.'));
    WtoolboxService.messageNotificationService.add({
      severity: 'error',
      summary: this.t('error', 'Errore'),
      detail
    });
    console.error(error);
  }

  private buildHierarchyTreeNodes(items: DesignerTool[]): any[] {
    return (items || []).map((item) => ({
      key: item?.uniqueName,
      label: this.getDroppedDashboardItemLabel(item),
      data: item,
      expanded: true,
      children: this.buildHierarchyTreeNodes(item?.nestedComponents || [])
    }));
  }

  private buildHierarchySignature(items: DesignerTool[]): string {
    return (items || []).map((item) => {
      const key = String(item?.uniqueName || '');
      const children = this.buildHierarchySignature(item?.nestedComponents || []);
      return `${key}[${children}]`;
    }).join('|');
  }

  private refreshHierarchyTreeState(): void {
    const signature = this.buildHierarchySignature(this.dashboardElements || []);
    if (signature === this.hierarchyTreeSignature) {
      return;
    }

    this.hierarchyTreeNodesState = this.buildHierarchyTreeNodes(this.dashboardElements || []);
    this.hierarchyTreeSignature = signature;
  }

  private findHierarchyNodeByKey(nodes: any[], key: string): any | null {
    for (const node of (nodes || [])) {
      if (String(node?.key || '') === key) {
        return node;
      }

      const nested = this.findHierarchyNodeByKey(node?.children || [], key);
      if (nested) {
        return nested;
      }
    }

    return null;
  }

  private syncHierarchySelectionToCurrentTool(): void {
    const currentUniqueName = String(this.tool?.uniqueName || '').trim();
    if (currentUniqueName === this.lastToolSelectionUniqueName) {
      return;
    }

    if (!currentUniqueName) {
      this.hierarchySelection = null;
      this.lastToolSelectionUniqueName = '';
      return;
    }

    const node = this.findHierarchyNodeByKey(this.hierarchyTreeNodesState, currentUniqueName);
    this.hierarchySelection = node || null;
    this.lastToolSelectionUniqueName = currentUniqueName;
  }

  private findComponentLocation(uniqueName: string, source: DesignerTool[] = this.dashboardElements, parentItem: DesignerTool | null = null): { item: DesignerTool; container: DesignerTool[]; parent: DesignerTool | null; index: number } | null {
    for (let i = 0; i < (source || []).length; i++) {
      const current = source[i];
      if (String(current?.uniqueName || '') === uniqueName) {
        return { item: current, container: source, parent: parentItem, index: i };
      }

      if (Array.isArray(current?.nestedComponents) && current.nestedComponents.length) {
        const nestedFound = this.findComponentLocation(uniqueName, current.nestedComponents, current);
        if (nestedFound) {
          return nestedFound;
        }
      }
    }

    return null;
  }

  private containsComponentRecursive(root: DesignerTool, targetUniqueName: string): boolean {
    if (!root) {
      return false;
    }

    if (String(root?.uniqueName || '') === targetUniqueName) {
      return true;
    }

    return (root?.nestedComponents || []).some((child) => this.containsComponentRecursive(child, targetUniqueName));
  }

  private moveComponentInHierarchy(draggedUniqueName: string, parentUniqueName: string | null, dropIndex?: number): void {
    const draggedKey = String(draggedUniqueName || '').trim();
    const parentKey = String(parentUniqueName || '').trim();
    if (!draggedKey) {
      return;
    }

    if (draggedKey === parentKey) {
      return;
    }

    const source = this.findComponentLocation(draggedKey);
    if (!source) {
      return;
    }

    let destinationContainer: DesignerTool[] = this.dashboardElements;
    let destinationParent: DesignerTool | null = null;

    if (parentKey) {
      const destination = this.findComponentLocation(parentKey);
      if (!destination || !destination.item) {
        return;
      }

      destinationParent = destination.item;

      if (this.containsComponentRecursive(source.item, parentKey)) {
        WtoolboxService.messageNotificationService.add({
          severity: 'error',
          summary: this.t('error', 'Error'),
          detail: this.t('designer.invalid_hierarchy_move', 'Invalid hierarchy move')
        });
        return;
      }

      const allowedChildren = destinationParent.allowedChildren;
      if (Array.isArray(allowedChildren) && allowedChildren.length > 0 && !allowedChildren.includes(source.item.name)) {
        WtoolboxService.messageNotificationService.add({
          severity: 'error',
          summary: this.t('error', 'Error'),
          detail: this.t('designer.invalid_child_component', 'Invalid child component')
        });
        return;
      }

      if (!Array.isArray(destinationParent.nestedComponents)) {
        destinationParent.nestedComponents = [];
      }
      destinationContainer = destinationParent.nestedComponents;
    }

    source.container.splice(source.index, 1);

    let safeIndex = Number.isFinite(dropIndex) ? Number(dropIndex) : destinationContainer.length;
    safeIndex = Math.max(0, Math.min(safeIndex, destinationContainer.length));

    if (destinationContainer === source.container && source.index < safeIndex) {
      safeIndex--;
    }

    destinationContainer.splice(safeIndex, 0, source.item);

    this.flattenedDashboardElements = this.flattenComponentTree(this.dashboardElements);
    this.commitHistoryIfChanged();
    this.cd.detectChanges();
  }

  /**
   * Risale il DOM partendo da coordinate viewport fino a trovare un id elemento designer.
   */
  getelementNameByPosition(x, y) {
    let el = document.elementFromPoint(x, y);
    let uniqueName = el.getAttribute("id");
    while (!uniqueName && el.parentElement) {
      el = el.parentElement;
      uniqueName = el.getAttribute("id");
    }

    return uniqueName;
  }

  /**
   * Rimuove un elemento dal tree dashboard per `uniqueName`,
   * aggiornando selezione/context e history.
   */
  removeElementByName(name: string) {
    const targetName = String(name || '').trim();
    if (!targetName) {
      return;
    }

    const removeRecursively = (items: DesignerTool[]): boolean => {
      for (let i = 0; i < (items || []).length; i++) {
        const current = items[i];
        if (current?.uniqueName === targetName) {
          items.splice(i, 1);
          return true;
        }

        if (Array.isArray(current?.nestedComponents) && current.nestedComponents.length) {
          const removedFromChild = removeRecursively(current.nestedComponents);
          if (removedFromChild) {
            return true;
          }
        }
      }

      return false;
    };

    const removed = removeRecursively(this.dashboardElements || []);
    if (!removed) {
      return;
    }

    if (this.tool?.uniqueName === targetName) {
      this.tool = null;
    }

    if (this.ctxElement?.uniqueName === targetName) {
      this.ctxElement = null;
    }

    if (this.footerCtxElement?.uniqueName === targetName) {
      this.footerCtxElement = null;
    }
    if (this.hierarchyCtxElement?.uniqueName === targetName) {
      this.hierarchyCtxElement = null;
    }

    this.flattenedDashboardElements = this.flattenComponentTree(this.dashboardElements);
    this.commitHistoryIfChanged();
  }

  /**
   * Costruisce il property tree archetype-specifico usando `designerOptions.getDesignerProps`
   * e popolando `customProps_<action>` per l'editor metadati del repeater.
   */
  private propertyTreeBuilder(action: any, inputs: any) {
    if (this.isPopupManagedArchetype(action)) {
      inputs.propertyTree.next([]);
      return;
    }

    const datasourceMetaInfo = inputs?.datasource?.component?.value?.metaInfo;
    if (!datasourceMetaInfo) {
      inputs?.propertyTree?.next?.([]);
      return;
    }

    let obj = MetadataProviderService.widgetDefinition.archetypes[action];

    let propertyTree = [];
    inputs.propertyTree.next([]);

    if (obj?.designerOptions) {
      let designerOptions: IDesignerProperties = new obj.designerOptions();
      designerOptions.init(datasourceMetaInfo);

      let mi: MetaInfo;
      let props: MetadatiColonna[] = [];

      if (designerOptions.getDesignerProps) {

        mi = designerOptions.getDesignerProps(datasourceMetaInfo, inputs.action);
        props = mi.columnMetadata;

        let preserve = inputs['customProps_' + action] != null;

        if (!preserve) {
          inputs['customProps_' + action] = {};
        }

        let propertyStack = [];

        this.eachRecursive(inputs, designerOptions, propertyTree, inputs['customProps_' + action], props, null, preserve, propertyStack, ['archetypePropName']);

      } else {
        throw new Error('designerOptions.getDesignerProps not implemented for archetype ' + action);
      }
    }

    inputs.propertyTree.next(propertyTree);
  }

  /**
   * Visita ricorsivamente l'oggetto designer options e materializza:
   * - nodi visuali nel `propertyTree`,
   * - record reattivo `customProps` (BehaviorSubject per campi scalar/lookup).
   */
  eachRecursive(inputs: any, obj, tree: any[], record: any, props: MetadatiColonna[], parentElement?: any, preserve: boolean = false, propertyStack: any[] = [], skipProps: string[] = []) {
    for (let k in obj) {

      if (skipProps.includes(k)) {
        continue;
      }

      if (typeof obj[k] == "object" && obj[k] !== null) {

        if (Array.isArray(obj[k])) {
          if (!preserve) {
            record[k] = new BehaviorSubject<any>(obj[k] || []);
          }

          let prop = props?.find(x => x.mc_nome_colonna == k);
          if (prop) {
            tree.push({ key: k, value: obj[k], col: prop });
          }

          propertyStack.push(k);
          this.eachRecursive(inputs, obj[k], tree, record, props, k, preserve, propertyStack, skipProps);

        } else {
          if (!preserve) {
            record[k] = obj[k] || {};
          }

          let prop = props?.find(x => x.mc_nome_colonna == k);
          if (prop) {
            tree.push({ key: k, value: obj[k], col: prop });
          }

          if (obj[k].getDesignerProps) {
            const nestedDatasourceMetaInfo = inputs?.datasource?.component?.value?.metaInfo;
            if (!nestedDatasourceMetaInfo) {
              continue;
            }
            let nestedMInfo = obj[k].getDesignerProps(nestedDatasourceMetaInfo, inputs.action);
            let nestedProps = nestedMInfo.columnMetadata;

            propertyStack.push(k);
            this.eachRecursive(inputs, obj[k], tree, record[k], nestedProps, k, preserve, propertyStack, skipProps);
          }
        }

        propertyStack.pop();
      }
      else {
        let prop = props?.find(x => x.mc_nome_colonna == k);

        if (propertyStack.length == 0 && prop) {
          tree.push({ key: k, value: obj[k], col: prop });
        }

        if (!preserve) {
          record[k] = new BehaviorSubject<any>(obj[k]);

          if (prop?.mc_ui_column_type == 'lookupByID') {
            record[k + '__lookup_obj'] = new BehaviorSubject<any>(null!);
          }
        }
      }
    }
  }

  /**
   * Filtra gli elementi candidate per proprietà `dropped-component-list` usando il filtro tipo tool.
   */
  elementFilter(toolProp) {
    return this.flattenedDashboardElements.filter(x => toolProp.value?.filter ? x.name == toolProp.value.filter : true);
  }

  /**
   * Applica una modifica proprieta al tool corrente gestendo:
   * converter custom, campi async (`BehaviorSubject`), `asyncPath`, hook `conditional`
   * e commit in history (con handling speciale per modifiche colore).
   * @param $event Nuovo valore proveniente dall'editor proprieta.
   * @param tool Tool designer da aggiornare.
   * @param toolProp Metadato della proprieta da modificare.
   */
  setValue($event, tool, toolProp) {
    const isColorPickerChange = toolProp?.value?.type === 'color';
    if (isColorPickerChange && !this.pendingColorHistoryBase) {
      this.pendingColorHistoryBase = this.lastCommittedSnapshot || this.captureHistorySnapshot();
    }

    let oldValue = tool.inputs[toolProp.key];

    if (toolProp.value.converter) {
      toolProp.value.converter(tool.inputs, toolProp.key, $event, tool);
    }

    if (toolProp.value.async) {
      if (tool.inputs[toolProp.key].value == $event) {
        return;
      }

      tool.inputs[toolProp.key].next($event);
    } else {

      if (tool.inputs[toolProp.key] == $event) {
        return;
      }

      if (toolProp.value.asyncPath) {
        // For dropped-component-list (e.g. DATAREPEATER.datasource), store a lightweight
        // reference {uniqueName, component: BS(liveComp)} instead of the full element.
        // The full element contains circular references and Angular internals that break
        // JSON serialization and produce snapshots missing the uniqueName.
        const liveComp = $event?.inputs?.componentRef?.value?.component
          ?? $event?.inputs?.componentRef?.component
          ?? null;
        const compBs = ($event[toolProp.value.asyncPath] instanceof BehaviorSubject)
          ? $event[toolProp.value.asyncPath]
          : new BehaviorSubject<any>(liveComp);
        $event = {
          uniqueName: $event.uniqueName,
          [toolProp.value.asyncPath]: compBs
        };
      }

      tool.inputs[toolProp.key] = $event;
    }

    if (toolProp.key === 'datasource' && (tool?.name === 'SELECT' || tool?.name === 'MULTISELECT' || tool?.name === 'UL')) {
      tool.inputs['optionsCsv'] = '';
      this.ensureSelectFieldDefaults(tool);
    }

    if (toolProp.key === 'datasource' && tool?.name === 'DATAREPEATER') {
      const currentAction = this.getRepeaterAction(tool) || 'list';
      this.propertyTreeBuilder(currentAction, tool.inputs);
    }

    if (toolProp.value.conditional) {
      toolProp.value.conditional(tool.inputProps, tool.inputs, $event, oldValue);
    }

    if (isColorPickerChange) {
      this.pendingColorHistoryDirty = true;
      return;
    }

    this.commitHistoryIfChanged();
  }

  getDesignerColorPickerHex(tool: any, toolProp: any): string {
    const value = this.getDesignerColorRawValue(tool, toolProp);
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'transparent' || normalized === 'inherit') {
        return '#ffffff';
      }
    }

    const parsed = this.parseAnyColorToRgba(value);
    if (!parsed) {
      return '#ffffff';
    }

    return this.rgbToHex(parsed.r, parsed.g, parsed.b);
  }

  getDesignerColorAlpha(tool: any, toolProp: any): number {
    const parsed = this.parseAnyColorToRgba(this.getDesignerColorRawValue(tool, toolProp));
    return parsed ? parsed.a : 1;
  }

  onDesignerColorPickerHexChange(hex: string, tool: any, toolProp: any): void {
    const alpha = this.getDesignerColorAlpha(tool, toolProp);
    const rgba = this.composeRgbaFromHex(hex, alpha);
    this.setValue(rgba, tool, toolProp);
  }

  onDesignerColorAlphaChange(alphaRaw: any, tool: any, toolProp: any): void {
    const alpha = this.clampColorAlpha(alphaRaw);
    const hex = this.getDesignerColorPickerHex(tool, toolProp);
    const rgba = this.composeRgbaFromHex(hex, alpha);
    this.setValue(rgba, tool, toolProp);
  }

  /**
   * Abilita configuratore archetype solo per DATAREPEATER popup-managed con metadati datasource disponibili.
   */
  canOpenArchetypeConfigurator(tool: DesignerTool | null | undefined): boolean {
    if (!tool || tool.name !== 'DATAREPEATER') {
      return false;
    }

    const action = this.getRepeaterAction(tool);
    if (!this.isPopupManagedArchetype(action)) {
      return false;
    }

    return !!this.getDesignerDatasourceMetaInfo(tool);
  }

  /**
   * Determina la visibilita del property tree standard (nascosto per archetype popup-managed).
   */
  shouldShowPropertyTree(tool: DesignerTool | null | undefined): boolean {
    if (!tool || tool.name !== 'DATAREPEATER') {
      return true;
    }

    return !this.isPopupManagedArchetype(this.getRepeaterAction(tool));
  }

  /**
   * Apre il popup configuratore archetype sul tool selezionato.
   */
  openArchetypeConfigurator(tool: DesignerTool): void {
    if (!this.canOpenArchetypeConfigurator(tool)) {
      return;
    }

    this.archetypeConfigTool = tool;
    this.showArchetypeConfigurator = true;
  }

  /**
   * Chiude il popup configuratore archetype e rilascia il riferimento tool.
   */
  closeArchetypeConfigurator(): void {
    this.showArchetypeConfigurator = false;
    this.archetypeConfigTool = null;
  }

  /**
   * Callback visibilita popup configuratore archetype.
   */
  onArchetypeConfigVisibleChange(visible: boolean): void {
    this.showArchetypeConfigurator = visible;
    if (!visible) {
      this.archetypeConfigTool = null;
    }
  }

  /**
   * Restituisce l'action archetype attiva del tool in configurazione.
   */
  getActiveArchetypeConfig(): string {
    return this.getRepeaterAction(this.archetypeConfigTool);
  }

  /**
   * Restituisce la configurazione archetype da customProps runtime
   * o fallback su `tableMetadata.extraProps.archetypes`.
   */
  getArchetypeConfigValueForTool(tool: DesignerTool | null): any {
    const target = tool || this.archetypeConfigTool;
    if (!target) {
      return null;
    }

    const action = this.getRepeaterAction(target);
    if (!action) {
      return null;
    }

    const custom = target.inputs?.['customProps_' + action];
    if (custom) {
      return this.unwrapBehaviorSubjects(custom);
    }

    const metaInfo = this.getDesignerDatasourceMetaInfo(target);
    return metaInfo?.tableMetadata?.extraProps?.archetypes?.[action] || null;
  }

  /**
   * Applica la configurazione archetype:
   * aggiorna `customProps_<action>`, persiste in `md_props_bag` e rigenera property tree.
   */
  onArchetypeConfigApply(nextConfig: any): void {
    const tool = this.archetypeConfigTool;
    if (!tool) {
      return;
    }

    const action = this.getRepeaterAction(tool);
    if (!action || !nextConfig) {
      this.closeArchetypeConfigurator();
      return;
    }

    const customKey = 'customProps_' + action;
    tool.inputs[customKey] = this.toBehaviorSubjectsObject(nextConfig);

    const metaInfo = this.getDesignerDatasourceMetaInfo(tool);
    if (metaInfo?.tableMetadata) {
      const extraProps = this.ensureMergedExtraProps(metaInfo);
      extraProps.archetypes = extraProps.archetypes || {};
      const currentArchetype = extraProps.archetypes[action] || {};
      extraProps.archetypes[action] = Object.assign({}, currentArchetype, nextConfig);
      metaInfo.tableMetadata.extraProps = extraProps;
      (metaInfo.tableMetadata as any).md_props_bag = JSON.stringify(extraProps);
    }

    const ds = tool.inputs?.['datasource']?.component?.value;
    if (ds?.fetchData) {
      ds.fetchData();
    }

    this.propertyTreeBuilder(action, tool.inputs);
    this.closeArchetypeConfigurator();
  }

  /**
   * Espone i metadati datasource al popup configuratore archetype.
   */
  getArchetypeConfigMetaInfoForTool(tool: DesignerTool | null): MetaInfo | null {
    return this.getDesignerDatasourceMetaInfo(tool);
  }

  /**
   * Normalizza nome archetype gestendo alias legacy (`*-list`, `list-grid`, `chart-list`, ...).
   */
  private normalizeArchetypeAction(action: any): string {
    let value = action;
    let depth = 0;
    while (value && typeof value === 'object' && depth < 3) {
      const next = value.value
        ?? value.key
        ?? value.action
        ?? value.label
        ?? value.id
        ?? value._value
        ?? value.currentValue
        ?? value.current
        ?? value.selected;

      if (next === undefined || next === null || next === value) {
        break;
      }

      value = next;
      depth++;
    }

    let normalized = String(value || '').trim().toLowerCase();
    const aliases: { [key: string]: string } = {
      'list-grid': 'list',
      'chart-list': 'chart',
      'map-list': 'map',
      'carousel-list': 'carousel'
    };

    if (aliases[normalized]) {
      normalized = aliases[normalized];
    }

    if (normalized.endsWith('-list')) {
      normalized = normalized.slice(0, -5);
    }

    return normalized;
  }

  private getDesignerColorRawValue(tool: any, toolProp: any): any {
    const value = tool?.inputs?.[toolProp?.key];
    if (value instanceof BehaviorSubject) {
      return value.value;
    }

    return value;
  }

  private parseAnyColorToRgba(value: any): { r: number; g: number; b: number; a: number } | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const raw = value.trim();
    if (!raw) {
      return null;
    }

    const rgbaMatch = raw.match(/^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([0-9]*\.?[0-9]+)\s*\)$/i);
    if (rgbaMatch) {
      return {
        r: this.clampRgbChannel(rgbaMatch[1]),
        g: this.clampRgbChannel(rgbaMatch[2]),
        b: this.clampRgbChannel(rgbaMatch[3]),
        a: this.clampColorAlpha(rgbaMatch[4])
      };
    }

    const rgbMatch = raw.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    if (rgbMatch) {
      return {
        r: this.clampRgbChannel(rgbMatch[1]),
        g: this.clampRgbChannel(rgbMatch[2]),
        b: this.clampRgbChannel(rgbMatch[3]),
        a: 1
      };
    }

    const hex = raw.replace('#', '');
    if (/^[0-9a-f]{3}$/i.test(hex)) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1
      };
    }

    if (/^[0-9a-f]{6}$/i.test(hex)) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1
      };
    }

    if (/^[0-9a-f]{8}$/i.test(hex)) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: this.clampColorAlpha(parseInt(hex.slice(6, 8), 16) / 255)
      };
    }

    return null;
  }

  private composeRgbaFromHex(hexRaw: string, alphaRaw: any): string {
    const hex = String(hexRaw || '').trim().replace('#', '');
    let r = 255;
    let g = 255;
    let b = 255;

    if (/^[0-9a-f]{3}$/i.test(hex)) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (/^[0-9a-f]{6}$/i.test(hex)) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }

    const alpha = this.clampColorAlpha(alphaRaw);
    return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(2))})`;
  }

  private clampColorAlpha(alphaRaw: any): number {
    const parsed = Number(alphaRaw);
    if (!Number.isFinite(parsed)) {
      return 1;
    }

    return Math.max(0, Math.min(1, parsed));
  }

  private clampRgbChannel(channelRaw: any): number {
    const parsed = Number(channelRaw);
    if (!Number.isFinite(parsed)) {
      return 0;
    }

    return Math.max(0, Math.min(255, Math.round(parsed)));
  }

  private rgbToHex(r: number, g: number, b: number): string {
    const toHex = (x: number) => x.toString(16).padStart(2, '0');
    return `#${toHex(this.clampRgbChannel(r))}${toHex(this.clampRgbChannel(g))}${toHex(this.clampRgbChannel(b))}`;
  }

  /**
   * Restituisce l'action del repeater supportando sia valori plain sia `BehaviorSubject`.
   */
  private getRepeaterAction(tool: DesignerTool | null | undefined): string {
    if (!tool) {
      return '';
    }

    const action = tool.inputs?.['action'];
    if (action instanceof BehaviorSubject) {
      return this.normalizeArchetypeAction(action.value);
    }

    return this.normalizeArchetypeAction(action);
  }

  /**
   * Apre configurazione table-action wizard del DATAREPEATER:
   * se manca `wizard.complete.action` crea la coppia (`wizard.next.action`, `wizard.complete.action`),
   * quindi apre sempre l'editor di `wizard.next.action`.
   */
  private async openWizardTableActionConfig(inputs: any, target: 'prev' | 'next' | 'end'): Promise<void> {
    const hostDatasource = inputs?.datasource?.component?.value as DataSourceComponent;
    const tableMetadata = hostDatasource?.metaInfo?.tableMetadata as any;
    const mdId = Number(tableMetadata?.md_id || 0);
    if (!hostDatasource || !tableMetadata || !Number.isFinite(mdId) || mdId <= 0) {
      return;
    }

    const actions = Array.isArray(tableMetadata._Metadati_Custom_Actions_Tabelles)
      ? tableMetadata._Metadati_Custom_Actions_Tabelles
      : [];
    tableMetadata._Metadati_Custom_Actions_Tabelles = actions;

    const normalizeCaption = (value: any) => String(value || '').trim().toLowerCase();
    const findByCaption = (caption: string) => actions.find((x: any) => normalizeCaption(x?.button_caption) === caption);
    const prevActionCaption = 'wizard.prev.action';
    const nextActionCaption = 'wizard.next.action';
    const completeActionCaption = 'wizard.complete.action';

    const prevActionCallback = 'datasource.selectPreviousVisibleTab();';
    const prevActiondisableCallback = 'return !datasource.hasPreviousVisibleTab';

    const nextActionCallback = 'datasource.selectNextVisibleTab();';
    const nextActiondisableCallback = 'return !datasource.hasNextVisibleTab';

    const completeActionCallback = 'let updateInfo = await datasource.syncData(datasource.resultInfo.current, datasource.pristine);\r\ndatasource.setCurrent(null);\r\ndatasource.setSelectedTab(0, true, true);';
    const completeActiondisableCallback = 'return !datasource.canCompleteWizard()';

    let nextAction = findByCaption(nextActionCaption);
    let completeAction = findByCaption(completeActionCaption);
    let prevAction = findByCaption(prevActionCaption);

    const createAction = (caption: string, actionCallback: string, disableCallback: string, btnClass: string, order: number) => {
      const created = {
        Id: this.getNextTemporaryTableActionId(actions),
        md_id: mdId,
        button_caption: caption,
        tooltip: caption,
        md_action_type: 8,
        action_callback: actionCallback,
        disable_callback: disableCallback,
        button_image: btnClass,
        ordine: order
      } as any;
      actions.push(created);
      return created;
    };

    let needPublish = false;

    if (!completeAction) {
      completeAction = createAction(completeActionCaption, completeActionCallback, completeActiondisableCallback, 'wizard-complete-btn', 2);
      this.publishDesignerDatasourceState(hostDatasource);
      this.commitHistoryIfChanged();
    } else {
      completeAction.button_image = 'wizard-complete-btn';
      completeAction.ordine = 2;
    }

    if (!prevAction) {
      prevAction = createAction(prevActionCaption, prevActionCallback, prevActiondisableCallback, 'wizard-prev-btn', 1);
      needPublish = true;
    } else {
      prevAction.button_image = 'wizard-prev-btn';
      prevAction.ordine = 1;
    }

    if (!nextAction) {
      nextAction = createAction(nextActionCaption, nextActionCallback, nextActiondisableCallback, 'wizard-next-btn', 3);
      needPublish = true;
    } else {
      nextAction.button_image = 'wizard-next-btn';
      nextAction.ordine = 3;
    }

    // if (needPublish) {
    this.publishDesignerDatasourceState(hostDatasource);
    this.commitHistoryIfChanged();
    // }

    if (!nextAction) {
      return;
    }

    await this.openTableActionEditorDialog(target === 'end' ? completeAction : target === 'prev' ? prevAction : nextAction, hostDatasource);
  }

  /**
   * Restituisce un Id temporaneo negativo non usato per nuove table action in-memory.
   */
  private getNextTemporaryTableActionId(actions: any[]): number {
    const values = (Array.isArray(actions) ? actions : [])
      .map((x: any) => Number(x?.Id))
      .filter((v: number) => Number.isFinite(v));
    const minValue = values.length ? Math.min(...values) : 0;
    return minValue <= 0 ? minValue - 1 : -1;
  }

  /**
   * Apre l'edit form metadata su `custom_route_action` usando il salvataggio locale del designer.
   */
  private async openTableActionEditorDialog(actionRecord: any, hostDatasource: DataSourceComponent): Promise<void> {
    const routeName = String(MetadataProviderService.metatableActionRoute || 'custom_route_action');
    const dummyRoute: any = {
      snapshot: {
        queryParamMap: { get: (_: string) => null },
        paramMap: { get: (_: string) => null }
      }
    };

    const metadataDatasource = new DataSourceComponent(
      this.metaSrv,
      this.dataSrv,
      this.trslSrv,
      this.workflowRuntimeMetadata,
      {} as any,
      dummyRoute,
      null,
    );

    metadataDatasource.hardcodedRoute = routeName;
    metadataDatasource.route.next(routeName);
    await metadataDatasource.getSchemaAndData(true);
    metadataDatasource.setCurrent(this.unwrapBehaviorSubjects(actionRecord));

    const dialogRef = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data: {
        datasource: new BehaviorSubject<DataSourceComponent>(metadataDatasource),
        saveCallback: (data: any, original: any) => {
          this.metaEditorSave(data, original, 'Id');
          this.commitHistoryIfChanged();
          return data;
        },
        isEditForm: true
      },
      header: `${this.t('edit', 'Edit')} ${String(actionRecord?.button_caption || '').trim() || 'Action'}`,
      styleClass: 'edit-form-content',
      position: 'center',
      duplicate: true
    });

    dialogRef?.onClose?.subscribe(() => {
      metadataDatasource.ngOnDestroy();
      this.publishDesignerDatasourceState(hostDatasource);
    });
  }

  /**
   * Pubblica lo stato aggiornato del datasource host verso il designer/runtime locale.
   */
  private publishDesignerDatasourceState(ds: DataSourceComponent | null | undefined): void {
    if (!ds?.fetchInfo$?.next) {
      return;
    }

    ds.fetchInfo$.next({
      resultInfo: ds.resultInfo,
      metaInfo: ds.metaInfo,
      filterDescriptor: ds.filterDescriptor,
      groupInfo: ds.groupInfo,
      sortInfo: ds.sortInfo,
      aggregationInfo: ds.aggregationInfo
    } as any);
  }

  /**
   * Verifica se l'archetype richiesto e tra quelli gestiti da popup configuratore.
   * @param action Nome/archetype da validare.
   */
  private isPopupManagedArchetype(action: any): boolean {
    return this.popupManagedArchetypes.includes(String(action || '').trim());
  }

  /**
   * Estrae il `MetaInfo` della datasource collegata al tool dal path runtime
   * `tool.inputs.datasource.component.value.metaInfo`.
   * @param tool Tool da cui leggere i metadati datasource.
   */
  private getDesignerDatasourceMetaInfo(tool: DesignerTool | null | undefined): MetaInfo | null {
    if (!tool) {
      return null;
    }

    return tool.inputs?.['datasource']?.component?.value?.metaInfo || null;
  }

  /**
   * Restituisce i nomi colonna disponibili della datasource del tool
   * usando `columnMetadata[].mc_nome_colonna`, con trim e deduplica.
   * @param tool Tool da cui derivare le opzioni.
   */
  getDatasourceColumnOptions(tool: DesignerTool | null | undefined): string[] {
    const columns = this.getDesignerDatasourceMetaInfo(tool)?.columnMetadata || [];
    const names = columns
      .map((col) => (col?.mc_nome_colonna || '').trim())
      .filter((name) => !!name);
    return Array.from(new Set(names));
  }

  /**
   * Allinea `valueField`/`textField` dei tool SELECT/MULTISELECT/UL ai campi reali
   * disponibili nella datasource (`columnMetadata[].mc_nome_colonna`), evitando riferimenti
   * a colonne non presenti dopo cambio route/datasource.
   */
  private ensureSelectFieldDefaults(tool: DesignerTool | null | undefined): void {
    if (!tool || (tool.name !== 'SELECT' && tool.name !== 'MULTISELECT' && tool.name !== 'UL')) {
      return;
    }

    const columns = this.getDatasourceColumnOptions(tool);
    const first = columns[0] || '';

    if (!columns.includes(tool.inputs?.['valueField'])) {
      tool.inputs['valueField'] = first;
    }

    if (!columns.includes(tool.inputs?.['textField'])) {
      tool.inputs['textField'] = tool.inputs['valueField'] || first;
    }
  }

  /**
   * Apre il code editor per `inputs.displayFormula` (render label opzioni select),
   * costruendo il contesto con route/campi della datasource corrente.
   * Salva il codice confermato dentro `inputs.displayFormula`.
   * @param inputs Inputs del controllo select-like da aggiornare.
   * @param tool Tool target; fallback a `this.tool`.
   * @param defaultFormula Formula proposta quando il campo e vuoto.
   */
  private async openSelectDisplayFormulaEditor(inputs: any, tool?: DesignerTool, defaultFormula?: string): Promise<void> {
    if (!inputs) {
      return;
    }

    const targetTool = tool || this.tool;
    const routeMetaInfo = this.getDesignerDatasourceMetaInfo(targetTool);
    const routeId = routeMetaInfo?.tableMetadata?.md_id || 0;
    const routeName = String(routeMetaInfo?.tableMetadata?.md_route_name || '').trim();
    const columns = this.getSelectDisplayFormulaColumns(targetTool);

    const propsBag = {
      customEditorConfig: {
        editorOptions: {
          language: 'typescript',
          minimap: { enabled: false }
        },
        routeContextField: 'routeContextId',
        codeContext: this.getSelectDisplayFormulaCodeContext(routeName, columns)
      }
    };

    const result = await WtoolboxService.promptDialog(
      'Display Value Formula',
      [
        {
          name: 'displayFormula',
          caption: 'Formula',
          type: 'code_editor',
          value: inputs.displayFormula || defaultFormula || "return dataItem?.[inputs?.textField] ?? dataItem?.[inputs?.valueField] ?? '';",
          propsBag: propsBag
        },
        {
          name: 'routeContextId',
          caption: 'Route Context',
          type: 'number',
          value: routeId,
          hide: true
        }
      ],
      '80%',
      '80%',
      null
    );

    if (!result?.displayFormula) {
      return;
    }

    inputs.displayFormula = result.displayFormula.value || '';
  }

  /**
   * Variante UL del formula editor: imposta una formula default che fallbacka
   * a `textField`, poi `valueField`, poi `String(dataItem)`.
   */
  private async openUlDisplayFormulaEditor(inputs: any, tool?: DesignerTool): Promise<void> {
    await this.openSelectDisplayFormulaEditor(inputs, tool, "return dataItem?.[inputs?.textField] ?? dataItem?.[inputs?.valueField] ?? (dataItem != null ? String(dataItem) : '');");
  }

  /**
   * Variante LABEL del formula editor: se e definito `displayField`,
   * genera default `dataItem[displayField]`, altrimenti usa `inputs.displayField`.
   */
  private async openLabelDisplayFormulaEditor(inputs: any, tool?: DesignerTool): Promise<void> {
    const displayField = String(inputs?.displayField || '').trim();
    const defaultFormula = displayField
      ? `return dataItem?.['${displayField.replace(/'/g, "\\'")}'] ?? '';`
      : "return dataItem?.[inputs?.displayField] ?? '';";
    await this.openSelectDisplayFormulaEditor(inputs, tool, defaultFormula);
  }

  /**
   * Verifica se un tool DATASOURCE ha un master datasource associato in `parentDatasource`
   * (sia formato string uniqueName sia oggetto binding con `uniqueName`).
   * Usato per abilitare UI/formule master-detail.
   */
  hasParentDatasourceBinding(tool: DesignerTool | null | undefined): boolean {
    if (!tool || tool.name !== 'DATASOURCE') {
      return false;
    }

    const parentDatasourceBinding = this.unwrapBehaviorSubjectValue(tool.inputs?.['parentDatasource']);
    if (typeof parentDatasourceBinding === 'string') {
      return !!String(parentDatasourceBinding || '').trim();
    }

    return !!parentDatasourceBinding?.uniqueName;
  }

  /**
   * Apre il code editor della formula `masterDetailFilterFormula` del datasource dettaglio.
   * Risolve datasource master/dettaglio dal grafo designer, costruisce contesto colonne/route,
   * propone una formula iniziale `setFilter(...)` e salva il risultato in `inputs.masterDetailFilterFormula`.
   */
  async openMasterDetailFilterFormulaEditor(inputs: any, tool?: DesignerTool): Promise<void> {
    if (!inputs) {
      return;
    }

    const targetTool = tool || this.tool;
    const parentDatasourceBinding = this.unwrapBehaviorSubjectValue(targetTool?.inputs?.['parentDatasource']);
    const parentDatasourceUniqueName = typeof parentDatasourceBinding === 'string'
      ? String(parentDatasourceBinding || '').trim()
      : String(parentDatasourceBinding?.uniqueName || '').trim();

    if (!parentDatasourceUniqueName) {
      WtoolboxService.messageNotificationService.add({
        severity: 'warn',
        summary: this.t('warning', 'Warning'),
        detail: this.t('designer.select_parent_datasource_first', 'Select Parent Datasource first')
      });
      return;
    }

    let masterDatasource = this.unwrapBehaviorSubjectValue(parentDatasourceBinding?.component) as DataSourceComponent | undefined;
    if (!masterDatasource) {
      const masterDsElement = (this.flattenedDashboardElements || []).find((x) => x?.name === 'DATASOURCE' && x?.uniqueName === parentDatasourceUniqueName);
      masterDatasource = this.unwrapBehaviorSubjectValue(
        this.unwrapBehaviorSubjectValue(masterDsElement?.inputs?.componentRef)?.component
      ) as DataSourceComponent | undefined;
    }

    let detailDatasource = this.unwrapBehaviorSubjectValue(
      this.unwrapBehaviorSubjectValue(targetTool?.inputs?.['componentRef'])?.component
    ) as DataSourceComponent | undefined;
    if (!detailDatasource) {
      const detailDsElement = (this.flattenedDashboardElements || []).find((x) => x?.name === 'DATASOURCE' && x?.uniqueName === targetTool?.uniqueName);
      detailDatasource = this.unwrapBehaviorSubjectValue(
        this.unwrapBehaviorSubjectValue(detailDsElement?.inputs?.componentRef)?.component
      ) as DataSourceComponent | undefined;
    }

    const masterColumns = this.getDatasourceColumnsFromDatasourceComponent(masterDatasource);
    const detailColumns = this.getDatasourceColumnsFromDatasourceComponent(detailDatasource);
    const masterRoute = this.getDatasourceRouteName(masterDatasource || ({} as DataSourceComponent));
    const detailRoute = this.getDatasourceRouteName(detailDatasource || ({} as DataSourceComponent));
    const masterPrimaryKey = this.getDatasourcePrimaryKey(masterDatasource || ({} as DataSourceComponent));
    const masterPkValueExpression = masterPrimaryKey
      ? (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(masterPrimaryKey)
        ? `dataItem?.${masterPrimaryKey}`
        : 'dataItem?.id')
      : 'dataItem?.id';

    const propsBag = {
      customEditorConfig: {
        editorOptions: {
          language: 'typescript',
          minimap: { enabled: false }
        },
        codeContext: this.getMasterDetailFilterFormulaCodeContext(masterRoute, detailRoute, masterColumns, detailColumns)
      }
    };

    const detailColumnsHint = detailColumns.length
      ? detailColumns.map((col) => `// - ${col}`).join('\n')
      : '// - (no detail columns available yet)';

    const defaultFormula = detailColumns.length
      ? `// Detail columns (use one as first argument of setFilter):\n${detailColumnsHint}\nsetFilter('${detailColumns[0].replace(/'/g, "\\'")}', ${masterPkValueExpression}, 'eq');`
      : `// Detail columns (use one as first argument of setFilter):\n${detailColumnsHint}\n// Example:\n// setFilter('detail_fk', ${masterPkValueExpression}, 'eq');`;

    const result = await WtoolboxService.promptDialog(
      'Master-Detail Filter Formula',
      [
        {
          name: 'masterDetailFilterFormula',
          caption: 'Formula',
          type: 'code_editor',
          value: inputs.masterDetailFilterFormula || defaultFormula,
          propsBag: propsBag
        }
      ],
      '80%',
      '80%',
      null
    );

    if (!result?.masterDetailFilterFormula) {
      return;
    }

    inputs.masterDetailFilterFormula = result.masterDetailFilterFormula.value || '';
  }

  /**
   * Estrae i nomi colonna disponibili dalla datasource (`metaInfo.columnMetadata`).
   */
  private getDatasourceColumnsFromDatasourceComponent(datasource: DataSourceComponent | null | undefined): string[] {
    return Array.from(new Set((datasource?.metaInfo?.columnMetadata || [])
      .map((col: MetadatiColonna) => String(col?.mc_nome_colonna || '').trim())
      .filter((name) => !!name)));
  }

  /**
   * Costruisce il contesto TypeScript mostrato nell'editor formula master-detail
   * con route e shape dei campi master/detail.
   */
  private getMasterDetailFilterFormulaCodeContext(masterRoute: string, detailRoute: string, masterColumns: string[], detailColumns: string[]): string {
    const buildTypeRows = (columns: string[], fallback: string) => {
      if (!columns.length) {
        return `  ${fallback}: any;`;
      }

      return columns.map((col) => {
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(col)) {
          return `  ${col}: any;`;
        }

        return `  '${col.replace(/'/g, "\\'")}': any;`;
      }).join('\n');
    };

    const detailCommentRows = detailColumns.length
      ? detailColumns.map((col) => `- ${col}`).join('\n')
      : '- (no detail columns available yet)';

    return `
declare type MasterDataItem = {
${buildTypeRows(masterColumns, '[key: string]')}
};

declare type DetailFilter = {
  field: string;
  operatore?: string;
  value: any;
  fixed?: boolean;
};

declare const dataItem: MasterDataItem;
declare const detailColumns: string[];
declare function setFilter(field: string, value: any, operatore?: string, fixed?: boolean): void;
declare const currentFilters: DetailFilter[];
declare const detailDatasource: DataSourceComponent;
declare const masterDatasource: DataSourceComponent;
declare const wtoolbox: typeof WtoolboxService;

/*
Master-detail formula context:
- master route: ${masterRoute || 'n/a'}
- detail route: ${detailRoute || 'n/a'}
- Use dataItem.<masterColumn> with autocomplete

Detail columns:
${detailCommentRows}
*/
`;
  }

  /**
   * Costruisce il contesto code-helper per editor `displayFormula` dei componenti select-like.
   */
  private getSelectDisplayFormulaCodeContext(routeName: string, columns: string[]): string {
    const safeColumns = columns.filter((col) => !!String(col || '').trim());
    const optionProps = safeColumns.length
      ? safeColumns.map((col) => {
        const key = String(col).trim();
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
          return `  ${key}: any;`;
        }
        return `  '${key.replace(/'/g, "\\'")}': any;`;
      }).join('\n')
      : '  [key: string]: any;';
    const routeComment = routeName ? `route: ${routeName}` : 'route: n/a';

    return `
declare type SelectOptionRecord = {
${optionProps}
};

declare type SelectDisplayFormulaFn = (
  dataItem: SelectOptionRecord,
  record: {[key: string]: BehaviorSubject<any>},
  datasource: DataSourceComponent,
  inputs: any,
  wtoolbox: typeof WtoolboxService
) => string;

declare const dataItem: SelectOptionRecord;
declare const record: {[key: string]: BehaviorSubject<any>};
declare const datasource: DataSourceComponent;
declare const inputs: any;
declare const wtoolbox: typeof WtoolboxService;

/*
Display formula context:
- ${routeComment}
- dataItem: current datasource row
- record: datasource.resultInfo.current (BehaviorSubject-based)
- datasource: datasource component bound to this select
- inputs: select inputs (valueField, textField, ...)
*/
`;
  }

  /**
   * Restituisce i campi utilizzabili in `displayFormula` unendo metadati e chiavi primo record caricato.
   */
  private getSelectDisplayFormulaColumns(tool: DesignerTool | null | undefined): string[] {
    const fromMeta = this.getDatasourceColumnOptions(tool);
    const rows = tool?.inputs?.['datasource']?.component?.value?.resultInfo?.dato;
    const firstRow = Array.isArray(rows) && rows.length ? rows[0] : null;
    const fromData = firstRow && typeof firstRow === 'object' ? Object.keys(firstRow) : [];
    return Array.from(new Set([...(fromMeta || []), ...(fromData || [])].filter((c) => !!String(c || '').trim())));
  }

  /**
   * Converte ricorsivamente strutture con BehaviorSubject in plain object/array.
   */
  private unwrapBehaviorSubjects(value: any): any {
    if (value instanceof BehaviorSubject) {
      return this.unwrapBehaviorSubjects(value.value);
    }

    if (Array.isArray(value)) {
      return value.map((v) => this.unwrapBehaviorSubjects(v));
    }

    if (value && typeof value === 'object') {
      const out: any = {};
      Object.keys(value).forEach((k) => {
        out[k] = this.unwrapBehaviorSubjects(value[k]);
      });
      return out;
    }

    return value;
  }

  /**
   * Converte ricorsivamente una struttura plain in oggetto reattivo con BehaviorSubject ai leaf scalar.
   */
  private toBehaviorSubjectsObject(value: any): any {
    if (Array.isArray(value)) {
      return value.map((v) => this.toBehaviorSubjectsObject(v));
    }

    if (value && typeof value === 'object') {
      const out: any = {};
      Object.keys(value).forEach((k) => {
        out[k] = this.toBehaviorSubjectsObject(value[k]);
      });
      return out;
    }

    return new BehaviorSubject<any>(value);
  }

  /**
   * Merge di `tableMetadata.md_props_bag` (JSON persistito) con `tableMetadata.extraProps` runtime,
   * mantenendo anche il merge profondo del nodo `archetypes`.
   * Ritorna l'oggetto normalizzato usato dal configuratore archetipi.
   */
  private ensureMergedExtraProps(metaInfo: MetaInfo): any {
    let propsFromBag: any = {};

    try {
      propsFromBag = JSON.parse(metaInfo?.tableMetadata?.md_props_bag || '{}') || {};
    } catch {
      propsFromBag = {};
    }

    const current: any = metaInfo?.tableMetadata?.extraProps || {};
    const merged: any = Object.assign({}, propsFromBag, current);
    merged.archetypes = Object.assign({}, propsFromBag?.archetypes || {}, current?.archetypes || {});
    return merged;
  }

  /**
   * Reidrata `tableMetadata.extraProps` di un datasource board serializzato
   * usando la fonte canonica `tableMetadata.md_props_bag`.
   */
  private rehydrateDatasourceMetaInfo(tool: any): void {
    const metaInfo = tool?.inputs?.['metaInfo'];
    this.rehydrateTableExtraPropsFromPropsBag(metaInfo);
    this.rehydrateDatasourceRuntimeCallbacks(metaInfo);
  }

  /**
   * Garantisce che `extraProps` sia sempre ricostruito da `md_props_bag`.
   * Se `md_props_bag` arriva come oggetto, lo normalizza a stringa JSON.
   */
  private rehydrateTableExtraPropsFromPropsBag(metaInfo: any): void {
    const tableMetadata = metaInfo?.tableMetadata;
    if (!tableMetadata || typeof tableMetadata !== 'object') {
      return;
    }

    let propsFromBag: any = {};
    const rawBag = tableMetadata.md_props_bag;
    try {
      if (typeof rawBag === 'string') {
        propsFromBag = JSON.parse(rawBag || '{}') || {};
      } else if (rawBag && typeof rawBag === 'object') {
        propsFromBag = rawBag;
        tableMetadata.md_props_bag = JSON.stringify(rawBag);
      }
    } catch {
      propsFromBag = {};
    }

    const current: any = tableMetadata.extraProps || {};
    const merged: any = Object.assign({}, propsFromBag, current);
    merged.archetypes = Object.assign({}, propsFromBag?.archetypes || {}, current?.archetypes || {});
    tableMetadata.extraProps = merged;
  }

  /**
   * Ricompila callback runtime delle table actions quando il `metaInfo` arriva da board serializzata
   * (dove le function non sono persistibili) evitando errori `action_callback__fn is not a function`.
   */
  private rehydrateTableActionCallbacks(metaInfo: any): void {
    const actions = metaInfo?.tableMetadata?._Metadati_Custom_Actions_Tabelles;
    if (!Array.isArray(actions) || !actions.length) {
      return;
    }

    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
    const normalizeDynamicScript = (source: any) => String(source || '')
      .replace(/^\uFEFF/, '')
      .replace(/\u0000/g, '')
      .replace(/\u2028|\u2029/g, '\n');

    actions.forEach((action: any) => {
      if (!action || typeof action !== 'object') {
        return;
      }

      if (typeof action.action_callback__fn !== 'function') {
        const actionScript = normalizeDynamicScript(action.action_callback);
        try {
          const body = WtoolboxService.buildAsyncBody(actionScript);
          action.action_callback__fn = actionScript
            ? (new AsyncFunction('datasource, metaInfo, record, event, wtoolbox', body) as any)
            : async () => { };
        } catch {
          action.action_callback__fn = async () => { };
        }
      }

      if (typeof action.disable_callback__fn !== 'function') {
        const disableScript = normalizeDynamicScript(action.disable_callback);
        if (!disableScript) {
          action.disable_callback__fn = () => false;
        } else {
          let compiled: any = null;
          try {
            compiled = new Function('datasource, metaInfo, record, wtoolbox', disableScript);
          } catch {
            // Compile error → ritorna sempre false (mai disabilitare per script malformato)
            action.disable_callback__fn = () => false;
          }
          if (compiled) {
            // skills/typed-localized-exceptions: wrap il call-site cosi' un throw
            // runtime emette typed envelope (`errors.client.user_callback.failed`).
            const actionId = action?.Id || action?.id || 'unknown';
            action.disable_callback__fn = (datasource: any, metaInfo: any, record: any, wtoolbox: any) =>
              WtoolboxService.runUserCallbackSync(
                'designer.action.disable_callback',
                () => compiled(datasource, metaInfo, record, wtoolbox),
                [],
                { actionId, route: metaInfo?.tableMetadata?.md_route_name },
                { fallback: false }
              ) ?? false;
          }
        }
      }
    });
  }

  /**
   * Reidrata tutte le callback runtime del datasource (table + column) quando il `metaInfo`
   * e serializzato nel boardcontent e quindi privo delle function.
   */
  private rehydrateDatasourceRuntimeCallbacks(metaInfo: any): void {
    const tableMetadata = metaInfo?.tableMetadata;
    if (!tableMetadata || typeof tableMetadata !== 'object') {
      return;
    }

    if (!Array.isArray(tableMetadata._Metadati_Custom_Actions_Tabelles)) {
      tableMetadata._Metadati_Custom_Actions_Tabelles = [];
    }

    const columns = Array.isArray(metaInfo?.columnMetadata) ? metaInfo.columnMetadata : [];
    if (!columns.length) {
      this.rehydrateTableActionCallbacks(metaInfo);
      return;
    }

    if (!columns[0]?._Metadati_Tabelle) {
      columns[0]._Metadati_Tabelle = tableMetadata;
    }

    try {
      const mapped = MetadataProviderService.mapMetadata(columns as any);
      if (Array.isArray(mapped) && mapped.length) {
        const mappedTable = mapped[0]?._Metadati_Tabelle;
        metaInfo.columnMetadata = mapped;
        if (mappedTable && mappedTable !== tableMetadata) {
          Object.assign(tableMetadata, mappedTable);
          mapped[0]._Metadati_Tabelle = tableMetadata;
        } else if (mapped[0]) {
          mapped[0]._Metadati_Tabelle = tableMetadata;
        }
      } else {
        this.rehydrateTableActionCallbacks(metaInfo);
      }
    } catch {
      this.rehydrateTableActionCallbacks(metaInfo);
    }
  }

  /**
   * Converter shorthand: applica un unico valore colore ai 4 lati bordo
   * (`borderTop/Right/Bottom/LeftColor`) del tool.
   */
  converterBorderColor(obj: any, prop: string, newValue: any, tool: DesignerTool) {

    tool.inputs['borderBottomColor'] = newValue;
    tool.inputs['borderLeftColor'] = newValue;
    tool.inputs['borderRightColor'] = newValue;
    tool.inputs['borderTopColor'] = newValue;

  }

  /**
   * Converter shorthand: applica una larghezza bordo unica ai 4 lati
   * (`borderTop/Right/Bottom/LeftWidth`) del tool.
   */
  converterBorderWidth(obj: any, prop: string, newValue: any, tool: DesignerTool) {
    tool.inputs['borderBottomWidth'] = newValue;
    tool.inputs['borderLeftWidth'] = newValue;
    tool.inputs['borderRightWidth'] = newValue;
    tool.inputs['borderTopWidth'] = newValue;
  }

  /**
   * Converter shorthand: applica uno stile bordo unico ai 4 lati
   * (`borderTop/Right/Bottom/LeftStyle`) direttamente sull'oggetto input.
   */
  converterBorderStyle(obj: any, prop: string, newValue: any, tool: DesignerTool) {
    obj['borderBottomStyle'] = newValue;
    obj['borderLeftStyle'] = newValue;
    obj['borderRightStyle'] = newValue;
    obj['borderTopStyle'] = newValue;
  }

  /**
   * Ridimensiona dinamicamente una TABLE quando cambiano `rows` o `cols`:
   * aggiunge/rimuove nodi TR/TD clonati da `availableTools`, rigenera `uniqueName/componentId`,
   * aggiorna `flattenedDashboardElements` e registra lo snapshot in history.
   */
  converter(obj: any, prop: string, newValue: any, tool: DesignerTool) {
    let oldVal = obj[prop];

    let deltaRows = prop == 'rows' ? newValue - oldVal : 0;
    let deltaCols = prop == 'cols' ? newValue - oldVal : 0;

    if (deltaRows > 0) {
      deltaCols = obj['cols'];

      for (let i = 1; i <= deltaRows; i++) {
        let tr = JSON.parse(JSON.stringify(this.availableTools.find(x => x.name == 'TR')));
        tr.inputs.width = undefined;
        tr.inputs.height = undefined;

        tr.toolProps = Object.keys(tr.inputProps).map((key) => {
          return {
            key: key,
            value: tr.inputProps[key]
          };
        });

        tr.componentId = this.getNewID();
        tr.uniqueName = tr.name + '__' + tr.componentId;

        tool.nestedComponents.push(tr);

        for (let j = 1; j <= deltaCols; j++) {
          let td = JSON.parse(JSON.stringify(this.availableTools.find(x => x.name == 'TD')));
          td.inputs.width = undefined;
          td.inputs.height = undefined;

          td.toolProps = Object.keys(td.inputProps).map((key) => {
            return {
              key: key,
              value: td.inputProps[key]
            };
          });

          td.componentId = this.getNewID();
          td.uniqueName = td.name + '__' + td.componentId;

          tr.nestedComponents.push(td);
        }
      }
    } else if (deltaRows < 0) {
      for (let i = tool.nestedComponents.length; i >= Math.abs(deltaRows); i--) {
        let trTool = tool.nestedComponents[i - 1];
        // trTool.nestedComponents = [];
      }

      tool.nestedComponents.splice(deltaRows, Math.abs(deltaRows));
    } else if (deltaCols > 0) {
      tool.nestedComponents.forEach((tr) => {
        for (let i = 1; i <= deltaCols; i++) {
          let td = JSON.parse(JSON.stringify(this.availableTools.find(x => x.name == 'TD')));
          td.inputs.width = undefined;
          td.inputs.height = undefined;

          td.toolProps = Object.keys(td.inputProps).map((key) => {
            return {
              key: key,
              value: td.inputProps[key]
            };
          });

          td.componentId = this.getNewID();
          td.uniqueName = td.name + '__' + td.componentId;

          tr.nestedComponents.push(td);
        }
      });
    } else if (deltaCols < 0) {

      tool.nestedComponents.forEach((tr) => {
        for (let i = tr.nestedComponents.length; i >= Math.abs(deltaCols); i--) {
          let tdTool = tr.nestedComponents[i - 1];
          tdTool.nestedComponents = [];
        }

        tr.nestedComponents.splice(deltaCols, Math.abs(deltaCols));
      });
    }

    this.flattenedDashboardElements = this.flattenComponentTree(this.dashboardElements);

    obj[prop] = newValue;
    this.commitHistoryIfChanged();
  }

  /**
   * Ridimensiona dinamicamente uno SPLITTER quando cambia `areas`:
   * crea/rimuove aree `SPLITTER-AREA`, riallinea `size` percentuale su tutte le aree,
   * aggiorna flatten/history.
   */
  converterSplitter(obj: any, prop: string, newValue: any, tool: DesignerTool) {
    let oldVal = obj[prop];

    let deltaAreas = newValue - oldVal;

    if (deltaAreas > 0) {

      for (let i = 1; i <= deltaAreas; i++) {
        let area = JSON.parse(JSON.stringify(this.availableTools.find(x => x.name == 'SPLITTER-AREA')));
        area.inputs.width = undefined;
        area.inputs.height = undefined;

        area.toolProps = Object.keys(area.inputProps).map((key) => {
          return {
            key: key,
            value: area.inputProps[key]
          };
        });

        area.componentId = this.getNewID();
        area.uniqueName = area.name + '__' + area.componentId;

        tool.nestedComponents.push(area);
      }
    } else if (deltaAreas < 0) {
      for (let i = tool.nestedComponents.length; i >= Math.abs(deltaAreas); i--) {
        let trTool = tool.nestedComponents[i - 1];
        // trTool.nestedComponents = [];
      }

      tool.nestedComponents.splice(deltaAreas, Math.abs(deltaAreas));
    }

    for (let i = 0; i < tool.nestedComponents.length; i++) {
      tool.nestedComponents[i].inputs['size'] = 100 / tool.nestedComponents.length;
    }

    this.flattenedDashboardElements = this.flattenComponentTree(this.dashboardElements);

    obj[prop] = newValue;
    this.commitHistoryIfChanged();
  }

  /**
   * Ridimensiona dinamicamente un ACCORDION quando cambia `items`:
   * crea/rimuove `ACCORDION-AREA`, riallinea `size` tra item, aggiorna flatten/history.
   */
  converterAccordion(obj: any, prop: string, newValue: any, tool: DesignerTool) {
    let oldVal = obj[prop];

    let deltaItems = newValue - oldVal;

    if (deltaItems > 0) {

      for (let i = 1; i <= deltaItems; i++) {
        let area = JSON.parse(JSON.stringify(this.availableTools.find(x => x.name == 'ACCORDION-AREA')));
        area.inputs.width = undefined;
        area.inputs.height = undefined;

        area.toolProps = Object.keys(area.inputProps).map((key) => {
          return {
            key: key,
            value: area.inputProps[key]
          };
        });

        area.componentId = this.getNewID();
        area.uniqueName = area.name + '__' + area.componentId;

        tool.nestedComponents.push(area);
      }
    } else if (deltaItems < 0) {
      for (let i = tool.nestedComponents.length; i >= Math.abs(deltaItems); i--) {
        let trTool = tool.nestedComponents[i - 1];
        // trTool.nestedComponents = [];
      }

      tool.nestedComponents.splice(deltaItems, Math.abs(deltaItems));
    }

    for (let i = 0; i < tool.nestedComponents.length; i++) {
      tool.nestedComponents[i].inputs['size'] = 100 / tool.nestedComponents.length;
    }

    this.flattenedDashboardElements = this.flattenComponentTree(this.dashboardElements);

    obj[prop] = newValue;
    this.commitHistoryIfChanged();
  }

  /**
   * Handler di drop iniziale per tool TABLE: crea la griglia annidata TR/TD
   * in base a `inputs.rows` e `inputs.cols`, con id univoci per ogni nodo.
   */
  dropTable(currentTool: DesignerTool) {
    if (currentTool.name == 'TABLE') {
      let tr = this.availableTools.find(x => x.name == 'TR');
      let td = this.availableTools.find(x => x.name == 'TD');
      let table = this.availableTools.find(x => x.name == 'TABLE');

      for (let i = 1; i <= currentTool.inputs['rows']; i++) {
        let tr1 = JSON.parse(JSON.stringify(tr));
        tr1.inputs.width = undefined;
        tr1.inputs.height = undefined;

        tr1.toolProps = Object.keys(tr1.inputProps).map((key) => {
          return {
            key: key,
            value: tr1.inputProps[key]
          };
        });

        tr1.componentId = this.getNewID();
        tr1.uniqueName = tr1.name + '__' + tr1.componentId;

        currentTool.nestedComponents.push(tr1);

        for (let j = 1; j <= currentTool.inputs['cols']; j++) {
          let td1 = JSON.parse(JSON.stringify(td));
          td1.inputs.width = undefined;
          td1.inputs.height = undefined;

          td1.toolProps = Object.keys(td1.inputProps).map((key) => {
            return {
              key: key,
              value: td1.inputProps[key]
            };
          });

          td1.componentId = this.getNewID();
          td1.uniqueName = td1.name + '__' + td1.componentId;

          tr1.nestedComponents.push(td1);
        }
      }
    }
  }

  /**
   * Handler di drop iniziale per SPLITTER: crea `inputs.areas` aree annidate
   * di tipo `SPLITTER-AREA` con size iniziale al 50%.
   */
  dropSplitter(currentTool: DesignerTool) {
    if (currentTool.name == 'SPLITTER') {
      let area = this.availableTools.find(x => x.name == 'SPLITTER-AREA');

      for (let i = 1; i <= currentTool.inputs['areas']; i++) {
        let area1 = JSON.parse(JSON.stringify(area));
        area1.inputs.width = undefined;
        area1.inputs.height = undefined;
        area1.inputs.size = 50;

        area1.toolProps = Object.keys(area1.inputProps).map((key) => {
          return {
            key: key,
            value: area1.inputProps[key]
          };
        });

        area1.componentId = this.getNewID();
        area1.uniqueName = area1.name + '__' + area1.componentId;

        currentTool.nestedComponents.push(area1);
      }
    }
  }

  /**
   * Handler di drop iniziale per ACCORDION: crea `inputs.items` aree `ACCORDION-AREA`
   * con header di default e dimensioni non vincolate.
   */
  dropAccordion(currentTool: DesignerTool) {
    if (currentTool.name == 'ACCORDION') {
      let area = this.availableTools.find(x => x.name == 'ACCORDION-AREA');

      for (let i = 1; i <= currentTool.inputs['items']; i++) {
        let area1 = JSON.parse(JSON.stringify(area));
        area1.inputs.width = null;
        area1.inputs.height = null;
        area1.inputs.header = 'header';

        area1.toolProps = Object.keys(area1.inputProps).map((key) => {
          return {
            key: key,
            value: area1.inputProps[key]
          };
        });

        area1.componentId = this.getNewID();
        area1.uniqueName = area1.name + '__' + area1.componentId;

        currentTool.nestedComponents.push(area1);
      }
    }
  }

  /**
   * Esegue lookup remoto per proprieta autocomplete del designer:
   * costruisce `MetadatiColonna` con route/value/text field e invoca `dataSrv.getComboData`,
   * salvando i risultati in `this.tool.suggestions`.
   * @param event Evento PrimeNG contenente `query` digitata.
   * @param tool Tool a cui appartiene la proprieta.
   * @param toolProp Metadato proprieta (endpoint, route, field mapping).
   */
  async search(event: AutoCompleteCompleteEvent, tool: DesignerTool, toolProp: any) {
    let field: MetadatiColonna = new MetadatiColonna(toolProp.value.metaColumnName);
    field.mc_ui_lookup_dataTextField = toolProp.value.displayField;
    field.mc_ui_lookup_dataValueField = toolProp.value.valueField;
    field.mc_ui_lookup_entity_name = toolProp.value.metaRoute;
    field.extraFields = "";

    let record = {};

    if (toolProp.value.async) {
      record[toolProp.key] = tool.inputs[toolProp.key].value;
    } else {
      record[toolProp.key] = tool.inputs[toolProp.key];
    }

    this.tool.suggestions = (await this.dataSrv.getComboData({
      endpoint: toolProp.value.endpoint,
      dataroute: toolProp.value.metaRoute,
      sortInfo: [],
      groupInfo: [],
      filterInfo: null,
      md_server_side_operations: true,
      pageSize: undefined
    }, record, field, event.query)).results;
  }

  /**
   * Memorizza il payload tool trascinato dalla toolbox per l'operazione di drop.
   */
  dragStart(payload: any) {
    this.draggedPayload = payload;
  }

  /**
   * Hook drag intermedio lasciato intenzionalmente vuoto; il flusso usa `dragStart`/`drop`.
   */
  onDrag($event: DragEvent) {

  }

  /**
   * Completa il drop di un tool nel canvas:
   * clona il payload, inizializza input async/sync, assegna ctx/events, risolve destinazione
   * (root o container compatibile), invoca eventuale `onDrop`, aggiorna flatten e history.
   */
  drop(event) {
    if (this.draggedPayload) {

      let currentTool = JSON.parse(JSON.stringify(this.draggedPayload)) as DesignerTool;
      currentTool.componentId = this.getNewID();
      currentTool.uniqueName = currentTool.name + '__' + currentTool.componentId;

      if (this.draggedPayload.onDrop) {
        currentTool.onDrop = this.draggedPayload.onDrop;
      }

      Object.keys(currentTool.inputProps).forEach(prop => {
        if (currentTool.inputProps[prop].async) {

          if (currentTool.inputProps[prop].type == 'dropped-component') {
            currentTool.inputs[prop] = new BehaviorSubject<any>({ component: currentTool.inputs[prop], id: currentTool.componentId, name: currentTool.name, uniqueName: currentTool.uniqueName });
          } else {
            currentTool.inputs[prop] = new BehaviorSubject<any>(currentTool.inputs[prop]);
          }

          currentTool.inputs[prop].subscribe((value: { component: any, id: number, name: string }) => {
            if (value?.component) {
              this.dashboardComponents.push(value);
            }
          });
        } else {
          if (currentTool.inputProps[prop].type == 'dropped-component') {
            currentTool.inputs[prop] = { component: new BehaviorSubject<any>(currentTool.inputs[prop]), id: currentTool.componentId, name: currentTool.name, uniqueName: currentTool.uniqueName };
          } else if (currentTool.inputProps[prop].type == 'function') {
            currentTool.inputs[prop] = this.draggedPayload.inputs[prop].bind(currentTool.inputs);
          } else {
            currentTool.inputs[prop] = currentTool.inputs[prop];
          }
        }

        if (this.draggedPayload.inputProps[prop].conditional) {
          currentTool.inputProps[prop].conditional = this.draggedPayload.inputProps[prop].conditional;
        }

        if (this.draggedPayload.inputProps[prop].converter) {
          currentTool.inputProps[prop].converter = this.draggedPayload.inputProps[prop].converter;
        }

        if (this.draggedPayload.inputProps[prop].callback) {
          currentTool.inputProps[prop].callback = this.draggedPayload.inputProps[prop].callback;
        }

      });

      if (this.draggedPayload.ctxItems) {
        currentTool.ctxItems = this.draggedPayload.ctxItems;
      } else {
        currentTool.ctxItems = this.defaultCtxItems;
      }

      currentTool.toolProps = Object.keys(currentTool.inputProps).map((key) => {
        return {
          key: key,
          value: currentTool.inputProps[key]
        };
      });

      if (currentTool.events) {
        Object.keys(currentTool.events).forEach(event => {
          currentTool[event] = this.draggedPayload.events[event];
        });
      }

      let destination = this.dashboardElements;

      if (event.toElement) {
        let id = event.toElement.getAttribute("id");

        let parentEl = event.toElement.parentElement;
        while (!id && parentEl) {
          id = parentEl.getAttribute("id");
          parentEl = parentEl.parentElement;
        }

        if (id && id.indexOf("__") > -1) {
          let componentId = parseInt(id.split("__")[1]);

          let match: DesignerTool = null;
          // let parent = this.dashboardElements;

          match = (this.flattenedDashboardElements || []).find(x => x.componentId == componentId);
          if (match) {
            if (!match.allowedChildren || match.allowedChildren.includes(currentTool.name)) {
              destination = match?.nestedComponents;
            } else {
              WtoolboxService.messageNotificationService.add({
                severity: 'error',
                summary: this.t('error', 'Error'),
                detail: this.t('designer.invalid_child_component', 'Invalid child component')
              });
              return;
            }
          }

        }
      }

      if (!destination) {
        WtoolboxService.messageNotificationService.add({
          severity: 'error',
          summary: this.t('error', 'Error'),
          detail: this.t('designer.invalid_child_component', 'Invalid child component')
        });
        return;
      }

      destination.push(currentTool);

      if (currentTool.onDrop) {
        currentTool.onDrop(currentTool);
      }

      this.tool = currentTool;

      this.flattenedDashboardElements = this.flattenComponentTree(this.dashboardElements);
      this.commitHistoryIfChanged();

      this.draggedPayload = null;
    }
  }

  /**
   * Genera un nuovo identificativo incrementale per `componentId`.
   */
  private getNewID() {
    this.maxId++;

    return this.maxId;
  }

  /**
   * Filtro toolbox/proprieta: esclude elementi marcati con `hide=true`.
   */
  filterTool(tool: any) {
    return !tool.hide;
  }

  getToolPropertySections(tool: DesignerTool | null | undefined, propFilter?: string): { key: string, label: string, open: boolean, props: any[] }[] {
    const sectionOrder = ['data', 'content', 'layout', 'style', 'behavior', 'advanced'];
    const labels: { [key: string]: string } = {
      data: 'Data',
      content: 'Content',
      layout: 'Layout',
      style: 'Style',
      behavior: 'Behavior',
      advanced: 'Advanced'
    };
    const openByDefault: { [key: string]: boolean } = {
      data: true,
      content: true,
      layout: false,
      style: false,
      behavior: false,
      advanced: false
    };

    const grouped: { [key: string]: any[] } = {};
    sectionOrder.forEach((key) => grouped[key] = []);

    (tool?.toolProps || [])
      .filter((tp) => this.filterTool(tp?.value || {}) && !this.shouldHideToolProp(tool, tp, propFilter))
      .forEach((tp) => {
        const section = this.getPropertySectionKey(tp?.key, tp?.value);
        grouped[section].push(tp);
      });

    const toolKey = this.getPropertySectionToolKey(tool);
    const savedState = this.propertySectionStateByTool[toolKey] || {};

    return sectionOrder
      .filter((key) => grouped[key].length > 0)
      .map((key) => ({
        key: key,
        label: labels[key],
        open: (propFilter && propFilter.length >= 3 && grouped[key].length) ? true : (savedState[key] !== undefined ? !!savedState[key] : openByDefault[key]),
        props: grouped[key]
      }));
  }

  clearPropFilter() {
    this.propFilter = "";
  }

  /**
   * Persiste lo stato open/close di una sezione pannello proprieta
   * per il tool corrente (chiave per `componentId/uniqueName`).
   */
  onPropertySectionToggle(tool: DesignerTool | null | undefined, sectionKey: string, $event: Event): void {
    const details = $event?.target as HTMLDetailsElement;
    if (!details || !sectionKey) {
      return;
    }

    const toolKey = this.getPropertySectionToolKey(tool);
    this.propertySectionStateByTool[toolKey] = this.propertySectionStateByTool[toolKey] || {};
    this.propertySectionStateByTool[toolKey][sectionKey] = !!details.open;
  }

  /**
   * Calcola la chiave stabile usata per memorizzare lo stato sezioni proprieta
   * per un tool specifico.
   */
  private getPropertySectionToolKey(tool: DesignerTool | null | undefined): string {
    if (!tool) {
      return '__none__';
    }

    return String(tool.componentId || tool.uniqueName || tool.name || '__unknown__');
  }

  /**
   * Determina se una proprieta va nascosta nel pannello:
   * per DATASOURCE nasconde i campi formula master-detail quando manca `parentDatasource`.
   */
  private shouldHideToolProp(tool: DesignerTool | null | undefined, toolProp: any, propFilter?: string): boolean {
    if (!tool || !toolProp) {
      return false;
    }

    if (tool.name === 'DATASOURCE' && (toolProp.key === 'masterDetailFilterFormula' || toolProp.key === 'masterDetailFilterFormulaEditor')) {
      return !this.hasParentDatasourceBinding(tool);
    }

    if (tool.name === 'DATAREPEATER' && (toolProp.key === 'wizardNextConfig' || toolProp.key === 'wizardCompleteConfig' || toolProp.key === 'wizardPrevConfig')) {
      return this.getRepeaterAction(tool) !== 'wizard';
    }

    if (propFilter && propFilter.length >= 3) {
      return toolProp.key.toLocaleLowerCase().indexOf(propFilter.toLocaleLowerCase()) < 0;
    }

    return false;
  }

  /**
   * Restituisce il model collegato a una proprieta `dropped-component-list`,
   * gestendo sia forma sync sia forma async (`BehaviorSubject`).
   */
  getDroppedComponentListModel(tool: DesignerTool | null | undefined, toolProp: any): any {
    if (!tool || !toolProp) {
      return null;
    }

    const value = tool.inputs?.[toolProp.key];
    if (toolProp.value?.async && value instanceof BehaviorSubject) {
      return value.value?.component?.value || null;
    }

    return value;
  }

  /**
   * Classifica una proprieta tool nelle sezioni UI (`data/content/layout/style/behavior/advanced`)
   * usando nome proprieta, tipo editor e prefissi CSS.
   */
  private getPropertySectionKey(propKey: string, propValue: DesignerToolProp): string {
    const key = String(propKey || '').trim();
    const type = String(propValue?.type || '').trim();

    const dataKeys = new Set([
      'datasource', 'componentRef', 'parentDatasource', 'parentRecord', 'route', 'routeFromRouting',
      'metaEditor', 'propertyTree', 'action', 'valueField', 'textField', 'optionsCsv', 'displayFormula',
      'masterDetailFilterFormula', 'masterDetailFilterFormulaEditor', 'wizardPrevConfig', 'wizardNextConfig', 'wizardCompleteConfig'
    ]);
    const contentKeys = new Set([
      'innerText', 'itemTemplate', 'templateString', 'label', 'caption', 'placeholder', 'href', 'src', 'alt',
      'value', 'values', 'rows', 'cols', 'size', 'headerType', 'inputType'
    ]);
    const layoutKeys = new Set([
      'width', 'height', 'minWidth', 'minHeight', 'position', 'top', 'left', 'float', 'display', 'zIndex',
      'overflow', 'overflowX', 'overflowY', 'transform', 'transformOrigin',
      'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'
    ]);
    const behaviorKeys = new Set([
      'disabled', 'readonly', 'checked', 'autoload', 'clickCallback', 'bindingFunction'
    ]);
    const stylePrefixes = [
      'background', 'border', 'font', 'text', 'color', 'mask', 'clip', 'animation', 'transition', 'boxShadow'
    ];

    if (type === 'dropped-component-list' || type === 'dropped-component' || type === 'autocomplete' || type === 'metaEditor' || type === 'propertyTree' || type === 'selectedItem') {
      return 'data';
    }

    if (dataKeys.has(key)) {
      return 'data';
    }

    if (contentKeys.has(key)) {
      return 'content';
    }

    if (layoutKeys.has(key)) {
      return 'layout';
    }

    if (type === 'color' || key === 'cssFile' || key === 'cssClass' || stylePrefixes.some((prefix) => key.startsWith(prefix))) {
      return 'style';
    }

    if (behaviorKeys.has(key) || type === 'boolean' || type === 'function' || type === 'button') {
      return 'behavior';
    }

    return 'advanced';
  }

  get availableToolGroups(): { group: string; tools: DesignerTool[] }[] {
    const orderedGroups: string[] = [];
    const grouped: { [group: string]: DesignerTool[] } = {};

    (this.availableTools || []).forEach((tool) => {
      if (!this.filterTool(tool)) {
        return;
      }

      const groupName = String(tool?.group || 'OTHER').trim() || 'OTHER';
      if (!grouped[groupName]) {
        grouped[groupName] = [];
        orderedGroups.push(groupName);
      }

      grouped[groupName].push(tool);
    });

    return orderedGroups.map((group) => ({
      group: group,
      tools: grouped[group]
    }));
  }

  /**
   * Appiattisce ricorsivamente il tree componenti mantenendo l'ordine di visita.
   */
  flattenComponentTree(components: DesignerTool[]) {
    let result: DesignerTool[] = [];

    components.forEach((component) => {
      result.push(component);
      if (component.nestedComponents?.length) {
        result = result.concat(this.flattenComponentTree(component.nestedComponents));
      }
    });

    return result;
  }

  private cloneInputDefaultValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.cloneInputDefaultValue(item));
    }
    if (typeof value === 'object') {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return { ...value };
      }
    }
    return value;
  }

  private mergeToolPropDefinition(baseDef: any, currentDef: any): any {
    const merged = { ...(baseDef || {}), ...(currentDef || {}) };
    if (!merged.converter && baseDef?.converter) {
      merged.converter = baseDef.converter;
    }
    if (!merged.callback && baseDef?.callback) {
      merged.callback = baseDef.callback;
    }
    if (!merged.conditional && baseDef?.conditional) {
      merged.conditional = baseDef.conditional;
    }
    return merged;
  }

  private mergeMissingToolPropsRecursive(elements: any[]): void {
    if (!Array.isArray(elements)) {
      return;
    }

    elements.forEach((element) => {
      if (!element || typeof element !== 'object') {
        return;
      }

      const template = (this.availableTools || []).find((t) => String(t?.name || '') === String(element?.name || ''));
      element.inputProps = element.inputProps || {};
      element.inputs = element.inputs || {};

      if (template?.inputProps) {
        Object.keys(template.inputProps).forEach((key) => {
          element.inputProps[key] = this.mergeToolPropDefinition(template.inputProps[key], element.inputProps[key]);
          if (element.inputs[key] === undefined && template.inputs && template.inputs[key] !== undefined) {
            element.inputs[key] = this.cloneInputDefaultValue(template.inputs[key]);
          }
        });
      }

      const existingToolProps = Array.isArray(element.toolProps) ? element.toolProps : [];
      const toolPropByKey = new Map<string, any>();
      existingToolProps.forEach((tp: any) => {
        const k = String(tp?.key || '');
        if (k) {
          toolPropByKey.set(k, tp);
        }
      });

      Object.keys(element.inputProps || {}).forEach((key) => {
        const existing = toolPropByKey.get(key);
        if (existing) {
          existing.value = element.inputProps[key];
        } else {
          existingToolProps.push({ key, value: element.inputProps[key] });
        }
      });
      element.toolProps = existingToolProps;

      if (Array.isArray(element.nestedComponents) && element.nestedComponents.length) {
        this.mergeMissingToolPropsRecursive(element.nestedComponents);
      }
    });
  }

  /**
   * Chiude l'operazione drag corrente ripulendo il payload temporaneo.
   */
  dragEnd() {
    this.draggedPayload = null;
  }

  /**
   * Double-click su un tool nella palette: lo droppa al primo livello (root) del canvas,
   * senza nesting. Simula il flusso drag+drop ma forza destination = dashboardElements.
   */
  dropToolAtRoot(payload: any): void {
    if (this.noEdit) {
      return;
    }
    this.draggedPayload = payload;
    this.drop({ toElement: null });
  }

  /**
   * Salva il dashboard corrente tramite `dataSrv.saveDashboard` -> server `MetaService.saveDashboard`.
   * Mapping persistenza verificato su `Kiara_wuic_new.dbo.dom_board`:
   * - `dashRoute` -> `boardroute`
   * - `desc` -> `boarddes`
   * - `designMode` -> `board_type1`
   * - `pwd` -> `pwd1`
   * - `elements` (JSON) -> `boardcontent` (TEXT)
   * e aggiorna anche i fogli collegati in `dom_board_sheet`.
   */
  async saveDashboard() {
    const route = String(this.currentDashboardRoute || '').trim();
    if (route) {
      const payload = {
        user_id: this.userInfo.getuserInfo().user_id,
        desc: this.currentDashboardDescription || route,
        dashRoute: route,
        elements: this.buildSerializedDashboardElements(),
        sheetPaths: this.collectDashboardSheetPaths(),
        designMode: '',
        pwd: ''
      };

      const updated = await this.dataSrv.saveDashboard(payload);
      if (updated) {
        this.reloadDashboards();
        WtoolboxService.messageNotificationService.add({
          severity: 'success',
          summary: this.t('success', 'Success'),
          detail: this.t('designer.dashboard_updated_successfully', 'Dashboard updated successfully')
        });
      } else {
        WtoolboxService.messageNotificationService.add({
          severity: 'error',
          summary: this.t('error', 'Error'),
          detail: this.t('designer.error_updating_dashboard', 'An error occurred while updating the dashboard')
        });
      }
      return;
    }

    let resp = await WtoolboxService.promptDialog(this.t('designer.save_dashboard.title', 'Save Dashboard'), [
      {
        name: 'dashboardName',
        caption: this.t('designer.save_dashboard.name_caption', 'Dashboard Name'),
        type: 'text',
        value: '',
        required: true
      },
      {
        name: 'route',
        caption: this.t('designer.save_dashboard.route_caption', 'Dashboard route'),
        type: 'text',
        value: '',
        required: true
      }
      // width=400px, height=340px: con default height=250px il body scrollava perche'
      // 2 campi text con label + footer OK/Cancel non ci stavano. 340px contiene:
      // header ~45 + 2 x (label+input) ~140 + footer ~60 + padding ~50 = ~295, margine.
    ], null, "400px", "340px");

    if (resp) {
      let dashboardName = resp.dashboardName.value;
      let newRoute = resp.route.value;

      let payload = {
        user_id: this.userInfo.getuserInfo().user_id,
        desc: dashboardName,
        dashRoute: newRoute,
        elements: this.buildSerializedDashboardElements(),
        sheetPaths: this.collectDashboardSheetPaths(),
        designMode: '',
        pwd: ''
      };

      let result = await this.dataSrv.saveDashboard(payload);

      if (result) {
        this.currentDashboardRoute = newRoute;
        this.currentDashboardDescription = dashboardName;
        this.reloadDashboards();

        WtoolboxService.messageNotificationService.add({
          severity: 'success',
          summary: this.t('success', 'Success'),
          detail: this.t('designer.dashboard_saved_successfully', 'Dashboard saved successfully')
        });
      } else {
        WtoolboxService.messageNotificationService.add({
          severity: 'error',
          summary: this.t('error', 'Error'),
          detail: this.t('designer.error_saving_dashboard', 'An error occurred while saving the dashboard')
        });
      }
    }
  }

  /**
   * Carica un dashboard da route usando `dataSrv.loadDashboard` -> server `MetaService.loadDashboard`
   * e ricostruisce lo stato runtime del designer partendo da `dom_board.boardcontent`.
   * Supporta route in forme alias (`board_route`, `boardroute`, `dashRoute`).
   */
  async loadDashboard(dashboard: any, skipServerFetch = false) {
    const dashRoute = String(
      dashboard?.board_route ??
      dashboard?.boardroute ??
      dashboard?.boardRoute ??
      dashboard?.dashRoute ??
      dashboard ??
      ''
    ).trim();
    if (!dashRoute) {
      this.dashboardElements = [];
      this.flattenedDashboardElements = [];
      this.currentDashboardRoute = '';
      this.currentDashboardDescription = '';
      this.dashboardCssSheets = [];
      this.selectedCssEditorSheetPath = '';
      this.ensureDashboardCssLinks([]);
      this.refreshAvailableProjectCssClasses();
      this.refreshGraphActionsMenuItems();
      this.resetHistory();
      this.cd.detectChanges();

      return;
    }
    this.currentDashboardRoute = dashRoute;
    this.refreshGraphActionsMenuItems();

    let resultRows: any[] = [];
    let result: any = null;
    if (!skipServerFetch) {
      let payload = {
        user_id: this.userInfo.getuserInfo().user_id,
        dashRoute: dashRoute
      };
      result = await this.dataSrv.loadDashboard(payload);
      resultRows = Array.isArray(result)
        ? result
        : (Array.isArray((result as any)?.results) ? (result as any).results : (result ? [result] : []));
    }
    this.currentDashboardDescription = String(
      dashboard?.board_des ??
      dashboard?.boarddes ??
      resultRows?.[0]?.board_des ??
      resultRows?.[0]?.boarddes ??
      this.currentDashboardDescription ??
      dashRoute
    ).trim();
    const boardSheetPaths = this.extractDashboardSheetPaths(resultRows, dashboard);
    await this.loadDashboardCssSheets(boardSheetPaths);
    const boardContentRaw = resultRows?.[0]?.boardcontent ?? dashboard?.boardcontent ?? dashboard?.boardContent ?? null;

    if (boardContentRaw) {
      let loadedDashboard: any = [];
      try {
        loadedDashboard = JSON.parse(boardContentRaw);
      } catch {
        loadedDashboard = [];
      }
      if (!Array.isArray(loadedDashboard)) {
        loadedDashboard = Array.isArray(loadedDashboard?.dashboardElements)
          ? loadedDashboard.dashboardElements
          : Array.isArray(loadedDashboard?.elements)
            ? loadedDashboard.elements
            : [];
      }
      this.mergeMissingToolPropsRecursive(loadedDashboard);

      this.dashboardComponents = [];

      let dsSubs = [];
      let dsElements = [];
      let dsElementCount = (loadedDashboard || []).filter(x => x?.name == 'DATASOURCE').length;

      let flattened = this.flattenComponentTree(loadedDashboard);

      flattened.forEach((element) => {
        if (element?.inputs?.['cssClass'] !== undefined) {
          element.inputs['cssClass'] = this.normalizeCssClassSelection(element.inputs['cssClass']);
        }

        if (element?.name === 'DATAREPEATER') {
          const normalizedAction = this.normalizeArchetypeAction(element?.inputs?.['action']);
          if (normalizedAction) {
            element.inputs['action'] = normalizedAction;
          } else {
            const inferredFromCustom = Object.keys(element?.inputs || {})
              .find((k) => k.startsWith('customProps_') && element.inputs[k] != null);
            if (inferredFromCustom) {
              const inferredAction = this.normalizeArchetypeAction(inferredFromCustom.replace('customProps_', ''));
              if (inferredAction) {
                element.inputs['action'] = inferredAction;
              }
            }
          }

          this.ensureDataRepeaterTagSupportsHideToolbar(element);
          this.ensureDataRepeaterHideToolbar(element);
          this.ensureDataRepeaterRowCustomSelect(element);
        }
        if (element?.name === 'DATASOURCE') {
          this.rehydrateDatasourceMetaInfo(element);
          this.ensureDatasourceMasterDetailFormulaEditor(element);
        }
        if (element?.name === 'SPLITTER') {
          this.ensureSplitterResize(element);
        }
        if (element?.name === 'ACCORDION') {
          this.ensureAccordionToggle(element);
        }

        let customProps = Object.keys(element.inputs).filter(x => x.startsWith('customProps_'));
        customProps.forEach((prop) => {
          this.hidrateCustomPropsRecursive(element.inputs[prop]);
        });

        Object.keys(element.inputProps).forEach((prop) => {
          if (element.inputProps[prop].async) {
            if (element.inputProps[prop].type == 'dropped-component') {
              const currentValue = element.inputs[prop];
              element.inputs[prop] = new BehaviorSubject<any>({
                component: currentValue?.component ?? currentValue ?? null,
                id: element.componentId,
                name: element.name,
                uniqueName: element.uniqueName
              });
            } else {
              if (element.inputProps[prop].asyncPath) {
                const path = element.inputProps[prop].asyncPath;
                const rawValue = element.inputs[prop] ?? {};
                element.inputs[prop] = new BehaviorSubject<any>({
                  ...rawValue,
                  [path]: new BehaviorSubject<any>(rawValue?.[path] ?? null)
                });
              } else {
                element.inputs[prop] = new BehaviorSubject<any>(element.inputs[prop]);
              }
            }

            element.inputs[prop].subscribe((v) => {
              if (v?.component) {
                this.dashboardComponents.push(v);

                if (v.component instanceof DataSourceComponent) {
                  this.rehydrateDatasourceMetaInfo(element);
                  WtoolboxService.deepMerge(v.component.metaInfo, element.inputs['metaInfo']);
                  this.rehydrateTableExtraPropsFromPropsBag(v.component.metaInfo);
                  this.rehydrateDatasourceRuntimeCallbacks(v.component.metaInfo);
                  v.component.metaInfo.frozen = true;

                  flattened.filter(x => Object.keys(x.inputProps)
                    .some(y => x.inputProps[y].type == "dropped-component-list" && x.inputProps[y].filter == 'DATASOURCE'))
                    .forEach(x => {
                      let prop = Object.keys(x.inputProps).find(y => x.inputProps[y].type == "dropped-component-list" && x.inputProps[y].filter == 'DATASOURCE');
                      if (prop) {
                        let dsBs = x.inputs[prop];
                        let ds = (dsBs instanceof BehaviorSubject) ? dsBs.value : dsBs;
                        if (ds && ds.uniqueName == v.uniqueName) {

                          let dsElement = flattened.find(x => x.uniqueName == v.uniqueName);
                          if (dsElement) {
                            if (ds.component instanceof BehaviorSubject) {
                              console.log(`[SUBSCRIBE-CHAIN-LOAD-v9] pushing liveComp into DR.datasource.component for ${ds.uniqueName}`);
                              ds.component.next(v.component);

                              if (dsElement.inputs['parentDatasource'] instanceof BehaviorSubject) {
                                let dsParent = (dsElement.inputs['parentDatasource'] instanceof BehaviorSubject) ? dsElement.inputs['parentDatasource'].value : dsElement.inputs['parentDatasource'];

                                if (dsParent.uniqueName) {
                                  let parentelement = flattened.find(x => x.uniqueName == dsParent.uniqueName);
                                  if (parentelement) {
                                    dsParent.component.next(parentelement.inputs['componentRef'] instanceof BehaviorSubject ? parentelement.inputs['componentRef'].value : parentelement.inputs['componentRef']);
                                  }
                                }
                              }
                            }

                            if (!dsElements.find(x => x.uniqueName == v.uniqueName)) {
                              dsSubs.push(v.component.fetchInfo$);
                              dsElements.push(dsElement);

                              if (dsElements.length == dsElementCount) {
                                combineLatest(dsSubs).subscribe((infos) => {
                                  infos.forEach((info, i) => {
                                    if (info?.metaInfo && dsElements[i].inputs['metaInfo']) {
                                      Object.assign(info.metaInfo, dsElements[i].inputs['metaInfo']);
                                      dsElements[i].inputs['metaInfo'] = null;
                                    }
                                  });

                                  flattened.forEach((ld) => {
                                    if (ld.inputs['propertyTree']) {
                                      ld.inputs['propertyTree'] = new BehaviorSubject<any>([]);
                                      this.propertyTreeBuilder(ld.inputs['action'].value, ld.inputs);
                                    }
                                  });

                                  // All DataSources loaded — re-capture the history snapshot
                                  // so it includes the full metaInfo. Without this, the initial
                                  // snapshot captured by resetHistory() has empty metaInfo because
                                  // the DS fetch is async.
                                  this.lastCommittedSnapshot = this.captureHistorySnapshot();
                                });
                              }
                            }
                          }

                        }
                      }
                    });
                }
              }
            });
          } else if (element.inputProps[prop].asyncPath) {
            const path = element.inputProps[prop].asyncPath;
            if (!element.inputs[prop] || typeof element.inputs[prop] !== 'object') {
              element.inputs[prop] = {};
            }
            element.inputs[prop][path] = new BehaviorSubject<any>(element.inputs[prop]?.[path] ?? null);
          }
        });

      });

      // Ensure a new reference for template control-flow and force refresh when
      // async loading happens outside Angular zone.
      this.dashboardElements = Array.isArray(loadedDashboard) ? [...loadedDashboard] : [];

      this.flattenedDashboardElements = flattened;
      this.cd.detectChanges();
    } else {
      this.dashboardElements = [];
      this.flattenedDashboardElements = [];
      this.currentDashboardRoute = '';
      this.cd.detectChanges();
      console.warn('[Designer] No dashboard content found for route:', dashRoute, result);
    }

    this.resetHistory();
    this.refreshGraphActionsMenuItems();

    this.maxId = (this.flattenedDashboardElements || []).reduce((max, item) => Math.max(max, Number(item?.componentId || 0)), 0);
  }

  /**
   * Cattura uno snapshot serializzato dello stato designer per undo/redo.
   */
  private captureHistorySnapshot(): DesignerHistorySnapshot {
    return {
      serializedElements: this.buildSerializedDashboardElements(),
      selectedUniqueName: this.tool?.uniqueName || null
    };
  }

  /**
   * Esegue commit history solo se il payload serializzato e cambiato rispetto all'ultimo snapshot.
   */
  private commitHistoryIfChanged(): void {
    // return;

    if (this.applyingHistory || this.noEdit) {
      return;
    }
    // Skip commit right after undo/redo — the rehydration triggers change
    // events that would create spurious snapshots and clear redoHistory.
    if (Date.now() - this._lastHistoryApplyTime < 500) {
      return;
    }

    const current = this.captureHistorySnapshot();
    const previous = this.lastCommittedSnapshot;
    if (!previous) {
      this.lastCommittedSnapshot = current;
      return;
    }

    if (previous.serializedElements === current.serializedElements) {
      this.lastCommittedSnapshot = current;
      return;
    }

    this.undoHistory.push(previous);
    if (this.undoHistory.length > this.maxHistoryLength) {
      this.undoHistory.shift();
    }

    if (!this._suppressRedoClear) {
      this.redoHistory = [];
    }
    this.lastCommittedSnapshot = current;
  }

  /**
   * Reinizializza completamente undo/redo e stato transitorio del color picker.
   */
  private resetHistory(): void {
    this.undoHistory = [];
    this.redoHistory = [];
    this.lastCommittedSnapshot = this.captureHistorySnapshot();
    this.pendingColorHistoryBase = null;
    this.pendingColorHistoryDirty = false;
  }

  /**
   * Applica uno snapshot storico usando lo stesso codepath di loadDashboard.
   * Passa il serializedElements come boardcontent finto, preservando la route corrente.
   */
  private applyHistorySnapshot(snapshot: DesignerHistorySnapshot, isRedo = false): void {
    this.applyingHistory = true;

    // Destroy + recreate synchronously so applyingHistory stays true
    // through the entire operation and mouseup doesn't clear redoHistory.
    try {
      this.dashboardElements = [];
      this.flattenedDashboardElements = [];
      this.cd.detectChanges();
      this.applySerializedDashboardElements(snapshot?.serializedElements || '[]', snapshot?.selectedUniqueName || null);
    } finally {
      this.pendingColorHistoryBase = null;
      this.pendingColorHistoryDirty = false;
      this.lastCommittedSnapshot = snapshot;
      this.applyingHistory = false;
      this._lastHistoryApplyTime = Date.now();
    }
  }

  /**
   * Conclude una transazione history aggregata per cambi colore (drag continuo color picker).
   */
  private finalizePendingColorHistory(): boolean {
    if (this.applyingHistory || !this.pendingColorHistoryBase || !this.pendingColorHistoryDirty) {
      return false;
    }

    const current = this.captureHistorySnapshot();
    const base = this.pendingColorHistoryBase;
    let committed = false;
    if (base.serializedElements !== current.serializedElements) {
      this.undoHistory.push(base);
      if (this.undoHistory.length > this.maxHistoryLength) {
        this.undoHistory.shift();
      }
      this.redoHistory = [];
      this.lastCommittedSnapshot = current;
      committed = true;
    }

    this.pendingColorHistoryBase = null;
    this.pendingColorHistoryDirty = false;
    return committed;
  }

  /**
   * Ripristina il designer da JSON serializzato:
   * ricrea componenti, hook runtime (datasource/repeater/splitter/accordion),
   * flat tree, maxId e selezione corrente.
   */
  private applySerializedDashboardElements(serializedElements: string, selectedUniqueName: string | null): void {
    let loadedDashboard: any = [];
    try {
      loadedDashboard = JSON.parse(serializedElements || '[]');
    } catch {
      loadedDashboard = [];
    }
    if (!Array.isArray(loadedDashboard)) {
      loadedDashboard = Array.isArray(loadedDashboard?.dashboardElements)
        ? loadedDashboard.dashboardElements
        : Array.isArray(loadedDashboard?.elements)
          ? loadedDashboard.elements
          : [];
    }
    this.mergeMissingToolPropsRecursive(loadedDashboard);

    this.dashboardComponents = [];

    // Use the same DS tracking / combineLatest rehydration path as loadDashboard
    // so that DATASOURCE ↔ DATAREPEATER bindings are fully restored on undo/redo.
    const dsSubs: any[] = [];
    const dsElements: any[] = [];
    const dsElementCount = (loadedDashboard || []).filter((x: any) => x?.name === 'DATASOURCE').length;

    const flattened = this.flattenComponentTree(loadedDashboard);

    flattened.forEach((element) => {
      if (element?.inputs && element.inputs['cssClass'] !== undefined) {
        element.inputs['cssClass'] = this.normalizeCssClassSelection(element.inputs['cssClass']);
      }

      if (element?.name === 'DATAREPEATER') {
        const normalizedAction = this.normalizeArchetypeAction(element?.inputs?.['action']);
        if (normalizedAction) {
          element.inputs['action'] = normalizedAction;
        } else {
          const inferredFromCustom = Object.keys(element?.inputs || {})
            .find((k) => k.startsWith('customProps_') && element.inputs[k] != null);
          if (inferredFromCustom) {
            const inferredAction = this.normalizeArchetypeAction(inferredFromCustom.replace('customProps_', ''));
            if (inferredAction) {
              element.inputs['action'] = inferredAction;
            }
          }
        }

        this.ensureDataRepeaterTagSupportsHideToolbar(element);
        this.ensureDataRepeaterHideToolbar(element);
        this.ensureDataRepeaterRowCustomSelect(element);
      }
      if (element?.name === 'DATASOURCE') {
        this.rehydrateDatasourceMetaInfo(element);
        this.ensureDatasourceMasterDetailFormulaEditor(element);
      }
      if (element?.name === 'SPLITTER') {
        this.ensureSplitterResize(element);
      }
      if (element?.name === 'ACCORDION') {
        this.ensureAccordionToggle(element);
      }

      const customProps = Object.keys(element?.inputs || {}).filter((x) => x.startsWith('customProps_'));
      customProps.forEach((prop) => this.hidrateCustomPropsRecursive(element.inputs[prop]));

      Object.keys(element?.inputProps || {}).forEach((prop) => {
        const propDef = element.inputProps[prop];
        // Hydrate dropped-component-list props (e.g. DATAREPEATER.datasource) that have
        // asyncPath but no async flag. Ensure the inner path (e.g. 'component') is a
        // BehaviorSubject so the DS→DR binding can be reconnected when Angular creates
        // the live DataSourceComponent. Do NOT wrap the outer value in a BS — the runtime
        // expects datasource to remain a plain object {uniqueName, component: BS(...)}.
        if (!propDef.async && propDef.asyncPath && (propDef.type === 'dropped-component-list' || propDef.type === 'dropped-component')) {
          const path = propDef.asyncPath;
          const rawValue = element.inputs[prop];
          console.log(`[HYDRATE-v9] ${element.name}.${prop}: rawValue=${rawValue === null ? 'NULL' : rawValue === undefined ? 'UNDEF' : 'object'} uniqueName=${rawValue?.uniqueName} keys=${rawValue ? Object.keys(rawValue) : '[]'}`);
          if (rawValue && typeof rawValue === 'object' && !(rawValue instanceof BehaviorSubject)) {
            // Only hydrate the component BS — do NOT invent a uniqueName if the
            // snapshot didn't have one. That would create a false binding on undo.
            if (!(rawValue[path] instanceof BehaviorSubject)) {
              rawValue[path] = new BehaviorSubject<any>(rawValue[path] ?? null);
              console.log(`[HYDRATE-v9] created BS for ${path}`);
            }
          }
        }

        if (propDef.async) {
          if (propDef.type == 'dropped-component') {
            const currentValue = element.inputs[prop];
            element.inputs[prop] = new BehaviorSubject<any>({
              component: currentValue?.component ?? currentValue ?? null,
              id: element.componentId,
              name: element.name,
              uniqueName: element.uniqueName
            });
          } else if (propDef.asyncPath) {
            const path = propDef.asyncPath;
            const rawValue = element.inputs[prop] ?? {};
            element.inputs[prop] = new BehaviorSubject<any>({
              ...rawValue,
              [path]: new BehaviorSubject<any>(rawValue?.[path] ?? null)
            });
          } else {
            element.inputs[prop] = new BehaviorSubject<any>(element.inputs[prop]);
          }

          element.inputs[prop].subscribe((v) => {
            if (v?.component) {
              this.dashboardComponents.push(v);

              if (v.component instanceof DataSourceComponent) {
                this.rehydrateDatasourceMetaInfo(element);
                WtoolboxService.deepMerge(v.component.metaInfo, element.inputs['metaInfo']);
                this.rehydrateTableExtraPropsFromPropsBag(v.component.metaInfo);
                this.rehydrateDatasourceRuntimeCallbacks(v.component.metaInfo);
                v.component.metaInfo.frozen = true;

                flattened.filter(x => Object.keys(x.inputProps)
                  .some(y => x.inputProps[y].type == "dropped-component-list" && x.inputProps[y].filter == 'DATASOURCE'))
                  .forEach(x => {
                    const dsProp = Object.keys(x.inputProps).find(y => x.inputProps[y].type == "dropped-component-list" && x.inputProps[y].filter == 'DATASOURCE');
                    if (dsProp) {
                      const dsBs = x.inputs[dsProp];
                      const ds = (dsBs instanceof BehaviorSubject) ? dsBs.value : dsBs;
                      if (ds && ds.uniqueName == v.uniqueName) {
                        const dsElement = flattened.find(fe => fe.uniqueName == v.uniqueName);
                        if (dsElement) {
                          if (ds.component instanceof BehaviorSubject) {
                            console.log(`[SUBSCRIBE-CHAIN-v9] pushing liveComp into DR.datasource.component for ${ds.uniqueName}. applyingHistory=${this.applyingHistory}`);
                            ds.component.next(v.component);

                            if (dsElement.inputs['parentDatasource'] instanceof BehaviorSubject) {
                              const dsParent = (dsElement.inputs['parentDatasource'] instanceof BehaviorSubject) ? dsElement.inputs['parentDatasource'].value : dsElement.inputs['parentDatasource'];
                              if (dsParent?.uniqueName) {
                                const parentElement = flattened.find(fe => fe.uniqueName == dsParent.uniqueName);
                                if (parentElement) {
                                  dsParent.component.next(parentElement.inputs['componentRef'] instanceof BehaviorSubject ? parentElement.inputs['componentRef'].value : parentElement.inputs['componentRef']);
                                }
                              }
                            }
                          }

                          if (!dsElements.find(de => de.uniqueName == v.uniqueName)) {
                            dsSubs.push(v.component.fetchInfo$);
                            dsElements.push(dsElement);

                            if (dsElements.length == dsElementCount) {
                              combineLatest(dsSubs).subscribe((infos) => {
                                infos.forEach((info: any, i: number) => {
                                  if (info?.metaInfo && dsElements[i].inputs['metaInfo']) {
                                    Object.assign(info.metaInfo, dsElements[i].inputs['metaInfo']);
                                    dsElements[i].inputs['metaInfo'] = null;
                                  }
                                });

                                flattened.forEach((ld) => {
                                  if (ld.inputs['propertyTree']) {
                                    ld.inputs['propertyTree'] = new BehaviorSubject<any>([]);
                                    this.propertyTreeBuilder(ld.inputs['action'].value, ld.inputs);
                                  }
                                });

                                // Re-capture snapshot after DS load (same as loadDashboard path)
                                this.lastCommittedSnapshot = this.captureHistorySnapshot();
                              });
                            }
                          }
                        }
                      }
                    }
                  });
              }
            }
          });
        } else if (element.inputProps[prop].asyncPath) {
          const path = element.inputProps[prop].asyncPath;
          if (!element.inputs[prop] || typeof element.inputs[prop] !== 'object') {
            element.inputs[prop] = {};
          }
          element.inputs[prop][path] = new BehaviorSubject<any>(element.inputs[prop]?.[path] ?? null);
        }
      });
    });

    this.dashboardElements = Array.isArray(loadedDashboard) ? [...loadedDashboard] : [];
    this.flattenedDashboardElements = this.flattenComponentTree(this.dashboardElements);
    this.maxId = (this.flattenedDashboardElements || []).reduce((max, item) => Math.max(max, Number(item?.componentId || 0)), 0);

    this.tool = selectedUniqueName
      ? (this.flattenedDashboardElements || []).find((x) => x?.uniqueName === selectedUniqueName) || null
      : null;
    this.cd.detectChanges();

    // After undo/redo, re-bind DATAREPEATER→DATASOURCE and force re-fetch.
    // This runs after Angular has created the live DataSourceComponent instances.
    if (this.applyingHistory) {
      setTimeout(() => {
        const liveFlat = this.flattenedDashboardElements || [];

        // Collect live DataSourceComponents by uniqueName
        const liveDataSources: Record<string, any> = {};
        liveFlat.forEach((el) => {
          if (el?.name === 'DATASOURCE') {
            const cr = el?.inputs?.['componentRef'];
            const crVal = (cr instanceof BehaviorSubject) ? cr.value : cr;
            const liveComp = crVal?.component instanceof BehaviorSubject
              ? crVal.component.value
              : crVal?.component;
            if (liveComp) {
              liveDataSources[el.uniqueName] = liveComp;
              if (liveComp.fetchData) {
                liveComp.fetchData();
              }
            }
          }
        });

        // Re-bind DATAREPEATERs: replicate the same binding that loadDashboard
        // and setValue do — get the live DataSourceComponent from the DS element's
        // componentRef and push it into the DATAREPEATER's datasource.component BS.
        liveFlat.forEach((el) => {
          if (el?.name === 'DATAREPEATER' || el?.name === 'SELECT' || el?.name === 'MULTISELECT' || el?.name === 'UL') {
            const dsRef = el?.inputs?.['datasource'];
            const dsUniqueName = dsRef?.uniqueName;
            if (dsUniqueName) {
              const dsElement = liveFlat.find((e) => e.uniqueName === dsUniqueName);
              if (dsElement) {
                // Get the live DataSourceComponent from componentRef — same path as setValue line 4078
                const crBs = dsElement.inputs?.['componentRef'];
                const crVal = (crBs instanceof BehaviorSubject) ? crBs.value : crBs;
                const liveComponent = crVal?.component instanceof BehaviorSubject
                  ? crVal.component.value
                  : crVal?.component;
                if (liveComponent) {
                  if (!(dsRef.component instanceof BehaviorSubject)) {
                    dsRef.component = new BehaviorSubject<any>(liveComponent);
                  } else {
                    dsRef.component.next(liveComponent);
                  }
                }
              }
            }
          }
        });
        this.cd.detectChanges();
      }, 300);
    }
  }

  /**
   * Rileva se il target evento e un controllo di input/editable per evitare shortcut globali indesiderate.
   */
  private isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) {
      return false;
    }

    const tag = String(element.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return true;
    }

    return !!element.isContentEditable;
  }

  /**
   * Gestisce il master-detail dei repeater:
   * individua datasource figli legati al master selezionato e applica i filtri di sincronizzazione.
   */
  private handleRepeaterMasterRowSelection($event: any, rowData: any): void {
    const target = ($event?.currentTarget || $event?.target) as HTMLElement | null;
    if (!target || !rowData) {
      return;
    }

    let repeaterElement: HTMLElement | null = target;
    while (repeaterElement && repeaterElement.tagName?.toUpperCase() !== 'WUIC-DATA-REPEATER') {
      repeaterElement = repeaterElement.parentElement as HTMLElement | null;
    }

    if (!repeaterElement) {
      return;
    }

    const repeaterId = repeaterElement.getAttribute('id');
    if (!repeaterId) {
      return;
    }

    const repeaterComponent = (this.flattenedDashboardElements || []).find((x) => x?.uniqueName === repeaterId);
    const masterDatasourceBinding = this.unwrapBehaviorSubjectValue(repeaterComponent?.inputs?.datasource);
    const masterDatasourceUniqueName = masterDatasourceBinding?.uniqueName;
    const masterDatasource = this.unwrapBehaviorSubjectValue(masterDatasourceBinding?.component) as DataSourceComponent | undefined;

    if (!masterDatasourceUniqueName || !masterDatasource) {
      return;
    }

    const masterRoute = this.getDatasourceRouteName(masterDatasource);
    const masterPrimaryKey = this.getDatasourcePrimaryKey(masterDatasource);
    if (!masterRoute || !masterPrimaryKey) {
      return;
    }

    const masterRowId = rowData?.[masterPrimaryKey];
    if (masterRowId === undefined || masterRowId === null || masterRowId === '') {
      return;
    }

    const childDatasources = (this.flattenedDashboardElements || []).filter((x) => {
      if (x?.name !== 'DATASOURCE') {
        return false;
      }

      const parentDatasource = this.unwrapBehaviorSubjectValue(x?.inputs?.parentDatasource);

      return parentDatasource?.uniqueName === masterDatasourceUniqueName;
    });

    childDatasources.forEach((childDsElement) => {
      const detailDatasource = this.unwrapBehaviorSubjectValue(
        this.unwrapBehaviorSubjectValue(childDsElement?.inputs?.componentRef)?.component
      ) as DataSourceComponent | undefined;
      if (!detailDatasource) {
        return;
      }

      const filterInjected = this.applyMasterDetailFilterFormula(childDsElement, detailDatasource, rowData, masterDatasource)
        || this.injectMasterDetailLookupFilter(detailDatasource, masterRoute, masterRowId);
      if (!filterInjected) {
        return;
      }

      void detailDatasource.fetchData();
    });
  }

  /**
   * Estrae ricorsivamente il valore da eventuali `BehaviorSubject` annidati.
   */
  private unwrapBehaviorSubjectValue(value: any): any {
    let current = value;
    while (current instanceof BehaviorSubject) {
      current = current.value;
    }
    return current;
  }

  /**
   * Garantisce che ogni DATAREPEATER abbia una callback `rowCustomSelect` valida per il flusso master-detail.
   */
  private ensureDataRepeaterRowCustomSelect(element: any): void {
    if (element?.name !== 'DATAREPEATER') {
      return;
    }

    if (!element.inputs) {
      element.inputs = {};
    }

    if (typeof element.inputs['rowCustomSelect'] === 'function') {
      return;
    }

    element.inputs['rowCustomSelect'] = (arg1: any, arg2: any, dt: any) => {
      const firstIsEvent = !!(arg1 && (arg1.currentTarget || arg1.target));
      const $event = firstIsEvent ? arg1 : arg2;
      const rowData = firstIsEvent ? arg2 : arg1;
      this.handleRepeaterMasterRowSelection($event, rowData);
    };
  }

  /**
   * Reidrata la property `hideToolbar` sui DATAREPEATER legacy quando assente nel JSON serializzato.
   */
  private ensureDataRepeaterHideToolbar(element: any): void {
    if (element?.name !== 'DATAREPEATER') {
      return;
    }

    element.inputs = element.inputs || {};
    element.inputProps = element.inputProps || {};

    if (!element.inputProps['hideToolbar']) {
      element.inputProps['hideToolbar'] = {
        type: 'boolean',
        propertyCaption: 'Hide toolbar'
      };
    }

    if (element.inputs['hideToolbar'] === undefined || element.inputs['hideToolbar'] === null) {
      element.inputs['hideToolbar'] = false;
    }
  }

  /**
   * Aggiorna i tag DATAREPEATER legacy aggiungendo il binding `[hideToolbar]`
   * quando assente nel markup serializzato.
   */
  private ensureDataRepeaterTagSupportsHideToolbar(element: any): void {
    if (element?.name !== 'DATAREPEATER') {
      return;
    }

    const rawTag = String(element.tag || '');
    if (!rawTag) {
      return;
    }

    if (rawTag.includes('[hideToolbar]')) {
      return;
    }

    // Inserisce il binding vicino ad action/rowCustomSelect mantenendo il tag legacy intatto.
    let patchedTag = rawTag.replace(
      '[action]="inputs.action"',
      '[action]="inputs.action" [hideToolbar]="inputs.hideToolbar"'
    );

    if (patchedTag === rawTag) {
      patchedTag = rawTag.replace(
        '[rowCustomSelect]="inputs.rowCustomSelect?.bind(inputs)"',
        '[hideToolbar]="inputs.hideToolbar" [rowCustomSelect]="inputs.rowCustomSelect?.bind(inputs)"'
      );
    }

    if (patchedTag === rawTag) {
      patchedTag = rawTag.replace(
        '<wuic-data-repeater',
        '<wuic-data-repeater [hideToolbar]="inputs.hideToolbar"'
      );
    }

    element.tag = patchedTag;
  }

  /**
   * Inietta nel tool DATASOURCE i campi editor formula master-detail quando non presenti.
   */
  private ensureDatasourceMasterDetailFormulaEditor(element: any): void {
    if (element?.name !== 'DATASOURCE') {
      return;
    }

    element.inputProps = element.inputProps || {};
    element.inputs = element.inputs || {};

    if (!element.inputProps['masterDetailFilterFormula']) {
      element.inputProps['masterDetailFilterFormula'] = {
        type: 'txt_area',
        propertyCaption: 'Master-detail filter formula',
        hide: true
      };
    }

    if (!element.inputProps['masterDetailFilterFormulaEditor']) {
      element.inputProps['masterDetailFilterFormulaEditor'] = {
        type: 'button',
        propertyCaption: 'Edit Formula'
      };
    }

    element.inputProps['masterDetailFilterFormulaEditor'].callback = (
      inputs: any,
      _prop: string,
      _newValue: any,
      tool: DesignerTool
    ) => {
      void this.openMasterDetailFilterFormulaEditor(inputs, tool);
    };

    if (element.inputs['masterDetailFilterFormula'] === undefined || element.inputs['masterDetailFilterFormula'] === null) {
      element.inputs['masterDetailFilterFormula'] = '';
    }

    if (!Array.isArray(element.toolProps)) {
      element.toolProps = [];
    }

    if (!element.toolProps.some((x: any) => x?.key === 'masterDetailFilterFormula')) {
      element.toolProps.push({
        key: 'masterDetailFilterFormula',
        value: element.inputProps['masterDetailFilterFormula']
      });
    }

    if (!element.toolProps.some((x: any) => x?.key === 'masterDetailFilterFormulaEditor')) {
      element.toolProps.push({
        key: 'masterDetailFilterFormulaEditor',
        value: element.inputProps['masterDetailFilterFormulaEditor']
      });
    }
  }

  /**
   * Inietta callback resize per SPLITTER, sincronizzando la dimensione dei pannelli figli.
   */
  private ensureSplitterResize(element: any): void {
    if (element?.name !== 'SPLITTER') {
      return;
    }

    if (!element.inputs) {
      element.inputs = {};
    }

    if (typeof element.inputs['resize'] === 'function') {
      return;
    }

    element.inputs['resize'] = (event: any, splitter: any) => {
      splitter?.nestedComponents?.forEach((area: any, i: number) => {
        if (area?.inputs) {
          area.inputs.size = event?.sizes?.[i];
        }
      });
      this.cd.detectChanges();
      // Same rationale as the constructor-scoped splitter resize callback:
      // dragEnd is the gesture-end signal, so commit immediately. Required
      // because deserialized elements (loaded from boardcontent) get this
      // dynamic callback rather than the constructor template default.
      this.commitHistoryIfChanged();
    };
  }

  /**
   * Inietta callback toggle per ACCORDION mantenendo lo stato espanso coerente sui pannelli.
   */
  private ensureAccordionToggle(element: any): void {
    if (element?.name !== 'ACCORDION') {
      return;
    }

    if (!element.inputs) {
      element.inputs = {};
    }

    if (typeof element.inputs['toggle'] === 'function') {
      return;
    }

    element.inputs['toggle'] = (event: any, accordion: any, nestedItem: any) => {
      accordion?.nestedComponents?.forEach((item: any) => {
        if (!item?.inputs) {
          return;
        }
        item.inputs.expanded = item.uniqueName == nestedItem?.uniqueName
          ? !item.inputs.expanded
          : false;
      });
      this.cd.detectChanges();
      if (event?.preventDefault) {
        event.preventDefault();
      }
    };
  }

  /**
   * Risolve la route effettiva della datasource con fallback:
   * `route.value` -> `hardcodedRoute` -> `metaInfo.tableMetadata.md_route_name`.
   * @param datasource Datasource da risolvere.
   */
  private getDatasourceRouteName(datasource: DataSourceComponent): string {
    return String(
      datasource?.route?.value
      || datasource?.hardcodedRoute
      || datasource?.metaInfo?.tableMetadata?.md_route_name
      || ''
    ).trim();
  }

  /**
   * Restituisce il nome della PK datasource:
   * 1) `metaInfo.pKey.mc_nome_colonna`, 2) fallback prima colonna con `mc_is_primary_key=true`.
   * @param datasource Datasource da cui estrarre la chiave primaria.
   */
  private getDatasourcePrimaryKey(datasource: DataSourceComponent): string {
    const pKey = datasource?.metaInfo?.pKey?.mc_nome_colonna;
    if (pKey) {
      return pKey;
    }

    const fromColumns = (datasource?.metaInfo?.columnMetadata || []).find((x: MetadatiColonna) => x?.mc_is_primary_key)?.mc_nome_colonna;
    return String(fromColumns || '').trim();
  }

  /**
   * Esegue la formula JS `masterDetailFilterFormula` del datasource figlio e traduce il risultato
   * in filtri `detailDatasource.filterInfo.filters` marcati `__master_detail_formula`.
   * Supporta output formula come array filtri o oggetto `{ logic, filters }`
   * e aggiorna `metaInfo.operators[field]` per mantenere coerente l'operatore UI.
   * @returns `true` se la formula e stata applicata, `false` se assente/errore.
   */
  private applyMasterDetailFilterFormula(childDsElement: any, detailDatasource: DataSourceComponent, rowData: any, masterDatasource: DataSourceComponent): boolean {
    const formula = String(this.unwrapBehaviorSubjectValue(childDsElement?.inputs?.masterDetailFilterFormula) || '').trim();
    if (!formula) {
      return false;
    }

    if (!detailDatasource.filterInfo) {
      detailDatasource.filterInfo = { logic: 'AND', filters: [] } as any;
    }

    if (!Array.isArray(detailDatasource.filterInfo.filters)) {
      detailDatasource.filterInfo.filters = [];
    }

    detailDatasource.filterInfo.filters = detailDatasource.filterInfo.filters
      .filter((filter: any) => !filter?.__master_detail_formula);

    const stagedFilters: any[] = [];
    const setFilter = (field: string, value: any, operatore: string = 'eq', fixed: boolean = true) => {
      const filterField = String(field || '').trim();
      if (!filterField) {
        return;
      }

      let match = stagedFilters.find((filter: any) => filter?.field === filterField);
      if (!match) {
        match = { field: filterField, operatore: operatore || 'eq', value: value, fixed: !!fixed, __master_detail_formula: true };
        stagedFilters.push(match);
      } else {
        match.operatore = operatore || match.operatore || 'eq';
        match.value = value;
        match.fixed = !!fixed;
        match.__master_detail_formula = true;
      }
    };

    const detailColumns = this.getDatasourceColumnsFromDatasourceComponent(detailDatasource);
    const currentFilters = (detailDatasource.filterInfo.filters || []).map((filter: any) => ({ ...filter }));
    // skills/typed-localized-exceptions: passa per runUserCallbackSync →
    // typed envelope (`errors.client.user_callback.failed`) al posto del solo
    // console.warn che lasciava silenziosamente il filtro vuoto.
    const result = WtoolboxService.runUserCallbackSync(
      'designer.masterDetailFilterFormula',
      () => {
        const fn = new Function('dataItem', 'setFilter', 'detailColumns', 'currentFilters', 'detailDatasource', 'masterDatasource', 'wtoolbox', formula);
        return fn(rowData, setFilter, detailColumns, currentFilters, detailDatasource, masterDatasource, WtoolboxService);
      },
      [],
      { masterRoute: masterDatasource?.metaInfo?.tableMetadata?.md_route_name, detailRoute: detailDatasource?.metaInfo?.tableMetadata?.md_route_name }
    );
    if (result === undefined) {
      // Helper ha gia' emesso il typed envelope; abort gracefully.
      return false;
    }
    if (Array.isArray(result)) {
      result.forEach((filter) => setFilter(filter?.field, filter?.value, filter?.operatore || filter?.operator || 'eq', filter?.fixed !== false));
    } else if (result && Array.isArray(result.filters)) {
      result.filters.forEach((filter: any) => setFilter(filter?.field, filter?.value, filter?.operatore || filter?.operator || 'eq', filter?.fixed !== false));
      if (result.logic === 'OR' || result.logic === 'AND') {
        detailDatasource.filterInfo.logic = result.logic;
      }
    }

    stagedFilters.forEach((filter: any) => {
      detailDatasource.filterInfo.filters.push(filter);
      if (detailDatasource.metaInfo?.operators && filter?.field) {
        detailDatasource.metaInfo.operators[filter.field] = filter.operatore || 'eq';
      }
    });

    return true;
  }

  /**
   * Fallback master-detail basato su colonne lookup: applica filtro `eq` sulla colonna che punta alla route master.
   */
  private injectMasterDetailLookupFilter(detailDatasource: DataSourceComponent, masterRoute: string, masterRowId: any): boolean {
    const normalizedMasterRoute = String(masterRoute || '').trim().toLowerCase();
    if (!normalizedMasterRoute || !detailDatasource?.metaInfo?.columnMetadata?.length) {
      return false;
    }

    const lookupColumn = detailDatasource.metaInfo.columnMetadata.find((column: MetadatiColonna) => {
      if (!column || String(column.mc_ui_column_type || '').toLowerCase() !== 'lookupbyid') {
        return false;
      }

      const lookupRoute = String(column.mc_ui_lookup_entity_name || '').trim().toLowerCase();
      const gridRoute = String(column.mc_ui_grid_route || '').trim().toLowerCase();
      return lookupRoute === normalizedMasterRoute || gridRoute === normalizedMasterRoute;
    });

    const lookupField = lookupColumn?.mc_nome_colonna;
    if (!lookupField) {
      return false;
    }

    if (!detailDatasource.filterInfo) {
      detailDatasource.filterInfo = { logic: 'AND', filters: [] } as any;
    }

    if (!Array.isArray(detailDatasource.filterInfo.filters)) {
      detailDatasource.filterInfo.filters = [];
    }

    let match = detailDatasource.filterInfo.filters.find((filter: any) => filter?.field === lookupField);
    if (!match) {
      match = { field: lookupField, operatore: 'eq', value: masterRowId, fixed: true };
      detailDatasource.filterInfo.filters.push(match);
    } else {
      match.operatore = 'eq';
      match.value = masterRowId;
      match.fixed = true;
    }

    if (detailDatasource.metaInfo?.operators) {
      detailDatasource.metaInfo.operators[lookupField] = 'eq';
    }

    return true;
  }

  /**
   * Apre il dashboard corrente in una nuova tab in modalita runtime (`#/<route>/dashboard`).
   */
  openCurrentDashboardInNewTab() {
    const route = String(this.currentDashboardRoute || '').trim();
    if (!route || typeof window === 'undefined') {
      return;
    }

    const base = window.location.href.split('#')[0];
    const url = `${base}#/${encodeURIComponent(route)}/dashboard`;
    window.open(url, '_blank');
  }

  /**
   * Idrata ricorsivamente `customProps` convertendo i valori in `BehaviorSubject`
   * per mantenere la stessa semantica reattiva del designer runtime.
   */
  hidrateCustomPropsRecursive(customProps) {
    Object.keys(customProps).filter(p => p != 'archetypePropName').forEach((prop) => {
      if (customProps[prop] instanceof Array) {
        customProps[prop].forEach((y) => {
          this.hidrateCustomPropsRecursive(y);
        });
      }

      customProps[prop] = new BehaviorSubject<any>(customProps[prop]);
    });

    // return customProps;
  }

}

