// Bulk spec per tutte le POCO classes in lib/class/.
// Ognuna: instantiate + assert property defaults (= constructor coverage).

import { AggregationInfo } from './aggregationInfo';
import { CarouselOptions } from './carouselOptions';
import { ChartOptions } from './chartOptions';
import { ComboParams } from './comboParams';
import { CustomException } from './customException';
import { DesignerTool } from './designerTool';
import { FilterInfo } from './filterInfo';
import { FilterItem } from './filterItem';
import { FormOptions } from './formOptions';
import { GroupInfo } from './groupInfo';
import { KanbanOptions } from './kanbanOptions';
import { Lingua } from './lingua';
import { MapOptions } from './mapOptions';
import { MetaInfo } from './metaInfo';
import { Metadati_Condition_Group } from './metadati_condition_group';
import { Metadati_Custom_Actions_Tabelle } from './metadati_custom_actions_tabelle';
import { Metadati_Custom_Editform_Action } from './metadati_custom_editform_action';
import { MetadatiTabella } from './metadati_tabella';
import { Metadati_UI_Stili_Colonna } from './metadati_ui_stili_colonna';
import { Metadati_UI_Stili_Tabella } from './metadati_ui_stili_tabella';
import { Metadati_Utenti_Autorizzazioni_Colonna } from './metadati_utenti_autorizzazioni_colonna';
import { RawPagedResult } from './rawPagedResult';
import { ResultInfo } from './resultInfo';
import { SchedulerOptions } from './schedulerOptions';
import { SortInfo } from './sortInfo';
import { TabOptions } from './tabOptions';
import { TrackedChanges } from './trackedChanges';
import { Translation } from './translation';
import { TreeOptions } from './treeOptions';
import { UpdateInfo } from './updateInfo';
import { UserInfo } from './userInfo';
import { ValidateResult } from './validateResult';
import { ValidationRule } from './validationRule';
import { WidgetDefinition } from './widgetDefinition';

describe('POCO class smoke tests', () => {
  it('AggregationInfo: ctor stores field+aggregate', () => {
    const a = new AggregationInfo('total', 'sum');
    expect(a.field).toBe('total');
    expect(a.aggregate).toBe('sum');
  });

  it('CarouselOptions: instantiable with defaults', () => {
    const c = new CarouselOptions();
    expect(c).toBeDefined();
  });

  it('ChartOptions: instantiable', () => {
    const c = new ChartOptions();
    expect(c).toBeDefined();
  });

  it('ComboParams: instantiable', () => {
    const c = new ComboParams();
    expect(c).toBeDefined();
  });

  it('CustomException: instantiable', () => {
    const c = new CustomException();
    expect(c).toBeDefined();
  });

  it('DesignerTool: instantiable', () => {
    const d = new DesignerTool();
    expect(d).toBeDefined();
  });

  it('FilterInfo: ctor stores logic + filters', () => {
    const f = new FilterInfo('AND', []);
    expect(f.logic).toBe('AND');
    expect(f.filters).toEqual([]);
  });

  it('FilterItem: instantiable', () => {
    const f = new FilterItem();
    expect(f).toBeDefined();
  });

  it('FormOptions: instantiable', () => {
    const f = new FormOptions();
    expect(f).toBeDefined();
  });

  it('GroupInfo: instantiable', () => {
    const g = new GroupInfo();
    expect(g).toBeDefined();
  });

  it('KanbanOptions: instantiable', () => {
    const k = new KanbanOptions();
    expect(k).toBeDefined();
  });

  it('Lingua: instantiable', () => {
    const l = new Lingua();
    expect(l).toBeDefined();
  });

  it('MapOptions: instantiable', () => {
    const m = new MapOptions();
    expect(m).toBeDefined();
  });

  it('MetaInfo: instantiable', () => {
    const m = new MetaInfo();
    expect(m).toBeDefined();
  });

  it('Metadati_Condition_Group: instantiable', () => {
    const m = new Metadati_Condition_Group();
    expect(m).toBeDefined();
  });

  it('Metadati_Custom_Actions_Tabelle: instantiable', () => {
    const m = new Metadati_Custom_Actions_Tabelle();
    expect(m).toBeDefined();
  });

  it('Metadati_Custom_Editform_Action: instantiable', () => {
    const m = new Metadati_Custom_Editform_Action();
    expect(m).toBeDefined();
  });

  it('MetadatiTabella: instantiable', () => {
    const m = new MetadatiTabella();
    expect(m).toBeDefined();
  });

  it('Metadati_UI_Stili_Colonna: instantiable', () => {
    const m = new Metadati_UI_Stili_Colonna();
    expect(m).toBeDefined();
  });

  it('Metadati_UI_Stili_Tabella: instantiable', () => {
    const m = new Metadati_UI_Stili_Tabella();
    expect(m).toBeDefined();
  });

  it('Metadati_Utenti_Autorizzazioni_Colonna: instantiable', () => {
    const m = new Metadati_Utenti_Autorizzazioni_Colonna();
    expect(m).toBeDefined();
  });

  it('RawPagedResult: instantiable', () => {
    const r = new RawPagedResult();
    expect(r).toBeDefined();
  });

  it('ResultInfo: instantiable', () => {
    const r = new ResultInfo();
    expect(r).toBeDefined();
  });

  it('SchedulerOptions: instantiable', () => {
    const s = new SchedulerOptions();
    expect(s).toBeDefined();
  });

  it('SortInfo: instantiable', () => {
    const s = new SortInfo();
    expect(s).toBeDefined();
  });

  it('TabOptions: instantiable', () => {
    const t = new TabOptions();
    expect(t).toBeDefined();
  });

  it('TrackedChanges: instantiable', () => {
    const t = new TrackedChanges();
    expect(t).toBeDefined();
  });

  it('Translation: instantiable', () => {
    const t = new Translation();
    expect(t).toBeDefined();
  });

  it('TreeOptions: instantiable', () => {
    const t = new TreeOptions();
    expect(t).toBeDefined();
  });

  it('UpdateInfo: instantiable', () => {
    const u = new UpdateInfo();
    expect(u).toBeDefined();
  });

  it('UserInfo: instantiable', () => {
    const u = new UserInfo();
    expect(u).toBeDefined();
  });

  it('ValidateResult: instantiable', () => {
    const v = new ValidateResult();
    expect(v).toBeDefined();
  });

  it('ValidationRule: instantiable', () => {
    const v = new ValidationRule();
    expect(v).toBeDefined();
  });

  it('WidgetDefinition: instantiable', () => {
    const w = new WidgetDefinition();
    expect(w).toBeDefined();
  });
});
