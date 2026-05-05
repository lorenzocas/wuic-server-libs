export type WuicComponentBindings = {
  inputs?: string[];
  outputs?: string[];
  twoWay?: string[];
};

export const WUIC_COMMON_INPUTS: string[] = [
  'record',
  'field',
  'metaInfo',
  'readOnly',
  'isFilter',
  'nestedIndex',
  'triggerProp',
  'parentRecord',
  'parentMetaInfo',
  'datasource',
  'hardcodedDatasource',
  'hardcodedRoute'
];

export const WUIC_COMPONENT_BINDINGS: Record<string, WuicComponentBindings> = {
  'wuic-archetype-configurator': {
    inputs: ['visible', 'archetype', 'metaInfo', 'value'],
    outputs: ['visibleChange', 'applyConfig'],
    twoWay: ['visible']
  },
  'wuic-code-editor': {
    inputs: ['field', 'record', 'metaInfo']
  },
  'wuic-data-repeater': {
    inputs: ['datasource', 'hardcodedDatasource', 'hideToolbar']
  },
  'wuic-designer': {
    inputs: ['route', 'dashboardMode']
  },
  'wuic-dynamic-dashboard-template': {
    inputs: ['datasource', 'hardcodedDatasource']
  },
  'wuic-edit-form': {
    inputs: ['record', 'metaInfo', 'datasource', 'readOnly', 'hideToolbar'],
    outputs: ['recordChanged']
  },
  'wuic-field-editor': {
    inputs: ['record', 'field', 'metaInfo', 'readOnly', 'isFilter', 'forceShowLabel', 'nestedIndex', 'triggerProp']
  },
  'wuic-filter-bar': {
    inputs: ['datasource', 'metaInfo']
  },
  'wuic-list-grid': {
    inputs: ['datasource', 'hardcodedDatasource', 'hideToolbar']
  },
  'wuic-map-list': {
    inputs: ['datasource', 'hardcodedDatasource', 'hideToolbar']
  },
  'wuic-parametric-dialog': {
    inputs: ['datasource', 'hardcodedDatasource', 'hideToolbar']
  },
  'wuic-report-designer': {
    inputs: ['datasource', 'reportName']
  },
  'wuic-report-viewer': {
    inputs: ['datasource', 'reportName']
  },
  'wuic-scheduler-list': {
    inputs: ['datasource', 'hardcodedDatasource', 'hideToolbar']
  },
  'wuic-spreadsheet-list-sf': {
    inputs: ['datasource', 'hardcodedDatasource', 'hideToolbar']
  },
  'wuic-tree-list': {
    inputs: ['datasource', 'hardcodedDatasource']
  },
  'wuic-workflow-designer': {
    inputs: ['workflowData'],
    outputs: ['workflowDataChange']
  },
  'wuic-workflow-runner': {
    inputs: ['workflowData', 'contextData']
  }
};
